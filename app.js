import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { COMPANY_LOGO_BASE64, COMPANY_SIGN_BASE64 } from './assets.js';

let currentStep = 1;
const totalSteps = 5;

// Expose all controller functions to window immediately for inline HTML event handlers
window.jumpToStep = jumpToStep;
window.navigateWizardStep = navigateWizardStep;
window.handleDocProfileChange = handleDocProfileChange;
window.addPresetItem = addPresetItem;
window.insertItemRow = insertItemRow;
window.removeItemRow = removeItemRow;
window.processFinancialMatrix = processFinancialMatrix;
window.appendNotePreset = appendNotePreset;
window.toggleClause = toggleClause;
window.insertCustomClauseRow = insertCustomClauseRow;
window.removeCustomClauseRow = removeCustomClauseRow;
window.generateDocumentPDF = generateDocumentPDF;
window.previewDocumentPDF = previewDocumentPDF;
window.shareDocumentPDF = shareDocumentPDF;
window.closeModal = closeModal;
window.saveCurrentBillDraft = saveCurrentBillDraft;
window.openHistoryModal = openHistoryModal;

// Initial state setup
window.addEventListener('DOMContentLoaded', () => {
    // Set today's date in DD-MM-YYYY format
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    document.getElementById('docDate').value = `${day}-${month}-${year}`;

    // Add initial item row
    insertItemRow('', '', '', '');
    
    // Register PWA service worker if available
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
});

// Stepper Navigation Logic
function jumpToStep(step) {
    if (step === currentStep) return;
    if (step > currentStep) {
        // Validate Step 1 if moving forward from step 1
        if (currentStep === 1) {
            const form = document.getElementById('billingForm');
            const nameInp = document.getElementById('clientName');
            const addrInp = document.getElementById('clientAddress');
            const dateInp = document.getElementById('docDate');
            if(!nameInp.checkValidity() || !addrInp.checkValidity() || !dateInp.checkValidity()) {
                form.reportValidity();
                return;
            }
        }
    }
    
    document.getElementById(`step_${currentStep}`).classList.remove('active-page');
    document.getElementById(`step_indicator_${currentStep}`).classList.remove('active');
    if (step < currentStep) {
        document.getElementById(`step_indicator_${currentStep}`).classList.remove('completed');
    } else {
        document.getElementById(`step_indicator_${currentStep}`).classList.add('completed');
    }

    currentStep = step;

    document.getElementById(`step_${currentStep}`).classList.add('active-page');
    document.getElementById(`step_indicator_${currentStep}`).classList.add('active');

    updateBottomDrawerNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateWizardStep(direction) {
    const nextTarget = currentStep + direction;
    if (nextTarget >= 1 && nextTarget <= totalSteps) {
        jumpToStep(nextTarget);
    }
}

function updateBottomDrawerNav() {
    const backBtn = document.getElementById('btnBack');
    const nextBtn = document.getElementById('btnNext');

    backBtn.style.visibility = (currentStep === 1) ? 'hidden' : 'visible';

    if (currentStep === totalSteps) {
        nextBtn.innerHTML = "⬇️ Generate PDF";
        nextBtn.onclick = generateDocumentPDF;
    } else {
        nextBtn.innerHTML = "Next Step";
        nextBtn.onclick = () => navigateWizardStep(1);
    }
}

function handleDocProfileChange() {
    const docType = document.getElementById('documentType').value;
    const container = document.getElementById('billNoContainer');
    container.style.display = (docType === 'CASH BILL') ? 'flex' : 'none';
}

// Line Item Operations & Presets
function addPresetItem(name, uom, rate) {
    insertItemRow(name, uom, rate, 100);
}

function insertItemRow(title = '', uom = '', rate = '', qty = '') {
    const mobileBody = document.getElementById('mobileItemContainer');
    const targetToken = 'item_row_' + Date.now() + Math.random().toString(36).substr(2, 3);

    const mDiv = document.createElement('div');
    mDiv.id = 'mobile_' + targetToken;
    mDiv.className = 'item-card';
    mDiv.innerHTML = `
        <div class="item-card-header">
            <span class="item-badge m-table-index">Item #1</span>
            <div class="item-actions">
                <button type="button" onclick="removeItemRow('${targetToken}')" class="btn-icon btn-icon-danger" title="Remove Item">✕</button>
            </div>
        </div>
        <div class="form-group">
            <label>Item Name / Service</label>
            <input type="text" value="${title}" placeholder="e.g. Interior Emulsion Painting" required class="f-item-title" oninput="processFinancialMatrix()">
        </div>
        <div class="item-card-grid">
            <div>
                <label>UOM (Unit)</label>
                <input type="text" value="${uom}" placeholder="e.g. Sq.Ft" required class="f-item-uom">
            </div>
            <div>
                <label>Rate (₹)</label>
                <input type="number" min="0" step="any" value="${rate}" placeholder="0" oninput="processFinancialMatrix()" required class="f-item-rate">
            </div>
        </div>
        <div class="item-card-grid" style="align-items: center; margin-top: 0.5rem;">
            <div>
                <label>Quantity</label>
                <input type="number" min="0" step="any" value="${qty}" placeholder="0" oninput="processFinancialMatrix()" required class="f-item-qty">
            </div>
            <div class="item-total-display">
                <label style="margin-bottom:0;">Item Total</label>
                <span class="m-computed-subtotal item-total-val">₹0.00</span>
            </div>
        </div>
    `;
    mobileBody.appendChild(mDiv);

    recalculateRowIndices();
    processFinancialMatrix();
}

function removeItemRow(targetToken) {
    const mElem = document.getElementById('mobile_' + targetToken);
    if(mElem) mElem.remove();
    recalculateRowIndices();
    processFinancialMatrix();
}

function recalculateRowIndices() {
    document.querySelectorAll('#mobileItemContainer .item-card').forEach((card, i) => { 
        card.querySelector('.m-table-index').innerText = "Item #" + (i + 1); 
    });
}

function processFinancialMatrix() {
    let coreSubtotal = 0;
    const mCards = document.querySelectorAll('#mobileItemContainer .item-card');

    mCards.forEach((card) => {
        const rate = parseFloat(card.querySelector('.f-item-rate').value) || 0;
        const qty = parseFloat(card.querySelector('.f-item-qty').value) || 0;
        const total = rate * qty;
        coreSubtotal += total;
        
        card.querySelector('.m-computed-subtotal').innerText = '₹' + total.toFixed(2);
    });

    const discount = parseFloat(document.getElementById('uiDiscount').value) || 0;
    const taxRate = parseFloat(document.getElementById('uiTaxRate').value) || 0;

    const taxableBase = Math.max(0, coreSubtotal - discount);
    const taxVal = taxableBase * (taxRate / 100);
    const grandTotal = taxableBase + taxVal;

    document.getElementById('uiSubtotal').innerText = '₹' + coreSubtotal.toFixed(2);
    document.getElementById('uiTaxVal').innerText = '₹' + taxVal.toFixed(2);
    document.getElementById('uiGrandTotal').innerText = '₹' + grandTotal.toFixed(2);
}

// Execution Notes Presets
function appendNotePreset(presetText) {
    const area = document.getElementById('customProjectNotes');
    if (area.value.trim().length > 0) {
        area.value = area.value.trim() + '\n' + presetText;
    } else {
        area.value = presetText;
    }
}

// Clause / Disclaimer Operations
function toggleClause(key) {
    const checked = document.getElementById('chk_' + key).checked;
    const wrap = document.getElementById('clauseWrap_' + key);
    const inp = document.getElementById('inp_' + key);
    if(wrap) wrap.classList.toggle('active', checked);
    if(inp) inp.style.display = checked ? '' : 'none';
}

let customClauseCount = 2;
function insertCustomClauseRow() {
    customClauseCount++;
    const parent = document.getElementById('clausesDynamicList');
    const token = 'custom_' + Date.now();
    
    const div = document.createElement('div');
    div.className = 'clause-card active';
    div.id = 'clauseWrap_' + token;
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <label class="clause-header" style="margin:0; flex:1;">
                <input type="checkbox" class="clause-checkbox" id="chk_${token}" checked onchange="toggleClause('${token}')">
                <span class="clause-title">${customClauseCount}. Custom Disclaimer</span>
            </label>
            <button type="button" onclick="removeCustomClauseRow('${token}')" style="background:transparent; border:none; color:var(--danger); font-size:1.1rem; font-weight:800; cursor:pointer;" title="Remove">✕</button>
        </div>
        <div class="clause-input-box" id="inp_${token}">
            <input type="text" id="termCustom_${token}" value="Specify unique project clearance parameters here." class="f-custom-clause-input">
        </div>
    `;
    parent.appendChild(div);
}

function removeCustomClauseRow(token) {
    const target = document.getElementById('clauseWrap_' + token);
    if(target) target.remove();
    
    customClauseCount = 2;
    const labels = document.querySelectorAll('#clausesDynamicList .clause-title');
    labels.forEach((label, idx) => {
        const baseText = label.innerText.replace(/^\d+\.\s*/, '');
        label.innerText = (idx + 1) + ". " + baseText;
        customClauseCount = idx + 1;
    });
}

// Indian Numbering System Converter
function convertNumberToTextPhrase(amount) {
    let num = Math.floor(amount);
    if (num === 0) return "Zero Rupees Only";
    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    
    function chunk(n) {
        let str = "";
        if (n >= 100) { str += units[Math.floor(n / 100)] + " Hundred "; n %= 100; }
        if (n >= 20) { str += tens[Math.floor(n / 10)] + " "; n %= 10; }
        if (n > 0) { str += units[n] + " "; }
        return str;
    }

    let out = "";
    if (Math.floor(num / 100000) > 0) { out += chunk(Math.floor(num / 100000)) + "Lakh "; num %= 100000; }
    if (Math.floor(num / 1000) > 0) { out += chunk(Math.floor(num / 1000)) + "Thousand "; num %= 1000; }
    if (num > 0) { out += chunk(num); }
    return out.trim() + " Rupees Only";
}

// Smart Wizard Validation Engine
function validateFormForPDF() {
    // 1. Validate Step 1: Client Recipient Details
    const dateInp = document.getElementById('docDate');
    const nameInp = document.getElementById('clientName');
    const addrInp = document.getElementById('clientAddress');

    if (!dateInp.value.trim()) {
        jumpToStep(1);
        alert('Please enter the Date of Issuance (DD-MM-YYYY).');
        dateInp.focus();
        return false;
    }
    if (!nameInp.value.trim()) {
        jumpToStep(1);
        alert('Please enter Customer Name.');
        nameInp.focus();
        return false;
    }
    if (!addrInp.value.trim()) {
        jumpToStep(1);
        alert('Please enter Customer Address.');
        addrInp.focus();
        return false;
    }

    // 2. Validate Step 2: Line Items
    const items = document.querySelectorAll('#mobileItemContainer .item-card');
    if (items.length === 0) {
        jumpToStep(2);
        alert('Please add at least one item row to the bill.');
        return false;
    }

    let invalidIndex = -1;
    let missingField = '';
    items.forEach((card, idx) => {
        if (invalidIndex !== -1) return;
        const title = card.querySelector('.f-item-title').value.trim();
        const uom = card.querySelector('.f-item-uom').value.trim();
        const rate = card.querySelector('.f-item-rate').value.trim();
        const qty = card.querySelector('.f-item-qty').value.trim();

        if (!title) { invalidIndex = idx; missingField = 'Item Name'; }
        else if (!uom) { invalidIndex = idx; missingField = 'UOM'; }
        else if (!rate || isNaN(parseFloat(rate))) { invalidIndex = idx; missingField = 'Rate'; }
        else if (!qty || isNaN(parseFloat(qty))) { invalidIndex = idx; missingField = 'Quantity'; }
    });

    if (invalidIndex !== -1) {
        jumpToStep(2);
        alert(`Please complete the "${missingField}" field for Item #${invalidIndex + 1}.`);
        return false;
    }

    return true;
}

// PDF Document Generation Engine (Pixel-Identical Specification)
function buildJsPDFDocument() {
    if (!validateFormForPDF()) {
        return null;
    }

    const pdfDoc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const startX = 10;
    const widthTotal = 190;
    let currentY = 10;

    const docType = document.getElementById('documentType').value;

    // --- 1. TOP HEADER LAYOUT BLOCK ---
    pdfDoc.setFillColor(245, 245, 245);
    pdfDoc.rect(startX, currentY, widthTotal, 10, 'DF');
    pdfDoc.setDrawColor(0);
    pdfDoc.setLineWidth(0.4);
    pdfDoc.rect(startX, currentY, widthTotal, 10, 'D');

    pdfDoc.setTextColor(15, 32, 67);
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(14);
    pdfDoc.text(docType, startX + (widthTotal / 2), currentY + 7.5, { align: 'center' });

    if (docType === 'CASH BILL') {
        const billNoVal = document.getElementById('manualBillNo').value || "000";
        pdfDoc.setFontSize(11);
        pdfDoc.text(`Bill No:${billNoVal}`, startX + widthTotal - 4, currentY + 7, { align: 'right' });
    }

    currentY += 10;

    pdfDoc.rect(startX, currentY, 65, 30, 'D');
    pdfDoc.rect(startX + 65, currentY, 65, 30, 'D');
    pdfDoc.rect(startX + 130, currentY, 60, 30, 'D');

    pdfDoc.setTextColor(0);
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(11);
    pdfDoc.text("SPARK PAINTERS", startX + 4, currentY + 6);
    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.setFontSize(8.5);
    pdfDoc.text([
        "NO 11ST OPEN SHED 3RD",
        "UNIT POTTROOM",
        "MADHAVRAM MILK COLONY",
        "CHENNAI - 600051"
    ], startX + 4, currentY + 12, { leading: 4 });

    // --- 2. MIDDLE HEADER BOX ---
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(8.5);

    pdfDoc.text("PAN", startX + 69, currentY + 6);
    pdfDoc.text("STATE CODE", startX + 69, currentY + 11);
    pdfDoc.text("MOBILE NO", startX + 69, currentY + 16);

    pdfDoc.text(":", startX + 92, currentY + 6);
    pdfDoc.text(":", startX + 92, currentY + 11);
    pdfDoc.text(":", startX + 92, currentY + 16);

    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.text("EAQPP9475J", startX + 95, currentY + 6);
    pdfDoc.text("TAMIL NADU", startX + 95, currentY + 11);
    pdfDoc.text("8124622861", startX + 95, currentY + 16);
    pdfDoc.text("8300543854", startX + 95, currentY + 21);

    if (COMPANY_LOGO_BASE64) {
        try {
            pdfDoc.addImage(COMPANY_LOGO_BASE64, 'PNG', startX + 144, currentY + 4, 30, 22);
        } catch (e) {
            console.warn("Logo rendering fallback active:", e);
        }
    }

    currentY += 30;

    pdfDoc.setDrawColor(0);
    pdfDoc.setLineWidth(0.4);
    pdfDoc.rect(startX, currentY, widthTotal, 6, 'D');
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(9);
    pdfDoc.text("Email ID :", startX + 4, currentY + 4.5);
    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.text("madhanprabhu8034@gmail.com", startX + 24, currentY + 4.5);
    currentY += 6;

    pdfDoc.rect(startX, currentY, widthTotal, 6, 'D');
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(9);
    pdfDoc.text("Date :", startX + 4, currentY + 4.5);
    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.text(document.getElementById('docDate').value, startX + 17, currentY + 4.5);
    currentY += 6;

    const clientNameInput = document.getElementById('clientName').value;
    pdfDoc.rect(startX, currentY, widthTotal, 22, 'D');
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(9);
    pdfDoc.text("TO :", startX + 4, currentY + 6);
    pdfDoc.text(clientNameInput, startX + 17, currentY + 6);
    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.setFontSize(8.5);
    pdfDoc.text(document.getElementById('clientAddress').value, startX + 17, currentY + 13, { maxWidth: 172 });
    currentY += 22;

    // --- 3. ITEMS DATA GRID ---
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(9);
    pdfDoc.rect(startX, currentY, widthTotal, 8, 'D');
    
    pdfDoc.text("S.NO.", startX + 2, currentY + 5.5);
    pdfDoc.text("DECSCRIPTION", startX + 40, currentY + 5.5);
    pdfDoc.text("UOM", startX + 118, currentY + 5.5);
    pdfDoc.text("RATE", startX + 142, currentY + 5.5);
    pdfDoc.text("TOTAL", startX + 172, currentY + 5.5);

    let tableHeaderY = currentY;
    currentY += 8;

    const maxTableHeight = 72; 

    // --- WATERMARK LOGO ---
    if (COMPANY_LOGO_BASE64) {
        try {
            pdfDoc.saveGraphicsState();
            pdfDoc.setGState(new pdfDoc.GState({ opacity: 0.07 })); 
            const watermarkW = 70;
            const watermarkH = 58;
            const watermarkX = startX + (widthTotal - watermarkW) / 2;
            const watermarkY = tableHeaderY + (maxTableHeight - watermarkH) / 2;
            pdfDoc.addImage(COMPANY_LOGO_BASE64, 'PNG', watermarkX, watermarkY, watermarkW, watermarkH);
            pdfDoc.restoreGraphicsState();
        } catch(e) {}
    }

    const cards = document.querySelectorAll('#mobileItemContainer .item-card');
    const rowHeight = 9;
    let lastItemY = currentY;

    cards.forEach((card, index) => {
        const title = card.querySelector('.f-item-title').value;
        const uom = card.querySelector('.f-item-uom').value;
        const rate = parseFloat(card.querySelector('.f-item-rate').value) || 0;
        const qty = parseFloat(card.querySelector('.f-item-qty').value) || 0;
        const total = rate * qty;

        let printY = currentY + (index * rowHeight);
        lastItemY = printY + rowHeight;
        
        pdfDoc.setFont('Helvetica', 'normal');
        pdfDoc.setFontSize(8.5);
        pdfDoc.text((index + 1).toString(), startX + 5, printY + 5.5);
        pdfDoc.text(title, startX + 18, printY + 5.5);
        pdfDoc.text(uom, startX + 112, printY + 5.5);
        pdfDoc.text(rate.toFixed(2), startX + 142, printY + 5.5);
        pdfDoc.text(total.toFixed(2), startX + 172, printY + 5.5);
    });

    // --- ANCHORED NOTE SECTION ---
    const projectNotesVal = document.getElementById('customProjectNotes').value.trim();
    if(projectNotesVal) {
        const parsedLines = pdfDoc.splitTextToSize(projectNotesVal, 88);
        const totalNoteLinesHeight = (parsedLines.length * 3.5) + 4;
        
        let noteRenderY = tableHeaderY + maxTableHeight - 14 - totalNoteLinesHeight;
        
        if (noteRenderY < lastItemY + 2) {
            noteRenderY = lastItemY + 3;
        }

        pdfDoc.setFont('Helvetica', 'bold');
        pdfDoc.setFontSize(8);
        pdfDoc.text("NOTE :", startX + 18, noteRenderY);
        pdfDoc.setFont('Helvetica', 'normal');
        pdfDoc.text(parsedLines, startX + 18, noteRenderY + 4, { leading: 3.5 });
    }

    pdfDoc.rect(startX, tableHeaderY, widthTotal, maxTableHeight, 'D');

    pdfDoc.line(startX + 15, tableHeaderY, startX + 15, tableHeaderY + maxTableHeight); 
    pdfDoc.line(startX + 108, tableHeaderY, startX + 108, tableHeaderY + maxTableHeight);
    pdfDoc.line(startX + 135, tableHeaderY, startX + 135, tableHeaderY + maxTableHeight);
    pdfDoc.line(startX + 162, tableHeaderY, startX + 162, tableHeaderY + maxTableHeight);

    // --- EMBEDDED TOTALS ---
    const subtotalRaw = parseFloat(document.getElementById('uiSubtotal').innerText.replace(/[^0-9.-]+/g,'')) || 0;
    const grandTotalRaw = parseFloat(document.getElementById('uiGrandTotal').innerText.replace(/[^0-9.-]+/g,'')) || 0;

    const totalRowsTopY = tableHeaderY + maxTableHeight - 14; 
    
    pdfDoc.line(startX + 108, totalRowsTopY, startX + widthTotal, totalRowsTopY);
    pdfDoc.line(startX + 108, totalRowsTopY + 7, startX + widthTotal, totalRowsTopY + 7);

    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.setFontSize(9);
    pdfDoc.text("Total", startX + 120, totalRowsTopY + 5);
    pdfDoc.text(subtotalRaw.toFixed(2), startX + 172, totalRowsTopY + 5);

    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.text("GRAND TOTAL", startX + 110, totalRowsTopY + 12);
    pdfDoc.text(grandTotalRaw.toFixed(2), startX + 172, totalRowsTopY + 12);

    currentY = tableHeaderY + maxTableHeight;

    // --- BOTTOM FOOTER MATRIX ---
    pdfDoc.rect(startX, currentY, widthTotal, 7, 'D');
    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(8.5);
    pdfDoc.text("Amount In Words :", startX + 4, currentY + 5);
    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.text(convertNumberToTextPhrase(grandTotalRaw), startX + 36, currentY + 5);
    currentY += 7;

    pdfDoc.rect(startX, currentY, widthTotal, 26, 'D');

    let disclaimersStartY = currentY + 5;
    const activeClauses = [];
    if(document.getElementById('chk_payment') && document.getElementById('chk_payment').checked) {
        activeClauses.push({ label: 'Payment terms : ', text: document.getElementById('termPayment').value });
    }
    if(document.getElementById('chk_hours') && document.getElementById('chk_hours').checked) {
        activeClauses.push({ label: 'Working Hours : ', text: document.getElementById('termHours').value });
    }
    document.querySelectorAll('#clausesDynamicList .clause-card').forEach(item => {
        const cBox = item.querySelector('.clause-checkbox');
        if(cBox && cBox.id !== 'chk_payment' && cBox.id !== 'chk_hours' && cBox.checked) {
            const inp = item.querySelector('.f-custom-clause-input');
            if(inp) {
                activeClauses.push({ label: 'Custom Clause : ', text: inp.value });
            }
        }
    });

    activeClauses.forEach((c) => {
        if(disclaimersStartY < currentY + 24) {
            pdfDoc.setFont('Helvetica', 'bold');
            pdfDoc.setFontSize(7.5);
            pdfDoc.text(c.label, startX + 4, disclaimersStartY);
            pdfDoc.setFont('Helvetica', 'normal');
            pdfDoc.text(c.text, startX + 26, disclaimersStartY, { maxWidth: 158 });
            disclaimersStartY += 4.5;
        }
    });
    currentY += 26;

    pdfDoc.rect(startX, currentY, 95, 26, 'D');
    pdfDoc.rect(startX + 95, currentY, 95, 26, 'D');

    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(8.5);
    pdfDoc.text("COMPANY BANK DETAILS :", startX + 3, currentY + 5);
    pdfDoc.setFont('Helvetica', 'normal');
    pdfDoc.setFontSize(8);
    pdfDoc.text([
        "BANK NAME : INDIAN BANK",
        "ACCOUNT NAME : PRABHU R",
        "ACCOUNT NUMBER : 7460854061",
        "IFSC CODE : IDIB000M275-MADHAVARAM"
    ], startX + 3, currentY + 10, { leading: 5.5 });

    pdfDoc.setFont('Helvetica', 'bold');
    pdfDoc.setFontSize(8.5);
    pdfDoc.text("FOR. SPARK PAINTERS", startX + 130, currentY + 5);
    pdfDoc.text("AUTHORISED SIGNATURE", startX + 128, currentY + 23);

    if (COMPANY_SIGN_BASE64) {
        try {
            pdfDoc.addImage(COMPANY_SIGN_BASE64, 'PNG', startX + 130, currentY + 7, 35, 12);
        } catch (e) {
            console.warn("Signature tracking fallback active:", e);
        }
    }

    return pdfDoc;
}

// Mobile & Native Save / Share Handler
async function handleMobilePDFOutput(pdfDoc, filename, isShareAction = false) {
    const docType = document.getElementById('documentType').value;
    const clientNameInput = document.getElementById('clientName').value;

    // Check if running in native Android / iOS Capacitor app
    if (Capacitor.isNativePlatform()) {
        try {
            const dataUri = pdfDoc.output('datauristring');
            const base64Data = dataUri.split(',')[1];

            // Write to Cache directory first for reliable native sharing
            const savedCacheFile = await Filesystem.writeFile({
                path: filename,
                data: base64Data,
                directory: Directory.Cache
            });

            // Write to Documents directory for local user access
            try {
                await Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: Directory.Documents,
                    recursive: true
                });
            } catch (fsErr) {
                console.warn("Documents write fallback notice:", fsErr);
            }

            if (isShareAction) {
                await Share.share({
                    title: `${docType} - Spark Painters`,
                    text: `Spark Painters ${docType} for ${clientNameInput}`,
                    url: savedCacheFile.uri,
                    dialogTitle: 'Share PDF Document'
                });
            } else {
                await Share.share({
                    title: `${docType} - Spark Painters`,
                    text: `Spark Painters ${docType} generated for ${clientNameInput}`,
                    url: savedCacheFile.uri,
                    dialogTitle: 'Save / Open PDF Document'
                });
                alert(`✅ PDF Generated Successfully!\nSaved as: ${filename}`);
            }
            return;
        } catch (nativeErr) {
            console.warn("Capacitor native export fallback:", nativeErr);
        }
    }

    // Web Browser Fallback
    const pdfBlob = pdfDoc.output('blob');

    if (isShareAction && navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], filename, { type: 'application/pdf' })] })) {
        try {
            const file = new File([pdfBlob], filename, { type: 'application/pdf' });
            await navigator.share({
                files: [file],
                title: `${docType} - Spark Painters`,
                text: `Spark Painters ${docType} for ${clientNameInput}`
            });
            return;
        } catch (shareErr) {
            if (shareErr.name === 'AbortError') return;
        }
    }

    // Direct Browser Download
    pdfDoc.save(filename);
}

// Generate & Download PDF File
async function generateDocumentPDF() {
    const pdfDoc = buildJsPDFDocument();
    if(!pdfDoc) return;

    const docType = document.getElementById('documentType').value;
    const clientNameInput = document.getElementById('clientName').value;
    const formattedDocType = docType.charAt(0).toUpperCase() + docType.slice(1).toLowerCase();
    const cleanCustomerName = clientNameInput.trim().replace(/[^a-zA-Z0-9]/g, '_') || "Customer";
    const filename = `${formattedDocType}_${cleanCustomerName}.pdf`;

    await handleMobilePDFOutput(pdfDoc, filename, false);
}

// Mobile Live Document Visual Preview inside Modal
function previewDocumentPDF() {
    const pdfDoc = buildJsPDFDocument();
    if(!pdfDoc) return;

    const docType = document.getElementById('documentType').value;
    const clientName = document.getElementById('clientName').value;
    const clientAddress = document.getElementById('clientAddress').value;
    const docDate = document.getElementById('docDate').value;
    const grandTotal = document.getElementById('uiGrandTotal').innerText;
    const subtotal = document.getElementById('uiSubtotal').innerText;
    const discount = document.getElementById('uiDiscount').value || '0';
    const taxVal = document.getElementById('uiTaxVal').innerText;

    // Render clean visual document card inside modal container
    const previewContainer = document.getElementById('pdfPreviewFrame');
    
    // Get item rows summary
    const itemCards = document.querySelectorAll('#mobileItemContainer .item-card');
    let itemsHtml = '';
    itemCards.forEach((card, idx) => {
        const title = card.querySelector('.f-item-title').value || '-';
        const uom = card.querySelector('.f-item-uom').value || '-';
        const rate = card.querySelector('.f-item-rate').value || '0';
        const qty = card.querySelector('.f-item-qty').value || '0';
        const total = card.querySelector('.m-computed-subtotal').innerText || '₹0.00';

        itemsHtml += `
            <tr style="border-bottom:1px solid #e2e8f0; font-size:0.8rem;">
                <td style="padding:6px; text-align:center; font-weight:700;">${idx + 1}</td>
                <td style="padding:6px; font-weight:600;">${title}</td>
                <td style="padding:6px;">${uom}</td>
                <td style="padding:6px;">₹${rate}</td>
                <td style="padding:6px; text-align:right;">${qty}</td>
                <td style="padding:6px; text-align:right; font-weight:700;">${total}</td>
            </tr>
        `;
    });

    const notesVal = document.getElementById('customProjectNotes').value;

    const previewDocHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: sans-serif; padding: 12px; margin: 0; color: #0f172a; background: #fff; }
                .doc-box { border: 2px solid #0f172a; border-radius: 8px; padding: 12px; }
                .header-title { text-align: center; font-size: 1.1rem; font-weight: 800; background: #f1f5f9; padding: 6px; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; }
                .info-grid { display: flex; justify-content: space-between; font-size: 0.8rem; margin: 10px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: #f8fafc; text-align: left; font-size: 0.75rem; padding: 6px; border-bottom: 2px solid #cbd5e1; }
                .total-box { margin-top: 12px; text-align: right; font-size: 0.9rem; font-weight: 700; background: #0f172a; color: #fff; padding: 10px; border-radius: 6px; }
                .grand { color: #34d399; font-size: 1.1rem; }
            </style>
        </head>
        <body>
            <div class="doc-box">
                <div class="header-title">SPARK PAINTERS - ${docType}</div>
                <div class="info-grid">
                    <div>
                        <strong>TO:</strong> ${clientName}<br>
                        <span style="color:#64748b;">${clientAddress}</span>
                    </div>
                    <div style="text-align:right;">
                        <strong>Date:</strong> ${docDate}<br>
                        <span style="color:#4f46e5; font-weight:700;">PAN: EAQPP9475J</span>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width:30px;">#</th>
                            <th>Item Name</th>
                            <th>UOM</th>
                            <th>Rate</th>
                            <th style="text-align:right;">Qty</th>
                            <th style="text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                ${notesVal ? `<div style="font-size:0.75rem; margin-top:10px; color:#475569;"><strong>Notes:</strong> ${notesVal}</div>` : ''}

                <div class="total-box">
                    <div>Subtotal: ${subtotal}</div>
                    ${parseFloat(discount) > 0 ? `<div>Discount: ₹${discount}</div>` : ''}
                    <div>Grand Total: <span class="grand">${grandTotal}</span></div>
                </div>
            </div>
        </body>
        </html>
    `;

    // Try setting iframe document or srcdoc
    try {
        previewContainer.srcdoc = previewDocHtml;
    } catch (e) {
        previewContainer.src = pdfDoc.output('bloburl');
    }

    document.getElementById('pdfPreviewModal').classList.add('active');
}

// Mobile Web Share API Integration
async function shareDocumentPDF() {
    const pdfDoc = buildJsPDFDocument();
    if(!pdfDoc) return;

    const docType = document.getElementById('documentType').value;
    const clientNameInput = document.getElementById('clientName').value;
    const formattedDocType = docType.charAt(0).toUpperCase() + docType.slice(1).toLowerCase();
    const cleanCustomerName = clientNameInput.trim().replace(/[^a-zA-Z0-9]/g, '_') || "Customer";
    const filename = `${formattedDocType}_${cleanCustomerName}.pdf`;

    await handleMobilePDFOutput(pdfDoc, filename, true);
}

// Modal helper controls
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Local Storage Draft History Management
function saveCurrentBillDraft() {
    const clientName = document.getElementById('clientName').value.trim();
    if (!clientName) {
        alert('Please enter a customer name before saving.');
        return;
    }

    const draft = {
        id: 'draft_' + Date.now(),
        date: document.getElementById('docDate').value,
        docType: document.getElementById('documentType').value,
        billNo: document.getElementById('manualBillNo').value,
        clientName: clientName,
        clientAddress: document.getElementById('clientAddress').value,
        notes: document.getElementById('customProjectNotes').value,
        total: document.getElementById('uiGrandTotal').innerText,
        savedAt: new Date().toLocaleString()
    };

    let history = JSON.parse(localStorage.getItem('spark_bills_history') || '[]');
    history.unshift(draft);
    localStorage.setItem('spark_bills_history', JSON.stringify(history));

    alert(`Bill draft for "${clientName}" saved successfully!`);
}

function openHistoryModal() {
    const history = JSON.parse(localStorage.getItem('spark_bills_history') || '[]');
    const container = document.getElementById('historyListContainer');

    if (history.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No saved bills in history.</p>`;
    } else {
        container.innerHTML = history.map((item) => `
            <div class="history-item">
                <div class="history-details">
                    <span class="history-name">${item.clientName} (${item.docType})</span>
                    <span class="history-sub">${item.date} • ${item.total}</span>
                    <span class="history-sub" style="font-size:0.65rem; color:#94a3b8;">Saved: ${item.savedAt}</span>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('historyModal').classList.add('active');
}

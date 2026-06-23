// VRA DMS — RAW MATERIAL MODULE

// ── STATE ──
let lots = [];
let printQty = 4;
let currentPrintLot = null;
let addModalTarget = null; // 'grade' | 'approver'

const DEFAULT_GRADES = ['ADC12', 'ADC10', 'A380', 'LM24'];
const DEFAULT_APPROVERS = ['Manish Yadav', 'Sagar Shirgure', 'Akshay Dake'];

// ── INIT ──
window.onload = () => {
  loadFromStorage();
  setTodayDate();
  generateLotNumber();
  populateGrades();
  populateApprovers();
  renderRegister();
  updateSupplierList();
};

function setTodayDate() {
  const d = new Date();
  document.getElementById('recv-date').value = d.toISOString().split('T')[0];
}

// ── GRADE & APPROVER LIST MANAGEMENT ──
function getGrades() {
  try { return JSON.parse(localStorage.getItem('vra_grades')) || DEFAULT_GRADES; } catch(e) { return DEFAULT_GRADES; }
}
function saveGrades(list) {
  try { localStorage.setItem('vra_grades', JSON.stringify(list)); } catch(e) {}
}
function getApprovers() {
  try { return JSON.parse(localStorage.getItem('vra_approvers')) || DEFAULT_APPROVERS; } catch(e) { return DEFAULT_APPROVERS; }
}
function saveApprovers(list) {
  try { localStorage.setItem('vra_approvers', JSON.stringify(list)); } catch(e) {}
}

function populateGrades(selectedVal) {
  const sel = document.getElementById('grade');
  const grades = getGrades();
  const current = selectedVal || sel.value || grades[0];
  sel.innerHTML = grades.map(g => `<option value="${g}" ${g===current?'selected':''}>${g}</option>`).join('');
}

function populateApprovers(selectedVal) {
  const sel = document.getElementById('approved-by');
  const approvers = getApprovers();
  const current = selectedVal || sel.value || '';
  sel.innerHTML = `<option value="">— Select —</option>` +
    approvers.map(a => `<option value="${a}" ${a===current?'selected':''}>${a}</option>`).join('');
}

// ── ADD ITEM MODAL ──
function openAddModal(target) {
  addModalTarget = target;
  const isGrade = target === 'grade';
  document.getElementById('add-modal-title').textContent = isGrade ? 'Manage Alloy Grades' : 'Manage Approvers';
  document.getElementById('add-modal-input').placeholder = isGrade ? 'e.g. A360, LM6, AlSi9Cu3…' : 'Name and role e.g. Ravi Kumar';
  document.getElementById('add-modal-input').value = '';
  renderManageList();
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('add-modal-input').focus(), 50);
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
  addModalTarget = null;
}

function confirmAddItem() {
  const val = document.getElementById('add-modal-input').value.trim();
  if (!val) return;
  if (addModalTarget === 'grade') {
    const list = getGrades();
    if (!list.includes(val)) { list.push(val); saveGrades(list); }
    populateGrades(val);
  } else {
    const list = getApprovers();
    if (!list.includes(val)) { list.push(val); saveApprovers(list); }
    populateApprovers(val);
  }
  document.getElementById('add-modal-input').value = '';
  renderManageList();
}

function deleteListItem(val) {
  if (addModalTarget === 'grade') {
    const list = getGrades().filter(g => g !== val);
    if (list.length === 0) { alert('Must keep at least one grade.'); return; }
    saveGrades(list);
    populateGrades();
  } else {
    const list = getApprovers().filter(a => a !== val);
    saveApprovers(list);
    populateApprovers();
  }
  renderManageList();
}

function renderManageList() {
  const items = addModalTarget === 'grade' ? getGrades() : getApprovers();
  const el = document.getElementById('manage-list');
  if (items.length === 0) {
    el.innerHTML = '<div class="manage-empty">No items yet.</div>';
    return;
  }
  el.innerHTML = items.map(item => `
    <div class="manage-item">
      <span>${item}</span>
      <button class="manage-item-del" onclick="deleteListItem('${item.replace(/'/g,"\\'")}')">×</button>
    </div>
  `).join('');
}

// Allow Enter key in add modal
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('add-modal').classList.contains('open')) {
    confirmAddItem();
  }
  if (e.key === 'Escape' && document.getElementById('add-modal').classList.contains('open')) {
    closeAddModal();
  }
});

// ── LOT NUMBER GENERATOR ──
function generateLotNumber() {
  const dateVal = document.getElementById('recv-date').value;
  if (!dateVal) return;
  const d = new Date(dateVal);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(-2);
  const dateStr = `${dd}${mm}${yy}`;
  const sameDay = lots.filter(l => l.lotNumber.includes(`RM-${dateStr}`));
  const seq = String(sameDay.length + 1).padStart(2,'0');
  document.getElementById('lot-number').value = `VRA-RM-${dateStr}-${seq}`;
}

// ── QTY STEPPER ──
function changeQty(delta) {
  printQty = Math.max(1, Math.min(20, printQty + delta));
  document.getElementById('qty-display').textContent = printQty;
}

// ── VALIDATION ──
function validate() {
  const fields = [
    { id: 'supplier', label: 'Supplier Name' },
    { id: 'invoice', label: 'Invoice Number' },
    { id: 'approved-by', label: 'Approved By' },
    { id: 'recv-date', label: 'Received Date' }
  ];
  for (const f of fields) {
    if (!document.getElementById(f.id).value.trim()) {
      showMsg(`Please fill in: ${f.label}`);
      return false;
    }
  }
  hideMsg();
  return true;
}
function showMsg(m) {
  const el = document.getElementById('form-msg');
  el.textContent = '⚠ ' + m;
  el.style.display = 'block';
}
function hideMsg() {
  document.getElementById('form-msg').style.display = 'none';
}

// ── COLLECT FORM DATA ──
function collectForm() {
  return {
    id: Date.now(),
    lotNumber: document.getElementById('lot-number').value,
    date: document.getElementById('recv-date').value,
    grade: document.getElementById('grade').value,
    supplier: document.getElementById('supplier').value.trim(),
    invoice: document.getElementById('invoice').value.trim(),
    approvedBy: document.getElementById('approved-by').value,
    spectro: document.getElementById('spectro').value,
    bundles: printQty,
    createdAt: new Date().toISOString()
  };
}

// ── SAVE LOT ──
function saveLot() {
  if (!validate()) return;
  const lot = collectForm();
  lots.unshift(lot);
  saveToStorage();
  renderRegister();
  updateSupplierList();
  showMsg('✓ Saved to register.');
  document.getElementById('form-msg').style.color = 'var(--green-mid)';
  setTimeout(() => {
    hideMsg();
    document.getElementById('form-msg').style.color = 'var(--red)';
  }, 2500);
  // bump lot number for next entry
  setTimeout(generateLotNumber, 100);
}

// ── PREVIEW LABELS ──
function previewLabels(lotData) {
  if (lotData) {
    currentPrintLot = lotData;
  } else {
    if (!validate()) return;
    currentPrintLot = collectForm();
  }
  renderLabels(currentPrintLot, lotData ? lotData.bundles : printQty);
  document.getElementById('modal-lot-num').textContent = currentPrintLot.lotNumber;
  document.getElementById('modal-count').textContent = `${lotData ? lotData.bundles : printQty} label(s) to print`;
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// ── RENDER LABELS ──
function renderLabels(lot, qty) {
  const area = document.getElementById('print-area');
  area.innerHTML = '';
  for (let i = 1; i <= qty; i++) {
    area.appendChild(buildLabel(lot, i, qty));
  }
}

function buildLabel(lot, index, total) {
  const spectroText = lot.spectro === 'Done' ? '✓ Done' : lot.spectro === 'Pending' ? '⏳ Pending' : 'N/A';
  const dateFormatted = lot.date ? formatDate(lot.date) : '—';

  const div = document.createElement('div');
  div.className = 'label-a5';
  div.innerHTML = `
    <div class="label-header">
      <div class="label-company">V R ALUCAST</div>
      <div class="label-subtitle">RAW MATERIAL — INGOT BUNDLE TAG</div>
      <span class="label-bundle-num">Bundle ${index} of ${total}</span>
    </div>
    <div class="label-badge">✓ &nbsp; APPROVED</div>
    <hr class="label-divider">
    <div class="label-lot-block">
      <div class="label-field-label">INTERNAL LOT NUMBER</div>
      <div class="label-lot-num">${lot.lotNumber}</div>
    </div>
    <hr class="label-divider">
    <div class="label-row">
      <div class="label-cell">
        <div class="label-field-label">ALLOY GRADE</div>
        <div class="label-cell-inner amber">
          <div class="label-val amber-c">${lot.grade}</div>
        </div>
      </div>
      <div class="label-cell">
        <div class="label-field-label">SUPPLIER NAME</div>
        <div class="label-cell-inner">
          <div class="label-val" style="font-size:12px;">${lot.supplier}</div>
        </div>
      </div>
    </div>
    <hr class="label-divider">
    <div class="label-row">
      <div class="label-cell" style="flex:2;">
        <div class="label-field-label">INVOICE NUMBER</div>
        <div class="label-cell-inner">
          <div class="label-val">${lot.invoice}</div>
        </div>
      </div>
    </div>
    <hr class="label-divider">
    <div class="label-row">
      <div class="label-cell">
        <div class="label-field-label">RECEIVED DATE</div>
        <div class="label-cell-inner">
          <div class="label-val" style="font-size:12px;">${dateFormatted}</div>
        </div>
      </div>
      <div class="label-cell">
        <div class="label-field-label">SPECTRO TEST</div>
        <div class="label-cell-inner">
          <div class="label-val" style="font-size:12px;">${spectroText}</div>
        </div>
      </div>
    </div>
    <hr class="label-divider">
    <div class="label-row">
      <div class="label-cell" style="flex:2;">
        <div class="label-field-label">APPROVED BY</div>
        <div class="label-cell-inner">
          <div class="label-val" style="font-size:12px;">${lot.approvedBy}</div>
        </div>
      </div>
    </div>
    <div class="label-footer">
      <div class="label-doc">Doc No: VRA-QC-F-010 &nbsp;|&nbsp; Rev: 00 &nbsp;|&nbsp; Issue: Jun 2025</div>
      <div class="label-hole"><div class="label-hole-inner"></div></div>
    </div>
  `;
  return div;
}

// ── REGISTER ──
function renderRegister() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filtered = lots.filter(l =>
    l.lotNumber.toLowerCase().includes(q) ||
    l.supplier.toLowerCase().includes(q) ||
    l.invoice.toLowerCase().includes(q) ||
    l.grade.toLowerCase().includes(q)
  );

  const now = new Date();
  const thisMonth = lots.filter(l => {
    const d = new Date(l.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const pending = lots.filter(l => l.spectro === 'Pending');

  document.getElementById('stat-total').textContent = lots.length;
  document.getElementById('stat-month').textContent = thisMonth.length;
  document.getElementById('stat-pending').textContent = pending.length;

  const body = document.getElementById('register-body');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = filtered.map(lot => `
    <tr>
      <td><span class="lot-code">${lot.lotNumber}</span></td>
      <td>${formatDate(lot.date)}</td>
      <td><span class="pill pill-amber">${lot.grade}</span></td>
      <td>${lot.supplier}</td>
      <td style="font-family:monospace; font-size:12px;">${lot.invoice}</td>
      <td>
        <span class="pill ${lot.spectro === 'Done' ? 'pill-green' : lot.spectro === 'Pending' ? 'pill-amber' : 'pill-green'}">
          ${lot.spectro}
        </span>
      </td>
      <td>${lot.approvedBy}</td>
      <td style="text-align:center;">${lot.bundles}</td>
      <td>
        <div class="tbl-actions">
          <button class="tbl-btn tbl-btn-print" onclick="previewLabels(${JSON.stringify(lot).replace(/"/g,'&quot;')})">🖨 Print</button>
          <button class="tbl-btn tbl-btn-del" onclick="deleteLot(${lot.id})">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function deleteLot(id) {
  if (!confirm('Delete this lot record?')) return;
  lots = lots.filter(l => l.id !== id);
  saveToStorage();
  renderRegister();
  generateLotNumber();
}

// ── CLEAR FORM ──
function clearForm() {
  document.getElementById('supplier').value = '';
  document.getElementById('invoice').value = '';
  document.getElementById('spectro').value = 'Done';
  printQty = 4;
  document.getElementById('qty-display').textContent = '4';
  setTodayDate();
  generateLotNumber();
  populateGrades();
  populateApprovers();
  hideMsg();
}

// ── SUPPLIER AUTOCOMPLETE ──
function updateSupplierList() {
  const names = [...new Set(lots.map(l => l.supplier))];
  const dl = document.getElementById('supplier-list');
  dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
}

// ── TABS ──
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', (tab === 'new' && i === 0) || (tab === 'register' && i === 1));
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(tab === 'new' ? 'page-new' : 'page-register').classList.add('active');
  if (tab === 'register') renderRegister();
}

// ── EXPORT CSV ──
function exportCSV() {
  if (lots.length === 0) { alert('No data to export.'); return; }
  const headers = ['Lot Number','Date','Grade','Supplier','Invoice','Spectro','Approved By','Bundles'];
  const rows = lots.map(l => [l.lotNumber, l.date, l.grade, l.supplier, l.invoice, l.spectro, l.approvedBy, l.bundles]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = `VRA_RM_Lot_Register_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// ── STORAGE ──
function saveToStorage() {
  try { localStorage.setItem('vra_rm_lots', JSON.stringify(lots)); } catch(e) {}
}
function loadFromStorage() {
  try {
    const d = localStorage.getItem('vra_rm_lots');
    if (d) lots = JSON.parse(d);
  } catch(e) {}
}

// ── HELPERS ──
function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

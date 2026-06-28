// ═══════════════════════════════════════════════════════════════════
//  VRA DMS — QMS v2  :  PFMEA + Control Plan + Checksheet
//  Spreadsheet-style inline editing — no popups, no modals
//  IATF 16949 automotive quality document control
// ═══════════════════════════════════════════════════════════════════

const QMS2 = (() => {
'use strict';

// ── Constants ────────────────────────────────────────────────────────
const STEPS = ['Receiving Inspection','Melting','Die Casting','Trimming/Fettling',
               'Shot Blasting','Machining','Final Inspection','Packing & Dispatch'];
const GRADES = ['ADC12','A380','A383','LM2','LM6','LM24','ANSI360','AC4B'];
const REVS   = ['A','B','C','D','E','F','G','H','J','K'];

const DEFAULT_OPS = [
  {op:'OP10', label:'OP10 Incoming Inspection',  step:'Receiving Inspection'},
  {op:'OP20', label:'OP20 Melting',               step:'Melting'},
  {op:'OP30', label:'OP30 Die Casting',            step:'Die Casting'},
  {op:'OP40', label:'OP40 Trimming / Fettling',   step:'Trimming/Fettling'},
  {op:'OP50', label:'OP50 Shot Blasting',          step:'Shot Blasting'},
  {op:'OP60', label:'OP60 Machining',              step:'Machining'},
  {op:'OP70', label:'OP70 Final Inspection',       step:'Final Inspection'},
  {op:'OP80', label:'OP80 Packing & Dispatch',    step:'Packing & Dispatch'},
];
function stepToOp(step){ const o=DEFAULT_OPS.find(x=>x.step===step); return o?o.op:''; }
function opLabel(step){ const o=DEFAULT_OPS.find(x=>x.step===step); return o?o.label:step; }

// ── Dropdown masters for fast entry ──────────────────────────────────
const DD = {
  detectionMethod: [
    'Visual','Vernier Caliper','Micrometer','Dial Gauge','CMM','Go/No-Go Gauge',
    'Pyrometer','Thermocouple','Weighing Scale','Pressure Gauge','Spectrometer',
    'Hardness Tester','Surface Roughness Tester','Torque Wrench','Timer','Document Check'
  ],
  frequency: [
    'Every part (100%)','Every 5 parts','Every 10 parts','Every 25 parts','Every 50 parts',
    'First-off only','First-off + every 25 pcs','First-off + every 50 pcs',
    'Every heat','Every batch','Every shift start','Every 30 min',
    'Daily','Weekly','Monthly','At setup/die change','As required'
  ],
  reactionPlan: [
    'Stop production and inform supervisor','Scrap and record NCR',
    'Segregate and hold for QC decision','Rework and re-inspect',
    'Adjust process parameters and recheck','Replace tool/die and re-inspect',
    'Return to supplier','100% re-inspection of batch',
    'Stop casting, check metal temperature','Increase inspection frequency'
  ],
  status: ['Open','In Progress','Closed','On Hold'],
  responsibility: [
    'Operator','Production In-charge','QC Inspector','Die Setter',
    'Maintenance','Tool Room','Stores In-charge','Sagar Shirgure','Manish Yadav'
  ]
};

// SOD color class
const sodClass = v => { const n=parseInt(v)||0; return n<=2?'sod-1 sod-2':n<=4?'sod-3 sod-4':n<=6?'sod-5 sod-6':n<=8?'sod-7 sod-8':'sod-9 sod-10'; };
const rpnClass = r => r>=200?'rpn-crit':r>=100?'rpn-hi':r>=50?'rpn-med':r>=25?'rpn-low':'rpn-ok';

// Build a datalist dropdown
const mkDL = (id, items) => `<datalist id="${id}">${items.map(i=>`<option value="${esc(i)}">`).join('')}</datalist>`;
const STATUS_COLOR = {Draft:'#6b7280','Under Review':'#d97706',Approved:'#16a34a',Obsolete:'#dc2626'};

// ── State ─────────────────────────────────────────────────────────────
let _state = {
  parts:[], rows:[], cpParts:[], cpChars:[], cpTemplates:[], grades:[],
  currentPartId: null, currentCpId: null,
  dirty: new Set(), saveTimer: null
};

// ── API ───────────────────────────────────────────────────────────────
const api = (m,p,b) => fetch(p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.json());
const GET  = p   => api('GET',p);
const POST = (p,b)=> api('POST',p,b);
const DEL  = p   => api('DELETE',p);

// ── Utils ─────────────────────────────────────────────────────────────
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const today = () => new Date().toISOString().slice(0,10);
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const rpn = (s,o,d) => (parseInt(s)||1)*(parseInt(o)||1)*(parseInt(d)||1);
const rpnColor = r => r>=200?'#dc2626':r>=100?'#d97706':r>=50?'#ca8a04':'#16a34a';
const toast = (m,t='s') => window.toast?.(m,t) || console.log(m);
const setC = h => { const e=document.getElementById('content'); if(e) e.innerHTML=h; };
const uid = () => Math.random().toString(36).slice(2,9);

// ── Spreadsheet Cell Styles ───────────────────────────────────────────
const SS_STYLE = `
<style id="qms2-ss-style">
/* ── Frozen spreadsheet layout ─────────────────── */
.ss-outer{width:100%;overflow:hidden;border-radius:8px;border:1px solid #e2e8f0;position:relative}
.ss-scroll{overflow-x:auto;overflow-y:auto;max-height:72vh;-webkit-overflow-scrolling:touch}
.ss-table{border-collapse:separate;border-spacing:0;font-size:12px;table-layout:fixed;width:max-content;min-width:100%}

/* Frozen header row */
.ss-table thead th{
  background:#1e3a5f;color:#fff;padding:7px 8px;font-size:11px;font-weight:600;
  white-space:nowrap;position:sticky;top:0;z-index:4;
  border-right:1px solid #2d5078;border-bottom:2px solid #0d1f3c;
}
/* Frozen first column (Process Step) */
.ss-table td.ss-frozen,.ss-table th.ss-frozen{
  position:sticky;left:0;z-index:3;
  border-right:2px solid #c7d2e0!important;
}
.ss-table th.ss-frozen{z-index:5;background:#152d50}
.ss-table td.ss-frozen{background:#f8fafc}
.ss-table tr:hover td.ss-frozen{background:#eef2f8}

/* Frozen row number column */
.ss-table td.ss-row-num-td,.ss-table th.ss-rn{
  position:sticky;left:0;z-index:3;width:36px;min-width:36px;max-width:36px;
}
.ss-table th.ss-rn{z-index:5;background:#152d50;text-align:center}
.ss-table td.ss-row-num-td{
  text-align:center;color:#94a3b8;font-size:11px;
  background:#f8fafc!important;border-right:1px solid #e2e8f0;user-select:none;
  vertical-align:top;padding-top:8px;
}

/* Process Step column (second frozen) */
.ss-table td.ss-col-step,.ss-table th.ss-col-step{
  position:sticky;left:36px;z-index:3;
  border-right:2px solid #c7d2e0!important;min-width:120px;width:120px;
}
.ss-table th.ss-col-step{z-index:5;background:#152d50}
.ss-table td.ss-col-step{background:#f1f5fd}
.ss-table tr:hover td.ss-col-step{background:#e8eef9}

/* Regular cells */
.ss-table td{border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;
  padding:0;vertical-align:top;background:#fff;position:relative;transition:background .1s}
.ss-table tr:hover td{background:#fafbff}
.ss-table tr.ss-expanded td{background:#fffbeb!important}
.ss-table tr.ss-expanded td.ss-col-step{background:#fef3c7!important}

/* Editable cell */
.ss-cell{width:100%;min-height:40px;padding:6px 7px;outline:none;cursor:text;
  font-size:12px;font-family:inherit;color:#1e293b;white-space:pre-wrap;word-break:break-word;
  word-wrap:break-word;overflow-wrap:break-word;
  line-height:1.6;box-sizing:border-box;resize:none;border:none;background:transparent;display:block;
  overflow:visible}
.ss-cell:focus{background:#fffde7!important;outline:2px solid #f59e0b;outline-offset:-1px;z-index:1}
.ss-cell.ss-num{text-align:center;font-weight:700;width:100%;min-height:40px}
/* Process step change divider */
.ss-step-divider td{border-top:3px solid #0d2f6e!important}
.ss-step-divider td:first-child{background:#e8eef9!important}
.ss-step-divider td.ss-col-step{background:#dbe4f5!important;font-weight:700;color:#0d2f6e}
.ss-step-label{font-size:9px;color:#0d2f6e;font-weight:700;letter-spacing:.5px;
  text-transform:uppercase;display:block;padding:1px 0 3px}
/* Source indicators for CP rows */
.ss-pfmea-row td{background:#f0fdf4}
.ss-pfmea-row td.ss-col-step{background:#dcfce7}
.ss-pfmea-row:hover td{background:#dcfce7!important}
.ss-custom-row td{background:#fefce8}
.ss-custom-row td.ss-col-step{background:#fef9c3}
.ss-cell[readonly],.ss-cell[disabled]{color:#6b7280;cursor:default}

/* SOD color coding */
.sod-1,.sod-2{background:#dcfce7!important;color:#166534;font-weight:700}
.sod-3,.sod-4{background:#fef9c3!important;color:#854d0e;font-weight:700}
.sod-5,.sod-6{background:#ffedd5!important;color:#9a3412;font-weight:700}
.sod-7,.sod-8{background:#fee2e2!important;color:#991b1b;font-weight:700}
.sod-9,.sod-10{background:#fecaca!important;color:#7f1d1d;font-weight:800}

/* RPN color coding */
.rpn-cell{text-align:center;font-weight:800;font-size:13px;min-width:52px;padding:0!important}
.rpn-ok{background:#dcfce7;color:#166534}
.rpn-low{background:#fef9c3;color:#854d0e}
.rpn-med{background:#ffedd5;color:#9a3412}
.rpn-hi{background:#fee2e2;color:#991b1b}
.rpn-crit{background:#dc2626;color:#fff}
.rpn-val{display:flex;align-items:center;justify-content:center;
  height:100%;min-height:32px;font-weight:800;font-size:13px}

/* Row actions */
.ss-row-actions{display:none;position:absolute;top:2px;right:2px;gap:2px;z-index:5;flex-direction:column}
.ss-table tr:hover .ss-row-actions{display:flex}
.ss-row-btn{padding:2px 4px;font-size:9px;border:1px solid #e2e8f0;background:#fff;
  border-radius:3px;cursor:pointer;color:#6b7280;line-height:1.2;white-space:nowrap}
.ss-row-btn:hover{background:#fee2e2;color:#dc2626;border-color:#fca5a5}
.ss-row-btn.dup:hover{background:#eff6ff;color:#0d2f6e;border-color:#bfdbfe}

/* Expand row indicator */
.ss-expand-hint{font-size:9px;color:#94a3b8;position:absolute;bottom:2px;right:2px}
.ss-table tr.ss-expanded .ss-expand-hint{display:none}

/* Add row button */
.ss-add-row{width:100%;padding:8px;border:none;border-top:2px dashed #e2e8f0;background:#f8fafc;
  color:#94a3b8;font-size:12px;cursor:pointer;text-align:center;transition:all .15s}
.ss-add-row:hover{border-top-color:#0d2f6e;color:#0d2f6e;background:#eff6ff}

/* Save indicator */
.ss-saving{position:fixed;bottom:16px;right:16px;background:#0d2f6e;color:#fff;
  padding:6px 14px;border-radius:20px;font-size:11px;z-index:999;opacity:0;
  transition:opacity .2s;pointer-events:none}
.ss-saving.show{opacity:1}

/* Misc */
.badge-status{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.part-header{background:#fff;border:1px solid var(--border);border-radius:10px;
  padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;
  justify-content:space-between;flex-wrap:wrap;gap:10px}
.grade-pill{background:#7c3aed22;color:#7c3aed;border:1px solid #7c3aed44;
  padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}
.sod-legend{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px}
.sod-legend span{padding:2px 8px;border-radius:4px;font-weight:600}
@media print{
  .no-print{display:none!important}
  .ss-table{font-size:8.5pt}
  .ss-table th{background:#1e3a5f!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ss-outer{overflow:visible!important;max-height:none!important}
  .ss-scroll{overflow:visible!important;max-height:none!important}
  body{margin:0;padding:6px}
}
</style>`;

// ── Dashboard ─────────────────────────────────────────────────────────
async function renderDashboard() {
  const [parts, cps] = await Promise.all([GET('/api/qms2/pfmea_parts'), GET('/api/qms2/cp_parts')]);
  _state.parts = parts; _state.cpParts = cps;
  const approved = cps.filter(c=>c.status==='Approved').length;

  setC(`${SS_STYLE}
  <div class="ph">
    <div>
      <h2 style="font-size:17px;font-weight:700;color:#0d2f6e">📋 Process Quality</h2>
      <p style="color:#6b7280;font-size:12px;margin:2px 0 0">PFMEA · Control Plans · Checksheets · IATF 16949</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p btn-sm" onclick="QMS2.renderNewPart()">+ New Part</button>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderGradeMaster()">⚗️ Grade Master</button>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderArchive()">🗄 Archive</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
    ${[['Parts','count',parts.length,'#0d2f6e'],['Control Plans','',cps.length,'#7c3aed'],
       ['Approved CPs','',approved,'#16a34a'],['Pending','',cps.length-approved,'#d97706']]
      .map(([l,,v,c])=>`<div class="card" style="padding:14px;border-left:3px solid ${c}">
        <div style="font-size:22px;font-weight:700;color:${c}">${v}</div>
        <div style="font-size:11px;color:#6b7280">${l}</div></div>`).join('')}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card">
      <div class="ch"><h5>Parts & PFMEA</h5>
        <button class="btn btn-p btn-xs" onclick="QMS2.renderNewPart()">+ New Part</button></div>
      <div style="padding:0">
        ${parts.length===0?'<p style="padding:16px;color:#9ca3af;font-size:12px">No parts yet.</p>':
          parts.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;
            padding:10px 14px;border-bottom:1px solid #f3f4f6">
            <div>
              <div style="font-weight:600;font-size:13px;color:#0d2f6e;font-family:monospace">${esc(p.partNumber)}</div>
              <div style="font-size:11px;color:#6b7280">${esc(p.partName)} · <span class="grade-pill">${esc(p.grade)}</span></div>
            </div>
            <div style="display:flex;gap:5px">
              <button class="btn btn-o btn-xs" onclick="QMS2.renderPfmea(${p.id})">PFMEA</button>
              <button class="btn btn-p btn-xs" onclick="QMS2.renderCpForPart(${p.id})">Control Plan</button>
            </div></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="ch"><h5>Control Plans</h5></div>
      <div style="padding:0">
        ${cps.length===0?'<p style="padding:16px;color:#9ca3af;font-size:12px">No control plans yet.</p>':
          cps.map(c=>`<div style="display:flex;align-items:center;justify-content:space-between;
            padding:10px 14px;border-bottom:1px solid #f3f4f6">
            <div>
              <div style="font-weight:600;font-size:12px;font-family:monospace;color:#0d2f6e">${esc(c.cpNumber)}</div>
              <div style="font-size:11px;color:#6b7280">${esc(c.partName)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="badge-status" style="background:${STATUS_COLOR[c.status]||'#6b7280'}22;
                color:${STATUS_COLOR[c.status]||'#6b7280'}">${c.status||'Draft'}</span>
              <button class="btn btn-o btn-xs" onclick="QMS2.renderCpView(${c.id})">View</button>
            </div></div>`).join('')}
      </div>
    </div>
  </div>`);
}

// ── New Part Form ─────────────────────────────────────────────────────
async function renderNewPart(editId) {
  const [grades, allParts] = await Promise.all([GET('/api/qms2/grades'), GET('/api/qms2/pfmea_parts')]);
  const ex = editId ? allParts.find(p=>p.id===editId) : null;

  setC(`${SS_STYLE}
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2>${ex?'Edit Part':'Register New Part'}</h2>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start">
    <div class="card">
      <div class="ch"><h5>Part Information</h5></div>
      <div style="padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div><label class="lbl">Part Number *</label>
          <input class="inp" id="np-pn" value="${esc(ex?.partNumber||'')}" placeholder="e.g. JL601008"></div>
        <div><label class="lbl">Part Name *</label>
          <input class="inp" id="np-name" value="${esc(ex?.partName||'')}" placeholder="e.g. Bracket LH"></div>
        <div><label class="lbl">Customer *</label>
          <input class="inp" id="np-cust" value="${esc(ex?.customer||'')}" placeholder="e.g. SAVWIPL"></div>
        <div><label class="lbl">Material Grade *</label>
          <select class="inp" id="np-grade" onchange="QMS2.showGrade()">
            <option value="">— Select —</option>
            ${GRADES.map(g=>`<option value="${g}" ${ex?.grade===g?'selected':''}>${g}</option>`).join('')}
            ${grades.filter(g=>!GRADES.includes(g.grade)).map(g=>`<option value="${g.grade}" ${ex?.grade===g.grade?'selected':''}>${g.grade}</option>`).join('')}
          </select></div>
        <div><label class="lbl">Drawing Number</label>
          <input class="inp" id="np-dwg" value="${esc(ex?.drawingNo||'')}" placeholder="Optional"></div>
        <div><label class="lbl">Machine</label>
          <select class="inp" id="np-machine">
            <option value="">— Select —</option>
            <option value="LK 280T" ${ex?.machine==='LK 280T'?'selected':''}>LK IMPRESS III 280T</option>
            <option value="LK 400T" ${ex?.machine==='LK 400T'?'selected':''}>LK IMPRESS III 400T</option>
          </select></div>
        <div style="grid-column:1/-1"><label class="lbl">Clone PFMEA from existing part</label>
          <select class="inp" id="np-clone">
            <option value="">— Start fresh from template —</option>
            ${allParts.filter(p=>p.id!==editId).map(p=>`<option value="${p.id}">${esc(p.partNumber)} — ${esc(p.partName)}</option>`).join('')}
          </select></div>
        <div style="grid-column:1/-1"><label class="lbl">Special Requirements</label>
          <textarea class="inp" id="np-spec" rows="2" placeholder="Customer-specific requirements...">${esc(ex?.specialReqs||'')}</textarea></div>
      </div>
      <div style="padding:0 18px 18px;display:flex;gap:8px">
        <button class="btn btn-p" onclick="QMS2.savePart(${editId||0})">
          ${ex?'Save Changes':'Create Part & Open PFMEA →'}</button>
        <button class="btn btn-o" onclick="QMS2.renderDashboard()">Cancel</button>
      </div>
    </div>
    <div id="grade-info" class="card" style="padding:14px;min-height:100px">
      <p style="color:#9ca3af;font-size:12px;text-align:center;padding:20px 0">Select a grade to see composition</p>
    </div>
  </div>`);
  if(ex?.grade) setTimeout(showGrade,50);
}

async function showGrade() {
  const grade = document.getElementById('np-grade')?.value;
  const el = document.getElementById('grade-info');
  if(!el) return;
  if(!grade){ el.innerHTML='<p style="color:#9ca3af;font-size:12px;text-align:center;padding:20px">Select a grade</p>'; return; }
  const grades = await GET('/api/qms2/grades');
  const g = grades.find(x=>x.grade===grade);
  if(!g){ el.innerHTML=`<p style="padding:12px;color:#9ca3af;font-size:12px">No data for ${grade}</p>`; return; }
  const comp = g.composition||{};
  el.innerHTML=`<div style="font-weight:700;color:#0d2f6e;margin-bottom:8px">${g.grade} — ${g.standard||''}</div>
    <table style="width:100%;font-size:11px;border-collapse:collapse">
      ${Object.entries(comp).map(([el,v])=>`<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:3px 5px;font-weight:600;width:35px">${el}</td>
        <td style="padding:3px 5px">${v}</td></tr>`).join('')}
    </table>
    <div style="margin-top:8px;font-size:11px;color:#374151">
      <div>🌡 Temp: <b>${g.metalTempRange||'—'}</b></div>
      <div>💪 Tensile: <b>${g.tensileStrength||'—'}</b></div>
    </div>`;
}

async function savePart(editId) {
  const pn = document.getElementById('np-pn')?.value?.trim();
  const name = document.getElementById('np-name')?.value?.trim();
  const cust = document.getElementById('np-cust')?.value?.trim();
  const grade = document.getElementById('np-grade')?.value;
  if(!pn||!name||!cust||!grade){ toast('Fill all required fields','d'); return; }
  const cloneFrom = parseInt(document.getElementById('np-clone')?.value)||0;
  const rec = { partNumber:pn, partName:name, customer:cust, grade,
    drawingNo:document.getElementById('np-dwg')?.value?.trim()||'',
    machine:document.getElementById('np-machine')?.value||'',
    specialReqs:document.getElementById('np-spec')?.value?.trim()||'',
    createdDate:today() };
  if(editId) rec.id = editId;
  const saved = await POST('/api/qms2/pfmea_parts', rec);
  if(!editId) {
    await _generatePfmeaRows(saved.id, grade, cloneFrom);
    toast('Part created — PFMEA ready ✅','s');
  } else { toast('Saved ✅','s'); }
  renderPfmea(saved.id);
}

async function _generatePfmeaRows(partId, grade, cloneFrom) {
  let rows = [];
  if(cloneFrom) {
    const src = await GET(`/api/qms2/pfmea_rows?partId=${cloneFrom}`);
    rows = src.map(r=>({...r,partId,id:undefined}));
  } else {
    const tmpl = await GET('/api/qms2/pfmea_templates');
    rows = tmpl.map(t=>({partId,processStep:t.processStep,
      function:t.function||'',failureMode:t.failureMode||'',
      failureEffect:t.failureEffect||'',severity:t.severity||5,
      failureCause:t.failureCause||'',occurrence:t.occurrence||3,
      currentControls:t.currentControls||'',detection:t.detection||3,
      rpn:0,recommendedAction:t.recommendedAction||'',
      responsibility:t.responsibility||'',targetDate:'',status:'Open'}));
  }
  for(const row of rows){
    const clean={...row}; delete clean.id;
    clean.rpn=rpn(clean.severity,clean.occurrence,clean.detection);
    await POST('/api/qms2/pfmea_rows',clean);
  }
}

// ── PFMEA Spreadsheet ─────────────────────────────────────────────────
async function renderPfmea(partId) {
  const [parts, rows] = await Promise.all([
    GET('/api/qms2/pfmea_parts'), GET(`/api/qms2/pfmea_rows?partId=${partId}`)]);
  const part = parts.find(p=>p.id===partId);
  if(!part){ toast('Part not found','d'); renderDashboard(); return; }
  _state.currentPartId = partId;
  _state.rows = rows;

  const hasCp = (await GET('/api/qms2/cp_parts')).some(c=>c.pfmeaPartId===partId);

  // Group rows by process step preserving order
  const grouped = {};
  STEPS.forEach(s=>{ grouped[s]=[]; });
  rows.forEach(r=>{ (grouped[r.processStep]||(grouped[r.processStep]=[])).push(r); });

  const pfmeaDocNum = `PFMEA-${part.partNumber}-REV-A`;
  setC(`${SS_STYLE}
  <div class="ss-saving" id="ss-saving-ind">Saving…</div>
  <div class="part-header">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
        <span style="font-family:monospace;font-weight:700;font-size:15px;color:#0d2f6e">${esc(part.partNumber)}</span>
        <span class="grade-pill">${esc(part.grade)}</span>
        <span style="font-family:monospace;font-size:11px;color:#6b7280;background:#f1f5f9;
          padding:2px 8px;border-radius:4px;border:1px solid #e2e8f0">${pfmeaDocNum}</span>
      </div>
      <div style="font-size:12px;color:#6b7280">${esc(part.partName)} · ${esc(part.customer)} · ${rows.length} failure modes</div>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn btn-o btn-sm no-print" onclick="QMS2.renderDashboard()">← Back</button>
      <button class="btn btn-o btn-sm no-print" onclick="QMS2.renderNewPart(${partId})">✏️ Edit</button>
      <button class="btn btn-o btn-sm no-print" onclick="QMS2.printPfmea(${partId})">🖨 Print</button>
      <button class="btn btn-o btn-sm no-print" onclick="QMS2._archivePart(${partId})">🗄 Archive</button>
      ${hasCp
        ?`<button class="btn btn-p btn-sm no-print" onclick="QMS2.renderCpForPart(${partId})">📄 Control Plan</button>`
        :`<button class="btn btn-p btn-sm no-print" onclick="QMS2.generateCP(${partId})">📄 Generate Control Plan →</button>`}
    </div>
  </div>

  <div style="font-size:11px;color:#6b7280;margin-bottom:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <span>💡 Click cell to edit · Tab = next · Enter = new row · Double-click = expand · Auto-save</span>
    <span style="display:flex;gap:5px;align-items:center">
      SOD:
      <span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:3px;font-weight:600">1–2</span>
      <span style="background:#fef9c3;color:#854d0e;padding:1px 6px;border-radius:3px;font-weight:600">3–4</span>
      <span style="background:#ffedd5;color:#9a3412;padding:1px 6px;border-radius:3px;font-weight:600">5–6</span>
      <span style="background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:3px;font-weight:600">7–8</span>
      <span style="background:#fecaca;color:#7f1d1d;padding:1px 6px;border-radius:3px;font-weight:600">9–10</span>
    </span>
    <span style="display:flex;gap:5px;align-items:center">
      RPN:
      <span class="rpn-ok" style="padding:1px 6px;border-radius:3px">&lt;25</span>
      <span class="rpn-low" style="padding:1px 6px;border-radius:3px">25–49</span>
      <span class="rpn-med" style="padding:1px 6px;border-radius:3px">50–99</span>
      <span class="rpn-hi" style="padding:1px 6px;border-radius:3px">100–199</span>
      <span class="rpn-crit" style="padding:1px 6px;border-radius:3px">≥200</span>
    </span>
  </div>

  ${mkDL('dl-reaction', DD.reactionPlan)}
  ${mkDL('dl-responsibility', DD.responsibility)}
  ${mkDL('dl-method', DD.detectionMethod)}
  ${mkDL('dl-frequency', DD.frequency)}

  <div class="ss-outer no-print-border">
    <div class="ss-scroll">
      <table class="ss-table" id="pfmea-table">
        <thead><tr>
          <th class="ss-rn" style="width:36px">#</th>
          <th style="min-width:70px;position:sticky;left:36px;z-index:5;background:#152d50">Op No.</th>
          <th class="ss-col-step" style="min-width:120px">Process Step</th>
          <th style="min-width:150px">Process Function</th>
          <th style="min-width:150px">Failure Mode</th>
          <th style="min-width:140px">Failure Effect</th>
          <th style="width:40px" title="Severity">S</th>
          <th style="min-width:150px">Failure Cause</th>
          <th style="width:40px" title="Occurrence">O</th>
          <th style="min-width:150px">Current Controls</th>
          <th style="width:40px" title="Detection">D</th>
          <th style="width:52px">RPN</th>
          <th style="min-width:150px">Recommended Action</th>
          <th style="min-width:110px">Responsibility</th>
          <th style="width:100px">Target Date</th>
          <th style="width:90px">Status</th>
          <th style="width:12px" class="no-print"></th>
        </tr></thead>
        <tbody id="pfmea-tbody">
          ${_renderPfmeaRows(rows)}
        </tbody>
      </table>
    </div>
    <button class="ss-add-row no-print" onclick="QMS2.pfmeaAddRow()">+ Add Row &nbsp;·&nbsp; Double-click any row to expand</button>
  </div>`);

  _bindPfmeaEvents();
}

function _renderPfmeaRows(rows) {
  if(!rows.length) return `<tr><td colspan="16" style="padding:24px;text-align:center;color:#9ca3af">
    No rows yet. Click "+ Add Row" below or press Enter on any row.</td></tr>`;
  let lastStep = null;
  return rows.map((row,i) => {
    const stepChanged = row.processStep !== lastStep;
    lastStep = row.processStep;
    return _renderPfmeaRow(row, i+1, stepChanged);
  }).join('');
}

function _renderPfmeaRow(row, num, stepChanged=false) {
  const r = rpn(row.severity, row.occurrence, row.detection);
  const sc = sodClass(row.severity), oc = sodClass(row.occurrence), dc = sodClass(row.detection);
  const rc = rpnClass(r);
  const id = row.id;
  const opNum = row.opNumber || stepToOp(row.processStep) || '';
  return `<tr data-id="${id}" data-part="${row.partId}" ondblclick="QMS2._expandRow(event,${id})" class="${stepChanged?'ss-step-divider':''}">
    <td class="ss-row-num-td">
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <span>${num}</span>
        <div class="ss-row-actions">
          <button class="ss-row-btn" title="Delete" onclick="event.stopPropagation();QMS2.pfmeaDelRow(${id})">✕</button>
          <button class="ss-row-btn dup" title="Duplicate" onclick="event.stopPropagation();QMS2.pfmeaDupRow(${id})">⧉</button>
          <button class="ss-row-btn" title="Move up" onclick="event.stopPropagation();QMS2._moveRow(${id},-1)">↑</button>
          <button class="ss-row-btn" title="Move down" onclick="event.stopPropagation();QMS2._moveRow(${id},1)">↓</button>
        </div>
      </div>
    </td>
    <td style="position:sticky;left:36px;z-index:2;background:#f1f5f9;min-width:70px;border-right:1px solid #e2e8f0">
      <input class="ss-cell" data-field="opNumber" data-id="${id}"
        value="${esc(opNum)}" placeholder="OP30"
        onblur="QMS2._cellBlur(this)"
        style="font-weight:700;color:#0d2f6e;font-size:12px;text-align:center">
    </td>
    <td class="ss-col-step">
      <select class="ss-cell" data-field="processStep" data-id="${id}" onchange="QMS2._cellChange(this)" style="font-size:11px;font-weight:600;color:#0d2f6e">
        ${DEFAULT_OPS.map(o=>`<option value="${o.step}" ${row.processStep===o.step?'selected':''}>${o.step}</option>`).join('')}
      </select>
    </td>
    <td style="min-width:150px"><textarea class="ss-cell" data-field="function" data-id="${id}" rows="1"
      onblur="QMS2._cellBlur(this)" oninput="QMS2._autoResize(this)" onkeydown="QMS2._cellKey(event,this)">${esc(row.function||'')}</textarea></td>
    <td style="min-width:150px"><textarea class="ss-cell" data-field="failureMode" data-id="${id}" rows="1"
      onblur="QMS2._cellBlur(this)" oninput="QMS2._autoResize(this)" onkeydown="QMS2._cellKey(event,this)"
      style="color:#dc2626;font-weight:500">${esc(row.failureMode||'')}</textarea></td>
    <td style="min-width:140px"><textarea class="ss-cell" data-field="failureEffect" data-id="${id}" rows="1"
      onblur="QMS2._cellBlur(this)" oninput="QMS2._autoResize(this)" onkeydown="QMS2._cellKey(event,this)">${esc(row.failureEffect||'')}</textarea></td>
    <td style="width:40px" class="${sc}">
      <input class="ss-cell ss-num" type="number" min="1" max="10" data-field="severity"
        data-id="${id}" value="${row.severity||5}" onblur="QMS2._cellBlur(this)"
        oninput="QMS2._updateRpn(this)" style="background:transparent"></td>
    <td style="min-width:150px"><textarea class="ss-cell" data-field="failureCause" data-id="${id}" rows="1"
      onblur="QMS2._cellBlur(this)" oninput="QMS2._autoResize(this)" onkeydown="QMS2._cellKey(event,this)">${esc(row.failureCause||'')}</textarea></td>
    <td style="width:40px" class="${oc}">
      <input class="ss-cell ss-num" type="number" min="1" max="10" data-field="occurrence"
        data-id="${id}" value="${row.occurrence||3}" onblur="QMS2._cellBlur(this)"
        oninput="QMS2._updateRpn(this)" style="background:transparent"></td>
    <td style="min-width:150px"><textarea class="ss-cell" data-field="currentControls" data-id="${id}" rows="1"
      onblur="QMS2._cellBlur(this)" oninput="QMS2._autoResize(this)" onkeydown="QMS2._cellKey(event,this)">${esc(row.currentControls||'')}</textarea></td>
    <td style="width:40px" class="${dc}">
      <input class="ss-cell ss-num" type="number" min="1" max="10" data-field="detection"
        data-id="${id}" value="${row.detection||3}" onblur="QMS2._cellBlur(this)"
        oninput="QMS2._updateRpn(this)" style="background:transparent"></td>
    <td class="rpn-cell ${rc}" id="rpn-${id}" style="width:52px">
      <div class="rpn-val">${r}</div></td>
    <td style="min-width:150px">
      <input class="ss-cell" data-field="recommendedAction" data-id="${id}"
        list="dl-reaction" value="${esc(row.recommendedAction||'')}"
        onblur="QMS2._cellBlur(this)" placeholder="Action…"></td>
    <td style="min-width:110px">
      <input class="ss-cell" data-field="responsibility" data-id="${id}"
        list="dl-responsibility" value="${esc(row.responsibility||'')}"
        onblur="QMS2._cellBlur(this)" placeholder="Owner…"></td>
    <td style="width:100px">
      <input class="ss-cell" type="date" data-field="targetDate" data-id="${id}"
        value="${row.targetDate||''}" onblur="QMS2._cellBlur(this)"
        style="font-size:11px;padding:5px 4px"></td>
    <td style="width:90px">
      <select class="ss-cell" data-field="status" data-id="${id}" onchange="QMS2._cellChange(this)" style="font-size:11px">
        ${['Open','In Progress','Closed','On Hold'].map(s=>`<option ${row.status===s?'selected':''}>${s}</option>`).join('')}
      </select></td>
    <td class="no-print" style="width:12px"></td>
  </tr>`;
}

function _bindPfmeaEvents() {
  // Auto-resize all textareas on load
  document.querySelectorAll('#pfmea-tbody textarea.ss-cell').forEach(t=>_autoResize(t));
}

function _autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(32, el.scrollHeight) + 'px';
}

function _cellBlur(el) {
  const id = parseInt(el.dataset.id);
  const field = el.dataset.field;
  const val = el.value;
  _schedSave(id, field, val);
}

function _cellChange(el) {
  const id = parseInt(el.dataset.id);
  const field = el.dataset.field;
  _schedSave(id, field, el.value);
}

function _updateRpn(el) {
  const id = parseInt(el.dataset.id);
  const row = el.closest('tr');
  const s = parseInt(row.querySelector('[data-field="severity"]')?.value)||1;
  const o = parseInt(row.querySelector('[data-field="occurrence"]')?.value)||1;
  const d = parseInt(row.querySelector('[data-field="detection"]')?.value)||1;
  const r = s*o*d;
  // Update SOD cell colors
  const sTd = row.querySelector('[data-field="severity"]')?.parentElement;
  const oTd = row.querySelector('[data-field="occurrence"]')?.parentElement;
  const dTd = row.querySelector('[data-field="detection"]')?.parentElement;
  ['sod-1','sod-2','sod-3','sod-4','sod-5','sod-6','sod-7','sod-8','sod-9','sod-10'].forEach(c=>{
    sTd?.classList.remove(c); oTd?.classList.remove(c); dTd?.classList.remove(c);
  });
  sodClass(s).split(' ').forEach(c=>sTd?.classList.add(c));
  sodClass(o).split(' ').forEach(c=>oTd?.classList.add(c));
  sodClass(d).split(' ').forEach(c=>dTd?.classList.add(c));
  // Update RPN cell
  const rpnCell = document.getElementById(`rpn-${id}`);
  if(rpnCell){
    rpnCell.className = `rpn-cell ${rpnClass(r)}`;
    const val = rpnCell.querySelector('.rpn-val');
    if(val) val.textContent = r;
  }
  _schedSave(id, el.dataset.field, el.value);
  _schedSave(id, 'rpn', r);
}

function _expandRow(e, id) {
  // Don't expand if clicking a cell directly
  if(e.target.closest('.ss-cell,.ss-row-btn')) return;
  const tr = document.querySelector(`#pfmea-tbody tr[data-id="${id}"]`);
  if(!tr) return;
  const isExp = tr.classList.toggle('ss-expanded');
  tr.querySelectorAll('textarea.ss-cell').forEach(t=>{
    if(isExp){ t.style.minHeight='80px'; _autoResize(t); }
    else{ t.style.minHeight=''; t.style.height='auto'; _autoResize(t); }
  });
}

async function _moveRow(id, dir) {
  const tbody = document.getElementById('pfmea-tbody');
  const rows = [...tbody.querySelectorAll('tr[data-id]')];
  const idx = rows.findIndex(r=>parseInt(r.dataset.id)===id);
  const target = rows[idx+dir];
  if(!target) return;
  if(dir===-1) tbody.insertBefore(rows[idx], target);
  else tbody.insertBefore(target, rows[idx]);
  // Renumber
  tbody.querySelectorAll('tr[data-id]').forEach((tr,i)=>{
    const num = tr.querySelector('.ss-row-num-td span');
    if(num) num.textContent = i+1;
  });
}

function _cellKey(e, el) {
  if(e.key==='Tab') { e.preventDefault(); _tabNext(el, e.shiftKey); }
  if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); _enterNext(el); }
}

function _tabNext(el, reverse) {
  const cells = [...document.querySelectorAll('#pfmea-tbody .ss-cell')];
  const idx = cells.indexOf(el);
  if(idx===-1) return;
  const next = cells[reverse ? idx-1 : idx+1];
  if(next){ next.focus(); if(next.select) next.select(); }
}

function _enterNext(el) {
  const row = el.closest('tr');
  const nextRow = row?.nextElementSibling;
  if(nextRow){
    const firstCell = nextRow.querySelector('.ss-cell');
    if(firstCell){ firstCell.focus(); return; }
  }
  // Last row — add new row
  pfmeaAddRow();
}

// Batch save with debounce
const _pendingSaves = {};
function _schedSave(id, field, val) {
  if(!_pendingSaves[id]) _pendingSaves[id] = {};
  _pendingSaves[id][field] = val;
  _showSaving();
  clearTimeout(_state.saveTimer);
  _state.saveTimer = setTimeout(_flushSaves, 800);
}

async function _flushSaves() {
  for(const [id, changes] of Object.entries(_pendingSaves)){
    delete _pendingSaves[id];
    // Get current row data from server
    const rows = await GET(`/api/qms2/pfmea_rows?partId=${_state.currentPartId}`);
    const row = rows.find(r=>r.id===parseInt(id));
    if(!row) continue;
    const updated = {...row, ...changes, id:parseInt(id)};
    updated.rpn = rpn(updated.severity, updated.occurrence, updated.detection);
    await POST('/api/qms2/pfmea_rows', updated);
  }
  _hideSaving();
  // Mark linked control plans as outdated
  if(S.currentPartId) await _markCpsOutdated(S.currentPartId);
}

function _showSaving() {
  const el = document.getElementById('ss-saving-ind');
  if(el) el.classList.add('show');
}
function _hideSaving() {
  const el = document.getElementById('ss-saving-ind');
  if(el) el.classList.remove('show');
}

async function pfmeaAddRow(step) {
  const partId = _state.currentPartId;
  if(!partId) return;
  const rec = {
    partId, opNumber: step?stepToOp(step):'OP10', processStep: step||STEPS[0],
    function:'', failureMode:'', failureEffect:'',
    severity:5, failureCause:'', occurrence:3,
    currentControls:'', detection:3, rpn:75,
    recommendedAction:'', responsibility:'', targetDate:'', status:'Open'
  };
  const saved = await POST('/api/qms2/pfmea_rows', rec);
  const tbody = document.getElementById('pfmea-tbody');
  if(!tbody) return;
  // Remove "no rows" placeholder
  if(tbody.querySelector('td[colspan]')) tbody.innerHTML='';
  const num = tbody.querySelectorAll('tr').length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = _renderPfmeaRow({...rec, id:saved.id}, num);
  tbody.appendChild(tr);
  // Focus first cell of new row
  setTimeout(()=>{
    const cells = tr.querySelectorAll('.ss-cell');
    if(cells[0]) cells[0].focus();
  },50);
}

async function pfmeaDelRow(id) {
  if(!confirm('Delete this PFMEA row?')) return;
  await DEL(`/api/qms2/pfmea_rows/${id}`);
  const tr = document.querySelector(`#pfmea-tbody tr[data-id="${id}"]`);
  if(tr) tr.remove();
  // Renumber
  document.querySelectorAll('#pfmea-tbody tr').forEach((tr,i)=>{
    const td = tr.querySelector('.ss-row-num-td');
    if(td) td.childNodes[0].textContent = i+1;
  });
  toast('Row deleted','d');
}

async function pfmeaDupRow(id) {
  const rows = await GET(`/api/qms2/pfmea_rows?partId=${_state.currentPartId}`);
  const row = rows.find(r=>r.id===id);
  if(!row) return;
  const {id:_,...clean} = row;
  const saved = await POST('/api/qms2/pfmea_rows', clean);
  const tbody = document.getElementById('pfmea-tbody');
  const num = tbody.querySelectorAll('tr').length+1;
  const tr = document.createElement('tr');
  tr.innerHTML = _renderPfmeaRow({...clean,id:saved.id},num);
  tbody.appendChild(tr);
  toast('Row duplicated','s');
}

// ── Impact Analysis ──────────────────────────────────────────────────────────
async function showImpactDialog(partId, onNewRev, onKeep) {
  const impact = await GET(`/api/qms2/impact/${partId}`);
  const modal = document.createElement('div');
  modal.id = 'impact-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  const cps = impact.cpDetails||[];
  modal.innerHTML = `<div style="background:#fff;border-radius:12px;width:100%;max-width:500px;box-shadow:0 20px 60px #0004">
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb">
      <div style="font-size:16px;font-weight:700;color:#d97706;margin-bottom:4px">⚠️ PFMEA has changed</div>
      <div style="font-size:13px;color:#374151">This change will affect the following documents:</div>
    </div>
    <div style="padding:16px 20px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:#7c3aed11;border:1px solid #7c3aed33;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#7c3aed">${impact.controlPlans}</div>
          <div style="font-size:11px;color:#6b7280">Control Plans</div></div>
        <div style="background:#0d2f6e11;border:1px solid #0d2f6e33;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#0d2f6e">${impact.characteristics}</div>
          <div style="font-size:11px;color:#6b7280">Characteristics</div></div>
        <div style="background:#16a34a11;border:1px solid #16a34a33;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#16a34a">${impact.checksheets}</div>
          <div style="font-size:11px;color:#6b7280">Check Sheets</div></div>
        <div style="background:#d9770611;border:1px solid #d9770633;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#d97706">${impact.reactionPlans}</div>
          <div style="font-size:11px;color:#6b7280">Reaction Plans</div></div>
      </div>
      ${cps.map(c=>`<div style="font-size:12px;padding:3px 0">📄 <b>${c.cpNumber}</b> — Rev ${c.revision} — ${c.status}</div>`).join('')}
      <div style="margin-top:12px;font-size:12px;color:#6b7280">Generating a new revision creates a new Control Plan and marks existing as Obsolete.</div>
    </div>
    <div style="padding:0 20px 16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p" id="imp-gen">📄 Generate New Revision</button>
      <button class="btn btn-o" id="imp-keep">Keep Existing</button>
      <button class="btn btn-o" id="imp-cancel">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#imp-gen').onclick = () => { modal.remove(); onNewRev(); };
  modal.querySelector('#imp-keep').onclick = () => { modal.remove(); onKeep(); };
  modal.querySelector('#imp-cancel').onclick = () => modal.remove();
}

async function _markCpsOutdated(partId) {
  const cps = await GET('/api/qms2/cp_parts');
  for(const cp of cps.filter(c=>c.pfmeaPartId===partId&&c.status!=='Archived'&&c.status!=='Obsolete')){
    if(!cp.pfmeaOutdated) await POST('/api/qms2/cp_parts', {...cp, pfmeaOutdated:true});
  }
}

// ── Generate Control Plan from PFMEA ──────────────────────────────────
async function generateCP(partId, forceNewRev=false) {
  const [parts, cps, pfRows, grades] = await Promise.all([
    GET('/api/qms2/pfmea_parts'), GET('/api/qms2/cp_parts'),
    GET(`/api/qms2/pfmea_rows?partId=${partId}`), GET('/api/qms2/grades')]);
  const part = parts.find(p=>p.id===partId);
  if(!part){ toast('Part not found','d'); return; }

  const existing = cps.find(c=>c.pfmeaPartId===partId && c.status!=='Archived' && c.status!=='Obsolete');

  // If CP exists and not forcing new rev, just open it
  if(existing && !forceNewRev){ renderCpView(existing.id); return; }

  // If forcing new rev, mark old CP as Obsolete
  if(existing && forceNewRev){
    await POST('/api/qms2/cp_parts', {...existing, status:'Obsolete'});
  }

  const prevRev = existing?.revision || '';
  const newRev = prevRev ? (REVS[REVS.indexOf(prevRev)+1] || 'Z') : 'A';
  const gradeData = grades.find(g=>g.grade===part.grade);
  const comp = gradeData?.composition||{};
  const compStr = Object.entries(comp).map(([el,v])=>`${el}: ${v}`).join(', ');

  const cp = await POST('/api/qms2/cp_parts', {
    partNumber:part.partNumber, partName:part.partName,
    customer:part.customer, grade:part.grade,
    drawingNo:part.drawingNo||'', machine:part.machine||'',
    specialReqs:part.specialReqs||'', pfmeaPartId:partId,
    pfmeaRev:newRev, cpNumber:`CP-${part.partNumber}-REV-${newRev}`,
    revision:newRev, status:'Draft', archived:false, pfmeaOutdated:false,
    preparedBy:Auth?.user?.name||'', approvedBy:'',
    createdDate:today(), approvedDate:'',
    colourCode:gradeData?.colourCode||'',
    incomingCriteria:gradeData?.incomingCriteria||''
  });

  // Sort PFMEA rows by opNumber then id
  pfRows.sort((a,b)=>(a.opNumber||'').localeCompare(b.opNumber||'')||(a.id-b.id));

  const opCounters = {};
  let order = 1;

  for(const r of pfRows){
    const opNum = r.opNumber || stepToOp(r.processStep) || 'OP10';
    opCounters[opNum] = (opCounters[opNum]||0)+1;
    const charNum = `${opNum}.${String(opCounters[opNum]).padStart(2,'0')}`;

    let spec = r.preventionControls || r.currentControls || '';
    // Auto-fill grade composition for incoming inspection
    if(opNum==='OP10' && r.function?.toLowerCase().includes('compos') && compStr) spec = compStr;
    if(opNum==='OP10' && r.function?.toLowerCase().includes('grade') && gradeData)
      spec = `${gradeData.grade} per ${gradeData.standard||'grade spec'}`;

    await POST('/api/qms2/cp_rows', {
      cpId:cp.id, partId,
      opNumber:opNum, processStep:r.processStep,
      machine:part.machine||'',
      charNumber:charNum,
      charName:r.function||r.failureMode||'',
      charType:'process', classification:'',
      specification:spec, tolerance:'',
      method:r.detectionControls||r.currentControls||'Visual',
      gauge:'', sampleSize:'1',
      frequency:'Per Control Plan',
      controlMethod:r.preventionControls||r.currentControls||'',
      reactionPlan:r.recommendedAction||'',
      remarks:'',
      source:'pfmea', pfmeaRowId:r.id, pfmeaRpn:r.rpn||0,
      order:order++, imageId:null
    });
  }

  await POST('/api/qms2/cp_revisions', {
    cpId:cp.id, revision:newRev, date:today(),
    changedBy:Auth?.user?.name||'',
    summary:`Generated from PFMEA Rev ${newRev} — ${pfRows.length} characteristics`
  });

  toast(`Control Plan Rev ${newRev} generated ✅`, 's');
  renderCpView(cp.id);
}


async function renderCpForPart(partId){
  const cps = await GET('/api/qms2/cp_parts');
  const active = cps.find(c=>c.pfmeaPartId===partId && c.status!=='Archived' && c.status!=='Obsolete');
  if(!active){ generateCP(partId); return; }
  if(active.pfmeaOutdated){
    showImpactDialog(partId,
      () => generateCP(partId, true),
      () => renderCpView(active.id)
    );
    return;
  }
  renderCpView(active.id);
}

// ── renderCpView alias ──────────────────────────────────────────────────
const renderCP = (cpId) => renderCpView(cpId);

// ── Control Plans List View ─────────────────────────────────────────────
async function renderCpList() {
  const [parts, cps] = await Promise.all([GET('/api/qms2/pfmea_parts'), GET('/api/qms2/cp_parts')]);
  const active = cps.filter(c => c.status !== 'Archived' && c.status !== 'Obsolete');
  setC(`${SS_STYLE}
  <div class="ph">
    <div>
      <h2 style="font-size:17px;font-weight:700;color:#0d2f6e">📄 Control Plans</h2>
      <p style="color:#6b7280;font-size:12px;margin:2px 0 0">${active.length} active control plan${active.length!==1?'s':''}</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()">← Dashboard</button>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderArchive()">🗄 Archive</button>
    </div>
  </div>
  <div class="card" style="padding:0">
    ${active.length===0 ? '<p style="padding:16px;color:#9ca3af;font-size:12px">No control plans yet. Create one from the Dashboard via a Part.</p>' :
      `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#1e3a5f;color:#fff">
          <th style="padding:9px 14px;text-align:left">CP Number</th>
          <th style="padding:9px 14px;text-align:left">Part</th>
          <th style="padding:9px 14px;text-align:left">Customer</th>
          <th style="padding:9px 14px;text-align:left">Rev</th>
          <th style="padding:9px 14px;text-align:left">Status</th>
          <th style="padding:9px 14px;text-align:left">Actions</th>
        </tr></thead>
        <tbody>
          ${active.map(c=>`<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:9px 14px;font-family:monospace;font-weight:600;color:#0d2f6e">${esc(c.cpNumber)}</td>
            <td style="padding:9px 14px">${esc(c.partName)}</td>
            <td style="padding:9px 14px;color:#6b7280">${esc(c.customer||'—')}</td>
            <td style="padding:9px 14px;color:#6b7280">${esc(c.revision||'—')}</td>
            <td style="padding:9px 14px"><span class="badge-status" style="background:${STATUS_COLOR[c.status]||'#6b7280'}22;color:${STATUS_COLOR[c.status]||'#6b7280'}">${c.status||'Draft'}</span></td>
            <td style="padding:9px 14px;display:flex;gap:5px">
              <button class="btn btn-o btn-xs" onclick="QMS2.renderCpView(${c.id})">View</button>
              <button class="btn btn-p btn-xs" onclick="QMS2.renderChecksheets(${c.id})">📋 Checksheets</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`}
  </div>`);
}

// ── Control Plan Spreadsheet View ──────────────────────────────────────
async function renderCpView(cpId) {
  const [cps, chars, revs] = await Promise.all([
    GET('/api/qms2/cp_parts'),
    GET(`/api/qms2/cp_rows?cpId=${cpId}`),
    GET(`/api/qms2/cp_revisions?cpId=${cpId}`)
  ]);
  const cp = cps.find(c=>c.id===cpId);
  if(!cp){ toast('CP not found','d'); return; }
  S.currentCpId = cpId;
  const isApproved = cp.status === 'Approved';

  // Sort chars by opNumber then charNumber
  chars.sort((a,b)=>(a.opNumber||'').localeCompare(b.opNumber||'') ||
    (a.charNumber||'').localeCompare(b.charNumber||''));

  setC(`${SS_STYLE}
  ${mkDL('dl-meth', DD.detectionMethod)}${mkDL('dl-freq', DD.frequency)}${mkDL('dl-react', DD.reactionPlan)}
  <div class="ss-saving" id="ss-saving-ind">Saving…</div>
  <div class="part-header">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
        <span style="font-family:monospace;font-weight:700;font-size:14px;color:#0d2f6e">${esc(cp.cpNumber)}</span>
        <span class="q2-badge" style="background:${STATUS_COLOR[cp.status]||'#6b7280'}22;color:${STATUS_COLOR[cp.status]||'#6b7280'}">${cp.status||'Draft'}</span>
        <span class="grade-pill">${esc(cp.grade)}</span>
        ${cp.pfmeaOutdated ? '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">⚠️ PFMEA updated</span>' : ''}
      </div>
      <div style="font-size:12px;color:#6b7280">${esc(cp.partName)} · ${esc(cp.customer)} · Rev ${cp.revision} · ${chars.length} characteristics</div>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn btn-o btn-sm no-print" onclick="QMS2.renderDashboard()">← Back</button>
      <button class="btn btn-o btn-sm no-print" onclick="QMS2.renderPfmea(${cp.pfmeaPartId})">📋 PFMEA</button>
      ${!isApproved ? `<button class="btn btn-o btn-sm no-print" onclick="QMS2.cpAddRow()">+ Row</button>
        <button class="btn btn-o btn-sm no-print" onclick="QMS2.refreshCpFromPfmea(${cpId})">🔄 Sync PFMEA</button>` : ''}
      <button class="btn btn-o btn-sm no-print" onclick="QMS2.printCP(${cpId})">🖨 Print All</button>
      <button class="btn btn-o btn-sm no-print" onclick="QMS2._printSelectOp(${cpId})">🖨 Print by Op</button>
      ${!isApproved ? `<button class="btn btn-w btn-sm no-print" onclick="QMS2.submitCP(${cpId})">📤 Submit</button>` : ''}
      ${cp.status==='Under Review'&&Auth?.user?.role==='APPROVER' ? `<button class="btn btn-g btn-sm no-print" onclick="QMS2.approveCP(${cpId})">✓ Approve</button>` : ''}
      ${isApproved ? `<button class="btn btn-o btn-sm no-print" onclick="QMS2.newCPRev(${cpId})">🔄 New Rev</button>
        <button class="btn btn-p btn-sm no-print" onclick="QMS2.renderChecksheets(${cpId})">📋 Checksheets</button>` : ''}
      <button class="btn btn-o btn-sm no-print" onclick="QMS2._archiveCP(${cpId})">🗄 Archive</button>
    </div>
  </div>

  ${cp.pfmeaOutdated ? `<div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:10px;padding:12px 14px;margin-bottom:12px">
    ⚠️ <b>PFMEA has been updated</b> since this Control Plan was generated.
    <button class="btn btn-p btn-sm" style="margin-left:8px" onclick="QMS2.renderCpForPart(${cp.pfmeaPartId})">View Impact & Update</button>
  </div>` : ''}

  <div style="display:grid;grid-template-columns:1fr 220px;gap:14px;align-items:start">
    <div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
        💡 Click cell · Tab/Enter navigate · Auto-save
        ${isApproved ? ' · <span style="color:#16a34a;font-weight:600">APPROVED — locked</span>' : ''}
        &nbsp;|&nbsp;<span style="background:#f0fdf4;padding:1px 5px;border-radius:3px;font-size:10px">From PFMEA</span>
        <span style="background:#fefce8;padding:1px 5px;border-radius:3px;font-size:10px">Custom</span>
      </div>
      <div class="ss-outer">
        <div class="ss-scroll">
          <table class="ss-table" id="cp-tbl">
            <thead><tr>
              <th class="ss-rn">#</th>
              <th style="min-width:70px;position:sticky;left:36px;z-index:5;background:#152d50">Op No.</th>
              <th class="ss-col-step">Process</th>
              <th style="min-width:100px">Machine</th>
              <th style="min-width:80px">Char No.</th>
              <th style="min-width:140px">Characteristic</th>
              <th style="width:90px">Classification</th>
              <th style="min-width:130px">Specification</th>
              <th style="min-width:80px">Tolerance</th>
              <th style="min-width:100px">Method</th>
              <th style="min-width:80px">Gauge</th>
              <th style="width:60px">Sample</th>
              <th style="min-width:90px">Frequency</th>
              <th style="min-width:120px">Control Method</th>
              <th style="min-width:130px">Reaction Plan</th>
              <th style="min-width:80px">Remarks</th>
              <th class="no-print" style="width:10px"></th>
            </tr></thead>
            <tbody id="cp-body">${_renderCpRows(chars, isApproved)}</tbody>
          </table>
        </div>
        ${!isApproved ? `<button class="ss-add-row no-print" onclick="QMS2.cpAddRow()">+ Add Characteristic</button>` : ''}
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:12px">
        <div class="ch"><h5>Control Plan Info</h5></div>
        <div style="padding:10px 12px;font-size:12px">
          ${[['CP No.',cp.cpNumber],['Part No.',cp.partNumber],['Part Name',cp.partName],
             ['Customer',cp.customer],['Grade',cp.grade],
             ['Colour Code',cp.colourCode||'—'],['Machine',cp.machine||'—'],
             ['Prepared by',cp.preparedBy||'—'],['Date',fmtDate(cp.createdDate)],
             ['Approved by',cp.approvedBy||'—'],['Approval Date',fmtDate(cp.approvedDate)]]
            .map(([k,val])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f3f4f6">
              <span style="color:#6b7280;font-size:11px">${k}</span>
              <span style="font-weight:500;text-align:right;max-width:120px;word-break:break-all;font-size:11px">${esc(val)}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="ch"><h5>Revision History</h5></div>
        <div style="padding:0">
          ${revs.map(r=>`<div style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11.5px">
            <div style="display:flex;justify-content:space-between">
              <b>Rev ${esc(r.revision)}</b><span style="color:#6b7280">${fmtDate(r.date)}</span>
            </div>
            <div style="color:#6b7280">${esc(r.changedBy)}</div>
            <div>${esc(r.summary)}</div>
          </div>`).join('') || '<p style="padding:12px;color:#9ca3af;font-size:12px">No revisions.</p>'}
        </div>
      </div>
    </div>
  </div>`);
  setTimeout(()=>document.querySelectorAll('#cp-body textarea.ss-cell').forEach(_autoResize), 50);
}

function _renderCpRows(chars, locked) {
  if(!chars.length) return `<tr><td colspan="17" style="padding:24px;text-align:center;color:#9ca3af">
    No characteristics. Generate from PFMEA or add manually.</td></tr>`;
  let lastOp = null;
  return chars.map((c,i)=>{
    const opChanged = c.opNumber !== lastOp;
    lastOp = c.opNumber;
    return _renderCpRow(c, i+1, locked, opChanged);
  }).join('');
}

function _renderCpRow(c, num, locked, opDiv=false) {
  const id = c.id;
  const srcStyle = c.source==='pfmea' ? 'background:#f0fdf4' : c.source==='custom' ? 'background:#fefce8' : '';
  return `<tr data-id="${id}" class="${opDiv?'ss-step-divider':''}" style="${srcStyle}">
  <td class="ss-row-num-td">
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span>${num}</span>
      ${!locked ? `<div class="ss-row-actions">
        <button class="ss-row-btn" onclick="QMS2.cpDelRow(${id})">✕</button>
        <button class="ss-row-btn dup" onclick="QMS2.cpDupRow(${id})">⧉</button>
        <button class="ss-row-btn" onclick="QMS2._cpMov(${id},-1)">↑</button>
        <button class="ss-row-btn" onclick="QMS2._cpMov(${id},1)">↓</button>
      </div>` : ''}
    </div>
  </td>
  <td style="position:sticky;left:36px;z-index:2;background:${opDiv?'#dbe4f5':'#f1f5f9'};min-width:70px;border-right:1px solid #e2e8f0">
    <input class="ss-cell" data-field="opNumber" data-id="${id}"
      value="${esc(c.opNumber||'')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"
      style="font-weight:700;color:#0d2f6e;font-size:11px;text-align:center"></td>
  <td class="ss-col-step">
    <select class="ss-cell" data-field="processStep" data-id="${id}"
      ${locked?'disabled':''} onchange="QMS2._cpCellChange(this)"
      style="font-size:11px;font-weight:600;color:#0d2f6e">
      ${DEFAULT_OPS.map(o=>`<option value="${o.step}" ${c.processStep===o.step?'selected':''}>${o.step}</option>`).join('')}
    </select></td>
  <td><input class="ss-cell" data-field="machine" data-id="${id}"
    value="${esc(c.machine||'')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"
    placeholder="Machine / Tool"></td>
  <td><input class="ss-cell" data-field="charNumber" data-id="${id}"
    value="${esc(c.charNumber||'')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"
    placeholder="OP10.01"
    style="font-family:monospace;font-weight:700;color:#0d2f6e;font-size:11px"></td>
  <td style="min-width:140px"><textarea class="ss-cell" data-field="charName" data-id="${id}" rows="1"
    ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)" oninput="QMS2._autoResize(this)"
    onkeydown="QMS2._cpCellKey(event,this)">${esc(c.charName||'')}</textarea></td>
  <td><select class="ss-cell" data-field="classification" data-id="${id}"
    ${locked?'disabled':''} onchange="QMS2._cpCellChange(this)" style="font-size:11px">
    ${['','Critical','Special','Major','Minor'].map(cls=>`<option ${c.classification===cls?'selected':''}>${cls}</option>`).join('')}
  </select></td>
  <td style="min-width:130px"><textarea class="ss-cell" data-field="specification" data-id="${id}" rows="1"
    ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)" oninput="QMS2._autoResize(this)"
    onkeydown="QMS2._cpCellKey(event,this)">${esc(c.specification||'')}</textarea></td>
  <td><input class="ss-cell" data-field="tolerance" data-id="${id}"
    value="${esc(c.tolerance||'')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"
    placeholder="±0.05"></td>
  <td><input class="ss-cell" data-field="method" data-id="${id}" list="dl-meth"
    value="${esc(c.method||'')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"></td>
  <td><input class="ss-cell" data-field="gauge" data-id="${id}"
    value="${esc(c.gauge||'')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"
    placeholder="Gauge / Instrument"></td>
  <td><input class="ss-cell" data-field="sampleSize" data-id="${id}"
    value="${esc(c.sampleSize||'1')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"
    style="text-align:center"></td>
  <td><input class="ss-cell" data-field="frequency" data-id="${id}" list="dl-freq"
    value="${esc(c.frequency||'')}" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)"></td>
  <td style="min-width:120px"><textarea class="ss-cell" data-field="controlMethod" data-id="${id}" rows="1"
    ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)" oninput="QMS2._autoResize(this)"
    onkeydown="QMS2._cpCellKey(event,this)">${esc(c.controlMethod||c.reaction||'')}</textarea></td>
  <td style="min-width:130px"><textarea class="ss-cell" data-field="reactionPlan" data-id="${id}" rows="1"
    list="dl-react" ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)" oninput="QMS2._autoResize(this)"
    onkeydown="QMS2._cpCellKey(event,this)">${esc(c.reactionPlan||c.reaction||'')}</textarea></td>
  <td><textarea class="ss-cell" data-field="remarks" data-id="${id}" rows="1"
    ${locked?'readonly':''} onblur="QMS2._cpCellBlur(this)" oninput="QMS2._autoResize(this)"
    onkeydown="QMS2._cpCellKey(event,this)">${esc(c.remarks||'')}</textarea></td>
  <td class="no-print" style="width:10px"></td>
  </tr>`;
}

// ── CP row CRUD ──────────────────────────────────────────────────────
async function _cpMov(id,dir){
  const tbody=document.getElementById('cp-body');
  const rows=[...tbody.querySelectorAll('tr[data-id]')];
  const idx=rows.findIndex(r=>+r.dataset.id===id);
  const tgt=rows[idx+dir]; if(!tgt) return;
  dir===-1?tbody.insertBefore(rows[idx],tgt):tbody.insertBefore(tgt,rows[idx]);
  tbody.querySelectorAll('tr[data-id]').forEach((tr,i)=>{
    const td=tr.querySelector('.ss-row-num-td span');
    if(td) td.textContent=i+1;
  });
}

function _printSelectOp(cpId){
  GET('/api/qms2/cp_rows?cpId='+cpId).then(chars=>{
    const ops=[...new Set(chars.map(c=>c.opNumber).filter(Boolean))].sort();
    const modal=document.createElement('div');
    modal.style.cssText='position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML=`<div style="background:#fff;border-radius:12px;padding:20px;min-width:280px">
      <div style="font-weight:700;font-size:14px;color:#0d2f6e;margin-bottom:12px">Print Selected Operation</div>
      <select id="op-sel" class="inp" style="margin-bottom:12px">
        <option value="">All Operations</option>
        ${ops.map(o=>`<option value="${o}">${o}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px">
        <button class="btn btn-p" id="op-ok">Print</button>
        <button class="btn btn-o" id="op-cancel">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#op-ok').onclick=()=>{
      const op=document.getElementById('op-sel').value;
      modal.remove(); QMS2.printCP(cpId,op);
    };
    modal.querySelector('#op-cancel').onclick=()=>modal.remove();
  });
}

async function _archiveCP(cpId){
  if(!confirm('Archive this Control Plan? It will be hidden from the main view but can be restored.')) return;
  const cps=await GET('/api/qms2/cp_parts');
  const cp=cps.find(c=>c.id===cpId);
  await POST('/api/qms2/cp_parts',{...cp,archived:true,status:'Archived'});
  const cs=await GET(`/api/qms2/cs_records?cpId=${cpId}`);
  for(const s of cs) await POST('/api/qms2/cs_records',{...s,archived:true});
  toast('Archived','s'); renderDashboard();
}

// ── Archive View ──────────────────────────────────────────────────────
async function renderArchive(){
  const [parts,cps]=await Promise.all([GET('/api/qms2/pfmea_parts'),GET('/api/qms2/cp_parts')]);
  const arParts=parts.filter(p=>p.archived);
  const arCps=cps.filter(c=>c.archived||c.status==='Archived'||c.status==='Obsolete');
  setC(`${SS_STYLE}
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2>Archive</h2>
      <p style="font-size:12px;color:#6b7280">Archived and obsolete documents — can be restored</p>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card">
      <div class="ch"><h5>Archived Parts (${arParts.length})</h5></div>
      <div style="padding:0">
        ${!arParts.length?'<p style="padding:16px;color:#9ca3af;font-size:12px">No archived parts.</p>':
          arParts.map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f3f4f6">
            <div>
              <div style="font-weight:600;font-family:monospace;color:#6b7280">${esc(p.partNumber)}</div>
              <div style="font-size:11px;color:#9ca3af">${esc(p.partName)}</div>
            </div>
            <div style="display:flex;gap:5px">
              <button class="btn btn-xs btn-o" onclick="QMS2._restorePart(${p.id})">Restore</button>
              <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626"
                onclick="QMS2._permDeletePart(${p.id})">Delete</button>
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="ch"><h5>Archived / Obsolete Control Plans (${arCps.length})</h5></div>
      <div style="padding:0">
        ${!arCps.length?'<p style="padding:16px;color:#9ca3af;font-size:12px">No archived control plans.</p>':
          arCps.map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f3f4f6">
            <div>
              <div style="font-weight:600;font-family:monospace;color:#6b7280">${esc(c.cpNumber)}</div>
              <div style="font-size:11px;color:#9ca3af">${c.status}</div>
            </div>
            <div style="display:flex;gap:5px">
              ${c.status==='Archived'?`<button class="btn btn-xs btn-o" onclick="QMS2._restoreCP(${c.id})">Restore</button>`:''}
              <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626"
                onclick="QMS2._permDeleteCP(${c.id})">Delete</button>
            </div>
          </div>`).join('')}
      </div>
    </div>
  </div>`);
}

async function _restorePart(id){
  const parts=await GET('/api/qms2/pfmea_parts');
  const p=parts.find(x=>x.id===id);
  await POST('/api/qms2/pfmea_parts',{...p,archived:false});
  toast('Restored','s'); renderArchive();
}
async function _restoreCP(id){
  const cps=await GET('/api/qms2/cp_parts');
  const c=cps.find(x=>x.id===id);
  await POST('/api/qms2/cp_parts',{...c,archived:false,status:'Draft'});
  toast('Restored','s'); renderArchive();
}
async function _permDeletePart(id){
  if(!confirm('PERMANENTLY delete? Cannot be undone.')) return;
  const rows=await GET(`/api/qms2/pfmea_rows?partId=${id}`);
  for(const r of rows) await DEL(`/api/qms2/pfmea_rows/${r.id}`);
  await DEL(`/api/qms2/pfmea_parts/${id}`);
  toast('Permanently deleted','d'); renderArchive();
}
async function _permDeleteCP(id){
  if(!confirm('PERMANENTLY delete? Cannot be undone.')) return;
  const rows=await GET(`/api/qms2/cp_rows?cpId=${id}`);
  for(const r of rows) await DEL(`/api/qms2/cp_rows/${r.id}`);
  const revs=await GET(`/api/qms2/cp_revisions?cpId=${id}`);
  for(const r of revs) await DEL(`/api/qms2/cp_revisions/${r.id}`);
  await DEL(`/api/qms2/cp_parts/${id}`);
  toast('Permanently deleted','d'); renderArchive();
}



// ── Checksheets ───────────────────────────────────────────────────────
async function renderChecksheets(cpId){
  if(!cpId){
    const cps=await GET('/api/qms2/cp_parts');
    const approved=cps.filter(c=>c.status==='Approved');
    setC(`${SS_STYLE}
    <div class="ph">
      <div><h2>Checksheets</h2>
        <p style="font-size:12px;color:#6b7280">Select an approved Control Plan</p>
      </div>
    </div>
    <div class="card"><div style="padding:0">
      ${approved.length===0
        ?'<p style="padding:20px;color:#9ca3af">No approved Control Plans yet.</p>'
        :approved.map(c=>`<div style="display:flex;align-items:center;justify-content:space-between;
          padding:12px 16px;border-bottom:1px solid #f3f4f6">
          <div>
            <div style="font-weight:600;font-size:13px;font-family:monospace;color:#0d2f6e">${esc(c.cpNumber)}</div>
            <div style="font-size:11px;color:#6b7280">${esc(c.partName)} · ${esc(c.customer)}</div>
          </div>
          <button class="btn btn-p btn-sm" onclick="QMS2.renderChecksheets(${c.id})">Open →</button>
        </div>`).join('')}
    </div></div>`);
    return;
  }

  const [cps, chars, records] = await Promise.all([
    GET('/api/qms2/cp_parts'), GET(`/api/qms2/cp_rows?cpId=${cpId}`),
    GET(`/api/qms2/cs_records?cpId=${cpId}`)]);
  const cp=cps.find(c=>c.id===cpId);
  if(!cp){ toast('CP not found','d'); return; }

  const IPS_STEPS=['Melting','Die Casting','Machining'];
  const FIS_STEPS=['Final Inspection'];
  const PCL_STEPS=['Packing & Dispatch'];
  const ips=chars.filter(c=>IPS_STEPS.includes(c.processStep));
  const fis=chars.filter(c=>FIS_STEPS.includes(c.processStep));
  const pcl=chars.filter(c=>PCL_STEPS.includes(c.processStep));

  setC(`${SS_STYLE}
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderCP(${cpId})" style="margin-bottom:6px">← Back to CP</button>
      <h2>Checksheets — ${esc(cp.partNumber)}</h2>
      <p style="font-size:12px;color:#6b7280">${esc(cp.cpNumber)} Rev ${cp.revision}</p>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
    ${[['📋 In-Process Inspection','IPS',ips.length,`IPS-${cp.partNumber}-REV-${cp.revision}`,'#0d2f6e'],
       ['🔍 Final Inspection','FIS',fis.length,`FIS-${cp.partNumber}-REV-${cp.revision}`,'#16a34a'],
       ['📦 Packing Checklist','PCL',pcl.length,`PCL-${cp.partNumber}-REV-${cp.revision}`,'#7c3aed']]
      .map(([title,type,count,docNum,color])=>`
      <div class="card" style="border-top:3px solid ${color}">
        <div style="padding:14px">
          <div style="font-weight:700;font-size:14px;margin-bottom:3px">${title}</div>
          <div style="font-family:monospace;font-size:11px;color:${color};margin-bottom:6px">${docNum}</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:10px">${count} characteristics</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-p btn-sm" onclick="QMS2.fillCS('${type}',${cpId})">📝 Fill</button>
            <button class="btn btn-o btn-sm" onclick="QMS2.printCS('${type}',${cpId})">🖨 Print Blank</button>
          </div>
        </div>
      </div>`).join('')}
  </div>
  <div class="card">
    <div class="ch"><h5>Filled Records (${records.length})</h5></div>
    <div style="padding:0">
      ${records.length===0?'<p style="padding:16px;color:#9ca3af;font-size:12px">No records yet.</p>':
        `<table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f8fafc">
            ${['Type','Date','Shift','Lot No.','Operator','OK','NG',''].map(h=>
              `<th style="padding:8px 10px;text-align:left;font-weight:600">${h}</th>`).join('')}
          </tr></thead><tbody>
          ${records.map(r=>{
            const ok=(r.results||[]).filter(x=>x.result==='OK').length;
            const ng=(r.results||[]).filter(x=>x.result==='NG').length;
            return `<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:8px 10px"><span class="badge-status" style="background:#7c3aed22;color:#7c3aed">${r.type}</span></td>
              <td style="padding:8px 10px">${fmtDate(r.date)}</td>
              <td style="padding:8px 10px">${esc(r.shift||'—')}</td>
              <td style="padding:8px 10px">${esc(r.lotNumber||'—')}</td>
              <td style="padding:8px 10px">${esc(r.operator||'—')}</td>
              <td style="padding:8px 10px;color:#16a34a;font-weight:600">${ok}</td>
              <td style="padding:8px 10px;color:#dc2626;font-weight:600">${ng}</td>
              <td style="padding:8px 10px">
                <button class="btn btn-xs btn-o" onclick="QMS2.viewCSRecord(${r.id},${cpId})">View</button>
                <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626"
                  onclick="QMS2.delCSRecord(${r.id},${cpId})">✕</button>
              </td>
            </tr>`;}).join('')}
          </tbody></table>`}
    </div>
  </div>`);
}

async function fillCS(type,cpId){
  const [cps,chars]=await Promise.all([GET('/api/qms2/cp_parts'),GET(`/api/qms2/cp_rows?cpId=${cpId}`)]);
  const cp=cps.find(c=>c.id===cpId);
  const stepMap={IPS:['Melting','Die Casting','Machining'],FIS:['Final Inspection'],PCL:['Packing & Dispatch']};
  const labels={IPS:'In-Process Inspection Sheet',FIS:'Final Inspection Sheet',PCL:'Packing Checklist'};
  const filtered=chars.filter(c=>stepMap[type].includes(c.processStep));

  const modal=document.createElement('div');
  modal.id='cs-modal';
  modal.style.cssText='position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  modal.innerHTML=`
  <div style="background:#fff;border-radius:12px;width:100%;max-width:900px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px #0004">
    <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1">
      <div>
        <div style="font-weight:700;font-size:14px;color:#0d2f6e">${labels[type]}</div>
        <div style="font-size:11px;color:#6b7280">${esc(cp?.partNumber)} — ${esc(cp?.partName)}</div>
      </div>
      <button onclick="document.getElementById('cs-modal').remove()"
        style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">✕</button>
    </div>
    <div style="padding:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border-bottom:1px solid #f3f4f6">
      <div><label class="lbl">Date</label><input class="inp" id="cs-date" type="date" value="${today()}"></div>
      <div><label class="lbl">Shift</label>
        <select class="inp" id="cs-shift"><option>A</option><option>B</option><option>C</option></select></div>
      <div><label class="lbl">Lot Number</label><input class="inp" id="cs-lot" placeholder="LOT-2026-001"></div>
      <div><label class="lbl">${type==='PCL'?'Packed by':'Operator'}</label>
        <input class="inp" id="cs-operator" placeholder="Name"></div>
      <div><label class="lbl">Inspector</label><input class="inp" id="cs-inspector" placeholder="Name"></div>
      ${type==='IPS'?`<div><label class="lbl">Machine</label>
        <select class="inp" id="cs-machine"><option>LK 280T</option><option>LK 400T</option></select></div>`
        :`<div><label class="lbl">Quantity</label><input class="inp" id="cs-qty" type="number"></div>`}
    </div>
    <div style="padding:14px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#1e3a5f;color:#fff">
          <th style="padding:7px 8px;width:30px">#</th>
          <th style="padding:7px 8px">Characteristic</th>
          <th style="padding:7px 8px">Specification</th>
          <th style="padding:7px 8px;width:120px">Actual Value</th>
          <th style="padding:7px 8px;width:80px;text-align:center">Result</th>
        </tr></thead>
        <tbody>
          ${filtered.map((c,i)=>`<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:7px 8px;color:#94a3b8">${i+1}</td>
            <td style="padding:7px 8px;font-weight:500">${esc(c.charName)}</td>
            <td style="padding:7px 8px;color:#6b7280;font-size:11px">${esc(c.specification)}${c.tolerance?' / '+esc(c.tolerance):''}</td>
            <td style="padding:4px 6px"><input style="width:100%;padding:5px 7px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px"
              id="cs-val-${c.id}" placeholder="Enter value"
              oninput="document.getElementById('cs-res-${c.id}').value=this.value?'OK':'OK'"></td>
            <td style="padding:4px 6px;text-align:center">
              <select id="cs-res-${c.id}" style="padding:4px 6px;border:1px solid #e2e8f0;border-radius:4px;font-size:11px">
                <option value="OK">✓ OK</option>
                <option value="NG">✗ NG</option>
                <option value="NA">N/A</option>
              </select></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:0 14px 14px;display:flex;gap:8px">
      <button class="btn btn-p" onclick="QMS2.saveCS('${type}',${cpId},[${filtered.map(c=>c.id).join(',')}])">💾 Save Record</button>
      <button class="btn btn-o" onclick="document.getElementById('cs-modal').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function saveCS(type,cpId,charIds){
  const chars=await GET(`/api/qms2/cp_rows?cpId=${cpId}`);
  const results=charIds.map(id=>{
    const c=chars.find(x=>x.id===id)||{};
    return{charId:id,charName:c.charName||'',spec:c.specification||'',
      actual:document.getElementById(`cs-val-${id}`)?.value||'',
      result:document.getElementById(`cs-res-${id}`)?.value||'OK'};
  });
  await POST('/api/qms2/cs_records',{
    cpId,type,date:document.getElementById('cs-date')?.value||today(),
    shift:document.getElementById('cs-shift')?.value||'A',
    lotNumber:document.getElementById('cs-lot')?.value||'',
    operator:document.getElementById('cs-operator')?.value||'',
    inspector:document.getElementById('cs-inspector')?.value||'',
    machine:document.getElementById('cs-machine')?.value||'',
    quantity:document.getElementById('cs-qty')?.value||'',
    results
  });
  document.getElementById('cs-modal')?.remove();
  toast('Checksheet saved ✅','s');
  renderChecksheets(cpId);
}

async function viewCSRecord(recId,cpId){
  const recs=await GET('/api/qms2/cs_records');
  const rec=recs.find(r=>r.id===recId);
  if(!rec) return;
  const ok=(rec.results||[]).filter(r=>r.result==='OK').length;
  const ng=(rec.results||[]).filter(r=>r.result==='NG').length;

  const modal=document.createElement('div');
  modal.id='cs-view-modal';
  modal.style.cssText='position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML=`
  <div style="background:#fff;border-radius:12px;width:100%;max-width:700px;max-height:90vh;overflow-y:auto">
    <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
      <div style="font-weight:700;color:#0d2f6e">${rec.type} Record — ${fmtDate(rec.date)}</div>
      <button onclick="document.getElementById('cs-view-modal').remove()"
        style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:14px;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;border-bottom:1px solid #f3f4f6">
      <div>Shift: <b>${rec.shift}</b></div>
      <div>Lot: <b>${esc(rec.lotNumber||'—')}</b></div>
      <div>Operator: <b>${esc(rec.operator||'—')}</b></div>
      <div>Inspector: <b>${esc(rec.inspector||'—')}</b></div>
      <div style="color:#16a34a">OK: <b>${ok}</b></div>
      <div style="color:#dc2626">NG: <b>${ng}</b></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:7px 10px">#</th>
        <th style="padding:7px 10px">Characteristic</th>
        <th style="padding:7px 10px">Spec</th>
        <th style="padding:7px 10px">Actual</th>
        <th style="padding:7px 10px;text-align:center">Result</th>
      </tr></thead>
      <tbody>
        ${(rec.results||[]).map((r,i)=>`<tr style="border-bottom:1px solid #f3f4f6;background:${r.result==='NG'?'#fff7f7':'#fff'}">
          <td style="padding:6px 10px;color:#94a3b8">${i+1}</td>
          <td style="padding:6px 10px">${esc(r.charName)}</td>
          <td style="padding:6px 10px;color:#6b7280;font-size:11px">${esc(r.spec)}</td>
          <td style="padding:6px 10px;font-weight:500">${esc(r.actual||'—')}</td>
          <td style="padding:6px 10px;text-align:center;font-weight:700;
            color:${r.result==='OK'?'#16a34a':r.result==='NG'?'#dc2626':'#6b7280'}">${r.result}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="padding:12px 14px">
      <button class="btn btn-o" onclick="document.getElementById('cs-view-modal').remove()">Close</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function delCSRecord(recId,cpId){
  if(!confirm('Delete this record?')) return;
  await DEL(`/api/qms2/cs_records/${recId}`);
  toast('Deleted','d'); renderChecksheets(cpId);
}

// ── Print Functions ───────────────────────────────────────────────────
async function printPfmea(partId){
  const [parts,rows]=await Promise.all([GET('/api/qms2/pfmea_parts'),GET(`/api/qms2/pfmea_rows?partId=${partId}`)]);
  const part=parts.find(p=>p.id===partId);
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>PFMEA — ${part?.partNumber}</title>
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:8.5pt;color:#000}
  @page{size:A3 landscape;margin:10mm 12mm}
  table{width:100%;border-collapse:collapse}
  th{background:#1e3a5f;color:#fff;padding:5px 5px;font-size:8pt;border:1px solid #2d5078}
  td{border:1px solid #ccc;padding:4px 5px;vertical-align:top}
  .hdr{display:flex;align-items:center;justify-content:space-between;
    border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px}
  .rpn-hi{background:#dc262618;color:#dc2626;font-weight:700}
  .rpn-med{background:#d9770618;color:#d97706;font-weight:700}
  .rpn-ok{background:#16a34a18;color:#16a34a;font-weight:700}
  tr:nth-child(even) td{background:#f8fafc}
  .no-print{display:none}
  @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="position:fixed;top:8px;right:8px;padding:6px 14px;
    background:#1e3a5f;color:#fff;border:none;border-radius:5px;cursor:pointer">🖨 Print</button>
  <div class="hdr">
    <div>
      <div style="font-weight:700;font-size:10pt;color:#1e3a5f;letter-spacing:1px">V R ALUCAST</div>
      <div style="font-size:14pt;font-weight:700">PROCESS FAILURE MODE &amp; EFFECTS ANALYSIS</div>
      <div style="font-size:8pt;color:#555">PFMEA — ${esc(part?.partNumber)} — ${esc(part?.partName)}</div>
    </div>
    <table style="width:280px;font-size:8pt;border:1px solid #ccc">
      <tr><td style="background:#f1f5f9"><b>Part Number</b></td><td>${esc(part?.partNumber)}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Part Name</b></td><td>${esc(part?.partName)}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Customer</b></td><td>${esc(part?.customer)}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Grade</b></td><td>${esc(part?.grade)}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Date</b></td><td>${today()}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Total Rows</b></td><td>${rows.length}</td></tr>
    </table>
  </div>
  <table>
    <thead><tr>
      <th style="width:25px">#</th>
      <th style="width:95px">Process Step</th>
      <th style="min-width:110px">Function</th>
      <th style="min-width:100px">Failure Mode</th>
      <th style="min-width:100px">Effect</th>
      <th style="width:22px">S</th>
      <th style="min-width:100px">Cause</th>
      <th style="width:22px">O</th>
      <th style="min-width:110px">Current Controls</th>
      <th style="width:22px">D</th>
      <th style="width:38px">RPN</th>
      <th style="min-width:110px">Recommended Action</th>
      <th style="min-width:80px">Responsibility</th>
      <th style="width:70px">Target Date</th>
      <th style="width:60px">Status</th>
    </tr></thead>
    <tbody>
      ${rows.map((row,i)=>{
        const r=rpn(row.severity,row.occurrence,row.detection);
        const rc=r>=200?'rpn-hi':r>=100?'rpn-med':'rpn-ok';
        return `<tr>
          <td style="text-align:center;color:#94a3b8">${i+1}</td>
          <td>${esc(row.processStep)}</td>
          <td>${esc(row.function)}</td>
          <td style="color:#dc2626;font-weight:500">${esc(row.failureMode)}</td>
          <td>${esc(row.failureEffect)}</td>
          <td style="text-align:center;font-weight:700">${row.severity}</td>
          <td>${esc(row.failureCause)}</td>
          <td style="text-align:center;font-weight:700">${row.occurrence}</td>
          <td>${esc(row.currentControls)}</td>
          <td style="text-align:center;font-weight:700">${row.detection}</td>
          <td class="${rc}" style="text-align:center">${r}</td>
          <td>${esc(row.recommendedAction)}</td>
          <td>${esc(row.responsibility)}</td>
          <td>${esc(row.targetDate)}</td>
          <td>${esc(row.status)}</td>
        </tr>`;}).join('')}
    </tbody>
  </table>
  <div style="margin-top:16px;font-size:8pt;color:#555;display:flex;justify-content:space-between">
    <span>V R ALUCAST — CONFIDENTIAL</span>
    <span>RPN ≥200 Critical · ≥100 High · ≥50 Medium</span>
    <span>Printed: ${new Date().toLocaleDateString('en-IN')}</span>
  </div>
  </body></html>`);
  w.document.close();
}

async function printCP(cpId, opFilter){
  const [cps,allChars,revs]=await Promise.all([
    GET('/api/qms2/cp_parts'),GET(`/api/qms2/cp_rows?cpId=${cpId}`),
    GET(`/api/qms2/cp_revisions?cpId=${cpId}`)]);
  const cp=cps.find(c=>c.id===cpId);
  if(!cp) return;
  const chars = opFilter ? allChars.filter(r=>r.opNumber===opFilter) : allChars;
  chars.sort((a,b)=>(a.opNumber||'').localeCompare(b.opNumber||'')||(a.charNumber||'').localeCompare(b.charNumber||''));
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${cp.cpNumber}${opFilter?' '+opFilter:''}</title>
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:9pt;color:#000}
  @page{size:A3 landscape;margin:10mm 12mm}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}
  th{background:#1e3a5f;color:#fff;padding:5px 7px;font-size:8.5pt;border:1px solid #2d5078}
  td{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
  .hdr{display:flex;align-items:center;justify-content:space-between;
    border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px}
  tr:nth-child(even) td{background:#f8fafc}
  .custom td{background:#fffbeb!important}
  @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="position:fixed;top:8px;right:8px;padding:6px 14px;
    background:#1e3a5f;color:#fff;border:none;border-radius:5px;cursor:pointer">🖨 Print</button>
  <div class="hdr">
    <div>
      <div style="font-weight:700;font-size:10pt;color:#1e3a5f;letter-spacing:1px">V R ALUCAST</div>
      <div style="font-size:14pt;font-weight:700">CONTROL PLAN</div>
      <div style="font-size:8pt;color:#555">Doc: ${esc(cp.cpNumber)} · Rev: ${cp.revision} · Status: ${cp.status}</div>
    </div>
    <table style="width:300px;font-size:8.5pt;border:1px solid #ccc">
      <tr><td style="background:#f1f5f9"><b>Part No.</b></td><td>${esc(cp.partNumber)}</td>
          <td style="background:#f1f5f9"><b>Customer</b></td><td>${esc(cp.customer)}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Part Name</b></td><td colspan="3">${esc(cp.partName)}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Grade</b></td><td>${esc(cp.grade)}</td>
          <td style="background:#f1f5f9"><b>Prepared by</b></td><td>${esc(cp.preparedBy)}</td></tr>
      <tr><td style="background:#f1f5f9"><b>Approved by</b></td><td>${esc(cp.approvedBy||'—')}</td>
          <td style="background:#f1f5f9"><b>Date</b></td><td>${esc(cp.approvedDate||cp.createdDate)}</td></tr>
    </table>
  </div>
  <table>
    <thead><tr>
      <th style="width:25px">#</th>
      <th style="width:110px">Process Step</th>
      <th style="min-width:130px">Characteristic</th>
      <th style="width:65px">Type</th>
      <th style="min-width:120px">Specification</th>
      <th style="width:80px">Tolerance</th>
      <th style="min-width:110px">Inspection Method</th>
      <th style="min-width:90px">Frequency</th>
      <th style="min-width:120px">Reaction Plan</th>
    </tr></thead>
    <tbody>
      ${chars.map((c,i)=>`<tr ${c.source==='custom'?'class="custom"':''}>
        <td style="text-align:center;color:#94a3b8">${i+1}</td>
        <td>${esc(c.processStep)}</td>
        <td>${c.source==='custom'?'★ ':''} ${esc(c.charName)}</td>
        <td style="text-align:center;font-size:8pt">${esc(c.charType||'process')}</td>
        <td>${esc(c.specification)}</td>
        <td>${esc(c.tolerance||'—')}</td>
        <td>${esc(c.method)}</td>
        <td>${esc(c.frequency)}</td>
        <td>${esc(c.reaction)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-bottom:8px">
    <div style="font-size:8.5pt;font-weight:700;color:#1e3a5f;margin-bottom:5px">REVISION HISTORY</div>
    <table style="font-size:8pt">
      <thead><tr><th>Rev</th><th>Date</th><th>Changed by</th><th>Summary</th></tr></thead>
      <tbody>${revs.map(r=>`<tr><td>${r.revision}</td><td>${r.date}</td>
        <td>${esc(r.changedBy)}</td><td>${esc(r.summary)}</td></tr>`).join('')}</tbody>
    </table>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;margin-top:20px;text-align:center;font-size:8.5pt">
    ${['Prepared by','Reviewed by','Approved by'].map(r=>`<div>
      <div style="border-top:1px solid #000;padding-top:4px">${r}</div>
      <div style="color:#555;margin-top:20px;font-size:7.5pt">Name / Signature / Date</div>
    </div>`).join('')}
  </div>
  </body></html>`);
  w.document.close();
}

async function printCS(type,cpId){
  const [cps,chars]=await Promise.all([GET('/api/qms2/cp_parts'),GET(`/api/qms2/cp_rows?cpId=${cpId}`)]);
  const cp=cps.find(c=>c.id===cpId);
  const stepMap={IPS:['Melting','Die Casting','Machining'],FIS:['Final Inspection'],PCL:['Packing & Dispatch']};
  const labels={IPS:'IN-PROCESS INSPECTION SHEET',FIS:'FINAL INSPECTION SHEET',PCL:'PACKING CHECKLIST'};
  const filtered=chars.filter(c=>stepMap[type].includes(c.processStep));
  const docNum=`${type}-${cp?.partNumber}-REV-${cp?.revision}`;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${docNum}</title>
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:9pt}
  @page{size:A4 landscape;margin:10mm 12mm}
  table{width:100%;border-collapse:collapse}
  th{background:#1e3a5f;color:#fff;padding:5px 7px;border:1px solid #2d5078}
  td{border:1px solid #ccc;padding:5px 7px;vertical-align:middle}
  .field-box{border-bottom:1px solid #000;min-height:22px;margin:2px 0}
  .field-lbl{font-size:7.5pt;color:#555}
  @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="position:fixed;top:8px;right:8px;padding:6px 14px;
    background:#1e3a5f;color:#fff;border:none;border-radius:5px;cursor:pointer">🖨 Print</button>
  <div style="text-align:center;border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px">
    <div style="font-weight:700;font-size:9pt;letter-spacing:1px">V R ALUCAST</div>
    <div style="font-size:14pt;font-weight:700">${labels[type]}</div>
    <div style="font-size:8pt">Doc No: <b>${docNum}</b></div>
  </div>
  <table style="margin-bottom:10px;font-size:8.5pt">
    <tr>
      <td style="width:16%"><div class="field-lbl">Part Number</div><div class="field-box">${cp?.partNumber}</div></td>
      <td style="width:20%"><div class="field-lbl">Part Name</div><div class="field-box">${cp?.partName}</div></td>
      <td style="width:14%"><div class="field-lbl">Date</div><div class="field-box"></div></td>
      <td style="width:12%"><div class="field-lbl">Shift</div><div class="field-box"></div></td>
      <td style="width:16%"><div class="field-lbl">Lot Number</div><div class="field-box"></div></td>
      <td style="width:22%"><div class="field-lbl">${type==='IPS'?'Machine':'Customer'}</div><div class="field-box">${type==='IPS'?'':esc(cp?.customer||'')}</div></td>
    </tr>
    <tr>
      <td colspan="2"><div class="field-lbl">Operator</div><div class="field-box"></div></td>
      <td colspan="2"><div class="field-lbl">Inspector</div><div class="field-box"></div></td>
      <td colspan="2"><div class="field-lbl">Quantity</div><div class="field-box"></div></td>
    </tr>
  </table>
  <table>
    <thead><tr>
      <th style="width:28px">#</th>
      <th style="min-width:140px">Characteristic</th>
      <th style="min-width:120px">Specification / Tolerance</th>
      <th style="min-width:100px">Method</th>
      <th style="min-width:80px">Frequency</th>
      <th style="width:90px">Actual Value</th>
      <th style="width:60px;text-align:center">Result</th>
      <th style="width:80px">Remarks</th>
    </tr></thead>
    <tbody>
      ${filtered.map((c,i)=>`<tr>
        <td style="text-align:center;color:#94a3b8">${i+1}</td>
        <td>${esc(c.charName)}</td>
        <td>${esc(c.specification)}${c.tolerance?' / '+esc(c.tolerance):''}</td>
        <td>${esc(c.method)}</td>
        <td>${esc(c.frequency)}</td>
        <td>&nbsp;</td>
        <td style="text-align:center">&nbsp;</td>
        <td>&nbsp;</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;margin-top:20px;text-align:center;font-size:8.5pt">
    ${['Inspector','Supervisor','QC Manager'].map(r=>`<div>
      <div style="border-top:1px solid #000;padding-top:4px">${r}</div>
    </div>`).join('')}
  </div>
  </body></html>`);
  w.document.close();
}

// ── Archive Part ─────────────────────────────────────────────────────
async function _archivePart(partId){
  if(!confirm('Archive this part? It will be hidden from main view but can be restored.')) return;
  const parts = await GET('/api/qms2/pfmea_parts');
  const part = parts.find(p=>p.id===partId);
  await POST('/api/qms2/pfmea_parts', {...part, archived:true});
  const cps = await GET('/api/qms2/cp_parts');
  for(const cp of cps.filter(c=>c.pfmeaPartId===partId)){
    await POST('/api/qms2/cp_parts', {...cp, archived:true, status:'Archived'});
  }
  toast('Archived','s'); renderDashboard();
}

// ── Grade Master ──────────────────────────────────────────────────────
async function renderGradeMaster(){
  const grades=await GET('/api/qms2/grades');
  setC(`${SS_STYLE}
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2>Grade Master</h2>
      <p style="font-size:12px;color:#6b7280">Material compositions and acceptance criteria — used for auto-population in Control Plans</p>
    </div>
    <button class="btn btn-p btn-sm" onclick="QMS2.showGradeForm()">+ Add Grade</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
    ${grades.map(g=>{
      const comp=g.composition||{};
      return `<div class="card">
        <div class="ch" style="background:#f8fafc">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;font-size:15px;color:#0d2f6e">${esc(g.grade)}</span>
            <span style="font-size:11px;color:#6b7280">${esc(g.standard||'')}</span>
          </div>
          <div style="display:flex;gap:5px">
            <button class="btn btn-xs btn-o" onclick="QMS2.showGradeForm(${g.id})">✏️ Edit</button>
            <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626"
              onclick="QMS2.deleteGrade(${g.id})">✕</button>
          </div>
        </div>
        <div style="padding:12px">
          <table style="width:100%;font-size:11.5px;border-collapse:collapse;margin-bottom:10px">
            <tr style="background:#f1f5f9">
              <th style="padding:4px 6px;text-align:left">Element</th>
              <th style="padding:4px 6px;text-align:right">Range / Limit</th>
            </tr>
            ${Object.entries(comp).map(([el,v])=>`<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:3px 6px;font-weight:600">${esc(el)}</td>
              <td style="padding:3px 6px;text-align:right">${esc(v)}</td>
            </tr>`).join('')}
          </table>
          <div style="font-size:11px;display:grid;gap:4px;color:#374151">
            <div>🌡 Metal Temp: <b>${esc(g.metalTempRange||'—')}</b></div>
            <div>💪 Tensile Strength: <b>${esc(g.tensileStrength||'—')}</b></div>
            <div>⚙️ Hardness: <b>${esc(g.hardness||'—')}</b></div>
            <div>📏 Melting Range: <b>${esc(g.meltingRange||'—')}</b></div>
            <div style="margin-top:4px;color:#6b7280;font-size:10.5px">${esc(g.acceptanceCriteria||'')}</div>
          </div>
        </div>
      </div>`;}).join('')||'<p style="padding:20px;color:#9ca3af">No grades yet. Click + Add Grade.</p>'}
  </div>`);
}

async function showGradeForm(editId){
  const grades = editId ? await GET('/api/qms2/grades') : [];
  const g = editId ? grades.find(x=>x.id===editId) : null;
  const comp = g?.composition || {Si:'',Cu:'',Mg:'',Zn:'',Fe:'',Mn:'',Ni:'',Sn:'',Al:'Balance'};
  const elements = ['Si','Cu','Mg','Zn','Fe','Mn','Ni','Sn','Pb','Al'];

  const modal = document.createElement('div');
  modal.id = 'grade-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  modal.innerHTML = `
  <div style="background:#fff;border-radius:12px;width:100%;max-width:700px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px #0004">
    <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1">
      <h4 style="font-size:15px;font-weight:700;color:#0d2f6e">${editId?'Edit Grade':'Add New Grade'}</h4>
      <button onclick="document.getElementById('grade-modal').remove()"
        style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">✕</button>
    </div>
    <div style="padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><label class="lbl">Grade Name *</label>
        <input class="inp" id="gf-grade" value="${esc(g?.grade||'')}" placeholder="e.g. ADC12"></div>
      <div><label class="lbl">Standard</label>
        <input class="inp" id="gf-standard" value="${esc(g?.standard||'')}" placeholder="e.g. JIS H 5302"></div>
      <div><label class="lbl">Metal Temperature Range</label>
        <input class="inp" id="gf-temp" value="${esc(g?.metalTempRange||'')}" placeholder="e.g. 640–680°C"></div>
      <div><label class="lbl">Melting Range</label>
        <input class="inp" id="gf-melt" value="${esc(g?.meltingRange||'')}" placeholder="e.g. 515–585°C"></div>
      <div><label class="lbl">Tensile Strength</label>
        <input class="inp" id="gf-tensile" value="${esc(g?.tensileStrength||'')}" placeholder="e.g. ≥310 MPa"></div>
      <div><label class="lbl">Hardness</label>
        <input class="inp" id="gf-hardness" value="${esc(g?.hardness||'')}" placeholder="e.g. 75–105 HB"></div>
      <div style="grid-column:1/-1"><label class="lbl">Acceptance Criteria</label>
        <input class="inp" id="gf-criteria" value="${esc(g?.acceptanceCriteria||'')}"
          placeholder="e.g. Within spectro limits per JIS H 5302"></div>
    </div>
    <div style="padding:0 18px 8px">
      <label class="lbl">Chemical Composition</label>
      <p style="font-size:11px;color:#6b7280;margin-bottom:8px">Enter element limits (e.g. 9.6–12.0 or ≤0.30)</p>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
        ${elements.map(el=>`<div>
          <label style="font-size:11px;font-weight:700;color:#0d2f6e;display:block;margin-bottom:2px">${el}</label>
          <input class="inp" id="gf-el-${el}" value="${esc(comp[el]||'')}" placeholder="—"
            style="padding:5px 7px;font-size:12px">
        </div>`).join('')}
        <div>
          <label style="font-size:11px;font-weight:700;color:#0d2f6e;display:block;margin-bottom:2px">Other</label>
          <input class="inp" id="gf-el-other" value="${esc(comp['Other']||'')}" placeholder="—"
            style="padding:5px 7px;font-size:12px">
        </div>
      </div>
      <div style="margin-top:10px">
        <label style="font-size:11px;color:#6b7280">Custom element (name:value pairs, comma separated)</label>
        <input class="inp" id="gf-custom-el" value=""
          placeholder="e.g. Ti:≤0.15, Cr:≤0.10" style="font-size:12px">
      </div>
    </div>
    <div style="padding:14px 18px;display:flex;gap:8px;border-top:1px solid #f3f4f6">
      <button class="btn btn-p" onclick="QMS2.saveGrade(${editId||0})">
        ${editId?'Save Changes':'Add Grade'}</button>
      <button class="btn btn-o" onclick="document.getElementById('grade-modal').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function saveGrade(editId){
  const grade = document.getElementById('gf-grade')?.value?.trim();
  if(!grade){ toast('Grade name required','d'); return; }

  const elements = ['Si','Cu','Mg','Zn','Fe','Mn','Ni','Sn','Pb','Al'];
  const composition = {};
  elements.forEach(el=>{
    const v = document.getElementById(`gf-el-${el}`)?.value?.trim();
    if(v) composition[el] = v;
  });
  // Parse custom elements
  const custom = document.getElementById('gf-custom-el')?.value?.trim();
  if(custom){ custom.split(',').forEach(pair=>{
    const [k,v] = pair.split(':').map(s=>s.trim());
    if(k&&v) composition[k]=v;
  });}

  const rec = {
    grade, standard:document.getElementById('gf-standard')?.value?.trim()||'',
    metalTempRange:document.getElementById('gf-temp')?.value?.trim()||'',
    meltingRange:document.getElementById('gf-melt')?.value?.trim()||'',
    tensileStrength:document.getElementById('gf-tensile')?.value?.trim()||'',
    hardness:document.getElementById('gf-hardness')?.value?.trim()||'',
    acceptanceCriteria:document.getElementById('gf-criteria')?.value?.trim()||'',
    composition
  };
  if(editId) rec.id = editId;
  await POST('/api/qms2/grades', rec);
  document.getElementById('grade-modal')?.remove();
  toast(`Grade ${grade} saved ✅`,'s');
  renderGradeMaster();
}

async function deleteGrade(id){
  if(!confirm('Delete this grade? This cannot be undone.')) return;
  await DEL(`/api/qms2/grades/${id}`);
  toast('Deleted','d');
  renderGradeMaster();
}

// ── CP Cell Event Handlers ────────────────────────────────────────────
const _cpPending = {};
let _cpSaveTimer = null;

function _cpCellBlur(el){
  const id = +el.dataset.id || +el.dataset['id'];
  const field = el.dataset.field || el.dataset['field'] || el.dataset.f;
  if(!id || !field) return;
  if(!_cpPending[id]) _cpPending[id] = {};
  _cpPending[id][field] = el.value;
  _showSaving();
  clearTimeout(_cpSaveTimer);
  _cpSaveTimer = setTimeout(_cpFlush, 900);
}

function _cpCellChange(el){ _cpCellBlur(el); }

function _cpCellKey(e, el){
  if(e.key==='Tab'){ e.preventDefault();
    const all = [...document.querySelectorAll('#cp-body .ss-cell, #cp-body .q2-cell')];
    const i = all.indexOf(el);
    const nx = all[e.shiftKey ? i-1 : i+1];
    if(nx){ nx.focus(); if(nx.select) nx.select(); }
  }
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault();
    const tr = el.closest('tr')?.nextElementSibling;
    tr?.querySelector('.ss-cell, .q2-cell')?.focus() || cpAddRow();
  }
}

async function _cpFlush(){
  const cpId = S.currentCpId;
  if(!cpId) return;
  for(const [id, changes] of Object.entries(_cpPending)){
    delete _cpPending[id];
    const all = await GET(`/api/qms2/cp_rows?cpId=${cpId}`);
    const rec = all.find(r=>r.id===+id); if(!rec) continue;
    await POST('/api/qms2/cp_rows', {...rec, ...changes, id:+id});
  }
  _hideSaving();
}

// ── CP Row CRUD ───────────────────────────────────────────────────────
async function cpAddRow(){
  const cpId = S.currentCpId; if(!cpId) return;
  const all = await GET(`/api/qms2/cp_rows?cpId=${cpId}`);
  const rec = {
    cpId, opNumber:'OP10', processStep:DEFAULT_OPS[0].step,
    machine:'', charNumber:'', charName:'', charType:'process', classification:'',
    specification:'', tolerance:'', method:'Visual', gauge:'', sampleSize:'1',
    frequency:'100%', controlMethod:'', reactionPlan:'', remarks:'',
    source:'custom', order:(all.length||0)+1, imageId:null
  };
  const saved = await POST('/api/qms2/cp_rows', rec);
  const tbody = document.getElementById('cp-body');
  if(!tbody) return;
  if(tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
  const num = tbody.querySelectorAll('tr[data-id]').length + 1;
  tbody.insertAdjacentHTML('beforeend', _renderCpRow({...rec, id:saved.id}, num, false, false));
  setTimeout(()=>tbody.querySelector(`tr[data-id="${saved.id}"]`)?.querySelector('.ss-cell, .q2-cell')?.focus(), 50);
}

async function cpDelRow(id){
  if(!confirm('Delete this characteristic?')) return;
  await DEL(`/api/qms2/cp_rows/${id}`);
  document.querySelector(`#cp-body tr[data-id="${id}"]`)?.remove();
  document.querySelectorAll('#cp-body tr[data-id]').forEach((tr,i)=>{
    const s = tr.querySelector('.ss-row-num-td span');
    if(s) s.textContent = i+1;
  });
  toast('Deleted','d');
}

async function cpDupRow(id){
  const cpId = S.currentCpId;
  const all = await GET(`/api/qms2/cp_rows?cpId=${cpId}`);
  const r = all.find(x=>x.id===id); if(!r) return;
  const {id:_, ...clean} = r; clean.source = 'custom';
  const saved = await POST('/api/qms2/cp_rows', clean);
  const tbody = document.getElementById('cp-body');
  if(!tbody) return;
  const num = tbody.querySelectorAll('tr[data-id]').length + 1;
  tbody.insertAdjacentHTML('beforeend', _renderCpRow({...clean, id:saved.id}, num, false, false));
  toast('Duplicated','s');
}

// ── CP workflow actions ───────────────────────────────────────────────
async function submitCP(cpId){
  if(!confirm('Submit for review?')) return;
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  await POST('/api/qms2/cp_parts', {...cp, status:'Under Review'});
  toast('Submitted for review','s'); renderCpView(cpId);
}

async function approveCP(cpId){
  if(!confirm('Approve this Control Plan? It will be locked for editing.')) return;
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  await POST('/api/qms2/cp_parts', {...cp, status:'Approved',
    approvedBy:Auth?.user?.name||'', approvedDate:today()});
  await POST('/api/qms2/cp_revisions', {cpId, revision:cp.revision, date:today(),
    changedBy:Auth?.user?.name||'', summary:'Control Plan Approved'});
  toast('Approved ✅','s'); renderCpView(cpId);
}

async function newCPRev(cpId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  const newRev = REVS[REVS.indexOf(cp.revision)+1] || 'Z';
  const summary = prompt(`Revision ${newRev} — describe changes:`, '');
  if(!summary) return;
  await POST('/api/qms2/cp_parts', {...cp, revision:newRev,
    cpNumber:`CP-${cp.partNumber}-REV-${newRev}`,
    status:'Draft', approvedBy:'', approvedDate:'', pfmeaOutdated:false});
  await POST('/api/qms2/cp_revisions', {cpId, revision:newRev, date:today(),
    changedBy:Auth?.user?.name||'', summary});
  toast(`Revision ${newRev} started`,'s'); renderCpView(cpId);
}

async function refreshCpFromPfmea(cpId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId); if(!cp) return;
  const [existChars, pfRows] = await Promise.all([
    GET(`/api/qms2/cp_rows?cpId=${cpId}`),
    GET(`/api/qms2/pfmea_rows?partId=${cp.pfmeaPartId}`)]);
  const existIds = new Set(existChars.filter(c=>c.pfmeaRowId).map(c=>c.pfmeaRowId));
  const existNames = new Set(existChars.map(c=>c.charName));
  const opCounters = {};
  existChars.forEach(c=>{ opCounters[c.opNumber] = (opCounters[c.opNumber]||0)+1; });
  const maxOrder = Math.max(...existChars.map(c=>c.order||0), 0);
  let order = maxOrder+1; let added = 0;
  for(const r of pfRows){
    if(existIds.has(r.id)) continue;
    const nm = r.function || r.failureMode || '';
    if(existNames.has(nm)) continue;
    const opNum = r.opNumber || stepToOp(r.processStep) || 'OP10';
    opCounters[opNum] = (opCounters[opNum]||0)+1;
    const charNum = `${opNum}.${String(opCounters[opNum]).padStart(2,'0')}`;
    await POST('/api/qms2/cp_rows', {
      cpId, opNumber:opNum, processStep:r.processStep,
      machine:cp.machine||'', charNumber:charNum, charName:nm,
      charType:'process', classification:'',
      specification:r.preventionControls||r.currentControls||'',
      tolerance:'', method:r.detectionControls||'Visual',
      gauge:'', sampleSize:'1', frequency:'Per Control Plan',
      controlMethod:r.preventionControls||'',
      reactionPlan:r.recommendedAction||'', remarks:'',
      source:'pfmea', pfmeaRowId:r.id, pfmeaRpn:r.rpn||0,
      order:order++, imageId:null
    });
    added++;
  }
  await POST('/api/qms2/cp_parts', {...cp, pfmeaOutdated:false});
  toast(added ? `✅ ${added} new row${added>1?'s':''} added` : 'Already in sync ✅','s');
  renderCpView(cpId);
}

// ── Public API ────────────────────────────────────────────────────────
return {
  renderDashboard, renderNewPart, showGrade, savePart,
  renderPfmea, pfmeaAddRow, pfmeaDelRow, pfmeaDupRow, _moveRow, _expandRow,
  _cellBlur, _cellChange, _cellKey, _autoResize, _updateRpn, _enterNext,
  generateCP, renderCP, renderCpView, renderCpForPart, renderCpList,
  cpAddRow, cpDelRow, cpDupRow, _cpMov, _cpCellBlur, _cpCellChange, _cpCellKey,
  submitCP, approveCP, newCPRev, refreshCpFromPfmea, _archiveCP,
  _printSelectOp, _restorePart, _restoreCP, _permDeletePart, _permDeleteCP,
  renderArchive,
  renderChecksheets, fillCS, saveCS, viewCSRecord, delCSRecord,
  printPfmea, printCP, printCS,
  showImpactDialog,
  renderGradeMaster, showGradeForm, saveGrade, deleteGrade,
};
})();

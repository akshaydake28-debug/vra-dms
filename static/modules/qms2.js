// ═══════════════════════════════════════════════════════════════════
//  VRA DMS — QMS v2 : PFMEA + Control Plan + Checksheet
//  Module: qms2.js
// ═══════════════════════════════════════════════════════════════════

const QMS2 = (() => {

// ── Constants ────────────────────────────────────────────────────────
const PROCESS_STEPS = [
  'Receiving Inspection','Melting','Die Casting','Trimming/Fettling',
  'Shot Blasting','Machining','Final Inspection','Packing & Dispatch'
];

const GRADES = ['ADC12','A380','A383','LM6','LM24','LM2','ANSI360','AC4B'];

const REV_LETTERS = ['A','B','C','D','E','F','G','H','J','K'];

const STATUS_COLORS = {
  'Draft':'#6b7280', 'Under Review':'#d97706',
  'Approved':'#16a34a', 'Obsolete':'#dc2626'
};

// ── API helpers ───────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}
const GET  = p       => api('GET',    p);
const POST = (p,b)   => api('POST',   p, b);
const DEL  = p       => api('DELETE', p);

// ── Utility ───────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function today(){ return new Date().toISOString().slice(0,10); }
function fmtDate(d){ if(!d) return '—'; const dt=new Date(d); return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function rpn(s,o,d){ return (parseInt(s)||1)*(parseInt(o)||1)*(parseInt(d)||1); }
function rpnColor(r){ if(r>=200) return '#dc2626'; if(r>=100) return '#d97706'; if(r>=50) return '#ca8a04'; return '#16a34a'; }

function badge(text, color='#6b7280'){
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}44">${esc(text)}</span>`;
}

function statusBadge(s){
  return badge(s, STATUS_COLORS[s]||'#6b7280');
}

function toast(msg, type='s'){
  if(window.toast) window.toast(msg, type);
  else console.log(msg);
}

function setContent(html){
  const el = document.getElementById('content') || document.getElementById('main-content');
  if(el) el.innerHTML = html;
}

// ── Main Dashboard ────────────────────────────────────────────────────
async function renderDashboard(){
  const [parts, cps] = await Promise.all([
    GET('/api/qms2/pfmea_parts'),
    GET('/api/qms2/cp_parts')
  ]);

  const approvedCps = cps.filter(c=>c.status==='Approved').length;
  const draftCps = cps.filter(c=>c.status==='Draft').length;

  setContent(`
  <div class="ph">
    <div>
      <h2 style="font-size:17px;font-weight:700;color:#0d2f6e">📋 Process Quality</h2>
      <p style="color:#6b7280;font-size:12px;margin:2px 0 0">PFMEA · Control Plans · Checksheets</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p btn-sm" onclick="QMS2.renderNewPart()">+ New Part</button>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderPfmeaList()">PFMEA Library</button>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderCpList()">Control Plans</button>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderGradeMaster()">Grade Master</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
    ${[
      ['Parts Registered', parts.length, '#0d2f6e'],
      ['Control Plans', cps.length, '#7c3aed'],
      ['Approved CPs', approvedCps, '#16a34a'],
      ['Draft / Review', draftCps, '#d97706'],
    ].map(([label,val,color])=>`
      <div class="card" style="padding:16px;border-left:3px solid ${color}">
        <div style="font-size:24px;font-weight:700;color:${color}">${val}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${label}</div>
      </div>`).join('')}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card">
      <div class="ch"><h5>Recent Parts</h5><button class="btn btn-p btn-xs" onclick="QMS2.renderNewPart()">+ Add Part</button></div>
      <div class="cb" style="padding:0">
        ${parts.length===0?'<p style="padding:16px;color:#9ca3af;font-size:13px">No parts yet.</p>':
          parts.slice(0,8).map(p=>`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #f3f4f6">
            <div>
              <div style="font-weight:600;font-size:13px;color:#0d2f6e">${esc(p.partNumber)}</div>
              <div style="font-size:11px;color:#6b7280">${esc(p.partName)} · ${esc(p.grade)}</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-o btn-xs" onclick="QMS2.renderPfmeaPart(${p.id})">PFMEA</button>
              <button class="btn btn-p btn-xs" onclick="QMS2.renderCpForPart(${p.id})">CP</button>
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="ch"><h5>Control Plan Status</h5></div>
      <div class="cb" style="padding:0">
        ${cps.length===0?'<p style="padding:16px;color:#9ca3af;font-size:13px">No control plans yet.</p>':
          cps.slice(0,8).map(c=>`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #f3f4f6">
            <div>
              <div style="font-weight:600;font-size:12px;font-family:monospace;color:#0d2f6e">${esc(c.cpNumber)}</div>
              <div style="font-size:11px;color:#6b7280">${esc(c.partName)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              ${statusBadge(c.status||'Draft')}
              <button class="btn btn-o btn-xs" onclick="QMS2.renderCpView(${c.id})">View</button>
            </div>
          </div>`).join('')}
      </div>
    </div>
  </div>`);
}

// ── New Part Form ─────────────────────────────────────────────────────
async function renderNewPart(editId){
  const grades = await GET('/api/qms2/grades');
  const existing = editId ? (await GET('/api/qms2/pfmea_parts')).find(p=>p.id===editId) : null;
  const allParts = await GET('/api/qms2/pfmea_parts');

  setContent(`
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2 style="font-size:16px;font-weight:700;color:#0d2f6e">${existing?'Edit Part':'Register New Part'}</h2>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start">
    <div class="card">
      <div class="ch"><h5>Part Information</h5></div>
      <div class="cb" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px">
        <div>
          <label class="lbl">Part Number *</label>
          <input class="inp" id="q2-partNumber" value="${esc(existing?.partNumber||'')}" placeholder="e.g. JL601008">
        </div>
        <div>
          <label class="lbl">Part Name *</label>
          <input class="inp" id="q2-partName" value="${esc(existing?.partName||'')}" placeholder="e.g. Bracket LH">
        </div>
        <div>
          <label class="lbl">Customer *</label>
          <input class="inp" id="q2-customer" value="${esc(existing?.customer||'')}" placeholder="e.g. SAVWIPL">
        </div>
        <div>
          <label class="lbl">Material Grade *</label>
          <select class="inp" id="q2-grade" onchange="QMS2.onGradeSelect()">
            <option value="">— Select Grade —</option>
            ${GRADES.map(g=>`<option value="${g}" ${existing?.grade===g?'selected':''}>${g}</option>`).join('')}
            ${grades.filter(g=>!GRADES.includes(g.grade)).map(g=>`<option value="${g.grade}" ${existing?.grade===g.grade?'selected':''}>${g.grade}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="lbl">Drawing Number</label>
          <input class="inp" id="q2-drawingNo" value="${esc(existing?.drawingNo||'')}" placeholder="Optional">
        </div>
        <div>
          <label class="lbl">Machine (Ton)</label>
          <select class="inp" id="q2-machine">
            <option value="" ${!existing?.machine?'selected':''}>— Select —</option>
            <option value="280T" ${existing?.machine==='280T'?'selected':''}>LK IMPRESS III 280T</option>
            <option value="400T" ${existing?.machine==='400T'?'selected':''}>LK IMPRESS III 400T</option>
          </select>
        </div>
        <div style="grid-column:1/-1">
          <label class="lbl">Special Customer Requirements</label>
          <textarea class="inp" id="q2-specialReqs" rows="2" placeholder="e.g. VW 50093 porosity Class 2, TISAX required...">${esc(existing?.specialReqs||'')}</textarea>
        </div>
        <div style="grid-column:1/-1">
          <label class="lbl">Clone PFMEA from existing part (optional)</label>
          <select class="inp" id="q2-cloneFrom">
            <option value="">— Start fresh from template —</option>
            ${allParts.filter(p=>!editId||p.id!==editId).map(p=>`<option value="${p.id}">${esc(p.partNumber)} — ${esc(p.partName)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="padding:0 18px 18px;display:flex;gap:8px">
        <button class="btn btn-p" onclick="QMS2.savePart(${editId||0})">
          ${existing?'Save Changes':'Create Part & Generate PFMEA →'}
        </button>
        <button class="btn btn-o" onclick="QMS2.renderDashboard()">Cancel</button>
      </div>
    </div>
    <div id="q2-grade-info" class="card" style="padding:16px">
      <div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px 0">
        Select a grade to see composition
      </div>
    </div>
  </div>`);

  if(existing?.grade) setTimeout(()=>onGradeSelect(), 100);
}

async function onGradeSelect(){
  const grade = document.getElementById('q2-grade')?.value;
  const el = document.getElementById('q2-grade-info');
  if(!el) return;
  if(!grade){ el.innerHTML='<div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px 0">Select a grade to see composition</div>'; return; }
  const grades = await GET('/api/qms2/grades');
  const g = grades.find(x=>x.grade===grade);
  if(!g){ el.innerHTML=`<div style="padding:12px;color:#9ca3af;font-size:12px">No data for ${grade}</div>`; return; }
  const comp = g.composition||{};
  el.innerHTML=`
    <div style="font-weight:700;color:#0d2f6e;margin-bottom:10px">${g.grade} — ${g.standard}</div>
    <table style="width:100%;font-size:11.5px;border-collapse:collapse">
      <tr style="background:#f8fafc"><th style="padding:4px 6px;text-align:left;color:#6b7280">Element</th><th style="padding:4px 6px;text-align:right;color:#6b7280">Range</th></tr>
      ${Object.entries(comp).map(([el,v])=>`<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 6px;font-weight:500">${el}</td><td style="padding:4px 6px;text-align:right;color:#374151">${v}</td></tr>`).join('')}
    </table>
    <div style="margin-top:10px;font-size:11px;color:#6b7280">
      <div>Metal Temp: <b>${g.metalTempRange||'—'}</b></div>
      <div>Tensile: <b>${g.tensileStrength||'—'}</b></div>
      <div>Hardness: <b>${g.hardness||'—'}</b></div>
    </div>`;
}

async function savePart(editId){
  const partNumber = document.getElementById('q2-partNumber')?.value?.trim();
  const partName = document.getElementById('q2-partName')?.value?.trim();
  const customer = document.getElementById('q2-customer')?.value?.trim();
  const grade = document.getElementById('q2-grade')?.value;
  if(!partNumber||!partName||!customer||!grade){ toast('Fill all required fields','d'); return; }

  const cloneFrom = parseInt(document.getElementById('q2-cloneFrom')?.value)||0;
  const rec = {
    partNumber, partName, customer, grade,
    drawingNo: document.getElementById('q2-drawingNo')?.value?.trim()||'',
    machine: document.getElementById('q2-machine')?.value||'',
    specialReqs: document.getElementById('q2-specialReqs')?.value?.trim()||'',
    createdDate: today(), updatedDate: today(),
  };
  if(editId) rec.id = editId;

  const saved = await POST('/api/qms2/pfmea_parts', rec);
  const partId = saved.id;

  if(!editId){
    // Generate PFMEA rows
    await generatePfmeaRows(partId, grade, cloneFrom);
    toast('Part created — PFMEA generated ✅','s');
  } else {
    toast('Saved ✅','s');
  }
  renderPfmeaPart(partId);
}

async function generatePfmeaRows(partId, grade, cloneFromPartId){
  let rows = [];
  if(cloneFromPartId){
    const srcRows = await GET(`/api/qms2/pfmea_rows?partId=${cloneFromPartId}`);
    rows = srcRows.map(r=>({...r, partId, id:undefined}));
  } else {
    const templates = await GET(`/api/qms2/pfmea_templates`);
    rows = templates.map(t=>({
      partId, processStep:t.processStep, function:t.function||'',
      failureMode:t.failureMode||'', failureEffect:t.failureEffect||'',
      severity:t.severity||5, failureCause:t.failureCause||'',
      occurrence:t.occurrence||3, currentControls:t.currentControls||'',
      detection:t.detection||3, rpn:t.rpn||0,
      recommendedAction:t.recommendedAction||'',
      responsibility:t.responsibility||'', targetDate:'', status:'Open'
    }));
  }
  for(const row of rows){
    const clean = {...row}; delete clean.id;
    clean.rpn = rpn(clean.severity, clean.occurrence, clean.detection);
    await POST('/api/qms2/pfmea_rows', clean);
  }
}

// ── PFMEA Part View ───────────────────────────────────────────────────
async function renderPfmeaPart(partId){
  const parts = await GET('/api/qms2/pfmea_parts');
  const part = parts.find(p=>p.id===partId);
  if(!part){ toast('Part not found','d'); renderDashboard(); return; }
  const rows = await GET(`/api/qms2/pfmea_rows?partId=${partId}`);

  const byStep = {};
  PROCESS_STEPS.forEach(s=>{ byStep[s]=[]; });
  rows.forEach(r=>{ if(byStep[r.processStep]) byStep[r.processStep].push(r); else byStep[r.processStep]=[r]; });

  const hasCP = (await GET('/api/qms2/cp_parts')).some(c=>c.pfmeaPartId===partId);

  setContent(`
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2 style="font-size:16px;font-weight:700;color:#0d2f6e">PFMEA — ${esc(part.partNumber)}</h2>
      <p style="font-size:12px;color:#6b7280">${esc(part.partName)} · ${esc(part.customer)} · Grade: <b>${esc(part.grade)}</b></p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-o btn-sm" onclick="QMS2.renderNewPart(${partId})">✏️ Edit Part</button>
      <button class="btn btn-o btn-sm" onclick="QMS2.addPfmeaRow(${partId})">+ Add Row</button>
      ${hasCP
        ? `<button class="btn btn-p btn-sm" onclick="QMS2.renderCpForPart(${partId})">📄 View Control Plan</button>`
        : `<button class="btn btn-p btn-sm" onclick="QMS2.generateCP(${partId})">📄 Generate Control Plan →</button>`}
    </div>
  </div>

  <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">
    ${PROCESS_STEPS.map(s=>{
      const count = byStep[s]?.length||0;
      const maxRpn = Math.max(...(byStep[s]||[]).map(r=>r.rpn||0),0);
      return `<button class="btn btn-xs" style="background:${rpnColor(maxRpn)}22;color:${rpnColor(maxRpn)};border:1px solid ${rpnColor(maxRpn)}44" onclick="document.getElementById('step-${s.replace(/\//g,'-').replace(/ /g,'_')}')?.scrollIntoView({behavior:'smooth'})">
        ${s} (${count})</button>`;
    }).join('')}
  </div>

  ${PROCESS_STEPS.map(step=>{
    const stepRows = byStep[step]||[];
    const stepId = step.replace(/\//g,'-').replace(/ /g,'_');
    return `
    <div class="card" style="margin-bottom:14px" id="step-${stepId}">
      <div class="ch" style="background:#f8fafc">
        <h5 style="color:#0d2f6e">${step}</h5>
        <div style="display:flex;gap:6px">
          <span style="font-size:11px;color:#6b7280">${stepRows.length} failure modes</span>
          <button class="btn btn-xs btn-o" onclick="QMS2.addPfmeaRow(${partId},'${step}')">+ Add</button>
        </div>
      </div>
      <div class="cb" style="padding:0;overflow-x:auto">
        ${stepRows.length===0?'<p style="padding:12px 16px;color:#9ca3af;font-size:12px">No failure modes. Click + Add to add.</p>':
        `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px">
          <thead>
            <tr style="background:#f1f5f9;color:#374151">
              ${['Process Function','Failure Mode','Effect','S','Cause','O','Current Controls','D','RPN','Action','Resp.',''].map(h=>`<th style="padding:7px 8px;text-align:left;white-space:nowrap;font-weight:600">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${stepRows.map(row=>{
              const r = rpn(row.severity,row.occurrence,row.detection);
              return `<tr style="border-bottom:1px solid #f3f4f6;vertical-align:top">
                <td style="padding:6px 8px;max-width:140px">${esc(row.function)}</td>
                <td style="padding:6px 8px;max-width:140px;font-weight:500;color:#dc2626">${esc(row.failureMode)}</td>
                <td style="padding:6px 8px;max-width:120px">${esc(row.failureEffect)}</td>
                <td style="padding:6px 8px;text-align:center;font-weight:700">${row.severity||''}</td>
                <td style="padding:6px 8px;max-width:130px">${esc(row.failureCause)}</td>
                <td style="padding:6px 8px;text-align:center;font-weight:700">${row.occurrence||''}</td>
                <td style="padding:6px 8px;max-width:140px">${esc(row.currentControls)}</td>
                <td style="padding:6px 8px;text-align:center;font-weight:700">${row.detection||''}</td>
                <td style="padding:6px 8px;text-align:center">
                  <span style="font-weight:700;color:${rpnColor(r)};background:${rpnColor(r)}18;padding:2px 7px;border-radius:10px">${r}</span>
                </td>
                <td style="padding:6px 8px;max-width:130px">${esc(row.recommendedAction)}</td>
                <td style="padding:6px 8px;white-space:nowrap">${esc(row.responsibility)}</td>
                <td style="padding:6px 8px;white-space:nowrap">
                  <button class="btn btn-xs btn-o" onclick="QMS2.editPfmeaRow(${row.id},${partId})">✏️</button>
                  <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626" onclick="QMS2.deletePfmeaRow(${row.id},${partId})">✕</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>`;
  }).join('')}`);
}

// ── PFMEA Row Modal ───────────────────────────────────────────────────
async function addPfmeaRow(partId, defaultStep){
  showPfmeaRowModal(null, partId, defaultStep);
}

async function editPfmeaRow(rowId, partId){
  const rows = await GET(`/api/qms2/pfmea_rows?partId=${partId}`);
  const row = rows.find(r=>r.id===rowId);
  showPfmeaRowModal(row, partId);
}

function showPfmeaRowModal(row, partId, defaultStep){
  const isNew = !row;
  const modal = document.createElement('div');
  modal.id = 'pfmea-row-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:#0006;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
  <div style="background:#fff;border-radius:12px;width:100%;max-width:720px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px #0003">
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
      <h4 style="font-size:15px;font-weight:700;color:#0d2f6e">${isNew?'Add PFMEA Row':'Edit PFMEA Row'}</h4>
      <button onclick="document.getElementById('pfmea-row-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">✕</button>
    </div>
    <div style="padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="grid-column:1/-1">
        <label class="lbl">Process Step</label>
        <select class="inp" id="pr-step">
          ${PROCESS_STEPS.map(s=>`<option value="${s}" ${(row?.processStep||defaultStep||'')==s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div style="grid-column:1/-1">
        <label class="lbl">Process Function</label>
        <input class="inp" id="pr-function" value="${esc(row?.function||'')}" placeholder="What this step is supposed to do">
      </div>
      <div>
        <label class="lbl">Failure Mode</label>
        <input class="inp" id="pr-failureMode" value="${esc(row?.failureMode||'')}" placeholder="What can go wrong">
      </div>
      <div>
        <label class="lbl">Failure Effect</label>
        <input class="inp" id="pr-failureEffect" value="${esc(row?.failureEffect||'')}" placeholder="Impact on customer / next process">
      </div>
      <div>
        <label class="lbl">Severity (1–10)</label>
        <input class="inp" id="pr-severity" type="number" min="1" max="10" value="${row?.severity||5}" oninput="QMS2.calcRPN()">
      </div>
      <div>
        <label class="lbl">Failure Cause</label>
        <input class="inp" id="pr-failureCause" value="${esc(row?.failureCause||'')}" placeholder="Root cause">
      </div>
      <div>
        <label class="lbl">Occurrence (1–10)</label>
        <input class="inp" id="pr-occurrence" type="number" min="1" max="10" value="${row?.occurrence||3}" oninput="QMS2.calcRPN()">
      </div>
      <div style="grid-column:1/-1">
        <label class="lbl">Current Controls</label>
        <input class="inp" id="pr-currentControls" value="${esc(row?.currentControls||'')}" placeholder="Controls in place">
      </div>
      <div>
        <label class="lbl">Detection (1–10)</label>
        <input class="inp" id="pr-detection" type="number" min="1" max="10" value="${row?.detection||3}" oninput="QMS2.calcRPN()">
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding-top:8px">
        <label class="lbl" style="margin:0">RPN:</label>
        <span id="pr-rpn-display" style="font-size:22px;font-weight:700;color:${rpnColor(rpn(row?.severity,row?.occurrence,row?.detection))}">${rpn(row?.severity,row?.occurrence,row?.detection)}</span>
      </div>
      <div style="grid-column:1/-1">
        <label class="lbl">Recommended Action</label>
        <input class="inp" id="pr-recommendedAction" value="${esc(row?.recommendedAction||'')}" placeholder="What should be done to reduce RPN">
      </div>
      <div>
        <label class="lbl">Responsibility</label>
        <input class="inp" id="pr-responsibility" value="${esc(row?.responsibility||'')}" placeholder="Owner">
      </div>
      <div>
        <label class="lbl">Target Date</label>
        <input class="inp" id="pr-targetDate" type="date" value="${row?.targetDate||''}">
      </div>
    </div>
    <div style="padding:0 18px 18px;display:flex;gap:8px">
      <button class="btn btn-p" onclick="QMS2.savePfmeaRow(${row?.id||0},${partId})">Save</button>
      <button class="btn btn-o" onclick="document.getElementById('pfmea-row-modal').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

function calcRPN(){
  const s = parseInt(document.getElementById('pr-severity')?.value)||1;
  const o = parseInt(document.getElementById('pr-occurrence')?.value)||1;
  const d = parseInt(document.getElementById('pr-detection')?.value)||1;
  const r = s*o*d;
  const el = document.getElementById('pr-rpn-display');
  if(el){ el.textContent=r; el.style.color=rpnColor(r); }
}

async function savePfmeaRow(rowId, partId){
  const s=parseInt(document.getElementById('pr-severity')?.value)||5;
  const o=parseInt(document.getElementById('pr-occurrence')?.value)||3;
  const d=parseInt(document.getElementById('pr-detection')?.value)||3;
  const rec = {
    partId,
    processStep: document.getElementById('pr-step')?.value,
    function: document.getElementById('pr-function')?.value?.trim()||'',
    failureMode: document.getElementById('pr-failureMode')?.value?.trim()||'',
    failureEffect: document.getElementById('pr-failureEffect')?.value?.trim()||'',
    severity:s, failureCause: document.getElementById('pr-failureCause')?.value?.trim()||'',
    occurrence:o, currentControls: document.getElementById('pr-currentControls')?.value?.trim()||'',
    detection:d, rpn:s*o*d,
    recommendedAction: document.getElementById('pr-recommendedAction')?.value?.trim()||'',
    responsibility: document.getElementById('pr-responsibility')?.value?.trim()||'',
    targetDate: document.getElementById('pr-targetDate')?.value||'',
  };
  if(rowId) rec.id = rowId;
  await POST('/api/qms2/pfmea_rows', rec);
  document.getElementById('pfmea-row-modal')?.remove();
  toast('Saved ✅','s');
  renderPfmeaPart(partId);
}

async function deletePfmeaRow(rowId, partId){
  if(!confirm('Delete this PFMEA row?')) return;
  await DEL(`/api/qms2/pfmea_rows/${rowId}`);
  toast('Deleted','d');
  renderPfmeaPart(partId);
}

// ── PFMEA List ────────────────────────────────────────────────────────
async function renderPfmeaList(){
  const parts = await GET('/api/qms2/pfmea_parts');
  setContent(`
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2 style="font-size:16px;font-weight:700;color:#0d2f6e">PFMEA Library</h2>
    </div>
    <button class="btn btn-p btn-sm" onclick="QMS2.renderNewPart()">+ New Part</button>
  </div>
  <div class="card">
    <div class="cb" style="padding:0">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc">
          ${['Part Number','Part Name','Customer','Grade','Machine','Created',''].map(h=>`<th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${parts.length===0?`<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af">No parts registered yet.</td></tr>`:
            parts.map(p=>`<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 12px;font-weight:600;color:#0d2f6e;font-family:monospace">${esc(p.partNumber)}</td>
              <td style="padding:10px 12px">${esc(p.partName)}</td>
              <td style="padding:10px 12px">${esc(p.customer)}</td>
              <td style="padding:10px 12px">${badge(p.grade,'#7c3aed')}</td>
              <td style="padding:10px 12px">${esc(p.machine||'—')}</td>
              <td style="padding:10px 12px;color:#6b7280">${fmtDate(p.createdDate)}</td>
              <td style="padding:10px 12px">
                <button class="btn btn-o btn-xs" onclick="QMS2.renderPfmeaPart(${p.id})">View PFMEA</button>
                <button class="btn btn-p btn-xs" onclick="QMS2.renderCpForPart(${p.id})">Control Plan</button>
                <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626" onclick="QMS2.deletePart(${p.id})">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`);
}

async function deletePart(partId){
  if(!confirm('Delete this part and all its PFMEA/CP data?')) return;
  const rows = await GET(`/api/qms2/pfmea_rows?partId=${partId}`);
  for(const r of rows) await DEL(`/api/qms2/pfmea_rows/${r.id}`);
  await DEL(`/api/qms2/pfmea_parts/${partId}`);
  toast('Deleted','d'); renderPfmeaList();
}

// ── Generate Control Plan ─────────────────────────────────────────────
async function generateCP(partId){
  const parts = await GET('/api/qms2/pfmea_parts');
  const part = parts.find(p=>p.id===partId);
  if(!part){ toast('Part not found','d'); return; }

  const existing = (await GET('/api/qms2/cp_parts')).find(c=>c.pfmeaPartId===partId);
  if(existing){ renderCpView(existing.id); return; }

  const cpNumber = `CP-${part.partNumber}-REV-A`;
  const cp = await POST('/api/qms2/cp_parts', {
    partNumber: part.partNumber, partName: part.partName,
    customer: part.customer, grade: part.grade,
    drawingNo: part.drawingNo||'', machine: part.machine||'',
    specialReqs: part.specialReqs||'', pfmeaPartId: partId,
    cpNumber, revision:'A', status:'Draft',
    preparedBy: Auth?.user?.name||'', approvedBy:'',
    createdDate: today(), approvedDate:'',
  });

  // Load all template characteristics
  const templates = await GET('/api/qms2/cp_templates');
  // Also get grade-specific metal temp
  const grades = await GET('/api/qms2/grades');
  const gradeData = grades.find(g=>g.grade===part.grade);

  let order = 1;
  for(const t of templates){
    const char = {
      cpId: cp.id,
      processStep: t.processStep,
      charName: t.charName,
      specification: t.charName==='Metal Temperature' && gradeData
        ? gradeData.metalTempRange || t.specification
        : t.specification,
      tolerance:'', method: t.method||'',
      frequency: t.frequency||'', reaction: t.reaction||'',
      source:'template', order: order++, imageId: null,
    };
    await POST('/api/qms2/cp_chars', char);
  }

  // Log revision
  await POST('/api/qms2/cp_revisions', {
    cpId: cp.id, revision:'A', date: today(),
    changedBy: Auth?.user?.name||'', summary:'Initial creation from PFMEA template'
  });

  toast('Control Plan generated ✅','s');
  renderCpView(cp.id);
}

// ── Control Plan View ─────────────────────────────────────────────────
async function renderCpView(cpId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  if(!cp){ toast('CP not found','d'); return; }

  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);
  const revs = await GET(`/api/qms2/cp_revisions?cpId=${cpId}`);

  const byStep = {};
  PROCESS_STEPS.forEach(s=>{ byStep[s]=[]; });
  chars.forEach(c=>{ if(byStep[c.processStep]) byStep[c.processStep].push(c); else byStep[c.processStep]=[c]; });

  const canApprove = Auth?.user?.role==='APPROVER' && cp.status==='Under Review';
  const canSubmit = cp.status==='Draft';
  const isApproved = cp.status==='Approved';

  setContent(`
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderCpList()" style="margin-bottom:6px">← Back</button>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:monospace;font-weight:700;color:#0d2f6e">${esc(cp.cpNumber)}</span>
        ${statusBadge(cp.status||'Draft')}
      </div>
      <p style="font-size:12px;color:#6b7280">${esc(cp.partName)} · ${esc(cp.customer)} · ${esc(cp.grade)}</p>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      ${canSubmit?`<button class="btn btn-w btn-sm" onclick="QMS2.submitCpForReview(${cpId})">📤 Submit for Review</button>`:''}
      ${canApprove?`<button class="btn btn-g btn-sm" onclick="QMS2.approveCP(${cpId})">✓ Approve</button>`:''}
      ${!isApproved?`<button class="btn btn-o btn-sm" onclick="QMS2.renderCpEdit(${cpId})">✏️ Edit Characteristics</button>`:''}
      ${isApproved?`<button class="btn btn-o btn-sm" onclick="QMS2.newRevision(${cpId})">🔄 New Revision</button>`:''}
      <button class="btn btn-o btn-sm" onclick="QMS2.printCP(${cpId})">🖨 Print CP</button>
      ${isApproved?`<button class="btn btn-p btn-sm" onclick="QMS2.renderChecksheets(${cpId})">📋 Checksheets</button>`:''}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 260px;gap:14px;align-items:start">
    <div>
      ${PROCESS_STEPS.map(step=>{
        const stepChars = byStep[step]||[];
        if(stepChars.length===0) return '';
        const templateCount = stepChars.filter(c=>c.source==='template').length;
        const customCount = stepChars.filter(c=>c.source==='custom').length;
        return `
        <div class="card" style="margin-bottom:12px">
          <div class="ch" style="background:#f8fafc">
            <h5 style="color:#0d2f6e">${step}</h5>
            <div style="font-size:11px;color:#6b7280">${templateCount} standard · ${customCount} part-specific</div>
          </div>
          <div class="cb" style="padding:0;overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">
              <thead><tr style="background:#f1f5f9">
                ${['Characteristic','Specification','Tolerance','Method','Frequency','Reaction',''].map(h=>`<th style="padding:7px 8px;text-align:left;font-weight:600;color:#374151">${h}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${stepChars.map(c=>`
                <tr style="border-bottom:1px solid #f3f4f6;${c.source==='custom'?'background:#fefce8':''}">
                  <td style="padding:7px 8px;font-weight:${c.source==='custom'?'600':'400'}">
                    ${c.source==='custom'?'⭐ ':''}${esc(c.charName)}
                  </td>
                  <td style="padding:7px 8px">${esc(c.specification)}</td>
                  <td style="padding:7px 8px">${esc(c.tolerance||'—')}</td>
                  <td style="padding:7px 8px">${esc(c.method)}</td>
                  <td style="padding:7px 8px">${esc(c.frequency)}</td>
                  <td style="padding:7px 8px">${esc(c.reaction)}</td>
                  <td style="padding:7px 8px;white-space:nowrap">
                    ${!isApproved?`
                      <button class="btn btn-xs btn-o" onclick="QMS2.editChar(${c.id},${cpId})">✏️</button>
                      <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626" onclick="QMS2.deleteChar(${c.id},${cpId})">✕</button>
                    `:''}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!isApproved?`<div style="padding:8px 14px;border-top:1px solid #f3f4f6">
            <button class="btn btn-xs btn-p" onclick="QMS2.addChar(${cpId},'${step}')">+ Add Characteristic</button>
          </div>`:''}
        </div>`;
      }).join('')}
    </div>

    <div>
      <div class="card" style="margin-bottom:12px">
        <div class="ch"><h5>Control Plan Info</h5></div>
        <div class="cb" style="padding:12px;font-size:12px">
          ${[
            ['CP Number', cp.cpNumber],
            ['Revision', cp.revision],
            ['Part No.', cp.partNumber],
            ['Part Name', cp.partName],
            ['Customer', cp.customer],
            ['Grade', cp.grade],
            ['Machine', cp.machine||'—'],
            ['Prepared by', cp.preparedBy||'—'],
            ['Date', fmtDate(cp.createdDate)],
            ['Approved by', cp.approvedBy||'—'],
            ['Approval Date', fmtDate(cp.approvedDate)],
          ].map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6">
            <span style="color:#6b7280">${k}</span>
            <span style="font-weight:500;text-align:right">${esc(v)}</span>
          </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="ch"><h5>Revision History</h5></div>
        <div class="cb" style="padding:0">
          ${revs.length===0?'<p style="padding:12px;color:#9ca3af;font-size:12px">No revisions.</p>':
            revs.map(r=>`<div style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px">
              <div style="display:flex;justify-content:space-between">
                <b>Rev ${r.revision}</b><span style="color:#6b7280">${fmtDate(r.date)}</span>
              </div>
              <div style="color:#6b7280">${esc(r.changedBy)}</div>
              <div style="margin-top:2px">${esc(r.summary)}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`);
}

// ── CP Actions ────────────────────────────────────────────────────────
async function submitCpForReview(cpId){
  if(!confirm('Submit this Control Plan for review?')) return;
  await POST('/api/qms2/cp_parts', {id:cpId, status:'Under Review'});
  toast('Submitted for review','s'); renderCpView(cpId);
}

async function approveCP(cpId){
  if(!confirm('Approve this Control Plan? This will lock all characteristics.')) return;
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  await POST('/api/qms2/cp_parts', {
    ...cp, id:cpId, status:'Approved',
    approvedBy: Auth?.user?.name||'', approvedDate: today()
  });
  await POST('/api/qms2/cp_revisions', {
    cpId, revision:cp.revision, date:today(),
    changedBy:Auth?.user?.name||'', summary:'Control Plan Approved'
  });
  toast('Control Plan Approved ✅','s'); renderCpView(cpId);
}

async function newRevision(cpId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  const curRevIdx = REV_LETTERS.indexOf(cp.revision);
  const newRev = REV_LETTERS[curRevIdx+1]||'Z';
  const summary = prompt(`Revision ${newRev} — describe changes:`,'');
  if(!summary) return;
  const newCpNumber = `CP-${cp.partNumber}-REV-${newRev}`;
  await POST('/api/qms2/cp_parts', {...cp, id:cpId, revision:newRev, cpNumber:newCpNumber, status:'Draft', approvedBy:'', approvedDate:''});
  await POST('/api/qms2/cp_revisions', {cpId, revision:newRev, date:today(), changedBy:Auth?.user?.name||'', summary});
  toast(`Revision ${newRev} started`,'s'); renderCpView(cpId);
}

// ── Characteristic Modal ──────────────────────────────────────────────
async function addChar(cpId, defaultStep){
  showCharModal(null, cpId, defaultStep);
}

async function editChar(charId, cpId){
  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);
  const c = chars.find(x=>x.id===charId);
  showCharModal(c, cpId);
}

function showCharModal(c, cpId, defaultStep){
  const isNew = !c;
  const modal = document.createElement('div');
  modal.id = 'char-modal';
  modal.style.cssText='position:fixed;inset:0;background:#0006;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML=`
  <div style="background:#fff;border-radius:12px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px #0003">
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
      <h4 style="font-size:15px;font-weight:700;color:#0d2f6e">${isNew?'Add Characteristic':'Edit Characteristic'}</h4>
      <button onclick="document.getElementById('char-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">✕</button>
    </div>
    <div style="padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="grid-column:1/-1">
        <label class="lbl">Process Step</label>
        <select class="inp" id="ch-step">
          ${PROCESS_STEPS.map(s=>`<option value="${s}" ${(c?.processStep||defaultStep||'')==s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div style="grid-column:1/-1">
        <label class="lbl">Characteristic Name *</label>
        <input class="inp" id="ch-name" value="${esc(c?.charName||'')}" placeholder="e.g. Bore Diameter, Overall Length">
      </div>
      <div>
        <label class="lbl">Specification *</label>
        <input class="inp" id="ch-spec" value="${esc(c?.specification||'')}" placeholder="e.g. 25.00 mm, ≥310 MPa">
      </div>
      <div>
        <label class="lbl">Tolerance</label>
        <input class="inp" id="ch-tol" value="${esc(c?.tolerance||'')}" placeholder="e.g. ±0.05 mm">
      </div>
      <div>
        <label class="lbl">Inspection Method</label>
        <input class="inp" id="ch-method" value="${esc(c?.method||'')}" placeholder="e.g. Vernier Caliper, CMM">
      </div>
      <div>
        <label class="lbl">Frequency</label>
        <input class="inp" id="ch-freq" value="${esc(c?.frequency||'')}" placeholder="e.g. First-off + every 25 pcs">
      </div>
      <div style="grid-column:1/-1">
        <label class="lbl">Reaction Plan</label>
        <input class="inp" id="ch-reaction" value="${esc(c?.reaction||'')}" placeholder="What to do if out of spec">
      </div>
      <div style="grid-column:1/-1">
        <label class="lbl">Reference Image (optional)</label>
        <input type="file" id="ch-image" accept="image/*" style="font-size:12px">
        ${c?.imageId?`<div style="margin-top:6px;font-size:11px;color:#16a34a">✓ Image attached (id:${c.imageId})</div>`:''}
      </div>
    </div>
    <div style="padding:0 18px 18px;display:flex;gap:8px">
      <button class="btn btn-p" onclick="QMS2.saveChar(${c?.id||0},${cpId})">Save</button>
      <button class="btn btn-o" onclick="document.getElementById('char-modal').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function saveChar(charId, cpId){
  const name = document.getElementById('ch-name')?.value?.trim();
  const spec = document.getElementById('ch-spec')?.value?.trim();
  if(!name||!spec){ toast('Name and specification required','d'); return; }

  let imageId = null;
  const imgFile = document.getElementById('ch-image')?.files?.[0];
  if(imgFile){
    const b64 = await fileToBase64(imgFile);
    const imgRec = await POST('/api/qms2/images', {
      fileName: imgFile.name, mimeType: imgFile.type,
      data: b64, cpId, uploadDate: today()
    });
    imageId = imgRec.id;
  }

  const rec = {
    cpId, processStep: document.getElementById('ch-step')?.value,
    charName: name, specification: spec,
    tolerance: document.getElementById('ch-tol')?.value?.trim()||'',
    method: document.getElementById('ch-method')?.value?.trim()||'',
    frequency: document.getElementById('ch-freq')?.value?.trim()||'',
    reaction: document.getElementById('ch-reaction')?.value?.trim()||'',
    source:'custom', imageId,
  };
  if(charId) rec.id = charId;
  await POST('/api/qms2/cp_chars', rec);
  document.getElementById('char-modal')?.remove();
  toast('Saved ✅','s');
  renderCpView(cpId);
}

async function deleteChar(charId, cpId){
  if(!confirm('Delete this characteristic?')) return;
  await DEL(`/api/qms2/cp_chars/${charId}`);
  toast('Deleted','d'); renderCpView(cpId);
}

function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── Control Plan List ─────────────────────────────────────────────────
async function renderCpList(){
  const cps = await GET('/api/qms2/cp_parts');
  setContent(`
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2 style="font-size:16px;font-weight:700;color:#0d2f6e">Control Plans</h2>
    </div>
    <button class="btn btn-p btn-sm" onclick="QMS2.renderNewPart()">+ New Part</button>
  </div>
  <div class="card">
    <div class="cb" style="padding:0">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc">
          ${['CP Number','Part No.','Part Name','Customer','Grade','Rev','Status',''].map(h=>`<th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${cps.length===0?`<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">No control plans yet.</td></tr>`:
            cps.map(c=>`<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 12px;font-family:monospace;font-weight:600;color:#0d2f6e">${esc(c.cpNumber)}</td>
              <td style="padding:10px 12px">${esc(c.partNumber)}</td>
              <td style="padding:10px 12px">${esc(c.partName)}</td>
              <td style="padding:10px 12px">${esc(c.customer)}</td>
              <td style="padding:10px 12px">${badge(c.grade,'#7c3aed')}</td>
              <td style="padding:10px 12px;font-weight:600">${esc(c.revision)}</td>
              <td style="padding:10px 12px">${statusBadge(c.status||'Draft')}</td>
              <td style="padding:10px 12px">
                <button class="btn btn-o btn-xs" onclick="QMS2.renderCpView(${c.id})">View</button>
                ${c.status==='Approved'?`<button class="btn btn-p btn-xs" onclick="QMS2.renderChecksheets(${c.id})">Checksheets</button>`:''}
                <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626" onclick="QMS2.deleteCP(${c.id})">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`);
}

async function deleteCP(cpId){
  if(!confirm('Delete this Control Plan and all its characteristics?')) return;
  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);
  for(const c of chars) await DEL(`/api/qms2/cp_chars/${c.id}`);
  const revs = await GET(`/api/qms2/cp_revisions?cpId=${cpId}`);
  for(const r of revs) await DEL(`/api/qms2/cp_revisions/${r.id}`);
  await DEL(`/api/qms2/cp_parts/${cpId}`);
  toast('Deleted','d'); renderCpList();
}

// ── Render CP for Part ────────────────────────────────────────────────
async function renderCpForPart(partId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.pfmeaPartId===partId);
  if(cp) renderCpView(cp.id);
  else generateCP(partId);
}

// ── Edit CP (characteristics) ─────────────────────────────────────────
async function renderCpEdit(cpId){
  renderCpView(cpId);
}

// ── Checksheets ───────────────────────────────────────────────────────
async function renderChecksheets(cpId){
  // If called with no cpId (from sidebar), show list of approved CPs
  if(!cpId){
    const cps = await GET('/api/qms2/cp_parts');
    const approved = cps.filter(c=>c.status==='Approved');
    setContent(`
    <div class="ph">
      <div>
        <h2 style="font-size:16px;font-weight:700;color:#0d2f6e">Checksheets</h2>
        <p style="font-size:12px;color:#6b7280">Select an approved Control Plan to fill or print checksheets</p>
      </div>
    </div>
    <div class="card">
      <div class="cb" style="padding:0">
        ${approved.length===0
          ? '<p style="padding:20px;color:#9ca3af;font-size:13px">No approved Control Plans yet. Approve a Control Plan first.</p>'
          : approved.map(c=>`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f3f4f6">
            <div>
              <div style="font-weight:600;font-size:13px;font-family:monospace;color:#0d2f6e">${esc(c.cpNumber)}</div>
              <div style="font-size:11px;color:#6b7280">${esc(c.partName)} · ${esc(c.customer)} · ${esc(c.grade)}</div>
            </div>
            <button class="btn btn-p btn-sm" onclick="QMS2.renderChecksheets(${c.id})">Open Checksheets →</button>
          </div>`).join('')}
      </div>
    </div>`);
    return;
  }
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  if(!cp){ toast('CP not found','d'); return; }
  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);

  const ipsSteps = ['Melting','Die Casting','Machining'];
  const fisSteps = ['Final Inspection'];
  const pclSteps = ['Packing & Dispatch'];

  const ipsChars = chars.filter(c=>ipsSteps.includes(c.processStep));
  const fisChars = chars.filter(c=>fisSteps.includes(c.processStep));
  const pclChars = chars.filter(c=>pclSteps.includes(c.processStep));

  setContent(`
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderCpView(${cpId})" style="margin-bottom:6px">← Back to CP</button>
      <h2 style="font-size:16px;font-weight:700;color:#0d2f6e">Checksheets — ${esc(cp.partNumber)}</h2>
      <p style="font-size:12px;color:#6b7280">${esc(cp.partName)} · ${esc(cp.cpNumber)}</p>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
    ${[
      ['📋 In-Process Inspection Sheet','IPS',ipsChars.length,`IPS-${cp.partNumber}-REV-${cp.revision}`,'#0d2f6e'],
      ['🔍 Final Inspection Sheet','FIS',fisChars.length,`FIS-${cp.partNumber}-REV-${cp.revision}`,'#16a34a'],
      ['📦 Packing Checklist','PCL',pclChars.length,`PCL-${cp.partNumber}-REV-${cp.revision}`,'#7c3aed'],
    ].map(([title,type,count,docNum,color])=>`
      <div class="card" style="border-top:3px solid ${color}">
        <div style="padding:16px">
          <div style="font-size:15px;font-weight:700;margin-bottom:4px">${title}</div>
          <div style="font-family:monospace;font-size:11px;color:${color};margin-bottom:8px">${docNum}</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:12px">${count} characteristics</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-p btn-sm" onclick="QMS2.fillChecksheet('${type}',${cpId})">📝 Fill Sheet</button>
            <button class="btn btn-o btn-sm" onclick="QMS2.printChecksheet('${type}',${cpId})">🖨 Print Blank</button>
          </div>
        </div>
      </div>`).join('')}
  </div>

  <div class="card">
    <div class="ch"><h5>Filled Records</h5></div>
    <div class="cb" id="cs-records-list" style="padding:12px">
      <div style="color:#9ca3af;font-size:12px">Loading...</div>
    </div>
  </div>`);

  // Load records
  const records = await GET(`/api/qms2/cs_records?cpId=${cpId}`);
  const el = document.getElementById('cs-records-list');
  if(el){
    if(records.length===0){
      el.innerHTML='<div style="color:#9ca3af;font-size:12px">No filled records yet.</div>';
    } else {
      el.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc">
          ${['Type','Date','Shift','Machine/Operator','Lot No.','Results',''].map(h=>`<th style="padding:8px;text-align:left;font-weight:600;color:#374151">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${records.map(r=>`<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:8px">${badge(r.type,'#7c3aed')}</td>
            <td style="padding:8px">${fmtDate(r.date)}</td>
            <td style="padding:8px">${esc(r.shift||'—')}</td>
            <td style="padding:8px">${esc(r.operator||'—')}</td>
            <td style="padding:8px">${esc(r.lotNumber||'—')}</td>
            <td style="padding:8px">${(r.results||[]).length} entries</td>
            <td style="padding:8px">
              <button class="btn btn-xs btn-o" onclick="QMS2.viewCsRecord(${r.id})">View</button>
              <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626" onclick="QMS2.deleteCsRecord(${r.id},${cpId})">✕</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    }
  }
}

async function fillChecksheet(type, cpId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);

  const stepMap = {
    'IPS': ['Melting','Die Casting','Machining'],
    'FIS': ['Final Inspection'],
    'PCL': ['Packing & Dispatch']
  };
  const typeLabels = {'IPS':'In-Process Inspection Sheet','FIS':'Final Inspection Sheet','PCL':'Packing Checklist'};
  const filtered = chars.filter(c=>stepMap[type].includes(c.processStep));

  const modal = document.createElement('div');
  modal.id = 'cs-fill-modal';
  modal.style.cssText='position:fixed;inset:0;background:#0006;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML=`
  <div style="background:#fff;border-radius:12px;width:100%;max-width:800px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px #0003">
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
      <div>
        <h4 style="font-size:15px;font-weight:700;color:#0d2f6e">${typeLabels[type]}</h4>
        <div style="font-size:11px;color:#6b7280">${esc(cp?.partNumber)} — ${esc(cp?.partName)}</div>
      </div>
      <button onclick="document.getElementById('cs-fill-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">✕</button>
    </div>
    <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div><label class="lbl">Date</label><input class="inp" id="cs-date" type="date" value="${today()}"></div>
      <div><label class="lbl">Shift</label><select class="inp" id="cs-shift"><option>A</option><option>B</option><option>C</option></select></div>
      <div><label class="lbl">Lot Number</label><input class="inp" id="cs-lot" placeholder="LOT-2026-001"></div>
      ${type==='IPS'?`
        <div><label class="lbl">Machine</label><select class="inp" id="cs-machine"><option>LK 280T</option><option>LK 400T</option></select></div>
        <div><label class="lbl">Operator</label><input class="inp" id="cs-operator" placeholder="Operator name"></div>
        <div><label class="lbl">Inspector</label><input class="inp" id="cs-inspector" placeholder="Inspector name"></div>
      `:type==='FIS'?`
        <div><label class="lbl">Inspector</label><input class="inp" id="cs-inspector" placeholder="Inspector name"></div>
        <div><label class="lbl">Quantity</label><input class="inp" id="cs-qty" type="number" placeholder="0"></div>
        <div></div>
      `:`
        <div><label class="lbl">Packed by</label><input class="inp" id="cs-operator" placeholder="Name"></div>
        <div><label class="lbl">Quantity</label><input class="inp" id="cs-qty" type="number" placeholder="0"></div>
        <div></div>
      `}
    </div>
    <div style="padding:0 16px 16px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px;text-align:left;font-weight:600">#</th>
          <th style="padding:8px;text-align:left;font-weight:600">Characteristic</th>
          <th style="padding:8px;text-align:left;font-weight:600">Specification</th>
          <th style="padding:8px;text-align:left;font-weight:600">Actual / Result</th>
          <th style="padding:8px;text-align:center;font-weight:600">Status</th>
        </tr></thead>
        <tbody>
          ${filtered.map((c,i)=>`<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:8px;color:#9ca3af">${i+1}</td>
            <td style="padding:8px;font-weight:500">${esc(c.charName)}</td>
            <td style="padding:8px;color:#6b7280">${esc(c.specification)}${c.tolerance?' '+esc(c.tolerance):''}</td>
            <td style="padding:8px"><input class="inp" id="cs-actual-${c.id}" placeholder="Enter value" style="padding:4px 8px;font-size:12px" oninput="QMS2.autoStatus(${c.id})"></td>
            <td style="padding:8px;text-align:center">
              <select id="cs-status-${c.id}" class="inp" style="padding:3px 6px;font-size:11px;width:auto">
                <option value="OK">✓ OK</option>
                <option value="NG">✗ NG</option>
                <option value="NA">N/A</option>
              </select>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:0 16px 16px;display:flex;gap:8px">
      <button class="btn btn-p" onclick="QMS2.saveCsRecord('${type}',${cpId},[${filtered.map(c=>c.id).join(',')}])">💾 Save Record</button>
      <button class="btn btn-o" onclick="document.getElementById('cs-fill-modal').remove()">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

function autoStatus(charId){
  // Simple heuristic — if value entered, default OK
  const val = document.getElementById(`cs-actual-${charId}`)?.value?.trim();
  const sel = document.getElementById(`cs-status-${charId}`);
  if(sel && val) sel.value = 'OK';
}

async function saveCsRecord(type, cpId, charIds){
  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);
  const results = charIds.map(id=>{
    const c = chars.find(x=>x.id===id)||{};
    return {
      charId: id, charName: c.charName||'', spec: c.specification||'',
      actual: document.getElementById(`cs-actual-${id}`)?.value||'',
      result: document.getElementById(`cs-status-${id}`)?.value||'OK',
    };
  });

  const rec = {
    cpId, type, date: document.getElementById('cs-date')?.value||today(),
    shift: document.getElementById('cs-shift')?.value||'A',
    lotNumber: document.getElementById('cs-lot')?.value||'',
    machine: document.getElementById('cs-machine')?.value||'',
    operator: document.getElementById('cs-operator')?.value||'',
    inspector: document.getElementById('cs-inspector')?.value||'',
    quantity: document.getElementById('cs-qty')?.value||'',
    results,
  };
  await POST('/api/qms2/cs_records', rec);
  document.getElementById('cs-fill-modal')?.remove();
  toast('Checksheet saved ✅','s');
  renderChecksheets(cpId);
}

async function viewCsRecord(recId){
  const recs = await GET('/api/qms2/cs_records');
  const rec = recs.find(r=>r.id===recId);
  if(!rec) return;
  const typeLabels = {'IPS':'In-Process Inspection','FIS':'Final Inspection','PCL':'Packing Checklist'};
  const okCount = (rec.results||[]).filter(r=>r.result==='OK').length;
  const ngCount = (rec.results||[]).filter(r=>r.result==='NG').length;
  alert(`${typeLabels[rec.type]||rec.type}\nDate: ${rec.date} | Shift: ${rec.shift}\nLot: ${rec.lotNumber||'—'}\nResults: ${okCount} OK, ${ngCount} NG`);
}

async function deleteCsRecord(recId, cpId){
  if(!confirm('Delete this checksheet record?')) return;
  await DEL(`/api/qms2/cs_records/${recId}`);
  toast('Deleted','d'); renderChecksheets(cpId);
}

// ── Print CP ──────────────────────────────────────────────────────────
async function printCP(cpId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);
  const revs = await GET(`/api/qms2/cp_revisions?cpId=${cpId}`);
  if(!cp) return;

  const byStep = {};
  PROCESS_STEPS.forEach(s=>{ byStep[s]=[]; });
  chars.forEach(c=>{ if(byStep[c.processStep]) byStep[c.processStep].push(c); else byStep[c.processStep]=[c]; });

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${cp.cpNumber}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:16px;color:#111}
    h1{font-size:16px;margin:0} h2{font-size:13px;margin:8px 0 4px}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}
    th,td{border:1px solid #999;padding:5px 7px;vertical-align:top}
    th{background:#1e3a5f;color:#fff;font-weight:600;font-size:10.5px}
    .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin-bottom:14px}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#dcfce7;color:#16a34a;border:1px solid #86efac}
    .step-header{background:#1e3a5f;color:#fff;padding:5px 8px;font-weight:700;font-size:11px;margin:10px 0 0}
    @media print{body{padding:8px} button{display:none}}
  </style>
  </head><body>
  <button onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print</button>
  <div class="header">
    <div>
      <div style="font-size:10px;font-weight:700;color:#1e3a5f;letter-spacing:1px">V R ALUCAST</div>
      <h1>CONTROL PLAN</h1>
      <div style="font-size:10px;color:#555">Document No: <b>${cp.cpNumber}</b> | Rev: <b>${cp.revision}</b> | Status: <span class="badge">${cp.status}</span></div>
    </div>
    <table style="width:320px;margin-bottom:0;font-size:10.5px">
      <tr><td><b>Part Number</b></td><td>${cp.partNumber}</td></tr>
      <tr><td><b>Part Name</b></td><td>${cp.partName}</td></tr>
      <tr><td><b>Customer</b></td><td>${cp.customer}</td></tr>
      <tr><td><b>Material Grade</b></td><td>${cp.grade}</td></tr>
      <tr><td><b>Prepared by</b></td><td>${cp.preparedBy||'—'}</td></tr>
      <tr><td><b>Approved by</b></td><td>${cp.approvedBy||'—'}</td></tr>
      <tr><td><b>Date</b></td><td>${cp.createdDate||'—'}</td></tr>
    </table>
  </div>

  ${PROCESS_STEPS.map(step=>{
    const stepChars = byStep[step]||[];
    if(!stepChars.length) return '';
    return `<div class="step-header">${step}</div>
    <table>
      <thead><tr>
        <th>#</th><th>Characteristic</th><th>Specification</th><th>Tolerance</th>
        <th>Inspection Method</th><th>Frequency</th><th>Reaction Plan</th>
      </tr></thead>
      <tbody>
        ${stepChars.map((c,i)=>`<tr ${c.source==='custom'?'style="background:#fffbeb"':''}>
          <td>${i+1}</td>
          <td>${c.source==='custom'?'★ ':''}${c.charName}</td>
          <td>${c.specification}</td>
          <td>${c.tolerance||'—'}</td>
          <td>${c.method}</td>
          <td>${c.frequency}</td>
          <td>${c.reaction}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }).join('')}

  <h2 style="margin-top:16px">Revision History</h2>
  <table>
    <thead><tr><th>Rev</th><th>Date</th><th>Changed by</th><th>Summary</th></tr></thead>
    <tbody>
      ${revs.map(r=>`<tr><td>${r.revision}</td><td>${r.date}</td><td>${r.changedBy}</td><td>${r.summary}</td></tr>`).join('')}
    </tbody>
  </table>

  <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;text-align:center">
    ${['Prepared by','Reviewed by','Approved by'].map(r=>`<div>
      <div style="border-top:1px solid #999;padding-top:4px;font-size:10px">${r}</div>
    </div>`).join('')}
  </div>
  </body></html>`);
  win.document.close();
}

async function printChecksheet(type, cpId){
  const cps = await GET('/api/qms2/cp_parts');
  const cp = cps.find(c=>c.id===cpId);
  const chars = await GET(`/api/qms2/cp_chars?cpId=${cpId}`);
  const stepMap = {
    'IPS':['Melting','Die Casting','Machining'],
    'FIS':['Final Inspection'],
    'PCL':['Packing & Dispatch']
  };
  const typeLabels = {'IPS':'IN-PROCESS INSPECTION SHEET','FIS':'FINAL INSPECTION SHEET','PCL':'PACKING CHECKLIST'};
  const docNum = `${type}-${cp.partNumber}-REV-${cp.revision}`;
  const filtered = chars.filter(c=>stepMap[type].includes(c.processStep));

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${docNum}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th,td{border:1px solid #999;padding:5px 7px}
    th{background:#1e3a5f;color:#fff;font-weight:600}
    .header-box{border:2px solid #1e3a5f;padding:10px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
    .field{border-bottom:1px solid #999;min-height:22px;margin-bottom:2px}
    .field-label{font-size:9px;color:#555}
    @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print</button>
  <div style="text-align:center;border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:12px">
    <div style="font-weight:700;font-size:10px;letter-spacing:1px">V R ALUCAST</div>
    <div style="font-size:16px;font-weight:700">${typeLabels[type]}</div>
    <div style="font-size:10px">Doc No: <b>${docNum}</b></div>
  </div>
  <div class="header-box">
    <div><div class="field-label">Part Number</div><div class="field">${cp.partNumber}</div></div>
    <div><div class="field-label">Part Name</div><div class="field">${cp.partName}</div></div>
    <div><div class="field-label">Date</div><div class="field">&nbsp;</div></div>
    <div><div class="field-label">Customer</div><div class="field">${cp.customer}</div></div>
    <div><div class="field-label">Lot Number</div><div class="field">&nbsp;</div></div>
    <div><div class="field-label">Shift</div><div class="field">&nbsp;</div></div>
    ${type==='IPS'?`
    <div><div class="field-label">Machine</div><div class="field">&nbsp;</div></div>
    <div><div class="field-label">Operator</div><div class="field">&nbsp;</div></div>
    <div><div class="field-label">Inspector</div><div class="field">&nbsp;</div></div>
    `:type==='FIS'?`
    <div><div class="field-label">Inspector</div><div class="field">&nbsp;</div></div>
    <div><div class="field-label">Quantity Inspected</div><div class="field">&nbsp;</div></div>
    <div></div>
    `:`
    <div><div class="field-label">Packed by</div><div class="field">&nbsp;</div></div>
    <div><div class="field-label">Quantity</div><div class="field">&nbsp;</div></div>
    <div></div>
    `}
  </div>
  <table>
    <thead><tr>
      <th style="width:30px">#</th>
      <th>Characteristic</th>
      <th>Specification / Tolerance</th>
      <th>Method</th>
      <th>Frequency</th>
      <th style="width:80px">Actual</th>
      <th style="width:60px">Result</th>
      <th style="width:60px">Remarks</th>
    </tr></thead>
    <tbody>
      ${filtered.map((c,i)=>`<tr>
        <td style="text-align:center">${i+1}</td>
        <td>${c.charName}</td>
        <td>${c.specification}${c.tolerance?' / '+c.tolerance:''}</td>
        <td>${c.method}</td>
        <td>${c.frequency}</td>
        <td>&nbsp;</td>
        <td style="text-align:center">&nbsp;</td>
        <td>&nbsp;</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;text-align:center;margin-top:20px">
    ${['Inspector','Supervisor','QC Manager'].map(r=>`<div>
      <div style="border-top:1px solid #999;padding-top:4px;font-size:10px">${r}</div>
    </div>`).join('')}
  </div>
  </body></html>`);
  win.document.close();
}

// ── Grade Master UI ───────────────────────────────────────────────────
async function renderGradeMaster(){
  const grades = await GET('/api/qms2/grades');
  setContent(`
  <div class="ph">
    <div>
      <button class="btn btn-o btn-sm" onclick="QMS2.renderDashboard()" style="margin-bottom:6px">← Back</button>
      <h2 style="font-size:16px;font-weight:700;color:#0d2f6e">Grade Master</h2>
      <p style="font-size:12px;color:#6b7280">Material grade compositions and acceptance criteria</p>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
    ${grades.map(g=>{
      const comp = g.composition||{};
      return `<div class="card">
        <div class="ch" style="background:#f8fafc">
          <div>
            <span style="font-weight:700;font-size:15px;color:#0d2f6e">${esc(g.grade)}</span>
            <span style="font-size:11px;color:#6b7280;margin-left:8px">${esc(g.standard||'')}</span>
          </div>
        </div>
        <div class="cb" style="padding:12px">
          <table style="width:100%;font-size:11.5px;border-collapse:collapse;margin-bottom:10px">
            ${Object.entries(comp).map(([el,v])=>`<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:3px 6px;font-weight:600;width:40px">${el}</td>
              <td style="padding:3px 6px;color:#374151">${v}</td>
            </tr>`).join('')}
          </table>
          <div style="font-size:11px;display:grid;gap:3px">
            <div>🌡 Metal Temp: <b>${esc(g.metalTempRange||'—')}</b></div>
            <div>💪 Tensile: <b>${esc(g.tensileStrength||'—')}</b></div>
            <div>⚙️ Hardness: <b>${esc(g.hardness||'—')}</b></div>
            <div style="color:#6b7280;margin-top:4px">${esc(g.acceptanceCriteria||'')}</div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`);
}

// ── Public API ────────────────────────────────────────────────────────
return {
  renderDashboard, renderNewPart, renderPfmeaList, renderPfmeaPart,
  renderCpList, renderCpView, renderCpForPart, renderCpEdit,
  renderChecksheets, renderGradeMaster,
  savePart, onGradeSelect, savePfmeaRow, deletePfmeaRow,
  addPfmeaRow, editPfmeaRow, showPfmeaRowModal, calcRPN,
  addChar, editChar, saveChar, deleteChar,
  submitCpForReview, approveCP, newRevision, generateCP, deleteCP, deletePart,
  fillChecksheet, saveCsRecord, viewCsRecord, deleteCsRecord, autoStatus,
  printCP, printChecksheet,
};
})();

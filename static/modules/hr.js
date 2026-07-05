// VRA DMS — HR MODULE

// ══════════════════════════════════════════════════════
//  HR & TRAINING MODULE
// ══════════════════════════════════════════════════════

// ── NUMBERING ─────────────────────────────────────────
async function nextTRNum(year){
  const y=year||new Date().getFullYear();
  const all=await db.hrTrainings.toArray().catch(()=>[]);
  const forYear=all.filter(t=>t.trNumber&&t.trNumber.includes(`TR-${y}-`));
  const n=forYear.length+1;
  return `TR-${y}-${String(n).padStart(3,'0')}`;
}

async function hrRefreshTRNum(){
  const y=parseInt(document.getElementById('tr-year')?.value)||new Date().getFullYear();
  const newNum=await nextTRNum(y);
  const numEl=document.getElementById('tr-num');
  const prevEl=document.getElementById('tr-num-preview');
  if(numEl) numEl.value=newNum;
  if(prevEl) prevEl.textContent=newNum;
}
// ── DEDUPLICATE SKILLS (run on each matrix open) ──────
async function hrDeduplicateSkills(){
  const all = await db.hrSkillDefs.toArray().catch(()=>[]);
  const seen = {}; // key: category+name → first id
  const toDelete = [];
  const remap = {}; // deletedId → keepId
  for(const s of all.sort((a,b)=>a.id-b.id)){
    const key = s.category + '||' + s.skillName.trim().toLowerCase();
    if(seen[key] !== undefined){
      toDelete.push(s.id);
      remap[s.id] = seen[key];
    } else {
      seen[key] = s.id;
    }
  }
  if(!toDelete.length) return;
  // Remap hrSkillMatrix entries pointing to deleted skill ids
  for(const [delId, keepId] of Object.entries(remap)){
    const entries = await db.hrSkillMatrix.where('skillId').equals(parseInt(delId)).toArray().catch(()=>[]);
    for(const entry of entries){
      // Only keep if no entry for keepId+empId already exists
      const exists = await db.hrSkillMatrix.where({empId:entry.empId, skillId:keepId}).first().catch(()=>null);
      if(!exists) await db.hrSkillMatrix.update(entry.id, {skillId:keepId});
      else await db.hrSkillMatrix.delete(entry.id);
    }
    await db.hrSkillDefs.delete(parseInt(delId));
  }
  console.log(`HR: removed ${toDelete.length} duplicate skill(s)`);
}

// ── SEEDING DEFAULT SKILLS ────────────────────────────
async function hrSeedDefaults(){
  if(await db.hrSkillDefs.count().catch(()=>0)) return;
  const staffSkills=[
    'Education Qualification','Work Experience','Computer Awareness','ISO/IATF Awareness',
    'Drawing Reading','Man Power Handling','PDC Knowledge','Communication Skill',
    'Die Setting','Instrument Handling','Inspection Knowledge','Accounts Knowledge',
    'Marketing Knowledge','Maintenance Knowledge','Stores / Purchase Knowledge',
    '5S & Housekeeping','Safety Knowledge'
  ];
  const workerSkills=[
    'ISO Awareness','CNC/VMC Machining','Job Setting','Instrument / Gauge Reading',
    'On Time Reporting','5S Awareness','CNC/VMC Offset','Record Keeping',
    'Control Plan Reading','Daily Preventive Maintenance','Material Handling',
    'Communication Skills','Discipline','Conventional Machine Operating',
    'Inspection Knowledge','Packing & Dispatch','Safety Knowledge'
  ];
  for(const s of staffSkills) await db.hrSkillDefs.add({category:'Staff',skillName:s});
  for(const s of workerSkills) await db.hrSkillDefs.add({category:'Worker',skillName:s});
}

// ── HELPERS ───────────────────────────────────────────
function hrLevelBadge(l){
  if(l===null||l===undefined||l==='') return`<span class="badge bd">—</span>`;
  if(l===-1||l==='N') return`<span class="badge bd">N/R</span>`;
  if(l===0) return`<span class="badge br">0</span>`;
  if(l===1) return`<span class="badge bp">1</span>`;
  if(l===2) return`<span class="badge ba">2</span>`;
  return`<span class="badge bd">${l}</span>`;
}
function hrCatLabel(cat){ return cat==='Staff'?'White Collar':'Blue Collar'; }
function hrTrStatusBadge(s){
  const m={Scheduled:'bp',Completed:'ba',Postponed:'bd',Cancelled:'br'};
  return`<span class="badge ${m[s]||'bd'}">${s}</span>`;
}

// shared print CSS for HR module (B&W, matches DMS style)
function hrPrintCSS(){
  return `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Arial',sans-serif;font-size:9.5pt;color:#000;background:#fff}
@page{size:A4;margin:14mm 15mm 18mm 15mm}
table.wrap{width:100%;border-collapse:collapse}
table.wrap>thead>tr>td{padding-bottom:7px;border-bottom:2px solid #000}
table.wrap>tfoot>tr>td{padding-top:5px;border-top:1px solid #000;font-size:7.5pt;color:#444}
table.wrap>tbody>tr>td{padding-top:10px;vertical-align:top}
table.hdr{width:100%;border-collapse:collapse}
table.hdr td{border:none;padding:2px 0;vertical-align:top}
.hdr-co{font-size:12pt;font-weight:bold;line-height:1.3}
.hdr-sub{font-size:7.5pt;color:#555;margin-top:1px}
.hdr-title{font-size:11pt;font-weight:bold;text-align:center}
.hdr-type{font-size:8pt;color:#555;text-align:center;margin-top:2px}
.hdr-meta{font-size:8.5pt;text-align:right;line-height:1.6}
.hdr-info{font-size:7.5pt;color:#444;border-top:1px solid #ccc;padding-top:4px;margin-top:4px;display:flex;gap:16px}
table.ftr{width:100%;border-collapse:collapse}
table.ftr td{border:none;padding:0;vertical-align:middle;font-size:7.5pt;color:#444}
h2{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1.5px solid #000;padding-bottom:3px;margin:14px 0 7px}
table.data{width:100%;border-collapse:collapse;font-size:8.5pt;margin:6px 0}
table.data th{background:#ececec;font-weight:bold;padding:5px 8px;border:1px solid #000;text-align:left}
table.data td{padding:5px 8px;border:1px solid #000;vertical-align:top}
table.data tr:nth-child(even) td{background:#f7f7f7}
.mono{font-family:'Courier New',monospace;font-weight:bold;color:#000}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
}

function hrPrintHeader(docNum,rev,title,subtitle,today){
  return `<table class="wrap">
  <thead><tr><td>
    <table class="hdr"><tr>
      <td style="width:30%"><div class="hdr-co">V R ALUCAST</div><div class="hdr-sub">High Pressure Die Casting &nbsp;|&nbsp; ISO 9001 Certified</div></td>
      <td style="width:40%"><div class="hdr-title">${title}</div><div class="hdr-type">${subtitle}</div></td>
      <td style="width:30%"><div class="hdr-meta"><b>Doc No:</b> ${docNum}<br><b>Revision:</b> ${rev}<br><b>Date:</b> ${today}</div></td>
    </tr>
    <tr><td colspan="3"><div class="hdr-info"><span><b>Prepared by:</b> Akshay Dake</span><span><b>Approved by:</b> Akshay Dake</span></div></td></tr>
    </table>
  </td></tr></thead>
  <tfoot><tr><td>
    <table class="ftr"><tr>
      <td>${docNum} &nbsp;|&nbsp; Rev ${rev}</td>
      <td style="text-align:center">V R ALUCAST — CONFIDENTIAL</td>
      <td style="text-align:right">V R Alucast</td>
    </tr></table>
  </td></tr></tfoot>
  <tbody><tr><td>`;
}

// ══════════════════════════════════════════════════════
//  SKILL MANAGEMENT (Add/Remove skills — modal)
// ══════════════════════════════════════════════════════
async function hrManageSkills(){
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const staffSkills=skills.filter(s=>s.category==='Staff');
  const workerSkills=skills.filter(s=>s.category==='Worker');

  function skillRows(list,cat){
    return list.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--border)">
      <span style="font-size:12.5px">${esc(s.skillName)}</span>
      <button class="btn btn-r btn-xs" onclick="hrDeleteSkill(${s.id})">🗑️ Remove</button>
    </div>`).join('');
  }

  const ov=document.createElement('div');ov.className='overlay';ov.id='hr-skill-ov';
  ov.innerHTML=`<div class="modal" style="width:560px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>⚙️ Manage Skills / Competencies</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('hr-skill-ov').remove()">✕ Close</button>
    </div>
    <div class="alert al-w" style="margin-bottom:12px">Adding or removing skills applies to ALL designations. Existing skill matrix data for removed skills will be preserved until manually cleared.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div>
        <div style="font-weight:700;font-size:12px;color:var(--navy);margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid var(--navy)">White Collar Skills (${staffSkills.length})</div>
        <div id="staff-skills-list" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:8px">
          ${skillRows(staffSkills,'Staff')}
        </div>
        <div style="display:flex;gap:5px">
          <input class="fc" id="new-staff-skill" placeholder="Add new skill..." style="font-size:12px">
          <button class="btn btn-p btn-sm" onclick="hrAddSkill('Staff')">+ Add</button>
        </div>
      </div>
      <div>
        <div style="font-weight:700;font-size:12px;color:var(--navy);margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid var(--navy)">Blue Collar Skills (${workerSkills.length})</div>
        <div id="worker-skills-list" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:8px">
          ${skillRows(workerSkills,'Worker')}
        </div>
        <div style="display:flex;gap:5px">
          <input class="fc" id="new-worker-skill" placeholder="Add new skill..." style="font-size:12px">
          <button class="btn btn-p btn-sm" onclick="hrAddSkill('Worker')">+ Add</button>
        </div>
      </div>
    </div>
    <div style="margin-top:12px;text-align:right">
      <button class="btn btn-p" onclick="document.getElementById('hr-skill-ov').remove();hrRenderSkillMatrix()">✅ Done — Refresh Matrix</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function hrAddSkill(category){
  const inputId=category==='Staff'?'new-staff-skill':'new-worker-skill';
  const name=document.getElementById(inputId)?.value.trim();
  if(!name){toast('Enter a skill name','d');return;}
  await db.hrSkillDefs.add({category,skillName:name});
  toast(`✅ Skill "${name}" added`);
  document.getElementById(inputId).value='';
  await hrManageSkillsRefreshList(category);
}

async function hrDeleteSkill(id){
  const s=await db.hrSkillDefs.get(id).catch(()=>null);
  if(!confirm(`Remove skill "${s?.skillName}"? Skill matrix data for this skill will remain but won't be shown.`)) return;
  await db.hrSkillDefs.delete(id);
  toast(`Skill removed`,'d');
  await hrManageSkillsRefreshList(s?.category||'Staff');
}

async function hrManageSkillsRefreshList(category){
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const list=skills.filter(s=>s.category===category);
  const containerId=category==='Staff'?'staff-skills-list':'worker-skills-list';
  const el=document.getElementById(containerId);
  if(!el) return;
  el.innerHTML=list.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--border)">
    <span style="font-size:12.5px">${esc(s.skillName)}</span>
    <button class="btn btn-r btn-xs" onclick="hrDeleteSkill(${s.id})">🗑️ Remove</button>
  </div>`).join('');
}

// ══════════════════════════════════════════════════════
//  EMPLOYEE REGISTER
// ══════════════════════════════════════════════════════
async function hrRenderEmployees(){
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  setC(`
  <div class="ph">
    <h2>👤 Employee Register</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="hrOpenEmpForm()">+ Add Employee</button>
      <button class="btn btn-o" onclick="hrPrintEmployeeList()">🖨️ Print List</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>All Employees — ${emps.length} records</h5>
      <div style="font-size:11px;color:var(--muted)">Doc Ref: VRA-HR-001 · Rev 00</div>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Emp Code</th><th>Name</th><th>Category</th><th>Designation</th><th>Education</th><th>Experience</th><th>DOJ</th><th>Status</th><th></th></tr></thead>
      <tbody>${emps.length===0?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">No employees added yet. Click + Add Employee to start.</td></tr>`:
      emps.map(e=>`<tr>
        <td class="mono" style="color:var(--navy);font-weight:700">${esc(e.empCode)}</td>
        <td><strong>${esc(e.name)}</strong></td>
        <td><span class="badge bd">${hrCatLabel(e.category)}</span></td>
        <td>${esc(e.designation)}</td>
        <td>${esc(e.education||'—')}</td>
        <td>${esc(e.experience||'—')}</td>
        <td>${e.doj||'—'}</td>
        <td>${e.status==='Active'?'<span class="badge ba">Active</span>':e.status==='Resigned'?'<span class="badge br">Resigned</span>':'<span class="badge bd">'+esc(e.status)+'</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-o btn-xs" onclick="hrOpenEmpForm(${e.id})">✏️ Edit</button>
          <button class="btn btn-r btn-xs" onclick="hrDeleteEmp(${e.id})">🗑️</button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>
  <div class="muted" style="margin-top:6px">Legend — 0 = Training Identified · 1 = Can Perform · 2 = Expert / Can Train · N/R = Not Required</div>
  `);
}

async function hrOpenEmpForm(id=null){
  const e=id?await db.hrEmployees.get(id).catch(()=>null):null;
  const allEmps=await db.hrEmployees.toArray().catch(()=>[]);
  const nextCode=`VRA-EMP-${String(allEmps.length+1).padStart(3,'0')}`;
  const staffDesig=['Managing Partner','Production In-charge','QA In-charge','Shift Supervisor','QC Inspector'];
  const workerDesig=['CNC Operator','VMC Operator','Conventional Operator','Final Inspector','Helper','PDC Operator'];
  const allDesig=[...staffDesig,...workerDesig];
  const curDesig=e?.designation||'';
  const isCustomDesig=curDesig&&!allDesig.includes(curDesig);
  const ov=document.createElement('div');ov.className='overlay';ov.id='hr-emp-ov';
  ov.innerHTML=`<div class="modal" style="width:520px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${e?'Edit Employee':'Add Employee'}</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('hr-emp-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Employee Code</label>
        <input class="fc mono" id="hre-code" value="${esc(e?.empCode||nextCode)}"></div>
      <div class="fg"><label class="lbl">Full Name *</label>
        <input class="fc" id="hre-name" value="${esc(e?.name||'')}" placeholder="Full name"></div>
      <div class="fg"><label class="lbl">Category *</label>
        <select class="fc" id="hre-cat" onchange="hrUpdateDesigOptions()">
          <option value="Staff" ${e?.category==='Staff'?'selected':''}>White Collar</option>
          <option value="Worker" ${e?.category==='Worker'?'selected':''}>Blue Collar</option>
        </select></div>
      <div class="fg"><label class="lbl">Designation *</label>
        <select class="fc" id="hre-desig" onchange="hrToggleCustomDesig()">
          ${allDesig.map(d=>`<option value="${d}" ${!isCustomDesig&&curDesig===d?'selected':''}>${d}</option>`).join('')}
          <option value="__other__" ${isCustomDesig?'selected':''}>Other / Custom…</option>
        </select>
        <input class="fc" id="hre-custom-desig" value="${esc(isCustomDesig?curDesig:'')}" placeholder="Enter designation"
          style="margin-top:6px;display:${isCustomDesig?'block':'none'}">
      </div>
      <div class="fg"><label class="lbl">Education</label>
        <input class="fc" id="hre-edu" value="${esc(e?.education||'')}" placeholder="e.g. BE Mech, ITI, 10th"></div>
      <div class="fg"><label class="lbl">Experience</label>
        <input class="fc" id="hre-exp" value="${esc(e?.experience||'')}" placeholder="e.g. 5 Years"></div>
      <div class="fg"><label class="lbl">Date of Joining</label>
        <input class="fc" type="date" id="hre-doj" value="${e?.doj||''}"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="hre-status">
          <option value="Active" ${(e?.status||'Active')==='Active'?'selected':''}>Active</option>
          <option value="Resigned" ${e?.status==='Resigned'?'selected':''}>Resigned</option>
          <option value="On Leave" ${e?.status==='On Leave'?'selected':''}>On Leave</option>
        </select></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Notes</label>
        <input class="fc" id="hre-notes" value="${esc(e?.notes||'')}" placeholder="Phone, email, or any notes"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('hr-emp-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="hrSaveEmp(${id||'null'})">💾 Save</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  hrUpdateDesigOptions(e?.category);
}

function hrToggleCustomDesig(){
  const sel=document.getElementById('hre-desig');
  const inp=document.getElementById('hre-custom-desig');
  if(sel&&inp) inp.style.display=sel.value==='__other__'?'block':'none';
}

function hrUpdateDesigOptions(forceCategory){
  const cat=forceCategory||document.getElementById('hre-cat')?.value||'Staff';
  const staffDesig=['Managing Partner','Production In-charge','QA In-charge','Shift Supervisor','QC Inspector'];
  const workerDesig=['CNC Operator','VMC Operator','Conventional Operator','Final Inspector','Helper','PDC Operator'];
  const list=cat==='Staff'?staffDesig:workerDesig;
  const opts=list.map(d=>`<option value="${d}">${d}</option>`).join('');
  const el=document.getElementById('hre-desig');
  if(el){ el.innerHTML=opts+`<option value="__other__">Other / Custom…</option>`; }
  hrToggleCustomDesig();
}

async function hrSaveEmp(id){
  const name=document.getElementById('hre-name').value.trim();
  if(!name){toast('Employee name is required','d');return;}
  const desigRaw=document.getElementById('hre-desig').value;
  const designation=desigRaw==='__other__'?document.getElementById('hre-custom-desig').value.trim():desigRaw;
  if(!designation){toast('Designation is required','d');return;}
  const rec={
    empCode:document.getElementById('hre-code').value.trim(),
    name, category:document.getElementById('hre-cat').value,
    designation,
    education:document.getElementById('hre-edu').value.trim(),
    experience:document.getElementById('hre-exp').value.trim(),
    doj:document.getElementById('hre-doj').value,
    status:document.getElementById('hre-status').value,
    notes:document.getElementById('hre-notes').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(id) await db.hrEmployees.update(id,rec);
  else { rec.createdAt=new Date().toISOString(); await db.hrEmployees.add(rec); }
  document.getElementById('hr-emp-ov').remove();
  toast(`✅ ${rec.empCode} saved`); hrRenderEmployees();
}

async function hrDeleteEmp(id){
  const e=await db.hrEmployees.get(id);
  if(!confirm(`Delete ${e?.name}? Skill matrix entries for this employee will also be removed.`)) return;
  await db.hrEmployees.delete(id);
  await db.hrSkillMatrix.where('empId').equals(id).delete().catch(()=>{});
  toast('Deleted','d'); hrRenderEmployees();
}

async function hrPrintEmployeeList(){
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=emps.map((e,i)=>`<tr>
    <td style="text-align:center">${i+1}</td>
    <td class="mono">${e.empCode}</td>
    <td><strong>${e.name}</strong></td>
    <td>${hrCatLabel(e.category)}</td>
    <td>${e.designation}</td>
    <td>${e.education||'—'}</td>
    <td>${e.experience||'—'}</td>
    <td>${e.doj||'—'}</td>
    <td style="font-weight:bold">${e.status||'Active'}</td>
  </tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Employee Register</title><style>${hrPrintCSS()}</style></head><body>
  ${hrPrintHeader('VRA-HR-001','00','EMPLOYEE REGISTER','V R Alucast — All Employees',today)}
  <table class="data">
    <thead><tr><th>#</th><th>Emp Code</th><th>Name</th><th>Category</th><th>Designation</th><th>Education</th><th>Experience</th><th>DOJ</th><th>Status</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="9" style="text-align:center">No records</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${emps.length} employees &nbsp;|&nbsp; Active: ${emps.filter(e=>(e.status||'Active')==='Active').length}</div>
  </td></tr></tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  SKILL MATRIX  (separate overlay window — progress cards)
// ══════════════════════════════════════════════════════
async function hrRenderSkillMatrix(){
  try {
  await hrSeedDefaults();
  await hrDeduplicateSkills();
  const updAt=localStorage.getItem('hr_matrix_updated_at')||'';
  setC(`<div class="ph">
    <h2>📊 Skill Matrix</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span id="mat-updated" style="font-size:11px;color:#6b7280">${updAt?'Last updated: '+updAt:''}</span>
      <button class="btn btn-p" onclick="hrSaveMatrix()">💾 Save &amp; Update</button>
      <button class="btn btn-o" onclick="hrManageSkills()">⚙️ Manage Skills</button>
      <button class="btn btn-o" onclick="hrPrintAllMatrix()">🖨️ Print All</button>
    </div>
  </div>
  <div style="display:flex;gap:0;height:calc(100vh - 130px);min-height:400px">
    <div id="mat-list" style="width:240px;min-width:180px;border-right:1px solid #e5e7eb;overflow-y:auto;background:#f9fafb;flex-shrink:0">
      <div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">Loading…</div>
    </div>
    <div id="mat-detail" style="flex:1;overflow-y:auto;padding:0">
      <div style="padding:60px;text-align:center;color:#9ca3af;font-size:13px">← Select an employee to view their skill matrix</div>
    </div>
  </div>`);
  await _hrRenderMatrixCards();
  } catch(err){ console.error('hrRenderSkillMatrix error:',err); toast('Error: '+err.message,'d'); }
}

async function _hrRenderMatrixCards(){
  const emps=await db.hrEmployees.where('status').equals('Active').toArray().catch(()=>[]);
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const matrix=await db.hrSkillMatrix.toArray().catch(()=>[]);
  const staffEmps=emps.filter(e=>e.category==='Staff');
  const workerEmps=emps.filter(e=>e.category==='Worker');

  const prevIdx=window._hrMatIdx||0;
  window._hrMatEmps=[...staffEmps,...workerEmps];
  window._hrMatSkills=skills;
  window._hrMatMatrix=matrix;

  _hrRenderEmpList();
  if(window._hrMatEmps.length) _hrShowEmpMatrix(prevIdx);
}

function _hrRenderEmpList(){
  const emps=window._hrMatEmps||[];
  const skills=window._hrMatSkills||[];
  const matrix=window._hrMatMatrix||[];
  const list=document.getElementById('mat-list');
  if(!list) return;

  function gapCount(e){
    const empSkills=skills.filter(s=>s.category===e.category);
    return empSkills.filter(s=>{ const m=matrix.find(x=>x.empId===e.id&&x.skillId===s.id); const lv=m?m.level:null; return lv===null||(lv!==-1&&lv<1); }).length;
  }

  const staffEmps=emps.filter(e=>e.category==='Staff');
  const workerEmps=emps.filter(e=>e.category==='Worker');

  function empItem(e,idx){
    const gaps=gapCount(e);
    return`<div id="mat-li-${idx}" onclick="_hrShowEmpMatrix(${idx})" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #e5e7eb;transition:background 0.15s" onmouseover="this.style.background='#eff6ff'" onmouseout="if(window._hrMatIdx!==${idx})this.style.background=''">
      <div style="font-weight:600;font-size:12.5px;color:#111827">${esc(e.name)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:1px">${esc(e.empCode)} · ${esc(e.designation)}</div>
      ${gaps?`<span style="display:inline-block;margin-top:3px;background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px">⚠ ${gaps} gap${gaps>1?'s':''}</span>`
             :`<span style="display:inline-block;margin-top:3px;background:#f0fdf4;color:#15803d;font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px">✓ OK</span>`}
    </div>`;
  }

  let html='';
  if(staffEmps.length){
    html+=`<div style="padding:8px 12px;background:#dbeafe;font-size:10.5px;font-weight:700;color:#1e40af;letter-spacing:0.5px;text-transform:uppercase;position:sticky;top:0">White Collar (${staffEmps.length})</div>`;
    html+=emps.filter(e=>e.category==='Staff').map((e,i)=>empItem(e,emps.indexOf(e))).join('');
  }
  if(workerEmps.length){
    html+=`<div style="padding:8px 12px;background:#dcfce7;font-size:10.5px;font-weight:700;color:#15803d;letter-spacing:0.5px;text-transform:uppercase;position:sticky;top:0">Blue Collar (${workerEmps.length})</div>`;
    html+=emps.filter(e=>e.category==='Worker').map((e,i)=>empItem(e,emps.indexOf(e))).join('');
  }
  if(!emps.length) html='<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">No active employees.</div>';
  list.innerHTML=html;
}

function _hrShowEmpMatrix(idx){
  const emps=window._hrMatEmps||[];
  const skills=window._hrMatSkills||[];
  const matrix=window._hrMatMatrix||[];
  const detail=document.getElementById('mat-detail');
  if(!emps.length||!detail){ return; }
  idx=Math.max(0,Math.min(idx,emps.length-1));

  // Update active highlight in list
  if(window._hrMatIdx!==undefined){
    const prev=document.getElementById('mat-li-'+window._hrMatIdx);
    if(prev) prev.style.background='';
  }
  window._hrMatIdx=idx;
  const active=document.getElementById('mat-li-'+idx);
  if(active) active.style.background='#eff6ff';

  const e=emps[idx];
  const empSkills=skills.filter(s=>s.category===e.category);

  function getLevel(skillId){
    const m=matrix.find(x=>x.empId===e.id&&x.skillId===skillId);
    return m!==undefined?m.level:null;
  }
  function lvBadge(lv){
    if(lv===2)  return{bg:'#dcfce7',fg:'#15803d'};
    if(lv===1)  return{bg:'#dbeafe',fg:'#1d4ed8'};
    if(lv===0)  return{bg:'#fee2e2',fg:'#b91c1c'};
    if(lv===-1) return{bg:'#f3f4f6',fg:'#9ca3af'};
    return{bg:'#fef9c3',fg:'#92400e'};
  }

  const gaps=empSkills.filter(s=>{ const v=getLevel(s.id); return v===null||(v!==-1&&v<1); });
  const rows=empSkills.map((s,i)=>{
    const lv=getLevel(s.id);
    const {bg,fg}=lvBadge(lv);
    const isGap=lv===null||(lv!==-1&&lv<1);
    return`<tr style="background:${i%2?'#f8fafc':'#fff'}${isGap?';outline:1px solid #fca5a5':''}">
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;font-weight:500;color:#111827">${i+1}. ${esc(s.skillName)}</td>
      <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;width:160px">
        <select class="hr-mat-sel" data-eid="${e.id}" data-sid="${s.id}"
          style="width:150px;padding:5px 8px;border:1px solid ${isGap?'#fca5a5':'#d1d5db'};border-radius:6px;background:${bg};color:${fg};font-weight:700;font-size:12px;cursor:pointer">
          <option value="" ${lv===null?'selected':''}>? — Not Assessed</option>
          <option value="-1" ${lv===-1?'selected':''}>N/R — Not Required</option>
          <option value="0" ${lv===0?'selected':''}>0 — Training Needed</option>
          <option value="1" ${lv===1?'selected':''}>1 — Can Perform</option>
          <option value="2" ${lv===2?'selected':''}>2 — Expert</option>
        </select>
      </td>
      <td style="padding:6px 10px;border:1px solid #e5e7eb;width:120px;text-align:center">
        ${isGap
          ?`<span style="background:#fee2e2;color:#b91c1c;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">⚠ Gap</span>`
          :`<span style="background:#f0fdf4;color:#15803d;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">✓ OK</span>`}
      </td>
    </tr>`;
  }).join('');

  detail.innerHTML=`
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;background:${e.category==='Staff'?'#eff6ff':'#f0fdf4'};display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div>
        <div style="font-weight:700;font-size:15px;color:#0d2f6e">${esc(e.name)}</div>
        <div style="font-size:11.5px;color:#64748b;margin-top:2px">${esc(e.designation)} &nbsp;·&nbsp; <span style="font-family:monospace">${esc(e.empCode)}</span> &nbsp;·&nbsp; ${hrCatLabel(e.category)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${gaps.length
          ?`<span style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700">⚠ ${gaps.length} gap${gaps.length>1?'s':''}</span>`
          :`<span style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700">✓ All OK</span>`}
        <button class="btn btn-o btn-sm" onclick="hrPrintOneMatrix(${e.id})">🖨 Print</button>
      </div>
    </div>
    <div style="padding:16px 20px">
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;border:1px solid #e5e7eb;font-size:11px;color:#6b7280">Skill / Competency</th>
          <th style="padding:8px 12px;text-align:center;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;width:160px">Rating</th>
          <th style="padding:8px 12px;text-align:center;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;width:120px">Status</th>
        </tr></thead>
        <tbody>${rows||`<tr><td colspan="3" style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">No skills defined for this category.</td></tr>`}</tbody>
      </table>
      ${gaps.length?`<div style="margin-top:12px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:12px;color:#b91c1c">
        <strong>Training needed:</strong> ${gaps.map(s=>esc(s.skillName)).join(' · ')}
      </div>`:''}
    </div>`;
}

function _hrOpenPrintWindow(html){
  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.target='_blank'; a.rel='noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

async function hrPrintOneMatrix(empId){
  const emps=window._hrMatEmps||[];
  const skills=window._hrMatSkills||[];
  const matrix=window._hrMatMatrix||[];
  const e=emps.find(x=>x.id===empId); if(!e) return;
  const empSkills=skills.filter(s=>s.category===e.category);
  const today=new Date().toLocaleDateString('en-IN');

  function getLevel(skillId){ const m=matrix.find(x=>x.empId===e.id&&x.skillId===skillId); return m!==undefined?m.level:null; }
  function lvText(v){ if(v===null)return'Not Assessed'; if(v===-1)return'Not Required'; if(v===0)return'Training Needed'; if(v===1)return'Can Perform'; return'Expert'; }
  function lvBg(v){ if(v===2)return'#dcfce7'; if(v===1)return'#dbeafe'; if(v===0)return'#fee2e2'; if(v===-1)return'#f3f4f6'; return'#fef9c3'; }
  function lvScore(v){ if(v===null)return'?'; if(v===-1)return'N/R'; return String(v); }

  const gaps=empSkills.filter(s=>{ const v=getLevel(s.id); return v===null||(v!==-1&&v<1); });
  const rows=empSkills.map((s,i)=>{
    const lv=getLevel(s.id);
    const isGap=lv===null||(lv!==-1&&lv<1);
    return`<tr style="background:${isGap?'#fff5f5':i%2?'#f9fafb':'#fff'}">
      <td style="padding:6px 10px;border:1px solid #d1d5db;font-size:9pt">${i+1}. ${esc(s.skillName)}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;font-weight:700;font-size:10pt;background:${lvBg(lv)};width:50px">${lvScore(lv)}</td>
      <td style="padding:6px 10px;border:1px solid #d1d5db;font-size:8.5pt;color:#444">${lvText(lv)}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;width:60px">${isGap?'<span style="color:#b91c1c;font-weight:700">⚠ Gap</span>':'<span style="color:#15803d">✓ OK</span>'}</td>
    </tr>`;
  }).join('');

  const html=`<!DOCTYPE html><html><head><title>Skill Matrix — ${esc(e.name)}</title>
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:10pt;color:#000;padding:20px}
  @page{size:A4 portrait;margin:14mm 15mm 18mm 15mm}
  @media print{body{padding:0}}
  </style></head><body>
  <div style="border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font-size:14pt;font-weight:bold;color:#1e3a5f">V R Alucast — Employee Skill Matrix</div>
      <div style="font-size:9pt;color:#555;margin-top:3px">${e.category==='Staff'?'VRA-HR-002':'VRA-HR-005'} · Printed: ${today}</div>
    </div>
    <div style="font-size:8pt;color:#555">Legend: ? = Not Assessed | 0 = Training Needed | 1 = Can Perform | 2 = Expert | N/R = Not Required</div>
  </div>
  <div style="background:#1e3a5f;color:#fff;padding:10px 14px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-weight:700;font-size:12pt">${esc(e.name)}</div>
      <div style="font-size:9pt;opacity:.85;margin-top:2px">${esc(e.designation)} · ${esc(e.empCode)} · ${e.category==='Staff'?'White Collar':'Blue Collar'}</div>
    </div>
    <div style="font-size:9pt;opacity:.8">${gaps.length?`⚠ ${gaps.length} gap${gaps.length>1?'s':''}`:' All Skills OK'}</div>
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#f1f5f9">
      <th style="padding:7px 10px;border:1px solid #d1d5db;text-align:left;font-size:9pt">Skill / Competency</th>
      <th style="padding:7px 8px;border:1px solid #d1d5db;text-align:center;font-size:9pt;width:50px">Score</th>
      <th style="padding:7px 10px;border:1px solid #d1d5db;text-align:left;font-size:9pt">Status</th>
      <th style="padding:7px 8px;border:1px solid #d1d5db;text-align:center;font-size:9pt;width:60px">Gap</th>
    </tr></thead>
    <tbody>${rows||`<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af">No skills defined.</td></tr>`}</tbody>
  </table>
  ${gaps.length?`<div style="margin-top:12px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;font-size:9pt;color:#b91c1c">
    <strong>Training needed:</strong> ${gaps.map(s=>esc(s.skillName)).join(' · ')}
  </div>`:''}
  <script>window.onload=()=>{ window.print(); }<\/script></body></html>`;
  _hrOpenPrintWindow(html);
}

async function hrPrintAllMatrix(){
  const emps=await db.hrEmployees.where('status').equals('Active').toArray().catch(()=>[]);
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const matrix=await db.hrSkillMatrix.toArray().catch(()=>[]);
  const today=new Date().toLocaleDateString('en-IN');

  function lv(empId,skillId){
    const m=matrix.find(x=>x.empId===empId&&x.skillId===skillId);
    if(!m||m.level===null) return'—';
    if(m.level===-1) return'N/R';
    return String(m.level);
  }
  function lvBg(v){ if(v==='2')return'#dcfce7'; if(v==='1')return'#dbeafe'; if(v==='0')return'#fee2e2'; if(v==='N/R')return'#f3f4f6'; return'#fff'; }

  function matTable(title,docNum,empList,skillList){
    if(!empList.length) return'';
    const skillCols=skillList.map(s=>`<th style="padding:4px 5px;border:1px solid #000;font-size:7.5pt;text-align:center;word-break:break-word;max-width:60px;white-space:normal">${esc(s.skillName)}</th>`).join('');
    const rows=empList.map((e,i)=>`<tr style="${i%2?'background:#f9fafb':''}">
      <td style="padding:4px 8px;border:1px solid #ccc;white-space:nowrap;font-weight:600;font-size:8.5pt">${esc(e.name)}<br><span style="font-size:7pt;font-weight:400;color:#555">${esc(e.empCode)}</span></td>
      <td style="padding:4px 8px;border:1px solid #ccc;font-size:8pt">${esc(e.designation)}</td>
      ${skillList.map(s=>{ const v=lv(e.id,s.id); return`<td style="text-align:center;padding:4px 3px;border:1px solid #ccc;font-weight:700;font-size:9pt;background:${lvBg(v)}">${v}</td>`; }).join('')}
    </tr>`).join('');
    return`<div style="margin-bottom:24px">
      <div style="background:#1e3a5f;color:#fff;padding:6px 12px;font-weight:700;font-size:10pt;display:flex;justify-content:space-between">
        <span>${title}</span><span style="font-weight:400;font-size:8.5pt;opacity:.8">${docNum} · ${empList.length} employees · ${skillList.length} skills · ${today}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
        <thead><tr style="background:#ececec">
          <th style="padding:5px 8px;border:1px solid #000;text-align:left;min-width:100px">Name / Code</th>
          <th style="padding:5px 8px;border:1px solid #000;text-align:left;min-width:90px">Designation</th>
          ${skillCols}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  const staffEmps=emps.filter(e=>e.category==='Staff');
  const workerEmps=emps.filter(e=>e.category==='Worker');
  const staffSkills=skills.filter(s=>s.category==='Staff');
  const workerSkills=skills.filter(s=>s.category==='Worker');

  _hrOpenPrintWindow(`<!DOCTYPE html><html><head><title>Skill Matrix</title>
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:9pt;color:#000;padding:16px}
  @page{size:A4 landscape;margin:12mm 14mm 14mm 14mm}
  @media print{body{padding:0}}
  </style></head><body>
  <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end">
    <div><div style="font-size:13pt;font-weight:bold;color:#1e3a5f">V R Alucast — Skill Matrix Register</div>
    <div style="font-size:8pt;color:#555;margin-top:2px">VRA-HR-002 / VRA-HR-005 · Printed: ${today}</div></div>
    <div style="font-size:8pt;color:#555;border:1px solid #ccc;padding:4px 10px;border-radius:3px">
      <strong>Legend:</strong> &nbsp;— = Not Assessed &nbsp;|&nbsp; 0 = Training Needed &nbsp;|&nbsp; 1 = Can Perform &nbsp;|&nbsp; 2 = Expert &nbsp;|&nbsp; N/R = Not Required
    </div>
  </div>
  ${matTable('White Collar — Skill Matrix','VRA-HR-002',staffEmps,staffSkills)}
  ${matTable('Blue Collar — Skill Matrix','VRA-HR-005',workerEmps,workerSkills)}
  <script>window.onload=()=>window.print()<\/script></body></html>`);
}

async function hrSaveMatrix(){
  const sels=document.querySelectorAll('.hr-mat-sel');
  const allMat=await db.hrSkillMatrix.toArray().catch(()=>[]);
  for(const sel of sels){
    const empId=parseInt(sel.dataset.eid), skillId=parseInt(sel.dataset.sid);
    const raw=sel.value;
    const level=raw===''?null:parseInt(raw);
    const existing=allMat.find(x=>x.empId===empId&&x.skillId===skillId);
    if(existing) await db.hrSkillMatrix.update(existing.id,{level,updatedAt:new Date().toISOString()});
    else if(level!==null) await db.hrSkillMatrix.add({empId,skillId,level,updatedAt:new Date().toISOString()});
  }
  const now=new Date();
  const stamp=now.toLocaleDateString('en-IN')+' '+now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  localStorage.setItem('hr_matrix_updated_at',stamp);
  const el=document.getElementById('mat-updated');
  if(el) el.textContent='Last updated: '+stamp;
  toast(`✅ Skill matrix saved — ${stamp}`);
  // Refresh matrix data and re-render list + current employee
  await _hrRenderMatrixCards();
}

async function hrPrintMatrix(filterTitle,docNum){
  await hrSeedDefaults();
  const emps=await db.hrEmployees.where('status').equals('Active').toArray().catch(()=>[]);
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const matrix=await db.hrSkillMatrix.toArray().catch(()=>[]);
  const today=new Date().toLocaleDateString('en-IN');
  const isStaff=filterTitle.toLowerCase().includes('white');
  const empList=emps.filter(e=>e.category===(isStaff?'Staff':'Worker'));
  const skillList=skills.filter(s=>s.category===(isStaff?'Staff':'Worker'));
  const dn=docNum||(isStaff?'VRA-HR-002':'VRA-HR-005');

  function lv(empId,skillId){
    const m=matrix.find(x=>x.empId===empId&&x.skillId===skillId);
    if(m===undefined||m.level===null) return'—';
    if(m.level===-1) return'N/R';
    return String(m.level);
  }

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Skill Matrix</title>
  <style>${hrPrintCSS()}
  table.sm th{font-size:7.5pt;padding:4px 5px;border:1px solid #000;text-align:center;word-break:break-word;max-width:60px;white-space:normal}
  table.sm td{padding:4px 5px;border:1px solid #000;font-size:8.5pt;text-align:center}
  table.sm td.name{text-align:left;min-width:90px;font-weight:600}
  </style></head><body>
  ${hrPrintHeader(dn,'00',filterTitle,'V R Alucast — Skill Matrix',today)}
  <table class="sm" style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#ececec">
      <th style="text-align:left;min-width:90px">Name / Emp Code</th>
      <th style="text-align:left;min-width:80px">Designation</th>
      ${skillList.map(s=>`<th>${s.skillName}</th>`).join('')}
    </tr></thead>
    <tbody>${empList.map((e,i)=>`<tr style="${i%2===0?'':'background:#f7f7f7'}">
      <td class="name">${e.name}<br><span style="font-size:7pt;font-weight:normal">${e.empCode}</span></td>
      <td style="text-align:left;font-size:7.5pt">${e.designation}</td>
      ${skillList.map(s=>`<td style="font-weight:bold">${lv(e.id,s.id)}</td>`).join('')}
    </tr>`).join('')}</tbody>
  </table>
  <div style="margin-top:8px;font-size:7.5pt;color:#555"><strong>Legend:</strong> 0 = Training Identified &nbsp;|&nbsp; 1 = Can Do Job &nbsp;|&nbsp; 2 = Expert / Can Train &nbsp;|&nbsp; N/R = Not Required</div>
  </td></tr></tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  GAP ANALYSIS
// ══════════════════════════════════════════════════════
async function hrRenderGap(){
  await hrSeedDefaults();
  const emps=await db.hrEmployees.where('status').equals('Active').toArray().catch(()=>[]);
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const matrix=await db.hrSkillMatrix.toArray().catch(()=>[]);

  // Gap = required skill where level is null (never assessed) or 0 (training identified)
  // "Required" = skill exists for this employee's category (all category skills are implicitly required)
  const gaps=[];
  for(const e of emps){
    const empSkills=skills.filter(s=>s.category===e.category);
    for(const s of empSkills){
      const m=matrix.find(x=>x.empId===e.id&&x.skillId===s.id);
      const level=m!==undefined?m.level:null;
      if(level===-1) continue; // N/R — not applicable
      if(level===null||level===0){
        gaps.push({empId:e.id,empCode:e.empCode,empName:e.name,designation:e.designation,
          category:e.category,skillName:s.skillName,skillId:s.id,
          level,status:level===null?'Not Assessed':'Training Identified'});
      }
    }
  }

  const byEmp={};
  gaps.forEach(g=>{
    if(!byEmp[g.empId]) byEmp[g.empId]={empCode:g.empCode,empName:g.empName,designation:g.designation,category:g.category,gaps:[],empId:g.empId};
    byEmp[g.empId].gaps.push(g);
  });

  setC(`
  <div class="ph">
    <h2>🔴 Training Gap Analysis</h2>
    <button class="btn btn-o" onclick="hrPrintGap()">🖨️ Print TNI Report</button>
  </div>
  ${gaps.length===0?`<div class="alert al-s">✅ No gaps identified. All active employees have been assessed and meet required competency levels.</div>`:`
  <div class="alert al-w">⚠️ ${gaps.length} gap(s) across ${Object.keys(byEmp).length} employee(s) — <strong>Training Needed</strong></div>`}
  ${Object.values(byEmp).map(emp=>`
  <div class="card" style="margin-bottom:12px">
    <div class="ch">
      <h5>👤 ${esc(emp.empName)} &nbsp;<span class="muted" style="font-size:11px">${esc(emp.designation)} · ${esc(emp.empCode)} · ${hrCatLabel(emp.category)}</span></h5>
      <span class="badge br">${emp.gaps.length} gap(s)</span>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Skill</th><th>Current Level</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${emp.gaps.map(g=>`<tr>
        <td>${esc(g.skillName)}</td>
        <td>${hrLevelBadge(g.level)}</td>
        <td><span class="badge ${g.status==='Not Assessed'?'bp':'br'}">${g.status}</span></td>
        <td><button class="btn btn-p btn-xs" onclick="hrQuickSchedule(${emp.empId},'${esc(g.skillName).replace(/'/g,"\\'")}')">📅 Schedule Training</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`).join('')}
  ${gaps.length>0?'<div class="muted" style="margin-top:4px">Gap = level 0 (Training Identified) or never assessed for applicable skill. N/R skills are excluded.</div>':''}
  `);
}

async function hrQuickSchedule(empId,skillName){
  const e=await db.hrEmployees.get(empId).catch(()=>null);
  nav('hr-trainings');
  setTimeout(()=>hrOpenTrainingForm(null,e,skillName),300);
}

async function hrPrintGap(){
  await hrSeedDefaults();
  const emps=await db.hrEmployees.where('status').equals('Active').toArray().catch(()=>[]);
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const matrix=await db.hrSkillMatrix.toArray().catch(()=>[]);
  const today=new Date().toLocaleDateString('en-IN');
  const gaps=[];
  for(const e of emps){
    const empSkills=skills.filter(s=>s.category===e.category);
    for(const s of empSkills){
      const m=matrix.find(x=>x.empId===e.id&&x.skillId===s.id);
      const level=m!==undefined?m.level:null;
      if(level===-1) continue;
      if(level===null||level===0) gaps.push({...e,skillName:s.skillName,level,status:level===null?'Not Assessed':'Training Identified'});
    }
  }
  const rows=gaps.map((g,i)=>`<tr>
    <td class="mono">${g.empCode}</td>
    <td><strong>${g.name}</strong></td>
    <td>${hrCatLabel(g.category)}</td>
    <td>${g.designation}</td>
    <td>${g.skillName}</td>
    <td style="text-align:center;font-weight:bold">${g.level===null?'—':g.level}</td>
    <td style="font-weight:bold">${g.status}</td>
    <td></td>
  </tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>TNI Report</title><style>${hrPrintCSS()}</style></head><body>
  ${hrPrintHeader('VRA-HR-003','00','TRAINING NEED IDENTIFICATION (TNI)','V R Alucast — Gap Analysis Report',today)}
  <table class="data">
    <thead><tr><th>Emp Code</th><th>Name</th><th>Category</th><th>Designation</th><th>Skill / Training Need</th><th>Level</th><th>Status</th><th>Target Date</th></tr></thead>
    <tbody>${gaps.length===0?'<tr><td colspan="8" style="text-align:center;padding:12px">No gaps identified</td></tr>':rows}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total gaps: ${gaps.length} &nbsp;|&nbsp; Legend: 0 = Training Identified · — = Not Yet Assessed</div>

  </td></tr></tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  TRAINING REGISTER  (with document linking)
// ══════════════════════════════════════════════════════
async function hrRenderTrainings(){
  const trainings=await db.hrTrainings.toArray().catch(()=>[]);
  trainings.sort((a,b)=>b.id-a.id);
  // Check doc readiness gaps
  const noDocCount=trainings.filter(t=>!t.linkedDocIds?.length&&t.status!=='Cancelled').length;
  setC(`
  <div class="ph">
    <h2>🎓 Training Register</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-p" onclick="hrOpenTrainingForm()">+ New Training Record</button>
      <select class="fc" id="tr-reg-year" style="width:110px;font-size:12.5px">
        <option value="all">All Years</option>
        ${Array.from({length:5},(_,i)=>new Date().getFullYear()-2+i).map(y=>`<option value="${y}" ${y===new Date().getFullYear()?'selected':''}>${y}</option>`).join('')}
      </select>
      <button class="btn btn-o" onclick="hrPrintConsolidatedRegister(document.getElementById('tr-reg-year')?.value)">🖨️ Annual Register</button>
      <button class="btn btn-o" onclick="nav('hr-docsneeded')">📄 Documents Needed</button>
    </div>
  </div>
  ${noDocCount>0?`<div class="alert al-w">⚠️ ${noDocCount} training record(s) have no linked procedure/document. <a style="cursor:pointer;font-weight:700;text-decoration:underline" onclick="nav('hr-docsneeded')">Skill — Doc Map →</a></div>`:''}
  <div class="card">
    <div class="ch"><h5>All Training Records — ${trainings.length} entries</h5>
      <span class="muted" style="font-size:11px">Doc Ref: VRA-TR-001 · Rev 00</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>TR No.</th><th>Topic</th><th>Type</th><th>Trainer</th><th>Date</th><th>Attendees</th><th>Linked Docs</th><th>Effectiveness</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${trainings.length===0?`<tr><td colspan="10" style="text-align:center;padding:30px;color:#9ca3af">No training records yet.</td></tr>`:
      trainings.map(t=>`<tr>
        <td class="mono" style="color:var(--navy);font-weight:700">${esc(t.trNumber)}</td>
        <td><strong>${esc(t.topic)}</strong>${t.skill?`<br><span class="muted" style="font-size:11px">${esc(t.skill)}</span>`:''}
        </td>
        <td>${esc(t.type||'—')}</td>
        <td>${esc(t.trainer||'—')}</td>
        <td>${t.date||'—'}</td>
        <td style="text-align:center"><span class="badge bd">${t.attendeeIds?.length||0}</span></td>
        <td style="text-align:center">${t.linkedDocIds?.length?`<span class="badge ba">${t.linkedDocIds.length} doc(s)</span>`:'<span class="badge br">None</span>'}</td>
        <td style="text-align:center">${t.effectiveness?`<span class="badge ${t.effectiveness==='Satisfactory'?'ba':'br'}">${t.effectiveness}</span>`:'<span class="muted" style="font-size:11px">Pending</span>'}</td>
        <td>${hrTrStatusBadge(t.status||'Completed')}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-o btn-xs" onclick="hrViewTraining(${t.id})">👁️</button>
          <button class="btn btn-o btn-xs" onclick="hrPrintTraining(${t.id})">🖨️</button>
          <button class="btn btn-r btn-xs" onclick="hrDeleteTraining(${t.id})">🗑️</button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>
  `);
}

async function hrOpenTrainingForm(id=null,prefillEmp=null,prefillSkill=null){
  const t=id?await db.hrTrainings.get(id).catch(()=>null):null;
  const emps=await db.hrEmployees.where('status').equals('Active').toArray().catch(()=>[]);
  const allDocs=await DB.listDocs({status:'ACTIVE'});
  const curYear=new Date().getFullYear();
  const numYear=t?.trNumber?parseInt(t.trNumber.split('-')[1])||curYear:curYear;
  const trNum=t?t.trNumber:await nextTRNum(curYear);
  const selIds=t?.attendeeIds||[];
  const prefillIds=prefillEmp?[prefillEmp.id]:[];
  const attIds=selIds.length?selIds:prefillIds;
  const linkedIds=t?.linkedDocIds||[];

  const ov=document.createElement('div');ov.className='overlay';ov.id='hr-tr-ov';
  ov.innerHTML=`<div class="modal" style="width:600px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${t?'Edit':'New'} Training Record &nbsp;<span class="mono" style="color:var(--navy);font-size:12px" id="tr-num-preview">${trNum}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('hr-tr-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Training Year</label>
        <select class="fc" id="tr-year" onchange="hrRefreshTRNum()" ${t?'disabled':''}}>
          ${Array.from({length:5},(_,i)=>curYear-3+i).map(y=>`<option value="${y}" ${y===numYear?'selected':''}}>${y}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">TR Number</label>
        <input class="fc mono" id="tr-num" value="${esc(trNum)}" readonly style="background:#f5f7fd;color:var(--navy);font-weight:700"></div>
      <div class="fg"><label class="lbl">Training Date *</label>
      <div class="fg"><label class="lbl">Training Date *</label>
        <input class="fc" type="date" id="tr-date" value="${t?.date||''}"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Training Topic / Title *</label>
        <input class="fc" id="tr-topic" value="${esc(t?.topic||'')}" placeholder="e.g. 5S Awareness, ISO 9001 Clauses"></div>
      <div class="fg"><label class="lbl">Skill Area</label>
        <input class="fc" id="tr-skill" value="${esc(t?.skill||prefillSkill||'')}" placeholder="e.g. Safety Knowledge"></div>
      <div class="fg"><label class="lbl">Training Type</label>
        <select class="fc" id="tr-type">
          ${['On-Job Training','Classroom','External','Induction','Refresher','Safety Drill','Tool Box Talk'].map(x=>`<option value="${x}" ${(t?.type||'')==x?'selected':''}>${x}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Trainer Name</label>
        <input class="fc" id="tr-trainer" value="${esc(t?.trainer||'Akshay Dake')}"></div>
      <div class="fg"><label class="lbl">Mode</label>
        <select class="fc" id="tr-mode">
          ${['In-house','External Venue','On-the-Job','Online'].map(x=>`<option value="${x}" ${(t?.mode||'')==x?'selected':''}>${x}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Duration</label>
        <input class="fc" id="tr-dur" value="${esc(t?.duration||'')}" placeholder="e.g. 2 Hours, 1 Day"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="tr-status">
          ${['Completed','Scheduled','Postponed','Cancelled'].map(x=>`<option value="${x}" ${(t?.status||'Completed')==x?'selected':''}>${x}</option>`).join('')}
        </select></div>
    </div>

    <div class="fg" style="margin-top:8px"><label class="lbl">Attendees</label>
      <div style="border:1px solid var(--border);border-radius:7px;padding:8px;max-height:150px;overflow-y:auto;background:#fff">
        ${emps.map(e=>`<label style="display:flex;align-items:center;gap:7px;padding:4px 6px;cursor:pointer;border-radius:5px">
          <input type="checkbox" class="tr-att-cb" value="${e.id}" ${attIds.includes(e.id)?'checked':''} style="cursor:pointer">
          <span style="font-size:12.5px"><strong>${esc(e.name)}</strong> <span class="muted" style="font-size:11px">${esc(e.designation)} · ${esc(e.empCode)}</span></span>
        </label>`).join('')}
      </div>
    </div>

    <div class="fg"><label class="lbl">📄 Link Procedure / Document used for this training</label>
      <div style="border:1px solid var(--border);border-radius:7px;padding:8px;max-height:150px;overflow-y:auto;background:#fff">
        ${allDocs.length===0?`<div class="muted" style="padding:8px">No active documents in DMS yet.</div>`:
        allDocs.map(d=>`<label style="display:flex;align-items:center;gap:7px;padding:4px 6px;cursor:pointer;border-radius:5px">
          <input type="checkbox" class="tr-doc-cb" value="${d.id}" ${linkedIds.includes(d.id)?'checked':''} style="cursor:pointer">
          <span style="font-size:12px"><span class="mono" style="color:var(--navy)">${esc(d.docNumber)}</span> — ${esc(d.title)}</span>
        </label>`).join('')}
      </div>
      <div class="muted" style="font-size:11px;margin-top:3px">Link the procedure/WI used during training. Unlinked trainings show in "Documents Needed" report.</div>
    </div>

    <div class="fg"><label class="lbl">Remarks / Content Covered</label>
      <textarea class="fc" id="tr-remarks" rows="2" placeholder="Key topics covered, observations...">${esc(t?.remarks||'')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Training Effectiveness</label>
        <select class="fc" id="tr-eff">
          <option value="" ${!(t?.effectiveness)?'selected':''}>— Pending / Not Evaluated —</option>
          <option value="Satisfactory" ${t?.effectiveness==='Satisfactory'?'selected':''}>Satisfactory</option>
          <option value="Retraining" ${t?.effectiveness==='Retraining'?'selected':''}>Retraining Required</option>
        </select></div>
      <div class="fg"><label class="lbl">Effectiveness Method</label>
        <input class="fc" id="tr-effnotes" value="${esc(t?.effectivenessNotes||'')}" placeholder="e.g. Written test, Observation"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('hr-tr-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="hrSaveTraining(${id||'null'})">💾 Save Training</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function hrSaveTraining(id){
  const topic=document.getElementById('tr-topic').value.trim();
  if(!topic){toast('Training topic is required','d');return;}
  const attIds=Array.from(document.querySelectorAll('.tr-att-cb:checked')).map(c=>parseInt(c.value));
  const docIds=Array.from(document.querySelectorAll('.tr-doc-cb:checked')).map(c=>parseInt(c.value));
  const effRaw=document.getElementById('tr-eff').value;
  const rec={
    trNumber:document.getElementById('tr-num').value.trim(),
    topic, skill:document.getElementById('tr-skill').value.trim(),
    type:document.getElementById('tr-type').value,
    trainer:document.getElementById('tr-trainer').value.trim(),
    mode:document.getElementById('tr-mode').value,
    duration:document.getElementById('tr-dur').value.trim(),
    date:document.getElementById('tr-date').value,
    status:document.getElementById('tr-status').value,
    attendeeIds:attIds, linkedDocIds:docIds,
    remarks:document.getElementById('tr-remarks').value.trim(),
    effectiveness:effRaw||'',
    effectivenessNotes:document.getElementById('tr-effnotes').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(id) await db.hrTrainings.update(id,rec);
  else { rec.createdAt=new Date().toISOString(); await db.hrTrainings.add(rec); }
  toast(`✅ ${rec.trNumber} saved`);
  document.getElementById('hr-tr-ov').remove();
  hrRenderTrainings();
}

async function hrDeleteTraining(id){
  if(!confirm('Delete this training record?')) return;
  await db.hrTrainings.delete(id); toast('Deleted','d'); hrRenderTrainings();
}

async function hrViewTraining(id){
  const t=await db.hrTrainings.get(id).catch(()=>null);
  if(!t) return;
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  const allDocs=await DB.listDocs({});
  const attNames=(t.attendeeIds||[]).map(aid=>{const e=emps.find(x=>x.id===aid);return e?`${e.name} (${e.empCode} · ${e.designation})`:'Unknown';});
  const linkedDocs=(t.linkedDocIds||[]).map(did=>{const d=allDocs.find(x=>x.id===did);return d?`${d.docNumber} — ${d.title}`:'Unknown';});
  const ov=document.createElement('div');ov.className='overlay';ov.id='hr-trv-ov';
  ov.innerHTML=`<div class="modal" style="width:540px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>Training — <span class="mono" style="color:var(--navy)">${esc(t.trNumber)}</span></h3>
      <div style="display:flex;gap:6px">
        <button class="btn btn-o btn-sm" onclick="hrPrintTraining(${t.id})">🖨️ Print</button>
        <button class="btn btn-o btn-sm" onclick="hrOpenTrainingForm(${t.id});document.getElementById('hr-trv-ov').remove()">✏️ Edit</button>
        <button class="btn btn-o btn-sm" onclick="document.getElementById('hr-trv-ov').remove()">✕</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
      <div><span class="muted" style="font-size:11px">Topic</span><br><strong>${esc(t.topic)}</strong></div>
      <div><span class="muted" style="font-size:11px">Skill Area</span><br>${esc(t.skill||'—')}</div>
      <div><span class="muted" style="font-size:11px">Type</span><br>${esc(t.type||'—')}</div>
      <div><span class="muted" style="font-size:11px">Date</span><br>${t.date||'—'}</div>
      <div><span class="muted" style="font-size:11px">Trainer</span><br>${esc(t.trainer||'—')}</div>
      <div><span class="muted" style="font-size:11px">Mode / Duration</span><br>${esc(t.mode||'—')} · ${esc(t.duration||'—')}</div>
      <div><span class="muted" style="font-size:11px">Status</span><br>${hrTrStatusBadge(t.status||'Completed')}</div>
      <div><span class="muted" style="font-size:11px">Effectiveness</span><br>${t.effectiveness?`<strong>${esc(t.effectiveness)}</strong>${t.effectivenessNotes?' — '+esc(t.effectivenessNotes):''}`:'-'}</div>
    </div>
    <div class="dvdr"></div>
    <div><span class="muted" style="font-size:11px">Attendees (${attNames.length})</span>
      <div style="margin-top:5px">${attNames.map(n=>`<div style="padding:3px 0;border-bottom:1px solid var(--border);font-size:12px">${esc(n)}</div>`).join('')||'—'}</div>
    </div>
    ${linkedDocs.length?`<div class="dvdr"></div>
    <div><span class="muted" style="font-size:11px">Linked Documents (${linkedDocs.length})</span>
      <div style="margin-top:5px">${linkedDocs.map(d=>`<div style="padding:3px 0;border-bottom:1px solid var(--border);font-size:12px;font-family:'IBM Plex Mono',monospace">${esc(d)}</div>`).join('')}</div>
    </div>`:''}
    ${t.remarks?`<div class="dvdr"></div><div><span class="muted" style="font-size:11px">Remarks</span><br>${esc(t.remarks)}</div>`:''}
  </div>`;
  document.body.appendChild(ov);
}

async function hrPrintTraining(id){
  const t=await db.hrTrainings.get(id).catch(()=>null);
  if(!t) return;
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  const allDocs=await DB.listDocs({});
  const attEmps=(t.attendeeIds||[]).map(aid=>emps.find(x=>x.id===aid)).filter(Boolean);
  const linkedDocs=(t.linkedDocIds||[]).map(did=>allDocs.find(x=>x.id===did)).filter(Boolean);
  const today=new Date().toLocaleDateString('en-IN');

  const attRows=attEmps.map((e,i)=>`<tr style="height:28px">
    <td style="text-align:center;width:28px">${i+1}</td>
    <td style="font-family:monospace;font-weight:bold;width:90px">${e.empCode}</td>
    <td style="font-weight:600;min-width:110px">${e.name}</td>
    <td style="width:130px">${e.designation}</td>
    <td style="width:90px">${hrCatLabel(e.category)}</td>
    <td style="width:120px"></td>
  </tr>`).join('');

  // Add blank rows to pad attendance sheet to at least 8 rows for walk-ins
  const blankRows=Math.max(0,8-attEmps.length);
  const blankAttRows=Array.from({length:blankRows},(_,i)=>`<tr style="height:28px">
    <td style="text-align:center">${attEmps.length+i+1}</td>
    <td></td><td></td><td></td><td></td><td></td>
  </tr>`).join('');

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${t.trNumber}</title>
<style>
${hrPrintCSS()}
.info-grid{display:grid;grid-template-columns:130px 1fr 130px 1fr;gap:0;border:1px solid #000;margin-bottom:10px}
.info-grid .lbl{background:#ececec;font-weight:bold;font-size:8.5pt;padding:5px 8px;border:1px solid #000}
.info-grid .val{font-size:9pt;padding:5px 8px;border:1px solid #000}
.info-grid .lbl-wide{background:#ececec;font-weight:bold;font-size:8.5pt;padding:5px 8px;border:1px solid #000}
.info-grid .val-wide{font-size:9pt;padding:5px 8px;border:1px solid #000;grid-column:span 3}
.eff-box{border:1px solid #000;padding:10px 14px;margin-top:12px;page-break-inside:avoid}
.eff-box .eff-title{font-weight:bold;font-size:9pt;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #ccc;padding-bottom:5px;margin-bottom:8px}
.sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #000;margin-top:12px;page-break-inside:avoid}
.sig-grid .sh{background:#ececec;font-weight:bold;font-size:8.5pt;padding:5px 8px;text-align:center;border:1px solid #000}
.sig-grid .sn{font-size:8.5pt;padding:5px 8px;text-align:center;border:1px solid #000}
.sig-grid .sl{font-size:8pt;padding:22px 8px 8px;text-align:center;border:1px solid #000;color:#555}
</style></head><body>
${hrPrintHeader('VRA-TR-001','00','TRAINING COMPLETION RECORD','V R Alucast — Training Register',today)}

<div class="info-grid">
  <div class="lbl">TR Number</div><div class="val" style="font-family:monospace;font-weight:bold;color:#000">${t.trNumber}</div>
  <div class="lbl">Date of Training</div><div class="val"><strong>${t.date||'—'}</strong></div>

  <div class="lbl-wide">Training Topic</div><div class="val-wide"><strong>${t.topic}</strong></div>

  <div class="lbl">Skill / Competency</div><div class="val">${t.skill||'—'}</div>
  <div class="lbl">Training Type</div><div class="val">${t.type||'—'}</div>

  <div class="lbl">Trainer Name</div><div class="val">${t.trainer||'—'}</div>
  <div class="lbl">Mode</div><div class="val">${t.mode||'—'}</div>

  <div class="lbl">Duration</div><div class="val">${t.duration||'—'}</div>
  <div class="lbl">No. of Attendees</div><div class="val"><strong>${attEmps.length}</strong></div>

  ${linkedDocs.length?`<div class="lbl">Ref. Document(s)</div><div class="val-wide">${linkedDocs.map(d=>`<span style="font-family:monospace">${d.docNumber}</span> — ${d.title}`).join(' &nbsp;|&nbsp; ')}</div>`:''}

  ${t.remarks?`<div class="lbl-wide">Content / Remarks</div><div class="val-wide">${t.remarks}</div>`:''}
</div>

<h2 style="margin-top:14px">Attendance & Signature Register</h2>
<table class="data" style="font-size:8.5pt">
  <thead><tr>
    <th style="width:28px;text-align:center">#</th>
    <th style="width:90px">Emp Code</th>
    <th>Name</th>
    <th style="width:130px">Designation</th>
    <th style="width:90px">Category</th>
    <th style="width:120px">Signature</th>
  </tr></thead>
  <tbody>${attRows}${blankAttRows}</tbody>
</table>

<div class="eff-box">
  <div class="eff-title">Training Effectiveness Evaluation</div>
  <div style="display:grid;grid-template-columns:160px 1fr 160px 1fr;gap:0;font-size:8.5pt">
    <div style="font-weight:bold;padding:4px 0">Result:</div>
    <div style="padding:4px 8px;border-bottom:1px solid #ccc;font-weight:bold">${t.effectiveness||'___________________________'}</div>
    <div style="font-weight:bold;padding:4px 0;margin-left:10px">Method:</div>
    <div style="padding:4px 8px;border-bottom:1px solid #ccc">${t.effectivenessNotes||'___________________________'}</div>
  </div>
  <div style="margin-top:8px;font-size:8pt;color:#555">Evaluation options: Satisfactory &nbsp;|&nbsp; Retraining Required</div>
</div>

<div class="sig-grid">
  <div class="sh">Trainer / Faculty</div>
  <div class="sh">QA / HR Review</div>
  <div class="sh">Approved By</div>
  <div class="sn">${t.trainer||'Akshay Dake'}</div>
  <div class="sn">—</div>
  <div class="sn">Akshay Dake</div>
  <div class="sl">Signature &amp; Date: _________________</div>
  <div class="sl">Signature &amp; Date: _________________</div>
  <div class="sl">Signature &amp; Date: _________________</div>
</div>

<div style="margin-top:8px;font-size:7.5pt;color:#555">${t.trNumber} &nbsp;|&nbsp; VRA-TR-001 Rev 00 &nbsp;|&nbsp; V R Alucast — Confidential &nbsp;|&nbsp; Retain for minimum 3 years</div>
</td></tr></tbody></table>
<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ── CONSOLIDATED TRAINING REGISTER ─────────────────────────────────
async function hrPrintConsolidatedRegister(filterYear){
  const allTrainings=await db.hrTrainings.toArray().catch(()=>[]);
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  const allDocs=await DB.listDocs({});
  const today=new Date().toLocaleDateString('en-IN');
  const curYear=new Date().getFullYear();

  // 'all' = no year filter, undefined/null = current year, specific year = filter by that year
  const showAll=(filterYear==='all'||filterYear==='All Years');
  const year=(!filterYear||filterYear==='')?curYear:filterYear;
  const trainings=allTrainings
    .filter(t=>t.status!=='Cancelled'&&(showAll||(t.date||'').startsWith(String(year))))
    .sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);

  const yearLabel=showAll?'All Years':String(year);

  if(!trainings.length){
    toast(`No training records found for ${yearLabel}`,'w');
    return;
  }

  // Build rows — one row per employee per training
  const rows=[];
  let srNo=1;
  for(const t of trainings){
    const attEmps=(t.attendeeIds||[]).map(aid=>emps.find(x=>x.id===aid)).filter(Boolean);
    const linkedDocs=(t.linkedDocIds||[]).map(did=>allDocs.find(x=>x.id===did)).filter(Boolean);
    const docRefs=linkedDocs.map(d=>d.docNumber).join(', ')||'—';
    if(attEmps.length===0){
      // Training with no attendees — still show as one row
      rows.push(`<tr>
        <td style="text-align:center">${srNo++}</td>
        <td style="font-family:monospace;font-weight:bold">${t.trNumber}</td>
        <td>${t.date||'—'}</td>
        <td><strong>${t.topic}</strong>${t.skill?`<br><span style="font-size:7pt;color:#555">${t.skill}</span>`:''}</td>
        <td>${t.type||'—'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td>
        <td style="font-family:monospace;font-size:7.5pt">${docRefs}</td>
        <td>${t.trainer||'—'}</td>
        <td style="text-align:center;font-weight:bold">${t.effectiveness||'—'}</td>
        <td style="font-weight:bold">${t.status}</td>
        <td style="min-width:70px"></td>
      </tr>`);
    } else {
      attEmps.forEach((e,i)=>{
        rows.push(`<tr style="${i%2===0?'':'background:#f7f7f7'}">
          <td style="text-align:center">${i===0?srNo:''}</td>
          <td style="font-family:monospace;font-weight:bold;font-size:8pt">${i===0?t.trNumber:''}</td>
          <td>${i===0?t.date||'—':''}</td>
          <td>${i===0?`<strong>${t.topic}</strong>${t.skill?`<br><span style="font-size:7pt;color:#555">${t.skill}</span>`:''}`:''}</td>
          <td>${i===0?t.type||'—':''}</td>
          <td style="font-family:monospace;font-size:8pt">${e.empCode}</td>
          <td style="font-weight:600">${e.name}</td>
          <td style="font-size:8pt">${e.designation}</td>
          <td style="font-size:8pt">${hrCatLabel(e.category)}</td>
          <td style="font-family:monospace;font-size:7.5pt">${i===0?docRefs:''}</td>
          <td>${i===0?t.trainer||'—':''}</td>
          <td style="text-align:center;font-weight:bold">${i===0?t.effectiveness||'—':''}</td>
          <td style="font-weight:bold">${i===0?t.status:''}</td>
          <td style="min-width:70px"></td>
        </tr>`);
      });
      srNo++;
    }
  }

  // Summary stats
  const totalTrainings=trainings.length;
  const completed=trainings.filter(t=>t.status==='Completed').length;
  const scheduled=trainings.filter(t=>t.status==='Scheduled').length;
  const totalAttendances=trainings.reduce((s,t)=>s+(t.attendeeIds?.length||0),0);
  const satCount=trainings.filter(t=>t.effectiveness==='Satisfactory').length;
  const retrainCount=trainings.filter(t=>t.effectiveness==='Retraining').length;

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Training Register ${year}</title>
<style>
${hrPrintCSS()}
@page{size:A4 landscape;margin:12mm 14mm 16mm 14mm}
table.reg{width:100%;border-collapse:collapse;font-size:7.5pt}
table.reg th{background:#ececec;font-weight:bold;padding:5px 5px;border:1px solid #000;text-align:left;white-space:nowrap}
table.reg td{padding:4px 5px;border:1px solid #000;vertical-align:top}
table.reg tr:nth-child(even) td{background:#f7f7f7}
.summary-box{display:grid;grid-template-columns:repeat(6,1fr);gap:0;border:1px solid #000;margin-bottom:12px;font-size:8.5pt}
.summary-box .sb{padding:7px 10px;border-right:1px solid #000;text-align:center}
.summary-box .sb:last-child{border-right:none}
.summary-box .sv{font-size:14pt;font-weight:bold;display:block;margin-top:2px}
.summary-box .sl{font-size:7.5pt;color:#555}
</style></head><body>
${hrPrintHeader('VRA-TR-002','00',`CONSOLIDATED TRAINING REGISTER — ${yearLabel}`,'V R Alucast — Annual Training Record',today)}

<div class="summary-box">
  <div class="sb"><span class="sv">${totalTrainings}</span><span class="sl">Total Trainings</span></div>
  <div class="sb"><span class="sv">${completed}</span><span class="sl">Completed</span></div>
  <div class="sb"><span class="sv">${scheduled}</span><span class="sl">Scheduled</span></div>
  <div class="sb"><span class="sv">${totalAttendances}</span><span class="sl">Total Attendances</span></div>
  <div class="sb"><span class="sv">${satCount}</span><span class="sl">Satisfactory</span></div>
  <div class="sb"><span class="sv">${retrainCount}</span><span class="sl">Retraining</span></div>
</div>

<table class="reg">
  <thead><tr>
    <th style="width:24px">#</th>
    <th style="width:72px">TR No.</th>
    <th style="width:60px">Date</th>
    <th style="min-width:110px">Topic / Skill</th>
    <th style="width:75px">Type</th>
    <th style="width:68px">Emp Code</th>
    <th style="min-width:90px">Name</th>
    <th style="min-width:90px">Designation</th>
    <th style="width:65px">Category</th>
    <th style="width:70px">Ref Doc</th>
    <th style="width:80px">Trainer</th>
    <th style="width:90px">Effectiveness</th>
    <th style="width:65px">Status</th>
    <th style="min-width:70px">Signature</th>
  </tr></thead>
  <tbody>${rows.join('')}</tbody>
</table>

<div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:8pt;page-break-inside:avoid">
  <div style="border:1px solid #000;padding:8px"><strong>Prepared By:</strong> Akshay Dake<br><br>Signature: _________________________<br>Date: _____________</div>
  <div style="border:1px solid #000;padding:8px"><strong>Reviewed By (QA):</strong><br><br>Signature: _________________________<br>Date: _____________</div>
  <div style="border:1px solid #000;padding:8px"><strong>Approved By:</strong> Akshay Dake<br><br>Signature: _________________________<br>Date: _____________</div>
</div>
<div style="margin-top:6px;font-size:7pt;color:#888">VRA-TR-002 Rev 00 &nbsp;|&nbsp; V R Alucast — Retain minimum 3 years</div>
</td></tr></tbody></table>
<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  DOCUMENTS NEEDED REPORT
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  DOCUMENTS NEEDED — SKILL DOCUMENT MAPPING
// ══════════════════════════════════════════════════════

// Get or create skill-doc record
async function hrGetSkillDoc(skillId){
  return await db.hrSkillDocs.where('skillId').equals(skillId).first().catch(()=>null);
}

async function hrRenderDocsNeeded(){
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const allDocs=await DB.listDocs({status:'ACTIVE'});
  const allDocsAny=await DB.listDocs({});
  const skillDocRecs=await db.hrSkillDocs.toArray().catch(()=>[]);

  // Build map: skillId → {docIds, noDocNeeded, noDocReason}
  const sdMap={};
  skillDocRecs.forEach(r=>{ sdMap[r.skillId]=r; });

  // Categorise skills
  const noDocSkills=skills.filter(s=>{
    const sd=sdMap[s.id];
    if(sd?.noDocNeeded) return false;       // marked no-doc-needed — excluded
    if(sd?.docIds?.length) return false;     // has linked docs — excluded
    return true;                             // needs docs
  });
  const linkedSkills=skills.filter(s=>sdMap[s.id]?.docIds?.length);
  const noDocNeededSkills=skills.filter(s=>sdMap[s.id]?.noDocNeeded);

  function docChips(docIds){
    return (docIds||[]).map(did=>{
      const d=allDocsAny.find(x=>x.id===did);
      return d?`<span class="mono" style="background:#f0f3f9;border:1px solid var(--border);padding:2px 7px;border-radius:5px;font-size:11px;white-space:nowrap">${esc(d.docNumber)}</span>`:'';
    }).join(' ');
  }

  setC(`
  <div class="ph">
    <h2>📄 Skill — Document Mapping</h2>
    <button class="btn btn-o" onclick="hrPrintDocsNeeded()">🖨️ Print Report</button>
  </div>
  <div class="alert al-w" style="margin-bottom:12px">
    Link each skill to one or more reference documents (procedures, WIs, training materials) from the Document Control module.
    Skills with no linked document and not marked "No Document Needed" appear here as gaps.
    <strong>${noDocSkills.length} skill(s) need attention.</strong>
  </div>

  <!-- SECTION 1: Skills needing documents -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch">
      <h5>🔴 Skills Needing Documents (${noDocSkills.length})</h5>
      <span class="muted" style="font-size:11px">Link an existing doc, create a new one, or mark as not needed</span>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Skill / Competency</th><th>Category</th><th>Actions</th></tr></thead>
      <tbody>${noDocSkills.length===0
        ?`<tr><td colspan="3" style="text-align:center;padding:20px;color:#9ca3af">✅ All skills have linked documents or are marked as not needed.</td></tr>`
        :noDocSkills.map(s=>`<tr>
          <td><strong>${esc(s.skillName)}</strong></td>
          <td><span class="badge bd">${hrCatLabel(s.category)}</span></td>
          <td style="white-space:nowrap;display:flex;flex-wrap:wrap;gap:5px;padding:6px 10px">
            <button class="btn btn-p btn-xs" onclick="hrLinkDocsModal(${s.id},'${esc(s.skillName).replace(/'/g,"\\'")}')">🔗 Link Document(s)</button>
            <button class="btn btn-o btn-xs" onclick="nav('create')">➕ Create Document</button>
            <button class="btn btn-o btn-xs" onclick="hrMarkNoDocNeeded(${s.id},'${esc(s.skillName).replace(/'/g,"\\'")}')">✅ No Doc Needed</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>

  <!-- SECTION 2: Skills with linked documents -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>✅ Skills With Linked Documents (${linkedSkills.length})</h5></div>
    <div class="tw"><table>
      <thead><tr><th>Skill / Competency</th><th>Category</th><th>Linked Documents</th><th></th></tr></thead>
      <tbody>${linkedSkills.length===0
        ?`<tr><td colspan="4" style="text-align:center;padding:16px;color:#9ca3af">No skills linked to documents yet.</td></tr>`
        :linkedSkills.map(s=>{
            const sd=sdMap[s.id];
            return`<tr>
              <td><strong>${esc(s.skillName)}</strong></td>
              <td><span class="badge bd">${hrCatLabel(s.category)}</span></td>
              <td style="padding:6px 10px">${docChips(sd?.docIds)}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-o btn-xs" onclick="hrLinkDocsModal(${s.id},'${esc(s.skillName).replace(/'/g,"\\'")}')">✏️ Edit</button>
              </td>
            </tr>`;
          }).join('')}
      </tbody>
    </table></div>
  </div>

  <!-- SECTION 3: No document needed -->
  <div class="card">
    <div class="ch"><h5>— Marked: No Document Needed (${noDocNeededSkills.length})</h5></div>
    <div class="tw"><table>
      <thead><tr><th>Skill / Competency</th><th>Category</th><th>Reason</th><th></th></tr></thead>
      <tbody>${noDocNeededSkills.length===0
        ?`<tr><td colspan="4" style="text-align:center;padding:16px;color:#9ca3af">None marked.</td></tr>`
        :noDocNeededSkills.map(s=>{
            const sd=sdMap[s.id];
            return`<tr>
              <td><strong>${esc(s.skillName)}</strong></td>
              <td><span class="badge bd">${hrCatLabel(s.category)}</span></td>
              <td class="muted">${esc(sd?.noDocReason||'—')}</td>
              <td><button class="btn btn-r btn-xs" onclick="hrClearNoDocNeeded(${s.id})">↩️ Revert</button></td>
            </tr>`;
          }).join('')}
      </tbody>
    </table></div>
  </div>
  `);
}

// ── Modal: link existing documents to a skill ─────────
async function hrLinkDocsModal(skillId, skillName){
  const allDocs=await DB.listDocs({});
  const existing=await hrGetSkillDoc(skillId);
  const linkedIds=existing?.docIds||[];

  const ov=document.createElement('div');ov.className='overlay';ov.id='hr-ld-ov';
  ov.innerHTML=`<div class="modal" style="width:560px;max-height:88vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3>🔗 Link Documents — <span style="color:var(--navy)">${esc(skillName)}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('hr-ld-ov').remove()">✕</button>
    </div>
    <div class="muted" style="margin-bottom:10px;font-size:12px">Select one or more documents from the Document Control module that are used as reference material for this skill. All statuses shown — Active documents recommended.</div>
    ${allDocs.length===0
      ?`<div class="alert al-w">No documents in DMS yet. <button class="btn btn-p btn-sm" onclick="nav('create');document.getElementById('hr-ld-ov').remove()">➕ Create a document first</button></div>`
      :`<div style="border:1px solid var(--border);border-radius:7px;max-height:340px;overflow-y:auto;background:#fff">
        ${allDocs.map(d=>`<label style="display:flex;align-items:center;gap:9px;padding:7px 10px;border-bottom:1px solid var(--border);cursor:pointer">
          <input type="checkbox" class="ld-doc-cb" value="${d.id}" ${linkedIds.includes(d.id)?'checked':''} style="cursor:pointer;flex-shrink:0">
          <span>
            <span class="mono" style="color:var(--navy);font-weight:700;font-size:12px">${esc(d.docNumber)}</span>
            <span style="font-size:12.5px"> — ${esc(d.title)}</span>
            <span class="badge ${d.status==='ACTIVE'?'ba':'bd'}" style="margin-left:5px;font-size:10px">${d.status}</span>
          </span>
        </label>`).join('')}
      </div>`}
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('hr-ld-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="hrSaveSkillDocs(${skillId})">💾 Save Links</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function hrSaveSkillDocs(skillId){
  const selected=Array.from(document.querySelectorAll('.ld-doc-cb:checked')).map(c=>parseInt(c.value));
  const existing=await hrGetSkillDoc(skillId);
  if(existing){
    await db.hrSkillDocs.update(existing.id,{docIds:selected,noDocNeeded:false,noDocReason:'',updatedAt:new Date().toISOString()});
  } else {
    await db.hrSkillDocs.add({skillId,docIds:selected,noDocNeeded:false,noDocReason:'',updatedAt:new Date().toISOString()});
  }
  document.getElementById('hr-ld-ov').remove();
  toast(`✅ ${selected.length} document(s) linked to skill`);
  hrRenderDocsNeeded();
}

// ── Mark skill as "no document needed" ───────────────
async function hrMarkNoDocNeeded(skillId, skillName){
  const ov=document.createElement('div');ov.className='overlay';ov.id='hr-ndn-ov';
  ov.innerHTML=`<div class="modal" style="width:420px">
    <h3 style="margin-bottom:12px">✅ No Document Needed</h3>
    <p style="font-size:13px;margin-bottom:12px">Mark <strong>${esc(skillName)}</strong> as not requiring a formal document. This will remove it from the gaps list.</p>
    <div class="fg"><label class="lbl">Reason (optional)</label>
      <input class="fc" id="ndn-reason" placeholder="e.g. Practical on-job skill, no written procedure required">
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('hr-ndn-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="hrSaveNoDocNeeded(${skillId})">✅ Confirm</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function hrSaveNoDocNeeded(skillId){
  const reason=document.getElementById('ndn-reason')?.value.trim()||'';
  const existing=await hrGetSkillDoc(skillId);
  if(existing){
    await db.hrSkillDocs.update(existing.id,{noDocNeeded:true,noDocReason:reason,docIds:[],updatedAt:new Date().toISOString()});
  } else {
    await db.hrSkillDocs.add({skillId,noDocNeeded:true,noDocReason:reason,docIds:[],updatedAt:new Date().toISOString()});
  }
  document.getElementById('hr-ndn-ov').remove();
  toast('Marked — skill removed from gaps list');
  hrRenderDocsNeeded();
}

async function hrClearNoDocNeeded(skillId){
  const existing=await hrGetSkillDoc(skillId);
  if(existing) await db.hrSkillDocs.update(existing.id,{noDocNeeded:false,noDocReason:'',updatedAt:new Date().toISOString()});
  toast('Reverted — skill back in gaps list');
  hrRenderDocsNeeded();
}

async function hrPrintDocsNeeded(){
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const allDocs=await DB.listDocs({});
  const skillDocRecs=await db.hrSkillDocs.toArray().catch(()=>[]);
  const today=new Date().toLocaleDateString('en-IN');
  const sdMap={};
  skillDocRecs.forEach(r=>{ sdMap[r.skillId]=r; });

  const noDocSkills=skills.filter(s=>!sdMap[s.id]?.noDocNeeded&&!sdMap[s.id]?.docIds?.length);
  const linkedSkills=skills.filter(s=>sdMap[s.id]?.docIds?.length);
  const noDocNeededSkills=skills.filter(s=>sdMap[s.id]?.noDocNeeded);

  function docNames(docIds){
    return (docIds||[]).map(did=>{const d=allDocs.find(x=>x.id===did);return d?`${d.docNumber} — ${d.title}`:'';}).filter(Boolean).join('; ');
  }

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Skill Document Mapping</title><style>${hrPrintCSS()}</style></head><body>
  ${hrPrintHeader('VRA-HR-004','00','SKILL — DOCUMENT MAPPING REPORT','V R Alucast — Training Document Readiness',today)}

  <h2>Section 1 — Skills Needing Documents (${noDocSkills.length})</h2>
  <table class="data">
    <thead><tr><th>#</th><th>Skill / Competency</th><th>Category</th><th>Action Required</th></tr></thead>
    <tbody>${noDocSkills.length===0
      ?'<tr><td colspan="4" style="text-align:center">None — all skills covered ✅</td></tr>'
      :noDocSkills.map((s,i)=>`<tr><td>${i+1}</td><td><strong>${s.skillName}</strong></td><td>${hrCatLabel(s.category)}</td><td>Create or link reference document</td></tr>`).join('')}
    </tbody>
  </table>

  <h2 style="margin-top:14px">Section 2 — Skills With Linked Documents (${linkedSkills.length})</h2>
  <table class="data">
    <thead><tr><th>#</th><th>Skill / Competency</th><th>Category</th><th>Reference Document(s)</th></tr></thead>
    <tbody>${linkedSkills.length===0
      ?'<tr><td colspan="4" style="text-align:center">None yet</td></tr>'
      :linkedSkills.map((s,i)=>`<tr><td>${i+1}</td><td><strong>${s.skillName}</strong></td><td>${hrCatLabel(s.category)}</td><td style="font-size:8pt">${docNames(sdMap[s.id]?.docIds)||'—'}</td></tr>`).join('')}
    </tbody>
  </table>

  <h2 style="margin-top:14px">Section 3 — Marked: No Document Needed (${noDocNeededSkills.length})</h2>
  <table class="data">
    <thead><tr><th>#</th><th>Skill / Competency</th><th>Category</th><th>Reason</th></tr></thead>
    <tbody>${noDocNeededSkills.length===0
      ?'<tr><td colspan="4" style="text-align:center">None</td></tr>'
      :noDocNeededSkills.map((s,i)=>`<tr><td>${i+1}</td><td><strong>${s.skillName}</strong></td><td>${hrCatLabel(s.category)}</td><td>${sdMap[s.id]?.noDocReason||'—'}</td></tr>`).join('')}
    </tbody>
  </table>
  </td></tr></tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  TRAINING SCHEDULE
// ══════════════════════════════════════════════════════
async function hrRenderSchedule(){
  const trainings=await db.hrTrainings.toArray().catch(()=>[]);
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  const today=new Date().toISOString().split('T')[0];
  const scheduled=trainings.filter(t=>t.status==='Scheduled').sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const all=trainings.filter(t=>t.status!=='Cancelled').sort((a,b)=>(a.date||'')>(b.date||'')?-1:1);
  const overdue=scheduled.filter(t=>(t.date||'')<today);

  function row(t){
    const isOverdue=t.status==='Scheduled'&&(t.date||'')<today;
    const attNames=(t.attendeeIds||[]).map(aid=>{const e=emps.find(x=>x.id===aid);return e?e.name:'?';}).join(', ');
    return`<tr ${isOverdue?'style="background:#fef2f2"':''}>
      <td class="mono" style="color:var(--navy);font-weight:700">${esc(t.trNumber)}</td>
      <td><strong>${esc(t.topic)}</strong></td>
      <td>${esc(t.type||'—')}</td>
      <td>${esc(t.trainer||'—')}</td>
      <td ${isOverdue?'style="color:#7f1d1d;font-weight:700"':''}>${t.date||'—'}${isOverdue?' ⚠️':''}</td>
      <td>${hrTrStatusBadge(t.status)}</td>
      <td style="font-size:11px">${attNames||'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-o btn-xs" onclick="hrPrintTraining(${t.id})">🖨️</button>
        <button class="btn btn-p btn-xs" onclick="hrOpenTrainingForm(${t.id})">✏️</button>
      </td>
    </tr>`;
  }

  setC(`
  <div class="ph">
    <h2>📅 Training Schedule</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="nav('hr-trainings');setTimeout(hrOpenTrainingForm,300)">+ Schedule Training</button>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="fc" id="tr-year-sel" style="width:110px;font-size:12.5px">
        <option value="all">All Years</option>
        ${Array.from({length:4},(_,i)=>new Date().getFullYear()-1+i).map(y=>`<option value="${y}" ${y===new Date().getFullYear()?'selected':''}>${y}</option>`).join('')}
      </select>
      <button class="btn btn-o" onclick="hrPrintSchedule()">🖨️ Print Schedule</button>
      <button class="btn btn-p" onclick="hrPrintConsolidatedRegister(document.getElementById('tr-year-sel')?.value)">📋 Annual Register</button>
    </div>
    </div>
  </div>
  ${overdue.length?`<div class="alert al-d">⚠️ ${overdue.length} overdue training(s). Update status or reschedule.</div>`:''}
  <div class="card" style="margin-bottom:14px">
    <div class="ch" style="background:#fffbeb"><h5>📌 Scheduled / Upcoming (${scheduled.length})</h5></div>
    <div class="tw"><table>
      <thead><tr><th>TR No.</th><th>Topic</th><th>Type</th><th>Trainer</th><th>Planned Date</th><th>Status</th><th>Attendees</th><th></th></tr></thead>
      <tbody>${scheduled.length===0?`<tr><td colspan="8" style="text-align:center;padding:20px;color:#9ca3af">No upcoming training scheduled.</td></tr>`:scheduled.map(t=>row(t)).join('')}</tbody>
    </table></div>
  </div>
  <div class="card">
    <div class="ch"><h5>📋 Annual Training Plan — All Records (${all.length})</h5></div>
    <div class="tw"><table>
      <thead><tr><th>TR No.</th><th>Topic</th><th>Type</th><th>Trainer</th><th>Date</th><th>Status</th><th>Attendees</th><th></th></tr></thead>
      <tbody>${all.length===0?`<tr><td colspan="8" style="text-align:center;padding:20px;color:#9ca3af">No records.</td></tr>`:all.map(t=>row(t)).join('')}</tbody>
    </table></div>
  </div>
  `);
}

async function hrPrintSchedule(){
  const trainings=await db.hrTrainings.toArray().catch(()=>[]);
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  const today=new Date().toLocaleDateString('en-IN');
  const sorted=trainings.filter(t=>t.status!=='Cancelled').sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const rows=sorted.map((t,i)=>{
    const attNames=(t.attendeeIds||[]).map(aid=>{const e=emps.find(x=>x.id===aid);return e?e.name:'?';}).join(', ');
    return`<tr>
      <td class="mono">${t.trNumber}</td>
      <td><strong>${t.topic}</strong></td>
      <td>${t.skill||'—'}</td>
      <td>${t.type||'—'}</td>
      <td>${t.date||'—'}</td>
      <td>${t.trainer||'—'}</td>
      <td style="font-size:7.5pt">${attNames||'—'}</td>
      <td style="font-weight:bold">${t.status}</td>
      <td style="text-align:center">${t.effectiveness||'—'}</td>
    </tr>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Training Schedule</title><style>${hrPrintCSS()}</style></head><body>
  ${hrPrintHeader('VRA-TR-003','00','ANNUAL TRAINING PLAN & SCHEDULE','V R Alucast — Training Calendar',today)}
  <table class="data">
    <thead><tr><th>TR No.</th><th>Topic</th><th>Skill Area</th><th>Type</th><th>Date</th><th>Trainer</th><th>Attendees</th><th>Status</th><th>Eff %</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="9" style="text-align:center">No records</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${sorted.length} training(s)</div>
  </td></tr></tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

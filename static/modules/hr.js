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
        <select class="fc" id="hre-desig">
          ${allDesig.map(d=>`<option value="${d}" ${e?.designation===d?'selected':''}>${d}</option>`).join('')}
        </select></div>
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

function hrUpdateDesigOptions(forceCategory){
  const cat=forceCategory||document.getElementById('hre-cat')?.value||'Staff';
  const staffDesig=['Managing Partner','Production In-charge','QA In-charge','Shift Supervisor','QC Inspector'];
  const workerDesig=['CNC Operator','VMC Operator','Conventional Operator','Final Inspector','Helper','PDC Operator'];
  const opts=(cat==='Staff'?staffDesig:workerDesig).map(d=>`<option value="${d}">${d}</option>`).join('');
  const el=document.getElementById('hre-desig');
  if(el) el.innerHTML=opts;
}

async function hrSaveEmp(id){
  const name=document.getElementById('hre-name').value.trim();
  if(!name){toast('Employee name is required','d');return;}
  const rec={
    empCode:document.getElementById('hre-code').value.trim(),
    name, category:document.getElementById('hre-cat').value,
    designation:document.getElementById('hre-desig').value,
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
//  SKILL MATRIX  (with inline competency editing)
// ══════════════════════════════════════════════════════
async function hrRenderSkillMatrix(){
  await hrSeedDefaults();
  const emps=await db.hrEmployees.where('status').equals('Active').toArray().catch(()=>[]);
  const skills=await db.hrSkillDefs.toArray().catch(()=>[]);
  const matrix=await db.hrSkillMatrix.toArray().catch(()=>[]);

  const staffEmps=emps.filter(e=>e.category==='Staff');
  const workerEmps=emps.filter(e=>e.category==='Worker');
  const staffSkills=skills.filter(s=>s.category==='Staff');
  const workerSkills=skills.filter(s=>s.category==='Worker');

  function getLevel(empId,skillId){
    const m=matrix.find(x=>x.empId===empId&&x.skillId===skillId);
    return m!==undefined?m.level:null;
  }

  function matBlock(title,empList,skillList,docNum){
    if(!empList.length) return`<div class="card"><div class="ch"><h5>${title}</h5></div><div class="cb muted" style="padding:20px">No active employees in this category.</div></div>`;
    // horizontal headers — fixed width columns
    return`<div class="card" style="margin-bottom:16px">
      <div class="ch">
        <h5>${title}</h5>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="muted" style="font-size:11px">${docNum}</span>
          <button class="btn btn-p btn-sm" onclick="hrSaveMatrix()">💾 Save</button>
          <button class="btn btn-o btn-sm" onclick="hrPrintMatrix('${title.replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${docNum}')">🖨️ Print</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;font-size:11.5px;min-width:100%">
          <thead>
            <tr style="background:var(--navy);color:#fff">
              <th style="padding:7px 10px;text-align:left;min-width:130px;white-space:nowrap;position:sticky;left:0;background:var(--navy);z-index:2">Employee</th>
              <th style="padding:7px 8px;min-width:120px;text-align:left;white-space:nowrap">Designation</th>
              ${skillList.map(s=>`<th style="padding:6px 8px;min-width:90px;text-align:center;font-size:10.5px;white-space:normal;word-break:break-word;max-width:100px">${esc(s.skillName)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${empList.map((e,i)=>`<tr style="${i%2===0?'background:#fff':'background:#f6f8fd'}">
              <td style="padding:6px 10px;border:1px solid var(--border);font-weight:600;position:sticky;left:0;background:${i%2===0?'#fff':'#f6f8fd'};z-index:1">
                ${esc(e.name)}<br><span class="muted" style="font-size:10px">${esc(e.empCode)}</span>
              </td>
              <td style="padding:6px 8px;border:1px solid var(--border);font-size:11px;color:var(--muted)">${esc(e.designation)}</td>
              ${skillList.map(s=>{
                const lv=getLevel(e.id,s.id);
                return`<td style="text-align:center;padding:3px 4px;border:1px solid var(--border)">
                  <select class="hr-mat-sel" data-eid="${e.id}" data-sid="${s.id}"
                    style="border:1px solid var(--border);border-radius:4px;background:#fff;font-size:12px;font-weight:700;cursor:pointer;width:52px;text-align:center;padding:2px 0">
                    <option value="" ${lv===null?'selected':''}>—</option>
                    <option value="-1" ${lv===-1?'selected':''}>N/R</option>
                    <option value="0" ${lv===0?'selected':''}>0</option>
                    <option value="1" ${lv===1?'selected':''}>1</option>
                    <option value="2" ${lv===2?'selected':''}>2</option>
                  </select>
                </td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  setC(`
  <div class="ph">
    <h2>📊 Skill Matrix</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="hrSaveMatrix()">💾 Save All</button>
      <button class="btn btn-o" onclick="hrManageSkills()">⚙️ Manage Skills</button>
    </div>
  </div>
  <div class="alert al-w" style="margin-bottom:12px">
    <strong>Legend:</strong> &nbsp;<strong>0</strong> = Training Identified &nbsp;|&nbsp; <strong>1</strong> = Can Perform Job &nbsp;|&nbsp; <strong>2</strong> = Expert / Can Train Others &nbsp;|&nbsp; <strong>N/R</strong> = Not Required
  </div>
  ${matBlock('White Collar — Skill Matrix',staffEmps,staffSkills,'VRA-HR-002')}
  ${matBlock('Blue Collar — Skill Matrix',workerEmps,workerSkills,'VRA-HR-005')}
  `);
}

async function hrSaveMatrix(){
  const sels=document.querySelectorAll('.hr-mat-sel');
  for(const sel of sels){
    const empId=parseInt(sel.dataset.eid), skillId=parseInt(sel.dataset.sid);
    const raw=sel.value;
    const level=raw===''?null:parseInt(raw);
    const existing=await db.hrSkillMatrix.where({empId,skillId}).first().catch(()=>null);
    if(existing) await db.hrSkillMatrix.update(existing.id,{level,updatedAt:new Date().toISOString()});
    else if(level!==null) await db.hrSkillMatrix.add({empId,skillId,level,updatedAt:new Date().toISOString()});
  }
  toast(`✅ Skill matrix saved`);
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


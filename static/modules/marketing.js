function feasChk(cb) {
  const qid = cb.getAttribute('data-qid');
  document.querySelectorAll('.feas-yn[data-qid="' + qid + '"]').forEach(function(el) {
    if (el !== cb) el.checked = false;
  });
  const val = cb.checked ? cb.getAttribute('data-val') : '';
  // Find the feas-yn element and update
  const allCbs = document.querySelectorAll('.feas-yn[data-qid="' + qid + '"]');
  // Manually trigger save
  feasSaveAnswer(parseInt(qid), val);
}

async function feasSaveAnswer(qid, val) {
  if (!window._feasId) return;
  try {
    const feas = await db.mktFeasibility.get(window._feasId);
    if (!feas) return;
    const answers = feas.answers ? JSON.parse(feas.answers) : {};
    if (!answers[qid]) answers[qid] = {rem:''};
    answers[qid].yn = val;
    await db.mktFeasibility.update(window._feasId, {answers: JSON.stringify(answers)});
  } catch(e) { console.log('feasSaveAnswer error:', e); }
}

// VRA DMS — MARKETING MODULE

// ══════════════════════════════════════════════════════
//  MARKETING — ENQUIRY & FEASIBILITY MODULE
// ══════════════════════════════════════════════════════

// ── NUMBERING ─────────────────────────────────────────
async function nextEnqNum(year){
  const y=year||new Date().getFullYear();
  // Count existing entries for this year only
  const all=await db.mktEnquiries.toArray().catch(()=>[]);
  const forYear=all.filter(e=>e.enqNumber&&e.enqNumber.includes(`VRA-MKT-${y}-`));
  const n=forYear.length+1;
  return `VRA-MKT-${y}-${String(n).padStart(3,'0')}`;
}
async function nextFeasNum(enqNumber){
  return `${enqNumber}-FR`;
}

async function mktRefreshEnqNum(editId){
  const y=parseInt(document.getElementById('enq-year')?.value)||new Date().getFullYear();
  const newNum=await nextEnqNum(y);
  const numEl=document.getElementById('enq-num');
  const prevEl=document.getElementById('enq-num-preview');
  if(numEl) numEl.value=newNum;
  if(prevEl) prevEl.textContent=newNum;
}

// ── SEED DEFAULT FEASIBILITY QUESTIONS ────────────────
async function mktSeedDefaults(){
  try {
  if(await db.mktFeasQns.count().catch(()=>0)) return;
  const seed=[
    // DRAWING & DESIGN
    {section:'DRAWING & DESIGN',question:'Is the 2D drawing available with complete dimensions and tolerances?',order:1},
    {section:'DRAWING & DESIGN',question:'Is the 3D model available?',order:2},
    {section:'DRAWING & DESIGN',question:'Are the specified tolerances and surface finish achievable through HPDC?',order:3},
    {section:'DRAWING & DESIGN',question:'Is this a new part development or an existing part?',order:4},
    // MATERIAL & PROCESS
    {section:'MATERIAL & PROCESS',question:'Is the required material / alloy grade feasible for HPDC?',order:1},
    {section:'MATERIAL & PROCESS',question:'Is the estimated casting weight defined?',order:2},
    {section:'MATERIAL & PROCESS',question:'Are any specific customer requirements or special characteristics identified?',order:3},
    // MACHINE & CAPACITY
    {section:'MACHINE & CAPACITY',question:'Is the part feasible on our available machines (280T / 400T)?',order:1},
    {section:'MACHINE & CAPACITY',question:'Is any new machine or additional setup required?',order:2},
    {section:'MACHINE & CAPACITY',question:'Is current capacity available for the required monthly volumes?',order:3},
    {section:'MACHINE & CAPACITY',question:'Are monthly volumes clearly defined by the customer?',order:4},
    // TOOLING
    {section:'TOOLING',question:'Is tooling supplied by the customer or to be procured?',order:1},
    // SECONDARY OPERATIONS
    {section:'SECONDARY OPERATIONS',question:'Is machining required after casting?',order:1},
    {section:'SECONDARY OPERATIONS',question:'Is any process required to be outsourced?',order:2},
    {section:'SECONDARY OPERATIONS',question:'If yes — is the vendor identified?',order:3},
    {section:'SECONDARY OPERATIONS',question:'Is the identified vendor feasible (location, capacity, quality)?',order:4},
    // INSPECTION & PACKAGING
    {section:'INSPECTION & PACKAGING',question:'Are inspection and testing facilities available for this part?',order:1},
    {section:'INSPECTION & PACKAGING',question:'Is a packaging plan defined?',order:2},
    // COMMERCIAL & RISK
    {section:'COMMERCIAL & RISK',question:'Is the customer reliable in terms of reputation and payment history?',order:1},
  ];
  for(const q of seed) await db.mktFeasQns.add(q);
  } catch(e){ console.log('mktSeed skipped:', e.message); }
}

async function mktRenderEnquiries(){
  const enqs=await db.mktEnquiries.toArray().catch(()=>[]);
  enqs.sort((a,b)=>b.id-a.id);
  const counts={Open:0,Quoted:0,'PO Received':0,Lost:0};
  enqs.forEach(e=>{ if(counts[e.status]!==undefined) counts[e.status]++; });

  setC(`
  <div class="ph">
    <h2>📋 Enquiry Register</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="mktOpenEnqForm()">+ New Enquiry</button>
      <button class="btn btn-o" onclick="mktPrintEnquiryRegister()">🖨️ Print Register</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
    ${[['Open',counts.Open,'bp'],['Quoted',counts.Quoted,'ba'],['PO Received',counts['PO Received'],'ba'],['Lost',counts.Lost,'br']].map(([l,n,cls])=>`
    <div class="card" style="padding:12px 16px">
      <div style="font-size:22px;font-weight:800;color:var(--navy)">${n}</div>
      <div class="muted" style="font-size:12px">${l}</div>
    </div>`).join('')}
  </div>
  <div class="card">
    <div class="ch"><h5>All Enquiries — ${enqs.length} records</h5>
      <span class="muted" style="font-size:11px">VRA-MKT-001 · Enquiry Register</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Enq No.</th><th>Date</th><th>Customer</th><th>Part Name / Details</th>
        <th>Special Req.</th><th>Feasibility</th>
        <th>PO No.</th><th>PO Date</th><th>Status</th><th>Remark</th><th></th>
      </tr></thead>
      <tbody>${enqs.length===0
        ?`<tr><td colspan="12" style="text-align:center;padding:30px;color:#9ca3af">No enquiries yet. Click + New Enquiry to start.</td></tr>`
        :enqs.map(e=>`<tr>
          <td class="mono" style="color:var(--navy);font-weight:700;white-space:nowrap">${esc(e.enqNumber)}</td>
          <td style="white-space:nowrap">${e.date||'—'}</td>
          <td><strong>${esc(e.customerName)}</strong></td>
          <td>${esc(e.partDetails)}</td>
          <td style="text-align:center">${e.specialReq?`<span class="badge br">YES</span>`:`<span class="badge bd">No</span>`}</td>
          <td style="text-align:center">${e.feasibilityDone?`<button class="btn btn-o btn-xs" onclick="mktViewFeasibility(${e.id})">View FR</button>`:`<button class="btn btn-p btn-xs" onclick="mktCreateFeasibility(${e.id})">+ Create FR</button>`}</td>
          <td class="mono" style="font-size:11px">${esc(e.poNumber||'—')}</td>
          <td style="white-space:nowrap">${e.poDate||'—'}</td>
          <td>${mktStatusBadge(e.status||'Open')}</td>
          <td style="font-size:11.5px;color:var(--muted)">${esc(e.remark||'')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="mktOpenEnqForm(${e.id})">✏️</button>
            <button class="btn btn-r btn-xs" onclick="mktDeleteEnq(${e.id})">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

async function mktOpenEnqForm(id=null){
  const e=id?await db.mktEnquiries.get(id).catch(()=>null):null;
  const curYear=new Date().getFullYear();
  const numYear=e?.enqNumber?parseInt(e.enqNumber.split('-')[2])||curYear:curYear;
  const num=e?e.enqNumber:await nextEnqNum(curYear);
  const ov=document.createElement('div');ov.className='overlay';ov.id='mkt-enq-ov';
  ov.innerHTML=`<div class="modal" style="width:580px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${e?'Edit Enquiry':'New Enquiry'} &nbsp;<span class="mono" style="color:var(--navy);font-size:12px" id="enq-num-preview">${num}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('mkt-enq-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Enquiry Year</label>
        <select class="fc" id="enq-year" onchange="mktRefreshEnqNum(${id||'null'})" ${e?'disabled':''}>
          ${[curYear-3,curYear-2,curYear-1,curYear,curYear+1].map(y=>`<option value="${y}" ${y===numYear?'selected':''}>${y}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Enquiry Number ${e?'':'(auto)'}</label>
        <input class="fc mono" id="enq-num" value="${esc(num)}" ${e?'':'readonly'} style="${e?'':'background:#f5f7fd;'}color:var(--navy);font-weight:700" placeholder="Auto-generated"></div>
      <div class="fg"><label class="lbl">Date *</label>
        <input class="fc" type="date" id="enq-date" value="${e?.date||new Date().toISOString().split('T')[0]}"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Customer Name *</label>
        <input class="fc" id="enq-cust" value="${esc(e?.customerName||'')}" placeholder="e.g. M/s Menon Alkop Pvt Ltd"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Enquiry Details / Part Name & Number *</label>
        <input class="fc" id="enq-part" value="${esc(e?.partDetails||'')}" placeholder="e.g. Cover Guide Plate — Part No. 303435"></div>
      <div class="fg"><label class="lbl">Part Number</label>
        <input class="fc" id="enq-partno" value="${esc(e?.partNumber||'')}" placeholder="e.g. 303435"></div>
      <div class="fg"><label class="lbl">Special Requirement?</label>
        <select class="fc" id="enq-specreq">
          <option value="0" ${!e?.specialReq?'selected':''}>No</option>
          <option value="1" ${e?.specialReq?'selected':''}>Yes</option>
        </select></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Special Requirement Details</label>
        <input class="fc" id="enq-specdetails" value="${esc(e?.specialReqDetails||'')}" placeholder="Describe if any"></div>

      <div class="fg"><label class="lbl">PO Number</label>
        <input class="fc mono" id="enq-po" value="${esc(e?.poNumber||'')}" placeholder="e.g. 24/25-000628"></div>
      <div class="fg"><label class="lbl">PO Date</label>
        <input class="fc" type="date" id="enq-podate" value="${e?.poDate||''}"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="enq-status">
          ${['Open','Quoted','PO Received','Hold','Lost','Cancelled'].map(s=>`<option value="${s}" ${(e?.status||'Open')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Remark</label>
        <input class="fc" id="enq-remark" value="${esc(e?.remark||'')}" placeholder="Any notes"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('mkt-enq-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="mktSaveEnq(${id||'null'})">💾 Save Enquiry</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function mktSaveEnq(id){
  const customerName=document.getElementById('enq-cust').value.trim();
  const partDetails=document.getElementById('enq-part').value.trim();
  if(!customerName||!partDetails){toast('Customer and Part Details are required','d');return;}
  const rec={
    enqNumber:document.getElementById('enq-num').value.trim(),
    date:document.getElementById('enq-date').value,
    customerName, partDetails,
    partNumber:document.getElementById('enq-partno').value.trim(),
    specialReq:document.getElementById('enq-specreq').value==='1',
    specialReqDetails:document.getElementById('enq-specdetails').value.trim(),
    poNumber:document.getElementById('enq-po').value.trim(),
    poDate:document.getElementById('enq-podate').value,
    status:document.getElementById('enq-status').value,
    remark:document.getElementById('enq-remark').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(id){
    await db.mktEnquiries.update(id,rec);
  } else {
    rec.createdAt=new Date().toISOString();
    rec.feasibilityDone=false;
    await db.mktEnquiries.add(rec);
  }
  document.getElementById('mkt-enq-ov').remove();
  toast(`✅ ${rec.enqNumber} saved`);
  mktRenderEnquiries();
}

async function mktDeleteEnq(id){
  const e=await db.mktEnquiries.get(id);
  if(!confirm(`Delete enquiry ${e?.enqNumber} (${e?.customerName})? Linked feasibility review will also be deleted.`)) return;
  // Delete linked feasibility
  const f=await db.mktFeasibility.where('enqId').equals(id).first().catch(()=>null);
  if(f) await db.mktFeasibility.delete(f.id);
  await db.mktEnquiries.delete(id);
  toast('Deleted','d');
  mktRenderEnquiries();
}

async function mktPrintEnquiryRegister(){
  const enqs=await db.mktEnquiries.toArray().catch(()=>[]);
  enqs.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=enqs.map((e,i)=>`<tr>
    <td style="text-align:center">${i+1}</td>
    <td class="mono" style="font-weight:bold;white-space:nowrap">${e.enqNumber}</td>
    <td>${e.date||'—'}</td>
    <td><strong>${e.customerName}</strong></td>
    <td>${e.partDetails}</td>
    <td style="text-align:center;font-weight:bold">${e.feasibilityDone?'Yes':'—'}</td>
    <td>${e.specialReq?'Yes — '+e.specialReqDetails:'No'}</td>
    <td>${e.poNumber||'—'}</td>
    <td>${e.poDate||'—'}</td>
    <td style="font-weight:bold">${e.status||'Open'}</td>
    <td>${e.remark||''}</td>
  </tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Enquiry Register</title>
  <style>${mktPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div></div>
    <div><div class="rpt-title">NEW ENQUIRY REGISTER</div><div class="rpt-sub">Marketing Department</div></div>
    <div><div class="rpt-num">VRA-MKT-001</div><div style="font-size:7pt;text-align:right">Date: ${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th style="width:24px">#</th><th style="white-space:nowrap">Enq No.</th><th>Date</th>
      <th>Customer Name</th><th>Enquiry Details / Part</th>
      <th>Feasibility</th><th>Special Req.</th>
      <th>PO No.</th><th>PO Date</th>
      <th>Status</th><th>Remark</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="12" style="text-align:center;padding:10px">No enquiries</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${enqs.length} &nbsp;|&nbsp; VRA-MKT-001 &nbsp;|&nbsp; V R Alucast — Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  FEASIBILITY REVIEWS LIST
// ══════════════════════════════════════════════════════
async function mktRenderFeasibility(){
  const feases=await db.mktFeasibility.toArray().catch(()=>[]);
  const enqs=await db.mktEnquiries.toArray().catch(()=>[]);
  feases.sort((a,b)=>b.id-a.id);

  setC(`
  <div class="ph">
    <h2>🔍 Feasibility Reviews</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-o" onclick="mktManageQuestions()">⚙️ Manage Questions</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>All Feasibility Reviews — ${feases.length} records</h5>
      <span class="muted" style="font-size:11px">VRA-MKT-002 · Feasibility Report</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>FR Number</th><th>Enquiry No.</th><th>Customer</th><th>Part Name</th>
        <th>Date</th><th>Reviewed By</th><th>Result</th><th>Remarks</th><th></th>
      </tr></thead>
      <tbody>${feases.length===0
        ?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">No feasibility reviews yet. Create one from the Enquiry Register.</td></tr>`
        :feases.map(f=>{
          const e=enqs.find(x=>x.id===f.enqId);
          return`<tr>
            <td class="mono" style="color:var(--navy);font-weight:700">${esc(f.feasNumber)}</td>
            <td class="mono" style="font-size:11px">${esc(e?.enqNumber||'—')}</td>
            <td><strong>${esc(f.customerName||e?.customerName||'—')}</strong></td>
            <td>${esc(f.partName||e?.partDetails||'—')}</td>
            <td>${f.date||'—'}</td>
            <td>${esc(f.reviewedBy||'Akshay Dake')}</td>
            <td>${mktResultBadge(f.result)}</td>
            <td style="font-size:11.5px;color:var(--muted)">${esc(f.specialRemark||'')}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-o btn-xs" onclick="mktViewFeasibilityById(${f.id})">✏️ Edit</button>
              <button class="btn btn-p btn-xs" onclick="mktPrintFeasibility(${f.id})">🖨️</button>
              <button class="btn btn-r btn-xs" onclick="mktDeleteFeasibility(${f.id})">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  CREATE / EDIT FEASIBILITY REVIEW
// ══════════════════════════════════════════════════════
async function mktCreateFeasibility(enqId){
  const e=await db.mktEnquiries.get(enqId);
  // Check if already exists
  const existing=await db.mktFeasibility.where('enqId').equals(enqId).first().catch(()=>null);
  if(existing){ mktViewFeasibilityById(existing.id); return; }
  const feasNum=await nextFeasNum(e.enqNumber);
  // Create blank record
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const answers={};
  qns.forEach(q=>{ answers[q.id]={yn:'',comment:''}; });
  const id=await db.mktFeasibility.add({
    enqId, feasNumber:feasNum,
    customerName:e.customerName, partName:e.partDetails,
    partNumber:e.partNumber||'', date:new Date().toISOString().split('T')[0],
    reviewedBy:'Akshay Dake', result:'', specialRemark:'',
    modification:'New', answers,
    createdAt:new Date().toISOString()
  });
  await db.mktEnquiries.update(enqId,{feasibilityDone:true});
  mktViewFeasibilityById(id);
}

async function mktViewFeasibility(enqId){
  const f=await db.mktFeasibility.where('enqId').equals(enqId).first().catch(()=>null);
  if(!f){mktCreateFeasibility(enqId);return;}
  mktViewFeasibilityById(f.id);
}

async function mktViewFeasibilityById(id){
  const f=await db.mktFeasibility.get(id).catch(()=>null);
  if(!f){toast('Not found','d');return;}
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const sections=['TECHNICAL','COMMERCIAL','CAPACITY','RISK ASSESSMENT'];
  const answers=f.answers||{};

  function qSection(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    if(!qs.length) return'';
    return`<div class="card" style="margin-bottom:12px">
      <div class="ch" style="background:#f0f3f9"><h5>${sec}</h5></div>
      <div class="tw"><table>
        <thead><tr><th style="width:28px">#</th><th>Check Point</th><th style="width:90px;text-align:center">Y / N</th><th>Comment</th></tr></thead>
        <tbody>${qs.map((q,i)=>{
          const ans=answers[q.id]||{yn:'',comment:''};
          return`<tr>
            <td style="text-align:center;color:var(--muted)">${i+1}</td>
            <td style="font-size:12.5px">${esc(q.question)}</td>
            <td style="text-align:center;padding:4px">
              <div style="display:flex;align-items:center;gap:5px">
                <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
                  <input type="checkbox" class="feas-yn" data-qid="${q.id}" data-val="Y"
                    ${ans.yn==='Y'?'checked':\'\'}
                    onchange="feasChk(this)"
                    style="width:15px;height:15px;accent-color:#15803d;cursor:pointer">
                  <span style="font-size:11px;color:#15803d;font-weight:700">Y</span>
                </label>
                <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
                  <input type="checkbox" class="feas-yn" data-qid="${q.id}" data-val="N"
                    ${ans.yn==='N'?'checked':\'\'}
                    onchange="feasChk(this)"
                    style="width:15px;height:15px;accent-color:#dc2626;cursor:pointer">
                  <span style="font-size:11px;color:#dc2626;font-weight:700">N</span>
                </label>
                <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
                  <input type="checkbox" class="feas-yn" data-qid="${q.id}" data-val="NA"
                    ${ans.yn==='NA'?'checked':\'\'}
                    onchange="feasChk(this)"
                    style="width:15px;height:15px;accent-color:#6b7280;cursor:pointer">
                  <span style="font-size:11px;color:#6b7280;font-weight:700">N/A</span>
                </label>
              </div>
            </td>
            <td style="padding:4px">
              <input class="fc feas-comment" data-qid="${q.id}" value="${esc(ans.comment||'')}"
                style="font-size:11.5px;padding:4px 7px" placeholder="Comment if any">
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  }

  setC(`
  <div class="ph">
    <h2>🔍 Feasibility Review — <span class="mono" style="color:var(--navy)">${esc(f.feasNumber)}</span></h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-g" onclick="mktSaveFeasibility(${id})">💾 Save</button>
      <button class="btn btn-p" onclick="mktPrintFeasibility(${id})">🖨️ Print FR</button>
      <button class="btn btn-o" onclick="nav('mkt-enquiries')">← Enquiry Register</button>
    </div>
  </div>

  <!-- Header details -->
  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Review Details</h5>
      <span class="muted" style="font-size:11px">VRA-MKT-002</span>
    </div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="fg"><label class="lbl">FR Number</label>
          <input class="fc mono" id="fr-num" value="${esc(f.feasNumber)}" readonly style="background:#f5f7fd;color:var(--navy);font-weight:700"></div>
        <div class="fg"><label class="lbl">Date</label>
          <input class="fc" type="date" id="fr-date" value="${f.date||''}"></div>
        <div class="fg"><label class="lbl">Modification / New</label>
          <select class="fc" id="fr-modtype">
            <option value="New" ${(f.modification||'New')==='New'?'selected':''}>New</option>
            <option value="Modification" ${f.modification==='Modification'?'selected':''}>Modification</option>
          </select></div>
        <div class="fg"><label class="lbl">Customer</label>
          <input class="fc" id="fr-cust" value="${esc(f.customerName||'')}"></div>
        <div class="fg"><label class="lbl">Part Name</label>
          <input class="fc" id="fr-part" value="${esc(f.partName||'')}"></div>
        <div class="fg"><label class="lbl">Part Number</label>
          <input class="fc mono" id="fr-partno" value="${esc(f.partNumber||'')}"></div>
        <div class="fg"><label class="lbl">Reviewed By</label>
          <input class="fc" id="fr-rev" value="${esc(f.reviewedBy||'Akshay Dake')}"></div>
        <div class="fg"><label class="lbl">Overall Result</label>
          <select class="fc" id="fr-result" style="font-weight:700">
            <option value="" ${!f.result?'selected':''}>— Pending —</option>
            <option value="FEASIBLE" ${f.result==='FEASIBLE'?'selected':''}>FEASIBLE</option>
            <option value="NOT FEASIBLE" ${f.result==='NOT FEASIBLE'?'selected':''}>NOT FEASIBLE</option>
          </select></div>
        <div class="fg"><label class="lbl">Reference</label>
          <input class="fc mono" id="fr-ref" value="${esc(f.reference||f.feasNumber)}" placeholder="Enquiry / drawing ref"></div>
      </div>
      <div class="fg" style="margin-top:4px"><label class="lbl">Special Remark</label>
        <input class="fc" id="fr-remark" value="${esc(f.specialRemark||'')}" placeholder="Any special remark"></div>
    </div>
  </div>

  <!-- Questions by section -->
  ${sections.map(s=>qSection(s)).join('')}

  <!-- Conclusion card -->
  <div class="card" style="margin-bottom:12px">
    <div class="ch" style="background:#f0f3f9"><h5>CONCLUSION</h5></div>
    <div class="cb" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:600">Overall Result:</div>
      ${f.result?`<span style="font-size:15px;font-weight:800;padding:4px 18px;border:2px solid #000;letter-spacing:1px">${f.result}</span>`:'<span class="muted">Not set — select in Review Details above</span>'}
      <div style="font-size:12.5px;color:var(--muted)">Reviewed By: <strong>${esc(f.reviewedBy||'Akshay Dake')}</strong></div>
    </div>
  </div>

  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
    <button class="btn btn-g btn-sm" onclick="mktSaveFeasibility(${id})">💾 Save All Changes</button>
    <button class="btn btn-p btn-sm" onclick="mktPrintFeasibility(${id})">🖨️ Print</button>
  </div>`);
}

async function feasUpdateRemark(inp) {
  const qid = parseInt(inp.getAttribute('data-qid'));
  const remark = inp.value.trim();
  const feas = window._currentFeas;
  if (!feas) return;
  const answers = feas.answers ? JSON.parse(feas.answers) : {};
  if (!answers[qid]) answers[qid] = {};
  answers[qid].remark = remark;
  feas.answers = JSON.stringify(answers);
  await db.mktFeasibility.update(feas.id, {answers: feas.answers});
}

async function mktSaveFeasibility(id){
  // Collect all Y/N and comments
  const answers={};
  document.querySelectorAll('.feas-yn').forEach(sel=>{
    const qid=parseInt(sel.dataset.qid);
    if(!answers[qid]) answers[qid]={};
    answers[qid].yn=sel.value;
  });
  document.querySelectorAll('.feas-comment').forEach(inp=>{
    const qid=parseInt(inp.dataset.qid);
    if(!answers[qid]) answers[qid]={};
    answers[qid].comment=inp.value.trim();
  });
  await db.mktFeasibility.update(id,{
    date:document.getElementById('fr-date').value,
    modification:document.getElementById('fr-modtype').value,
    customerName:document.getElementById('fr-cust').value.trim(),
    partName:document.getElementById('fr-part').value.trim(),
    partNumber:document.getElementById('fr-partno').value.trim(),
    reviewedBy:document.getElementById('fr-rev').value.trim(),
    result:document.getElementById('fr-result').value,
    reference:document.getElementById('fr-ref').value.trim(),
    specialRemark:document.getElementById('fr-remark').value.trim(),
    answers, updatedAt:new Date().toISOString()
  });
  toast('✅ Feasibility review saved');
}

async function mktDeleteFeasibility(id){
  const f=await db.mktFeasibility.get(id);
  if(!confirm(`Delete feasibility review ${f?.feasNumber}?`)) return;
  await db.mktFeasibility.delete(id);
  // Reset flag on enquiry
  if(f?.enqId) await db.mktEnquiries.update(f.enqId,{feasibilityDone:false});
  toast('Deleted','d');
  mktRenderFeasibility();
}

// ══════════════════════════════════════════════════════
//  MANAGE FEASIBILITY QUESTIONS
// ══════════════════════════════════════════════════════
async function mktManageQuestions(){
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const sections=['TECHNICAL','COMMERCIAL','CAPACITY','RISK ASSESSMENT'];

  function qList(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    return`<div style="margin-bottom:14px">
      <div style="font-weight:700;font-size:12px;color:var(--navy);padding:5px 8px;background:#f0f3f9;border-left:3px solid var(--navy);margin-bottom:6px">${sec} (${qs.length})</div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px">
        ${qs.length===0?`<div class="muted" style="padding:10px">No questions in this section.</div>`:
        qs.map(q=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px">${esc(q.question)}</span>
          <button class="btn btn-r btn-xs" onclick="mktDeleteQuestion(${q.id})">🗑️</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:5px">
        <input class="fc" id="new-q-${sec.replace(/\s/g,'-')}" placeholder="Add new question to ${sec}..." style="font-size:12px">
        <button class="btn btn-p btn-sm" onclick="mktAddQuestion('${sec}')">+ Add</button>
      </div>
    </div>`;
  }

  const ov=document.createElement('div');ov.className='overlay';ov.id='mkt-qn-ov';
  ov.innerHTML=`<div class="modal" style="width:600px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>⚙️ Manage Feasibility Questions</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('mkt-qn-ov').remove()">✕ Close</button>
    </div>
    <div class="alert al-w" style="margin-bottom:12px">Changes apply to <strong>new</strong> feasibility reviews. Existing saved answers are not affected.</div>
    <div id="mkt-qn-body">
      ${sections.map(s=>qList(s)).join('')}
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function mktAddQuestion(section){
  const inputId=`new-q-${section.replace(/\s/g,'-')}`;
  const name=document.getElementById(inputId)?.value.trim();
  if(!name){toast('Enter a question','d');return;}
  const existing=await db.mktFeasQns.where('section').equals(section).count().catch(()=>0);
  await db.mktFeasQns.add({section,question:name,order:existing+1});
  toast(`✅ Question added to ${section}`);
  document.getElementById(inputId).value='';
  // Refresh modal body
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const sections=['TECHNICAL','COMMERCIAL','CAPACITY','RISK ASSESSMENT'];
  function qList(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    return`<div style="margin-bottom:14px">
      <div style="font-weight:700;font-size:12px;color:var(--navy);padding:5px 8px;background:#f0f3f9;border-left:3px solid var(--navy);margin-bottom:6px">${sec} (${qs.length})</div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px">
        ${qs.length===0?`<div class="muted" style="padding:10px">No questions.</div>`:
        qs.map(q=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px">${esc(q.question)}</span>
          <button class="btn btn-r btn-xs" onclick="mktDeleteQuestion(${q.id})">🗑️</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:5px">
        <input class="fc" id="new-q-${sec.replace(/\s/g,'-')}" placeholder="Add new question to ${sec}..." style="font-size:12px">
        <button class="btn btn-p btn-sm" onclick="mktAddQuestion('${sec}')">+ Add</button>
      </div>
    </div>`;
  }
  const body=document.getElementById('mkt-qn-body');
  if(body) body.innerHTML=sections.map(s=>qList(s)).join('');
}

async function mktDeleteQuestion(id){
  const q=await db.mktFeasQns.get(id);
  if(!confirm(`Remove question: "${q?.question}"?`)) return;
  await db.mktFeasQns.delete(id);
  toast('Question removed','d');
  // Refresh modal
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const sections=['TECHNICAL','COMMERCIAL','CAPACITY','RISK ASSESSMENT'];
  function qList(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    return`<div style="margin-bottom:14px">
      <div style="font-weight:700;font-size:12px;color:var(--navy);padding:5px 8px;background:#f0f3f9;border-left:3px solid var(--navy);margin-bottom:6px">${sec} (${qs.length})</div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px">
        ${qs.length===0?`<div class="muted" style="padding:10px">No questions.</div>`:
        qs.map(q=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px">${esc(q.question)}</span>
          <button class="btn btn-r btn-xs" onclick="mktDeleteQuestion(${q.id})">🗑️</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:5px">
        <input class="fc" id="new-q-${sec.replace(/\s/g,'-')}" placeholder="Add new question to ${sec}..." style="font-size:12px">
        <button class="btn btn-p btn-sm" onclick="mktAddQuestion('${sec}')">+ Add</button>
      </div>
    </div>`;
  }
  const body=document.getElementById('mkt-qn-body');
  if(body) body.innerHTML=sections.map(s=>qList(s)).join('');
}

// ══════════════════════════════════════════════════════
//  PRINT — FEASIBILITY REVIEW
// ══════════════════════════════════════════════════════
async function mktPrintFeasibility(id){
  const f=await db.mktFeasibility.get(id).catch(()=>null);
  if(!f){toast('Not found','d');return;}
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const answers=f.answers||{};
  const sections=['TECHNICAL','COMMERCIAL','CAPACITY','RISK ASSESSMENT'];
  const today=new Date().toLocaleDateString('en-IN');

  function secBlock(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    if(!qs.length) return'';
    const rows=qs.map((q,i)=>{
      const ans=answers[q.id]||{};
      const yn=ans.yn||'';
      return`<tr>
        <td style="text-align:center;width:24px">${i+1}</td>
        <td>${q.question}</td>
        <td class="yn-cell" style="color:${yn==='Y'?'#14532d':yn==='N'?'#7f1d1d':'#555'}">${yn||'—'}</td>
        <td>${ans.comment||''}</td>
      </tr>`;
    }).join('');
    return`<div class="sec-bar">${sec}</div>
    <table class="dt" style="margin-bottom:2px">
      <thead><tr><th style="width:24px">#</th><th>Check Point</th><th style="width:55px;text-align:center">Y / N</th><th style="width:200px">Comment</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${f.feasNumber}</title>
  <style>${mktPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div></div>
    <div><div class="rpt-title">NEW ENQUIRY FEASIBILITY REVIEW</div><div class="rpt-sub">Marketing Department</div></div>
    <div><div class="rpt-num">${f.feasNumber}</div><div style="font-size:7pt;text-align:right">VRA-MKT-002 &nbsp;|&nbsp; ${today}</div></div>
  </div>

  <div class="meta-grid" style="margin-bottom:7px">
    <div class="mc"><div class="ml">FR Number</div><div class="mv">${f.feasNumber}</div></div>
    <div class="mc"><div class="ml">Date</div><div class="mv">${f.date||'—'}</div></div>
    <div class="mc"><div class="ml">Modification / New</div><div class="mv">${f.modification||'New'}</div></div>
    <div class="mc"><div class="ml">Reference</div><div class="mv">${f.reference||f.feasNumber}</div></div>
    <div class="mc" style="grid-column:span 2"><div class="ml">Customer</div><div class="mv">M/s ${f.customerName}</div></div>
    <div class="mc"><div class="ml">Part Name</div><div class="mv">${f.partName}</div></div>
    <div class="mc"><div class="ml">Part Number</div><div class="mv">${f.partNumber||'—'}</div></div>
  </div>

  ${sections.map(s=>secBlock(s)).join('')}

  <div class="sec-bar">CONCLUSION</div>
  <table class="dt" style="margin-bottom:8px">
    <tbody>
      <tr>
        <td style="width:40%;font-weight:bold">New enquiry feasibility result:</td>
        <td style="font-weight:800;font-size:11pt;color:${f.result==='FEASIBLE'?'#14532d':f.result==='NOT FEASIBLE'?'#7f1d1d':'#555'}">${f.result||'PENDING'}</td>
      </tr>
      <tr><td style="font-weight:bold">Special Remark:</td><td>${f.specialRemark||'—'}</td></tr>
      <tr><td style="font-weight:bold">Reviewed By:</td><td>${f.reviewedBy||'Akshay Dake'}</td></tr>
    </tbody>
  </table>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:8pt;margin-top:8px">
    <div style="border:1px solid #000;padding:7px"><strong>Reviewed By:</strong> ${f.reviewedBy||'Akshay Dake'}<br><br>Signature: _________________________&nbsp;&nbsp;&nbsp; Date: ______________</div>
    <div style="border:1px solid #000;padding:7px"><strong>Approved By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp;&nbsp;&nbsp; Date: ______________</div>
  </div>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">VRA-MKT-002 &nbsp;|&nbsp; V R Alucast — Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  CALIBRATION MODULE
// ══════════════════════════════════════════════════════

// ── NUMBERING ─────────────────────────────────────────
async function nextGaugeId(){
  const n=(await db.calGauges.count().catch(()=>0))+1;
  return `VRA-CAL-${String(n).padStart(3,'0')}`;
}
async function nextCalRecNum(){
  const n=(await db.calRecords.count().catch(()=>0))+1;
  return `VRA-CAL-R-${String(n).padStart(4,'0')}`;
}

// ── HELPERS ───────────────────────────────────────────
function calStatusBadge(s){
  if(s==='Active')   return`<span class="badge ba">Active</span>`;
  if(s==='Scrapped') return`<span class="badge br">Scrapped</span>`;
  if(s==='On Hold')  return`<span class="badge bd">On Hold</span>`;
  return`<span class="badge bd">${s}</span>`;
}
function calDueBadge(nextDue){
  if(!nextDue) return`<span class="badge bd">—</span>`;
  const today=new Date(); today.setHours(0,0,0,0);
  const due=new Date(nextDue);
  const diff=Math.ceil((due-today)/(1000*60*60*24));
  if(diff<0)  return`<span class="badge br">Overdue ${Math.abs(diff)}d</span>`;
  if(diff<=30) return`<span class="badge bp">Due in ${diff}d</span>`;
  return`<span class="badge ba">${nextDue}</span>`;
}
function calNextDue(calibDate, frequencyMonths){
  if(!calibDate||!frequencyMonths) return '';
  const d=new Date(calibDate);
  d.setMonth(d.getMonth()+parseInt(frequencyMonths));
  return d.toISOString().split('T')[0];
}
function calResultBadge(r){
  if(r==='Pass')    return`<span class="badge ba">Pass</span>`;
  if(r==='Fail')    return`<span class="badge br">Fail</span>`;
  if(r==='Conditional') return`<span class="badge bp">Conditional</span>`;
  return`<span class="badge bd">${r||'—'}</span>`;
}
function calPrintCSS(){
  return`*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:8.5pt;color:#000;background:#fff}
@page{size:A4;margin:12mm 13mm 14mm 13mm}
.pg-hdr{border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px;display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:6px;align-items:end}
.co-name{font-size:11pt;font-weight:bold}.co-sub{font-size:7pt;color:#555}
.rpt-title{text-align:center;font-size:9.5pt;font-weight:bold}
.rpt-sub{text-align:center;font-size:7.5pt;color:#444;margin-top:1px}
.rpt-num{text-align:right;font-size:8pt;font-weight:bold}
table.dt{width:100%;border-collapse:collapse;font-size:7.5pt}
table.dt th{background:#ececec;border:1px solid #000;padding:4px 6px;text-align:left;font-weight:bold}
table.dt td{border:1px solid #ccc;padding:3px 6px;vertical-align:top}
table.dt tr:nth-child(even) td{background:#f7f7f7}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-bottom:7px}
.mc{border:1px solid #ccc;padding:3px 6px}
.mc .ml{font-size:6.5pt;color:#777;text-transform:uppercase;font-weight:bold}
.mc .mv{font-size:8.5pt;font-weight:600}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
}

// ── Compute latest calibration per gauge ──────────────
async function calGetLatest(gaugeId){
  const recs=await db.calRecords.where('gaugeId').equals(gaugeId).toArray().catch(()=>[]);
  if(!recs.length) return null;
  return recs.sort((a,b)=>(b.calibDate||'')>(a.calibDate||'')?1:-1)[0];
}

// ══════════════════════════════════════════════════════
//  GAUGE REGISTER
// ══════════════════════════════════════════════════════
async function calRenderGauges(){
  const gauges=await db.calGauges.toArray().catch(()=>[]);
  gauges.sort((a,b)=>a.gaugeId>b.gaugeId?1:-1);
  // Get latest calibration for each
  const latestMap={};
  for(const g of gauges){
    latestMap[g.id]=await calGetLatest(g.id);
  }
  setC(`
  <div class="ph">
    <h2>🔧 Gauge Register</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="calOpenGaugeForm()">+ Add Gauge</button>
      <button class="btn btn-o" onclick="calPrintGaugeRegister()">🖨️ Print Register</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>All Gauges — ${gauges.length} instruments</h5>
      <span class="muted" style="font-size:11px">VRA-CAL-001 · Gauge Register</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Gauge ID</th><th>Instrument Name</th><th>Type</th><th>Make / Model</th>
        <th>Range</th><th>Least Count</th><th>Location</th>
        <th>Frequency</th><th>Last Calibrated</th><th>Next Due</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${gauges.length===0
        ?`<tr><td colspan="12" style="text-align:center;padding:30px;color:#9ca3af">No gauges added. Click + Add Gauge to start.</td></tr>`
        :gauges.map(g=>{
          const lat=latestMap[g.id];
          const nextDue=lat?lat.nextDue:g.nextDueOverride||'';
          return`<tr>
            <td class="mono" style="color:var(--navy);font-weight:700">${esc(g.gaugeId)}</td>
            <td><strong>${esc(g.name)}</strong></td>
            <td>${esc(g.type||'—')}</td>
            <td>${esc(g.make||'—')}</td>
            <td>${esc(g.range||'—')}</td>
            <td>${esc(g.leastCount||'—')}</td>
            <td>${esc(g.location||'—')}</td>
            <td style="text-align:center">${g.frequencyMonths?g.frequencyMonths+' mo':'—'}</td>
            <td>${lat?lat.calibDate:'<span class="muted">Never</span>'}</td>
            <td>${calDueBadge(nextDue)}</td>
            <td>${calStatusBadge(g.status||'Active')}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-p btn-xs" onclick="calOpenRecordForm(null,${g.id})">+ Calibrate</button>
              <button class="btn btn-o btn-xs" onclick="calOpenGaugeForm(${g.id})">✏️</button>
              <button class="btn btn-r btn-xs" onclick="calDeleteGauge(${g.id})">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`);
}

async function calOpenGaugeForm(id=null){
  const g=id?await db.calGauges.get(id).catch(()=>null):null;
  const gid=g?g.gaugeId:await nextGaugeId();
  const ov=document.createElement('div');ov.className='overlay';ov.id='cal-g-ov';
  ov.innerHTML=`<div class="modal" style="width:560px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${g?'Edit Gauge':'Add Gauge / Instrument'}</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('cal-g-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Gauge ID</label>
        <input class="fc mono" id="cg-id" value="${esc(gid)}" style="color:var(--navy);font-weight:700"></div>
      <div class="fg"><label class="lbl">Instrument Name *</label>
        <input class="fc" id="cg-name" value="${esc(g?.name||'')}" placeholder="e.g. Vernier Caliper"></div>
      <div class="fg"><label class="lbl">Type / Category</label>
        <select class="fc" id="cg-type">
          ${['Vernier Caliper','Micrometer','Dial Gauge','Height Gauge','Bore Gauge','Plug Gauge',
             'Ring Gauge','Snap Gauge','Torque Wrench','Pressure Gauge','Temperature Gauge',
             'Surface Plate','Try Square','Hardness Tester','Other']
            .map(t=>`<option value="${t}" ${(g?.type||'')==t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Make / Brand</label>
        <input class="fc" id="cg-make" value="${esc(g?.make||'')}" placeholder="e.g. Mitutoyo"></div>
      <div class="fg"><label class="lbl">Model / ID No.</label>
        <input class="fc" id="cg-model" value="${esc(g?.model||'')}" placeholder="e.g. 530-122"></div>
      <div class="fg"><label class="lbl">Serial No.</label>
        <input class="fc mono" id="cg-serial" value="${esc(g?.serialNo||'')}" placeholder="Serial number"></div>
      <div class="fg"><label class="lbl">Range</label>
        <input class="fc" id="cg-range" value="${esc(g?.range||'')}" placeholder="e.g. 0–150 mm"></div>
      <div class="fg"><label class="lbl">Least Count / Resolution</label>
        <input class="fc" id="cg-lc" value="${esc(g?.leastCount||'')}" placeholder="e.g. 0.02 mm"></div>
      <div class="fg"><label class="lbl">Location / Department</label>
        <input class="fc" id="cg-loc" value="${esc(g?.location||'')}" placeholder="e.g. QC Lab, Production Floor"></div>
      <div class="fg"><label class="lbl">Calibration Frequency</label>
        <select class="fc" id="cg-freq">
          <option value="3"  ${g?.frequencyMonths==3?'selected':''}>3 Monthly</option>
          <option value="6"  ${(g?.frequencyMonths==6||!g?.frequencyMonths)?'selected':''}>6 Monthly</option>
          <option value="12" ${g?.frequencyMonths==12?'selected':''}>Yearly (12 Monthly)</option>
          <option value="24" ${g?.frequencyMonths==24?'selected':''}>2 Yearly</option>
        </select></div>
      <div class="fg"><label class="lbl">Calibration Source</label>
        <select class="fc" id="cg-src">
          ${['In-house','External Lab','NABL Accredited Lab']
            .map(s=>`<option value="${s}" ${(g?.calibSource||'In-house')==s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Acceptable Accuracy</label>
        <input class="fc" id="cg-acc" value="${esc(g?.acceptableAccuracy||'')}" placeholder="e.g. ±0.02 mm"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="cg-status">
          ${['Active','On Hold','Scrapped'].map(s=>`<option value="${s}" ${(g?.status||'Active')==s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Remarks</label>
        <input class="fc" id="cg-remarks" value="${esc(g?.remarks||'')}" placeholder="Any notes"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('cal-g-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="calSaveGauge(${id||'null'})">💾 Save Gauge</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function calSaveGauge(id){
  const name=document.getElementById('cg-name').value.trim();
  if(!name){toast('Instrument name required','d');return;}
  const rec={
    gaugeId:document.getElementById('cg-id').value.trim(),
    name, type:document.getElementById('cg-type').value,
    make:document.getElementById('cg-make').value.trim(),
    model:document.getElementById('cg-model').value.trim(),
    serialNo:document.getElementById('cg-serial').value.trim(),
    range:document.getElementById('cg-range').value.trim(),
    leastCount:document.getElementById('cg-lc').value.trim(),
    location:document.getElementById('cg-loc').value.trim(),
    frequencyMonths:parseInt(document.getElementById('cg-freq').value),
    calibSource:document.getElementById('cg-src').value,
    acceptableAccuracy:document.getElementById('cg-acc').value.trim(),
    status:document.getElementById('cg-status').value,
    remarks:document.getElementById('cg-remarks').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(id) await db.calGauges.update(id,rec);
  else { rec.createdAt=new Date().toISOString(); await db.calGauges.add(rec); }
  document.getElementById('cal-g-ov').remove();
  toast(`✅ ${rec.gaugeId} — ${rec.name} saved`);
  calRenderGauges();
}

async function calDeleteGauge(id){
  const g=await db.calGauges.get(id);
  if(!confirm(`Delete ${g?.gaugeId} — ${g?.name}? All calibration records for this gauge will also be deleted.`)) return;
  await db.calRecords.where('gaugeId').equals(id).delete().catch(()=>{});
  await db.calGauges.delete(id);
  toast('Deleted','d'); calRenderGauges();
}

async function calPrintGaugeRegister(){
  const gauges=await db.calGauges.toArray().catch(()=>[]);
  gauges.sort((a,b)=>a.gaugeId>b.gaugeId?1:-1);
  const latestMap={};
  for(const g of gauges) latestMap[g.id]=await calGetLatest(g.id);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=gauges.map((g,i)=>{
    const lat=latestMap[g.id];
    const nextDue=lat?lat.nextDue:g.nextDueOverride||'—';
    return`<tr>
      <td style="text-align:center">${i+1}</td>
      <td style="font-family:monospace;font-weight:bold">${g.gaugeId}</td>
      <td><strong>${g.name}</strong></td>
      <td>${g.type||'—'}</td>
      <td>${g.make||'—'}</td>
      <td>${g.serialNo||'—'}</td>
      <td>${g.range||'—'}</td>
      <td>${g.leastCount||'—'}</td>
      <td>${g.location||'—'}</td>
      <td style="text-align:center">${g.frequencyMonths?g.frequencyMonths+' mo':'—'}</td>
      <td>${g.calibSource||'—'}</td>
      <td>${lat?lat.calibDate:'Never'}</td>
      <td style="font-weight:bold;color:${new Date(nextDue)<new Date()?'#7f1d1d':'#000'}">${nextDue}</td>
      <td style="font-weight:bold">${g.status||'Active'}</td>
    </tr>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Gauge Register</title>
  <style>${calPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div></div>
    <div><div class="rpt-title">GAUGE & INSTRUMENT REGISTER</div><div class="rpt-sub">Calibration Control</div></div>
    <div><div class="rpt-num">VRA-CAL-001</div><div style="font-size:7pt;text-align:right">Date: ${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>#</th><th>Gauge ID</th><th>Name</th><th>Type</th><th>Make</th><th>Serial No.</th>
      <th>Range</th><th>Least Count</th><th>Location</th><th>Freq.</th>
      <th>Source</th><th>Last Calib.</th><th>Next Due</th><th>Status</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="14" style="text-align:center;padding:10px">No gauges</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${gauges.length} &nbsp;|&nbsp; VRA-CAL-001 &nbsp;|&nbsp; V R Alucast — Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  CALIBRATION RECORDS
// ══════════════════════════════════════════════════════
async function calRenderRecords(){
  const records=await db.calRecords.toArray().catch(()=>[]);
  const gauges=await db.calGauges.toArray().catch(()=>[]);
  records.sort((a,b)=>(b.calibDate||'')>(a.calibDate||'')?1:-1);

  // Build gauge filter dropdown
  const gaugeOpts=`<option value="">All Gauges</option>`+
    gauges.map(g=>`<option value="${g.id}">${g.gaugeId} — ${g.name}</option>`).join('');

  setC(`
  <div class="ph">
    <h2>📅 Calibration Records</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="fc" id="cal-filter-gauge" style="width:220px;font-size:12.5px" onchange="calFilterRecords()">
        ${gaugeOpts}
      </select>
      <button class="btn btn-p" onclick="calOpenRecordForm()">+ Add Record</button>
      <button class="btn btn-o" onclick="calPrintRecords()">🖨️ Print</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>Calibration History — ${records.length} records</h5>
      <span class="muted" style="font-size:11px">VRA-CAL-002 · Calibration Record</span>
    </div>
    <div class="tw"><table id="cal-rec-table">
      <thead><tr>
        <th>Record No.</th><th>Gauge ID</th><th>Instrument</th>
        <th>Calib. Date</th><th>Next Due</th><th>Done By</th>
        <th>Lab / Agency</th><th>Cert. No.</th><th>Result</th><th>Remarks</th><th></th>
      </tr></thead>
      <tbody id="cal-rec-body">
        ${calRecordRows(records,gauges)}
      </tbody>
    </table></div>
  </div>`);
}

function calRecordRows(records,gauges){
  if(!records.length) return`<tr><td colspan="11" style="text-align:center;padding:30px;color:#9ca3af">No calibration records yet.</td></tr>`;
  return records.map(r=>{
    const g=gauges.find(x=>x.id===r.gaugeId);
    return`<tr>
      <td class="mono" style="font-size:11px;color:var(--navy)">${esc(r.recNumber||'—')}</td>
      <td class="mono" style="font-weight:700">${esc(g?.gaugeId||'—')}</td>
      <td>${esc(g?.name||'—')}</td>
      <td><strong>${r.calibDate||'—'}</strong></td>
      <td>${calDueBadge(r.nextDue)}</td>
      <td>${esc(r.doneBy||'—')}</td>
      <td>${esc(r.labName||'—')}</td>
      <td class="mono" style="font-size:11px">${esc(r.certNo||'—')}</td>
      <td>${calResultBadge(r.result)}</td>
      <td style="font-size:11.5px;color:var(--muted)">${esc(r.remarks||'')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-o btn-xs" onclick="calOpenRecordForm(${r.id})">✏️</button>
        <button class="btn btn-p btn-xs" onclick="calPrintSingleRecord(${r.id})">🖨️</button>
        <button class="btn btn-r btn-xs" onclick="calDeleteRecord(${r.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

async function calFilterRecords(){
  const gid=parseInt(document.getElementById('cal-filter-gauge')?.value)||null;
  let records=await db.calRecords.toArray().catch(()=>[]);
  if(gid) records=records.filter(r=>r.gaugeId===gid);
  records.sort((a,b)=>(b.calibDate||'')>(a.calibDate||'')?1:-1);
  const gauges=await db.calGauges.toArray().catch(()=>[]);
  const body=document.getElementById('cal-rec-body');
  if(body) body.innerHTML=calRecordRows(records,gauges);
}

async function calOpenRecordForm(id=null, preGaugeId=null){
  const r=id?await db.calRecords.get(id).catch(()=>null):null;
  const gauges=await db.calGauges.toArray().catch(()=>[]);
  const recNum=r?r.recNumber:await nextCalRecNum();
  const selGaugeId=r?r.gaugeId:preGaugeId||null;
  // Pre-fill next due based on gauge frequency
  const selGauge=selGaugeId?gauges.find(g=>g.id===selGaugeId):null;

  const ov=document.createElement('div');ov.className='overlay';ov.id='cal-r-ov';
  ov.innerHTML=`<div class="modal" style="width:560px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${r?'Edit Calibration Record':'New Calibration Record'} &nbsp;<span class="mono" style="color:var(--navy);font-size:12px">${recNum}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('cal-r-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Record Number</label>
        <input class="fc mono" id="cr-num" value="${esc(recNum)}" readonly style="background:#f5f7fd;color:var(--navy);font-weight:700"></div>
      <div class="fg"><label class="lbl">Gauge / Instrument *</label>
        <select class="fc" id="cr-gauge" onchange="calAutoNextDue()">
          <option value="">— Select Gauge —</option>
          ${gauges.map(g=>`<option value="${g.id}" data-freq="${g.frequencyMonths||6}" ${selGaugeId===g.id?'selected':''}>${g.gaugeId} — ${g.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Calibration Date *</label>
        <input class="fc" type="date" id="cr-date" value="${r?.calibDate||''}" onchange="calAutoNextDue()"></div>
      <div class="fg"><label class="lbl">Next Due Date</label>
        <input class="fc" type="date" id="cr-nextdue" value="${r?.nextDue||''}">
        <div class="muted" style="font-size:11px;margin-top:2px">Auto-calculated from frequency. Edit if needed.</div>
      </div>
      <div class="fg"><label class="lbl">Calibrated By / Done By</label>
        <input class="fc" id="cr-doneby" value="${esc(r?.doneBy||'Akshay Dake')}" placeholder="Person or lab name"></div>
      <div class="fg"><label class="lbl">Lab / Agency</label>
        <input class="fc" id="cr-lab" value="${esc(r?.labName||'')}" placeholder="e.g. NABL Lab, In-house"></div>
      <div class="fg"><label class="lbl">Certificate Number</label>
        <input class="fc mono" id="cr-cert" value="${esc(r?.certNo||'')}" placeholder="Calibration cert no."></div>
      <div class="fg"><label class="lbl">Result</label>
        <select class="fc" id="cr-result">
          ${['Pass','Fail','Conditional'].map(x=>`<option value="${x}" ${(r?.result||'Pass')===x?'selected':''}>${x}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Observed Error / Reading</label>
        <input class="fc" id="cr-obs" value="${esc(r?.observed||'')}" placeholder="e.g. 0.01 mm error at 50mm"></div>
      <div class="fg"><label class="lbl">Acceptable Accuracy</label>
        <input class="fc" id="cr-acc" value="${esc(r?.acceptableAccuracy||selGauge?.acceptableAccuracy||'')}" placeholder="e.g. ±0.02 mm"></div>
    </div>
    <div class="fg" style="margin-top:6px"><label class="lbl">Remarks / Action Taken</label>
      <textarea class="fc" id="cr-remarks" rows="2" placeholder="e.g. Cleaned and adjusted, issued sticker">${esc(r?.remarks||'')}</textarea></div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('cal-r-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="calSaveRecord(${id||'null'})">💾 Save Record</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  // Auto-calculate next due on open if editing
  if(r?.calibDate&&r?.nextDue) return;
  if(selGauge&&r?.calibDate) calAutoNextDue();
}

function calAutoNextDue(){
  const sel=document.getElementById('cr-gauge');
  const opt=sel?.options[sel.selectedIndex];
  const freq=parseInt(opt?.dataset?.freq)||6;
  const dateVal=document.getElementById('cr-date')?.value;
  if(!dateVal) return;
  const nextDue=calNextDue(dateVal,freq);
  const nd=document.getElementById('cr-nextdue');
  if(nd&&!nd._manuallyEdited) nd.value=nextDue;
}

async function calSaveRecord(id){
  const gaugeId=parseInt(document.getElementById('cr-gauge').value);
  const calibDate=document.getElementById('cr-date').value;
  if(!gaugeId||!calibDate){toast('Gauge and Calibration Date are required','d');return;}
  const rec={
    gaugeId, recNumber:document.getElementById('cr-num').value.trim(),
    calibDate, nextDue:document.getElementById('cr-nextdue').value,
    doneBy:document.getElementById('cr-doneby').value.trim(),
    labName:document.getElementById('cr-lab').value.trim(),
    certNo:document.getElementById('cr-cert').value.trim(),
    result:document.getElementById('cr-result').value,
    observed:document.getElementById('cr-obs').value.trim(),
    acceptableAccuracy:document.getElementById('cr-acc').value.trim(),
    remarks:document.getElementById('cr-remarks').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(id) await db.calRecords.update(id,rec);
  else { rec.createdAt=new Date().toISOString(); await db.calRecords.add(rec); }
  document.getElementById('cal-r-ov').remove();
  toast(`✅ ${rec.recNumber} saved`);
  calRenderRecords();
}

async function calDeleteRecord(id){
  if(!confirm('Delete this calibration record?')) return;
  await db.calRecords.delete(id);
  toast('Deleted','d'); calRenderRecords();
}

async function calPrintRecords(){
  const gidFilter=parseInt(document.getElementById('cal-filter-gauge')?.value)||null;
  let records=await db.calRecords.toArray().catch(()=>[]);
  if(gidFilter) records=records.filter(r=>r.gaugeId===gidFilter);
  records.sort((a,b)=>(b.calibDate||'')>(a.calibDate||'')?1:-1);
  const gauges=await db.calGauges.toArray().catch(()=>[]);
  const today=new Date().toLocaleDateString('en-IN');
  const titleGauge=gidFilter?gauges.find(g=>g.id===gidFilter):null;

  const rows=records.map((r,i)=>{
    const g=gauges.find(x=>x.id===r.gaugeId);
    const overdue=r.nextDue&&new Date(r.nextDue)<new Date();
    return`<tr>
      <td style="text-align:center">${i+1}</td>
      <td style="font-family:monospace;font-size:8pt">${r.recNumber||'—'}</td>
      <td style="font-family:monospace;font-weight:bold">${g?.gaugeId||'—'}</td>
      <td><strong>${g?.name||'—'}</strong></td>
      <td><strong>${r.calibDate||'—'}</strong></td>
      <td style="font-weight:bold;color:${overdue?'#7f1d1d':'#000'}">${r.nextDue||'—'}</td>
      <td>${r.doneBy||'—'}</td>
      <td>${r.labName||'—'}</td>
      <td style="font-family:monospace;font-size:7.5pt">${r.certNo||'—'}</td>
      <td style="font-weight:bold;color:${r.result==='Pass'?'#14532d':r.result==='Fail'?'#7f1d1d':'#92400e'}">${r.result||'—'}</td>
      <td>${r.remarks||''}</td>
    </tr>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Calibration Records</title>
  <style>${calPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div></div>
    <div><div class="rpt-title">CALIBRATION RECORD${titleGauge?' — '+titleGauge.gaugeId:''}</div>
      <div class="rpt-sub">${titleGauge?titleGauge.name:'All Instruments'}</div></div>
    <div><div class="rpt-num">VRA-CAL-002</div><div style="font-size:7pt;text-align:right">Date: ${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>#</th><th>Rec No.</th><th>Gauge ID</th><th>Instrument</th>
      <th>Calib. Date</th><th>Next Due</th><th>Done By</th>
      <th>Lab / Agency</th><th>Cert No.</th><th>Result</th><th>Remarks</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="11" style="text-align:center;padding:10px">No records</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${records.length} records &nbsp;|&nbsp; VRA-CAL-002 &nbsp;|&nbsp; V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

async function calPrintSingleRecord(id){
  const r=await db.calRecords.get(id).catch(()=>null);
  if(!r) return;
  const g=await db.calGauges.get(r.gaugeId).catch(()=>null);
  const today=new Date().toLocaleDateString('en-IN');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${r.recNumber}</title>
  <style>${calPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div></div>
    <div><div class="rpt-title">CALIBRATION RECORD</div><div class="rpt-sub">${g?.gaugeId} — ${g?.name}</div></div>
    <div><div class="rpt-num">${r.recNumber}</div><div style="font-size:7pt;text-align:right">VRA-CAL-002 &nbsp;|&nbsp; ${today}</div></div>
  </div>
  <div class="meta-grid" style="margin-bottom:7px">
    <div class="mc"><div class="ml">Gauge ID</div><div class="mv">${g?.gaugeId||'—'}</div></div>
    <div class="mc"><div class="ml">Instrument</div><div class="mv">${g?.name||'—'}</div></div>
    <div class="mc"><div class="ml">Type</div><div class="mv">${g?.type||'—'}</div></div>
    <div class="mc"><div class="ml">Serial No.</div><div class="mv">${g?.serialNo||'—'}</div></div>
    <div class="mc"><div class="ml">Range</div><div class="mv">${g?.range||'—'}</div></div>
    <div class="mc"><div class="ml">Least Count</div><div class="mv">${g?.leastCount||'—'}</div></div>
    <div class="mc"><div class="ml">Acceptable Accuracy</div><div class="mv">${r.acceptableAccuracy||g?.acceptableAccuracy||'—'}</div></div>
    <div class="mc"><div class="ml">Location</div><div class="mv">${g?.location||'—'}</div></div>
    <div class="mc"><div class="ml">Calibration Date</div><div class="mv"><strong>${r.calibDate||'—'}</strong></div></div>
    <div class="mc"><div class="ml">Next Due Date</div><div class="mv"><strong>${r.nextDue||'—'}</strong></div></div>
    <div class="mc"><div class="ml">Frequency</div><div class="mv">${g?.frequencyMonths?g.frequencyMonths+' Monthly':'—'}</div></div>
    <div class="mc"><div class="ml">Calibration Source</div><div class="mv">${g?.calibSource||'—'}</div></div>
    <div class="mc"><div class="ml">Done By / Lab</div><div class="mv">${r.doneBy||'—'}</div></div>
    <div class="mc"><div class="ml">Lab / Agency</div><div class="mv">${r.labName||'—'}</div></div>
    <div class="mc"><div class="ml">Certificate No.</div><div class="mv" style="font-family:monospace">${r.certNo||'—'}</div></div>
    <div class="mc"><div class="ml">Result</div><div class="mv" style="font-weight:bold;color:${r.result==='Pass'?'#14532d':r.result==='Fail'?'#7f1d1d':'#92400e'}">${r.result||'—'}</div></div>
  </div>
  ${r.observed?`<div style="margin-bottom:5px"><strong>Observed Error / Reading:</strong> ${r.observed}</div>`:''}
  ${r.remarks?`<div style="margin-bottom:8px"><strong>Remarks / Action Taken:</strong> ${r.remarks}</div>`:''}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:8pt;margin-top:12px">
    <div style="border:1px solid #000;padding:7px"><strong>Calibrated By:</strong> ${r.doneBy||''}<br><br>Signature: _________________________&nbsp;&nbsp; Date: ______________</div>
    <div style="border:1px solid #000;padding:7px"><strong>Verified By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp;&nbsp; Date: ______________</div>
  </div>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">${r.recNumber} &nbsp;|&nbsp; VRA-CAL-002 &nbsp;|&nbsp; V R Alucast — Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  DUE & OVERDUE
// ══════════════════════════════════════════════════════
async function calRenderDue(){
  const gauges=await db.calGauges.where('status').equals('Active').toArray().catch(()=>[]);
  const today=new Date(); today.setHours(0,0,0,0);
  const in60=new Date(today); in60.setDate(in60.getDate()+60);

  const rows=[];
  for(const g of gauges){
    const lat=await calGetLatest(g.id);
    const nextDue=lat?.nextDue||'';
    if(!nextDue) { rows.push({g,lat,nextDue:'',status:'Never Calibrated',daysLeft:-9999}); continue; }
    const dueDate=new Date(nextDue);
    const daysLeft=Math.ceil((dueDate-today)/(1000*60*60*24));
    if(daysLeft<=60) rows.push({g,lat,nextDue,status:daysLeft<0?'Overdue':daysLeft===0?'Due Today':'Due Soon',daysLeft});
  }
  rows.sort((a,b)=>a.daysLeft-b.daysLeft);

  const overdue=rows.filter(r=>r.daysLeft<0||r.status==='Never Calibrated');
  const dueToday=rows.filter(r=>r.daysLeft===0);
  const dueSoon=rows.filter(r=>r.daysLeft>0&&r.daysLeft<=60);

  function statusStyle(r){
    if(r.daysLeft<0||r.status==='Never Calibrated') return'background:#fff5f5';
    if(r.daysLeft===0) return'background:#fffbeb';
    return'background:#f0fdf4';
  }

  setC(`
  <div class="ph">
    <h2>⚠️ Due & Overdue Calibrations</h2>
    <button class="btn btn-o" onclick="calPrintDueReport()">🖨️ Print Due Report</button>
  </div>
  ${overdue.length?`<div class="alert al-d">🔴 ${overdue.length} gauge(s) overdue or never calibrated — immediate action required.</div>`:''}
  ${dueToday.length?`<div class="alert al-w">📅 ${dueToday.length} gauge(s) due for calibration today.</div>`:''}
  ${!rows.length?`<div class="alert al-s">✅ All active gauges are within calibration schedule.</div>`:''}

  <div class="card">
    <div class="ch"><h5>Gauges Due Within 60 Days + Overdue (${rows.length})</h5></div>
    <div class="tw"><table>
      <thead><tr>
        <th>Gauge ID</th><th>Instrument</th><th>Type</th><th>Location</th>
        <th>Frequency</th><th>Last Calibrated</th><th>Next Due</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows.length===0
        ?`<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">No gauges due within 60 days.</td></tr>`
        :rows.map(r=>`<tr style="${statusStyle(r)}">
          <td class="mono" style="font-weight:700;color:var(--navy)">${esc(r.g.gaugeId)}</td>
          <td><strong>${esc(r.g.name)}</strong></td>
          <td>${esc(r.g.type||'—')}</td>
          <td>${esc(r.g.location||'—')}</td>
          <td style="text-align:center">${r.g.frequencyMonths?r.g.frequencyMonths+' mo':'—'}</td>
          <td>${r.lat?r.lat.calibDate:'<span class="muted">Never</span>'}</td>
          <td>${calDueBadge(r.nextDue)}</td>
          <td><span class="badge ${r.daysLeft<0||r.status==='Never Calibrated'?'br':r.daysLeft===0?'bp':'ba'}">${r.status}</span></td>
          <td><button class="btn btn-p btn-xs" onclick="calOpenRecordForm(null,${r.g.id})">+ Calibrate</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

async function calPrintDueReport(){
  const gauges=await db.calGauges.where('status').equals('Active').toArray().catch(()=>[]);
  const today=new Date(); today.setHours(0,0,0,0);
  const todayStr=today.toLocaleDateString('en-IN');
  const rows=[];
  for(const g of gauges){
    const lat=await calGetLatest(g.id);
    const nextDue=lat?.nextDue||'';
    const daysLeft=nextDue?Math.ceil((new Date(nextDue)-today)/(1000*60*60*24)):-9999;
    if(daysLeft<=60) rows.push({g,lat,nextDue,daysLeft,status:daysLeft<0?'OVERDUE':daysLeft===0?'DUE TODAY':'DUE SOON'});
  }
  rows.sort((a,b)=>a.daysLeft-b.daysLeft);
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Calibration Due Report</title>
  <style>${calPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div></div>
    <div><div class="rpt-title">CALIBRATION DUE REPORT</div><div class="rpt-sub">Gauges Due Within 60 Days + Overdue</div></div>
    <div><div class="rpt-num">VRA-CAL-003</div><div style="font-size:7pt;text-align:right">Date: ${todayStr}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>Gauge ID</th><th>Instrument</th><th>Type</th><th>Location</th>
      <th>Frequency</th><th>Last Calib.</th><th>Next Due</th><th>Days Left</th><th>Status</th>
    </tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td style="font-family:monospace;font-weight:bold">${r.g.gaugeId}</td>
      <td><strong>${r.g.name}</strong></td>
      <td>${r.g.type||'—'}</td>
      <td>${r.g.location||'—'}</td>
      <td style="text-align:center">${r.g.frequencyMonths?r.g.frequencyMonths+' mo':'—'}</td>
      <td>${r.lat?r.lat.calibDate:'Never'}</td>
      <td style="font-weight:bold">${r.nextDue||'—'}</td>
      <td style="text-align:center;font-weight:bold;color:${r.daysLeft<0?'#7f1d1d':'#92400e'}">${r.daysLeft<-9000?'—':r.daysLeft}</td>
      <td style="font-weight:bold;color:${r.daysLeft<0?'#7f1d1d':r.daysLeft===0?'#92400e':'#14532d'}">${r.status}</td>
    </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:10px">No gauges due</td></tr>'}
    </tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total due/overdue: ${rows.length} &nbsp;|&nbsp; VRA-CAL-003 &nbsp;|&nbsp; V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════

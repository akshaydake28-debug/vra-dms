// VRA DMS — PURCHASING MODULE

// ══════════════════════════════════════════════════════
//  PURCHASING — SUPPLIER MANAGEMENT MODULE
// ══════════════════════════════════════════════════════

// ── NUMBERING ─────────────────────────────────────────
async function nextSupNumber(){
  const n=(await db.purSuppliers.count().catch(()=>0))+1;
  return `VRA-SUP-${String(n).padStart(3,'0')}`;
}
async function nextPONumber(supId){
  const all=await db.purDeliveries.where('supId').equals(supId).count().catch(()=>0);
  const y=new Date().getFullYear();
  // Global PO sequence across all suppliers
  const allPos=await db.purDeliveries.toArray().catch(()=>[]);
  const forYear=allPos.filter(p=>p.poNumber&&p.poNumber.includes(`VRA-PO-${y}`));
  return `VRA-PO-${y}-${String(forYear.length+1).padStart(3,'0')}`;
}

// ── SCORING HELPERS ───────────────────────────────────
const PUR_PARAMS=['quality','delivery','price','service','controlType','controlExtent'];
const PUR_PARAM_LABELS={
  quality:'Quality',delivery:'On-Time Delivery',price:'Price / Rate',
  service:'Service & Co-op',controlType:'Type of Control',controlExtent:'Extent of Control'
};

function purCalcScore(deliveries){
  if(!deliveries.length) return{passRate:0,grade:'—',totalPass:0,totalChecks:0,perParam:{}};
  let totalPass=0,totalChecks=0;
  const perParam={};
  PUR_PARAMS.forEach(p=>{perParam[p]={pass:0,total:0};});
  deliveries.forEach(d=>{
    PUR_PARAMS.forEach(p=>{
      if(d.ratings&&d.ratings[p]!==undefined&&d.ratings[p]!==''){
        perParam[p].total++;totalChecks++;
        if(d.ratings[p]==='P'){perParam[p].pass++;totalPass++;}
      }
    });
  });
  const passRate=totalChecks?Math.round((totalPass/totalChecks)*100):0;
  const grade=passRate>=80?'A':passRate>=60?'B':'C';
  return{passRate,grade,totalPass,totalChecks,perParam};
}

function purAutoStatus(grade,current){
  if(grade==='A') return'Approved';
  if(grade==='B') return'Conditional';
  if(grade==='C') return'Under Review';
  return current||'Under Evaluation';
}

async function purUpdateLiveStatus(supId){
  const deliveries=await db.purDeliveries.where('supId').equals(supId).toArray().catch(()=>[]);
  const sup=await db.purSuppliers.get(supId);
  // First 2 deliveries check for initial approval
  const first2=deliveries.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1).slice(0,2);
  const first2AllPass=first2.length>=2&&first2.every(d=>
    PUR_PARAMS.every(p=>d.ratings&&d.ratings[p]==='P')
  );
  const sc=purCalcScore(deliveries);
  let newStatus=sup.approvalStatus;
  if(!first2AllPass&&deliveries.length<2){
    newStatus='Under Evaluation';
  } else if(first2AllPass||deliveries.length>=2){
    newStatus=purAutoStatus(sc.grade,sup.approvalStatus);
  }
  if(newStatus!==sup.approvalStatus){
    await db.purSuppliers.update(supId,{approvalStatus:newStatus,lastScoreUpdate:new Date().toISOString()});
    if(newStatus==='Approved'&&sup.approvalStatus!=='Approved'){
      toast(`✅ ${sup.name} auto-approved — added to Approved List!`,'s');
    } else if(newStatus==='Under Review'){
      toast(`⚠️ ${sup.name} moved to Under Review — Grade C`,'w');
    }
  }
  return sc;
}

// ── BADGES ────────────────────────────────────────────
function purStatusBadge(s){
  const m={'Approved':'ba','Conditional':'bp','Under Evaluation':'bd','Under Review':'br','Suspended':'br'};
  return`<span class="badge ${m[s]||'bd'}">${s}</span>`;
}
function purGradeBadge(g,rate){
  if(g==='A') return`<span class="badge ba">A — ${rate}%</span>`;
  if(g==='B') return`<span class="badge bp">B — ${rate}%</span>`;
  if(g==='C') return`<span class="badge br">C — ${rate}%</span>`;
  return`<span class="badge bd">—</span>`;
}
function purPF(v){
  if(v==='P') return`<span style="color:#14532d;font-weight:800;font-size:13px">✓</span>`;
  if(v==='F') return`<span style="color:#7f1d1d;font-weight:800;font-size:13px">✗</span>`;
  return`<span style="color:#9ca3af">—</span>`;
}
function purPrintCSS(){
  return`*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:8.5pt;color:#000}
@page{size:A4;margin:12mm 13mm 14mm 13mm}
.pg-hdr{border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px;display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:6px;align-items:end}
.co-name{font-size:11pt;font-weight:bold}.co-sub{font-size:7pt;color:#555}
.rpt-title{text-align:center;font-size:9.5pt;font-weight:bold}
.rpt-sub{text-align:center;font-size:7.5pt;color:#444;margin-top:1px}
.rpt-num{text-align:right;font-size:8pt;font-weight:bold}
table.dt{width:100%;border-collapse:collapse;font-size:7.5pt;margin-bottom:6px}
table.dt th{background:#ececec;border:1px solid #000;padding:4px 6px;text-align:center;font-weight:bold}
table.dt th.tl{text-align:left}
table.dt td{border:1px solid #ccc;padding:3px 6px;vertical-align:middle;text-align:center}
table.dt td.tl{text-align:left}
table.dt tr:nth-child(even) td{background:#f7f7f7}
.sec-bar{background:#ececec;border-left:3px solid #000;padding:3px 7px;font-size:7.5pt;font-weight:bold;text-transform:uppercase;margin:8px 0 4px}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-bottom:7px}
.mc{border:1px solid #ccc;padding:3px 6px}.mc .ml{font-size:6.5pt;color:#777;text-transform:uppercase;font-weight:bold}.mc .mv{font-size:8.5pt;font-weight:600}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
}

// ══════════════════════════════════════════════════════
//  SUPPLIER REGISTER
// ══════════════════════════════════════════════════════
async function purRenderSuppliers(){
  const sups=await db.purSuppliers.toArray().catch(()=>[]);
  sups.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  // Get live score for each
  const scoreMap={};
  for(const s of sups){
    const deliveries=await db.purDeliveries.where('supId').equals(s.id).toArray().catch(()=>[]);
    scoreMap[s.id]=purCalcScore(deliveries);
  }
  const counts={Approved:0,'Under Evaluation':0,'Conditional':0,'Under Review':0};
  sups.forEach(s=>{if(counts[s.approvalStatus]!==undefined)counts[s.approvalStatus]++;});

  setC(`
  <div class="ph">
    <h2>🏭 Supplier Register</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="purOpenSupForm()">+ Add Supplier</button>
      <button class="btn btn-o" onclick="purPrintSupList()">🖨️ Print List</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
    ${[['Approved',counts.Approved,'ba'],['Under Evaluation',counts['Under Evaluation'],'bd'],['Conditional',counts['Conditional'],'bp'],['Under Review',counts['Under Review'],'br']].map(([l,n,c])=>`
    <div class="card" style="padding:12px 16px">
      <div style="font-size:22px;font-weight:800;color:var(--navy)">${n}</div>
      <div class="muted" style="font-size:12px">${l}</div>
    </div>`).join('')}
  </div>
  <div class="card">
    <div class="ch"><h5>All Suppliers — ${sups.length} records</h5>
      <span class="muted" style="font-size:11px">VRA-PUR-001</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Sup No.</th><th>Supplier Name</th><th>Scope of Supply</th>
        <th>Deliveries</th><th>Pass Rate</th><th>Grade</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${sups.length===0
        ?`<tr><td colspan="8" style="text-align:center;padding:30px;color:#9ca3af">No suppliers yet.</td></tr>`
        :sups.map(s=>{
          const sc=scoreMap[s.id];
          const dCount=sc.totalChecks?Math.round(sc.totalChecks/PUR_PARAMS.length):0;
          return`<tr>
            <td class="mono" style="color:var(--navy);font-weight:700">${esc(s.supNumber)}</td>
            <td><strong>${esc(s.name)}</strong></td>
            <td>${esc(s.scope||'—')}</td>
            <td style="text-align:center"><span class="badge bd">${dCount}</span></td>
            <td style="text-align:center">${sc.totalChecks?`<strong>${sc.passRate}%</strong>`:'<span class="muted">—</span>'}</td>
            <td style="text-align:center">${sc.grade!=='—'?purGradeBadge(sc.grade,sc.passRate):'<span class="muted">—</span>'}</td>
            <td>${purStatusBadge(s.approvalStatus||'Under Evaluation')}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-o btn-xs" onclick="purViewSupplier(${s.id})">👁️ View</button>
              <button class="btn btn-o btn-xs" onclick="purOpenSupForm(${s.id})">✏️</button>
              <button class="btn btn-r btn-xs" onclick="purDeleteSupplier(${s.id})">🗑️</button>
            </td>
          </tr>`;}).join('')}
      </tbody>
    </table></div>
  </div>`);
}

async function purOpenSupForm(id=null){
  const s=id?await db.purSuppliers.get(id).catch(()=>null):null;
  const num=s?s.supNumber:await nextSupNumber();
  const ov=document.createElement('div');ov.className='overlay';ov.id='pur-sup-ov';
  ov.innerHTML=`<div class="modal" style="width:540px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${s?'Edit Supplier':'New Supplier'} &nbsp;<span class="mono" style="color:var(--navy);font-size:12px">${num}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('pur-sup-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Supplier Number</label>
        <input class="fc mono" id="ps-num" value="${esc(num)}" readonly style="background:#f5f7fd;color:var(--navy);font-weight:700"></div>
      <div class="fg"><label class="lbl">Date</label>
        <input class="fc" type="date" id="ps-date" value="${s?.date||new Date().toISOString().split('T')[0]}"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Supplier Name *</label>
        <input class="fc" id="ps-name" value="${esc(s?.name||'')}" placeholder="M/s Supplier Name"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Scope of Supply *</label>
        <input class="fc" id="ps-scope" value="${esc(s?.scope||'')}" placeholder="e.g. ADC12 Ingots, Die Lubricant"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="ps-status">
          ${['Under Evaluation','Approved','Conditional','Under Review','Suspended'].map(x=>`<option value="${x}" ${(s?.approvalStatus||'Under Evaluation')===x?'selected':''}>${x}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Remarks</label>
        <input class="fc" id="ps-remarks" value="${esc(s?.remarks||'')}" placeholder="Notes or conditions"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('pur-sup-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="purSaveSupplier(${id||'null'})">💾 Save</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function purSaveSupplier(id){
  const name=document.getElementById('ps-name').value.trim();
  if(!name){toast('Supplier name required','d');return;}
  const rec={
    supNumber:document.getElementById('ps-num').value.trim(),
    date:document.getElementById('ps-date').value,
    name, scope:document.getElementById('ps-scope').value.trim(),
    approvalStatus:document.getElementById('ps-status').value,
    remarks:document.getElementById('ps-remarks').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(id) await db.purSuppliers.update(id,rec);
  else { rec.createdAt=new Date().toISOString(); await db.purSuppliers.add(rec); }
  document.getElementById('pur-sup-ov').remove();
  toast(`✅ ${rec.name} saved`); purRenderSuppliers();
}

async function purDeleteSupplier(id){
  const s=await db.purSuppliers.get(id);
  if(!confirm(`Delete ${s?.name}? All delivery records will also be deleted.`)) return;
  await db.purDeliveries.where('supId').equals(id).delete().catch(()=>{});
  await db.purSuppliers.delete(id);
  toast('Deleted','d'); purRenderSuppliers();
}

// ══════════════════════════════════════════════════════
//  SUPPLIER DETAIL — UNIFIED DELIVERY + EVALUATION VIEW
// ══════════════════════════════════════════════════════
async function purViewSupplier(id){
  const s=await db.purSuppliers.get(id);
  const deliveries=await db.purDeliveries.where('supId').equals(id).toArray().catch(()=>[]);
  deliveries.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const sc=await purUpdateLiveStatus(id);
  const sup=await db.purSuppliers.get(id); // refresh after status update

  // First 2 approval check
  const first2=deliveries.slice(0,2);
  const first2Done=first2.length>=2;
  const first2Pass=first2Done&&first2.every(d=>PUR_PARAMS.every(p=>d.ratings&&d.ratings[p]==='P'));

  function paramRow(p){
    const pp=sc.perParam[p]||{pass:0,total:0};
    const pct=pp.total?Math.round((pp.pass/pp.total)*100):null;
    return`<tr>
      <td class="tl">${PUR_PARAM_LABELS[p]}</td>
      <td>${pp.total}</td>
      <td style="color:#14532d;font-weight:700">${pp.pass}</td>
      <td style="color:#7f1d1d;font-weight:700">${pp.total-pp.pass}</td>
      <td>${pct!==null?`<span class="badge ${pct>=80?'ba':pct>=60?'bp':'br'}">${pct}%</span>`:'—'}</td>
    </tr>`;
  }

  setC(`
  <div class="ph">
    <h2>🏭 ${esc(sup.name)} <span class="muted" style="font-size:13px">${esc(sup.supNumber)}</span></h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-o" onclick="purOpenSupForm(${id})">✏️ Edit</button>
      <button class="btn btn-p" onclick="purOpenDeliveryForm(${id})">+ Add Delivery</button>
      <button class="btn btn-o" onclick="purPrintEvalForm(${id})">🖨️ Print Eval Form</button>
      <button class="btn btn-o" onclick="purPrintScorecard(${id})">🖨️ Print Scorecard</button>
      <button class="btn btn-o" onclick="nav('pur-suppliers')">← Back</button>
    </div>
  </div>

  <!-- Status + Scorecard summary -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
    <div class="card">
      <div class="ch"><h5>Live Status</h5>${purStatusBadge(sup.approvalStatus||'Under Evaluation')}</div>
      <div class="cb">
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;font-size:13px">
          <div><div style="font-size:26px;font-weight:800;color:var(--navy)">${deliveries.length}</div><div class="muted" style="font-size:11px">Total Deliveries</div></div>
          <div><div style="font-size:26px;font-weight:800;color:${sc.grade==='A'?'#14532d':sc.grade==='B'?'#92400e':'#7f1d1d'}">${sc.grade}</div><div class="muted" style="font-size:11px">Grade</div></div>
          <div><div style="font-size:26px;font-weight:800;color:var(--navy)">${sc.passRate}%</div><div class="muted" style="font-size:11px">Overall Pass Rate</div></div>
        </div>
        <div style="margin-top:10px;font-size:12px">
          ${!first2Done?`<span class="badge bd">Evaluation in progress — ${deliveries.length}/2 initial deliveries done</span>`:
            first2Pass?`<span class="badge ba">✓ Initial 2 deliveries passed — auto-approved</span>`:
            `<span class="badge br">✗ Not all parameters passed in first 2 deliveries</span>`}
        </div>
        <div style="margin-top:6px;font-size:11.5px;color:var(--muted)">
          Grade A ≥80% → Approved &nbsp;|&nbsp; B 60–79% → Conditional &nbsp;|&nbsp; C &lt;60% → Under Review
        </div>
        ${sup.scope?`<div style="margin-top:8px;font-size:12.5px"><span class="muted">Scope:</span> <strong>${esc(sup.scope)}</strong></div>`:''}
        ${sup.remarks?`<div style="font-size:12px;color:var(--muted)">${esc(sup.remarks)}</div>`:''}
      </div>
    </div>
    <div class="card">
      <div class="ch"><h5>Parameter Scorecard</h5><span class="muted" style="font-size:11px">All deliveries</span></div>
      <div class="tw"><table>
        <thead><tr><th class="tl">Parameter</th><th>Entries</th><th style="color:#14532d">Pass</th><th style="color:#7f1d1d">Fail</th><th>Rate</th></tr></thead>
        <tbody>${PUR_PARAMS.map(p=>paramRow(p)).join('')}</tbody>
      </table></div>
    </div>
  </div>

  <!-- Delivery Register -->
  <div class="card">
    <div class="ch">
      <h5>Delivery Register — Evaluation Log (${deliveries.length})</h5>
      <button class="btn btn-p btn-sm" onclick="purOpenDeliveryForm(${id})">+ Add Delivery</button>
    </div>
    <div class="tw" style="overflow-x:auto"><table style="min-width:900px">
      <thead>
        <tr style="background:var(--navy);color:#fff">
          <th style="text-align:left;min-width:60px">Del #</th>
          <th style="text-align:left;min-width:90px">PO No.</th>
          <th style="text-align:left;min-width:70px">Date</th>
          <th style="text-align:left;min-width:120px">Material</th>
          <th style="text-align:left;min-width:60px">Qty</th>
          ${PUR_PARAMS.map(p=>`<th style="min-width:55px;font-size:10px">${PUR_PARAM_LABELS[p]}</th>`).join('')}
          <th style="text-align:left;min-width:120px">Remarks</th>
          <th style="min-width:50px"></th>
        </tr>
      </thead>
      <tbody>${deliveries.length===0
        ?`<tr><td colspan="13" style="text-align:center;padding:24px;color:#9ca3af">No deliveries recorded yet. Add the first delivery to start evaluation.</td></tr>`
        :deliveries.map((d,i)=>{
          const isFirst2=i<2;
          return`<tr style="${isFirst2?'background:#fffbeb':''}">
            <td style="text-align:center;font-weight:700">
              ${i+1}${isFirst2?` <span style="font-size:9px;color:#92400e;font-weight:600">(Init)</span>`:''}
            </td>
            <td class="mono" style="font-size:11px;font-weight:700;color:var(--navy)">${esc(d.poNumber||'—')}</td>
            <td>${d.date||'—'}</td>
            <td>${esc(d.material||'—')}<br><span class="muted" style="font-size:10px">${d.qty?d.qty+' '+(d.unit||''):'—'}</span></td>
            <td style="text-align:right;font-weight:600">${d.value?'₹'+Number(d.value).toLocaleString('en-IN'):'—'}</td>
            ${PUR_PARAMS.map(p=>`<td style="text-align:center">${purPF(d.ratings?.[p])}</td>`).join('')}
            <td style="font-size:11px;color:var(--muted)">${esc(d.remarks||'')}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-o btn-xs" onclick="purOpenDeliveryForm(${id},${d.id})">✏️</button>
              <button class="btn btn-r btn-xs" onclick="purDeleteDelivery(${d.id},${id})">🗑️</button>
            </td>
          </tr>`;}).join('')}
      </tbody>
    </table></div>
  </div>`);
}

// ── DELIVERY FORM ─────────────────────────────────────
async function purOpenDeliveryForm(supId,editId=null){
  const s=await db.purSuppliers.get(supId);
  const d=editId?await db.purDeliveries.get(editId).catch(()=>null):null;
  const poNum=d?d.poNumber:await nextPONumber(supId);
  const ratings=d?.ratings||{};
  const ov=document.createElement('div');ov.className='overlay';ov.id='pur-del-ov';
  ov.innerHTML=`<div class="modal" style="width:580px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${d?'Edit Delivery':'New Delivery'} — <span style="color:var(--navy)">${esc(s.name)}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('pur-del-ov').remove()">✕</button>
    </div>

    <div style="font-weight:700;font-size:11.5px;color:var(--navy);margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid var(--navy)">Delivery Details</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="fg"><label class="lbl">PO Number</label>
        <input class="fc mono" id="del-po" value="${esc(poNum)}" style="color:var(--navy);font-weight:700"></div>
      <div class="fg"><label class="lbl">Delivery / DC Date *</label>
        <input class="fc" type="date" id="del-date" value="${d?.date||new Date().toISOString().split('T')[0]}"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Material / Item *</label>
        <input class="fc" id="del-mat" value="${esc(d?.material||'')}" placeholder="e.g. ADC12 Ingot"></div>
      <div class="fg"><label class="lbl">Quantity</label>
        <input class="fc" type="number" id="del-qty" value="${d?.qty||''}" oninput="purCalcDelValue()"></div>
      <div class="fg"><label class="lbl">Unit</label>
        <select class="fc" id="del-unit">
          ${['Kg','MT','Nos','Ltrs','Set'].map(u=>`<option ${(d?.unit||'Kg')===u?'selected':''}>${u}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Rate (₹/unit)</label>
        <input class="fc" type="number" id="del-rate" value="${d?.rate||''}" oninput="purCalcDelValue()"></div>
      <div class="fg"><label class="lbl">Total Value (₹)</label>
        <input class="fc mono" id="del-value" value="${d?.value||''}" placeholder="Auto-calculated" style="background:#f5f7fd"></div>
    </div>

    <div style="font-weight:700;font-size:11.5px;color:var(--navy);margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid var(--navy)">
      Evaluation — Pass / Fail per Parameter
      <span style="font-size:10px;font-weight:400;color:#9ca3af;margin-left:6px">All Pass on first 2 deliveries → Auto Approved</span>
    </div>
    <div style="border:1px solid var(--border);border-radius:7px;overflow:hidden;margin-bottom:12px">
      ${PUR_PARAMS.map((p,i)=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;${i<PUR_PARAMS.length-1?'border-bottom:1px solid var(--border)':''}">
        <span style="font-size:12.5px;font-weight:500">${PUR_PARAM_LABELS[p]}</span>
        <div style="display:flex;gap:16px">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:#14532d">
            <input type="radio" name="rat-${p}" value="P" ${ratings[p]==='P'?'checked':''} style="accent-color:#14532d"> Pass ✓
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:#7f1d1d">
            <input type="radio" name="rat-${p}" value="F" ${ratings[p]==='F'?'checked':''} style="accent-color:#7f1d1d"> Fail ✗
          </label>
        </div>
      </div>`).join('')}
    </div>
    <div class="fg"><label class="lbl">Remarks / Observations</label>
      <textarea class="fc" id="del-remarks" rows="2" placeholder="e.g. Minor dimensional variation noted, accepted conditionally">${esc(d?.remarks||'')}</textarea></div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('pur-del-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="purSaveDelivery(${supId},${editId||'null'})">💾 Save Delivery</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

function purCalcDelValue(){
  const qty=parseFloat(document.getElementById('del-qty')?.value)||0;
  const rate=parseFloat(document.getElementById('del-rate')?.value)||0;
  const el=document.getElementById('del-value');
  if(el) el.value=qty&&rate?(qty*rate).toFixed(2):'';
}

async function purSaveDelivery(supId,editId){
  const mat=document.getElementById('del-mat').value.trim();
  if(!mat){toast('Material required','d');return;}
  const ratings={};
  PUR_PARAMS.forEach(p=>{
    const r=document.querySelector(`input[name="rat-${p}"]:checked`);
    if(r) ratings[p]=r.value;
  });
  const qty=parseFloat(document.getElementById('del-qty').value)||0;
  const rate=parseFloat(document.getElementById('del-rate').value)||0;
  const rec={
    supId, poNumber:document.getElementById('del-po').value.trim(),
    date:document.getElementById('del-date').value,
    material:mat, qty, unit:document.getElementById('del-unit').value,
    rate, value:qty&&rate?qty*rate:null,
    ratings, remarks:document.getElementById('del-remarks').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(editId) await db.purDeliveries.update(editId,rec);
  else { rec.createdAt=new Date().toISOString(); await db.purDeliveries.add(rec); }
  document.getElementById('pur-del-ov').remove();
  await purUpdateLiveStatus(supId);
  toast('✅ Delivery saved');
  purViewSupplier(supId);
}

async function purDeleteDelivery(id,supId){
  if(!confirm('Delete this delivery record? This will affect the supplier scorecard.')) return;
  await db.purDeliveries.delete(id);
  await purUpdateLiveStatus(supId);
  toast('Deleted','d'); purViewSupplier(supId);
}

// ══════════════════════════════════════════════════════
//  APPROVED SUPPLIER LIST
// ══════════════════════════════════════════════════════
async function purRenderApproved(){
  const sups=await db.purSuppliers.where('approvalStatus').equals('Approved').toArray().catch(()=>[]);
  sups.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  setC(`
  <div class="ph">
    <h2>✅ Approved Supplier List</h2>
    <button class="btn btn-o" onclick="purPrintApprovedList()">🖨️ Print ASL</button>
  </div>
  <div class="card">
    <div class="ch"><h5>Approved Suppliers — ${sups.length}</h5>
      <span class="muted" style="font-size:11px">VRA-PUR-002</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>#</th><th>Sup No.</th><th>Supplier Name</th><th>Scope of Supply</th>
        <th>Pass Rate</th><th>Grade</th><th>Approved Since</th><th></th>
      </tr></thead>
      <tbody>
        ${await Promise.all(sups.map(async(s,i)=>{
          const deliveries=await db.purDeliveries.where('supId').equals(s.id).toArray().catch(()=>[]);
          const sc=purCalcScore(deliveries);
          return`<tr>
            <td style="text-align:center">${i+1}</td>
            <td class="mono" style="color:var(--navy);font-weight:700">${esc(s.supNumber)}</td>
            <td><strong>${esc(s.name)}</strong></td>
            <td>${esc(s.scope||'—')}</td>
            <td style="text-align:center">${sc.passRate?`<strong>${sc.passRate}%</strong>`:'—'}</td>
            <td style="text-align:center">${sc.grade!=='—'?purGradeBadge(sc.grade,sc.passRate):'—'}</td>
            <td>${s.updatedAt?new Date(s.updatedAt).toLocaleDateString('en-IN'):'—'}</td>
            <td><button class="btn btn-o btn-xs" onclick="purViewSupplier(${s.id})">👁️ View</button></td>
          </tr>`;
        })).then(r=>r.join(''))}
      </tbody>
    </table></div>
  </div>`);
}

async function purPrintApprovedList(){
  const sups=await db.purSuppliers.where('approvalStatus').equals('Approved').toArray().catch(()=>[]);
  sups.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=await Promise.all(sups.map(async(s,i)=>{
    const deliveries=await db.purDeliveries.where('supId').equals(s.id).toArray().catch(()=>[]);
    const sc=purCalcScore(deliveries);
    return`<tr>
      <td>${i+1}</td>
      <td style="font-family:monospace;font-weight:bold">${s.supNumber}</td>
      <td class="tl"><strong>${s.name}</strong></td>
      <td class="tl">${s.scope||'—'}</td>
      <td>${deliveries.length}</td>
      <td style="font-weight:bold">${sc.passRate}%</td>
      <td style="font-weight:bold">${sc.grade}</td>
      <td>${new Date(s.updatedAt).toLocaleDateString('en-IN')}</td>
    </tr>`;
  }));
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Approved Supplier List</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">APPROVED SUPPLIER LIST</div><div class="rpt-sub">Active as of ${today}</div></div>
    <div><div class="rpt-num">VRA-PUR-002</div><div style="font-size:7pt;text-align:right">Date: ${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr><th>#</th><th>Sup No.</th><th class="tl">Supplier Name</th><th class="tl">Scope</th><th>Deliveries</th><th>Pass Rate</th><th>Grade</th><th>Since</th></tr></thead>
    <tbody>${rows.join('')||'<tr><td colspan="8" style="text-align:center">No approved suppliers</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${sups.length} · VRA-PUR-002 · V R Alucast</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;font-size:8pt">
    <div style="border:1px solid #000;padding:7px"><strong>Prepared By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp;&nbsp; Date: ______________</div>
    <div style="border:1px solid #000;padding:7px"><strong>Approved By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp;&nbsp; Date: ______________</div>
  </div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  SCORECARD OVERVIEW (all suppliers)
// ══════════════════════════════════════════════════════
async function purRenderScorecard(){
  const sups=await db.purSuppliers.toArray().catch(()=>[]);
  sups.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  const rows=await Promise.all(sups.map(async s=>{
    const deliveries=await db.purDeliveries.where('supId').equals(s.id).toArray().catch(()=>[]);
    const sc=purCalcScore(deliveries);
    return{s,sc,dCount:deliveries.length};
  }));
  rows.sort((a,b)=>b.sc.passRate-a.sc.passRate);
  setC(`
  <div class="ph">
    <h2>📊 Supplier Scorecard</h2>
    <button class="btn btn-o" onclick="purPrintAllScorecard()">🖨️ Print All</button>
  </div>
  <div class="card">
    <div class="ch"><h5>Live Scorecard — All Suppliers</h5>
      <span class="muted" style="font-size:11px">VRA-PUR-003 · Based on all delivery entries</span>
    </div>
    <div class="tw" style="overflow-x:auto"><table style="min-width:800px">
      <thead><tr style="background:var(--navy);color:#fff">
        <th class="tl">Sup No.</th><th class="tl">Supplier</th><th>Deliveries</th>
        ${PUR_PARAMS.map(p=>`<th style="font-size:10px">${PUR_PARAM_LABELS[p]}</th>`).join('')}
        <th>Overall</th><th>Grade</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows.map(({s,sc,dCount})=>`<tr>
        <td class="mono tl" style="font-weight:700;color:var(--navy)">${esc(s.supNumber)}</td>
        <td class="tl"><strong>${esc(s.name)}</strong></td>
        <td style="text-align:center"><span class="badge bd">${dCount}</span></td>
        ${PUR_PARAMS.map(p=>{
          const pp=sc.perParam[p]||{pass:0,total:0};
          const pct=pp.total?Math.round((pp.pass/pp.total)*100):null;
          return`<td>${pct!==null?`<span class="badge ${pct>=80?'ba':pct>=60?'bp':'br'}" style="font-size:10px">${pct}%</span>`:'<span class="muted">—</span>'}</td>`;
        }).join('')}
        <td>${sc.totalChecks?`<strong>${sc.passRate}%</strong>`:'<span class="muted">—</span>'}</td>
        <td>${sc.grade!=='—'?purGradeBadge(sc.grade,sc.passRate):'<span class="muted">—</span>'}</td>
        <td>${purStatusBadge(s.approvalStatus||'Under Evaluation')}</td>
        <td><button class="btn btn-p btn-xs" onclick="purViewSupplier(${s.id})">+ Delivery</button></td>
      </tr>`).join('')||'<tr><td colspan="12" style="text-align:center;padding:24px;color:#9ca3af">No suppliers yet.</td></tr>'}
      </tbody>
    </table></div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  PO REGISTER (all suppliers)
// ══════════════════════════════════════════════════════
async function purRenderPO(){
  const deliveries=await db.purDeliveries.toArray().catch(()=>[]);
  const sups=await db.purSuppliers.toArray().catch(()=>[]);
  deliveries.sort((a,b)=>(b.date||'')>(a.date||'')?1:-1);
  const totalValue=deliveries.filter(d=>d.value).reduce((s,d)=>s+d.value,0);
  setC(`
  <div class="ph">
    <h2>📦 PO Register</h2>
    <button class="btn btn-o" onclick="purPrintPORegister()">🖨️ Print</button>
  </div>
  <div class="card" style="margin-bottom:12px;padding:14px 18px">
    <div style="display:flex;gap:30px;align-items:center">
      <div><div style="font-size:22px;font-weight:800;color:var(--navy)">${deliveries.length}</div><div class="muted" style="font-size:12px">Total Deliveries</div></div>
      <div><div style="font-size:22px;font-weight:800;color:var(--navy)">₹${totalValue.toLocaleString('en-IN',{maximumFractionDigits:0})}</div><div class="muted" style="font-size:12px">Total Value</div></div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>All Purchase Orders / Deliveries</h5></div>
    <div class="tw"><table>
      <thead><tr>
        <th>PO No.</th><th>Date</th><th>Supplier</th><th>Material</th>
        <th>Qty</th><th>Unit</th><th>Value (₹)</th><th>Overall</th><th></th>
      </tr></thead>
      <tbody>${deliveries.length===0
        ?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">No POs yet.</td></tr>`
        :deliveries.map(d=>{
          const sup=sups.find(s=>s.id===d.supId);
          const allRated=PUR_PARAMS.every(p=>d.ratings?.[p]);
          const allPass=allRated&&PUR_PARAMS.every(p=>d.ratings[p]==='P');
          const anyFail=PUR_PARAMS.some(p=>d.ratings?.[p]==='F');
          return`<tr>
            <td class="mono" style="color:var(--navy);font-weight:700">${esc(d.poNumber||'—')}</td>
            <td>${d.date||'—'}</td>
            <td><strong>${esc(sup?.name||'—')}</strong></td>
            <td>${esc(d.material||'—')}</td>
            <td style="text-align:right">${d.qty||'—'}</td>
            <td>${esc(d.unit||'—')}</td>
            <td style="text-align:right;font-weight:600">${d.value?'₹'+Number(d.value).toLocaleString('en-IN'):'—'}</td>
            <td style="text-align:center">${!allRated?'<span class="muted">Pending</span>':allPass?'<span class="badge ba">All Pass</span>':'<span class="badge br">Has Fail</span>'}</td>
            <td><button class="btn btn-o btn-xs" onclick="purViewSupplier(${d.supId})">👁️</button></td>
          </tr>`;}).join('')}
      </tbody>
    </table></div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  PRINT FUNCTIONS
// ══════════════════════════════════════════════════════
async function purPrintEvalForm(supId){
  const s=await db.purSuppliers.get(supId);
  const deliveries=await db.purDeliveries.where('supId').equals(supId).toArray().catch(()=>[]);
  deliveries.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const sc=purCalcScore(deliveries);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=deliveries.map((d,i)=>`<tr>
    <td>${i+1}${i<2?' *':''}</td>
    <td style="font-family:monospace;font-weight:bold">${d.poNumber||'—'}</td>
    <td>${d.date||'—'}</td>
    <td class="tl">${d.material||'—'} (${d.qty||''} ${d.unit||''})</td>
    ${PUR_PARAMS.map(p=>`<td style="font-weight:bold;color:${d.ratings?.[p]==='P'?'#14532d':d.ratings?.[p]==='F'?'#7f1d1d':'#555'}">${d.ratings?.[p]==='P'?'P':d.ratings?.[p]==='F'?'F':'—'}</td>`).join('')}
    <td class="tl" style="font-size:7pt">${d.remarks||''}</td>
  </tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Supplier Evaluation — ${s.supNumber}</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">SUPPLIER EVALUATION FORM</div><div class="rpt-sub">${esc(s.name)} · ${esc(s.supNumber)}</div></div>
    <div><div class="rpt-num">VRA-PUR-001</div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <div class="meta-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">
    <div class="mc"><div class="ml">Supplier</div><div class="mv">${s.name}</div></div>
    <div class="mc"><div class="ml">Scope</div><div class="mv">${s.scope||'—'}</div></div>
    <div class="mc"><div class="ml">Status</div><div class="mv">${s.approvalStatus||'Under Evaluation'}</div></div>
  </div>
  <div class="sec-bar">Delivery Evaluation Log (* = Initial approval deliveries)</div>
  <table class="dt">
    <thead><tr>
      <th>#</th><th>PO No.</th><th>Date</th><th class="tl">Material / Qty</th>
      ${PUR_PARAMS.map(p=>`<th style="font-size:7pt">${PUR_PARAM_LABELS[p]}</th>`).join('')}
      <th class="tl">Remarks</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="11" style="text-align:center">No deliveries yet</td></tr>'}</tbody>
  </table>
  <div class="sec-bar">Scorecard Summary</div>
  <table class="dt" style="width:60%">
    <thead><tr><th class="tl">Parameter</th><th>Total</th><th>Pass</th><th>Fail</th><th>Pass %</th></tr></thead>
    <tbody>${PUR_PARAMS.map(p=>{
      const pp=sc.perParam[p]||{pass:0,total:0};
      const pct=pp.total?Math.round((pp.pass/pp.total)*100):0;
      return`<tr><td class="tl">${PUR_PARAM_LABELS[p]}</td><td>${pp.total}</td><td style="color:#14532d;font-weight:bold">${pp.pass}</td><td style="color:#7f1d1d;font-weight:bold">${pp.total-pp.pass}</td><td style="font-weight:bold">${pp.total?pct+'%':'—'}</td></tr>`;
    }).join('')}
    <tr style="background:#ececec"><td class="tl" style="font-weight:bold">OVERALL</td><td>${sc.totalChecks}</td><td style="font-weight:bold;color:#14532d">${sc.totalPass}</td><td style="font-weight:bold;color:#7f1d1d">${sc.totalChecks-sc.totalPass}</td><td style="font-weight:800;font-size:10pt">${sc.passRate}% — Grade ${sc.grade}</td></tr>
    </tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Grade: A ≥80% = Approved · B 60–79% = Conditional · C &lt;60% = Under Review</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;font-size:8pt">
    <div style="border:1px solid #000;padding:7px"><strong>Evaluated By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp; Date: ______________</div>
    <div style="border:1px solid #000;padding:7px"><strong>Approved By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp; Date: ______________</div>
  </div>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">VRA-PUR-001 · V R Alucast — Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

async function purPrintScorecard(supId){
  const s=await db.purSuppliers.get(supId);
  const deliveries=await db.purDeliveries.where('supId').equals(supId).toArray().catch(()=>[]);
  const sc=purCalcScore(deliveries);
  const today=new Date().toLocaleDateString('en-IN');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Scorecard — ${s.supNumber}</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">SUPPLIER PERFORMANCE SCORECARD</div><div class="rpt-sub">${esc(s.name)} · ${esc(s.supNumber)}</div></div>
    <div><div class="rpt-num">VRA-PUR-003</div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <div class="meta-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:8px">
    <div class="mc"><div class="ml">Supplier</div><div class="mv">${s.name}</div></div>
    <div class="mc"><div class="ml">Scope</div><div class="mv">${s.scope||'—'}</div></div>
    <div class="mc"><div class="ml">Total Deliveries</div><div class="mv">${deliveries.length}</div></div>
    <div class="mc"><div class="ml">Status</div><div class="mv" style="font-weight:bold">${s.approvalStatus||'—'}</div></div>
  </div>
  <table class="dt">
    <thead><tr><th class="tl">Parameter</th><th>Total Entries</th><th>Pass</th><th>Fail</th><th>Pass Rate</th><th>Grade</th></tr></thead>
    <tbody>${PUR_PARAMS.map(p=>{
      const pp=sc.perParam[p]||{pass:0,total:0};
      const pct=pp.total?Math.round((pp.pass/pp.total)*100):null;
      const g=pct===null?'—':pct>=80?'A':pct>=60?'B':'C';
      return`<tr><td class="tl">${PUR_PARAM_LABELS[p]}</td><td>${pp.total}</td>
        <td style="color:#14532d;font-weight:bold">${pp.pass}</td>
        <td style="color:#7f1d1d;font-weight:bold">${pp.total-pp.pass}</td>
        <td style="font-weight:bold">${pct!==null?pct+'%':'—'}</td>
        <td style="font-weight:bold">${g}</td></tr>`;
    }).join('')}
    <tr style="background:#ececec">
      <td class="tl" style="font-weight:bold">OVERALL</td>
      <td>${sc.totalChecks}</td>
      <td style="font-weight:bold;color:#14532d">${sc.totalPass}</td>
      <td style="font-weight:bold;color:#7f1d1d">${sc.totalChecks-sc.totalPass}</td>
      <td style="font-weight:800;font-size:11pt;color:${sc.grade==='A'?'#14532d':sc.grade==='B'?'#92400e':'#7f1d1d'}">${sc.passRate}%</td>
      <td style="font-weight:800;font-size:11pt;color:${sc.grade==='A'?'#14532d':sc.grade==='B'?'#92400e':'#7f1d1d'}">${sc.grade}</td>
    </tr></tbody>
  </table>
  <div style="margin:8px 0;font-size:7.5pt;color:#555">Grade: A = ≥80% Pass (Approved) · B = 60–79% (Conditional) · C = &lt;60% (Under Review)</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;font-size:8pt">
    <div style="border:1px solid #000;padding:7px"><strong>Evaluated By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp; Date: ______________</div>
    <div style="border:1px solid #000;padding:7px"><strong>Supplier Acknowledgement:</strong><br><br>Signature: _________________________&nbsp; Date: ______________</div>
  </div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

async function purPrintAllScorecard(){
  const sups=await db.purSuppliers.toArray().catch(()=>[]);
  sups.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=await Promise.all(sups.map(async(s,i)=>{
    const deliveries=await db.purDeliveries.where('supId').equals(s.id).toArray().catch(()=>[]);
    const sc=purCalcScore(deliveries);
    return`<tr>
      <td>${i+1}</td>
      <td style="font-family:monospace;font-weight:bold">${s.supNumber}</td>
      <td class="tl"><strong>${s.name}</strong></td>
      <td class="tl" style="font-size:7pt">${s.scope||'—'}</td>
      <td>${deliveries.length}</td>
      ${PUR_PARAMS.map(p=>{const pp=sc.perParam[p]||{pass:0,total:0};const pct=pp.total?Math.round((pp.pass/pp.total)*100):null;return`<td style="font-weight:bold">${pct!==null?pct+'%':'—'}</td>`;}).join('')}
      <td style="font-weight:800;color:${sc.grade==='A'?'#14532d':sc.grade==='B'?'#92400e':'#7f1d1d'}">${sc.passRate?sc.passRate+'%':'—'}</td>
      <td style="font-weight:800;color:${sc.grade==='A'?'#14532d':sc.grade==='B'?'#92400e':'#7f1d1d'}">${sc.grade}</td>
      <td style="font-weight:bold">${s.approvalStatus||'—'}</td>
    </tr>`;
  }));
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Supplier Scorecard</title>
  <style>${purPrintCSS()}@page{size:A4 landscape;margin:12mm 13mm 14mm 13mm}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">SUPPLIER PERFORMANCE SCORECARD — ALL SUPPLIERS</div><div class="rpt-sub">Live scorecard based on all delivery entries</div></div>
    <div><div class="rpt-num">VRA-PUR-003</div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>#</th><th>Sup No.</th><th class="tl">Supplier</th><th class="tl">Scope</th><th>Del.</th>
      ${PUR_PARAMS.map(p=>`<th style="font-size:7pt">${PUR_PARAM_LABELS[p]}</th>`).join('')}
      <th>Overall</th><th>Grade</th><th>Status</th>
    </tr></thead>
    <tbody>${rows.join('')||'<tr><td colspan="13" style="text-align:center">No suppliers</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">VRA-PUR-003 · Grade: A ≥80% Approved · B 60–79% Conditional · C &lt;60% Under Review · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

async function purPrintPORegister(){
  const deliveries=await db.purDeliveries.toArray().catch(()=>[]);
  const sups=await db.purSuppliers.toArray().catch(()=>[]);
  deliveries.sort((a,b)=>(b.date||'')>(a.date||'')?1:-1);
  const today=new Date().toLocaleDateString('en-IN');
  const totalVal=deliveries.filter(d=>d.value).reduce((s,d)=>s+d.value,0);
  const rows=deliveries.map((d,i)=>{
    const sup=sups.find(s=>s.id===d.supId);
    return`<tr>
      <td>${i+1}</td><td style="font-family:monospace;font-weight:bold">${d.poNumber||'—'}</td>
      <td>${d.date||'—'}</td><td class="tl"><strong>${sup?.name||'—'}</strong></td>
      <td class="tl">${d.material||'—'}</td>
      <td style="text-align:right">${d.qty||'—'}</td><td>${d.unit||'—'}</td>
      <td style="text-align:right;font-weight:600">${d.value?'₹'+Number(d.value).toLocaleString('en-IN'):'—'}</td>
    </tr>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>PO Register</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">PURCHASE ORDER REGISTER</div><div class="rpt-sub">All Suppliers</div></div>
    <div><div class="rpt-num">VRA-PO</div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr><th>#</th><th>PO No.</th><th>Date</th><th class="tl">Supplier</th><th class="tl">Material</th><th>Qty</th><th>Unit</th><th>Value (₹)</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="8" style="text-align:center">No records</td></tr>'}</tbody>
    <tfoot><tr style="background:#ececec;font-weight:bold">
      <td colspan="7" style="text-align:right;padding:4px 6px;border:1px solid #000">Total Value:</td>
      <td style="text-align:right;padding:4px 6px;border:1px solid #000;font-size:9pt">₹${totalVal.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
    </tr></tfoot>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${deliveries.length} · VRA-PO · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

async function purPrintSupList(){
  const sups=await db.purSuppliers.toArray().catch(()=>[]);
  sups.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=await Promise.all(sups.map(async(s,i)=>{
    const sc=purCalcScore(await db.purDeliveries.where('supId').equals(s.id).toArray().catch(()=>[]));
    return`<tr><td>${i+1}</td><td style="font-family:monospace;font-weight:bold">${s.supNumber}</td>
    <td class="tl"><strong>${s.name}</strong></td><td class="tl">${s.scope||'—'}</td>
    <td style="font-weight:bold">${sc.passRate?sc.passRate+'%':'—'}</td>
    <td style="font-weight:bold">${sc.grade!=='—'?sc.grade:'—'}</td>
    <td style="font-weight:bold;color:${s.approvalStatus==='Approved'?'#14532d':s.approvalStatus==='Under Review'?'#7f1d1d':'#92400e'}">${s.approvalStatus||'Under Evaluation'}</td>
    </tr>`;
  }));
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Supplier List</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div></div>
    <div><div class="rpt-title">SUPPLIER REGISTER</div></div>
    <div><div class="rpt-num">VRA-PUR-001</div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr><th>#</th><th>Sup No.</th><th class="tl">Name</th><th class="tl">Scope</th><th>Pass Rate</th><th>Grade</th><th>Status</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}


// ══════════════════════════════════════════════════════
//  INIT

// ══════════════════════════════════════════════════════
(async()=>{
  await DB.seed();
  await loadAllTypes();
  await qmsInit();
  await hrSeedDefaults();
  await mktSeedDefaults();
  if(Auth.user) showApp(); else showLogin();
})();
</script>
</body>
</html>
// VRA DMS — PURCHASING MODULE (Vendor Approval + Rating)

// ══════════════════════════════════════════════════════
//  NUMBERING
// ══════════════════════════════════════════════════════
async function nextSupNumber(){
  const n=(await db.purVendors.count().catch(()=>0))+1;
  return `VRA-SUP-${String(n).padStart(3,'0')}`;
}

// ══════════════════════════════════════════════════════
//  RATING ENGINE
//  Quality Rating   = Qty Accepted / Qty Received * 100
//  Delivery Rating  = (On-time + within-5-days lots) / Total Lots * 100
//  Supplier Rating  = (Quality Rating + Delivery Rating) / 2
// ══════════════════════════════════════════════════════
const PUR_TIMING_LABELS={OnTime:'On Time',Within5:'Within 5 Days',After5:'After 5 Days'};

function purSampleRow(vendor,key,label){
  const s=vendor[key];
  if(!s||(!s.dcNo&&!s.qtyReceived)) return null;
  const received=Number(s.qtyReceived)||0;
  const rejected=Number(s.qtyRejected)||0;
  const accepted=(s.qtyAccepted!==''&&s.qtyAccepted!=null)?Number(s.qtyAccepted):Math.max(received-rejected,0);
  return{source:label,date:s.date||'',refNo:s.dcNo||'',qtyReceived:received,qtyRejected:rejected,qtyAccepted:accepted,timing:s.timing||'OnTime'};
}

// Combined rating rows for a vendor = the 2 registration samples (if filled) + every invoice/lot entered afterward
function purVendorRows(vendor,lots){
  const rows=[];
  const s1=purSampleRow(vendor,'sample1','Sample 1'); if(s1) rows.push(s1);
  const s2=purSampleRow(vendor,'sample2','Sample 2'); if(s2) rows.push(s2);
  lots.forEach(l=>{
    const received=Number(l.qtyReceived)||0;
    const rejected=Number(l.qtyRejected)||0;
    const accepted=(l.qtyAccepted!==''&&l.qtyAccepted!=null)?Number(l.qtyAccepted):Math.max(received-rejected,0);
    rows.push({id:l.id,source:'Invoice',date:l.date||'',refNo:l.refNo||'',qtyReceived:received,qtyRejected:rejected,qtyAccepted:accepted,timing:l.timing||'OnTime'});
  });
  rows.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  return rows;
}

function purCalcRating(rows){
  const totalReceived=rows.reduce((s,r)=>s+r.qtyReceived,0);
  const totalRejected=rows.reduce((s,r)=>s+r.qtyRejected,0);
  const totalAccepted=rows.reduce((s,r)=>s+r.qtyAccepted,0);
  const totalLots=rows.length;
  const onTimeCount=rows.filter(r=>r.timing==='OnTime'||r.timing==='Within5').length;
  const after5Count=rows.filter(r=>r.timing==='After5').length;
  const qualityRating=totalReceived>0?Math.round((totalAccepted/totalReceived)*100):null;
  const deliveryRating=totalLots>0?Math.round((onTimeCount/totalLots)*100):null;
  const supplierRating=(qualityRating!=null&&deliveryRating!=null)?Math.round((qualityRating+deliveryRating)/2):null;
  return{totalReceived,totalRejected,totalAccepted,totalLots,onTimeCount,after5Count,qualityRating,deliveryRating,supplierRating};
}

// ══════════════════════════════════════════════════════
//  APPROVAL STATE — always computed live from the vendor's own
//  data, never a stored flag, so it can't go stale.
// ══════════════════════════════════════════════════════
function purIsApproved(v){
  return v.sample1?.decision==='ACCEPT' && v.sample2?.decision==='ACCEPT' && v.includeInApprovedList==='Y';
}
function purStage(v){
  const s1=v.sample1?.decision,s2=v.sample2?.decision;
  if(purIsApproved(v)) return'Approved';
  if(s1==='REJECT'||s2==='REJECT') return'Rejected';
  if(s1==='ACCEPT'&&s2==='ACCEPT') return'Samples Accepted — Pending Sign-off';
  if(v.sample1?.dcNo||v.sample2?.dcNo) return'Sample Evaluation';
  return'Registered';
}
function purStageBadge(stage){
  const m={Registered:'bd','Sample Evaluation':'bp','Samples Accepted — Pending Sign-off':'bp',Approved:'ba',Rejected:'br'};
  return`<span class="badge ${m[stage]||'bd'}">${stage}</span>`;
}
function purPctBadge(pct){
  if(pct==null) return'<span class="muted">—</span>';
  const cls=pct>=90?'ba':pct>=75?'bp':'br';
  return`<span class="badge ${cls}">${pct}%</span>`;
}

// ══════════════════════════════════════════════════════
//  PERIOD FILTER (for scorecard reporting)
// ══════════════════════════════════════════════════════
function purPeriodRange(period,fromStr,toStr){
  if(period==='custom') return fromStr&&toStr?{start:new Date(fromStr),end:new Date(toStr)}:null;
  if(period==='all') return null;
  const now=new Date();
  let start;
  if(period==='month') start=new Date(now.getFullYear(),now.getMonth(),1);
  else if(period==='quarter') start=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1);
  else if(period==='half') start=new Date(now.getFullYear(),now.getMonth()<6?0:6,1);
  else if(period==='year') start=new Date(now.getFullYear(),0,1);
  else return null;
  return{start,end:now};
}
function purInRange(dateStr,range){
  if(!range) return true;
  if(!dateStr) return false;
  const d=new Date(dateStr);
  return d>=range.start && d<=new Date(range.end.getFullYear(),range.end.getMonth(),range.end.getDate(),23,59,59);
}
function purPeriodLabel(period,fromStr,toStr){
  const m={all:'All Time',month:'This Month',quarter:'This Quarter',half:'This Half-Year',year:'This Year'};
  if(period==='custom') return fromStr&&toStr?`${fromStr} to ${toStr}`:'Custom Range';
  return m[period]||'All Time';
}
function purPeriodSelectorHtml(period,fromStr,toStr,onChangeFn){
  return`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <select class="fc" id="pur-period" style="width:auto" onchange="purPeriodSelectChanged('${onChangeFn}')">
      ${[['all','All Time'],['month','This Month'],['quarter','This Quarter'],['half','This Half-Year'],['year','This Year'],['custom','Custom Range']]
        .map(([v,l])=>`<option value="${v}" ${period===v?'selected':''}>${l}</option>`).join('')}
    </select>
    <input class="fc" type="date" id="pur-period-from" value="${fromStr||''}" style="width:auto;${period==='custom'?'':'display:none'}" onchange="${onChangeFn}()">
    <input class="fc" type="date" id="pur-period-to" value="${toStr||''}" style="width:auto;${period==='custom'?'':'display:none'}" onchange="${onChangeFn}()">
  </div>`;
}
// Switching the dropdown to "Custom Range" must reveal the date pickers
// immediately — the actual re-render only happens once both dates are
// filled (each date input's own onchange triggers that).
function purPeriodSelectChanged(onChangeFn){
  const period=document.getElementById('pur-period').value;
  const show=period==='custom';
  document.getElementById('pur-period-from').style.display=show?'':'none';
  document.getElementById('pur-period-to').style.display=show?'':'none';
  if(!show) window[onChangeFn]();
}

// ══════════════════════════════════════════════════════
//  PRINT CSS
// ══════════════════════════════════════════════════════
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
.frm-row{display:grid;grid-template-columns:180px 1fr;border:1px solid #000;border-top:none}
.frm-row .fl{background:#f2f2f2;font-weight:bold;padding:4px 8px;border-right:1px solid #000}
.frm-row .fv{padding:4px 8px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
}

// ══════════════════════════════════════════════════════
//  SUPPLIER REGISTER — LIST
// ══════════════════════════════════════════════════════
async function purRenderSuppliers(){
  const vendors=await db.purVendors.toArray().catch(()=>[]);
  vendors.sort((a,b)=>b.id-a.id);
  const counts={Registered:0,'Sample Evaluation':0,'Samples Accepted — Pending Sign-off':0,Approved:0,Rejected:0};
  vendors.forEach(v=>{const st=purStage(v); if(counts[st]!==undefined) counts[st]++;});

  setC(`
  <div class="ph">
    <h2>🏭 Supplier Register</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="purRenderSupplierForm()">+ Add Supplier</button>
      <button class="btn btn-o" onclick="purPrintSupplierRegister()">🖨️ Print Register</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
    ${[['Registered',counts.Registered,'bd'],['Sample Evaluation',counts['Sample Evaluation'],'bp'],['Pending Sign-off',counts['Samples Accepted — Pending Sign-off'],'bp'],['Approved',counts.Approved,'ba'],['Rejected',counts.Rejected,'br']].map(([l,n])=>`
    <div class="card" style="padding:12px 16px">
      <div style="font-size:22px;font-weight:800;color:var(--navy)">${n}</div>
      <div class="muted" style="font-size:12px">${l}</div>
    </div>`).join('')}
  </div>
  <div class="card">
    <div class="ch"><h5>All Suppliers — ${vendors.length} records</h5>
      <span class="muted" style="font-size:11px">VRA-PUR-F-01 · Supplier Approval Form</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Sup No.</th><th>Supplier Name</th><th>Scope of Supply</th>
        <th>Contact Person</th><th>Stage</th><th></th>
      </tr></thead>
      <tbody>${vendors.length===0
        ?`<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">No suppliers yet. Click + Add Supplier to register one.</td></tr>`
        :vendors.map(v=>`<tr>
          <td class="mono" style="color:var(--navy);font-weight:700">${esc(v.supNumber)}</td>
          <td><strong>${esc(v.name)}</strong></td>
          <td>${esc(v.scopeOfSupply||'—')}</td>
          <td>${esc(v.contactPerson||'—')}${v.contactPhone?' · '+esc(v.contactPhone):''}</td>
          <td>${purStageBadge(purStage(v))}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="purRenderSupplierForm(${v.id})">✏️ Open</button>
            ${purIsApproved(v)?`<button class="btn btn-o btn-xs" onclick="purViewVendor(${v.id})">📊 Scorecard</button>`:''}
            <button class="btn btn-r btn-xs" onclick="purDeleteVendor(${v.id})">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

async function purDeleteVendor(id){
  const v=await db.purVendors.get(id);
  if(!confirm(`Delete supplier ${v?.name}? All invoice/delivery records will also be deleted.`)) return;
  const lots=await db.purVendorLots.where('vendorId').equals(id).toArray().catch(()=>[]);
  for(const l of lots) await db.purVendorLots.delete(l.id);
  await db.purVendors.delete(id);
  toast('Deleted','d');
  purRenderSuppliers();
}

// ══════════════════════════════════════════════════════
//  SUPPLIER FORM — registration + assessment + samples + sign-off
//  (Replicates the paper Supplier Approval Form, VRA-PUR-F-01)
// ══════════════════════════════════════════════════════
function purYN(id,val){
  return`<select class="fc" id="${id}">
    <option value="">—</option>
    <option value="Y" ${val==='Y'?'selected':''}>Y</option>
    <option value="N" ${val==='N'?'selected':''}>N</option>
  </select>`;
}
function purDecisionSelect(id,val){
  return`<select class="fc" id="${id}">
    <option value="">— Pending —</option>
    <option value="ACCEPT" ${val==='ACCEPT'?'selected':''}>ACCEPT</option>
    <option value="REJECT" ${val==='REJECT'?'selected':''}>REJECT</option>
  </select>`;
}
function purTimingSelect(id,val){
  return`<select class="fc" id="${id}">
    ${Object.entries(PUR_TIMING_LABELS).map(([k,l])=>`<option value="${k}" ${(val||'OnTime')===k?'selected':''}>${l}</option>`).join('')}
  </select>`;
}
function purSampleSection(n,s){
  s=s||{};
  return`
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;align-items:end;padding:10px;border:1px solid var(--border);border-radius:7px;margin-bottom:10px">
    <div class="fg" style="grid-column:span 6"><label class="lbl" style="font-weight:700;color:var(--navy)">Sample ${n} Received</label></div>
    <div class="fg"><label class="lbl">Invoice No.</label><input class="fc" id="s${n}-dc" value="${esc(s.dcNo||'')}"></div>
    <div class="fg"><label class="lbl">Date</label><input class="fc" type="date" id="s${n}-date" value="${s.date||''}"></div>
    <div class="fg"><label class="lbl">Qty Received</label><input class="fc" type="number" id="s${n}-recv" value="${s.qtyReceived??''}" oninput="purAutoAccept(${n})"></div>
    <div class="fg"><label class="lbl">Qty Rejected</label><input class="fc" type="number" id="s${n}-rej" value="${s.qtyRejected??''}" oninput="purAutoAccept(${n})"></div>
    <div class="fg"><label class="lbl">Qty Accepted</label><input class="fc" type="number" id="s${n}-acc" value="${s.qtyAccepted??''}"></div>
    <div class="fg"><label class="lbl">Lot Timing</label>${purTimingSelect(`s${n}-timing`,s.timing)}</div>
    <div class="fg" style="grid-column:span 6"><label class="lbl">Decision</label>${purDecisionSelect(`s${n}-decision`,s.decision)}</div>
  </div>`;
}
function purAutoAccept(n){
  const recv=parseFloat(document.getElementById(`s${n}-recv`)?.value)||0;
  const rej=parseFloat(document.getElementById(`s${n}-rej`)?.value)||0;
  const el=document.getElementById(`s${n}-acc`);
  if(el) el.value=Math.max(recv-rej,0);
}

async function purRenderSupplierForm(id=null){
  const v=id?await db.purVendors.get(id).catch(()=>null):null;
  const num=v?v.supNumber:await nextSupNumber();
  const stage=v?purStage(v):'Registered';

  setC(`
  <div class="ph">
    <h2>🏭 ${v?'Edit Supplier':'New Supplier'} <span class="mono" style="font-size:13px;color:var(--navy)">${esc(num)}</span></h2>
    <div style="display:flex;gap:8px">
      ${v?`<button class="btn btn-o" onclick="purPrintSupplierForm(${id})">🖨️ Print Form</button>`:''}
      ${v&&purIsApproved(v)?`<button class="btn btn-o" onclick="purViewVendor(${id})">📊 View Scorecard</button>`:''}
      <button class="btn btn-o" onclick="nav('pur-suppliers')">← Back to Register</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Registration Details</h5>${purStageBadge(stage)}</div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label class="lbl">Supplier Number</label>
          <input class="fc mono" id="ps-num" value="${esc(num)}" readonly style="background:#f5f7fd;color:var(--navy);font-weight:700"></div>
        <div class="fg"><label class="lbl">Date</label>
          <input class="fc" type="date" id="ps-date" value="${v?.date||new Date().toISOString().split('T')[0]}"></div>
        <div class="fg" style="grid-column:span 2"><label class="lbl">Name &amp; Address *</label>
          <input class="fc" id="ps-name" value="${esc(v?.name||'')}" placeholder="M/s Supplier Name"></div>
        <div class="fg" style="grid-column:span 2"><label class="lbl">Address</label>
          <input class="fc" id="ps-address" value="${esc(v?.address||'')}" placeholder="Full address"></div>
        <div class="fg"><label class="lbl">Contact Person</label>
          <input class="fc" id="ps-contact" value="${esc(v?.contactPerson||'')}"></div>
        <div class="fg"><label class="lbl">Phone</label>
          <input class="fc" id="ps-phone" value="${esc(v?.contactPhone||'')}"></div>
        <div class="fg" style="grid-column:span 2"><label class="lbl">Scope of Supply *</label>
          <input class="fc" id="ps-scope" value="${esc(v?.scopeOfSupply||'')}" placeholder="e.g. Flux Powder"></div>
        <div class="fg"><label class="lbl">Year of Establishment</label>
          <input class="fc" id="ps-year" value="${esc(v?.yearEstablishment||'')}"></div>
        <div class="fg"><label class="lbl">Bankers</label>
          <input class="fc" id="ps-bankers" value="${esc(v?.bankers||'')}"></div>
        <div class="fg"><label class="lbl">G.S.T. No.</label>
          <input class="fc" id="ps-gst" value="${esc(v?.gstNo||'')}"></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>For VRA Use Only</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 100px;gap:10px;align-items:center">
        <label class="lbl">Is capacity of Supplier to supply required material sufficient?</label>${purYN('ps-q-capacity',v?.qCapacity)}
        <label class="lbl">Is distance of Supplier's location feasible?</label>${purYN('ps-q-distance',v?.qDistance)}
        <label class="lbl">Are credit terms acceptable?</label>${purYN('ps-q-credit',v?.qCredit)}
        <label class="lbl">Is material supplied with bill?</label>${purYN('ps-q-bill',v?.qBill)}
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Purchase In Charge — Sample Evaluation</h5>
      <span class="muted" style="font-size:11px">Both samples must be ACCEPT + Include in Approved List = Y to become an Approved Supplier</span>
    </div>
    <div class="cb">
      ${purSampleSection(1,v?.sample1)}
      ${purSampleSection(2,v?.sample2)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;padding-top:6px">
        <label class="lbl">Supplier include in Approved Suppliers List?</label>${purYN('ps-include',v?.includeInApprovedList)}
        <label class="lbl">Release P.O. to Supplier?</label>${purYN('ps-release',v?.releasePO)}
        <div class="fg"><label class="lbl">CEO / Authorized By</label>
          <input class="fc" id="ps-ceo" value="${esc(v?.ceoName||'')}"></div>
        <div class="fg"><label class="lbl">P.O. Date &amp; No.</label>
          <input class="fc" id="ps-po-datno" value="${esc(v?.poDateNo||'')}"></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="cb"><div class="fg"><label class="lbl">Remarks</label>
      <input class="fc" id="ps-remarks" value="${esc(v?.remarks||'')}"></div></div>
  </div>

  <div style="display:flex;gap:8px;justify-content:flex-end">
    <button class="btn btn-o" onclick="nav('pur-suppliers')">Cancel</button>
    <button class="btn btn-p" onclick="purSaveSupplier(${id||'null'})">💾 Save Supplier</button>
  </div>`);
}

function purReadSample(n){
  const dc=document.getElementById(`s${n}-dc`).value.trim();
  const date=document.getElementById(`s${n}-date`).value;
  const recv=document.getElementById(`s${n}-recv`).value;
  const rej=document.getElementById(`s${n}-rej`).value;
  const acc=document.getElementById(`s${n}-acc`).value;
  const timing=document.getElementById(`s${n}-timing`).value;
  const decision=document.getElementById(`s${n}-decision`).value;
  if(!dc&&!date&&!recv&&!rej&&!acc&&!decision) return{};
  return{dcNo:dc,date,qtyReceived:recv===''?'':Number(recv),qtyRejected:rej===''?'':Number(rej),qtyAccepted:acc===''?'':Number(acc),timing,decision};
}

async function purSaveSupplier(id){
  const name=document.getElementById('ps-name').value.trim();
  const scope=document.getElementById('ps-scope').value.trim();
  if(!name){toast('Supplier name required','d');return;}
  if(!scope){toast('Scope of supply required','d');return;}
  const rec={
    supNumber:document.getElementById('ps-num').value.trim(),
    date:document.getElementById('ps-date').value,
    name, address:document.getElementById('ps-address').value.trim(),
    contactPerson:document.getElementById('ps-contact').value.trim(),
    contactPhone:document.getElementById('ps-phone').value.trim(),
    scopeOfSupply:scope,
    yearEstablishment:document.getElementById('ps-year').value.trim(),
    bankers:document.getElementById('ps-bankers').value.trim(),
    gstNo:document.getElementById('ps-gst').value.trim(),
    qCapacity:document.getElementById('ps-q-capacity').value,
    qDistance:document.getElementById('ps-q-distance').value,
    qCredit:document.getElementById('ps-q-credit').value,
    qBill:document.getElementById('ps-q-bill').value,
    sample1:purReadSample(1),
    sample2:purReadSample(2),
    includeInApprovedList:document.getElementById('ps-include').value,
    releasePO:document.getElementById('ps-release').value,
    ceoName:document.getElementById('ps-ceo').value.trim(),
    poDateNo:document.getElementById('ps-po-datno').value.trim(),
    remarks:document.getElementById('ps-remarks').value.trim(),
    updatedAt:new Date().toISOString()
  };
  const wasApproved=id?purIsApproved(await db.purVendors.get(id)):false;
  let savedId=id;
  if(id) await db.purVendors.update(id,rec);
  else { rec.createdAt=new Date().toISOString(); savedId=await db.purVendors.add(rec); }
  const nowApproved=purIsApproved(rec);
  toast(`✅ ${rec.name} saved`);
  if(nowApproved&&!wasApproved) toast(`🎉 ${rec.name} is now an Approved Supplier — scorecard is live`,'s');
  purRenderSuppliers();
}

// ══════════════════════════════════════════════════════
//  APPROVED SUPPLIERS
// ══════════════════════════════════════════════════════
async function purRenderApproved(){
  const vendors=(await db.purVendors.toArray().catch(()=>[])).filter(purIsApproved);
  vendors.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  setC(`
  <div class="ph"><h2>✅ Approved Supplier List</h2></div>
  <div class="card">
    <div class="ch"><h5>Approved Suppliers — ${vendors.length}</h5>
      <span class="muted" style="font-size:11px">VRA-PUR-F-01</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>#</th><th>Sup No.</th><th>Supplier Name</th><th>Scope of Supply</th>
        <th>2nd Sample Date</th><th></th>
      </tr></thead>
      <tbody>${vendors.length===0
        ?`<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">No approved suppliers yet.</td></tr>`
        :vendors.map((v,i)=>`<tr>
          <td style="text-align:center">${i+1}</td>
          <td class="mono" style="color:var(--navy);font-weight:700">${esc(v.supNumber)}</td>
          <td><strong>${esc(v.name)}</strong></td>
          <td>${esc(v.scopeOfSupply||'—')}</td>
          <td>${v.sample2?.date||'—'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="purViewVendor(${v.id})">📊 Scorecard</button>
            <button class="btn btn-o btn-xs" onclick="purRenderSupplierForm(${v.id})">✏️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  VENDOR DETAIL — scorecard + invoice/lot entries
// ══════════════════════════════════════════════════════
let _purVendorPeriod={period:'all',from:'',to:''};
let _purCurrentVendorId=null;

async function purViewVendor(id){
  _purCurrentVendorId=id;
  const v=await db.purVendors.get(id);
  const lots=await db.purVendorLots.where('vendorId').equals(id).toArray().catch(()=>[]);
  const allRows=purVendorRows(v,lots);
  const range=purPeriodRange(_purVendorPeriod.period,_purVendorPeriod.from,_purVendorPeriod.to);
  const rows=allRows.filter(r=>purInRange(r.date,range));
  const sc=purCalcRating(rows);

  setC(`
  <div class="ph">
    <h2>📊 ${esc(v.name)} <span class="muted" style="font-size:13px">${esc(v.supNumber)}</span></h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="purOpenLotForm(${id},null,'vendor')">+ Add Invoice / Delivery</button>
      <button class="btn btn-o" onclick="purPrintVendorScorecard(${id})">🖨️ Print Scorecard</button>
      <button class="btn btn-o" onclick="purRenderSupplierForm(${id})">✏️ Edit Supplier</button>
      <button class="btn btn-o" onclick="nav('pur-approved')">← Back</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Vendor Rating — ${esc(purPeriodLabel(_purVendorPeriod.period,_purVendorPeriod.from,_purVendorPeriod.to))}</h5>
      ${purPeriodSelectorHtml(_purVendorPeriod.period,_purVendorPeriod.from,_purVendorPeriod.to,'purVendorPeriodChange')}
    </div>
    <div class="cb">
      <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px">
        <div><div style="font-size:24px;font-weight:800;color:var(--navy)">${sc.totalReceived}</div><div class="muted" style="font-size:11px">Qty Received</div></div>
        <div><div style="font-size:24px;font-weight:800;color:#7f1d1d">${sc.totalRejected}</div><div class="muted" style="font-size:11px">Qty Rejected</div></div>
        <div><div style="font-size:24px;font-weight:800;color:#14532d">${sc.totalAccepted}</div><div class="muted" style="font-size:11px">Qty Accepted</div></div>
        <div><div style="font-size:24px;font-weight:800;color:var(--navy)">${sc.totalLots}</div><div class="muted" style="font-size:11px">Total Lots</div></div>
        <div><div style="font-size:24px;font-weight:800;color:#14532d">${sc.onTimeCount}</div><div class="muted" style="font-size:11px">On Time / ≤5 Days</div></div>
        <div><div style="font-size:24px;font-weight:800;color:#7f1d1d">${sc.after5Count}</div><div class="muted" style="font-size:11px">After 5 Days</div></div>
      </div>
      <div style="display:flex;gap:24px;margin-top:14px;flex-wrap:wrap">
        <div><div class="muted" style="font-size:11px">Quality Rating</div>${purPctBadge(sc.qualityRating)}</div>
        <div><div class="muted" style="font-size:11px">Delivery Rating</div>${purPctBadge(sc.deliveryRating)}</div>
        <div><div class="muted" style="font-size:11px">Supplier Rating</div>${purPctBadge(sc.supplierRating)}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="ch"><h5>Delivery / Invoice Log (${rows.length})</h5></div>
    <div class="tw"><table>
      <thead><tr>
        <th>Source</th><th>Ref / Invoice No.</th><th>Date</th><th>Qty Received</th><th>Qty Rejected</th><th>Qty Accepted</th><th>Lot Timing</th><th></th>
      </tr></thead>
      <tbody>${rows.length===0
        ?`<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af">No entries in this period.</td></tr>`
        :rows.map(r=>`<tr style="${r.source!=='Invoice'?'background:#fffbeb':''}">
          <td>${r.source}</td>
          <td class="mono">${esc(r.refNo||'—')}</td>
          <td>${r.date||'—'}</td>
          <td style="text-align:center">${r.qtyReceived}</td>
          <td style="text-align:center;color:#7f1d1d">${r.qtyRejected}</td>
          <td style="text-align:center;color:#14532d">${r.qtyAccepted}</td>
          <td>${PUR_TIMING_LABELS[r.timing]||r.timing}</td>
          <td style="white-space:nowrap">${r.source==='Invoice'?`
            <button class="btn btn-o btn-xs" onclick="purOpenLotForm(${id},${r.id},'vendor')">✏️</button>
            <button class="btn btn-r btn-xs" onclick="purDeleteLot(${r.id},'vendor')">🗑️</button>
          `:'<span class="muted" style="font-size:11px">Edit via Supplier form</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>
  <div style="margin-top:10px">
    <button class="btn btn-o btn-sm" onclick="nav('pur-invoices')">🧾 Go to Invoice / Delivery Register</button>
  </div>`);
}

function purVendorPeriodChange(){
  _purVendorPeriod.period=document.getElementById('pur-period').value;
  _purVendorPeriod.from=document.getElementById('pur-period-from')?.value||'';
  _purVendorPeriod.to=document.getElementById('pur-period-to')?.value||'';
  const id=_purCurrentVendorId;
  if(_purVendorPeriod.period==='custom'&&(!_purVendorPeriod.from||!_purVendorPeriod.to)) return;
  purViewVendor(id);
}

// ══════════════════════════════════════════════════════
//  INVOICE / DELIVERY REGISTER — standalone entry point
//  Lets an accountant add invoices for any approved supplier without
//  going through that supplier's own scorecard page, and doubles as
//  an audit log to check which suppliers still need this period's
//  entries.
// ══════════════════════════════════════════════════════
async function purRenderInvoices(){
  const allVendors=await db.purVendors.toArray().catch(()=>[]);
  const approvedVendors=allVendors.filter(purIsApproved);
  const allLots=await db.purVendorLots.toArray().catch(()=>[]);

  // Combine each approved vendor's 2 registration samples with their invoice
  // entries — same rows their own scorecard shows — so this register is a
  // complete log, not just invoices entered after approval.
  const rows=[];
  approvedVendors.forEach(v=>{
    const vendorLots=allLots.filter(l=>l.vendorId===v.id);
    purVendorRows(v,vendorLots).forEach(r=>rows.push({...r,vendorId:v.id}));
  });
  rows.sort((a,b)=>(b.date||'')>(a.date||'')?1:-1);

  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const enteredThisMonth=new Set(rows.filter(r=>r.date&&new Date(r.date)>=monthStart).map(r=>r.vendorId));
  const missing=approvedVendors.filter(v=>!enteredThisMonth.has(v.id));
  const monthLabel=now.toLocaleDateString('en-IN',{month:'long',year:'numeric'});

  setC(`
  <div class="ph">
    <h2>🧾 Invoice / Delivery Register</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="purOpenLotForm(null,null,'register')">+ Add Invoice</button>
    </div>
  </div>
  ${approvedVendors.length===0?'':missing.length>0
    ?`<div class="alert al-w" style="margin-bottom:12px">⚠️ ${missing.length} approved supplier(s) have no entry for ${monthLabel}: ${missing.map(v=>esc(v.name)).join(', ')}</div>`
    :`<div class="alert al-s" style="margin-bottom:12px">✅ Every approved supplier has at least one entry for ${monthLabel}.</div>`}
  <div class="card">
    <div class="ch"><h5>All Invoice / Delivery Entries — ${rows.length}</h5></div>
    <div class="tw"><table>
      <thead><tr><th>Date</th><th>Supplier</th><th>Source</th><th>Ref / Invoice No.</th><th>Qty Received</th><th>Qty Rejected</th><th>Qty Accepted</th><th>Lot Timing</th><th></th></tr></thead>
      <tbody>${rows.length===0
        ?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">No entries yet. Click + Add Invoice to start.</td></tr>`
        :rows.map(r=>{
          const v=allVendors.find(x=>x.id===r.vendorId);
          return`<tr style="${r.source!=='Invoice'?'background:#fffbeb':''}">
            <td>${r.date||'—'}</td>
            <td><strong>${esc(v?.name||'Unknown supplier')}</strong></td>
            <td>${r.source}</td>
            <td class="mono">${esc(r.refNo||'—')}</td>
            <td style="text-align:center">${r.qtyReceived}</td>
            <td style="text-align:center;color:#7f1d1d">${r.qtyRejected}</td>
            <td style="text-align:center;color:#14532d">${r.qtyAccepted}</td>
            <td>${PUR_TIMING_LABELS[r.timing]||r.timing}</td>
            <td style="white-space:nowrap">${r.source==='Invoice'?`
              <button class="btn btn-o btn-xs" onclick="purOpenLotForm(null,${r.id},'register')">✏️</button>
              <button class="btn btn-r btn-xs" onclick="purDeleteLot(${r.id},'register')">🗑️</button>
            `:'<span class="muted" style="font-size:11px">Edit via Supplier form</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`);
}

// ── INVOICE / LOT FORM ────────────────────────────────
// vendorId: pre-fixed supplier context (from a vendor's own scorecard page) or
//   null to show a searchable supplier picker (from the Invoice Register).
// returnTo: which page to refresh after save/delete — 'vendor' or 'register'.
let _purVendorNameMap={};
async function purOpenLotForm(vendorId=null,editId=null,returnTo=null){
  const l=editId?await db.purVendorLots.get(editId).catch(()=>null):null;
  if(l&&!vendorId) vendorId=l.vendorId;
  returnTo=returnTo||(vendorId?'vendor':'register');
  const fixedVendor=vendorId?await db.purVendors.get(vendorId).catch(()=>null):null;

  let vendorFieldHtml;
  if(fixedVendor){
    vendorFieldHtml=`<div class="fg" style="margin-bottom:10px"><label class="lbl">Supplier</label>
      <input class="fc" value="${esc(fixedVendor.name)} (${esc(fixedVendor.supNumber)})" readonly style="background:#f5f7fd;font-weight:700">
      <input type="hidden" id="lot-vendor-id" value="${fixedVendor.id}"></div>`;
  } else {
    const approvedVendors=(await db.purVendors.toArray().catch(()=>[])).filter(purIsApproved);
    _purVendorNameMap={};
    approvedVendors.forEach(v=>{ _purVendorNameMap[v.name.trim().toLowerCase()]=v; });
    vendorFieldHtml=`<div class="fg" style="margin-bottom:10px"><label class="lbl">Supplier * <span class="muted" style="font-weight:400">(type to search approved suppliers)</span></label>
      <input class="fc" id="lot-vendor-name" list="pur-vendor-datalist" placeholder="Start typing supplier name..." autocomplete="off" oninput="purResolveVendorFromInput()">
      <datalist id="pur-vendor-datalist">${approvedVendors.map(v=>`<option value="${esc(v.name)}">`).join('')}</datalist>
      <input type="hidden" id="lot-vendor-id" value="">
      <div id="lot-vendor-match" style="font-size:11px;margin-top:4px"></div></div>`;
  }

  const ov=document.createElement('div');ov.className='overlay';ov.id='pur-lot-ov';
  ov.innerHTML=`<div class="modal" style="width:500px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${l?'Edit':'New'} Invoice / Delivery</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('pur-lot-ov').remove()">✕</button>
    </div>
    ${vendorFieldHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Invoice / DC No.</label>
        <input class="fc" id="lot-ref" value="${esc(l?.refNo||'')}"></div>
      <div class="fg"><label class="lbl">Date *</label>
        <input class="fc" type="date" id="lot-date" value="${l?.date||new Date().toISOString().split('T')[0]}"></div>
      <div class="fg"><label class="lbl">Qty Received</label>
        <input class="fc" type="number" id="lot-recv" value="${l?.qtyReceived??''}" oninput="purAutoAcceptLot()"></div>
      <div class="fg"><label class="lbl">Qty Rejected</label>
        <input class="fc" type="number" id="lot-rej" value="${l?.qtyRejected??''}" oninput="purAutoAcceptLot()"></div>
      <div class="fg"><label class="lbl">Qty Accepted</label>
        <input class="fc" type="number" id="lot-acc" value="${l?.qtyAccepted??''}"></div>
      <div class="fg"><label class="lbl">Lot Timing</label>${purTimingSelect('lot-timing',l?.timing)}</div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Remarks</label>
        <input class="fc" id="lot-remarks" value="${esc(l?.remarks||'')}"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('pur-lot-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="purSaveLot(${editId||'null'},'${returnTo}')">💾 Save</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
function purResolveVendorFromInput(){
  const typed=document.getElementById('lot-vendor-name').value.trim().toLowerCase();
  const match=_purVendorNameMap[typed];
  const hidden=document.getElementById('lot-vendor-id');
  const info=document.getElementById('lot-vendor-match');
  hidden.value=match?match.id:'';
  info.innerHTML=match?`<span style="color:#14532d">✓ Matched ${esc(match.supNumber)}</span>`
    :typed?`<span style="color:#7f1d1d">No matching approved supplier — pick one from the list</span>`:'';
}
function purAutoAcceptLot(){
  const recv=parseFloat(document.getElementById('lot-recv')?.value)||0;
  const rej=parseFloat(document.getElementById('lot-rej')?.value)||0;
  const el=document.getElementById('lot-acc');
  if(el) el.value=Math.max(recv-rej,0);
}
async function purSaveLot(editId,returnTo){
  const vendorId=Number(document.getElementById('lot-vendor-id').value)||null;
  if(!vendorId){toast('Select a valid approved supplier','d');return;}
  const date=document.getElementById('lot-date').value;
  if(!date){toast('Date required','d');return;}
  const rec={
    vendorId,
    refNo:document.getElementById('lot-ref').value.trim(),
    date,
    qtyReceived:Number(document.getElementById('lot-recv').value)||0,
    qtyRejected:Number(document.getElementById('lot-rej').value)||0,
    qtyAccepted:document.getElementById('lot-acc').value===''?null:Number(document.getElementById('lot-acc').value),
    timing:document.getElementById('lot-timing').value,
    remarks:document.getElementById('lot-remarks').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(editId) await db.purVendorLots.update(editId,rec);
  else { rec.createdAt=new Date().toISOString(); await db.purVendorLots.add(rec); }
  document.getElementById('pur-lot-ov').remove();
  toast('✅ Entry saved');
  if(returnTo==='register') purRenderInvoices();
  else purViewVendor(vendorId);
}
async function purDeleteLot(id,returnTo){
  if(!confirm('Delete this delivery/invoice entry? This will affect the scorecard.')) return;
  const l=await db.purVendorLots.get(id);
  await db.purVendorLots.delete(id);
  toast('Deleted','d');
  if(returnTo==='register') purRenderInvoices();
  else purViewVendor(l?.vendorId);
}

// ══════════════════════════════════════════════════════
//  SCORECARD — all approved suppliers, with period selector
//  (Replicates the paper Vendor Rating sheet, VRA-PUR-F-04)
// ══════════════════════════════════════════════════════
let _purScorecardPeriod={period:'all',from:'',to:''};

async function purRenderScorecard(){
  const vendors=(await db.purVendors.toArray().catch(()=>[])).filter(purIsApproved);
  vendors.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  const range=purPeriodRange(_purScorecardPeriod.period,_purScorecardPeriod.from,_purScorecardPeriod.to);

  const data=[];
  for(const v of vendors){
    const lots=await db.purVendorLots.where('vendorId').equals(v.id).toArray().catch(()=>[]);
    const rows=purVendorRows(v,lots).filter(r=>purInRange(r.date,range));
    data.push({v,sc:purCalcRating(rows)});
  }

  setC(`
  <div class="ph">
    <h2>📊 Supplier Scorecard</h2>
    <button class="btn btn-o" onclick="purPrintScorecardAll()">🖨️ Print</button>
  </div>
  <div class="card">
    <div class="ch"><h5>Vendor Rating — ${esc(purPeriodLabel(_purScorecardPeriod.period,_purScorecardPeriod.from,_purScorecardPeriod.to))}</h5>
      ${purPeriodSelectorHtml(_purScorecardPeriod.period,_purScorecardPeriod.from,_purScorecardPeriod.to,'purScorecardPeriodChange')}
    </div>
    <div class="tw" style="overflow-x:auto"><table style="min-width:1000px">
      <thead><tr style="background:var(--navy);color:#fff">
        <th>SR</th><th style="text-align:left">Name of Supplier</th>
        <th>Total Qty Received</th><th>Total Qty Rejected</th><th>Total Qty Accepted</th>
        <th>Total Lot Received</th><th>Lot in Time &amp; ≤5 Days Delay</th><th>Lot Received After 5 Days</th>
        <th>Quality Rating</th><th>Delivery Rating</th><th>Supplier Rating</th><th></th>
      </tr></thead>
      <tbody>${data.length===0
        ?`<tr><td colspan="12" style="text-align:center;padding:24px;color:#9ca3af">No approved suppliers yet.</td></tr>`
        :data.map(({v,sc},i)=>`<tr>
          <td style="text-align:center">${i+1}</td>
          <td><strong>${esc(v.name)}</strong></td>
          <td style="text-align:center">${sc.totalReceived}</td>
          <td style="text-align:center">${sc.totalRejected}</td>
          <td style="text-align:center">${sc.totalAccepted}</td>
          <td style="text-align:center">${sc.totalLots}</td>
          <td style="text-align:center">${sc.onTimeCount}</td>
          <td style="text-align:center">${sc.after5Count}</td>
          <td style="text-align:center">${purPctBadge(sc.qualityRating)}</td>
          <td style="text-align:center">${purPctBadge(sc.deliveryRating)}</td>
          <td style="text-align:center">${purPctBadge(sc.supplierRating)}</td>
          <td><button class="btn btn-o btn-xs" onclick="purViewVendor(${v.id})">👁️</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}
function purScorecardPeriodChange(){
  _purScorecardPeriod.period=document.getElementById('pur-period').value;
  _purScorecardPeriod.from=document.getElementById('pur-period-from')?.value||'';
  _purScorecardPeriod.to=document.getElementById('pur-period-to')?.value||'';
  if(_purScorecardPeriod.period==='custom'&&(!_purScorecardPeriod.from||!_purScorecardPeriod.to)) return;
  purRenderScorecard();
}

// ══════════════════════════════════════════════════════
//  PRINT — Supplier Register (controlled document list)
// ══════════════════════════════════════════════════════
async function purPrintSupplierRegister(){
  const vendors=await db.purVendors.toArray().catch(()=>[]);
  vendors.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=vendors.map((v,i)=>`<tr>
    <td>${i+1}</td>
    <td style="font-family:monospace;font-weight:bold">${esc(v.supNumber)}</td>
    <td class="tl"><strong>${esc(v.name)}</strong></td>
    <td class="tl">${esc(v.scopeOfSupply||'—')}</td>
    <td class="tl">${esc(v.contactPerson||'—')} ${esc(v.contactPhone||'')}</td>
    <td style="font-weight:bold">${purStage(v)}</td>
  </tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Supplier Register</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">SUPPLIER REGISTER</div><div class="rpt-sub">All Suppliers</div></div>
    <div><div class="rpt-num">VRA-PUR-001</div><div style="font-size:7pt;text-align:right">Date: ${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr><th>#</th><th>Sup No.</th><th class="tl">Supplier Name</th><th class="tl">Scope of Supply</th><th class="tl">Contact Person</th><th>Stage</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="6" style="text-align:center">No suppliers</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${vendors.length} · VRA-PUR-001 · V R Alucast</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;font-size:8pt">
    <div style="border:1px solid #000;padding:7px"><strong>Prepared By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp;&nbsp; Date: ______________</div>
    <div style="border:1px solid #000;padding:7px"><strong>Approved By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp;&nbsp; Date: ______________</div>
  </div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  PRINT — Supplier Approval Form (VRA-PUR-F-01)
// ══════════════════════════════════════════════════════
async function purPrintSupplierForm(id){
  const v=await db.purVendors.get(id);
  const today=new Date().toLocaleDateString('en-IN');
  const yn=x=>x==='Y'?'<strong>Y</strong> / N':x==='N'?'Y / <strong>N</strong>':'Y / N';
  const dec=x=>x==='ACCEPT'?'<strong>ACCEPT</strong> / REJECT':x==='REJECT'?'ACCEPT / <strong>REJECT</strong>':'ACCEPT / REJECT';
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Supplier Approval Form — ${v.supNumber}</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">SUPPLIER APPROVAL FORM</div><div class="rpt-sub">${esc(v.supNumber)}</div></div>
    <div><div class="rpt-num">VRA-PUR-F-01</div><div style="font-size:7pt;text-align:right">Date: ${v.date||today}</div></div>
  </div>
  <div class="frm-row" style="border-top:1px solid #000"><div class="fl">Name &amp; Address</div><div class="fv">${esc(v.name)}${v.address?'<br>'+esc(v.address):''}</div></div>
  <div class="frm-row"><div class="fl">Contact Person &amp; Phone</div><div class="fv">${esc(v.contactPerson||'')} ${esc(v.contactPhone||'')}</div></div>
  <div class="frm-row"><div class="fl">Scope of Supply</div><div class="fv">${esc(v.scopeOfSupply||'')}</div></div>
  <div class="frm-row"><div class="fl">Year of Establishment</div><div class="fv">${esc(v.yearEstablishment||'')}</div></div>
  <div class="frm-row"><div class="fl">Bankers</div><div class="fv">${esc(v.bankers||'')}</div></div>
  <div class="frm-row"><div class="fl">G.S.T. No.</div><div class="fv">${esc(v.gstNo||'')}</div></div>
  <div class="sec-bar">For VRA Use Only</div>
  <div class="frm-row" style="border-top:1px solid #000"><div class="fl">Is capacity of Supplier to supply required material sufficient?</div><div class="fv">${yn(v.qCapacity)}</div></div>
  <div class="frm-row"><div class="fl">Is distance of Supplier's location feasible?</div><div class="fv">${yn(v.qDistance)}</div></div>
  <div class="frm-row"><div class="fl">Are credit terms acceptable?</div><div class="fv">${yn(v.qCredit)}</div></div>
  <div class="frm-row"><div class="fl">Is material supplied with bill?</div><div class="fv">${yn(v.qBill)}</div></div>
  <div class="sec-bar">Purchase In Charge</div>
  <div class="frm-row" style="border-top:1px solid #000"><div class="fl">1st Sample Received</div><div class="fv">Invoice No &amp; Date: ${esc(v.sample1?.dcNo||'—')} ${v.sample1?.date||''} &nbsp;&nbsp; ${dec(v.sample1?.decision)}</div></div>
  <div class="frm-row"><div class="fl">2nd Sample Received</div><div class="fv">Invoice No &amp; Date: ${esc(v.sample2?.dcNo||'—')} ${v.sample2?.date||''} &nbsp;&nbsp; ${dec(v.sample2?.decision)}</div></div>
  <div class="frm-row"><div class="fl">Supplier include in Approved Suppliers List</div><div class="fv">${yn(v.includeInApprovedList)}</div></div>
  <div class="frm-row"><div class="fl">Release P.O. to Supplier</div><div class="fv">${yn(v.releasePO)} &nbsp;&nbsp; CEO: ${esc(v.ceoName||'')}</div></div>
  <div class="frm-row"><div class="fl">P.O. Date &amp; No.</div><div class="fv">${esc(v.poDateNo||'')}</div></div>
  <div style="margin-top:8px;font-size:7.5pt;color:#555">VRA-PUR-F-01 · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  PRINT — Vendor Rating scorecard, all suppliers (VRA-PUR-F-04)
// ══════════════════════════════════════════════════════
async function purPrintScorecardAll(){
  const vendors=(await db.purVendors.toArray().catch(()=>[])).filter(purIsApproved);
  vendors.sort((a,b)=>a.supNumber>b.supNumber?1:-1);
  const range=purPeriodRange(_purScorecardPeriod.period,_purScorecardPeriod.from,_purScorecardPeriod.to);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=[];
  for(let i=0;i<vendors.length;i++){
    const v=vendors[i];
    const lots=await db.purVendorLots.where('vendorId').equals(v.id).toArray().catch(()=>[]);
    const filtered=purVendorRows(v,lots).filter(r=>purInRange(r.date,range));
    const sc=purCalcRating(filtered);
    rows.push(`<tr>
      <td>${i+1}</td><td class="tl"><strong>${esc(v.name)}</strong></td>
      <td>${sc.totalReceived}</td><td>${sc.totalRejected}</td><td>${sc.totalAccepted}</td>
      <td>${sc.totalLots}</td><td>${sc.onTimeCount}</td><td>${sc.after5Count}</td>
      <td style="font-weight:bold">${sc.qualityRating!=null?sc.qualityRating+'%':'—'}</td>
      <td style="font-weight:bold">${sc.deliveryRating!=null?sc.deliveryRating+'%':'—'}</td>
      <td style="font-weight:bold">${sc.supplierRating!=null?sc.supplierRating+'%':'—'}</td>
    </tr>`);
  }
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Vendor Rating</title>
  <style>${purPrintCSS()}@page{size:A4 landscape;margin:12mm 13mm 14mm 13mm}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">VENDOR RATING</div><div class="rpt-sub">PERIOD:- ${esc(purPeriodLabel(_purScorecardPeriod.period,_purScorecardPeriod.from,_purScorecardPeriod.to))}</div></div>
    <div><div class="rpt-num">VRA-PUR-F-04</div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>SR</th><th class="tl">Name of Supplier</th><th>Total Qty Received</th><th>Total Qty Rejected</th><th>Total Qty Acceptd</th>
      <th>Total Lot Received</th><th>Lot in tme &amp; up to 5 days dealy</th><th>Lot received after 5 days</th>
      <th>Quality Rating</th><th>Delivery Rating</th><th>Supplier Rating</th>
    </tr></thead>
    <tbody>${rows.join('')||'<tr><td colspan="11" style="text-align:center">No approved suppliers</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">VRA-PUR-F-04 · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

async function purPrintVendorScorecard(id){
  const v=await db.purVendors.get(id);
  const lots=await db.purVendorLots.where('vendorId').equals(id).toArray().catch(()=>[]);
  const range=purPeriodRange(_purVendorPeriod.period,_purVendorPeriod.from,_purVendorPeriod.to);
  const rows=purVendorRows(v,lots).filter(r=>purInRange(r.date,range));
  const sc=purCalcRating(rows);
  const today=new Date().toLocaleDateString('en-IN');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Vendor Rating — ${v.supNumber}</title>
  <style>${purPrintCSS()}@page{size:A4 landscape;margin:12mm 13mm 14mm 13mm}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">VENDOR RATING</div><div class="rpt-sub">PERIOD:- ${esc(purPeriodLabel(_purVendorPeriod.period,_purVendorPeriod.from,_purVendorPeriod.to))}</div></div>
    <div><div class="rpt-num">VRA-PUR-F-04</div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>SR</th><th class="tl">Name of Supplier</th><th>Total Qty Received</th><th>Total Qty Rejected</th><th>Total Qty Acceptd</th>
      <th>Total Lot Received</th><th>Lot in tme &amp; up to 5 days dealy</th><th>Lot received after 5 days</th>
      <th>Quality Rating</th><th>Delivery Rating</th><th>Supplier Rating</th>
    </tr></thead>
    <tbody><tr>
      <td>1</td><td class="tl"><strong>${esc(v.name)}</strong></td>
      <td>${sc.totalReceived}</td><td>${sc.totalRejected}</td><td>${sc.totalAccepted}</td>
      <td>${sc.totalLots}</td><td>${sc.onTimeCount}</td><td>${sc.after5Count}</td>
      <td style="font-weight:bold">${sc.qualityRating!=null?sc.qualityRating+'%':'—'}</td>
      <td style="font-weight:bold">${sc.deliveryRating!=null?sc.deliveryRating+'%':'—'}</td>
      <td style="font-weight:bold">${sc.supplierRating!=null?sc.supplierRating+'%':'—'}</td>
    </tr></tbody>
  </table>
  <div class="sec-bar">Delivery / Invoice Log</div>
  <table class="dt">
    <thead><tr><th>Source</th><th class="tl">Ref/Invoice No.</th><th>Date</th><th>Qty Received</th><th>Qty Rejected</th><th>Qty Accepted</th><th>Timing</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${r.source}</td><td class="tl">${esc(r.refNo||'—')}</td><td>${r.date||'—'}</td><td>${r.qtyReceived}</td><td>${r.qtyRejected}</td><td>${r.qtyAccepted}</td><td>${PUR_TIMING_LABELS[r.timing]||r.timing}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center">No entries</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">VRA-PUR-F-04 · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

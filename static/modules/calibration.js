// VRA DMS — CALIBRATION MODULE

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

// ── Due-soon count (used by dashboard banner + sidebar badge) ──
async function calGetDueSoonCount(days=30){
  try{
    const gauges=await db.calGauges.where('status').equals('Active').toArray();
    const today=new Date(); today.setHours(0,0,0,0);
    let count=0;
    for(const g of gauges){
      const lat=await calGetLatest(g.id);
      const nextDue=lat?.nextDue||'';
      if(!nextDue){count++;continue;}
      const daysLeft=Math.ceil((new Date(nextDue)-today)/(1000*60*60*24));
      if(daysLeft<=days) count++;
    }
    return count;
  }catch(e){return 0;}
}
async function updateCalCount(){
  const n=await calGetDueSoonCount(30);
  const el=document.getElementById('calcount');
  if(!el) return;
  el.style.display=n?'inline':'none'; if(n) el.textContent=n;
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
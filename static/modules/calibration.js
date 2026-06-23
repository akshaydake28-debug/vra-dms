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

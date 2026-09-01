// ══════════════════════════════════════════════════════
//  VRA DMS — PRODUCTION MODULE
//  Shift-level production log + Daily Summary / Yield & Defect
//  Pareto / OEE reports built on top of it.
// ══════════════════════════════════════════════════════

// Mirrors QMS2.STEPS / DEFAULT_OPS in static/modules/qms2.js — keep in sync.
const PROD_OPS = ['Receiving Inspection','Melting','Die Casting','Trimming/Fettling',
  'Shot Blasting','Machining','Final Inspection','Packing & Dispatch'];
const PROD_SHIFTS = ['Day (I)','Night (II)','General'];
const PROD_DOWNTIME_REASONS = ['—','Machine Breakdown','Die Change / Setup','Power Failure',
  'Material Shortage','Planned Maintenance','Quality Hold','Tool/Die Failure',
  'Manpower Shortage','Other'];
const PROD_DEFAULT_DEFECTS = [
  {code:'BLOW',     description:'Blow Hole / Gas Porosity', category:'Casting'},
  {code:'SHRINK',   description:'Shrinkage Porosity',        category:'Casting'},
  {code:'COLDSHUT', description:'Cold Shut',                 category:'Casting'},
  {code:'SHORTFILL',description:'Short Fill / Incomplete Fill', category:'Casting'},
  {code:'FLASH',    description:'Flash / Excess Material',   category:'Casting'},
  {code:'CRACK',    description:'Crack',                     category:'Casting'},
  {code:'DIM',      description:'Dimensional NG',            category:'Machining'},
  {code:'SURF',     description:'Surface Scratch / Damage',  category:'Cosmetic'},
  {code:'BURR',     description:'Burr',                      category:'Trimming'},
  {code:'MACH',     description:'Machining NG',              category:'Machining'},
  {code:'HANDLE',   description:'Handling Damage',           category:'Handling'},
  {code:'MISC',     description:'Miscellaneous',             category:'Other'},
];

function prodToday(){ return new Date().toISOString().slice(0,10); }
function prodDaysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function prodPct(n){ return isFinite(n) ? n.toFixed(1)+'%' : '—'; }
function prodPartLabel(p){ return p ? `${p.partNumber} — ${p.partName}` : '—'; }
function prodTier(n,hi,lo){ return n>=hi?'#16a34a':n>=lo?'#d97706':'#dc2626'; }

async function prodEnsureDefectCodes(){
  const all = await db.prodDefects.toArray().catch(()=>[]);
  if(all.length) return all;
  for(const d of PROD_DEFAULT_DEFECTS) await db.prodDefects.add(d);
  return db.prodDefects.toArray().catch(()=>[]);
}

function prodPartOpts(parts, selectedId){
  return parts.map(p=>`<option value="${p.id}" ${p.id==selectedId?'selected':''}>${esc(prodPartLabel(p))}</option>`).join('');
}
function prodOptList(items, selected){
  return items.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
}
function prodAllOpt(items, selected, allLabel='All'){
  return `<option value="">${allLabel}</option>` + items.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
}

// ══════════════════════════════════════════════════════
//  PRODUCTION LOG — register + form
// ══════════════════════════════════════════════════════
async function prodRenderLog(f={}){
  const [logs, parts] = await Promise.all([db.prodLogs.toArray().catch(()=>[]), DB.getParts()]);
  const from = f.from || prodDaysAgo(6), to = f.to || prodToday();
  const filtered = logs.filter(l =>
    l.date >= from && l.date <= to &&
    (!f.partId || String(l.partId) === String(f.partId)) &&
    (!f.shift || l.shift === f.shift)
  ).sort((a,b)=> b.date.localeCompare(a.date) || (b.id-a.id));

  const today = prodToday();
  const todays = logs.filter(l=>l.date===today);
  const tProd = todays.reduce((s,l)=>s+(+l.producedQty||0),0);
  const tRej  = todays.reduce((s,l)=>s+(+l.rejectedQty||0),0);
  const tDown = todays.reduce((s,l)=>s+(+l.downtimeMinutes||0),0);
  const scrapToday = tProd ? (tRej/tProd*100) : 0;

  const partById = Object.fromEntries(parts.map(p=>[p.id,p]));

  setC(`
  <div class="ph">
    <h2>🏭 Production Log</h2>
    <button class="btn btn-p" onclick="prodOpenLogForm()">➕ New Shift Entry</button>
  </div>
  <div class="sg">
    <div class="sc"><div class="si" style="background:#edf1fb">📦</div><div><div class="sv">${tProd}</div><div class="sl2">Produced Today</div></div></div>
    <div class="sc"><div class="si" style="background:#fee2e2">❌</div><div><div class="sv" style="color:#dc2626">${tRej}</div><div class="sl2">Rejected Today</div></div></div>
    <div class="sc"><div class="si" style="background:#fef3c7">📉</div><div><div class="sv" style="color:${prodTier(100-scrapToday,97,90)}">${prodPct(scrapToday)}</div><div class="sl2">Scrap % Today</div></div></div>
    <div class="sc"><div class="si" style="background:#f0f3f9">⏱️</div><div><div class="sv" style="color:#6b7280">${tDown}m</div><div class="sl2">Downtime Today</div></div></div>
  </div>
  <div class="card">
    <div class="ch"><h5>Filters</h5></div>
    <div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <div class="fg"><label class="lbl">From</label><input class="fc" type="date" id="pl-from" value="${from}"></div>
      <div class="fg"><label class="lbl">To</label><input class="fc" type="date" id="pl-to" value="${to}"></div>
      <div class="fg"><label class="lbl">Part</label><select class="fc" id="pl-part"><option value="">All Parts</option>${parts.map(p=>`<option value="${p.id}" ${String(p.id)===String(f.partId)?'selected':''}>${esc(prodPartLabel(p))}</option>`).join('')}</select></div>
      <div class="fg"><label class="lbl">Shift</label><select class="fc" id="pl-shift">${prodAllOpt(PROD_SHIFTS, f.shift, 'All Shifts')}</select></div>
      <button class="btn btn-o" onclick="prodApplyLogFilter()">Apply</button>
    </div>
  </div>
  <div class="card">
    <div class="tw"><table>
      <thead><tr><th>Date</th><th>Shift</th><th>Part</th><th>Operation</th><th>Planned</th><th>Produced</th><th>Rejected</th><th>Scrap%</th><th>Rework</th><th>Downtime</th><th>Operator</th><th></th></tr></thead>
      <tbody>${filtered.map(l=>{
        const scrap = l.producedQty ? (l.rejectedQty/l.producedQty*100) : 0;
        return `<tr>
          <td class="mono">${l.date}</td><td>${esc(l.shift||'')}</td>
          <td>${esc(partById[l.partId]?partById[l.partId].partNumber:'—')}</td>
          <td>${esc(l.operation||'')}</td>
          <td class="mono">${l.plannedQty||0}</td><td class="mono">${l.producedQty||0}</td>
          <td class="mono" style="color:#dc2626">${l.rejectedQty||0}</td>
          <td class="mono">${prodPct(scrap)}</td>
          <td class="mono">${l.reworkQty||0}</td>
          <td class="mono">${l.downtimeMinutes||0}m</td>
          <td>${esc(l.operator||'')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="prodOpenLogForm(${l.id})">✏️</button>
            <button class="btn btn-r btn-xs" onclick="prodDeleteLog(${l.id})">🗑️</button>
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="12" style="text-align:center;padding:20px;color:#9ca3af">No production entries in this range.</td></tr>`}
      </tbody>
    </table></div>
  </div>`);
}
function prodApplyLogFilter(){
  prodRenderLog({
    from: document.getElementById('pl-from').value,
    to: document.getElementById('pl-to').value,
    partId: document.getElementById('pl-part').value,
    shift: document.getElementById('pl-shift').value,
  });
}
async function prodDeleteLog(id){
  if(!confirm('Delete this production entry?')) return;
  await db.prodLogs.delete(id);
  toast('🗑️ Entry deleted');
  prodRenderLog();
}

async function prodOpenLogForm(id=null){
  const [rec, parts, defects] = await Promise.all([
    id ? db.prodLogs.get(id).catch(()=>null) : null,
    DB.getParts(),
    prodEnsureDefectCodes(),
  ]);
  const defectQty = rec?.defects ? Object.fromEntries(rec.defects.map(d=>[d.code,d.qty])) : {};

  const ov=document.createElement('div'); ov.className='overlay'; ov.id='pl-ov';
  ov.innerHTML=`<div class="modal" style="width:720px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${rec?'Edit Production Entry':'New Shift Production Entry'}</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('pl-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Date *</label><input class="fc" type="date" id="pf-date" value="${rec?.date||prodToday()}"></div>
      <div class="fg"><label class="lbl">Shift *</label><select class="fc" id="pf-shift">${prodOptList(PROD_SHIFTS, rec?.shift||PROD_SHIFTS[0])}</select></div>
      <div class="fg"><label class="lbl">Operation *</label><select class="fc" id="pf-op">${prodOptList(PROD_OPS, rec?.operation||PROD_OPS[0])}</select></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Part *</label><select class="fc" id="pf-part">${prodPartOpts(parts, rec?.partId)}</select></div>
      <div class="fg"><label class="lbl">Machine / Line</label><input class="fc" id="pf-machine" value="${esc(rec?.machine||'')}" placeholder="e.g. DC-01"></div>
      <div class="fg"><label class="lbl">Operator</label><input class="fc" id="pf-operator" value="${esc(rec?.operator||'')}"></div>
      <div class="fg"><label class="lbl">Planned Qty</label><input class="fc" type="number" id="pf-planned" value="${rec?.plannedQty??0}"></div>
      <div class="fg"><label class="lbl">Produced Qty *</label><input class="fc" type="number" id="pf-produced" value="${rec?.producedQty??0}" oninput="prodRecalcRejected()"></div>
      <div class="fg"><label class="lbl">Rework Qty</label><input class="fc" type="number" id="pf-rework" value="${rec?.reworkQty??0}"></div>
      <div class="fg"><label class="lbl">Planned Run (min)</label><input class="fc" type="number" id="pf-planmin" value="${rec?.plannedMinutes??480}"></div>
      <div class="fg"><label class="lbl">Downtime (min)</label><input class="fc" type="number" id="pf-downtime" value="${rec?.downtimeMinutes??0}"></div>
      <div class="fg"><label class="lbl">Downtime Reason</label><select class="fc" id="pf-downreason">${prodOptList(PROD_DOWNTIME_REASONS, rec?.downtimeReason||'—')}</select></div>
      <div class="fg" style="grid-column:span 3"><label class="lbl">Std Cycle Time (sec/pc) — used for OEE Performance</label>
        <input class="fc" type="number" id="pf-cycle" value="${rec?.idealCycleTimeSec??''}" placeholder="e.g. 45"></div>
    </div>
    <div class="fg" style="margin-top:8px">
      <label class="lbl">Rejection Breakdown (qty by defect code)</label>
      <div id="pf-defects" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:4px">
        ${defects.map(d=>`
          <div>
            <label style="font-size:10.5px;color:#6b7280" title="${esc(d.description)}">${esc(d.code)}</label>
            <input class="fc" type="number" min="0" data-defect="${esc(d.code)}" value="${defectQty[d.code]||0}" oninput="prodRecalcRejected()">
          </div>`).join('')}
      </div>
      <div style="margin-top:8px;font-weight:600">Total Rejected (auto): <span id="pf-total-rej">${rec?.rejectedQty||0}</span></div>
    </div>
    <div class="fg" style="margin-top:8px"><label class="lbl">Remarks</label><input class="fc" id="pf-remarks" value="${esc(rec?.remarks||'')}"></div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('pl-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="prodSaveLog(${id||'null'})">💾 Save Entry</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  prodRecalcRejected();
}
function prodRecalcRejected(){
  const inputs=[...document.querySelectorAll('#pf-defects [data-defect]')];
  const total=inputs.reduce((s,i)=>s+(parseInt(i.value)||0),0);
  const el=document.getElementById('pf-total-rej'); if(el) el.textContent=total;
}
async function prodSaveLog(id){
  const partId = document.getElementById('pf-part').value;
  const produced = parseInt(document.getElementById('pf-produced').value)||0;
  if(!partId){ toast('Part is required','d'); return; }
  const defectInputs=[...document.querySelectorAll('#pf-defects [data-defect]')];
  const defects = defectInputs.map(i=>({code:i.dataset.defect, qty:parseInt(i.value)||0})).filter(d=>d.qty>0);
  const rejectedQty = defects.reduce((s,d)=>s+d.qty,0);
  const rec = {
    date: document.getElementById('pf-date').value || prodToday(),
    shift: document.getElementById('pf-shift').value,
    operation: document.getElementById('pf-op').value,
    partId: parseInt(partId),
    machine: document.getElementById('pf-machine').value.trim(),
    operator: document.getElementById('pf-operator').value.trim(),
    plannedQty: parseInt(document.getElementById('pf-planned').value)||0,
    producedQty: produced,
    rejectedQty,
    reworkQty: parseInt(document.getElementById('pf-rework').value)||0,
    plannedMinutes: parseInt(document.getElementById('pf-planmin').value)||0,
    downtimeMinutes: parseInt(document.getElementById('pf-downtime').value)||0,
    downtimeReason: document.getElementById('pf-downreason').value,
    idealCycleTimeSec: parseFloat(document.getElementById('pf-cycle').value)||0,
    defects,
    remarks: document.getElementById('pf-remarks').value.trim(),
    updatedAt: new Date().toISOString(),
  };
  if(id) await db.prodLogs.update(id, rec);
  else { rec.createdAt=new Date().toISOString(); await db.prodLogs.add(rec); }
  document.getElementById('pl-ov').remove();
  toast('✅ Production entry saved');
  prodRenderLog();
}

// ══════════════════════════════════════════════════════
//  DEFECT CODE MASTER
// ══════════════════════════════════════════════════════
async function prodRenderDefects(){
  const defects = await prodEnsureDefectCodes();
  setC(`
  <div class="ph"><h2>🏷️ Defect Codes</h2>
    <button class="btn btn-p" onclick="prodOpenDefectForm()">➕ Add Defect Code</button></div>
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Code</th><th>Description</th><th>Category</th><th></th></tr></thead>
    <tbody>${defects.map(d=>`<tr>
      <td class="mono" style="font-weight:700">${esc(d.code)}</td><td>${esc(d.description)}</td><td>${esc(d.category||'')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-o btn-xs" onclick="prodOpenDefectForm(${d.id})">✏️</button>
        <button class="btn btn-r btn-xs" onclick="prodDeleteDefect(${d.id})">🗑️</button>
      </td></tr>`).join('') || `<tr><td colspan="4" style="text-align:center;padding:20px;color:#9ca3af">No defect codes yet.</td></tr>`}
    </tbody>
  </table></div></div>`);
}
async function prodOpenDefectForm(id=null){
  const d = id ? await db.prodDefects.get(id).catch(()=>null) : null;
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='pd-ov';
  ov.innerHTML=`<div class="modal" style="width:440px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${d?'Edit Defect Code':'Add Defect Code'}</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('pd-ov').remove()">✕</button>
    </div>
    <div class="fg"><label class="lbl">Code *</label><input class="fc mono" id="pd-code" value="${esc(d?.code||'')}" placeholder="e.g. BLOW"></div>
    <div class="fg"><label class="lbl">Description *</label><input class="fc" id="pd-desc" value="${esc(d?.description||'')}" placeholder="e.g. Blow Hole / Gas Porosity"></div>
    <div class="fg"><label class="lbl">Category</label><input class="fc" id="pd-cat" value="${esc(d?.category||'')}" placeholder="e.g. Casting"></div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('pd-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="prodSaveDefect(${id||'null'})">💾 Save</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
async function prodSaveDefect(id){
  const code=document.getElementById('pd-code').value.trim().toUpperCase();
  const description=document.getElementById('pd-desc').value.trim();
  if(!code||!description){ toast('Code and description are required','d'); return; }
  const rec={code, description, category:document.getElementById('pd-cat').value.trim()};
  if(id) await db.prodDefects.update(id,rec); else await db.prodDefects.add(rec);
  document.getElementById('pd-ov').remove();
  toast('✅ Defect code saved');
  prodRenderDefects();
}
async function prodDeleteDefect(id){
  if(!confirm('Delete this defect code?')) return;
  await db.prodDefects.delete(id);
  prodRenderDefects();
}

// ══════════════════════════════════════════════════════
//  REPORT 1 — Daily / Shift Production Summary
// ══════════════════════════════════════════════════════
async function prodRenderSummary(f={}){
  const [logs, parts] = await Promise.all([db.prodLogs.toArray().catch(()=>[]), DB.getParts()]);
  const from=f.from||prodDaysAgo(6), to=f.to||prodToday();
  const partById=Object.fromEntries(parts.map(p=>[p.id,p]));
  const filtered=logs.filter(l=> l.date>=from && l.date<=to &&
    (!f.partId || String(l.partId)===String(f.partId)));

  const byKey={};
  for(const l of filtered){
    const key=`${l.date}|${l.shift}`;
    if(!byKey[key]) byKey[key]={date:l.date,shift:l.shift,planned:0,produced:0,rejected:0,rework:0,downtime:0,planmin:0};
    const k=byKey[key];
    k.planned+=+l.plannedQty||0; k.produced+=+l.producedQty||0; k.rejected+=+l.rejectedQty||0;
    k.rework+=+l.reworkQty||0; k.downtime+=+l.downtimeMinutes||0; k.planmin+=+l.plannedMinutes||0;
  }
  const rows=Object.values(byKey).sort((a,b)=>b.date.localeCompare(a.date));
  const tot=rows.reduce((s,r)=>({planned:s.planned+r.planned,produced:s.produced+r.produced,
    rejected:s.rejected+r.rejected,rework:s.rework+r.rework,downtime:s.downtime+r.downtime,planmin:s.planmin+r.planmin}),
    {planned:0,produced:0,rejected:0,rework:0,downtime:0,planmin:0});
  const scrapOverall = tot.produced ? tot.rejected/tot.produced*100 : 0;
  const availOverall = tot.planmin ? (tot.planmin-tot.downtime)/tot.planmin*100 : 0;

  setC(`
  <div class="ph"><h2>📊 Daily / Shift Production Summary</h2></div>
  <div class="card"><div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
    <div class="fg"><label class="lbl">From</label><input class="fc" type="date" id="ps-from" value="${from}"></div>
    <div class="fg"><label class="lbl">To</label><input class="fc" type="date" id="ps-to" value="${to}"></div>
    <div class="fg"><label class="lbl">Part</label><select class="fc" id="ps-part"><option value="">All Parts</option>${parts.map(p=>`<option value="${p.id}" ${String(p.id)===String(f.partId)?'selected':''}>${esc(prodPartLabel(p))}</option>`).join('')}</select></div>
    <button class="btn btn-o" onclick="prodRenderSummary({from:document.getElementById('ps-from').value,to:document.getElementById('ps-to').value,partId:document.getElementById('ps-part').value})">Apply</button>
  </div></div>
  <div class="sg">
    <div class="sc"><div class="si" style="background:#edf1fb">📦</div><div><div class="sv">${tot.produced}</div><div class="sl2">Total Produced</div></div></div>
    <div class="sc"><div class="si" style="background:#fee2e2">❌</div><div><div class="sv" style="color:#dc2626">${tot.rejected}</div><div class="sl2">Total Rejected</div></div></div>
    <div class="sc"><div class="si" style="background:#fef3c7">📉</div><div><div class="sv" style="color:${prodTier(100-scrapOverall,97,90)}">${prodPct(scrapOverall)}</div><div class="sl2">Overall Scrap %</div></div></div>
    <div class="sc"><div class="si" style="background:#f0f3f9">⏱️</div><div><div class="sv" style="color:${prodTier(availOverall,85,60)}">${prodPct(availOverall)}</div><div class="sl2">Availability</div></div></div>
  </div>
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Date</th><th>Shift</th><th>Planned</th><th>Produced</th><th>Rejected</th><th>Scrap%</th><th>Rework</th><th>Downtime</th><th>Availability%</th></tr></thead>
    <tbody>${rows.map(r=>{
      const scrap=r.produced?r.rejected/r.produced*100:0;
      const avail=r.planmin?(r.planmin-r.downtime)/r.planmin*100:0;
      return `<tr><td class="mono">${r.date}</td><td>${esc(r.shift||'')}</td>
        <td class="mono">${r.planned}</td><td class="mono">${r.produced}</td>
        <td class="mono" style="color:#dc2626">${r.rejected}</td><td class="mono">${prodPct(scrap)}</td>
        <td class="mono">${r.rework}</td><td class="mono">${r.downtime}m</td>
        <td class="mono" style="color:${prodTier(avail,85,60)}">${prodPct(avail)}</td></tr>`;
    }).join('') || `<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">No data in this range.</td></tr>`}
    </tbody>
    ${rows.length?`<tfoot><tr style="font-weight:700"><td colspan="2">TOTAL</td><td class="mono">${tot.planned}</td><td class="mono">${tot.produced}</td>
      <td class="mono" style="color:#dc2626">${tot.rejected}</td><td class="mono">${prodPct(scrapOverall)}</td>
      <td class="mono">${tot.rework}</td><td class="mono">${tot.downtime}m</td>
      <td class="mono" style="color:${prodTier(availOverall,85,60)}">${prodPct(availOverall)}</td></tr></tfoot>`:''}
  </table></div></div>`);
}

// ══════════════════════════════════════════════════════
//  REPORT 2 — Quality Yield trend + Defect Pareto
// ══════════════════════════════════════════════════════
async function prodRenderYield(f={}){
  const [logs, parts] = await Promise.all([db.prodLogs.toArray().catch(()=>[]), DB.getParts()]);
  const from=f.from||prodDaysAgo(29), to=f.to||prodToday();
  const filtered=logs.filter(l=> l.date>=from && l.date<=to &&
    (!f.partId || String(l.partId)===String(f.partId)));

  // FPY trend by date
  const byDate={};
  for(const l of filtered){
    if(!byDate[l.date]) byDate[l.date]={produced:0,rejected:0,rework:0};
    byDate[l.date].produced+=+l.producedQty||0; byDate[l.date].rejected+=+l.rejectedQty||0; byDate[l.date].rework+=+l.reworkQty||0;
  }
  const trend=Object.entries(byDate).map(([date,v])=>({date,...v,
    fpy: v.produced ? (v.produced-v.rejected-v.rework)/v.produced*100 : null})).sort((a,b)=>b.date.localeCompare(a.date));

  // Defect Pareto
  const defectTotals={};
  for(const l of filtered) for(const d of (l.defects||[])) defectTotals[d.code]=(defectTotals[d.code]||0)+d.qty;
  const defects = await prodEnsureDefectCodes();
  const descByCode = Object.fromEntries(defects.map(d=>[d.code,d.description]));
  const pareto = Object.entries(defectTotals).map(([code,qty])=>({code,qty})).sort((a,b)=>b.qty-a.qty);
  const grand = pareto.reduce((s,p)=>s+p.qty,0);
  const maxQty = pareto.length ? pareto[0].qty : 0;
  let cum=0;
  const paretoRows = pareto.map(p=>{ cum+=p.qty; const cumPct = grand? cum/grand*100 : 0;
    return {...p, cumPct, pct: grand? p.qty/grand*100 : 0}; });

  setC(`
  <div class="ph"><h2>📉 Quality Yield &amp; Defect Pareto</h2></div>
  <div class="card"><div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
    <div class="fg"><label class="lbl">From</label><input class="fc" type="date" id="py-from" value="${from}"></div>
    <div class="fg"><label class="lbl">To</label><input class="fc" type="date" id="py-to" value="${to}"></div>
    <div class="fg"><label class="lbl">Part</label><select class="fc" id="py-part"><option value="">All Parts</option>${parts.map(p=>`<option value="${p.id}" ${String(p.id)===String(f.partId)?'selected':''}>${esc(prodPartLabel(p))}</option>`).join('')}</select></div>
    <button class="btn btn-o" onclick="prodRenderYield({from:document.getElementById('py-from').value,to:document.getElementById('py-to').value,partId:document.getElementById('py-part').value})">Apply</button>
  </div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card">
      <div class="ch"><h5>First-Pass Yield Trend</h5></div>
      <div class="tw" style="max-height:420px;overflow-y:auto"><table>
        <thead><tr><th>Date</th><th>Produced</th><th>Rejected</th><th>Rework</th><th>FPY%</th></tr></thead>
        <tbody>${trend.map(t=>`<tr><td class="mono">${t.date}</td><td class="mono">${t.produced}</td>
          <td class="mono" style="color:#dc2626">${t.rejected}</td><td class="mono">${t.rework}</td>
          <td class="mono" style="color:${t.fpy==null?'#9ca3af':prodTier(t.fpy,97,90)}">${t.fpy==null?'—':prodPct(t.fpy)}</td></tr>`).join('')
          || `<tr><td colspan="5" style="text-align:center;padding:20px;color:#9ca3af">No data.</td></tr>`}
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="ch"><h5>Defect Pareto (${grand} total rejects)</h5></div>
      <div class="cb">
        ${paretoRows.map(p=>`
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
            <div style="width:88px;font-weight:600;font-size:12px" title="${esc(descByCode[p.code]||'')}">${esc(p.code)}</div>
            <div style="flex:1;background:#f0f3f9;border-radius:4px;overflow:hidden;height:18px">
              <div style="width:${maxQty?(p.qty/maxQty*100):0}%;background:${p.cumPct<=80?'#dc2626':'#94a3b8'};height:100%"></div>
            </div>
            <div style="width:42px;text-align:right;font-size:12px" class="mono">${p.qty}</div>
            <div style="width:56px;text-align:right;font-size:11px;color:#6b7280" class="mono">${p.cumPct.toFixed(0)}%</div>
          </div>`).join('') || `<div style="text-align:center;padding:20px;color:#9ca3af">No rejections recorded in this range.</div>`}
        ${paretoRows.length?`<div style="margin-top:6px;font-size:11px;color:#6b7280">Red bars = the "vital few" defect codes making up the first 80% of rejections.</div>`:''}
      </div>
    </div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  REPORT 3 — OEE Dashboard
// ══════════════════════════════════════════════════════
async function prodRenderOEE(f={}){
  const [logs, parts] = await Promise.all([db.prodLogs.toArray().catch(()=>[]), DB.getParts()]);
  const from=f.from||prodDaysAgo(6), to=f.to||prodToday();
  const filtered=logs.filter(l=> l.date>=from && l.date<=to &&
    (!f.partId || String(l.partId)===String(f.partId)) &&
    (!f.operation || l.operation===f.operation));
  const missingCycle = filtered.filter(l=>!l.idealCycleTimeSec);
  const usable = filtered.filter(l=>l.idealCycleTimeSec>0);

  function oeeOf(rows){
    const planmin=rows.reduce((s,l)=>s+(+l.plannedMinutes||0),0);
    const downtime=rows.reduce((s,l)=>s+(+l.downtimeMinutes||0),0);
    const produced=rows.reduce((s,l)=>s+(+l.producedQty||0),0);
    const rejected=rows.reduce((s,l)=>s+(+l.rejectedQty||0),0);
    const runtime=planmin-downtime;
    const idealMinUsed=rows.reduce((s,l)=>s+((+l.producedQty||0)*(+l.idealCycleTimeSec||0))/60,0);
    const availability = planmin? runtime/planmin*100 : 0;
    const performance = runtime>0 ? Math.min(idealMinUsed/runtime*100,100) : 0;
    const quality = produced ? (produced-rejected)/produced*100 : 0;
    const oee = availability*performance*quality/10000;
    return {availability,performance,quality,oee,planmin,downtime,produced,rejected};
  }
  const overall = oeeOf(usable);

  // Daily trend
  const byDate={};
  for(const l of usable){ (byDate[l.date]=byDate[l.date]||[]).push(l); }
  const trend = Object.entries(byDate).map(([date,rows])=>({date,...oeeOf(rows)})).sort((a,b)=>b.date.localeCompare(a.date));

  setC(`
  <div class="ph"><h2>⚙️ OEE Dashboard</h2></div>
  <div class="card"><div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
    <div class="fg"><label class="lbl">From</label><input class="fc" type="date" id="po-from" value="${from}"></div>
    <div class="fg"><label class="lbl">To</label><input class="fc" type="date" id="po-to" value="${to}"></div>
    <div class="fg"><label class="lbl">Part</label><select class="fc" id="po-part"><option value="">All Parts</option>${parts.map(p=>`<option value="${p.id}" ${String(p.id)===String(f.partId)?'selected':''}>${esc(prodPartLabel(p))}</option>`).join('')}</select></div>
    <div class="fg"><label class="lbl">Operation</label><select class="fc" id="po-op">${prodAllOpt(PROD_OPS, f.operation, 'All Operations')}</select></div>
    <button class="btn btn-o" onclick="prodRenderOEE({from:document.getElementById('po-from').value,to:document.getElementById('po-to').value,partId:document.getElementById('po-part').value,operation:document.getElementById('po-op').value})">Apply</button>
  </div></div>
  ${missingCycle.length?`<div class="alert al-w">⚠️ ${missingCycle.length} entr${missingCycle.length===1?'y is':'ies are'} missing a Std Cycle Time and excluded from Performance/OEE — set it on the entry to include it.</div>`:''}
  <div class="sg">
    <div class="sc"><div class="si" style="background:#edf1fb">🟢</div><div><div class="sv" style="color:${prodTier(overall.availability,85,60)}">${prodPct(overall.availability)}</div><div class="sl2">Availability</div></div></div>
    <div class="sc"><div class="si" style="background:#edf1fb">🏃</div><div><div class="sv" style="color:${prodTier(overall.performance,85,60)}">${prodPct(overall.performance)}</div><div class="sl2">Performance</div></div></div>
    <div class="sc"><div class="si" style="background:#edf1fb">✅</div><div><div class="sv" style="color:${prodTier(overall.quality,97,90)}">${prodPct(overall.quality)}</div><div class="sl2">Quality</div></div></div>
    <div class="sc"><div class="si" style="background:#dbeafe">⭐</div><div><div class="sv" style="color:${prodTier(overall.oee,85,60)}">${prodPct(overall.oee)}</div><div class="sl2">Overall OEE</div></div></div>
  </div>
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Date</th><th>Availability</th><th>Performance</th><th>Quality</th><th>OEE</th></tr></thead>
    <tbody>${trend.map(t=>`<tr><td class="mono">${t.date}</td>
      <td class="mono" style="color:${prodTier(t.availability,85,60)}">${prodPct(t.availability)}</td>
      <td class="mono" style="color:${prodTier(t.performance,85,60)}">${prodPct(t.performance)}</td>
      <td class="mono" style="color:${prodTier(t.quality,97,90)}">${prodPct(t.quality)}</td>
      <td class="mono" style="font-weight:700;color:${prodTier(t.oee,85,60)}">${prodPct(t.oee)}</td></tr>`).join('')
      || `<tr><td colspan="5" style="text-align:center;padding:20px;color:#9ca3af">No entries with a Std Cycle Time in this range.</td></tr>`}
    </tbody>
  </table></div></div>`);
}

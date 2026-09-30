// ══════════════════════════════════════════════════════
//  VRA DMS — PRODUCTION MODULE (Die Casting)
//
//  One entry per machine per shift, keyed as shift totals from the
//  paper Daily Production Report:
//    • header    — date, shift A/B, machine, 2 operators, planned time
//    • lines     — part, grade, cavities, total shots, off shots (a
//                  part change or a cavity going down is another line)
//    • rejection — rejected pcs by defect, per line
//    • downtime  — category, minutes
//  Everything else is calculated: OK parts, rejection % / PPM, OEE and
//  where the time went, melting loss and metal consumed per grade, and
//  raw-material / part stock (tied to the RM Lot Register + Dispatch).
//
//  Units: shots and off shots are machine cycles, as on the paper sheet;
//  rejections are in pcs; reports convert: pcs = shots × cavities.
//  Off shots are warm-up / trial shots scrapped.
// ══════════════════════════════════════════════════════

const PROD_SHIFTS = {
  A: {label:'A — Day (08:00–20:00)',   start:8},
  B: {label:'B — Night (20:00–08:00)', start:20},
};
const PROD_DOWN_CATS = ['Die Loading / Unloading','Die Maintenance','Machine & Furnace Maintenance',
  'Melting / Metal Not Ready','Shot End Component','Spray Gun / Die Coat','Central Compressor','Crane',
  'Power Cut','Manpower','Material Shortage','No Plan','Plan Completed','Quality Hold','Other'];
// Time with no work planned — taken off planned time, never counts against OEE
const PROD_NOT_PLANNED = ['No Plan','Plan Completed'];
// Reasons for a machine not running a whole shift ("No Plan" first: doesn't count against OEE)
const PROD_NOT_RUN = ['No Plan',...PROD_DOWN_CATS.filter(c=>!PROD_NOT_PLANNED.includes(c))];
const PROD_DEFAULT_MACHINES = [
  {code:'280T', name:'280 Ton HPDC', tonnage:280, active:true},
  {code:'400T', name:'400 Ton HPDC', tonnage:400, active:true},
];
const PROD_DEFAULT_DEFECTS = [
  {code:'NONFILL', description:'Non Fill / Short Fill', onSheet:true,  order:1},
  {code:'CRACK',   description:'Crack',                 onSheet:true,  order:2},
  {code:'SOLDER',  description:'Soldering',             onSheet:true,  order:3},
  {code:'DAMAGE',  description:'Damage',                onSheet:true,  order:4},
  {code:'BLISTER', description:'Blister',               onSheet:true,  order:5},
  {code:'BLOW',    description:'Blow Hole / Porosity',  onSheet:false, order:6},
  {code:'COLDSHUT',description:'Cold Shut / Flow Mark', onSheet:false, order:7},
  {code:'FLASH',   description:'Flash',                 onSheet:false, order:8},
  {code:'DIM',     description:'Dimensional NG',        onSheet:false, order:9},
  {code:'OTHER',   description:'Other',                 onSheet:false, order:10},
];
const PROD_CFG_DEFAULT = {meltLossPct:6, consumptionBasis:'all', plannedMinutes:720,
  workDays:26, shiftsPerDay:2, hoursPerShift:12, targetOeePct:75};   // capacity planning
const PROD_ADJ_REASONS = ['Opening Stock','Physical Count Correction','Scrap / Write-off','Return / Rework','Other'];

// ── small helpers ────────────────────────────────────
function prodDate(d=new Date()){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function prodToday(){ return prodDate(); }
function prodDaysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return prodDate(d); }
function prodAddDays(ds,n){ const d=new Date(ds+'T00:00:00'); d.setDate(d.getDate()+n); return prodDate(d); }
function prodN(v){ const n=parseFloat(v); return isFinite(n)?n:0; }
function prodFmt(n,dp=0){
  if(!isFinite(n)) return '—';
  if(Math.abs(n)<0.5*10**-dp) n=0;                       // no "-0"
  return Number(n).toLocaleString('en-IN',{minimumFractionDigits:dp,maximumFractionDigits:dp});
}
function prodPct(x,dp=1){ return isFinite(x)? (x*100).toFixed(dp)+'%' : '—'; }
function prodHrs(min){ return isFinite(min)? (min/60).toFixed(1)+' h' : '—'; }
function prodTier(x,hi,lo){ return x>=hi?'#16a34a':x>=lo?'#d97706':'#dc2626'; }
function prodPartLabel(p){ return p? `${p.partNumber||''} — ${p.partName||''}` : '—'; }
function prodMachineLabel(m){ return m? (m.code||m.name||'') : '—'; }
// Metal needed per part: net weight + melting loss on that metal (0.5 kg @ 6% → 0.53 kg)
function prodMetalPerPc(wt,cfg){ return prodN(wt)*(1+prodN(cfg.meltLossPct)/100); }
function prodCT(part,machineId){ return prodN((part?.cycleTimes||{})[machineId]); }
function prodOpts(items,sel,{val=x=>x,label=x=>x,blank=null}={}){
  return (blank!==null?`<option value="">${esc(blank)}</option>`:'')+
    items.map(x=>`<option value="${esc(val(x))}" ${String(val(x))===String(sel??'')?'selected':''}>${esc(label(x))}</option>`).join('');
}
function prodEmpty(cols,msg){ return `<tr><td colspan="${cols}" style="text-align:center;padding:20px;color:#9ca3af">${msg}</td></tr>`; }
function prodTile(icon,value,label,color,bg='#edf1fb'){
  return `<div class="sc"><div class="si" style="background:${bg}">${icon}</div><div><div class="sv" ${color?`style="color:${color}"`:''}>${value}</div><div class="sl2">${label}</div></div></div>`;
}
function prodClose(id){ const e=document.getElementById(id); if(e) e.remove(); }

// ══════════════════════════════════════════════════════
//  MASTERS + CONTEXT
// ══════════════════════════════════════════════════════
let _prodSeeded=null;
function prodSeed(){
  if(!_prodSeeded) _prodSeeded=(async()=>{
    const [m,d]=await Promise.all([db.prodMachines.toArray(),db.prodDefectCodes.toArray()]);
    if(!m.length) for(const x of PROD_DEFAULT_MACHINES) await db.prodMachines.add(x);
    if(!d.length) for(const x of PROD_DEFAULT_DEFECTS) await db.prodDefectCodes.add(x);
  })().catch(()=>{ _prodSeeded=null; });
  return _prodSeeded;
}
async function prodGetCfg(){
  const v=await DB.getSetting('prodConfig').catch(()=>null);
  return {...PROD_CFG_DEFAULT,...(v&&typeof v==='object'?v:{})};
}
async function prodCtx(){
  await prodSeed();
  const [machines,parts,defects,cfg,pqGrades,lots]=await Promise.all([
    db.prodMachines.toArray(), db.prodParts.toArray(), db.prodDefectCodes.toArray(), prodGetCfg(),
    _api('GET','/api/qms2/pq_grades').catch(()=>[]),
    typeof rmGetLots==='function'? rmGetLots() : [],
  ]);
  machines.sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  parts.sort((a,b)=>String(a.partNumber).localeCompare(String(b.partNumber)));
  defects.sort((a,b)=>(prodN(a.order)||99)-(prodN(b.order)||99) || String(a.code).localeCompare(String(b.code)));
  const lotList=Array.isArray(lots)?lots:[];
  const grades=new Set();
  (Array.isArray(pqGrades)?pqGrades:[]).forEach(g=>g.grade&&grades.add(g.grade));
  if(typeof rmGetList==='function') (rmGetList('grades')||[]).forEach(g=>g&&grades.add(g));
  parts.forEach(p=>p.grade&&grades.add(p.grade));
  lotList.forEach(l=>l.grade&&grades.add(l.grade));
  return {machines, parts, defects, cfg, lots:lotList, grades:[...grades].sort(),
    machineById:Object.fromEntries(machines.map(m=>[m.id,m])),
    partById:Object.fromEntries(parts.map(p=>[p.id,p])),
    defectByCode:Object.fromEntries(defects.map(d=>[d.code,d]))};
}

// ══════════════════════════════════════════════════════
//  CALCULATIONS
// ══════════════════════════════════════════════════════
const PROD_SUM_KEYS=['planned','noPlanMin','downtime','runtime','shots','off','offPcs','rejPcs','castPcs','okPcs',
  'idealMin','ctMin','cavLossMin','qualLossMin','netKg','lossKg','totalKg','shotsNoCT','shotsNoWt'];

// A shift entry is a list of lines (sheet.runs), each a shift total:
//   {partId, grade, cavities, shots, offShots, rej:{code:pcs}}
// A part change or a cavity going down mid-shift is just another line
// (same part, fewer cavities, the shots made after it).
//
// Performance is measured in parts: the target time per part is the
// target cycle time ÷ the die's cavities (Part Master). Running with a
// cavity down makes half the parts in the same time, so it shows as a
// performance loss ("cavity down") rather than being hidden.
//
// Time with no work planned is not planned time, so it never counts
// against OEE: "No Plan" / "Plan Completed" downtime lines (e.g. the plan
// finished early and the machine stood for the rest of the shift) are
// taken off planned time instead of being downtime. A machine that did not run a shift is saved with
// notRun = reason: "No Plan" takes the whole shift off planned time; any
// other reason counts the whole shift as downtime for that reason.
function prodCalc(sheet,ctx){
  const loss=prodN(ctx.cfg.meltLossPct)/100, basisOk=ctx.cfg.consumptionBasis==='ok';
  const notRun=sheet.notRun||'', shift=prodN(sheet.plannedMinutes)||prodN(ctx.cfg.plannedMinutes)||720;
  const lines=notRun? [{category:notRun, minutes:shift, remark:'Did not run'}] : (sheet.downtime||[]).filter(d=>prodN(d.minutes)>0);
  const noPlanMin=Math.min(shift,lines.filter(d=>PROD_NOT_PLANNED.includes(d.category)).reduce((s,d)=>s+prodN(d.minutes),0));
  const planned=shift-noPlanMin;
  const downs=lines.filter(d=>!PROD_NOT_PLANNED.includes(d.category));
  const downtime=Math.min(planned,downs.reduce((s,d)=>s+prodN(d.minutes),0));

  const runs=(notRun?[]:sheet.runs||[]).map((r,i)=>{
    const part=ctx.partById[r.partId];
    const cav=prodN(r.cavities)||prodN(part?.cavities)||1;
    const dieCav=prodN(part?.cavities)||cav;
    const shots=prodN(r.shots), castPcs=shots*cav;
    const off=Math.min(shots,prodN(r.offShots)), offPcs=off*cav;
    let rejS=0, rejPcs=0; const rej={};
    for(const [c,v] of Object.entries(r.rej||{})){ const n=prodN(v); if(n>0){ rej[c]=n; rejS+=n/cav; rejPcs+=n; } }
    const okPcs=Math.max(0,castPcs-offPcs-rejPcs);
    const ct=prodCT(part,sheet.machineId), wt=prodN(part?.netWeightKg), ctPc=ct/dieCav;
    const netKg=(basisOk?okPcs:castPcs)*wt;
    const idealMin=ct? castPcs*ctPc/60 : 0, ctMin=ct? shots*ct/60 : 0;
    return {...r, _i:i, part, grade:r.grade||part?.grade||'—', cav, dieCav, shots, off, offPcs, rej, rejPcs, castPcs, okPcs,
      okShots:Math.max(0,shots-off-rejS), ct, wt,
      idealMin, ctMin, cavLossMin:Math.max(0,ctMin-idealMin),
      qualLossMin: ct? (offPcs+rejPcs)*ctPc/60 : 0,
      shotsNoCT: ct?0:shots, shotsNoWt: wt?0:shots,
      netKg, lossKg:netKg*loss, totalKg:netKg*(1+loss),
      ppm: castPcs-offPcs>0? rejPcs/(castPcs-offPcs)*1e6 : 0};
  });

  const t={planned, noPlanMin, downtime, runtime:planned-downtime};
  for(const k of PROD_SUM_KEYS) if(!(k in t)) t[k]=runs.reduce((s,r)=>s+(r[k]||0),0);
  t.okShots=runs.reduce((s,r)=>s+r.okShots,0);
  const res={runs, t, byGrade:{}, byPart:{}, byDefect:{}, byDown:{}};
  prodMergeMaps(res,runs,downs);
  res.t=prodRatios(t);
  return res;
}
function prodMergeMaps(acc,runs,downs){
  for(const r of runs){
    const g=acc.byGrade[r.grade]||(acc.byGrade[r.grade]={castPcs:0,okPcs:0,netKg:0,lossKg:0,totalKg:0});
    g.castPcs+=r.castPcs; g.okPcs+=r.okPcs; g.netKg+=r.netKg; g.lossKg+=r.lossKg; g.totalKg+=r.totalKg;
    if(r.partId){
      const p=acc.byPart[r.partId]||(acc.byPart[r.partId]={castPcs:0,okPcs:0,rejPcs:0,offPcs:0,rej:{}});
      p.castPcs+=r.castPcs; p.okPcs+=r.okPcs; p.rejPcs+=r.rejPcs; p.offPcs+=r.offPcs;
      for(const [c,n] of Object.entries(r.rej)) p.rej[c]=(p.rej[c]||0)+n;
    }
    for(const [c,n] of Object.entries(r.rej)) acc.byDefect[c]=(acc.byDefect[c]||0)+n;
  }
  for(const d of downs){ const c=d.category||'Other'; acc.byDown[c]=(acc.byDown[c]||0)+prodN(d.minutes); }
}
function prodRatios(t){
  const A=t.planned? t.runtime/t.planned : 0;
  const pRaw=t.runtime>0? t.idealMin/t.runtime : 0;
  const P=Math.min(1,pRaw);
  const Q=t.castPcs? t.okPcs/t.castPcs : 0;
  const shotsCT=t.shots-t.shotsNoCT;
  return {...t, A, P, pRaw, Q, oee:A*P*Q,
    rejPct: t.castPcs? (t.offPcs+t.rejPcs)/t.castPcs : 0,
    ppm: (t.castPcs-t.offPcs)>0? t.rejPcs/(t.castPcs-t.offPcs)*1e6 : 0,
    actCT: t.shots? t.runtime*60/t.shots : null,
    tgtCT: shotsCT>0? t.ctMin*60/shotsCT : null,
    perfLossMin: Math.max(0,t.runtime-t.idealMin),   // speed + cavity down; overstated when shotsNoCT>0 — callers flag it
    speedLossMin: Math.max(0,t.runtime-t.idealMin-t.cavLossMin)};
}
// Sum several shift calcs into one (for reports)
function prodAgg(calcs){
  const acc={t:{},byGrade:{},byPart:{},byDefect:{},byDown:{}};
  for(const k of PROD_SUM_KEYS) acc.t[k]=0;
  for(const c of calcs){
    for(const k of PROD_SUM_KEYS) acc.t[k]+=c.t[k]||0;
    for(const [g,v] of Object.entries(c.byGrade)){ const a=acc.byGrade[g]||(acc.byGrade[g]={castPcs:0,okPcs:0,netKg:0,lossKg:0,totalKg:0}); for(const k in v) a[k]+=v[k]; }
    for(const [p,v] of Object.entries(c.byPart)){ const a=acc.byPart[p]||(acc.byPart[p]={castPcs:0,okPcs:0,rejPcs:0,offPcs:0,rej:{}});
      a.castPcs+=v.castPcs; a.okPcs+=v.okPcs; a.rejPcs+=v.rejPcs; a.offPcs+=v.offPcs;
      for(const [d,n] of Object.entries(v.rej)) a.rej[d]=(a.rej[d]||0)+n; }
    for(const [d,n] of Object.entries(c.byDefect)) acc.byDefect[d]=(acc.byDefect[d]||0)+n;
    for(const [d,n] of Object.entries(c.byDown)) acc.byDown[d]=(acc.byDown[d]||0)+n;
  }
  acc.t=prodRatios(acc.t);
  return acc;
}
// Load all shift entries in a range + their calcs
async function prodLoadShifts(ctx,f={}){
  const all=await db.prodShifts.toArray().catch(()=>[]);
  return all.filter(s=>
    (!f.from||s.date>=f.from) && (!f.to||s.date<=f.to) &&
    (!f.machineId||String(s.machineId)===String(f.machineId)) &&
    (!f.shift||s.shift===f.shift) &&
    (!f.partId||(s.runs||[]).some(r=>String(r.partId)===String(f.partId)))
  ).sort((a,b)=>b.date.localeCompare(a.date)||String(b.shift).localeCompare(String(a.shift))||
    String(prodMachineLabel(ctx.machineById[a.machineId])).localeCompare(String(prodMachineLabel(ctx.machineById[b.machineId]))))
   .map(s=>({s,c:prodCalc(s,ctx)}));
}

// Shared filter bar
function prodFilterBar(prefix,f,ctx,{shift=true,machine=true,part=false,onApply}){
  return `<div class="card"><div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;padding:11px 15px">
    <div class="fg" style="margin:0"><label class="lbl">From</label><input class="fc" type="date" id="${prefix}-from" value="${f.from}"></div>
    <div class="fg" style="margin:0"><label class="lbl">To</label><input class="fc" type="date" id="${prefix}-to" value="${f.to}"></div>
    ${machine?`<div class="fg" style="margin:0"><label class="lbl">Machine</label><select class="fc" id="${prefix}-mc">${prodOpts(ctx.machines,f.machineId,{val:m=>m.id,label:prodMachineLabel,blank:'All machines'})}</select></div>`:''}
    ${shift?`<div class="fg" style="margin:0"><label class="lbl">Shift</label><select class="fc" id="${prefix}-sh">${prodOpts(Object.keys(PROD_SHIFTS),f.shift,{blank:'Both shifts',label:k=>'Shift '+k})}</select></div>`:''}
    ${part?`<div class="fg" style="margin:0"><label class="lbl">Part</label><select class="fc" id="${prefix}-pt">${prodOpts(ctx.parts,f.partId,{val:p=>p.id,label:prodPartLabel,blank:'All parts'})}</select></div>`:''}
    <button class="btn btn-p" onclick="${onApply}(prodReadFilter('${prefix}'))">Apply</button>
    <button class="btn btn-o btn-sm" onclick="document.getElementById('${prefix}-from').value=prodToday();document.getElementById('${prefix}-to').value=prodToday();${onApply}(prodReadFilter('${prefix}'))">Today</button>
    <button class="btn btn-o btn-sm" onclick="document.getElementById('${prefix}-from').value=prodDaysAgo(6);document.getElementById('${prefix}-to').value=prodToday();${onApply}(prodReadFilter('${prefix}'))">7 days</button>
    <button class="btn btn-o btn-sm" onclick="document.getElementById('${prefix}-from').value=prodToday().slice(0,8)+'01';document.getElementById('${prefix}-to').value=prodToday();${onApply}(prodReadFilter('${prefix}'))">This month</button>
  </div></div>`;
}
function prodReadFilter(prefix){
  const v=id=>document.getElementById(`${prefix}-${id}`)?.value||'';
  return {from:v('from'),to:v('to'),machineId:v('mc'),shift:v('sh'),partId:v('pt')};
}
function prodKpiRow(t){
  return `<div class="sg" style="grid-template-columns:repeat(6,1fr)">
    ${prodTile('⭐',prodPct(t.oee),'OEE',prodTier(t.oee,.75,.55),'#dbeafe')}
    ${prodTile('🟢',prodPct(t.A),'Availability',prodTier(t.A,.85,.7))}
    ${prodTile('🏃',prodPct(t.P),'Performance',prodTier(t.P,.9,.75))}
    ${prodTile('✅',prodPct(t.Q),'Quality',prodTier(t.Q,.97,.93))}
    ${prodTile('📦',prodFmt(t.okPcs),'OK parts')}
    ${prodTile('📉',prodFmt(t.ppm),'Rejection PPM',t.ppm>20000?'#dc2626':t.ppm>5000?'#d97706':'#16a34a','#fee2e2')}
  </div>`;
}

// Horizontal bar list (used for Paretos). rows: [{label, title, value, display, note}]
function prodBars(rows,{highlightCum=0.8,unit=''}={}){
  const total=rows.reduce((s,r)=>s+r.value,0), max=rows.length?Math.max(...rows.map(r=>r.value)):0;
  let cum=0;
  return rows.map(r=>{
    const before=cum; cum+=r.value;
    const cumPct=total? cum/total : 0, vital=total && before/total<highlightCum;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px" title="${esc(r.title||r.label)}: ${esc(r.display??prodFmt(r.value))}${unit} · ${prodPct(total?r.value/total:0)} of total · cumulative ${prodPct(cumPct,0)}">
      <div style="width:170px;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.label)}</div>
      <div style="flex:1;height:18px;display:flex;align-items:center">
        <div style="width:${max?Math.max(1,r.value/max*100):0}%;height:12px;border-radius:0 4px 4px 0;background:${vital?'var(--navy)':'#b6c2dc'}"></div>
      </div>
      <div class="mono" style="width:78px;text-align:right">${esc(r.display??prodFmt(r.value))}${unit}</div>
      <div class="mono" style="width:52px;text-align:right;color:#6b7280">${prodPct(cumPct,0)}</div>
    </div>`;
  }).join('') + (rows.length? `<div style="font-size:11px;color:#6b7280;margin-top:6px">Dark bars = the "vital few" making up the first ${Math.round(highlightCum*100)}%. Right column = cumulative %.</div>` : '');
}

// ══════════════════════════════════════════════════════
//  1. SHIFT PRODUCTION — register
// ══════════════════════════════════════════════════════
async function prodRenderShifts(f={}){
  const ctx=await prodCtx();
  f={from:f.from||prodDaysAgo(6), to:f.to||prodToday(), machineId:f.machineId||'', shift:f.shift||''};
  const rows=await prodLoadShifts(ctx,f);
  const agg=prodAgg(rows.map(r=>r.c));

  setC(`
  <div class="ph"><h2>🏭 Shift Production</h2>
    <button class="btn btn-p" onclick="prodOpenDay()">➕ Day Entry</button></div>
  ${prodFilterBar('psr',f,ctx,{onApply:'prodRenderShifts'})}
  ${prodKpiRow(agg.t)}
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Date</th><th>Shift</th><th>Machine</th><th>Part(s)</th><th>Operators</th>
      <th style="text-align:right">Shots</th><th style="text-align:right">OK pcs</th><th style="text-align:right">Rej %</th><th style="text-align:right">PPM</th>
      <th style="text-align:right">Downtime</th><th style="text-align:right">Act / Tgt CT</th><th style="text-align:right">OEE</th><th style="text-align:right">Metal kg</th><th></th></tr></thead>
    <tbody>${rows.map(({s,c})=>{ const t=c.t; return `<tr>
      <td class="mono">${esc(s.date)}</td><td><b>${esc(s.shift)}</b></td>
      <td>${esc(prodMachineLabel(ctx.machineById[s.machineId]))}</td>
      <td>${s.notRun?`<span style="color:#6b7280">⛔ Did not run · ${esc(s.notRun)}</span>`:c.runs.map(r=>`<div>${esc(r.part?.partNumber||'—')} <span style="color:#6b7280;font-size:11px">${esc(r.grade)}</span></div>`).join('')}</td>
      <td style="font-size:12px">${esc([s.operator1,s.operator2].filter(Boolean).join(', '))}</td>
      ${s.notRun?`<td colspan="4"></td>
      <td class="mono" style="text-align:right">${t.downtime?prodFmt(t.downtime)+'m':'—'}</td><td></td>
      <td class="mono" style="text-align:right;color:#9ca3af">${t.planned?prodPct(0):'—'}</td><td></td>`:`      <td class="mono" style="text-align:right">${prodFmt(t.shots)}</td>
      <td class="mono" style="text-align:right">${prodFmt(t.okPcs)}</td>
      <td class="mono" style="text-align:right;color:${prodTier(1-t.rejPct,.97,.93)}">${prodPct(t.rejPct)}</td>
      <td class="mono" style="text-align:right">${prodFmt(t.ppm)}</td>
      <td class="mono" style="text-align:right">${t.downtime?prodFmt(t.downtime)+'m':'—'}</td>
      <td class="mono" style="text-align:right">${t.actCT?t.actCT.toFixed(0):'—'} / ${t.tgtCT?t.tgtCT.toFixed(0):'—'}s</td>
      <td class="mono" style="text-align:right;font-weight:700;color:${prodTier(t.oee,.75,.55)}">${prodPct(t.oee)}</td>
      <td class="mono" style="text-align:right">${prodFmt(t.totalKg,1)}</td>`}
      <td style="white-space:nowrap">
        <button class="btn btn-o btn-xs" onclick="prodOpenShift(${s.id})">✏️</button>
        <button class="btn btn-r btn-xs" onclick="prodDeleteShift(${s.id})">🗑️</button></td>
    </tr>`;}).join('') || prodEmpty(14,'No shift entries in this range.')}
    </tbody>
  </table></div></div>`);
}
async function prodDeleteShift(id){
  if(!confirm('Delete this shift entry? Its production, rejection and material consumption will be removed from all reports and stock.')) return;
  await db.prodShifts.delete(id);
  toast('🗑️ Shift entry deleted');
  prodRenderShifts();
}

// ══════════════════════════════════════════════════════
//  2. DAY ENTRY — one window per date with a tab for every shift ×
//     machine (A·280T, A·400T, B·280T, B·400T…) and one Save for all.
//     Each tab is still stored as its own shift entry. A tab is laid out
//     like the paper sheet: shift details → production lines →
//     rejections → downtime → totals.
//  State: window._pd holds the day; window._ps is the active tab's sheet.
//  Number inputs update state and call prodPsRefresh() (updates
//  calculated cells only, so focus is kept); structural changes
//  (part, run added/removed, tab) re-render.
// ══════════════════════════════════════════════════════
function prodNewRun(ctx,part,cavities){
  return {partId:part?.id||'', grade:part?.grade||'', cavities:cavities||prodN(part?.cavities)||1, shots:'', offShots:''};
}
// Edit an entry = open its day with that tab selected
async function prodOpenShift(id=null){
  if(!id) return prodOpenDay();
  const rec=(await db.prodShifts.toArray().catch(()=>[])).find(s=>s.id===id);
  if(!rec){ toast('Entry not found','d'); return; }
  prodOpenDay(rec.date,{shift:rec.shift,machineId:rec.machineId});
}
async function prodOpenDay(date=prodToday(),focus={}){
  const ctx=await prodCtx();
  const all=await db.prodShifts.toArray().catch(()=>[]);
  const names=new Set();
  all.forEach(s=>{ s.operator1&&names.add(s.operator1); s.operator2&&names.add(s.operator2); s.supervisor&&names.add(s.supervisor); });
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  emps.forEach(e=>e.name&&names.add(e.name));
  const day=all.filter(s=>s.date===date);
  // Active machines, plus any inactive one that already has an entry this day
  const machines=ctx.machines.filter(m=>m.active!==false||day.some(s=>String(s.machineId)===String(m.id)));
  if(!machines.length){ toast('Add a machine first','d'); return; }
  const sheets=[];
  for(const shift of Object.keys(PROD_SHIFTS)) for(const m of machines){
    const ex=day.find(s=>s.shift===shift&&String(s.machineId)===String(m.id));
    sheets.push(prodSheet(ex,{date,shift,machineId:m.id},ctx,all,names));
  }
  const active=Math.max(0,sheets.findIndex(x=>x.rec.shift===focus.shift&&String(x.rec.machineId)===String(focus.machineId)));
  window._pd={date, sheets, active, ctx, all};
  prodPdCarry();
  window._ps=sheets[active];
  prodPsRender();
}
function prodSheet(ex,{date,shift,machineId},ctx,all,names){
  let rec;
  if(ex){
    rec=JSON.parse(JSON.stringify(ex));
    rec.runs=(rec.runs||[]).map(r=>({...r, shots:r.shots??'', offShots:r.offShots??''}));
  } else {
    rec={date, shift, machineId, operator1:'', operator2:'', supervisor:'', plannedMinutes:ctx.cfg.plannedMinutes, dieCoatL:'',
      runs:[], downtime:[], remarks:''};
  }
  if(!rec.runs?.length) rec.runs=[prodNewRun(ctx,ctx.parts[0])];
  // Runs saved without cavities / grade: show the part's, so saving keeps them
  rec.runs.forEach(r=>{ const p=ctx.partById[r.partId];
    if(!prodN(r.cavities)) r.cavities=prodN(p?.cavities)||1;
    if(!r.grade&&p?.grade) r.grade=p.grade; });
  rec.downtime=rec.downtime||[];
  // Defect columns: the ones ticked "on entry form" plus any already used on this entry
  const used=new Set(); rec.runs.forEach(r=>Object.keys(r.rej||{}).forEach(c=>used.add(c)));
  const codes=ctx.defects.filter(d=>d.onSheet||used.has(d.code)).map(d=>d.code);
  used.forEach(c=>{ if(!codes.includes(c)) codes.push(c); });
  return {id:ex?.id||null, rec, ctx, names:[...names].sort(), all, codes, orig:JSON.stringify(rec)};
}
function prodSheetDirty(x){ return JSON.stringify(x.rec)!==x.orig; }
function prodSheetLabel(x){ return `Shift ${x.rec.shift} · ${prodMachineLabel(x.ctx.machineById[x.rec.machineId])}`; }
// Untouched new tabs pick up the part running at the end of the previous
// shift on that machine — including a shift keyed (not yet saved) in this window.
function prodPdCarry(){
  const pd=window._pd, keyed=pd.sheets.filter(x=>!x.id&&prodSheetDirty(x)).map(x=>x.rec);
  for(const x of pd.sheets){
    if(x.id||prodSheetDirty(x)) continue;
    prodCarryOver(x.rec,[...pd.all,...keyed],pd.ctx);
    x.orig=JSON.stringify(x.rec);
  }
}
function prodPdTab(k){
  const pd=window._pd; pd.active=k;
  prodPdCarry();
  window._ps=pd.sheets[k];
  prodPsRender();
}
function prodPdDate(v){
  const pd=window._pd;
  if(!v){ prodPsRender(); return; }
  if(pd.sheets.some(prodSheetDirty)&&!confirm('Unsaved changes on this day will be lost. Change date anyway?')){ prodPsRender(); return; }
  const a=pd.sheets[pd.active].rec;
  prodOpenDay(v,{shift:a.shift,machineId:a.machineId});
}
function prodPdCancel(){
  if(window._pd.sheets.some(prodSheetDirty)&&!confirm('Discard unsaved changes?')) return;
  prodRenderShifts();
}
// One chip per machine × shift: open it, and mark it ✓ Ran or ✕ Didn't run
// (with the reason picked right in the chip). Save Day needs every chip decided.
function prodPdTabsHtml(){
  const pd=window._pd;
  return Object.keys(PROD_SHIFTS).map(sh=>`<div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap">
    <span style="font-size:11px;font-weight:700;color:#6b7280;width:58px;align-self:center">SHIFT ${sh}</span>
    ${pd.sheets.map((x,k)=>{ if(x.rec.shift!==sh) return '';
      const on=k===pd.active, st=prodSheetState(x), t=prodCalc(x.rec,x.ctx).t;
      const ran=st==='ran'||st==='ran-empty', nr=st==='notrun'||st==='picking';
      const line=st==='notrun'? `⛔ ${esc(x.rec.notRun)}` : st==='picking'? '<span style="color:#dc2626">pick a reason ↓</span>'
        : st==='ran'? `${t.shots?`${prodFmt(t.okPcs)} OK`:'downtime only'}` : st==='ran-empty'? '<span style="color:#d97706">enter production</span>'
        : '<span style="color:#dc2626">not marked</span>';
      const save=prodSheetDirty(x)?' · <span style="color:#d97706">● unsaved</span>':x.id?' · <span style="color:#16a34a">✓ saved</span>':'';
      const btn=(active,col,label,fn)=>`<button class="btn btn-xs" style="flex:1;border:1px solid ${col};${active?`background:${col};color:#fff`:`background:#fff;color:${col}`}" onclick="event.stopPropagation();${fn}">${label}</button>`;
      return `<div style="border:${on?'2px solid var(--navy)':'1px solid var(--border)'};border-radius:8px;padding:6px 8px;min-width:200px;background:${on?'#eef2fb':st==='none'?'#fff7f7':'#fff'};cursor:pointer" onclick="prodPdTab(${k})">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b style="color:var(--navy)">${esc(prodMachineLabel(x.ctx.machineById[x.rec.machineId]))}</b>
          <span style="font-size:10.5px;color:#6b7280">${line}${save}</span></div>
        <div style="display:flex;gap:4px;margin-top:5px">
          ${btn(ran,'#16a34a','✓ Ran',`prodPdRan(${k})`)}${btn(nr,'#dc2626','✕ Didn\'t run',`prodPdNotRan(${k})`)}
        </div>
        ${nr?`<select class="fc" style="margin-top:5px;height:28px;font-size:12px;${x.rec.notRun?'':'border-color:#dc2626'}" onclick="event.stopPropagation()" onchange="prodPdReason(${k},this.value)">${prodOpts(PROD_NOT_RUN,x.rec.notRun,{blank:'— reason —'})}</select>`:''}
      </div>`; }).join('')}
  </div>`).join('');
}
// none | picking (didn't run, no reason yet) | notrun | ran-empty (ran, nothing entered) | ran
function prodSheetState(x){
  if(x.rec.notRun) return 'notrun';
  if(x.picking) return 'picking';
  const t=prodCalc(x.rec,x.ctx).t;
  if(t.shots>0||t.downtime>0||t.noPlanMin>0) return 'ran';
  return x.ran? 'ran-empty' : 'none';
}
function prodPdRan(k){ const x=window._pd.sheets[k]; delete x.rec.notRun; x.picking=false; x.ran=true; prodPdTab(k); }
function prodPdNotRan(k){ const x=window._pd.sheets[k]; x.ran=false; if(!x.rec.notRun) x.picking=true; prodPdTab(k); }
function prodPdReason(k,v){ const x=window._pd.sheets[k]; if(v){ x.rec.notRun=v; x.picking=false; } else { delete x.rec.notRun; x.picking=true; } prodPdTab(k); }

// New entry: continue with whatever part (and cavities) was running at the
// end of the previous shift on the same machine.
function prodCarryOver(rec,all,ctx){
  const key=s=>s.date+(s.shift==='B'?'2':'1');
  const prev=all.filter(s=>String(s.machineId)===String(rec.machineId)&&key(s)<key(rec)&&!s.notRun&&s.runs?.length).sort((a,b)=>key(b).localeCompare(key(a)))[0];
  if(!prev?.runs?.length){ rec.runs=[prodNewRun(ctx,ctx.parts[0])]; return; }
  const last=prev.runs[prev.runs.length-1], p=ctx.partById[last.partId];
  rec.runs=[{...prodNewRun(ctx,p,prodN(last.cavities)), grade:last.grade||p?.grade||''}];
}

function prodPsRender(){
  const {rec,ctx,names}=window._ps, pd=window._pd;
  const row=(label,control)=>`<div class="fg"><label class="lbl">${label}</label>${control}</div>`;
  const m=ctx.machineById[rec.machineId];
  setC(`
  <div class="ph"><h2>🏭 Day Production Entry</h2>
    <button class="btn btn-o" onclick="prodPdCancel()">← Back</button></div>
  <datalist id="ps-names">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
  <div style="max-width:1180px">
  <div class="card"><div class="cb" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <div class="fg" style="margin:0"><label class="lbl">Date *</label>
      <input class="fc" type="date" value="${esc(pd.date)}" onchange="prodPdDate(this.value)" style="width:170px"></div>
    <div style="display:flex;flex-direction:column;gap:6px" id="pd-tabs">${prodPdTabsHtml()}</div>
  </div></div>
  <div class="card"><div class="ch"><h5>1 · ${esc(PROD_SHIFTS[rec.shift]?.label||'Shift '+rec.shift)} · ${esc(m?`${m.code} — ${m.name||''}`:'')}</h5>
    </div>
    ${rec.notRun||window._ps.picking?`<div class="cb">
      <div class="alert al-w" style="margin:0 0 12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <b>⛔ Did not run this shift</b>
        <span>Reason *</span><select class="fc" style="width:auto" onchange="prodPdReason(window._pd.active,this.value)">${prodOpts(PROD_NOT_RUN,rec.notRun,{blank:'— select reason —'})}</select>
        <span style="font-size:12px">${!rec.notRun?'Pick why — "No Plan" doesn\'t count against OEE; any other reason counts the whole shift as downtime.':rec.notRun==='No Plan'?'No work was planned — not counted against OEE.':`The whole shift (${prodFmt(prodN(rec.plannedMinutes)||prodN(ctx.cfg.plannedMinutes)||720)} min) counts as downtime: ${esc(rec.notRun)}.`}</span>
      </div>
      <div class="fg" style="margin:0"><label class="lbl">Remarks</label>
        <input class="fc" value="${esc(rec.remarks)}" oninput="prodPsHead('remarks',this.value)" placeholder="e.g. hydraulic pump failure, waiting for spare"></div>
    </div></div>`:`
    <div class="cb" style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;max-width:760px">
    ${row('Planned time (min)',`<input class="fc" type="number" min="0" value="${esc(rec.plannedMinutes)}" oninput="prodPsHead('plannedMinutes',this.value)" title="12 h = 720. Reduce for planned breaks if you don't want them to count as downtime.">`)}
    ${row('Operator 1',`<input class="fc" list="ps-names" value="${esc(rec.operator1)}" oninput="prodPsHead('operator1',this.value)">`)}
    ${row('Operator 2',`<input class="fc" list="ps-names" value="${esc(rec.operator2)}" oninput="prodPsHead('operator2',this.value)">`)}
    ${row('Supervisor / Handover to',`<input class="fc" list="ps-names" value="${esc(rec.supervisor)}" oninput="prodPsHead('supervisor',this.value)">`)}
    ${row('Die coat used (L)',`<input class="fc" type="number" min="0" step="0.1" value="${esc(rec.dieCoatL)}" oninput="prodPsHead('dieCoatL',this.value)">`)}
  </div></div>
  <div class="card"><div class="ch"><h5>2 · Production (shift total)</h5>
    <button class="btn btn-o btn-sm" onclick="prodPsAddRun()">➕ Add line — part change / cavity down</button></div>
    <div class="cb" id="ps-runs"></div></div>
  <div class="card"><div class="ch"><h5>3 · Rejections (shift total, pcs)</h5>
    <span style="font-size:11px;color:#6b7280">Enter rejected parts by type for the whole shift — OK parts and Rej % are calculated.</span></div>
    <div class="tw" id="ps-rej"></div></div>
  <div class="card"><div class="ch"><h5>4 · Downtime / breakdown</h5>
    <div style="display:flex;gap:6px"><button class="btn btn-o btn-sm" onclick="prodPsPlanDone()" title="Plan finished before the shift ended — the rest of the shift isn't counted against OEE">✅ Plan completed early</button>
    <button class="btn btn-o btn-sm" onclick="prodPsAddDown()">➕ Add downtime</button></div></div>
    <div class="cb" id="ps-down"></div></div>
  <div class="card"><div class="cb"><div class="fg" style="margin:0"><label class="lbl">Remarks</label>
    <input class="fc" value="${esc(rec.remarks)}" oninput="prodPsHead('remarks',this.value)"></div></div></div>
  <div id="ps-sum"></div>`}
  <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;margin:4px 0 30px">
    <span style="font-size:11.5px;color:#6b7280;margin-right:auto">Every machine / shift must be marked ✓ Ran (with production) or ✕ Didn't run (with a reason) before the day can be saved.</span>
    <button class="btn btn-o" onclick="prodPdCancel()">Cancel</button>
    <button class="btn btn-o" onclick="prodPsSave(true)">💾 Save &amp; Next Day</button>
    <button class="btn btn-p" onclick="prodPsSave(false)">💾 Save Day</button>
  </div>
  </div>`);
  if(!rec.notRun&&!window._ps.picking){ prodPsRenderRuns(); prodPsRenderRej(); prodPsRenderDown(); }
  prodPsRefresh();
}

function prodPsRenderRuns(){
  const {rec,ctx}=window._ps;
  const num=(i,k,v,extra='')=>`<input class="fc mono" style="text-align:right" type="number" min="0" inputmode="numeric" value="${esc(v??'')}" oninput="prodPsRun(${i},'${k}',this.value)" ${extra}>`;
  const r='text-align:right';
  document.getElementById('ps-runs').innerHTML=`<table>
    <thead><tr><th>Part *</th><th style="width:130px">Grade</th><th style="width:80px;${r}">Cavities</th><th style="width:110px;${r}">Total shots</th><th style="width:100px;${r}" title="Warm-up / trial shots scrapped">Off shots</th><th style="width:90px;${r}" title="(Total − off shots) × cavities">Pcs cast</th><th>Target CT · metal per part</th><th style="width:40px"></th></tr></thead>
    <tbody>${rec.runs.map((x,i)=>{ const p=ctx.partById[x.partId], ct=prodCT(p,rec.machineId);
      return `<tr>
      <td><select class="fc" onchange="prodPsRunPart(${i},this.value)">${prodOpts(ctx.parts.filter(y=>y.active!==false||String(y.id)===String(x.partId)),x.partId,{val:y=>y.id,label:prodPartLabel,blank:'— select part —'})}</select></td>
      <td><select class="fc" onchange="prodPsRun(${i},'grade',this.value)">${prodOpts([...new Set([...ctx.grades,x.grade].filter(Boolean))],x.grade,{blank:'—'})}</select></td>
      <td>${num(i,'cavities',x.cavities,`min="1" id="ps-cv-${i}"`)}</td>
      <td>${num(i,'shots',x.shots)}</td>
      <td>${num(i,'offShots',x.offShots)}</td>
      <td class="mono" style="${r}" id="ps-rc-${i}"></td>
      <td style="font-size:12px">${p?`${ct?ct+' s/shot':'<span style="color:#d97706">CT not set</span>'} · ${prodN(p.netWeightKg)?`${prodFmt(p.netWeightKg,3)} kg net → <b>${prodFmt(prodMetalPerPc(p.netWeightKg,ctx.cfg),3)} kg metal/pc</b>`:'<span style="color:#d97706">weight not set</span>'}`:''}</td>
      <td>${rec.runs.length>1?`<button class="btn btn-r btn-xs" title="Remove" onclick="prodPsDelRun(${i})">✕</button>`:''}</td></tr>`;}).join('')}
    </tbody>
    ${rec.runs.length>1?`<tfoot><tr style="font-weight:700;background:#f6f8fc"><td colspan="3">TOTAL</td>
      <td class="mono" style="${r}" id="ps-rts"></td><td class="mono" style="${r}" id="ps-rtf"></td><td class="mono" style="${r}" id="ps-rtc2"></td><td colspan="2"></td></tr></tfoot>`:''}
    </table>
    <div style="font-size:11px;color:#6b7280;margin-top:8px">Part changed or a cavity broke mid-shift? Add a line — for a cavity down, keep the same part, lower the cavities and enter the shots made after it. Running with a cavity down counts as a Performance loss.</div>
    ${ctx.parts.length?'':`<div class="alert al-w" style="margin-top:8px"><span>No parts in the Part Master yet. <a href="#" onclick="event.preventDefault();nav('prod-parts')">Add parts →</a></span></div>`}`;
}

// One row per part run: rejected pcs by type, keyed as shift totals.
function prodPsRenderRej(){
  const {rec,ctx,codes}=window._ps;
  const others=ctx.defects.filter(d=>!codes.includes(d.code));
  const dname=c=>ctx.defectByCode[c]?.description||c;
  const multi=rec.runs.length>1;
  const r='text-align:right';
  document.getElementById('ps-rej').innerHTML=`<table>
    <thead><tr><th>Part</th><th style="${r};width:84px" title="(Shots − off shots) × cavities">Pcs cast</th>
      ${codes.map(c=>`<th style="${r};width:84px" title="${esc(dname(c))}">${esc(dname(c))}</th>`).join('')}
      <th style="${r};width:76px">Rejected</th><th style="${r};width:76px">OK pcs</th><th style="${r};width:64px">Rej %</th></tr></thead>
    <tbody>${rec.runs.map((x,i)=>{ const p=ctx.partById[x.partId];
      return `<tr>
      <td style="white-space:nowrap">${p?esc(prodPartLabel(p)):'<span style="color:#9ca3af">— select part —</span>'}${multi?`<div style="font-size:11px;color:#6b7280" id="ps-rl-${i}"></div>`:''}</td>
      <td class="mono" style="${r}" id="ps-rcr-${i}"></td>
      ${codes.map(c=>`<td><input class="fc mono" style="padding:5px 6px;text-align:right" type="number" min="0" inputmode="numeric" value="${esc(rec.runs[i].rej?.[c]??'')}" oninput="prodPsRunRej(${i},'${esc(c)}',this.value)"></td>`).join('')}
      <td class="mono" style="${r};color:#dc2626" id="ps-rr-${i}"></td>
      <td class="mono" style="${r};font-weight:700;color:#16a34a" id="ps-ro-${i}"></td>
      <td class="mono" style="${r}" id="ps-rp-${i}"></td></tr>`;}).join('')}
    </tbody>
    ${multi?`<tfoot><tr style="font-weight:700;background:#f6f8fc">
      <td>TOTAL</td><td class="mono" style="${r}" id="ps-rtc"></td>
      ${codes.map(c=>`<td class="mono" style="${r}" id="ps-rtd-${esc(c)}"></td>`).join('')}
      <td class="mono" style="${r};color:#dc2626" id="ps-rtr"></td><td class="mono" style="${r};color:#16a34a" id="ps-rto"></td><td class="mono" style="${r}" id="ps-rtp"></td></tr></tfoot>`:''}
  </table>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;gap:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:#6b7280">Pcs cast = (total − off shots) × cavities. OK pcs = pcs cast − rejected. Rej % = rejected ÷ pcs cast.</span>
    ${others.length?`<select class="fc" style="width:190px" onchange="if(this.value){window._ps.codes.push(this.value);prodPsRenderRej();prodPsRefresh();}"><option value="">+ add rejection type column…</option>${others.map(d=>`<option value="${esc(d.code)}">${esc(d.description)}</option>`).join('')}</select>`:''}
  </div>`;
}

function prodPsRenderDown(){
  const {rec}=window._ps;
  document.getElementById('ps-down').innerHTML=(rec.downtime.length?`<table>
    <thead><tr><th>Reason</th><th style="width:100px">Minutes</th><th>Remark</th><th style="width:40px"></th></tr></thead>
    <tbody>${rec.downtime.map((d,i)=>`<tr>
      <td><select class="fc" onchange="prodPsDown(${i},'category',this.value)">${prodOpts(PROD_DOWN_CATS,d.category)}</select></td>
      <td><input class="fc" type="number" min="0" value="${esc(d.minutes)}" oninput="prodPsDown(${i},'minutes',this.value)"></td>
      <td><input class="fc" value="${esc(d.remark||'')}" oninput="prodPsDown(${i},'remark',this.value,false)"></td>
      <td><button class="btn btn-r btn-xs" onclick="prodPsDelDown(${i})">✕</button></td></tr>`).join('')}
    </tbody></table>
    <div style="font-size:11px;color:#6b7280;margin-top:6px">"No Plan" and "Plan Completed" minutes are taken off planned time — they don't count against OEE.</div>`:`<div style="color:#9ca3af;font-size:12px">No downtime — machine ran the full planned time.</div>`);
}

function prodPsRefresh(){
  const {rec,ctx,codes}=window._ps;
  const c=prodCalc(rec,ctx), t=c.t;
  const set=(id,h)=>{ const e=document.getElementById(id); if(e) e.innerHTML=h; };
  // Per line: pcs cast, rejections, OK
  const good=r=>Math.max(0,r.castPcs-r.offPcs), rt={shots:0,off:0,cast:0,rej:0,ok:0,codes:{}};
  c.runs.forEach(r=>{
    const g=good(r), has=g||r.rejPcs||r.off;
    set(`ps-rc-${r._i}`, has? prodFmt(g) : ''); set(`ps-rcr-${r._i}`, has? prodFmt(g) : '');
    set(`ps-rl-${r._i}`, `line ${r._i+1} · ${prodFmt(r.cav)} cav`);
    const cv=document.getElementById(`ps-cv-${r._i}`), down=r.part&&r.cav<r.dieCav;       // cavity down: highlight
    if(cv){ cv.style.background=down?'#fef3c7':''; cv.title=down?`Die has ${r.dieCav} cavities — running with a cavity down`:''; }
    set(`ps-rr-${r._i}`, has? prodFmt(r.rejPcs) : '');
    set(`ps-ro-${r._i}`, has? prodFmt(r.okPcs) : '');
    set(`ps-rp-${r._i}`, g? `<span style="color:${prodTier(1-r.rejPcs/g,.97,.93)}">${prodPct(r.rejPcs/g)}</span>` : '');
    rt.shots+=r.shots; rt.off+=r.off; rt.cast+=g; rt.rej+=r.rejPcs; rt.ok+=r.okPcs;
    for(const [k,n] of Object.entries(r.rej)) rt.codes[k]=(rt.codes[k]||0)+n;
  });
  set('ps-rts',prodFmt(rt.shots)); set('ps-rtf',prodFmt(rt.off)); set('ps-rtc',prodFmt(rt.cast)); set('ps-rtc2',prodFmt(rt.cast)); set('ps-rtr',prodFmt(rt.rej)); set('ps-rto',prodFmt(rt.ok));
  set('ps-rtp',rt.cast?prodPct(rt.rej/rt.cast):'');
  codes.forEach(k=>set(`ps-rtd-${k}`,prodFmt(rt.codes[k]||0)));

  const warn=[];
  if(t.shotsNoCT) warn.push('Target cycle time missing for a part on this machine — Performance/OEE can\'t be calculated. Set it in Part Master.');
  if(t.shotsNoWt) warn.push('Net weight missing for a part — metal consumption understated.');
  if(c.runs.some(r=>!r.partId)) warn.push('Select a part.');
  if(rec.runs.some(r=>prodN(r.offShots)>prodN(r.shots))) warn.push('A line has more off shots than total shots.');
  if(c.runs.some(r=>r.rejPcs>Math.max(0,r.castPcs-r.offPcs))) warn.push('A part has more rejected pcs than pcs cast.');
  if(t.pRaw>1.02) warn.push(`Shots exceed target rate (${prodPct(t.pRaw,0)}) — check total shots, downtime or the target cycle time.`);
  set('pd-tabs',prodPdTabsHtml());

  const grades=Object.entries(c.byGrade).filter(([,g])=>g.castPcs>0);
  const cavs=new Set(c.runs.filter(r=>r.shots).map(r=>r.cav));
  const cavNote=cavs.size===1? `× ${[...cavs][0]} cav` : '';
  const tile=(l,v,col)=>`<div style="background:#f6f8fc;border-radius:8px;padding:10px 12px"><div style="font-size:20px;font-weight:700;${col?`color:${col}`:''}">${v}</div><div style="font-size:11px;color:#6b7280">${l}</div></div>`;
  const kv=(l,v)=>`<span>${l}</span><b class="mono" style="text-align:right">${v}</b>`;
  set('ps-sum',`<div class="card"><div class="ch"><h5>5 · Shift result</h5></div><div class="cb" style="font-size:12.5px">
    ${warn.map(w=>`<div class="alert al-w" style="font-size:12px;margin-bottom:6px">⚠️ ${w}</div>`).join('')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">
      ${tile('Total OK shots',prodFmt(t.okShots),'#16a34a')}
      ${tile(`OK parts ${cavNote}`,prodFmt(t.okPcs),'#16a34a')}
      ${tile('Rejection %',prodPct(t.rejPct),prodTier(1-t.rejPct,.97,.93))}
      ${tile('Rejection PPM',prodFmt(t.ppm))}
      ${tile('OEE',prodPct(t.oee),prodTier(t.oee,.75,.55))}
      ${tile('Availability',prodPct(t.A),prodTier(t.A,.85,.7))}
      ${tile('Performance',prodPct(t.P),prodTier(t.P,.9,.75))}
      ${tile('Quality',prodPct(t.Q),prodTier(t.Q,.97,.93))}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:3px 10px;align-content:start">
        ${kv('Target shots (run time ÷ CT)',t.tgtCT&&!t.shotsNoCT?prodFmt(Math.floor(t.runtime*60/t.tgtCT)):'—')}${kv('Actual shots',prodFmt(t.shots))}
        ${kv('OK shots',prodFmt(t.okShots))}${kv('Rejected shots (incl. off)',prodFmt(t.shots-t.okShots))}
        ${kv('Cycle time act / target',`${t.actCT?t.actCT.toFixed(1):'—'} / ${t.tgtCT?t.tgtCT.toFixed(1):'—'} s`)}
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:3px 10px;align-content:start">
        <span style="grid-column:span 2;font-weight:600;font-size:11px;color:#6b7280">WHERE THE ${prodFmt(t.planned)} PLANNED MIN WENT</span>
        ${t.noPlanMin?`<span style="grid-column:span 2;font-size:11px;color:#6b7280">${prodFmt(t.noPlanMin)} min not planned (No Plan / Plan Completed) — not counted</span>`:''}
        ${kv('Good parts',prodFmt(Math.max(0,t.idealMin-t.qualLossMin))+' min')}
        ${kv('Quality loss',prodFmt(t.qualLossMin)+' min')}
        ${kv('Speed loss',(t.shotsNoCT?'—':prodFmt(t.speedLossMin))+' min')}
        ${t.cavLossMin?kv('Cavity down',prodFmt(t.cavLossMin)+' min'):''}
        ${kv('Downtime',prodFmt(t.downtime)+' min')}
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:3px 10px;align-content:start">
        <span style="grid-column:span 2;font-weight:600;font-size:11px;color:#6b7280">METAL USED (net wt + ${prodFmt(ctx.cfg.meltLossPct,1)}% melting loss, per part)</span>
        ${c.runs.filter(r=>r.castPcs&&r.wt).map(r=>{ const pcs=r.netKg/r.wt;
          return `<span style="grid-column:span 2;font-size:11.5px;color:#374151">${esc(r.part?.partNumber||'')}: ${prodFmt(r.wt,3)} + ${prodFmt(ctx.cfg.meltLossPct,1)}% = <b>${prodFmt(prodMetalPerPc(r.wt,ctx.cfg),3)} kg/pc</b> × ${prodFmt(pcs)} pcs</span>`; }).join('')}
        ${grades.length?grades.map(([g,v])=>kv(esc(g),`${prodFmt(v.totalKg,1)} kg`)).join(''):'<span style="color:#9ca3af">—</span>'}
        ${grades.length?`<span style="grid-column:span 2;font-size:11px;color:#6b7280">of which melting loss ${prodFmt(t.lossKg,1)} kg</span>`:''}
      </div>
    </div>
  </div></div>`);
}

// ── state setters ────────────────────────────────────
function prodPsHead(k,v){ window._ps.rec[k]=v; prodPsRefresh(); }
// Plan finished before the shift ended: the rest of the shift isn't planned time
function prodPsPlanDone(){ window._ps.rec.downtime.push({category:'Plan Completed',minutes:'',remark:''}); prodPsRenderDown(); prodPsRefresh(); }
function prodPsRunRej(i,code,v){ const r=window._ps.rec.runs[i]; r.rej=r.rej||{}; r.rej[code]=v; prodPsRefresh(); }
function prodPsRun(i,k,v,rerender=false){ window._ps.rec.runs[i][k]=v; if(rerender){ prodPsRenderRuns(); prodPsRenderRej(); } prodPsRefresh(); }
function prodPsRunPart(i,pid){
  const {rec,ctx}=window._ps, p=ctx.partById[pid];
  Object.assign(rec.runs[i],{partId:pid?+pid:'', grade:p?.grade||rec.runs[i].grade, cavities:prodN(p?.cavities)||rec.runs[i].cavities||1});
  prodPsRenderRuns(); prodPsRenderRej(); prodPsRefresh();
}
// New line: same part with one cavity fewer (the usual "cavity down" case);
// picking another part resets it to that part's cavities.
function prodPsAddRun(){
  const {rec,ctx}=window._ps, last=rec.runs[rec.runs.length-1];
  rec.runs.push({...prodNewRun(ctx,ctx.partById[last.partId],Math.max(1,prodN(last.cavities)-1)), grade:last.grade});
  prodPsRenderRuns(); prodPsRenderRej(); prodPsRefresh();
}
function prodPsDelRun(i){
  const rec=window._ps.rec; rec.runs.splice(i,1);
  prodPsRenderRuns(); prodPsRenderRej(); prodPsRefresh();
}
function prodPsAddDown(){ window._ps.rec.downtime.push({category:PROD_DOWN_CATS[0],minutes:'',remark:''}); prodPsRenderDown(); prodPsRefresh(); }
function prodPsDown(i,k,v,refresh=true){ window._ps.rec.downtime[i][k]=v; if(refresh) prodPsRefresh(); }
function prodPsDelDown(i){ window._ps.rec.downtime.splice(i,1); prodPsRenderDown(); prodPsRefresh(); }

// Check one tab; returns an error message or ''
function prodSheetError(x){
  const {rec,ctx}=x;
  if(rec.notRun) return '';
  if(rec.runs.some(r=>!r.partId)) return 'select a part';
  const c=prodCalc(rec,ctx);
  const offRun=c.runs.find(r=>prodN(r.offShots)>r.shots);
  if(offRun) return `${offRun.part?.partNumber||'a part'}: off shots are more than total shots`;
  const badRun=c.runs.find(r=>r.rejPcs>Math.max(0,r.castPcs-r.offPcs));
  if(badRun) return `${badRun.part?.partNumber||'a part'}: rejected pcs are more than pcs cast`;
  return '';
}
function prodSheetClean(x){
  const {rec,ctx}=x;
  const numOrBlank=v=>v===''||v==null?'':prodN(v);
  if(rec.notRun) return {
    date:rec.date, shift:rec.shift, machineId:+rec.machineId, notRun:rec.notRun,
    operator1:'', operator2:'', supervisor:'',
    plannedMinutes:prodN(rec.plannedMinutes)||prodN(ctx.cfg.plannedMinutes)||720, dieCoatL:'',
    runs:[], downtime:[], remarks:(rec.remarks||'').trim(),
    updatedAt:new Date().toISOString(), updatedBy:Auth.user?.name||'',
  };
  return {
    date:rec.date, shift:rec.shift, machineId:+rec.machineId,
    operator1:(rec.operator1||'').trim(), operator2:(rec.operator2||'').trim(), supervisor:(rec.supervisor||'').trim(),
    plannedMinutes:prodN(rec.plannedMinutes)||prodN(ctx.cfg.plannedMinutes)||720,
    dieCoatL:numOrBlank(rec.dieCoatL),
    runs:rec.runs.map(r=>{
      const run={partId:+r.partId, grade:r.grade||ctx.partById[r.partId]?.grade||'', cavities:prodN(r.cavities)||prodN(ctx.partById[r.partId]?.cavities)||1, shots:prodN(r.shots)};
      if(prodN(r.offShots)) run.offShots=prodN(r.offShots);                          // shift total, shots
      const rej={}; for(const [k,v] of Object.entries(r.rej||{})) if(prodN(v)>0) rej[k]=prodN(v);
      if(Object.keys(rej).length) run.rej=rej;                                        // shift total, pcs
      return run;
    }),
    downtime:rec.downtime.filter(d=>prodN(d.minutes)>0).map(d=>({category:d.category, minutes:prodN(d.minutes), remark:(d.remark||'').trim()})),
    remarks:(rec.remarks||'').trim(),
    updatedAt:new Date().toISOString(), updatedBy:Auth.user?.name||'',
  };
}
// Save every changed tab of the day (untouched blank tabs are skipped)
async function prodPsSave(next){
  const pd=window._pd, todo=pd.sheets.filter(prodSheetDirty);
  // The whole day must be accounted for: every machine / shift ran (with production) or didn't (with a reason)
  const why={none:'mark ✓ Ran or ✕ Didn\'t run', picking:'pick why it didn\'t run', 'ran-empty':'enter production or downtime'};
  const open=pd.sheets.filter(x=>why[prodSheetState(x)]);
  if(open.length){
    const x=open[0];
    prodPdTab(pd.sheets.indexOf(x));
    toast(`Day not complete — ${prodSheetLabel(x)}: ${why[prodSheetState(x)]}${open.length>1?` (+${open.length-1} more)`:''}`,'d');
    return;
  }
  for(const x of todo){
    const err=prodSheetError(x);
    if(err){ prodPdTab(pd.sheets.indexOf(x)); toast(`${prodSheetLabel(x)}: ${err}`,'d'); return; }
  }
  let saved=0;
  for(const x of todo){
    const clean=prodSheetClean(x);
    let ok;
    if(x.id) ok=await db.prodShifts.update(x.id,clean);
    else { clean.createdAt=clean.updatedAt; clean.createdBy=clean.updatedBy; ok=await db.prodShifts.add(clean); if(ok) x.id=ok; }
    if(!ok){
      prodPdTab(pd.sheets.indexOf(x));
      toast(`${prodSheetLabel(x)}: save failed — check your connection and try again${saved?` (${saved} other tab${saved>1?'s':''} saved)`:''}`,'d');
      return;
    }
    x.orig=JSON.stringify(x.rec); saved++;
  }
  toast(saved?`✅ ${saved} shift entr${saved>1?'ies':'y'} saved`:'Nothing to save — no tab was changed', saved?'s':'w');
  if(next){ const a=pd.sheets[pd.active].rec; prodOpenDay(prodAddDays(pd.date,1),{shift:'A',machineId:a.machineId}); }
  else if(saved) prodRenderShifts();
}

// ══════════════════════════════════════════════════════
//  3. PRODUCTION REPORTS — one page, three tabs (OEE & Losses,
//     Rejection, Material) sharing one filter bar. Filters and the
//     open tab are kept while you move between tabs.
// ══════════════════════════════════════════════════════
const PROD_REPORT_TABS=[
  {k:'gemba', l:'🚶 Yesterday'},
  {k:'viz', l:'📈 Charts'},
  {k:'oee', l:'OEE & Losses'},
  {k:'rej', l:'Rejection'},
  {k:'mat', l:'Material'},
  {k:'fet',  l:'Fettling'},
  {k:'cust', l:'Customer Mix'},
  {k:'cap',  l:'Capacity'},
];
const PROD_PERIODS=[
  {k:'today', l:'Today',      range:()=>[prodToday(),prodToday()]},
  {k:'yday',  l:'Yesterday',  range:()=>[prodDaysAgo(1),prodDaysAgo(1)]},
  {k:'7d',    l:'7 days',     range:()=>[prodDaysAgo(6),prodToday()]},
  {k:'30d',   l:'30 days',    range:()=>[prodDaysAgo(29),prodToday()]},
  {k:'month', l:'This month', range:()=>[prodToday().slice(0,8)+'01',prodToday()]},
];
const _prodRep={tab:'oee', gembaDate:'', f:{period:'7d', from:prodDaysAgo(6), to:prodToday(), machineId:'', shift:'', partId:'', person:'', off:false, basis:'pcs'}};

const PROD_REPORT_CSS=`<style>
.pr-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.pr-tabs{display:inline-flex;background:#e6ebf5;border-radius:10px;padding:3px;gap:2px}
.pr-tab{border:none;background:none;padding:7px 18px;border-radius:8px;font:600 13px 'Inter',sans-serif;color:#5b6475;cursor:pointer}
.pr-tab:hover{color:var(--navy)}
.pr-tab.on{background:#fff;color:var(--navy);box-shadow:0 1px 3px rgba(13,47,110,.15)}
.pr-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:14px}
.pr-filters select,.pr-filters input{height:32px;border:1px solid var(--border);border-radius:7px;padding:0 8px;font:13px 'Inter',sans-serif;background:#fff;color:#1a1a2e}
.pr-chip{border:1px solid transparent;background:none;padding:5px 11px;border-radius:7px;font:500 12.5px 'Inter',sans-serif;color:#5b6475;cursor:pointer}
.pr-chip:hover{background:#f0f3f9}
.pr-chip.on{background:#edf1fb;border-color:#c9d4ee;color:var(--navy);font-weight:600}
.pr-sep{width:1px;height:22px;background:var(--border);margin:0 4px}
.pr-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.pr-kpi{background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.pr-kpi .l{font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#6b7280}
.pr-kpi .v{font-size:26px;font-weight:700;color:var(--navy);line-height:1.2;margin-top:4px}
.pr-kpi .s{font-size:12px;color:#6b7280;margin-top:2px}
.pr-card{background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:14px;overflow:hidden}
.pr-card>.h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:12px 16px 4px}
.pr-card>.h b{font-size:13.5px;color:var(--navy)}
.pr-card>.h span{font-size:12px;color:#6b7280}
.pr-card>.b{padding:10px 16px 14px}
.pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pr-grid>.pr-card{margin-bottom:0}
.pr-grid+.pr-card,.pr-grid+.pr-grid{margin-top:14px}
.pr-tbl th{background:none;color:#6b7280;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;border-bottom:1px solid var(--border);padding:6px 10px}
.pr-tbl td{padding:8px 10px;font-size:12.5px;border-bottom:1px solid #eef1f7}
.pr-tbl td.n,.pr-tbl th.n{text-align:right;font-variant-numeric:tabular-nums}
.pr-tbl tr.grp td{border-top:1px solid var(--border)}
.pr-note{font-size:11.5px;color:#6b7280;padding:0 16px 12px}
.pr-warn{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 12px;margin-bottom:12px}
.pr-empty{color:#9ca3af;text-align:center;padding:22px;font-size:12.5px}
.pr-dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:0}
.pr-viz{position:relative}
.pr-viz svg{display:block;width:100%;height:auto;overflow:visible}
.pr-viz text{font:11px 'Inter',sans-serif;fill:#6b7280}
.pr-viz [data-tip]{cursor:default}
.pr-viz .hit:hover{fill:rgba(13,47,110,.06)}
.pr-legend{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:#374151;margin-top:8px}
.pr-legend b{font-variant-numeric:tabular-nums}
.pr-donut{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.pr-donut svg{width:170px;flex:none}
.pr-donut .pr-legend{flex-direction:column;flex:1;min-width:180px;margin:0}
.pr-donut .pr-legend div{display:flex;justify-content:space-between;gap:10px}
.pr-sec{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6b7280;margin:18px 2px 8px}
.pr-delta{font-size:12px;margin-top:3px;font-variant-numeric:tabular-nums}
.pr-heat{border-collapse:separate;border-spacing:2px;width:100%}
.pr-heat td,.pr-heat th{text-align:center;font-size:11px;padding:6px 2px;border-radius:4px;font-variant-numeric:tabular-nums}
.pr-heat th{color:#6b7280;font-weight:500;background:none}
.pr-heat td.m{text-align:left;font-weight:600;color:#374151;padding-right:8px;white-space:nowrap}
.pr-cmp{display:grid;grid-template-columns:130px 1fr;gap:6px 12px;align-items:center;font-size:12px}
.pr-cmp .bar{height:14px;border-radius:0 4px 4px 0}
.pr-print-only{display:none}
@media print{
  @page{size:A4;margin:12mm}
  .sidebar,.topbar,.pr-filters,.pr-noprint,#pr-tip,.pr-tabs{display:none!important}
  .main{margin-left:0!important}.content{padding:0!important}
  body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pr-print-only{display:block;font-size:12px;color:#374151;margin:-4px 0 10px}
  .pr-card,.pr-kpi,.pr-grid>*{break-inside:avoid;box-shadow:none}
  .pr-grid{grid-template-columns:1fr 1fr!important}
  .pr-kpis{grid-template-columns:repeat(4,1fr)!important}
  /* one chart only: everything off the path to the chosen card is hidden */
  body.pr-one .pr-path>:not(.pr-path):not(.pr-print-card){display:none!important}
  body.pr-one .pr-path{display:block!important;margin:0!important;padding:0!important}
  body.pr-one .pr-print-card{border:none!important;margin:0!important;width:100%!important}
  body.pr-one .pr-print-card .b{padding:6px 0 0!important}
  body.pr-one .pr-print-card>.h{padding:0 0 4px!important}
  body.pr-one .pr-print-card>.h b{font-size:16px!important}
}
.pr-card>.h .r{display:flex;align-items:baseline;gap:8px}
.pr-cardprint{border:1px solid transparent;background:none;border-radius:6px;padding:1px 6px;font-size:12px;color:#9ca3af;cursor:pointer;line-height:1.4}
.pr-card:hover .pr-cardprint{color:#6b7280;border-color:var(--border)}
.pr-cardprint:hover{background:#f0f3f9;color:var(--navy)!important}
.pr-pmenu{position:absolute;z-index:1000;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 6px 18px rgba(13,47,110,.15);padding:4px;min-width:170px}
.pr-pmenu div{font-size:10.5px;font-weight:700;letter-spacing:.5px;color:#9ca3af;padding:5px 8px 2px}
.pr-pmenu button{display:block;width:100%;text-align:left;border:none;background:none;padding:6px 10px;border-radius:6px;font:13px 'Inter',sans-serif;color:#1a1a2e;cursor:pointer}
.pr-pmenu button:hover{background:#edf1fb;color:var(--navy)}
.pr-card-ctx{display:none}
@media print{ body.pr-one .pr-card-ctx{display:block;font-size:11px;color:#6b7280;margin:0 0 8px} }
#pr-tip{position:fixed;z-index:999;pointer-events:none;background:#0b1b3a;color:#fff;font:12px/1.45 'Inter',sans-serif;padding:7px 10px;border-radius:7px;box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:pre;display:none}
@media (max-width:1000px){.pr-kpis{grid-template-columns:repeat(2,1fr)}.pr-grid{grid-template-columns:1fr}}
</style>`;

function prodKpi(label,value,sub='',color=''){
  return `<div class="pr-kpi"><div class="l">${label}</div><div class="v" ${color?`style="color:${color}"`:''}>${value}</div>${sub?`<div class="s">${sub}</div>`:''}</div>`;
}
function prodCard(title,body,right=''){
  return `<div class="pr-card"><div class="h"><b>${title}</b><span class="r">${right?`<span>${right}</span>`:''}<button class="pr-cardprint pr-noprint" title="Print this chart (A4 / A5)" onclick="prodCardPrintMenu(this,event)">🖨</button></span></div>${body}</div>`;
}
// ── Print one card ───────────────────────────────────
const PROD_PAGE_SIZES=[['A4 landscape','A4 landscape'],['A4 portrait','A4 portrait'],['A5 landscape','A5 landscape'],['A5 portrait','A5 portrait']];
function prodCardPrintMenu(btn,e){
  e.stopPropagation();
  const old=document.querySelector('.pr-pmenu'); if(old){ old.remove(); if(old._btn===btn) return; }
  const m=document.createElement('div'); m.className='pr-pmenu'; m._btn=btn;
  m.innerHTML=`<div>PRINT THIS CHART ON</div>${PROD_PAGE_SIZES.map(([k,l])=>`<button data-size="${k}">${l}</button>`).join('')}`;
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect();
  m.style.top=(window.scrollY+r.bottom+4)+'px';
  m.style.left=Math.max(8,window.scrollX+r.right-m.offsetWidth)+'px';
  m.onclick=ev=>{ const b=ev.target.closest('button[data-size]'); if(!b) return; m.remove(); prodPrintCard(btn.closest('.pr-card'),b.dataset.size); };
  setTimeout(()=>document.addEventListener('click',function close(ev){ if(!m.contains(ev.target)){ m.remove(); document.removeEventListener('click',close); } }),0);
}
function prodPrintCard(card,size){
  if(!card) return;
  // Keep only the path from <body> down to this card; add the report / filter line on top
  const path=[]; for(let el=card.parentElement; el&&el!==document.documentElement; el=el.parentElement){ el.classList.add('pr-path'); path.push(el); }
  card.classList.add('pr-print-card');
  const ctxLine=document.querySelector('.pr-print-only')?.textContent||'';
  const ctx=document.createElement('div'); ctx.className='pr-card-ctx'; ctx.textContent=ctxLine; card.prepend(ctx);
  const page=document.createElement('style'); page.id='pr-page-size';
  page.textContent=`@media print{@page{size:${size};margin:${size.startsWith('A5')?'8mm':'10mm'}}}`;
  document.body.appendChild(page);      // after the report's own @page rule, so this size wins
  document.body.classList.add('pr-one');
  let done=false;
  const cleanup=()=>{ if(done) return; done=true;
    document.body.classList.remove('pr-one'); card.classList.remove('pr-print-card'); ctx.remove(); page.remove();
    path.forEach(el=>el.classList.remove('pr-path')); window.removeEventListener('afterprint',cleanup); };
  window.addEventListener('afterprint',cleanup);
  window.print();
  setTimeout(cleanup,1500);     // browsers that don't fire afterprint
}

// ── Charts (inline SVG) ──────────────────────────────
// Categorical colours in fixed order (validated for colour-blind separation);
// "Other" and downtime are neutral grey. Every chart has a legend or labels
// with values, and a hover tooltip on each mark.
const PROD_VIZ_CAT=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300'];
const PROD_VIZ_GRAY='#a8adb7', PROD_VIZ_GRID='#eef1f7';
function prodTip(text){ return `data-tip="${esc(text)}"`; }
// One shared tooltip for every chart: follows the mouse over any [data-tip]
function prodVizTipInit(){
  if(window._prodTipOn) return; window._prodTipOn=true;
  const tip=()=>document.getElementById('pr-tip')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'pr-tip'}));
  document.addEventListener('mousemove',e=>{
    const el=e.target.closest?.('.pr-viz [data-tip]'), t=tip();
    if(!el){ t.style.display='none'; return; }
    t.textContent=el.getAttribute('data-tip'); t.style.display='block';
    const w=t.offsetWidth, h=t.offsetHeight;
    t.style.left=Math.min(window.innerWidth-w-8,e.clientX+14)+'px';
    t.style.top=(e.clientY-h-12<4? e.clientY+16 : e.clientY-h-12)+'px';
  });
}
// Axis top rounded so the 4 gridlines land on round numbers (whole numbers for counts)
function prodNiceMax(v,int=false){
  if(!(v>0)) return int?4:1;
  const raw=v/4, p=10**Math.floor(Math.log10(raw)), n=raw/p;
  let step=(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;
  if(int) step=Math.max(1,Math.ceil(step));
  return step*4;
}
function prodDayLabel(d){ const [y,m,dd]=d.split('-'); return `${+dd} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]}`; }
// Axis titles: y runs up the left side, x sits under the axis labels
const PROD_VIZ_BELOW='#dc2626';      // "below target" (status red, always with a legend label)
function prodAxisTitles(W,h,L,T,ph,xTitle,yTitle){
  return (yTitle?`<text x="12" y="${T+ph/2}" text-anchor="middle" transform="rotate(-90 12 ${T+ph/2})" style="font-weight:600;fill:#374151">${esc(yTitle)}</text>`:'')
    +(xTitle?`<text x="${L+(W-L-10)/2}" y="${h-4}" text-anchor="middle" style="font-weight:600;fill:#374151">${esc(xTitle)}</text>`:'');
}
// Columns over categories (x). series: [{name,color,values[]}], stacked when >1.
// colorOf(i,v): optional per-column colour (single series), e.g. red below target.
// ref: optional {value,label} dashed reference line. tips[i]: tooltip for column i.
// grouped: series side by side instead of stacked.
function prodColumns(xs,series,{fmt=prodFmt,ref=null,tips=[],yMax=null,h=210,int=false,xTitle='',yTitle='',colorOf=null,extraLegend='',W=640,grouped=false}={}){
  const L=yTitle?62:46, R=10, T=12, B=xTitle?42:26; h+=xTitle?16:0; const ph=h-T-B, pw=W-L-R;
  const tot=xs.map((_,i)=>grouped? Math.max(0,...series.map(x=>x.values[i]||0)) : series.reduce((s,x)=>s+(x.values[i]||0),0));
  const max=yMax??prodNiceMax(Math.max(...tot,ref?.value||0),int);
  const y=v=>T+ph-(v/max)*ph, bw=pw/Math.max(1,xs.length), cw=Math.max(2,Math.min(38,bw*.62));
  const every=Math.ceil(xs.length/10);
  let g='';
  for(let k=0;k<=4;k++){ const v=max*k/4; g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${PROD_VIZ_GRID}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`; }
  xs.forEach((lab,i)=>{
    const cx=L+bw*i+bw/2; let base=0, bars='';
    if(grouped){ const n=series.length, gw=Math.min(22,(bw*.72-(n-1)*2)/n);
      series.forEach((sr,j)=>{ const v=sr.values[i]||0; if(v<=0) return;
        const bx=cx-(n*gw+(n-1)*2)/2+j*(gw+2), y1=y(v), hh=Math.max(0,y(0)-y1), r=Math.min(4,gw/2,hh);
        bars+=`<path d="M${bx},${y(0)} V${y1+r} q0,-${r} ${r},-${r} H${bx+gw-r} q${r},0 ${r},${r} V${y(0)} Z" fill="${sr.color}"/>`; });
    } else
    series.forEach((sr,j)=>{ const v=sr.values[i]||0; if(v<=0) return;
      const y0=y(base), y1=y(base+v), top=j===series.length-1||series.slice(j+1).every(x=>!(x.values[i]>0));
      const hh=Math.max(0,y0-y1-(base>0?2:0));      // 2px surface gap between stacked segments
      const r=top?Math.min(4,cw/2,hh):0;
      const col=colorOf? colorOf(i,v)||sr.color : sr.color;
      bars+=r? `<path d="M${cx-cw/2},${y1+hh} V${y1+r} q0,-${r} ${r},-${r} H${cx+cw/2-r} q${r},0 ${r},${r} V${y1+hh} Z" fill="${col}"/>`
             : `<rect x="${cx-cw/2}" y="${y1}" width="${cw}" height="${hh}" fill="${col}"/>`;
      base+=v; });
    g+=bars+`<rect class="hit" x="${L+bw*i}" y="${T}" width="${bw}" height="${ph}" fill="transparent" ${prodTip(tips[i]||`${lab}: ${fmt(tot[i])}`)}/>`;
    if(i%every===0) g+=`<text x="${cx}" y="${T+ph+16}" text-anchor="middle">${esc(lab)}</text>`;
  });
  if(ref) g+=`<line x1="${L}" x2="${W-R}" y1="${y(ref.value)}" y2="${y(ref.value)}" stroke="#374151" stroke-dasharray="4 4" stroke-width="1.2" pointer-events="none"/>`;
  g+=`<line x1="${L}" x2="${W-R}" y1="${T+ph}" y2="${T+ph}" stroke="#cbd2e0"/>`+prodAxisTitles(W,h,L,T,ph,xTitle,yTitle);
  const refKey=ref?`<span><svg width="18" height="8" style="display:inline;width:18px;vertical-align:1px;margin-right:6px"><line x1="0" x2="18" y1="4" y2="4" stroke="#374151" stroke-dasharray="4 3" stroke-width="1.5"/></svg>${esc(ref.label)}</span>`:'';
  const legend=series.length>1||extraLegend||ref?`<div class="pr-legend">${series.length>1?series.map(sr=>`<span><span class="pr-dot" style="background:${sr.color}"></span>${esc(sr.name)}</span>`).join(''):''}${extraLegend}${refKey}</div>`:'';
  return `<div class="pr-viz"><svg viewBox="0 0 ${W} ${h}">${g}</svg>${legend}</div>`;
}
// Line over categories with markers; null values leave a gap.
// below: optional threshold — points under it are drawn red ("below target").
function prodLine(xs,values,{fmt=v=>prodPct(v,0),ref=null,tips=[],yMax=null,color=PROD_VIZ_CAT[0],h=210,name='',xTitle='',yTitle='',below=null,W=640}={}){
  const L=yTitle?62:46, R=10, T=12, B=xTitle?42:26; h+=xTitle?16:0; const ph=h-T-B, pw=W-L-R;
  const max=yMax??prodNiceMax(Math.max(...values.filter(v=>v!=null),ref?.value||0));
  const y=v=>T+ph-(v/max)*ph, bw=pw/Math.max(1,xs.length), x=i=>L+bw*i+bw/2;
  const every=Math.ceil(xs.length/10);
  let g='';
  for(let k=0;k<=4;k++){ const v=max*k/4; g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${PROD_VIZ_GRID}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`; }
  if(ref) g+=`<line x1="${L}" x2="${W-R}" y1="${y(ref.value)}" y2="${y(ref.value)}" stroke="#374151" stroke-dasharray="4 4" stroke-width="1.2"/>`;
  let d='', pen=false;
  values.forEach((v,i)=>{ if(v==null){ pen=false; return; } d+=`${pen?'L':'M'}${x(i)},${y(Math.min(v,max))} `; pen=true; });
  g+=`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  values.forEach((v,i)=>{ if(v!=null) g+=`<circle cx="${x(i)}" cy="${y(Math.min(v,max))}" r="${below!=null&&v<below?5:4}" fill="${below!=null&&v<below?PROD_VIZ_BELOW:color}" stroke="#fff" stroke-width="2"/>`; });
  xs.forEach((lab,i)=>{
    g+=`<rect class="hit" x="${L+bw*i}" y="${T}" width="${bw}" height="${ph}" fill="transparent" ${prodTip(tips[i]||`${lab}: ${values[i]==null?'—':fmt(values[i])}`)}/>`;
    if(i%every===0) g+=`<text x="${x(i)}" y="${T+ph+16}" text-anchor="middle">${esc(lab)}</text>`;
  });
  g+=`<line x1="${L}" x2="${W-R}" y1="${T+ph}" y2="${T+ph}" stroke="#cbd2e0"/>`+prodAxisTitles(W,h,L,T,ph,xTitle,yTitle);
  const legend=ref?`<div class="pr-legend"><span><span class="pr-dot" style="background:${color}"></span>${esc(name)}</span>${below!=null?`<span><span class="pr-dot" style="background:${PROD_VIZ_BELOW};border-radius:50%"></span>below target</span>`:''}<span><svg width="18" height="8" style="display:inline;width:18px;vertical-align:1px;margin-right:6px"><line x1="0" x2="18" y1="4" y2="4" stroke="#374151" stroke-dasharray="4 3" stroke-width="1.5"/></svg>${esc(ref.label)}</span></div>`:'';
  return `<div class="pr-viz"><svg viewBox="0 0 ${W} ${h}">${g}</svg>${legend}</div>`;
}
// Donut for part-to-whole: items [{label,value,color}] — keep to ≤6 slices (fold the rest into "Other").
function prodDonut(items,{fmt=prodFmt,center='',sub=''}={}){
  const tot=items.reduce((s,x)=>s+x.value,0);
  if(!(tot>0)) return '<div class="pr-empty">Nothing to show.</div>';
  const R=80, r=52, C=90; let a=-Math.PI/2, g='';
  const gap=items.filter(x=>x.value>0).length>1? .012 : 0;           // thin surface gap between slices
  const pt=(ang,rad)=>`${C+rad*Math.cos(ang)},${C+rad*Math.sin(ang)}`;
  for(const x of items){ if(!(x.value>0)) continue;
    const sweep=x.value/tot*Math.PI*2, a0=a+gap/2, a1=a+sweep-gap/2, big=a1-a0>Math.PI?1:0;
    const tip=prodTip(`${x.label}: ${fmt(x.value)} (${prodPct(x.value/tot)})`);
    g+= sweep>=Math.PI*2-1e-9
      ? `<circle cx="${C}" cy="${C}" r="${(R+r)/2}" fill="none" stroke="${x.color}" stroke-width="${R-r}" ${tip}/>`
      : `<path d="M${pt(a0,R)} A${R},${R} 0 ${big} 1 ${pt(a1,R)} L${pt(a1,r)} A${r},${r} 0 ${big} 0 ${pt(a0,r)} Z" fill="${x.color}" ${tip}/>`;
    a+=sweep; }
  g+=`<text x="${C}" y="${C+2}" text-anchor="middle" style="font-size:17px;font-weight:700;fill:#0d2f6e">${esc(center)}</text><text x="${C}" y="${C+18}" text-anchor="middle">${esc(sub)}</text>`;
  return `<div class="pr-viz pr-donut"><svg viewBox="0 0 180 180">${g}</svg>
    <div class="pr-legend">${items.filter(x=>x.value>0).map(x=>`<div ${prodTip(`${x.label}: ${fmt(x.value)} (${prodPct(x.value/tot)})`)}><span><span class="pr-dot" style="background:${x.color}"></span>${esc(x.label)}</span><span><b>${fmt(x.value)}</b> <span style="color:#6b7280">${prodPct(x.value/tot,0)}</span></span></div>`).join('')}</div></div>`;
}
// Top n by value + "Other", coloured in fixed categorical order
function prodTopN(entries,n=5){
  const s=[...entries].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  const top=s.slice(0,n).map(([label,value],i)=>({label,value,color:PROD_VIZ_CAT[i]}));
  const rest=s.slice(n).reduce((t,x)=>t+x[1],0);
  if(rest>0) top.push({label:`Other (${s.length-n})`,value:rest,color:PROD_VIZ_GRAY});
  return top;
}
// Histogram: how many shifts fall in each band. bins [{lo,hi,label}] (hi exclusive; last bin open-ended)
function prodHist(values,bins,{unit='shifts',what='',ref=null,xTitle='',yTitle='Number of shifts',colorOf=null,extraLegend=''}={}){
  const counts=bins.map((b,i)=>values.filter(v=>v>=b.lo&&(i===bins.length-1?true:v<b.hi)).length);
  const tips=bins.map((b,i)=>`${what} ${b.label}: ${counts[i]} ${unit} (${prodPct(values.length?counts[i]/values.length:0,0)})`);
  return prodColumns(bins.map(b=>b.label),[{name:unit,color:PROD_VIZ_CAT[0],values:counts}],{tips,fmt:v=>prodFmt(v),ref,int:true,xTitle,yTitle,colorOf,extraLegend});
}
// Pareto on ONE axis (share of total, 0–100%): bars = each cause's share,
// line = cumulative share. The "vital few" up to 80% are in the accent colour.
function prodPareto(entries,{fmt=prodFmt,max=8,xTitle='',yTitle='Share of total'}={}){
  const all=[...entries].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  if(!all.length) return '<div class="pr-empty">Nothing to show.</div>';
  const top=all.slice(0,max), rest=all.slice(max).reduce((t,x)=>t+x[1],0);
  if(rest>0) top.push([`Other (${all.length-max})`,rest]);
  const tot=all.reduce((t,x)=>t+x[1],0); let cum=0;
  const rows=top.map(([l,v])=>{ const before=cum; cum+=v; return {l,v,share:v/tot,cum:cum/tot,vital:before/tot<.8}; });
  const W=640,h=246,L=58,R=10,T=12,B=56,ph=h-T-B,pw=W-L-R, bw=pw/rows.length, cw=Math.min(46,bw*.6);
  const y=v=>T+ph-v*ph, x=i=>L+bw*i+bw/2;
  let g='';
  for(let k=0;k<=4;k++){ const v=k/4; g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${PROD_VIZ_GRID}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${k*25}%</text>`; }
  g+=`<line x1="${L}" x2="${W-R}" y1="${y(.8)}" y2="${y(.8)}" stroke="#374151" stroke-dasharray="4 4" stroke-width="1"/>`;
  rows.forEach((r,i)=>{ const hh=Math.max(0,y(0)-y(r.share)), rr=Math.min(4,cw/2,hh);
    g+=rr?`<path d="M${x(i)-cw/2},${y(0)} V${y(r.share)+rr} q0,-${rr} ${rr},-${rr} H${x(i)+cw/2-rr} q${rr},0 ${rr},${rr} V${y(0)} Z" fill="${r.vital?PROD_VIZ_CAT[0]:'#9ec5f4'}"/>`:'';
    const lab=r.l.length>13? r.l.slice(0,12)+'…' : r.l;
    g+=`<text x="${x(i)}" y="${h-B+14}" text-anchor="middle">${esc(lab)}</text>`; });
  g+=`<path d="${rows.map((r,i)=>`${i?'L':'M'}${x(i)},${y(r.cum)}`).join(' ')}" fill="none" stroke="${PROD_VIZ_CAT[1]}" stroke-width="2"/>`;
  rows.forEach((r,i)=>{ g+=`<circle cx="${x(i)}" cy="${y(r.cum)}" r="4" fill="${PROD_VIZ_CAT[1]}" stroke="#fff" stroke-width="2"/>`;
    g+=`<rect class="hit" x="${L+bw*i}" y="${T}" width="${bw}" height="${ph}" fill="transparent" ${prodTip(`${r.l}\n${fmt(r.v)} · ${prodPct(r.share)} of total\nCumulative ${prodPct(r.cum)}`)}/>`; });
  g+=`<line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" stroke="#cbd2e0"/>`+prodAxisTitles(W,h,L,T,ph,xTitle,yTitle);
  return `<div class="pr-viz"><svg viewBox="0 0 ${W} ${h}">${g}</svg>
    <div class="pr-legend"><span><span class="pr-dot" style="background:${PROD_VIZ_CAT[0]}"></span>Share — the vital few (first 80%)</span><span><span class="pr-dot" style="background:#9ec5f4"></span>Share — the rest</span><span><span class="pr-dot" style="background:${PROD_VIZ_CAT[1]};border-radius:50%"></span>Cumulative %</span>
    <span><svg width="18" height="8" style="display:inline;width:18px;vertical-align:1px;margin-right:6px"><line x1="0" x2="18" y1="4" y2="4" stroke="#374151" stroke-dasharray="4 3" stroke-width="1.5"/></svg>80% line</span></div></div>`;
}
// Diverging colour around the target: blue above, red below, grey near it (±2.5 points)
function prodHeatColor(v,target){
  if(v==null) return {bg:'#f6f8fc',fg:'#9ca3af'};
  const d=v-target, a=Math.abs(d);
  if(a<.025) return {bg:'#f0efec',fg:'#374151'};
  const step=a<.075?0:a<.15?1:2;
  return d>0? [{bg:'#cde2fb',fg:'#0d2f6e'},{bg:'#86b6ef',fg:'#0d2f6e'},{bg:'#2a78d6',fg:'#fff'}][step]
            : [{bg:'#fbd5d2',fg:'#7f1d1d'},{bg:'#f4a29d',fg:'#7f1d1d'},{bg:'#d63b3a',fg:'#fff'}][step];
}
// Stat tile with change vs the previous period. better: +1 if up is good, -1 if down is good.
function prodDeltaKpi(label,cur,prev,{fmt=prodFmt,dfmt=null,better=1,unit='',color='',note=''}={}){
  let delta='<span style="color:#9ca3af">no data for the previous period</span>';
  if(prev!=null&&isFinite(prev)){
    const d=cur-prev, flat=Math.abs(d)<1e-9, good=flat?null:(d>0)===(better>0);
    const col=flat?'#6b7280':good?'#16a34a':'#dc2626', arrow=flat?'▬':d>0?'▲':'▼';
    delta=`<span style="color:${col};font-weight:600">${arrow} ${(dfmt||fmt)(Math.abs(d))}${unit}</span> <span style="color:#6b7280">vs ${fmt(prev)} before</span>`;
  }
  return `<div class="pr-kpi"><div class="l">${label}</div><div class="v" ${color?`style="color:${color}"`:''}>${fmt(cur)}${note?` <span style="font-size:12px;font-weight:600">${note}</span>`:''}</div><div class="pr-delta">${delta}</div></div>`;
}
// Side-by-side bars for a few groups on one measure (e.g. Shift A vs B)
function prodCmpBars(groups,{fmt=prodFmt,max=null}={}){
  const m=max??(Math.max(...groups.map(g=>g.value||0),0)||1);
  return groups.map(g=>`<span style="color:#374151">${esc(g.label)}</span>
    <div style="display:flex;align-items:center;gap:8px" ${prodTip(g.tip||`${g.label}: ${fmt(g.value)}`)}><div class="bar" style="width:${Math.max(1,(g.value||0)/m*100)}%;max-width:78%;background:${g.color}"></div><b style="font-variant-numeric:tabular-nums">${fmt(g.value)}</b></div>`).join('');
}

// Where the planned time went, in fixed colours (same everywhere)
function prodTimeSplit(t){
  return [
    {label:'Good parts',   value:Math.max(0,t.idealMin-t.qualLossMin), color:PROD_VIZ_CAT[0]},
    {label:'Speed loss',   value:t.shotsNoCT?0:t.speedLossMin,          color:PROD_VIZ_CAT[1]},
    {label:'Cavity down',  value:t.cavLossMin,                          color:PROD_VIZ_CAT[2]},
    {label:'Quality loss', value:t.qualLossMin,                         color:PROD_VIZ_CAT[3]},
    {label:'Downtime',     value:t.downtime,                            color:PROD_VIZ_GRAY},
  ].filter(x=>x.label!=='Cavity down'||x.value>0);
}
const PROD_EMPTY=`<div class="pr-empty">No production entries for this selection.</div>`;

// Filters: period chips + custom dates, machine, shift, (part on Rejection / Material). Every change applies at once.
function prodRepFilters(ctx,tab,people=[]){
  const f=_prodRep.f, fet=tab==='fet';
  return `<div class="pr-filters">
    ${PROD_PERIODS.map(p=>`<button class="pr-chip ${f.period===p.k?'on':''}" onclick="prodRepPeriod('${p.k}')">${p.l}</button>`).join('')}
    <span class="pr-sep"></span>
    <input type="date" value="${f.from}" onchange="prodRepSet({from:this.value,period:''})" title="From">
    <span style="color:#9ca3af">–</span>
    <input type="date" value="${f.to}" onchange="prodRepSet({to:this.value,period:''})" title="To">
    <span class="pr-sep"></span>
    ${fet?`<select onchange="prodRepSet({person:this.value})">${prodOpts(people,f.person,{blank:'All people'})}</select>`:`
    <select onchange="prodRepSet({machineId:this.value})">${prodOpts(ctx.machines,f.machineId,{val:m=>m.id,label:prodMachineLabel,blank:'All machines'})}</select>
    <select onchange="prodRepSet({shift:this.value})">${prodOpts(Object.keys(PROD_SHIFTS),f.shift,{blank:'Both shifts',label:k=>'Shift '+k})}</select>`}
    ${tab==='rej'||tab==='mat'||tab==='viz'||fet?`<select onchange="prodRepSet({partId:this.value})" style="max-width:240px">${prodOpts(ctx.parts,f.partId,{val:p=>p.id,label:prodPartLabel,blank:'All parts'})}</select>`:''}
  </div>`;
}
function prodRepPeriod(k){ const p=PROD_PERIODS.find(x=>x.k===k); const [from,to]=p.range(); prodRepSet({period:k,from,to}); }
function prodRepSet(ch){ Object.assign(_prodRep.f,ch); prodRenderReports(); }
function prodRepTab(k){ _prodRep.tab=k; prodRenderReports(); }

let _prodRepSeq=0;
async function prodRenderReports(opts={}){
  if(opts.tab) _prodRep.tab=opts.tab;
  const seq=++_prodRepSeq;          // a slower, older render must not overwrite a newer one
  const tab=_prodRep.tab, f=_prodRep.f;
  if(f.period){ const p=PROD_PERIODS.find(x=>x.k===f.period); if(p) [f.from,f.to]=p.range(); }
  const ctx=await prodCtx();
  const partFilter=tab==='rej'||tab==='mat'||tab==='viz'? f.partId : '';
  let body, people=[];
  if(tab==='cap') body=await prodRepCapacity(ctx);
  else if(tab==='gemba') body=await prodRepGemba(ctx);
  else if(tab==='fet'){
    const all=await prodFetLoad();
    people=[...new Set(all.flatMap(e=>(e.rows||[]).map(r=>r.person)).filter(Boolean))].sort();
    body=prodFetPersonReport(ctx,all.filter(e=>e.date>=f.from&&e.date<=f.to),f)
      +`<div style="text-align:right;margin-top:-4px"><a href="#" onclick="event.preventDefault();nav('prod-fettling')" style="font-size:12px">Enter or edit fettling →</a></div>`;
  }
  else {
    const rows=await prodLoadShifts(ctx,{from:f.from,to:f.to,machineId:f.machineId,shift:f.shift,partId:partFilter});
    let prev=[];
    if(tab==='viz'){ const n=Math.round((new Date(f.to)-new Date(f.from))/864e5)+1;
      prev=await prodLoadShifts(ctx,{from:prodAddDays(f.from,-n),to:prodAddDays(f.from,-1),machineId:f.machineId,shift:f.shift,partId:partFilter}); }
    const fet=tab==='viz'? (await prodFetLoad()).filter(e=>e.date>=f.from&&e.date<=f.to) : [];
    body = tab==='viz'? prodRepCharts(ctx,rows,prev,fet) : tab==='oee'? prodRepOEE(ctx,rows) : tab==='rej'? prodRepRejection(ctx,rows) : tab==='mat'? prodRepMaterial(ctx,rows) : prodRepCustomers(ctx,rows);
  }
  if(seq!==_prodRepSeq) return;
  setC(`${PROD_REPORT_CSS}
  <div class="pr-top">
    <h2 style="font-size:16px;font-weight:700;color:var(--navy)">📊 Production Reports</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="pr-tabs">${PROD_REPORT_TABS.map(t=>`<button class="pr-tab ${t.k===tab?'on':''}" onclick="prodRepTab('${t.k}')">${t.l}</button>`).join('')}</div>
      <button class="btn btn-o btn-sm pr-noprint" onclick="window.print()" title="Print or save as PDF (A4)">🖨 Print</button>
    </div>
  </div>
  <div class="pr-print-only">${tab==='gemba'?`Gemba walk sheet · ${prodGembaDate()} · printed ${new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}`:`${esc(PROD_REPORT_TABS.find(t=>t.k===tab)?.l.replace(/^\W+\s*/,'')||'')} · ${prodDayLabel(f.from)} – ${prodDayLabel(f.to)} ${f.to.slice(0,4)} · ${esc(f.machineId?prodMachineLabel(ctx.machineById[f.machineId]):'All machines')} · ${f.shift?'Shift '+esc(f.shift):'Both shifts'}${partFilter?` · ${esc(ctx.partById[partFilter]?.partNumber||'')}`:''} · printed ${new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}`}</div>
  ${tab==='cap'||tab==='gemba'?'':prodRepFilters(ctx,tab,people)}
  ${body}`);
  if(tab==='cap') prodCapCalc();
}

// With a part filter, keep only that part's runs (a shift may run several parts)
function prodPickPart(c,partId){
  if(!partId) return c;
  const runs=c.runs.filter(r=>String(r.partId)===String(partId));
  const x={t:{},byGrade:{},byPart:{},byDefect:{},byDown:{}};
  for(const k of PROD_SUM_KEYS) x.t[k]=runs.reduce((s,r)=>s+(r[k]||0),0);
  prodMergeMaps(x,runs,[]); x.t=prodRatios(x.t); return x;
}

// ── Yesterday (Gemba walk sheet) ─────────────────────
// One page for the morning walk: how yesterday went, what to look at on
// the floor, and who to talk to. ◀ ▶ steps through days.
function prodGembaDate(){ return _prodRep.gembaDate||prodDaysAgo(1); }
function prodGembaStep(n){ const d=prodAddDays(prodGembaDate(),n); if(d>prodToday()) return; _prodRep.gembaDate=d; prodRenderReports(); }
async function prodRepGemba(ctx){
  prodVizTipInit();
  const d=prodGembaDate(), dPrev=prodAddDays(d,-1), yday=d===prodDaysAgo(1);
  const [rows,prevRows,fetAll]=await Promise.all([prodLoadShifts(ctx,{from:d,to:d}),prodLoadShifts(ctx,{from:dPrev,to:dPrev}),prodFetLoad()]);
  const target=Math.min(1,prodN(ctx.cfg.targetOeePct)/100)||.75;
  const t=prodAgg(rows.map(r=>r.c)).t, pt=prevRows.length? prodAgg(prevRows.map(r=>r.c)).t : null;
  const rejPct=x=>(x.castPcs-x.offPcs)>0? x.rejPcs/(x.castPcs-x.offPcs) : 0;
  const pts=v=>prodFmt(v*100,1)+' pts';
  const mLab=id=>prodMachineLabel(ctx.machineById[id]);
  const navHtml=`<div class="pr-filters pr-noprint" style="justify-content:space-between">
    <div style="display:flex;gap:8px;align-items:center">
      <button class="pr-chip" onclick="prodGembaStep(-1)">◀ Previous day</button>
      <input type="date" value="${d}" max="${prodToday()}" onchange="_prodRep.gembaDate=this.value;prodRenderReports()">
      <button class="pr-chip" ${d>=prodToday()?'disabled style="opacity:.4"':''} onclick="prodGembaStep(1)">Next day ▶</button>
      ${yday?'':`<button class="pr-chip on" onclick="_prodRep.gembaDate='';prodRenderReports()">Back to yesterday</button>`}
    </div>
    <span style="font-size:12px;color:#6b7280">Tip: 🖨 Print gives an A4 sheet to carry on the walk.</span></div>`;
  const title=`<div style="font-size:15px;font-weight:700;color:var(--navy);margin:2px 2px 10px">${yday?'Yesterday — ':''}${new Date(d+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>`;

  // Expected machine × shift slots (active machines, both shifts)
  const mcs=ctx.machines.filter(m=>m.active!==false||rows.some(r=>String(r.s.machineId)===String(m.id)));
  const slots=Object.keys(PROD_SHIFTS).flatMap(sh=>mcs.map(m=>({sh,m,r:rows.find(r=>r.s.shift===sh&&String(r.s.machineId)===String(m.id))})));

  // Fettling that day
  const fr=fetAll.filter(e=>e.date===d).flatMap(e=>(e.rows||[]).filter(r=>prodN(r.qty)>0));
  const ft=prodFetTotals(fr);

  // ── Talking points (most important first) ──
  const tp=[];   // {lvl:0 critical,1 warn,2 info, html}
  const missing=slots.filter(x=>!x.r);
  if(missing.length) tp.push({lvl:0,html:`<b>No entry</b> for ${missing.map(x=>`${esc(prodMachineLabel(x.m))} · Shift ${x.sh}`).join(', ')} — day's report is incomplete.`});
  for(const x of slots){ if(!x.r) continue; const s=x.r.s, c=x.r.c, xt=c.t, where=`${esc(prodMachineLabel(x.m))} · Shift ${x.sh}`;
    if(s.notRun){ if(s.notRun!=='No Plan') tp.push({lvl:0,html:`<b>${where} did not run</b> — ${esc(s.notRun)}${s.remarks?`: ${esc(s.remarks)}`:''}.`}); continue; }
    if(xt.planned&&xt.oee<target){
      const loss=[['downtime',xt.downtime],['speed loss',xt.shotsNoCT?0:xt.speedLossMin],['cavity down',xt.cavLossMin],['quality loss',xt.qualLossMin]].sort((a,b)=>b[1]-a[1])[0];
      const top=Object.entries(c.byDown).sort((a,b)=>b[1]-a[1])[0];
      tp.push({lvl:xt.oee<target-.1?0:1,html:`<b>${where}: OEE ${prodPct(xt.oee,0)}</b> — ${pts(target-xt.oee)} below target. Biggest loss: ${loss[0]} ${prodFmt(loss[1])} min${loss[0]==='downtime'&&top?` (mostly ${esc(top[0])}, ${prodFmt(top[1])} min)`:''}.`}); }
    for(const r of c.runs) if(r.part&&r.cav<r.dieCav&&r.shots) tp.push({lvl:1,html:`<b>${where}: cavity down</b> — ${esc(r.part.partNumber)} ran ${prodFmt(r.shots)} shots on ${r.cav} of ${r.dieCav} cavities (${prodFmt(r.cavLossMin)} min lost). Check die repair status.`});
    for(const dl of (s.downtime||[])) if(prodN(dl.minutes)>=60&&!PROD_NOT_PLANNED.includes(dl.category)) tp.push({lvl:1,html:`<b>${where}: ${prodFmt(prodN(dl.minutes))} min ${esc(dl.category)}</b>${dl.remark?` — ${esc(dl.remark)}`:''}. Is the cause fixed?`});
    for(const r of c.runs){ const rp=rejPct(r); if(r.rejPcs>=5&&rp>=Math.max(.03,2*rejPct(t))){ const top=Object.entries(r.rej).sort((a,b)=>b[1]-a[1])[0];
      tp.push({lvl:1,html:`<b>${where}: ${esc(r.part?.partNumber||'')} rejection ${prodPct(rp,1)}</b> (${prodFmt(r.rejPcs)} pcs)${top?` — mostly ${esc(ctx.defectByCode[top[0]]?.description||top[0])} (${prodFmt(top[1])})`:''}. Look at the die / process.`}); } }
  }
  const pile=t.okPcs-ft.qty;
  if(t.okPcs&&pile>t.okPcs*.25) tp.push({lvl:2,html:`<b>Fettling fell behind by ${prodFmt(pile)} parts</b> (${prodFmt(t.okPcs)} OK castings made, ${prodFmt(ft.qty)} fettled).`});
  if(ft.qty&&ft.rejPct>.02) tp.push({lvl:2,html:`<b>Fettling rejection ${prodPct(ft.rejPct,1)}</b> (${prodFmt(ft.rej)} parts).`});
  tp.sort((a,b)=>a.lvl-b.lvl);
  const icon=['🔴','🟠','🔵'];
  const tpHtml=tp.length?`<ol style="margin:0;padding:0 0 0 4px;list-style:none;display:grid;gap:7px">${tp.map(x=>`<li style="display:flex;gap:8px;font-size:13px;line-height:1.45"><span>${icon[x.lvl]}</span><span>${x.html}</span></li>`).join('')}</ol>`
    :`<div style="font-size:13px;color:#16a34a;font-weight:600">✅ Nothing flagged — every shift at or above target with no long stops.</div>`;

  // ── Machine × shift cards ──
  const card=x=>{ const where=`${esc(prodMachineLabel(x.m))} · Shift ${x.sh}`;
    if(!x.r) return `<div class="pr-kpi" style="border-color:#fecaca;background:#fff7f7"><div class="l">${where}</div><div class="v" style="font-size:16px;color:#dc2626">No entry</div></div>`;
    const s=x.r.s, xt=x.r.c.t;
    if(s.notRun) return `<div class="pr-kpi"><div class="l">${where}</div><div class="v" style="font-size:16px;color:${s.notRun==='No Plan'?'#6b7280':'#dc2626'}">⛔ Did not run</div><div class="s">${esc(s.notRun)}${s.remarks?` — ${esc(s.remarks)}`:''}</div></div>`;
    const below=xt.planned&&xt.oee<target, top=Object.entries(x.r.c.byDown).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="pr-kpi"><div class="l">${where}</div>
      <div class="v" style="font-size:22px;${below?'color:#dc2626':''}">${prodPct(xt.oee,0)} <span style="font-size:11px;font-weight:600;color:${below?'#dc2626':'#6b7280'}">OEE${below?' · below target':''}</span></div>
      <div class="s" style="line-height:1.55">${x.r.c.runs.map(r=>esc(r.part?.partNumber||'—')+(r.cav<r.dieCav?` <span style="color:#d97706">(${r.cav}/${r.dieCav} cav)</span>`:'')).join(', ')}<br>
        <b style="color:#1a1a2e">${prodFmt(xt.okPcs)}</b> OK · rej ${prodPct(rejPct(xt),1)} · down ${prodFmt(xt.downtime)} min${top?` (${esc(top[0])})`:''}<br>
        ${esc([s.operator1,s.operator2].filter(Boolean).join(', ')||'—')}${s.remarks?`<br><i>${esc(s.remarks)}</i>`:''}</div></div>`; };

  // ── Downtime events & rejections that day ──
  const events=rows.flatMap(({s})=>s.notRun?[]:(s.downtime||[]).filter(x=>prodN(x.minutes)>0).map(x=>({...x,where:`${mLab(s.machineId)} · ${s.shift}`}))).sort((a,b)=>prodN(b.minutes)-prodN(a.minutes));
  const rejRows=rows.flatMap(({s,c})=>c.runs.filter(r=>r.castPcs).map(r=>({r,where:`${mLab(s.machineId)} · ${s.shift}`}))).sort((a,b)=>b.r.rejPcs-a.r.rejPcs);

  return navHtml+title+`
  <div class="pr-kpis">
    ${prodDeltaKpi('OEE',t.oee,pt?.planned?pt.oee:null,{fmt:v=>prodPct(v),dfmt:pts,color:t.planned&&t.oee<target?PROD_VIZ_BELOW:'',note:t.planned&&t.oee<target?`below target ${prodPct(target,0)}`:''})}
    ${prodDeltaKpi('OK parts',t.okPcs,pt?pt.okPcs:null)}
    ${prodDeltaKpi('Rejection %',rejPct(t),pt?rejPct(pt):null,{fmt:v=>prodPct(v,2),dfmt:pts,better:-1})}
    ${prodDeltaKpi('Downtime',t.downtime/60,pt?pt.downtime/60:null,{fmt:v=>prodFmt(v,1)+' h',better:-1})}
  </div>
  ${prodCard('Talking points for the walk',`<div class="b">${tpHtml}</div>`,`${tp.length} item${tp.length===1?'':'s'} · vs day before`)}
  <div class="pr-sec">Each machine &amp; shift</div>
  <div class="pr-kpis" style="grid-template-columns:repeat(${Math.min(4,Math.max(2,mcs.length))},1fr)">${slots.map(card).join('')}</div>
  <div class="pr-grid">
    ${prodCard('Downtime events',events.length?`<table class="pr-tbl"><thead><tr><th>Machine · shift</th><th>Reason</th><th class="n">Min</th><th>Remark</th></tr></thead><tbody>
      ${events.map(x=>`<tr><td>${esc(x.where)}</td><td>${esc(x.category)}${PROD_NOT_PLANNED.includes(x.category)?' <span style="color:#9ca3af">(not counted)</span>':''}</td><td class="n mono" style="${prodN(x.minutes)>=60&&!PROD_NOT_PLANNED.includes(x.category)?'color:#dc2626;font-weight:700':''}">${prodFmt(prodN(x.minutes))}</td><td style="color:#6b7280">${esc(x.remark||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="pr-empty">No downtime logged.</div>',`${prodFmt(t.downtime)} min counted`)}
    ${prodCard('Rejections by part',rejRows.length?`<table class="pr-tbl"><thead><tr><th>Part</th><th>Machine · shift</th><th class="n">Rejected</th><th class="n">Rej %</th><th>Top defect</th></tr></thead><tbody>
      ${rejRows.map(({r,where})=>{ const top=Object.entries(r.rej).sort((a,b)=>b[1]-a[1])[0], rp=rejPct(r);
        return `<tr><td><b>${esc(r.part?.partNumber||'—')}</b></td><td>${esc(where)}</td><td class="n mono">${prodFmt(r.rejPcs)}</td><td class="n mono" style="${rp>=.03?'color:#dc2626;font-weight:700':''}">${prodPct(rp,1)}</td><td style="color:#6b7280">${top?`${esc(ctx.defectByCode[top[0]]?.description||top[0])} (${prodFmt(top[1])})`:'—'}</td></tr>`; }).join('')}</tbody></table>`:'<div class="pr-empty">No production.</div>',`${prodFmt(t.rejPcs)} pcs · ${prodPct(rejPct(t),2)}`)}
  </div>
  <div class="pr-grid">
    ${prodCard('Where the day\'s time went',`<div class="b">${t.planned?prodDonut(prodTimeSplit(t),{fmt:v=>prodFmt(v)+' min',center:prodPct(t.oee,0),sub:'OEE'}):'<div class="pr-empty">No planned time.</div>'}</div>`,`${prodFmt(t.planned)} min planned`)}
    ${prodCard('Fettling',fr.length?`<div class="b" style="display:grid;grid-template-columns:1fr auto;gap:5px 14px;font-size:13px">
        <span>Parts fettled</span><b class="mono">${prodFmt(ft.qty)}</b>
        <span>OK / rejected</span><b class="mono">${prodFmt(ft.ok)} / <span style="color:${ft.rej?'#dc2626':''}">${prodFmt(ft.rej)}</span> (${prodPct(ft.rejPct,1)})</b>
        <span>OK castings made</span><b class="mono">${prodFmt(t.okPcs)}</b>
        <span>${pile>=0?'Added to the waiting pile':'Taken from the waiting pile'}</span><b class="mono" style="color:${pile>0?'#d97706':'#16a34a'}">${prodFmt(Math.abs(pile))}</b>
        <span>People</span><b>${[...new Set(fr.map(r=>r.person).filter(Boolean))].length}</b></div>`:'<div class="pr-empty">No fettling entered for this day.</div>')}
  </div>`;
}

// ── Charts: fettling ─────────────────────────────────
// Fettling isn't tied to a machine or shift, so only the period and part
// filters apply. Castings vs fettled shows whether fettling keeps pace.
function prodChartsFettling(ctx,fet,rows,{keys,xs,keyOf,xT,bucket,partId}){
  const fr=fet.flatMap(e=>(e.rows||[]).map(r=>({...r,date:e.date}))).filter(r=>prodN(r.qty)>0&&(!partId||String(r.partId)===String(partId)));
  const head='<div class="pr-sec">Fettling <span style="text-transform:none;letter-spacing:0;font-weight:500">— period &amp; part filters only (fettling isn\'t per machine / shift)</span></div>';
  if(!fr.length) return head+prodCard('Fettling','<div class="pr-empty">No fettling recorded for this period.</div>');
  const t=prodFetTotals(fr);
  // OK castings from die casting in the same period (all machines / shifts, same part filter)
  const castRows=rows;   // already period + part filtered; machine / shift filters narrow it
  const castOk=prodAgg(castRows.map(r=>r.c)).t.okPcs;
  const castPer=keys.map(k=>prodAgg(castRows.filter(r=>keyOf(r.s.date)===k).map(r=>r.c)).t.okPcs);
  const fetPer=keys.map(k=>prodFetTotals(fr.filter(r=>keyOf(r.date)===k)));
  const people={}; fr.forEach(r=>(people[r.person||'(no name)']=people[r.person||'(no name)']||[]).push(r));
  const ppl=Object.entries(people).map(([name,rs])=>({name,t:prodFetTotals(rs),days:new Set(rs.map(r=>r.date)).size})).sort((a,b)=>b.t.qty-a.t.qty);
  const reasons={}; fr.forEach(r=>{ const n=Math.min(prodN(r.rej),prodN(r.qty)); if(n>0){ const k=r.reason||'Not specified'; reasons[k]=(reasons[k]||0)+n; } });
  const gap=castOk-t.qty;
  const filtered=_prodRep.f.machineId||_prodRep.f.shift;
  return head+`
  <div class="pr-kpis">
    ${prodKpi('Parts fettled',prodFmt(t.qty),`${ppl.length} ${ppl.length===1?'person':'people'} · ${prodFmt(t.ok)} OK`)}
    ${prodKpi('Fettling rejection',prodPct(t.rejPct,2),`${prodFmt(t.rej)} parts rejected`,t.rejPct>.02?PROD_VIZ_BELOW:'')}
    ${prodKpi('OK castings made',prodFmt(castOk),filtered?'machine / shift filter applied':'die casting, same period')}
    ${prodKpi(gap>=0?'Castings not yet fettled':'Fettled from earlier stock',prodFmt(Math.abs(gap)),gap>0?'pile grew this period':gap<0?'pile shrank this period':'kept pace',gap>0?'#d97706':'#16a34a')}
  </div>
  ${prodCard(`Castings made vs fettled by ${bucket}`,`<div class="b">${prodColumns(xs,[
      {name:'OK castings made',color:PROD_VIZ_CAT[0],values:castPer},
      {name:'Parts fettled',color:PROD_VIZ_CAT[1],values:fetPer.map(x=>x.qty)}],
    {W:1300,grouped:true,xTitle:xT,yTitle:'Parts (pcs)',tips:keys.map((k,i)=>`${xs[i]}\nOK castings made: ${prodFmt(castPer[i])}\nFettled: ${prodFmt(fetPer[i].qty)} (${prodFmt(fetPer[i].ok)} OK)\n${castPer[i]-fetPer[i].qty>=0?'Added to the pile: ':'Taken from the pile: '}${prodFmt(Math.abs(castPer[i]-fetPer[i].qty))}`)})}</div>
    <div class="pr-note">When the orange bar is shorter than the blue one, castings are piling up waiting for fettling.</div>`,`${prodFmt(castOk)} made · ${prodFmt(t.qty)} fettled`)}
  <div class="pr-grid">
    ${prodCard('Parts fettled by person',`<div class="b">${prodColumns(ppl.map(x=>x.name),[{name:'Fettled',color:PROD_VIZ_CAT[1],values:ppl.map(x=>x.t.qty)}],
      {xTitle:'Person',yTitle:'Parts fettled (pcs)',tips:ppl.map(x=>`${x.name}\n${prodFmt(x.t.qty)} fettled · ${prodFmt(x.t.ok)} OK\n${x.days} day${x.days===1?'':'s'} · ${prodFmt(x.days?x.t.qty/x.days:0)} per day`)})}</div>`,
      `avg ${prodFmt(ppl.length?t.qty/ppl.length:0)} per person`)}
    ${prodCard('Fettling rejection % by person',`<div class="b">${prodColumns(ppl.map(x=>x.name),[{name:'Rejection %',color:PROD_VIZ_CAT[0],values:ppl.map(x=>x.t.rejPct)}],
      {fmt:v=>prodPct(v,1),xTitle:'Person',yTitle:'Rejection %',colorOf:(i,v)=>v>t.rejPct?PROD_VIZ_BELOW:'',
       ref:{value:t.rejPct,label:`average ${prodPct(t.rejPct,2)}`},
       extraLegend:`<span><span class="pr-dot" style="background:${PROD_VIZ_CAT[0]}"></span>at / better than average</span><span><span class="pr-dot" style="background:${PROD_VIZ_BELOW}"></span>worse than average</span>`,
       tips:ppl.map(x=>`${x.name}\nRejection ${prodPct(x.t.rejPct,2)}\n${prodFmt(x.t.rej)} of ${prodFmt(x.t.qty)} fettled`)})}</div>`)}
  </div>
  <div class="pr-grid">
    ${prodCard(`Fettling rejection % by ${bucket}`,`<div class="b">${prodLine(xs,fetPer.map(x=>x.qty?x.rejPct:null),{fmt:v=>prodPct(v,1),color:PROD_VIZ_CAT[1],xTitle:xT,yTitle:'Rejection %',
      tips:fetPer.map((x,i)=>`${xs[i]}\n${x.qty?`Rejection ${prodPct(x.rejPct,2)}\n${prodFmt(x.rej)} of ${prodFmt(x.qty)} fettled`:'no fettling'}`)})}</div>`,`overall ${prodPct(t.rejPct,2)}`)}
    ${prodCard('Fettling rejection reasons',`<div class="b">${Object.keys(reasons).length?prodDonut(prodTopN(Object.entries(reasons),5),{fmt:v=>prodFmt(v)+' pcs',center:prodFmt(t.rej),sub:'rejected'}):'<div class="pr-empty">No fettling rejections.</div>'}</div>`)}
  </div>`;
}

// ── Charts ───────────────────────────────────────────
// A visual overview of the same data: trends, part-to-whole (donuts),
// and distributions (histograms). Buckets by day, or by week / month for long ranges.
function prodRepCharts(ctx,rows,prev=[],fet=[]){
  if(!rows.length) return PROD_EMPTY;
  prodVizTipInit();
  const f=_prodRep.f, agg=prodAgg(rows.map(r=>r.c)), t=agg.t;
  const span=Math.round((new Date(f.to)-new Date(f.from))/864e5)+1;
  const by=span>92?'month':span>31?'week':'day';
  const keyOf=d=>{ if(by==='day') return d; if(by==='month') return d.slice(0,7);
    const x=new Date(d+'T00:00:00'); x.setDate(x.getDate()-((x.getDay()+6)%7)); return prodDate(x); };
  const labOf=k=>by==='month'? prodDayLabel(k+'-01').split(' ')[1]+' '+k.slice(2,4) : (by==='week'?'wk ':'')+prodDayLabel(k);
  const keys=[]; for(let d=f.from; d<=f.to; d=prodAddDays(d,1)){ const k=keyOf(d); if(!keys.includes(k)) keys.push(k); }
  const xs=keys.map(labOf);
  const per=keys.map(k=>prodAgg(rows.filter(r=>keyOf(r.s.date)===k).map(r=>r.c)).t);
  const target=Math.min(1,prodN(ctx.cfg.targetOeePct)/100)||.75;
  const pctTip=(k,x)=>`${xs[k]}\nOEE ${prodPct(x.oee)}  ·  target ${prodPct(target,0)}\nAvailability ${prodPct(x.A)}\nPerformance ${prodPct(x.P)}\nQuality ${prodPct(x.Q)}\nOK parts ${prodFmt(x.okPcs)}`;

  // OK parts per bucket, one colour per machine
  const mcs=ctx.machines.filter(m=>rows.some(r=>String(r.s.machineId)===String(m.id)));
  const okSeries=mcs.map((m,i)=>({name:prodMachineLabel(m), color:PROD_VIZ_CAT[i%PROD_VIZ_CAT.length],
    values:keys.map(k=>prodAgg(rows.filter(r=>keyOf(r.s.date)===k&&String(r.s.machineId)===String(m.id)).map(r=>r.c)).t.okPcs)}));
  const okTips=keys.map((k,i)=>`${xs[i]}\n${okSeries.map(sr=>`${sr.name}: ${prodFmt(sr.values[i])}`).join('\n')}\nTotal: ${prodFmt(per[i].okPcs)} OK parts`);

  // Rejection % (rejected ÷ good-shot parts) per bucket
  const rejPct=x=>(x.castPcs-x.offPcs)>0? x.rejPcs/(x.castPcs-x.offPcs) : null;

  // Distributions over individual shifts that had planned time / production
  const shiftsP=rows.filter(r=>r.c.t.planned>0&&!r.s.notRun);
  const oeeBins=Array.from({length:10},(_,i)=>({lo:i/10,hi:(i+1)/10,label:`${i*10}–${i*10+10}%`}));
  const rejBins=[[0,.01,'0–1%'],[.01,.02,'1–2%'],[.02,.03,'2–3%'],[.03,.05,'3–5%'],[.05,.1,'5–10%'],[.1,9,'10%+']].map(([lo,hi,label])=>({lo,hi,label}));
  const shiftsRej=rows.filter(r=>r.c.t.castPcs>r.c.t.offPcs).map(r=>rejPct(r.c.t));

  // By machine (OEE) and by part (OK parts)
  const mOee=mcs.map(m=>({m,t:prodAgg(rows.filter(r=>String(r.s.machineId)===String(m.id)).map(r=>r.c)).t}));
  const partMix=prodTopN(Object.entries(agg.byPart).map(([pid,v])=>[ctx.partById[pid]?.partNumber||'?',v.okPcs]),5);
  const defects=prodTopN(Object.entries(agg.byDefect).map(([c,n])=>[ctx.defectByCode[c]?.description||c,n]),5);
  const downs=prodTopN(Object.entries(agg.byDown),5);
  const bucket=by==='day'?'day':by==='week'?'week':'month';

  // Previous period of the same length
  const pt=prev.length? prodAgg(prev.map(r=>r.c)).t : null;
  const pRej=pt? rejPct(pt) : null, cRej=rejPct(t)??0;
  const pts=v=>prodFmt(v*100,1)+' pts';

  // Heatmap: machine × bucket, OEE vs target
  const heat=mcs.map(m=>({m, cells:keys.map(k=>{ const x=prodAgg(rows.filter(r=>keyOf(r.s.date)===k&&String(r.s.machineId)===String(m.id)).map(r=>r.c)).t; return x.planned?x:null; })}));
  const heatHtml=`<div style="overflow-x:auto"><table class="pr-heat pr-viz"><thead><tr><th></th>${xs.map(l=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
    ${heat.map(({m,cells})=>`<tr><td class="m">${esc(prodMachineLabel(m))}</td>${cells.map((x,i)=>{ const c=prodHeatColor(x?x.oee:null,target);
      return `<td style="background:${c.bg};color:${c.fg}" ${prodTip(x?`${prodMachineLabel(m)} · ${xs[i]}\nOEE ${prodPct(x.oee)} (target ${prodPct(target,0)})\nAvailability ${prodPct(x.A)} · Performance ${prodPct(x.P)} · Quality ${prodPct(x.Q)}\nOK parts ${prodFmt(x.okPcs)}`:`${prodMachineLabel(m)} · ${xs[i]}: no production`)}>${x?Math.round(x.oee*100):'–'}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div>
  <div class="pr-legend">${[['#d63b3a','15+ pts below target'],['#f4a29d','7.5–15 below'],['#fbd5d2','2.5–7.5 below'],['#f0efec','on target (±2.5)'],['#cde2fb','2.5–7.5 above'],['#86b6ef','7.5–15 above'],['#2a78d6','15+ above']].map(([c,l])=>`<span><span class="pr-dot" style="background:${c};border:1px solid #e5e7eb"></span>${l}</span>`).join('')}</div>`;

  // Shift A vs Shift B
  const shifts=Object.keys(PROD_SHIFTS).map((k,i)=>{ const rs=rows.filter(r=>r.s.shift===k&&!r.s.notRun), x=prodAgg(rs.map(r=>r.c)).t, n=rs.filter(r=>r.c.t.planned>0).length;
    return {k, x, n, color:PROD_VIZ_CAT[i], rej:rejPct(x)??0}; });
  const sLab=x=>`Shift ${x.k} (${x.n})`;
  const shiftHtml=`<div class="pr-cmp">
    <b style="grid-column:span 2;font-size:11px;color:#6b7280">OEE</b>${prodCmpBars(shifts.map(x=>({label:sLab(x),value:x.x.oee,color:x.color,tip:`Shift ${x.k}: OEE ${prodPct(x.x.oee)}\nA ${prodPct(x.x.A)} · P ${prodPct(x.x.P)} · Q ${prodPct(x.x.Q)}`})),{fmt:v=>prodPct(v),max:1})}
    <b style="grid-column:span 2;font-size:11px;color:#6b7280;margin-top:6px">OK parts per shift</b>${prodCmpBars(shifts.map(x=>({label:sLab(x),value:x.n?x.x.okPcs/x.n:0,color:x.color})),{fmt:v=>prodFmt(v)})}
    <b style="grid-column:span 2;font-size:11px;color:#6b7280;margin-top:6px">Rejection %</b>${prodCmpBars(shifts.map(x=>({label:sLab(x),value:x.rej,color:x.color})),{fmt:v=>prodPct(v,2)})}
    <b style="grid-column:span 2;font-size:11px;color:#6b7280;margin-top:6px">Downtime per shift</b>${prodCmpBars(shifts.map(x=>({label:sLab(x),value:x.n?x.x.downtime/x.n:0,color:x.color})),{fmt:v=>prodFmt(v)+' min'})}
  </div>`;

  // Operator-wise: a shift counts for each of its operators
  const ops={};
  for(const r of rows){ if(r.s.notRun) continue;
    for(const name of new Set([r.s.operator1,r.s.operator2].map(x=>(x||'').trim()).filter(Boolean))){ (ops[name]=ops[name]||[]).push(r.c); } }
  const opRows=Object.entries(ops).map(([name,cs])=>({name,n:cs.length,t:prodAgg(cs).t})).sort((a,b)=>b.t.oee-a.t.oee);
  const opHtml=opRows.length?`<table class="pr-tbl"><thead><tr><th>Operator</th><th class="n">Shifts</th><th class="n">OK parts / shift</th><th style="width:34%">OEE</th><th class="n">Rej %</th><th class="n">Downtime / shift</th></tr></thead><tbody>
    ${opRows.map(o=>`<tr><td><b>${esc(o.name)}</b></td><td class="n mono">${o.n}</td><td class="n mono">${prodFmt(o.t.okPcs/o.n)}</td>
      <td><div class="pr-viz" style="display:flex;align-items:center;gap:8px" ${prodTip(`${o.name}: OEE ${prodPct(o.t.oee)}\nA ${prodPct(o.t.A)} · P ${prodPct(o.t.P)} · Q ${prodPct(o.t.Q)}`)}><div style="flex:1;height:10px;background:#eef1f7;border-radius:0 4px 4px 0;position:relative"><div style="width:${Math.min(100,o.t.oee*100)}%;height:10px;background:${PROD_VIZ_CAT[0]};border-radius:0 4px 4px 0"></div><div style="position:absolute;left:${target*100}%;top:-3px;height:16px;border-left:2px dashed #374151"></div></div><b class="mono" style="width:44px;text-align:right">${prodPct(o.t.oee,0)}</b></div></td>
      <td class="n mono">${prodPct(rejPct(o.t)??0,2)}</td><td class="n mono">${prodFmt(o.t.downtime/o.n)} min</td></tr>`).join('')}
  </tbody></table><div class="pr-note" style="padding-top:8px">Each shift counts for both of its operators. Dashed mark = target OEE ${prodPct(target,0)}. Operators with few shifts can swing a lot — compare over a month.</div>`
    :'<div class="pr-empty">No operator names on these shift entries.</div>';

  // Per-machine production & rejection % (separate charts, plus combined)
  const xT=bucket==='day'?'Date':bucket==='week'?'Week starting':'Month';
  const perM=mcs.map((m,i)=>{ const pm=keys.map(k=>prodAgg(rows.filter(r=>keyOf(r.s.date)===k&&String(r.s.machineId)===String(m.id)).map(r=>r.c)).t);
    return {m, i, label:prodMachineLabel(m), per:pm, t:prodAgg(rows.filter(r=>String(r.s.machineId)===String(m.id)).map(r=>r.c)).t}; });
  const prodChart=(pm,color,W=640)=>prodColumns(xs,[{name:'OK parts',color,values:pm.map(x=>x.okPcs)}],
    {W,xTitle:xT,yTitle:'OK parts (pcs)',tips:pm.map((x,i)=>`${xs[i]}\n${prodFmt(x.okPcs)} OK parts\n${prodFmt(x.shots)} shots · ${prodFmt(x.castPcs)} pcs cast`)});
  const rejChart=(pm,color,W=640)=>{ const v=pm.map(x=>x.castPcs? rejPct(x) : null);
    return prodLine(xs,v,{W,fmt:x=>prodPct(x,1),color,xTitle:xT,yTitle:'Rejection %',
      tips:pm.map((x,i)=>`${xs[i]}\nRejection ${v[i]==null?'—':prodPct(v[i],2)}\n${prodFmt(x.rejPcs)} rejected of ${prodFmt(x.castPcs-x.offPcs)} pcs`)}); };
  const split=perM.length>1;
  const oeeCol=t.planned&&t.oee<target? PROD_VIZ_BELOW : '';
  const belowKey=`<span><span class="pr-dot" style="background:${PROD_VIZ_BELOW}"></span>below target</span>`;

  return `
  <div class="pr-sec" style="margin-top:4px">Compared with the previous ${span} day${span>1?'s':''}</div>
  <div class="pr-kpis">
    ${prodDeltaKpi('OEE',t.oee,pt?.planned?pt.oee:null,{fmt:v=>prodPct(v),dfmt:pts,color:oeeCol,note:oeeCol?`below target ${prodPct(target,0)}`:''})}
    ${prodDeltaKpi('OK parts',t.okPcs,pt?pt.okPcs:null)}
    ${prodDeltaKpi('Rejection %',cRej,pRej,{fmt:v=>prodPct(v,2),dfmt:pts,better:-1})}
    ${prodDeltaKpi('Downtime',t.downtime/60,pt?pt.downtime/60:null,{fmt:v=>prodFmt(v,1)+' h',better:-1})}
  </div>
  <div class="pr-sec">OEE</div>
  <div class="pr-grid">
    ${prodCard(`OEE by ${bucket}`,`<div class="b">${prodLine(xs,per.map(x=>x.planned?x.oee:null),{yMax:1,name:'OEE',below:target,xTitle:xT,yTitle:'OEE %',ref:{value:target,label:`target ${prodPct(target,0)}`},tips:per.map((x,k)=>x.planned?pctTip(k,x)+(x.oee<target?'\n▼ below target':''):`${xs[k]}: no production`)})}</div>`,
      `overall <span style="font-weight:700;color:${oeeCol||'inherit'}">${prodPct(t.oee)}</span>`)}
    ${prodCard('OEE by machine',`<div class="b">${prodColumns(mOee.map(x=>prodMachineLabel(x.m)),[{name:'OEE',color:PROD_VIZ_CAT[0],values:mOee.map(x=>x.t.oee)}],
      {yMax:1,fmt:v=>prodPct(v,0),xTitle:'Machine',yTitle:'OEE %',colorOf:(i,v)=>v<target?PROD_VIZ_BELOW:'',extraLegend:`<span><span class="pr-dot" style="background:${PROD_VIZ_CAT[0]}"></span>at / above target</span>${belowKey}`,
        ref:{value:target,label:`target ${prodPct(target,0)}`},tips:mOee.map(x=>`${prodMachineLabel(x.m)}\nOEE ${prodPct(x.t.oee)}${x.t.oee<target?'  ▼ below target':''}\nAvailability ${prodPct(x.t.A)}\nPerformance ${prodPct(x.t.P)}\nQuality ${prodPct(x.t.Q)}`)})}</div>`)}
  </div>
  ${prodCard(`OEE heatmap — machine × ${bucket}`,`<div class="b">${heatHtml}</div>`,`vs target ${prodPct(target,0)}`)}
  <div class="pr-sec">Production</div>
  ${prodCard(`Production chart — ${split?'combined (all machines)':esc(perM[0]?.label||'')}`,`<div class="b">${split
      ? prodColumns(xs,okSeries,{W:1300,tips:okTips,xTitle:xT,yTitle:'OK parts (pcs)'})
      : prodChart(per,PROD_VIZ_CAT[0],1300)}</div>`,`${prodFmt(t.okPcs)} OK parts`)}
  ${split?`<div class="pr-grid">${perM.map(x=>prodCard(`Production chart — ${esc(x.label)}`,`<div class="b">${prodChart(x.per,PROD_VIZ_CAT[x.i%PROD_VIZ_CAT.length])}</div>`,`${prodFmt(x.t.okPcs)} OK parts`)).join('')}</div>`:''}
  <div class="pr-sec">Rejection %</div>
  ${prodCard(`Rejection % by ${bucket} — ${split?'combined (all machines)':esc(perM[0]?.label||'')}`,`<div class="b">${rejChart(per,PROD_VIZ_CAT[1],1300)}</div>`,`overall ${prodPct(rejPct(t)??0,2)}`)}
  ${split?`<div class="pr-grid">${perM.map(x=>prodCard(`Rejection % by ${bucket} — ${esc(x.label)}`,`<div class="b">${rejChart(x.per,PROD_VIZ_CAT[x.i%PROD_VIZ_CAT.length])}</div>`,`overall ${prodPct(rejPct(x.t)??0,2)}`)).join('')}</div>`:''}
  <div class="pr-sec">Where the losses are</div>
  <div class="pr-grid">
    ${prodCard('Where the planned time went',`<div class="b">${prodDonut(prodTimeSplit(t),{fmt:v=>prodHrs(v),center:prodPct(t.oee,0),sub:'OEE'})}</div>`,`${prodHrs(t.planned)} planned`)}
    ${prodCard('Downtime by reason',`<div class="b">${downs.length?prodDonut(downs,{fmt:v=>prodHrs(v),center:prodHrs(t.downtime),sub:'downtime'}):'<div class="pr-empty">No downtime recorded.</div>'}</div>`)}
  </div>
  <div class="pr-grid">
    ${prodCard('Rejections by defect',`<div class="b">${defects.length?prodDonut(defects,{fmt:v=>prodFmt(v)+' pcs',center:prodFmt(t.rejPcs),sub:'rejected pcs'}):'<div class="pr-empty">No rejections in this selection.</div>'}</div>`)}
    ${prodCard('Production mix by part',`<div class="b">${partMix.length?prodDonut(partMix,{fmt:v=>prodFmt(v)+' pcs',center:prodFmt(t.okPcs),sub:'OK parts'}):'<div class="pr-empty">No production.</div>'}</div>`)}
  </div>
  <div class="pr-grid">
    ${prodCard('Rejection Pareto',`<div class="b">${prodPareto(Object.entries(agg.byDefect).map(([c,n])=>[ctx.defectByCode[c]?.description||c,n]),{fmt:v=>prodFmt(v)+' pcs',xTitle:'Defect (largest first)'})}</div>`,'fix the tall dark bars first')}
    ${prodCard('Downtime Pareto',`<div class="b">${prodPareto(Object.entries(agg.byDown),{fmt:v=>prodHrs(v),xTitle:'Downtime reason (largest first)'})}</div>`,'fix the tall dark bars first')}
  </div>
  <div class="pr-sec">Shifts &amp; people</div>
  <div class="pr-grid">
    ${prodCard('Shift A vs Shift B',`<div class="b pr-viz">${shiftHtml}</div>`,'(n) = shifts run')}
    ${prodCard('Operator-wise',opHtml,`${opRows.length} operators`)}
  </div>
  ${prodChartsFettling(ctx,fet,rows,{keys,xs,keyOf,xT,bucket,partId:_prodRep.f.partId})}
  <div class="pr-sec">Distributions</div>
  <div class="pr-grid">
    ${prodCard('How OEE is spread across shifts (histogram)',`<div class="b">${prodHist(shiftsP.map(r=>r.c.t.oee),oeeBins,{what:'OEE',xTitle:'OEE of the shift (band)',colorOf:i=>oeeBins[i].hi<=target+1e-9?PROD_VIZ_BELOW:'',
      extraLegend:`<span><span class="pr-dot" style="background:${PROD_VIZ_CAT[0]}"></span>at / above target</span>${belowKey}`})}</div>
      <div class="pr-note">Each bar = how many shifts had an OEE in that band. A tall cluster on the left means many weak shifts, not just one bad day.</div>`,`${shiftsP.length} shifts`)}
    ${prodCard('How rejection % is spread across shifts (histogram)',`<div class="b">${prodHist(shiftsRej,rejBins,{what:'Rejection',xTitle:'Rejection % of the shift (band)'})}</div>
      <div class="pr-note">Each bar = how many shifts had a rejection % in that band. Shifts on the right are the ones to investigate.</div>`,`${shiftsRej.length} shifts`)}
  </div>
  <div class="pr-note" style="padding:0 2px 14px">Hover any bar, point or slice for the numbers. Charts follow the filters above.</div>`;
}

// ── OEE & Losses ─────────────────────────────────────
function prodRepOEE(ctx,rows){
  if(!rows.length) return PROD_EMPTY;
  const agg=prodAgg(rows.map(r=>r.c)), t=agg.t;
  const good=Math.max(0,t.idealMin-t.qualLossMin), speed=t.shotsNoCT?0:t.speedLossMin;
  const split=prodTimeSplit(t).map(x=>[x.label,x.value,x.color]);
  const tot=split.reduce((s,p)=>s+p[1],0)||1;
  const downRows=Object.entries(agg.byDown).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({label:k,value:v,display:prodHrs(v)}));
  const byMachine=ctx.machines.map(m=>({m,a:prodAgg(rows.filter(r=>String(r.s.machineId)===String(m.id)).map(r=>r.c)).t})).filter(x=>x.a.planned);

  const topDown=downRows[0];
  return `
  ${t.shotsNoCT?`<div class="pr-warn">${prodFmt(t.shotsNoCT)} shots are for parts without a target cycle time on that machine, so Performance can't be measured for them — set it in <a href="#" onclick="event.preventDefault();nav('prod-parts')">Part Master</a>.</div>`:''}
  <div class="pr-kpis">
    ${prodKpi('OEE',prodPct(t.oee),`Availability ${prodPct(t.A,0)} · Performance ${prodPct(t.P,0)} · Quality ${prodPct(t.Q,0)}`,prodTier(t.oee,.75,.55))}
    ${prodKpi('OK parts',prodFmt(t.okPcs),`from ${prodFmt(t.shots)} shots`)}
    ${prodKpi('Downtime',prodHrs(t.downtime),topDown?`most: ${esc(topDown.label)}`:'none recorded')}
    ${prodKpi('Cycle time',t.actCT?t.actCT.toFixed(1)+' s':'—',`target ${t.tgtCT?t.tgtCT.toFixed(1)+' s':'not set'}`)}
  </div>
  ${prodCard('Where the planned time went',`<div class="b">
    <div style="display:flex;height:22px;gap:2px;border-radius:6px;overflow:hidden">
      ${split.filter(p=>p[1]>0).map(([l,v,c])=>`<div title="${l}: ${prodHrs(v)} (${prodPct(v/tot)})" style="width:${v/tot*100}%;background:${c}"></div>`).join('')}
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:10px;font-size:12.5px">
      ${split.map(([l,v,c])=>`<div><span class="pr-dot" style="background:${c}"></span>${l} <b>${prodHrs(v)}</b> <span style="color:#6b7280">${prodPct(v/tot,0)}</span></div>`).join('')}
    </div></div>
    <div class="pr-note">Speed loss = running slower than target cycle time or small stops. Cavity down = time lost running with fewer cavities than the die has. Quality loss = time spent on off shots and rejected parts.</div>`,
    `${prodHrs(t.planned)} planned`)}
  <div class="pr-grid">
    ${prodCard('Downtime by reason',`<div class="b">${downRows.length?prodBars(downRows):'<div class="pr-empty">No downtime recorded.</div>'}</div>`,prodHrs(t.downtime))}
    ${prodCard('By machine',`<table class="pr-tbl"><thead><tr><th>Machine</th><th class="n">OEE</th><th class="n">Avail.</th><th class="n">Perf.</th><th class="n">Quality</th><th class="n">OK parts</th></tr></thead>
      <tbody>${byMachine.map(({m,a})=>`<tr><td><b>${esc(prodMachineLabel(m))}</b></td>
        <td class="n mono" style="font-weight:700;color:${prodTier(a.oee,.75,.55)}">${prodPct(a.oee)}</td>
        <td class="n mono">${prodPct(a.A)}</td><td class="n mono">${prodPct(a.P)}</td><td class="n mono">${prodPct(a.Q)}</td>
        <td class="n mono">${prodFmt(a.okPcs)}</td></tr>`).join('')}</tbody></table>`)}
  </div>
  ${prodCard('Shift by shift',`<table class="pr-tbl"><thead><tr><th>Date</th><th>Machine · Shift</th><th class="n">OK parts</th><th class="n">Downtime</th><th class="n">OEE</th><th>Biggest downtime</th></tr></thead>
    <tbody>${rows.map(({s,c},k)=>{ const x=c.t, top=Object.entries(c.byDown).sort((a,b)=>b[1]-a[1])[0], first=k===0||rows[k-1].s.date!==s.date;
      return `<tr class="${first&&k?'grp':''}"><td class="mono">${first?esc(s.date):''}</td>
      <td>${esc(prodMachineLabel(ctx.machineById[s.machineId]))} · ${esc(s.shift)}</td>
      <td class="n mono">${prodFmt(x.okPcs)}</td><td class="n mono">${x.downtime?prodFmt(x.downtime)+' min':'—'}</td>
      <td class="n mono" style="font-weight:700;color:${x.planned?prodTier(x.oee,.75,.55):'#9ca3af'}">${x.planned?prodPct(x.oee):'—'}</td>
      <td style="color:#6b7280">${s.notRun?`⛔ Did not run · ${esc(s.notRun)}`:top?`${esc(top[0])} · ${prodFmt(top[1])} min`:''}</td></tr>`;}).join('')}</tbody></table>`)}`;
}

// ── Rejection ────────────────────────────────────────
function prodRepRejection(ctx,rows){
  if(!rows.length) return PROD_EMPTY;
  const f=_prodRep.f;
  const calcs=rows.map(r=>prodPickPart(r.c,f.partId));
  const agg=prodAgg(calcs), t=agg.t;
  const defRows=Object.entries(agg.byDefect).map(([code,v])=>({label:ctx.defectByCode[code]?.description||code,value:v}));
  if(f.off&&t.offPcs) defRows.push({label:'Off shots (warm-up)',value:t.offPcs});
  defRows.sort((a,b)=>b.value-a.value);
  const partRows=Object.entries(agg.byPart).map(([pid,v])=>({p:ctx.partById[pid],v,ppm:(v.castPcs-v.offPcs)>0?v.rejPcs/(v.castPcs-v.offPcs)*1e6:0})).sort((a,b)=>b.v.rejPcs-a.v.rejPcs);
  const byDate={};
  rows.forEach((r,i)=>{ (byDate[r.s.date]=byDate[r.s.date]||[]).push(calcs[i]); });
  const trend=Object.entries(byDate).map(([d,cs])=>({d,a:prodAgg(cs).t})).sort((a,b)=>b.d.localeCompare(a.d));
  const ppmCol=v=>v>20000?'#dc2626':v>5000?'#d97706':'#16a34a';
  const top=defRows[0];

  return `
  <div class="pr-kpis">
    ${prodKpi('Rejection PPM',prodFmt(t.ppm),`${prodPct(t.rejPct)} of parts incl. off shots`,ppmCol(t.ppm))}
    ${prodKpi('Rejected parts',prodFmt(t.rejPcs),`+ ${prodFmt(t.offPcs)} off-shot pcs`)}
    ${prodKpi('Top defect',top?esc(top.label):'—',top?`${prodFmt(top.value)} pcs · ${prodPct(top.value/(defRows.reduce((s,r)=>s+r.value,0)||1),0)} of rejections`:'no rejections')}
    ${prodKpi('OK parts',prodFmt(t.okPcs),`of ${prodFmt(t.castPcs)} cast`)}
  </div>
  <div class="pr-grid">
    ${prodCard('Rejection Pareto',`<div class="b">${defRows.length?prodBars(defRows,{unit:''}):'<div class="pr-empty">No rejections in this selection.</div>'}</div>`,
      `<label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${f.off?'checked':''} onchange="prodRepSet({off:this.checked})"> include off shots</label>`)}
    ${prodCard('By part',`<table class="pr-tbl"><thead><tr><th>Part</th><th class="n">Cast</th><th class="n">Rejected</th><th class="n">PPM</th><th>Top defect</th></tr></thead>
      <tbody>${partRows.map(({p,v,ppm})=>{ const td=Object.entries(v.rej).sort((a,b)=>b[1]-a[1])[0];
        return `<tr><td><b>${esc(p?.partNumber||'?')}</b></td><td class="n mono">${prodFmt(v.castPcs)}</td>
        <td class="n mono">${prodFmt(v.rejPcs)}</td><td class="n mono" style="font-weight:700;color:${ppmCol(ppm)}">${prodFmt(ppm)}</td>
        <td style="color:#6b7280">${td?esc(ctx.defectByCode[td[0]]?.description||td[0]):''}</td></tr>`;}).join('')}</tbody></table>`)}
  </div>
  ${prodCard('Day by day',`<table class="pr-tbl"><thead><tr><th>Date</th><th class="n">Parts cast</th><th class="n">OK parts</th><th class="n">Rejected</th><th class="n">Off-shot pcs</th><th class="n">Rej %</th><th class="n">PPM</th></tr></thead>
    <tbody>${trend.map(({d,a})=>`<tr><td class="mono">${d}</td><td class="n mono">${prodFmt(a.castPcs)}</td><td class="n mono">${prodFmt(a.okPcs)}</td>
      <td class="n mono">${prodFmt(a.rejPcs)}</td><td class="n mono">${prodFmt(a.offPcs)}</td><td class="n mono">${prodPct(a.rejPct)}</td>
      <td class="n mono" style="font-weight:700;color:${ppmCol(a.ppm)}">${prodFmt(a.ppm)}</td></tr>`).join('')}</tbody></table>
    <div class="pr-note" style="padding-top:10px">PPM = rejected parts ÷ (parts cast − off-shot parts) × 1,000,000. Rej % includes off shots.</div>`)}`;
}

// ── Material ─────────────────────────────────────────
function prodRepMaterial(ctx,rows){
  if(!rows.length) return PROD_EMPTY;
  const f=_prodRep.f, cfg=ctx.cfg;
  const calcs=rows.map(r=>prodPickPart(r.c,f.partId));
  const agg=prodAgg(calcs), t=agg.t;
  const grades=Object.entries(agg.byGrade).filter(([,v])=>v.castPcs).sort((a,b)=>b[1].totalKg-a[1].totalKg);
  const lines=[];
  rows.forEach(({s,c})=>c.runs.forEach(r=>{ if(r.castPcs&&(!f.partId||String(r.partId)===String(f.partId))) lines.push({s,r}); }));
  const basis=cfg.consumptionBasis==='ok'?'OK parts':'all parts cast (incl. rejected & off shots)';
  const loss=prodFmt(cfg.meltLossPct,1)+'%';

  return `
  ${t.shotsNoWt?`<div class="pr-warn">${prodFmt(t.shotsNoWt)} shots are for parts without a net weight and are not counted — set it in <a href="#" onclick="event.preventDefault();nav('prod-parts')">Part Master</a>.</div>`:''}
  <div class="pr-kpis">
    ${prodKpi('Metal consumed',prodFmt(t.totalKg,1)+' kg',`${grades.length} grade${grades.length===1?'':'s'}`)}
    ${prodKpi('Net casting weight',prodFmt(t.netKg,1)+' kg',`${prodFmt(t.castPcs)} parts cast`)}
    ${prodKpi('Melting loss',prodFmt(t.lossKg,1)+' kg',`${loss} of net weight`,'#b45309')}
    ${prodKpi('Average per day',prodFmt(t.totalKg/(new Set(rows.map(r=>r.s.date)).size||1),1)+' kg',`over ${new Set(rows.map(r=>r.s.date)).size} production day${new Set(rows.map(r=>r.s.date)).size===1?'':'s'}`)}
  </div>
  ${prodCard('By grade',`<table class="pr-tbl"><thead><tr><th>Grade</th><th class="n">Parts cast</th><th class="n">Net kg</th><th class="n">Melting loss kg</th><th class="n">Total kg</th></tr></thead>
    <tbody>${grades.map(([g,v])=>`<tr><td><span class="badge" style="background:#FAEEDA;color:#9a5b0f">${esc(g)}</span></td>
      <td class="n mono">${prodFmt(v.castPcs)}</td><td class="n mono">${prodFmt(v.netKg,1)}</td><td class="n mono">${prodFmt(v.lossKg,1)}</td>
      <td class="n mono" style="font-weight:700">${prodFmt(v.totalKg,1)}</td></tr>`).join('')}</tbody></table>`)}
  ${prodCard('By shift',`<table class="pr-tbl"><thead><tr><th>Date</th><th>Machine · Shift</th><th>Part</th><th>Grade</th><th class="n">Parts</th><th class="n">Metal / part</th><th class="n">Total kg</th></tr></thead>
    <tbody>${lines.map(({s,r},k)=>{ const first=k===0||lines[k-1].s.date!==s.date;
      return `<tr class="${first&&k?'grp':''}"><td class="mono">${first?esc(s.date):''}</td><td>${esc(prodMachineLabel(ctx.machineById[s.machineId]))} · ${esc(s.shift)}</td>
      <td>${esc(r.part?.partNumber||'?')}</td><td>${esc(r.grade)}</td><td class="n mono">${prodFmt(r.wt?r.netKg/r.wt:0)}</td>
      <td class="n mono" title="${r.wt?`${prodFmt(r.wt,3)} kg net + ${loss}`:''}">${r.wt?prodFmt(prodMetalPerPc(r.wt,cfg),3)+' kg':'—'}</td>
      <td class="n mono" style="font-weight:700">${prodFmt(r.totalKg,1)}</td></tr>`;}).join('')}</tbody></table>
    <div class="pr-note" style="padding-top:10px">Metal per part = net weight + ${loss} melting loss (e.g. 0.500 kg → ${prodFmt(prodMetalPerPc(0.5,cfg),3)} kg). Counted on ${basis} — change in <a href="#" onclick="event.preventDefault();nav('prod-setup')">Machines &amp; Settings</a>.</div>`)}`;
}

// ── Customer Mix ─────────────────────────────────────
// Share of production per customer (customer comes from the Part Master).
// Three ways to weigh it: OK parts, metal used, or machine time at target
// cycle time (the fairest when parts differ a lot in size / cycle).
const PROD_MIX_BASES=[
  {k:'pcs', l:'OK parts',     unit:'pcs', dp:0},
  {k:'kg',  l:'Metal used',   unit:'kg',  dp:1},
  {k:'hrs', l:'Machine time', unit:'h',   dp:1},
];
function prodRepCustomers(ctx,rows){
  if(!rows.length) return PROD_EMPTY;
  const f=_prodRep.f, basis=PROD_MIX_BASES.find(b=>b.k===f.basis)||PROD_MIX_BASES[0];
  const by={};
  for(const {c} of rows) for(const r of c.runs){
    if(!r.shots) continue;
    const name=(r.part?.customer||'').trim()||'(no customer set)';
    const x=by[name]||(by[name]={name,pcs:0,kg:0,hrs:0,parts:new Set()});
    x.pcs+=r.okPcs; x.kg+=r.totalKg; x.hrs+=r.idealMin/60;
    if(r.part) x.parts.add(r.part.partNumber);
  }
  const list=Object.values(by);
  const tot={pcs:0,kg:0,hrs:0}; list.forEach(x=>{ tot.pcs+=x.pcs; tot.kg+=x.kg; tot.hrs+=x.hrs; });
  list.sort((a,b)=>b[basis.k]-a[basis.k]);
  const share=(x,k)=>tot[k]? x[k]/tot[k] : 0;
  const top=list[0], top2=list.slice(0,2).reduce((s,x)=>s+share(x,basis.k),0);
  const palette=['#0d2f6e','#2f5fb3','#5b8bd6','#8fb1e6','#b9cdef','#d7e2f5'];
  const col=i=>palette[Math.min(i,palette.length-1)];

  return `
  ${list.some(x=>x.name==='(no customer set)')?`<div class="pr-warn">Some parts have no customer — add it in <a href="#" onclick="event.preventDefault();nav('prod-parts')">Part Master</a> so they're counted under the right customer.</div>`:''}
  ${basis.k==='hrs'&&!tot.hrs?`<div class="pr-warn">Machine time needs target cycle times in Part Master.</div>`:''}
  <div class="pr-kpis">
    ${prodKpi('Top customer',top?esc(top.name):'—',top?`${prodPct(share(top,basis.k))} of ${basis.l.toLowerCase()}`:'')}
    ${prodKpi('Top 2 customers',prodPct(top2,0),`of ${basis.l.toLowerCase()}`)}
    ${prodKpi('Customers',String(list.length),`${list.reduce((s,x)=>s+x.parts.size,0)} parts produced`)}
    ${prodKpi('OK parts',prodFmt(tot.pcs),`${prodFmt(tot.kg,0)} kg metal · ${prodFmt(tot.hrs,0)} machine h`)}
  </div>
  ${prodCard('Customer share',`<div class="b">
    <div style="display:flex;height:26px;gap:2px;border-radius:6px;overflow:hidden;margin-bottom:14px">
      ${list.filter(x=>x[basis.k]>0).map((x,i)=>`<div title="${esc(x.name)}: ${prodPct(share(x,basis.k))}" style="width:${share(x,basis.k)*100}%;background:${col(i)}"></div>`).join('')}
    </div>
    ${list.map((x,i)=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px" title="${esc(x.name)}: ${prodFmt(x[basis.k],basis.dp)} ${basis.unit}">
      <div style="width:190px;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="pr-dot" style="background:${col(i)}"></span>${esc(x.name)}</div>
      <div style="flex:1;height:12px;background:#f0f3f9;border-radius:0 4px 4px 0"><div style="width:${share(x,basis.k)*100}%;height:12px;border-radius:0 4px 4px 0;background:${col(i)}"></div></div>
      <div class="mono" style="width:60px;text-align:right;font-weight:700;color:var(--navy)">${prodPct(share(x,basis.k))}</div>
      <div class="mono" style="width:110px;text-align:right;color:#6b7280">${prodFmt(x[basis.k],basis.dp)} ${basis.unit}</div>
    </div>`).join('')}
  </div>`,
  `<span style="display:inline-flex;gap:2px">${PROD_MIX_BASES.map(b=>`<button class="pr-chip ${b.k===basis.k?'on':''}" onclick="prodRepSet({basis:'${b.k}'})">${b.l}</button>`).join('')}</span>`)}
  ${prodCard('By customer',`<table class="pr-tbl"><thead><tr><th>Customer</th><th>Parts</th>
      <th class="n">OK parts</th><th class="n">%</th><th class="n">Metal kg</th><th class="n">%</th><th class="n">Machine h</th><th class="n">%</th></tr></thead>
    <tbody>${list.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td style="color:#6b7280;font-size:12px">${esc([...x.parts].join(', '))}</td>
      <td class="n mono">${prodFmt(x.pcs)}</td><td class="n mono" style="font-weight:700">${prodPct(share(x,'pcs'))}</td>
      <td class="n mono">${prodFmt(x.kg,1)}</td><td class="n mono" style="font-weight:700">${prodPct(share(x,'kg'))}</td>
      <td class="n mono">${prodFmt(x.hrs,1)}</td><td class="n mono" style="font-weight:700">${prodPct(share(x,'hrs'))}</td></tr>`).join('')}</tbody></table>
    <div class="pr-note" style="padding-top:10px">Machine time = shots × target cycle time — how much of the machines' productive time each customer's parts took.</div>`)}`;
}

// ── Capacity ─────────────────────────────────────────
// Available  = working days × shifts × hours (per machine, per month).
// Load       = hours the machine needs for the work, at a given OEE:
//              ideal hours (good parts × target cycle time ÷ cavities) ÷ OEE.
//   • Schedule: monthly pcs per part (Part Master) ÷ cavities × CT.
//   • Last 30 days: OK parts actually made × CT ÷ cavities (from shift entries),
//     averaged per day with entries and scaled to the working days.
// Free       = Available − Load; sellable = free hours × OEE ÷ CT × cavities.
async function prodCapData(ctx){
  const cfg=ctx.cfg;
  const avail=prodN(cfg.workDays)*prodN(cfg.shiftsPerDay)*prodN(cfg.hoursPerShift);
  const target=Math.min(1,Math.max(.01,prodN(cfg.targetOeePct)/100));
  const rows=await prodLoadShifts(ctx,{from:prodDaysAgo(29),to:prodToday()});
  const days=new Set(rows.map(r=>r.s.date)).size;
  const mcs=ctx.machines.filter(m=>m.active!==false).map(m=>{
    const mine=rows.filter(r=>String(r.s.machineId)===String(m.id));
    const t=prodAgg(mine.map(r=>r.c)).t;
    // good-part hours at target cycle time over the last 30 days
    let histIdeal=0;
    for(const {c} of mine) for(const r of c.runs) if(r.ct) histIdeal+=r.okPcs*r.ct/r.dieCav/3600;
    if(days) histIdeal=histIdeal/days*prodN(cfg.workDays);          // per-day average → one month
    const actual=t.oee>0? t.oee : null;
    const sched=ctx.parts.filter(p=>p.active!==false&&prodN(p.monthlySchedule)>0&&String(prodSchedMachine(p,ctx))===String(m.id));
    let schedIdeal=0, noCT=0;
    for(const p of sched){ const ct=prodCT(p,m.id); if(!ct){ noCT++; continue; } schedIdeal+=prodN(p.monthlySchedule)/(prodN(p.cavities)||1)*ct/3600; }
    return {m, actual, schedIdeal, histIdeal, noCT, sched};
  });
  return {avail, target, days, mcs};
}
// Machine a scheduled part is planned on: chosen one, else the first machine with a cycle time
function prodSchedMachine(p,ctx){
  if(p.scheduleMachineId) return p.scheduleMachineId;
  const m=ctx.machines.find(m=>m.active!==false&&prodCT(p,m.id)); return m?.id||'';
}

async function prodRepCapacity(ctx){
  const d=await prodCapData(ctx); window._prodCap=d;
  const {avail,target}=d;
  const free=(ideal,oee)=>oee? avail-ideal/oee : null;
  const cell=(ideal,oee)=>{ if(!oee) return `<td class="n" style="color:#9ca3af">no data</td>`;
    const load=ideal/oee, f=avail-load, u=avail?load/avail:0;
    return `<td class="n"><div class="mono" style="font-weight:700;color:${f<0?'#dc2626':u>.85?'#d97706':'#16a34a'}">${prodFmt(f)} h free</div>
      <div style="font-size:11.5px;color:#6b7280">${prodPct(u,0)} loaded · ${prodFmt(load)} h</div></td>`; };
  const bar=(ideal,oee)=>{ if(!oee) return ''; const u=Math.min(1.2,ideal/oee/avail);
    return `<div style="height:8px;background:#eef1f7;border-radius:4px;overflow:hidden;margin-top:6px"><div style="width:${Math.min(100,u*100)}%;height:8px;background:${u>1?'#dc2626':u>.85?'#d97706':'var(--navy)'}"></div></div>`; };
  const totAvail=avail*d.mcs.length;
  const totFree=(k,oeeFn)=>d.mcs.reduce((s,x)=>{ const o=oeeFn(x); return s+(o? avail-x[k]/o : 0); },0);
  const schedParts=ctx.parts.filter(p=>p.active!==false);
  const machineOpts=p=>ctx.machines.filter(m=>m.active!==false).map(m=>`<option value="${m.id}" ${String(prodSchedMachine(p,ctx))===String(m.id)?'selected':''}>${esc(m.code)}${prodCT(p,m.id)?'':' (no CT)'}</option>`).join('');

  return `
  <div class="pr-kpis">
    ${prodKpi('Machine hours / month',prodFmt(totAvail),`${d.mcs.length} machines × ${prodFmt(avail)} h (${prodFmt(ctx.cfg.workDays)} d × ${prodFmt(ctx.cfg.shiftsPerDay)} × ${prodFmt(ctx.cfg.hoursPerShift)} h)`)}
    ${prodKpi('Free — by schedule',prodFmt(totFree('schedIdeal',()=>target))+' h',`at target OEE ${prodPct(target,0)}`)}
    ${prodKpi('Free — last 30 days',prodFmt(totFree('histIdeal',x=>x.actual))+' h',`at actual OEE · ${d.days} day${d.days===1?'':'s'} with entries`)}
    ${prodKpi('Target OEE',prodPct(target,0),`<a href="#" onclick="event.preventDefault();nav('prod-setup')">change in Settings</a>`)}
  </div>
  ${d.mcs.some(x=>x.noCT)?`<div class="pr-warn">Some scheduled parts have no target cycle time on their machine and are not counted — set it in <a href="#" onclick="event.preventDefault();nav('prod-parts')">Part Master</a>.</div>`:''}
  ${prodCard('Free capacity per machine',`<table class="pr-tbl"><thead><tr><th>Machine</th><th>Based on</th><th class="n">At actual OEE</th><th class="n">At target OEE (${prodPct(target,0)})</th></tr></thead>
    <tbody>${d.mcs.map(x=>`
      <tr class="grp"><td rowspan="2" style="vertical-align:top"><b style="font-size:14px">${esc(x.m.code)}</b><div style="font-size:11.5px;color:#6b7280">${prodFmt(avail)} h / month<br>actual OEE ${x.actual?prodPct(x.actual,0):'—'}</div></td>
        <td>Monthly schedule<div style="font-size:11.5px;color:#6b7280">${x.sched.length} part${x.sched.length===1?'':'s'} · ${prodFmt(x.schedIdeal,1)} h at target CT</div>${bar(x.schedIdeal,target)}</td>
        ${cell(x.schedIdeal,x.actual)}${cell(x.schedIdeal,target)}</tr>
      <tr><td>Last 30 days actual<div style="font-size:11.5px;color:#6b7280">${prodFmt(x.histIdeal,1)} h good-part time / month (avg of ${d.days} day${d.days===1?'':'s'})</div>${bar(x.histIdeal,x.actual)}</td>
        ${cell(x.histIdeal,x.actual)}${cell(x.histIdeal,target)}</tr>`).join('')}</tbody></table>
    <div class="pr-note" style="padding-top:10px">Load = good-part time at target cycle time ÷ OEE. Free = available − load. Green = room to spare, amber = over 85% loaded, red = overloaded.</div>`)}
  ${prodCard('Can I take on a new part?',`<div class="b">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <div class="fg" style="margin:0"><label class="lbl">Machine</label><select class="fc" id="pcap-m" onchange="prodCapCalc()" style="width:140px">${d.mcs.map(x=>`<option value="${x.m.id}">${esc(x.m.code)}</option>`).join('')}</select></div>
      <div class="fg" style="margin:0"><label class="lbl">Cycle time (s / shot)</label><input class="fc" type="number" min="1" id="pcap-ct" value="60" oninput="prodCapCalc()" style="width:130px"></div>
      <div class="fg" style="margin:0"><label class="lbl">Cavities</label><input class="fc" type="number" min="1" id="pcap-cav" value="1" oninput="prodCapCalc()" style="width:90px"></div>
      <div class="fg" style="margin:0"><label class="lbl">Customer wants (pcs / month)</label><input class="fc" type="number" min="0" id="pcap-need" placeholder="optional" oninput="prodCapCalc()" style="width:170px"></div>
    </div>
    <div id="pcap-out" style="margin-top:12px"></div></div>`)}
  ${prodCard('Monthly schedule',`<table class="pr-tbl"><thead><tr><th>Part</th><th>Customer</th><th>Machine</th><th class="n">Cav.</th><th class="n">CT (s)</th><th class="n" style="width:150px">Pcs / month</th><th class="n">Machine h at target OEE</th></tr></thead>
    <tbody>${schedParts.map(p=>{ const mid=prodSchedMachine(p,ctx), ct=prodCT(p,mid), q=prodN(p.monthlySchedule);
      const h=ct&&q? q/(prodN(p.cavities)||1)*ct/3600/target : 0;
      return `<tr><td><b>${esc(p.partNumber)}</b> <span style="color:#6b7280;font-size:12px">${esc(p.partName||'')}</span></td><td>${esc(p.customer||'')}</td>
      <td><select class="fc" style="height:30px;padding:0 6px;width:120px" onchange="prodCapSave(${p.id},{scheduleMachineId:+this.value})">${machineOpts(p)}</select></td>
      <td class="n mono">${prodN(p.cavities)||1}</td><td class="n mono">${ct||'<span style="color:#d97706">—</span>'}</td>
      <td class="n"><input class="fc mono" style="height:30px;text-align:right" type="number" min="0" value="${q||''}" placeholder="0" onchange="prodCapSave(${p.id},{monthlySchedule:prodN(this.value)})"></td>
      <td class="n mono">${h?prodFmt(h,1):'—'}</td></tr>`; }).join('')||`<tr><td colspan="7" class="pr-empty">No parts in Part Master yet.</td></tr>`}</tbody></table>
    <div class="pr-note" style="padding-top:10px">Enter each customer's expected monthly quantity (OK parts). Saved as you type — the capacity above updates.</div>`)}`;
}
async function prodCapSave(id,ch){
  await db.prodParts.update(id,ch);
  const y=window.scrollY; await prodRenderReports(); window.scrollTo(0,y);
}
function prodCapCalc(){
  const d=window._prodCap, out=document.getElementById('pcap-out'); if(!d||!out) return;
  const x=d.mcs.find(v=>String(v.m.id)===document.getElementById('pcap-m').value); if(!x) return;
  const ct=prodN(document.getElementById('pcap-ct').value), cav=prodN(document.getElementById('pcap-cav').value)||1, need=prodN(document.getElementById('pcap-need').value);
  if(!ct){ out.innerHTML=''; return; }
  const cases=[['Schedule','at target OEE',x.schedIdeal,d.target],['Schedule','at actual OEE',x.schedIdeal,x.actual],['Last 30 days','at target OEE',x.histIdeal,d.target],['Last 30 days','at actual OEE',x.histIdeal,x.actual]];
  const needH=need? need/cav*ct/3600 : 0;
  out.innerHTML=`<table class="pr-tbl"><thead><tr><th>Load based on</th><th>Efficiency</th><th class="n">Free hours</th><th class="n">Pcs / month you can add</th>${need?'<th class="n">Hours needed</th><th>Fits?</th>':''}</tr></thead><tbody>${
    cases.map(([b,e,ideal,oee])=>{ if(!oee) return `<tr><td>${b}</td><td>${e}</td><td class="n" colspan="${need?4:2}" style="color:#9ca3af">no production data yet</td></tr>`;
      const f=d.avail-ideal/oee, pcs=Math.max(0,Math.floor(f*oee*3600/ct*cav)), nh=needH/oee;
      return `<tr><td>${b}</td><td>${e} (${prodPct(oee,0)})</td><td class="n mono">${prodFmt(f)} h</td><td class="n mono" style="font-weight:700;color:var(--navy)">${prodFmt(pcs)}</td>
        ${need?`<td class="n mono">${prodFmt(nh)} h</td><td style="font-weight:700;color:${nh<=f?'#16a34a':'#dc2626'}">${nh<=f?'✔ Yes':'✖ No'}${nh<=f?` <span style="font-weight:400;color:#6b7280">(${prodPct(f?nh/f:0,0)} of free time)</span>`:''}</td>`:''}</tr>`; }).join('')
  }</tbody></table>`;
}

// ══════════════════════════════════════════════════════
//  3b. FETTLING — person-wise daily record
//  Fettling runs in a single shift: one entry per date; one row per person × part:
//  qty fettled, qty rejected (+ optional reason) → OK = fettled − rejected.
//  Fettling rejections also come off part stock.
// ══════════════════════════════════════════════════════
const PROD_FET_REASONS=['Fettling damage','Crack','Porosity / blow hole','Non fill','Cold shut','Dimension NG','Other'];
const _prodFet={f:{period:'7d', from:prodDaysAgo(6), to:prodToday()}};

function prodFetTotals(rows){
  const t={qty:0,rej:0};
  for(const r of rows){ t.qty+=prodN(r.qty); t.rej+=Math.min(prodN(r.rej),prodN(r.qty)); }
  t.ok=t.qty-t.rej; t.rejPct=t.qty? t.rej/t.qty : 0;
  return t;
}
async function prodFetLoad(){ return (await db.prodFettling.toArray().catch(()=>[])).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id); }

async function prodRenderFettling(){
  const f=_prodFet.f;
  if(f.period){ const p=PROD_PERIODS.find(x=>x.k===f.period); if(p) [f.from,f.to]=p.range(); }
  const [ctx,all]=await Promise.all([prodCtx(),prodFetLoad()]);
  const inRange=all.filter(e=>e.date>=f.from&&e.date<=f.to);
  setC(`${PROD_REPORT_CSS}
  <div class="pr-top">
    <h2 style="font-size:16px;font-weight:700;color:var(--navy)">🔨 Fettling</h2>
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn btn-o" onclick="_prodRep.tab='fet';nav('prod-reports')">📊 Person-wise report</button>
      <button class="btn btn-p" onclick="prodOpenFettling()">➕ New Fettling Entry</button>
    </div>
  </div>
  <div class="pr-filters">
    ${PROD_PERIODS.map(p=>`<button class="pr-chip ${f.period===p.k?'on':''}" onclick="prodFetSet({period:'${p.k}'})">${p.l}</button>`).join('')}
    <span class="pr-sep"></span>
    <input type="date" value="${f.from}" onchange="prodFetSet({from:this.value,period:''})">
    <span style="color:#9ca3af">–</span>
    <input type="date" value="${f.to}" onchange="prodFetSet({to:this.value,period:''})">
  </div>
  ${prodFetEntries(ctx,inRange)}`);
}
function prodFetSet(ch){
  Object.assign(_prodFet.f,ch);
  if(ch.period){ const p=PROD_PERIODS.find(x=>x.k===ch.period); [_prodFet.f.from,_prodFet.f.to]=p.range(); }
  prodRenderFettling();
}

function prodFetEntries(ctx,entries){
  const t=prodFetTotals(entries.flatMap(e=>e.rows||[]));
  return `
  <div class="pr-kpis">
    ${prodKpi('Parts fettled',prodFmt(t.qty),`${entries.length} entr${entries.length===1?'y':'ies'}`)}
    ${prodKpi('OK',prodFmt(t.ok),'',  '#16a34a')}
    ${prodKpi('Rejected',prodFmt(t.rej),`${prodPct(t.rejPct)} of fettled`,t.rej?'#dc2626':'')}
    ${prodKpi('People',String(new Set(entries.flatMap(e=>(e.rows||[]).map(r=>r.person)).filter(Boolean)).size),'worked in this period')}
  </div>
  ${prodCard('Entries',`<table class="pr-tbl"><thead><tr><th>Date</th><th>People</th><th class="n">Fettled</th><th class="n">OK</th><th class="n">Rejected</th><th class="n">Rej %</th><th>Entered by</th><th></th></tr></thead>
    <tbody>${entries.map(e=>{ const x=prodFetTotals(e.rows||[]);
      return `<tr><td class="mono">${esc(e.date)}</td>
      <td style="font-size:12px;color:#374151">${esc([...new Set((e.rows||[]).map(r=>r.person).filter(Boolean))].join(', '))}</td>
      <td class="n mono">${prodFmt(x.qty)}</td><td class="n mono" style="color:#16a34a;font-weight:600">${prodFmt(x.ok)}</td>
      <td class="n mono" style="color:${x.rej?'#dc2626':''}">${prodFmt(x.rej)}</td><td class="n mono">${prodPct(x.rejPct)}</td>
      <td style="font-size:12px;color:#6b7280">${esc(e.updatedBy||e.createdBy||'')}</td>
      <td style="white-space:nowrap;text-align:right"><button class="btn btn-o btn-xs" onclick="prodOpenFettling(${e.id})">✏️</button>
        <button class="btn btn-r btn-xs" onclick="prodDeleteFettling(${e.id})">🗑️</button></td></tr>`;}).join('')
      ||`<tr><td colspan="8" class="pr-empty">No fettling entries in this period.</td></tr>`}</tbody></table>`)}`;
}

function prodFetPersonReport(ctx,entries,f){
  const rows=entries.flatMap(e=>(e.rows||[]).map(r=>({...r,date:e.date})))
    .filter(r=>(!f.person||r.person===f.person)&&(!f.partId||String(r.partId)===String(f.partId))&&prodN(r.qty)>0);
  if(!rows.length) return `<div class="pr-empty">No fettling recorded for this selection.</div>`;
  const t=prodFetTotals(rows);
  const byPerson={};
  rows.forEach(r=>{ const p=byPerson[r.person||'(no name)']||(byPerson[r.person||'(no name)']={rows:[],parts:{}});
    p.rows.push(r); (p.parts[r.partId]=p.parts[r.partId]||[]).push(r); });
  const persons=Object.entries(byPerson).map(([name,v])=>({name,v,t:prodFetTotals(v.rows)})).sort((a,b)=>b.t.qty-a.t.qty);
  const days=new Set(rows.map(r=>r.date)).size;
  const byPart={};
  rows.forEach(r=>(byPart[r.partId]=byPart[r.partId]||[]).push(r));
  const reasons={};
  rows.forEach(r=>{ if(prodN(r.rej)>0){ const k=r.reason||'Not specified'; reasons[k]=(reasons[k]||0)+Math.min(prodN(r.rej),prodN(r.qty)); } });
  const pn=id=>ctx.partById[id]?.partNumber||'?';
  return `
  <div class="pr-kpis">
    ${prodKpi('Parts fettled',prodFmt(t.qty),`${persons.length} ${persons.length===1?'person':'people'} · ${days} day${days===1?'':'s'}`)}
    ${prodKpi('OK',prodFmt(t.ok),'','#16a34a')}
    ${prodKpi('Rejected',prodFmt(t.rej),`${prodPct(t.rejPct)} of fettled`,t.rej?'#dc2626':'')}
    ${prodKpi('Top output',persons[0]?esc(persons[0].name):'—',persons[0]?`${prodFmt(persons[0].t.qty)} parts`:'')}
  </div>
  ${prodCard('Person-wise',`<table class="pr-tbl"><thead><tr><th>Person</th><th>Part</th><th class="n">Fettled</th><th class="n">OK</th><th class="n">Rejected</th><th class="n">Rej %</th><th class="n">Avg / day</th></tr></thead>
    <tbody>${persons.map(({name,v,t:pt})=>{
      const days=new Set(v.rows.map(r=>r.date)).size;
      return `<tr class="grp" style="background:#f6f8fc"><td><b>${esc(name)}</b></td><td style="color:#6b7280;font-size:12px">${Object.keys(v.parts).length} part${Object.keys(v.parts).length===1?'':'s'} · ${days} day${days===1?'':'s'}</td>
        <td class="n mono" style="font-weight:700">${prodFmt(pt.qty)}</td><td class="n mono" style="font-weight:700;color:#16a34a">${prodFmt(pt.ok)}</td>
        <td class="n mono" style="font-weight:700;color:${pt.rej?'#dc2626':''}">${prodFmt(pt.rej)}</td><td class="n mono" style="font-weight:700">${prodPct(pt.rejPct)}</td>
        <td class="n mono">${prodFmt(days?pt.qty/days:0)}</td></tr>`+
      Object.entries(v.parts).map(([pid,rs])=>{ const x=prodFetTotals(rs);
        return `<tr><td></td><td>${esc(pn(pid))} <span style="color:#6b7280;font-size:12px">${esc(ctx.partById[pid]?.partName||'')}</span></td>
          <td class="n mono">${prodFmt(x.qty)}</td><td class="n mono" style="color:#16a34a">${prodFmt(x.ok)}</td>
          <td class="n mono" style="color:${x.rej?'#dc2626':''}">${prodFmt(x.rej)}</td><td class="n mono">${prodPct(x.rejPct)}</td><td></td></tr>`;}).join('');
    }).join('')}</tbody></table>`)}
  <div class="pr-grid">
    ${prodCard('By part',`<table class="pr-tbl"><thead><tr><th>Part</th><th class="n">Fettled</th><th class="n">OK</th><th class="n">Rejected</th><th class="n">Rej %</th></tr></thead>
      <tbody>${Object.entries(byPart).map(([pid,rs])=>({pid,x:prodFetTotals(rs)})).sort((a,b)=>b.x.qty-a.x.qty).map(({pid,x})=>`<tr>
        <td><b>${esc(pn(pid))}</b></td><td class="n mono">${prodFmt(x.qty)}</td><td class="n mono" style="color:#16a34a">${prodFmt(x.ok)}</td>
        <td class="n mono">${prodFmt(x.rej)}</td><td class="n mono">${prodPct(x.rejPct)}</td></tr>`).join('')}</tbody></table>`)}
    ${prodCard('Rejection reasons',`<div class="b">${Object.keys(reasons).length?prodBars(Object.entries(reasons).map(([k,v])=>({label:k,value:v})).sort((a,b)=>b.value-a.value)):'<div class="pr-empty">No fettling rejections.</div>'}</div>`)}
  </div>`;
}

// ── Entry form ───────────────────────────────────────
async function prodOpenFettling(id=null){
  const [ctx,all,emps]=await Promise.all([prodCtx(),prodFetLoad(),db.hrEmployees.toArray().catch(()=>[])]);
  let rec=id? all.find(e=>e.id===id) : null;
  if(id&&!rec){ toast('Entry not found','d'); return; }
  if(rec) rec=JSON.parse(JSON.stringify(rec));
  else {
    // Same crew usually works every day: start from the latest entry's people and parts, quantities blank
    const last=all[0];
    rec={date:prodToday(), remarks:'',
      rows:(last?.rows||[]).map(r=>({person:r.person,partId:r.partId,qty:'',rej:'',reason:''}))};
    if(!rec.rows.length) rec.rows=Array.from({length:5},()=>({person:'',partId:'',qty:'',rej:'',reason:''}));
  }
  const names=new Set(all.flatMap(e=>(e.rows||[]).map(r=>r.person)).filter(Boolean));
  emps.forEach(e=>e.name&&names.add(e.name));
  window._pf={id,rec,ctx,all,names:[...names].sort()};
  prodFetRenderForm();
}
function prodFetRenderForm(){
  const {rec,ctx,names,id}=window._pf;
  setC(`
  <div class="ph"><h2>🔨 ${id?'Edit':'New'} Fettling Entry</h2><button class="btn btn-o" onclick="prodRenderFettling()">← Back</button></div>
  <datalist id="pf-names">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
  <div style="max-width:1100px">
  <div class="card"><div class="ch"><h5>1 · Date</h5></div><div class="cb" style="max-width:380px">
    <div class="fg" style="margin:0"><label class="lbl">Date *</label><input class="fc" type="date" value="${esc(rec.date)}" onchange="window._pf.rec.date=this.value;prodFetRefresh()"></div>
  </div></div>
  <div class="card"><div class="ch"><h5>2 · Work done by each person</h5>
    <button class="btn btn-o btn-sm" onclick="window._pf.rec.rows.push({person:'',partId:'',qty:'',rej:'',reason:''});prodFetRenderForm()">➕ Add row</button></div>
    <div class="tw"><table>
      <thead><tr><th style="width:26%">Person *</th><th style="width:30%">Part *</th><th style="text-align:right;width:110px">Fettled qty</th><th style="text-align:right;width:110px">Rejected</th><th style="width:170px">Rejection reason</th><th style="text-align:right;width:80px">OK</th><th style="width:40px"></th></tr></thead>
      <tbody>${rec.rows.map((r,i)=>`<tr>
        <td><input class="fc" list="pf-names" value="${esc(r.person)}" oninput="prodFetRow(${i},'person',this.value)"></td>
        <td><select class="fc" onchange="prodFetRow(${i},'partId',this.value?+this.value:'')">${prodOpts(ctx.parts.filter(p=>p.active!==false||String(p.id)===String(r.partId)),r.partId,{val:p=>p.id,label:prodPartLabel,blank:'— select part —'})}</select></td>
        <td><input class="fc mono" style="text-align:right" type="number" min="0" value="${esc(r.qty)}" oninput="prodFetRow(${i},'qty',this.value)"></td>
        <td><input class="fc mono" style="text-align:right" type="number" min="0" value="${esc(r.rej)}" oninput="prodFetRow(${i},'rej',this.value)"></td>
        <td><select class="fc" onchange="prodFetRow(${i},'reason',this.value)">${prodOpts(PROD_FET_REASONS,r.reason,{blank:'—'})}</select></td>
        <td class="mono" style="text-align:right;font-weight:700;color:#16a34a" id="pf-ok-${i}"></td>
        <td><button class="btn btn-r btn-xs" onclick="window._pf.rec.rows.splice(${i},1);prodFetRenderForm()">✕</button></td></tr>`).join('')}
      </tbody>
      <tfoot><tr style="font-weight:700;background:#f6f8fc"><td colspan="2">TOTAL</td><td class="mono" style="text-align:right" id="pf-tq"></td><td class="mono" style="text-align:right;color:#dc2626" id="pf-tr"></td><td></td><td class="mono" style="text-align:right;color:#16a34a" id="pf-to"></td><td></td></tr></tfoot>
    </table></div>
    <div style="font-size:11px;color:#6b7280;padding:6px 12px">OK = fettled − rejected. Rows without a quantity are ignored when saving. Fettling rejections are taken off part stock.</div></div>
  <div class="card"><div class="cb"><div class="fg" style="margin:0"><label class="lbl">Remarks</label><input class="fc" value="${esc(rec.remarks||'')}" oninput="window._pf.rec.remarks=this.value"></div></div></div>
  <div id="pf-warn"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin:4px 0 30px">
    <button class="btn btn-o" onclick="prodRenderFettling()">Cancel</button>
    <button class="btn btn-p" onclick="prodSaveFettling()">💾 Save</button>
  </div></div>`);
  prodFetRefresh();
}
function prodFetRow(i,k,v){ window._pf.rec.rows[i][k]=v; prodFetRefresh(); }
function prodFetRefresh(){
  const {rec,all,id}=window._pf;
  const set=(i,h)=>{ const e=document.getElementById(i); if(e) e.innerHTML=h; };
  rec.rows.forEach((r,i)=>set(`pf-ok-${i}`, r.qty===''?'':prodFmt(Math.max(0,prodN(r.qty)-prodN(r.rej)))));
  const t=prodFetTotals(rec.rows);
  set('pf-tq',prodFmt(t.qty)); set('pf-tr',prodFmt(t.rej)); set('pf-to',prodFmt(t.ok));
  const warn=[];
  if(rec.rows.some(r=>prodN(r.rej)>prodN(r.qty))) warn.push('A row has more rejected than fettled.');
  if(!id&&all.some(e=>e.date===rec.date)) warn.push('There is already a fettling entry for this date — edit that one instead.');
  set('pf-warn',warn.map(w=>`<div class="alert al-w">⚠️ ${w}</div>`).join(''));
}
async function prodSaveFettling(){
  const {rec,all,id}=window._pf;
  if(!rec.date){ toast('Date is required','d'); return; }
  const rows=rec.rows.filter(r=>prodN(r.qty)>0||prodN(r.rej)>0);
  if(!rows.length){ toast('Enter at least one quantity','d'); return; }
  if(rows.some(r=>!String(r.person||'').trim()||!r.partId)){ toast('Every row with a quantity needs a person and a part','d'); return; }
  if(rows.some(r=>prodN(r.rej)>prodN(r.qty))){ toast('Rejected can\'t be more than fettled','d'); return; }
  if(!id&&all.some(e=>e.date===rec.date)){ toast('A fettling entry already exists for this date — edit that one instead','d'); return; }
  const clean={date:rec.date, remarks:(rec.remarks||'').trim(),
    rows:rows.map(r=>({person:String(r.person).trim(), partId:+r.partId, qty:prodN(r.qty), rej:prodN(r.rej), reason:prodN(r.rej)>0?(r.reason||''):''})),
    updatedAt:new Date().toISOString(), updatedBy:Auth.user?.name||''};
  let ok;
  if(id) ok=await db.prodFettling.update(id,clean);
  else { clean.createdAt=clean.updatedAt; clean.createdBy=clean.updatedBy; ok=await db.prodFettling.add(clean); }
  if(!ok){ toast('Save failed — check your connection and try again','d'); return; }
  toast('✅ Fettling entry saved');
  prodRenderFettling();
}
async function prodDeleteFettling(id){
  if(!confirm('Delete this fettling entry?')) return;
  await db.prodFettling.delete(id);
  toast('🗑️ Fettling entry deleted');
  prodRenderFettling();
}

// ══════════════════════════════════════════════════════
//  4. STOCK — raw material (by grade) and parts
//  RM:    opening / adjustments + lots received (kg) − metal consumed
//  Parts: opening / adjustments + OK parts produced − dispatched
// ══════════════════════════════════════════════════════
async function prodRenderStock(f={}){
  const ctx=await prodCtx();
  const asOn=f.asOn||prodToday();
  const [shiftRows,disp,adj,fet]=await Promise.all([
    prodLoadShifts(ctx,{to:asOn}), db.prodDispatch.toArray().catch(()=>[]), db.prodStockAdj.toArray().catch(()=>[]),
    db.prodFettling.toArray().catch(()=>[])]);
  const agg=prodAgg(shiftRows.map(r=>r.c));
  const lots=ctx.lots.filter(l=>(l.date||'')<=asOn);
  const noWt=lots.filter(l=>!prodN(l.weightKg));
  const adjIn=adj.filter(a=>(a.date||'')<=asOn);

  const rm={};
  const g=k=>rm[k]||(rm[k]={adj:0,recv:0,used:0});
  lots.forEach(l=>g(l.grade||'—').recv+=prodN(l.weightKg));
  adjIn.filter(a=>a.kind==='rm').forEach(a=>g(a.grade||'—').adj+=prodN(a.qty));
  Object.entries(agg.byGrade).forEach(([k,v])=>g(k).used+=v.totalKg);

  const pt={};
  const p=k=>pt[k]||(pt[k]={adj:0,made:0,disp:0,fet:0,fetRej:0});
  Object.entries(agg.byPart).forEach(([k,v])=>p(k).made+=v.okPcs);
  disp.filter(d=>(d.date||'')<=asOn).forEach(d=>p(d.partId).disp+=prodN(d.qty));
  adjIn.filter(a=>a.kind==='part').forEach(a=>p(a.partId).adj+=prodN(a.qty));
  fet.filter(e=>(e.date||'')<=asOn).forEach(e=>(e.rows||[]).forEach(r=>{ const x=p(r.partId); x.fet+=prodN(r.qty); x.fetRej+=Math.min(prodN(r.rej),prodN(r.qty)); }));

  const bal=(v,unit,dp)=>`<td class="mono" style="text-align:right;font-weight:700;color:${v<0?'#dc2626':'#0d2f6e'}">${prodFmt(v,dp)}${unit}</td>`;
  setC(`
  <div class="ph"><h2>📦 Stock — Raw Material &amp; Parts</h2>
    <div style="display:flex;gap:8px;align-items:end">
      <div class="fg" style="margin:0"><label class="lbl">As on</label><input class="fc" type="date" id="pst-ason" value="${asOn}" onchange="prodRenderStock({asOn:this.value})"></div>
      <button class="btn btn-o" onclick="prodOpenAdj()">± Stock adjustment</button>
      <button class="btn btn-p" onclick="nav('prod-dispatch')">🚚 Dispatch</button>
    </div></div>
  ${noWt.length?`<div class="alert al-w"><span>⚠️ ${noWt.length} raw material lot${noWt.length>1?'s have':' has'} no weight and ${noWt.length>1?'are':'is'} not counted as received: ${noWt.slice(0,8).map(l=>esc(l.lotNumber)).join(', ')}${noWt.length>8?'…':''}. Add the weight in the <a href="#" onclick="event.preventDefault();nav('rm-register')">Lot Register</a>.</span></div>`:''}
  <div class="card"><div class="ch"><h5>Raw material stock by grade (kg)</h5></div><div class="tw"><table>
    <thead><tr><th>Grade</th><th style="text-align:right">Opening / adj.</th><th style="text-align:right">+ Received (lots)</th><th style="text-align:right">− Consumed</th><th style="text-align:right">= Balance</th></tr></thead>
    <tbody>${Object.entries(rm).sort().map(([k,v])=>`<tr><td><span class="badge" style="background:#FAEEDA;color:#BA7517">${esc(k)}</span></td>
      <td class="mono" style="text-align:right">${prodFmt(v.adj,1)}</td><td class="mono" style="text-align:right">${prodFmt(v.recv,1)}</td>
      <td class="mono" style="text-align:right">${prodFmt(v.used,1)}</td>${bal(v.adj+v.recv-v.used,' kg',1)}</tr>`).join('')||prodEmpty(5,'No raw material data yet.')}</tbody>
  </table><div style="font-size:11px;color:#6b7280;padding:6px 12px">Consumed = metal used per shift entries (net weight + ${prodFmt(ctx.cfg.meltLossPct,1)}% melting loss). Start with an "Opening Stock" adjustment per grade from your last physical count.</div></div></div>
  <div class="card"><div class="ch"><h5>Part stock (castings, pcs)</h5></div><div class="tw"><table>
    <thead><tr><th>Part</th><th>Grade</th><th style="text-align:right">Opening / adj.</th><th style="text-align:right">+ OK produced</th><th style="text-align:right">− Fettling rejected</th><th style="text-align:right">− Dispatched</th><th style="text-align:right">= Balance</th><th style="text-align:right" title="OK castings produced but not yet fettled">of which not fettled</th></tr></thead>
    <tbody>${Object.entries(pt).map(([k,v])=>({part:ctx.partById[k],v})).sort((a,b)=>String(a.part?.partNumber).localeCompare(String(b.part?.partNumber))).map(({part,v})=>`<tr>
      <td>${esc(prodPartLabel(part))}</td><td>${esc(part?.grade||'')}</td>
      <td class="mono" style="text-align:right">${prodFmt(v.adj)}</td><td class="mono" style="text-align:right">${prodFmt(v.made)}</td>
      <td class="mono" style="text-align:right">${prodFmt(v.fetRej)}</td>
      <td class="mono" style="text-align:right">${prodFmt(v.disp)}</td>${bal(v.adj+v.made-v.fetRej-v.disp,'',0)}
      <td class="mono" style="text-align:right;color:#6b7280">${prodFmt(Math.max(0,v.made-v.fet))}</td></tr>`).join('')||prodEmpty(8,'No part movements yet.')}</tbody>
  </table></div></div>
  <div class="card"><div class="ch"><h5>Stock adjustments</h5></div><div class="tw"><table>
    <thead><tr><th>Date</th><th>Type</th><th>Item</th><th style="text-align:right">Qty</th><th>Reason</th><th>Remark</th><th>By</th><th></th></tr></thead>
    <tbody>${adj.sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(a=>`<tr><td class="mono">${esc(a.date)}</td>
      <td>${a.kind==='rm'?'Raw material':'Part'}</td>
      <td>${esc(a.kind==='rm'?a.grade:prodPartLabel(ctx.partById[a.partId]))}</td>
      <td class="mono" style="text-align:right;color:${prodN(a.qty)<0?'#dc2626':'#16a34a'}">${prodN(a.qty)>0?'+':''}${prodFmt(prodN(a.qty),a.kind==='rm'?1:0)}${a.kind==='rm'?' kg':''}</td>
      <td>${esc(a.reason||'')}</td><td style="font-size:12px">${esc(a.remark||'')}</td><td style="font-size:12px">${esc(a.createdBy||'')}</td>
      <td><button class="btn btn-r btn-xs" onclick="prodDelAdj(${a.id})">🗑️</button></td></tr>`).join('')||prodEmpty(8,'No adjustments.')}</tbody>
  </table></div></div>`);
}
async function prodOpenAdj(){
  const ctx=await prodCtx();
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='pad-ov';
  ov.innerHTML=`<div class="modal" style="width:460px">
    <h3>Stock adjustment</h3>
    <div class="fg"><label class="lbl">Type</label><select class="fc" id="pad-kind" onchange="document.getElementById('pad-g').style.display=this.value==='rm'?'':'none';document.getElementById('pad-p').style.display=this.value==='rm'?'none':''">
      <option value="rm">Raw material (kg)</option><option value="part">Part (pcs)</option></select></div>
    <div class="fg" id="pad-g"><label class="lbl">Grade</label><select class="fc" id="pad-grade">${prodOpts(ctx.grades,'')}</select></div>
    <div class="fg" id="pad-p" style="display:none"><label class="lbl">Part</label><select class="fc" id="pad-part">${prodOpts(ctx.parts,'',{val:p=>p.id,label:prodPartLabel})}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Date</label><input class="fc" type="date" id="pad-date" value="${prodToday()}"></div>
      <div class="fg"><label class="lbl">Qty (+ add / − remove)</label><input class="fc" type="number" step="any" id="pad-qty"></div>
    </div>
    <div class="fg"><label class="lbl">Reason</label><select class="fc" id="pad-reason">${prodOpts(PROD_ADJ_REASONS,'Opening Stock')}</select></div>
    <div class="fg"><label class="lbl">Remark</label><input class="fc" id="pad-remark"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-o" onclick="prodClose('pad-ov')">Cancel</button><button class="btn btn-p" onclick="prodSaveAdj()">💾 Save</button></div>
  </div>`;
  document.body.appendChild(ov);
}
async function prodSaveAdj(){
  const v=id=>document.getElementById(id).value;
  const kind=v('pad-kind'), qty=prodN(v('pad-qty'));
  if(!qty){ toast('Enter a quantity','d'); return; }
  const rec={kind, date:v('pad-date')||prodToday(), qty, reason:v('pad-reason'), remark:v('pad-remark').trim(), createdBy:Auth.user?.name||''};
  if(kind==='rm'){ rec.grade=v('pad-grade'); if(!rec.grade){ toast('Select a grade','d'); return; } }
  else { rec.partId=+v('pad-part'); if(!rec.partId){ toast('Select a part','d'); return; } }
  if(!await db.prodStockAdj.add(rec)){ toast('Save failed','d'); return; }
  prodClose('pad-ov'); toast('✅ Adjustment saved');
  prodRenderStock({asOn:document.getElementById('pst-ason')?.value});
}
async function prodDelAdj(id){
  if(!confirm('Delete this stock adjustment?')) return;
  await db.prodStockAdj.delete(id); prodRenderStock({asOn:document.getElementById('pst-ason')?.value});
}

// ══════════════════════════════════════════════════════
//  5. DISPATCH REGISTER
// ══════════════════════════════════════════════════════
async function prodRenderDispatch(f={}){
  const ctx=await prodCtx();
  f={from:f.from||prodToday().slice(0,8)+'01', to:f.to||prodToday(), partId:f.partId||''};
  const all=await db.prodDispatch.toArray().catch(()=>[]);
  const rows=all.filter(d=>d.date>=f.from&&d.date<=f.to&&(!f.partId||String(d.partId)===String(f.partId)))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  const tot=rows.reduce((s,d)=>s+prodN(d.qty),0);
  setC(`
  <div class="ph"><h2>🚚 Dispatch Register</h2><button class="btn btn-p" onclick="prodOpenDispatch()">➕ New Dispatch</button></div>
  ${prodFilterBar('pdp',f,ctx,{machine:false,shift:false,part:true,onApply:'prodRenderDispatch'})}
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Date</th><th>Part</th><th style="text-align:right">Qty</th><th>Customer</th><th>Invoice / Challan</th><th>Remark</th><th></th></tr></thead>
    <tbody>${rows.map(d=>`<tr><td class="mono">${esc(d.date)}</td><td>${esc(prodPartLabel(ctx.partById[d.partId]))}</td>
      <td class="mono" style="text-align:right;font-weight:600">${prodFmt(prodN(d.qty))}</td><td>${esc(d.customer||'')}</td>
      <td class="mono">${esc(d.invoice||'')}</td><td style="font-size:12px">${esc(d.remark||'')}</td>
      <td style="white-space:nowrap"><button class="btn btn-o btn-xs" onclick="prodOpenDispatch(${d.id})">✏️</button>
        <button class="btn btn-r btn-xs" onclick="prodDelDispatch(${d.id})">🗑️</button></td></tr>`).join('')||prodEmpty(7,'No dispatches in this range.')}</tbody>
    ${rows.length?`<tfoot><tr style="font-weight:700"><td colspan="2">TOTAL</td><td class="mono" style="text-align:right">${prodFmt(tot)}</td><td colspan="4"></td></tr></tfoot>`:''}
  </table></div></div>`);
}
async function prodOpenDispatch(id=null){
  const ctx=await prodCtx();
  const d=id? await db.prodDispatch.get(id) : null;
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='pdx-ov';
  ov.innerHTML=`<div class="modal" style="width:480px">
    <h3>${d?'Edit':'New'} Dispatch</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Date *</label><input class="fc" type="date" id="pdx-date" value="${esc(d?.date||prodToday())}"></div>
      <div class="fg"><label class="lbl">Qty (pcs) *</label><input class="fc" type="number" min="1" id="pdx-qty" value="${esc(d?.qty??'')}"></div>
    </div>
    <div class="fg"><label class="lbl">Part *</label><select class="fc" id="pdx-part" onchange="const p=(window._pdxParts||{})[this.value];if(p&&!document.getElementById('pdx-cust').value)document.getElementById('pdx-cust').value=p.customer||''">${prodOpts(ctx.parts,d?.partId,{val:p=>p.id,label:prodPartLabel,blank:'— select —'})}</select></div>
    <div class="fg"><label class="lbl">Customer</label><input class="fc" id="pdx-cust" value="${esc(d?.customer||'')}"></div>
    <div class="fg"><label class="lbl">Invoice / Challan No.</label><input class="fc" id="pdx-inv" value="${esc(d?.invoice||'')}"></div>
    <div class="fg"><label class="lbl">Remark</label><input class="fc" id="pdx-rem" value="${esc(d?.remark||'')}"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-o" onclick="prodClose('pdx-ov')">Cancel</button><button class="btn btn-p" onclick="prodSaveDispatch(${id||'null'})">💾 Save</button></div>
  </div>`;
  window._pdxParts=ctx.partById;
  document.body.appendChild(ov);
}
async function prodSaveDispatch(id){
  const v=x=>document.getElementById(x).value;
  const rec={date:v('pdx-date'), partId:+v('pdx-part'), qty:prodN(v('pdx-qty')), customer:v('pdx-cust').trim(), invoice:v('pdx-inv').trim(), remark:v('pdx-rem').trim()};
  if(!rec.date||!rec.partId||rec.qty<=0){ toast('Date, part and quantity are required','d'); return; }
  const ok=id? await db.prodDispatch.update(id,rec) : await db.prodDispatch.add({...rec,createdBy:Auth.user?.name||''});
  if(!ok){ toast('Save failed','d'); return; }
  prodClose('pdx-ov'); toast('✅ Dispatch saved'); prodRenderDispatch();
}
async function prodDelDispatch(id){
  if(!confirm('Delete this dispatch?')) return;
  await db.prodDispatch.delete(id); prodRenderDispatch();
}

// ══════════════════════════════════════════════════════
//  6. PART MASTER (production data per part)
// ══════════════════════════════════════════════════════
async function prodRenderParts(){
  const ctx=await prodCtx();
  const mcs=ctx.machines;
  setC(`
  <div class="ph"><h2>🔩 Production Part Master</h2>
    <div style="display:flex;gap:8px"><button class="btn btn-o" onclick="prodImportPqParts()">⤓ Import from Process Quality parts</button>
    <button class="btn btn-p" onclick="prodOpenPart()">➕ Add Part</button></div></div>
  <div class="alert al-w" style="background:#f6f8fc;border-color:var(--border);color:#374151">ℹ️ Net weight drives metal consumption; target cycle time (seconds per shot, per machine) drives Performance / OEE (target time per part = cycle time ÷ cavities, so running with a cavity down shows as a loss).</div>
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Part No.</th><th>Part Name</th><th>Customer</th><th>Grade</th><th style="text-align:right">Net wt (kg)</th><th style="text-align:right">Metal/pc +${prodFmt(ctx.cfg.meltLossPct,1)}% (kg)</th><th style="text-align:right">Cavities</th>
      ${mcs.map(m=>`<th style="text-align:right">CT ${esc(m.code)} (s)</th>`).join('')}<th>Status</th><th></th></tr></thead>
    <tbody>${ctx.parts.map(p=>`<tr ${p.active===false?'style="opacity:.55"':''}>
      <td class="mono" style="font-weight:700">${esc(p.partNumber)}</td><td>${esc(p.partName||'')}</td><td>${esc(p.customer||'')}</td>
      <td>${esc(p.grade||'')}</td>
      <td class="mono" style="text-align:right;${prodN(p.netWeightKg)?'':'color:#d97706'}">${prodN(p.netWeightKg)?prodFmt(p.netWeightKg,3):'not set'}</td>
      <td class="mono" style="text-align:right">${prodN(p.netWeightKg)?prodFmt(prodMetalPerPc(p.netWeightKg,ctx.cfg),3):'—'}</td>
      <td class="mono" style="text-align:right">${prodN(p.cavities)||1}</td>
      ${mcs.map(m=>`<td class="mono" style="text-align:right">${prodCT(p,m.id)||'—'}</td>`).join('')}
      <td>${p.active===false?'Inactive':'Active'}</td>
      <td style="white-space:nowrap"><button class="btn btn-o btn-xs" onclick="prodOpenPart(${p.id})">✏️</button>
        <button class="btn btn-r btn-xs" onclick="prodDelPart(${p.id})">🗑️</button></td></tr>`).join('')||prodEmpty(9+mcs.length,'No parts yet.')}</tbody>
  </table></div></div>`);
}
async function prodOpenPart(id=null){
  const ctx=await prodCtx();
  const p=id? ctx.partById[id] : null;
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='ppt-ov';
  ov.innerHTML=`<div class="modal" style="width:560px">
    <h3>${p?'Edit':'Add'} Part</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Part Number *</label><input class="fc mono" id="ppt-pn" value="${esc(p?.partNumber||'')}"></div>
      <div class="fg"><label class="lbl">Part Name *</label><input class="fc" id="ppt-name" value="${esc(p?.partName||'')}"></div>
      <div class="fg"><label class="lbl">Customer</label><input class="fc" id="ppt-cust" value="${esc(p?.customer||'')}"></div>
      <div class="fg"><label class="lbl">Default Grade</label><select class="fc" id="ppt-grade">${prodOpts([...new Set([...ctx.grades,p?.grade].filter(Boolean))],p?.grade,{blank:'—'})}</select></div>
      <div class="fg"><label class="lbl">Net weight per part (kg) *</label><input class="fc" type="number" step="0.001" min="0" id="ppt-wt" value="${esc(p?.netWeightKg??'')}"></div>
      <div class="fg"><label class="lbl">Cavities in die</label><input class="fc" type="number" min="1" id="ppt-cav" value="${esc(p?.cavities??1)}"></div>
      ${ctx.machines.map(m=>`<div class="fg"><label class="lbl">Target cycle time on ${esc(m.code)} (sec/shot)</label><input class="fc" type="number" step="0.1" min="0" data-ct="${m.id}" value="${esc((p?.cycleTimes||{})[m.id]??'')}" placeholder="blank = not run on this machine"></div>`).join('')}
      <div class="fg"><label class="lbl">Status</label><select class="fc" id="ppt-act"><option value="1" ${p?.active!==false?'selected':''}>Active</option><option value="0" ${p?.active===false?'selected':''}>Inactive</option></select></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-o" onclick="prodClose('ppt-ov')">Cancel</button><button class="btn btn-p" onclick="prodSavePart(${id||'null'})">💾 Save</button></div>
  </div>`;
  document.body.appendChild(ov);
}
async function prodSavePart(id){
  const v=x=>document.getElementById(x).value;
  const cycleTimes={};
  document.querySelectorAll('#ppt-ov [data-ct]').forEach(i=>{ if(prodN(i.value)>0) cycleTimes[i.dataset.ct]=prodN(i.value); });
  const rec={partNumber:v('ppt-pn').trim(), partName:v('ppt-name').trim(), customer:v('ppt-cust').trim(), grade:v('ppt-grade'),
    netWeightKg:prodN(v('ppt-wt')), cavities:prodN(v('ppt-cav'))||1, cycleTimes, active:v('ppt-act')==='1'};
  if(!rec.partNumber||!rec.partName){ toast('Part number and name are required','d'); return; }
  const parts=await db.prodParts.toArray();
  if(parts.some(x=>x.id!==id&&String(x.partNumber).toLowerCase()===rec.partNumber.toLowerCase())){ toast('That part number already exists','d'); return; }
  const ok=id? await db.prodParts.update(id,rec) : await db.prodParts.add(rec);
  if(!ok){ toast('Save failed','d'); return; }
  prodClose('ppt-ov'); toast('✅ Part saved'); prodRenderParts();
}
async function prodDelPart(id){
  const used=(await db.prodShifts.toArray()).some(s=>(s.runs||[]).some(r=>String(r.partId)===String(id)));
  if(used){ toast('This part has production entries — set it Inactive instead of deleting','w'); return; }
  if(!confirm('Delete this part?')) return;
  await db.prodParts.delete(id); prodRenderParts();
}
async function prodImportPqParts(){
  const [pq,mine]=await Promise.all([_api('GET','/api/qms2/pq_parts').catch(()=>[]),db.prodParts.toArray()]);
  const have=new Set(mine.map(p=>String(p.partNumber).toLowerCase()));
  const todo=(Array.isArray(pq)?pq:[]).filter(p=>p.partNumber&&!have.has(String(p.partNumber).toLowerCase()));
  if(!todo.length){ toast('No new parts to import'); return; }
  if(!confirm(`Import ${todo.length} part(s) from Process Quality? You'll still need to enter net weight and cycle times.`)) return;
  for(const p of todo) await db.prodParts.add({partNumber:p.partNumber, partName:p.partName||'', customer:p.customer||'', grade:p.material||'', netWeightKg:0, cavities:1, cycleTimes:{}, active:true});
  toast(`✅ Imported ${todo.length} part(s)`); prodRenderParts();
}

// ══════════════════════════════════════════════════════
//  7. MACHINES, DEFECT CODES & SETTINGS
// ══════════════════════════════════════════════════════
async function prodRenderSetup(){
  const ctx=await prodCtx(), cfg=ctx.cfg;
  setC(`
  <div class="ph"><h2>🛠️ Production — Machines &amp; Settings</h2></div>
  <div class="card"><div class="ch"><h5>Calculation settings</h5></div><div class="cb" style="display:grid;grid-template-columns:1fr 1.6fr 1fr auto;gap:12px;align-items:end">
    <div class="fg" style="margin:0"><label class="lbl">Melting loss %</label><input class="fc" type="number" step="0.1" min="0" id="pcfg-loss" value="${esc(cfg.meltLossPct)}"></div>
    <div class="fg" style="margin:0"><label class="lbl">Metal consumption basis</label><select class="fc" id="pcfg-basis">
      <option value="all" ${cfg.consumptionBasis!=='ok'?'selected':''}>All parts cast (rejects &amp; off shots are metal used)</option>
      <option value="ok" ${cfg.consumptionBasis==='ok'?'selected':''}>OK parts only (rejects are remelted)</option></select></div>
    <div class="fg" style="margin:0"><label class="lbl">Default planned min / shift</label><input class="fc" type="number" min="1" id="pcfg-plan" value="${esc(cfg.plannedMinutes)}"></div>
    <button class="btn btn-p" onclick="prodSaveCfg()">💾 Save</button>
    <div class="fg" style="margin:0"><label class="lbl">Working days / month</label><input class="fc" type="number" min="1" max="31" id="pcfg-days" value="${esc(cfg.workDays)}"></div>
    <div class="fg" style="margin:0"><label class="lbl">Shifts / day × hours / shift</label><div style="display:flex;gap:6px;align-items:center">
      <input class="fc" type="number" min="1" max="3" id="pcfg-shifts" value="${esc(cfg.shiftsPerDay)}"><span>×</span>
      <input class="fc" type="number" min="1" max="24" id="pcfg-hrs" value="${esc(cfg.hoursPerShift)}"><span style="white-space:nowrap;font-size:12px;color:#6b7280">= ${prodFmt(prodN(cfg.workDays)*prodN(cfg.shiftsPerDay)*prodN(cfg.hoursPerShift))} h / machine / month</span></div></div>
    <div class="fg" style="margin:0"><label class="lbl">Target OEE % (capacity planning)</label><input class="fc" type="number" min="1" max="100" id="pcfg-oee" value="${esc(cfg.targetOeePct)}"></div>
    <div></div>
  </div></div>
  <div style="display:grid;grid-template-columns:1fr 1.3fr;gap:14px;align-items:start">
    <div class="card"><div class="ch"><h5>Machines</h5><button class="btn btn-o btn-sm" onclick="prodOpenMachine()">➕ Add</button></div><div class="tw"><table>
      <thead><tr><th>Code</th><th>Name</th><th>Tonnage</th><th>Status</th><th></th></tr></thead>
      <tbody>${ctx.machines.map(m=>`<tr><td class="mono" style="font-weight:700">${esc(m.code)}</td><td>${esc(m.name||'')}</td><td class="mono">${esc(m.tonnage||'')}</td>
        <td>${m.active===false?'Inactive':'Active'}</td><td><button class="btn btn-o btn-xs" onclick="prodOpenMachine(${m.id})">✏️</button></td></tr>`).join('')}</tbody>
    </table></div></div>
    <div class="card"><div class="ch"><h5>Rejection / defect codes</h5><button class="btn btn-o btn-sm" onclick="prodOpenDefect()">➕ Add</button></div><div class="tw"><table>
      <thead><tr><th>Code</th><th>Description</th><th title="Shown as a column on the shift entry form">On entry form</th><th>Order</th><th></th></tr></thead>
      <tbody>${ctx.defects.map(d=>`<tr><td class="mono" style="font-weight:700">${esc(d.code)}</td><td>${esc(d.description)}</td>
        <td>${d.onSheet?'✔':''}</td><td class="mono">${esc(d.order??'')}</td>
        <td style="white-space:nowrap"><button class="btn btn-o btn-xs" onclick="prodOpenDefect(${d.id})">✏️</button>
          <button class="btn btn-r btn-xs" onclick="prodDelDefect(${d.id})">🗑️</button></td></tr>`).join('')}</tbody>
    </table></div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="ch"><h5>Sample data</h5></div><div class="cb" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
    <div style="flex:1;min-width:280px;font-size:12.5px;color:#374151">
      Fill the last 10 days with made-up shift and fettling entries so you can see how the reports look. They use their own
      <b>SAMPLE-</b> parts (Sample Customer A/B/C), so your real parts and their stock are not touched.
      <span id="pdemo-status" style="color:#6b7280"></span>
    </div>
    <button class="btn btn-o" onclick="prodDemoGenerate()">🧪 Generate 10 days of sample data</button>
    <button class="btn btn-r" onclick="prodDemoDelete()">🗑️ Delete sample data</button>
  </div></div>`);
  prodDemoStatus();
}

// ── Sample data: tagged demo:true so it can be removed exactly ──
const PROD_DEMO_PARTS=[
  {partNumber:'SAMPLE-101', partName:'Spacer Heater (sample)', customer:'Sample Customer A', grade:'A380',  netWeightKg:0.15, cavities:2, ct:[55,50], sched:30000, mi:0},
  {partNumber:'SAMPLE-102', partName:'Bracket (sample)',       customer:'Sample Customer B', grade:'ADC12', netWeightKg:0.42, cavities:1, ct:[62,58], sched:5000,  mi:0},
  {partNumber:'SAMPLE-201', partName:'Housing (sample)',       customer:'Sample Customer C', grade:'ADC12', netWeightKg:0.85, cavities:1, ct:[80,72], sched:6000,  mi:1},
  {partNumber:'SAMPLE-202', partName:'Cover (sample)',         customer:'Sample Customer A', grade:'A380',  netWeightKg:0.50, cavities:2, ct:[70,64], sched:20000, mi:1},
];
async function prodDemoStatus(){
  const [shifts,parts,fet]=await Promise.all([db.prodShifts.toArray().catch(()=>[]),db.prodParts.toArray().catch(()=>[]),db.prodFettling.toArray().catch(()=>[])]);
  const n=shifts.filter(s=>s.demo).length, p=parts.filter(x=>x.demo).length, f=fet.filter(x=>x.demo).length;
  const el=document.getElementById('pdemo-status');
  if(el) el.textContent=n||p||f? ` Currently: ${n} sample shift entries, ${f} sample fettling entries, ${p} sample parts.` : ' No sample data at the moment.';
}
async function prodDemoGenerate(){
  const ctx=await prodCtx();
  const machines=ctx.machines.filter(m=>m.active!==false).slice(0,2);
  if(!machines.length){ toast('Add a machine first','d'); return; }
  if(!confirm('Create 10 days of sample shift and fettling entries on '+machines.map(m=>m.code).join(' & ')+'? Shifts that already have a real entry are skipped.')) return;
  toast('Generating sample data…');
  // sample parts (re-used if already there)
  const parts=await db.prodParts.toArray();
  const pid={};
  for(const d of PROD_DEMO_PARTS){
    const ex=parts.find(p=>p.demo&&p.partNumber===d.partNumber);
    const cycleTimes={}; machines.forEach((m,i)=>cycleTimes[m.id]=d.ct[i]??d.ct[0]);
    pid[d.partNumber]=ex? ex.id : await db.prodParts.add({partNumber:d.partNumber, partName:d.partName, customer:d.customer, grade:d.grade,
      netWeightKg:d.netWeightKg, cavities:d.cavities, cycleTimes, active:true, demo:true,
      monthlySchedule:d.sched, scheduleMachineId:(machines[d.mi]||machines[0]).id});
  }
  const plan=[[pid['SAMPLE-101'],pid['SAMPLE-102']],[pid['SAMPLE-201'],pid['SAMPLE-202']]];   // parts per machine
  const defById=Object.fromEntries(PROD_DEMO_PARTS.map(d=>[pid[d.partNumber],d]));
  const existing=new Set((await db.prodShifts.toArray()).map(s=>`${s.date}|${s.machineId}|${s.shift}`));
  const onSheet=ctx.defects.filter(d=>d.onSheet).map(d=>d.code);
  const weights=[.45,.2,.15,.12,.08];                       // makes a realistic Pareto
  let seed=20260925; const rnd=()=>{ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648; };
  const pickDefect=()=>{ let x=rnd(),i=0; while(i<weights.length-1&&x>weights[i]){ x-=weights[i]; i++; } return onSheet[i]||onSheet[0]; };
  const cats=['Die Loading / Unloading','Die Maintenance','Melting / Metal Not Ready','Power Cut','Machine & Furnace Maintenance','Spray Gun / Die Coat','Manpower'];
  const names=[['Swayam','Irfan'],['Vinayak','Lakhan']];
  let made=0;
  for(let d=9; d>=0; d--){
    const date=prodDaysAgo(d);
    for(const [mi,m] of machines.entries()) for(const sh of ['A','B']){
      if(existing.has(`${date}|${m.id}|${sh}`)) continue;
      const main=plan[mi][Math.floor(rnd()*plan[mi].length)], alt=plan[mi].find(x=>x!==main);
      const change=rnd()<.25? 5+Math.floor(rnd()*5) : 0;
      // Simulated hour by hour, keyed as shift totals: one line per part and
      // cavity count (a cavity going down mid-shift becomes a second line)
      const lines=[];
      const line=(id,cav)=>{ let l=lines.find(x=>x.partId===id&&x.cavities===cav);
        if(!l) lines.push(l={partId:id, grade:defById[id]?.grade||'', cavities:cav, shots:0});
        return l; };
      const downtime=[];
      const nDown=rnd()<.25?0:1+Math.floor(rnd()*2);
      for(let k=0;k<nDown;k++) downtime.push({category:cats[Math.floor(rnd()*rnd()*cats.length)], hour:Math.floor(rnd()*12), minutes:10+Math.round(rnd()*50), remark:''});
      if(change&&alt) downtime.push({category:'Die Loading / Unloading', hour:change, minutes:25+Math.round(rnd()*20), remark:'Part change'});
      const cavDropFrom=rnd()<.12? 6+Math.floor(rnd()*4) : 99;
      for(let i=0;i<12;i++){
        const id=i>=change&&change&&alt? alt : main, dp=defById[id]||PROD_DEMO_PARTS[0];
        const ct=dp.ct[mi]??dp.ct[0], down=downtime.filter(x=>x.hour===i).reduce((s,x)=>s+x.minutes,0);
        const avail=Math.max(0,60-down), speed=.84+rnd()*.14;
        const total=Math.max(0,Math.round(avail*60/ct*speed*(i===0?.7:1)));
        const cav=i>=cavDropFrom&&dp.cavities>1? dp.cavities-1 : dp.cavities;
        const l=line(id,cav); l.shots+=total; l.rej=l.rej||{};
        const nRej=Math.round(total*cav*(.004+rnd()*.03));
        for(let k=0;k<nRej;k++){ const c=pickDefect(); l.rej[c]=(l.rej[c]||0)+1; }
        const off=i===0||i===change? Math.min(total,Math.round(2+rnd()*6)) : 0;   // warm-up after start / die change
        if(off) l.offShots=prodN(l.offShots)+off;
      }
      const runs=lines.filter(l=>l.shots);
      downtime.forEach(x=>delete x.hour);
      await db.prodShifts.add({date, shift:sh, machineId:m.id, operator1:names[mi][0], operator2:names[mi][1], supervisor:'',
        plannedMinutes:720, dieCoatL:4, runs, downtime, remarks:'Sample data', demo:true,
        createdAt:new Date().toISOString(), createdBy:Auth.user?.name||''});
      made++;
    }
  }
  // Fettling: a fixed crew fettles roughly the previous day's OK castings (skips dates with a real entry)
  const fetDates=new Set((await db.prodFettling.toArray().catch(()=>[])).map(e=>e.date));
  const crew=['Ramesh','Suresh','Mahesh','Ganesh','Dinesh','Prakash','Santosh','Vijay'];
  const skill=Object.fromEntries(crew.map(c=>[c,.8+rnd()*.4]));       // some people are quicker than others
  const care=Object.fromEntries(crew.map(c=>[c,.003+rnd()*.02]));     // …and some more careful
  const partIds=PROD_DEMO_PARTS.map(d=>pid[d.partNumber]);
  let fetMade=0;
  for(let d=9; d>=0; d--){
    const date=prodDaysAgo(d);
    if(fetDates.has(date)) continue;
    const present=crew.filter(()=>rnd()>.1);                          // someone is usually absent
    const rows=[];
    for(const person of present){
      const nParts=rnd()<.3?2:1;
      for(let k=0;k<nParts;k++){
        const partId=partIds[Math.floor(rnd()*partIds.length)], def=defById[partId];
        const base=def.netWeightKg>.6?160:def.netWeightKg>.3?260:420;   // heavier parts take longer
        const qty=Math.round(base*skill[person]*(nParts===2?.55:1)*(.85+rnd()*.3));
        const rej=Math.round(qty*care[person]*(.5+rnd()));
        rows.push({person, partId, qty, rej, reason:rej?PROD_FET_REASONS[Math.floor(rnd()*rnd()*PROD_FET_REASONS.length)]:''});
      }
    }
    await db.prodFettling.add({date, rows, remarks:'Sample data', demo:true,
      createdAt:new Date().toISOString(), createdBy:Auth.user?.name||''});
    fetMade++;
  }
  toast(`✅ Created ${made} sample shift entries and ${fetMade} fettling entries — see Production Reports`);
  prodDemoStatus();
}
async function prodDemoDelete(){
  const [shifts,parts,fet]=await Promise.all([db.prodShifts.toArray(),db.prodParts.toArray(),db.prodFettling.toArray().catch(()=>[])]);
  const ds=shifts.filter(s=>s.demo), dp=parts.filter(p=>p.demo), df=fet.filter(e=>e.demo);
  if(!ds.length&&!dp.length&&!df.length){ toast('No sample data to delete'); return; }
  if(!confirm(`Delete ${ds.length} sample shift entries, ${df.length} sample fettling entries and ${dp.length} sample parts? Real entries are not touched.`)) return;
  for(const s of ds) await db.prodShifts.delete(s.id);
  for(const e of df) await db.prodFettling.delete(e.id);
  const stillUsed=new Set([...shifts.filter(s=>!s.demo).flatMap(s=>(s.runs||[]).map(r=>String(r.partId))),
    ...fet.filter(e=>!e.demo).flatMap(e=>(e.rows||[]).map(r=>String(r.partId)))]);
  for(const p of dp) if(!stillUsed.has(String(p.id))) await db.prodParts.delete(p.id);
  toast('🗑️ Sample data deleted');
  prodDemoStatus();
}
async function prodSaveCfg(){
  const v=x=>document.getElementById(x).value;
  await DB.setSetting('prodConfig',{meltLossPct:prodN(v('pcfg-loss')), consumptionBasis:v('pcfg-basis'), plannedMinutes:prodN(v('pcfg-plan'))||720,
    workDays:prodN(v('pcfg-days'))||26, shiftsPerDay:prodN(v('pcfg-shifts'))||2, hoursPerShift:prodN(v('pcfg-hrs'))||12,
    targetOeePct:Math.min(100,prodN(v('pcfg-oee'))||75)});
  toast('✅ Settings saved'); prodRenderSetup();
}
async function prodOpenMachine(id=null){
  const m=id? await db.prodMachines.get(id) : null;
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='pmc-ov';
  ov.innerHTML=`<div class="modal" style="width:420px"><h3>${m?'Edit':'Add'} Machine</h3>
    <div class="fg"><label class="lbl">Code * (short, e.g. 280T / M-2)</label><input class="fc mono" id="pmc-code" value="${esc(m?.code||'')}"></div>
    <div class="fg"><label class="lbl">Name</label><input class="fc" id="pmc-name" value="${esc(m?.name||'')}"></div>
    <div class="fg"><label class="lbl">Tonnage</label><input class="fc" type="number" id="pmc-ton" value="${esc(m?.tonnage||'')}"></div>
    <div class="fg"><label class="lbl">Status</label><select class="fc" id="pmc-act"><option value="1">Active</option><option value="0" ${m?.active===false?'selected':''}>Inactive</option></select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-o" onclick="prodClose('pmc-ov')">Cancel</button><button class="btn btn-p" onclick="prodSaveMachine(${id||'null'})">💾 Save</button></div></div>`;
  document.body.appendChild(ov);
}
async function prodSaveMachine(id){
  const v=x=>document.getElementById(x).value;
  const rec={code:v('pmc-code').trim(), name:v('pmc-name').trim(), tonnage:prodN(v('pmc-ton'))||'', active:v('pmc-act')==='1'};
  if(!rec.code){ toast('Code is required','d'); return; }
  const ok=id? await db.prodMachines.update(id,rec) : await db.prodMachines.add(rec);
  if(!ok){ toast('Save failed','d'); return; }
  prodClose('pmc-ov'); prodRenderSetup();
}
async function prodOpenDefect(id=null){
  const d=id? await db.prodDefectCodes.get(id) : null;
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='pdf-ov';
  ov.innerHTML=`<div class="modal" style="width:420px"><h3>${d?'Edit':'Add'} Defect Code</h3>
    <div class="fg"><label class="lbl">Code *</label><input class="fc mono" id="pdf-code" value="${esc(d?.code||'')}" ${d?'disabled title="Code can\'t change once used"':''}></div>
    <div class="fg"><label class="lbl">Description *</label><input class="fc" id="pdf-desc" value="${esc(d?.description||'')}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Show on entry form</label><select class="fc" id="pdf-on"><option value="1">Yes</option><option value="0" ${d&&!d.onSheet?'selected':''}>No (via "other defect")</option></select></div>
      <div class="fg"><label class="lbl">Order</label><input class="fc" type="number" id="pdf-ord" value="${esc(d?.order??'')}"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-o" onclick="prodClose('pdf-ov')">Cancel</button><button class="btn btn-p" onclick="prodSaveDefect(${id||'null'})">💾 Save</button></div></div>`;
  document.body.appendChild(ov);
}
async function prodSaveDefect(id){
  const v=x=>document.getElementById(x).value;
  const rec={description:v('pdf-desc').trim(), onSheet:v('pdf-on')==='1', order:prodN(v('pdf-ord'))||99};
  if(!id){
    rec.code=v('pdf-code').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
    if(!rec.code){ toast('Code is required','d'); return; }
    if((await db.prodDefectCodes.toArray()).some(d=>d.code===rec.code)){ toast('Code already exists','d'); return; }
  }
  if(!rec.description){ toast('Description is required','d'); return; }
  const ok=id? await db.prodDefectCodes.update(id,rec) : await db.prodDefectCodes.add(rec);
  if(!ok){ toast('Save failed','d'); return; }
  prodClose('pdf-ov'); prodRenderSetup();
}
async function prodDelDefect(id){
  const d=await db.prodDefectCodes.get(id);
  const used=d&&(await db.prodShifts.toArray()).some(s=>(s.runs||[]).some(r=>prodN(r.rej?.[d.code])>0));
  if(used){ toast('This code is used in shift entries — untick "Show on entry form" instead','w'); return; }
  if(!confirm('Delete this defect code?')) return;
  await db.prodDefectCodes.delete(id); prodRenderSetup();
}

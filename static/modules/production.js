// ══════════════════════════════════════════════════════
//  VRA DMS — PRODUCTION MODULE (Die Casting)
//
//  One entry per machine per shift, built for fast keying from the
//  paper Daily Production Report:
//    • header    — date, shift A/B, machine, 2 operators, planned time
//    • part runs — part, grade, cavities (a mid-shift part / grade change
//                  is just another run starting at a later hour)
//    • hourly    — 12 rows: total shots, off shots, rejections by defect
//    • downtime  — category, minutes, optional hour
//  Everything else is calculated: OK parts, rejection % / PPM, OEE and
//  where the time went, melting loss and metal consumed per grade, and
//  raw-material / part stock (tied to the RM Lot Register + Dispatch).
//
//  Units: everything on the form is in shots (machine cycles), as on the
//  paper sheet; reports convert to parts: pcs = shots × cavities.
//  Off shots are warm-up / trial shots scrapped.
// ══════════════════════════════════════════════════════

const PROD_SHIFTS = {
  A: {label:'A — Day (08:00–20:00)',   start:8},
  B: {label:'B — Night (20:00–08:00)', start:20},
};
const PROD_SLOTS = 12;
const PROD_DOWN_CATS = ['Die Loading / Unloading','Die Maintenance','Machine & Furnace Maintenance',
  'Melting / Metal Not Ready','Shot End Component','Spray Gun / Die Coat','Central Compressor','Crane',
  'Power Cut','Manpower','Material Shortage','No Plan','Quality Hold','Other'];
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
const PROD_CFG_DEFAULT = {meltLossPct:6, consumptionBasis:'all', plannedMinutes:720};
const PROD_ADJ_REASONS = ['Opening Stock','Physical Count Correction','Scrap / Write-off','Return / Rework','Other'];

// ── small helpers ────────────────────────────────────
function prodDate(d=new Date()){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function prodToday(){ return prodDate(); }
function prodDaysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return prodDate(d); }
function prodAddDays(ds,n){ const d=new Date(ds+'T00:00:00'); d.setDate(d.getDate()+n); return prodDate(d); }
function prodN(v){ const n=parseFloat(v); return isFinite(n)?n:0; }
function prodFmt(n,dp=0){ return isFinite(n)? Number(n).toLocaleString('en-IN',{minimumFractionDigits:dp,maximumFractionDigits:dp}) : '—'; }
function prodPct(x,dp=1){ return isFinite(x)? (x*100).toFixed(dp)+'%' : '—'; }
function prodHrs(min){ return isFinite(min)? (min/60).toFixed(1)+' h' : '—'; }
function prodTier(x,hi,lo){ return x>=hi?'#16a34a':x>=lo?'#d97706':'#dc2626'; }
function prodPad(h){ return String(h).padStart(2,'0'); }
function prodSlotLabel(shift,i){ const h=(PROD_SHIFTS[shift]?.start??8)+i; return prodPad(h%24)+'–'+prodPad((h+1)%24); }
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
// Runs are ordered by the hour they start; each run covers hours up to
// the next run's start.
function prodRunRanges(runs){
  const sorted=(runs||[]).map((r,i)=>({...r,_i:i})).sort((a,b)=>prodN(a.fromSlot)-prodN(b.fromSlot));
  return sorted.map((r,k)=>({...r,
    from: k===0?0:prodN(r.fromSlot),
    to: (k<sorted.length-1? prodN(sorted[k+1].fromSlot) : PROD_SLOTS)-1}));
}

const PROD_SUM_KEYS=['planned','downtime','runtime','shots','off','offPcs','rejPcs','castPcs','okPcs',
  'idealMin','qualLossMin','netKg','lossKg','totalKg','shotsNoCT','shotsNoWt'];

// Hourly rows are {total, off, rej:{code:shots}}. Entries saved by the
// first version stored `hourly` as plain shot counts, with off shots and
// rejections (in pcs) on the run — still read here so they keep reporting.
function prodHours(sheet){
  if(Array.isArray(sheet.hours)) return Array.from({length:PROD_SLOTS},(_,i)=>sheet.hours[i]||{});
  return Array.from({length:PROD_SLOTS},(_,i)=>({total:(sheet.hourly||[])[i]??''}));
}

function prodCalc(sheet,ctx){
  const loss=prodN(ctx.cfg.meltLossPct)/100, basisOk=ctx.cfg.consumptionBasis==='ok';
  const planned=prodN(sheet.plannedMinutes)||prodN(ctx.cfg.plannedMinutes)||720;
  const downs=(sheet.downtime||[]).filter(d=>prodN(d.minutes)>0);
  const downBySlot=Array(PROD_SLOTS).fill(0);
  downs.forEach(d=>{ if(d.slot!==''&&d.slot!=null&&prodN(d.slot)>=0) downBySlot[prodN(d.slot)]+=prodN(d.minutes); });
  const downtime=Math.min(planned,downs.reduce((s,d)=>s+prodN(d.minutes),0));

  const hrs=prodHours(sheet).map(h=>{
    const total=prodN(h.total), off=Math.min(total,prodN(h.off));
    const rej={}; let rejS=0;
    for(const [c,v] of Object.entries(h.rej||{})){ const n=prodN(v); if(n>0){ rej[c]=n; rejS+=n; } }
    return {total, off, rej, rejS, ok:Math.max(0,total-off-rejS), cav:h.cav};
  });

  const runs=prodRunRanges(sheet.runs).map(r=>{
    const part=ctx.partById[r.partId];
    const cav=prodN(r.cavities)||prodN(part?.cavities)||1;
    // Cavities can drop for some hours (one cavity damaged): each hour's
    // shots convert to pcs with that hour's cavity count, default the run's.
    const legacyOff=prodN(r.offShots);
    let shots=0, off=legacyOff, rejS=0, castPcs=0, offPcs=legacyOff*cav, rejPcs=0; const rej={};
    for(let s=r.from;s<=r.to;s++){
      const h=hrs[s], hc=prodN(h.cav)||cav;
      h.cavEff=hc; h.okPcs=h.ok*hc;
      shots+=h.total; off+=h.off; rejS+=h.rejS;
      castPcs+=h.total*hc; offPcs+=h.off*hc;
      for(const [c,n] of Object.entries(h.rej)){ rej[c]=(rej[c]||0)+n*hc; rejPcs+=n*hc; }
    }
    for(const [c,v] of Object.entries(r.rej||{})){ const n=prodN(v); if(n>0){ rej[c]=(rej[c]||0)+n; rejS+=n/cav; rejPcs+=n; } }  // first-version entries: pcs
    off=Math.min(shots,off); offPcs=Math.min(castPcs,offPcs);
    const okPcs=Math.max(0,castPcs-offPcs-rejPcs);
    const ct=prodCT(part,sheet.machineId), wt=prodN(part?.netWeightKg);
    const netKg=(basisOk?okPcs:castPcs)*wt;
    return {...r, part, grade:r.grade||part?.grade||'—', cav, shots, off, offPcs, rej, rejPcs, castPcs, okPcs,
      okShots:Math.max(0,shots-off-rejS), ct, wt,
      idealMin: ct? shots*ct/60 : 0,
      qualLossMin: ct? (off+rejS)*ct/60 : 0,
      shotsNoCT: ct?0:shots, shotsNoWt: wt?0:shots,
      netKg, lossKg:netKg*loss, totalKg:netKg*(1+loss),
      ppm: castPcs-offPcs>0? rejPcs/(castPcs-offPcs)*1e6 : 0};
  });

  const hours=hrs.map((h,s)=>{
    const r=runs.find(x=>s>=x.from&&s<=x.to), ct=r?.ct||0, avail=Math.max(0,60-downBySlot[s]);
    return {...h, shots:h.total, down:downBySlot[s], ct, run:r,
      target: ct? Math.floor(3600/ct) : null,
      eff: ct&&avail? h.total*ct/(avail*60) : null};
  });

  const t={planned, downtime, runtime:planned-downtime};
  for(const k of PROD_SUM_KEYS) if(!(k in t)) t[k]=runs.reduce((s,r)=>s+(r[k]||0),0);
  t.okShots=runs.reduce((s,r)=>s+r.okShots,0);
  const res={runs, hours, t, byGrade:{}, byPart:{}, byDefect:{}, byDown:{}};
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
    tgtCT: shotsCT>0? t.idealMin*60/shotsCT : null,
    perfLossMin: Math.max(0,t.runtime-t.idealMin)};  // overstated when shotsNoCT>0 — callers flag it
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
    <button class="btn btn-p" onclick="prodOpenShift()">➕ New Shift Entry</button></div>
  ${prodFilterBar('psr',f,ctx,{onApply:'prodRenderShifts'})}
  ${prodKpiRow(agg.t)}
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Date</th><th>Shift</th><th>Machine</th><th>Part(s)</th><th>Operators</th>
      <th style="text-align:right">Shots</th><th style="text-align:right">OK pcs</th><th style="text-align:right">Rej %</th><th style="text-align:right">PPM</th>
      <th style="text-align:right">Downtime</th><th style="text-align:right">Act / Tgt CT</th><th style="text-align:right">OEE</th><th style="text-align:right">Metal kg</th><th></th></tr></thead>
    <tbody>${rows.map(({s,c})=>{ const t=c.t; return `<tr>
      <td class="mono">${esc(s.date)}</td><td><b>${esc(s.shift)}</b></td>
      <td>${esc(prodMachineLabel(ctx.machineById[s.machineId]))}</td>
      <td>${c.runs.map(r=>`<div>${esc(r.part?.partNumber||'—')} <span style="color:#6b7280;font-size:11px">${esc(r.grade)}</span></div>`).join('')}</td>
      <td style="font-size:12px">${esc([s.operator1,s.operator2].filter(Boolean).join(', '))}</td>
      <td class="mono" style="text-align:right">${prodFmt(t.shots)}</td>
      <td class="mono" style="text-align:right">${prodFmt(t.okPcs)}</td>
      <td class="mono" style="text-align:right;color:${prodTier(1-t.rejPct,.97,.93)}">${prodPct(t.rejPct)}</td>
      <td class="mono" style="text-align:right">${prodFmt(t.ppm)}</td>
      <td class="mono" style="text-align:right">${t.downtime?prodFmt(t.downtime)+'m':'—'}</td>
      <td class="mono" style="text-align:right">${t.actCT?t.actCT.toFixed(0):'—'} / ${t.tgtCT?t.tgtCT.toFixed(0):'—'}s</td>
      <td class="mono" style="text-align:right;font-weight:700;color:${prodTier(t.oee,.75,.55)}">${prodPct(t.oee)}</td>
      <td class="mono" style="text-align:right">${prodFmt(t.totalKg,1)}</td>
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
//  2. SHIFT ENTRY FORM — laid out top to bottom like the paper sheet:
//     shift details → part → one row per hour → downtime → totals.
//  State lives in window._ps; number inputs update state and call
//  prodPsRefresh() (updates calculated cells only, so focus is kept);
//  structural changes (part, run added/removed, shift) re-render.
// ══════════════════════════════════════════════════════
function prodNewRun(ctx,part,fromSlot=0){
  return {partId:part?.id||'', grade:part?.grade||'', cavities:prodN(part?.cavities)||1, fromSlot};
}
function prodBlankHours(){ return Array.from({length:PROD_SLOTS},()=>({total:'',cav:'',off:'',rej:{}})); }
async function prodOpenShift(id=null,preset={}){
  const ctx=await prodCtx();
  const all=await db.prodShifts.toArray().catch(()=>[]);
  let rec=id? all.find(s=>s.id===id) : null;
  if(id&&!rec){ toast('Entry not found','d'); return; }
  if(!rec){
    const machineId=preset.machineId||ctx.machines.find(m=>m.active!==false)?.id||'';
    rec={date:preset.date||prodToday(), shift:preset.shift||'A', machineId,
      operator1:'', operator2:'', supervisor:'', plannedMinutes:ctx.cfg.plannedMinutes, dieCoatL:'',
      hours:prodBlankHours(), runs:[], downtime:[], remarks:''};
    prodCarryOver(rec,all,ctx);
  } else {
    rec=JSON.parse(JSON.stringify(rec));
    rec.hours=prodHours(rec).map(h=>({total:h.total??'', cav:h.cav??'', off:h.off??'', rej:{...(h.rej||{})}}));
    delete rec.hourly;
  }
  if(!rec.runs?.length) rec.runs=[prodNewRun(ctx,ctx.parts[0])];
  rec.downtime=rec.downtime||[];
  const names=new Set();
  all.forEach(s=>{ s.operator1&&names.add(s.operator1); s.operator2&&names.add(s.operator2); s.supervisor&&names.add(s.supervisor); });
  const emps=await db.hrEmployees.toArray().catch(()=>[]);
  emps.forEach(e=>e.name&&names.add(e.name));
  // Defect columns: the ones ticked "on entry form" plus any already used on this entry
  const used=new Set(); rec.hours.forEach(h=>Object.keys(h.rej||{}).forEach(c=>used.add(c)));
  const codes=ctx.defects.filter(d=>d.onSheet||used.has(d.code)).map(d=>d.code);
  used.forEach(c=>{ if(!codes.includes(c)) codes.push(c); });
  window._ps={id, rec, ctx, names:[...names].sort(), all, codes};
  prodPsRender();
}
// New entry: continue with whatever part was running at the end of the
// previous shift on the same machine.
function prodCarryOver(rec,all,ctx){
  const key=s=>s.date+(s.shift==='B'?'2':'1');
  const prev=all.filter(s=>String(s.machineId)===String(rec.machineId)&&key(s)<key(rec)).sort((a,b)=>key(b).localeCompare(key(a)))[0];
  if(!prev?.runs?.length){ rec.runs=[prodNewRun(ctx,ctx.parts[0])]; return; }
  const last=prodRunRanges(prev.runs).slice(-1)[0];
  rec.runs=[{partId:last.partId, grade:last.grade, cavities:last.cavities, fromSlot:0}];
}

function prodPsRender(){
  const {rec,ctx,names,id}=window._ps;
  const row=(label,control)=>`<div class="fg"><label class="lbl">${label}</label>${control}</div>`;
  setC(`
  <div class="ph"><h2>🏭 ${id?'Edit':'New'} Shift Production Entry</h2>
    <button class="btn btn-o" onclick="prodRenderShifts()">← Back</button></div>
  <datalist id="ps-names">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
  <div style="max-width:1180px">
  <div class="card"><div class="ch"><h5>1 · Shift details</h5></div><div class="cb" style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;max-width:760px">
    ${row('Date *',`<input class="fc" type="date" value="${esc(rec.date)}" onchange="prodPsHead('date',this.value,true)">`)}
    ${row('Shift *',`<select class="fc" onchange="prodPsHead('shift',this.value,true)">${prodOpts(Object.keys(PROD_SHIFTS),rec.shift,{label:k=>PROD_SHIFTS[k].label})}</select>`)}
    ${row('Machine *',`<select class="fc" onchange="prodPsHead('machineId',+this.value,true)">${prodOpts(ctx.machines.filter(m=>m.active!==false||String(m.id)===String(rec.machineId)),rec.machineId,{val:m=>m.id,label:m=>`${m.code} — ${m.name||''}`})}</select>`)}
    ${row('Planned time (min)',`<input class="fc" type="number" min="0" value="${esc(rec.plannedMinutes)}" oninput="prodPsHead('plannedMinutes',this.value)" title="12 h = 720. Reduce for planned breaks if you don't want them to count as downtime.">`)}
    ${row('Operator 1',`<input class="fc" list="ps-names" value="${esc(rec.operator1)}" oninput="prodPsHead('operator1',this.value)">`)}
    ${row('Operator 2',`<input class="fc" list="ps-names" value="${esc(rec.operator2)}" oninput="prodPsHead('operator2',this.value)">`)}
    ${row('Supervisor / Handover to',`<input class="fc" list="ps-names" value="${esc(rec.supervisor)}" oninput="prodPsHead('supervisor',this.value)">`)}
    ${row('Die coat used (L)',`<input class="fc" type="number" min="0" step="0.1" value="${esc(rec.dieCoatL)}" oninput="prodPsHead('dieCoatL',this.value)">`)}
  </div></div>
  <div class="card"><div class="ch"><h5>2 · Part</h5>
    <button class="btn btn-o btn-sm" onclick="prodPsAddRun()">➕ Part / grade change mid-shift</button></div>
    <div class="cb" id="ps-runs"></div></div>
  <div class="card"><div class="ch"><h5>3 · Hourly production (shots)</h5>
    <span style="font-size:11px;color:#6b7280">Enter total shots, off shots and rejected shots by type — Target, Rejected and OK are calculated. Tab moves along the row.</span></div>
    <div class="tw" id="ps-hours"></div></div>
  <div class="card"><div class="ch"><h5>4 · Downtime / breakdown</h5>
    <button class="btn btn-o btn-sm" onclick="prodPsAddDown()">➕ Add downtime</button></div>
    <div class="cb" id="ps-down"></div></div>
  <div class="card"><div class="cb"><div class="fg" style="margin:0"><label class="lbl">Remarks</label>
    <input class="fc" value="${esc(rec.remarks)}" oninput="prodPsHead('remarks',this.value)"></div></div></div>
  <div id="ps-sum"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin:4px 0 30px">
    <button class="btn btn-o" onclick="prodRenderShifts()">Cancel</button>
    <button class="btn btn-o" onclick="prodPsSave(true)">💾 Save &amp; Next Shift</button>
    <button class="btn btn-p" onclick="prodPsSave(false)">💾 Save</button>
  </div>
  </div>`);
  prodPsRenderRuns(); prodPsRenderHours(); prodPsRenderDown(); prodPsRefresh();
}

function prodPsRenderRuns(){
  const {rec,ctx}=window._ps;
  const ordered=prodRunRanges(rec.runs);
  document.getElementById('ps-runs').innerHTML=`<table>
    <thead><tr><th>Part *</th><th style="width:150px">Grade</th><th style="width:100px">Cavities</th><th style="width:170px">From hour</th><th>Target CT · metal per part</th><th style="width:40px"></th></tr></thead>
    <tbody>${ordered.map((r,k)=>{ const i=r._i, p=ctx.partById[r.partId], ct=prodCT(p,rec.machineId);
      return `<tr>
      <td><select class="fc" onchange="prodPsRunPart(${i},this.value)">${prodOpts(ctx.parts.filter(x=>x.active!==false||String(x.id)===String(r.partId)),r.partId,{val:x=>x.id,label:prodPartLabel,blank:'— select part —'})}</select></td>
      <td><select class="fc" onchange="prodPsRun(${i},'grade',this.value)">${prodOpts([...new Set([...ctx.grades,r.grade].filter(Boolean))],r.grade,{blank:'—'})}</select></td>
      <td><input class="fc" type="number" min="1" value="${esc(r.cavities)}" oninput="prodPsRun(${i},'cavities',this.value)"></td>
      <td>${k===0?`<input class="fc" disabled value="${prodSlotLabel(rec.shift,0)} (start)">`:
        `<select class="fc" onchange="prodPsRun(${i},'fromSlot',+this.value,true)">${Array.from({length:PROD_SLOTS-1},(_,s)=>s+1).map(s=>`<option value="${s}" ${s===prodN(r.fromSlot)?'selected':''}>${prodSlotLabel(rec.shift,s)}</option>`).join('')}</select>`}</td>
      <td style="font-size:12px">${p?`${ct?ct+' s/shot':'<span style="color:#d97706">CT not set</span>'} · ${prodN(p.netWeightKg)?`${prodFmt(p.netWeightKg,3)} kg net → <b>${prodFmt(prodMetalPerPc(p.netWeightKg,ctx.cfg),3)} kg metal/pc</b>`:'<span style="color:#d97706">weight not set</span>'}`:''}</td>
      <td>${rec.runs.length>1?`<button class="btn btn-r btn-xs" title="Remove" onclick="prodPsDelRun(${i})">✕</button>`:''}</td></tr>`;}).join('')}
    </tbody></table>
    ${ctx.parts.length?'':`<div class="alert al-w" style="margin-top:8px"><span>No parts in the Part Master yet. <a href="#" onclick="event.preventDefault();nav('prod-parts')">Add parts →</a></span></div>`}`;
}

function prodPsRenderHours(){
  const {rec,ctx,codes}=window._ps;
  const others=ctx.defects.filter(d=>!codes.includes(d.code));
  const num=(i,f,v,extra='')=>`<input class="fc mono" style="padding:5px 6px;text-align:right" type="number" min="0" inputmode="numeric" value="${esc(v??'')}" oninput="${f}" ${extra}>`;
  const dname=c=>ctx.defectByCode[c]?.description||c;
  const r='text-align:right';
  document.getElementById('ps-hours').innerHTML=`<table>
    <thead><tr><th style="width:80px">Time</th><th>Part</th><th style="${r};width:64px">Target</th>
      <th style="${r};width:84px">Total shots</th><th style="${r};width:60px" title="Cavities running this hour — pre-filled from the part; change it if a cavity is down">Cav</th><th style="${r};width:74px">Off shots</th>
      ${codes.map(c=>`<th style="${r};width:74px" title="${esc(dname(c))}">${esc(dname(c))}</th>`).join('')}
      <th style="${r};width:70px">Rejected</th><th style="${r};width:70px">OK shots</th><th style="${r};width:70px">OK pcs</th><th style="${r};width:58px">Down</th><th style="${r};width:58px">Eff.</th></tr></thead>
    <tbody>${rec.hours.map((h,i)=>`<tr>
      <td class="mono" style="font-weight:600">${prodSlotLabel(rec.shift,i)}</td>
      <td style="font-size:11px;color:#6b7280;white-space:nowrap" id="ps-hp-${i}"></td>
      <td class="mono" style="${r};color:#6b7280" id="ps-ht-${i}"></td>
      <td>${num(i,`prodPsHour(${i},'total',this.value)`,h.total)}</td>
      <td>${num(i,`prodPsHourCav(${i},this.value)`,'',`id="ps-hc-${i}" min="1" onblur="prodPsRefresh()"`)}</td>
      <td>${num(i,`prodPsHour(${i},'off',this.value)`,h.off)}</td>
      ${codes.map(c=>`<td>${num(i,`prodPsHourRej(${i},'${esc(c)}',this.value)`,h.rej?.[c])}</td>`).join('')}
      <td class="mono" style="${r};color:#dc2626" id="ps-hr-${i}"></td>
      <td class="mono" style="${r};font-weight:700;color:#16a34a" id="ps-ho-${i}"></td>
      <td class="mono" style="${r};color:#16a34a" id="ps-hop-${i}"></td>
      <td class="mono" style="${r}" id="ps-hd-${i}"></td>
      <td class="mono" style="${r};font-weight:600" id="ps-he-${i}"></td></tr>`).join('')}
    </tbody>
    <tfoot><tr style="font-weight:700;background:#f6f8fc">
      <td colspan="2">TOTAL</td><td class="mono" style="${r}" id="ps-tt"></td><td class="mono" style="${r}" id="ps-ts"></td><td></td><td class="mono" style="${r}" id="ps-to"></td>
      ${codes.map(c=>`<td class="mono" style="${r}" id="ps-tc-${esc(c)}"></td>`).join('')}
      <td class="mono" style="${r};color:#dc2626" id="ps-tr"></td><td class="mono" style="${r};color:#16a34a" id="ps-tok"></td><td class="mono" style="${r};color:#16a34a" id="ps-top"></td><td class="mono" style="${r}" id="ps-td"></td><td class="mono" style="${r}" id="ps-te"></td></tr></tfoot>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;gap:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:#6b7280">Target = 3600 ÷ target cycle time. Cav is pre-filled from the part — change it for hours when a cavity is down. Rejected = off shots + rejections. OK = total − rejected; OK pcs = OK shots × Cav. Eff. = shots × cycle time ÷ time available in the hour (60 min − downtime logged against it).</span>
    ${others.length?`<select class="fc" style="width:190px" onchange="if(this.value){window._ps.codes.push(this.value);prodPsRenderHours();prodPsRefresh();}"><option value="">+ add rejection type column…</option>${others.map(d=>`<option value="${esc(d.code)}">${esc(d.description)}</option>`).join('')}</select>`:''}
  </div>`;
}

function prodPsRenderDown(){
  const {rec}=window._ps;
  const slots=[{v:'',l:'— whole shift / not specific —'},...Array.from({length:PROD_SLOTS},(_,s)=>({v:s,l:prodSlotLabel(rec.shift,s)}))];
  document.getElementById('ps-down').innerHTML=(rec.downtime.length?`<table>
    <thead><tr><th>Reason</th><th style="width:190px">Hour</th><th style="width:100px">Minutes</th><th>Remark</th><th style="width:40px"></th></tr></thead>
    <tbody>${rec.downtime.map((d,i)=>`<tr>
      <td><select class="fc" onchange="prodPsDown(${i},'category',this.value)">${prodOpts(PROD_DOWN_CATS,d.category)}</select></td>
      <td><select class="fc" onchange="prodPsDown(${i},'slot',this.value===''?'':+this.value)">${slots.map(s=>`<option value="${s.v}" ${String(s.v)===String(d.slot??'')?'selected':''}>${s.l}</option>`).join('')}</select></td>
      <td><input class="fc" type="number" min="0" value="${esc(d.minutes)}" oninput="prodPsDown(${i},'minutes',this.value)"></td>
      <td><input class="fc" value="${esc(d.remark||'')}" oninput="prodPsDown(${i},'remark',this.value,false)"></td>
      <td><button class="btn btn-r btn-xs" onclick="prodPsDelDown(${i})">✕</button></td></tr>`).join('')}
    </tbody></table>`:`<div style="color:#9ca3af;font-size:12px">No downtime — machine ran the full planned time.</div>`);
}

function prodPsRefresh(){
  const {rec,ctx,codes}=window._ps;
  const c=prodCalc(rec,ctx), t=c.t;
  const set=(id,h)=>{ const e=document.getElementById(id); if(e) e.innerHTML=h; };
  const tot={tgt:0,shots:0,off:0,rej:0,ok:0,down:0,codes:{}};
  c.hours.forEach((h,i)=>{
    const has=h.total||h.off||h.rejS;
    set(`ps-hp-${i}`, esc(h.run?.part?.partNumber||''));
    set(`ps-ht-${i}`, h.target??'—');
    set(`ps-hr-${i}`, has? prodFmt(h.off+h.rejS) : '');
    set(`ps-ho-${i}`, has? prodFmt(h.ok) : '');
    set(`ps-hop-${i}`, has? prodFmt(h.okPcs||0) : '');
    const ci=document.getElementById(`ps-hc-${i}`), over=prodN(rec.hours[i].cav)>0;
    if(ci){
      if(document.activeElement!==ci) ci.value=h.cavEff??'';
      ci.style.background=over?'#fef3c7':''; ci.title=over?`Changed from ${h.run?.cav} — clear to use the part's cavities`:'';
    }
    set(`ps-hd-${i}`, h.down||'');
    set(`ps-he-${i}`, h.eff==null||!h.total&&!h.down?'':`<span style="color:${prodTier(h.eff,.9,.75)}">${Math.round(h.eff*100)}%</span>`);
    tot.tgt+=h.target||0; tot.shots+=h.total; tot.off+=h.off; tot.rej+=h.off+h.rejS; tot.ok+=h.ok; tot.down+=h.down;
    for(const [k,n] of Object.entries(h.rej)) tot.codes[k]=(tot.codes[k]||0)+n;
  });
  set('ps-tt',tot.tgt?prodFmt(tot.tgt):'—'); set('ps-ts',prodFmt(tot.shots)); set('ps-to',prodFmt(tot.off));
  codes.forEach(k=>set(`ps-tc-${k}`,prodFmt(tot.codes[k]||0)));
  set('ps-tr',prodFmt(tot.rej)); set('ps-tok',prodFmt(tot.ok)); set('ps-top',prodFmt(t.okPcs)); set('ps-td',tot.down?prodFmt(tot.down):'');
  set('ps-te',tot.tgt?`${prodPct(t.shots&&t.runtime?t.pRaw:NaN,0)}`:'');

  const warn=[];
  if(t.shotsNoCT) warn.push('Target cycle time missing for a part on this machine — Target and Performance/OEE can\'t be calculated. Set it in Part Master.');
  if(t.shotsNoWt) warn.push('Net weight missing for a part — metal consumption understated.');
  if(c.runs.some(r=>!r.partId)) warn.push('Select a part.');
  if(c.hours.some((h,i)=>{ const x=prodHours(rec)[i]; return prodN(x.off)+Object.values(x.rej||{}).reduce((s,v)=>s+prodN(v),0)>prodN(x.total); }))
    warn.push('An hour has more rejected than total shots.');
  if(t.pRaw>1.02) warn.push(`Shots exceed target rate (${prodPct(t.pRaw,0)}) — check shot counts or the target cycle time.`);
  const dupe=window._ps.all.find(s=>s.id!==window._ps.id&&s.date===rec.date&&s.shift===rec.shift&&String(s.machineId)===String(rec.machineId));
  if(dupe) warn.push('An entry already exists for this date, shift and machine.');

  const grades=Object.entries(c.byGrade).filter(([,g])=>g.castPcs>0);
  const cavs=new Set(c.hours.filter(h=>h.total).map(h=>h.cavEff));
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
        ${kv('Target shots',tot.tgt?prodFmt(tot.tgt):'—')}${kv('Actual shots',prodFmt(t.shots))}
        ${kv('OK shots',prodFmt(t.okShots))}${kv('Rejected shots (incl. off)',prodFmt(t.shots-t.okShots))}
        ${kv('Cycle time act / target',`${t.actCT?t.actCT.toFixed(1):'—'} / ${t.tgtCT?t.tgtCT.toFixed(1):'—'} s`)}
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:3px 10px;align-content:start">
        <span style="grid-column:span 2;font-weight:600;font-size:11px;color:#6b7280">WHERE THE ${prodFmt(t.planned)} MIN WENT</span>
        ${kv('Good parts',prodFmt(Math.max(0,t.idealMin-t.qualLossMin))+' min')}
        ${kv('Quality loss',prodFmt(t.qualLossMin)+' min')}
        ${kv('Speed loss',(t.shotsNoCT?'—':prodFmt(t.perfLossMin))+' min')}
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
function prodPsHead(k,v,rerender=false){
  const ps=window._ps; ps.rec[k]=v;
  // New entry with nothing keyed yet: re-pick the part that was running on this machine last shift
  const blank=ps.rec.hours.every(h=>h.total===''&&h.off===''&&!Object.values(h.rej||{}).some(x=>x!==''));
  if(!ps.id && ['machineId','shift','date'].includes(k) && blank) prodCarryOver(ps.rec,ps.all,ps.ctx);
  if(rerender) prodPsRender(); else prodPsRefresh();
}
function prodPsHour(i,k,v){ window._ps.rec.hours[i][k]=v; prodPsRefresh(); }
// Store a cavity override only when it differs from the part's cavities
function prodPsHourCav(i,v){
  const {rec,ctx}=window._ps, r=prodCalc(rec,ctx).hours[i].run;
  rec.hours[i].cav=(v===''||prodN(v)===r?.cav)? '' : v;
  prodPsRefresh();
}
function prodPsHourRej(i,code,v){ const h=window._ps.rec.hours[i]; h.rej=h.rej||{}; h.rej[code]=v; prodPsRefresh(); }
function prodPsRun(i,k,v,rerender=false){ window._ps.rec.runs[i][k]=v; if(rerender){ prodPsRenderRuns(); } prodPsRefresh(); }
function prodPsRunPart(i,pid){
  const {rec,ctx}=window._ps, p=ctx.partById[pid];
  Object.assign(rec.runs[i],{partId:pid?+pid:'', grade:p?.grade||rec.runs[i].grade, cavities:prodN(p?.cavities)||rec.runs[i].cavities||1});
  prodPsRenderRuns(); prodPsRefresh();
}
function prodPsAddRun(){
  const {rec,ctx}=window._ps;
  const ordered=prodRunRanges(rec.runs), last=ordered[ordered.length-1];
  if(last.to<=last.from){ toast('The last part only covers one hour — move its start first','w'); return; }
  const from=Math.min(PROD_SLOTS-1,Math.max(last.from+1,Math.round((last.from+PROD_SLOTS)/2)));
  rec.runs.push(prodNewRun(ctx,ctx.partById[last.partId],from));
  prodPsRenderRuns(); prodPsRefresh();
}
function prodPsDelRun(i){
  const rec=window._ps.rec; rec.runs.splice(i,1);
  const first=prodRunRanges(rec.runs)[0]; if(first) rec.runs[first._i].fromSlot=0;
  prodPsRenderRuns(); prodPsRefresh();
}
function prodPsAddDown(){ window._ps.rec.downtime.push({category:PROD_DOWN_CATS[0],slot:'',minutes:'',remark:''}); prodPsRenderDown(); prodPsRefresh(); }
function prodPsDown(i,k,v,refresh=true){ window._ps.rec.downtime[i][k]=v; if(refresh) prodPsRefresh(); }
function prodPsDelDown(i){ window._ps.rec.downtime.splice(i,1); prodPsRenderDown(); prodPsRefresh(); }

async function prodPsSave(next){
  const {rec,ctx,id,all}=window._ps;
  if(!rec.date||!rec.shift||!rec.machineId){ toast('Date, shift and machine are required','d'); return; }
  if(rec.runs.some(r=>!r.partId)){ toast('Select a part','d'); return; }
  const starts=rec.runs.map(r=>prodN(r.fromSlot));
  if(new Set(starts).size!==starts.length){ toast('Two parts start in the same hour','d'); return; }
  const dupe=all.find(s=>s.id!==id&&s.date===rec.date&&s.shift===rec.shift&&String(s.machineId)===String(rec.machineId));
  if(dupe){ toast('An entry already exists for this date, shift and machine — edit that one instead','d'); return; }
  const badHour=rec.hours.findIndex(h=>prodN(h.off)+Object.values(h.rej||{}).reduce((s,v)=>s+prodN(v),0)>prodN(h.total));
  if(badHour>=0){ toast(`${prodSlotLabel(rec.shift,badHour)}: rejected shots are more than total shots`,'d'); return; }
  const c=prodCalc(rec,ctx);
  if(!c.t.shots&&!c.t.downtime&&!confirm('No shots and no downtime entered. Save anyway?')) return;
  const numOrBlank=v=>v===''||v==null?'':prodN(v);
  const clean={
    date:rec.date, shift:rec.shift, machineId:+rec.machineId,
    operator1:(rec.operator1||'').trim(), operator2:(rec.operator2||'').trim(), supervisor:(rec.supervisor||'').trim(),
    plannedMinutes:prodN(rec.plannedMinutes)||prodN(ctx.cfg.plannedMinutes)||720,
    dieCoatL:numOrBlank(rec.dieCoatL),
    hours:rec.hours.map(h=>{ const rej={}; for(const [k,v] of Object.entries(h.rej||{})) if(prodN(v)>0) rej[k]=prodN(v);
      return {total:numOrBlank(h.total), cav:numOrBlank(h.cav), off:numOrBlank(h.off), rej}; }),
    hourly:null,
    runs:prodRunRanges(rec.runs).map((r,k)=>{
      const run={partId:+r.partId, grade:r.grade||ctx.partById[r.partId]?.grade||'', cavities:prodN(r.cavities)||1, fromSlot:k===0?0:prodN(r.fromSlot)};
      if(prodN(r.offShots)) run.offShots=prodN(r.offShots);                          // first-version entries
      if(r.rej&&Object.keys(r.rej).length) run.rej=r.rej;
      return run;
    }),
    downtime:rec.downtime.filter(d=>prodN(d.minutes)>0).map(d=>({category:d.category, slot:d.slot===''||d.slot==null?'':prodN(d.slot), minutes:prodN(d.minutes), remark:(d.remark||'').trim()})),
    remarks:(rec.remarks||'').trim(),
    updatedAt:new Date().toISOString(), updatedBy:Auth.user?.name||'',
  };
  let ok;
  if(id) ok=await db.prodShifts.update(id,clean);
  else { clean.createdAt=clean.updatedAt; clean.createdBy=clean.updatedBy; ok=await db.prodShifts.add(clean); }
  if(!ok){ toast('Save failed — check your connection and try again','d'); return; }
  toast('✅ Shift entry saved');
  if(next){
    const preset=rec.shift==='A'? {date:rec.date,shift:'B',machineId:rec.machineId} : {date:prodAddDays(rec.date,1),shift:'A',machineId:rec.machineId};
    prodOpenShift(null,preset);
  } else prodRenderShifts();
}

// ══════════════════════════════════════════════════════
//  3. OEE & LOSSES
// ══════════════════════════════════════════════════════
async function prodRenderOEE(f={}){
  const ctx=await prodCtx();
  f={from:f.from||prodDaysAgo(6), to:f.to||prodToday(), machineId:f.machineId||'', shift:f.shift||''};
  const rows=await prodLoadShifts(ctx,f);
  const agg=prodAgg(rows.map(r=>r.c)), t=agg.t;

  const good=Math.max(0,t.idealMin-t.qualLossMin);
  const speed=t.shotsNoCT?0:t.perfLossMin;
  const parts=[['Good parts',good,'#16a34a'],['Quality loss',t.qualLossMin,'#dc2626'],['Speed loss',speed,'#d97706'],['Downtime',t.downtime,'#6b7280']];
  const tot=parts.reduce((s,p)=>s+p[1],0)||1;

  const byMachine=ctx.machines.map(m=>({m,a:prodAgg(rows.filter(r=>String(r.s.machineId)===String(m.id)).map(r=>r.c))})).filter(x=>x.a.t.planned);
  const byDate={};
  rows.forEach(r=>{ (byDate[r.s.date]=byDate[r.s.date]||[]).push(r); });
  const dates=Object.keys(byDate).sort().reverse();

  // average hourly efficiency per slot, per shift
  const slotEff={};
  for(const {s,c} of rows){
    c.hours.forEach((h,i)=>{ if(h.eff==null||(!h.shots&&!h.down)) return;
      const k=s.shift, a=(slotEff[k]=slotEff[k]||Array.from({length:PROD_SLOTS},()=>({ideal:0,avail:0})));
      a[i].ideal+=h.shots*h.ct/60; a[i].avail+=Math.max(0,60-h.down); });
  }

  const downRows=Object.entries(agg.byDown).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({label:k,value:v,display:prodHrs(v)}));

  setC(`
  <div class="ph"><h2>⚙️ OEE &amp; Losses</h2></div>
  ${prodFilterBar('poe',f,ctx,{onApply:'prodRenderOEE'})}
  ${prodKpiRow(t)}
  ${t.shotsNoCT?`<div class="alert al-w"><span>⚠️ ${prodFmt(t.shotsNoCT)} shots are for parts with no target cycle time on that machine — Performance and speed loss can't be calculated for them. Set it in <a href="#" onclick="event.preventDefault();nav('prod-parts')">Part Master</a>.</span></div>`:''}
  <div class="card"><div class="ch"><h5>Where the planned time went — ${prodHrs(t.planned)} planned</h5></div><div class="cb">
    <div style="display:flex;height:26px;gap:2px;border-radius:4px;overflow:hidden">
      ${parts.filter(p=>p[1]>0).map(([l,v,c])=>`<div title="${l}: ${prodHrs(v)} (${prodPct(v/tot)})" style="width:${v/tot*100}%;background:${c}"></div>`).join('')}
    </div>
    <div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:10px;font-size:12.5px">
      ${parts.map(([l,v,c])=>`<div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};margin-right:6px"></span>${l}: <b>${prodHrs(v)}</b> <span style="color:#6b7280">(${prodPct(v/tot)})</span></div>`).join('')}
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:8px">Speed loss = run time not converted to shots at target cycle time (slow cycles, small stops). Quality loss = time spent making off shots and rejected parts.</div>
  </div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card"><div class="ch"><h5>Downtime Pareto — ${prodHrs(t.downtime)} total</h5></div><div class="cb">
      ${downRows.length?prodBars(downRows):'<div style="color:#9ca3af;text-align:center;padding:16px">No downtime recorded.</div>'}</div></div>
    <div class="card"><div class="ch"><h5>By machine</h5></div><div class="tw"><table>
      <thead><tr><th>Machine</th><th style="text-align:right">A</th><th style="text-align:right">P</th><th style="text-align:right">Q</th><th style="text-align:right">OEE</th><th style="text-align:right">Downtime</th><th style="text-align:right">Act / Tgt CT</th></tr></thead>
      <tbody>${byMachine.map(({m,a})=>`<tr><td><b>${esc(prodMachineLabel(m))}</b></td>
        <td class="mono" style="text-align:right">${prodPct(a.t.A)}</td><td class="mono" style="text-align:right">${prodPct(a.t.P)}</td>
        <td class="mono" style="text-align:right">${prodPct(a.t.Q)}</td>
        <td class="mono" style="text-align:right;font-weight:700;color:${prodTier(a.t.oee,.75,.55)}">${prodPct(a.t.oee)}</td>
        <td class="mono" style="text-align:right">${prodHrs(a.t.downtime)}</td>
        <td class="mono" style="text-align:right">${a.t.actCT?a.t.actCT.toFixed(0):'—'} / ${a.t.tgtCT?a.t.tgtCT.toFixed(0):'—'}s</td></tr>`).join('')||prodEmpty(7,'No data.')}</tbody>
    </table></div></div>
  </div>
  <div class="card"><div class="ch"><h5>Hourly efficiency pattern (average across the range)</h5></div><div class="tw"><table>
    <thead><tr><th>Shift</th>${Array.from({length:PROD_SLOTS},(_,i)=>`<th style="text-align:center;font-size:10.5px">${i+1}</th>`).join('')}</tr></thead>
    <tbody>${Object.keys(PROD_SHIFTS).filter(k=>slotEff[k]).map(k=>`<tr><td><b>${k}</b></td>${slotEff[k].map((a,i)=>{
      const e=a.avail?a.ideal/a.avail:null;
      return `<td class="mono" style="text-align:center;${e==null?'':`color:${prodTier(e,.9,.75)};font-weight:600`}" title="${prodSlotLabel(k,i)}">${e==null?'—':Math.round(e*100)+'%'}</td>`;}).join('')}</tr>`).join('')||prodEmpty(13,'No hourly data with target cycle times.')}</tbody>
  </table><div style="font-size:11px;color:#6b7280;padding:6px 12px">Column n = n-th hour of the shift. Low first hours usually mean slow start-up / die heating; low hours before a break mean hand-over loss.</div></div></div>
  <div class="card"><div class="ch"><h5>Daily trend</h5></div><div class="tw"><table>
    <thead><tr><th>Date</th><th>Machine / shift</th><th style="text-align:right">Shots</th><th style="text-align:right">OK pcs</th><th style="text-align:right">Downtime</th><th style="text-align:right">A</th><th style="text-align:right">P</th><th style="text-align:right">Q</th><th style="text-align:right">OEE</th><th>Top downtime</th></tr></thead>
    <tbody>${dates.map(d=>byDate[d].map(({s,c},k)=>{ const x=c.t, top=Object.entries(c.byDown).sort((a,b)=>b[1]-a[1])[0];
      return `<tr ${k===0?'style="border-top:2px solid var(--border)"':''}><td class="mono">${k===0?d:''}</td>
      <td>${esc(prodMachineLabel(ctx.machineById[s.machineId]))} · ${esc(s.shift)}</td>
      <td class="mono" style="text-align:right">${prodFmt(x.shots)}</td><td class="mono" style="text-align:right">${prodFmt(x.okPcs)}</td>
      <td class="mono" style="text-align:right">${x.downtime?prodFmt(x.downtime)+'m':'—'}</td>
      <td class="mono" style="text-align:right">${prodPct(x.A)}</td><td class="mono" style="text-align:right">${prodPct(x.P)}</td><td class="mono" style="text-align:right">${prodPct(x.Q)}</td>
      <td class="mono" style="text-align:right;font-weight:700;color:${prodTier(x.oee,.75,.55)}">${prodPct(x.oee)}</td>
      <td style="font-size:12px">${top?`${esc(top[0])} (${prodFmt(top[1])}m)`:''}</td></tr>`;}).join('')).join('')||prodEmpty(10,'No data.')}</tbody>
  </table></div></div>`);
}

// ══════════════════════════════════════════════════════
//  4. REJECTION ANALYSIS
// ══════════════════════════════════════════════════════
async function prodRenderRejection(f={}){
  const ctx=await prodCtx();
  f={from:f.from||prodDaysAgo(29), to:f.to||prodToday(), machineId:f.machineId||'', shift:f.shift||'', partId:f.partId||'', off:f.off||false};
  const rows=await prodLoadShifts(ctx,f);
  // With a part filter, count only that part's runs (a shift may have run several parts)
  const pick=c=>{ if(!f.partId) return c;
    const runs=c.runs.filter(r=>String(r.partId)===String(f.partId));
    const x={t:{},byGrade:{},byPart:{},byDefect:{},byDown:{}};
    for(const k of PROD_SUM_KEYS) x.t[k]=runs.reduce((s,r)=>s+(r[k]||0),0);
    prodMergeMaps(x,runs,[]); x.t=prodRatios(x.t); return x; };
  const calcs=rows.map(r=>pick(r.c));
  const agg=prodAgg(calcs), t=agg.t;

  const defRows=Object.entries(agg.byDefect).map(([code,v])=>({label:ctx.defectByCode[code]?.description||code,value:v}));
  if(f.off&&t.offPcs) defRows.push({label:'Off shots (warm-up)',value:t.offPcs});
  defRows.sort((a,b)=>b.value-a.value);

  const partRows=Object.entries(agg.byPart).map(([pid,v])=>({p:ctx.partById[pid],v,ppm:(v.castPcs-v.offPcs)>0?v.rejPcs/(v.castPcs-v.offPcs)*1e6:0})).sort((a,b)=>b.v.rejPcs-a.v.rejPcs);
  const byDate={};
  rows.forEach((r,i)=>{ (byDate[r.s.date]=byDate[r.s.date]||[]).push(calcs[i]); });
  const trend=Object.entries(byDate).map(([d,cs])=>({d,a:prodAgg(cs).t})).sort((a,b)=>b.d.localeCompare(a.d));

  setC(`
  <div class="ph"><h2>📉 Rejection Analysis</h2></div>
  ${prodFilterBar('prj',f,ctx,{part:true,onApply:'prodRenderRejection'})}
  <div class="sg" style="grid-template-columns:repeat(5,1fr)">
    ${prodTile('🔩',prodFmt(t.castPcs),'Parts cast')}
    ${prodTile('✅',prodFmt(t.okPcs),'OK parts',null,'#dcfce7')}
    ${prodTile('❌',prodFmt(t.rejPcs),'Defect rejections','#dc2626','#fee2e2')}
    ${prodTile('🔥',prodFmt(t.offPcs),'Off-shot pcs','#d97706','#fef3c7')}
    ${prodTile('📉',prodFmt(t.ppm),`PPM · ${prodPct(t.rejPct)} total rej`,t.ppm>20000?'#dc2626':t.ppm>5000?'#d97706':'#16a34a','#fee2e2')}
  </div>
  <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:14px">
    <div class="card"><div class="ch"><h5>Rejection Pareto (pcs)</h5>
      <label style="font-size:12px;display:flex;gap:5px;align-items:center"><input type="checkbox" ${f.off?'checked':''} onchange="prodRenderRejection({...prodReadFilter('prj'),off:this.checked})"> include off shots</label></div>
      <div class="cb">${defRows.length?prodBars(defRows):'<div style="color:#9ca3af;text-align:center;padding:16px">No rejections in this range.</div>'}</div></div>
    <div class="card"><div class="ch"><h5>By part</h5></div><div class="tw"><table>
      <thead><tr><th>Part</th><th style="text-align:right">Cast</th><th style="text-align:right">Rejected</th><th style="text-align:right">Off pcs</th><th style="text-align:right">PPM</th><th>Top defect</th></tr></thead>
      <tbody>${partRows.map(({p,v,ppm})=>{ const top=Object.entries(v.rej).sort((a,b)=>b[1]-a[1])[0];
        return `<tr><td>${esc(p?.partNumber||'?')}</td><td class="mono" style="text-align:right">${prodFmt(v.castPcs)}</td>
        <td class="mono" style="text-align:right;color:#dc2626">${prodFmt(v.rejPcs)}</td><td class="mono" style="text-align:right">${prodFmt(v.offPcs)}</td>
        <td class="mono" style="text-align:right;font-weight:600">${prodFmt(ppm)}</td>
        <td style="font-size:12px">${top?esc(ctx.defectByCode[top[0]]?.description||top[0])+` (${top[1]})`:''}</td></tr>`;}).join('')||prodEmpty(6,'No data.')}</tbody>
    </table></div></div>
  </div>
  <div class="card"><div class="ch"><h5>Daily trend</h5></div><div class="tw"><table>
    <thead><tr><th>Date</th><th style="text-align:right">Cast</th><th style="text-align:right">OK</th><th style="text-align:right">Defect rej</th><th style="text-align:right">Off pcs</th><th style="text-align:right">Rej %</th><th style="text-align:right">PPM</th></tr></thead>
    <tbody>${trend.map(({d,a})=>`<tr><td class="mono">${d}</td><td class="mono" style="text-align:right">${prodFmt(a.castPcs)}</td>
      <td class="mono" style="text-align:right">${prodFmt(a.okPcs)}</td><td class="mono" style="text-align:right;color:#dc2626">${prodFmt(a.rejPcs)}</td>
      <td class="mono" style="text-align:right">${prodFmt(a.offPcs)}</td><td class="mono" style="text-align:right">${prodPct(a.rejPct)}</td>
      <td class="mono" style="text-align:right;font-weight:600">${prodFmt(a.ppm)}</td></tr>`).join('')||prodEmpty(7,'No data.')}</tbody>
  </table>
  <div style="font-size:11px;color:#6b7280;padding:6px 12px">PPM = defect rejections ÷ (parts cast − off-shot parts) × 1,000,000. Rej % includes off shots.</div></div></div>`);
}

// ══════════════════════════════════════════════════════
//  5. MATERIAL CONSUMPTION
// ══════════════════════════════════════════════════════
async function prodRenderMaterial(f={}){
  const ctx=await prodCtx();
  f={from:f.from||prodToday().slice(0,8)+'01', to:f.to||prodToday(), machineId:f.machineId||'', shift:f.shift||''};
  const rows=await prodLoadShifts(ctx,f);
  const agg=prodAgg(rows.map(r=>r.c));
  const grades=Object.entries(agg.byGrade).sort((a,b)=>b[1].totalKg-a[1].totalKg);
  const lines=[];
  rows.forEach(({s,c})=>c.runs.forEach(r=>{ if(r.castPcs) lines.push({s,r}); }));
  const basis=ctx.cfg.consumptionBasis==='ok'?'OK parts':'all parts cast (incl. rejections & off shots)';

  setC(`
  <div class="ph"><h2>🔥 Material Consumption</h2></div>
  ${prodFilterBar('pmt',f,ctx,{onApply:'prodRenderMaterial'})}
  <div class="sg" style="grid-template-columns:repeat(4,1fr)">
    ${prodTile('⚖️',prodFmt(agg.t.netKg,1)+' kg','Net casting weight')}
    ${prodTile('🔥',prodFmt(agg.t.lossKg,1)+' kg',`Melting loss (${prodFmt(ctx.cfg.meltLossPct,1)}%)`,'#d97706','#fef3c7')}
    ${prodTile('🏗️',prodFmt(agg.t.totalKg,1)+' kg','Total metal consumed',null,'#dbeafe')}
    ${prodTile('🔩',prodFmt(agg.t.castPcs),'Parts cast')}
  </div>
  <div class="alert al-w" style="background:#f6f8fc;border-color:var(--border);color:#374151"><span>ℹ️ Metal per part = net weight + ${prodFmt(ctx.cfg.meltLossPct,1)}% melting loss (e.g. 0.500 kg → ${prodFmt(prodMetalPerPc(0.5,ctx.cfg),3)} kg). Consumption = metal per part × ${basis}. Change the basis or loss % in <a href="#" onclick="event.preventDefault();nav('prod-setup')">Machines &amp; Settings</a>.</span></div>
  ${agg.t.shotsNoWt?`<div class="alert al-w"><span>⚠️ ${prodFmt(agg.t.shotsNoWt)} shots are for parts with no net weight — they are not counted. Set weights in <a href="#" onclick="event.preventDefault();nav('prod-parts')">Part Master</a>.</span></div>`:''}
  <div class="card"><div class="ch"><h5>By grade</h5></div><div class="tw"><table>
    <thead><tr><th>Grade</th><th style="text-align:right">Parts cast</th><th style="text-align:right">OK parts</th><th style="text-align:right">Net kg</th><th style="text-align:right">Melting loss kg</th><th style="text-align:right">Total kg</th></tr></thead>
    <tbody>${grades.map(([g,v])=>`<tr><td><span class="badge" style="background:#FAEEDA;color:#BA7517">${esc(g)}</span></td>
      <td class="mono" style="text-align:right">${prodFmt(v.castPcs)}</td><td class="mono" style="text-align:right">${prodFmt(v.okPcs)}</td>
      <td class="mono" style="text-align:right">${prodFmt(v.netKg,1)}</td><td class="mono" style="text-align:right">${prodFmt(v.lossKg,1)}</td>
      <td class="mono" style="text-align:right;font-weight:700">${prodFmt(v.totalKg,1)}</td></tr>`).join('')||prodEmpty(6,'No production in this range.')}</tbody>
  </table></div></div>
  <div class="card"><div class="ch"><h5>By shift</h5></div><div class="tw"><table>
    <thead><tr><th>Date</th><th>Shift</th><th>Machine</th><th>Part</th><th>Grade</th><th style="text-align:right">Pcs</th><th style="text-align:right">Net wt/pc</th><th style="text-align:right">Metal/pc (+${prodFmt(ctx.cfg.meltLossPct,1)}%)</th><th style="text-align:right">Total kg</th><th style="text-align:right">of which loss kg</th></tr></thead>
    <tbody>${lines.map(({s,r})=>`<tr><td class="mono">${esc(s.date)}</td><td>${esc(s.shift)}</td><td>${esc(prodMachineLabel(ctx.machineById[s.machineId]))}</td>
      <td>${esc(r.part?.partNumber||'?')}</td><td>${esc(r.grade)}</td><td class="mono" style="text-align:right">${prodFmt(r.wt?r.netKg/r.wt:0)}</td>
      <td class="mono" style="text-align:right">${r.wt?prodFmt(r.wt,3):'—'}</td><td class="mono" style="text-align:right">${r.wt?prodFmt(prodMetalPerPc(r.wt,ctx.cfg),3):'—'}</td>
      <td class="mono" style="text-align:right;font-weight:600">${prodFmt(r.totalKg,1)}</td><td class="mono" style="text-align:right;color:#6b7280">${prodFmt(r.lossKg,1)}</td></tr>`).join('')||prodEmpty(10,'No data.')}</tbody>
  </table></div></div>`);
}

// ══════════════════════════════════════════════════════
//  6. STOCK — raw material (by grade) and parts
//  RM:    opening / adjustments + lots received (kg) − metal consumed
//  Parts: opening / adjustments + OK parts produced − dispatched
// ══════════════════════════════════════════════════════
async function prodRenderStock(f={}){
  const ctx=await prodCtx();
  const asOn=f.asOn||prodToday();
  const [shiftRows,disp,adj]=await Promise.all([
    prodLoadShifts(ctx,{to:asOn}), db.prodDispatch.toArray().catch(()=>[]), db.prodStockAdj.toArray().catch(()=>[])]);
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
  const p=k=>pt[k]||(pt[k]={adj:0,made:0,disp:0});
  Object.entries(agg.byPart).forEach(([k,v])=>p(k).made+=v.okPcs);
  disp.filter(d=>(d.date||'')<=asOn).forEach(d=>p(d.partId).disp+=prodN(d.qty));
  adjIn.filter(a=>a.kind==='part').forEach(a=>p(a.partId).adj+=prodN(a.qty));

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
    <thead><tr><th>Part</th><th>Grade</th><th style="text-align:right">Opening / adj.</th><th style="text-align:right">+ OK produced</th><th style="text-align:right">− Dispatched</th><th style="text-align:right">= Balance</th></tr></thead>
    <tbody>${Object.entries(pt).map(([k,v])=>({part:ctx.partById[k],v})).sort((a,b)=>String(a.part?.partNumber).localeCompare(String(b.part?.partNumber))).map(({part,v})=>`<tr>
      <td>${esc(prodPartLabel(part))}</td><td>${esc(part?.grade||'')}</td>
      <td class="mono" style="text-align:right">${prodFmt(v.adj)}</td><td class="mono" style="text-align:right">${prodFmt(v.made)}</td>
      <td class="mono" style="text-align:right">${prodFmt(v.disp)}</td>${bal(v.adj+v.made-v.disp,'',0)}</tr>`).join('')||prodEmpty(6,'No part movements yet.')}</tbody>
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
//  7. DISPATCH REGISTER
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
//  8. PART MASTER (production data per part)
// ══════════════════════════════════════════════════════
async function prodRenderParts(){
  const ctx=await prodCtx();
  const mcs=ctx.machines;
  setC(`
  <div class="ph"><h2>🔩 Production Part Master</h2>
    <div style="display:flex;gap:8px"><button class="btn btn-o" onclick="prodImportPqParts()">⤓ Import from Process Quality parts</button>
    <button class="btn btn-p" onclick="prodOpenPart()">➕ Add Part</button></div></div>
  <div class="alert al-w" style="background:#f6f8fc;border-color:var(--border);color:#374151">ℹ️ Net weight drives metal consumption; target cycle time (seconds per shot, per machine) drives Performance / OEE and hourly targets.</div>
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
//  9. MACHINES, DEFECT CODES & SETTINGS
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
  </div>`);
}
async function prodSaveCfg(){
  const v=x=>document.getElementById(x).value;
  await DB.setSetting('prodConfig',{meltLossPct:prodN(v('pcfg-loss')), consumptionBasis:v('pcfg-basis'), plannedMinutes:prodN(v('pcfg-plan'))||720});
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

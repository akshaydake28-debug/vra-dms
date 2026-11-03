// VRA DMS — WORK INSTRUCTIONS & SOPs (step builder with photos)
//
// A WI/SOP built here is an ordinary document: same number series
// (VRA-WI-xxx / VRA-SOP-xxx), same revisions, approval and audit trail.
// What differs is the body: instead of free-form editor HTML, the version
// record carries `wi` = {photos, area, machine, part, instruments, ppe,
// steps[]}, and the document's extra.format is 'steps'. Each step holds one
// photo (a token served by /api/public/wi-photo/<token>) beside its text,
// so step text and photo can never drift apart.

const WI_PPE=['Safety shoes','Cotton gloves','Heat-resistant gloves','Safety glasses','Ear plugs','Apron','Face shield','Helmet','Mask'];
const WI_EXTRA={
  key:  {label:'Key point', print:'★ Key point', fg:'#5b3fb3', bg:'#eee9fb', ph:'Why it matters, or a tip'},
  check:{label:'Check',     print:'✓ Check',     fg:'#15803d', bg:'#e5f4ea', ph:'What good looks like / what to look for'},
  avoid:{label:'Avoid',     print:'✗ Avoid',     fg:'#b42318', bg:'#fbe7e5', ph:'What not to do'},
  tool: {label:'Tool',      print:'Tool',        fg:'#0d2f6e', bg:'#e3eaf7', ph:''},
};
const WI_EXTRA_KEYS=['key','check','avoid','tool'];
let WI=null;          // builder state while the builder is open
let _wiUid=1;
let _wiLinks=null;    // machines / parts / gauges for the pickers

function wiPhotoUrl(t){ return t? `${location.origin}/api/public/wi-photo/${encodeURIComponent(t)}` : ''; }
function wiClone(o){ return JSON.parse(JSON.stringify(o)); }
function wiNewStep(o={}){ return {uid:_wiUid++,kind:'step',text:'',key:'',check:'',avoid:'',tool:'',photo:'',photoBase:'',ann:[],...o}; }
function wiEmptyWi(type){ return {photos:true,area:'',machineId:'',machineLabel:'',partId:'',partLabel:'',instruments:[],ppe:[],steps:[wiNewStep()]}; }
function wiNums(steps){ let n=0; return steps.map(s=>s.kind==='section'?null:++n); }

function wiCSS(){
  if(document.getElementById('wi-css')) return;
  const st=document.createElement('style'); st.id='wi-css';
  st.textContent=`
.wi-b{display:grid;grid-template-columns:270px minmax(0,1fr);gap:14px;align-items:start}
.wi-rail{position:sticky;top:60px;display:flex;flex-direction:column;gap:0}
.wi-rail .cb{display:flex;flex-direction:column;gap:10px}
.wi-seg{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden}
.wi-seg button{flex:1;border:0;background:#f5f7fd;padding:6px;cursor:pointer;font-weight:600;font-size:12px;color:#6b7280}
.wi-seg button.on{background:var(--navy);color:#fff}
.wi-docno{font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--navy);font-size:13px}
.wi-small{font-size:11px;color:#6b7280;line-height:1.45}
.wi-chk{display:flex;gap:7px;align-items:center;font-size:12.5px;cursor:pointer}
.wi-inst{max-height:210px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:4px}
.wi-inst label{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px;align-items:center;font-size:11.5px;padding:4px;border-radius:4px;cursor:pointer}
.wi-inst label:hover{background:#f5f7fd}
.wi-ppe{display:flex;flex-wrap:wrap;gap:5px}
.wi-ppe button{border:1px solid var(--border);background:#fff;border-radius:999px;padding:3px 9px;font-size:11.5px;cursor:pointer}
.wi-ppe button.on{border-color:var(--navy);background:#e3eaf7;color:var(--navy);font-weight:600}
.wi-tb{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.wi-tb .cnt{margin-left:auto;font-size:12px;color:#6b7280}
.wi-steps{display:flex;flex-direction:column;gap:9px}
.wi-step{background:#fff;border:1px solid var(--border);border-radius:9px;display:grid;grid-template-columns:46px 270px minmax(0,1fr)}
.wi-step.nophoto{grid-template-columns:46px minmax(0,1fr)}
.wi-step.dragging,.wi-sec.dragging{opacity:.4}
.wi-step.over,.wi-sec.over{box-shadow:0 -3px 0 var(--navy)}
.wi-num{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 0;border-right:1px solid var(--border);background:#f7f9fd;border-radius:9px 0 0 9px}
.wi-num b{font-family:'IBM Plex Mono',monospace;font-size:16px;color:var(--navy)}
.wi-mini{border:0;background:none;color:#8a94a6;cursor:pointer;font-size:13px;padding:2px 5px;border-radius:4px;line-height:1.2}
.wi-mini:hover{color:var(--navy);background:#e3eaf7}
.wi-handle{cursor:grab;font-size:14px;letter-spacing:-2px}
.wi-ph{padding:10px;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:6px}
.wi-slot{aspect-ratio:4/3;width:100%;border-radius:6px;overflow:hidden;background:#f5f7fd;border:1.5px dashed #c3cce0;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;color:#6b7280;font-size:12px;position:relative}
.wi-slot.has{border:1px solid var(--border);cursor:zoom-in;background:#111}
.wi-slot img{width:100%;height:100%;object-fit:contain;display:block}
.wi-slot.drop{border-color:var(--navy);background:#e3eaf7}
.wi-slot .busy{position:absolute;inset:0;background:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--navy)}
.wi-pa{display:flex;gap:4px;flex-wrap:wrap}
.wi-f{padding:10px 12px;display:flex;flex-direction:column;gap:7px;min-width:0}
.wi-f textarea.wi-txt{font-size:13.5px;font-weight:500;min-height:52px;resize:vertical}
.wi-f textarea{resize:vertical;min-height:34px}
.wi-x{display:grid;grid-template-columns:86px minmax(0,1fr) auto;gap:7px;align-items:start}
.wi-tag{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:4px;padding:7px 4px;text-align:center}
.wi-add{display:flex;gap:5px;flex-wrap:wrap}
.wi-add button{border:1px dashed #c3cce0;background:none;border-radius:999px;padding:2px 10px;font-size:11.5px;cursor:pointer;color:#6b7280}
.wi-add button:hover{border-color:var(--navy);color:var(--navy)}
.wi-sec{background:#e3eaf7;border:1px solid #c5d0f0;border-radius:9px;display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center}
.wi-sec input{border:0;background:none;font-weight:700;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--navy);padding:10px 4px;width:100%}
.wi-sec input:focus{outline:none}
.wi-warn{font-size:11.5px;color:#b42318;font-weight:600;margin-top:3px}
.wi-addbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.wi-addbar .btn{flex:1;min-width:150px;border:1.5px dashed #c3cce0;background:#fff;color:var(--navy)}
.wi-dirty{font-size:11px;color:#a65d06;font-weight:600}
/* read-only body */
.wi-v-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:14px;font-size:12.5px}
.wi-v-info div{padding:7px 10px;border-bottom:1px solid #eef0f4}
.wi-v-info b{display:block;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px}
.wi-v-tbl{width:100%;border-collapse:collapse}
.wi-v-tbl td{border:1px solid #e5e7eb;padding:8px;vertical-align:top;font-size:13px;background:#fff}
.wi-v-tbl td.n{width:40px;text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--navy);font-size:15px}
.wi-v-tbl td.p{width:44%}
.wi-v-tbl td.p img{width:100%;max-height:300px;object-fit:contain;display:block;border-radius:4px;background:#f3f4f6;cursor:zoom-in}
.wi-v-tbl tr.s td{background:var(--navy);color:#fff;font-weight:700;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;padding:6px 9px}
.wi-v-ins{font-weight:500;margin-bottom:6px;line-height:1.5}
.wi-v-ln{font-size:12px;border-radius:5px;padding:4px 8px;margin-top:4px;line-height:1.45}
.wi-v-en{font-size:11px;color:#6b7280;font-weight:400;margin-top:2px}
/* annotator */
.wi-ann{position:fixed;inset:0;background:rgba(10,16,30,.82);z-index:300;display:flex;flex-direction:column}
.wi-ann-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:#fff}
.wi-ann-bar .grp{display:flex;gap:4px;align-items:center;padding-right:8px;border-right:1px solid #e5e7eb}
.wi-ann-bar button.btn.on{background:var(--navy)!important;color:#fff!important;border-color:var(--navy)!important}
.wi-ann-c{width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #c3cce0;cursor:pointer;padding:0}
.wi-ann-c.on{box-shadow:0 0 0 3px var(--navy)}
.wi-ann-stage{flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px}
.wi-ann-stage canvas{max-width:100%;max-height:100%;cursor:crosshair;background:#fff;box-shadow:0 6px 30px rgba(0,0,0,.5)}
.wi-zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:300;display:flex;align-items:center;justify-content:center;cursor:zoom-out}
.wi-zoom img{max-width:94vw;max-height:94vh}
@media (max-width:1000px){.wi-b{grid-template-columns:minmax(0,1fr)}.wi-rail{position:static}.wi-step{grid-template-columns:46px minmax(0,1fr)}.wi-step .wi-ph{grid-column:2;border-right:0;border-bottom:1px solid var(--border)}.wi-step .wi-f{grid-column:2}}
`;
  document.head.appendChild(st);
}

// ══════════════════════════════════════════════════════
//  LINKED RECORDS (Production machines & parts, Calibration gauges)
// ══════════════════════════════════════════════════════
async function wiLoadLinks(){
  const [machines,parts,gauges,calRecs]=await Promise.all([
    db.prodMachines.toArray().catch(()=>[]), db.prodParts.toArray().catch(()=>[]),
    db.calGauges.toArray().catch(()=>[]), db.calRecords.toArray().catch(()=>[])]);
  const due={};
  for(const r of calRecs){
    const k=String(r.gaugeId); if(!r.nextDue) continue;
    if(!due[k]||(r.calibDate||'')>(due[k].calibDate||'')) due[k]=r;
  }
  const dueOf=g=>(due[String(g.id)]?.nextDue)||g.nextDueOverride||'';
  _wiLinks={
    machines:machines.filter(m=>m.active!==false).sort((a,b)=>String(a.code).localeCompare(String(b.code))),
    parts:parts.filter(p=>p.active!==false).sort((a,b)=>String(a.partNumber).localeCompare(String(b.partNumber))),
    gauges:gauges.filter(g=>(g.status||'Active')!=='Scrapped').sort((a,b)=>String(a.gaugeId).localeCompare(String(b.gaugeId),undefined,{numeric:true})),
    dueOf,
  };
  return _wiLinks;
}
function wiMachineLabel(m){ return m? [m.code,m.name].filter(Boolean).join(' · ') : ''; }
function wiPartLabel(p){ return p? `${p.partNumber||''}${p.partName?' — '+p.partName:''}${p.customer?' ('+p.customer+')':''}` : ''; }
function wiDue(nextDue){
  if(!nextDue) return {cls:'bd',txt:'No cal. record',state:'none'};
  const t=new Date(); t.setHours(0,0,0,0);
  const d=Math.ceil((new Date(nextDue)-t)/864e5);
  if(d<0) return {cls:'br',txt:`Overdue ${-d}d`,state:'over'};
  if(d<=30) return {cls:'bp',txt:`Due in ${d}d`,state:'soon'};
  return {cls:'ba',txt:`Due ${nextDue}`,state:'ok'};
}

// ══════════════════════════════════════════════════════
//  REGISTRY
// ══════════════════════════════════════════════════════
async function wiRenderRegistry(p={}){
  wiCSS();
  const all=(await DB.listDocs({})).filter(d=>d.format==='steps');
  const f={type:p.type||'',status:p.status||'',q:decodeURIComponent(p.q||'')};
  const docs=all.filter(d=>(!f.type||d.docType===f.type)&&(!f.status||d.status===f.status)&&
    (!f.q||(d.title||'').toLowerCase().includes(f.q.toLowerCase())||(d.docNumber||'').toLowerCase().includes(f.q.toLowerCase())));
  setC(`
  <div class="ph"><h2>📸 Work Instructions &amp; SOPs</h2>
    <div style="display:flex;gap:7px">
      <button class="btn btn-p" onclick="wiNew('WI')">➕ New Work Instruction</button>
      <button class="btn btn-o" onclick="wiNew('SOP')">➕ New SOP</button>
    </div></div>
  <div class="card"><div class="cb" style="padding:11px 15px;font-size:12.5px;color:#4b5563;line-height:1.6">
    Build step by step: <b>one photo beside each step</b>, plus optional <b>Key point / Check / Avoid / Tool</b> lines.
    Numbers continue the existing <span class="mono">VRA-WI-xxx</span> and <span class="mono">VRA-SOP-xxx</span> series, and approval works the same as for every other document.
    The printout carries a QR code that opens the current approved revision on any phone, with no login.
  </div></div>
  <div class="card"><div class="cb" style="padding:10px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:2;min-width:160px"><label class="lbl">Search</label><input class="fc" id="wi-q" placeholder="Title or number…" value="${esc(f.q)}"></div>
      <div style="flex:1;min-width:110px"><label class="lbl">Type</label><select class="fc" id="wi-t"><option value="">WI + SOP</option>
        ${['WI','SOP'].map(t=>`<option ${f.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div style="flex:1;min-width:110px"><label class="lbl">Status</label><select class="fc" id="wi-s"><option value="">All</option>
        ${['ACTIVE','DRAFT','PENDING_APPROVAL','REJECTED'].map(s=>`<option ${f.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <button class="btn btn-p" id="wi-filter" onclick="nav('wi','type='+document.getElementById('wi-t').value+'&status='+document.getElementById('wi-s').value+'&q='+encodeURIComponent(document.getElementById('wi-q').value))">Filter</button>
      <button class="btn btn-o" onclick="nav('wi')">Clear</button>
    </div></div></div>
  <div class="card"><div class="ch"><h5>${docs.length} document(s)</h5></div>
    <div class="tw"><table>
      <thead><tr><th>Number</th><th>Type</th><th>Title</th><th>Rev</th><th>Status</th><th>By</th><th>Date</th><th></th></tr></thead>
      <tbody>${docs.map(d=>`<tr>
        <td class="mono" style="color:#0d2f6e;font-weight:600">${esc(d.docNumber)}</td>
        <td>${tPill(d.docType)}</td><td style="font-weight:500">${esc(d.title)}</td>
        <td class="mono">${esc(d.revision)}</td><td>${sBadge(d.status)}</td>
        <td class="muted">${esc(d.createdBy||'')}</td><td class="muted">${fmtD(d.createdDate)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-o btn-xs" onclick="viewDoc(${d.id})">View</button>
          <button class="btn btn-o btn-xs" onclick="wiPrint(${d.id})">🖨 Print</button>
          <a class="btn btn-o btn-xs" href="/wi/${encodeURIComponent(d.docNumber)}" target="_blank" rel="noopener" title="Phone view">📱</a>
        </td></tr>`).join('')||`<tr><td colspan="8" style="text-align:center;padding:28px;color:#9ca3af">No step-by-step documents yet. Click <b>New Work Instruction</b> to make the first one.</td></tr>`}
      </tbody></table></div></div>`);
  document.getElementById('wi-q').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('wi-filter').click();});
}

// ══════════════════════════════════════════════════════
//  BUILDER
// ══════════════════════════════════════════════════════
async function wiNew(type='WI'){
  WI={mode:'create',type,title:'',summary:'',wi:wiEmptyWi(type),dirty:false};
  if(type==='SOP') WI.wi.photos=true;
  await wiOpenBuilder();
}
async function wiEdit(id){
  const doc=await DB.getDoc(id); if(!doc){toast('Not found','d');return}
  if(!['DRAFT','REJECTED'].includes(doc.status)){toast('Only a draft or rejected revision can be edited. Start a new revision first.','w');return viewDoc(id)}
  const ver=await DB.getVer(id,doc.revision);
  const wi=ver?.wi?wiClone(ver.wi):wiEmptyWi(doc.docType);
  wi.steps=(wi.steps||[]).map(s=>s.kind==='section'?{uid:_wiUid++,kind:'section',text:s.text||''}:wiNewStep(s));
  if(!wi.steps.length) wi.steps=[wiNewStep()];
  WI={mode:'edit',docId:id,docNumber:doc.docNumber,revision:doc.revision,type:doc.docType,title:doc.title,
      summary:ver?.changeSummary&&!/in progress/i.test(ver.changeSummary)?ver.changeSummary:'',wi,dirty:false};
  await wiOpenBuilder();
}
async function wiOpenBuilder(){
  wiCSS();
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.toggle('active',el.dataset.view==='wi'));
  document.getElementById('topbar-title').textContent=WI.mode==='create'?'New Work Instruction / SOP':'Edit Work Instruction / SOP';
  setC(`<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>`);
  await wiLoadLinks();
  WI.wi.steps.forEach(s=>{ if(s.kind!=='section') s._show=Object.fromEntries(WI_EXTRA_KEYS.map(k=>[k,!!s[k]])); });
  const nextNo=WI.mode==='create'?await DB.nextNum(WI.type):WI.docNumber;
  setC(`
  <div class="ph">
    <h2>${WI.mode==='create'?'➕ New':'✏️ Edit'} <span id="wi-head-type">${WI.type==='SOP'?'SOP':'Work Instruction'}</span>
      ${WI.mode==='edit'?`<span class="mono" style="color:#6b7280;font-weight:500">${esc(WI.docNumber)} Rev ${esc(WI.revision)}</span>`:''}</h2>
    <div style="display:flex;gap:8px;align-items:center"><span class="wi-dirty" id="wi-dirty"></span>
      <button class="btn btn-o" onclick="wiCancel()">Cancel</button>
      <button class="btn btn-p" onclick="wiSave()">💾 ${WI.mode==='create'?'Save as Draft':'Save'}</button></div>
  </div>
  <div class="wi-b" id="wi-builder">
    <aside class="wi-rail">
      <div class="card"><div class="ch"><h5>Document</h5></div><div class="cb">
        ${WI.mode==='create'?`<div><label class="lbl">Type</label><div class="wi-seg" id="wi-type">
          <button data-t="WI" class="${WI.type==='WI'?'on':''}">WI · Work Instruction</button><button data-t="SOP" class="${WI.type==='SOP'?'on':''}">SOP</button></div></div>`:''}
        <div><label class="lbl">Number</label><div class="wi-docno" id="wi-no">${esc(nextNo)}</div>
          <div class="wi-small">${WI.mode==='create'?'Next free number in this series. Assigned when you save.':'Fixed for this document.'}</div></div>
        <div><label class="lbl">Title <span style="color:red">*</span></label><input class="fc" id="wi-title" value="${esc(WI.title)}" placeholder="e.g. Final inspection — Pump Housing"></div>
        ${WI.mode==='edit'?`<div><label class="lbl">Change summary <span style="color:red">*</span></label><input class="fc" id="wi-sum" value="${esc(WI.summary)}" placeholder="What changed?"></div>`:''}
        <label class="wi-chk" id="wi-photos-row" title="${WI.type==='WI'?'Work instructions always have a photo column':''}">
          <input type="checkbox" id="wi-photos" ${WI.wi.photos?'checked':''} ${WI.type==='WI'?'disabled':''}> Steps have photos</label>
      </div></div>
      <div class="card"><div class="ch"><h5>Where &amp; what</h5></div><div class="cb">
        <div><label class="lbl">Machine</label><select class="fc" id="wi-mach"><option value="">— none —</option>
          ${_wiLinks.machines.map(m=>`<option value="${m.id}" ${String(m.id)===String(WI.wi.machineId)?'selected':''}>${esc(wiMachineLabel(m))}</option>`).join('')}</select></div>
        <div><label class="lbl">Area / station</label><input class="fc" id="wi-area" value="${esc(WI.wi.area||'')}" placeholder="e.g. Inspection room, Fettling"></div>
        <div><label class="lbl">Part / customer</label><select class="fc" id="wi-part"><option value="">— none (applies to all) —</option>
          ${_wiLinks.parts.map(p=>`<option value="${p.id}" ${String(p.id)===String(WI.wi.partId)?'selected':''}>${esc(wiPartLabel(p))}</option>`).join('')}</select></div>
        <div><label class="lbl">Instruments used</label>
          <input class="fc" id="wi-inst-q" placeholder="Search gauge ID or name…" style="margin-bottom:5px">
          <div class="wi-inst" id="wi-inst"></div>
          <div class="wi-small" style="margin-top:4px">From the Gauge Register. Calibration status shows on the printout.</div></div>
      </div></div>
      <div class="card"><div class="ch"><h5>PPE required</h5></div><div class="cb"><div class="wi-ppe" id="wi-ppe"></div></div></div>
    </aside>
    <div>
      <div class="wi-tb">
        <button class="btn btn-p" onclick="document.getElementById('wi-bulk').click()" id="wi-bulk-btn">📷 Add photos → one step each</button>
        <input type="file" id="wi-bulk" accept="image/*" multiple style="display:none">
        <span class="cnt" id="wi-cnt"></span>
      </div>
      <div class="wi-steps" id="wi-steps"></div>
      <div class="wi-addbar">
        <button class="btn" onclick="wiAddStep()">＋ Add step</button>
        <button class="btn" onclick="wiAddSection()">＋ Add section heading</button>
      </div>
      <div class="wi-small" style="margin-top:10px">Tip: take the photos in order on the shop floor, then use <b>Add photos → one step each</b> and type a line under each one. Drag ⋮⋮ to reorder. Photos are compressed automatically.</div>
    </div>
  </div>`);
  wiBindRail(); wiRenderInst(); wiRenderPpe(); wiRenderSteps(); wiMarkDirty(false);
}
function wiMarkDirty(v=true){ if(!WI) return; WI.dirty=v; const el=document.getElementById('wi-dirty'); if(el) el.textContent=v?'● Unsaved changes':''; }
function wiCancel(){
  if(WI?.dirty && !confirm('Leave without saving? Your changes will be lost.')) return;
  const back=WI?.mode==='edit'?WI.docId:null; WI=null;
  back?viewDoc(back):nav('wi');
}
// Guard sidebar navigation and tab close while the builder has unsaved work.
document.addEventListener('click',e=>{
  const item=e.target.closest?.('.sl-item'); if(!item) return;
  if(WI?.dirty && document.getElementById('wi-builder')){
    if(!confirm('Leave without saving? Your changes will be lost.')){e.stopPropagation();e.preventDefault();return}
    WI=null;
  }
},true);
window.addEventListener('beforeunload',e=>{ if(WI?.dirty&&document.getElementById('wi-builder')){e.preventDefault();e.returnValue='';} });

function wiBindRail(){
  const $=id=>document.getElementById(id);
  $('wi-type')?.addEventListener('click',async e=>{
    const t=e.target.closest('button')?.dataset.t; if(!t||t===WI.type) return;
    WI.type=t; if(t==='WI') WI.wi.photos=true;
    $('wi-type').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
    $('wi-head-type').textContent=t==='SOP'?'SOP':'Work Instruction';
    $('wi-photos').disabled=t==='WI'; $('wi-photos').checked=WI.wi.photos;
    $('wi-no').textContent=await DB.nextNum(t); wiRenderSteps(); wiMarkDirty();
  });
  $('wi-title').addEventListener('input',e=>{WI.title=e.target.value;wiMarkDirty()});
  $('wi-sum')?.addEventListener('input',e=>{WI.summary=e.target.value;wiMarkDirty()});
  $('wi-photos').addEventListener('change',e=>{WI.wi.photos=e.target.checked;wiRenderSteps();wiMarkDirty()});
  $('wi-mach').addEventListener('change',e=>{const m=_wiLinks.machines.find(x=>String(x.id)===e.target.value);WI.wi.machineId=m?m.id:'';WI.wi.machineLabel=wiMachineLabel(m);wiMarkDirty()});
  $('wi-part').addEventListener('change',e=>{const p=_wiLinks.parts.find(x=>String(x.id)===e.target.value);WI.wi.partId=p?p.id:'';WI.wi.partLabel=wiPartLabel(p);wiMarkDirty()});
  $('wi-area').addEventListener('input',e=>{WI.wi.area=e.target.value;wiMarkDirty()});
  $('wi-inst-q').addEventListener('input',()=>wiRenderInst());
  $('wi-inst').addEventListener('change',e=>{
    const id=e.target.dataset.g; if(!id) return;
    const g=_wiLinks.gauges.find(x=>String(x.id)===id);
    WI.wi.instruments=e.target.checked
      ? [...WI.wi.instruments.filter(x=>String(x.id)!==id),{id:g.id,gaugeId:g.gaugeId||'',name:g.name||''}]
      : WI.wi.instruments.filter(x=>String(x.id)!==id);
    wiRenderSteps(); wiMarkDirty();
  });
  $('wi-ppe').addEventListener('click',e=>{
    const p=e.target.closest('button')?.dataset.p; if(!p) return;
    WI.wi.ppe=WI.wi.ppe.includes(p)?WI.wi.ppe.filter(x=>x!==p):[...WI.wi.ppe,p];
    wiRenderPpe(); wiMarkDirty();
  });
  $('wi-bulk').addEventListener('change',wiBulkAdd);
  const st=$('wi-steps');
  st.addEventListener('input',wiStepInput);
  st.addEventListener('change',e=>{ if(e.target.dataset.f==='tool'){ wiStepInput(e); wiRenderSteps(); } });
  st.addEventListener('click',wiStepClick);
  wiBindDrag(st);
}
function wiRenderInst(){
  const q=(document.getElementById('wi-inst-q')?.value||'').toLowerCase();
  const sel=new Set(WI.wi.instruments.map(x=>String(x.id)));
  const list=_wiLinks.gauges.filter(g=>sel.has(String(g.id))||!q||`${g.gaugeId} ${g.name} ${g.type||''}`.toLowerCase().includes(q))
    .sort((a,b)=>(sel.has(String(b.id))?1:0)-(sel.has(String(a.id))?1:0));
  // instruments linked earlier but no longer in the register still show, so they can be unlinked
  const missing=WI.wi.instruments.filter(x=>!_wiLinks.gauges.some(g=>String(g.id)===String(x.id)));
  document.getElementById('wi-inst').innerHTML=(missing.map(x=>`<label><input type="checkbox" data-g="${x.id}" checked><span><b class="mono" style="font-size:11px">${esc(x.gaugeId)}</b> ${esc(x.name)}</span><span class="badge br">Not in register</span></label>`).join('')+
    list.map(g=>{const d=wiDue(_wiLinks.dueOf(g));return`<label><input type="checkbox" data-g="${g.id}" ${sel.has(String(g.id))?'checked':''}>
      <span><b class="mono" style="font-size:11px">${esc(g.gaugeId||'')}</b> ${esc(g.name||'')}</span><span class="badge ${d.cls}">${esc(d.txt)}</span></label>`}).join(''))
    ||`<div class="wi-small" style="padding:8px">${_wiLinks.gauges.length?'No match.':'No gauges in the Gauge Register yet.'}</div>`;
}
function wiRenderPpe(){
  const all=[...WI_PPE,...WI.wi.ppe.filter(p=>!WI_PPE.includes(p))];
  document.getElementById('wi-ppe').innerHTML=all.map(p=>`<button type="button" data-p="${esc(p)}" class="${WI.wi.ppe.includes(p)?'on':''}">${esc(p)}</button>`).join('');
}

function wiInstLabel(id,list){
  const g=(list||WI?.wi.instruments||[]).find(x=>String(x.id)===String(id));
  return g?`${g.gaugeId?g.gaugeId+' · ':''}${g.name}`:'';
}
function wiRenderSteps(){
  const el=document.getElementById('wi-steps'); if(!el) return;
  const steps=WI.wi.steps, nums=wiNums(steps), photos=WI.wi.photos;
  el.innerHTML=steps.map((s,i)=>{
    if(s.kind==='section') return `<div class="wi-sec" draggable="true" data-i="${i}">
      <div style="text-align:center"><span class="wi-mini wi-handle" title="Drag to move">⋮⋮</span></div>
      <input value="${esc(s.text)}" data-f="text" placeholder="SECTION HEADING (e.g. Start-up, Measurement)">
      <div style="padding-right:6px;white-space:nowrap"><button class="wi-mini" data-a="up" title="Move up">↑</button><button class="wi-mini" data-a="down" title="Move down">↓</button><button class="wi-mini" data-a="del" title="Delete heading">✕</button></div></div>`;
    const show=s._show||{};
    const extras=WI_EXTRA_KEYS.filter(k=>show[k]).map(k=>{
      const x=WI_EXTRA[k]; let input;
      if(k==='tool'){
        const opts=WI.wi.instruments.map(g=>`<option value="${g.id}" ${String(g.id)===String(s.tool)?'selected':''}>${esc(wiInstLabel(g.id))}</option>`).join('');
        input=`<select class="fc" data-f="tool"><option value="">${WI.wi.instruments.length?'— pick an instrument —':'— link instruments on the left first —'}</option>${opts}</select>`;
        const g=_wiLinks.gauges.find(x=>String(x.id)===String(s.tool));
        if(g&&wiDue(_wiLinks.dueOf(g)).state==='over') input+=`<div class="wi-warn">⚠ ${esc(g.gaugeId)} calibration is overdue. Approvers will see this.</div>`;
      } else input=`<textarea class="fc" rows="1" data-f="${k}" placeholder="${esc(x.ph)}">${esc(s[k])}</textarea>`;
      return `<div class="wi-x"><span class="wi-tag" style="background:${x.bg};color:${x.fg}">${x.label}</span><div>${input}</div><button class="wi-mini" data-x="${k}" title="Remove this line">✕</button></div>`;
    }).join('');
    const adders=WI_EXTRA_KEYS.filter(k=>!show[k]).map(k=>`<button type="button" data-add="${k}">＋ ${WI_EXTRA[k].label}</button>`).join('');
    return `<div class="wi-step ${photos?'':'nophoto'}" draggable="true" data-i="${i}">
      <div class="wi-num"><b>${String(nums[i]).padStart(2,'0')}</b>
        <span class="wi-mini wi-handle" title="Drag to move">⋮⋮</span>
        <button class="wi-mini" data-a="up" title="Move up">↑</button><button class="wi-mini" data-a="down" title="Move down">↓</button>
        <button class="wi-mini" data-a="dup" title="Duplicate step">⧉</button><button class="wi-mini" data-a="del" title="Delete step">✕</button></div>
      ${photos?`<div class="wi-ph">
        <div class="wi-slot ${s.photo?'has':''}" data-slot>${s.photo?`<img src="${wiPhotoUrl(s.photo)}" alt="Step ${nums[i]} photo">`:'<div>📷<br>Click or drop a photo<br><span class="wi-small">JPG / PNG · auto-compressed</span></div>'}</div>
        ${s.photo?`<div class="wi-pa"><button class="btn btn-o btn-xs" data-a="annot">✎ Mark up</button><button class="btn btn-o btn-xs" data-a="replace">Replace</button><button class="btn btn-o btn-xs" data-a="rmph">Remove</button></div>`:''}
      </div>`:''}
      <div class="wi-f">
        <textarea class="fc wi-txt" data-f="text" placeholder="What should the person do in this step?">${esc(s.text)}</textarea>
        ${extras}
        ${adders?`<div class="wi-add">${adders}</div>`:''}
      </div></div>`;
  }).join('')||`<div class="card"><div class="cb" style="text-align:center;color:#9ca3af;padding:28px">No steps yet. Add photos to create one step per photo, or click <b>Add step</b>.</div></div>`;
  const n=steps.filter(s=>s.kind!=='section').length, p=steps.filter(s=>s.kind!=='section'&&s.photo).length;
  document.getElementById('wi-cnt').textContent=`${n} step${n===1?'':'s'}${photos?` · ${p} with photo`:''}`;
}
function wiStepInput(e){
  const card=e.target.closest('[data-i]'), f=e.target.dataset.f; if(!card||!f) return;
  WI.wi.steps[+card.dataset.i][f]=e.target.value; wiMarkDirty();
}
function wiStepClick(e){
  const card=e.target.closest('[data-i]'); if(!card) return;
  const i=+card.dataset.i, s=WI.wi.steps[i], steps=WI.wi.steps;
  const add=e.target.closest('[data-add]')?.dataset.add, x=e.target.closest('[data-x]')?.dataset.x, a=e.target.closest('[data-a]')?.dataset.a;
  if(add){ s._show[add]=true; wiRenderSteps(); document.querySelector(`#wi-steps [data-i="${i}"] [data-f="${add}"]`)?.focus(); return; }
  if(x){ s._show[x]=false; s[x]=''; wiRenderSteps(); wiMarkDirty(); return; }
  if(e.target.closest('[data-slot]')&&!a){ if(s.photo) wiZoom(wiPhotoUrl(s.photo)); else wiPickPhoto(i); return; }
  if(!a) return;
  if(a==='up'&&i>0) [steps[i-1],steps[i]]=[steps[i],steps[i-1]];
  else if(a==='down'&&i<steps.length-1) [steps[i+1],steps[i]]=[steps[i],steps[i+1]];
  else if(a==='del'){ const st=steps[i]; if((st.text||st.photo)&&!confirm('Delete this '+(st.kind==='section'?'heading':'step')+'?')) return; steps.splice(i,1); }
  else if(a==='dup') steps.splice(i+1,0,{...wiClone({...s,_show:undefined}),uid:_wiUid++,_show:{...s._show}});
  else if(a==='rmph'){ s.photo=''; s.photoBase=''; s.ann=[]; }
  else if(a==='replace'){ wiPickPhoto(i); return; }
  else if(a==='annot'){ wiAnnotate(i); return; }
  else return;
  wiRenderSteps(); wiMarkDirty();
}
function wiAddStep(){ WI.wi.steps.push(wiNewStep({_show:{}})); wiRenderSteps(); wiMarkDirty(); const c=document.querySelectorAll('#wi-steps .wi-step'); c[c.length-1]?.querySelector('textarea')?.focus(); }
function wiAddSection(){ WI.wi.steps.push({uid:_wiUid++,kind:'section',text:''}); wiRenderSteps(); wiMarkDirty(); const c=document.querySelectorAll('#wi-steps .wi-sec'); c[c.length-1]?.querySelector('input')?.focus(); }

function wiBindDrag(st){
  let from=null;
  st.addEventListener('dragstart',e=>{
    const c=e.target.closest?.('[data-i]'); if(!c) return;
    if(e.target.closest('textarea,input,select')){e.preventDefault();return}
    from=+c.dataset.i; c.classList.add('dragging'); e.dataTransfer.effectAllowed='move';
    try{e.dataTransfer.setData('text/plain','step')}catch(_){}
  });
  st.addEventListener('dragend',()=>{from=null;st.querySelectorAll('.dragging,.over,.drop').forEach(x=>x.classList.remove('dragging','over','drop'))});
  st.addEventListener('dragover',e=>{
    const c=e.target.closest('[data-i]'); if(!c) return; e.preventDefault();
    st.querySelectorAll('.over,.drop').forEach(x=>x.classList.remove('over','drop'));
    if(from===null) c.querySelector('[data-slot]')?.classList.add('drop'); else c.classList.add('over');
  });
  st.addEventListener('drop',async e=>{
    const c=e.target.closest('[data-i]'); if(!c) return; e.preventDefault();
    const to=+c.dataset.i;
    if(from===null){
      const f=[...(e.dataTransfer.files||[])].find(f=>f.type.startsWith('image/'));
      st.querySelectorAll('.drop').forEach(x=>x.classList.remove('drop'));
      if(f&&WI.wi.steps[to].kind!=='section') await wiSetStepPhoto(to,f);
      return;
    }
    const [m]=WI.wi.steps.splice(from,1); WI.wi.steps.splice(to,0,m); from=null; wiRenderSteps(); wiMarkDirty();
  });
}

// ── photos ──
function wiCompress(file,max=1600,q=0.8){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onerror=()=>rej(new Error('Could not read the file'));
    r.onload=ev=>{const img=new Image();
      img.onload=()=>{const sc=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');
        c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
        const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
        res(c.toDataURL('image/jpeg',q));};
      img.onerror=()=>rej(new Error('That file is not an image this browser can open'));
      img.src=ev.target.result;};
    r.readAsDataURL(file);
  });
}
async function wiUploadDataUrl(dataUrl){
  const r=await fetch(location.origin+'/api/wi/photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.token) throw new Error(j.error||`Upload failed (${r.status})`);
  return j.token;
}
async function wiSetStepPhoto(i,file){
  const slot=document.querySelector(`#wi-steps [data-i="${i}"] [data-slot]`);
  if(slot) slot.insertAdjacentHTML('beforeend','<div class="busy">Uploading…</div>');
  try{
    const token=await wiUploadDataUrl(await wiCompress(file));
    Object.assign(WI.wi.steps[i],{photo:token,photoBase:'',ann:[]});
    wiMarkDirty();
  }catch(err){ toast('⚠️ '+esc(err.message),'d'); }
  wiRenderSteps();
}
function wiPickPhoto(i){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=e=>{const f=e.target.files[0]; if(f) wiSetStepPhoto(i,f);};
  inp.click();
}
async function wiBulkAdd(e){
  const files=[...e.target.files].filter(f=>f.type.startsWith('image/')).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  e.target.value=''; if(!files.length) return;
  const btn=document.getElementById('wi-bulk-btn'); btn.disabled=true;
  // An untouched first step is replaced rather than left empty above the new ones.
  const st=WI.wi.steps;
  if(st.length===1&&st[0].kind!=='section'&&!st[0].text&&!st[0].photo) st.length=0;
  WI.wi.photos=true; const pc=document.getElementById('wi-photos'); if(pc) pc.checked=true;
  let ok=0;
  for(const [k,f] of files.entries()){
    btn.textContent=`Uploading ${k+1} of ${files.length}…`;
    try{ const token=await wiUploadDataUrl(await wiCompress(f)); st.push(wiNewStep({photo:token,_show:{}})); ok++; wiRenderSteps(); }
    catch(err){ toast(`⚠️ ${esc(f.name)}: ${esc(err.message)}`,'d'); }
  }
  btn.disabled=false; btn.textContent='📷 Add photos → one step each';
  wiRenderSteps(); wiMarkDirty();
  if(ok) toast(`✅ ${ok} step${ok===1?'':'s'} added in photo order. Now type a line for each.`,'s');
}
function wiZoom(url){
  const z=document.createElement('div'); z.className='wi-zoom'; z.innerHTML=`<img src="${url}" alt="">`;
  z.onclick=()=>z.remove(); document.body.appendChild(z);
}

// ── photo mark-up (arrows, circles, boxes, text) ──
// Marks are kept in 0–1 coordinates on the original photo so they can be
// edited again later; saving flattens them into a new photo for the step.
function wiAnnotate(i){
  const s=WI.wi.steps[i]; const base=s.photoBase||s.photo;
  const A={tool:'arrow',color:'#dc2626',marks:wiClone(s.ann||[]),drag:null,img:new Image()};
  const ov=document.createElement('div'); ov.className='wi-ann'; ov.id='wi-ann';
  const colors=['#dc2626','#16a34a','#f59e0b','#2563eb','#ffffff'];
  ov.innerHTML=`<div class="wi-ann-bar">
    <div class="grp">${[['arrow','➜ Arrow'],['ellipse','◯ Circle'],['rect','▭ Box'],['text','T Text']].map(([t,l])=>`<button class="btn btn-o btn-sm ${t===A.tool?'on':''}" data-t="${t}">${l}</button>`).join('')}</div>
    <div class="grp">${colors.map(c=>`<button class="wi-ann-c ${c===A.color?'on':''}" data-c="${c}" style="background:${c}" title="Colour"></button>`).join('')}</div>
    <div class="grp"><input class="fc" id="wi-ann-txt" placeholder="Label text, then click the photo" style="width:230px;padding:5px 8px"></div>
    <div class="grp"><button class="btn btn-o btn-sm" data-a="undo">↶ Undo</button><button class="btn btn-o btn-sm" data-a="clear">Clear all</button></div>
    <div style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-o btn-sm" data-a="cancel">Cancel</button><button class="btn btn-p btn-sm" data-a="save">✓ Save mark-up</button></div>
  </div><div class="wi-ann-stage"><canvas id="wi-ann-cv"></canvas></div>`;
  document.body.appendChild(ov);
  const cv=ov.querySelector('canvas'), ctx=cv.getContext('2d');
  const draw=()=>{
    ctx.drawImage(A.img,0,0,cv.width,cv.height);
    const all=A.drag?[...A.marks,A.drag]:A.marks;
    for(const m of all) wiDrawMark(ctx,m,cv.width,cv.height);
  };
  A.img.onload=()=>{const sc=Math.min(1,1600/Math.max(A.img.naturalWidth,A.img.naturalHeight));cv.width=Math.round(A.img.naturalWidth*sc);cv.height=Math.round(A.img.naturalHeight*sc);draw();};
  A.img.onerror=()=>{toast('Could not load the photo for mark-up','d');ov.remove();};
  A.img.src=wiPhotoUrl(base);
  const pt=e=>{const r=cv.getBoundingClientRect();const p=e.touches?e.touches[0]:e;return{x:Math.min(1,Math.max(0,(p.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(p.clientY-r.top)/r.height))}};
  const down=e=>{e.preventDefault();const p=pt(e);
    if(A.tool==='text'){const t=document.getElementById('wi-ann-txt').value.trim();if(!t){toast('Type the label text in the box first','w');document.getElementById('wi-ann-txt').focus();return}
      A.marks.push({t:'text',x:p.x,y:p.y,text:t,c:A.color});draw();return}
    A.drag={t:A.tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,c:A.color};};
  const move=e=>{if(!A.drag)return;e.preventDefault();const p=pt(e);A.drag.x2=p.x;A.drag.y2=p.y;draw();};
  const up=()=>{if(!A.drag)return;const d=A.drag;A.drag=null;if(Math.hypot(d.x2-d.x1,d.y2-d.y1)>0.01)A.marks.push(d);draw();};
  cv.addEventListener('mousedown',down);window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  cv.addEventListener('touchstart',down,{passive:false});cv.addEventListener('touchmove',move,{passive:false});cv.addEventListener('touchend',up);
  const close=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);ov.remove();};
  ov.querySelector('.wi-ann-bar').addEventListener('click',async e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.t){A.tool=b.dataset.t;ov.querySelectorAll('[data-t]').forEach(x=>x.classList.toggle('on',x===b));if(A.tool==='text')document.getElementById('wi-ann-txt').focus();return}
    if(b.dataset.c){A.color=b.dataset.c;ov.querySelectorAll('[data-c]').forEach(x=>x.classList.toggle('on',x===b));return}
    const a=b.dataset.a;
    if(a==='undo'){A.marks.pop();draw()}
    else if(a==='clear'){A.marks=[];draw()}
    else if(a==='cancel') close();
    else if(a==='save'){
      b.disabled=true;b.textContent='Saving…';
      try{
        if(!A.marks.length) Object.assign(s,{photo:base,photoBase:'',ann:[]});
        else{ A.drag=null; draw(); const token=await wiUploadDataUrl(cv.toDataURL('image/jpeg',0.85)); Object.assign(s,{photo:token,photoBase:base,ann:A.marks}); }
        close(); wiRenderSteps(); wiMarkDirty();
      }catch(err){toast('⚠️ '+esc(err.message),'d');b.disabled=false;b.textContent='✓ Save mark-up';}
    }
  });
}
function wiDrawMark(ctx,m,W,H){
  const lw=Math.max(4,Math.round(Math.max(W,H)/170));
  ctx.save(); ctx.strokeStyle=m.c; ctx.fillStyle=m.c; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.shadowColor='rgba(0,0,0,.35)'; ctx.shadowBlur=lw;
  if(m.t==='arrow'){
    const x1=m.x1*W,y1=m.y1*H,x2=m.x2*W,y2=m.y2*H,ang=Math.atan2(y2-y1,x2-x1),L=lw*5;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2-Math.cos(ang)*L*0.6,y2-Math.sin(ang)*L*0.6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-L*Math.cos(ang-0.45),y2-L*Math.sin(ang-0.45));ctx.lineTo(x2-L*Math.cos(ang+0.45),y2-L*Math.sin(ang+0.45));ctx.closePath();ctx.fill();
  } else if(m.t==='ellipse'){
    const cx=(m.x1+m.x2)/2*W,cy=(m.y1+m.y2)/2*H,rx=Math.abs(m.x2-m.x1)/2*W,ry=Math.abs(m.y2-m.y1)/2*H;
    ctx.beginPath();ctx.ellipse(cx,cy,Math.max(rx,2),Math.max(ry,2),0,0,Math.PI*2);ctx.stroke();
  } else if(m.t==='rect'){
    ctx.strokeRect(Math.min(m.x1,m.x2)*W,Math.min(m.y1,m.y2)*H,Math.abs(m.x2-m.x1)*W,Math.abs(m.y2-m.y1)*H);
  } else if(m.t==='text'){
    const fs=Math.max(18,Math.round(Math.max(W,H)/26)); ctx.font=`bold ${fs}px Arial, sans-serif`; ctx.shadowBlur=0;
    const tw=ctx.measureText(m.text).width, pad=fs*0.3, x=Math.min(m.x*W,W-tw-pad*2), y=Math.max(m.y*H,fs+pad);
    ctx.fillStyle='rgba(255,255,255,.92)'; ctx.fillRect(x-pad,y-fs-pad*0.4,tw+pad*2,fs+pad*1.4);
    ctx.strokeStyle=m.c; ctx.lineWidth=Math.max(2,lw/2); ctx.strokeRect(x-pad,y-fs-pad*0.4,tw+pad*2,fs+pad*1.4);
    ctx.fillStyle=m.c==='#ffffff'?'#111':m.c; ctx.fillText(m.text,x,y);
  }
  ctx.restore();
}

// ── save ──
function wiCleanWi(){
  const w=WI.wi;
  const steps=w.steps.map(s=>s.kind==='section'
      ? {kind:'section',text:(s.text||'').trim()}
      : {kind:'step',text:(s.text||'').trim(),key:(s.key||'').trim(),check:(s.check||'').trim(),avoid:(s.avoid||'').trim(),
         tool:s.tool||'',photo:s.photo||'',photoBase:s.photoBase||'',ann:s.ann||[]})
    .filter(s=>s.kind==='section'?s.text:(s.text||s.photo));
  return {photos:!!w.photos,area:(w.area||'').trim(),machineId:w.machineId||'',machineLabel:w.machineLabel||'',
    partId:w.partId||'',partLabel:w.partLabel||'',instruments:w.instruments||[],ppe:w.ppe||[],steps};
}
async function wiSave(){
  if(!WI) return;
  const title=(WI.title||'').trim();
  if(!title){toast('⚠️ Enter a title','d');document.getElementById('wi-title')?.focus();return}
  if(WI.mode==='edit'&&!(WI.summary||'').trim()){toast('⚠️ Enter a change summary','d');document.getElementById('wi-sum')?.focus();return}
  const wi=wiCleanWi();
  if(!wi.steps.some(s=>s.kind==='step')){toast('⚠️ Add at least one step','d');return}
  const noText=wi.steps.filter(s=>s.kind==='step'&&!s.text).length;
  if(noText&&!confirm(`${noText} step${noText>1?'s have':' has'} a photo but no text. Save anyway?`)) return;
  const content=wiContentHTML(wi), u=Auth.user, now=new Date().toISOString();
  if(WI.mode==='create'){
    let docId=null, docNumber='';
    for(let tries=0;tries<3&&!docId;tries++){
      db.documents.invalidate?.();
      docNumber=await DB.nextNum(WI.type);
      docId=await DB.createDoc({docNumber,docType:WI.type,title,revision:'A',status:'DRAFT',createdBy:u.name,createdDate:now,extra:{format:'steps'}});
    }
    if(!docId){toast('⚠️ Could not save. Check your connection and try again.','d');return}
    await DB.createVer({docId,revision:'A',content,wi,changeSummary:'Initial creation',preparedBy:u.name,preparedDate:now,status:'DRAFT'});
    await DB.log({docId,docNumber,action:'CREATED',user:u.name,notes:`"${title}" created (step builder)`});
    WI=null; toast(`✅ ${docNumber} saved as draft`,'s'); viewDoc(docId);
  } else {
    const id=WI.docId, doc=await DB.getDoc(id);
    if(!['DRAFT','REJECTED'].includes(doc?.status)){toast('⚠️ This revision is no longer a draft, so it cannot be saved.','d');return}
    if(doc.title!==title) await DB.updateDoc(id,{title});
    const ver=await DB.getVer(id,doc.revision);
    const summary=WI.summary.trim();
    if(ver) await DB.updateVer(ver.id,{content,wi,changeSummary:summary,preparedBy:u.name,preparedDate:now});
    else await DB.createVer({docId:id,revision:doc.revision,content,wi,changeSummary:summary,preparedBy:u.name,preparedDate:now,status:doc.status});
    await DB.log({docId:id,docNumber:doc.docNumber,action:'EDITED',user:u.name,notes:summary});
    WI=null; toast('✅ Saved','s'); viewDoc(id);
  }
}

// Plain HTML copy of the steps, kept in the version's `content` so the
// document still reads sensibly anywhere that only knows about content.
function wiContentHTML(wi){
  const nums=wiNums(wi.steps);
  return `<table>${wi.steps.map((s,i)=>s.kind==='section'?`<tr><th colspan="3">${esc(s.text)}</th></tr>`:
    `<tr><td>${nums[i]}</td><td>${s.photo&&wi.photos?`<img src="/api/public/wi-photo/${esc(s.photo)}" style="width:240px">`:''}</td><td><p>${esc(s.text)}</p>${
      WI_EXTRA_KEYS.filter(k=>s[k]).map(k=>`<div><b>${WI_EXTRA[k].label}:</b> ${esc(k==='tool'?wiInstLabel(s.tool,wi.instruments):s[k])}</div>`).join('')}</td></tr>`).join('')}</table>`;
}

// ══════════════════════════════════════════════════════
//  TRANSLATION (Marathi / Hindi)
//  Step text is translated field by field (instruction, key point, check,
//  avoid, section headings, area, PPE, title) with the same MyMemory
//  service as normal documents. Translations are saved on the version
//  under wiTr[lang][englishText], so re-opening or re-printing does not
//  call the service again and the wording stays the same every print.
//  Labels are fixed bilingual text, e.g. "तपासा (Check)".
// ══════════════════════════════════════════════════════
const WI_LABELS={
  en:{step:'Step',photo:'Photo',instruction:'Instruction',key:'★ Key point',check:'✓ Check',avoid:'✗ Avoid',tool:'Tool',
      machine:'Machine',area:'Area / station',machArea:'Machine / area',part:'Part / customer',allParts:'All parts',instruments:'Instruments',ppe:'PPE',
      ack:t=>`OPERATOR ACKNOWLEDGEMENT — I have read and understood this ${t}`,sr:'Sr',name:'Name',emp:'Emp No',sign:'Signature',date:'Date',trainer:'Trained by',
      rev:'REVISION HISTORY',scan:'Scan for the current<br>approved revision'},
  mr:{step:'पायरी',photo:'फोटो',instruction:'सूचना (Instruction)',key:'★ महत्त्वाचा मुद्दा (Key point)',check:'✓ तपासा (Check)',avoid:'✗ टाळा (Avoid)',tool:'साधन (Tool)',
      machine:'मशीन (Machine)',area:'क्षेत्र (Area)',machArea:'मशीन / क्षेत्र',part:'पार्ट / ग्राहक',allParts:'सर्व पार्ट (All parts)',instruments:'उपकरणे (Instruments)',ppe:'सुरक्षा साधने (PPE)',
      ack:()=>'ऑपरेटर पोचपावती — मी ही सूचना वाचली आणि समजून घेतली आहे (Operator acknowledgement)',sr:'क्र.',name:'नाव',emp:'कर्मचारी क्र.',sign:'सही',date:'दिनांक',trainer:'प्रशिक्षक',
      rev:'आवृत्ती इतिहास (REVISION HISTORY)',scan:'नवीनतम मंजूर आवृत्तीसाठी<br>स्कॅन करा'},
  hi:{step:'चरण',photo:'फोटो',instruction:'निर्देश (Instruction)',key:'★ मुख्य बिंदु (Key point)',check:'✓ जाँचें (Check)',avoid:'✗ बचें (Avoid)',tool:'उपकरण (Tool)',
      machine:'मशीन (Machine)',area:'क्षेत्र (Area)',machArea:'मशीन / क्षेत्र',part:'पार्ट / ग्राहक',allParts:'सभी पार्ट (All parts)',instruments:'मापन उपकरण (Instruments)',ppe:'सुरक्षा उपकरण (PPE)',
      ack:()=>'ऑपरेटर पावती — मैंने यह निर्देश पढ़ और समझ लिया है (Operator acknowledgement)',sr:'क्र.',name:'नाम',emp:'कर्मचारी क्र.',sign:'हस्ताक्षर',date:'दिनांक',trainer:'प्रशिक्षक',
      rev:'संशोधन इतिहास (REVISION HISTORY)',scan:'नवीनतम स्वीकृत संस्करण के लिए<br>स्कैन करें'},
};
const WI_TR_FIELDS=['text','key','check','avoid'];

// Returns {wi, title, failed}: a copy of the steps with translated text and
// the English kept on each step as `en`, for checking the translation.
async function wiTranslate(docId,langCode,onProgress){
  const doc=await DB.getDoc(docId), ver=await DB.getVer(docId,doc.revision);
  const wi=ver?.wi; if(!wi?.steps?.length) throw new Error('This document has no steps to translate');
  const saved=(ver.wiTr&&ver.wiTr[langCode])||{};
  const memo={...saved};
  const want=new Set([doc.title,wi.area,...(wi.ppe||[])]);
  for(const st of wi.steps){ if(st.kind==='section') want.add(st.text); else WI_TR_FIELDS.forEach(f=>want.add(st[f])); }
  const todo=[...want].filter(t=>t&&String(t).trim()&&!(t in memo));
  let failed=0, lastErr='';
  for(let i=0;i<todo.length;i++){
    try{ memo[todo[i]]=await myMemoryTranslate(todo[i],langCode); }
    catch(e){ failed++; lastErr=e.message; if(/rate limit/i.test(e.message)) { failed+=todo.length-i-1; break; } }
    onProgress&&onProgress(i+1,todo.length);
    if(i>0&&i%5===0) await new Promise(r=>setTimeout(r,300));
  }
  if(todo.length&&failed===todo.length&&!Object.keys(saved).length) throw new Error(lastErr||'Translation service did not answer');
  if(Object.keys(memo).length>Object.keys(saved).length)
    await DB.updateVer(ver.id,{wiTr:{...(ver.wiTr||{}),[langCode]:memo}}).catch(()=>{});
  const T=t=>(t&&memo[t])||t||'';
  const out=wiClone(wi);
  out.area=T(wi.area); out.ppe=(wi.ppe||[]).map(T);
  out.steps=wi.steps.map(st=>{
    if(st.kind==='section') return {...st,text:T(st.text),en:{text:st.text}};
    const t={...st,en:{}}; WI_TR_FIELDS.forEach(f=>{ t.en[f]=st[f]||''; t[f]=T(st[f]); }); return t;
  });
  return {wi:out,title:T(doc.title),failed};
}
// English original shown small under a translated line (screen + print)
function wiEnLine(st,f,cls){ const en=st.en?.[f]; return en&&en!==st[f]?`<div class="${cls}">${esc(en)}</div>`:''; }

// ══════════════════════════════════════════════════════
//  READ-ONLY BODY (used inside the normal document view)
// ══════════════════════════════════════════════════════
function wiBodyHTML(wi,L=WI_LABELS.en){
  wiCSS();
  if(!wi||!wi.steps) return '<p style="color:#9ca3af">No steps yet.</p>';
  const nums=wiNums(wi.steps), photos=wi.photos;
  const info=[[L.machine,wi.machineLabel],[L.area,wi.area],[L.part,wi.partLabel],
    [L.instruments,(wi.instruments||[]).map(g=>`${g.gaugeId?g.gaugeId+' ':''}${g.name}`).join(', ')],[L.ppe,(wi.ppe||[]).join(', ')]].filter(x=>x[1]);
  return `${info.length?`<div class="wi-v-info">${info.map(([l,v])=>`<div><b>${l}</b>${esc(v)}</div>`).join('')}</div>`:''}
  <table class="wi-v-tbl">${wi.steps.map((s,i)=>{
    if(s.kind==='section') return `<tr class="s"><td colspan="${photos?3:2}">${esc(s.text)}${s.en?.text&&s.en.text!==s.text?` <span style="opacity:.7;font-weight:400;text-transform:none;letter-spacing:0">(${esc(s.en.text)})</span>`:''}</td></tr>`;
    const lines=WI_EXTRA_KEYS.filter(k=>s[k]).map(k=>`<div class="wi-v-ln" style="background:${WI_EXTRA[k].bg};color:${WI_EXTRA[k].fg}"><b>${L[k]}:</b> ${esc(k==='tool'?wiInstLabel(s.tool,wi.instruments):s[k])}${wiEnLine(s,k,'wi-v-en')}</div>`).join('');
    const txt=`<div class="wi-v-ins">${esc(s.text)}${wiEnLine(s,'text','wi-v-en')}</div>${lines}`;
    if(!photos) return `<tr><td class="n">${nums[i]}</td><td>${txt}</td></tr>`;
    return s.photo?`<tr><td class="n">${nums[i]}</td><td class="p"><img src="${wiPhotoUrl(s.photo)}" alt="Step ${nums[i]}" onclick="wiZoom(this.src)"></td><td>${txt}</td></tr>`
                  :`<tr><td class="n">${nums[i]}</td><td colspan="2">${txt}</td></tr>`;
  }).join('')}</table>`;
}

async function wiDeleteDemo(id){
  const doc=await DB.getDoc(id);
  if(!doc?.demo){toast('Only sample documents can be deleted here','d');return}
  if(!confirm(`Delete the sample document ${doc.docNumber}? Real documents are not affected.`)) return;
  for(const v of await DB.getAllVers(id)) await _api('DELETE',`/api/versions/${v.id}`).catch(()=>{});
  await _api('DELETE',`/api/documents/${id}`).catch(()=>{});
  db.documents.invalidate?.();
  await DB.log({docId:id,docNumber:doc.docNumber,action:'DELETED',user:Auth.user.name,notes:'Sample document deleted'});
  toast('🗑 Sample deleted','s'); nav('wi');
}

// ══════════════════════════════════════════════════════
//  PRINT — same header, footer and revision history as every DMS document;
//  the body is the step table. A4 portrait.
// ══════════════════════════════════════════════════════
// tr (optional) = a translation from wiTranslate plus langCode/langName/langLabel.
async function wiPrint(id,tr=null){
  const doc=await DB.getDoc(id); if(!doc){toast('Document not found','d');return}
  const ver=await DB.getVer(id,doc.revision), allVers=await DB.getAllVers(id);
  const wi=tr?.wi||ver?.wi||{steps:[]};
  const L=(tr&&WI_LABELS[tr.langCode])||WI_LABELS.en;
  const links=await wiLoadLinks();
  const typeName_=ALL_TYPES[doc.docType]?.name||doc.docType;
  const nums=wiNums(wi.steps||[]), photos=wi.photos;
  const instTxt=(wi.instruments||[]).map(g=>{
    const live=links.gauges.find(x=>String(x.id)===String(g.id)); const due=live?links.dueOf(live):'';
    return `${esc(g.gaugeId||'')} ${esc(g.name||'')}${due?` <span style="color:#555">(cal. due ${esc(due)})</span>`:''}`;
  }).join('<br>')||'—';
  const qrUrl=`${location.origin}/wi/${encodeURIComponent(doc.docNumber)}?rev=${encodeURIComponent(doc.revision)}`;
  // QR drawn here as SVG (static/core/qrcode.js), so the printout needs no internet library.
  let qrSvg='';
  try{ const q=qrcode(0,'M'); q.addData(qrUrl); q.make(); qrSvg=q.createSvgTag({cellSize:4,margin:0,scalable:true}); }
  catch(e){ qrSvg=`<div style="font-size:6pt;word-break:break-all">${esc(qrUrl)}</div>`; }
  const rows=(wi.steps||[]).map((s,i)=>{
    if(s.kind==='section') return `<tr class="sec"><td colspan="${photos?3:2}">${esc(s.text)}${s.en?.text&&s.en.text!==s.text?` <span style="font-weight:normal;text-transform:none;letter-spacing:0">(${esc(s.en.text)})</span>`:''}</td></tr>`;
    const lines=WI_EXTRA_KEYS.filter(k=>s[k]).map(k=>`<div class="ln"><b>${L[k]}:</b> ${esc(k==='tool'?wiInstLabel(s.tool,wi.instruments):s[k])}${wiEnLine(s,k,'en')}</div>`).join('');
    const txt=`<div class="ins">${esc(s.text)||'&nbsp;'}${wiEnLine(s,'text','en')}</div>${lines}`;
    if(!photos) return `<tr><td class="n">${nums[i]}</td><td>${txt}</td></tr>`;
    return s.photo?`<tr><td class="n">${nums[i]}</td><td class="ph"><img src="${wiPhotoUrl(s.photo)}" alt=""></td><td>${txt}</td></tr>`
                  :`<tr><td class="n">${nums[i]}</td><td colspan="2">${txt}</td></tr>`;
  }).join('');
  const revRows=allVers.map(v=>`<tr><td>${esc(v.revision)}</td><td>${fmtD(v.preparedDate||'')}</td><td>${esc(v.preparedBy||'')}</td><td>${esc(v.approvedBy||'Pending')}</td><td>${esc(v.changeSummary||'')}</td></tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(doc.docNumber)} — ${esc(doc.title)}${tr?' — '+esc(tr.langName):''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,'Nirmala UI','Mangal','Noto Sans Devanagari',sans-serif;font-size:10pt;color:#000;background:#d1d5db;padding:64px 24px 24px}
@page{size:A4;margin:10mm 12mm 11mm}
@media print{body{background:#fff!important;padding:0!important}.no-print{display:none!important}#page-wrap{box-shadow:none!important;margin:0!important;padding:0 1px!important;width:auto!important}}
#page-wrap{background:#fff;width:210mm;max-width:100%;margin:0 auto;padding:12mm 12mm 14mm;box-shadow:0 4px 24px rgba(0,0,0,.25);border-radius:2px}
table{border-collapse:collapse;width:100%}
table.wrap>thead>tr>td{padding-bottom:7px;border-bottom:2px solid #000}
table.wrap>tfoot>tr>td{padding-top:5px;border-top:1px solid #000;font-size:7.5pt;color:#444}
table.wrap>tbody>tr>td{padding-top:8px;vertical-align:top}
table.hdr td{border:none;padding:2px 0;vertical-align:middle}
.hdr-co{font-size:12pt;font-weight:bold}.hdr-title{font-size:11pt;font-weight:bold;text-align:center}
.hdr-type{font-size:8pt;color:#555;text-align:center;margin-top:2px}.hdr-meta{font-size:8.5pt;text-align:right;line-height:1.6}
table.info,table.steps{table-layout:fixed}
.info td,.steps td,.steps th{overflow-wrap:anywhere}
.info td{border:1px solid #999;padding:4px 7px;font-size:8.5pt;vertical-align:top}
.info td.k{background:#ececec;font-weight:bold;width:16%}
.qr{width:27mm;text-align:center;font-size:6.5pt;color:#333}
.qr #qr{width:21mm;height:21mm;margin:0 auto 2px}.qr #qr svg{width:21mm;height:21mm;display:block}
.steps{margin-top:8px}
.steps th{background:#ececec;border:1px solid #999;font-size:8.5pt;padding:4px 6px;text-align:left}
.steps td{border:1px solid #999;vertical-align:top;padding:6px}
.steps td.n{width:11mm;text-align:center;font-weight:bold;font-size:12pt}
.steps td.ph{width:46%;padding:3px;text-align:center}
.steps td.ph img{max-width:100%;max-height:68mm;display:block;margin:0 auto}
.steps tr.sec td{background:#1e3a5f;color:#fff;font-weight:bold;font-size:8.5pt;letter-spacing:.06em;text-transform:uppercase;padding:4px 7px}
.steps tr{break-inside:avoid;page-break-inside:avoid}
.ins{font-size:10.5pt;line-height:1.45;margin-bottom:5px}
.ln{font-size:9pt;line-height:1.4;margin-top:3px}
.en{font-size:7.5pt;color:#555;font-weight:normal;margin-top:1px}
.lang{font-size:8.5pt;color:#166534;text-align:center;font-weight:bold;margin-top:2px}
.lang-note{border:1px solid #86efac;background:#f0fdf4;color:#166534;font-size:8pt;padding:4px 8px;margin-bottom:6px}
.sub{font-size:9pt;font-weight:bold;margin:14px 0 5px;color:#1e3a5f;break-after:avoid}
.sign th,.rev th{border:1px solid #999;padding:4px 6px;font-size:8pt;text-align:left}
.sign th{background:#ececec}.rev th{background:#1e3a5f;color:#fff}
.sign td,.rev td{border:1px solid #999;padding:4px 6px;font-size:8.5pt}
.sign td{height:8mm}
.keep{break-inside:avoid;page-break-inside:avoid}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>
<div class="no-print" style="position:fixed;top:0;left:0;right:0;height:48px;background:#1e293b;padding:0 20px;display:flex;gap:12px;align-items:center;z-index:999">
  <span style="font-size:13px;color:#fff;font-weight:700">V R ALUCAST</span><span style="font-size:11px;color:#94a3b8">|</span>
  <span style="font-size:11px;color:#cbd5e1">${esc(doc.docNumber)} — ${esc(doc.title)}</span><div style="flex:1"></div>
  <button onclick="window.print()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">🖨 Print / Save PDF</button>
</div>
<div id="page-wrap"><table class="wrap">
<thead><tr><td><table class="hdr"><tr>
  <td style="width:33%"><div class="hdr-co">V R ALUCAST</div><div style="font-size:7.5pt;color:#555">Aluminium High Pressure Die Casting</div></td>
  <td style="width:34%"><div class="hdr-title">${esc(doc.title)}</div>${tr&&tr.title&&tr.title!==doc.title?`<div class="hdr-title" style="font-size:10pt">${esc(tr.title)}</div>`:''}<div class="hdr-type">${esc(typeName_)}</div>${tr?`<div class="lang">${esc(tr.langLabel)} (${esc(tr.langName)})</div>`:''}</td>
  <td style="width:33%" class="hdr-meta"><div><b>Doc No:</b> ${esc(doc.docNumber)}</div><div><b>Rev:</b> ${esc(doc.revision)}</div>
    <div><b>Status:</b> ${esc(doc.status)}</div><div><b>Date:</b> ${fmtD(ver?.preparedDate||doc.createdDate||'')}</div></td>
</tr></table></td></tr></thead>
<tbody><tr><td>
  ${tr?`<div class="lang-note">🌐 ${esc(tr.langName)} translation of ${esc(doc.docNumber)} Rev ${esc(doc.revision)}. The English text is shown under each line. For official records, the English document applies.</div>`:''}
  <table class="info"><tr>
    <td class="k">${L.machArea}</td><td>${esc([wi.machineLabel,wi.area].filter(Boolean).join(' · ')||'—')}</td>
    <td class="k">${L.part}</td><td>${esc(wi.partLabel||L.allParts)}</td>
    <td rowspan="2" class="qr"><div id="qr">${qrSvg}</div>${L.scan}</td></tr>
    <tr><td class="k">${L.instruments}</td><td>${instTxt}</td><td class="k">${L.ppe}</td><td>${esc((wi.ppe||[]).join(', ')||'—')}</td></tr></table>
  <table class="steps"><thead><tr><th style="width:11mm">${L.step}</th>${photos?`<th>${L.photo}</th>`:''}<th>${L.instruction}</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="3" style="text-align:center;color:#777">No steps</td></tr>`}</tbody></table>
  <div class="keep"><div class="sub">${L.ack(esc(typeName_.toLowerCase()))}</div>
  <table class="sign"><thead><tr><th style="width:6%">${L.sr}</th><th style="width:30%">${L.name}</th><th style="width:13%">${L.emp}</th><th style="width:19%">${L.sign}</th><th style="width:13%">${L.date}</th><th>${L.trainer}</th></tr></thead>
    <tbody>${[1,2,3,4,5,6].map(n=>`<tr><td>${n}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table></div>
  <div class="keep"><div class="sub">${L.rev}</div>
  <table class="rev"><thead><tr><th>Rev</th><th>Date</th><th>Prepared By</th><th>Approved By</th><th>Change Summary</th></tr></thead><tbody>${revRows}</tbody></table></div>
</td></tr></tbody>
<tfoot><tr><td><table style="width:100%;font-size:7.5pt;color:#555"><tr>
  <td>${esc(doc.docNumber)} Rev ${esc(doc.revision)}${tr?' · '+esc(tr.langName):''}</td><td style="text-align:center">V R ALUCAST — Confidential</td><td style="text-align:right">${doc.status==='ACTIVE'?'Controlled copy':'NOT APPROVED — '+esc(doc.status)}</td>
</tr></table></td></tr></tfoot>
</table></div>
</body></html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

// VRA DMS — QUALITY MODULE

// ══════════════════════════════════════════════════════
//  QUALITY MODULE — Complaint · Alert · CAPA
// ══════════════════════════════════════════════════════

// ── Unique number generators ─────────────────────────
async function nextCRNum(){const y=new Date().getFullYear();const n=(await db.complaints.count().catch(()=>0))+1;return`CR-${y}-${String(n).padStart(3,'0')}`}
async function nextQANum(){const y=new Date().getFullYear();const n=(await db.qualAlerts.count().catch(()=>0))+1;return`QA-${y}-${String(n).padStart(3,'0')}`}
async function nextCAPANum(){const y=new Date().getFullYear();const n=(await db.capas.count().catch(()=>0))+1;return`CAPA-${y}-${String(n).padStart(3,'0')}`}

// ── Status badge for quality records ─────────────────
function qBadge(s){
  const m={OPEN:['bp','Open'],ALERT_RAISED:['bs','Alert Raised'],CAPA_OPEN:['ba','CAPA Open'],
    EFFECTIVENESS:['bp','Effectiveness'],CLOSED:['bd','Closed'],
    ISSUED:['ba','Issued'],DRAFT:['bd','Draft'],OVERDUE:['br','Overdue'],COMPLETE:['ba','Complete']};
  const[c,l]=m[s]||['bd',s];return`<span class="badge ${c}">${l}</span>`;
}

// ── Parts master helpers ──────────────────────────────
async function getPartsOpts(selectedId=''){
  const parts=await DB.getParts();
  if(!parts.length) return'<option value="">No parts — add via quickAddPart</option>';
  return parts.map(p=>`<option value="${p.id}"${p.id==selectedId?' selected':''}>${esc(p.partNumber)} — ${esc(p.partName)}</option>`).join('');
}
async function quickAddPart(){
  const pn=prompt('Part Number (e.g. 05E.253.463.M):');if(!pn)return;
  const pname=prompt('Part Name (e.g. Aluminium Bracket MAR):');if(!pname)return;
  const id=await DB.addPart({partNumber:pn.trim(),partName:pname.trim()});
  const sel=document.getElementById('cr-part');
  if(sel){const opt=document.createElement('option');opt.value=id;opt.text=`${pn} — ${pname}`;sel.appendChild(opt);sel.value=id;}
  toast('✅ Part added!','s');
}

// ══════════════════════════════════════════════════════
//  COMPLAINT REGISTER
// ══════════════════════════════════════════════════════
async function renderComplaints(p={}){
  const all=(await DB.getComplaints()).sort((a,b)=>b.id-a.id);
  const ft=p.type||'',fs=p.status||'';
  const filtered=all.filter(c=>(!ft||c.type===ft)&&(!fs||c.status===fs));

  // Overdue CAPA actions count for dashboard hint
  const overdueCount=await getOverdueCount();

  setC(`
  <div class="ph">
    <h2>📋 Complaint Register</h2>
    <button class="btn btn-p" onclick="renderNewComplaint()">➕ New Complaint</button>
  </div>
  ${overdueCount>0?`<div class="alert al-d" style="cursor:pointer" onclick="nav('capas','filter=overdue')">⚠️ ${overdueCount} CAPA action(s) are overdue. <b>Click to view →</b></div>`:''}
  <div class="card" style="margin-bottom:12px">
    <div class="cb" style="padding:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:130px"><label class="lbl">Type</label>
          <select class="fc" id="cf-type" onchange="applyComplaintFilter()">
            <option value="">All Types</option>
            <option value="EXTERNAL"${ft==='EXTERNAL'?' selected':''}>External (Customer)</option>
            <option value="INTERNAL"${ft==='INTERNAL'?' selected':''}>Internal</option>
          </select></div>
        <div style="flex:1;min-width:130px"><label class="lbl">Status</label>
          <select class="fc" id="cf-status" onchange="applyComplaintFilter()">
            <option value="">All Status</option>
            ${['OPEN','ALERT_RAISED','CAPA_OPEN','EFFECTIVENESS','CLOSED'].map(s=>`<option value="${s}"${fs===s?' selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
          </select></div>
        <button class="btn btn-o" onclick="nav('complaints')">Clear</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>${filtered.length} complaint(s)</h5></div>
    <div class="tw"><table>
      <thead><tr><th>CR Number</th><th>Type</th><th>Source</th><th>Part</th><th>Problem</th><th>Date</th><th>Status</th><th></th></tr></thead>
      <tbody>${filtered.map(c=>`<tr>
        <td class="mono" style="color:#0d2f6e;font-weight:700">${c.crNumber}</td>
        <td><span class="badge ${c.type==='EXTERNAL'?'br':'bp'}">${c.type==='EXTERNAL'?'External':'Internal'}</span></td>
        <td style="font-size:12px">${esc(c.source||'')}</td>
        <td style="font-size:12px;white-space:nowrap"><b>${esc(c.partNumber||'')}</b>${c.partName?'<br><span style="color:#9ca3af">'+esc(c.partName)+'</span>':''}</td>
        <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((c.problem||'').substring(0,70))}${(c.problem||'').length>70?'…':''}</td>
        <td class="muted">${fmtD(c.date)}</td>
        <td>${qBadge(c.status)}</td>
        <td><button class="btn btn-o btn-xs" onclick="viewComplaint(${c.id})">View</button></td>
      </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af">No complaints logged yet.</td></tr>'}
      </tbody>
    </table></div>
  </div>`);
}
function applyComplaintFilter(){
  const t=document.getElementById('cf-type')?.value||'';
  const s=document.getElementById('cf-status')?.value||'';
  nav('complaints',[t&&`type=${t}`,s&&`status=${s}`].filter(Boolean).join('&'));
}
async function getOverdueCount(){
  try{
    const actions=await db.capaActions.toArray();
    const today=new Date().toISOString().split('T')[0];
    return actions.filter(a=>a.status==='OPEN'&&a.dueDate&&a.dueDate<today).length;
  }catch(e){return 0;}
}

// ── New Complaint Form ────────────────────────────────
async function renderNewComplaint(){
  document.getElementById('topbar-title').textContent='New Complaint';
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.remove('active'));
  const crNum=await nextCRNum();
  const partsOpts=await getPartsOpts();
  setC(`
  <div class="ph"><h2>➕ Register Complaint</h2><button class="btn btn-o" onclick="nav('complaints')">← Back</button></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div>
      <div class="card">
        <div class="ch"><h5>Basic Details</h5></div>
        <div class="cb">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="fg"><label class="lbl">CR Number</label>
              <input class="fc" id="cr-num" value="${crNum}" disabled style="background:#f5f7fd;color:#0d2f6e;font-weight:700;font-family:'IBM Plex Mono',monospace"></div>
            <div class="fg"><label class="lbl">Date</label>
              <input class="fc" type="date" id="cr-date" value="${new Date().toISOString().split('T')[0]}"></div>
          </div>
          <div class="fg"><label class="lbl">Type <span style="color:red">*</span></label>
            <select class="fc" id="cr-type" onchange="updateSourceOpts()">
              <option value="EXTERNAL">External — Customer Complaint</option>
              <option value="INTERNAL">Internal</option>
            </select></div>
          <div class="fg"><label class="lbl">Source <span style="color:red">*</span></label>
            <select class="fc" id="cr-source">
              <option>Email</option><option>Phone Call</option>
              <option>Corrective Action Request (CAR)</option><option>Customer Visit</option><option>Customer Audit Finding</option>
            </select></div>
          <div class="fg"><label class="lbl">Customer / Reported By</label>
            <input class="fc" id="cr-reporter" placeholder="e.g. Volkswagen SAVWIPL / Manish Yadav"></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><h5>Part Details</h5></div>
        <div class="cb">
          <div class="fg"><label class="lbl">Part <span style="color:red">*</span></label>
            <select class="fc" id="cr-part"><option value="">-- Select Part --</option>${partsOpts}</select>
            <a style="font-size:11.5px;color:#0d2f6e;cursor:pointer;margin-top:4px;display:inline-block" onclick="quickAddPart()">+ Add new part</a>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="card">
        <div class="ch"><h5>Problem Description <span style="color:red">*</span></h5></div>
        <div class="cb">
          <textarea class="fc" id="cr-problem" rows="7" placeholder="Describe the complaint / issue in detail. Include: what was found, where, quantity affected, when discovered…"></textarea>
        </div>
      </div>
      <div class="card">
        <div class="ch"><h5>Initial Notes</h5></div>
        <div class="cb">
          <textarea class="fc" id="cr-notes" rows="4" placeholder="Batch numbers, lot numbers, quantities, any initial observations…"></textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-o" onclick="nav('complaints')">Cancel</button>
        <button class="btn btn-p" onclick="saveComplaint()">💾 Register</button>
      </div>
    </div>
  </div>`);
}

function updateSourceOpts(){
  const type=document.getElementById('cr-type')?.value;
  const src=document.getElementById('cr-source');
  if(!src) return;
  src.innerHTML = type==='EXTERNAL'
    ? '<option>Email</option><option>Phone Call</option><option>Corrective Action Request (CAR)</option><option>Customer Visit</option><option>Customer Audit Finding</option>'
    : '<option>Operator — Shop Floor</option><option>Fettling Department</option><option>Incoming Inspection</option><option>Spectro / Chemical Check</option><option>In-Process Inspection</option><option>Final Inspection</option><option>Supplier</option>';
}

async function saveComplaint(){
  const problem=document.getElementById('cr-problem').value.trim();
  const partId=document.getElementById('cr-part').value;
  if(!problem){toast('Problem description required','d');return}
  if(!partId){toast('Select a part','d');return}
  const part=await DB.getPart(parseInt(partId))||{};
  const id=await DB.addComplaint({
    crNumber:document.getElementById('cr-num').value,
    type:document.getElementById('cr-type').value,
    source:document.getElementById('cr-source').value,
    reporter:document.getElementById('cr-reporter').value.trim(),
    partId:parseInt(partId),partNumber:part.partNumber||'',partName:part.partName||'',
    problem,notes:document.getElementById('cr-notes').value.trim(),
    date:document.getElementById('cr-date').value,
    status:'OPEN',createdAt:new Date().toISOString(),createdBy:Auth.user.name,
  });
  toast('✅ Complaint registered!','s');
  viewComplaint(id);
}

// ── View Complaint ────────────────────────────────────
async function viewComplaint(id){
  document.getElementById('topbar-title').textContent='Complaint Detail';
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.remove('active'));
  const c=await DB.getComplaint(id);
  if(!c){toast('Not found','d');return}
  const alert=await DB.getAlertByComplaint(id);
  const capa=alert?await DB.getCapaByAlert(alert.id):null;
  const steps=[
    {label:'Complaint Registered',date:fmtD(c.createdAt),done:true},
    {label:'Quality Alert Raised',date:alert?fmtD(alert.createdAt):'',done:!!alert},
    {label:'CAPA Opened',date:capa?fmtD(capa.createdAt):'',done:!!capa},
    {label:'Actions Complete',date:'',done:capa?.allActionsDone||false},
    {label:'Verified & Closed',date:capa?.closedAt?fmtD(capa.closedAt):'',done:c.status==='CLOSED'},
  ];
  setC(`
  <div class="ph">
    <div>
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
        <span class="badge ${c.type==='EXTERNAL'?'br':'bp'}">${c.type==='EXTERNAL'?'External':'Internal'}</span>
        <span class="mono" style="font-weight:700;color:#0d2f6e;font-size:14px">${c.crNumber}</span>
        ${qBadge(c.status)}
      </div>
      <h2>${esc(c.partNumber)} — ${esc(c.partName)}</h2>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      ${!alert?`<button class="btn btn-w" onclick="renderNewAlert(${id})">⚠️ Raise Quality Alert</button>`:''}
      ${alert?`<button class="btn btn-o btn-sm" onclick="viewAlert(${alert.id})">Alert: ${alert.qaNumber}</button>`:''}
      ${capa?`<button class="btn btn-o btn-sm" onclick="viewCapa(${capa.id})">CAPA: ${capa.capaNumber}</button>`:''}
      <button class="btn btn-p btn-sm" onclick="printFullReport(${id})">🖨 Full Report</button>
    </div>
  </div>

  <!-- Progress timeline -->
  <div class="card" style="margin-bottom:14px">
    <div class="cb" style="padding:14px">
      <div style="display:flex;align-items:flex-start">
        ${steps.map((s,i)=>`<div style="flex:1;text-align:center">
          <div style="display:flex;align-items:center">
            <div style="flex:1;height:2px;background:${i===0?'transparent':s.done?'#16a34a':'#e5e7eb'}"></div>
            <div style="width:30px;height:30px;border-radius:50%;background:${s.done?'#16a34a':'#e5e7eb'};color:${s.done?'#fff':'#9ca3af'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${s.done?'✓':i+1}</div>
            <div style="flex:1;height:2px;background:${i===steps.length-1?'transparent':s.done&&steps[i+1]?.done?'#16a34a':'#e5e7eb'}"></div>
          </div>
          <div style="font-size:10.5px;color:${s.done?'#16a34a':'#9ca3af'};margin-top:5px;font-weight:${s.done?'600':'400'};padding:0 4px">${s.label}</div>
          ${s.date?`<div style="font-size:10px;color:#9ca3af">${s.date}</div>`:''}
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px">
    <div class="card">
      <div class="ch"><h5>Complaint Details</h5></div>
      <div class="cb">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
          <div><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;font-weight:600">Date</div><div style="font-weight:600">${fmtD(c.date)}</div></div>
          <div><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;font-weight:600">Source</div><div style="font-weight:600">${esc(c.source)}</div></div>
          <div><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;font-weight:600">Reported By</div><div style="font-weight:600">${esc(c.reporter||'—')}</div></div>
        </div>
        <div class="dvdr"></div>
        <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:5px">Problem Description</div>
        <div style="font-size:13.5px;line-height:1.75;white-space:pre-wrap">${esc(c.problem)}</div>
        ${c.notes?`<div class="dvdr"></div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:5px">Notes</div>
        <div style="font-size:13px;color:#555;white-space:pre-wrap">${esc(c.notes)}</div>`:''}
      </div>
    </div>
    <div>
      <div class="card">
        <div class="ch"><h5>Part</h5></div>
        <div class="cb">
          <div class="mono" style="font-weight:700;font-size:15px;color:#0d2f6e">${esc(c.partNumber)}</div>
          <div style="color:#555;margin-top:3px">${esc(c.partName)}</div>
        </div>
      </div>
      ${!alert?`<div class="card">
        <div class="cb" style="text-align:center;padding:18px">
          <div style="font-size:26px;margin-bottom:7px">⚠️</div>
          <div style="font-weight:600;color:#0d2f6e;margin-bottom:4px">Raise Quality Alert</div>
          <div class="muted" style="margin-bottom:12px;font-size:12px">Document the issue with images and containment action</div>
          <button class="btn btn-w" style="width:100%" onclick="renderNewAlert(${id})">⚠️ Raise Quality Alert</button>
        </div>
      </div>`:''}
    </div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  QUALITY ALERT
// ══════════════════════════════════════════════════════

// Active annotators (up to 3 images)
let _annotators = [];

async function renderQualAlerts(){
  const all=(await db.qualAlerts.toArray().catch(()=>[])).sort((a,b)=>b.id-a.id);
  setC(`
  <div class="ph"><h2>⚠️ Quality Alerts</h2></div>
  <div class="card">
    <div class="tw"><table>
      <thead><tr><th>QA Number</th><th>CR Number</th><th>Part</th><th>Date</th><th>Status</th><th></th></tr></thead>
      <tbody>${all.map(a=>`<tr>
        <td class="mono" style="color:#0d2f6e;font-weight:700">${a.qaNumber}</td>
        <td class="mono" style="color:#6b7280">${a.crNumber||'—'}</td>
        <td style="font-size:12px"><b>${esc(a.partNumber||'')}</b></td>
        <td class="muted">${fmtD(a.createdAt)}</td>
        <td>${qBadge(a.status)}</td>
        <td><button class="btn btn-o btn-xs" onclick="viewAlert(${a.id})">View</button></td>
      </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af">No quality alerts yet.</td></tr>'}
      </tbody>
    </table></div>
  </div>`);
}

async function renderNewAlert(complaintId){
  document.getElementById('topbar-title').textContent='New Quality Alert';
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.remove('active'));
  const c=await DB.getComplaint(complaintId);
  const qaNum=await nextQANum();
  _annotators=[];

  setC(`
  <div class="ph">
    <h2>⚠️ Quality Alert — ${qaNum}</h2>
    <button class="btn btn-o" onclick="viewComplaint(${complaintId})">← Back</button>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Alert Info</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="fg"><label class="lbl">QA Number</label>
          <input class="fc" value="${qaNum}" disabled style="background:#f5f7fd;color:#0d2f6e;font-weight:700;font-family:'IBM Plex Mono',monospace" id="qa-num"></div>
        <div class="fg"><label class="lbl">Linked Complaint</label>
          <input class="fc" value="${c?.crNumber||''}" disabled style="background:#f5f7fd;color:#6b7280;font-family:'IBM Plex Mono',monospace"></div>
        <div class="fg"><label class="lbl">Date</label>
          <input class="fc" type="date" id="qa-date" value="${new Date().toISOString().split('T')[0]}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Part Number</div>
          <div class="mono" style="font-weight:700;color:#0d2f6e">${esc(c?.partNumber||'')}</div></div>
        <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Part Name</div>
          <div style="font-weight:600">${esc(c?.partName||'')}</div></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Problem Statement</h5></div>
    <div class="cb">
      <textarea class="fc" id="qa-problem" rows="4" placeholder="Clear description of the quality issue…">${esc(c?.problem||'')}</textarea>
    </div>
  </div>

  <!-- Evidence images -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Evidence Images (up to 3)</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
        ${[0,1,2].map(i=>`
        <div>
          <div style="font-size:12px;font-weight:600;color:#0d2f6e;margin-bottom:6px">Image ${i+1}</div>
          <div id="ann-wrap-${i}" style="border:2px dashed #d4daf0;border-radius:8px;min-height:120px;display:flex;align-items:center;justify-content:center;background:#f8f9fc;overflow:hidden;position:relative">
            <div id="ann-placeholder-${i}" style="text-align:center;padding:16px;color:#9ca3af">
              <div style="font-size:22px;margin-bottom:4px">📷</div>
              <div style="font-size:11.5px">Click to upload</div>
            </div>
          </div>
          <input type="file" id="img-input-${i}" accept="image/*" style="display:none" onchange="loadAnnotatorImage(${i},this)">
          <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap" id="ann-toolbar-${i}" style="display:none">
            <button class="btn btn-xs btn-o" onclick="setAnnTool(${i},'circle')" id="t-circle-${i}" title="Draw circle around issue">○ Circle</button>
            <button class="btn btn-xs btn-o" onclick="setAnnTool(${i},'highlight')" id="t-highlight-${i}" title="Highlight area">▭ Highlight</button>
            <button class="btn btn-xs btn-o" onclick="setAnnTool(${i},'arrow')" id="t-arrow-${i}" title="Draw an arrow pointing to a feature">↗ Arrow</button>
            <button class="btn btn-xs btn-o" onclick="setAnnTool(${i},'text')" id="t-text-${i}" title="Add text label">T Text</button>
            <button class="btn btn-xs btn-o" onclick="undoAnn(${i})" title="Undo last">↩</button>
            <button class="btn btn-xs" onclick="clearAnn(${i})" style="color:#dc3545;background:#fee2e2;border:none" title="Clear all">✕</button>
            <button class="btn btn-xs btn-o" onclick="document.getElementById('img-input-${i}').click()" title="Replace image">🔄</button>
          </div>
          <button class="btn btn-xs btn-o" style="width:100%;margin-top:5px" id="upload-btn-${i}" onclick="document.getElementById('img-input-${i}').click()">📷 Upload Image</button>
        </div>`).join('')}
      </div>
      <div class="alert al-w" style="margin-top:10px;font-size:12px">
        💡 Upload images → drag with Circle / Highlight / Arrow to mark the defect (you'll see it grow live as you drag) → use Text to add notes → drag any shape to reposition it.
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Containment Action</h5></div>
    <div class="cb">
      <textarea class="fc" id="qa-containment" rows="4" placeholder="What immediate action was taken to contain the issue? (e.g. batch held, 100% inspection started, supplier notified…)"></textarea>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Instructions to Team</h5></div>
    <div class="cb">
      <textarea class="fc" id="qa-instructions" rows="3" placeholder="Specific instructions for shop floor / team…"></textarea>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Sign-Off Panel (for printed notice board copy)</h5>
      <button class="btn btn-o btn-sm" onclick="addSignoffRow()">+ Add Person</button>
    </div>
    <div class="cb">
      <div style="font-size:12px;color:#6b7280;margin-bottom:10px">Add everyone associated with this process who needs to sign off — there is no limit on the number of people. Physical signatures collected on printed copy.</div>
      <div id="signoff-rows">
        ${[1,2,3,4].map(()=>signoffRowHTML()).join('')}
      </div>
    </div>
  </div>

  <div style="display:flex;gap:8px;justify-content:flex-end">
    <button class="btn btn-o" onclick="viewComplaint(${complaintId})">Cancel</button>
    <button class="btn btn-p" onclick="saveAlert(${complaintId})">⚠️ Issue Alert & Open CAPA</button>
  </div>`);
}

// ── Sign-off rows (unlimited — anyone associated with the process) ──
function signoffRowHTML(name='',designation=''){
  return`<div class="signoff-row" style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;margin-bottom:7px;align-items:center">
    <input class="fc sig-name" placeholder="Name" value="${esc(name)}">
    <input class="fc sig-desig" placeholder="Designation" value="${esc(designation)}">
    <button class="btn btn-xs" style="color:#dc3545;background:#fee2e2;border:none" onclick="this.closest('.signoff-row').remove()" title="Remove">✕</button>
  </div>`;
}
function addSignoffRow(){
  const wrap=document.getElementById('signoff-rows');
  if(wrap) wrap.insertAdjacentHTML('beforeend',signoffRowHTML());
}

// ── Image Annotator ───────────────────────────────────
function loadAnnotatorImage(idx, input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const wrap=document.getElementById(`ann-wrap-${idx}`);
    const ph=document.getElementById(`ann-placeholder-${idx}`);
    const tb=document.getElementById(`ann-toolbar-${idx}`);
    const btn=document.getElementById(`upload-btn-${idx}`);
    if(ph) ph.style.display='none';
    if(tb) tb.style.display='flex';
    if(btn) btn.style.display='none';

    // Create canvas
    const canvas=document.createElement('canvas');
    canvas.style.cssText='max-width:100%;cursor:crosshair;display:block;border-radius:6px';
    canvas.id=`ann-canvas-${idx}`;
    wrap.innerHTML=''; wrap.style.border='1px solid #d4daf0';
    wrap.appendChild(canvas);

    const ann={canvas,ctx:canvas.getContext('2d'),img:new Image(),annotations:[],tool:'circle',
      action:null,sx:0,sy:0,dragIdx:-1,dragOrig:null};
    _annotators[idx]=ann;

    ann.img.onload=()=>{
      const maxW=wrap.clientWidth||300;
      const scale=Math.min(1,maxW/ann.img.naturalWidth);
      canvas.width=ann.img.naturalWidth*scale;
      canvas.height=ann.img.naturalHeight*scale;
      ann.scale=scale;
      redrawCanvas(idx);
    };
    ann.img.src=ev.target.result;

    const pos=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};

    canvas.addEventListener('mousedown',e=>{annPointerDown(idx,pos(e).x,pos(e).y);});
    canvas.addEventListener('mousemove',e=>{annPointerMove(idx,pos(e).x,pos(e).y);});
    canvas.addEventListener('mouseup',e=>{annPointerUp(idx,pos(e).x,pos(e).y);});
    canvas.addEventListener('mouseleave',()=>{annPointerCancel(idx);});

    // Touch support
    canvas.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];const r=canvas.getBoundingClientRect();annPointerDown(idx,t.clientX-r.left,t.clientY-r.top);},{passive:false});
    canvas.addEventListener('touchmove',e=>{e.preventDefault();const t=e.touches[0];const r=canvas.getBoundingClientRect();annPointerMove(idx,t.clientX-r.left,t.clientY-r.top);},{passive:false});
    canvas.addEventListener('touchend',e=>{e.preventDefault();const t=e.changedTouches[0];const r=canvas.getBoundingClientRect();annPointerUp(idx,t.clientX-r.left,t.clientY-r.top);},{passive:false});
  };
  reader.readAsDataURL(file);
}

// ── Pointer state machine: create OR drag-to-move an existing shape ──
function annPointerDown(idx,x,y){
  const ann=_annotators[idx]; if(!ann) return;
  ann.sx=x; ann.sy=y;
  if(ann.tool==='text'){
    const txt=prompt('Enter label text:');
    if(txt){ann.annotations.push({type:'text',x,y,text:txt});redrawCanvas(idx);}
    return;
  }
  const hitIdx=annHitTest(ann,x,y);
  if(hitIdx!==-1){
    ann.action='move'; ann.dragIdx=hitIdx; ann.dragOrig={...ann.annotations[hitIdx]};
    ann.canvas.style.cursor='grabbing';
  } else {
    ann.action='draw';
  }
}
function annPointerMove(idx,x,y){
  const ann=_annotators[idx]; if(!ann) return;
  if(!ann.action){
    ann.canvas.style.cursor=annHitTest(ann,x,y)!==-1?'move':(ann.tool==='text'?'text':'crosshair');
    return;
  }
  if(ann.action==='move'){
    annApplyMoveDelta(ann.annotations[ann.dragIdx],x-ann.sx,y-ann.sy,ann.dragOrig);
    redrawCanvas(idx);
  } else if(ann.action==='draw'){
    redrawCanvas(idx);
    annDrawPreview(ann,ann.sx,ann.sy,x,y);
  }
}
function annPointerUp(idx,x,y){
  const ann=_annotators[idx]; if(!ann||!ann.action) return;
  if(ann.action==='draw') annCommitShape(ann,ann.sx,ann.sy,x,y);
  ann.action=null; ann.dragIdx=-1; ann.dragOrig=null;
  ann.canvas.style.cursor='crosshair';
  redrawCanvas(idx);
}
function annPointerCancel(idx){
  const ann=_annotators[idx]; if(!ann) return;
  if(ann.action==='draw') redrawCanvas(idx);
  ann.action=null; ann.dragIdx=-1; ann.dragOrig=null;
}

function annCommitShape(ann,sx,sy,ex,ey){
  if(ann.tool==='circle'){
    const cx=(sx+ex)/2,cy=(sy+ey)/2,rx=Math.abs(ex-sx)/2,ry=Math.abs(ey-sy)/2;
    if(rx>5||ry>5) ann.annotations.push({type:'circle',cx,cy,rx:Math.max(rx,10),ry:Math.max(ry,10)});
  } else if(ann.tool==='highlight'){
    const x=Math.min(sx,ex),y=Math.min(sy,ey),w=Math.abs(ex-sx),h=Math.abs(ey-sy);
    if(w>5&&h>5) ann.annotations.push({type:'highlight',x,y,w,h});
  } else if(ann.tool==='arrow'){
    if(Math.hypot(ex-sx,ey-sy)>8) ann.annotations.push({type:'arrow',x1:sx,y1:sy,x2:ex,y2:ey});
  }
}

// Live preview of the shape while the user is still dragging (not yet committed)
function annDrawPreview(ann,sx,sy,ex,ey){
  const ctx=ann.ctx;
  ctx.save();
  if(ann.tool==='circle'){
    const cx=(sx+ex)/2,cy=(sy+ey)/2,rx=Math.max(Math.abs(ex-sx)/2,1),ry=Math.max(Math.abs(ey-sy)/2,1);
    ctx.setLineDash([5,3]);ctx.strokeStyle='#ff0000';ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.stroke();
  } else if(ann.tool==='highlight'){
    const x=Math.min(sx,ex),y=Math.min(sy,ey),w=Math.abs(ex-sx),h=Math.abs(ey-sy);
    ctx.setLineDash([5,3]);ctx.strokeStyle='rgba(200,150,0,0.9)';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='rgba(255,230,0,0.25)';ctx.fillRect(x,y,w,h);
  } else if(ann.tool==='arrow'){
    annDrawArrow(ctx,sx,sy,ex,ey,'rgba(220,53,69,0.75)');
  }
  ctx.restore();
}

function annDrawArrow(ctx,x1,y1,x2,y2,color){
  const headlen=12,angle=Math.atan2(y2-y1,x2-x1);
  ctx.save();
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=3; ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x2,y2);
  ctx.lineTo(x2-headlen*Math.cos(angle-Math.PI/6),y2-headlen*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x2-headlen*Math.cos(angle+Math.PI/6),y2-headlen*Math.sin(angle+Math.PI/6));
  ctx.closePath();ctx.fill();
  ctx.restore();
}

// Hit-testing so a click/drag on an existing shape moves it instead of drawing a new one
function annHitTest(ann,x,y){
  for(let i=ann.annotations.length-1;i>=0;i--){
    const a=ann.annotations[i];
    if(a.type==='circle'){
      const nx=(x-a.cx)/a.rx,ny=(y-a.cy)/a.ry;
      if(nx*nx+ny*ny<=1) return i;
    } else if(a.type==='highlight'){
      if(x>=a.x&&x<=a.x+a.w&&y>=a.y&&y<=a.y+a.h) return i;
    } else if(a.type==='text'){
      ann.ctx.font='bold 16px Arial';
      const tw=ann.ctx.measureText(a.text).width;
      if(x>=a.x-3&&x<=a.x-3+tw+8&&y>=a.y-18&&y<=a.y+4) return i;
    } else if(a.type==='arrow'){
      const d=annPointToSegDist(x,y,a.x1,a.y1,a.x2,a.y2);
      if(d<=8) return i;
    }
  }
  return -1;
}
function annPointToSegDist(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1;
  const len2=dx*dx+dy*dy;
  let t=len2?((px-x1)*dx+(py-y1)*dy)/len2:0;
  t=Math.max(0,Math.min(1,t));
  const cx=x1+t*dx,cy=y1+t*dy;
  return Math.hypot(px-cx,py-cy);
}
function annApplyMoveDelta(shape,dx,dy,orig){
  if(shape.type==='circle'){shape.cx=orig.cx+dx;shape.cy=orig.cy+dy;}
  else if(shape.type==='highlight'){shape.x=orig.x+dx;shape.y=orig.y+dy;}
  else if(shape.type==='text'){shape.x=orig.x+dx;shape.y=orig.y+dy;}
  else if(shape.type==='arrow'){shape.x1=orig.x1+dx;shape.y1=orig.y1+dy;shape.x2=orig.x2+dx;shape.y2=orig.y2+dy;}
}

function redrawCanvas(idx){
  const ann=_annotators[idx]; if(!ann) return;
  const{canvas,ctx,img,annotations}=ann;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  annotations.forEach(a=>{
    if(a.type==='circle'){
      ctx.beginPath();ctx.ellipse(a.cx,a.cy,a.rx,a.ry,0,0,Math.PI*2);
      ctx.strokeStyle='#ff0000';ctx.lineWidth=3;ctx.stroke();
    } else if(a.type==='highlight'){
      ctx.fillStyle='rgba(255,230,0,0.45)';ctx.fillRect(a.x,a.y,a.w,a.h);
      ctx.strokeStyle='rgba(200,150,0,0.7)';ctx.lineWidth=1.5;ctx.strokeRect(a.x,a.y,a.w,a.h);
    } else if(a.type==='text'){
      ctx.font='bold 16px Arial';
      const tw=ctx.measureText(a.text).width;
      ctx.fillStyle='rgba(220,53,69,0.92)';ctx.fillRect(a.x-3,a.y-18,tw+8,22);
      ctx.fillStyle='#fff';ctx.fillText(a.text,a.x+1,a.y);
    } else if(a.type==='arrow'){
      annDrawArrow(ctx,a.x1,a.y1,a.x2,a.y2,'#dc3545');
    }
  });
}

function setAnnTool(idx,tool){
  const ann=_annotators[idx]; if(!ann) return;
  ann.tool=tool;
  ['circle','highlight','arrow','text'].forEach(t=>{
    const btn=document.getElementById(`t-${t}-${idx}`);
    if(btn) btn.style.background=t===tool?'#0d2f6e':''
      ,btn.style.color=t===tool?'#fff':'';
  });
}
function undoAnn(idx){const ann=_annotators[idx];if(ann){ann.annotations.pop();redrawCanvas(idx);}}
function clearAnn(idx){const ann=_annotators[idx];if(ann){ann.annotations=[];redrawCanvas(idx);}}

// ── Save Alert & auto-open CAPA ────────────────────────
async function saveAlert(complaintId){
  const problem=document.getElementById('qa-problem').value.trim();
  const containment=document.getElementById('qa-containment').value.trim();
  if(!problem){toast('Problem statement required','d');return}
  if(!containment){toast('Containment action required','d');return}

  // Collect annotated images as base64
  const images=[];
  for(let i=0;i<3;i++){
    const ann=_annotators[i];
    if(ann){images.push(ann.canvas.toDataURL('image/jpeg',0.82));}
  }

  // Collect sign-off names (unlimited rows)
  const signoffs=[];
  document.querySelectorAll('#signoff-rows .signoff-row').forEach(row=>{
    const name=row.querySelector('.sig-name')?.value.trim();
    const desig=row.querySelector('.sig-desig')?.value.trim();
    if(name) signoffs.push({name,designation:desig||''});
  });

  const c=await DB.getComplaint(complaintId);
  const qaNum=document.getElementById('qa-num').value;

  const alertId=await DB.addAlert({
    qaNumber:qaNum,complaintId,crNumber:c?.crNumber||'',
    partNumber:c?.partNumber||'',partName:c?.partName||'',
    problem,containment,
    instructions:document.getElementById('qa-instructions').value.trim(),
    images, signoffs,
    date:document.getElementById('qa-date').value,
    status:'ISSUED',createdAt:new Date().toISOString(),createdBy:Auth.user.name,
  });

  // Update complaint status
  await DB.updateComplaint(complaintId,{status:'ALERT_RAISED'});

  // Auto-open CAPA
  const capaNum=await nextCAPANum();
  const capaId=await DB.addCapa({
    capaNumber:capaNum,alertId,complaintId,crNumber:c?.crNumber||'',
    qaNumber:qaNum,partNumber:c?.partNumber||'',partName:c?.partName||'',
    problem,team:[],why1:'',why2:'',why3:'',why4:'',why5:'',
    effectiveness:'',docChanges:'',docChangeDetails:'',
    status:'OPEN',createdAt:new Date().toISOString(),
  });

  await DB.updateComplaint(complaintId,{status:'CAPA_OPEN'});
  await DB.log({docId:alertId,docNumber:qaNum,action:'QUALITY_ALERT_ISSUED',user:Auth.user.name,notes:`Linked to ${c?.crNumber}`});

  toast('✅ Quality Alert issued! CAPA opened automatically.','s');
  viewCapa(capaId);
}

// ── View Alert ────────────────────────────────────────
async function viewAlert(id){
  document.getElementById('topbar-title').textContent='Quality Alert';
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.remove('active'));
  const a=await DB.getAlert(id);if(!a){toast('Not found','d');return}
  const capa=await DB.getCapaByAlert(id);

  setC(`
  <div class="ph">
    <div>
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
        <span style="background:#e67c00;color:#fff;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">⚠️ QUALITY ALERT</span>
        <span class="mono" style="font-weight:700;color:#0d2f6e;font-size:14px">${a.qaNumber}</span>
        ${qBadge(a.status)}
      </div>
      <h2>${esc(a.partNumber)} — ${esc(a.partName)}</h2>
    </div>
    <div style="display:flex;gap:7px">
      ${capa?`<button class="btn btn-o btn-sm" onclick="viewCapa(${capa.id})">CAPA: ${capa.capaNumber}</button>`:''}
      <button class="btn btn-p btn-sm" onclick="printAlert(${id})">🖨 Print Alert</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px">
    <div>
      <div class="card" style="margin-bottom:14px">
        <div class="ch"><h5>Problem Statement</h5></div>
        <div class="cb">
          ${a.status!=='CLOSED'
            ?`<textarea class="fc" rows="4" id="al-problem" onblur="saveAlertDetails(${id})">${esc(a.problem||'')}</textarea>`
            :`<div style="font-size:13.5px;line-height:1.75;white-space:pre-wrap">${esc(a.problem)}</div>`}
        </div>
      </div>
      ${a.images&&a.images.length?`<div class="card" style="margin-bottom:14px">
        <div class="ch"><h5>Evidence Images</h5></div>
        <div class="cb">
          <div style="display:grid;grid-template-columns:repeat(${Math.min(a.images.length,3)},1fr);gap:10px">
            ${a.images.map((img,i)=>`<div>
              <div style="font-size:11px;color:#9ca3af;font-weight:600;margin-bottom:4px">Image ${i+1}</div>
              <img src="${img}" style="width:100%;border-radius:7px;border:1px solid #e5e7eb;cursor:pointer" onclick="showImgFull('${img}')">
            </div>`).join('')}
          </div>
        </div>
      </div>`:''}
      <div class="card" style="margin-bottom:14px">
        <div class="ch"><h5>Containment Action</h5></div>
        <div class="cb">
          ${a.status!=='CLOSED'
            ?`<textarea class="fc" rows="4" id="al-containment" onblur="saveAlertDetails(${id})">${esc(a.containment||'')}</textarea>`
            :`<div style="font-size:13.5px;line-height:1.75;white-space:pre-wrap">${esc(a.containment)}</div>`}
        </div>
      </div>
      <div class="card">
        <div class="ch"><h5>Instructions to Team</h5></div>
        <div class="cb">
          ${a.status!=='CLOSED'
            ?`<textarea class="fc" rows="3" id="al-instructions" placeholder="Specific instructions for shop floor / team…" onblur="saveAlertDetails(${id})">${esc(a.instructions||'')}</textarea>`
            :(a.instructions?`<div style="font-size:13.5px;line-height:1.75;white-space:pre-wrap">${esc(a.instructions)}</div>`:`<div class="muted" style="font-size:12px">No instructions added</div>`)}
        </div>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:14px">
        <div class="ch"><h5>Alert Info</h5></div>
        <div class="cb">
          <div style="padding:5px 0;border-bottom:1px solid #f0f3f9">
            <div style="font-size:10.5px;color:#9ca3af;font-weight:600;text-transform:uppercase">QA Number</div>
            <div class="mono" style="font-weight:600;font-size:12.5px;color:#0d2f6e">${esc(a.qaNumber)}</div>
          </div>
          <div style="padding:5px 0;border-bottom:1px solid #f0f3f9">
            <div style="font-size:10.5px;color:#9ca3af;font-weight:600;text-transform:uppercase">Linked CR</div>
            <div class="mono" style="font-weight:600;font-size:12.5px;color:#0d2f6e">${esc(a.crNumber||'—')}</div>
          </div>
          <div style="padding:5px 0;border-bottom:1px solid #f0f3f9">
            <div style="font-size:10.5px;color:#9ca3af;font-weight:600;text-transform:uppercase">Date</div>
            ${a.status!=='CLOSED'
              ?`<input class="fc" type="date" id="al-date" value="${a.date||''}" style="margin-top:3px" onblur="saveAlertDetails(${id})">`
              :`<div class="mono" style="font-weight:600;font-size:12.5px;color:#0d2f6e">${fmtD(a.date)}</div>`}
          </div>
          <div style="padding:5px 0;border-bottom:1px solid #f0f3f9">
            <div style="font-size:10.5px;color:#9ca3af;font-weight:600;text-transform:uppercase">Issued By</div>
            <div class="mono" style="font-weight:600;font-size:12.5px;color:#0d2f6e">${esc(a.createdBy||'')}</div>
          </div>
          <div style="padding:5px 0">
            <div style="font-size:10.5px;color:#9ca3af;font-weight:600;text-transform:uppercase">Status</div>
            ${a.status!=='CLOSED'
              ?`<select class="fc" id="al-status" style="margin-top:3px" onchange="saveAlertStatus(${id})">
                  ${['ISSUED','UNDER_REVIEW','RESOLVED','CLOSED'].map(s=>`<option value="${s}" ${a.status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
                </select>`
              :qBadge(a.status)}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><h5>Sign-off List</h5></div>
        <div class="cb">
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Everyone associated with this process — physical signatures collected on printed copy. Add anyone still needed below.</div>
          <div id="alert-signoff-list">
            ${(a.signoffs||[]).map((s,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f3f9">
              <div><div style="font-weight:600;font-size:12.5px">${esc(s.name)}</div><div style="font-size:11.5px;color:#6b7280">${esc(s.designation)}</div></div>
              ${a.status!=='CLOSED'?`<button style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:13px" onclick="removeAlertSignoff(${id},${i})">✕</button>`:''}
            </div>`).join('')||'<div class="muted" style="font-size:12px">No sign-off names added yet</div>'}
          </div>
          ${a.status!=='CLOSED'?`<div style="display:flex;gap:6px;margin-top:8px">
            <input class="fc" id="as-name" placeholder="Name" style="flex:1">
            <input class="fc" id="as-desig" placeholder="Designation" style="flex:1">
            <button class="btn btn-p btn-xs" onclick="addAlertSignoff(${id})">+</button>
          </div>`:''}
        </div>
      </div>
    </div>
  </div>`);
}

async function addAlertSignoff(alertId){
  const name=document.getElementById('as-name')?.value.trim();
  const desig=document.getElementById('as-desig')?.value.trim();
  if(!name){toast('Enter a name','d');return}
  const a=await DB.getAlert(alertId);
  const signoffs=[...(a.signoffs||[]),{name,designation:desig||''}];
  await DB.updateAlert(alertId,{signoffs});
  viewAlert(alertId);
}
async function removeAlertSignoff(alertId,idx){
  const a=await DB.getAlert(alertId);
  const signoffs=(a.signoffs||[]).filter((_,i)=>i!==idx);
  await DB.updateAlert(alertId,{signoffs});
  viewAlert(alertId);
}

function showImgFull(src){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  ov.innerHTML=`<img src="${src}" style="max-width:92vw;max-height:92vh;border-radius:8px">`;
  ov.onclick=()=>ov.remove(); document.body.appendChild(ov);
}

// ══════════════════════════════════════════════════════
//  CAPA
// ══════════════════════════════════════════════════════
async function renderCapas(p={}){
  const all=(await db.capas.toArray().catch(()=>[])).sort((a,b)=>b.id-a.id);
  const today=new Date().toISOString().split('T')[0];
  setC(`
  <div class="ph"><h2>🔄 CAPA Register</h2></div>
  <div class="card">
    <div class="tw"><table>
      <thead><tr><th>CAPA Number</th><th>Linked</th><th>Part</th><th>Date</th><th>Status</th><th>Effectiveness Due</th><th></th></tr></thead>
      <tbody>${await Promise.all(all.map(async ca=>{
        const actions=await DB.getCapaActions(ca.id);
        const overdue=actions.filter(a=>a.status==='OPEN'&&a.dueDate&&a.dueDate<today);
        const effDate=ca.effectivenessDate?fmtD(ca.effectivenessDate):'—';
        const effOverdue=ca.effectivenessDate&&ca.effectivenessDate<today&&ca.status!=='CLOSED';
        return`<tr>
          <td class="mono" style="color:#0d2f6e;font-weight:700">${ca.capaNumber}</td>
          <td class="mono" style="color:#6b7280;font-size:11.5px">${ca.qaNumber||''}${ca.crNumber?'<br>'+ca.crNumber:''}</td>
          <td style="font-size:12px"><b>${esc(ca.partNumber||'')}</b></td>
          <td class="muted">${fmtD(ca.createdAt)}</td>
          <td>${qBadge(ca.status)}${overdue.length?`<span class="badge br" style="margin-left:4px">⚠️ ${overdue.length} overdue</span>`:''}</td>
          <td style="color:${effOverdue?'#dc3545':'inherit'};font-weight:${effOverdue?'700':'400'}">${effDate}${effOverdue?' ⚠️':''}</td>
          <td><button class="btn btn-o btn-xs" onclick="viewCapa(${ca.id})">View</button></td>
        </tr>`;
      })).then(rows=>rows.join(''))||'<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af">No CAPAs yet.</td></tr>'}
      </tbody>
    </table></div>
  </div>`);
}

async function viewCapa(id){
  document.getElementById('topbar-title').textContent='CAPA';
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.remove('active'));
  const ca=await DB.getCapa(id); if(!ca){toast('Not found','d');return}
  _whyCapaId=id;
  const actions=await DB.getCapaActions(id);
  const today=new Date().toISOString().split('T')[0];
  const allDone=actions.length>0&&actions.every(a=>a.status==='COMPLETE');
  const alert=await DB.getAlert(ca.alertId);

  // Calculate effectiveness status
  let effStatus='', effDaysLeft=0;
  if(ca.effectivenessDate){
    const effD=new Date(ca.effectivenessDate), now=new Date();
    effDaysLeft=Math.ceil((effD-now)/(1000*60*60*24));
    if(effDaysLeft<0) effStatus='overdue';
    else if(effDaysLeft===0) effStatus='today';
    else effStatus='pending';
  }

  setC(`
  <div class="ph">
    <div>
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
        <span class="mono" style="font-weight:700;color:#0d2f6e;font-size:14px">${ca.capaNumber}</span>
        ${qBadge(ca.status)}
        ${ca.qaNumber?`<span class="muted">← ${ca.qaNumber}</span>`:''}
      </div>
      <h2>${esc(ca.partNumber)} — ${esc(ca.partName)}</h2>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      ${alert?`<button class="btn btn-o btn-sm" onclick="viewAlert(${alert.id})">Alert: ${alert.qaNumber}</button>`:''}
      <button class="btn btn-p btn-sm" onclick="printFullReport(${ca.complaintId||0})">🖨 Full Report</button>
      ${ca.status!=='CLOSED'?`<button class="btn btn-g btn-sm" onclick="closeCapa(${id})" ${!allDone||!ca.effectivenessVerified?'disabled title="Complete all actions and verify effectiveness first"':''}>✓ Close CAPA</button>`:''}
    </div>
  </div>

  <!-- Problem & Team -->
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card">
      <div class="ch"><h5>Problem Statement</h5></div>
      <div class="cb">
        <textarea class="fc" rows="3" id="ca-problem" placeholder="Describe the problem…"
          onblur="saveCapaDetails(${id})">${esc(ca.problem||'')}</textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:10px">
          <div class="fg" style="margin:0"><label class="lbl">Defect Type</label>
            <input class="fc" id="ca-defectType" value="${esc(ca.defectType||'')}" onblur="saveCapaDetails(${id})"></div>
          <div class="fg" style="margin:0"><label class="lbl">Defect Qty</label>
            <input class="fc" type="number" id="ca-defectQty" value="${ca.defectQty||''}" onblur="saveCapaDetails(${id})"></div>
          <div class="fg" style="margin:0"><label class="lbl">Batch / Lot No.</label>
            <input class="fc" id="ca-batchNo" value="${esc(ca.batchNo||'')}" onblur="saveCapaDetails(${id})"></div>
          <div class="fg" style="margin:0"><label class="lbl">Detection Stage</label>
            <input class="fc" id="ca-detectionStage" value="${esc(ca.detectionStage||'')}" onblur="saveCapaDetails(${id})"></div>
        </div>
        <div class="fg" style="margin-top:10px;margin-bottom:0"><label class="lbl">Immediate Containment</label>
          <textarea class="fc" rows="2" id="ca-containment" placeholder="What immediate action was taken to contain the issue?"
            onblur="saveCapaDetails(${id})">${esc(ca.containment||'')}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          <div><div style="font-size:10.5px;color:#9ca3af;font-weight:600;text-transform:uppercase">Part Number</div>
            <div class="mono" style="font-weight:700;color:#0d2f6e">${esc(ca.partNumber)}</div></div>
          <div><div style="font-size:10.5px;color:#9ca3af;font-weight:600;text-transform:uppercase">Opened</div>
            <div>${fmtD(ca.createdAt)}</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="ch"><h5>Team Members</h5></div>
      <div class="cb">
        <div id="team-list">
          ${(ca.team||[]).map((m,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f0f3f9">
            <div><div style="font-weight:600;font-size:12.5px">${esc(m.name)}</div><div class="muted">${esc(m.designation)}</div></div>
            <button style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:13px" onclick="removeTeamMember(${id},${i})">✕</button>
          </div>`).join('')||'<div class="muted" style="font-size:12px">No team members yet</div>'}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <input class="fc" id="tm-name" placeholder="Name" style="flex:1">
          <input class="fc" id="tm-desig" placeholder="Designation" style="flex:1">
          <button class="btn btn-p btn-xs" onclick="addTeamMember(${id})">+</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 5 Why Analysis -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch">
      <h5>5 Why Analysis</h5>
      <button class="btn btn-o btn-sm" onclick="addExtraWhy(${id})">+ Add Why</button>
    </div>
    <div class="cb">
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px">Start from the problem and keep asking "why" — at least 5 times — until you reach the root cause. Add more whys if 5 isn't enough.</div>
      <div id="why-list">
        ${capaWhyRowsHTML(ca)}
      </div>
      <div class="fg" style="margin-top:8px">
        <label class="lbl" style="color:#dc3545">Root Cause</label>
        <textarea class="fc" rows="2" id="root-cause" placeholder="State the confirmed root cause reached by the Why analysis above"
          onblur="saveWhy(${id})">${esc(ca.rootCause||'')}</textarea>
      </div>
      <div style="margin-top:4px">
        <button class="btn btn-o btn-sm" onclick="saveWhy(${id})">💾 Save Analysis</button>
      </div>
    </div>
  </div>

  <!-- Corrective Actions -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>🔧 Corrective Actions</h5></div>
    <div class="cb" style="padding-bottom:0">
      ${capaActionAddRowHTML(id,'CORRECTIVE')}
    </div>
    <div id="actions-table-CORRECTIVE">
      ${await renderActionsTable(id, actions.filter(a=>(a.type||'CORRECTIVE')==='CORRECTIVE'), today)}
    </div>
  </div>

  <!-- Preventive Actions -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>🛡️ Preventive Actions</h5></div>
    <div class="cb" style="padding-bottom:0">
      ${capaActionAddRowHTML(id,'PREVENTIVE')}
    </div>
    <div id="actions-table-PREVENTIVE">
      ${await renderActionsTable(id, actions.filter(a=>a.type==='PREVENTIVE'), today)}
    </div>
  </div>

  ${allDone&&!ca.effectivenessDate?`<div class="alert al-s" style="margin-bottom:14px">
    ✅ All actions complete! 60-day effectiveness review period has started.
    <button class="btn btn-p btn-xs" style="margin-left:8px" onclick="startEffectiveness(${id})">Set Effectiveness Date</button>
  </div>`:''}

  <!-- Effectiveness -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Effectiveness Verification (60-day review)</h5></div>
    <div class="cb">
      ${ca.effectivenessDate?`
      <div class="alert al-${effStatus==='overdue'?'d':effStatus==='today'?'w':'s'}" style="margin-bottom:12px">
        ${effStatus==='overdue'?`⚠️ Effectiveness review is overdue (due ${fmtD(ca.effectivenessDate)})`
          :effStatus==='today'?'📅 Effectiveness review is due today!'
          :`📅 Effectiveness review due: ${fmtD(ca.effectivenessDate)}`}
      </div>`:'<div class="muted" style="margin-bottom:12px;font-size:12px">Complete all actions first, then the 60-day effectiveness review period will start.</div>'}
      <div class="fg"><label class="lbl">Effectiveness Evidence / Observations</label>
        <textarea class="fc" rows="4" id="eff-evidence" placeholder="Describe what evidence shows the corrective actions have been effective. Include data, observations, re-inspection results…"
          onblur="saveEffectiveness(${id})">${esc(ca.effectiveness||'')}</textarea>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="eff-verified" ${ca.effectivenessVerified?'checked':''} onchange="saveEffectiveness(${id})">
          <span style="font-size:13px;font-weight:600">Actions are verified as effective</span>
        </label>
      </div>
    </div>
  </div>

  <!-- Document Changes -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>Document Changes Required</h5></div>
    <div class="cb">
      <div style="display:flex;gap:14px;margin-bottom:10px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="doc-chg" value="YES" ${ca.docChanges==='YES'?'checked':''} onchange="saveDocChanges(${id})">
          <span style="font-weight:600">Yes — documents were updated</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="doc-chg" value="NO" ${ca.docChanges==='NO'?'checked':''} onchange="saveDocChanges(${id})">
          <span style="font-weight:600">No changes required</span>
        </label>
      </div>
      <textarea class="fc" rows="3" id="doc-chg-details" placeholder="List the documents that were changed (e.g. Control Plan Rev B, Work Instruction WI-003…)"
        onblur="saveDocChanges(${id})">${esc(ca.docChangeDetails||'')}</textarea>
    </div>
  </div>`);
}

async function renderActionsTable(capaId, actions, today){
  if(!actions.length) return`<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12.5px">No actions added yet.</div>`;
  return`<div class="tw"><table>
    <thead><tr><th>#</th><th>Action</th><th>Responsible</th><th>Designation</th><th>Due Date</th><th>Status</th><th></th></tr></thead>
    <tbody>${actions.map((a,i)=>{
      const isOverdue=a.status==='OPEN'&&a.dueDate&&a.dueDate<today;
      const isDueSoon=a.status==='OPEN'&&a.dueDate&&a.dueDate>=today&&a.dueDate<=new Date(Date.now()+3*864e5).toISOString().split('T')[0];
      return`<tr style="background:${isOverdue?'#fff5f5':isDueSoon?'#fffbeb':''}">
        <td class="mono" style="width:30px">${i+1}</td>
        <td style="font-size:12.5px">${esc(a.action)}</td>
        <td style="font-size:12.5px">${esc(a.responsible)}</td>
        <td style="font-size:12px;color:#6b7280">${esc(a.designation||'')}</td>
        <td style="font-size:12px;font-weight:${isOverdue?'700':'400'};color:${isOverdue?'#dc3545':isDueSoon?'#d97706':'inherit'}">
          ${fmtD(a.dueDate)} ${isOverdue?'⚠️ Overdue':isDueSoon?'🕐 Due soon':''}
        </td>
        <td>${qBadge(a.status==='COMPLETE'?'COMPLETE':'OPEN')}</td>
        <td style="white-space:nowrap">
          ${a.status==='OPEN'?`<button class="btn btn-g btn-xs" onclick="markActionDone(${capaId},${a.id})">✓ Done</button>`:
            `<span style="font-size:11px;color:#16a34a">✓ ${fmtD(a.completedAt)}</span>`}
          <button class="btn btn-o btn-xs" style="margin-left:3px" onclick="editCapaAction(${capaId},${a.id})" title="Edit action">✏️</button>
          <button class="btn btn-xs" style="color:#dc3545;background:#fee2e2;border:none;cursor:pointer;margin-left:3px" onclick="deleteCapaActionRow(${capaId},${a.id})">✕</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

// Inline add-row (no browser prompt popups) for a Corrective or Preventive action
function capaActionAddRowHTML(capaId,type){
  const defDue=new Date(Date.now()+7*864e5).toISOString().split('T')[0];
  return`<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:14px">
    <div class="fg" style="margin:0"><label class="lbl">Action Description</label>
      <input class="fc" id="ca-action-${type}" placeholder="${type==='PREVENTIVE'?'What will prevent this from recurring elsewhere?':'What will be done to fix the root cause?'}"></div>
    <div class="fg" style="margin:0"><label class="lbl">Responsible</label><input class="fc" id="ca-resp-${type}" placeholder="Name"></div>
    <div class="fg" style="margin:0"><label class="lbl">Designation</label><input class="fc" id="ca-desig-${type}" placeholder="Designation"></div>
    <div class="fg" style="margin:0"><label class="lbl">Due Date</label><input class="fc" type="date" id="ca-due-${type}" value="${defDue}"></div>
    <button class="btn btn-p btn-sm" onclick="addCapaAction(${capaId},'${type}')">+ Add</button>
  </div>`;
}

async function addCapaAction(capaId,type){
  const actionEl=document.getElementById(`ca-action-${type}`);
  const respEl=document.getElementById(`ca-resp-${type}`);
  const desigEl=document.getElementById(`ca-desig-${type}`);
  const dueEl=document.getElementById(`ca-due-${type}`);
  const action=actionEl?.value.trim();
  const responsible=respEl?.value.trim();
  if(!action){toast('Action description required','d');return}
  if(!responsible){toast('Responsible person required','d');return}
  await DB.addCapaAction({
    capaId,type,action,responsible,
    designation:(desigEl?.value||'').trim(),
    dueDate:dueEl?.value||new Date(Date.now()+7*864e5).toISOString().split('T')[0],
    status:'OPEN',createdAt:new Date().toISOString()
  });
  toast(`${type==='PREVENTIVE'?'Preventive':'Corrective'} action added!`,'s');
  if(actionEl)actionEl.value=''; if(respEl)respEl.value=''; if(desigEl)desigEl.value='';
  await refreshActionsTables(capaId);
}

async function refreshActionsTables(capaId){
  const actions=await DB.getCapaActions(capaId);
  const today=new Date().toISOString().split('T')[0];
  const cEl=document.getElementById('actions-table-CORRECTIVE');
  const pEl=document.getElementById('actions-table-PREVENTIVE');
  if(cEl) cEl.innerHTML=await renderActionsTable(capaId,actions.filter(a=>(a.type||'CORRECTIVE')==='CORRECTIVE'),today);
  if(pEl) pEl.innerHTML=await renderActionsTable(capaId,actions.filter(a=>a.type==='PREVENTIVE'),today);
  const ca=await DB.getCapa(capaId);
  const allDone=actions.length>0&&actions.every(a=>a.status==='COMPLETE');
  if(allDone&&!ca.effectivenessDate){
    await startEffectiveness(capaId);
    toast('✅ All actions complete! 60-day effectiveness period started.','s');
    viewCapa(capaId);
  }
}

async function markActionDone(capaId,actionId){
  await DB.updateCapaAction(actionId,{status:'COMPLETE',completedAt:new Date().toISOString().split('T')[0]});
  toast('Action marked complete!','s');
  await refreshActionsTables(capaId);
}

async function deleteCapaActionRow(capaId,actionId){
  if(!confirm('Delete this action?')) return;
  await DB.deleteCapaAction(actionId);
  toast('Deleted','d');
  await refreshActionsTables(capaId);
}

// ── Edit an existing action (description, owner, due date, and status) ──
async function editCapaAction(capaId,actionId){
  const actions=await DB.getCapaActions(capaId);
  const a=actions.find(x=>x.id===actionId); if(!a) return;
  const type=a.type||'CORRECTIVE';
  const ov=document.createElement('div');ov.className='overlay';ov.id='edit-action-ov';
  ov.innerHTML=`<div class="modal" style="width:480px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>✏️ Edit ${type==='PREVENTIVE'?'Preventive':'Corrective'} Action</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('edit-action-ov').remove()">✕</button>
    </div>
    <div class="fg"><label class="lbl">Action Description</label>
      <textarea class="fc" id="eca-action" rows="2">${esc(a.action||'')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Responsible</label><input class="fc" id="eca-resp" value="${esc(a.responsible||'')}"></div>
      <div class="fg"><label class="lbl">Designation</label><input class="fc" id="eca-desig" value="${esc(a.designation||'')}"></div>
      <div class="fg"><label class="lbl">Due Date</label><input class="fc" type="date" id="eca-due" value="${a.dueDate||''}"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="eca-status">
          <option value="OPEN" ${a.status==='OPEN'?'selected':''}>Open</option>
          <option value="COMPLETE" ${a.status==='COMPLETE'?'selected':''}>Complete</option>
        </select></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('edit-action-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="saveEditCapaAction(${capaId},${actionId})">💾 Save</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function saveEditCapaAction(capaId,actionId){
  const action=document.getElementById('eca-action').value.trim();
  const responsible=document.getElementById('eca-resp').value.trim();
  if(!action||!responsible){toast('Action and responsible person are required','d');return}
  const status=document.getElementById('eca-status').value;
  const actions=await DB.getCapaActions(capaId);
  const existing=actions.find(x=>x.id===actionId);
  const updates={
    action,responsible,
    designation:document.getElementById('eca-desig').value.trim(),
    dueDate:document.getElementById('eca-due').value,
    status,
    completedAt:status==='COMPLETE'?(existing?.completedAt||new Date().toISOString().split('T')[0]):null,
  };
  await DB.updateCapaAction(actionId,updates);
  document.getElementById('edit-action-ov').remove();
  toast('✅ Action updated');
  await refreshActionsTables(capaId);
}

async function startEffectiveness(capaId){
  const effDate=new Date(Date.now()+60*864e5).toISOString().split('T')[0];
  await DB.updateCapa(capaId,{effectivenessDate:effDate,allActionsDone:true});
}

// ── 5 Why rows — fixed Why 1-5 plus any extra whys added on top ──
function capaWhyRowHTML(n,val,isLast,extraIdx){
  return`<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px">
    <div style="flex-shrink:0;text-align:center">
      <div style="width:32px;height:32px;border-radius:50%;background:#edf1fb;color:#0d2f6e;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">${n}</div>
      ${!isLast?`<div style="width:2px;height:16px;background:#d4daf0;margin:3px auto"></div>`:''}
    </div>
    <div style="flex:1">
      <div style="font-size:11.5px;font-weight:600;color:#0d2f6e;margin-bottom:3px">Why ${n}</div>
      <textarea class="fc why-input" data-why-n="${n}" ${extraIdx!==undefined?`data-extra-idx="${extraIdx}"`:''} rows="2" placeholder="${n===1?'Why did the problem occur?':'Why?'}">${esc(val)}</textarea>
    </div>
    ${extraIdx!==undefined?`<button class="btn btn-xs" style="color:#dc3545;background:#fee2e2;border:none;margin-top:20px" onclick="removeExtraWhy(${extraIdx})" title="Remove this why">✕</button>`:''}
  </div>`;
}
function capaWhyRowsHTML(ca){
  const extra=ca.extraWhys||[];
  const total=5+extra.length;
  let html='';
  for(let n=1;n<=5;n++) html+=capaWhyRowHTML(n,ca['why'+n]||'',n===total);
  extra.forEach((val,i)=>{ html+=capaWhyRowHTML(6+i,val||'',6+i===total,i); });
  return html;
}
let _whyCapaId=null;
async function addExtraWhy(capaId){
  _whyCapaId=capaId;
  const ca=await DB.getCapa(capaId);
  const extraWhys=[...(ca.extraWhys||[]),''];
  await DB.updateCapa(capaId,{extraWhys});
  const wrap=document.getElementById('why-list');
  if(wrap) wrap.innerHTML=capaWhyRowsHTML({...ca,extraWhys});
}
async function removeExtraWhy(idx){
  const capaId=_whyCapaId; if(!capaId) return;
  const ca=await DB.getCapa(capaId);
  const extraWhys=(ca.extraWhys||[]).filter((_,i)=>i!==idx);
  await DB.updateCapa(capaId,{extraWhys});
  const wrap=document.getElementById('why-list');
  if(wrap) wrap.innerHTML=capaWhyRowsHTML({...ca,extraWhys});
}
async function saveWhy(capaId){
  _whyCapaId=capaId;
  const updates={};
  const extraWhys=[];
  document.querySelectorAll('.why-input').forEach(el=>{
    const n=parseInt(el.dataset.whyN);
    if(el.dataset.extraIdx!==undefined) extraWhys[parseInt(el.dataset.extraIdx)]=el.value;
    else if(n<=5) updates['why'+n]=el.value;
  });
  updates.extraWhys=extraWhys;
  updates.rootCause=document.getElementById('root-cause')?.value||'';
  await DB.updateCapa(capaId,updates);
  toast('Analysis saved','s');
}

async function saveEffectiveness(capaId){
  const evidence=document.getElementById('eff-evidence')?.value||'';
  const verified=document.getElementById('eff-verified')?.checked||false;
  await DB.updateCapa(capaId,{effectiveness:evidence,effectivenessVerified:verified});
  // Auto-close CAPA when verified as effective
  if(verified){
    const ca=await DB.getCapa(capaId);
    const actions=await db.capaActions.where('capaId').equals(capaId).toArray().catch(()=>[]);
    const allDone=actions.length>0&&actions.every(a=>a.status==='COMPLETE');
    if(ca.status!=='CLOSED'&&allDone){
      await DB.updateCapa(capaId,{status:'CLOSED',closedAt:new Date().toISOString()});
      if(ca.complaintId){await DB.updateComplaint(ca.complaintId,{status:'CLOSED'});}
      toast('✅ Actions verified as effective — CAPA closed!','s');
      viewCapa(capaId);
      return;
    } else if(ca.status!=='CLOSED'&&!allDone){
      toast('Effectiveness marked — complete all actions to close CAPA','w');
    }
  }
}

async function saveDocChanges(capaId){
  const chg=document.querySelector('input[name="doc-chg"]:checked')?.value||'';
  const details=document.getElementById('doc-chg-details')?.value||'';
  await DB.updateCapa(capaId,{docChanges:chg,docChangeDetails:details});
}

async function addTeamMember(capaId){
  const name=document.getElementById('tm-name')?.value.trim();
  const desig=document.getElementById('tm-desig')?.value.trim();
  if(!name){toast('Enter a name','d');return}
  const ca=await DB.getCapa(capaId);
  const team=[...(ca.team||[]),{name,designation:desig||''}];
  await DB.updateCapa(capaId,{team});
  viewCapa(capaId);
}

async function removeTeamMember(capaId,idx){
  const ca=await DB.getCapa(capaId);
  const team=(ca.team||[]).filter((_,i)=>i!==idx);
  await DB.updateCapa(capaId,{team});
  viewCapa(capaId);
}

async function closeCapa(capaId){
  const ca=await DB.getCapa(capaId);
  if(!ca.effectivenessVerified){toast('Mark effectiveness as verified first','d');return}
  await DB.updateCapa(capaId,{status:'CLOSED',closedAt:new Date().toISOString()});
  if(ca.complaintId){await DB.updateComplaint(ca.complaintId,{status:'CLOSED'});}
  toast('✅ CAPA closed!','s');
  viewCapa(capaId);
}

// ══════════════════════════════════════════════════════
//  EDIT — Quality Alert (inline on the alert page itself — no popup)
// ══════════════════════════════════════════════════════
async function saveAlertDetails(alertId){
  await DB.updateAlert(alertId,{
    date:document.getElementById('al-date')?.value,
    problem:document.getElementById('al-problem')?.value.trim(),
    containment:document.getElementById('al-containment')?.value.trim(),
    instructions:document.getElementById('al-instructions')?.value.trim(),
    updatedAt:new Date().toISOString()
  });
}
async function saveAlertStatus(alertId){
  const status=document.getElementById('al-status')?.value;
  await DB.updateAlert(alertId,{status,updatedAt:new Date().toISOString()});
  toast('✅ Alert status updated');
  viewAlert(alertId);
}

// ══════════════════════════════════════════════════════
//  EDIT — CAPA (inline on the CAPA page itself — no popup)
// ══════════════════════════════════════════════════════
async function saveCapaDetails(capaId){
  await DB.updateCapa(capaId,{
    problem:document.getElementById('ca-problem')?.value.trim(),
    defectType:document.getElementById('ca-defectType')?.value.trim(),
    defectQty:document.getElementById('ca-defectQty')?.value,
    batchNo:document.getElementById('ca-batchNo')?.value.trim(),
    detectionStage:document.getElementById('ca-detectionStage')?.value.trim(),
    containment:document.getElementById('ca-containment')?.value.trim(),
    updatedAt:new Date().toISOString()
  });
}

// ══════════════════════════════════════════════════════
//  PRINT — Quality Alert & Full Report
// ══════════════════════════════════════════════════════
async function printAlert(alertId){
  const a=await DB.getAlert(alertId); if(!a) return;
  const w=window.open('','_blank','width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>${a.qaNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10pt;color:#000}
@page{size:A4;margin:15mm}
.hdr{border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px}
.hdr-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}
.alert-banner{background:#ff6b00;color:#fff;padding:8px 14px;font-size:14pt;font-weight:bold;border-radius:4px;margin-bottom:12px}
.section{margin-bottom:14px}
.section-title{font-size:9pt;font-weight:bold;text-transform:uppercase;color:#555;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:6px}
.body-text{font-size:10.5pt;line-height:1.65;white-space:pre-wrap}
.img-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.img-grid img{width:100%;border:1px solid #ccc;border-radius:4px}
.signoff-table{width:100%;border-collapse:collapse;margin-top:8px}
.signoff-table th{background:#eee;border:1px solid #000;padding:6px;font-size:9pt}
.signoff-table td{border:1px solid #000;padding:10px 8px;font-size:9pt}
</style></head><body>
<div class="hdr">
  <div class="hdr-grid">
    <div><b style="font-size:13pt">V R ALUCAST</b><br><span style="font-size:8pt;color:#555">High Pressure Die Casting | ISO 9001</span></div>
    <div style="text-align:center"><b>Part No:</b> ${esc(a.partNumber)}<br>${esc(a.partName)}</div>
    <div style="text-align:right"><b>${a.qaNumber}</b><br>Date: ${fmtD(a.date)}<br>Linked CR: ${a.crNumber||'—'}</div>
  </div>
</div>
<div class="alert-banner">⚠️ QUALITY ALERT — ${a.qaNumber}</div>
<div class="section"><div class="section-title">Problem Statement</div>
  <div class="body-text">${esc(a.problem)}</div></div>
${a.images&&a.images.length?`<div class="section"><div class="section-title">Evidence Images</div>
  <div class="img-grid">${a.images.map((img,i)=>`<div><div style="font-size:8pt;color:#555;margin-bottom:3px">Image ${i+1}</div><img src="${img}"></div>`).join('')}</div></div>`:''}
<div class="section"><div class="section-title">Containment Action</div>
  <div class="body-text">${esc(a.containment)}</div></div>
${a.instructions?`<div class="section"><div class="section-title">Instructions to Team</div>
  <div class="body-text">${esc(a.instructions)}</div></div>`:''}
${a.signoffs&&a.signoffs.length?`<div class="section"><div class="section-title">Notification Sign-Off — Team Acknowledgement</div>
  <div style="font-size:8.5pt;color:#555;margin-bottom:6px">The following team members have been notified of this Quality Alert. Please sign below to confirm receipt.</div>
  <table class="signoff-table">
    <thead><tr><th>#</th><th>Name</th><th>Designation</th><th>Date</th><th>Signature</th></tr></thead>
    <tbody>${a.signoffs.map((s,i)=>`<tr>
      <td style="text-align:center">${i+1}</td>
      <td>${esc(s.name)}</td><td>${esc(s.designation)}</td>
      <td style="min-width:70px"></td><td style="min-width:120px"></td>
    </tr>`).join('')}
    </tbody>
  </table></div>`:''}
<div style="border-top:1px solid #ccc;padding-top:8px;margin-top:14px;font-size:7.5pt;color:#777;display:flex;justify-content:space-between">
  <span>${a.qaNumber} | Issued by: ${esc(a.createdBy||'')} | ${fmtD(a.createdAt)}</span>
  <span>V R ALUCAST — CONFIDENTIAL</span>
</div>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),1500)}<\/script>
</body></html>`);
  w.document.close();
}

function capaPrintActionsTable(list){
  return`<table class="dt" style="margin-bottom:5px">
    <thead><tr><th style="width:20px">#</th><th>Action</th><th style="width:90px">Responsible</th><th style="width:75px">Designation</th><th style="width:58px">Due Date</th><th style="width:52px">Status</th><th style="width:62px">Completed</th></tr></thead>
    <tbody>${list.map((a,i)=>`<tr>
      <td style="text-align:center">${i+1}</td><td>${esc(a.action)}</td><td>${esc(a.responsible)}</td>
      <td style="font-size:7pt">${esc(a.designation||'')}</td><td>${fmtD(a.dueDate)}</td>
      <td style="font-weight:bold;color:${a.status==='COMPLETE'?'#16a34a':'#e67c00'}">${a.status}</td>
      <td>${a.completedAt?fmtD(a.completedAt):''}</td>
    </tr>`).join('')||'<tr><td colspan="7" style="padding:5px;color:#999;text-align:center">No actions recorded</td></tr>'}
    </tbody>
  </table>`;
}

async function printFullReport(complaintId){
  if(!complaintId){toast('No complaint linked','w');return}
  const c=await DB.getComplaint(complaintId); if(!c){toast('Complaint not found','d');return}
  const alert=await DB.getAlertByComplaint(complaintId);
  const capa=alert?await DB.getCapaByAlert(alert.id):null;
  const actions=capa?await DB.getCapaActions(capa.id):[];
  const correctiveActions=actions.filter(a=>(a.type||'CORRECTIVE')==='CORRECTIVE');
  const preventiveActions=actions.filter(a=>a.type==='PREVENTIVE');

  const w=window.open('','_blank','width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>Full Report \u2014 ${c.crNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:8.5pt;color:#000}
@page{size:A4;margin:12mm 13mm 14mm 13mm}
.pg-hdr{border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px;display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:6px;align-items:end}
.co-name{font-size:11pt;font-weight:bold;line-height:1.2}
.co-sub{font-size:7pt;color:#555}
.rpt-title{text-align:center;font-size:9.5pt;font-weight:bold}
.rpt-part{text-align:center;font-size:7.5pt;color:#444;margin-top:1px}
.rpt-nums{text-align:right;font-size:7.5pt;line-height:1.6}
.sec{margin-bottom:8px}
.sec-hdr{font-size:7.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;background:#ececec;padding:3px 7px;border-left:3px solid #000;margin-bottom:5px}
.irow{display:grid;gap:0;margin-bottom:4px}
.irow-3{grid-template-columns:repeat(3,1fr)}
.irow-4{grid-template-columns:repeat(4,1fr)}
.ic{border:1px solid #ccc;padding:3px 6px}
.ic .lbl{font-size:6.5pt;color:#777;text-transform:uppercase;font-weight:bold}
.ic .val{font-size:8.5pt;font-weight:600}
.bt{font-size:8.5pt;line-height:1.55;white-space:pre-wrap;border:1px solid #ccc;padding:4px 7px;margin-bottom:4px}
table.dt{width:100%;border-collapse:collapse;font-size:7.5pt;margin-bottom:4px}
table.dt th{background:#ececec;border:1px solid #000;padding:3px 5px;text-align:left}
table.dt td{border:1px solid #ccc;padding:3px 5px;vertical-align:top}
.why-row{display:grid;grid-template-columns:70px 1fr;border:1px solid #ccc;margin-bottom:-1px}
.why-lbl{background:#ececec;font-weight:bold;font-size:7.5pt;padding:3px 5px;border-right:1px solid #ccc;display:flex;align-items:center;justify-content:center;text-align:center}
.why-val{padding:3px 6px;font-size:8.5pt}
.img-row{display:grid;gap:6px;margin-bottom:4px}
.img-row img{width:100%;border:1px solid #ccc;border-radius:2px}
.dvd{border-top:1px solid #000;margin:7px 0}
.sub-lbl{font-size:7pt;font-weight:bold;text-transform:uppercase;color:#555;margin-bottom:2px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<div class="pg-hdr">
  <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div></div>
  <div><div class="rpt-title">QUALITY COMPLAINT & CAPA REPORT</div><div class="rpt-part">${esc(c.partNumber)} \u2014 ${esc(c.partName)}</div></div>
  <div class="rpt-nums"><b>${c.crNumber}</b>${alert?'<br>'+alert.qaNumber:''}${capa?'<br>'+capa.capaNumber:''}</div>
</div>

<div class="sec">
  <div class="sec-hdr">1. Complaint Registration \u2014 ${c.crNumber}</div>
  <div class="irow irow-4" style="margin-bottom:3px">
    <div class="ic"><div class="lbl">Date</div><div class="val">${fmtD(c.date)}</div></div>
    <div class="ic"><div class="lbl">Type</div><div class="val">${c.type==='EXTERNAL'?'External':'Internal'}</div></div>
    <div class="ic"><div class="lbl">Source</div><div class="val">${esc(c.source||'\u2014')}</div></div>
    <div class="ic"><div class="lbl">Reported By</div><div class="val">${esc(c.reporter||'\u2014')}</div></div>
  </div>
  <div class="bt">${esc(c.problem)}</div>
  ${c.notes?`<div class="bt" style="font-size:7.5pt;color:#555">${esc(c.notes)}</div>`:''}
</div>

${alert?`
<div class="dvd"></div>
<div class="sec">
  <div class="sec-hdr">2. Quality Alert \u2014 ${alert.qaNumber} &nbsp;<span style="font-weight:normal;text-transform:none;font-size:7pt">Issued: ${fmtD(alert.date)} by ${esc(alert.createdBy||'')}</span></div>
  ${alert.images&&alert.images.length?`<div class="img-row" style="grid-template-columns:repeat(${Math.min(alert.images.length,3)},1fr)">
    ${alert.images.map((img,i)=>`<div><div style="font-size:6.5pt;color:#777;margin-bottom:2px">Evidence ${i+1}</div><img src="${img}"></div>`).join('')}
  </div>`:''}
  <div class="sub-lbl">Containment Action</div>
  <div class="bt">${esc(alert.containment)}</div>
  ${alert.instructions?`<div class="sub-lbl">Instructions to Team</div><div class="bt">${esc(alert.instructions)}</div>`:''}
  ${alert.signoffs&&alert.signoffs.length?`<div class="sub-lbl">Team Notification Sign-Off</div>
  <table class="dt">
    <thead><tr><th style="width:24px">#</th><th>Name</th><th>Designation</th><th style="width:70px">Date</th><th style="width:90px">Signature</th></tr></thead>
    <tbody>${alert.signoffs.map((s,i)=>`<tr><td style="text-align:center">${i+1}</td><td>${esc(s.name)}</td><td>${esc(s.designation)}</td><td></td><td></td></tr>`).join('')}</tbody>
  </table>`:''}
</div>`:''} 

${capa?`
<div class="dvd"></div>
<div class="sec">
  <div class="sec-hdr">3. CAPA \u2014 ${capa.capaNumber} &nbsp;<span style="font-weight:normal;text-transform:none;font-size:7pt">Status: ${capa.status}${capa.closedAt?' | Closed: '+fmtD(capa.closedAt):''}</span></div>
  ${capa.team&&capa.team.length?`<div style="margin-bottom:5px;display:flex;flex-wrap:wrap;gap:4px">
    ${capa.team.map(m=>`<span style="border:1px solid #ccc;padding:2px 6px;font-size:7.5pt"><b>${esc(m.name)}</b> \u2014 ${esc(m.designation)}</span>`).join('')}
  </div>`:''}
  <div class="sub-lbl">5-Why Analysis</div>
  <div style="margin-bottom:5px">
    ${[1,2,3,4,5].map(n=>`<div class="why-row"><div class="why-lbl">Why ${n}</div><div class="why-val">${esc(capa['why'+n]||'')}</div></div>`).join('')}
    ${(capa.extraWhys||[]).map((wv,i)=>`<div class="why-row"><div class="why-lbl">Why ${6+i}</div><div class="why-val">${esc(wv||'')}</div></div>`).join('')}
    <div class="why-row"><div class="why-lbl" style="background:#f6c8c8">Root Cause</div><div class="why-val" style="font-weight:bold">${esc(capa.rootCause||'')}</div></div>
  </div>
  <div class="sub-lbl">Corrective Actions</div>
  ${capaPrintActionsTable(correctiveActions)}
  <div class="sub-lbl">Preventive Actions</div>
  ${capaPrintActionsTable(preventiveActions)}
  ${capa.effectiveness?`<div class="sub-lbl">Effectiveness Verification</div>
  <div class="irow irow-3" style="margin-bottom:3px">
    <div class="ic"><div class="lbl">Review Date</div><div class="val">${fmtD(capa.effectivenessDate)}</div></div>
    <div class="ic"><div class="lbl">Verified</div><div class="val">${capa.effectivenessVerified?'YES \u2713':'Pending'}</div></div>
    <div class="ic"><div class="lbl">CAPA Status</div><div class="val">${capa.status}</div></div>
  </div>
  <div class="bt">${esc(capa.effectiveness)}</div>`:''}
  ${capa.docChanges?`<div class="sub-lbl">Document Changes</div>
  <div class="bt"><b>Required:</b> ${capa.docChanges}${capa.docChangeDetails?'\n'+esc(capa.docChangeDetails):''}</div>`:''}
</div>`:''} 

<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),1500)}<\/script>
</body></html>`);
  w.document.close();
}


// ══════════════════════════════════════════════════════
//  QMS MODULE — PFMEA / CONTROL PLAN / CHECK SHEET
// ══════════════════════════════════════════════════════

const QMS_STEPS=['1. Raw Material Receipt & Inspection','2. Aluminium Melting & Alloying','3. Die Preparation & Lubrication','4. Die Casting (Shot)','5. Trimming / Degating','6. Shot Blasting / Surface Cleaning','7. Visual & Dimensional Inspection','8. Packing & Dispatch'];
const QMS_STEP_COLORS=['#E8F4FD','#FFF8E1','#E8F5E9','#FCE4D6','#F3E5F5','#E0F2F1','#E3F2FD','#FFF3E0'];
const QMS_STEP_TEXT=['#1565C0','#F57F17','#2E7D32','#BF360C','#6A1B9A','#00695C','#0277BD','#E65100'];

const QMS_PFMEA_SEED=[
  {step:'1. Raw Material Receipt & Inspection',func:'Receive ADC12 ingots & verify conformance',mode:'Wrong alloy / off-spec material accepted',effect:'Casting mechanical properties fail; customer rejection',s:8,cause:'Supplier delivers incorrect grade; no incoming test',o:3,prev:'Supplier CoC review',det:'Visual check on ingot markings',d:7,action:'Introduce heat-wise spectrometer check or outsourced chemical test; mandatory CoC with each lot',resp:'QC / Stores',status:'Open'},
  {step:'1. Raw Material Receipt & Inspection',func:'Receive ADC12 ingots & verify conformance',mode:'Contaminated / mixed scrap in charge',effect:'Porosity, inclusions, blow holes in casting',s:7,cause:'Uncontrolled scrap segregation at furnace',o:4,prev:'None',det:'Visual on melt surface',d:7,action:'Define approved scrap % and segregate by alloy grade; tag scrap bins',resp:'Production',status:'Open'},
  {step:'2. Aluminium Melting & Alloying',func:'Melt ADC12 to correct chemistry & temperature',mode:'Melt temperature too high',effect:'Hydrogen absorption → porosity; die soldering',s:7,cause:'Thermocouple drift; operator not checking',o:4,prev:'Operator visual on pyrometer',det:'Periodic temp log',d:6,action:'Calibrate thermocouple monthly; add mandatory temp log every heat',resp:'Production',status:'Open'},
  {step:'2. Aluminium Melting & Alloying',func:'Melt ADC12 to correct chemistry & temperature',mode:'Melt temperature too low',effect:'Misrun, cold shut, incomplete fill',s:6,cause:'Operator starts shot before target temp reached',o:3,prev:'Operator instruction',det:'None — detected at casting stage',d:7,action:'Add min temp interlock or checklist before shot approval',resp:'Production',status:'Open'},
  {step:'2. Aluminium Melting & Alloying',func:'Melt ADC12 to correct chemistry & temperature',mode:'Slag / dross not removed before ladling',effect:'Inclusions in casting; surface defects',s:6,cause:'Drossing step skipped under production pressure',o:4,prev:'Operator SOP',det:'Visual inspection at casting',d:6,action:'Add dross removal to pre-shot checklist; supervisor sign-off',resp:'Production / QC',status:'Open'},
  {step:'3. Die Preparation & Lubrication',func:'Set die, apply release agent, pre-heat die',mode:'Die not pre-heated to correct temperature',effect:'Cold shut, misrun, increased porosity',s:7,cause:'Production rush; no pre-heat verification',o:4,prev:'None',det:'None — detected at inspection',d:8,action:'Add die temp check (pyrometer) as mandatory pre-run step; record on job card',resp:'Production',status:'Open'},
  {step:'3. Die Preparation & Lubrication',func:'Set die, apply release agent, pre-heat die',mode:'Insufficient die lubrication',effect:'Die soldering, sticking, surface defects',s:6,cause:'Operator skips spray cycle; nozzles blocked',o:4,prev:'Operator SOP',det:'Visual on die surface',d:6,action:'Spray cycle timer interlock; nozzle maintenance schedule',resp:'Production',status:'Open'},
  {step:'3. Die Preparation & Lubrication',func:'Set die, apply release agent, pre-heat die',mode:'Clamp / locking force incorrect',effect:'Flash on parting line; dimensional non-conformance',s:7,cause:'Setup error; worn toggle / clamp',o:3,prev:'Machine parameter setting',det:'Visual on first shot',d:5,action:'First-off inspection mandatory; include clamp tonnage on parameter sheet',resp:'Production / Maintenance',status:'Open'},
  {step:'4. Die Casting (Shot)',func:'Inject molten aluminium into die cavity',mode:'Porosity (shrinkage / gas)',effect:'Pressure leak at customer; part rejected at pressure test',s:9,cause:'Incorrect injection speed / pressure / intensification',o:5,prev:'Process parameter sheet',det:'Sample visual + sectioning (rare)',d:7,action:'CRITICAL: Implement SPC on injection pressure & slow-shot speed; define process window with DOE',resp:'Production / QC',status:'Open'},
  {step:'4. Die Casting (Shot)',func:'Inject molten aluminium into die cavity',mode:'Cold shut / misrun',effect:'Incomplete casting; 100% visible defect → scrap',s:7,cause:'Low metal temp; slow injection; insufficient venting',o:4,prev:'Process parameter sheet',det:'100% visual at press',d:3,action:'Log occurrence; track by shift; review parameter window',resp:'Production',status:'Open'},
  {step:'4. Die Casting (Shot)',func:'Inject molten aluminium into die cavity',mode:'Flash (excess material at parting line)',effect:'Trimming difficulty; dimensional out-of-spec',s:6,cause:'Die wear; incorrect clamp force; over-injection',o:5,prev:'Clamp tonnage setting',det:'Visual at press by operator',d:4,action:'Monthly die wear inspection; maintain die maintenance log',resp:'Maintenance / Production',status:'Open'},
  {step:'4. Die Casting (Shot)',func:'Inject molten aluminium into die cavity',mode:'Short shot',effect:'Incomplete part; 100% scrap',s:6,cause:'Insufficient molten metal in ladle',o:3,prev:'Operator ladling procedure',det:'100% visual at press',d:2,action:'Define minimum ladle charge weight; use ladle weight check',resp:'Production',status:'Open'},
  {step:'5. Trimming / Degating',func:'Remove runner, gates, flash from casting',mode:'Incomplete gate removal',effect:'Dimensional non-conformance; customer assembly issue',s:7,cause:'Worn trim die; operator rush',o:4,prev:'Visual check by operator',det:'QC dimensional check (sample)',d:5,action:'Periodic trim die maintenance; add gate removal to check sheet',resp:'Production / Maintenance',status:'Open'},
  {step:'6. Shot Blasting / Surface Cleaning',func:'Remove oxide scale, improve surface finish',mode:'Insufficient blasting (scale remaining)',effect:'Poor surface finish; customer cosmetic complaint',s:5,cause:'Low blast time; worn shot media',o:4,prev:'Time setting on machine',det:'Visual sampling by QC',d:5,action:'Define blast time per part; log media replacement frequency',resp:'Production / QC',status:'Open'},
  {step:'7. Visual & Dimensional Inspection',func:'Inspect 100% visual + sample dimensional',mode:'Defective part passed (escape)',effect:'Customer line rejection; warranty; 8D raised',s:9,cause:'Inspector fatigue; poor lighting; no criteria defined',o:4,prev:'Inspection SOP; defect catalogue',det:'Visual inspection',d:7,action:'CRITICAL: Create visual defect catalogue with photos; improve inspection lighting; 2-person check for critical features',resp:'QC',status:'Open'},
  {step:'7. Visual & Dimensional Inspection',func:'Inspect 100% visual + sample dimensional',mode:'Critical dimension not checked',effect:'Non-conforming part shipped to customer',s:8,cause:'Incomplete check sheet; critical dimensions not highlighted',o:3,prev:'Dimension check sheet',det:'Sampling plan',d:6,action:'Highlight critical dimensions on drawing; mandatory 100% check for those',resp:'QC',status:'Open'},
  {step:'8. Packing & Dispatch',func:'Pack, label, and dispatch correct parts',mode:'Mixed parts (wrong part no. packed)',effect:'Customer line stoppage; emergency logistics',s:8,cause:'Similar-looking parts stored together; no part-no. verification',o:4,prev:'Operator visual',det:'Dispatch check by supervisor',d:6,action:'Introduce packing check sheet with part no. + qty sign-off; physically segregate part families',resp:'QC / Dispatch',status:'Open'},
  {step:'8. Packing & Dispatch',func:'Pack correct quantities',mode:'Wrong quantity shipped',effect:'Production shortage at customer; premium freight',s:7,cause:'Manual counting error',o:4,prev:'Operator count',det:'Dispatch verification',d:5,action:'Use weigh-count method for small parts; double-check by dispatch staff',resp:'Dispatch',status:'Open'},
  {step:'8. Packing & Dispatch',func:'Label correctly',mode:'Wrong / missing label',effect:'Traceability loss; customer complaint; IATF non-conformance',s:7,cause:'Printer error; label mixed up at packing',o:3,prev:'Label printing SOP',det:'Visual check before sealing box',d:5,action:'Barcode scan verification; label template per part number',resp:'QC / Dispatch',status:'Open'},
];

const QMS_CP_SEED=[
  {step:'1. Raw Material Receipt & Inspection',char:'Alloy grade (ADC12)',spec:'ADC12 per JIS H5302',tol:'As per std',method:'CoC review + spectrometer check',sample:'100% lot',freq:'Each delivery',resp:'QC',reaction:'Quarantine & return to supplier',pfRef:'1,2'},
  {step:'1. Raw Material Receipt & Inspection',char:'Ingot marking / identification',spec:'Correct alloy label',tol:'Pass/Fail',method:'Visual inspection',sample:'100%',freq:'Each delivery',resp:'Stores',reaction:'Quarantine pending verification',pfRef:'1'},
  {step:'2. Aluminium Melting & Alloying',char:'Melt temperature',spec:'680–720°C (ADC12)',tol:'±10°C',method:'Calibrated pyrometer / thermocouple',sample:'1 per heat',freq:'Each heat',resp:'Operator',reaction:'Stop; adjust furnace; re-check before shot',pfRef:'3,4'},
  {step:'2. Aluminium Melting & Alloying',char:'Dross removal',spec:'Dross-free melt surface',tol:'Pass/Fail',method:'Visual + checklist',sample:'100% heat',freq:'Before each ladle',resp:'Operator',reaction:'Skim again; do not proceed until clean',pfRef:'5'},
  {step:'3. Die Preparation & Lubrication',char:'Die temperature (pre-heat)',spec:'150–200°C',tol:'±20°C',method:'Infrared thermometer',sample:'1st shot',freq:'Each run start',resp:'Operator',reaction:'Continue pre-heating; do not start shot',pfRef:'6'},
  {step:'3. Die Preparation & Lubrication',char:'Die lubrication',spec:'Even spray coverage',tol:'Pass/Fail',method:'Visual check on die surface',sample:'Each cycle',freq:'Each shot',resp:'Operator',reaction:'Re-spray; check nozzle; record event',pfRef:'7'},
  {step:'3. Die Preparation & Lubrication',char:'Clamp / locking force',spec:'As per machine param sheet',tol:'±5%',method:'Machine display + job card',sample:'1st shot setup',freq:'Each setup',resp:'Operator',reaction:'Stop; reset clamp; inform supervisor',pfRef:'8'},
  {step:'4. Die Casting (Shot)',char:'Injection slow-shot speed',spec:'As per part param sheet',tol:'±0.05 m/s',method:'Machine parameter display + log',sample:'Each shot',freq:'Continuous',resp:'Operator',reaction:'Stop production; check and reset parameters',pfRef:'9'},
  {step:'4. Die Casting (Shot)',char:'Injection pressure (intensification)',spec:'As per param sheet',tol:'±5 bar',method:'Machine parameter display + log',sample:'Each shot',freq:'Continuous',resp:'Operator',reaction:'Stop; check intensifier; inform supervisor',pfRef:'9'},
  {step:'4. Die Casting (Shot)',char:'Metal temperature at ladle',spec:'680–720°C',tol:'±10°C',method:'Pyrometer check at ladle',sample:'1 per 30 min',freq:'Every 30 min',resp:'Operator',reaction:'Return metal to furnace; re-heat',pfRef:'3,4'},
  {step:'4. Die Casting (Shot)',char:'Flash presence on parting line',spec:'No flash',tol:'Pass/Fail',method:'100% visual by operator',sample:'100%',freq:'Each shot',resp:'Operator',reaction:'Check clamp force; inspect die; segregate part',pfRef:'11'},
  {step:'5. Trimming / Degating',char:'Gate / runner removal',spec:'No residual gate material',tol:'Pass/Fail',method:'Visual inspection by operator',sample:'100%',freq:'Each part',resp:'Operator',reaction:'Re-trim; inspect for damage',pfRef:'13'},
  {step:'6. Shot Blasting / Surface Cleaning',char:'Blast time per part',spec:'As per param sheet',tol:'±10 sec',method:'Timer setting + visual',sample:'1st-off + sample',freq:'Each setup',resp:'Operator',reaction:'Re-blast; check media level; adjust timer',pfRef:'14'},
  {step:'6. Shot Blasting / Surface Cleaning',char:'Surface cleanliness post-blast',spec:'No visible oxide scale',tol:'Pass/Fail',method:'Visual check',sample:'Sample 5/batch',freq:'Per batch',resp:'QC',reaction:'Re-blast batch',pfRef:'14'},
  {step:'7. Visual & Dimensional Inspection',char:'Critical dimensions',spec:'Per drawing (customer spec)',tol:'Per drawing',method:'Vernier / CMM / Go-No-Go gauge',sample:'First-off + sample AQL',freq:'Each lot',resp:'QC',reaction:'Hold batch; 100% sort; raise NCR',pfRef:'15,16'},
  {step:'7. Visual & Dimensional Inspection',char:'Visual surface quality',spec:'No porosity, cold shut, flash visible',tol:'Pass/Fail',method:'Visual + defect catalogue',sample:'100%',freq:'Each part',resp:'QC',reaction:'Segregate; raise NCR; 8D if repeat',pfRef:'15'},
  {step:'8. Packing & Dispatch',char:'Part number verification',spec:'Matches traveller/label',tol:'Pass/Fail',method:'Visual + packing check sheet',sample:'100%',freq:'Each box',resp:'Dispatch',reaction:'Stop; verify and correct before dispatch',pfRef:'17'},
  {step:'8. Packing & Dispatch',char:'Quantity per box',spec:'As per customer PO',tol:'0 short',method:'Count / weigh-count',sample:'100% box',freq:'Each box',resp:'Dispatch',reaction:'Recount; correct quantity before sealing',pfRef:'18'},
  {step:'8. Packing & Dispatch',char:'Label accuracy (part no, qty, rev)',spec:'Matches physical part',tol:'Pass/Fail',method:'Visual verification',sample:'100%',freq:'Each label',resp:'QC',reaction:'Re-print correct label; do not dispatch',pfRef:'19'},
];

const QMS_CS_SEED=[
  {step:'1. Raw Material Receipt & Inspection',checkPoint:'Alloy grade confirmed (CoC reviewed)',method:'Document check',spec:'ADC12 CoC present',freq:'Each delivery',critical:true},
  {step:'1. Raw Material Receipt & Inspection',checkPoint:'Ingot markings correct',method:'Visual',spec:'Correct grade label',freq:'Each delivery',critical:false},
  {step:'1. Raw Material Receipt & Inspection',checkPoint:'Ingots dry & clean (no moisture/dirt)',method:'Visual',spec:'Pass / Fail',freq:'Each delivery',critical:false},
  {step:'2. Aluminium Melting & Alloying',checkPoint:'Melt temperature within range (680–720°C)',method:'Pyrometer',spec:'680–720°C',freq:'Each heat',critical:true},
  {step:'2. Aluminium Melting & Alloying',checkPoint:'Dross removed before ladling',method:'Visual + checklist',spec:'Dross-free surface',freq:'Before each ladle',critical:true},
  {step:'2. Aluminium Melting & Alloying',checkPoint:'Correct scrap % used (per approved list)',method:'Visual / log',spec:'Per approved %',freq:'Each heat',critical:false},
  {step:'3. Die Preparation & Lubrication',checkPoint:'Die temperature at run start (150–200°C)',method:'IR thermometer',spec:'150–200°C',freq:'Each run start',critical:true},
  {step:'3. Die Preparation & Lubrication',checkPoint:'Die lubrication applied (even coverage)',method:'Visual',spec:'Even spray — no dry spots',freq:'Each shot',critical:false},
  {step:'3. Die Preparation & Lubrication',checkPoint:'Clamp force set per parameter sheet',method:'Machine display',spec:'Per param sheet',freq:'Each setup',critical:true},
  {step:'3. Die Preparation & Lubrication',checkPoint:'Die cavity clean — no debris / residue',method:'Visual',spec:'Clean cavity',freq:'Each run start',critical:false},
  {step:'4. Die Casting (Shot)',checkPoint:'Slow-shot speed per parameter sheet',method:'Machine display',spec:'Per param sheet',freq:'Start of shift',critical:true},
  {step:'4. Die Casting (Shot)',checkPoint:'Injection pressure per parameter sheet',method:'Machine display',spec:'Per param sheet',freq:'Start of shift',critical:true},
  {step:'4. Die Casting (Shot)',checkPoint:'Metal temp at ladle (check every 30 min)',method:'Pyrometer',spec:'680–720°C',freq:'Every 30 min',critical:true},
  {step:'4. Die Casting (Shot)',checkPoint:'First-off part: 100% visual OK (no flash, misrun, cold shut)',method:'Visual',spec:'No visible defect',freq:'First shot each run',critical:true},
  {step:'4. Die Casting (Shot)',checkPoint:'No flash on parting line (ongoing production)',method:'Visual',spec:'Pass / Fail',freq:'Each shot',critical:false},
  {step:'4. Die Casting (Shot)',checkPoint:'Cycle time consistent with target',method:'Stopwatch / machine',spec:'Per param sheet',freq:'Hourly',critical:false},
  {step:'5. Trimming / Degating',checkPoint:'All gates / runners fully removed',method:'Visual',spec:'No residual gate material',freq:'Each part',critical:true},
  {step:'5. Trimming / Degating',checkPoint:'No trimming damage (crack / dent) on casting',method:'Visual',spec:'No visible damage',freq:'Each part',critical:false},
  {step:'6. Shot Blasting / Surface Cleaning',checkPoint:'Blast time set per parameter sheet',method:'Timer display',spec:'Per param sheet',freq:'Each setup',critical:false},
  {step:'6. Shot Blasting / Surface Cleaning',checkPoint:'Surface clean after blast (no oxide scale)',method:'Visual',spec:'Clean surface',freq:'Sample 5/batch',critical:false},
  {step:'7. Visual & Dimensional Inspection',checkPoint:'Critical dimensions checked (first-off + sample AQL)',method:'Vernier / Go-No-Go gauge',spec:'Per drawing',freq:'First-off + sample',critical:true},
  {step:'7. Visual & Dimensional Inspection',checkPoint:'100% visual inspection completed',method:'Visual (defect catalogue)',spec:'No porosity, cold shut, blow hole',freq:'Each part',critical:true},
  {step:'7. Visual & Dimensional Inspection',checkPoint:'Inspection result recorded on job card (signed)',method:'Document check',spec:'Signed job card present',freq:'Each batch',critical:true},
  {step:'8. Packing & Dispatch',checkPoint:'Part number matches traveller / label',method:'Visual check',spec:'Correct part no.',freq:'Each box',critical:true},
  {step:'8. Packing & Dispatch',checkPoint:'Quantity per box verified',method:'Count / weigh-count',spec:'Per customer PO',freq:'Each box',critical:true},
  {step:'8. Packing & Dispatch',checkPoint:'Label correct (part no, qty, rev, lot no)',method:'Visual',spec:'100% match',freq:'Each label',critical:true},
];

async function qmsInit(){
  const now=new Date().toISOString();
  if(!await db.qmsPfmea.count()) for(const r of QMS_PFMEA_SEED) await db.qmsPfmea.add({...r,rpn:r.s*r.o*r.d,createdAt:now});
  if(!await db.qmsCp.count()) for(const r of QMS_CP_SEED) await db.qmsCp.add({...r,createdAt:now});
  if(!await db.qmsCsMaster.count()) for(const r of QMS_CS_SEED) await db.qmsCsMaster.add({...r,createdAt:now});
}

// ── QMS HELPERS ──────────────────────────────────────────────────
function qmsStepTag(step){
  const i=QMS_STEPS.indexOf(step); const bg=QMS_STEP_COLORS[i]||'#eee'; const c=QMS_STEP_TEXT[i]||'#333';
  return`<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;background:${bg};color:${c}">${step.replace(/^\d+\.\s*/,'').substring(0,22)}</span>`;
}
function qmsRpnBadge(rpn){
  const[bg,c]=rpn>=200?['#C00000','#fff']:rpn>=100?['#E65C00','#fff']:rpn>=50?['#FFC000','#333']:['#dcfce7','#14532d'];
  return`<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-weight:800;font-size:11px;background:${bg};color:${c}">${rpn}</span>`;
}
function qmsScoreChip(v){
  v=+v; const[bg,c]=v>=8?['#C00000','#fff']:v>=6?['#E65C00','#fff']:v>=4?['#FFC000','#333']:['#dcfce7','#14532d'];
  return`<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:4px;font-weight:800;font-size:11px;background:${bg};color:${c}">${v}</span>`;
}
function qmsStatusBadge(s){
  const m={'Open':'background:#fee2e2;color:#7f1d1d','In Progress':'background:#fef3c7;color:#78350f','Completed':'background:#dcfce7;color:#14532d','N/A':'background:#e5e7eb;color:#374151'};
  return`<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;${m[s]||m['Open']}">${s||'Open'}</span>`;
}
function qmsFilterBtns(tbodyId){
  return`<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
    <span style="font-size:10px;font-weight:700;color:#6b7280">STEP:</span>
    <button style="padding:3px 9px;border-radius:12px;border:1.5px solid #0d2f6e;background:#0d2f6e;color:#fff;cursor:pointer;font-size:10.5px;font-weight:600;font-family:inherit" onclick="qmsFilterTable('${tbodyId}','All',this)">All</button>
    ${QMS_STEPS.map((s,i)=>`<button style="padding:3px 9px;border-radius:12px;border:1.5px solid #d4daf0;background:#fff;cursor:pointer;font-size:10.5px;font-weight:600;color:#6b7280;font-family:inherit" onclick="qmsFilterTable('${tbodyId}','${s}',this)" title="${s}">${i+1}</button>`).join('')}
  </div>`;
}
function qmsFilterTable(tbodyId,step,btn){
  btn.closest('div').querySelectorAll('button').forEach(b=>{b.style.background='#fff';b.style.color='#6b7280';b.style.borderColor='#d4daf0';});
  btn.style.background='#0d2f6e';btn.style.color='#fff';btn.style.borderColor='#0d2f6e';
  document.querySelectorAll(`#${tbodyId} tr`).forEach(tr=>{tr.style.display=(step==='All'||tr.dataset.step===step)?'':'none';});
}

// QMS EDIT STATE
let qmsEditId=null, qmsEditType=null;

// ── QMS MODAL (shared) ────────────────────────────────────────────
function qmsOpenModal(html,id,type){
  qmsEditId=id; qmsEditType=type;
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='qms-modal-ov';
  ov.innerHTML=`<div class="modal" style="width:860px;max-width:96vw;max-height:90vh;overflow-y:auto;padding:0">
    ${html}
  </div>`;
  ov.onclick=e=>{if(e.target===ov)qmsCloseModal();};
  document.body.appendChild(ov);
}
function qmsCloseModal(){document.getElementById('qms-modal-ov')?.remove();qmsEditId=null;qmsEditType=null;}

// ── QMS DASHBOARD ─────────────────────────────────────────────────
async function qmsRenderDashboard(){
  const pf=await db.qmsPfmea.toArray(),cp=await db.qmsCp.toArray(),cs=await db.qmsCsMaster.toArray(),rc=await db.qmsCsRecords.toArray().catch(()=>[]);
  const crit=pf.filter(r=>r.rpn>=200).length, high=pf.filter(r=>r.rpn>=100&&r.rpn<200).length;
  setC(`
  <div class="sg">
    <div class="sc"><div class="si" style="background:#fee2e2;color:#C00000;font-size:22px">⚠️</div><div><div class="sv" style="color:#C00000">${crit}</div><div class="sl2">Critical RPN ≥200</div></div></div>
    <div class="sc"><div class="si" style="background:#fef3c7;color:#E65C00;font-size:22px">🔶</div><div><div class="sv" style="color:#E65C00">${high}</div><div class="sl2">High RPN 100–199</div></div></div>
    <div class="sc"><div class="si" style="background:#edf1fb">📋</div><div><div class="sv">${cp.length}</div><div class="sl2">Control Points</div></div></div>
    <div class="sc"><div class="si" style="background:#dcfce7">✅</div><div><div class="sv" style="color:#16a34a">${rc.length}</div><div class="sl2">Inspections Logged</div></div></div>
  </div>
  <div style="display:grid;grid-template-columns:3fr 2fr;gap:14px">
    <div class="card">
      <div class="ch"><h5>⚠️ Top Risk — Highest RPN Items</h5></div>
      <div class="tw"><table>
        <thead><tr><th>Step</th><th>Failure Mode</th><th>S</th><th>O</th><th>D</th><th>RPN</th><th>Status</th></tr></thead>
        <tbody>${pf.sort((a,b)=>b.rpn-a.rpn).slice(0,10).map(r=>`<tr>
          <td>${qmsStepTag(r.step)}</td>
          <td style="font-size:12px;font-weight:500">${esc(r.mode)}</td>
          <td style="text-align:center">${qmsScoreChip(r.s)}</td>
          <td style="text-align:center">${qmsScoreChip(r.o)}</td>
          <td style="text-align:center">${qmsScoreChip(r.d)}</td>
          <td style="text-align:center">${qmsRpnBadge(r.rpn)}</td>
          <td>${qmsStatusBadge(r.status)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="ch"><h5>📊 Max RPN by Step</h5></div>
      <div class="cb" style="padding:12px">
        ${QMS_STEPS.map(step=>{
          const items=pf.filter(r=>r.step===step);
          const mx=items.length?Math.max(...items.map(r=>r.rpn)):0;
          const bc=mx>=200?'#C00000':mx>=100?'#E65C00':mx>=50?'#FFC000':'#16a34a';
          return`<div style="margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
              <span style="font-size:10px;font-weight:600;color:#374151">${step.replace(/^\d+\.\s*/,'').substring(0,26)}</span>
              <span style="font-size:10px;color:#9ca3af">max ${mx}</span>
            </div>
            <div style="background:#e5e7eb;border-radius:4px;height:7px">
              <div style="background:${bc};width:${Math.min(100,mx/10)}%;height:7px;border-radius:4px"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>📖 Module Guide</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:12px;color:#374151">
        <div><strong style="color:var(--navy)">PFMEA Register</strong><br>All failure modes ranked by RPN. Edit any row to update S, O, D scores. S×O×D auto-recalculates. S=9/10 always needs action regardless of RPN.</div>
        <div><strong style="color:var(--navy)">Control Plan</strong><br>Linked to PFMEA. Defines what to measure, how, sample size, frequency, and reaction plan if out of control. Print by process step.</div>
        <div><strong style="color:var(--navy)">Check Sheet</strong><br>Fill per shift digitally or print blank for manual use. ★ = critical — NG must be escalated immediately. All digital records stored with date/shift/operator.</div>
        <div><strong style="color:var(--navy)">RPN: S × O × D</strong><br>Severity × Occurrence × Detection. ≥200 = Critical (red). 100–199 = High (orange). 50–99 = Medium. &lt;50 = Low. Higher D = worse detection.</div>
        <div><strong style="color:var(--navy)">Print Control Plan</strong><br>Use the 🖨️ Print button on the Control Plan page. Select one process step or all. Opens print-ready tab — A4 landscape recommended.</div>
        <div><strong style="color:var(--navy)">Print Check Sheet</strong><br>Use 🖨️ Blank Sheet on Check Sheet page. Select one process step for workstation-level sheets. A4 portrait, sign-off block at bottom.</div>
      </div>
    </div>
  </div>`);
}

// ── QMS PFMEA LIST ────────────────────────────────────────────────
async function qmsRenderPFMEA(){
  const pf=await db.qmsPfmea.toArray();
  setC(`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    ${qmsFilterBtns('qms-pfmea-tbody')}
    <div style="display:flex;gap:7px;align-items:center">
      <div style="display:flex;gap:6px;font-size:11px;align-items:center">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#C00000"></span>Critical ≥200
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#E65C00"></span>High 100–199
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#FFC000"></span>Medium 50–99
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#dcfce7;border:1px solid #ccc"></span>Low
      </div>
      <button class="btn btn-o btn-sm" onclick="window.print()">🖨️ Print</button>
      <button class="btn btn-p btn-sm" onclick="qmsOpenPFMEAForm()">➕ Add</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>⚠️ PFMEA — ${pf.length} Failure Modes &nbsp;<span style="font-size:10px;color:#9ca3af;font-weight:400">VRA-PFMEA-001 · Rev 00 · Generic HPDC · ADC12</span></h5></div>
    <div class="tw"><table>
      <thead><tr>
        <th>#</th><th>Process Step</th><th>Process Function</th><th>Failure Mode</th><th>Effect</th>
        <th title="Severity" style="text-align:center">S</th><th>Root Cause</th>
        <th title="Occurrence" style="text-align:center">O</th><th>Prevention Control</th><th>Detection Control</th>
        <th title="Detection" style="text-align:center">D</th><th style="text-align:center">RPN</th>
        <th>Recommended Action</th><th>Status</th><th>Resp.</th><th></th>
      </tr></thead>
      <tbody id="qms-pfmea-tbody">
        ${pf.sort((a,b)=>b.rpn-a.rpn).map((r,i)=>`
        <tr data-step="${r.step}">
          <td style="text-align:center;color:#0d2f6e;font-weight:700">${i+1}</td>
          <td>${qmsStepTag(r.step)}</td>
          <td style="font-size:11px;color:#9ca3af;max-width:120px">${esc(r.func||'')}</td>
          <td style="font-weight:600;max-width:130px">${esc(r.mode)}</td>
          <td style="font-size:11px;max-width:120px">${esc(r.effect)}</td>
          <td style="text-align:center">${qmsScoreChip(r.s)}</td>
          <td style="font-size:11px;max-width:120px">${esc(r.cause)}</td>
          <td style="text-align:center">${qmsScoreChip(r.o)}</td>
          <td style="font-size:11px;max-width:100px">${esc(r.prev||'—')}</td>
          <td style="font-size:11px;max-width:100px">${esc(r.det||'—')}</td>
          <td style="text-align:center">${qmsScoreChip(r.d)}</td>
          <td style="text-align:center">${qmsRpnBadge(r.rpn)}</td>
          <td style="font-size:11px;max-width:140px">${esc(r.action||'—')}</td>
          <td>${qmsStatusBadge(r.status)}</td>
          <td style="font-size:11px;font-weight:600;color:#0d2f6e;white-space:nowrap">${esc(r.resp||'')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="qmsOpenPFMEAForm(${r.id})">✏️</button>
            <button class="btn btn-r btn-xs" onclick="qmsDeletePFMEA(${r.id})">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

function qmsOpenPFMEAForm(id=null){
  const title=id?'Edit Failure Mode':'Add Failure Mode';
  const html=`
  <div style="background:var(--navy-d);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:12px 12px 0 0">
    <span style="font-weight:700;font-size:14px">${title}</span>
    <button onclick="qmsCloseModal()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:26px;height:26px;border-radius:5px;cursor:pointer;font-size:16px">×</button>
  </div>
  <div style="padding:20px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Process Step *</label><select class="fc" id="qfm-step">${QMS_STEPS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
      <div class="fg" style="margin:0"><label class="lbl">Process Function / Requirement</label><input class="fc" id="qfm-func" placeholder="What this step must achieve"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Potential Failure Mode *</label><input class="fc" id="qfm-mode" placeholder="What can go wrong"></div>
      <div class="fg" style="margin:0"><label class="lbl">Potential Effect of Failure *</label><input class="fc" id="qfm-effect" placeholder="Impact on customer / next process"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Severity (S) 1–10 *</label>
        <select class="fc" id="qfm-s" onchange="qmsUpdateRPN()">
          ${[1,2,3,4,5,6,7,8,9,10].map(v=>`<option value="${v}">${v} — ${v>=9?'Safety risk':v>=7?'Major effect':v>=5?'Moderate':v>=3?'Minor':'Negligible'}</option>`).join('')}
        </select>
      </div>
      <div class="fg" style="margin:0"><label class="lbl">Potential Cause *</label><input class="fc" id="qfm-cause" placeholder="Root cause of this failure mode"></div>
      <div class="fg" style="margin:0"><label class="lbl">Occurrence (O) 1–10 *</label>
        <select class="fc" id="qfm-o" onchange="qmsUpdateRPN()">
          ${[1,2,3,4,5,6,7,8,9,10].map(v=>`<option value="${v}">${v} — ${v>=9?'Almost certain':v>=7?'Repeated':v>=5?'Occasional':v>=3?'Rare':'Near impossible'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Current Prevention Control</label><input class="fc" id="qfm-prev" placeholder="What currently prevents the cause"></div>
      <div class="fg" style="margin:0"><label class="lbl">Current Detection Control</label><input class="fc" id="qfm-det" placeholder="How we currently detect the failure"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Detection (D) 1–10 *</label>
        <select class="fc" id="qfm-d" onchange="qmsUpdateRPN()">
          ${[1,2,3,4,5,6,7,8,9,10].map(v=>`<option value="${v}">${v} — ${v>=9?'No detection possible':v>=7?'Visual only — unreliable':v>=5?'Manual gauging':v>=3?'SPC / CMM':'Poka-yoke / 100%'}</option>`).join('')}
        </select>
      </div>
      <div class="fg" style="margin:0"><label class="lbl">RPN (auto)</label>
        <input class="fc" id="qfm-rpn" readonly style="font-weight:800;font-size:15px;text-align:center;background:#f8f9fc">
      </div>
      <div class="fg" style="margin:0"><label class="lbl">Responsibility</label><input class="fc" id="qfm-resp" placeholder="Dept / Person"></div>
    </div>
    <div class="fg" style="margin-bottom:11px"><label class="lbl">Recommended Action</label><textarea class="fc" id="qfm-action" rows="2" placeholder="What should be done to reduce risk?"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
      <div class="fg" style="margin:0"><label class="lbl">Action Status</label>
        <select class="fc" id="qfm-status"><option>Open</option><option>In Progress</option><option>Completed</option><option>N/A</option></select>
      </div>
      <div class="fg" style="margin:0"><label class="lbl">Target Date</label><input class="fc" type="date" id="qfm-target"></div>
    </div>
  </div>
  <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
    <button class="btn btn-o" onclick="qmsCloseModal()">Cancel</button>
    <button class="btn btn-p" onclick="qmsSavePFMEA()">💾 Save</button>
  </div>`;
  qmsOpenModal(html, id, 'pfmea');
  if(id){
    db.qmsPfmea.get(id).then(r=>{
      document.getElementById('qfm-step').value=r.step||'';
      document.getElementById('qfm-func').value=r.func||'';
      document.getElementById('qfm-mode').value=r.mode||'';
      document.getElementById('qfm-effect').value=r.effect||'';
      document.getElementById('qfm-s').value=r.s||5;
      document.getElementById('qfm-cause').value=r.cause||'';
      document.getElementById('qfm-o').value=r.o||5;
      document.getElementById('qfm-prev').value=r.prev||'';
      document.getElementById('qfm-det').value=r.det||'';
      document.getElementById('qfm-d').value=r.d||5;
      document.getElementById('qfm-action').value=r.action||'';
      document.getElementById('qfm-resp').value=r.resp||'';
      document.getElementById('qfm-status').value=r.status||'Open';
      document.getElementById('qfm-target').value=r.target||'';
      qmsUpdateRPN();
    });
  } else {
    document.getElementById('qfm-s').value=5;
    document.getElementById('qfm-o').value=5;
    document.getElementById('qfm-d').value=5;
    qmsUpdateRPN();
  }
}

function qmsUpdateRPN(){
  const s=+document.getElementById('qfm-s')?.value||0;
  const o=+document.getElementById('qfm-o')?.value||0;
  const d=+document.getElementById('qfm-d')?.value||0;
  const rpn=s*o*d; const el=document.getElementById('qfm-rpn'); if(!el)return;
  el.value=rpn||'';
  el.style.color=rpn>=200?'#C00000':rpn>=100?'#E65C00':rpn>=50?'#b45309':'#14532d';
  el.style.background=rpn>=200?'#fee2e2':rpn>=100?'#fef3c7':rpn>=50?'#fefce8':'#f0fdf4';
}

async function qmsSavePFMEA(){
  const step=document.getElementById('qfm-step').value;
  const mode=document.getElementById('qfm-mode').value.trim();
  if(!step||!mode){toast('⚠️ Step and Failure Mode are required','w');return;}
  const s=+document.getElementById('qfm-s').value, o=+document.getElementById('qfm-o').value, d=+document.getElementById('qfm-d').value;
  const data={step,func:document.getElementById('qfm-func').value,mode,effect:document.getElementById('qfm-effect').value,s,cause:document.getElementById('qfm-cause').value,o,prev:document.getElementById('qfm-prev').value,det:document.getElementById('qfm-det').value,d,rpn:s*o*d,action:document.getElementById('qfm-action').value,resp:document.getElementById('qfm-resp').value,status:document.getElementById('qfm-status').value,target:document.getElementById('qfm-target').value,createdAt:new Date().toISOString()};
  if(qmsEditId) await db.qmsPfmea.update(qmsEditId,data); else await db.qmsPfmea.add(data);
  qmsCloseModal(); toast(qmsEditId?'✓ Updated':'✓ Saved'); qmsRenderPFMEA();
}

async function qmsDeletePFMEA(id){
  if(!confirm('Delete this failure mode?'))return;
  await db.qmsPfmea.delete(id); toast('Deleted','d'); qmsRenderPFMEA();
}

// ── QMS CONTROL PLAN ──────────────────────────────────────────────
async function qmsRenderCP(){
  const cp=await db.qmsCp.toArray();
  setC(`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    ${qmsFilterBtns('qms-cp-tbody')}
    <div style="display:flex;gap:7px">
      <button class="btn btn-o btn-sm" onclick="qmsPrintCP('All')">🖨️ Print All</button>
      ${QMS_STEPS.map((s,i)=>`<button class="btn btn-o btn-xs" onclick="qmsPrintCP('${s}')" title="${s}">🖨️ ${i+1}</button>`).join('')}
      <button class="btn btn-p btn-sm" onclick="qmsOpenCPForm()">➕ Add</button>
    </div>
  </div>
  <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:7px;padding:8px 12px;font-size:12px;color:#78350f;margin-bottom:12px">
    💡 Print buttons: 🖨️ Print All = full control plan. 🖨️ 1–8 = individual process step. Opens print-ready tab.
  </div>
  <div class="card">
    <div class="ch"><h5>📋 Control Plan — ${cp.length} Control Points &nbsp;<span style="font-size:10px;color:#9ca3af;font-weight:400">VRA-CP-001 · Rev 00 · Generic HPDC</span></h5></div>
    <div class="tw"><table>
      <thead><tr>
        <th>#</th><th>Process Step</th><th>Characteristic</th><th>Specification</th>
        <th>Tolerance</th><th>Control Method</th><th>Sample Size</th><th>Frequency</th>
        <th>Responsible</th><th>Reaction Plan</th><th>PFMEA Ref</th><th></th>
      </tr></thead>
      <tbody id="qms-cp-tbody">
        ${cp.map((r,i)=>`
        <tr data-step="${r.step}">
          <td style="text-align:center;color:#0d2f6e;font-weight:700">${i+1}</td>
          <td>${qmsStepTag(r.step)}</td>
          <td style="font-weight:600;max-width:130px">${esc(r.char)}</td>
          <td style="max-width:110px">${esc(r.spec)}</td>
          <td style="font-size:11px;text-align:center">${esc(r.tol||'—')}</td>
          <td style="font-size:11px;max-width:110px">${esc(r.method)}</td>
          <td style="text-align:center;font-weight:600;font-size:11px">${esc(r.sample)}</td>
          <td style="font-size:11px">${esc(r.freq)}</td>
          <td style="font-size:11px;font-weight:600;color:#0d2f6e">${esc(r.resp)}</td>
          <td style="font-size:11px;max-width:130px;color:${r.reaction&&(r.reaction.includes('NCR')||r.reaction.includes('Hold'))?'#C00000':'inherit'}">${esc(r.reaction)}</td>
          <td style="text-align:center;font-size:11px;color:#0d2f6e;font-weight:700">${esc(r.pfRef||'—')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="qmsOpenCPForm(${r.id})">✏️</button>
            <button class="btn btn-r btn-xs" onclick="qmsDeleteCP(${r.id})">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

function qmsOpenCPForm(id=null){
  const html=`
  <div style="background:var(--navy-d);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:12px 12px 0 0">
    <span style="font-weight:700;font-size:14px">${id?'Edit':'Add'} Control Point</span>
    <button onclick="qmsCloseModal()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:26px;height:26px;border-radius:5px;cursor:pointer;font-size:16px">×</button>
  </div>
  <div style="padding:20px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Process Step *</label><select class="fc" id="qcp-step">${QMS_STEPS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
      <div class="fg" style="margin:0"><label class="lbl">Characteristic to Control *</label><input class="fc" id="qcp-char" placeholder="e.g. Melt temperature, Flash on parting line"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Specification / Target *</label><input class="fc" id="qcp-spec" placeholder="e.g. 680–720°C"></div>
      <div class="fg" style="margin:0"><label class="lbl">Tolerance</label><input class="fc" id="qcp-tol" placeholder="e.g. ±10°C or Pass/Fail"></div>
      <div class="fg" style="margin:0"><label class="lbl">Control Method *</label><input class="fc" id="qcp-method" placeholder="e.g. Pyrometer, Visual, CMM"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;margin-bottom:11px">
      <div class="fg" style="margin:0"><label class="lbl">Sample Size *</label><input class="fc" id="qcp-sample" placeholder="e.g. 100%, 5/batch, 1st-off"></div>
      <div class="fg" style="margin:0"><label class="lbl">Frequency *</label><input class="fc" id="qcp-freq" placeholder="e.g. Each heat, Hourly"></div>
      <div class="fg" style="margin:0"><label class="lbl">Responsible *</label><input class="fc" id="qcp-resp" placeholder="e.g. Operator, QC"></div>
    </div>
    <div class="fg" style="margin-bottom:11px"><label class="lbl">Reaction Plan (Out-of-Control Action) *</label><textarea class="fc" id="qcp-reaction" rows="2" placeholder="What to do if out of spec — stop, quarantine, inform supervisor..."></textarea></div>
    <div class="fg" style="margin:0"><label class="lbl">PFMEA Reference (row numbers)</label><input class="fc" id="qcp-pfref" placeholder="e.g. 3,4"></div>
  </div>
  <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
    <button class="btn btn-o" onclick="qmsCloseModal()">Cancel</button>
    <button class="btn btn-p" onclick="qmsSaveCP()">💾 Save</button>
  </div>`;
  qmsOpenModal(html, id, 'cp');
  if(id){
    db.qmsCp.get(id).then(r=>{
      document.getElementById('qcp-step').value=r.step||'';
      document.getElementById('qcp-char').value=r.char||'';
      document.getElementById('qcp-spec').value=r.spec||'';
      document.getElementById('qcp-tol').value=r.tol||'';
      document.getElementById('qcp-method').value=r.method||'';
      document.getElementById('qcp-sample').value=r.sample||'';
      document.getElementById('qcp-freq').value=r.freq||'';
      document.getElementById('qcp-resp').value=r.resp||'';
      document.getElementById('qcp-reaction').value=r.reaction||'';
      document.getElementById('qcp-pfref').value=r.pfRef||'';
    });
  }
}

async function qmsSaveCP(){
  const step=document.getElementById('qcp-step').value;
  const char=document.getElementById('qcp-char').value.trim();
  if(!step||!char){toast('⚠️ Step and Characteristic are required','w');return;}
  const data={step,char,spec:document.getElementById('qcp-spec').value,tol:document.getElementById('qcp-tol').value,method:document.getElementById('qcp-method').value,sample:document.getElementById('qcp-sample').value,freq:document.getElementById('qcp-freq').value,resp:document.getElementById('qcp-resp').value,reaction:document.getElementById('qcp-reaction').value,pfRef:document.getElementById('qcp-pfref').value,createdAt:new Date().toISOString()};
  if(qmsEditId) await db.qmsCp.update(qmsEditId,data); else await db.qmsCp.add(data);
  qmsCloseModal(); toast(qmsEditId?'✓ Updated':'✓ Saved'); qmsRenderCP();
}

async function qmsDeleteCP(id){
  if(!confirm('Delete this control point?'))return;
  await db.qmsCp.delete(id); toast('Deleted','d'); qmsRenderCP();
}

async function qmsPrintCP(stepFilter){
  const cp=await db.qmsCp.toArray();
  const steps=stepFilter==='All'?QMS_STEPS:[stepFilter];
  const body=steps.map(step=>{
    const items=cp.filter(r=>r.step===step); if(!items.length) return '';
    return`<div style="margin-bottom:16px;page-break-inside:avoid">
      <div style="background:#0d2f6e;color:#fff;padding:7px 14px;font-weight:700;font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact">${step}</div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
        <thead><tr style="background:#e8eef8;-webkit-print-color-adjust:exact">
          <th style="padding:4px 6px;border:1px solid #ccc">#</th>
          <th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Characteristic</th>
          <th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Specification</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Tolerance</th>
          <th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Control Method</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Sample Size</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Frequency</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Responsible</th>
          <th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Reaction Plan</th>
        </tr></thead>
        <tbody>${items.map((r,i)=>`<tr style="${i%2===0?'':'background:#f8f9fc'}">
          <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-weight:700;color:#0d2f6e">${i+1}</td>
          <td style="padding:4px 6px;border:1px solid #ccc;font-weight:700">${r.char}</td>
          <td style="padding:4px 6px;border:1px solid #ccc">${r.spec}</td>
          <td style="padding:4px 6px;border:1px solid #ccc;text-align:center">${r.tol||'—'}</td>
          <td style="padding:4px 6px;border:1px solid #ccc">${r.method}</td>
          <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-weight:600">${r.sample}</td>
          <td style="padding:4px 6px;border:1px solid #ccc">${r.freq}</td>
          <td style="padding:4px 6px;border:1px solid #ccc;font-weight:600;color:#0d2f6e">${r.resp}</td>
          <td style="padding:4px 6px;border:1px solid #ccc;font-size:8pt">${r.reaction}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Control Plan</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:15px;font-size:9pt}@media print{body{margin:8mm}}</style></head><body>
  <div style="text-align:center;margin-bottom:12px;border-bottom:3px solid #0d2f6e;padding-bottom:8px">
    <div style="font-size:13pt;font-weight:800;color:#0d2f6e">V R ALUCAST — CONTROL PLAN</div>
    <div style="font-size:8.5pt;color:#555">VRA-CP-001 · Rev 00 · Generic HPDC · ADC12 · ${stepFilter==='All'?'All Process Steps':stepFilter}</div>
  </div>
  ${body}
  <div style="text-align:center;margin-top:10px;font-size:7.5pt;color:#888">V R Alucast · Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ── QMS CHECK SHEET ────────────────────────────────────────────────
async function qmsRenderCS(){
  const items=await db.qmsCsMaster.toArray();
  setC(`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    ${qmsFilterBtns('qms-cs-tbody')}
    <div style="display:flex;gap:7px">
      <button class="btn btn-o btn-sm" onclick="qmsPrintCS('All')">🖨️ Blank (All)</button>
      ${QMS_STEPS.map((s,i)=>`<button class="btn btn-o btn-xs" onclick="qmsPrintCS('${s}')" title="${s}">🖨️ ${i+1}</button>`).join('')}
      <button class="btn btn-g btn-sm" onclick="qmsOpenFillModal()">📝 Fill Check Sheet</button>
    </div>
  </div>
  <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:7px;padding:8px 12px;font-size:12px;color:#14532d;margin-bottom:12px">
    ★ = Critical check point — NG result requires immediate supervisor escalation and NCR. Use 📝 Fill to record digitally or 🖨️ to print blank for manual use.
  </div>
  <div class="card">
    <div class="ch"><h5>✅ Check Sheet Master — ${items.length} Check Points</h5></div>
    <div class="tw"><table>
      <thead><tr><th>#</th><th>★</th><th>Process Step</th><th>Check Point / Parameter</th><th>Method</th><th>Specification</th><th>Frequency</th></tr></thead>
      <tbody id="qms-cs-tbody">
        ${items.map((r,i)=>`<tr data-step="${r.step}">
          <td style="text-align:center;color:#0d2f6e;font-weight:700">${i+1}</td>
          <td style="text-align:center">${r.critical?'<span style="color:#C00000;font-weight:900;font-size:13px">★</span>':''}</td>
          <td>${qmsStepTag(r.step)}</td>
          <td style="font-weight:${r.critical?600:400}">${esc(r.checkPoint)}</td>
          <td style="font-size:11px;color:#9ca3af">${esc(r.method)}</td>
          <td style="font-size:11px">${esc(r.spec)}</td>
          <td style="font-size:11px">${esc(r.freq)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

function qmsOpenFillModal(){
  const stepOpts=QMS_STEPS.map(s=>`<option value="${s}">${s}</option>`).join('');
  const html=`
  <div style="background:var(--navy-d);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:12px 12px 0 0">
    <span style="font-weight:700;font-size:14px">📝 Fill In-Process Check Sheet</span>
    <button onclick="qmsCloseModal()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:26px;height:26px;border-radius:5px;cursor:pointer;font-size:16px">×</button>
  </div>
  <div style="padding:16px 20px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div class="fg" style="margin:0"><label class="lbl">Date</label><input class="fc" type="date" id="qcs-date"></div>
      <div class="fg" style="margin:0"><label class="lbl">Shift</label><select class="fc" id="qcs-shift"><option>Morning (A)</option><option>Afternoon (B)</option><option>Night (C)</option></select></div>
      <div class="fg" style="margin:0"><label class="lbl">Machine</label><select class="fc" id="qcs-machine"><option>280T</option><option>400T</option><option>Both</option></select></div>
      <div class="fg" style="margin:0"><label class="lbl">Part No.</label><input class="fc" id="qcs-partno" placeholder="Part number"></div>
      <div class="fg" style="margin:0"><label class="lbl">Job Card No.</label><input class="fc" id="qcs-jobcard" placeholder="JC-XXXX"></div>
      <div class="fg" style="margin:0"><label class="lbl">Operator</label><input class="fc" id="qcs-operator" placeholder="Operator name"></div>
      <div class="fg" style="margin:0" style="grid-column:span 2"><label class="lbl">Filter by Process</label>
        <select class="fc" id="qcs-filter" onchange="qmsRenderFillBody()"><option value="All">All Processes</option>${stepOpts}</select>
      </div>
    </div>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:7px 10px;font-size:11.5px;color:#78350f;margin-bottom:12px">
      ★ = Critical check point — NG on any critical item requires immediate escalation.
    </div>
    <div id="qcs-form-body"></div>
  </div>
  <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
    <button class="btn btn-o" onclick="qmsCloseModal()">Cancel</button>
    <button class="btn btn-g" onclick="qmsSaveCSRecord()">✅ Save Inspection Record</button>
  </div>`;
  qmsOpenModal(html, null, 'cs');
  document.getElementById('qcs-date').value=new Date().toISOString().split('T')[0];
  qmsRenderFillBody();
}

async function qmsRenderFillBody(){
  const filter=document.getElementById('qcs-filter')?.value||'All';
  const items=await db.qmsCsMaster.toArray();
  const filtered=filter==='All'?items:items.filter(r=>r.step===filter);
  const byStep={};
  filtered.forEach(r=>{if(!byStep[r.step])byStep[r.step]=[];byStep[r.step].push(r);});
  const el=document.getElementById('qcs-form-body'); if(!el) return;
  el.innerHTML=Object.entries(byStep).map(([step,checks])=>`
    <div style="margin-bottom:10px">
      <div style="background:#0d2f6e;color:#fff;padding:5px 12px;font-weight:700;font-size:11px;border-radius:5px 5px 0 0">${step}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#edf1fb">
          <th style="padding:4px 7px;border:1px solid var(--border);width:16px">★</th>
          <th style="padding:4px 7px;border:1px solid var(--border);text-align:left">Check Point</th>
          <th style="padding:4px 7px;border:1px solid var(--border)">Specification</th>
          <th style="padding:4px 7px;border:1px solid var(--border)">Method</th>
          <th style="padding:4px 7px;border:1px solid var(--border);width:80px">Result</th>
          <th style="padding:4px 7px;border:1px solid var(--border);text-align:left">Remarks</th>
        </tr></thead>
        <tbody>${checks.map(r=>`<tr style="${r.critical?'background:#fff5f5':''}">
          <td style="padding:4px 7px;border:1px solid var(--border);text-align:center;font-weight:900;color:#C00000;font-size:12px">${r.critical?'★':''}</td>
          <td style="padding:4px 7px;border:1px solid var(--border);font-weight:${r.critical?600:400}">${esc(r.checkPoint)}</td>
          <td style="padding:4px 7px;border:1px solid var(--border);text-align:center;color:#9ca3af">${esc(r.spec)}</td>
          <td style="padding:4px 7px;border:1px solid var(--border);text-align:center;color:#9ca3af">${esc(r.method)}</td>
          <td style="padding:4px 7px;border:1px solid var(--border);text-align:center">
            <select data-csid="${r.id}" class="qcs-result" style="font-size:11px;padding:2px 5px;border-radius:4px;border:1.5px solid var(--border);font-family:inherit" onchange="qmsHighlightResult(this)">
              <option value="">—</option><option value="OK">OK</option><option value="NG">NG</option><option value="N/A">N/A</option>
            </select>
          </td>
          <td style="padding:4px 7px;border:1px solid var(--border)">
            <input data-rmk="${r.id}" style="width:100%;border:none;outline:none;font-size:11px;font-family:inherit" placeholder="Actual value / notes">
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`).join('');
}

function qmsHighlightResult(sel){
  sel.style.background=sel.value==='OK'?'#dcfce7':sel.value==='NG'?'#fee2e2':'';
  sel.style.color=sel.value==='OK'?'#14532d':sel.value==='NG'?'#7f1d1d':'';
  sel.style.fontWeight=sel.value?'700':'400';
}

async function qmsSaveCSRecord(){
  const date=document.getElementById('qcs-date').value;
  const shift=document.getElementById('qcs-shift').value;
  if(!date||!shift){toast('⚠️ Date and Shift are required','w');return;}
  const results={}, remarks={};
  document.querySelectorAll('.qcs-result').forEach(s=>{results[s.dataset.csid]=s.value;});
  document.querySelectorAll('[data-rmk]').forEach(i=>{remarks[i.dataset.rmk]=i.value;});
  const ngCount=Object.values(results).filter(v=>v==='NG').length;
  await db.qmsCsRecords.add({date,shift,machine:document.getElementById('qcs-machine').value,partno:document.getElementById('qcs-partno').value,jobcard:document.getElementById('qcs-jobcard').value,operator:document.getElementById('qcs-operator').value,results,remarks,ngCount,createdAt:new Date().toISOString()});
  qmsCloseModal();
  toast(ngCount>0?`⚠️ Saved — ${ngCount} NG items found!`:'✓ Inspection record saved');
  qmsRenderHistory();
}

async function qmsPrintCS(stepFilter){
  const items=await db.qmsCsMaster.toArray();
  const steps=stepFilter==='All'?QMS_STEPS:[stepFilter];
  const body=steps.map(step=>{
    const checks=items.filter(r=>r.step===step); if(!checks.length) return '';
    return`<div style="margin-bottom:14px;page-break-inside:avoid">
      <div style="background:#0d2f6e;color:#fff;padding:6px 14px;font-weight:700;font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact">${step}</div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
        <thead><tr style="background:#e8eef8;-webkit-print-color-adjust:exact">
          <th style="padding:4px 6px;border:1px solid #ccc;width:16px">★</th>
          <th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Check Point / Parameter</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Method</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Specification</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Frequency</th>
          <th style="padding:4px 6px;border:1px solid #ccc;width:50px">Check 1</th>
          <th style="padding:4px 6px;border:1px solid #ccc;width:50px">Check 2</th>
          <th style="padding:4px 6px;border:1px solid #ccc;width:50px">Check 3</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Remarks / Actual Value</th>
        </tr></thead>
        <tbody>${checks.map((r,i)=>`<tr style="${r.critical?'background:#fff5f5;-webkit-print-color-adjust:exact':i%2===0?'':'background:#f9fbfd'}">
          <td style="padding:5px 6px;border:1px solid #ccc;text-align:center;font-weight:900;color:#C00000">${r.critical?'★':''}</td>
          <td style="padding:5px 6px;border:1px solid #ccc;font-weight:${r.critical?700:400}">${r.checkPoint}</td>
          <td style="padding:5px 6px;border:1px solid #ccc;text-align:center;color:#666">${r.method}</td>
          <td style="padding:5px 6px;border:1px solid #ccc;text-align:center">${r.spec}</td>
          <td style="padding:5px 6px;border:1px solid #ccc;text-align:center;color:#666">${r.freq}</td>
          <td style="padding:5px 6px;border:1px solid #ccc;height:22px"></td>
          <td style="padding:5px 6px;border:1px solid #ccc"></td>
          <td style="padding:5px 6px;border:1px solid #ccc"></td>
          <td style="padding:5px 6px;border:1px solid #ccc"></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Check Sheet</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:15px;font-size:9pt}@media print{body{margin:8mm}}</style></head><body>
  <div style="text-align:center;margin-bottom:8px;border-bottom:3px solid #0d2f6e;padding-bottom:6px">
    <div style="font-size:13pt;font-weight:800;color:#0d2f6e">V R ALUCAST — IN-PROCESS QUALITY CHECK SHEET</div>
    <div style="font-size:8.5pt;color:#555">${stepFilter==='All'?'All Process Steps':stepFilter} · ★ = Critical — NG requires immediate escalation</div>
  </div>
  <table style="width:100%;margin-bottom:10px;font-size:8.5pt;border-collapse:collapse"><tr>
    <td style="padding:4px 8px;border:1px solid #ccc"><strong>Date:</strong> _______________</td>
    <td style="padding:4px 8px;border:1px solid #ccc"><strong>Shift:</strong> A / B / C</td>
    <td style="padding:4px 8px;border:1px solid #ccc"><strong>Machine:</strong> ________</td>
    <td style="padding:4px 8px;border:1px solid #ccc"><strong>Part No:</strong> ________________</td>
    <td style="padding:4px 8px;border:1px solid #ccc"><strong>Job Card:</strong> _______________</td>
    <td style="padding:4px 8px;border:1px solid #ccc"><strong>Operator:</strong> ______________</td>
  </tr></table>
  ${body}
  <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:8.5pt">
    <div style="border:1px solid #ccc;padding:7px"><strong>Operator Signature:</strong><br><br>_________________________</div>
    <div style="border:1px solid #ccc;padding:7px"><strong>QC Inspector:</strong><br><br>_________________________</div>
    <div style="border:1px solid #ccc;padding:7px"><strong>Supervisor:</strong><br><br>_________________________</div>
  </div>
  <div style="text-align:center;margin-top:8px;font-size:7.5pt;color:#888">VRA-CS-001 · Rev 00 · Generic HPDC · V R Alucast Internal Use Only</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ── QMS INSPECTION HISTORY ─────────────────────────────────────────
async function qmsRenderHistory(){
  const recs=await db.qmsCsRecords.orderBy('createdAt').reverse().toArray().catch(()=>[]);
  setC(`
  <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
    <button class="btn btn-g btn-sm" onclick="qmsOpenFillModal()">📝 New Inspection</button>
  </div>
  <div class="card">
    <div class="ch"><h5>🗂️ Inspection Records — ${recs.length} total</h5></div>
    <div class="tw"><table>
      <thead><tr><th>#</th><th>Date</th><th>Shift</th><th>Machine</th><th>Part No.</th><th>Job Card</th><th>Operator</th><th>NG Items</th><th></th></tr></thead>
      <tbody>${recs.length===0?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">No records yet. Use 📝 New Inspection to start.</td></tr>`:
        recs.map((r,i)=>`<tr>
          <td style="text-align:center;color:#0d2f6e;font-weight:700">${i+1}</td>
          <td>${r.date}</td><td>${r.shift}</td><td><strong>${r.machine}</strong></td>
          <td>${r.partno||'—'}</td><td>${r.jobcard||'—'}</td><td>${r.operator||'—'}</td>
          <td style="text-align:center">${r.ngCount>0?`<span style="background:#fee2e2;color:#7f1d1d;padding:2px 8px;border-radius:10px;font-weight:700;font-size:11px">${r.ngCount} NG</span>`:'<span style="background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:10px;font-weight:700;font-size:11px">All OK</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="qmsViewRecord(${r.id})">👁️ View & Print</button>
            <button class="btn btn-r btn-xs" onclick="qmsDeleteRecord(${r.id})">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

async function qmsViewRecord(id){
  const rec=await db.qmsCsRecords.get(id);
  const items=await db.qmsCsMaster.toArray();
  const byStep={};items.forEach(r=>{if(!byStep[r.step])byStep[r.step]=[];byStep[r.step].push(r);});
  const body=Object.entries(byStep).map(([step,checks])=>`
    <div style="margin-bottom:12px;page-break-inside:avoid">
      <div style="background:#0d2f6e;color:#fff;padding:6px 14px;font-weight:700;font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact">${step}</div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
        <thead><tr style="background:#e8eef8;-webkit-print-color-adjust:exact">
          <th style="padding:4px 6px;border:1px solid #ccc;width:16px">★</th>
          <th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Check Point</th>
          <th style="padding:4px 6px;border:1px solid #ccc">Specification</th>
          <th style="padding:4px 6px;border:1px solid #ccc;width:50px">Result</th>
          <th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Remarks</th>
        </tr></thead>
        <tbody>${checks.map(r=>{
          const res=rec.results[r.id]||'—', rmk=rec.remarks[r.id]||'';
          const bg=res==='NG'?'#fee2e2;-webkit-print-color-adjust:exact':res==='OK'?'#dcfce7;-webkit-print-color-adjust:exact':'';
          return`<tr style="background:${bg}">
            <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-weight:900;color:#C00000">${r.critical?'★':''}</td>
            <td style="padding:4px 6px;border:1px solid #ccc;font-weight:${r.critical?700:400}">${r.checkPoint}</td>
            <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;color:#666">${r.spec}</td>
            <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-weight:700;color:${res==='NG'?'#7f1d1d':res==='OK'?'#14532d':'#666'}">${res}</td>
            <td style="padding:4px 6px;border:1px solid #ccc">${rmk}</td>
          </tr>`;}).join('')}</tbody>
      </table>
    </div>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Check Sheet Record</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:15px;font-size:9pt}@media print{body{margin:8mm}}</style></head><body>
  <div style="text-align:center;margin-bottom:10px;border-bottom:3px solid #0d2f6e;padding-bottom:6px">
    <div style="font-size:13pt;font-weight:800;color:#0d2f6e">V R ALUCAST — IN-PROCESS QUALITY CHECK SHEET</div>
    <div style="font-size:8.5pt;color:#555">Inspection Record · ${rec.date} · ${rec.shift}</div>
  </div>
  <table style="width:100%;margin-bottom:10px;font-size:8.5pt;border-collapse:collapse"><tr>
    <td style="padding:3px 8px;border:1px solid #ccc"><strong>Date:</strong> ${rec.date}</td>
    <td style="padding:3px 8px;border:1px solid #ccc"><strong>Shift:</strong> ${rec.shift}</td>
    <td style="padding:3px 8px;border:1px solid #ccc"><strong>Machine:</strong> ${rec.machine}</td>
    <td style="padding:3px 8px;border:1px solid #ccc"><strong>Part No:</strong> ${rec.partno||'—'}</td>
    <td style="padding:3px 8px;border:1px solid #ccc"><strong>Job Card:</strong> ${rec.jobcard||'—'}</td>
    <td style="padding:3px 8px;border:1px solid #ccc"><strong>Operator:</strong> ${rec.operator||'—'}</td>
  </tr></table>
  ${body}
  <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:8.5pt">
    <div style="border:1px solid #ccc;padding:8px"><strong>Operator Signature:</strong><br><br>_________________________<br>Name: ${rec.operator||''}</div>
    <div style="border:1px solid #ccc;padding:8px"><strong>QC Inspector:</strong><br><br>_________________________</div>
    <div style="border:1px solid #ccc;padding:8px"><strong>Supervisor:</strong><br><br>_________________________</div>
  </div>
  <div style="text-align:center;margin-top:8px;font-size:7.5pt;color:#888">VRA-CS-001 · Rev 00 · Confidential — V R Alucast Internal Use Only</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

async function qmsDeleteRecord(id){
  if(!confirm('Delete this inspection record?'))return;
  await db.qmsCsRecords.delete(id); toast('Deleted','d'); qmsRenderHistory();
}

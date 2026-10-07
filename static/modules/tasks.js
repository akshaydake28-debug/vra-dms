// VRA DMS — TASK MANAGER MODULE

// ══════════════════════════════════════════════════════
//  TASK MANAGER
//  Records live in the generic 'tasks' module (db.tasks).
//  Fields: taskNo, title, description, owner, deadline (YYYY-MM-DD),
//  status, priority, category, remarks, createdBy, createdAt,
//  updatedAt, completedAt, history[{at, by, text}]
// ══════════════════════════════════════════════════════

const TASK_STATUSES=['Open','In Progress','On Hold','Done','Cancelled'];
const TASK_CLOSED=['Done','Cancelled'];
const TASK_PRIORITIES=['High','Medium','Low'];
const TASK_CATEGORIES=['General','Production','Quality','Process Quality','Calibration','Purchasing','Marketing','HR & Training','Maintenance','Documents'];

// ── HELPERS ───────────────────────────────────────────
function taskToday(){return new Date().toISOString().slice(0,10)}
function taskIsOpen(t){return !TASK_CLOSED.includes(t.status||'Open')}
function taskDaysLeft(deadline){
  if(!deadline) return null;
  const today=new Date(taskToday()+'T00:00:00');
  return Math.round((new Date(deadline+'T00:00:00')-today)/(1000*60*60*24));
}
// Only the owner or the creator may change a task (the server enforces
// the same rule); everyone else gets a read-only view.
function taskCanEdit(t){const me=Auth.user?.name;return !!me&&(t.owner===me||t.createdBy===me)}
function taskIsOverdue(t){const d=taskDaysLeft(t.deadline);return taskIsOpen(t)&&d!==null&&d<0}
function taskStatusBadge(s){
  const m={'Open':'bd','In Progress':'bs','On Hold':'bp','Done':'ba','Cancelled':'br'};
  return `<span class="badge ${m[s]||'bd'}">${esc(s||'Open')}</span>`;
}
function taskPriorityBadge(p){
  const m={High:'br',Medium:'bp',Low:'bd'};
  return `<span class="badge ${m[p]||'bd'}">${esc(p||'Medium')}</span>`;
}
function taskDeadlineCell(t){
  if(!t.deadline) return '<span class="muted">—</span>';
  if(!taskIsOpen(t)) return `<span class="muted">${esc(t.deadline)}</span>`;
  const d=taskDaysLeft(t.deadline);
  if(d<0)  return `${esc(t.deadline)} <span class="badge br">Overdue ${-d}d</span>`;
  if(d===0)return `${esc(t.deadline)} <span class="badge bp">Due today</span>`;
  if(d<=7) return `${esc(t.deadline)} <span class="badge bp">${d}d left</span>`;
  return esc(t.deadline);
}
// Completion date, and for Done tasks whether it beat the deadline.
function taskCompletedCell(t){
  if(taskIsOpen(t)) return '<span class="muted">—</span>';
  const on=fmtD(t.completedAt||t.updatedAt);
  if(!on) return '<span class="muted">—</span>';
  if(t.status==='Cancelled') return `${esc(on)} <span class="badge bd">Cancelled</span>`;
  if(!t.deadline) return esc(on);
  const late=Math.round((new Date(on+'T00:00:00')-new Date(t.deadline+'T00:00:00'))/(1000*60*60*24));
  return late>0?`${esc(on)} <span class="badge br">Late ${late}d</span>`:`${esc(on)} <span class="badge ba">On time</span>`;
}
async function taskNextNo(){
  const all=await db.tasks.toArray().catch(()=>[]);
  const max=all.reduce((m,t)=>{const n=parseInt(String(t.taskNo||'').replace(/\D/g,''),10);return n>m?n:m},0);
  return `VRA-TSK-${String(max+1).padStart(4,'0')}`;
}
// Owner suggestions: app users + employee register, de-duplicated.
async function taskOwnerOptions(){
  const [users,emps]=await Promise.all([
    _api('GET','/api/auth/users').catch(()=>[]),
    db.hrEmployees.toArray().catch(()=>[]),
  ]);
  const names=new Set();
  users.forEach(u=>u.name&&names.add(u.name));
  emps.forEach(e=>e.name&&names.add(e.name));
  return [...names].sort((a,b)=>a.localeCompare(b));
}

// ── Overdue count (sidebar badge + dashboard banner) ──
async function taskGetOverdueCount(){
  try{return (await db.tasks.toArray()).filter(taskIsOverdue).length}catch(e){return 0}
}
async function updateTaskCount(){
  const n=await taskGetOverdueCount();
  const el=document.getElementById('taskcount');
  if(!el) return;
  el.style.display=n?'inline':'none'; if(n) el.textContent=n;
}

// ══════════════════════════════════════════════════════
//  TASK REGISTER
// ══════════════════════════════════════════════════════
window._taskFilter=window._taskFilter||{q:'',status:'all',owner:'',mine:false};

async function taskRenderList(){
  const all=await db.tasks.toArray().catch(()=>[]);
  const me=Auth.user?.name||'';
  const f=window._taskFilter;
  const open=all.filter(taskIsOpen);
  const stats={
    open:open.length,
    inProg:open.filter(t=>t.status==='In Progress').length,
    overdue:open.filter(taskIsOverdue).length,
    week:open.filter(t=>{const d=taskDaysLeft(t.deadline);return d!==null&&d>=0&&d<=7}).length,
    mine:open.filter(t=>t.owner===me).length,
    done:all.filter(t=>t.status==='Done').length,
  };
  const owners=[...new Set(all.map(t=>t.owner).filter(Boolean))].sort();

  let rows=all.filter(t=>{
    if(f.status==='active'&&!taskIsOpen(t)) return false;
    if(f.status==='overdue'&&!taskIsOverdue(t)) return false;
    if(f.status==='closed'&&taskIsOpen(t)) return false;
    if(!['active','overdue','closed','all'].includes(f.status)&&(t.status||'Open')!==f.status) return false;
    if(f.owner&&t.owner!==f.owner) return false;
    if(f.mine&&t.owner!==me) return false;
    if(f.q){
      const hay=[t.taskNo,t.title,t.description,t.owner,t.category,t.remarks].join(' ').toLowerCase();
      if(!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
  // Open tasks first by deadline (no deadline last) then priority;
  // completed/cancelled tasks after them, most recently closed first.
  const pr={High:0,Medium:1,Low:2};
  rows.sort((a,b)=>
    (taskIsOpen(b)-taskIsOpen(a)) ||
    (taskIsOpen(a)
      ? (a.deadline||'9999').localeCompare(b.deadline||'9999') || ((pr[a.priority]??1)-(pr[b.priority]??1))
      : (b.completedAt||b.updatedAt||'').localeCompare(a.completedAt||a.updatedAt||'')));

  const tile=(icon,bg,value,label,color,status)=>`
    <div class="sc" style="cursor:pointer" onclick="taskSetFilter('status','${status}')">
      <div class="si" style="background:${bg}">${icon}</div>
      <div><div class="sv" ${color?`style="color:${color}"`:''}>${value}</div><div class="sl2">${label}</div></div>
    </div>`;

  setC(`
  <div class="ph">
    <h2>✅ Task Manager</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="taskOpenForm()">+ New Task</button>
      <button class="btn btn-o" onclick="taskPrint()">🖨️ Print List</button>
    </div>
  </div>
  <div class="sg" style="grid-template-columns:repeat(6,1fr)">
    ${tile('📌','#edf1fb',stats.open,'Open Tasks','','active')}
    ${tile('⚙️','#ede9fe',stats.inProg,'In Progress','#4c1d95','In Progress')}
    ${tile('⏰','#fee2e2',stats.overdue,'Overdue',stats.overdue?'#dc2626':'','overdue')}
    ${tile('📅','#fef3c7',stats.week,'Due in 7 days',stats.week?'#d97706':'','active')}
    ${tile('✔️','#dcfce7',stats.done,'Completed','#16a34a','Done')}
    <div class="sc" style="cursor:pointer" onclick="taskSetFilter('mine',${!f.mine})">
      <div class="si" style="background:#dcfce7">👤</div>
      <div><div class="sv" style="color:#16a34a">${stats.mine}</div><div class="sl2">${f.mine?'Showing my tasks':'My open tasks'}</div></div>
    </div>
  </div>
  <div class="card">
    <div class="ch" style="gap:8px;flex-wrap:wrap">
      <h5>Tasks — ${rows.length} shown</h5>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <input class="fc" style="width:200px;padding:5px 9px" placeholder="🔍 Search…" value="${esc(f.q)}"
          oninput="window._taskFilter.q=this.value;clearTimeout(window._taskQT);window._taskQT=setTimeout(()=>taskRenderList().then(()=>{const i=document.querySelector('#content input.fc');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}),250)">
        <select class="fc" style="width:150px;padding:5px 9px" onchange="taskSetFilter('status',this.value)">
          ${[['all','All tasks'],['active','Open only'],['overdue','Overdue'],['closed','Completed / Cancelled'],...TASK_STATUSES.map(s=>[s,s])]
            .map(([v,l])=>`<option value="${esc(v)}" ${f.status===v?'selected':''}>${esc(l)}</option>`).join('')}
        </select>
        <select class="fc" style="width:160px;padding:5px 9px" onchange="taskSetFilter('owner',this.value)">
          <option value="">All owners</option>
          ${owners.map(o=>`<option value="${esc(o)}" ${f.owner===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" ${f.mine?'checked':''} onchange="taskSetFilter('mine',this.checked)"> Mine only</label>
      </div>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Task No.</th><th>Task</th><th>Category</th><th>Owner</th><th>Priority</th>
        <th>Deadline</th><th>Status</th><th>Completed On</th><th></th>
      </tr></thead>
      <tbody>${rows.length===0
        ?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">${all.length?'No tasks match these filters.':'No tasks yet. Click + New Task to add one.'}</td></tr>`
        :rows.map(t=>`<tr ${taskIsOverdue(t)?'style="background:#fff7f7"':!taskIsOpen(t)?'style="background:#f9fafb;color:#6b7280"':''}>
          <td class="mono" style="color:var(--navy);font-weight:700;white-space:nowrap">${esc(t.taskNo)}</td>
          <td style="max-width:340px"><strong>${esc(t.title)}</strong>
            ${t.description?`<div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.description)}</div>`:''}</td>
          <td>${esc(t.category||'—')}</td>
          <td style="white-space:nowrap">${esc(t.owner||'—')}</td>
          <td>${taskPriorityBadge(t.priority)}</td>
          <td style="white-space:nowrap">${taskDeadlineCell(t)}</td>
          <td>${taskCanEdit(t)?`
            <select class="fc" style="padding:3px 6px;font-size:11.5px;width:115px" onchange="taskQuickStatus(${t.id},this.value)">
              ${TASK_STATUSES.map(s=>`<option ${(t.status||'Open')===s?'selected':''}>${s}</option>`).join('')}
            </select>`:taskStatusBadge(t.status)}
          </td>
          <td style="white-space:nowrap">${taskCompletedCell(t)}</td>
          <td style="white-space:nowrap">
            ${taskCanEdit(t)?`<button class="btn btn-o btn-xs" onclick="taskOpenForm(${t.id})">✏️</button>
            <button class="btn btn-r btn-xs" onclick="taskDelete(${t.id})">🗑️</button>`
            :`<button class="btn btn-o btn-xs" title="View only — owner or creator can edit" onclick="taskOpenForm(${t.id})">👁️</button>`}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}

function taskSetFilter(key,val){
  window._taskFilter[key]=val;
  taskRenderList();
}

// ── Quick status change from the list ─────────────────
async function taskQuickStatus(id,status){
  const t=await db.tasks.get(id);
  if(!t||t.status===status) return;
  const ok=await db.tasks.update(id,taskApplyStatus(t,{status},[`Status: ${t.status||'Open'} → ${status}`]));
  if(!ok){toast('Only the task owner or creator can change its status','d');taskRenderList();return}
  toast(`${esc(t.taskNo)} → ${esc(status)}`);
  taskRenderList(); updateTaskCount();
}

// Stamps completedAt / updatedAt and appends history entries.
function taskApplyStatus(old,changes,notes){
  const now=new Date().toISOString();
  const out={...changes,updatedAt:now};
  const status=changes.status??old?.status;
  if(TASK_CLOSED.includes(status)&&!TASK_CLOSED.includes(old?.status)) out.completedAt=now;
  if(!TASK_CLOSED.includes(status)) out.completedAt='';
  const by=Auth.user?.name||'';
  out.history=[...(old?.history||[]),...notes.map(text=>({at:now,by,text}))];
  return out;
}

// ══════════════════════════════════════════════════════
//  ADD / EDIT FORM
// ══════════════════════════════════════════════════════
async function taskOpenForm(id=null){
  const t=id?await db.tasks.get(id):null;
  const [taskNo,owners]=await Promise.all([t?t.taskNo:taskNextNo(),taskOwnerOptions()]);
  const hist=(t?.history||[]).slice().reverse();
  const canEdit=!t||taskCanEdit(t);
  const ov=document.createElement('div');ov.className='overlay';ov.id='task-ov';
  ov.innerHTML=`<div class="modal" style="width:600px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${!t?'New Task':canEdit?'Edit Task':'View Task'} <span class="mono" style="color:var(--muted);font-weight:500">${esc(taskNo)}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('task-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg" style="grid-column:span 2"><label class="lbl">Task *</label>
        <input class="fc" id="tk-title" value="${esc(t?.title||'')}" placeholder="What needs to be done?"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Details</label>
        <textarea class="fc" id="tk-desc" rows="3" placeholder="Background, steps, acceptance criteria…">${esc(t?.description||'')}</textarea></div>
      <div class="fg"><label class="lbl">Owner *</label>
        <input class="fc" id="tk-owner" list="tk-owner-list" value="${esc(t?.owner||'')}" placeholder="Pick or type a name">
        <datalist id="tk-owner-list">${owners.map(o=>`<option value="${esc(o)}">`).join('')}</datalist></div>
      <div class="fg"><label class="lbl">Deadline *</label>
        <input class="fc" type="date" id="tk-deadline" value="${esc(t?.deadline||'')}"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="tk-status">${TASK_STATUSES.map(s=>`<option ${(t?.status||'Open')===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="fg"><label class="lbl">Priority</label>
        <select class="fc" id="tk-priority">${TASK_PRIORITIES.map(p=>`<option ${(t?.priority||'Medium')===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="fg"><label class="lbl">Category</label>
        <select class="fc" id="tk-category">${TASK_CATEGORIES.map(c=>`<option ${(t?.category||'General')===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="fg"><label class="lbl">Reference (optional)</label>
        <input class="fc" id="tk-ref" value="${esc(t?.reference||'')}" placeholder="e.g. CAPA-012, complaint no."></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Progress note${t?' (added to history)':''}</label>
        <input class="fc" id="tk-note" placeholder="e.g. Waiting for supplier reply"></div>
    </div>
    ${t?`<div class="dvdr"></div>
    <div class="muted" style="margin-bottom:6px">Created by ${esc(t.createdBy||'—')} on ${fmtD(t.createdAt)}${t.completedAt?` · Closed ${fmtD(t.completedAt)}`:''}</div>
    ${hist.length?`<div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:7px">
      ${hist.map(h=>`<div style="padding:5px 9px;border-bottom:1px solid var(--border);font-size:12px">
        <span class="muted">${esc((h.at||'').replace('T',' ').slice(0,16))} · ${esc(h.by||'')}</span><br>${esc(h.text)}</div>`).join('')}
    </div>`:''}`:''}
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      ${canEdit?`<button class="btn btn-o" onclick="document.getElementById('task-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="taskSave(${id||'null'},'${esc(taskNo)}')">💾 Save Task</button>`
      :`<span class="muted" style="margin-right:auto;align-self:center">🔒 Only ${t.owner&&t.owner===t.createdBy?`${esc(t.owner)} (owner &amp; creator)`:`${esc(t.owner||'the owner')} (owner) or ${esc(t.createdBy||'the creator')} (creator)`} can change this task.</span>
      <button class="btn btn-o" onclick="document.getElementById('task-ov').remove()">Close</button>`}
    </div>
  </div>`;
  document.body.appendChild(ov);
  if(!canEdit){ov.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);document.getElementById('tk-note').closest('.fg').style.display='none';return}
  document.getElementById('tk-title').focus();
}

async function taskSave(id,taskNo){
  const v=k=>document.getElementById(k).value.trim();
  const rec={
    title:v('tk-title'), description:v('tk-desc'), owner:v('tk-owner'),
    deadline:v('tk-deadline'), status:v('tk-status'), priority:v('tk-priority'),
    category:v('tk-category'), reference:v('tk-ref'),
  };
  if(!rec.title){toast('Task description is required','d');return}
  if(!rec.owner){toast('Owner is required','d');return}
  if(!rec.deadline){toast('Deadline is required','d');return}
  const note=v('tk-note');

  if(id){
    const old=await db.tasks.get(id);
    const notes=[];
    if((old.status||'Open')!==rec.status) notes.push(`Status: ${old.status||'Open'} → ${rec.status}`);
    if(old.owner!==rec.owner) notes.push(`Owner: ${old.owner||'—'} → ${rec.owner}`);
    if(old.deadline!==rec.deadline) notes.push(`Deadline: ${old.deadline||'—'} → ${rec.deadline}`);
    if(note) notes.push(note);
    const ok=await db.tasks.update(id,{...rec,...taskApplyStatus(old,rec,notes)});
    if(!ok){toast('Not saved — only the task owner or creator can change this task','d');return}
  }else{
    const now=new Date().toISOString();
    const by=Auth.user?.name||'';
    await db.tasks.add({...rec,...taskApplyStatus(null,rec,[]),taskNo,createdBy:by,createdAt:now,
      history:[{at:now,by,text:`Created and assigned to ${rec.owner}`},...(note?[{at:now,by,text:note}]:[])]});
  }
  document.getElementById('task-ov').remove();
  toast(`✅ ${esc(taskNo)} saved`);
  taskRenderList(); updateTaskCount();
}

async function taskDelete(id){
  const t=await db.tasks.get(id);
  if(!confirm(`Delete ${t?.taskNo} — ${t?.title}?`)) return;
  // Call the API directly: db.tasks.delete() hides a refused (403) delete.
  try{await _api('DELETE',`/api/tasks/${id}`)}
  catch(e){toast('Only the task owner or creator can delete this task','d');return}
  await db.tasks.delete(id); // already gone; this just clears the cached list
  toast('Deleted','d'); taskRenderList(); updateTaskCount();
}

// ── Print the currently filtered list ─────────────────
async function taskPrint(){
  const all=await db.tasks.toArray().catch(()=>[]);
  const rows=all.filter(taskIsOpen).sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999'));
  const w=window.open('','_blank');
  if(!w){toast('Allow pop-ups to print','d');return}
  w.document.write(`<html><head><title>Open Tasks</title><style>
    body{font-family:Arial,sans-serif;font-size:9pt;margin:12mm}
    h2{font-size:12pt;margin:0 0 4px}.sub{color:#555;font-size:8pt;margin-bottom:8px}
    table{width:100%;border-collapse:collapse}th{background:#ececec;border:1px solid #000;padding:4px;text-align:left}
    td{border:1px solid #bbb;padding:4px;vertical-align:top}.od{color:#b91c1c;font-weight:bold}
    @page{size:A4 landscape;margin:10mm}</style></head><body>
    <h2>V R ALUCAST — Open Task List</h2>
    <div class="sub">Printed ${new Date().toLocaleDateString('en-IN')} · ${rows.length} open task(s)</div>
    <table><thead><tr><th>#</th><th>Task No.</th><th>Task</th><th>Category</th><th>Owner</th><th>Priority</th><th>Deadline</th><th>Status</th></tr></thead><tbody>
    ${rows.map((t,i)=>`<tr><td>${i+1}</td><td>${esc(t.taskNo)}</td><td><b>${esc(t.title)}</b>${t.description?`<br>${esc(t.description)}`:''}</td>
      <td>${esc(t.category||'')}</td><td>${esc(t.owner||'')}</td><td>${esc(t.priority||'')}</td>
      <td class="${taskIsOverdue(t)?'od':''}">${esc(t.deadline||'')}${taskIsOverdue(t)?' (overdue)':''}</td><td>${esc(t.status||'Open')}</td></tr>`).join('')}
    </tbody></table></body></html>`);
  w.document.close(); w.focus(); w.print();
}

// VRA DMS — DOCUMENTS MODULE

// ══════════════════════════════════════════════════════
//  REGISTRY
// ══════════════════════════════════════════════════════
async function renderRegistry(p={}){
  const docs=await DB.listDocs({type:p.type||'',status:p.status||'',q:p.q||''});
  setC(`
  <div class="ph"><h2>Document Registry</h2><button class="btn btn-p" onclick="nav('create')">➕ New</button></div>
  <div class="card">
    <div class="cb" style="padding:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:2;min-width:160px"><label class="lbl">Search</label><input class="fc" id="rq" placeholder="Title or doc number…" value="${p.q||''}"></div>
        <div style="flex:1;min-width:120px"><label class="lbl">Type</label>
          <select class="fc" id="rt"><option value="">All Types</option>
            ${Object.entries(ALL_TYPES).map(([c,t])=>`<option value="${c}" ${p.type===c?'selected':''}>${c} — ${t.name}</option>`).join('')}
          </select></div>
        <div style="flex:1;min-width:100px"><label class="lbl">Status</label>
          <select class="fc" id="rs"><option value="">All</option>
            ${['ACTIVE','DRAFT','PENDING_APPROVAL','REJECTED','SUPERSEDED'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}
          </select></div>
        <button class="btn btn-p" onclick="doFilter()">Filter</button>
        <button class="btn btn-o" onclick="nav('registry')">Clear</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>${docs.length} document(s)</h5></div>
    <div class="tw"><table>
      <thead><tr><th>Number</th><th>Type</th><th>Title</th><th>Rev</th><th>Status</th><th>By</th><th>Date</th><th></th></tr></thead>
      <tbody>${docs.map(d=>`<tr>
        <td class="mono" style="color:#0d2f6e;font-weight:600">${d.docNumber}</td>
        <td>${tPill(d.docType)}</td><td style="font-weight:500">${esc(d.title)}</td>
        <td class="mono">${d.revision}</td><td>${sBadge(d.status)}</td>
        <td class="muted">${esc(d.createdBy||'')}</td><td class="muted">${fmtD(d.createdDate)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-o btn-xs" onclick="viewDoc(${d.id})">View</button>
          <button class="btn btn-xs btn-o" onclick="printDoc(${d.id})">🖨 Print</button>
        </td>
      </tr>`).join('')||`<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af">No documents found.</td></tr>`}
      </tbody>
    </table></div>
  </div>`);
}
function doFilter(){
  nav('registry',['q='+document.getElementById('rq').value,
    'type='+document.getElementById('rt').value,
    'status='+document.getElementById('rs').value].filter(p=>p.split('=')[1]).join('&'));
}


// ══════════════════════════════════════════════════════
//  RICH TEXT EDITOR
// ══════════════════════════════════════════════════════
const TEXT_COLORS = ['#000000','#333333','#666666','#999999','#cc0000','#e67c00','#f4c430','#1a73e8','#0f9d58','#9334e6','#795548','#ffffff'];
const CELL_COLORS = ['#ffffff','#f5f5f5','#e0e0e0','#bdbdbd','#e8f0fe','#fef9c3','#d9f7be','#ffe0e0','#f3e8ff','#fff3e0','#1a3c6e','#1a73e8','#0f9d58','#cc0000','#e67c00','#000000'];

function colorSwatches(colors, fn) {
  return `<div class="clr-swatches">${colors.map(c=>`<div class="clr-sw" style="background:${c}" onmousedown="event.preventDefault()" onclick="${fn}('${c}')" title="${c}"></div>`).join('')}</div>
  <input type="color" style="width:100%;height:26px;cursor:pointer;border:1px solid #ccc;border-radius:4px;margin-top:2px" onmousedown="event.preventDefault()" oninput="${fn}(this.value)">`;
}

function editorHTML(initialContent=''){
  return `
  <div class="editor-shell">
    <div class="toolbar">
      <select class="tb-select" onmousedown="event.preventDefault()" onchange="execFmt('formatBlock',this.value);this.value='p'">
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('bold')"><b>B</b></button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('italic')"><i>I</i></button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('underline')"><u>U</u></button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('insertOrderedList')">1. List</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('insertUnorderedList')">• List</button>
      <span class="tb-sep"></span>
      <div class="clr-wrap">
        <button class="tb-btn" onmousedown="event.preventDefault()" onclick="toggleClrPicker('tc-picker')" title="Text colour">
          <b id="tc-indicator" style="border-bottom:3px solid #000;padding-bottom:1px">A</b> ▾
        </button>
        <div id="tc-picker" class="clr-picker" style="display:none">
          <div style="font-size:10.5px;font-weight:600;color:#6b7280;margin-bottom:5px">Text Colour</div>
          ${colorSwatches(TEXT_COLORS,'applyTextColor')}
        </div>
      </div>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="insertTable()">⊞ Table</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="insertImage()">🖼 Image</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('insertHorizontalRule')">─ Line</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('removeFormat')" style="color:#888">✕ Clear</button>
    </div>

    <!-- TABLE TOOLBAR — shown automatically when cursor is inside a table -->
    <div class="toolbar tbl-tb" id="tbl-tb">
      <span style="font-size:11px;font-weight:700;color:#92400e;margin-right:5px">Table ›</span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddRow(false)" title="Add row below">↓ Add Row</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddRow(true)"  title="Add row above">↑ Add Row</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddCol(false)" title="Add column to right">→ Add Col</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddCol(true)"  title="Add column to left">← Add Col</button>
      <span class="tb-sep"></span>
      <button class="tb-btn danger" onmousedown="event.preventDefault()" onclick="tblDelRow()">✕ Row</button>
      <button class="tb-btn danger" onmousedown="event.preventDefault()" onclick="tblDelCol()">✕ Col</button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblToggleHeader()" title="Toggle current row between header (th) and data (td)">⇅ Header</button>
      <div class="clr-wrap">
        <button class="tb-btn" onmousedown="event.preventDefault()" onclick="toggleClrPicker('cc-picker')" title="Cell background colour">🎨 Cell BG ▾</button>
        <div id="cc-picker" class="clr-picker" style="display:none">
          <div style="font-size:10.5px;font-weight:600;color:#6b7280;margin-bottom:5px">Cell Background</div>
          ${colorSwatches(CELL_COLORS,'applyCellBg')}
        </div>
      </div>
    </div>

    <div id="doc-editor" contenteditable="true" spellcheck="true">${initialContent||'<p><br></p>'}</div>
  </div>`;
}

function execFmt(cmd, val){
  document.execCommand(cmd, false, val||null);
  document.getElementById('doc-editor')?.focus();
}

// ── Colour pickers ───────────────────────────────────
function toggleClrPicker(id){
  document.querySelectorAll('.clr-picker').forEach(p=>{ if(p.id!==id) p.style.display='none'; });
  const el=document.getElementById(id);
  if(el) el.style.display=el.style.display==='none'?'block':'none';
}
// Close pickers when clicking outside
document.addEventListener('mousedown', e=>{
  if(!e.target.closest('.clr-wrap')) document.querySelectorAll('.clr-picker').forEach(p=>p.style.display='none');
});

let _savedRange = null;
function saveRange(){
  const sel=window.getSelection();
  if(sel&&sel.rangeCount) _savedRange=sel.getRangeAt(0).cloneRange();
}
function restoreRange(){
  if(!_savedRange) return;
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(_savedRange);
}

function applyTextColor(color){
  restoreRange();
  document.execCommand('foreColor', false, color);
  const ind=document.getElementById('tc-indicator');
  if(ind) ind.style.borderBottomColor=color;
  document.getElementById('tc-picker').style.display='none';
  document.getElementById('doc-editor')?.focus();
}

function applyCellBg(color){
  const cell=getCell();
  if(cell){ cell.style.backgroundColor=color; }
  else { toast('Click inside a table cell first','w'); }
  document.getElementById('cc-picker').style.display='none';
  document.getElementById('doc-editor')?.focus();
}

// ── Table context helpers ────────────────────────────
function getCell(){
  const sel=window.getSelection(); if(!sel||!sel.rangeCount) return null;
  let n=sel.getRangeAt(0).startContainer;
  if(n.nodeType===3) n=n.parentNode;
  const ed=document.getElementById('doc-editor');
  while(n&&n!==ed){ if(n.tagName==='TD'||n.tagName==='TH') return n; n=n.parentNode; }
  return null;
}
function getTblCtx(){
  const sel=window.getSelection(); if(!sel||!sel.rangeCount) return null;
  let n=sel.getRangeAt(0).startContainer;
  if(n.nodeType===3) n=n.parentNode;
  const ed=document.getElementById('doc-editor');
  let cell=null,row=null,table=null,cur=n;
  while(cur&&cur!==ed){
    if(!cell&&(cur.tagName==='TD'||cur.tagName==='TH')) cell=cur;
    if(!row&&cur.tagName==='TR') row=cur;
    if(!table&&cur.tagName==='TABLE') table=cur;
    cur=cur.parentNode;
  }
  return cell?{cell,row,table}:null;
}

// Show/hide table toolbar on cursor change
document.addEventListener('selectionchange',()=>{
  const tb=document.getElementById('tbl-tb'); if(!tb) return;
  tb.style.display=getTblCtx()?'flex':'none';
});

// Save range when editor loses focus (so colour picker can restore it)
document.addEventListener('focusin', e=>{
  if(e.target.id==='doc-editor') return;
  if(e.target.closest('.clr-wrap')||e.target.closest('.toolbar')) saveRange();
});

// ── Prevent table structure deletion ────────────────
document.addEventListener('keydown', e=>{
  if(e.key!=='Backspace'&&e.key!=='Delete') return;
  const ed=document.getElementById('doc-editor');
  if(!ed||!ed.contains(document.activeElement)&&document.activeElement!==ed) return;
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount||sel.isCollapsed) return;
  const range=sel.getRangeAt(0);
  // Find cells at start and end of selection
  const cellOf=node=>{ let n=node.nodeType===3?node.parentNode:node;
    while(n&&n!==ed){if(n.tagName==='TD'||n.tagName==='TH')return n;n=n.parentNode;}return null; };
  const sc=cellOf(range.startContainer), ec=cellOf(range.endContainer);
  // Selection spans multiple cells → prevent structural deletion
  if(sc&&ec&&sc!==ec){
    e.preventDefault();
    // Clear only the start cell's content, collapse cursor there
    const r=document.createRange();
    r.selectNodeContents(sc); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('delete',false,null);
  }
});

// ── Table operations ─────────────────────────────────
function tblAddRow(above){
  const ctx=getTblCtx(); if(!ctx){toast('Click inside a table first','w');return}
  const {row}=ctx; const cols=row.cells.length;
  const nr=document.createElement('tr');
  for(let i=0;i<cols;i++){const td=document.createElement('td');td.innerHTML='&nbsp;';nr.appendChild(td);}
  above?row.parentNode.insertBefore(nr,row):row.insertAdjacentElement('afterend',nr);
}
function tblAddCol(left){
  const ctx=getTblCtx(); if(!ctx){toast('Click inside a table first','w');return}
  const {cell,table}=ctx; const ci=cell.cellIndex;
  Array.from(table.rows).forEach(r=>{
    if(ci>=r.cells.length) return;
    const ref=r.cells[ci];
    const nc=document.createElement(ref.tagName==='TH'?'th':'td'); nc.innerHTML='&nbsp;';
    left?r.insertBefore(nc,ref):ref.insertAdjacentElement('afterend',nc);
  });
}
function tblDelRow(){
  const ctx=getTblCtx(); if(!ctx) return;
  const {row,table}=ctx;
  if(table.rows.length<=1){toast('Cannot delete the only row','w');return}
  row.remove();
}
function tblDelCol(){
  const ctx=getTblCtx(); if(!ctx) return;
  const {cell,table}=ctx; const ci=cell.cellIndex;
  if(table.rows[0].cells.length<=1){toast('Cannot delete the only column','w');return}
  Array.from(table.rows).forEach(r=>{if(r.cells[ci])r.cells[ci].remove()});
}
function tblToggleHeader(){
  const ctx=getTblCtx(); if(!ctx) return;
  const {row}=ctx; const isH=row.cells[0]?.tagName==='TH';
  Array.from(row.cells).forEach(c=>{
    const nc=document.createElement(isH?'td':'th');
    nc.innerHTML=c.innerHTML; nc.style.cssText=c.style.cssText;
    c.parentNode.replaceChild(nc,c);
  });
}

function insertTable(){
  const rows=parseInt(prompt('Rows (including header):', '4'))||4;
  const cols=parseInt(prompt('Columns:', '3'))||3;
  if(rows<1||cols<1) return;
  let html='<table><tbody>';
  for(let r=0;r<rows;r++){
    html+='<tr>';
    for(let c=0;c<cols;c++) html+=r===0?`<th> </th>`:`<td> </td>`;
    html+='</tr>';
  }
  html+='</tbody></table><p><br></p>';
  document.execCommand('insertHTML',false,html);
  document.getElementById('doc-editor')?.focus();
}

function insertImage(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>document.execCommand('insertHTML',false,`<img src="${ev.target.result}" alt="${f.name}"><p><br></p>`);
    r.readAsDataURL(f);
  };
  inp.click();
}


function getEditorHTML(){
  const el=document.getElementById('doc-editor');
  return el ? el.innerHTML : '';
}
function setEditorHTML(html){
  const el=document.getElementById('doc-editor');
  if(el) el.innerHTML=html||'<p><br></p>';
}

// ══════════════════════════════════════════════════════
//  CREATE
// ══════════════════════════════════════════════════════
function renderCreate(p={}){
  const selType=p.type||'SOP';
  setC(`
  <div class="ph"><h2>➕ New Document</h2></div>
  <div style="display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:start">
    <div style="position:sticky;top:56px">
      <div class="card">
        <div class="ch"><h5>Details</h5></div>
        <div class="cb">
          <div class="fg"><label class="lbl">Type</label>
            <select class="fc" id="c-type">
              ${Object.entries(ALL_TYPES).map(([c,t])=>`<option value="${c}" ${c===selType?'selected':''}>${c} — ${t.name}</option>`).join('')}
            </select></div>
          <div class="fg"><label class="lbl">Title <span style="color:red">*</span></label>
            <input class="fc" id="c-title" placeholder="Document title…"></div>
          <div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Number auto-assigned on save</div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <button class="btn btn-p" style="width:100%" onclick="saveCreate()">💾 Save as Draft</button>
            <button class="btn btn-o" style="width:100%" onclick="nav('registry')">Cancel</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="cb" style="padding:11px;font-size:11.5px;color:#6b7280;line-height:1.7">
          <b style="color:#0d2f6e">Tips:</b><br>
          • Type or paste your content<br>
          • Use toolbar for formatting<br>
          • ✨ AI can write it for you<br>
          • Tables and images supported<br>
          • Shift+Enter = new line
        </div>
      </div>
    </div>
    <div>${editorHTML()}</div>
  </div>`);
  setChatVisible(true, selType);
}

async function saveCreate(){
  const title=document.getElementById('c-title').value.trim();
  const type=document.getElementById('c-type').value;
  const content=getEditorHTML();
  if(!title){toast('⚠️ Enter a document title','d');return}
  const u=Auth.user;
  const docNumber=await DB.nextNum(type);
  const docId=await DB.createDoc({docNumber,docType:type,title,revision:'A',status:'DRAFT',
    createdBy:u.name,createdDate:new Date().toISOString()});
  await DB.createVer({docId,revision:'A',content,changeSummary:'Initial creation',
    preparedBy:u.name,preparedDate:new Date().toISOString(),status:'DRAFT'});
  await DB.log({docId,docNumber,action:'CREATED',user:u.name,notes:`"${title}" created`});
  toast(`✅ ${docNumber} saved!`,'s');
  viewDoc(docId);
}

// ══════════════════════════════════════════════════════
//  VIEW
// ══════════════════════════════════════════════════════
async function viewDoc(id){
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('topbar-title').textContent='View Document';
  const doc=await DB.getDoc(id); if(!doc){toast('Not found','d');return}
  const ver=await DB.getVer(id,doc.revision);
  const allVers=await DB.getAllVers(id);
  const logs=await DB.getAudit(id);
  const u=Auth.user;
  const canEdit=doc.status==='DRAFT'||doc.status==='REJECTED';
  const canSubmit=canEdit;
  const canApprove=u.role==='APPROVER'&&doc.status==='PENDING_APPROVAL';
  const canNewRev=u.role==='APPROVER'&&doc.status==='ACTIVE';
  const canRename=u.role==='APPROVER';

  setC(`
  <div class="ph">
    <div>
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
        ${tPill(doc.docType)} ${sBadge(doc.status)}
        <span class="mono" style="color:#0d2f6e;font-weight:700">${doc.docNumber}</span>
        <span style="color:#9ca3af">Rev ${doc.revision}</span>
      </div>
      <h2 style="font-size:15px">${esc(doc.title)}</h2>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${canNewRev?`<button class="btn btn-o btn-sm" onclick="doNewRev(${id})">🔄 New Revision</button>`:''}
      ${canEdit?`<button class="btn btn-o btn-sm" onclick="editDoc(${id})">✏️ Edit</button>`:''}
      ${canRename&&!canEdit?`<button class="btn btn-o btn-sm" onclick="renameDoc(${id})">✏️ Rename Title</button>`:''}
      ${canSubmit?`<button class="btn btn-w btn-sm" onclick="doSubmit(${id})">📤 Submit</button>`:''}
      ${canApprove?`<button class="btn btn-g btn-sm" onclick="showApproveM(${id})">✓ Approve</button>
        <button class="btn btn-r btn-sm" onclick="showRejectM(${id})">✗ Reject</button>`:''}
      <button class="btn btn-p btn-sm" onclick="printDoc(${id})">🖨 Print / PDF</button>
      <button class="btn btn-sm" style="background:#f0fdf4;color:#166534;border:1px solid #86efac" onclick="showTranslatePicker(${id})">🌐 Translate</button>
    </div>
  </div>

  <!-- Translation panel (hidden by default) -->
  <div id="translate-panel-${id}" style="display:none;margin-bottom:14px">
    <div class="card" style="border:2px solid #86efac">
      <div class="ch" style="background:#f0fdf4">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:15px">🌐</span>
          <h5 id="translate-lang-label-${id}" style="color:#166534">Translated Version</h5>
        </div>
        <div style="display:flex;gap:7px">
          <button class="btn btn-sm" style="background:#166534;color:#fff" onclick="printTranslated(${id})">🖨 Print Translated</button>
          <button class="btn btn-o btn-sm" onclick="document.getElementById('translate-panel-${id}').style.display='none'">✕ Close</button>
        </div>
      </div>
      <div id="translate-status-${id}" style="padding:14px 20px;font-size:13px;color:#6b7280;display:none">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:18px;height:18px;border:2px solid #16a34a;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></div>
          <span id="translate-progress-${id}">Translating…</span>
        </div>
      </div>
      <div class="cb" id="translate-content-${id}" style="padding:20px 24px;font-size:13.5px;line-height:1.85;min-height:100px"></div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 260px;gap:14px;align-items:start">
    <div>
      ${doc.status==='REJECTED'&&ver?.approvalNotes?`<div class="alert al-d">✗ Rejected: ${esc(ver.approvalNotes)}</div>`:''}
      <div class="card">
        <div class="cb" style="padding:0">
          <div style="padding:20px 24px;font-size:13.5px;line-height:1.7;min-height:200px">
            ${ver?.content||'<p style="color:#9ca3af">No content yet.</p>'}
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="card">
        <div class="ch"><h5>Info</h5></div>
        <div class="cb" style="padding:11px">
          ${[['Type',typeName(doc.docType)],['Prepared by',ver?.preparedBy||doc.createdBy||''],
            ['Date',fmtD(doc.createdDate)],
            ...(ver?.approvedBy?[['Approved by',ver.approvedBy],['Approval date',fmtD(ver.approvalDate)]]:[])
          ].map(([l,v])=>`<div style="padding:5px 0;border-bottom:1px solid #f0f3f9">
            <div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px">${l}</div>
            <div style="font-size:12.5px;font-weight:600;margin-top:1px">${esc(String(v))}</div>
          </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="ch"><h5>Revisions</h5></div>
        <div class="cb" style="padding:8px">
          ${allVers.map(v=>`<div style="padding:6px 7px;background:${v.revision===doc.revision?'#edf1fb':'#f9fafc'};border-radius:6px;margin-bottom:3px;border:1px solid ${v.revision===doc.revision?'#c5d0f0':'#e5e7eb'}">
            <div style="display:flex;justify-content:space-between"><span class="mono" style="font-weight:700;color:#0d2f6e">Rev ${v.revision}</span>${sBadge(v.status)}</div>
            <div class="muted">${fmtD(v.preparedDate)} · ${esc(v.preparedBy||'')}</div>
            ${v.changeSummary?`<div style="font-size:11px;color:#374151">${esc(v.changeSummary)}</div>`:''}
          </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="ch"><h5>Activity</h5></div>
        <div class="cb" style="padding:8px;max-height:240px;overflow-y:auto">
          ${logs.map(l=>`<div style="padding:4px 0;border-bottom:1px solid #f0f3f9">
            <div style="font-size:10.5px;background:#f0f3f9;padding:1px 6px;border-radius:4px;display:inline-block;font-weight:600;color:#0d2f6e">${l.action.replace(/_/g,' ')}</div>
            <div style="font-size:11px;color:#374151;margin-top:1px">${esc(l.user)} · ${fmtD(l.timestamp)}</div>
            ${l.notes?`<div style="font-size:10.5px;color:#6b7280">${esc(l.notes)}</div>`:''}
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`);
}

async function doSubmit(id){
  const doc=await DB.getDoc(id);
  await DB.updateDoc(id,{status:'PENDING_APPROVAL'});
  const ver=await DB.getVer(id,doc.revision);
  if(ver) await DB.updateVer(ver.id,{status:'PENDING_APPROVAL'});
  await DB.log({docId:id,docNumber:doc.docNumber,action:'SUBMITTED_FOR_APPROVAL',user:Auth.user.name});
  toast('📤 Submitted for approval','s'); viewDoc(id); updatePcount();
}

async function doNewRev(id){
  const doc=await DB.getDoc(id);
  const cr=doc.revision;
  const nr=cr.length===1&&cr!=='Z'?String.fromCharCode(cr.charCodeAt(0)+1):(cr==='Z'?'AA':cr.slice(0,-1)+String.fromCharCode(cr.charCodeAt(cr.length-1)+1));
  const ov=await DB.getVer(id,cr);
  await DB.createVer({docId:id,revision:nr,content:ov?.content||'',changeSummary:'New revision — in progress',preparedBy:Auth.user.name,preparedDate:new Date().toISOString(),status:'DRAFT'});
  await DB.updateDoc(id,{revision:nr,status:'DRAFT'});
  await DB.log({docId:id,docNumber:doc.docNumber,action:'NEW_REVISION_STARTED',user:Auth.user.name,notes:`Rev ${nr}`});
  toast(`Rev ${nr} created`,'s'); editDoc(id);
}

// ══════════════════════════════════════════════════════
//  EDIT
// ══════════════════════════════════════════════════════
async function editDoc(id){
  document.querySelectorAll('.sl-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('topbar-title').textContent='Edit Document';
  const doc=await DB.getDoc(id);
  const ver=await DB.getVer(id,doc.revision);
  setC(`
  <div class="ph">
    <h2>✏️ ${esc(doc.docNumber)} Rev ${doc.revision}</h2>
    <button class="btn btn-o" onclick="viewDoc(${id})">← Cancel</button>
  </div>
  <div style="display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:start">
    <div style="position:sticky;top:56px">
      <div class="card">
        <div class="ch"><h5>Details</h5></div>
        <div class="cb">
          <div class="fg"><label class="lbl">Type</label>
            <input class="fc" value="${esc(typeName(doc.docType))} (${doc.docType})" disabled style="background:#f5f7fd;color:#9ca3af"></div>
          <div class="fg"><label class="lbl">Title</label>
            <input class="fc" id="e-title" value="${esc(doc.title)}"></div>
          <div class="fg"><label class="lbl">Change Summary <span style="color:red">*</span></label>
            <input class="fc" id="e-summary" placeholder="What changed?"></div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <button class="btn btn-p" style="width:100%" onclick="saveEdit(${id})">💾 Save</button>
            <button class="btn btn-o" style="width:100%" onclick="viewDoc(${id})">Cancel</button>
          </div>
        </div>
      </div>
    </div>
    <div>${editorHTML(ver?.content||'')}</div>
  </div>`);
  setChatVisible(true, doc.docType);
}

async function saveEdit(id){
  const title=document.getElementById('e-title').value.trim();
  const summary=document.getElementById('e-summary').value.trim();
  if(!title||!summary){toast('⚠️ Title and change summary required','d');return}
  const content=getEditorHTML();
  const doc=await DB.getDoc(id);
  await DB.updateDoc(id,{title});
  const ver=await DB.getVer(id,doc.revision);
  if(ver) await DB.updateVer(ver.id,{content,changeSummary:summary,preparedBy:Auth.user.name,preparedDate:new Date().toISOString()});
  await DB.log({docId:id,docNumber:doc.docNumber,action:'EDITED',user:Auth.user.name,notes:summary});
  toast('✅ Saved!','s'); viewDoc(id);
}

// ── RENAME TITLE (APPROVER only, any status, no revision needed) ──
async function renameDoc(id){
  const doc=await DB.getDoc(id);
  const ov=document.createElement('div');ov.className='overlay';ov.id='rename-ov';
  ov.innerHTML=`<div class="modal" style="width:440px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>✏️ Rename Document Title</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('rename-ov').remove()">✕</button>
    </div>
    <div class="muted" style="margin-bottom:10px;font-size:12px">
      Doc No: <strong class="mono">${esc(doc.docNumber)}</strong> · Rev ${doc.revision} · ${doc.status}<br>
      The document number and revision are unchanged. This action is logged to the audit trail.
    </div>
    <div class="fg"><label class="lbl">Current Title</label>
      <input class="fc" value="${esc(doc.title)}" disabled style="background:#f5f7fd;color:#9ca3af"></div>
    <div class="fg"><label class="lbl">New Title *</label>
      <input class="fc" id="rename-title" value="${esc(doc.title)}" placeholder="Enter new title"></div>
    <div class="fg"><label class="lbl">Reason for rename *</label>
      <input class="fc" id="rename-reason" placeholder="e.g. Corrected document name, scope clarification"></div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('rename-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="saveRename(${id})">💾 Save Title</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  setTimeout(()=>document.getElementById('rename-title')?.focus(),100);
}

async function saveRename(id){
  const newTitle=document.getElementById('rename-title').value.trim();
  const reason=document.getElementById('rename-reason').value.trim();
  if(!newTitle){toast('New title is required','d');return;}
  if(!reason){toast('Reason for rename is required','d');return;}
  const doc=await DB.getDoc(id);
  if(newTitle===doc.title){toast('Title is unchanged','w');return;}
  const oldTitle=doc.title;
  await DB.updateDoc(id,{title:newTitle});
  await DB.log({docId:id,docNumber:doc.docNumber,action:'TITLE_CHANGED',user:Auth.user.name,
    notes:`Title changed from "${oldTitle}" to "${newTitle}" — Reason: ${reason}`});
  document.getElementById('rename-ov').remove();
  toast(`✅ Title updated`);
  viewDoc(id);
}
async function renderApprovals(){
  const pending=await DB.listDocs({status:'PENDING_APPROVAL'});
  setC(`
  <div class="ph"><h2>✅ Pending Approvals</h2><span class="badge bp" style="font-size:12px;padding:4px 10px">${pending.length} pending</span></div>
  ${!pending.length?`<div class="card"><div class="cb" style="text-align:center;padding:36px;color:#9ca3af"><div style="font-size:28px;margin-bottom:7px">✅</div><div style="font-weight:600">All caught up!</div></div></div>`:
  pending.map(d=>`<div class="card">
    <div class="ch">
      <div style="display:flex;align-items:center;gap:8px">
        ${tPill(d.docType)}
        <span class="mono" style="font-weight:700;color:#0d2f6e">${d.docNumber}</span>
        <span style="font-weight:500">${esc(d.title)}</span>
        <span class="muted">Rev ${d.revision}</span>
      </div>
      <button class="btn btn-o btn-sm" onclick="viewDoc(${d.id})">👁 Preview</button>
    </div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="muted">By: <b>${esc(d.createdBy||'')}</b> on ${fmtD(d.createdDate)}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:7px">
            <input class="fc" id="an-${d.id}" placeholder="Approval notes (optional)…" style="flex:1">
            <button class="btn btn-g" onclick="doApprove(${d.id})">✓ Approve</button>
          </div>
          <div style="display:flex;gap:7px">
            <input class="fc" id="rn-${d.id}" placeholder="Rejection reason (required)…" style="flex:1">
            <button class="btn btn-r" onclick="doReject(${d.id})">✗ Reject</button>
          </div>
        </div>
      </div>
    </div>
  </div>`).join('')}`);
}

function showApproveM(id){
  const m=document.createElement('div');m.className='overlay';m.id='am';
  m.innerHTML=`<div class="modal"><h3>✓ Approve Document</h3>
    <div class="fg"><label class="lbl">Notes (optional)</label><textarea class="fc" id="am-notes" rows="3"></textarea></div>
    <div style="display:flex;gap:7px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('am').remove()">Cancel</button>
      <button class="btn btn-g" onclick="doApproveV(${id})">✓ Approve</button>
    </div></div>`;
  document.body.appendChild(m);
}
async function doApproveV(id){
  const notes=document.getElementById('am-notes').value;
  document.getElementById('am').remove();
  await _approve(id,notes); viewDoc(id);
}

function showRejectM(id){
  const m=document.createElement('div');m.className='overlay';m.id='rm';
  m.innerHTML=`<div class="modal"><h3>✗ Reject Document</h3>
    <div class="fg"><label class="lbl">Reason <span style="color:red">*</span></label><textarea class="fc" id="rm-notes" rows="3" required></textarea></div>
    <div style="display:flex;gap:7px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('rm').remove()">Cancel</button>
      <button class="btn btn-r" onclick="doRejectV(${id})">✗ Reject</button>
    </div></div>`;
  document.body.appendChild(m);
}
async function doRejectV(id){
  const reason=document.getElementById('rm-notes').value.trim();
  if(!reason){toast('Enter rejection reason','d');return}
  document.getElementById('rm').remove();
  await _reject(id,reason); viewDoc(id);
}

async function doApprove(id){await _approve(id,document.getElementById(`an-${id}`).value);renderApprovals();updatePcount()}
async function doReject(id){
  const r=document.getElementById(`rn-${id}`).value.trim();
  if(!r){toast('Enter rejection reason','d');return}
  await _reject(id,r);renderApprovals();updatePcount();
}
async function _approve(id,notes=''){
  const doc=await DB.getDoc(id);
  const allV=await DB.getAllVers(id);
  for(const v of allV) if(v.status==='ACTIVE') await DB.updateVer(v.id,{status:'SUPERSEDED'});
  await DB.updateDoc(id,{status:'ACTIVE'});
  const ver=await DB.getVer(id,doc.revision);
  if(ver) await DB.updateVer(ver.id,{status:'ACTIVE',approvedBy:Auth.user.name,approvalDate:new Date().toISOString(),approvalNotes:notes});
  await DB.log({docId:id,docNumber:doc.docNumber,action:'APPROVED',user:Auth.user.name,notes});
  toast(`✅ ${doc.docNumber} approved!`,'s'); updatePcount();
}
async function _reject(id,reason){
  const doc=await DB.getDoc(id);
  await DB.updateDoc(id,{status:'REJECTED'});
  const ver=await DB.getVer(id,doc.revision);
  if(ver) await DB.updateVer(ver.id,{status:'REJECTED',approvalNotes:reason});
  await DB.log({docId:id,docNumber:doc.docNumber,action:'REJECTED',user:Auth.user.name,notes:reason});
  toast('Document rejected.','w');
}

// ══════════════════════════════════════════════════════
//  AUDIT
// ══════════════════════════════════════════════════════
async function renderAudit(){
  const logs=await DB.getAudit(null);
  const colors={CREATED:'#dcfce7',EDITED:'#fef3c7',SUBMITTED_FOR_APPROVAL:'#dbeafe',APPROVED:'#dcfce7',REJECTED:'#fee2e2',NEW_REVISION_STARTED:'#ede9fe',TITLE_CHANGED:'#fef3c7'};
  setC(`
  <div class="ph"><h2>🔍 Audit Trail</h2><span class="muted">Last ${logs.length} actions</span></div>
  <div class="card"><div class="tw"><table>
    <thead><tr><th>#</th><th>Time</th><th>Document</th><th>Action</th><th>User</th><th>Notes</th></tr></thead>
    <tbody>${logs.map(l=>`<tr>
      <td class="mono muted">${l.id}</td>
      <td class="mono" style="font-size:11px">${fmtD(l.timestamp)}</td>
      <td><a style="color:#0d2f6e;font-weight:600;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11.5px" onclick="viewDoc(${l.docId})">${esc(l.docNumber||'')}</a></td>
      <td><span style="background:${colors[l.action]||'#f3f4f6'};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600">${l.action.replace(/_/g,' ')}</span></td>
      <td style="font-weight:500">${esc(l.user)}</td>
      <td class="muted">${esc(l.notes||'—')}</td>
    </tr>`).join('')}
    </tbody>
  </table></div></div>`);
}


// ══════════════════════════════════════════════════════
//  SETTINGS  (Custom Doc Types + other app settings)
// ══════════════════════════════════════════════════════
async function renderSettings(){
  const custom = await DB.getCustomTypes();
  setC(`
  <div class="ph"><h2>⚙️ Settings</h2></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">

    <!-- Custom Doc Types -->
    <div>
      <div class="card">
        <div class="ch"><h5>📋 Document Types</h5></div>
        <div class="cb">
          <p style="font-size:12px;color:#6b7280;margin-bottom:12px">Add your own document types. They appear alongside the built-in ones everywhere in the app.</p>
          <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:14px">
            <div class="fg"><label class="lbl">Type Code <span style="color:red">*</span></label>
              <input class="fc" id="ct-code" placeholder="e.g. MPN, WPS, ITP" maxlength="6"
                style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"></div>
            <div class="fg"><label class="lbl">Type Name <span style="color:red">*</span></label>
              <input class="fc" id="ct-name" placeholder="e.g. Manufacturing Process Note"></div>
            <div class="fg"><label class="lbl">Colour</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="color" id="ct-color" value="#607d8b" style="width:50px;height:34px;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:2px">
                <span style="font-size:12px;color:#6b7280">Used for pills and quick-create buttons</span>
              </div>
            </div>
            <button class="btn btn-p" onclick="addCustomType()">➕ Add Type</button>
          </div>
          <div class="dvdr"></div>
          <div style="font-size:11.5px;font-weight:600;color:#0d2f6e;margin-bottom:8px">Custom Types</div>
          ${custom.length ? custom.map(t=>`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#f8f9fb;border-radius:7px;margin-bottom:5px;border:1px solid #e5e7eb">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="tp" style="background:${t.color||'#607d8b'}">${t.code}</span>
              <span style="font-size:13px;font-weight:500">${esc(t.name)}</span>
            </div>
            <button class="btn btn-xs" style="color:#dc3545;background:#fee2e2;border:none" onclick="deleteCustomType(${t.id})">✕ Remove</button>
          </div>`).join('') : `<p class="muted" style="text-align:center;padding:12px">No custom types yet.</p>`}
          <div class="dvdr"></div>
          <div style="font-size:11.5px;font-weight:600;color:#0d2f6e;margin-bottom:8px">Built-in Types</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${Object.entries(DOC_TYPES).map(([code,name])=>`<span title="${name}" class="tp" style="background:${TYPE_COLORS[code]||'#888'}">${code}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- App preferences (future expansion) -->
    <div>
      <div class="card">
        <div class="ch"><h5>ℹ️ About</h5></div>
        <div class="cb" style="font-size:12.5px;line-height:1.9;color:#374151">
          <b>V R ALUCAST DMS</b><br>
          Version 2.0 — Browser-based<br>
          Storage: IndexedDB (local, this browser)<br>
          <div class="dvdr"></div>
          <b>Document types:</b> ${Object.keys(ALL_TYPES).length} total
          (${Object.keys(DOC_TYPES).length} built-in + ${custom.length} custom)<br>
          <div class="dvdr"></div>
          <div class="alert al-w" style="font-size:12px;margin-top:4px">
            💡 Custom types are general-purpose — they use a single rich-text editor (same as all other types).
          </div>
        </div>
      </div>
    </div>
  </div>`);
}

async function addCustomType(){
  const code = document.getElementById('ct-code').value.trim().toUpperCase();
  const name = document.getElementById('ct-name').value.trim();
  const color = document.getElementById('ct-color').value;
  if(!code || !name){ toast('Code and name are required','d'); return; }
  if(!/^[A-Z0-9]{1,6}$/.test(code)){ toast('Code must be 1–6 letters/numbers, uppercase','d'); return; }
  if(ALL_TYPES[code]){ toast(`Code "${code}" already exists as a document type`,'d'); return; }
  await DB.addCustomType({code, name, color});
  await loadAllTypes();
  toast(`✅ Type "${code} — ${name}" added!`,'s');
  renderSettings();
}

async function deleteCustomType(id){
  if(!confirm('Remove this custom type? Existing documents using it are not affected.')) return;
  await DB.deleteCustomType(id);
  await loadAllTypes();
  toast('Custom type removed','w');
  renderSettings();
}

// ══════════════════════════════════════════════════════
//  DOCUMENT TYPES MANAGEMENT
// ══════════════════════════════════════════════════════
async function renderDocTypes() {
  const custom = await DB.getCustomTypes();
  setC(`
  <div class="ph"><h2>📂 Document Types</h2></div>
  <div style="display:grid;grid-template-columns:1fr 340px;gap:14px;align-items:start">

    <div>
      <!-- Built-in types -->
      <div class="card" style="margin-bottom:14px">
        <div class="ch"><h5>Built-in Types (${Object.keys(DOC_TYPES).length})</h5></div>
        <div class="tw"><table>
          <thead><tr><th>Code</th><th>Name</th><th>Example Number</th></tr></thead>
          <tbody>${Object.entries(DOC_TYPES).map(([code,name])=>`<tr>
            <td>${tPill(code)}</td>
            <td>${esc(name)}</td>
            <td class="mono muted">VRA-${code}-001</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>

      <!-- Custom types -->
      <div class="card">
        <div class="ch">
          <h5>Custom Types (${custom.length})</h5>
          <span class="muted" style="font-size:11.5px">Your added types</span>
        </div>
        ${custom.length ? `<div class="tw"><table>
          <thead><tr><th>Code</th><th>Name</th><th>Example Number</th><th></th></tr></thead>
          <tbody>${custom.map(t=>`<tr>
            <td><span class="tp" style="background:${t.color||'#607d8b'}">${esc(t.code)}</span></td>
            <td style="font-weight:500">${esc(t.name)}</td>
            <td class="mono muted">VRA-${esc(t.code)}-001</td>
            <td><button class="btn btn-xs" style="color:#dc3545;background:#fee2e2;border:none;cursor:pointer" onclick="deleteCustomType(${t.id})">✕ Remove</button></td>
          </tr>`).join('')}</tbody>
        </table></div>` :
        `<div class="cb" style="text-align:center;padding:24px;color:#9ca3af">
          No custom types yet. Add one using the form →
        </div>`}
      </div>
    </div>

    <!-- Add type form -->
    <div class="card" style="position:sticky;top:56px">
      <div class="ch"><h5>➕ Add New Type</h5></div>
      <div class="cb">
        <div class="fg">
          <label class="lbl">Type Code <span style="color:red">*</span></label>
          <input class="fc" id="ct-code" placeholder="e.g. ITP, QAF, MSP" maxlength="6"
            style="text-transform:uppercase;font-family:'IBM Plex Mono',monospace;font-weight:600;letter-spacing:1px"
            oninput="this.value=this.value.toUpperCase()">
          <div class="muted" style="margin-top:3px">1–6 uppercase letters/numbers, no spaces</div>
        </div>
        <div class="fg">
          <label class="lbl">Type Name <span style="color:red">*</span></label>
          <input class="fc" id="ct-name" placeholder="e.g. Inspection Test Plan">
        </div>
        <div class="fg">
          <label class="lbl">Colour</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="ct-color" value="#607d8b"
              style="width:40px;height:34px;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:2px">
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${['#1a73e8','#34a853','#fa7b17','#9334e6','#c5221f','#188038','#1967d2','#607d8b','#795548','#006064'].map(c=>
                `<div style="width:22px;height:22px;background:${c};border-radius:4px;cursor:pointer;border:2px solid transparent"
                  onclick="document.getElementById('ct-color').value='${c}'" title="${c}"></div>`
              ).join('')}
            </div>
          </div>
        </div>
        <button class="btn btn-p" style="width:100%;padding:9px" onclick="addCustomType()">➕ Add Document Type</button>
        <div class="alert al-w" style="margin-top:12px;font-size:12px;flex-direction:column;align-items:flex-start">
          <b>How it works:</b><br>
          Documents of your new type are numbered VRA-[CODE]-001, 002…<br>
          They use the same rich-text editor — paste or type any content, tables, images.
        </div>
      </div>
    </div>

  </div>`);
}

// addCustomType and deleteCustomType already defined in renderSettings section
// ══════════════════════════════════════════════════════
async function renderBackup(){
  const [docs,vers,audit,users]=[await db.documents.toArray(),await db.versions.toArray(),await db.audit.toArray(),await db.users.toArray()];
  const last=localStorage.getItem('vra_last_backup')||'Never';
  const autoEnabled = await DB.getSetting('autoBackupEnabled');
  const autoInterval = await DB.getSetting('autoBackupInterval') || 1;
  const handleRec = await DB.getDirHandle('backup');
  const folderName = handleRec?.name || null;
  const lastAuto = await DB.getSetting('lastAutoBackup');
  const fsSupported = 'showDirectoryPicker' in window;

  setC(`
  <div class="ph"><h2>💾 Backup & Restore</h2></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">

    <!-- Manual Export -->
    <div class="card">
      <div class="ch"><h5>📤 Manual Backup</h5></div>
      <div class="cb">
        <div class="alert al-s" style="flex-direction:column;align-items:flex-start">
          <b>Current data:</b>
          <span>${docs.length} documents · ${vers.length} versions · ${audit.length} audit entries · ${users.length} users</span>
        </div>
        <div class="muted" style="margin-bottom:12px">Last manual backup: <b>${last}</b></div>
        <div class="alert al-w" style="font-size:12px">💡 Always take a manual backup before updating the software.</div>
        <button class="btn btn-p" style="width:100%;margin-top:10px;padding:9px" onclick="doExport()">⬇️ Download Backup (.json)</button>
      </div>
    </div>

    <!-- Import -->
    <div class="card">
      <div class="ch"><h5>📥 Import & Restore</h5></div>
      <div class="cb">
        <div class="alert al-d" style="font-size:12px;flex-direction:column;align-items:flex-start"><b>Note:</b> Import merges backup data. Existing documents are not overwritten.</div>
        <div style="border:2px dashed var(--border);border-radius:8px;padding:18px;text-align:center;margin:10px 0;cursor:pointer"
             onclick="document.getElementById('bk-file').click()"
             ondragover="event.preventDefault();this.style.borderColor='#0d2f6e'"
             ondragleave="this.style.borderColor='var(--border)'"
             ondrop="handleDrop(event)">
          <div style="font-size:20px;margin-bottom:4px">📂</div>
          <div style="font-size:13px;font-weight:600;color:#0d2f6e">Click or drag backup file here</div>
          <div class="muted" style="margin-top:2px">.json backup file</div>
        </div>
        <input type="file" id="bk-file" accept=".json" style="display:none" onchange="handleFileSelect(event)">
        <div id="import-preview" style="display:none;margin-bottom:10px"></div>
        <button class="btn btn-g" id="import-btn" style="width:100%;display:none" onclick="doImport()">📥 Import Data</button>
      </div>
    </div>
  </div>

  <!-- Auto Backup -->
  <div class="card">
    <div class="ch"><h5>🔄 Auto Backup ${autoEnabled?'<span class="badge ba" style="margin-left:6px">ON</span>':'<span class="badge bd" style="margin-left:6px">OFF</span>'}</h5></div>
    <div class="cb">
      ${!fsSupported ? `<div class="alert al-d">⚠️ Auto-backup requires Chrome or Edge browser. Not supported in this browser.</div>` : `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:13px;font-weight:600;color:#0d2f6e;margin-bottom:8px">Backup Folder</div>
          ${folderName
            ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:7px;padding:10px 13px;margin-bottom:10px">
                <div style="font-size:12px;color:#14532d">📁 <b>${esc(folderName)}</b></div>
                <div style="font-size:11px;color:#166534;margin-top:2px">Folder selected ✓</div>
               </div>`
            : `<div class="alert al-w" style="font-size:12px">No folder selected yet.</div>`}
          <button class="btn btn-o" style="width:100%;margin-bottom:8px" onclick="chooseBkFolder()">
            📁 ${folderName?'Change':'Choose'} Backup Folder
          </button>
          ${folderName?`<button class="btn btn-xs" style="color:#dc3545;background:#fee2e2;border:none;width:100%" onclick="clearBkFolder()">✕ Clear Folder</button>`:''}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;color:#0d2f6e;margin-bottom:8px">Schedule</div>
          <div class="fg"><label class="lbl">Save every</label>
            <select class="fc" id="ab-interval" onchange="saveAutoSettings()">
              ${[1,2,5,10,15,30].map(m=>`<option value="${m}" ${autoInterval==m?'selected':''}>${m} minute${m>1?'s':''}</option>`).join('')}
            </select></div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;font-weight:500">
              <input type="checkbox" id="ab-enabled" ${autoEnabled?'checked':''} onchange="saveAutoSettings()"
                style="width:16px;height:16px;accent-color:#0d2f6e" ${!folderName?'disabled':''}>
              Enable auto-backup
            </label>
          </div>
          <div style="margin-top:12px;font-size:12px;color:#6b7280">
            Last auto-backup:<br>
            <b id="last-auto-backup">${lastAuto?new Date(lastAuto).toLocaleString('en-IN'):'Never'}</b>
          </div>
        </div>
      </div>
      <div class="alert al-w" style="font-size:12px;margin-top:12px">
        💡 Backup files are saved as <b>VRA_DMS_Backup_YYYYMMDD.json</b> in the selected folder. One file per day — overwrites itself during the day.
        ${!folderName?'<br><b>Select a folder first to enable auto-backup.</b>':''}
      </div>`}
    </div>
  </div>`);
}

// ── Auto-backup logic ────────────────────────────────
let _abTimer = null;

async function chooseBkFolder(){
  if(!('showDirectoryPicker' in window)){ toast('Not supported in this browser','d'); return; }
  try {
    const handle = await window.showDirectoryPicker({mode:'readwrite'});
    await DB.setDirHandle('backup', handle, handle.name);
    toast(`✅ Folder "${handle.name}" set for auto-backup`,'s');
    renderBackup();
  } catch(e) {
    if(e.name !== 'AbortError') toast('Could not access folder: '+e.message,'d');
  }
}

async function clearBkFolder(){
  await DB.clearDirHandle('backup');
  await DB.setSetting('autoBackupEnabled', false);
  stopAutoBackup();
  renderBackup();
}

async function saveAutoSettings(){
  const enabled = document.getElementById('ab-enabled')?.checked || false;
  const interval = parseInt(document.getElementById('ab-interval')?.value) || 1;
  await DB.setSetting('autoBackupEnabled', enabled);
  await DB.setSetting('autoBackupInterval', interval);
  stopAutoBackup();
  if(enabled) startAutoBackup();
  toast(enabled ? `✅ Auto-backup enabled every ${interval} min` : 'Auto-backup disabled', enabled?'s':'w');
}

function stopAutoBackup(){
  if(_abTimer){ clearInterval(_abTimer); _abTimer = null; }
}

async function startAutoBackup(){
  stopAutoBackup();
  const enabled = await DB.getSetting('autoBackupEnabled');
  if(!enabled) return;
  const interval = await DB.getSetting('autoBackupInterval') || 1;
  const handleRec = await DB.getDirHandle('backup');
  if(!handleRec) return;
  // Run immediately once, then on interval
  doAutoBackup();
  _abTimer = setInterval(doAutoBackup, interval * 60 * 1000);
}

async function doAutoBackup(){
  try {
    const handleRec = await DB.getDirHandle('backup');
    if(!handleRec) return;
    const dirHandle = handleRec.handle;
    // Verify/request permission
    const perm = await dirHandle.requestPermission({mode:'readwrite'});
    if(perm !== 'granted'){ console.warn('Auto-backup: permission denied'); return; }
    // Build backup data
    const data = {
      exportedAt: new Date().toISOString(),
      exportedBy: 'Auto-backup',
      appVersion: '2.0',
      company: COMPANY,
      documents:     await db.documents.toArray(),
      versions:      await db.versions.toArray(),
      audit:         await db.audit.toArray(),
      users:         await db.users.toArray(),
      customDocTypes:await db.customDocTypes.toArray().catch(()=>[]),
    };
    // One file per day (overwrites throughout the day)
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const fileName = `VRA_DMS_Backup_${dateStr}.json`;
    const fileHandle = await dirHandle.getFileHandle(fileName, {create:true});
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    // Update last backup time
    const ts = new Date().toISOString();
    await DB.setSetting('lastAutoBackup', ts);
    // Update UI if on backup page
    const el = document.getElementById('last-auto-backup');
    if(el) el.textContent = new Date(ts).toLocaleString('en-IN');
    console.log('Auto-backup saved:', fileName);
  } catch(e) {
    console.warn('Auto-backup failed:', e.message);
  }
}

// ══════════════════════════════════════════════════════
//  TRANSLATION  (Hindi & Marathi via MyMemory free API)
// ══════════════════════════════════════════════════════
const LANG_OPTIONS = {
  'mr': { name:'Marathi', label:'मराठी', flag:'🇮🇳' },
  'hi': { name:'Hindi',   label:'हिंदी',  flag:'🇮🇳' },
};

// Store last translated content for printing
const _translatedCache = {};

function showTranslatePicker(id) {
  // Show inline language picker
  const panel = document.getElementById(`translate-panel-${id}`);
  const content = document.getElementById(`translate-content-${id}`);
  panel.style.display = 'block';
  content.innerHTML = `
    <div style="text-align:center;padding:12px 0">
      <p style="font-size:13px;color:#374151;margin-bottom:14px">
        Choose language to translate document content:
      </p>
      <div style="display:flex;gap:12px;justify-content:center">
        <button class="btn btn-p" style="padding:10px 24px;font-size:13.5px" onclick="startTranslation(${id},'mr')">
          🇮🇳 मराठी (Marathi)
        </button>
        <button class="btn btn-p" style="padding:10px 24px;font-size:13.5px" onclick="startTranslation(${id},'hi')">
          🇮🇳 हिंदी (Hindi)
        </button>
      </div>
      <p style="font-size:11px;color:#9ca3af;margin-top:12px">
        Powered by MyMemory free translation · Technical terms may remain in English
      </p>
    </div>`;
  panel.scrollIntoView({behavior:'smooth', block:'nearest'});
}

async function startTranslation(docId, langCode) {
  const lang = LANG_OPTIONS[langCode];
  const panel   = document.getElementById(`translate-panel-${docId}`);
  const status  = document.getElementById(`translate-status-${docId}`);
  const content = document.getElementById(`translate-content-${docId}`);
  const label   = document.getElementById(`translate-lang-label-${docId}`);

  label.textContent = `${lang.flag} Translated — ${lang.name} (${lang.label})`;
  content.innerHTML = '';
  status.style.display = 'block';

  try {
    const doc = await DB.getDoc(docId);
    const ver = await DB.getVer(docId, doc.revision);
    const html = ver?.content || '';

    if (!html.trim()) {
      status.style.display = 'none';
      content.innerHTML = '<p style="color:#9ca3af;text-align:center">No content to translate.</p>';
      return;
    }

    const progressEl = document.getElementById(`translate-progress-${docId}`);
    const translated = await translateHTMLContent(html, langCode, (done, total) => {
      progressEl.textContent = `Translating… ${done} of ${total} sections`;
    });

    // Cache for printing
    _translatedCache[docId] = { html: translated, langCode, langName: lang.name, langLabel: lang.label };

    status.style.display = 'none';
    content.innerHTML = translated;

    // Add divider and note
    content.insertAdjacentHTML('afterbegin',
      `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;padding:8px 12px;margin-bottom:14px;font-size:12px;color:#166534">
        ✅ Translated to ${lang.name} (${lang.label}) · Review technical terms before shop floor use
      </div>`);

  } catch(err) {
    status.style.display = 'none';
    content.innerHTML = `<div class="alert al-d">
      ⚠️ Translation failed: ${esc(err.message)}<br>
      <span style="font-size:12px">Check your internet connection and try again.</span>
    </div>`;
    console.error('Translation error:', err);
  }
}

// Walk the HTML, translate each block element's text
async function translateHTMLContent(htmlContent, langCode, onProgress) {
  const div = document.createElement('div');
  div.innerHTML = htmlContent;

  // Collect leaf-level block elements (headings, paragraphs, list items, table cells)
  const blockTags = new Set(['P','H1','H2','H3','H4','LI','TD','TH','BLOCKQUOTE']);
  const elements = [];

  function collect(node) {
    if (blockTags.has(node.tagName)) {
      // Only collect if it doesn't contain other block elements (leaf blocks)
      const hasBlockChild = Array.from(node.children).some(c => blockTags.has(c.tagName));
      if (!hasBlockChild) {
        const text = node.textContent.trim();
        if (text.length > 1) { elements.push(node); return; }
      }
    }
    for (const child of node.children) collect(child);
  }
  collect(div);

  const total = elements.length;
  if (total === 0) return htmlContent;

  // Translate each element
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const text = el.textContent.trim();
    if (!text) continue;
    try {
      const result = await myMemoryTranslate(text, langCode);
      el.textContent = result;
    } catch(e) {
      // Keep original text if translation fails for this element
    }
    if (onProgress) onProgress(i + 1, total);
    // Small delay to avoid rate limiting
    if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 300));
  }

  return div.innerHTML;
}

// MyMemory free translation API — no key needed, CORS friendly
async function myMemoryTranslate(text, langCode) {
  // Split long texts into chunks (MyMemory works best under 1000 chars)
  if (text.length <= 1000) {
    return await _myMemoryCall(text, langCode);
  }
  // Split at sentence boundaries for longer text
  const sentences = text.match(/[^।.!?\n]+[।.!?\n]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > 900) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  const results = await Promise.all(chunks.map(c => _myMemoryCall(c, langCode)));
  return results.join(' ');
}

async function _myMemoryCall(text, langCode) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${langCode}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (data.responseStatus === 429) throw new Error('Rate limit reached — wait a minute and try again');
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'Translation failed');
  return data.responseData.translatedText;
}

// Print the translated document
async function printTranslated(docId) {
  const cached = _translatedCache[docId];
  if (!cached) { toast('No translated content — translate first','w'); return; }

  const doc = await DB.getDoc(docId);
  const ver = await DB.getVer(docId, doc.revision);
  const allVers = await DB.getAllVers(docId);
  const typeName_ = ALL_TYPES[doc.docType]?.name || doc.docType;

  const revRows = allVers.map(v => `<tr>
    <td>${v.revision}</td><td>${fmtD(v.preparedDate)}</td>
    <td>${esc(v.preparedBy||'')}</td><td>${esc(v.approvedBy||'Pending')}</td>
    <td>${esc(v.changeSummary||'')}</td>
  </tr>`).join('');

  const w = window.open('','_blank','width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head>
<title>${doc.docNumber} — ${cached.langName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Arial Unicode MS',Arial,sans-serif;font-size:10pt;color:#000;background:#fff}
@page{size:A4;margin:14mm 15mm 18mm 15mm}
table.wrap{width:100%;border-collapse:collapse}
table.wrap>thead>tr>td{padding-bottom:7px;border-bottom:2px solid #000}
table.wrap>tfoot>tr>td{padding-top:5px;border-top:1px solid #000;font-size:7.5pt;color:#444}
table.wrap>tbody>tr>td{padding-top:10px;vertical-align:top}
table.hdr{width:100%;border-collapse:collapse}
table.hdr td{border:none;padding:2px 0;vertical-align:top}
.hdr-co{font-size:12pt;font-weight:bold}
.hdr-sub{font-size:7.5pt;color:#555;margin-top:1px}
.hdr-title{font-size:11pt;font-weight:bold;text-align:center}
.hdr-type{font-size:8pt;color:#555;text-align:center;margin-top:2px}
.hdr-lang{font-size:8.5pt;color:#166534;text-align:center;font-weight:600}
.hdr-meta{font-size:8.5pt;text-align:right;line-height:1.6}
.hdr-info{font-size:7.5pt;color:#444;border-top:1px solid #ccc;padding-top:4px;margin-top:4px}
table.ftr{width:100%;border-collapse:collapse}
table.ftr td{border:none;padding:0;vertical-align:middle;font-size:7.5pt}
/* Content */
h1{font-size:14pt;margin:14px 0 7px}
h2{font-size:12pt;font-weight:bold;margin:12px 0 5px;border-bottom:1px solid #bbb;padding-bottom:3px}
h3{font-size:11pt;font-weight:bold;margin:10px 0 4px}
p{margin-bottom:8px;line-height:1.75}
ul,ol{margin:5px 0 10px 22px;line-height:1.75}
li{margin-bottom:3px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}
td,th{border:1px solid #000;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#ececec;font-weight:bold}
img{max-width:100%;height:auto}
hr{border:none;border-top:1px solid #ccc;margin:12px 0}
.lang-notice{background:#f0fdf4;border:1px solid #86efac;border-radius:5px;padding:6px 10px;font-size:8pt;color:#166534;margin-bottom:12px}
.rev-page{margin-top:18px;padding-top:10px;border-top:1.5px solid #000;page-break-inside:avoid}
.rev-page h4{font-size:9.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;padding-bottom:4px;margin-bottom:8px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<table class="wrap">
  <thead><tr><td>
    <table class="hdr"><tr>
      <td style="width:30%">
        <div class="hdr-co">V R ALUCAST</div>
        <div class="hdr-sub">High Pressure Die Casting &nbsp;|&nbsp; ISO 9001</div>
      </td>
      <td style="width:40%">
        <div class="hdr-title">${esc(doc.title)}</div>
        <div class="hdr-type">${esc(typeName_)}</div>
        <div class="hdr-lang">${cached.langLabel} (${cached.langName})</div>
      </td>
      <td style="width:30%">
        <div class="hdr-meta"><b>Doc No:</b> ${doc.docNumber}<br><b>Revision:</b> ${doc.revision}<br><b>Status:</b> ${doc.status}</div>
      </td>
    </tr>
    <tr><td colspan="3">
      <div class="hdr-info">
        <span><b>Prepared by:</b> ${esc(ver?.preparedBy||'—')}</span> &nbsp;|&nbsp;
        <span><b>Date:</b> ${fmtD(ver?.preparedDate)||'—'}</span> &nbsp;|&nbsp;
        <span><b>Approved by:</b> ${esc(ver?.approvedBy||'Pending')}</span>
      </div>
    </td></tr></table>
  </td></tr></thead>
  <tfoot><tr><td>
    <table class="ftr"><tr>
      <td>${doc.docNumber} | Rev ${doc.revision} | ${cached.langName}</td>
      <td style="text-align:center">V R ALUCAST — CONFIDENTIAL</td>
      <td style="text-align:right">Prepared: ${esc(ver?.preparedBy||'—')}</td>
    </tr></table>
  </td></tr></tfoot>
  <tbody><tr><td>
    <div class="lang-notice">🌐 This is a ${cached.langName} translation of ${doc.docNumber} Rev ${doc.revision}. For official records, refer to the original English document.</div>
    ${cached.html}
    <div class="rev-page">
      <h4>Revision History / आवृत्ती इतिहास</h4>
      <table>
        <thead><tr><th>Rev</th><th>Date</th><th>Prepared By</th><th>Approved By</th><th>Summary</th></tr></thead>
        <tbody>${revRows}</tbody>
      </table>
    </div>
  </td></tr></tbody>
</table>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),2000)}<\/script>
</body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  PRINT DOCUMENT
// ══════════════════════════════════════════════════════
async function printDoc(id){
  const doc = await DB.getDoc(id);
  if(!doc){ toast('Document not found','d'); return; }
  const ver = await DB.getVer(id, doc.revision);
  const allVers = await DB.getAllVers(id);
  const typeName_ = ALL_TYPES[doc.docType]?.name || doc.docType;

  const revRows = allVers.map(v=>`<tr>
    <td>${v.revision}</td><td>${fmtD(v.preparedDate||'')}</td>
    <td>${esc(v.preparedBy||'')}</td><td>${esc(v.approvedBy||'Pending')}</td>
    <td>${esc(v.changeSummary||'')}</td>
  </tr>`).join('');

  const w = window.open('','_blank','width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head>
<title>${doc.docNumber} — ${esc(doc.title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#fff}
@page{size:A4;margin:14mm 15mm 18mm 15mm}
table.wrap{width:100%;border-collapse:collapse}
table.wrap>thead>tr>td{padding-bottom:7px;border-bottom:2px solid #000}
table.wrap>tfoot>tr>td{padding-top:5px;border-top:1px solid #000;font-size:7.5pt;color:#444}
table.wrap>tbody>tr>td{padding-top:10px;vertical-align:top}
table.hdr{width:100%;border-collapse:collapse}
table.hdr td{border:none;padding:2px 0;vertical-align:top}
.hdr-co{font-size:12pt;font-weight:bold}
.hdr-title{font-size:11pt;font-weight:bold;text-align:center}
.hdr-type{font-size:8pt;color:#555;text-align:center;margin-top:2px}
.hdr-meta{font-size:8.5pt;text-align:right;line-height:1.6}
h1{font-size:14pt;margin:14px 0 7px}
h2{font-size:12pt;font-weight:bold;margin:12px 0 5px;border-bottom:1px solid #bbb;padding-bottom:3px}
h3{font-size:11pt;font-weight:bold;margin:10px 0 4px}
p{margin-bottom:8px;line-height:1.75}
ul,ol{margin:5px 0 10px 22px;line-height:1.75}
li{margin-bottom:3px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}
td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#ececec;font-weight:bold}
.rev-table th{background:#1e3a5f;color:#fff}
@media print{.no-print{display:none}}
@page{counter-increment:page}
@page{@bottom-right{content:counter(page)}}
.page-num::after{content:" " counter(page) " of " counter(pages)}
</style>
</head><body>
<button class="no-print" onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨 Print / Save PDF</button>

<table class="wrap">
<thead><tr><td>
  <table class="hdr">
    <tr>
      <td style="width:33%;vertical-align:middle">
        <div class="hdr-co">V R ALUCAST</div>
        <div style="font-size:7.5pt;color:#555">Aluminium High Pressure Die Casting</div>
      </td>
      <td style="width:34%;text-align:center;vertical-align:middle">
        <div class="hdr-title">${esc(doc.title)}</div>
        <div class="hdr-type">${typeName_}</div>
      </td>
      <td style="width:33%;text-align:right;vertical-align:middle" class="hdr-meta">
        <div><b>Doc No:</b> ${esc(doc.docNumber)}</div>
        <div><b>Rev:</b> ${esc(doc.revision)}</div>
        <div><b>Status:</b> ${esc(doc.status)}</div>
        <div><b>Date:</b> ${fmtD(ver?.preparedDate||doc.createdDate||'')}</div>
      </td>
    </tr>
  </table>
</td></tr></thead>
<tbody><tr><td>
  <div style="font-size:10.5pt;line-height:1.8;padding:8px 0">
    ${ver?.content||'<p style="color:#999">No content.</p>'}
  </div>
</td></tr></tbody>
<tfoot><tr><td>
  <table style="width:100%;font-size:7.5pt;color:#555;border:none">
    <tr>
      <td style="border:none">${esc(doc.docNumber)} Rev ${esc(doc.revision)}</td>
      <td style="border:none;text-align:center">V R ALUCAST — Confidential</td>
      <td style="border:none;text-align:right" class="page-num">Page</td>
    </tr>
  </table>
</td></tr></tfoot>
</table>

<div style="margin-top:24px">
  <div style="font-size:9pt;font-weight:bold;margin-bottom:6px;color:#1e3a5f">REVISION HISTORY</div>
  <table class="rev-table">
    <thead><tr>
      <th>Rev</th><th>Date</th><th>Prepared By</th><th>Approved By</th><th>Change Summary</th>
    </tr></thead>
    <tbody>${revRows}</tbody>
  </table>
</div>



<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
  w.document.close();
}

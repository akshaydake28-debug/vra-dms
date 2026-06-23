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

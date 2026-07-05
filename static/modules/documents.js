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
          <button class="btn btn-xs btn-o" onclick="printDoc(${d.id},true)" title="Landscape print">↔</button>
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

// ── Undo stack for table operations ─────────────────
const _tblUndo = [];
function _tblSnapshot(){
  const ed = document.getElementById('doc-editor'); if(!ed) return;
  _tblUndo.push(ed.innerHTML);
  if(_tblUndo.length > 50) _tblUndo.shift();
}
function _tblUndoLast(){
  if(!_tblUndo.length) return;
  const ed = document.getElementById('doc-editor'); if(!ed) return;
  ed.innerHTML = _tblUndo.pop();
}

function colorSwatches(colors, fn) {
  return `<div class="clr-swatches">${colors.map(c=>`<div class="clr-sw" style="background:${c}" onmousedown="event.preventDefault()" onclick="${fn}('${c}')" title="${c}"></div>`).join('')}</div>
  <input type="color" style="width:100%;height:26px;cursor:pointer;border:1px solid #ccc;border-radius:4px;margin-top:2px" onmousedown="event.preventDefault()" oninput="${fn}(this.value)">`;
}

function editorHTML(initialContent=''){
  return `
  <div class="editor-shell">
    <!-- MAIN TOOLBAR -->
    <div class="toolbar">
      <select class="tb-select" onmousedown="event.preventDefault()" onchange="execFmt('formatBlock',this.value);this.value='p'" title="Block style">
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('bold')" title="Bold (Ctrl+B)"><b>B</b></button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('italic')" title="Italic (Ctrl+I)"><i>I</i></button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('underline')" title="Underline (Ctrl+U)"><u>U</u></button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('justifyLeft')"   title="Align left">⬤⬤⬤<span style="font-size:8px">◀</span></button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('justifyCenter')" title="Align center">≡</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('justifyRight')"  title="Align right"><span style="font-size:8px">▶</span>⬤⬤⬤</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('justifyFull')"   title="Justify">⬛⬛⬛⬛</button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('insertOrderedList')" title="Numbered list">1.</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('insertUnorderedList')" title="Bullet list">•</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('indent')"   title="Indent">→</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('outdent')"  title="Outdent">←</button>
      <span class="tb-sep"></span>
      <div class="clr-wrap">
        <button class="tb-btn" onmousedown="event.preventDefault()" onclick="toggleClrPicker('tc-picker')" title="Text colour">
          <b id="tc-indicator" style="border-bottom:3px solid #000;padding-bottom:1px">A</b>▾
        </button>
        <div id="tc-picker" class="clr-picker" style="display:none">
          <div style="font-size:10.5px;font-weight:600;color:#6b7280;margin-bottom:5px">Text Colour</div>
          ${colorSwatches(TEXT_COLORS,'applyTextColor')}
        </div>
      </div>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="showInsertTable()" title="Insert table">⊞ Table</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="insertImage()" title="Insert image">🖼 Image</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('insertHorizontalRule')" title="Horizontal rule">─ Line</button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="execFmt('removeFormat')" style="color:#888" title="Clear formatting">✕ Clear</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="showPrintPreview()" title="Preview as print" style="color:#1d4ed8">👁 Preview</button>
      <span style="flex:1"></span>
      <span id="ed-wordcount" style="font-size:10.5px;color:#9ca3af;margin-right:6px"></span>
    </div>

    <!-- TABLE TOOLBAR — shown when cursor is inside a table -->
    <div class="toolbar tbl-tb" id="tbl-tb" style="display:none">
      <span style="font-size:11px;font-weight:700;color:#92400e;margin-right:4px">Table ›</span>
      <input type="number" id="tbl-n" min="1" max="20" value="1" style="width:38px;padding:3px 4px;border:1px solid #d1d5db;border-radius:4px;font-size:12px" title="Count for add operations">
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddRow(false)" title="Add row(s) below">↓ Row</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddRow(true)"  title="Add row(s) above">↑ Row</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddCol(false)" title="Add col(s) right">→ Col</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblAddCol(true)"  title="Add col(s) left">← Col</button>
      <span class="tb-sep"></span>
      <button class="tb-btn danger" onmousedown="event.preventDefault()" onclick="tblDelRow()" title="Delete current row">✕ Row</button>
      <button class="tb-btn danger" onmousedown="event.preventDefault()" onclick="tblDelCol()" title="Delete current column">✕ Col</button>
      <button class="tb-btn danger" onmousedown="event.preventDefault()" onclick="tblDelete()" title="Delete entire table">🗑 Table</button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblToggleHeader()" title="Toggle header row">⇅ Hdr</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblMergeCols()" title="Merge selected cells in this row">⊠ Merge</button>
      <span class="tb-sep"></span>
      <span style="font-size:10px;color:#92400e;font-weight:600">Cell:</span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblCellAlign('left')"   title="Cell text left">◀</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblCellAlign('center')" title="Cell text center">≡</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblCellAlign('right')"  title="Cell text right">▶</button>
      <select class="tb-select" onmousedown="event.preventDefault()" onchange="tblCellPad(this.value);this.blur()" title="Cell padding">
        <option value="">Padding</option>
        <option value="2px 4px">Compact</option>
        <option value="5px 8px">Normal</option>
        <option value="10px 14px">Spacious</option>
      </select>
      <div class="clr-wrap">
        <button class="tb-btn" onmousedown="event.preventDefault()" onclick="toggleClrPicker('cc-picker')" title="Cell background">🎨▾</button>
        <div id="cc-picker" class="clr-picker" style="display:none">
          <div style="font-size:10.5px;font-weight:600;color:#6b7280;margin-bottom:5px">Cell Background</div>
          ${colorSwatches(CELL_COLORS,'applyCellBg')}
        </div>
      </div>
      <span class="tb-sep"></span>
      <select class="tb-select" onmousedown="event.preventDefault()" onchange="tblSetBorder(this.value);this.blur()" title="Table border style">
        <option value="">Border</option>
        <option value="none">None</option>
        <option value="light">Light</option>
        <option value="medium">Medium</option>
        <option value="bold">Bold</option>
        <option value="header">Header Only</option>
      </select>
      <span style="font-size:10px;color:#92400e;font-weight:600">Width:</span>
      <select class="tb-select" onmousedown="event.preventDefault()" onchange="tblSetWidth(this.value);this.blur()" title="Table width">
        <option value="">—</option>
        <option value="25%">25%</option>
        <option value="50%">50%</option>
        <option value="75%">75%</option>
        <option value="100%">100%</option>
        <option value="auto">Auto</option>
      </select>
      <input type="text" id="tbl-col-w" placeholder="Col%" style="width:46px;padding:3px 4px;border:1px solid #d1d5db;border-radius:4px;font-size:12px" title="Set current column width (e.g. 30%)" onkeydown="if(event.key==='Enter'){tblSetColWidth(this.value);this.value=''}">
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblSetColWidth(document.getElementById('tbl-col-w').value)" title="Apply column width">↵</button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblSetAlign('left')"   title="Table align left">|◀</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblSetAlign('center')" title="Table align center">|≡|</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblSetAlign('right')"  title="Table align right">▶|</button>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="tblEqualCols()" title="Equal column widths">⇔</button>
      <span class="tb-sep"></span>
      <button class="tb-btn" onmousedown="event.preventDefault()" onclick="_tblUndoLast()" title="Undo last table change" style="color:#6b7280">↩ Undo</button>
    </div>

    <!-- TABLE INSERT PICKER (hidden by default) -->
    <div id="tbl-insert-picker" style="display:none;position:absolute;z-index:700;background:#fff;border:1px solid #d1d5db;border-radius:10px;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.18)">
      <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px">Drag to select rows × columns</div>
      <div id="tbl-grid" style="display:grid;grid-template-columns:repeat(8,22px);gap:3px"></div>
      <div id="tbl-grid-label" style="font-size:11px;color:#374151;margin-top:6px;text-align:center">—</div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
        <input type="number" id="tbl-custom-r" placeholder="Rows" min="1" max="30" style="width:60px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;font-size:12px">
        <input type="number" id="tbl-custom-c" placeholder="Cols" min="1" max="15" style="width:60px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;font-size:12px">
        <button class="btn btn-p btn-sm" onclick="doInsertTable(parseInt(document.getElementById('tbl-custom-r').value)||4,parseInt(document.getElementById('tbl-custom-c').value)||3)">Insert</button>
      </div>
    </div>

    <!-- IMAGE CONFIG PANEL (hidden by default) -->
    <div id="img-config-panel" style="display:none;position:fixed;z-index:800;background:#fff;border:1px solid #d1d5db;border-radius:10px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.2);min-width:240px">
      <div style="font-weight:600;font-size:12px;color:#374151;margin-bottom:10px">🖼 Image Size</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <label style="font-size:11px;color:#6b7280;width:50px">Width</label>
        <input type="number" id="img-w-val" min="10" max="100" value="100" style="width:60px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;font-size:12px">
        <select id="img-w-unit" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;font-size:12px">
          <option value="%">%</option>
          <option value="px">px</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-p btn-sm" onclick="applyImgSize()">Apply</button>
        <button class="btn btn-o btn-sm" onclick="document.getElementById('img-config-panel').style.display='none'">Cancel</button>
      </div>
    </div>

    <div id="doc-editor" contenteditable="true" spellcheck="true" style="min-height:400px">${initialContent||'<p><br></p>'}</div>
    <div style="padding:4px 10px;font-size:10.5px;color:#9ca3af;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between">
      <span id="ed-status"></span>
      <span id="ed-wordcount2"></span>
    </div>
  </div>`;
}

function execFmt(cmd, val){
  document.execCommand(cmd, false, val||null);
  document.getElementById('doc-editor')?.focus();
  _updateWordCount();
}

// ── Word count ───────────────────────────────────────
function _updateWordCount(){
  const ed=document.getElementById('doc-editor'); if(!ed) return;
  const txt=ed.innerText||'';
  const words=txt.trim()?txt.trim().split(/\s+/).length:0;
  const chars=txt.replace(/\s/g,'').length;
  const label=`${words} words · ${chars} chars`;
  const wc1=document.getElementById('ed-wordcount');
  const wc2=document.getElementById('ed-wordcount2');
  if(wc1) wc1.textContent=label;
  if(wc2) wc2.textContent=label;
}

// ── Print preview (WYSIWYG) ──────────────────────────
function showPrintPreview(){
  const ed=document.getElementById('doc-editor'); if(!ed) return;
  const content=ed.innerHTML;
  const ov=document.createElement('div');
  ov.className='overlay'; ov.id='print-preview-ov';
  ov.style.cssText='z-index:900;align-items:flex-start;padding:20px;overflow-y:auto';
  ov.innerHTML=`<div style="background:#fff;width:210mm;max-width:100%;margin:0 auto;padding:14mm 15mm 18mm;box-shadow:0 4px 24px rgba(0,0,0,.2);border-radius:2px;position:relative">
    <div style="position:sticky;top:-20px;background:#1e293b;color:#fff;padding:8px 14px;margin:-14mm -15mm 14px;display:flex;justify-content:space-between;align-items:center;border-radius:2px 2px 0 0;z-index:1">
      <span style="font-size:12px;font-weight:600">Print Preview — exactly as it will print</span>
      <button onclick="document.getElementById('print-preview-ov').remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div style="font-family:Arial,sans-serif;font-size:10pt;color:#000;line-height:1.75">
      <style>table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}th{background:#ececec;font-weight:bold}h1{font-size:14pt;margin:14px 0 7px}h2{font-size:12pt;font-weight:bold;margin:12px 0 5px;border-bottom:1px solid #bbb;padding-bottom:3px}h3{font-size:11pt;font-weight:bold;margin:10px 0 4px}p{margin-bottom:8px}ul,ol{margin:5px 0 10px 22px}li{margin-bottom:3px}img{max-width:100%;height:auto}</style>
      ${content}
    </div>
  </div>`;
  document.body.appendChild(ov);
}

// ── Colour pickers ───────────────────────────────────
function toggleClrPicker(id){
  document.querySelectorAll('.clr-picker').forEach(p=>{ if(p.id!==id) p.style.display='none'; });
  const el=document.getElementById(id);
  if(el) el.style.display=el.style.display==='none'?'block':'none';
}
document.addEventListener('mousedown', e=>{
  if(!e.target.closest('.clr-wrap')) document.querySelectorAll('.clr-picker').forEach(p=>p.style.display='none');
  if(!e.target.closest('#tbl-insert-picker')&&!e.target.closest('.tb-btn[onclick*="showInsertTable"]'))
    document.getElementById('tbl-insert-picker')&&(document.getElementById('tbl-insert-picker').style.display='none');
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
  const cell=_lastCell||getCell();
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

// Track last known cell so table toolbar ops work after focus leaves editor
let _lastCell=null, _lastTblCtx=null, _tblTbLock=false;
document.addEventListener('selectionchange',()=>{
  if(_tblTbLock) return;
  const ctx=getTblCtx();
  const tb=document.getElementById('tbl-tb'); if(!tb) return;
  if(ctx){
    _lastCell=ctx.cell; _lastTblCtx=ctx;
    tb.style.display='flex';
  } else if(!_tblTbLock){
    tb.style.display='none';
  }
});

document.addEventListener('focusin', e=>{
  if(e.target.id==='doc-editor') return;
  if(e.target.closest('.clr-wrap')||e.target.closest('.toolbar')||e.target.closest('#tbl-insert-picker')) saveRange();
});

// ── Keyboard shortcuts ───────────────────────────────
document.addEventListener('keydown', e=>{
  // Ctrl/Cmd+S → save
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){
    e.preventDefault();
    const saveEdit=window.saveEdit; const saveCreate=window.saveCreate;
    const editBtn=document.querySelector('[onclick^="saveEdit"]');
    const createBtn=document.querySelector('[onclick^="saveCreate"]');
    if(editBtn) editBtn.click();
    else if(createBtn) createBtn.click();
    return;
  }
  // Ctrl+Z inside table toolbar → table undo
  if((e.ctrlKey||e.metaKey)&&e.key==='z'){
    const ed=document.getElementById('doc-editor');
    if(ed&&(document.activeElement===ed||document.activeElement?.closest('.tbl-tb'))){
      if(_tblUndo.length){ e.preventDefault(); _tblUndoLast(); return; }
    }
  }
  // Backspace/Delete: prevent multi-cell structural deletion
  if(e.key!=='Backspace'&&e.key!=='Delete') return;
  const ed=document.getElementById('doc-editor');
  if(!ed||(!ed.contains(document.activeElement)&&document.activeElement!==ed)) return;
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount||sel.isCollapsed) return;
  const range=sel.getRangeAt(0);
  const cellOf=node=>{ let n=node.nodeType===3?node.parentNode:node;
    while(n&&n!==ed){if(n.tagName==='TD'||n.tagName==='TH')return n;n=n.parentNode;}return null; };
  const sc=cellOf(range.startContainer), ec=cellOf(range.endContainer);
  if(sc&&ec&&sc!==ec){
    e.preventDefault();
    const r=document.createRange();
    r.selectNodeContents(sc); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('delete',false,null);
  }
});

// ── Table insert grid picker ─────────────────────────
function showInsertTable(){
  const picker=document.getElementById('tbl-insert-picker'); if(!picker) return;
  // Build 8×8 grid
  const grid=document.getElementById('tbl-grid');
  grid.innerHTML='';
  for(let r=1;r<=6;r++){
    for(let c=1;c<=8;c++){
      const cell=document.createElement('div');
      cell.style.cssText='width:22px;height:22px;border:1.5px solid #d1d5db;border-radius:3px;cursor:pointer;background:#fff;transition:background .1s';
      cell.dataset.r=r; cell.dataset.c=c;
      cell.addEventListener('mouseover',()=>_highlightGrid(r,c));
      cell.addEventListener('click',()=>{ doInsertTable(r,c); picker.style.display='none'; });
      grid.appendChild(cell);
    }
  }
  // Position below the Table button
  const btn=document.querySelector('.tb-btn[onclick*="showInsertTable"]');
  if(btn){
    const rect=btn.getBoundingClientRect();
    picker.style.left=rect.left+'px';
    picker.style.top=(rect.bottom+6)+'px';
    picker.style.position='fixed';
  }
  picker.style.display='block';
}
function _highlightGrid(rows,cols){
  const label=document.getElementById('tbl-grid-label');
  document.querySelectorAll('#tbl-grid div').forEach(c=>{
    const r=parseInt(c.dataset.r), cl=parseInt(c.dataset.c);
    c.style.background=(r<=rows&&cl<=cols)?'#dbeafe':'#fff';
    c.style.borderColor=(r<=rows&&cl<=cols)?'#3b82f6':'#d1d5db';
  });
  if(label) label.textContent=`${rows} × ${cols}`;
}

function doInsertTable(rows,cols){
  rows=Math.max(1,rows||4); cols=Math.max(1,cols||3);
  let html='<table style="width:100%;border-collapse:collapse"><tbody>';
  for(let r=0;r<rows;r++){
    html+='<tr>';
    for(let c=0;c<cols;c++){
      if(r===0) html+=`<th style="border:1px solid #ccc;padding:5px 8px;background:#ececec"> </th>`;
      else html+=`<td style="border:1px solid #ccc;padding:5px 8px"> </td>`;
    }
    html+='</tr>';
  }
  html+='</tbody></table><p><br></p>';
  restoreRange();
  document.execCommand('insertHTML',false,html);
  document.getElementById('doc-editor')?.focus();
}

// ── Table operations ─────────────────────────────────
function _tblN(){ return Math.max(1,parseInt(document.getElementById('tbl-n')?.value)||1); }

function tblAddRow(above){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx){toast('Click inside a table first','w');return}
  _tblSnapshot();
  _tblTbLock=true;
  const {row}=ctx; const cols=row.cells.length; const n=_tblN();
  for(let i=0;i<n;i++){
    const nr=document.createElement('tr');
    for(let j=0;j<cols;j++){const td=document.createElement('td');td.style.cssText='border:1px solid #ccc;padding:5px 8px';td.innerHTML='&nbsp;';nr.appendChild(td);}
    above?row.parentNode.insertBefore(nr,row):row.insertAdjacentElement('afterend',nr);
  }
  setTimeout(()=>_tblTbLock=false,200);
}
function tblAddCol(left){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx){toast('Click inside a table first','w');return}
  _tblSnapshot();
  _tblTbLock=true;
  const {cell,table}=ctx; const ci=cell.cellIndex; const n=_tblN();
  for(let i=0;i<n;i++){
    Array.from(table.rows).forEach(r=>{
      if(ci>=r.cells.length) return;
      const ref=r.cells[ci];
      const nc=document.createElement(ref.tagName==='TH'?'th':'td');
      nc.style.cssText=ref.style.cssText||'border:1px solid #ccc;padding:5px 8px';
      nc.innerHTML='&nbsp;';
      left?r.insertBefore(nc,ref):ref.insertAdjacentElement('afterend',nc);
    });
  }
  setTimeout(()=>_tblTbLock=false,200);
}
function tblDelRow(){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx) return;
  _tblSnapshot(); _tblTbLock=true;
  const {row,table}=ctx;
  if(table.rows.length<=1){toast('Cannot delete the only row','w');_tblTbLock=false;return}
  row.remove();
  setTimeout(()=>_tblTbLock=false,200);
}
function tblDelCol(){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx) return;
  _tblSnapshot(); _tblTbLock=true;
  const {cell,table}=ctx; const ci=cell.cellIndex;
  if(table.rows[0].cells.length<=1){toast('Cannot delete the only column','w');_tblTbLock=false;return}
  Array.from(table.rows).forEach(r=>{if(r.cells[ci])r.cells[ci].remove()});
  setTimeout(()=>_tblTbLock=false,200);
}
function tblDelete(){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx) return;
  if(!confirm('Delete this entire table?')) return;
  _tblSnapshot();
  ctx.table.remove();
  const ed=document.getElementById('doc-editor');
  if(ed&&!ed.querySelector('p')) ed.innerHTML='<p><br></p>';
}
function tblToggleHeader(){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx) return;
  _tblSnapshot(); _tblTbLock=true;
  const {row}=ctx; const isH=row.cells[0]?.tagName==='TH';
  Array.from(row.cells).forEach(c=>{
    const nc=document.createElement(isH?'td':'th');
    nc.innerHTML=c.innerHTML; nc.style.cssText=c.style.cssText;
    if(!isH){ nc.style.background='#ececec'; nc.style.fontWeight='bold'; }
    else { nc.style.background=''; nc.style.fontWeight=''; }
    c.parentNode.replaceChild(nc,c);
  });
  setTimeout(()=>_tblTbLock=false,200);
}
function tblMergeCols(){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx){toast('Click inside a table row first','w');return}
  const sel=window.getSelection(); if(!sel||!sel.rangeCount) return;
  const range=sel.getRangeAt(0);
  const {row,table}=ctx;
  // Find all selected cells in this row
  const rowCells=Array.from(row.cells);
  const selected=rowCells.filter(c=>{
    try{ return sel.containsNode(c,true)||range.intersectsNode(c); }catch(e){ return false; }
  });
  if(selected.length<2){ toast('Select text across at least 2 cells in the same row to merge','w'); return; }
  _tblSnapshot();
  const first=selected[0];
  first.colSpan=selected.length;
  first.innerHTML=selected.map(c=>c.innerHTML.replace(/&nbsp;/g,' ').trim()).filter(Boolean).join(' ');
  for(let i=1;i<selected.length;i++) selected[i].remove();
  toast(`Merged ${selected.length} cells`,'s');
}
function tblCellAlign(align){
  const cell=_lastCell||getCell(); if(!cell){toast('Click inside a cell first','w');return}
  _tblTbLock=true;
  cell.style.textAlign=align;
  setTimeout(()=>_tblTbLock=false,200);
}
function tblCellPad(val){
  const cell=_lastCell||getCell(); if(!cell||!val) return;
  _tblTbLock=true;
  // Apply to all cells in current row for consistency
  const row=cell.parentElement;
  Array.from(row.cells).forEach(c=>c.style.padding=val);
  setTimeout(()=>_tblTbLock=false,200);
}
function tblSetBorder(preset){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx||!preset) return;
  _tblSnapshot(); _tblTbLock=true;
  const t=ctx.table;
  const allCells=Array.from(t.querySelectorAll('td,th'));
  const thCells=Array.from(t.querySelectorAll('th'));
  const tdCells=Array.from(t.querySelectorAll('td'));
  if(preset==='none'){
    allCells.forEach(c=>c.style.border='none');
    t.style.border='none';
  } else if(preset==='light'){
    allCells.forEach(c=>c.style.border='1px solid #e5e7eb');
    t.style.border='1px solid #e5e7eb';
  } else if(preset==='medium'){
    allCells.forEach(c=>c.style.border='1px solid #9ca3af');
    t.style.border='1px solid #9ca3af';
  } else if(preset==='bold'){
    allCells.forEach(c=>c.style.border='2px solid #111');
    t.style.border='2px solid #111';
  } else if(preset==='header'){
    tdCells.forEach(c=>c.style.border='none');
    thCells.forEach(c=>c.style.borderBottom='2px solid #111');
    t.style.border='none';
  }
  setTimeout(()=>_tblTbLock=false,200);
}
function tblEqualCols(){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx){toast('Click inside a table first','w');return}
  _tblSnapshot(); _tblTbLock=true;
  const t=ctx.table;
  const numCols=t.rows[0]?.cells.length; if(!numCols){_tblTbLock=false;return}
  const pct=Math.floor(100/numCols);
  t.style.tableLayout='fixed'; t.style.width='100%';
  Array.from(t.rows).forEach(r=>{
    Array.from(r.cells).forEach(c=>{ c.style.width=pct+'%'; c.style.minWidth=''; });
  });
  setTimeout(()=>_tblTbLock=false,200);
}
function tblSetColWidth(val){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx||!val) return;
  val=String(val).trim();
  if(!val.includes('%')&&!val.includes('px')) val=val+'%';
  _tblTbLock=true;
  const {cell,table}=ctx; const ci=cell.cellIndex;
  table.style.tableLayout='fixed';
  Array.from(table.rows).forEach(r=>{ if(r.cells[ci]) r.cells[ci].style.width=val; });
  const inp=document.getElementById('tbl-col-w'); if(inp) inp.value='';
  setTimeout(()=>_tblTbLock=false,200);
}
function tblSetWidth(w){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx){toast('Click inside a table first','w');return}
  if(!w) return;
  _tblTbLock=true;
  ctx.table.style.width=w;
  if(w==='100%') ctx.table.style.tableLayout='fixed';
  setTimeout(()=>_tblTbLock=false,200);
}
function tblSetAlign(align){
  const ctx=_lastTblCtx||getTblCtx(); if(!ctx){toast('Click inside a table first','w');return}
  _tblTbLock=true;
  const t=ctx.table;
  if(align==='center'){t.style.marginLeft='auto';t.style.marginRight='auto';}
  else if(align==='right'){t.style.marginLeft='auto';t.style.marginRight='0';}
  else{t.style.marginLeft='0';t.style.marginRight='auto';}
  t.style.display='table';
  setTimeout(()=>_tblTbLock=false,200);
}

// ── Column resize by dragging (with visible grip) ────
(function initColResize(){
  let dragging=false, startX=0, startW=0, nextW=0, colIdx=null, nextIdx=null, activeTable=null;
  function colCells(tbl,ci){ return Array.from(tbl.rows).map(r=>r.cells[ci]).filter(Boolean); }
  function lockTable(tbl){
    const firstRow=tbl.rows[0]; if(!firstRow) return;
    const widths=Array.from(firstRow.cells).map(c=>c.getBoundingClientRect().width);
    tbl.style.width=tbl.getBoundingClientRect().width+'px';
    tbl.style.tableLayout='fixed';
    widths.forEach((w,i)=>colCells(tbl,i).forEach(c=>{ c.style.width=w+'px'; c.style.minWidth=w+'px'; }));
  }
  document.addEventListener('mousemove', e=>{
    if(dragging){
      const diff=e.clientX-startX;
      const newW=Math.max(30,startW+diff);
      colCells(activeTable,colIdx).forEach(c=>{ c.style.width=newW+'px'; c.style.minWidth=newW+'px'; });
      if(nextIdx!==null){
        const newNext=Math.max(30,nextW-diff);
        colCells(activeTable,nextIdx).forEach(c=>{ c.style.width=newNext+'px'; c.style.minWidth=newNext+'px'; });
      }
      e.preventDefault(); return;
    }
    const cell=e.target.closest&&e.target.closest('#doc-editor td,#doc-editor th'); if(!cell) return;
    const rect=cell.getBoundingClientRect();
    const nearEdge=e.clientX>=rect.right-8;
    cell.style.cursor=nearEdge?'col-resize':'';
    // Show grip indicator
    let grip=cell.querySelector('.col-resize-grip');
    if(nearEdge){
      if(!grip){
        grip=document.createElement('span');
        grip.className='col-resize-grip';
        grip.style.cssText='position:absolute;top:0;right:0;width:4px;height:100%;background:#3b82f6;opacity:.5;cursor:col-resize;pointer-events:none';
        cell.style.position='relative';
        cell.appendChild(grip);
      }
    } else {
      if(grip) grip.remove();
    }
  });
  document.addEventListener('mousedown', e=>{
    const cell=e.target.closest&&e.target.closest('#doc-editor td,#doc-editor th'); if(!cell) return;
    const rect=cell.getBoundingClientRect();
    if(e.clientX>=rect.right-8){
      activeTable=cell.closest('table');
      lockTable(activeTable);
      colIdx=cell.cellIndex; startX=e.clientX;
      startW=cell.getBoundingClientRect().width;
      const nextCell=activeTable.rows[0]?.cells[colIdx+1];
      nextIdx=nextCell?colIdx+1:null;
      nextW=nextCell?nextCell.getBoundingClientRect().width:0;
      dragging=true; document.body.style.userSelect='none';
      e.preventDefault();
    }
  });
  document.addEventListener('mouseup', ()=>{
    if(dragging){ dragging=false; activeTable=null; colIdx=null; nextIdx=null; document.body.style.userSelect=''; }
  });
})();

// ── Image insert + resize ────────────────────────────
let _activeImg=null;
function insertImage(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{
      const imgHtml=`<img src="${ev.target.result}" alt="${f.name}" style="max-width:100%;height:auto;cursor:pointer" onclick="showImgConfig(this)"><p><br></p>`;
      restoreRange();
      document.execCommand('insertHTML',false,imgHtml);
      document.getElementById('doc-editor')?.focus();
    };
    r.readAsDataURL(f);
  };
  inp.click();
}
function showImgConfig(img){
  _activeImg=img;
  const panel=document.getElementById('img-config-panel'); if(!panel) return;
  const rect=img.getBoundingClientRect();
  panel.style.left=rect.left+'px';
  panel.style.top=(rect.bottom+8)+'px';
  // Pre-fill current width
  const wVal=document.getElementById('img-w-val');
  const wUnit=document.getElementById('img-w-unit');
  const cw=img.style.width||'';
  if(cw.includes('%')){ if(wVal) wVal.value=parseInt(cw); if(wUnit) wUnit.value='%'; }
  else if(cw.includes('px')){ if(wVal) wVal.value=parseInt(cw); if(wUnit) wUnit.value='px'; }
  else { if(wVal) wVal.value=100; if(wUnit) wUnit.value='%'; }
  panel.style.display='block';
}
function applyImgSize(){
  if(!_activeImg) return;
  const v=document.getElementById('img-w-val')?.value||100;
  const u=document.getElementById('img-w-unit')?.value||'%';
  _activeImg.style.width=v+u;
  _activeImg.style.height='auto';
  document.getElementById('img-config-panel').style.display='none';
}
// Hide image panel on outside click
document.addEventListener('click',e=>{
  const panel=document.getElementById('img-config-panel');
  if(panel&&!panel.contains(e.target)&&e.target!==_activeImg) panel.style.display='none';
});

function getEditorHTML(){
  const el=document.getElementById('doc-editor');
  if(!el) return '';
  // Clean up any resize grips before saving
  el.querySelectorAll('.col-resize-grip').forEach(g=>g.remove());
  return el.innerHTML;
}
function setEditorHTML(html){
  const el=document.getElementById('doc-editor');
  if(el){ el.innerHTML=html||'<p><br></p>'; _updateWordCount(); }
}

// Live word count on editor input
document.addEventListener('input', e=>{
  if(e.target.id==='doc-editor') _updateWordCount();
});

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
  const orient='portrait';
  const content=getEditorHTML();
  if(!title){toast('⚠️ Enter a document title','d');return}
  const u=Auth.user;
  const docNumber=await DB.nextNum(type);
  const docId=await DB.createDoc({docNumber,docType:type,title,revision:'A',status:'DRAFT',
    orientation:orient,createdBy:u.name,createdDate:new Date().toISOString()});
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
      <button class="btn btn-p btn-sm" onclick="printDoc(${id})">🖨 Print</button>
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

  function sanitiseContent(html){
    const d=document.createElement('div'); d.innerHTML=html;
    d.querySelectorAll('p,li,ul,ol,div,td,th,tr,h1,h2,h3,h4,h5,h6').forEach(el=>{
      el.style.color=''; el.style.fontWeight=''; el.style.fontSize='';
    });
    // Strip fixed widths from tables so they fit the page
    d.querySelectorAll('table').forEach(el=>{
      el.style.width=''; el.style.minWidth=''; el.style.maxWidth='';
      el.removeAttribute('width');
    });
    d.querySelectorAll('span').forEach(el=>{
      el.style.color=''; el.style.fontWeight='';
      if(!el.getAttribute('style')&&!el.className) el.replaceWith(...el.childNodes);
    });
    return d.innerHTML;
  }

  function openTransBlob(html){
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  openTransBlob(`<!DOCTYPE html><html><head>
<meta charset="UTF-8">
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
.page-num::after{content:" " counter(page) " of " counter(pages)}
/* Strip editor inline colors in content */
#doc-content,#doc-content *{color:#000!important}
#doc-content b,#doc-content strong{font-weight:bold}
#doc-content i,#doc-content em{font-style:italic}
#doc-content u{text-decoration:underline}
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
      <td style="text-align:right"><span class="page-num">Page</span></td>
    </tr></table>
  </td></tr></tfoot>
  <tbody><tr><td>
    <div class="lang-notice">🌐 This is a ${cached.langName} translation of ${doc.docNumber} Rev ${doc.revision}. For official records, refer to the original English document.</div>
    <div id="doc-content">${sanitiseContent(cached.html)}</div>
    <div class="rev-page">
      <h4>Revision History / आवृत्ती इतिहास</h4>
      <table>
        <thead><tr><th>Rev</th><th>Date</th><th>Prepared By</th><th>Approved By</th><th>Summary</th></tr></thead>
        <tbody>${revRows}</tbody>
      </table>
    </div>
  </td></tr></tbody>
</table>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`);
}

// ══════════════════════════════════════════════════════
//  PRINT DOCUMENT
// ══════════════════════════════════════════════════════
async function printDoc(id){
  const doc = await DB.getDoc(id);
  if(!doc){ toast('Document not found','d'); return; }
  const landscape = false;
  const ver = await DB.getVer(id, doc.revision);
  const allVers = await DB.getAllVers(id);
  const typeName_ = ALL_TYPES[doc.docType]?.name || doc.docType;

  const revRows = allVers.map(v=>`<tr>
    <td>${v.revision}</td><td>${fmtD(v.preparedDate||'')}</td>
    <td>${esc(v.preparedBy||'')}</td><td>${esc(v.approvedBy||'Pending')}</td>
    <td>${esc(v.changeSummary||'')}</td>
  </tr>`).join('');

  function sanitiseContent(html){
    const d=document.createElement('div'); d.innerHTML=html;
    d.querySelectorAll('p,li,ul,ol,div,td,th,tr,h1,h2,h3,h4,h5,h6').forEach(el=>{
      el.style.color=''; el.style.fontWeight=''; el.style.fontSize='';
    });
    // Strip fixed widths from tables so they fit the page
    d.querySelectorAll('table').forEach(el=>{
      el.style.width=''; el.style.minWidth=''; el.style.maxWidth='';
      el.removeAttribute('width');
    });
    d.querySelectorAll('span').forEach(el=>{
      el.style.color=''; el.style.fontWeight='';
      if(!el.getAttribute('style')&&!el.className) el.replaceWith(...el.childNodes);
    });
    return d.innerHTML;
  }

  function openPrintBlob(html){
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  openPrintBlob(`<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>${doc.docNumber} — ${esc(doc.title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#d1d5db;padding:64px 24px 24px}
@page{size:${landscape?'A4 landscape':'A4'};margin:0}
@media print{
  body{background:#fff!important;padding:0!important}
  .no-print{display:none!important}
  #page-wrap{box-shadow:none!important;margin:0!important;border-radius:0!important}
}
#page-wrap{
  background:#fff;
  width:${landscape?'297mm':'210mm'};
  margin:0 auto;
  padding:14mm 15mm 18mm;
  box-shadow:0 4px 24px rgba(0,0,0,0.25);
  border-radius:2px;
}
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
td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top;word-break:break-word;overflow-wrap:break-word}
th{background:#ececec;font-weight:bold}
.rev-table th{background:#1e3a5f;color:#fff}
.page-num::after{content:" " counter(page) " of " counter(pages)}
/* Force all content tables to fit page width */
#doc-content table{width:100%!important;max-width:100%!important;table-layout:fixed!important}
#doc-content td,#doc-content th{word-break:break-word!important;overflow-wrap:break-word!important}
/* Strip editor inline colors — force black text in content area */
#doc-content,#doc-content *{color:#000!important}
#doc-content b,#doc-content strong{font-weight:bold}
#doc-content i,#doc-content em{font-style:italic}
#doc-content u{text-decoration:underline}
</style>
<script>
var _isLandscape=${landscape?'true':'false'};
// Auto-fit: scale content to fill exactly one page width before printing (like Excel fit-to-page)
function calcScale(){
  var wrap=document.getElementById('page-wrap');
  // A4 usable width after margins (297mm or 210mm) in px at 96dpi
  var pageWpx=(_isLandscape?297:210)/25.4*96;
  var contentW=wrap.scrollWidth;
  return contentW>pageWpx?pageWpx/contentW:1;
}
window.addEventListener('beforeprint',function(){
  var s=calcScale();
  if(s<1){
    document.getElementById('page-wrap').style.zoom=s;
  }
});
window.addEventListener('afterprint',function(){
  document.getElementById('page-wrap').style.zoom='';
});
function doPrint(){
  window.print();
}
<\/script>
</head><body>
<div class="no-print" style="position:fixed;top:0;left:0;right:0;height:48px;background:#1e293b;padding:0 20px;display:flex;gap:12px;align-items:center;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,0.4)">
  <span style="font-size:13px;color:#fff;font-weight:700">V R ALUCAST</span>
  <span style="font-size:11px;color:#94a3b8">|</span>
  <span style="font-size:11px;color:#cbd5e1">${esc(doc.docNumber)} — ${esc(doc.title)}</span>
  <div style="flex:1"></div>
  <button onclick="doPrint()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:0.3px">🖨 Print / Save PDF</button>
</div>
<div id="page-wrap">

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
  <div id="doc-content" style="font-size:10.5pt;line-height:1.8;padding:8px 0">
    ${sanitiseContent(ver?.content||'<p style="color:#999">No content.</p>')}
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



</div>
</body></html>`);
}

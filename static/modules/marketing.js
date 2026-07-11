// VRA DMS — MARKETING HELPERS

function mktStatusBadge(s){
  const m={Open:'bp',Quoted:'ba','PO Received':'ba',Lost:'br',Cancelled:'bd',Hold:'bd'};
  return`<span class="badge ${m[s]||'bd'}">${s}</span>`;
}
function mktResultBadge(r){
  if(r==='FEASIBLE') return`<span class="badge ba">FEASIBLE</span>`;
  if(r==='NOT FEASIBLE') return`<span class="badge br">NOT FEASIBLE</span>`;
  return`<span class="badge bd">Pending</span>`;
}
// VR Alucast brand palette — matches the amber used across the live app's
// sidebar/accent (--accent:#e8a020), kept as one source of truth for print.
const MKT_BRAND = {amber:'#e8a020', amberDeep:'#a06a12', header:'#8a3d12', ink:'#161616', tint:'#fdf6e8', tintLine:'#ecdcb4'};

// ── LETTERHEAD SETTINGS (logo + company contact details) ──
// Stored via the generic settings API (db.settings) — same store used
// elsewhere in the app, no backend changes needed. Uploaded logos are
// read client-side with FileReader/canvas and kept as a data: URL, so
// nothing needs to leave the browser to get the real logo into print.
async function mktGetLetterhead(){
  const s = await db.settings.get('mktLetterhead').catch(()=>null);
  return s?.value || {logoDataUrl:'', address:'', phone:'', email:'', gst:''};
}
async function mktSaveLetterhead(){
  const existing = await mktGetLetterhead();
  const fileInput = document.getElementById('lh-logo-file');
  const rec = {
    logoDataUrl: fileInput?.dataset.preview || existing.logoDataUrl || '',
    address: document.getElementById('lh-address').value.trim(),
    phone: document.getElementById('lh-phone').value.trim(),
    email: document.getElementById('lh-email').value.trim(),
    gst: document.getElementById('lh-gst').value.trim(),
  };
  await db.settings.put({key:'mktLetterhead', value:rec});
  toast('✅ Letterhead settings saved');
  document.getElementById('mkt-lh-ov')?.remove();
}
// Many logo exports carry a lot of empty margin around the mark (so it sits
// safely at a fixed canvas size). Displayed small, that padding makes the
// logo look nearly invisible — so this crops to the actual ink/pixels
// before resizing, then scales the trimmed art to fill maxW/maxH.
function mktResizeImageToDataUrl(file, maxW, maxH){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        try {
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = img.width; srcCanvas.height = img.height;
          const sctx = srcCanvas.getContext('2d');
          sctx.drawImage(img, 0, 0);
          const data = sctx.getImageData(0, 0, img.width, img.height).data;
          let minX=img.width, minY=img.height, maxX=-1, maxY=-1;
          for(let y=0; y<img.height; y++){
            for(let x=0; x<img.width; x++){
              const i=(y*img.width+x)*4;
              const a=data[i+3], r=data[i], g=data[i+1], b=data[i+2];
              const isBg = a < 12 || (r>247 && g>247 && b>247);
              if(!isBg){
                if(x<minX) minX=x; if(x>maxX) maxX=x;
                if(y<minY) minY=y; if(y>maxY) maxY=y;
              }
            }
          }
          if(maxX<0){ minX=0; minY=0; maxX=img.width-1; maxY=img.height-1; }
          const pad = Math.round(Math.max(img.width,img.height)*0.02);
          minX=Math.max(0,minX-pad); minY=Math.max(0,minY-pad);
          maxX=Math.min(img.width-1,maxX+pad); maxY=Math.min(img.height-1,maxY+pad);
          const cw=maxX-minX+1, ch=maxY-minY+1;
          const scale = Math.min(1, maxW/cw, maxH/ch);
          const w = Math.max(1, Math.round(cw*scale));
          const h = Math.max(1, Math.round(ch*scale));
          const outCanvas = document.createElement('canvas');
          outCanvas.width = w; outCanvas.height = h;
          outCanvas.getContext('2d').drawImage(srcCanvas, minX, minY, cw, ch, 0, 0, w, h);
          resolve(outCanvas.toDataURL('image/png'));
        } catch(err){ reject(err); }
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
async function mktPreviewLetterheadLogo(input){
  const file = input.files?.[0];
  if(!file) return;
  try {
    const dataUrl = await mktResizeImageToDataUrl(file, 320, 320);
    input.dataset.preview = dataUrl;
    const prev = document.getElementById('lh-logo-preview');
    if(prev) prev.innerHTML = `<img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain">`;
  } catch(e) { toast('Could not read that image file','d'); }
}
function mktRemoveLetterheadLogo(){
  const fileInput = document.getElementById('lh-logo-file');
  if(fileInput){ fileInput.value=''; fileInput.dataset.preview=''; delete fileInput.dataset.preview; }
  const prev = document.getElementById('lh-logo-preview');
  if(prev) prev.innerHTML = `<span class="muted" style="font-size:10px">No logo</span>`;
  const marker = document.getElementById('lh-logo-cleared');
  if(marker) marker.value='1';
}
async function mktOpenLetterheadSettings(){
  const lh = await mktGetLetterhead();
  const ov=document.createElement('div');ov.className='overlay';ov.id='mkt-lh-ov';
  ov.innerHTML=`<div class="modal" style="width:480px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>🏢 Letterhead &amp; Company Details</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('mkt-lh-ov').remove()">✕</button>
    </div>
    <div class="alert al-w" style="margin-bottom:12px">Used on all Marketing print-outs — Enquiry Register, Feasibility Review and Quotation.</div>
    <div class="fg"><label class="lbl">Company Logo</label>
      <div style="display:flex;align-items:center;gap:10px">
        <div id="lh-logo-preview" style="width:60px;height:60px;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fafafa;flex-shrink:0">
          ${lh.logoDataUrl?`<img src="${lh.logoDataUrl}" style="max-width:100%;max-height:100%;object-fit:contain">`:`<span class="muted" style="font-size:10px">No logo</span>`}
        </div>
        <div style="flex:1">
          <input type="file" accept="image/*" id="lh-logo-file" class="fc" onchange="mktPreviewLetterheadLogo(this)">
          ${lh.logoDataUrl?`<a style="font-size:11px;color:#dc3545;cursor:pointer;display:inline-block;margin-top:4px" onclick="mktRemoveLetterheadLogo()">✕ Remove logo</a>`:''}
        </div>
      </div>
    </div>
    <div class="fg"><label class="lbl">Address</label>
      <textarea class="fc" id="lh-address" rows="2" placeholder="Survey No. 18/209, Industrial Estate, Ichalkaranji, Kolhapur, Maharashtra, India 416115">${esc(lh.address||'')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Phone</label><input class="fc" id="lh-phone" value="${esc(lh.phone||'')}" placeholder="9623457255"></div>
      <div class="fg"><label class="lbl">Email</label><input class="fc" id="lh-email" value="${esc(lh.email||'')}" placeholder="info@vralucast.com"></div>
    </div>
    <div class="fg"><label class="lbl">GST Number</label><input class="fc mono" id="lh-gst" value="${esc(lh.gst||'')}" placeholder="27XXXXX0000X1ZX"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-o" onclick="document.getElementById('mkt-lh-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="mktSaveLetterhead()">💾 Save</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

// Logo + contact block for print letterheads. Once a real logo has been
// uploaded via Letterhead Settings it IS the brand mark (name + icon
// already baked into the artwork), so the placeholder "VR ALUCAST"
// wordmark is dropped — only the uploaded image plus contact details show.
// With no logo uploaded yet, falls back to the plain "VR" lettermark +
// wordmark so print output never shows a broken/empty header.
function mktLogoLockup(lh){
  lh = lh || {};
  const detailsLine = [lh.phone?('Ph: '+lh.phone):'', lh.email, lh.gst?('GSTIN: '+lh.gst):'']
    .filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ');
  const contactLines = [lh.address?esc(lh.address):'', detailsLine].filter(Boolean);
  const contactBlock = contactLines.length
    ? `<div class="co-contact">${contactLines.map(l=>`<span class="cline">${l}</span>`).join('')}</div>` : '';
  if(lh.logoDataUrl){
    return`<div class="brand-lockup">
      <img src="${lh.logoDataUrl}" style="height:52px;max-width:230px;object-fit:contain;flex-shrink:0">
      ${contactBlock?`<div class="brand-div"></div>${contactBlock}`:''}
    </div>`;
  }
  const legacyContact = contactLines.join(' &nbsp;|&nbsp; ');
  return`<div class="brand-lockup">
    <div class="brand-badge"><span>VR</span></div>
    <div class="brand-div"></div>
    <div>
      <div class="brand-word">VR ALUCAST</div>
      <div class="co-sub">High Pressure Die Casting &nbsp;|&nbsp; Ichalkaranji</div>
      ${legacyContact?`<div class="co-contact"><span class="cline">${legacyContact}</span></div>`:''}
    </div>
  </div>`;
}
function mktLetterhead(title, sub, refLine, dateLine, lh){
  return`<div class="pg-hdr">
    ${mktLogoLockup(lh)}
    <div class="rpt-block">
      <div class="rpt-title">${title}</div>
      <div class="rpt-sub">${sub}</div>
      <div class="rpt-num">${refLine}</div>
      <div class="rpt-date">${dateLine}</div>
    </div>
  </div>`;
}
function mktPrintCSS(){
  return`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;font-size:8.6pt;color:#1a1a1a;background:#fff}
@page{size:A4;margin:12mm 13mm 14mm 13mm}
.pg-hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid ${MKT_BRAND.ink};padding-bottom:8px;margin-bottom:10px}
.brand-lockup{display:flex;align-items:stretch;gap:11px}
.brand-badge{width:30px;height:30px;border-radius:6px;background:${MKT_BRAND.amber};display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:center}
.brand-badge span{font-family:'Oswald',Arial,sans-serif;font-weight:700;font-size:12.5px;color:${MKT_BRAND.ink};letter-spacing:-.5px}
.brand-div{width:2px;align-self:stretch;background:${MKT_BRAND.amber}}
.brand-word{font-family:'Oswald',Arial,sans-serif;font-weight:700;font-size:14.5px;letter-spacing:.6px;color:${MKT_BRAND.ink}}
.co-name{font-size:11pt;font-weight:bold}.co-sub{font-size:6.8pt;color:#666;margin-top:2px;letter-spacing:.2px}
.co-contact{display:flex;flex-direction:column;justify-content:center;gap:4px;font-size:6.8pt;color:#8a7550;letter-spacing:.1px}
.co-contact .cline{display:block;line-height:1.3}
.rpt-block{text-align:right}
.rpt-title{font-size:10.5pt;font-weight:800;color:${MKT_BRAND.ink};letter-spacing:.5px}
.rpt-sub{font-size:7.3pt;color:#555;margin-top:1px}
.rpt-num{font-family:'IBM Plex Mono',monospace;font-size:8pt;font-weight:700;color:${MKT_BRAND.amberDeep};margin-top:3px}
.rpt-date{font-size:7pt;color:#666;margin-top:1px}
table.dt{width:100%;border-collapse:collapse;font-size:7.6pt}
table.dt th{background:${MKT_BRAND.header};color:#fff;border:1px solid ${MKT_BRAND.header};padding:4.5px 7px;text-align:left;font-weight:700;letter-spacing:.2px}
table.dt td{border:1px solid #ddd;padding:3.5px 7px;vertical-align:top}
table.dt tr:nth-child(even) td{background:${MKT_BRAND.tint}}
.sec-bar{background:${MKT_BRAND.tint};border-left:3.5px solid ${MKT_BRAND.amber};padding:4px 8px;font-size:7.8pt;font-weight:700;color:${MKT_BRAND.amberDeep};text-transform:uppercase;letter-spacing:.5px;margin:9px 0 4px}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-bottom:8px;border:1px solid ${MKT_BRAND.tintLine};border-radius:4px;overflow:hidden}
.mc{border-right:1px solid ${MKT_BRAND.tintLine};padding:5px 8px;background:#fffdf8}
.mc:last-child{border-right:none}
.mc .ml{font-size:6.3pt;color:#8a7550;text-transform:uppercase;font-weight:700;letter-spacing:.3px}
.mc .mv{font-size:8.5pt;font-weight:700;color:#1a1a1a;margin-top:1px}
.yn-cell{text-align:center;font-weight:bold;font-size:9pt}
.final-box{background:${MKT_BRAND.header};color:#fff;border-radius:6px;padding:14px 16px;margin:9px 0;text-align:right}
.final-box .fl{font-size:7.3pt;color:#f0d3a0;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
.final-box .fv{font-size:18pt;font-weight:800;color:${MKT_BRAND.amber};margin-top:2px}
.final-box .fgst{font-size:7.6pt;color:#f0d3a0;margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.22)}
.pg-ftr{margin-top:10px;padding-top:5px;border-top:1px solid ${MKT_BRAND.tintLine};font-size:6.8pt;color:#888;display:flex;justify-content:space-between}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
}

// ══════════════════════════════════════════════════════
//  ENQUIRY REGISTER
// ══════════════════════════════════════════════════════
// VRA DMS — MARKETING MODULE

function feasChk(cb) {
  const qid = cb.getAttribute('data-qid');
  document.querySelectorAll('.feas-yn[data-qid="' + qid + '"]').forEach(function(el) {
    if (el !== cb) el.checked = false;
  });
}


// ══════════════════════════════════════════════════════
//  MARKETING — ENQUIRY & FEASIBILITY MODULE
// ══════════════════════════════════════════════════════

// ── NUMBERING ─────────────────────────────────────────
async function nextEnqNum(year){
  const y=year||new Date().getFullYear();
  // Count existing entries for this year only
  const all=await db.mktEnquiries.toArray().catch(()=>[]);
  const forYear=all.filter(e=>e.enqNumber&&e.enqNumber.includes(`VRA-MKT-${y}-`));
  const n=forYear.length+1;
  return `VRA-MKT-${y}-${String(n).padStart(3,'0')}`;
}
async function nextFeasNum(enqNumber){
  return `${enqNumber}-FR`;
}

async function mktRefreshEnqNum(editId){
  const y=parseInt(document.getElementById('enq-year')?.value)||new Date().getFullYear();
  const newNum=await nextEnqNum(y);
  const numEl=document.getElementById('enq-num');
  const prevEl=document.getElementById('enq-num-preview');
  if(numEl) numEl.value=newNum;
  if(prevEl) prevEl.textContent=newNum;
}

// ── SEED DEFAULT FEASIBILITY QUESTIONS ────────────────
const MKT_FEAS_SEED = [
  {section:'FEASIBILITY',question:'Is Material feasible for Manufacturing?',order:1},
  {section:'FEASIBILITY',question:'Is machinery suitable for this Grade?',order:2},
  {section:'FEASIBILITY',question:'Is specification / Tolerance achievable?',order:3},
  {section:'FEASIBILITY',question:'Is there any other process or treatment required which is needed to be outsourced?',order:4},
  {section:'FEASIBILITY',question:'Are inspection and testing facilities adequate?',order:5},
  {section:'FEASIBILITY',question:'Is development cost paid by Customer or tooling given by the customer?',order:6},
  {section:'FEASIBILITY',question:'Monthly Requirement Clear?',order:7},
  {section:'FEASIBILITY',question:'Weight of Casting?',order:8},
  {section:'FEASIBILITY',question:'Is Current Spare Capacity Available for this requirement?',order:9},
  {section:'FEASIBILITY',question:'Is Customer Reliable?',order:10},
];

let _mktSeedRunning = false;
async function mktSeedDefaults(){
  if(_mktSeedRunning) return;
  _mktSeedRunning = true;
  try {
    const existing = await db.mktFeasQns.toArray().catch(()=>[]);
    // Check if already correct: exactly 10 questions matching our seed text
    const seedTexts = MKT_FEAS_SEED.map(q=>q.question);
    const existingTexts = existing.map(q=>q.question);
    const alreadyCorrect = existing.length === MKT_FEAS_SEED.length &&
      seedTexts.every(t => existingTexts.includes(t));
    if(alreadyCorrect){ _mktSeedRunning=false; return; }
    // Delete all existing and re-add
    for(const q of existing) await db.mktFeasQns.delete(q.id).catch(()=>{});
    for(const q of MKT_FEAS_SEED) await db.mktFeasQns.add(q);
  } catch(e){ console.log('mktSeed skipped:', e.message); }
  _mktSeedRunning = false;
}

async function mktRenderEnquiries(){
  const [enqs, feases, quotes]=await Promise.all([
    db.mktEnquiries.toArray().catch(()=>[]),
    db.mktFeasibility.toArray().catch(()=>[]),
    db.mktQuotations.toArray().catch(()=>[])
  ]);
  enqs.sort((a,b)=>b.id-a.id);
  const counts={Open:0,Quoted:0,'PO Received':0,Lost:0};
  enqs.forEach(e=>{ if(counts[e.status]!==undefined) counts[e.status]++; });

  // The View FR / Create FR button is decided by what FR records actually
  // exist right now, never by the enquiry's stored feasibilityDone flag —
  // that flag can go stale (e.g. a record deleted outside the normal
  // delete flow) and the button must never show a broken link.
  const byEnq={};
  feases.forEach(f=>{ (byEnq[f.enqId]=byEnq[f.enqId]||[]).push(f); });
  Object.values(byEnq).forEach(list=>list.sort((a,b)=>a.id-b.id));
  mktSyncFeasibilityFlags(enqs, byEnq); // silent background self-heal, not awaited

  // Same self-heal pattern for quotations — show the latest revision for
  // each enquiry, keyed purely off what quote records actually exist.
  const quotesByEnq={};
  quotes.forEach(q=>{ (quotesByEnq[q.enqId]=quotesByEnq[q.enqId]||[]).push(q); });
  Object.values(quotesByEnq).forEach(list=>list.sort((a,b)=>a.revision-b.revision));
  mktSyncQuotationFlags(enqs, quotesByEnq);

  setC(`
  <div class="ph">
    <h2>📋 Enquiry Register</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="mktOpenEnqForm()">+ New Enquiry</button>
      <button class="btn btn-o" onclick="mktPrintEnquiryRegister()">🖨️ Print Register</button>
      <button class="btn btn-o" onclick="mktOpenLetterheadSettings()">🏢 Letterhead</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
    ${[['Open',counts.Open,'bp'],['Quoted',counts.Quoted,'ba'],['PO Received',counts['PO Received'],'ba'],['Lost',counts.Lost,'br']].map(([l,n,cls])=>`
    <div class="card" style="padding:12px 16px">
      <div style="font-size:22px;font-weight:800;color:var(--navy)">${n}</div>
      <div class="muted" style="font-size:12px">${l}</div>
    </div>`).join('')}
  </div>
  <div class="card">
    <div class="ch"><h5>All Enquiries — ${enqs.length} records</h5>
      <span class="muted" style="font-size:11px">VRA-MKT-001 · Enquiry Register</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Enq No.</th><th>Date</th><th>Customer</th><th>Part Name / Details</th>
        <th>Special Req.</th><th>Feasibility</th><th>Quotation</th>
        <th>PO No.</th><th>PO Date</th><th>Status</th><th>Remark</th><th></th>
      </tr></thead>
      <tbody>${enqs.length===0
        ?`<tr><td colspan="13" style="text-align:center;padding:30px;color:#9ca3af">No enquiries yet. Click + New Enquiry to start.</td></tr>`
        :enqs.map(e=>{
          const eQuotes=quotesByEnq[e.id]||[];
          const latestQ=eQuotes[eQuotes.length-1];
          return`<tr>
          <td class="mono" style="color:var(--navy);font-weight:700;white-space:nowrap">${esc(e.enqNumber)}</td>
          <td style="white-space:nowrap">${e.date||'—'}</td>
          <td><strong>${esc(e.customerName)}</strong></td>
          <td>${esc(e.partDetails)}</td>
          <td style="text-align:center">${e.specialReq?`<span class="badge br">YES</span>`:`<span class="badge bd">No</span>`}</td>
          <td style="text-align:center">${(byEnq[e.id]||[])[0]?`<button class="btn btn-o btn-xs" onclick="mktViewFeasibilityById(${byEnq[e.id][0].id})">View FR</button>`:`<button class="btn btn-p btn-xs" onclick="mktCreateFeasibility(${e.id})">+ Create FR</button>`}</td>
          <td style="text-align:center">${latestQ?`<button class="btn btn-o btn-xs" onclick="mktViewQuotation(${latestQ.id})">${mktQuoteStatusBadge(latestQ.status)}</button>`:`<button class="btn btn-p btn-xs" onclick="mktCreateQuotation(${e.id})">+ Create Quote</button>`}</td>
          <td class="mono" style="font-size:11px">${esc(e.poNumber||'—')}</td>
          <td style="white-space:nowrap">${e.poDate||'—'}</td>
          <td>${mktStatusBadge(e.status||'Open')}</td>
          <td style="font-size:11.5px;color:var(--muted)">${esc(e.remark||'')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-o btn-xs" onclick="mktOpenEnqForm(${e.id})">✏️</button>
            <button class="btn btn-r btn-xs" onclick="mktDeleteEnq(${e.id})">🗑️</button>
          </td>
        </tr>`;}).join('')}
      </tbody>
    </table></div>
  </div>`);
}

async function mktOpenEnqForm(id=null){
  const e=id?await db.mktEnquiries.get(id).catch(()=>null):null;
  const curYear=new Date().getFullYear();
  const numYear=e?.enqNumber?parseInt(e.enqNumber.split('-')[2])||curYear:curYear;
  const num=e?e.enqNumber:await nextEnqNum(curYear);
  const ov=document.createElement('div');ov.className='overlay';ov.id='mkt-enq-ov';
  ov.innerHTML=`<div class="modal" style="width:580px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${e?'Edit Enquiry':'New Enquiry'} &nbsp;<span class="mono" style="color:var(--navy);font-size:12px" id="enq-num-preview">${num}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('mkt-enq-ov').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Enquiry Year</label>
        <select class="fc" id="enq-year" onchange="mktRefreshEnqNum(${id||'null'})" ${e?'disabled':''}>
          ${[curYear-3,curYear-2,curYear-1,curYear,curYear+1].map(y=>`<option value="${y}" ${y===numYear?'selected':''}>${y}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="lbl">Enquiry Number ${e?'':'(auto)'}</label>
        <input class="fc mono" id="enq-num" value="${esc(num)}" ${e?'':'readonly'} style="${e?'':'background:#f5f7fd;'}color:var(--navy);font-weight:700" placeholder="Auto-generated"></div>
      <div class="fg"><label class="lbl">Date *</label>
        <input class="fc" type="date" id="enq-date" value="${e?.date||new Date().toISOString().split('T')[0]}"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Customer Name *</label>
        <input class="fc" id="enq-cust" value="${esc(e?.customerName||'')}" placeholder="e.g. M/s Menon Alkop Pvt Ltd"></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Enquiry Details / Part Name & Number *</label>
        <input class="fc" id="enq-part" value="${esc(e?.partDetails||'')}" placeholder="e.g. Cover Guide Plate — Part No. 303435"></div>
      <div class="fg"><label class="lbl">Part Number</label>
        <input class="fc" id="enq-partno" value="${esc(e?.partNumber||'')}" placeholder="e.g. 303435"></div>
      <div class="fg"><label class="lbl">Special Requirement?</label>
        <select class="fc" id="enq-specreq">
          <option value="0" ${!e?.specialReq?'selected':''}>No</option>
          <option value="1" ${e?.specialReq?'selected':''}>Yes</option>
        </select></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Special Requirement Details</label>
        <input class="fc" id="enq-specdetails" value="${esc(e?.specialReqDetails||'')}" placeholder="Describe if any"></div>

      <div class="fg"><label class="lbl">PO Number</label>
        <input class="fc mono" id="enq-po" value="${esc(e?.poNumber||'')}" placeholder="e.g. 24/25-000628"></div>
      <div class="fg"><label class="lbl">PO Date</label>
        <input class="fc" type="date" id="enq-podate" value="${e?.poDate||''}"></div>
      <div class="fg"><label class="lbl">Status</label>
        <select class="fc" id="enq-status">
          ${['Open','Quoted','PO Received','Hold','Lost','Cancelled'].map(s=>`<option value="${s}" ${(e?.status||'Open')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="fg" style="grid-column:span 2"><label class="lbl">Remark</label>
        <input class="fc" id="enq-remark" value="${esc(e?.remark||'')}" placeholder="Any notes"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('mkt-enq-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="mktSaveEnq(${id||'null'})">💾 Save Enquiry</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function mktSaveEnq(id){
  const customerName=document.getElementById('enq-cust').value.trim();
  const partDetails=document.getElementById('enq-part').value.trim();
  if(!customerName||!partDetails){toast('Customer and Part Details are required','d');return;}
  const rec={
    enqNumber:document.getElementById('enq-num').value.trim(),
    date:document.getElementById('enq-date').value,
    customerName, partDetails,
    partNumber:document.getElementById('enq-partno').value.trim(),
    specialReq:document.getElementById('enq-specreq').value==='1',
    specialReqDetails:document.getElementById('enq-specdetails').value.trim(),
    poNumber:document.getElementById('enq-po').value.trim(),
    poDate:document.getElementById('enq-podate').value,
    status:document.getElementById('enq-status').value,
    remark:document.getElementById('enq-remark').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(id){
    await db.mktEnquiries.update(id,rec);
  } else {
    rec.createdAt=new Date().toISOString();
    rec.feasibilityDone=false;
    await db.mktEnquiries.add(rec);
  }
  document.getElementById('mkt-enq-ov').remove();
  toast(`✅ ${rec.enqNumber} saved`);
  mktRenderEnquiries();
}

async function mktDeleteEnq(id){
  const e=await db.mktEnquiries.get(id);
  if(!confirm(`Delete enquiry ${e?.enqNumber} (${e?.customerName})? Linked feasibility review(s) will also be deleted.`)) return;
  // Delete ALL linked feasibility records — an enquiry can have more than
  // one if a duplicate was ever created, and leaving any behind orphans it.
  const linked=await db.mktFeasibility.where('enqId').equals(id).toArray().catch(()=>[]);
  for(const f of linked) await db.mktFeasibility.delete(f.id);
  await db.mktEnquiries.delete(id);
  toast('Deleted','d');
  mktRenderEnquiries();
}

async function mktPrintEnquiryRegister(){
  const enqs=await db.mktEnquiries.toArray().catch(()=>[]);
  enqs.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const today=new Date().toLocaleDateString('en-IN');
  const rows=enqs.map((e,i)=>`<tr>
    <td style="text-align:center">${i+1}</td>
    <td class="mono" style="font-weight:bold;white-space:nowrap">${e.enqNumber}</td>
    <td>${e.date||'—'}</td>
    <td><strong>${e.customerName}</strong></td>
    <td>${e.partDetails}</td>
    <td style="text-align:center;font-weight:bold">${e.feasibilityDone?'Yes':'—'}</td>
    <td>${e.specialReq?'Yes — '+e.specialReqDetails:'No'}</td>
    <td>${e.poNumber||'—'}</td>
    <td>${e.poDate||'—'}</td>
    <td style="font-weight:bold">${e.status||'Open'}</td>
    <td>${e.remark||''}</td>
  </tr>`).join('');
  const lh=await mktGetLetterhead();
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Enquiry Register</title>
  <style>${mktPrintCSS()}</style></head><body>
  ${mktLetterhead('NEW ENQUIRY REGISTER','Marketing Department','VRA-MKT-001','Date: '+today, lh)}
  <table class="dt">
    <thead><tr>
      <th style="width:24px">#</th><th style="white-space:nowrap">Enq No.</th><th>Date</th>
      <th>Customer Name</th><th>Enquiry Details / Part</th>
      <th>Feasibility</th><th>Special Req.</th>
      <th>PO No.</th><th>PO Date</th>
      <th>Status</th><th>Remark</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="12" style="text-align:center;padding:10px">No enquiries</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Total: ${enqs.length} &nbsp;|&nbsp; VRA-MKT-001 &nbsp;|&nbsp; V R Alucast — Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  FEASIBILITY REVIEWS LIST
// ══════════════════════════════════════════════════════
async function mktRenderFeasibility(){
  await mktSeedDefaults(); // ensure questions are up to date
  const feases=await db.mktFeasibility.toArray().catch(()=>[]);
  const enqs=await db.mktEnquiries.toArray().catch(()=>[]);
  feases.sort((a,b)=>b.id-a.id);

  setC(`
  <div class="ph">
    <h2>🔍 Feasibility Reviews</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-o" onclick="mktFindDuplicates()">🔍 Find Duplicates</button>
      <button class="btn btn-o" onclick="mktManageQuestions()">⚙️ Manage Questions</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><h5>All Feasibility Reviews — ${feases.length} records</h5>
      <span class="muted" style="font-size:11px">VRA-MKT-002 · Feasibility Report</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>FR Number</th><th>Enquiry No.</th><th>Customer</th><th>Part Name</th>
        <th>Date</th><th>Reviewed By</th><th>Result</th><th>Remarks</th><th></th>
      </tr></thead>
      <tbody>${feases.length===0
        ?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">No feasibility reviews yet. Create one from the Enquiry Register.</td></tr>`
        :feases.map(f=>{
          const e=enqs.find(x=>x.id===f.enqId);
          return`<tr>
            <td class="mono" style="color:var(--navy);font-weight:700">${esc(f.feasNumber)}</td>
            <td class="mono" style="font-size:11px">${esc(e?.enqNumber||'—')}</td>
            <td><strong>${esc(f.customerName||e?.customerName||'—')}</strong></td>
            <td>${esc(f.partName||e?.partDetails||'—')}</td>
            <td>${f.date||'—'}</td>
            <td>${esc(f.reviewedBy||'Akshay Dake')}</td>
            <td>${mktResultBadge(f.result)}</td>
            <td style="font-size:11.5px;color:var(--muted)">${esc(f.specialRemark||'')}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-o btn-xs" onclick="mktViewFeasibilityById(${f.id})">✏️ Edit</button>
              <button class="btn btn-p btn-xs" onclick="mktPrintFeasibility(${f.id})">🖨️</button>
              <button class="btn btn-r btn-xs" onclick="mktDeleteFeasibility(${f.id})">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  CREATE / EDIT FEASIBILITY REVIEW
// ══════════════════════════════════════════════════════
async function mktCreateFeasibility(enqId){
  const e=await db.mktEnquiries.get(enqId);
  // The enquiry's own feasibilityId is the source of truth — if it's already
  // set, always reopen that exact record instead of re-deriving by enqId,
  // so "View FR" and "Edit" (Feasibility Reviews list) never diverge.
  if(e.feasibilityId){ mktViewFeasibilityById(e.feasibilityId); return; }
  // Legacy fallback: enquiry predates feasibilityId tracking. Pin whatever
  // is found so future lookups are stable.
  const existing=await db.mktFeasibility.where('enqId').equals(enqId).first().catch(()=>null);
  if(existing){ await db.mktEnquiries.update(enqId,{feasibilityId:existing.id}); mktViewFeasibilityById(existing.id); return; }
  const feasNum=await nextFeasNum(e.enqNumber);
  // Create blank record
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const answers={};
  qns.forEach(q=>{ answers[q.id]={yn:'',comment:''}; });
  const id=await db.mktFeasibility.add({
    enqId, feasNumber:feasNum,
    customerName:e.customerName, partName:e.partDetails,
    partNumber:e.partNumber||'', date:new Date().toISOString().split('T')[0],
    reviewedBy:'Akshay Dake', result:'', specialRemark:'',
    modification:'New', answers,
    createdAt:new Date().toISOString()
  });
  await db.mktEnquiries.update(enqId,{feasibilityDone:true, feasibilityId:id});
  mktViewFeasibilityById(id);
}

async function mktViewFeasibilityById(id){
  const f=await db.mktFeasibility.get(id).catch(()=>null);
  if(!f){toast('Not found','d');return;}
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  qns.sort((a,b)=>a.order-b.order);
  // Derive sections dynamically from current questions
  const sections=[...new Set(qns.map(q=>q.section))];
  const answers=f.answers||{};

  function qSection(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    if(!qs.length) return'';
    return`<div class="card" style="margin-bottom:12px">
      <div class="ch" style="background:#f0f3f9"><h5>${sec}</h5></div>
      <div class="tw"><table>
        <thead><tr><th style="width:28px">#</th><th>Check Point</th><th style="width:90px;text-align:center">Y / N</th><th>Comment</th></tr></thead>
        <tbody>${qs.map((q,i)=>{
          const ans=answers[q.id]||{yn:'',comment:''};
          return`<tr>
            <td style="text-align:center;color:var(--muted)">${i+1}</td>
            <td style="font-size:12.5px">${esc(q.question)}</td>
            <td style="text-align:center;padding:4px">
              <div style="display:flex;align-items:center;gap:4px">
                <label style="display:flex;align-items:center;gap:2px;cursor:pointer"><input type="checkbox" class="feas-yn" data-qid="${q.id}" data-val="Y" ${ans.yn==='Y'?'checked':''} onchange="feasChk(this)" style="width:14px;height:14px;accent-color:#15803d"><span style="font-size:11px;color:#15803d;font-weight:700">Y</span></label>
                <label style="display:flex;align-items:center;gap:2px;cursor:pointer"><input type="checkbox" class="feas-yn" data-qid="${q.id}" data-val="N" ${ans.yn==='N'?'checked':''} onchange="feasChk(this)" style="width:14px;height:14px;accent-color:#dc2626"><span style="font-size:11px;color:#dc2626;font-weight:700">N</span></label>
                <label style="display:flex;align-items:center;gap:2px;cursor:pointer"><input type="checkbox" class="feas-yn" data-qid="${q.id}" data-val="NA" ${ans.yn==='NA'?'checked':''} onchange="feasChk(this)" style="width:14px;height:14px;accent-color:#6b7280"><span style="font-size:11px;color:#6b7280;font-weight:700">N/A</span></label>
              </div>
            </td>
            <td style="padding:4px">
              <input class="fc feas-comment" data-qid="${q.id}" value="${esc(ans.comment||'')}"
                style="font-size:11.5px;padding:4px 7px" placeholder="Comment if any">
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  }

  setC(`
  <div class="ph">
    <h2>🔍 Feasibility Review — <span class="mono" style="color:var(--navy)">${esc(f.feasNumber)}</span></h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-g" onclick="mktSaveFeasibility(${id})">💾 Save</button>
      <button class="btn btn-p" onclick="mktPrintFeasibility(${id})">🖨️ Print FR</button>
      <button class="btn btn-o" onclick="nav('mkt-enquiries')">← Enquiry Register</button>
    </div>
  </div>

  <!-- Header details -->
  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Review Details</h5>
      <span class="muted" style="font-size:11px">VRA-MKT-002</span>
    </div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="fg"><label class="lbl">FR Number</label>
          <input class="fc mono" id="fr-num" value="${esc(f.feasNumber)}" readonly style="background:#f5f7fd;color:var(--navy);font-weight:700"></div>
        <div class="fg"><label class="lbl">Date</label>
          <input class="fc" type="date" id="fr-date" value="${f.date||''}"></div>
        <div class="fg"><label class="lbl">Modification / New</label>
          <select class="fc" id="fr-modtype">
            <option value="New" ${(f.modification||'New')==='New'?'selected':''}>New</option>
            <option value="Modification" ${f.modification==='Modification'?'selected':''}>Modification</option>
          </select></div>
        <div class="fg"><label class="lbl">Customer</label>
          <input class="fc" id="fr-cust" value="${esc(f.customerName||'')}"></div>
        <div class="fg"><label class="lbl">Part Name</label>
          <input class="fc" id="fr-part" value="${esc(f.partName||'')}"></div>
        <div class="fg"><label class="lbl">Part Number</label>
          <input class="fc mono" id="fr-partno" value="${esc(f.partNumber||'')}"></div>
        <div class="fg"><label class="lbl">Reviewed By</label>
          <input class="fc" id="fr-rev" value="${esc(f.reviewedBy||'Akshay Dake')}"></div>
        <div class="fg"><label class="lbl">Overall Result</label>
          <select class="fc" id="fr-result" style="font-weight:700">
            <option value="" ${!f.result?'selected':''}>— Pending —</option>
            <option value="FEASIBLE" ${f.result==='FEASIBLE'?'selected':''}>FEASIBLE</option>
            <option value="NOT FEASIBLE" ${f.result==='NOT FEASIBLE'?'selected':''}>NOT FEASIBLE</option>
          </select></div>
        <div class="fg"><label class="lbl">Reference</label>
          <input class="fc mono" id="fr-ref" value="${esc(f.reference||f.feasNumber)}" placeholder="Enquiry / drawing ref"></div>
      </div>
      <div class="fg" style="margin-top:4px"><label class="lbl">Special Remark</label>
        <input class="fc" id="fr-remark" value="${esc(f.specialRemark||'')}" placeholder="Any special remark"></div>
    </div>
  </div>

  <!-- Questions by section -->
  ${sections.map(s=>qSection(s)).join('')}

  <!-- Conclusion card -->
  <div class="card" style="margin-bottom:12px">
    <div class="ch" style="background:#f0f3f9"><h5>CONCLUSION</h5></div>
    <div class="cb" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:600">Overall Result:</div>
      ${f.result?`<span style="font-size:15px;font-weight:800;padding:4px 18px;border:2px solid #000;letter-spacing:1px">${f.result}</span>`:'<span class="muted">Not set — select in Review Details above</span>'}
      <div style="font-size:12.5px;color:var(--muted)">Reviewed By: <strong>${esc(f.reviewedBy||'Akshay Dake')}</strong></div>
    </div>
  </div>

  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
    <button class="btn btn-g btn-sm" onclick="mktSaveFeasibility(${id})">💾 Save All Changes</button>
    <button class="btn btn-p btn-sm" onclick="mktPrintFeasibility(${id})">🖨️ Print</button>
  </div>`);
}

async function mktSaveFeasibility(id){
  const answers={};
  // Only read checked checkboxes — data-val has the Y/N/NA value
  document.querySelectorAll('.feas-yn:checked').forEach(chk=>{
    const qid=parseInt(chk.dataset.qid);
    if(!answers[qid]) answers[qid]={yn:'',comment:''};
    answers[qid].yn=chk.dataset.val;
  });
  document.querySelectorAll('.feas-comment').forEach(inp=>{
    const qid=parseInt(inp.dataset.qid);
    if(!answers[qid]) answers[qid]={yn:'',comment:''};
    answers[qid].comment=inp.value.trim();
  });
  await db.mktFeasibility.update(id,{
    date:document.getElementById('fr-date').value,
    modification:document.getElementById('fr-modtype').value,
    customerName:document.getElementById('fr-cust').value.trim(),
    partName:document.getElementById('fr-part').value.trim(),
    partNumber:document.getElementById('fr-partno').value.trim(),
    reviewedBy:document.getElementById('fr-rev').value.trim(),
    result:document.getElementById('fr-result').value,
    reference:document.getElementById('fr-ref').value.trim(),
    specialRemark:document.getElementById('fr-remark').value.trim(),
    answers, updatedAt:new Date().toISOString()
  });
  toast('✅ Feasibility review saved');
}

// After a feasibility review is deleted, re-derive the enquiry's pinned
// feasibilityId from whatever's left. If a duplicate still exists, pin it
// (rather than wiping the link) so View FR / Edit keep agreeing.
async function mktReconcileFeasibilityLink(enqId){
  if(!enqId) return;
  const remaining=await db.mktFeasibility.where('enqId').equals(enqId).toArray().catch(()=>[]);
  if(remaining.length===0){
    await db.mktEnquiries.update(enqId,{feasibilityDone:false, feasibilityId:null});
  } else {
    remaining.sort((a,b)=>a.id-b.id);
    await db.mktEnquiries.update(enqId,{feasibilityDone:true, feasibilityId:remaining[0].id});
  }
}

async function mktDeleteFeasibility(id){
  const f=await db.mktFeasibility.get(id);
  if(!confirm(`Delete feasibility review ${f?.feasNumber}?`)) return;
  await db.mktFeasibility.delete(id);
  await mktReconcileFeasibilityLink(f?.enqId);
  toast('Deleted','d');
  mktRenderFeasibility();
}

// Silent background self-heal: the enquiry list already knows exactly
// which FR records exist (byEnq), so quietly correct any stale
// feasibilityDone/feasibilityId left over from a record that was removed
// outside the normal delete flow. No UI, no user action — the register's
// View FR / Create FR button never depends on this running first.
async function mktSyncFeasibilityFlags(enqs, byEnq){
  for(const e of enqs){
    const list=byEnq[e.id]||[];
    const correctId=list.length>0?list[0].id:null;
    const correctDone=list.length>0;
    if(e.feasibilityDone!==correctDone || e.feasibilityId!==correctId){
      await db.mktEnquiries.update(e.id,{feasibilityDone:correctDone, feasibilityId:correctId}).catch(()=>{});
    }
  }
}

// ══════════════════════════════════════════════════════
//  DUPLICATE FEASIBILITY REVIEW FINDER
// ══════════════════════════════════════════════════════
async function mktFindDuplicates(){
  const [feases, enqs] = await Promise.all([
    db.mktFeasibility.toArray().catch(()=>[]),
    db.mktEnquiries.toArray().catch(()=>[])
  ]);
  const enqIds=new Set(enqs.map(e=>e.id));
  const byEnq={};
  const orphans=[];
  feases.forEach(f=>{
    if(!enqIds.has(f.enqId)){ orphans.push(f); return; }
    (byEnq[f.enqId]=byEnq[f.enqId]||[]).push(f);
  });
  const dupGroups=Object.entries(byEnq).filter(([,list])=>list.length>1);

  function answeredCount(f){
    const a=f.answers||{};
    return Object.values(a).filter(x=>x&&x.yn).length;
  }

  function renderGroups(){
    if(dupGroups.length===0 && orphans.length===0){
      return`<div class="alert al-s">✅ No duplicate or orphaned feasibility reviews found. Every FR record maps to exactly one existing enquiry.</div>`;
    }
    let html='';
    if(orphans.length>0){
      html+=`<div class="card" style="margin-bottom:12px;padding:0">
        <div class="ch" style="background:#fde8e8">
          <h5>⚠️ Orphaned FR records — linked enquiry no longer exists</h5>
          <span class="muted" style="font-size:11px">${orphans.length} record(s)</span>
        </div>
        <div class="tw"><table>
          <thead><tr><th>Record ID</th><th>FR Number</th><th>Customer</th><th>Part</th><th>Date</th><th>Result</th><th></th></tr></thead>
          <tbody>${orphans.map(f=>`<tr>
            <td class="mono">${f.id}</td>
            <td class="mono">${esc(f.feasNumber||'—')}</td>
            <td>${esc(f.customerName||'—')}</td>
            <td>${esc(f.partName||'—')}</td>
            <td>${f.date||'—'}</td>
            <td>${mktResultBadge(f.result)}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-r btn-xs" onclick="mktDeleteOrphan(${f.id})">🗑️ Delete orphan</button>
            </td>
          </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
    }
    if(dupGroups.length>0){
      html+=dupGroups.map(([enqId,list])=>{
        const e=enqs.find(x=>String(x.id)===String(enqId));
        list.sort((a,b)=>a.id-b.id);
        return`<div class="card" style="margin-bottom:12px;padding:0">
          <div class="ch" style="background:#fff4e5">
            <h5>${esc(e?.enqNumber||'—')} · ${esc(e?.customerName||'—')} · ${esc(e?.partDetails||'—')}</h5>
            <span class="muted" style="font-size:11px">${list.length} duplicate FR records</span>
          </div>
          <div class="tw"><table>
            <thead><tr><th>Record ID</th><th>FR Number</th><th>Date</th><th>Reviewed By</th><th>Result</th><th>Answers Filled</th><th></th></tr></thead>
            <tbody>${list.map(f=>`<tr>
              <td class="mono">${f.id}</td>
              <td class="mono">${esc(f.feasNumber||'—')}</td>
              <td>${f.date||'—'}</td>
              <td>${esc(f.reviewedBy||'—')}</td>
              <td>${mktResultBadge(f.result)}</td>
              <td>${answeredCount(f)}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-o btn-xs" onclick="mktViewFeasibilityById(${f.id})">View</button>
                <button class="btn btn-r btn-xs" onclick="mktDeleteDuplicate(${f.id},'${enqId}')">🗑️ Delete this one</button>
              </td>
            </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;
      }).join('');
    }
    return html;
  }

  const ov=document.createElement('div');ov.className='overlay';ov.id='mkt-dup-ov';
  ov.innerHTML=`<div class="modal" style="width:820px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>🔍 Duplicate &amp; Orphaned Feasibility Reviews</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('mkt-dup-ov').remove()">✕ Close</button>
    </div>
    <div class="alert al-w" style="margin-bottom:12px">Orphaned records (red) point at an enquiry that's already been deleted — safe to remove. Duplicate groups (orange) are enquiries with more than one FR — compare each copy and delete the wrong one; the last one remaining is automatically pinned so "View FR" and "Edit" always agree.</div>
    <div id="mkt-dup-body">${renderGroups()}</div>
  </div>`;
  document.body.appendChild(ov);
}

async function mktDeleteDuplicate(id, enqId){
  const f=await db.mktFeasibility.get(id);
  if(!confirm(`Delete duplicate feasibility review ${f?.feasNumber} (record #${id})?\nThis cannot be undone.`)) return;
  await db.mktFeasibility.delete(id);
  await mktReconcileFeasibilityLink(Number(enqId));
  toast('Duplicate deleted','d');
  document.getElementById('mkt-dup-ov')?.remove();
  mktFindDuplicates();
}

async function mktDeleteOrphan(id){
  const f=await db.mktFeasibility.get(id);
  if(!confirm(`Delete orphaned feasibility review ${f?.feasNumber} (record #${id})?\nIts linked enquiry no longer exists, so this record is unreachable from anywhere in the app.`)) return;
  await db.mktFeasibility.delete(id);
  toast('Orphan deleted','d');
  document.getElementById('mkt-dup-ov')?.remove();
  mktFindDuplicates();
}

// ══════════════════════════════════════════════════════
//  MANAGE FEASIBILITY QUESTIONS
// ══════════════════════════════════════════════════════
async function mktManageQuestions(){
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const sections=[...new Set(qns.map(q=>q.section))];

  function qList(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    return`<div style="margin-bottom:14px">
      <div style="font-weight:700;font-size:12px;color:var(--navy);padding:5px 8px;background:#f0f3f9;border-left:3px solid var(--navy);margin-bottom:6px">${sec} (${qs.length})</div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px">
        ${qs.length===0?`<div class="muted" style="padding:10px">No questions in this section.</div>`:
        qs.map(q=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px">${esc(q.question)}</span>
          <button class="btn btn-r btn-xs" onclick="mktDeleteQuestion(${q.id})">🗑️</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:5px">
        <input class="fc" id="new-q-${sec.replace(/\s/g,'-')}" placeholder="Add new question to ${sec}..." style="font-size:12px">
        <button class="btn btn-p btn-sm" onclick="mktAddQuestion('${sec}')">+ Add</button>
      </div>
    </div>`;
  }

  const ov=document.createElement('div');ov.className='overlay';ov.id='mkt-qn-ov';
  ov.innerHTML=`<div class="modal" style="width:600px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>⚙️ Manage Feasibility Questions</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('mkt-qn-ov').remove()">✕ Close</button>
    </div>
    <div class="alert al-w" style="margin-bottom:12px">Changes apply to <strong>new</strong> feasibility reviews. Existing saved answers are not affected.</div>
    <div id="mkt-qn-body">
      ${sections.map(s=>qList(s)).join('')}
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function mktAddQuestion(section){
  const inputId=`new-q-${section.replace(/\s/g,'-')}`;
  const name=document.getElementById(inputId)?.value.trim();
  if(!name){toast('Enter a question','d');return;}
  const existing=await db.mktFeasQns.where('section').equals(section).count().catch(()=>0);
  await db.mktFeasQns.add({section,question:name,order:existing+1});
  toast(`✅ Question added to ${section}`);
  document.getElementById(inputId).value='';
  // Refresh modal body
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const sections=[...new Set(qns.map(q=>q.section))];
  function qList(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    return`<div style="margin-bottom:14px">
      <div style="font-weight:700;font-size:12px;color:var(--navy);padding:5px 8px;background:#f0f3f9;border-left:3px solid var(--navy);margin-bottom:6px">${sec} (${qs.length})</div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px">
        ${qs.length===0?`<div class="muted" style="padding:10px">No questions.</div>`:
        qs.map(q=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px">${esc(q.question)}</span>
          <button class="btn btn-r btn-xs" onclick="mktDeleteQuestion(${q.id})">🗑️</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:5px">
        <input class="fc" id="new-q-${sec.replace(/\s/g,'-')}" placeholder="Add new question to ${sec}..." style="font-size:12px">
        <button class="btn btn-p btn-sm" onclick="mktAddQuestion('${sec}')">+ Add</button>
      </div>
    </div>`;
  }
  const body=document.getElementById('mkt-qn-body');
  if(body) body.innerHTML=sections.map(s=>qList(s)).join('');
}

async function mktDeleteQuestion(id){
  const q=await db.mktFeasQns.get(id);
  if(!confirm(`Remove question: "${q?.question}"?`)) return;
  await db.mktFeasQns.delete(id);
  toast('Question removed','d');
  // Refresh modal
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const sections=[...new Set(qns.map(q=>q.section))];
  function qList(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    return`<div style="margin-bottom:14px">
      <div style="font-weight:700;font-size:12px;color:var(--navy);padding:5px 8px;background:#f0f3f9;border-left:3px solid var(--navy);margin-bottom:6px">${sec} (${qs.length})</div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px">
        ${qs.length===0?`<div class="muted" style="padding:10px">No questions.</div>`:
        qs.map(q=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px">${esc(q.question)}</span>
          <button class="btn btn-r btn-xs" onclick="mktDeleteQuestion(${q.id})">🗑️</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:5px">
        <input class="fc" id="new-q-${sec.replace(/\s/g,'-')}" placeholder="Add new question to ${sec}..." style="font-size:12px">
        <button class="btn btn-p btn-sm" onclick="mktAddQuestion('${sec}')">+ Add</button>
      </div>
    </div>`;
  }
  const body=document.getElementById('mkt-qn-body');
  if(body) body.innerHTML=sections.map(s=>qList(s)).join('');
}

// ══════════════════════════════════════════════════════
//  PRINT — FEASIBILITY REVIEW
// ══════════════════════════════════════════════════════
async function mktPrintFeasibility(id){
  const f=await db.mktFeasibility.get(id).catch(()=>null);
  if(!f){toast('Not found','d');return;}
  const qns=await db.mktFeasQns.toArray().catch(()=>[]);
  const answers=f.answers||{};
  const sections=[...new Set(qns.map(q=>q.section))];
  const today=new Date().toLocaleDateString('en-IN');

  function secBlock(sec){
    const qs=qns.filter(q=>q.section===sec).sort((a,b)=>a.order-b.order);
    if(!qs.length) return'';
    const rows=qs.map((q,i)=>{
      const ans=answers[q.id]||{};
      const yn=ans.yn||'';
      return`<tr>
        <td style="text-align:center;width:24px">${i+1}</td>
        <td>${q.question}</td>
        <td class="yn-cell" style="color:${yn==='Y'?'#14532d':yn==='N'?'#7f1d1d':'#555'}">${yn||'—'}</td>
        <td>${ans.comment||''}</td>
      </tr>`;
    }).join('');
    return`<div class="sec-bar">${sec}</div>
    <table class="dt" style="margin-bottom:2px">
      <thead><tr><th style="width:24px">#</th><th>Check Point</th><th style="width:55px;text-align:center">Y / N</th><th style="width:200px">Comment</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  const lh=await mktGetLetterhead();
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${f.feasNumber}</title>
  <style>${mktPrintCSS()}</style></head><body>
  ${mktLetterhead('NEW ENQUIRY FEASIBILITY REVIEW','Marketing Department', f.feasNumber, 'VRA-MKT-002 &nbsp;|&nbsp; '+today, lh)}

  <div class="meta-grid" style="margin-bottom:7px">
    <div class="mc"><div class="ml">FR Number</div><div class="mv">${f.feasNumber}</div></div>
    <div class="mc"><div class="ml">Date</div><div class="mv">${f.date||'—'}</div></div>
    <div class="mc"><div class="ml">Modification / New</div><div class="mv">${f.modification||'New'}</div></div>
    <div class="mc"><div class="ml">Reference</div><div class="mv">${f.reference||f.feasNumber}</div></div>
    <div class="mc" style="grid-column:span 2"><div class="ml">Customer</div><div class="mv">M/s ${f.customerName}</div></div>
    <div class="mc"><div class="ml">Part Name</div><div class="mv">${f.partName}</div></div>
    <div class="mc"><div class="ml">Part Number</div><div class="mv">${f.partNumber||'—'}</div></div>
  </div>

  ${sections.map(s=>secBlock(s)).join('')}

  <div class="sec-bar">CONCLUSION</div>
  <table class="dt" style="margin-bottom:8px">
    <tbody>
      <tr>
        <td style="width:40%;font-weight:bold">New enquiry feasibility result:</td>
        <td style="font-weight:800;font-size:11pt;color:${f.result==='FEASIBLE'?'#14532d':f.result==='NOT FEASIBLE'?'#7f1d1d':'#555'}">${f.result||'PENDING'}</td>
      </tr>
      <tr><td style="font-weight:bold">Special Remark:</td><td>${f.specialRemark||'—'}</td></tr>
      <tr><td style="font-weight:bold">Reviewed By:</td><td>${f.reviewedBy||'Akshay Dake'}</td></tr>
    </tbody>
  </table>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:8pt;margin-top:8px">
    <div style="border:1px solid #000;padding:7px"><strong>Reviewed By:</strong> ${f.reviewedBy||'Akshay Dake'}<br><br>Signature: _________________________&nbsp;&nbsp;&nbsp; Date: ______________</div>
    <div style="border:1px solid #000;padding:7px"><strong>Approved By:</strong> Akshay Dake<br><br>Signature: _________________________&nbsp;&nbsp;&nbsp; Date: ______________</div>
  </div>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">VRA-MKT-002 &nbsp;|&nbsp; V R Alucast — Confidential</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════
//  MARKETING — QUOTATION MODULE
// ══════════════════════════════════════════════════════

const MKT_TOOLING_CATEGORIES = ['Die Cost','Machining Fixture','Check Gauge','Leak Test Instrument','Other Tooling / CAPEX'];

// In-memory working copy of tooling rows for the quote currently open in the
// editor, plus whether that quote is editable. Kept outside the DOM so rows
// can be added/removed without losing values already typed into other rows.
let _mktToolingItems = [];
let _mktQuoteEditable = true;

function num(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
function mktINR(n){ return num(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function gv(id){ const el=document.getElementById(id); return el?el.value:''; }
function setTxt(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }

function mktQuoteStatusBadge(s){
  const m={Draft:'bd',Submitted:'bp',Approved:'ba',Rejected:'br',Superseded:'bs'};
  return`<span class="badge ${m[s]||'bd'}">${s||'Draft'}</span>`;
}
function mktQuoteEditable(status){ return status==='Draft'||status==='Rejected'; }

function mktQuoteDefaultInputs(){
  return {
    shotWeight:0, netWeight:0, meltingLossPct:0, rawMaterialCostPerKg:0, inventoryCarryingPct:0,
    pdcTonnage:0, cavities:1, shotRate:0,
    fettling:0, trimming:0, shotBlasting:0,
    cncCycleTimeMin:0, cncCostPerHour:0, vmcCycleTimeMin:0, vmcCostPerHour:0,
    drilling:0, leakTest:0, inspection:0,
    castingRejectionPct:0, packing:0, transportation:0,
    profitOverheadsPct:0.10, gstPct:0.18
  };
}

// ── COST ENGINE — mirrors the "Process Quote" Excel sheet formulas exactly ──
function mktCalcQuote(q){
  const inp=q.inputs||{};
  const netWeight=num(inp.netWeight);
  const meltingLossPct=num(inp.meltingLossPct);
  const totalProductWeight=netWeight+(netWeight*meltingLossPct);
  const rawMaterialCostPerKg=num(inp.rawMaterialCostPerKg);
  const inventoryCarryingPct=num(inp.inventoryCarryingPct);
  const inventoryCarryingCost=totalProductWeight*rawMaterialCostPerKg*inventoryCarryingPct;
  const totalRawMaterialCost=(rawMaterialCostPerKg*totalProductWeight)+inventoryCarryingCost; // (A)

  const cavities=num(inp.cavities)||1;
  const shotRate=num(inp.shotRate);
  const actualShotRate=shotRate/cavities; // (B)

  const cncCost=(num(inp.cncCostPerHour)/60)*num(inp.cncCycleTimeMin);
  const vmcCost=(num(inp.vmcCostPerHour)/60)*num(inp.vmcCycleTimeMin);
  const otherProcessCost=num(inp.fettling)+num(inp.trimming)+num(inp.shotBlasting)+cncCost+vmcCost+num(inp.drilling)+num(inp.leakTest)+num(inp.inspection); // (C)

  const totalProcessCost=actualShotRate+otherProcessCost; // B+C
  const castingRejectionAmt=actualShotRate*num(inp.castingRejectionPct);
  const packing=num(inp.packing);
  const transportation=num(inp.transportation);
  const profitOverheadsAmt=totalProcessCost*num(inp.profitOverheadsPct);

  const finalCostPerPart=totalProcessCost+castingRejectionAmt+packing+transportation+profitOverheadsAmt+totalRawMaterialCost;
  const gstPct=num(inp.gstPct);
  const finalCostWithGst=finalCostPerPart*(1+gstPct);

  const toolingItems=q.toolingItems||[];
  const toolingTotal=toolingItems.reduce((s,t)=>s+num(t.cost),0);
  let toolingPerPiece=0, finalWithTooling=0;
  if(q.amortizeEnabled && num(q.amortizeQty)>0){
    toolingPerPiece=toolingTotal/num(q.amortizeQty);
    finalWithTooling=finalCostPerPart+toolingPerPiece;
  }

  return {totalProductWeight,inventoryCarryingCost,totalRawMaterialCost,actualShotRate,cncCost,vmcCost,
    otherProcessCost,totalProcessCost,castingRejectionAmt,profitOverheadsAmt,finalCostPerPart,finalCostWithGst,
    toolingTotal,toolingPerPiece,finalWithTooling};
}

// ── NUMBERING — quote number stays fixed across all revisions of a quote;
//    the `revision` field (0,1,2…) tracks which edition is being viewed ──
async function nextQuoteFamily(enqNumber){
  return `${enqNumber}-QT`;
}

// ── ENQUIRY ↔ QUOTATION LINK SELF-HEAL (mirrors mktSyncFeasibilityFlags) ──
async function mktSyncQuotationFlags(enqs, quotesByEnq){
  for(const e of enqs){
    const list=quotesByEnq[e.id]||[];
    const correctId=list.length>0?list[list.length-1].id:null; // highest revision
    const correctDone=list.length>0;
    if(e.quotationDone!==correctDone || e.quotationId!==correctId){
      await db.mktEnquiries.update(e.id,{quotationDone:correctDone, quotationId:correctId}).catch(()=>{});
    }
  }
}

async function updateQcount(){
  const quotes=await db.mktQuotations.toArray().catch(()=>[]);
  const n=quotes.filter(q=>q.status==='Submitted').length;
  const el=document.getElementById('qcount');
  if(!el) return;
  el.style.display=n?'inline':'none'; if(n) el.textContent=n;
}

// ══════════════════════════════════════════════════════
//  QUOTATIONS LIST
// ══════════════════════════════════════════════════════
async function mktRenderQuotations(){
  const quotes=await db.mktQuotations.toArray().catch(()=>[]);
  const byFamily={};
  quotes.forEach(q=>{ (byFamily[q.quoteFamily]=byFamily[q.quoteFamily]||[]).push(q); });
  const current=Object.values(byFamily).map(list=>{
    list.sort((a,b)=>a.revision-b.revision);
    return list[list.length-1];
  }).sort((a,b)=>b.id-a.id);

  const counts={Draft:0,Submitted:0,Approved:0,Rejected:0};
  current.forEach(q=>{ if(counts[q.status]!==undefined) counts[q.status]++; });

  setC(`
  <div class="ph">
    <h2>💰 Quotations</h2>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="muted" style="font-size:11px">Create a quote from an enquiry in the Enquiry Register</span>
      <button class="btn btn-o" onclick="mktOpenLetterheadSettings()">🏢 Letterhead</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
    ${[['Draft',counts.Draft,'bd'],['Pending Approval',counts.Submitted,'bp'],['Approved',counts.Approved,'ba'],['Rejected',counts.Rejected,'br']].map(([l,n])=>`
    <div class="card" style="padding:12px 16px">
      <div style="font-size:22px;font-weight:800;color:var(--navy)">${n}</div>
      <div class="muted" style="font-size:12px">${l}</div>
    </div>`).join('')}
  </div>
  <div class="card">
    <div class="ch"><h5>All Quotations — ${current.length} quote(s), ${quotes.length} total revision(s)</h5>
      <span class="muted" style="font-size:11px">Showing current revision of each quote</span>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Quote No.</th><th>Rev</th><th>Date</th><th>Customer</th><th>Part</th>
        <th>Final Cost/Part</th><th>Status</th><th>Created By</th><th>Approved By</th><th></th>
      </tr></thead>
      <tbody>${current.length===0
        ?`<tr><td colspan="10" style="text-align:center;padding:30px;color:#9ca3af">No quotations yet. Create one from the Enquiry Register.</td></tr>`
        :current.map(q=>{
          const calc=mktCalcQuote(q);
          const revCount=(byFamily[q.quoteFamily]||[]).length;
          return`<tr>
            <td class="mono" style="color:var(--navy);font-weight:700">${esc(q.quoteFamily)}</td>
            <td style="text-align:center">Rev ${q.revision}</td>
            <td style="white-space:nowrap">${q.date||'—'}</td>
            <td><strong>${esc(q.customerName)}</strong></td>
            <td>${esc(q.partName)}</td>
            <td class="mono" style="font-weight:700">₹${mktINR(calc.finalCostPerPart)}</td>
            <td>${mktQuoteStatusBadge(q.status)}</td>
            <td style="font-size:11.5px">${esc(q.createdBy||'—')}</td>
            <td style="font-size:11.5px">${esc(q.approvedBy||'—')}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-o btn-xs" onclick="mktViewQuotation(${q.id})">Open</button>
              ${revCount>1?`<button class="btn btn-o btn-xs" onclick="mktRevisionHistory('${esc(q.quoteFamily)}')">History</button>`:''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`);
}

// ══════════════════════════════════════════════════════
//  CREATE QUOTATION (from Enquiry Register)
// ══════════════════════════════════════════════════════
async function mktCreateQuotation(enqId){
  const e=await db.mktEnquiries.get(enqId);
  if(!e){toast('Enquiry not found','d');return;}
  if(e.quotationId){ mktViewQuotation(e.quotationId); return; }
  const existing=await db.mktQuotations.where('enqId').equals(enqId).toArray().catch(()=>[]);
  if(existing.length>0){
    existing.sort((a,b)=>a.revision-b.revision);
    const latest=existing[existing.length-1];
    await db.mktEnquiries.update(enqId,{quotationDone:true, quotationId:latest.id});
    mktViewQuotation(latest.id);
    return;
  }
  const quoteFamily=await nextQuoteFamily(e.enqNumber);
  const user=Auth.user;
  const id=await db.mktQuotations.add({
    enqId, quoteFamily,
    revision:0, parentId:null, revisionReason:'',
    status:'Draft',
    date:new Date().toISOString().split('T')[0],
    customerName:e.customerName, partName:e.partDetails, partNumber:e.partNumber||'', materialGrade:'',
    inputs: mktQuoteDefaultInputs(),
    toolingItems:[], amortizeEnabled:false, amortizeQty:0,
    createdBy:user?.name||'', createdByUsername:user?.username||'', createdAt:new Date().toISOString(),
    submittedBy:'', submittedAt:'',
    approvedBy:'', approvedAt:'', approvalNotes:'',
    rejectedBy:'', rejectedAt:'', rejectionNotes:'',
    notes:''
  });
  await db.mktEnquiries.update(enqId,{quotationDone:true, quotationId:id});
  mktViewQuotation(id);
}

// ══════════════════════════════════════════════════════
//  TOOLING & CAPEX ROW HELPERS
// ══════════════════════════════════════════════════════
function mktToolingRowHtml(item, idx, editable){
  if(!editable){
    return`<tr>
      <td>${esc(item.category)}</td>
      <td>${esc(item.description||'')}</td>
      <td style="text-align:right">₹${mktINR(item.cost)}</td>
      <td></td>
    </tr>`;
  }
  return`<tr>
    <td><select class="fc tl-cat" data-idx="${idx}" style="font-size:12px">${MKT_TOOLING_CATEGORIES.map(c=>`<option ${item.category===c?'selected':''}>${c}</option>`).join('')}</select></td>
    <td><input class="fc tl-desc" data-idx="${idx}" value="${esc(item.description||'')}" style="font-size:12px" placeholder="Description / vendor / spec"></td>
    <td><input class="fc tl-cost" data-idx="${idx}" type="number" step="0.01" value="${item.cost||0}" style="font-size:12px" oninput="mktRecalcQuoteForm()"></td>
    <td><button class="btn btn-r btn-xs" onclick="mktRemoveToolingRow(${idx})">🗑️</button></td>
  </tr>`;
}
function mktSyncToolingFromDom(){
  document.querySelectorAll('.tl-cat').forEach(el=>{ const i=+el.dataset.idx; if(_mktToolingItems[i]) _mktToolingItems[i].category=el.value; });
  document.querySelectorAll('.tl-desc').forEach(el=>{ const i=+el.dataset.idx; if(_mktToolingItems[i]) _mktToolingItems[i].description=el.value; });
  document.querySelectorAll('.tl-cost').forEach(el=>{ const i=+el.dataset.idx; if(_mktToolingItems[i]) _mktToolingItems[i].cost=num(el.value); });
}
function mktAddToolingRow(){
  mktSyncToolingFromDom();
  _mktToolingItems.push({category:MKT_TOOLING_CATEGORIES[0],description:'',cost:0});
  mktRerenderToolingTable();
}
function mktRemoveToolingRow(idx){
  mktSyncToolingFromDom();
  _mktToolingItems.splice(idx,1);
  mktRerenderToolingTable();
}
function mktRerenderToolingTable(){
  const body=document.getElementById('tooling-rows-body');
  if(body) body.innerHTML=_mktToolingItems.length
    ?_mktToolingItems.map((it,i)=>mktToolingRowHtml(it,i,_mktQuoteEditable)).join('')
    :`<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:10px">No tooling / CAPEX items added</td></tr>`;
  mktRecalcQuoteForm();
}

// ── Gather all numeric process-cost inputs from the open form.
//    Percentage fields are typed as whole numbers (e.g. 6 for 6%) and
//    converted to fractions here for the calc engine / storage. ──
function mktGatherQuoteInputs(){
  return {
    shotWeight:num(gv('q-shotWeight')), netWeight:num(gv('q-netWeight')),
    meltingLossPct:num(gv('q-meltingLossPct'))/100,
    rawMaterialCostPerKg:num(gv('q-rawMaterialCostPerKg')),
    inventoryCarryingPct:num(gv('q-inventoryCarryingPct'))/100,
    pdcTonnage:num(gv('q-pdcTonnage')), cavities:num(gv('q-cavities'))||1, shotRate:num(gv('q-shotRate')),
    fettling:num(gv('q-fettling')), trimming:num(gv('q-trimming')), shotBlasting:num(gv('q-shotBlasting')),
    cncCycleTimeMin:num(gv('q-cncCycleTimeMin')), cncCostPerHour:num(gv('q-cncCostPerHour')),
    vmcCycleTimeMin:num(gv('q-vmcCycleTimeMin')), vmcCostPerHour:num(gv('q-vmcCostPerHour')),
    drilling:num(gv('q-drilling')), leakTest:num(gv('q-leakTest')), inspection:num(gv('q-inspection')),
    castingRejectionPct:num(gv('q-castingRejectionPct'))/100,
    packing:num(gv('q-packing')), transportation:num(gv('q-transportation')),
    profitOverheadsPct:num(gv('q-profitOverheadsPct'))/100,
    gstPct:num(gv('q-gstPct'))/100,
  };
}

function mktRecalcQuoteForm(){
  mktSyncToolingFromDom();
  const inputs=mktGatherQuoteInputs();
  const amortizeEnabled=document.getElementById('q-amortize')?.checked||false;
  const amortizeQty=num(gv('q-amortizeQty'));
  const c=mktCalcQuote({inputs, toolingItems:_mktToolingItems, amortizeEnabled, amortizeQty});
  setTxt('qc-totalWeight', c.totalProductWeight.toFixed(3)+' KG');
  setTxt('qc-invCarry', '₹'+mktINR(c.inventoryCarryingCost));
  setTxt('qc-rawMatTotal', '₹'+mktINR(c.totalRawMaterialCost));
  setTxt('qc-shotRatePc', '₹'+mktINR(c.actualShotRate));
  setTxt('qc-cncCost', '₹'+mktINR(c.cncCost));
  setTxt('qc-vmcCost', '₹'+mktINR(c.vmcCost));
  setTxt('qc-otherProcess', '₹'+mktINR(c.otherProcessCost));
  setTxt('qc-totalProcess', '₹'+mktINR(c.totalProcessCost));
  setTxt('qc-rejectionAmt', '₹'+mktINR(c.castingRejectionAmt));
  setTxt('qc-profitAmt', '₹'+mktINR(c.profitOverheadsAmt));
  setTxt('qc-finalCost', '₹'+mktINR(c.finalCostPerPart));
  setTxt('qc-finalCostGst', '₹'+mktINR(c.finalCostWithGst));
  setTxt('qc-toolingTotal', '₹'+mktINR(c.toolingTotal));
  setTxt('qc-toolingPerPc', amortizeEnabled&&amortizeQty>0?('₹'+mktINR(c.toolingPerPiece)):'—');
  setTxt('qc-finalWithTooling', amortizeEnabled&&amortizeQty>0?('₹'+mktINR(c.finalWithTooling)):'—');
  return c;
}

// ══════════════════════════════════════════════════════
//  VIEW / EDIT QUOTATION
// ══════════════════════════════════════════════════════
async function mktViewQuotation(id){
  const q=await db.mktQuotations.get(id);
  if(!q){toast('Quotation not found','d');return;}
  const enq=q.enqId?await db.mktEnquiries.get(q.enqId).catch(()=>null):null;
  const siblings=await db.mktQuotations.where('quoteFamily').equals(q.quoteFamily).toArray().catch(()=>[]);
  const inp=q.inputs||mktQuoteDefaultInputs();
  _mktToolingItems=JSON.parse(JSON.stringify(q.toolingItems||[]));
  _mktQuoteEditable=mktQuoteEditable(q.status);
  const editable=_mktQuoteEditable;
  const user=Auth.user;
  const isApprover=user?.role==='APPROVER';
  const dis=editable?'':'disabled';

  setC(`
  <div class="ph">
    <h2>💰 Quotation — <span class="mono" style="color:var(--navy)">${esc(q.quoteFamily)}</span> <span class="badge bd" style="margin-left:6px">Rev ${q.revision}</span> ${mktQuoteStatusBadge(q.status)}</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${editable?`<button class="btn btn-g" onclick="mktSaveQuotation(${id})">💾 Save</button>`:''}
      ${editable?`<button class="btn btn-p" onclick="mktSubmitQuotation(${id})">📤 Submit for Approval</button>`:''}
      ${q.status==='Submitted'&&isApprover?`<button class="btn btn-g" onclick="mktApproveQuotation(${id})">✅ Approve</button>`:''}
      ${q.status==='Submitted'&&isApprover?`<button class="btn btn-r" onclick="mktRejectQuotation(${id})">✗ Reject</button>`:''}
      ${q.status==='Approved'?`<button class="btn btn-o" onclick="mktReviseQuotation(${id})">🔁 Create Revision</button>`:''}
      <button class="btn btn-o" onclick="mktPrintQuotation(${id})">🖨️ Print</button>
      ${siblings.length>1?`<button class="btn btn-o" onclick="mktRevisionHistory('${esc(q.quoteFamily)}')">🕘 History (${siblings.length})</button>`:''}
      ${q.status==='Draft'?`<button class="btn btn-r" onclick="mktDeleteQuotation(${id})">🗑️ Delete Draft</button>`:''}
      <button class="btn btn-o" onclick="nav('mkt-quotations')">← Quotations</button>
    </div>
  </div>

  ${q.status==='Rejected'&&q.rejectionNotes?`<div class="alert al-d">✗ Rejected by ${esc(q.rejectedBy)}: ${esc(q.rejectionNotes)} — edit and resubmit when ready.</div>`:''}
  ${q.status==='Superseded'?`<div class="alert al-w">This revision has been superseded by a later revision. It is kept for history only and can no longer be edited.</div>`:''}
  ${q.revision>0?`<div class="alert al-w"><strong>Revision ${q.revision}</strong> of ${esc(q.quoteFamily)} — Reason: ${esc(q.revisionReason||'—')}${q.parentId?` &nbsp;·&nbsp; <a style="cursor:pointer;color:var(--navy);font-weight:600" onclick="mktViewQuotation(${q.parentId})">View Rev ${q.revision-1} →</a>`:''}</div>`:''}

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Quotation Details</h5><span class="muted" style="font-size:11px">Linked Enquiry: ${enq?`<a style="cursor:pointer;color:var(--navy);font-weight:700" onclick="nav('mkt-enquiries')">${esc(enq.enqNumber)}</a>`:'—'}</span></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="fg"><label class="lbl">Quote Number</label><input class="fc mono" value="${esc(q.quoteFamily)}" readonly style="background:#f5f7fd;color:var(--navy);font-weight:700"></div>
        <div class="fg"><label class="lbl">Revision</label><input class="fc mono" value="Rev ${q.revision}" readonly style="background:#f5f7fd"></div>
        <div class="fg"><label class="lbl">Date *</label><input class="fc" type="date" id="q-date" value="${q.date||''}" ${dis}></div>
        <div class="fg"><label class="lbl">Customer *</label><input class="fc" id="q-customerName" value="${esc(q.customerName||'')}" ${dis}></div>
        <div class="fg"><label class="lbl">Part Name *</label><input class="fc" id="q-partName" value="${esc(q.partName||'')}" ${dis}></div>
        <div class="fg"><label class="lbl">Part Number</label><input class="fc mono" id="q-partNumber" value="${esc(q.partNumber||'')}" ${dis}></div>
        <div class="fg"><label class="lbl">Material Grade</label><input class="fc" id="q-materialGrade" value="${esc(q.materialGrade||'')}" placeholder="e.g. ADC12" ${dis}></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Raw Material Cost (A)</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="fg"><label class="lbl">Shot Weight (KG)</label><input class="fc" id="q-shotWeight" type="number" step="0.001" value="${inp.shotWeight||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Net Weight (KG)</label><input class="fc" id="q-netWeight" type="number" step="0.001" value="${inp.netWeight||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Melting Loss (%)</label><input class="fc" id="q-meltingLossPct" type="number" step="0.01" value="${num(inp.meltingLossPct)*100}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Raw Material Cost (INR/KG)</label><input class="fc" id="q-rawMaterialCostPerKg" type="number" step="0.01" value="${inp.rawMaterialCostPerKg||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Inventory Carrying Cost (%)</label><input class="fc" id="q-inventoryCarryingPct" type="number" step="0.01" value="${num(inp.inventoryCarryingPct)*100}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Total Product Weight</label><div class="mono" id="qc-totalWeight" style="font-weight:700">0.000 KG</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;padding-top:10px;border-top:1px dashed var(--border)">
        <div class="fg" style="margin-bottom:0"><label class="lbl">Inventory Carrying Cost (INR/part)</label><div class="mono" id="qc-invCarry" style="font-weight:700">₹0.00</div></div>
        <div class="fg" style="margin-bottom:0"><label class="lbl">Total Raw Material Cost — A (INR/part)</label><div class="mono" id="qc-rawMatTotal" style="font-weight:700;color:var(--navy)">₹0.00</div></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>PDC Shot Cost (B)</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="fg"><label class="lbl">PDC Machine Tonnage (TON)</label><input class="fc" id="q-pdcTonnage" type="number" value="${inp.pdcTonnage||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">No. of Cavities</label><input class="fc" id="q-cavities" type="number" min="1" value="${inp.cavities||1}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Shot Rate (INR/Shot)</label><input class="fc" id="q-shotRate" type="number" step="0.01" value="${inp.shotRate||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
      </div>
      <div class="fg" style="margin-bottom:0;margin-top:6px"><label class="lbl">Actual Shot Rate/Part — B (INR/part)</label><div class="mono" id="qc-shotRatePc" style="font-weight:700;color:var(--navy)">₹0.00</div></div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Other Process Costs (C)</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="fg"><label class="lbl">Fettling (INR/part)</label><input class="fc" id="q-fettling" type="number" step="0.01" value="${inp.fettling||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Trimming (INR/part)</label><input class="fc" id="q-trimming" type="number" step="0.01" value="${inp.trimming||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Shot Blasting (INR/part)</label><input class="fc" id="q-shotBlasting" type="number" step="0.01" value="${inp.shotBlasting||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">CNC Cycle Time (minutes)</label><input class="fc" id="q-cncCycleTimeMin" type="number" step="0.01" value="${inp.cncCycleTimeMin||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">CNC Cost (INR/hour)</label><input class="fc" id="q-cncCostPerHour" type="number" step="0.01" value="${inp.cncCostPerHour||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">CNC Cost (INR/part)</label><div class="mono" id="qc-cncCost">₹0.00</div></div>
        <div class="fg"><label class="lbl">VMC Cycle Time (minutes)</label><input class="fc" id="q-vmcCycleTimeMin" type="number" step="0.01" value="${inp.vmcCycleTimeMin||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">VMC Cost (INR/hour)</label><input class="fc" id="q-vmcCostPerHour" type="number" step="0.01" value="${inp.vmcCostPerHour||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">VMC Cost (INR/part)</label><div class="mono" id="qc-vmcCost">₹0.00</div></div>
        <div class="fg"><label class="lbl">Drilling &amp; Counter Sunk (INR/part)</label><input class="fc" id="q-drilling" type="number" step="0.01" value="${inp.drilling||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Leak Test (INR/part)</label><input class="fc" id="q-leakTest" type="number" step="0.01" value="${inp.leakTest||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Inspection (INR/part)</label><input class="fc" id="q-inspection" type="number" step="0.01" value="${inp.inspection||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
      </div>
      <div class="fg" style="margin-bottom:0;margin-top:6px"><label class="lbl">Total Other Process Cost — C (INR/part)</label><div class="mono" id="qc-otherProcess" style="font-weight:700;color:var(--navy)">₹0.00</div></div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch" style="background:#f0f3f9"><h5>Final Cost Summary</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="fg"><label class="lbl">Total Process Cost (B+C)</label><div class="mono" id="qc-totalProcess">₹0.00</div></div>
        <div class="fg"><label class="lbl">Casting Rejection (%)</label><input class="fc" id="q-castingRejectionPct" type="number" step="0.01" value="${num(inp.castingRejectionPct)*100}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Casting Rejection Amount</label><div class="mono" id="qc-rejectionAmt">₹0.00</div></div>
        <div class="fg"><label class="lbl">Packing (INR/part)</label><input class="fc" id="q-packing" type="number" step="0.01" value="${inp.packing||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Transportation (INR/part)</label><input class="fc" id="q-transportation" type="number" step="0.01" value="${inp.transportation||0}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Profit &amp; Overheads (%)</label><input class="fc" id="q-profitOverheadsPct" type="number" step="0.01" value="${num(inp.profitOverheadsPct)*100}" oninput="mktRecalcQuoteForm()" ${dis}></div>
        <div class="fg"><label class="lbl">Profit &amp; Overheads Amount</label><div class="mono" id="qc-profitAmt">₹0.00</div></div>
        <div class="fg"><label class="lbl">GST (%) — informational</label><input class="fc" id="q-gstPct" type="number" step="0.01" value="${num(inp.gstPct)*100}" oninput="mktRecalcQuoteForm()" ${dis}></div>
      </div>
      <div class="dvdr"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div><div class="lbl" style="margin-bottom:2px">FINAL PROCESS COST / PART</div><div class="mono" id="qc-finalCost" style="font-size:20px;font-weight:800;color:var(--navy)">₹0.00</div></div>
        <div><div class="lbl" style="margin-bottom:2px">Incl. GST (informational)</div><div class="mono" id="qc-finalCostGst" style="font-size:15px;font-weight:700;color:var(--muted)">₹0.00</div></div>
      </div>
      <div class="muted" style="font-size:11px;margin-top:8px">Note: Raw material cost varies with market rate at the time of production. GST is applied additionally on the final cost per part.</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Tooling &amp; CAPEX — Die, Fixtures, Gauges, Instruments</h5></div>
    <div class="cb">
      <div class="tw"><table>
        <thead><tr><th>Category</th><th>Description</th><th style="width:150px">Cost (INR)</th><th style="width:40px"></th></tr></thead>
        <tbody id="tooling-rows-body">${_mktToolingItems.length?_mktToolingItems.map((it,i)=>mktToolingRowHtml(it,i,editable)).join(''):`<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:10px">No tooling / CAPEX items added</td></tr>`}</tbody>
      </table></div>
      ${editable?`<button class="btn btn-o btn-sm" style="margin-top:8px" onclick="mktAddToolingRow()">+ Add Tooling Item</button>`:''}
      <div class="dvdr"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:end">
        <div class="fg" style="margin-bottom:0"><label class="lbl">Total Tooling &amp; CAPEX (one-time)</label><div class="mono" id="qc-toolingTotal" style="font-weight:700;color:var(--navy);font-size:15px">₹0.00</div></div>
        <div class="fg" style="margin-bottom:0">
          <label class="lbl" style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="q-amortize" ${q.amortizeEnabled?'checked':''} onchange="mktRecalcQuoteForm()" ${dis} style="width:14px;height:14px">
            Amortize into per-piece price
          </label>
          <input class="fc" id="q-amortizeQty" type="number" placeholder="Expected quantity (pcs)" value="${q.amortizeQty||''}" oninput="mktRecalcQuoteForm()" ${dis} style="margin-top:4px">
        </div>
        <div class="fg" style="margin-bottom:0"><label class="lbl">Tooling Recovery / Part</label><div class="mono" id="qc-toolingPerPc" style="font-weight:700">—</div></div>
      </div>
      <div style="margin-top:10px;padding:10px;background:#f0f3f9;border-radius:8px">
        <div class="lbl">FINAL PRICE / PART (incl. tooling recovery, if amortized)</div>
        <div class="mono" id="qc-finalWithTooling" style="font-size:17px;font-weight:800;color:var(--navy)">—</div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Remarks</h5></div>
    <div class="cb"><input class="fc" id="q-notes" value="${esc(q.notes||'')}" placeholder="Any additional notes" ${dis}></div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Approval Trail</h5></div>
    <div class="cb">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12.5px">
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px">
          <div class="lbl">Created / Prepared By</div>
          <div style="font-weight:700">${esc(q.createdBy||'—')}</div>
          <div class="muted">${q.createdAt?new Date(q.createdAt).toLocaleString('en-IN'):'—'}</div>
          ${q.submittedBy?`<div class="muted" style="margin-top:6px">Submitted: ${esc(q.submittedBy)} · ${q.submittedAt?new Date(q.submittedAt).toLocaleString('en-IN'):''}</div>`:''}
        </div>
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px">
          <div class="lbl">Approved By</div>
          <div style="font-weight:700">${esc(q.approvedBy||'Pending')}</div>
          <div class="muted">${q.approvedAt?new Date(q.approvedAt).toLocaleString('en-IN'):'—'}</div>
          ${q.approvalNotes?`<div class="muted" style="margin-top:6px">Note: ${esc(q.approvalNotes)}</div>`:''}
          ${q.rejectedBy?`<div style="color:#7f1d1d;margin-top:6px">Rejected by ${esc(q.rejectedBy)}: ${esc(q.rejectionNotes||'')}</div>`:''}
        </div>
      </div>
      ${q.status==='Submitted'&&isApprover?`<div class="fg" style="margin-top:12px"><label class="lbl">Approval / Rejection Note</label><input class="fc" id="q-approval-notes" placeholder="Optional note for approval, required for rejection"></div>`:''}
    </div>
  </div>

  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
    ${editable?`<button class="btn btn-g btn-sm" onclick="mktSaveQuotation(${id})">💾 Save All Changes</button>`:''}
    <button class="btn btn-p btn-sm" onclick="mktPrintQuotation(${id})">🖨️ Print</button>
  </div>`);

  mktRecalcQuoteForm();
}

async function mktSaveQuotation(id, silent){
  const q=await db.mktQuotations.get(id);
  if(!q) return false;
  if(!mktQuoteEditable(q.status)){ if(!silent) toast('Only Draft or Rejected quotations can be edited','d'); return false; }
  const customerName=gv('q-customerName').trim();
  const partName=gv('q-partName').trim();
  if(!customerName||!partName){ if(!silent) toast('Customer and Part Name are required','d'); return false; }
  mktSyncToolingFromDom();
  const inputs=mktGatherQuoteInputs();
  const amortizeEnabled=document.getElementById('q-amortize')?.checked||false;
  const amortizeQty=num(gv('q-amortizeQty'));
  await db.mktQuotations.update(id,{
    date:gv('q-date'), customerName, partName,
    partNumber:gv('q-partNumber').trim(),
    materialGrade:gv('q-materialGrade').trim(),
    inputs, toolingItems:_mktToolingItems, amortizeEnabled, amortizeQty,
    notes:gv('q-notes').trim(),
    updatedAt:new Date().toISOString()
  });
  if(!silent){ toast('✅ Quotation saved'); mktViewQuotation(id); }
  return true;
}

async function mktSubmitQuotation(id){
  const q=await db.mktQuotations.get(id);
  if(!q) return;
  if(!['Draft','Rejected'].includes(q.status)){ toast('Only Draft or Rejected quotations can be submitted','d'); return; }
  if(!confirm(`Submit ${q.quoteFamily} (Rev ${q.revision}) for approval?`)) return;
  const saved=await mktSaveQuotation(id, true);
  if(saved===false) return;
  const user=Auth.user;
  await db.mktQuotations.update(id,{
    status:'Submitted', submittedBy:user?.name||'', submittedAt:new Date().toISOString(),
    rejectedBy:'', rejectedAt:'', rejectionNotes:''
  });
  toast('✅ Submitted for approval');
  mktViewQuotation(id);
  updateQcount();
}

async function mktApproveQuotation(id){
  const user=Auth.user;
  if(user?.role!=='APPROVER'){ toast('Only an Approver can approve quotations','d'); return; }
  const q=await db.mktQuotations.get(id);
  if(!q||q.status!=='Submitted'){ toast('Only submitted quotations can be approved','d'); return; }
  if(!confirm(`Approve ${q.quoteFamily} (Rev ${q.revision})?`)) return;
  const notes=(document.getElementById('q-approval-notes')?.value||'').trim();
  await db.mktQuotations.update(id,{status:'Approved', approvedBy:user.name, approvedAt:new Date().toISOString(), approvalNotes:notes});
  if(q.parentId){
    const parent=await db.mktQuotations.get(q.parentId);
    if(parent && parent.status!=='Superseded') await db.mktQuotations.update(parent.id,{status:'Superseded'});
  }
  toast('✅ Quotation approved');
  mktViewQuotation(id);
  updateQcount();
}

async function mktRejectQuotation(id){
  const user=Auth.user;
  if(user?.role!=='APPROVER'){ toast('Only an Approver can reject quotations','d'); return; }
  const q=await db.mktQuotations.get(id);
  if(!q||q.status!=='Submitted'){ toast('Only submitted quotations can be rejected','d'); return; }
  const notes=(document.getElementById('q-approval-notes')?.value||'').trim();
  if(!notes){ toast('Enter a reason for rejection','d'); return; }
  if(!confirm(`Reject ${q.quoteFamily} (Rev ${q.revision})? It will go back to the creator for edits.`)) return;
  await db.mktQuotations.update(id,{status:'Rejected', rejectedBy:user.name, rejectedAt:new Date().toISOString(), rejectionNotes:notes});
  toast('Quotation rejected','d');
  mktViewQuotation(id);
  updateQcount();
}

async function mktReviseQuotation(id){
  const user=Auth.user;
  const q=await db.mktQuotations.get(id);
  if(!q||q.status!=='Approved'){ toast('Only an Approved quotation can be revised','d'); return; }
  const reason=prompt('Reason for this revision (e.g. material rate change, customer negotiation):');
  if(!reason||!reason.trim()){ toast('Revision reason is required','d'); return; }
  const newRec={
    enqId:q.enqId, quoteFamily:q.quoteFamily,
    revision:q.revision+1, parentId:q.id, revisionReason:reason.trim(),
    status:'Draft',
    date:new Date().toISOString().split('T')[0],
    customerName:q.customerName, partName:q.partName, partNumber:q.partNumber, materialGrade:q.materialGrade,
    inputs:{...q.inputs}, toolingItems:JSON.parse(JSON.stringify(q.toolingItems||[])),
    amortizeEnabled:q.amortizeEnabled, amortizeQty:q.amortizeQty,
    createdBy:user?.name||'', createdByUsername:user?.username||'', createdAt:new Date().toISOString(),
    submittedBy:'', submittedAt:'',
    approvedBy:'', approvedAt:'', approvalNotes:'',
    rejectedBy:'', rejectedAt:'', rejectionNotes:'',
    notes:''
  };
  const newId=await db.mktQuotations.add(newRec);
  await db.mktQuotations.update(q.id,{status:'Superseded'});
  await db.mktEnquiries.update(q.enqId,{quotationId:newId, quotationDone:true}).catch(()=>{});
  toast(`✅ Revision ${newRec.revision} created`);
  mktViewQuotation(newId);
}

async function mktDeleteQuotation(id){
  const q=await db.mktQuotations.get(id);
  if(!q) return;
  if(q.status!=='Draft'){ toast('Only Draft quotations can be deleted — reject instead of deleting approval history','d'); return; }
  if(!confirm(`Delete draft ${q.quoteFamily} Rev ${q.revision}? This cannot be undone.`)) return;
  await db.mktQuotations.delete(id);
  if(q.parentId){
    const parent=await db.mktQuotations.get(q.parentId);
    if(parent && parent.status==='Superseded') await db.mktQuotations.update(parent.id,{status:'Approved'});
  }
  toast('Draft deleted','d');
  nav('mkt-quotations');
}

async function mktRevisionHistory(quoteFamily){
  const all=await db.mktQuotations.where('quoteFamily').equals(quoteFamily).toArray().catch(()=>[]);
  all.sort((a,b)=>a.revision-b.revision);
  const ov=document.createElement('div');ov.className='overlay';ov.id='mkt-qhist-ov';
  ov.innerHTML=`<div class="modal" style="width:760px;max-height:88vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>🕘 Revision History — <span class="mono" style="color:var(--navy)">${esc(quoteFamily)}</span></h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('mkt-qhist-ov').remove()">✕ Close</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Rev</th><th>Status</th><th>Date</th><th>Final Cost/Part</th><th>Created By</th><th>Approved/Rejected By</th><th>Reason for Revision</th><th></th></tr></thead>
      <tbody>${all.map(q=>{
        const calc=mktCalcQuote(q);
        return`<tr>
          <td style="text-align:center;font-weight:700">Rev ${q.revision}</td>
          <td>${mktQuoteStatusBadge(q.status)}</td>
          <td>${q.date||'—'}</td>
          <td class="mono">₹${mktINR(calc.finalCostPerPart)}</td>
          <td style="font-size:11.5px">${esc(q.createdBy||'—')}</td>
          <td style="font-size:11.5px">${esc(q.approvedBy||q.rejectedBy||'—')}</td>
          <td style="font-size:11.5px;color:var(--muted)">${esc(q.revisionReason||'—')}</td>
          <td><button class="btn btn-o btn-xs" onclick="document.getElementById('mkt-qhist-ov').remove();mktViewQuotation(${q.id})">View</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;
  document.body.appendChild(ov);
}

// ══════════════════════════════════════════════════════
//  PRINT — QUOTATION
// ══════════════════════════════════════════════════════
async function mktPrintQuotation(id){
  const q=await db.mktQuotations.get(id).catch(()=>null);
  if(!q){toast('Not found','d');return;}
  const inp=q.inputs||{};
  const c=mktCalcQuote(q);
  const today=new Date().toLocaleDateString('en-IN');
  const toolingRows=(q.toolingItems||[]).map(t=>`<tr><td>${esc(t.category)}</td><td>${esc(t.description||'')}</td><td style="text-align:right">₹${mktINR(t.cost)}</td></tr>`).join('');

  const statusColor={Draft:'#6b7280',Submitted:'#a06a12',Approved:'#15803d',Rejected:'#b91c1c',Superseded:'#6b46c1'}[q.status]||'#6b7280';
  const lh=await mktGetLetterhead();
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${q.quoteFamily} Rev ${q.revision}</title>
  <style>${mktPrintCSS()}</style></head><body>
  ${mktLetterhead('QUOTATION','Marketing Department', q.quoteFamily+' &middot; Rev '+q.revision, today, lh)}

  <div class="meta-grid" style="margin-bottom:7px">
    <div class="mc" style="grid-column:span 2"><div class="ml">Customer</div><div class="mv">M/s ${esc(q.customerName)}</div></div>
    <div class="mc"><div class="ml">Part Name / Number</div><div class="mv">${esc(q.partName)} ${q.partNumber?'· '+esc(q.partNumber):''}</div></div>
    <div class="mc"><div class="ml">Grade</div><div class="mv">${esc(q.materialGrade||'—')}</div></div>
    <div class="mc"><div class="ml">Date</div><div class="mv">${q.date||'—'}</div></div>
    <div class="mc"><div class="ml">Status</div><div class="mv" style="color:${statusColor}">${(q.status||'Draft').toUpperCase()}</div></div>
    <div class="mc" style="grid-column:span 3"><div class="ml">Reference</div><div class="mv" style="font-family:'IBM Plex Mono',monospace;font-size:7.8pt">${esc(q.quoteFamily)} &middot; Rev ${q.revision}</div></div>
  </div>

  <div class="sec-bar">PROCESS COST BREAKDOWN</div>
  <table class="dt" style="margin-bottom:8px">
    <thead><tr><th>Description</th><th style="width:80px">Unit</th><th style="width:90px;text-align:right">Cost</th></tr></thead>
    <tbody>
      <tr><td>Shot Weight</td><td>KG</td><td style="text-align:right">${num(inp.shotWeight).toFixed(3)}</td></tr>
      <tr><td>Net Weight</td><td>KG</td><td style="text-align:right">${num(inp.netWeight).toFixed(3)}</td></tr>
      <tr><td>Total Product Weight (incl. melting loss ${(num(inp.meltingLossPct)*100).toFixed(1)}%)</td><td>KG</td><td style="text-align:right">${c.totalProductWeight.toFixed(3)}</td></tr>
      <tr><td>Total Raw Material Cost (A)</td><td>INR/PART</td><td style="text-align:right;font-weight:bold">₹${mktINR(c.totalRawMaterialCost)}</td></tr>
      <tr><td>Actual Shot Rate / Part (B)</td><td>INR/PART</td><td style="text-align:right;font-weight:bold">₹${mktINR(c.actualShotRate)}</td></tr>
      <tr><td>Fettling</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.fettling)}</td></tr>
      <tr><td>Trimming</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.trimming)}</td></tr>
      <tr><td>Shot Blasting</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.shotBlasting)}</td></tr>
      <tr><td>CNC</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(c.cncCost)}</td></tr>
      <tr><td>VMC</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(c.vmcCost)}</td></tr>
      <tr><td>Drilling &amp; Counter Sunk</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.drilling)}</td></tr>
      <tr><td>Leak Test</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.leakTest)}</td></tr>
      <tr><td>Inspection</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.inspection)}</td></tr>
      <tr><td>Total Other Process Cost (C)</td><td>INR/PART</td><td style="text-align:right;font-weight:bold">₹${mktINR(c.otherProcessCost)}</td></tr>
      <tr><td>Total Process Cost (B+C)</td><td>INR/PART</td><td style="text-align:right;font-weight:bold">₹${mktINR(c.totalProcessCost)}</td></tr>
      <tr><td>Casting Rejection (${(num(inp.castingRejectionPct)*100).toFixed(1)}%)</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(c.castingRejectionAmt)}</td></tr>
      <tr><td>Packing</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.packing)}</td></tr>
      <tr><td>Transportation</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(inp.transportation)}</td></tr>
      <tr><td>Profit &amp; Overheads (${(num(inp.profitOverheadsPct)*100).toFixed(1)}%)</td><td>INR/PART</td><td style="text-align:right">₹${mktINR(c.profitOverheadsAmt)}</td></tr>
    </tbody>
  </table>

  <div class="final-box">
    <div class="fl">Final Process Cost / Part</div>
    <div class="fv">₹${mktINR(c.finalCostPerPart)}</div>
    <div class="fgst">+${(num(inp.gstPct)*100).toFixed(0)}% GST extra &nbsp;→&nbsp; ₹${mktINR(c.finalCostWithGst)} incl. GST</div>
  </div>

  ${(q.toolingItems||[]).length?`
  <div class="sec-bar">TOOLING &amp; CAPEX (ONE-TIME)</div>
  <table class="dt" style="margin-bottom:4px">
    <thead><tr><th>Category</th><th>Description</th><th style="width:90px;text-align:right">Cost</th></tr></thead>
    <tbody>${toolingRows}
      <tr><td colspan="2" style="text-align:right;font-weight:bold">Total Tooling &amp; CAPEX</td><td style="text-align:right;font-weight:bold">₹${mktINR(c.toolingTotal)}</td></tr>
    </tbody>
  </table>
  ${q.amortizeEnabled&&q.amortizeQty?`<div style="font-size:7.5pt;margin-bottom:8px;background:${MKT_BRAND.tint};border:1px solid ${MKT_BRAND.tintLine};padding:5px 8px;border-radius:4px">Amortized over ${q.amortizeQty} pcs &nbsp;→&nbsp; Tooling Recovery: <strong>₹${mktINR(c.toolingPerPiece)}/part</strong> &nbsp;|&nbsp; <strong>Final Price/Part incl. Tooling Recovery: ₹${mktINR(c.finalWithTooling)}</strong></div>`
   :`<div style="font-size:7.5pt;margin-bottom:8px;color:#666">Tooling cost quoted separately as a one-time development charge — not included in the per-piece price above.</div>`}
  `:''}

  <div class="sec-bar">NOTES</div>
  <table class="dt" style="margin-bottom:8px"><tbody>
    <tr><td>1. Raw material cost will vary and considered as per market rate at the time of production.</td></tr>
    <tr><td>2. ${(num(inp.gstPct)*100).toFixed(0)}% GST applicable extra on final cost/part.</td></tr>
    ${q.notes?`<tr><td>3. ${esc(q.notes)}</td></tr>`:''}
  </tbody></table>

  <div class="pg-ftr"><span>${q.quoteFamily} &middot; Rev ${q.revision} &nbsp;|&nbsp; V R Alucast — Confidential</span><span>Generated ${today}</span></div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

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
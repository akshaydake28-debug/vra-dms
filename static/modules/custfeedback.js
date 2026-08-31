// VRA DMS — CUSTOMER FEEDBACK MODULE
// ISO 9001 cl.9.1.2 — Customer Satisfaction. A staff member generates a
// unique link per customer and shares it themselves (email/WhatsApp/etc.);
// the customer opens it at /feedback/<token> — a standalone page with no
// login — and rates the 5 categories below. Responses land back here.

const CF_RATING_DEFS=[
  ['quality','Quality'],
  ['delivery','On-Time Delivery'],
  ['communication','Communication / Responsiveness'],
  ['pricing','Pricing / Value'],
  ['overall','Overall Satisfaction'],
];

// Scale: 10 Excellent · 8 Good · 6 Satisfactory · 4 Needs Improvement · 2 Unsatisfactory
function cfScoreBadge(avg){
  if(avg==null) return'<span class="muted">—</span>';
  const cls=avg>=7?'ba':avg>=5?'bp':'br';
  return`<span class="badge ${cls}">${avg.toFixed(1)} / 10</span>`;
}
function cfStatusBadge(status){
  return status==='SUBMITTED'?'<span class="badge ba">✓ Submitted</span>':'<span class="badge bp">⏳ Pending</span>';
}
function cfAvg(nums){
  const vals=nums.filter(n=>typeof n==='number'&&!isNaN(n));
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}

// ══════════════════════════════════════════════════════
//  MAIN VIEW — requests, responses, per-customer scorecard
// ══════════════════════════════════════════════════════
let _cfPeriod={period:'all',from:'',to:''};

async function cfRenderFeedback(){
  const all=(await db.custFeedback.toArray().catch(()=>[])).sort((a,b)=>b.id-a.id);
  const range=purPeriodRange(_cfPeriod.period,_cfPeriod.from,_cfPeriod.to);
  const inPeriod=all.filter(r=>purInRange((r.status==='SUBMITTED'?r.submittedAt:r.createdAt)||'',range));

  const submitted=inPeriod.filter(r=>r.status==='SUBMITTED');
  const pending=inPeriod.filter(r=>r.status!=='SUBMITTED');
  const responseRate=inPeriod.length?Math.round((submitted.length/inPeriod.length)*100):null;
  const overallAvg=cfAvg(submitted.map(r=>r.ratings?.overall));

  // Per-customer rollup
  const byCustomer={};
  inPeriod.forEach(r=>{
    const key=(r.customerName||'Unknown').trim()||'Unknown';
    if(!byCustomer[key]) byCustomer[key]={name:key,requests:0,responses:0,ratings:{quality:[],delivery:[],communication:[],pricing:[],overall:[]},lastDate:''};
    const c=byCustomer[key];
    c.requests++;
    if(r.status==='SUBMITTED'){
      c.responses++;
      CF_RATING_DEFS.forEach(([k])=>{ if(typeof r.ratings?.[k]==='number') c.ratings[k].push(r.ratings[k]); });
      if(!c.lastDate||r.submittedAt>c.lastDate) c.lastDate=r.submittedAt;
    }
  });
  const custRows=Object.values(byCustomer).sort((a,b)=>a.name.localeCompare(b.name));

  setC(`
  <div class="ph">
    <h2>💬 Customer Feedback</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="cfOpenNewLinkModal()">+ Request Feedback</button>
      <button class="btn btn-o" onclick="cfPrintSummary()">🖨️ Print Summary</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Overview — ${esc(purPeriodLabel(_cfPeriod.period,_cfPeriod.from,_cfPeriod.to))}</h5>
      ${purPeriodSelectorHtml(_cfPeriod.period,_cfPeriod.from,_cfPeriod.to,'cfPeriodChange')}
    </div>
    <div class="cb">
      <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px">
        <div><div style="font-size:24px;font-weight:800;color:var(--navy)">${inPeriod.length}</div><div class="muted" style="font-size:11px">Requests Sent</div></div>
        <div><div style="font-size:24px;font-weight:800;color:#14532d">${submitted.length}</div><div class="muted" style="font-size:11px">Responses Received</div></div>
        <div><div style="font-size:24px;font-weight:800;color:#d97706">${pending.length}</div><div class="muted" style="font-size:11px">Awaiting Response</div></div>
        <div><div class="muted" style="font-size:11px">Response Rate</div>${purPctBadge(responseRate)}</div>
        <div><div class="muted" style="font-size:11px">Avg. Overall Satisfaction</div>${cfScoreBadge(overallAvg)}</div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Scorecard by Customer</h5></div>
    <div class="tw" style="overflow-x:auto"><table style="min-width:900px">
      <thead><tr>
        <th style="text-align:left">Customer</th><th>Requests</th><th>Responses</th>
        ${CF_RATING_DEFS.map(([,l])=>`<th>${l}</th>`).join('')}
        <th>Last Feedback</th>
      </tr></thead>
      <tbody>${custRows.length===0
        ?`<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af">No feedback requests in this period.</td></tr>`
        :custRows.map(c=>`<tr>
          <td><strong>${esc(c.name)}</strong></td>
          <td style="text-align:center">${c.requests}</td>
          <td style="text-align:center">${c.responses}</td>
          ${CF_RATING_DEFS.map(([k])=>`<td style="text-align:center">${cfScoreBadge(cfAvg(c.ratings[k]))}</td>`).join('')}
          <td>${c.lastDate?fmtD(c.lastDate):'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>

  <div class="card">
    <div class="ch"><h5>All Requests (${inPeriod.length})</h5></div>
    <div class="tw"><table>
      <thead><tr><th>Date Requested</th><th>Customer</th><th>Requested By</th><th>Status</th><th>Overall</th><th></th></tr></thead>
      <tbody>${inPeriod.length===0
        ?`<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">No feedback requests yet. Click + Request Feedback to send the first link.</td></tr>`
        :inPeriod.map(r=>`<tr>
          <td>${fmtD(r.createdAt)}</td>
          <td><strong>${esc(r.customerName)}</strong></td>
          <td>${esc(r.createdBy||'—')}</td>
          <td>${cfStatusBadge(r.status)}</td>
          <td style="text-align:center">${r.status==='SUBMITTED'?cfScoreBadge(r.ratings?.overall):'<span class="muted">—</span>'}</td>
          <td style="white-space:nowrap">
            ${r.status!=='SUBMITTED'?`<button class="btn btn-o btn-xs" onclick="cfCopyLink('${r.token}')">🔗 Copy Link</button>`:''}
            <button class="btn btn-o btn-xs" onclick="cfViewRecord(${r.id})">👁️ View</button>
            <button class="btn btn-r btn-xs" onclick="cfDeleteRecord(${r.id})">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`);
}
function cfPeriodChange(){
  _cfPeriod.period=document.getElementById('pur-period').value;
  _cfPeriod.from=document.getElementById('pur-period-from')?.value||'';
  _cfPeriod.to=document.getElementById('pur-period-to')?.value||'';
  if(_cfPeriod.period==='custom'&&(!_cfPeriod.from||!_cfPeriod.to)) return;
  cfRenderFeedback();
}

// ══════════════════════════════════════════════════════
//  GENERATE A NEW LINK
// ══════════════════════════════════════════════════════
async function cfOpenNewLinkModal(){
  const enquiries=await db.mktEnquiries.toArray().catch(()=>[]);
  const past=await db.custFeedback.toArray().catch(()=>[]);
  const names=[...new Set([...enquiries.map(e=>e.customerName),...past.map(p=>p.customerName)].filter(Boolean))].sort();

  const ov=document.createElement('div');ov.className='overlay';ov.id='cf-new-ov';
  ov.innerHTML=`<div class="modal" style="width:460px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>Request Customer Feedback</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('cf-new-ov').remove()">✕</button>
    </div>
    <div class="fg"><label class="lbl">Customer Name *</label>
      <input class="fc" id="cf-new-name" list="cf-cust-datalist" placeholder="e.g. M/s Menon Alkop Pvt Ltd" autocomplete="off">
      <datalist id="cf-cust-datalist">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    </div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">A unique link will be generated. You'll copy it and share it with the customer yourself (email, WhatsApp, etc.) — the app does not send it automatically.</div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('cf-new-ov').remove()">Cancel</button>
      <button class="btn btn-p" onclick="cfCreateLink()">Generate Link</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function cfCreateLink(){
  const name=document.getElementById('cf-new-name').value.trim();
  if(!name){toast('Customer name required','d');return;}
  const token=crypto.randomUUID();
  const rec={
    token, customerName:name,
    createdBy:Auth.user?.name||Auth.user?.username||'',
    createdAt:new Date().toISOString(),
    status:'PENDING', ratings:null, comments:'', submittedAt:null,
  };
  await db.custFeedback.add(rec);
  document.getElementById('cf-new-ov').remove();
  cfShowLinkModal(token,name);
  cfRenderFeedback();
}

function cfShowLinkModal(token,name){
  const url=`${location.origin}/feedback/${token}`;
  const ov=document.createElement('div');ov.className='overlay';ov.id='cf-link-ov';
  ov.innerHTML=`<div class="modal" style="width:480px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>✅ Link Ready — ${esc(name)}</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('cf-link-ov').remove()">✕</button>
    </div>
    <div class="fg"><label class="lbl">Share this link with the customer</label>
      <input class="fc mono" id="cf-link-url" value="${esc(url)}" readonly onclick="this.select()"></div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('cf-link-ov').remove()">Close</button>
      <button class="btn btn-p" onclick="cfCopyLink('${token}')">📋 Copy Link</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function cfCopyLink(token){
  const url=`${location.origin}/feedback/${token}`;
  try{
    await navigator.clipboard.writeText(url);
    toast('🔗 Link copied to clipboard');
  }catch(e){
    toast('Could not copy automatically — link: '+url,'d');
  }
}

// ══════════════════════════════════════════════════════
//  VIEW / DELETE A REQUEST
// ══════════════════════════════════════════════════════
async function cfViewRecord(id){
  const r=await db.custFeedback.get(id);
  if(!r) return;
  const ov=document.createElement('div');ov.className='overlay';ov.id='cf-view-ov';
  const body=r.status==='SUBMITTED'?`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${CF_RATING_DEFS.map(([k,l])=>`<div class="fg"><label class="lbl">${l}</label>${cfScoreBadge(r.ratings?.[k])}</div>`).join('')}
    </div>
    <div class="fg"><label class="lbl">Comments</label>
      <div class="card" style="padding:10px;font-size:13px;white-space:pre-wrap">${esc(r.comments||'—')}</div></div>
    <div class="muted" style="font-size:11px;margin-top:8px">Submitted ${fmtD(r.submittedAt)}</div>
  `:`
    <div class="muted" style="margin-bottom:10px">This request is still pending. Share the link below with the customer.</div>
    <input class="fc mono" value="${esc(location.origin+'/feedback/'+r.token)}" readonly onclick="this.select()">
  `;
  ov.innerHTML=`<div class="modal" style="width:480px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>${esc(r.customerName)} ${cfStatusBadge(r.status)}</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('cf-view-ov').remove()">✕</button>
    </div>
    ${body}
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      ${r.status!=='SUBMITTED'?`<button class="btn btn-o" onclick="cfCopyLink('${r.token}')">📋 Copy Link</button>`:''}
      <button class="btn btn-o" onclick="document.getElementById('cf-view-ov').remove()">Close</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function cfDeleteRecord(id){
  const r=await db.custFeedback.get(id);
  if(!confirm(`Delete this feedback ${r?.status==='SUBMITTED'?'response':'request'} for ${r?.customerName}?`)) return;
  await db.custFeedback.delete(id);
  toast('Deleted','d');
  cfRenderFeedback();
}

// ══════════════════════════════════════════════════════
//  PRINT — Customer Satisfaction Summary
// ══════════════════════════════════════════════════════
async function cfPrintSummary(){
  const all=(await db.custFeedback.toArray().catch(()=>[]));
  const range=purPeriodRange(_cfPeriod.period,_cfPeriod.from,_cfPeriod.to);
  const inPeriod=all.filter(r=>purInRange((r.status==='SUBMITTED'?r.submittedAt:r.createdAt)||'',range));
  const byCustomer={};
  inPeriod.forEach(r=>{
    const key=(r.customerName||'Unknown').trim()||'Unknown';
    if(!byCustomer[key]) byCustomer[key]={name:key,requests:0,responses:0,ratings:{quality:[],delivery:[],communication:[],pricing:[],overall:[]}};
    const c=byCustomer[key];
    c.requests++;
    if(r.status==='SUBMITTED'){
      c.responses++;
      CF_RATING_DEFS.forEach(([k])=>{ if(typeof r.ratings?.[k]==='number') c.ratings[k].push(r.ratings[k]); });
    }
  });
  const custRows=Object.values(byCustomer).sort((a,b)=>a.name.localeCompare(b.name));
  const today=new Date().toLocaleDateString('en-IN');
  const fmt=v=>v==null?'—':v.toFixed(1);
  const rows=custRows.map((c,i)=>`<tr>
    <td>${i+1}</td><td class="tl"><strong>${esc(c.name)}</strong></td>
    <td>${c.requests}</td><td>${c.responses}</td>
    ${CF_RATING_DEFS.map(([k])=>`<td style="font-weight:bold">${fmt(cfAvg(c.ratings[k]))}</td>`).join('')}
  </tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Customer Satisfaction Summary</title>
  <style>${purPrintCSS()}@page{size:A4 landscape;margin:12mm 13mm 14mm 13mm}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">CUSTOMER SATISFACTION SURVEY — SUMMARY</div><div class="rpt-sub">PERIOD:- ${esc(purPeriodLabel(_cfPeriod.period,_cfPeriod.from,_cfPeriod.to))}</div></div>
    <div><div style="font-size:7pt;text-align:right">${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>SR</th><th class="tl">Customer</th><th>Requests</th><th>Responses</th>
      ${CF_RATING_DEFS.map(([,l])=>`<th>${l}</th>`).join('')}
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="9" style="text-align:center">No feedback in this period</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Rating scale: 2 Unsatisfactory · 4 Needs Improvement · 6 Satisfactory · 8 Good · 10 Excellent · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

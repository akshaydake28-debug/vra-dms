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
const CF_DOC_NO='VRA-MKT-F-01';
const CF_DOC_REV='Rev 00';
const CF_DOC_DATE='31-Aug-2026';

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
// Composite total across all 5 categories, as a percentage (10/10 on every category = 100%)
function cfTotalPct(ratings){
  if(!ratings) return null;
  const vals=CF_RATING_DEFS.map(([k])=>ratings[k]).filter(v=>typeof v==='number');
  if(!vals.length) return null;
  return Math.round((vals.reduce((a,b)=>a+b,0)/(vals.length*10))*100);
}
// purPctBadge (from purchasing.js) expects a whole number — round averages before handing them in
function cfPctBadge(avg){ return purPctBadge(avg==null?null:Math.round(avg)); }

// ══════════════════════════════════════════════════════
//  REVIEW PERIOD — feedback is requested quarterly; every request is
//  tagged with the quarter it's asking the customer to reflect on
//  (which may differ from the quarter it happens to be filled in).
// ══════════════════════════════════════════════════════
const CF_MONTH_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function cfQuarterInfo(date){
  const q=Math.floor(date.getMonth()/3)+1;
  const year=date.getFullYear();
  const startMonth=(q-1)*3;
  return{
    key:`${year}-Q${q}`,
    label:`Q${q} ${year} (${CF_MONTH_NAMES[startMonth]}–${CF_MONTH_NAMES[startMonth+2]} ${year})`,
  };
}
// A handful of quarters centered on today — two just-ended, the current one, and one ahead —
// so staff can log a request for the quarter that just closed as easily as the current one.
function cfQuarterOptions(){
  const now=new Date();
  const opts=[];
  for(let offset=-2;offset<=1;offset++){
    opts.push(cfQuarterInfo(new Date(now.getFullYear(),now.getMonth()+offset*3,1)));
  }
  return opts;
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
  const totalPctAvg=cfAvg(submitted.map(r=>cfTotalPct(r.ratings)));

  // Per-customer rollup
  const byCustomer={};
  inPeriod.forEach(r=>{
    const key=(r.customerName||'Unknown').trim()||'Unknown';
    if(!byCustomer[key]) byCustomer[key]={name:key,requests:0,responses:0,ratings:{quality:[],delivery:[],communication:[],pricing:[],overall:[]},totalPcts:[],lastDate:''};
    const c=byCustomer[key];
    c.requests++;
    if(r.status==='SUBMITTED'){
      c.responses++;
      CF_RATING_DEFS.forEach(([k])=>{ if(typeof r.ratings?.[k]==='number') c.ratings[k].push(r.ratings[k]); });
      c.totalPcts.push(cfTotalPct(r.ratings));
      if(!c.lastDate||r.submittedAt>c.lastDate) c.lastDate=r.submittedAt;
    }
  });
  const custRows=Object.values(byCustomer).sort((a,b)=>a.name.localeCompare(b.name));

  setC(`
  <div class="ph">
    <h2>💬 Customer Feedback</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="cfOpenNewLinkModal()">+ Request Feedback</button>
      <button class="btn btn-p" onclick="cfOpenBulkEmailModal()">📧 Bulk Email Request</button>
      <button class="btn btn-o" onclick="cfPrintSummary()">🖨️ Print</button>
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
        <div><div class="muted" style="font-size:11px">Avg. Total Score</div>${cfPctBadge(totalPctAvg)}</div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="ch"><h5>Scorecard by Customer — ${esc(purPeriodLabel(_cfPeriod.period,_cfPeriod.from,_cfPeriod.to))}</h5>
      <span class="muted" style="font-size:11px">${CF_DOC_NO} · ${CF_DOC_REV} · Customer Satisfaction Survey</span>
    </div>
    <div class="tw" style="overflow-x:auto"><table style="min-width:1000px">
      <thead><tr style="background:var(--navy);color:#fff">
        <th>SR</th><th style="text-align:left">Name of Customer</th><th>Requests</th><th>Responses</th>
        ${CF_RATING_DEFS.map(([,l])=>`<th>${l}</th>`).join('')}
        <th>Total Score</th><th>Last Feedback</th>
      </tr></thead>
      <tbody>${custRows.length===0
        ?`<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af">No feedback requests in this period.</td></tr>`
        :custRows.map((c,i)=>`<tr>
          <td style="text-align:center">${i+1}</td>
          <td><strong>${esc(c.name)}</strong></td>
          <td style="text-align:center">${c.requests}</td>
          <td style="text-align:center">${c.responses}</td>
          ${CF_RATING_DEFS.map(([k])=>`<td style="text-align:center">${cfScoreBadge(cfAvg(c.ratings[k]))}</td>`).join('')}
          <td style="text-align:center">${cfPctBadge(cfAvg(c.totalPcts))}</td>
          <td>${c.lastDate?fmtD(c.lastDate):'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>

  <div class="card">
    <div class="ch"><h5>All Requests (${inPeriod.length})</h5></div>
    <div class="tw" style="overflow-x:auto"><table style="min-width:1160px">
      <thead><tr style="background:var(--navy);color:#fff">
        <th>SR</th><th>Date Requested</th><th style="text-align:left">Customer</th><th>Review Period</th><th style="text-align:left">Respondent</th><th>Requested By</th><th>Status</th><th>Total Score</th><th></th>
      </tr></thead>
      <tbody>${inPeriod.length===0
        ?`<tr><td colspan="9" style="text-align:center;padding:30px;color:#9ca3af">No feedback requests yet. Click + Request Feedback to send the first link.</td></tr>`
        :inPeriod.map((r,i)=>`<tr>
          <td style="text-align:center">${i+1}</td>
          <td>${fmtD(r.createdAt)}</td>
          <td><strong>${esc(r.customerName)}</strong></td>
          <td>${esc(r.reviewPeriod||'—')}</td>
          <td>${r.status==='SUBMITTED'?`${esc(r.respondentName||'—')}<div class="muted" style="font-size:10.5px">${esc(r.respondentDesignation||'')}</div>`:'<span class="muted">—</span>'}</td>
          <td>${esc(r.createdBy||'—')}</td>
          <td>${cfStatusBadge(r.status)}</td>
          <td style="text-align:center">${r.status==='SUBMITTED'?purPctBadge(cfTotalPct(r.ratings)):'<span class="muted">—</span>'}</td>
          <td style="white-space:nowrap">
            ${r.status!=='SUBMITTED'?`<button class="btn btn-o btn-xs" onclick="cfCopyLink('${r.token}')">🔗 Copy Link</button>`:''}
            <button class="btn btn-o btn-xs" onclick="cfViewRecord(${r.id})">👁️ View</button>
            ${r.status==='SUBMITTED'?`<button class="btn btn-o btn-xs" onclick="cfPrintResponse(${r.id})">🖨️</button>`:''}
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
  const quarters=cfQuarterOptions();
  const currentKey=cfQuarterInfo(new Date()).key;

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
    <div class="fg" style="margin-top:10px"><label class="lbl">Review Period *</label>
      <select class="fc" id="cf-new-period">
        ${quarters.map(q=>`<option value="${esc(q.label)}" ${q.key===currentKey?'selected':''}>${esc(q.label)}</option>`).join('')}
      </select>
      <div class="muted" style="font-size:11px;margin-top:4px">Which quarter is this feedback asking the customer to reflect on?</div>
    </div>
    <div class="muted" style="font-size:11.5px;margin-top:10px">A unique link will be generated. You'll copy it and share it with the customer yourself (email, WhatsApp, etc.) — the app does not send it automatically.</div>
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
  const reviewPeriod=document.getElementById('cf-new-period').value;
  const token=crypto.randomUUID();
  const rec={
    token, customerName:name, reviewPeriod,
    createdBy:Auth.user?.name||Auth.user?.username||'',
    createdAt:new Date().toISOString(),
    status:'PENDING', ratings:null, comments:'', submittedAt:null,
  };
  await db.custFeedback.add(rec);
  document.getElementById('cf-new-ov').remove();
  cfShowLinkModal(token,name,reviewPeriod);
  cfRenderFeedback();
}

function cfShowLinkModal(token,name,reviewPeriod){
  const url=`${location.origin}/feedback/${token}`;
  const ov=document.createElement('div');ov.className='overlay';ov.id='cf-link-ov';
  ov.innerHTML=`<div class="modal" style="width:480px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>✅ Link Ready — ${esc(name)}</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('cf-link-ov').remove()">✕</button>
    </div>
    <div class="muted" style="font-size:12px;margin-bottom:8px">Review Period: <strong>${esc(reviewPeriod)}</strong></div>
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
//  BULK EMAIL REQUEST — one link + one individual email per
//  selected customer (never a single BCC blast — see cfSendBulkEmail).
// ══════════════════════════════════════════════════════
const CF_EMAIL_RE=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CF_DEFAULT_SUBJECT='Customer Feedback Request — {{period}}';
const CF_DEFAULT_MESSAGE=`Hello {{name}},

Here is the link for our customer feedback survey for the period {{period}}. It only takes a couple of minutes — please fill it up at your earliest convenience:

{{link}}

Thank you for your continued business.

Regards,
V R Alucast`;

// Customers known from the Enquiry Register, deduped by name with the
// latest non-empty email winning (customerEmail was added there for
// exactly this purpose).
async function cfKnownCustomers(){
  const enquiries=(await db.mktEnquiries.toArray().catch(()=>[])).sort((a,b)=>(a.createdAt||'')>(b.createdAt||'')?1:-1);
  const map={};
  enquiries.forEach(e=>{
    const name=(e.customerName||'').trim();
    if(!name) return;
    if(!map[name]) map[name]={name,email:''};
    if(e.customerEmail&&e.customerEmail.trim()) map[name].email=e.customerEmail.trim();
  });
  return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
}

async function cfOpenBulkEmailModal(){
  const customers=await cfKnownCustomers();
  const quarters=cfQuarterOptions();
  const currentKey=cfQuarterInfo(new Date()).key;

  const ov=document.createElement('div');ov.className='overlay';ov.id='cf-bulk-ov';
  ov.innerHTML=`<div class="modal" style="width:640px;max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3>📧 Bulk Email Feedback Request</h3>
      <button class="btn btn-o btn-sm" onclick="document.getElementById('cf-bulk-ov').remove()">✕</button>
    </div>

    <div class="fg"><label class="lbl">Review Period *</label>
      <select class="fc" id="cf-bulk-period">
        ${quarters.map(q=>`<option value="${esc(q.label)}" ${q.key===currentKey?'selected':''}>${esc(q.label)}</option>`).join('')}
      </select>
    </div>

    <div class="fg" style="margin-top:10px">
      <label class="lbl">Select Customers *
        <span class="muted" style="font-weight:400">(email comes from the Enquiry Register — edit here if it's wrong or missing)</span>
      </label>
      <div id="cf-bulk-custlist" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:7px;padding:8px">
        ${customers.length===0?'<div class="muted" style="padding:8px">No customers found in the Enquiry Register yet. Add one below.</div>':customers.map((c,i)=>`
        <div style="display:flex;gap:8px;align-items:center;padding:5px 2px;border-bottom:1px solid var(--border)">
          <input type="checkbox" class="cf-bulk-check" id="cf-bulk-chk-${i}" ${c.email?'checked':''}>
          <label for="cf-bulk-chk-${i}" style="flex:0 0 220px;font-weight:600;font-size:12.5px;cursor:pointer">${esc(c.name)}</label>
          <input class="fc cf-bulk-email" id="cf-bulk-email-${i}" data-name="${esc(c.name)}" type="email" value="${esc(c.email)}" placeholder="customer email" style="flex:1">
        </div>`).join('')}
      </div>
      <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
        <input class="fc" id="cf-bulk-add-name" placeholder="Add a customer not listed — name" style="flex:1">
        <input class="fc" id="cf-bulk-add-email" type="email" placeholder="email" style="flex:1">
        <button class="btn btn-o btn-sm" onclick="cfAddBulkCustomerRow()">+ Add</button>
      </div>
    </div>

    <div class="fg" style="margin-top:10px"><label class="lbl">Subject *</label>
      <input class="fc" id="cf-bulk-subject" value="${esc(CF_DEFAULT_SUBJECT)}"></div>
    <div class="fg" style="margin-top:10px"><label class="lbl">Message *
        <span class="muted" style="font-weight:400">— {{name}}, {{period}} and {{link}} are filled in per customer</span></label>
      <textarea class="fc" id="cf-bulk-message" rows="9">${esc(CF_DEFAULT_MESSAGE)}</textarea>
    </div>

    <div id="cf-bulk-result" style="margin-top:10px"></div>

    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-o" onclick="document.getElementById('cf-bulk-ov').remove()">Cancel</button>
      <button class="btn btn-p" id="cf-bulk-send-btn" onclick="cfSendBulkEmail()">📧 Send</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

function cfAddBulkCustomerRow(){
  const name=document.getElementById('cf-bulk-add-name').value.trim();
  const email=document.getElementById('cf-bulk-add-email').value.trim();
  if(!name){toast('Enter a customer name first','d');return;}
  const list=document.getElementById('cf-bulk-custlist');
  const i='x'+Date.now();
  const row=document.createElement('div');
  row.style='display:flex;gap:8px;align-items:center;padding:5px 2px;border-bottom:1px solid var(--border)';
  row.innerHTML=`
    <input type="checkbox" class="cf-bulk-check" id="cf-bulk-chk-${i}" checked>
    <label for="cf-bulk-chk-${i}" style="flex:0 0 220px;font-weight:600;font-size:12.5px;cursor:pointer">${esc(name)}</label>
    <input class="fc cf-bulk-email" id="cf-bulk-email-${i}" data-name="${esc(name)}" type="email" value="${esc(email)}" placeholder="customer email" style="flex:1">`;
  list.appendChild(row);
  document.getElementById('cf-bulk-add-name').value='';
  document.getElementById('cf-bulk-add-email').value='';
}

async function cfSendBulkEmail(){
  const reviewPeriod=document.getElementById('cf-bulk-period').value;
  const subject=document.getElementById('cf-bulk-subject').value.trim();
  const message=document.getElementById('cf-bulk-message').value;
  const resultEl=document.getElementById('cf-bulk-result');
  resultEl.innerHTML='';

  if(!subject||!message.trim()){toast('Subject and message are required','d');return;}

  const checks=[...document.querySelectorAll('.cf-bulk-check')].filter(c=>c.checked);
  if(checks.length===0){toast('Select at least one customer','d');return;}

  const selected=[];
  const skipped=[];
  checks.forEach(chk=>{
    const suffix=chk.id.replace('cf-bulk-chk-','');
    const emailInput=document.getElementById('cf-bulk-email-'+suffix);
    const name=emailInput.dataset.name;
    const email=emailInput.value.trim();
    if(email&&CF_EMAIL_RE.test(email)) selected.push({name,email});
    else skipped.push(name);
  });
  if(selected.length===0){toast('None of the selected customers have a valid email address','d');return;}

  const btn=document.getElementById('cf-bulk-send-btn');
  btn.disabled=true;btn.textContent='Sending…';

  // Create one feedback request (own token) per customer first, same as a single request.
  const recipients=[];
  for(const s of selected){
    const token=crypto.randomUUID();
    const rec={
      token, customerName:s.name, reviewPeriod,
      createdBy:Auth.user?.name||Auth.user?.username||'',
      createdAt:new Date().toISOString(),
      status:'PENDING', ratings:null, comments:'', submittedAt:null,
    };
    await db.custFeedback.add(rec);
    recipients.push({name:s.name, email:s.email, period:reviewPeriod, link:`${location.origin}/feedback/${token}`});
  }

  let data;
  try{
    const res=await fetch('/api/customer-feedback/send',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({subject, message, recipients})
    });
    data=await res.json().catch(()=>({}));
    if(!res.ok){
      resultEl.innerHTML=`<div class="alert al-d">${esc(data.error||'Could not send emails.')} <br>The feedback links were still created — you can copy/share them individually from the requests list below.</div>`;
      btn.disabled=false;btn.textContent='📧 Send';
      cfRenderFeedback();
      return;
    }
  }catch(e){
    resultEl.innerHTML=`<div class="alert al-d">Could not reach the server. The feedback links were still created — you can copy/share them individually from the requests list below.</div>`;
    btn.disabled=false;btn.textContent='📧 Send';
    cfRenderFeedback();
    return;
  }

  const sentCount=(data.results||[]).filter(r=>r.ok).length;
  const failed=(data.results||[]).filter(r=>!r.ok);
  resultEl.innerHTML=`
    <div class="alert ${failed.length?'al-w':'al-s'}">
      ✅ Sent ${sentCount} of ${recipients.length} email(s).
      ${skipped.length?`<br>⚠️ Skipped (no valid email): ${skipped.map(esc).join(', ')}`:''}
      ${failed.length?`<br>⚠️ Failed to send: ${failed.map(f=>`${esc(f.email)} (${esc(f.error||'error')})`).join(', ')}`:''}
    </div>`;
  btn.textContent='Done';
  toast(`📧 Sent ${sentCount} feedback request(s)`);
  cfRenderFeedback();
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
      <div class="fg"><label class="lbl">Review Period</label><div style="font-weight:600">${esc(r.reviewPeriod||'—')}</div></div>
      <div class="fg"><label class="lbl">Respondent</label><div style="font-weight:600">${esc(r.respondentName||'—')} <span class="muted" style="font-weight:400">— ${esc(r.respondentDesignation||'—')}</span></div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${CF_RATING_DEFS.map(([k,l])=>`<div class="fg"><label class="lbl">${l}</label>${cfScoreBadge(r.ratings?.[k])}</div>`).join('')}
      <div class="fg"><label class="lbl">Total Score</label>${purPctBadge(cfTotalPct(r.ratings))}</div>
    </div>
    <div class="fg"><label class="lbl">Comments</label>
      <div class="card" style="padding:10px;font-size:13px;white-space:pre-wrap">${esc(r.comments||'—')}</div></div>
    <div class="muted" style="font-size:11px;margin-top:8px">Submitted ${fmtD(r.submittedAt)}</div>
  `:`
    <div class="muted" style="margin-bottom:6px">Review Period: <strong>${esc(r.reviewPeriod||'—')}</strong></div>
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
      ${r.status!=='SUBMITTED'?`<button class="btn btn-o" onclick="cfCopyLink('${r.token}')">📋 Copy Link</button>`:`<button class="btn btn-o" onclick="cfPrintResponse(${r.id})">🖨️ Print</button>`}
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
//  PRINT — a single customer's response
// ══════════════════════════════════════════════════════
async function cfPrintResponse(id){
  const r=await db.custFeedback.get(id);
  if(!r||r.status!=='SUBMITTED'){toast('This request has not been submitted yet','d');return;}
  const today=new Date().toLocaleDateString('en-IN');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Customer Feedback — ${esc(r.customerName)}</title><style>${purPrintCSS()}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">CUSTOMER SATISFACTION SURVEY</div><div class="rpt-sub">${esc(r.reviewPeriod||'—')}</div></div>
    <div><div class="rpt-num">${CF_DOC_NO}</div><div style="font-size:7pt;text-align:right">${CF_DOC_REV} &nbsp;|&nbsp; ${today}</div></div>
  </div>
  <div class="frm-row" style="border-top:1px solid #000"><div class="fl">Customer</div><div class="fv">${esc(r.customerName)}</div></div>
  <div class="frm-row"><div class="fl">Review Period</div><div class="fv">${esc(r.reviewPeriod||'—')}</div></div>
  <div class="frm-row"><div class="fl">Respondent</div><div class="fv">${esc(r.respondentName||'—')} — ${esc(r.respondentDesignation||'—')}</div></div>
  <div class="frm-row"><div class="fl">Date Submitted</div><div class="fv">${fmtD(r.submittedAt)}</div></div>
  <div class="sec-bar">Ratings &nbsp;·&nbsp; Scale: 2 Unsatisfactory · 4 Needs Improvement · 6 Satisfactory · 8 Good · 10 Excellent</div>
  ${CF_RATING_DEFS.map(([k,l],i)=>`<div class="frm-row" style="${i===0?'border-top:1px solid #000':''}"><div class="fl">${l}</div><div class="fv">${r.ratings?.[k]??'—'} / 10</div></div>`).join('')}
  <div class="frm-row"><div class="fl">Total Score</div><div class="fv" style="font-weight:bold">${cfTotalPct(r.ratings)}%</div></div>
  <div class="sec-bar">Comments</div>
  <div class="frm-row" style="border-top:1px solid #000"><div class="fl">Remarks</div><div class="fv">${esc(r.comments||'—')}</div></div>
  <div style="margin-top:8px;font-size:7.5pt;color:#555">${CF_DOC_NO} · ${CF_DOC_REV} · Effective ${CF_DOC_DATE} · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
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
    if(!byCustomer[key]) byCustomer[key]={name:key,requests:0,responses:0,ratings:{quality:[],delivery:[],communication:[],pricing:[],overall:[]},totalPcts:[],periods:new Set()};
    const c=byCustomer[key];
    c.requests++;
    if(r.status==='SUBMITTED'){
      c.responses++;
      CF_RATING_DEFS.forEach(([k])=>{ if(typeof r.ratings?.[k]==='number') c.ratings[k].push(r.ratings[k]); });
      c.totalPcts.push(cfTotalPct(r.ratings));
      if(r.reviewPeriod) c.periods.add(r.reviewPeriod);
    }
  });
  const custRows=Object.values(byCustomer).sort((a,b)=>a.name.localeCompare(b.name));
  const today=new Date().toLocaleDateString('en-IN');
  const fmt=v=>v==null?'—':v.toFixed(1);
  const fmtPct=v=>v==null?'—':v+'%';
  const rows=custRows.map((c,i)=>`<tr>
    <td>${i+1}</td><td class="tl"><strong>${esc(c.name)}</strong></td>
    <td class="tl">${esc([...c.periods].join(', ')||'—')}</td>
    <td>${c.requests}</td><td>${c.responses}</td>
    ${CF_RATING_DEFS.map(([k])=>`<td style="font-weight:bold">${fmt(cfAvg(c.ratings[k]))}</td>`).join('')}
    <td style="font-weight:bold">${fmtPct(cfAvg(c.totalPcts)!=null?Math.round(cfAvg(c.totalPcts)):null)}</td>
  </tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Customer Satisfaction Summary</title>
  <style>${purPrintCSS()}@page{size:A4 landscape;margin:12mm 13mm 14mm 13mm}</style></head><body>
  <div class="pg-hdr">
    <div><div class="co-name">V R ALUCAST</div><div class="co-sub">High Pressure Die Casting · Ichalkaranji</div></div>
    <div><div class="rpt-title">CUSTOMER SATISFACTION SURVEY — SUMMARY</div><div class="rpt-sub">PERIOD:- ${esc(purPeriodLabel(_cfPeriod.period,_cfPeriod.from,_cfPeriod.to))}</div></div>
    <div><div class="rpt-num">${CF_DOC_NO}</div><div style="font-size:7pt;text-align:right">${CF_DOC_REV} &nbsp;|&nbsp; ${today}</div></div>
  </div>
  <table class="dt">
    <thead><tr>
      <th>SR</th><th class="tl">Customer</th><th class="tl">Review Period(s)</th><th>Requests</th><th>Responses</th>
      ${CF_RATING_DEFS.map(([,l])=>`<th>${l}</th>`).join('')}
      <th>Total Score</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="11" style="text-align:center">No feedback in this period</td></tr>'}</tbody>
  </table>
  <div style="margin-top:6px;font-size:7.5pt;color:#555">Rating scale: 2 Unsatisfactory · 4 Needs Improvement · 6 Satisfactory · 8 Good · 10 Excellent &nbsp;|&nbsp; Total Score = average of all 5 categories, as a % &nbsp;|&nbsp; ${CF_DOC_NO} · ${CF_DOC_REV} · Effective ${CF_DOC_DATE} · V R Alucast</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

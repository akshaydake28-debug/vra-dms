// VRA DMS — RAW MATERIAL MODULE

// ══════════════════════════════════════════════════════
//  RAW MATERIAL LABEL GENERATOR MODULE  v1.0
// ══════════════════════════════════════════════════════

const RM_DEFAULTS={grades:['ADC12','ADC10','A380','LM24'],approvers:['Manish Yadav','Sagar Shirgure','Akshay Dake']};
function rmGetList(k){try{return JSON.parse(localStorage.getItem('vra_rm_'+k))||RM_DEFAULTS[k];}catch(e){return RM_DEFAULTS[k];}}
function rmSaveList(k,a){try{localStorage.setItem('vra_rm_'+k,JSON.stringify(a));}catch(e){}}
async function rmGetLots(){try{const r=await fetch(window.location.origin+'/api/rm/lots');const lots=await r.json();return lots;}catch(e){return[];}}
function rmDateStr(d){if(!d)return'';const dt=new Date(d+'T00:00:00');return String(dt.getDate()).padStart(2,'0')+String(dt.getMonth()+1).padStart(2,'0')+String(dt.getFullYear()).slice(-2);}
function rmFmtDate(d){if(!d)return'—';const dt=new Date(d+'T00:00:00');return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}
async function rmNextLotNum(ds){const lots=await rmGetLots();const seq=lots.filter(l=>l.lotNumber&&l.lotNumber.includes('RM-'+ds)).length+1;return'VRA-RM-'+ds+'-'+String(seq).padStart(2,'0');}

function rmRenderLabels(){
  const today=new Date().toISOString().split('T')[0];
  const ds=rmDateStr(today);
  rmNextLotNum(ds).then(lotNum=>{
    const grades=rmGetList('grades'),approvers=rmGetList('approvers');
    setC(`<style>
      .rm-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:18px 22px;margin-bottom:14px}
      .rm-ct{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;display:flex;align-items:center;gap:7px}
      .rm-ct::before{content:'';display:inline-block;width:3px;height:13px;background:#639922;border-radius:2px}
      .rm-fg{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .rm-fg3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
      .rm-fg-item{display:flex;flex-direction:column;gap:5px}
      .rm-fg-item label{font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase}
      .rm-fg-item input,.rm-fg-item select{height:36px;border:1px solid #e5e7eb;border-radius:7px;padding:0 11px;font-size:13px;font-family:inherit;width:100%}
      .rm-ew{display:flex;gap:6px;align-items:center}.rm-ew select{flex:1}
      .rm-ab{flex-shrink:0;width:34px;height:36px;border-radius:7px;border:1px solid #97C459;background:#EAF3DE;color:#3B6D11;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
      .rm-ab:hover{background:#3B6D11;color:#fff}
      .rm-qr{display:flex;align-items:center;gap:14px;background:#FAEEDA;border:1px solid #EF9F27;border-radius:8px;padding:12px 16px;margin-bottom:10px}
      .rm-ql{flex:1;font-size:13px;font-weight:600;color:#BA7517}
      .rm-st{display:flex;align-items:center;gap:8px}
      .rm-sb{width:30px;height:30px;border-radius:50%;border:1px solid #EF9F27;background:#fff;color:#BA7517;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
      .rm-sb:hover{background:#BA7517;color:#fff}
      .rm-qv{font-size:20px;font-weight:700;color:#BA7517;min-width:26px;text-align:center}
      .rm-mb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:400;align-items:center;justify-content:center}
      .rm-mb.open{display:flex}
      .rm-mi{background:#fff;border-radius:12px;width:360px;padding:22px;box-shadow:0 8px 32px rgba(0,0,0,.18)}
      .rm-mi h4{font-size:14px;font-weight:700;margin-bottom:14px}
      .rm-mi input{width:100%;height:36px;border:1px solid #e5e7eb;border-radius:7px;padding:0 11px;font-size:13px;font-family:inherit;margin-bottom:10px}
      .rm-ml{border-top:1px solid #f3f4f6;padding-top:10px;max-height:150px;overflow-y:auto}
      .rm-mli{display:flex;align-items:center;justify-content:space-between;padding:5px 6px;border-radius:5px;font-size:13px}
      .rm-mli:hover{background:#f9fafb}
      .rm-mld{background:none;border:none;color:#9ca3af;cursor:pointer;font-size:15px}
      .rm-mld:hover{color:#dc2626}
      .rm-mbt{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
      .rm-pb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;align-items:center;justify-content:center}
      .rm-pb.open{display:flex}
      .rm-pm{background:#fff;border-radius:12px;width:92vw;max-width:820px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
      .rm-ph{padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;background:#f9fafb}
      .rm-pbd{overflow-y:auto;padding:18px;flex:1;background:#d1d5db;display:flex;flex-direction:column;align-items:center;gap:14px}
      .rm-a4{background:#fff;padding:8mm;display:flex;flex-direction:column;gap:0;box-shadow:0 2px 12px rgba(0,0,0,.18)}
      .rm-cl{text-align:center;font-size:10px;color:#9ca3af;letter-spacing:3px;padding:4px 0;border-top:1px dashed #d1d5db;border-bottom:1px dashed #d1d5db;margin:0}
      .rm-pf{padding:11px 18px;border-top:1px solid #e5e7eb;display:flex;align-items:center;justify-content:flex-end;gap:10px}
      .rm-label{width:190mm;height:124mm;background:#fff;border:2px solid #1f2937;font-family:Arial,sans-serif;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden}
      .rm-lh{background:#1f2937;color:#fff;padding:7px 12px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
      .rm-lco{font-size:14px;font-weight:900;letter-spacing:3px}
      .rm-lbn{font-size:10px;opacity:.6}
      .rm-lb{flex:1;display:flex;flex-direction:column}
      .rm-ls{background:#3B6D11;color:#fff;text-align:center;font-size:11px;font-weight:800;letter-spacing:2px;padding:4px 0;flex-shrink:0}
      .rm-ll{border-bottom:2px solid #1f2937;padding:8px 12px 6px;flex-shrink:0}
      .rm-lfl{font-size:8px;font-weight:700;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}
      .rm-lln{font-size:26px;font-weight:900;color:#1f2937;letter-spacing:1px;line-height:1}
      .rm-lg{flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #d1d5db}
      .rm-lgw{flex:1;display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #d1d5db}
      .rm-lf{border-right:1px solid #d1d5db;padding:6px 10px;display:flex;flex-direction:column;justify-content:center}
      .rm-lf:last-child{border-right:none}
      .rm-lf.ab{background:#FAEEDA}
      .rm-lv{font-size:15px;font-weight:800;color:#1f2937;line-height:1.2;margin-top:2px}
      .rm-lv.am{color:#633806;font-size:22px}
      .rm-lft{display:flex;align-items:center;justify-content:space-between;padding:4px 12px;border-top:1px solid #e5e7eb;flex-shrink:0;background:#f9fafb}
      .rm-ldoc{font-size:8px;color:#9ca3af}
      .rm-lhole{width:14px;height:14px;border-radius:50%;border:1.5px solid #9ca3af;display:flex;align-items:center;justify-content:center}
      .rm-lhi{width:6px;height:6px;border-radius:50%;background:#d1d5db}
      @media print{body *{visibility:hidden!important}#rm-pa,#rm-pa *,#rm-pa2,#rm-pa2 *{visibility:visible!important}#rm-pa,#rm-pa2{position:fixed;top:0;left:0;width:210mm;display:flex;flex-direction:column;align-items:center;gap:0;background:#fff;padding:5mm 10mm;box-sizing:border-box}.rm-a4{width:190mm;display:flex;flex-direction:column;gap:0;page-break-after:always}.rm-label{width:190mm;height:124mm;border:2px solid #1f2937;box-shadow:none;page-break-inside:avoid}}
    </style>
    <div class="ph"><h2>Raw Material — Label Generator</h2></div>
    <div class="rm-card">
      <div class="rm-ct">Lot Details</div>
      <div class="rm-fg3">
        <div class="rm-fg-item"><label>Lot Number (auto)</label><input type="text" id="rm-lot" style="background:#EAF3DE;color:#27500A;font-weight:700;border-color:#97C459" readonly value="${lotNum}"></div>
        <div class="rm-fg-item"><label>Received Date</label><input type="date" id="rm-date" value="${today}" onchange="rmRefLot()"></div>
        <div class="rm-fg-item"><label>Alloy Grade</label><div class="rm-ew"><select id="rm-grade">${grades.map(g=>`<option>${g}</option>`).join('')}</select><button class="rm-ab" onclick="rmOpenAdd('grades')">＋</button></div></div>
      </div>
    </div>
    <div class="rm-card">
      <div class="rm-ct">Supplier & Invoice</div>
      <div class="rm-fg">
        <div class="rm-fg-item"><label>Supplier Name</label><input type="text" id="rm-sup" placeholder="e.g. XYZ Metals Ltd"></div>
        <div class="rm-fg-item"><label>Invoice Number</label><input type="text" id="rm-inv" placeholder="e.g. INV-2025-0047"></div>
      </div>
    </div>
    <div class="rm-card">
      <div class="rm-ct">Approval</div>
      <div class="rm-fg">
        <div class="rm-fg-item"><label>Approved By</label><div class="rm-ew"><select id="rm-appr"><option value="">— Select —</option>${approvers.map(a=>`<option>${a}</option>`).join('')}</select><button class="rm-ab" onclick="rmOpenAdd('approvers')">＋</button></div></div>
        <div class="rm-fg-item"><label>Spectro Status</label><select id="rm-spec"><option>Done</option><option>Pending</option><option>Not Required</option></select></div>
      </div>
    </div>
    <div class="rm-qr">
      <div><div class="rm-ql">How many bundle labels to print?</div><div style="font-size:11px;color:#6b7280">One label per bundle.</div></div>
      <div class="rm-st"><button class="rm-sb" onclick="rmChgQty(-1)">−</button><span class="rm-qv" id="rm-qty">4</span><button class="rm-sb" onclick="rmChgQty(1)">＋</button></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:4px">
      <button class="btn btn-p" onclick="rmSave()">💾 Save to Register</button>
      <button class="btn btn-g" onclick="rmPreview(null)">🖨 Preview & Print</button>
      <button class="btn btn-o" onclick="rmClear()">✕ Clear</button>
    </div>
    <div id="rm-msg" style="margin-top:8px;font-size:12px;display:none"></div>
    <div class="rm-mb" id="rm-add-modal"><div class="rm-mi">
      <h4 id="rm-mt">Manage List</h4>
      <input type="text" id="rm-mi" maxlength="60" onkeydown="if(event.key==='Enter')rmConfAdd()">
      <div class="rm-ml" id="rm-mlist"></div>
      <div class="rm-mbt"><button class="btn btn-o btn-sm" onclick="rmCloseAdd()">Cancel</button><button class="btn btn-p btn-sm" onclick="rmConfAdd()">Add</button></div>
    </div></div>
    <div class="rm-pb" id="rm-pmod"><div class="rm-pm">
      <div class="rm-ph"><h3>Label Preview — <span id="rm-pln"></span></h3><button class="btn btn-o btn-sm" onclick="rmClosePrint()">✕</button></div>
      <div class="rm-pbd" id="rm-pa"></div>
      <div class="rm-pf"><span style="font-size:12px;color:#6b7280" id="rm-pc"></span><button class="btn btn-p" onclick="window.print()">🖨 Print All</button></div>
    </div></div>`);
    window._rmQty=4;window._rmAddTarget=null;
  });
}

function rmRefLot(){const d=document.getElementById('rm-date')?.value;if(!d)return;rmNextLotNum(rmDateStr(d)).then(n=>{const e=document.getElementById('rm-lot');if(e)e.value=n;});}
function rmChgQty(d){window._rmQty=Math.max(1,Math.min(20,(window._rmQty||4)+d));const e=document.getElementById('rm-qty');if(e)e.textContent=window._rmQty;}

function rmVal(){
  const fields=[{id:'rm-sup',label:'Supplier Name'},{id:'rm-inv',label:'Invoice Number'},{id:'rm-appr',label:'Approved By'},{id:'rm-date',label:'Received Date'}];
  for(const f of fields){if(!document.getElementById(f.id)?.value?.trim()){const m=document.getElementById('rm-msg');if(m){m.textContent='⚠ Please fill in: '+f.label;m.style.display='block';m.style.color='#dc2626';}return false;}}
  const m=document.getElementById('rm-msg');if(m)m.style.display='none';return true;
}

function rmCollect(){return{lotNumber:document.getElementById('rm-lot').value,date:document.getElementById('rm-date').value,grade:document.getElementById('rm-grade').value,supplier:document.getElementById('rm-sup').value.trim(),invoice:document.getElementById('rm-inv').value.trim(),approvedBy:document.getElementById('rm-appr').value,spectro:document.getElementById('rm-spec').value,bundles:window._rmQty||4};}

async function rmSave(){
  if(!rmVal())return;
  const lot=rmCollect();
  try{await fetch(window.location.origin+'/api/rm/lots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lot)});
  const m=document.getElementById('rm-msg');if(m){m.textContent='✓ Saved.';m.style.display='block';m.style.color='#15803d';}setTimeout(()=>{const m=document.getElementById('rm-msg');if(m)m.style.display='none';rmRefLot();},2000);}catch(e){toast('Save failed','d');}
}

function rmPreview(lotData){
  if(!lotData&&!rmVal())return;
  const lot=lotData||rmCollect(),qty=lotData?lotData.bundles:(window._rmQty||4);
  const area=document.getElementById('rm-pa');if(!area)return;
  area.innerHTML='';
  for(let i=1;i<=qty;i+=2){const sheet=document.createElement('div');sheet.className='rm-a4';sheet.appendChild(rmBuildLabel(lot,i,qty));if(i+1<=qty){const cut=document.createElement('div');cut.className='rm-cl';cut.textContent='✂  CUT HERE';sheet.appendChild(cut);sheet.appendChild(rmBuildLabel(lot,i+1,qty));}area.appendChild(sheet);}
  const ln=document.getElementById('rm-pln'),lc=document.getElementById('rm-pc');
  if(ln)ln.textContent=lot.lotNumber;if(lc)lc.textContent=qty+' label(s)';
  const m=document.getElementById('rm-pmod');if(m)m.classList.add('open');
}

function rmClosePrint(){const m=document.getElementById('rm-pmod');if(m)m.classList.remove('open');}

function rmBuildLabel(lot,idx,total){
  const stxt=lot.spectro==='Done'?'✓ DONE':lot.spectro==='Pending'?'⏳ PENDING':'N/A';
  const sc=lot.spectro==='Done'?'#15803d':lot.spectro==='Pending'?'#d97706':'#6b7280';
  const d=document.createElement('div');d.className='rm-label';
  d.innerHTML=`<div class="rm-lh"><div class="rm-lco">V R ALUCAST</div><div class="rm-lbn">Bundle ${idx} of ${total}</div></div>
    <div class="rm-ls">✓ &nbsp; RAW MATERIAL — APPROVED FOR USE</div>
    <div class="rm-lb">
      <div class="rm-ll"><div class="rm-lfl">LOT NUMBER</div><div class="rm-lln">${lot.lotNumber}</div></div>
      <div class="rm-lg">
        <div class="rm-lf ab"><div class="rm-lfl">GRADE</div><div class="rm-lv am">${lot.grade}</div></div>
        <div class="rm-lf"><div class="rm-lfl">SUPPLIER</div><div class="rm-lv" style="font-size:13px">${lot.supplier}</div></div>
        <div class="rm-lf"><div class="rm-lfl">INVOICE NO.</div><div class="rm-lv" style="font-size:13px">${lot.invoice}</div></div>
      </div>
      <div class="rm-lgw">
        <div class="rm-lf"><div class="rm-lfl">RECEIVED DATE</div><div class="rm-lv">${rmFmtDate(lot.date)}</div></div>
        <div class="rm-lf"><div class="rm-lfl">APPROVED BY</div><div class="rm-lv">${lot.approvedBy}</div></div>
      </div>
    </div>
    <div class="rm-lft"><div class="rm-ldoc">VRA-QC-F-010 | Rev 00 | Jun 2025</div><div style="font-size:10px;font-weight:800;color:${sc}">SPECTRO: ${stxt}</div><div class="rm-lhole"><div class="rm-lhi"></div></div></div>`;
  return d;
}

function rmClear(){
  const today=new Date().toISOString().split('T')[0];
  ['rm-sup','rm-inv'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const a=document.getElementById('rm-appr');if(a)a.value='';
  const s=document.getElementById('rm-spec');if(s)s.value='Done';
  const d=document.getElementById('rm-date');if(d){d.value=today;}
  window._rmQty=4;const q=document.getElementById('rm-qty');if(q)q.textContent='4';
  const m=document.getElementById('rm-msg');if(m)m.style.display='none';rmRefLot();
}

function rmOpenAdd(t){window._rmAddTarget=t;const isG=t==='grades';const mt=document.getElementById('rm-mt');if(mt)mt.textContent=isG?'Manage Alloy Grades':'Manage Approvers';const mi=document.getElementById('rm-mi');if(mi){mi.placeholder=isG?'e.g. A360, LM6':'Name e.g. Ravi Kumar';mi.value='';}rmRenderML();const m=document.getElementById('rm-add-modal');if(m)m.classList.add('open');setTimeout(()=>document.getElementById('rm-mi')?.focus(),50);}
function rmCloseAdd(){const m=document.getElementById('rm-add-modal');if(m)m.classList.remove('open');window._rmAddTarget=null;}
function rmConfAdd(){const v=document.getElementById('rm-mi')?.value?.trim();if(!v)return;const t=window._rmAddTarget,l=rmGetList(t);if(!l.includes(v)){l.push(v);rmSaveList(t,l);}const mi=document.getElementById('rm-mi');if(mi)mi.value='';const sid=t==='grades'?'rm-grade':'rm-appr';const s=document.getElementById(sid);if(s){const nl=rmGetList(t);s.innerHTML=t==='grades'?nl.map(g=>`<option>${g}</option>`).join(''):'<option value="">— Select —</option>'+nl.map(a=>`<option>${a}</option>`).join('');s.value=v;}rmRenderML();}
function rmDelItem(v){const t=window._rmAddTarget,l=rmGetList(t).filter(x=>x!==v);if(t==='grades'&&l.length===0){alert('Must keep at least one grade.');return;}rmSaveList(t,l);const sid=t==='grades'?'rm-grade':'rm-appr';const s=document.getElementById(sid);if(s){s.innerHTML=t==='grades'?l.map(g=>`<option>${g}</option>`).join(''):'<option value="">— Select —</option>'+l.map(a=>`<option>${a}</option>`).join('');}rmRenderML();}
function rmRenderML(){const items=rmGetList(window._rmAddTarget);const el=document.getElementById('rm-mlist');if(!el)return;el.innerHTML=items.length===0?'<div style="font-size:12px;color:#9ca3af;padding:6px">No items yet.</div>':items.map(i=>`<div class="rm-mli"><span>${i}</span><button class="rm-mld" onclick="rmDelItem('${i.replace(/'/g,"\'")}')">×</button></div>`).join('');}

async function rmRenderRegister(){
  const lots=await rmGetLots();
  const now=new Date(),tm=lots.filter(l=>{const d=new Date(l.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}),pend=lots.filter(l=>l.spectro==='Pending');
  setC(`<div class="ph"><h2>Raw Material — Lot Register</h2><button class="btn btn-p" onclick="nav('rm-labels')">➕ New Lot</button></div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
    <div class="kpi-card"><div class="kpi-n">${lots.length}</div><div class="kpi-l">Total Lots</div></div>
    <div class="kpi-card"><div class="kpi-n">${tm.length}</div><div class="kpi-l">This Month</div></div>
    <div class="kpi-card"><div class="kpi-n" style="color:${pend.length>0?'#d97706':'#16a34a'}">${pend.length}</div><div class="kpi-l">Spectro Pending</div></div>
  </div>
  <div class="card"><div class="tw"><table class="tbl">
    <thead><tr><th>Lot Number</th><th>Date</th><th>Grade</th><th>Supplier</th><th>Invoice</th><th>Spectro</th><th>Approved By</th><th>Bundles</th><th></th></tr></thead>
    <tbody>${lots.map(l=>`<tr>
      <td style="font-family:monospace;font-weight:700;color:#27500A">${l.lotNumber}</td>
      <td>${rmFmtDate(l.date)}</td>
      <td><span class="badge" style="background:#FAEEDA;color:#BA7517">${l.grade}</span></td>
      <td>${l.supplier}</td><td style="font-family:monospace;font-size:12px">${l.invoice}</td>
      <td><span class="badge ${l.spectro==='Done'?'ba':'bp'}">${l.spectro}</span></td>
      <td>${l.approvedBy}</td><td style="text-align:center">${l.bundles}</td>
      <td><div style="display:flex;gap:5px">
        <button class="btn btn-sm" style="background:#FAEEDA;color:#BA7517" onclick="rmPrintReg(${l.id})">🖨</button>
        <button class="btn btn-r btn-sm" onclick="rmDelLot(${l.id})">✕</button>
      </div></td>
    </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:28px;color:#9ca3af">No lots yet.</td></tr>'}
    </tbody>
  </table></div></div>
  <div class="rm-pb" id="rm-pmod2"><div class="rm-pm">
    <div class="rm-ph"><h3>Label Preview — <span id="rm-pln2"></span></h3><button class="btn btn-o btn-sm" onclick="document.getElementById('rm-pmod2').classList.remove('open')">✕</button></div>
    <div class="rm-pbd" id="rm-pa2"></div>
    <div class="rm-pf"><button class="btn btn-p" onclick="window.print()">🖨 Print All</button></div>
  </div></div>`);
}

async function rmDelLot(id){if(!confirm('Delete this lot?'))return;await fetch(window.location.origin+'/api/rm/lots/'+id,{method:'DELETE'});toast('Lot deleted','s');rmRenderRegister();}

function rmPrintReg(id){rmGetLots().then(lots=>{const l=lots.find(x=>x.id===id);if(!l)return;const area=document.getElementById('rm-pa2');if(!area)return;area.innerHTML='';for(let i=1;i<=l.bundles;i+=2){const sheet=document.createElement('div');sheet.className='rm-a4';sheet.appendChild(rmBuildLabel(l,i,l.bundles));if(i+1<=l.bundles){const cut=document.createElement('div');cut.className='rm-cl';cut.textContent='✂  CUT HERE';sheet.appendChild(cut);sheet.appendChild(rmBuildLabel(l,i+1,l.bundles));}area.appendChild(sheet);}const ln=document.getElementById('rm-pln2');if(ln)ln.textContent=l.lotNumber;const m=document.getElementById('rm-pmod2');if(m)m.classList.add('open');});}

// ══ END RAW MATERIAL MODULE ══
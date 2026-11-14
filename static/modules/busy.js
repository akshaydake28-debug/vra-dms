// VRA DMS — BUSY LINK
// Imports purchase and sales registers exported from BUSY (Excel or CSV).
// This file only reads the file and shows the screens; the server decides
// what is new, saves each import in one step and can undo it (see the
// BUSY LINK section in app.py).

// ══════════════════════════════════════════════════════
//  COLUMN MATCHING
// ══════════════════════════════════════════════════════
const BUSY_FIELDS={
  purchase:[
    {k:'date',label:'Date',req:true},
    {k:'billNo',label:'Supplier bill no.',hint:'the supplier\'s own invoice number'},
    {k:'vchNo',label:'Voucher no.',hint:'BUSY\'s voucher number'},
    {k:'party',label:'Supplier (party)',req:true},
    {k:'gstin',label:'GSTIN',hint:'best way to match suppliers'},
    {k:'item',label:'Item',req:true},
    {k:'qty',label:'Quantity',req:true},
    {k:'unit',label:'Unit'},
    {k:'rate',label:'Rate'},
    {k:'amount',label:'Amount'},
  ],
  sale:[
    {k:'date',label:'Date',req:true},
    {k:'vchNo',label:'Invoice / voucher no.',req:true},
    {k:'party',label:'Customer (party)',req:true},
    {k:'gstin',label:'GSTIN'},
    {k:'item',label:'Item',req:true},
    {k:'qty',label:'Quantity',req:true},
    {k:'unit',label:'Unit'},
    {k:'rate',label:'Rate'},
    {k:'amount',label:'Amount'},
  ],
};
// Header names BUSY and similar registers use, compared without spaces/punctuation
const BUSY_SYNONYMS={
  date:['date','vchdate','voucherdate','billdate','invdate','invoicedate','dated','docdate'],
  billNo:['partybillno','supplierbillno','suppbillno','partyinvno','partyinvoiceno','supplierinvoiceno','supplierinvno','originalbillno','billno','refno','referenceno','partyrefno'],
  vchNo:['vchno','vchbillno','voucherno','vouchernumber','vchnumber','vchseriesno','invoiceno','invno','invoicenumber','billno','docno'],
  party:['party','partyname','account','accountname','acname','accname','ledger','ledgername','partyac','supplier','suppliername','customer','customername','buyer','buyername','particulars'],
  gstin:['gstin','gstno','gstinuin','gstnumber','partygstin','gstinno','gstinofparty','gstregno'],
  item:['item','itemname','itemdetails','itemdescription','product','productname','stockitem','goods','description','particulars'],
  qty:['qty','quantity','mainqty','qtymain','billedqty','actualqty','qtyinmainunit'],
  unit:['unit','uom','mainunit','units','unitname'],
  rate:['rate','price','rateunit','unitprice','rateperunit'],
  amount:['amount','taxable','taxableamount','taxablevalue','value','itemamount','netamount','amt','basicamount','assessablevalue'],
};
function busyHdr(s){return String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function busyNorm(s){return String(s??'').toUpperCase().replace(/[^A-Z0-9]/g,'');}

// Pick the header row (BUSY puts company / report titles above it) and suggest a match per field
function busyDetect(kind,aoa){
  let best={row:-1,score:0};
  for(let r=0;r<Math.min(aoa.length,40);r++){
    const cells=(aoa[r]||[]).map(busyHdr);
    let score=0;
    for(const f of BUSY_FIELDS[kind]) if(cells.some(c=>c&&(BUSY_SYNONYMS[f.k]||[]).includes(c))) score++;
    if(score>best.score) best={row:r,score};
  }
  if(best.score<3) return null;
  const headers=(aoa[best.row]||[]).map(h=>String(h??'').trim());
  const map={},used=new Set();
  for(const f of BUSY_FIELDS[kind]){
    for(const syn of BUSY_SYNONYMS[f.k]||[]){
      const i=headers.findIndex((h,ix)=>!used.has(ix)&&busyHdr(h)===syn);
      if(i>=0){map[f.k]=headers[i];used.add(i);break;}
    }
  }
  return {row:best.row,headers,map};
}

// ── values ───────────────────────────────────────────
const BUSY_MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function busyIso(y,m,d){
  y=+y; if(y<100) y+=2000; m=+m; d=+d;
  const dt=new Date(Date.UTC(y,m-1,d));
  if(!y||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d) return '';
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function busyDate(v){
  if(v===''||v==null) return '';
  if(typeof v==='number'&&v>20000&&v<80000){             // Excel serial day number
    const dt=new Date(Math.round((v-25569)*86400000));
    return busyIso(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());
  }
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return busyIso(m[1],m[2],m[3]);
  m=s.match(/^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{2,4})$/); if(m) return busyIso(m[3],m[2],m[1]);   // day first (India)
  m=s.match(/^(\d{1,2})[-\/. ]([A-Za-z]{3,4})[a-z]*[-\/., ]+(\d{2,4})$/); if(m&&BUSY_MONTHS[m[2].toLowerCase()]) return busyIso(m[3],BUSY_MONTHS[m[2].toLowerCase()],m[1]);
  return '';
}
function busyNum(v){
  if(typeof v==='number') return isFinite(v)?v:null;
  const m=String(v??'').replace(/,/g,'').match(/-?\d+(\.\d+)?/);
  return m?parseFloat(m[0]):null;
}
function busyUnitFrom(v){const m=String(v??'').match(/[A-Za-z][A-Za-z.]*\s*$/);return m?m[0].replace(/\./g,'').trim():'';}

// Rows → invoices. BUSY item-wise registers often print the date, voucher
// and party only on an invoice's first line, so blanks are filled down.
function busyGroup(kind,aoa,det,map){
  const col={};for(const [k,h] of Object.entries(map)) if(h){const i=det.headers.indexOf(h);if(i>=0) col[k]=i;}
  const get=(row,k)=>col[k]==null?'':row[col[k]];
  const invoices=[],byKey={},problems=[];
  let last={};
  for(let r=det.row+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    const item=String(get(row,'item')??'').trim();
    const firstCells=['date','vchNo','billNo','party','item'].map(k=>String(get(row,k)??''));
    if(firstCells.some(c=>/^\s*(grand\s*)?total\b/i.test(c))) continue;      // total / sub-total rows
    const head={date:get(row,'date'),vchNo:String(get(row,'vchNo')??'').trim(),billNo:String(get(row,'billNo')??'').trim(),
      party:String(get(row,'party')??'').trim(),gstin:String(get(row,'gstin')??'').trim()};
    // A row continues the invoice above unless it shows a different voucher, bill or party —
    // BUSY may repeat the voucher no. on every item row but print the party only once.
    const startsNew=(head.vchNo&&head.vchNo!==last.vchNo)||(head.billNo&&head.billNo!==last.billNo)||(head.party&&head.party!==last.party);
    if(startsNew) last={...head,date:head.date!==''?head.date:last.date};
    else for(const k of ['date','gstin']) if(head[k]!==''&&!last[k]) last[k]=head[k];
    if(!item) continue;
    const qtyRaw=get(row,'qty');
    const line={item,qty:busyNum(qtyRaw),unit:String(get(row,'unit')??'').trim()||busyUnitFrom(qtyRaw),
      rate:busyNum(get(row,'rate')),amount:busyNum(get(row,'amount'))};
    const date=busyDate(last.date);
    const number=kind==='purchase'?(last.billNo||last.vchNo):last.vchNo;
    const key=[date,busyNorm(number),busyNorm(last.party)].join('|');
    if(!byKey[key]){
      byKey[key]={date,vchNo:last.vchNo||'',billNo:last.billNo||'',party:last.party||'',gstin:last.gstin||'',lines:[],ref:`row ${r+1}`};
      invoices.push(byKey[key]);
    }
    byKey[key].lines.push(line);
    if(line.qty==null) problems.push(`Row ${r+1}: quantity "${qtyRaw}" is not a number`);
  }
  return {invoices,problems};
}

// ══════════════════════════════════════════════════════
//  IMPORT PAGE
// ══════════════════════════════════════════════════════
let _busy={kind:'purchase'};
async function busyLoadXlsx(){
  if(window.XLSX) return;
  await new Promise((res,rej)=>{const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej(new Error('could not load the Excel reader'));document.head.appendChild(s);});
}
async function busyApi(method,path,body){
  const r=await fetch(window.location.origin+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(j.error||('Server answered '+r.status)),{data:j});
  return j;
}

function busyRenderImport(){
  _busy={kind:_busy.kind||'purchase'};
  const k=_busy.kind;
  setC(`
  <div class="ph"><h2>🔗 Import from BUSY</h2>
    <div style="display:flex;gap:8px"><button class="btn btn-o" onclick="nav('busy-history')">🕘 Import History</button><button class="btn btn-o" onclick="nav('busy-items')">🏷️ Item Matching</button></div></div>
  <div class="card" style="margin-bottom:12px"><div class="ch"><h5>1. Choose the BUSY export</h5></div><div class="cb">
    <div style="display:flex;gap:18px;margin-bottom:12px;font-size:13px">
      <label style="cursor:pointer"><input type="radio" name="busy-kind" value="purchase" ${k==='purchase'?'checked':''} onchange="_busy.kind=this.value;busyRenderImport()"> <b>Purchase register</b> — supplier bills</label>
      <label style="cursor:pointer"><input type="radio" name="busy-kind" value="sale" ${k==='sale'?'checked':''} onchange="_busy.kind=this.value;busyRenderImport()"> <b>Sales register</b> — your invoices (dispatch)</label>
    </div>
    <div style="background:#f5f7fd;border:1px solid #dbe3f4;border-radius:7px;padding:10px 12px;font-size:12px;color:#374151;margin-bottom:12px">
      <b>In BUSY:</b> open the ${k==='purchase'?'Purchase':'Sales'} register for the dates you want, <b>item-wise</b> (one row per item), press <b>ALT+E</b> and save as <b>Excel</b> or CSV.
      Importing the same dates twice is safe — invoices already in the DMS are skipped.
    </div>
    <input type="file" class="fc" accept=".xlsx,.xls,.csv" onchange="busyReadFile(this.files[0])">
    <div id="busy-file-msg" style="font-size:12px;margin-top:8px"></div>
  </div></div>
  <div id="busy-step2"></div>
  <div id="busy-step3"></div>`);
}

async function busyReadFile(file){
  const msg=document.getElementById('busy-file-msg');
  document.getElementById('busy-step2').innerHTML='';document.getElementById('busy-step3').innerHTML='';
  if(!file) return;
  msg.innerHTML='<span class="muted">Reading the file…</span>';
  try{
    await busyLoadXlsx();
    // raw: keep CSV text as written — otherwise "06/11/2026" is read month-first
    // (11 June). busyDate() reads dates day-first, as BUSY writes them in India.
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
    const det=busyDetect(_busy.kind,aoa);
    if(!det){msg.innerHTML=`<span style="color:#dc2626">⚠️ Couldn't find the column headings (Date, Party, Item, Qty…) in the first 40 rows. Is this the item-wise ${_busy.kind==='purchase'?'purchase':'sales'} register?</span>`;return;}
    Object.assign(_busy,{fileName:file.name,aoa,det});
    const saved=(await DB.getSetting('busyColumns_'+_busy.kind).catch(()=>null))||null;
    let note='';
    if(saved&&saved.map){
      const have=new Set(det.headers.map(busyHdr));
      const missing=Object.values(saved.map).filter(h=>h&&!have.has(busyHdr(h)));
      if(!missing.length){
        _busy.map={};for(const [f,h] of Object.entries(saved.map)) if(h) _busy.map[f]=det.headers.find(x=>busyHdr(x)===busyHdr(h));
        _busy.usingSaved=true;
      } else {
        _busy.map=det.map;
        note=`<div class="alert al-w" style="margin-bottom:10px">⚠️ This file's columns are different from last time — <b>${missing.map(esc).join(', ')}</b> ${missing.length>1?'are':'is'} missing. BUSY may have been updated or a different report was exported. Check the matching below before going on.</div>`;
      }
    } else _busy.map=det.map;
    msg.innerHTML=`✓ <b>${esc(file.name)}</b> — ${aoa.length-det.row-1} rows below the headings.`;
    busyRenderMapping(note);
  }catch(e){msg.innerHTML=`<span style="color:#dc2626">⚠️ Could not read the file: ${esc(e.message)}</span>`;}
}

function busyRenderMapping(note=''){
  const {det,kind}=_busy;
  const sample=f=>{const h=_busy.map[f];if(!h)return'';const i=det.headers.indexOf(h);
    for(let r=det.row+1;r<Math.min(_busy.aoa.length,det.row+15);r++){const v=_busy.aoa[r]?.[i];if(v!==''&&v!=null) return String(f==='date'?(busyDate(v)||v):v);}return'';};
  document.getElementById('busy-step2').innerHTML=`
  <div class="card" style="margin-bottom:12px"><div class="ch"><h5>2. Match the columns</h5>
    ${_busy.usingSaved?'<span class="badge ba">Using the matching you saved last time</span>':''}</div><div class="cb">
    ${note}
    <div class="tw"><table><thead><tr><th>DMS needs</th><th>Column in your file</th><th>First value</th></tr></thead><tbody>
    ${BUSY_FIELDS[kind].map(f=>`<tr><td><b>${f.label}</b>${f.req?' <span style="color:#dc2626">*</span>':''}${f.hint?`<div class="muted" style="font-size:11px">${f.hint}</div>`:''}</td>
      <td><select class="fc" onchange="_busy.map['${f.k}']=this.value;_busy.usingSaved=false;busyRenderMapping()">
        <option value="">— not in file —</option>${det.headers.filter(Boolean).map(h=>`<option ${_busy.map[f.k]===h?'selected':''}>${esc(h)}</option>`).join('')}</select></td>
      <td class="mono" style="font-size:12px;color:#374151">${esc(sample(f.k))}</td></tr>`).join('')}
    </tbody></table></div>
    ${kind==='purchase'?'<div class="muted" style="font-size:11px;margin-top:6px">Supplier bill no. or voucher no. — at least one is needed. GSTIN makes supplier matching exact.</div>':''}
    <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn btn-p" onclick="busyCheck()">Check invoices →</button></div>
  </div></div>`;
}

async function busyCheck(){
  const {kind}=_busy;
  const miss=BUSY_FIELDS[kind].filter(f=>f.req&&!_busy.map[f.k]).map(f=>f.label);
  if(kind==='purchase'&&!_busy.map.billNo&&!_busy.map.vchNo) miss.push('Supplier bill no. or Voucher no.');
  if(miss.length){toast('Match these columns first: '+miss.join(', '),'d');return;}
  const {invoices,problems}=busyGroup(kind,_busy.aoa,_busy.det,_busy.map);
  if(!invoices.length){toast('No item rows found under the headings','d');return;}
  _busy.invoices=invoices;_busy.problems=problems;
  const s3=document.getElementById('busy-step3');
  s3.innerHTML='<div class="card"><div class="cb muted">Checking against the DMS…</div></div>';
  try{
    _busy.supplierMap={};
    _busy.preview=await busyApi('POST','/api/busy/preview',{kind,invoices});
    // BUSY parties the DMS doesn't know: with no look-alike they are simply new; with one, the user decides
    for(const r of _busy.preview.invoices) if(r.vendor?.unknown&&!r.vendor.suggestions.length) _busy.supplierMap[r.partyKey]='new';
    if(Object.keys(_busy.supplierMap).length) _busy.preview=await busyApi('POST','/api/busy/preview',{kind,invoices,supplierMap:_busy.supplierMap});
    _busy.vendors=kind==='purchase'?(await busyVendors()).sort((a,b)=>String(a.name).localeCompare(String(b.name))):[];
    _busy.choices={};_busy.includeManual=new Set();
    const [parts,grades]=await Promise.all([db.prodParts.toArray().catch(()=>[]),typeof rmGetGrades==='function'?rmGetGrades():[]]);
    _busy.parts=parts.sort((a,b)=>String(a.partNumber).localeCompare(String(b.partNumber)));_busy.grades=grades;
    for(const u of _busy.preview.unknownItems) _busy.choices[u.key]=busySuggest(kind,u.item);
    busyRenderPreview();
  }catch(e){s3.innerHTML=`<div class="alert al-d">⚠️ ${esc(e.message)}</div>`;}
}

function busySuggest(kind,item){
  const n=busyNorm(item);
  if(kind==='sale'){
    const p=_busy.parts.filter(p=>p.partNumber&&n.includes(busyNorm(p.partNumber))).sort((a,b)=>busyNorm(b.partNumber).length-busyNorm(a.partNumber).length)[0];
    return p?{type:'part',partId:p.id,item}:{item};
  }
  const g=_busy.grades.filter(g=>n.includes(busyNorm(g))).sort((a,b)=>busyNorm(b).length-busyNorm(a).length)[0];
  return g?{type:'rm',grade:g,item}:{item};
}
function busyChoiceComplete(c){return c&&(c.type==='rm'?!!c.grade:c.type==='part'?!!c.partId:!!c.type);}

const BUSY_STATUS={new:['New — will be imported','ba'],imported:['Already imported','bd'],changed:['Changed in BUSY since import — not imported','br'],
  manual:['Possible duplicate of an entry made by hand','bp'],error:['Problem in the file','br']};

function busyRenderPreview(){
  const {kind,preview}=_busy;
  const rows=preview.invoices,unk=preview.unknownItems;
  const cnt=s=>rows.filter(r=>r.status===s).length;
  const toImport=cnt('new')+_busy.includeManual.size;
  const pending=unk.filter(u=>!busyChoiceComplete(_busy.choices[u.key])).length;
  const parties=[];{const seen=new Set();for(const r of rows) if(r.vendor?.unknown&&!seen.has(r.partyKey)){seen.add(r.partyKey);parties.push(r);}}
  const supPending=parties.filter(r=>!_busy.supplierMap[r.partyKey]).length;
  const supCtl=r=>{const cur=_busy.supplierMap[r.partyKey],sug=r.vendor.suggestions||[];
    const others=_busy.vendors.filter(v=>!sug.some(x=>x.id===v.id));
    return `<select class="fc" onchange="busySetSupplier('${r.partyKey}',this.value)">
      <option value="">— same as an existing supplier, or new? —</option>
      ${sug.length?`<optgroup label="Looks like">${sug.map(x=>`<option value="${x.id}" ${cur===x.id?'selected':''}>${esc(x.name)} (${esc(x.supNumber||'')})${x.gstNo?' · '+esc(x.gstNo):''}</option>`).join('')}</optgroup>`:''}
      <option value="new" ${cur==='new'?'selected':''}>➕ New supplier — add to the Supplier Register</option>
      ${others.length?`<optgroup label="Other suppliers">${others.map(v=>`<option value="${v.id}" ${cur===v.id?'selected':''}>${esc(v.name)} (${esc(v.supNumber||'')})</option>`).join('')}</optgroup>`:''}
    </select>`;};
  const fmt=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const itemCtl=u=>{
    const c=_busy.choices[u.key]||{};
    if(kind==='sale') return `<select class="fc" onchange="busySetChoice('${u.key}',this.value?(this.value==='skip'?{type:'skip'}:{type:'part',partId:+this.value}):{})">
      <option value="">— choose the part —</option>${_busy.parts.map(p=>`<option value="${p.id}" ${c.partId===p.id?'selected':''}>${esc(p.partNumber)} — ${esc(p.partName||'')}</option>`).join('')}
      <option value="skip" ${c.type==='skip'?'selected':''}>Not a part (freight, packing, tooling…) — skip</option></select>`;
    return `<div style="display:flex;gap:6px"><select class="fc" onchange="busySetChoice('${u.key}',this.value?{type:this.value,grade:(_busy.choices['${u.key}']||{}).grade}:{})">
      <option value="">— what is this? —</option>
      <option value="rm" ${c.type==='rm'?'selected':''}>Raw material (alloy ingot) — becomes an RM lot</option>
      <option value="inspect" ${c.type==='inspect'?'selected':''}>Needs QC inspection (flux, die coat, inserts…)</option>
      <option value="none" ${c.type==='none'?'selected':''}>No inspection (services, power, stationery…)</option></select>
      ${c.type==='rm'?`<select class="fc" style="max-width:140px" onchange="busySetChoice('${u.key}',{type:'rm',grade:this.value})"><option value="">— grade —</option>${_busy.grades.map(g=>`<option ${c.grade===g?'selected':''}>${esc(g)}</option>`).join('')}</select>`:''}</div>`;
  };
  document.getElementById('busy-step3').innerHTML=`
  ${_busy.problems.length?`<div class="alert al-w">⚠️ ${_busy.problems.length} row(s) have a problem: ${_busy.problems.slice(0,5).map(esc).join('; ')}${_busy.problems.length>5?'…':''}</div>`:''}
  ${parties.length?`<div class="card" style="margin-bottom:12px"><div class="ch"><h5>New supplier names — same as a supplier you already have? (asked once, remembered)</h5>
    <span class="badge ${supPending?'bp':'ba'}">${supPending?supPending+' left':'all done'}</span></div><div class="tw"><table>
    <thead><tr><th>Name in BUSY</th><th>GSTIN in BUSY</th><th style="width:55%">In the DMS this is…</th></tr></thead>
    <tbody>${parties.map(r=>`<tr><td><b>${esc(r.party)}</b></td><td class="mono" style="font-size:12px">${esc(r.partyKey.length===15?r.partyKey:'')}</td><td>${supCtl(r)}</td></tr>`).join('')}</tbody>
  </table></div></div>`:''}
  ${unk.length?`<div class="card" style="margin-bottom:12px"><div class="ch"><h5>New items — tell the DMS what they are (asked once, remembered)</h5>
    <span class="badge ${pending?'bp':'ba'}">${pending?pending+' left':'all done'}</span></div><div class="tw"><table>
    <thead><tr><th>Item in BUSY</th><th>Unit</th><th>In invoices</th><th style="width:55%">${kind==='sale'?'Which part is it?':'What is it?'}</th></tr></thead>
    <tbody>${unk.map(u=>`<tr><td><b>${esc(u.item)}</b></td><td>${esc(u.unit)}</td><td style="text-align:center">${u.invoices}</td><td>${itemCtl(u)}</td></tr>`).join('')}</tbody>
  </table>${kind==='sale'&&!_busy.parts.length?'<div class="alert al-w" style="margin:8px">No parts in the Part Master yet — add them first (Production → Part Master).</div>':''}</div></div>`:''}
  <div class="card" style="margin-bottom:12px"><div class="ch"><h5>Invoices in the file — ${rows.length}</h5>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${Object.entries(BUSY_STATUS).filter(([s])=>cnt(s)).map(([s,[l,c]])=>`<span class="badge ${c}">${cnt(s)} ${l.split(' — ')[0].toLowerCase()}</span>`).join('')}</div></div>
    <div class="tw" style="max-height:460px;overflow:auto"><table>
    <thead><tr><th>Date</th><th>${kind==='purchase'?'Bill no.':'Invoice no.'}</th><th>${kind==='purchase'?'Supplier':'Customer'}</th><th style="text-align:right">Lines</th><th style="text-align:right">Qty</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td class="mono">${esc(r.date||'')}</td><td class="mono">${esc(r.number||'')}</td>
      <td>${esc(r.party||'')}${!r.vendor?'':r.vendor.unknown
          ?(_busy.supplierMap[r.partyKey]==='new'?' <span class="badge bp" title="Will be added to the Supplier Register as Registered">new supplier</span>'
            :_busy.supplierMap[r.partyKey]?`<div class="muted" style="font-size:11px">→ ${esc((_busy.vendors.find(v=>v.id===_busy.supplierMap[r.partyKey])||{}).name||'')}</div>`
            :' <span class="badge br">choose supplier above</span>')
          :((!r.vendor.approved?' <span class="badge br" title="Not on the Approved Supplier List">not approved</span>':'')
            +(busyNorm(r.vendor.name)!==busyNorm(r.party)?`<div class="muted" style="font-size:11px">matched to ${esc(r.vendor.name)}</div>`:''))}</td>
      <td class="mono" style="text-align:right">${r.lines??''}</td><td class="mono" style="text-align:right">${r.qty!=null?fmt(r.qty):''}</td><td class="mono" style="text-align:right">${r.amount?fmt(r.amount):''}</td>
      <td>${r.status==='manual'?`<label style="font-size:12px;cursor:pointer"><input type="checkbox" ${_busy.includeManual.has(r.key)?'checked':''} onchange="busyToggleManual('${r.key}',this.checked)"> <span class="badge bp">${BUSY_STATUS.manual[0]}</span> import anyway</label>`
        :`<span class="badge ${BUSY_STATUS[r.status][1]}">${BUSY_STATUS[r.status][0]}</span>${r.receipt&&(r.receipt.vendorLots||r.receipt.rmLots)?`<div style="font-size:11px;color:#15803d">✓ gate receipt found — will be linked, not duplicated</div>`:''}${r.error?`<div style="font-size:11px;color:#dc2626">${esc(r.error)} (${esc(r.ref||'')})</div>`:''}`}</td></tr>`).join('')}</tbody>
  </table></div>
  ${cnt('changed')?'<div style="font-size:11px;color:#6b7280;padding:6px 12px">"Changed in BUSY": an invoice with this number was imported before with different details. It is not overwritten — undo that import (Import History) and import again if the BUSY version is correct.</div>':''}
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center">
    ${pending||supPending?`<span style="font-size:12px;color:#d97706">Answer the ${supPending?supPending+' supplier name(s)':''}${supPending&&pending?' and ':''}${pending?pending+' item(s)':''} above first</span>`:''}
    <button class="btn btn-p" id="busy-go" ${pending||supPending||!toImport?'disabled':''} onclick="busyImport()">📥 Import ${toImport} invoice${toImport===1?'':'s'}</button>
  </div>`;
}
async function busySetSupplier(pk,val){
  _busy.supplierMap[pk]=val==='new'?'new':(val?+val:undefined);
  if(!val) delete _busy.supplierMap[pk];
  try{_busy.preview=await busyApi('POST','/api/busy/preview',{kind:_busy.kind,invoices:_busy.invoices,supplierMap:_busy.supplierMap});}
  catch(e){toast(e.message,'d');}
  busyRenderPreview();
}
function busySetChoice(key,c){_busy.choices[key]={...c,item:(_busy.preview.unknownItems.find(u=>u.key===key)||{}).item};busyRenderPreview();}
function busyToggleManual(key,on){on?_busy.includeManual.add(key):_busy.includeManual.delete(key);busyRenderPreview();}

async function busyImport(){
  const {kind}=_busy;
  const btn=document.getElementById('busy-go');if(btn){btn.disabled=true;btn.textContent='Importing…';}
  try{
    const r=await busyApi('POST','/api/busy/import',{kind,fileName:_busy.fileName,invoices:_busy.invoices,itemMap:_busy.choices,supplierMap:_busy.supplierMap,includeManual:[..._busy.includeManual]});
    await DB.setSetting('busyColumns_'+kind,{map:_busy.map,savedAt:new Date().toISOString()}).catch(()=>{});
    const c=r.created;
    document.getElementById('busy-step2').innerHTML='';
    document.getElementById('busy-step3').innerHTML=`<div class="card"><div class="cb">
      <div style="font-size:15px;font-weight:700;color:#15803d;margin-bottom:8px">✅ Imported ${r.invoices} invoice${r.invoices===1?'':'s'}</div>
      <div style="font-size:13px;line-height:1.8">${kind==='purchase'
        ?`${c.busyPurchases} purchase bill(s) added${c.purVendors?` · ${c.purVendors} new supplier(s) added to the Supplier Register as <b>Registered</b>`:''}
          <br>${r.linked?`<b>${r.linked}</b> bill(s) linked to the gate receipt entered when the material came in. `:''}Bills with raw material or QC items and no gate receipt yet are listed on BUSY Check.`
        :`${c.prodDispatch} dispatch line(s) added — part stock updated.`}
      ${Object.keys(r.skipped||{}).length?`<br><span class="muted">Skipped: ${Object.entries(r.skipped).map(([k,n])=>`${n} ${(BUSY_STATUS[k]||[k])[0].split(' — ')[0].toLowerCase()}`).join(', ')}</span>`:''}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        ${kind==='purchase'?`<button class="btn btn-p" onclick="nav('busy-check')">✔️ BUSY Check</button>`:`<button class="btn btn-p" onclick="nav('prod-dispatch')">🚚 Dispatch Register</button>`}
        <button class="btn btn-o" onclick="nav('busy-history')">🕘 Import History (undo)</button>
        <button class="btn btn-o" onclick="busyRenderImport()">Import another file</button></div>
    </div></div>`;
    busyUpdateCount();
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='📥 Import';}
    alert('❌ '+e.message);
    if(e.data?.unknownItems){_busy.preview.unknownItems=e.data.unknownItems;busyRenderPreview();}
  }
}

// ══════════════════════════════════════════════════════
//  BUSY PURCHASES — QC inspection queue
// ══════════════════════════════════════════════════════
// Suppliers read fresh from the server — an import may have just added some,
// and the shared table cache can be a few seconds old.
async function busyVendors(){return (await busyApi('GET','/api/purVendors').catch(()=>[])).map(r=>({...r.data,id:r.id}));}
let _busyPurFilter='awaiting';
const BUSY_PSTATUS={awaiting:['No gate receipt yet','bp'],matched:['Matched to gate receipt','ba'],inspected:['Receipt made from BUSY','bd'],'not-required':['No inspection needed','bd']};
async function busyRenderPurchases(f){
  if(f&&f.status) _busyPurFilter=f.status;
  const [rows,vendors,lots]=await Promise.all([busyApi('GET','/api/busyPurchases').catch(()=>[]),busyVendors(),busyApi('GET','/api/rm/lots').catch(()=>[])]);
  const vById=Object.fromEntries(vendors.map(v=>[v.id,v])),lotById=Object.fromEntries(lots.map(l=>[l.id,l]));
  const all=rows.map(r=>({...r.data,id:r.id})).sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.id-a.id);
  const list=all.filter(p=>_busyPurFilter==='all'||p.status===_busyPurFilter);
  const n=s=>all.filter(p=>p.status===s).length;
  const fmt=x=>Number(x||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  setC(`
  <div class="ph"><h2>🧾 BUSY Purchases</h2><div style="display:flex;gap:8px">
    <button class="btn btn-o" onclick="nav('busy-check')">✔️ BUSY Check</button>
    <button class="btn btn-p" onclick="_busy.kind='purchase';nav('busy-import')">📥 Import from BUSY</button></div></div>
  <div style="font-size:12px;color:#6b7280;margin-bottom:10px">Raw material is entered at the gate (Label Generator + Invoice / Delivery entry). Each BUSY bill is linked to that receipt — nothing is entered twice.</div>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    ${[['awaiting','No gate receipt yet'],['matched','Matched'],['inspected','Receipt made from BUSY'],['not-required','No inspection needed'],['all','All']].map(([s,l])=>`<button class="btn ${_busyPurFilter===s?'btn-p':'btn-o'} btn-sm" onclick="busyRenderPurchases({status:'${s}'})">${l}${s!=='all'?` (${n(s)})`:''}</button>`).join('')}
  </div>
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Date</th><th>Bill no.</th><th>Supplier</th><th>Items</th><th style="text-align:right">Amount</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(p=>{const v=vById[p.vendorId];const appr=v&&typeof purIsApproved==='function'&&purIsApproved(v);
      const lk=p.link||{},lotNums=(lk.rmLotIds||[]).map(i=>lotById[i]?.lotNumber).filter(Boolean);
      return`<tr>
      <td class="mono">${esc(p.date)}</td><td class="mono">${esc(p.billNo||p.vchNo)}</td>
      <td>${esc(v?.name||p.party)}${appr?'':' <span class="badge br" title="Not on the Approved Supplier List">not approved</span>'}</td>
      <td style="font-size:12px">${p.lines.map(l=>`${esc(l.item)} — ${fmt(l.qty)} ${esc(l.unit||'')}${l.type==='rm'?` <span class="badge" style="background:#FAEEDA;color:#BA7517">${esc(l.grade)}</span>`:''}`).join('<br>')}</td>
      <td class="mono" style="text-align:right">${p.total?fmt(p.total):''}</td>
      <td><span class="badge ${BUSY_PSTATUS[p.status]?.[1]||'bd'}">${BUSY_PSTATUS[p.status]?.[0]||esc(p.status)}</span>
        ${p.status==='matched'?`<div style="font-size:11px;color:#6b7280">${(lk.vendorLotIds||[]).length} delivery entr${(lk.vendorLotIds||[]).length===1?'y':'ies'}${lotNums.length?' · '+lotNums.map(esc).join(', '):''}${lk.auto?' · auto':''}</div>`:''}
        ${p.inspection?`<div style="font-size:11px;color:#6b7280">${esc(p.inspection.by||'')} · ${esc(p.inspection.receivedDate||'')}${(p.inspection.lines||[]).filter(l=>l.lotNumber).map(l=>`<br>Lot ${esc(l.lotNumber)}`).join('')}</div>`:''}</td>
      <td style="white-space:nowrap">${p.status==='awaiting'?`<button class="btn btn-p btn-xs" onclick="busyOpenLink(${p.id})">🔗 Link gate receipt</button>
          <button class="btn btn-o btn-xs" title="Only if the material was not entered at the gate" onclick="busyOpenInspect(${p.id})">Make receipt from bill</button>`:''}
        ${p.status==='matched'?`<button class="btn btn-o btn-xs" onclick="busyOpenLink(${p.id})">🔗 Change link</button>
          <button class="btn btn-o btn-xs" onclick="busyUnlink(${p.id})">Unlink</button>`:''}
        ${p.status==='inspected'?`<button class="btn btn-o btn-xs" onclick="busyOpenLink(${p.id})">🔗 Replace with gate receipt</button>
          <button class="btn btn-o btn-xs" onclick="busyUndoInspect(${p.id})">↩ Undo receipt</button>`:''}</td></tr>`;}).join('')
      ||`<tr><td colspan="7" style="text-align:center;padding:26px;color:#9ca3af">${all.length?'Nothing in this list.':'No purchases imported yet — use Import from BUSY.'}</td></tr>`}</tbody>
  </table></div></div>`);
}

// ── link a bill to the receipt entered at the gate ──
async function busyOpenLink(id,after){
  const [r,c]=await Promise.all([busyApi('GET','/api/busyPurchases/'+id).catch(()=>null),busyApi('GET',`/api/busy/purchases/${id}/candidates`).catch(e=>({error:e.message}))]);
  if(!r) return; if(c.error){alert('❌ '+c.error);return;}
  const p=r.data,fmt=x=>Number(x||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const pre=(list,ids)=>new Set(ids.length?ids:list.filter(x=>x.numberMatch).map(x=>x.id));
  const vlSel=pre(c.vendorLots,c.linked.vendorLotIds),lotSel=pre(c.rmLots,c.linked.rmLotIds);
  const ov=document.createElement('div');ov.className='overlay';ov.id='busy-link-ov';
  ov.innerHTML=`<div class="modal" style="width:780px;max-width:96vw">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3>Link bill ${esc(p.billNo||p.vchNo)} to its gate receipt</h3><button class="btn btn-o btn-sm" onclick="document.getElementById('busy-link-ov').remove()">✕</button></div>
    <div style="font-size:12px;margin-bottom:8px"><b>${esc(p.party)}</b> · bill date ${esc(p.date)} · ${p.lines.filter(l=>l.type==='rm'||l.type==='inspect').map(l=>`${esc(l.item)} ${fmt(l.qty)} ${esc(l.unit||'')}`).join(', ')}</div>
    ${p.status==='inspected'?'<div class="alert al-w" style="margin-bottom:8px">This bill already has a receipt made from BUSY. Linking replaces it: the rating entry and RM lot(s) made from the bill are removed and the gate entries below are used instead.</div>':''}
    <div class="lbl" style="margin-top:4px">Invoice / Delivery entries for this supplier (±90 days)</div>
    <div class="tw" style="max-height:200px;overflow:auto"><table><thead><tr><th></th><th>Ref / Invoice</th><th>Date</th><th style="text-align:right">Received</th><th style="text-align:right">Rejected</th></tr></thead><tbody>
    ${c.vendorLots.map(x=>`<tr><td><input type="checkbox" class="bl-vl" value="${x.id}" ${vlSel.has(x.id)?'checked':''}></td><td class="mono">${esc(x.refNo||'')}${x.numberMatch?' <span class="badge ba">number matches</span>':''}</td><td class="mono">${esc(x.date||'')}</td><td class="mono" style="text-align:right">${fmt(x.qtyReceived)}</td><td class="mono" style="text-align:right">${fmt(x.qtyRejected)}</td></tr>`).join('')
      ||'<tr><td colspan="5" class="muted" style="text-align:center;padding:12px">No unlinked entries for this supplier.</td></tr>'}</tbody></table></div>
    <div class="lbl" style="margin-top:10px">RM lots from this supplier (±90 days)</div>
    <div class="tw" style="max-height:200px;overflow:auto"><table><thead><tr><th></th><th>Lot</th><th>Date</th><th>Grade</th><th>Invoice on label</th><th style="text-align:right">kg</th></tr></thead><tbody>
    ${c.rmLots.map(x=>`<tr><td><input type="checkbox" class="bl-lot" value="${x.id}" ${lotSel.has(x.id)?'checked':''}></td><td class="mono">${esc(x.lotNumber)}${x.numberMatch?' <span class="badge ba">invoice matches</span>':''}</td><td class="mono">${esc(x.date||'')}</td><td>${esc(x.grade||'')}</td><td class="mono">${esc(x.invoice||'')}</td><td class="mono" style="text-align:right">${fmt(x.weightKg)}</td></tr>`).join('')
      ||'<tr><td colspan="6" class="muted" style="text-align:center;padding:12px">No unlinked RM lots for this supplier.</td></tr>'}</tbody></table></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-o" onclick="document.getElementById('busy-link-ov').remove()">Cancel</button>
      <button class="btn btn-p" id="bl-save" onclick="busySaveLink(${id},${p.status==='inspected'},${after?`'${after}'`:'null'})">🔗 Link</button></div>
  </div>`;
  document.body.appendChild(ov);
}
async function busySaveLink(id,replace,after){
  const ids=cls=>[...document.querySelectorAll('.'+cls+':checked')].map(x=>+x.value);
  const body={vendorLotIds:ids('bl-vl'),rmLotIds:ids('bl-lot'),replaceInspection:!!replace};
  if(!body.vendorLotIds.length&&!body.rmLotIds.length){toast('Tick at least one entry or lot','d');return;}
  if(replace&&!confirm('Remove the receipt made from BUSY for this bill and use the gate entries instead?')) return;
  try{await busyApi('POST',`/api/busy/purchases/${id}/link`,body);document.getElementById('busy-link-ov').remove();toast('✅ Linked');busyUpdateCount();
    after==='check'?busyRenderCheck():busyRenderPurchases();}
  catch(e){alert('❌ '+e.message);}
}
async function busyUnlink(id){
  if(!confirm('Unlink this bill from its gate receipt? The entries and lots stay as they are; the bill goes back to "No gate receipt yet".')) return;
  try{await busyApi('DELETE',`/api/busy/purchases/${id}/link`);toast('Unlinked');busyUpdateCount();busyRenderPurchases();}
  catch(e){alert('❌ '+e.message);}
}

async function busyOpenInspect(id){
  const r=await busyApi('GET','/api/busyPurchases/'+id).catch(()=>null);if(!r) return;
  const p=r.data,v=(await busyVendors()).find(x=>x.id===p.vendorId);
  const approvers=typeof rmGetList==='function'?rmGetList('approvers'):[];
  const timing=typeof PUR_TIMING_LABELS!=='undefined'?PUR_TIMING_LABELS:{OnTime:'On Time',Within5:'Within 5 Days',After5:'After 5 Days'};
  const lines=p.lines.map((l,i)=>({...l,i})).filter(l=>l.type==='rm'||l.type==='inspect');
  const ov=document.createElement('div');ov.className='overlay';ov.id='busy-insp-ov';
  ov.innerHTML=`<div class="modal" style="width:760px;max-width:96vw">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3>Make receipt from BUSY bill ${esc(p.billNo||p.vchNo)}</h3><button class="btn btn-o btn-sm" onclick="document.getElementById('busy-insp-ov').remove()">✕</button></div>
    <div class="alert al-w" style="margin-bottom:8px">Use this only if the material was <b>not</b> entered at the gate. If it was, close this and use <b>Link gate receipt</b> instead — otherwise it is counted twice.</div>
    <div style="font-size:13px;margin-bottom:10px"><b>${esc(v?.name||p.party)}</b> · bill date ${esc(p.date)}${v&&typeof purIsApproved==='function'&&!purIsApproved(v)?' · <span class="badge br">not on the Approved Supplier List</span>':''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label class="lbl">Received date *</label><input class="fc" type="date" id="bi-date" value="${esc(p.date)}"></div>
      <div class="fg"><label class="lbl">Delivery timing *</label><select class="fc" id="bi-timing">${Object.entries(timing).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
    </div>
    <div class="tw"><table><thead><tr><th>Item</th><th style="text-align:right">Billed</th><th>Rejected</th><th>RM lot: approved by · spectro · bundles</th></tr></thead><tbody>
    ${lines.map(l=>`<tr><td><b>${esc(l.item)}</b>${l.type==='rm'?` <span class="badge" style="background:#FAEEDA;color:#BA7517">${esc(l.grade)}</span>`:''}</td>
      <td class="mono" style="text-align:right">${l.qty} ${esc(l.unit||'')}</td>
      <td><input class="fc" type="number" min="0" max="${l.qty}" step="any" id="bi-rej-${l.i}" value="0" style="width:110px"></td>
      <td>${l.type==='rm'?`<div style="display:grid;grid-template-columns:1fr 1fr 70px;gap:6px">
        <select class="fc" id="bi-appr-${l.i}" title="Approved by"><option value="">Approved by *</option>${approvers.map(a=>`<option>${esc(a)}</option>`).join('')}</select>
        <select class="fc" id="bi-spec-${l.i}" title="Spectro"><option>Done</option><option selected>Pending</option><option>Not Required</option></select>
        <input class="fc" type="number" min="1" step="1" id="bi-bun-${l.i}" value="1" title="Bundles"></div>
        <div class="muted" style="font-size:11px">Lot weight = billed − rejected, in kg. Lot number is given automatically.</div>`:'<span class="muted" style="font-size:12px">— (QC only)</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="fg" style="margin-top:8px"><label class="lbl">Remarks</label><input class="fc" id="bi-rem"></div>
    <div style="font-size:11px;color:#6b7280">Saving adds this delivery to the supplier's rating${lines.some(l=>l.type==='rm')?' and creates the raw material lot(s) in the Lot Register':''}. It can be undone from this page.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-o" onclick="document.getElementById('busy-insp-ov').remove()">Cancel</button>
      <button class="btn btn-p" id="bi-save" onclick="busySaveInspect(${id},${JSON.stringify(lines.map(l=>l.i))})">💾 Save receipt</button></div>
  </div>`;
  document.body.appendChild(ov);
}
async function busySaveInspect(id,idxs){
  const val=k=>document.getElementById(k)?.value;
  const body={receivedDate:val('bi-date'),timing:val('bi-timing'),remarks:(val('bi-rem')||'').trim(),
    lines:idxs.map(i=>({idx:i,rejected:parseFloat(val('bi-rej-'+i))||0,approvedBy:val('bi-appr-'+i),spectro:val('bi-spec-'+i),bundles:parseInt(val('bi-bun-'+i))||1}))};
  const btn=document.getElementById('bi-save');btn.disabled=true;
  try{
    const r=await busyApi('POST',`/api/busy/purchases/${id}/inspect`,body);
    document.getElementById('busy-insp-ov').remove();
    toast('✅ Receipt saved');busyUpdateCount();
    if(r.rmLots?.length&&confirm(`Raw material lot${r.rmLots.length>1?'s':''} created: ${r.rmLots.map(l=>l.lotNumber).join(', ')}.\n\nPrint the bundle labels now?${r.rmLots.length>1?'\n(The first lot opens now; print the others from the Lot Register.)':''}`)){
      window._rmPrefillLot=r.rmLots[0];nav('rm-labels');
    } else busyRenderPurchases();
  }catch(e){btn.disabled=false;alert('❌ '+e.message);}
}
async function busyUndoInspect(id){
  if(!confirm('Undo the receipt made from this bill?\n\nIts supplier-rating entry and the raw material lot(s) it created will be removed, and the bill goes back to "No gate receipt yet". Labels already printed for those lots should be removed from the bundles.')) return;
  try{await busyApi('DELETE',`/api/busy/purchases/${id}/inspect`);toast('Receipt undone');busyUpdateCount();busyRenderPurchases();}
  catch(e){alert('❌ '+e.message);}
}
async function busyUpdateCount(){
  const el=document.getElementById('busycount');if(!el) return;
  const rows=await busyApi('GET','/api/busyPurchases').catch(()=>[]);
  const n=rows.filter(r=>r.data?.status==='awaiting').length;
  el.textContent=n;el.style.display=n?'':'none';
}

// ══════════════════════════════════════════════════════
//  IMPORT HISTORY — each import can be undone on its own
// ══════════════════════════════════════════════════════
async function busyRenderHistory(){
  const rows=(await busyApi('GET','/api/busyBatches').catch(()=>[])).map(r=>({...r.data,id:r.id})).sort((a,b)=>b.id-a.id);
  const isAdmin=Auth.user?.role==='APPROVER';
  const when=s=>s?new Date(s+(s.endsWith('Z')?'':'Z')).toLocaleString('en-IN'):'';
  setC(`
  <div class="ph"><h2>🕘 BUSY Import History</h2><button class="btn btn-p" onclick="nav('busy-import')">📥 Import from BUSY</button></div>
  <div class="card"><div class="tw"><table>
    <thead><tr><th>Imported</th><th>Register</th><th>File</th><th style="text-align:right">Invoices</th><th>Created</th><th>By</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map(b=>{const c=b.created||{};return`<tr>
      <td class="mono" style="font-size:12px">${esc(when(b.importedAt))}</td><td>${b.kind==='purchase'?'Purchase':'Sales'}</td>
      <td style="font-size:12px">${esc(b.fileName||'')}</td><td class="mono" style="text-align:right">${b.invoices||0}</td>
      <td style="font-size:12px">${b.kind==='purchase'?`${(c.busyPurchases||[]).length} bills${(c.purVendors||[]).length?`, ${(c.purVendors||[]).length} new suppliers`:''}`:`${(c.prodDispatch||[]).length} dispatch lines`}</td>
      <td style="font-size:12px">${esc(b.importedBy||'')}</td>
      <td>${b.status==='undone'?`<span class="badge bd">Undone</span><div style="font-size:11px;color:#6b7280">${esc(when(b.undoneAt))} · ${esc(b.undoneBy||'')}${(b.keptSuppliers||[]).length?`<br>Kept suppliers in use: ${b.keptSuppliers.map(esc).join(', ')}`:''}</div>`:'<span class="badge ba">Active</span>'}</td>
      <td>${b.status==='active'&&isAdmin?`<button class="btn btn-r btn-xs" onclick="busyUndo(${b.id})">↩ Undo import</button>`:''}</td></tr>`;}).join('')
      ||'<tr><td colspan="8" style="text-align:center;padding:26px;color:#9ca3af">No imports yet.</td></tr>'}</tbody>
  </table></div>${isAdmin?'':'<div style="font-size:11px;color:#6b7280;padding:6px 12px">Only an admin can undo an import.</div>'}</div>`);
}
async function busyUndo(id){
  if(!confirm('Undo this import?\n\nEverything it added — purchase bills or dispatch lines, and suppliers it created that are not used anywhere else — will be removed. Nothing else is touched. Bills that were already inspected must have their inspection undone first.')) return;
  try{
    const r=await busyApi('POST',`/api/busy/batches/${id}/undo`);
    alert(`✅ Import undone — ${r.removed} record(s) removed.${r.keptSuppliers?.length?`\n\nKept these suppliers because they are now in use: ${r.keptSuppliers.join(', ')}`:''}`);
    busyUpdateCount();busyRenderHistory();
  }catch(e){alert('❌ '+e.message);}
}

// ══════════════════════════════════════════════════════
//  ITEM MATCHING — what each BUSY item is (used by every import)
// ══════════════════════════════════════════════════════
async function busyRenderItems(){
  const [map,parts]=await Promise.all([DB.getSetting('busyItemMap').catch(()=>null),db.prodParts.toArray().catch(()=>[])]);
  const pById=Object.fromEntries(parts.map(p=>[p.id,p]));
  const entries=Object.entries(map||{}).sort((a,b)=>String(a[1].item||a[0]).localeCompare(String(b[1].item||b[0])));
  const label=m=>m.type==='rm'?`Raw material — <b>${esc(m.grade)}</b>`:m.type==='inspect'?'Needs QC inspection':m.type==='none'?'No inspection'
    :m.type==='part'?`Part <b>${esc(pById[m.partId]?.partNumber||'(deleted part)')}</b> ${esc(pById[m.partId]?.partName||'')}`:'Not a part — skipped';
  const table=(pfx,title)=>{const rows=entries.filter(([k])=>k.startsWith(pfx));return`<div class="card" style="margin-bottom:12px"><div class="ch"><h5>${title} — ${rows.length}</h5></div><div class="tw"><table>
    <thead><tr><th>Item in BUSY</th><th>Treated as</th><th></th></tr></thead><tbody>
    ${rows.map(([k,m])=>`<tr><td>${esc(m.item||k.slice(2))}</td><td>${label(m)}</td><td><button class="btn btn-o btn-xs" onclick="busyForgetItem('${k}')" title="The next import will ask again">Forget</button></td></tr>`).join('')
      ||'<tr><td colspan="3" style="text-align:center;padding:18px;color:#9ca3af">None yet — items are matched during an import.</td></tr>'}</tbody></table></div></div>`;};
  setC(`<div class="ph"><h2>🏷️ BUSY Item Matching</h2><button class="btn btn-o" onclick="nav('busy-import')">← Import from BUSY</button></div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:10px">Changing a match affects future imports only — what was already imported stays as it is.</div>
    ${table('P|','Purchase items')}${table('S|','Sales items')}`);
}
async function busyForgetItem(key){
  const map=(await DB.getSetting('busyItemMap').catch(()=>null))||{};
  if(!confirm(`Forget the match for "${map[key]?.item||key.slice(2)}"? The next import will ask what it is.`)) return;
  delete map[key];
  await DB.setSetting('busyItemMap',map);
  busyRenderItems();
}

// ══════════════════════════════════════════════════════
//  BUSY CHECK — weekly / monthly: does BUSY agree with what came in at the gate?
// ══════════════════════════════════════════════════════
let _busyChk=null;
function busyMonthRange(off=0){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+off);
  const iso=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const e=new Date(d.getFullYear(),d.getMonth()+1,0);return {from:iso(d),to:iso(e)};}
async function busyRenderCheck(f){
  _busyChk={...(_busyChk||busyMonthRange(0)),...(f||{})};
  const {from,to}=_busyChk;
  setC(`<div class="ph"><h2>✔️ BUSY Check</h2><div class="muted">Checking…</div></div>`);
  let c;try{c=await busyApi('GET',`/api/busy/check?from=${from}&to=${to}`);}catch(e){setC(`<div class="alert al-d">⚠️ ${esc(e.message)}</div>`);return;}
  _busyChk.data=c;
  const fmt=x=>Number(x||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const nb=c.notBilled.vendorLots.length+c.notBilled.rmLots.length;
  const problems=c.duplicates.length+c.noReceipt.length+c.differs.length+nb;
  const items=x=>x.lines.filter(l=>l.type==='rm'||l.type==='inspect').map(l=>`${esc(l.item)} ${fmt(l.qty)} ${esc(l.unit||'')}`).join(', ');
  const sec=(title,cls,n,body,help)=>n?`<div class="card" style="margin-bottom:12px"><div class="ch"><h5>${title}</h5><span class="badge ${cls}">${n}</span></div>${help?`<div style="font-size:12px;color:#6b7280;padding:8px 14px 0">${help}</div>`:''}<div class="tw">${body}</div></div>`:'';
  setC(`
  <div class="ph"><h2>✔️ BUSY Check</h2><div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
    <button class="btn btn-o btn-sm" onclick="busyRenderCheck(busyMonthRange(-1))">Last month</button>
    <button class="btn btn-o btn-sm" onclick="busyRenderCheck(busyMonthRange(0))">This month</button>
    <div class="fg" style="margin:0"><label class="lbl">From</label><input class="fc" type="date" value="${from}" onchange="busyRenderCheck({from:this.value})"></div>
    <div class="fg" style="margin:0"><label class="lbl">To</label><input class="fc" type="date" value="${to}" onchange="busyRenderCheck({to:this.value})"></div>
    <button class="btn btn-o" onclick="busyRematch()" title="Look again for gate entries of bills still without one">🔄 Re-check links</button>
  </div></div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px">
    ${[[c.counts.bills,'BUSY bills'],[c.counts.matched,'Matched to gate receipt'],[c.noReceipt.length,'No gate receipt yet'],[nb,'Received, not billed'],[c.duplicates.length,'Entered twice']].map(([v,l],i)=>`
    <div class="card" style="padding:12px 16px"><div style="font-size:22px;font-weight:800;color:${i>=2&&v?'#d97706':'var(--navy)'}">${v}</div><div class="muted" style="font-size:12px">${l}</div></div>`).join('')}
  </div>
  ${!problems?`<div class="alert al-s">✅ BUSY and the DMS agree for ${esc(from)} to ${esc(to)}: every bill that needs a receipt is matched, and every gate entry has a bill.</div>`:''}
  ${sec('🔴 Entered twice — received at the gate AND made from the BUSY bill','br',c.duplicates.length,`<table>
    <thead><tr><th>Bill</th><th>Supplier</th><th>Gate entry</th><th>Copy made from BUSY</th><th></th></tr></thead><tbody>
    ${c.duplicates.map((x,i)=>`<tr><td class="mono">${esc(x.billNo)}<div class="muted">${esc(x.date)}</div></td><td>${esc(x.supplier||'')}</td>
      <td style="font-size:12px">${x.manualVendorLots.map(v=>`Entry ${esc(v.refNo)} · ${fmt(v.qtyReceived)}`).join('<br>')}${x.manualRmLots.map(l=>`<br>Lot ${esc(l.lotNumber)} · ${fmt(l.weightKg)} kg`).join('')}</td>
      <td style="font-size:12px">${x.busyLots.map(l=>`Lot ${esc(l.lotNumber)} · ${fmt(l.weightKg)} kg`).join('<br>')||'rating entry'}</td>
      <td><button class="btn btn-p btn-xs" onclick="busyFixDuplicate(${i})">Keep gate entry, remove BUSY copy</button></td></tr>`).join('')}</tbody></table>`,
    'The gate entry and its labels are what is on the bundles, so those are kept. The rating entry and RM lot(s) that were made from the BUSY bill are removed.')}
  ${sec('🟠 Billed in BUSY — no gate receipt found','bp',c.noReceipt.length,`<table>
    <thead><tr><th>Date</th><th>Bill</th><th>Supplier</th><th>Items</th><th></th></tr></thead><tbody>
    ${c.noReceipt.map(x=>`<tr><td class="mono">${esc(x.date)}</td><td class="mono">${esc(x.billNo)}</td><td>${esc(x.supplier||'')}</td><td style="font-size:12px">${items(x)}</td>
      <td style="white-space:nowrap"><button class="btn btn-p btn-xs" onclick="busyOpenLink(${x.id},'check')">🔗 Link gate receipt</button></td></tr>`).join('')}</tbody></table>`,
    'Either the gate entry has a different supplier / invoice number (link it by hand), or the material has not arrived or was not entered.')}
  ${sec('🟠 Matched, but the quantities differ','bp',c.differs.length,`<table>
    <thead><tr><th>Date</th><th>Bill</th><th>Supplier</th><th>What differs</th><th></th></tr></thead><tbody>
    ${c.differs.map(x=>`<tr><td class="mono">${esc(x.date)}</td><td class="mono">${esc(x.billNo)}</td><td>${esc(x.supplier||'')}</td><td style="font-size:12px;color:#b45309">${x.issues.map(esc).join('<br>')}</td>
      <td><button class="btn btn-o btn-xs" onclick="busyOpenLink(${x.id},'check')">🔗 Check link</button></td></tr>`).join('')}</tbody></table>`,
    'Correct the gate entry or RM lot weight (Invoice / Delivery Register, Lot Register) — or the BUSY bill — so they agree.')}
  ${sec('🟠 Received at the gate — no BUSY bill yet','bp',nb,`<table>
    <thead><tr><th>Date</th><th>Entry / lot</th><th>Supplier</th><th>Invoice</th><th style="text-align:right">Qty</th></tr></thead><tbody>
    ${c.notBilled.vendorLots.map(v=>`<tr><td class="mono">${esc(v.date||'')}</td><td>Delivery entry</td><td>${esc(v.supplier||'')}</td><td class="mono">${esc(v.refNo||'')}</td><td class="mono" style="text-align:right">${fmt(v.qtyReceived)}</td></tr>`).join('')}
    ${c.notBilled.rmLots.map(l=>`<tr><td class="mono">${esc(l.date||'')}</td><td class="mono">Lot ${esc(l.lotNumber)} · ${esc(l.grade||'')}</td><td>${esc(l.supplier||'')}</td><td class="mono">${esc(l.invoice||'')}</td><td class="mono" style="text-align:right">${fmt(l.weightKg)} kg</td></tr>`).join('')}</tbody></table>`,
    'Normal for a few days until accounts enter the bill in BUSY. If it stays here after the next import, the invoice number or supplier may be typed differently — use Link gate receipt on the bill.')}`);
}
async function busyFixDuplicate(i){
  const x=_busyChk.data.duplicates[i];
  if(!confirm(`Bill ${x.billNo}: keep the gate entry and its lot(s), and remove the rating entry and RM lot(s) made from the BUSY bill?`)) return;
  try{await busyApi('POST',`/api/busy/purchases/${x.id}/link`,{vendorLotIds:x.manualVendorLots.map(v=>v.id),rmLotIds:x.manualRmLots.map(l=>l.id),replaceInspection:true});
    toast('✅ Duplicate removed');busyRenderCheck();}
  catch(e){alert('❌ '+e.message);}
}
async function busyRematch(){
  try{const r=await busyApi('POST','/api/busy/rematch');toast(r.linked?`✅ ${r.linked} bill(s) linked`:'No new links found');busyUpdateCount();busyRenderCheck();}
  catch(e){alert('❌ '+e.message);}
}

// ══════════════════════════════════════════════════════
//  MERGE DUPLICATES — suppliers, parts, customer names (admin)
// ══════════════════════════════════════════════════════
function busyLoose(s){return busyNorm(String(s||'').toUpperCase().replace(/&/g,' ').replace(/\b(M\s*\/\s*S|MESSRS|THE|PVT|PRIVATE|LTD|LIMITED|LLP|CO|COMPANY|AND)\b\.?/g,' '));}
function busyGroupsOf(items,keys){
  // items sharing any key end up in one group
  const groups=[],byKey={};
  for(const it of items){
    const ks=keys(it).filter(Boolean);let g=ks.map(k=>byKey[k]).find(Boolean);
    if(!g){g={items:[]};groups.push(g);}
    if(!g.items.includes(it)) g.items.push(it);
    for(const k of ks) byKey[k]=g;
  }
  return groups.filter(g=>g.items.length>1);
}
let _busyMerge={tab:'suppliers'};
async function busyRenderMerge(f){
  Object.assign(_busyMerge,f||{});
  const tab=_busyMerge.tab,isAdmin=Auth.user?.role==='APPROVER';
  let list=[],groups=[],label,sub;
  if(tab==='suppliers'){
    const [vs,vl]=await Promise.all([busyVendors(),busyApi('GET','/api/purVendorLots').catch(()=>[])]);
    const cnt={};vl.forEach(l=>{cnt[l.data.vendorId]=(cnt[l.data.vendorId]||0)+1;});
    // rank: approved first, then with GSTIN, then most entries — the likely one to keep comes first in each group
    list=vs.map(v=>({id:v.id,rank:(typeof purIsApproved==='function'&&purIsApproved(v)?1e6:0)+(v.gstNo?1e5:0)+(cnt[v.id]||0),name:v.name,sub:`${v.supNumber||''}${v.gstNo?' · '+v.gstNo:''} · ${cnt[v.id]||0} entries${typeof purIsApproved==='function'&&purIsApproved(v)?' · approved':''}${v.source==='BUSY'?' · from BUSY':''}`}));
    groups=busyGroupsOf(vs,v=>[busyLoose(v.name),v.gstNo?'G'+busyNorm(v.gstNo):'']).map(g=>g.items.map(v=>v.id));
    label='supplier';
  } else if(tab==='parts'){
    const ps=await busyApi('GET','/api/prodParts').catch(()=>[]);
    list=ps.map(r=>({id:r.id,rank:(r.data.demo?0:1e6)-r.id,name:`${r.data.partNumber||''} — ${r.data.partName||''}`,sub:`${r.data.customer||''}${r.data.grade?' · '+r.data.grade:''}${r.data.demo?' · sample data':''}`,pn:r.data.partNumber}));
    groups=busyGroupsOf(list,p=>[busyNorm(p.pn)]).map(g=>g.items.map(p=>p.id));
    label='part';
  } else {
    const cs=await busyApi('GET','/api/admin/merge/customers').catch(()=>[]);
    list=cs.map((c,i)=>({id:i,rank:c.count,name:c.name,sub:`${c.count} use${c.count===1?'':'s'}`}));
    groups=busyGroupsOf(list,c=>[busyLoose(c.name)]).map(g=>g.items.map(c=>c.id));
    label='customer name';
  }
  _busyMerge.list=list;
  const byId=Object.fromEntries(list.map(x=>[x.id,x]));
  groups=groups.map(g=>g.sort((a,b)=>(byId[b].rank||0)-(byId[a].rank||0)));
  const opt=sel=>list.map(x=>`<option value="${x.id}" ${sel===x.id?'selected':''}>${esc(x.name)}</option>`).join('');
  setC(`
  <div class="ph"><h2>🧹 Merge Duplicates</h2></div>
  <div style="display:flex;gap:8px;margin-bottom:12px">${[['suppliers','Suppliers'],['parts','Parts'],['customers','Customer names']].map(([t,l])=>`<button class="btn ${tab===t?'btn-p':'btn-o'} btn-sm" onclick="busyRenderMerge({tab:'${t}'})">${l}</button>`).join('')}</div>
  ${isAdmin?'':'<div class="alert al-w">Only an admin can merge.</div>'}
  <div style="font-size:12px;color:#6b7280;margin-bottom:10px">${tab==='suppliers'?'Everything of the duplicate (invoice / delivery entries, BUSY bills) moves to the supplier you keep; its names and GSTIN are remembered so BUSY keeps matching. Approval stays with the supplier you keep.'
    :tab==='parts'?'Shift entries, fettling, dispatches, stock adjustments, Work Instructions and BUSY item matches of the duplicate move to the part you keep. Details the kept part is missing are copied over.'
    :'Every dispatch and part that uses the duplicate name gets the name you keep.'} Take a backup first — a merge cannot be undone except by restoring.</div>
  <div class="card" style="margin-bottom:12px"><div class="ch"><h5>Likely duplicates</h5><span class="badge ${groups.length?'bp':'ba'}">${groups.length||'none found'}</span></div>
    ${groups.map((g,gi)=>`<div style="padding:10px 14px;border-top:1px solid var(--border)">
      ${g.map((id,k)=>`<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:3px 0;cursor:pointer"><input type="radio" name="bm-g${gi}" value="${id}" ${k===0?'checked':''}> <b>${esc(byId[id].name)}</b> <span class="muted" style="font-size:11px">${esc(byId[id].sub)}</span></label>`).join('')}
      ${isAdmin?`<button class="btn btn-p btn-xs" style="margin-top:6px" onclick="busyMergeGroup(${gi},${JSON.stringify(g)})">Keep the ticked one, merge the others into it</button>`:''}</div>`).join('')
      ||'<div class="muted" style="padding:14px">No look-alike names found. Use the form below for others.</div>'}
  </div>
  ${isAdmin?`<div class="card"><div class="ch"><h5>Merge any two</h5></div><div class="cb" style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
    <div class="fg" style="margin:0"><label class="lbl">Duplicate ${label} (will be removed)</label><select class="fc" id="bm-from"><option value="">—</option>${opt()}</select></div>
    <div class="fg" style="margin:0"><label class="lbl">${label[0].toUpperCase()+label.slice(1)} to keep</label><select class="fc" id="bm-to"><option value="">—</option>${opt()}</select></div>
    <button class="btn btn-p" onclick="busyMergePair(+document.getElementById('bm-from').value,+document.getElementById('bm-to').value,document.getElementById('bm-from').value,document.getElementById('bm-to').value)">Merge</button>
  </div></div>`:''}`);
}
async function busyMergeOne(fromId,toId){
  const {tab,list}=_busyMerge;
  if(tab==='customers') return busyApi('POST','/api/admin/merge/customers',{from:list[fromId].name,to:list[toId].name});
  return busyApi('POST',`/api/admin/merge/${tab}`,{fromId,toId});
}
async function busyMergePair(fromId,toId,fv,tv){
  if(fv===''||tv===''||fromId===toId){toast('Pick two different entries','d');return;}
  const n=i=>_busyMerge.list.find(x=>x.id===i)?.name;
  if(!confirm(`Merge "${n(fromId)}" into "${n(toId)}"?\n\n"${n(fromId)}" will be removed and everything that used it will use "${n(toId)}".`)) return;
  try{await busyMergeOne(fromId,toId);toast('✅ Merged');busyRenderMerge();}catch(e){alert('❌ '+e.message);}
}
async function busyMergeGroup(gi,ids){
  const keep=+document.querySelector(`input[name="bm-g${gi}"]:checked`).value;
  const n=i=>_busyMerge.list.find(x=>x.id===i)?.name,others=ids.filter(i=>i!==keep);
  if(!confirm(`Keep "${n(keep)}" and merge into it:\n${others.map(i=>'• '+n(i)).join('\n')}`)) return;
  try{for(const i of others) await busyMergeOne(i,keep);toast('✅ Merged');busyRenderMerge();}
  catch(e){alert('❌ '+e.message);busyRenderMerge();}
}

// ══ END BUSY LINK ══

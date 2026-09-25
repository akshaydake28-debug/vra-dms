// ══════════════════════════════════════════════════════
//  VRA DMS — AI ASSISTANT (chat panel)
//  Questions go to /api/assistant (assistant.py), which answers from the
//  app's own data via Gemini. The conversation is kept for this browser
//  tab only (sessionStorage) and cleared on logout.
// ══════════════════════════════════════════════════════
const AI_SUGGESTIONS=[
  'What was production in the last 15 days?',
  'What is the top defect reason this month?',
  'List open CAPAs',
  'How much capacity is free for new business?',
  'Which gauges are due for calibration?',
  'Show open customer enquiries',
];
let _aiBusy=false;

function aiHistory(){ try{ return JSON.parse(sessionStorage.getItem('vra_ai'))||[]; }catch(e){ return []; } }
function aiSaveHistory(h){ try{ sessionStorage.setItem('vra_ai',JSON.stringify(h.slice(-30))); }catch(e){} }

function toggleChat(){
  const p=document.getElementById('ai-panel'), open=p.style.display!=='flex';
  p.style.display=open?'flex':'none';
  document.getElementById('ai-fab').style.display=open?'none':'flex';
  if(open){ aiRender(); setTimeout(()=>document.getElementById('ai-input')?.focus(),50); }
}
// Document pages used to open an older document helper here; the assistant is
// now always available from the button, so this only keeps those calls harmless.
function setChatVisible(){}

function aiReset(){ aiSaveHistory([]); aiRender(); }

// Minimal, safe markdown: escape first, then bold, lists, tables, paragraphs.
function aiMarkdown(src){
  const lines=esc(src).split('\n'), out=[];
  let i=0;
  const inline=t=>t.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>');
  while(i<lines.length){
    const l=lines[i];
    if(/^\s*\|.*\|\s*$/.test(l)){                       // table
      const rows=[];
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){ rows.push(lines[i]); i++; }
      const cells=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim()));
      const body=rows.filter(r=>!/^\s*\|[\s:|-]+\|\s*$/.test(r));
      out.push(`<div class="tw-ai"><table><thead><tr>${cells(body[0]).map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${
        body.slice(1).map(r=>`<tr>${cells(r).map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if(/^\s*([-*•]|\d+\.)\s+/.test(l)){                 // list
      const ordered=/^\s*\d+\./.test(l), items=[];
      while(i<lines.length&&/^\s*([-*•]|\d+\.)\s+/.test(lines[i])){ items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/,'')); i++; }
      out.push(`<${ordered?'ol':'ul'}>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</${ordered?'ol':'ul'}>`);
      continue;
    }
    if(!l.trim()){ i++; continue; }
    const para=[];
    while(i<lines.length&&lines[i].trim()&&!/^\s*(\||[-*•]\s|\d+\.\s)/.test(lines[i])){ para.push(inline(lines[i].replace(/^#+\s*/,''))); i++; }
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return out.join('');
}

function aiRender(){
  const box=document.getElementById('ai-msgs'); if(!box) return;
  const h=aiHistory();
  const bubble=m=>m.role==='user'
    ? `<div class="mw user"><div class="mav user">${esc((Auth.user?.name||'U')[0])}</div><div class="mb user">${esc(m.text).replace(/\n/g,'<br>')}</div></div>`
    : `<div class="mw"><div class="mav ai">✨</div><div class="mb ai" ${m.error?'style="border-color:#fca5a5;background:#fef2f2;color:#7f1d1d"':''}>${aiMarkdown(m.text)}${
        m.tools?.length?`<div class="ai-src">Looked up: ${esc([...new Set(m.tools.map(t=>t.tool.replace(/_/g,' ')))].join(', '))}</div>`:''}</div></div>`;
  box.innerHTML = h.length ? h.map(bubble).join('')
    : `<div class="mw"><div class="mav ai">✨</div><div class="mb ai"><p>Hi ${esc(Auth.user?.name?.split(' ')[0]||'')} — ask me about production, rejections, downtime, stock, capacity, CAPAs, complaints, calibration, enquiries, suppliers, employees, documents… anything recorded in VRA DMS.</p>
        <div class="ai-sugg">${AI_SUGGESTIONS.map(q=>`<button onclick="aiAsk(this.textContent)">${esc(q)}</button>`).join('')}</div></div></div>`;
  if(_aiBusy) box.insertAdjacentHTML('beforeend',`<div class="mw"><div class="mav ai">✨</div><div class="mb ai ai-typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`);
  box.scrollTop=box.scrollHeight;
}

function aiAsk(q){ const i=document.getElementById('ai-input'); if(i){ i.value=q; sendAI(); } }

async function sendAI(){
  const input=document.getElementById('ai-input');
  const q=(input?.value||'').trim();
  if(!q||_aiBusy) return;
  input.value='';
  const h=aiHistory(); h.push({role:'user',text:q}); aiSaveHistory(h);
  _aiBusy=true; aiRender();
  const btn=document.getElementById('ai-send-btn'); if(btn) btn.disabled=true;
  let reply;
  try{
    const res=await fetch(window.location.origin+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages:h.filter(m=>!m.error).map(m=>({role:m.role,text:m.text}))})});
    const data=await res.json().catch(()=>({}));
    reply=res.ok? {role:'assistant',text:data.reply||'(no answer)',tools:data.tools||[]}
      : {role:'assistant',error:true,text:data.error||(res.status===401?'Your session has expired — please log in again.':`Something went wrong (${res.status}).`)};
  }catch(e){ reply={role:'assistant',error:true,text:'Could not reach the server — check your connection.'}; }
  _aiBusy=false;
  const h2=aiHistory(); h2.push(reply); aiSaveHistory(h2);
  if(btn) btn.disabled=false;
  aiRender();
}

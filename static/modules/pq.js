// Process Quality — Phase 1: Process Flow Diagram
const PQ = (() => {

  const _s = { partId: null, editMode: false, pending: {}, pfmeaEditMode: false, pfmeaPending: {} };

  // ── PFMEA generic failure-mode library: keyword match per process category ──
  const PFMEA_CATEGORY_KEYWORDS = {
    'Raw Material Inspection': ['raw material', 'incoming', 'receiving'],
    'Melting':                 ['melt'],
    'Die Casting':             ['die cast', 'casting'],
    'Trimming':                ['trim'],
    'Fettling':                ['fettl'],
    'Shot Blasting':           ['shot blast', 'blasting'],
    'Machining':               ['machin'],
    'Final Inspection':        ['final inspection', 'final insp'],
    'Packing':                 ['pack'],
    'Dispatch':                ['dispatch', 'shipping'],
  };

  // ── API ──────────────────────────────────────────────────────────────
  const api = async (method, url, body) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };
  const getAll = mod => api('GET', `/api/qms2/${mod}`);
  const save   = (mod, data) => api('POST', `/api/qms2/${mod}`, data);
  const remove = (mod, id)   => api('DELETE', `/api/qms2/${mod}/${id}`);

  const setC  = html => { document.getElementById('content').innerHTML = html; };
  const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const toast = (msg, t='s') => {
    const el = document.createElement('div');
    el.className = `alert al-${t}`;
    el.style = 'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.2)';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  };

  const nextRev = r => {
    const c = (r||'A').charCodeAt(0);
    return c < 90 ? String.fromCharCode(c + 1) : r + 'A';
  };

  const rpnColor = rpn => rpn >= 200 ? { bg:'#fee2e2', fg:'#991b1b', label:'Critical' }
                        : rpn >= 100 ? { bg:'#ffedd5', fg:'#c2410c', label:'High' }
                        : rpn >= 50  ? { bg:'#fef9c3', fg:'#a16207', label:'Medium' }
                        : rpn >= 25  ? { bg:'#ecfccb', fg:'#4d7c0f', label:'Low' }
                                     : { bg:'#dcfce7', fg:'#166534', label:'OK' };

  // ══════════════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════════════
  async function renderDashboard() {
    _s.partId = null; _s.editMode = false; _s.pending = {};
    setC('<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>');
    const parts = await getAll('pq_parts');

    const statusBadge = st => {
      if (st === 'Released')          return `<span class="badge ba">Released</span>`;
      if (st === 'Pending Approval')  return `<span class="badge bp">⏳ Pending</span>`;
      if (st === 'Superseded')        return `<span class="badge bs">Superseded</span>`;
      return `<span class="badge bd">Draft</span>`;
    };

    const rows = parts.map(p => `
      <tr>
        <td style="font-weight:600;color:#0d2f6e">${esc(p.partNumber||'')}</td>
        <td>${esc(p.partName||'')}</td>
        <td>${esc(p.material||'')}</td>
        <td>${statusBadge(p.pfdStatus)} <span class="mono" style="font-size:11px">Rev ${esc(p.pfdRev||'A')}</span></td>
        <td>${statusBadge(p.pfmeaStatus)} <span class="mono" style="font-size:11px">Rev ${esc(p.pfmeaRev||'A')}</span></td>
        <td>
          <button class="btn btn-o btn-xs" onclick="PQ.openPfd(${p.id})">Open PFD</button>
          <button class="btn btn-o btn-xs" style="margin-left:4px" onclick="PQ.openPfmea(${p.id})">Open PFMEA</button>
          <button class="btn btn-o btn-xs" style="margin-left:4px" onclick="PQ.editPart(${p.id})">Edit</button>
          <button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;margin-left:4px"
            onclick="PQ.deletePart(${p.id},'${esc(p.partNumber||'')}')">Delete</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="6" style="padding:28px;text-align:center;color:#9ca3af">
        No parts yet — <a style="color:#0d2f6e;font-weight:600;cursor:pointer" onclick="PQ.newPart()">create the first part →</a>
      </td></tr>`;

    setC(`
      <div class="ph">
        <h2>Process Flow Diagram</h2>
        <button class="btn btn-p" onclick="PQ.newPart()">➕ New Part</button>
      </div>
      <div class="card">
        <div class="tw">
          <table>
            <thead><tr><th>Part No.</th><th>Part Name</th><th>Material</th><th>PFD Status</th><th>PFMEA Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PART FORM
  // ══════════════════════════════════════════════════════════════════════
  function newPart() { _partForm(null); }

  async function editPart(pid) {
    const parts = await getAll('pq_parts');
    _partForm(parts.find(p => p.id == pid) || null);
  }

  async function _partForm(p) {
    const isNew = !p;
    // For new parts, load existing parts to offer as templates
    const allParts = isNew ? await getAll('pq_parts') : [];
    const templateOpts = allParts.map(t =>
      `<option value="${t.id}">${esc(t.partNumber||'')} — ${esc(t.partName||'')}</option>`
    ).join('');

    setC(`
      <div class="ph">
        <h2>${isNew ? '➕ New Part' : '✏️ Edit Part'}</h2>
        <button class="btn btn-o" onclick="PQ.renderDashboard()">← Back</button>
      </div>
      <div class="card" style="max-width:560px">
        <div class="cb" style="display:flex;flex-direction:column;gap:14px;padding:20px">
          <div>
            <label class="lbl">Part Number *</label>
            <input id="f-pno" class="input fc" value="${esc(p?.partNumber||'')}" placeholder="e.g. VRA-DC-002">
          </div>
          <div>
            <label class="lbl">Part Name *</label>
            <input id="f-pname" class="input fc" value="${esc(p?.partName||'')}" placeholder="e.g. ADC12 Die Cast Component">
          </div>
          <div>
            <label class="lbl">Material / Grade</label>
            <input id="f-mat" class="input fc" value="${esc(p?.material||'')}" placeholder="e.g. ADC12">
          </div>
          <div>
            <label class="lbl">Date</label>
            <input id="f-date" type="date" class="input fc" value="${esc(p?.date||new Date().toISOString().slice(0,10))}" style="width:180px">
          </div>

          ${isNew && allParts.length ? `
          <div style="border-top:1px solid #e5e7eb;padding-top:14px">
            <label class="lbl">PFD Template</label>
            <p style="font-size:12px;color:#6b7280;margin:4px 0 8px">Copy process steps from an existing part, or start with a blank PFD.</p>
            <div style="display:flex;flex-direction:column;gap:8px">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="radio" name="pfd-src" value="blank" checked onchange="PQ._toggleTemplateSelect(this.value)">
                Start from scratch (blank PFD)
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="radio" name="pfd-src" value="template" onchange="PQ._toggleTemplateSelect(this.value)">
                Copy PFD from existing part
              </label>
              <div id="template-select" style="display:none;margin-left:24px">
                <select id="f-tmpl" class="input fc" style="width:100%">
                  <option value="">— select a part —</option>
                  ${templateOpts}
                </select>
              </div>
            </div>
          </div>` : ''}

          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn btn-p" onclick="PQ._savePart(${p?.id||'null'})">Save</button>
            <button class="btn btn-o" onclick="PQ.renderDashboard()">Cancel</button>
          </div>
        </div>
      </div>`);
  }

  function _toggleTemplateSelect(val) {
    const el = document.getElementById('template-select');
    if (el) el.style.display = val === 'template' ? 'block' : 'none';
  }

  async function _savePart(pid) {
    const pno   = document.getElementById('f-pno').value.trim();
    const pname = document.getElementById('f-pname').value.trim();
    if (!pno || !pname) { toast('Part number and name are required', 'e'); return; }

    const data = {
      partNumber: pno,
      partName:   pname,
      material:   document.getElementById('f-mat').value.trim(),
      date:       document.getElementById('f-date').value,
      pfdRev:    'A',
      pfdStatus: 'Draft',
      pfmeaRev:    'A',
      pfmeaStatus: 'Draft',
    };

    if (pid) {
      // Preserve existing rev/status on edit
      const parts = await getAll('pq_parts');
      const existing = parts.find(p => p.id == pid);
      if (existing) {
        data.pfdRev = existing.pfdRev; data.pfdStatus = existing.pfdStatus;
        data.pfmeaRev = existing.pfmeaRev; data.pfmeaStatus = existing.pfmeaStatus;
      }
      data.id = pid;
      await save('pq_parts', data);
      toast('Part saved');
      renderDashboard();
      return;
    }

    // New part — check if user wants to copy from a template
    const srcRadio = document.querySelector('input[name="pfd-src"]:checked');
    const srcVal   = srcRadio ? srcRadio.value : 'blank';
    const tmplId   = srcVal === 'template'
      ? (document.getElementById('f-tmpl')?.value || '')
      : '';

    if (srcVal === 'template' && !tmplId) {
      toast('Please select a template part', 'e'); return;
    }

    const newPart = await save('pq_parts', data);
    const newPid  = newPart.id;

    if (tmplId) {
      // Copy PFD steps from template part
      const allSteps = await getAll('pq_pfd_steps');
      const srcSteps = allSteps
        .filter(s => s.partId == tmplId)
        .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));

      for (const s of srcSteps) {
        await save('pq_pfd_steps', {
          partId:    newPid,
          opNumber:  s.opNumber,
          opName:    s.opName,
          sortOrder: s.sortOrder ?? s.id,
        });
      }

      // Copy PFMEA rows from template part too, so the new part starts
      // with the same failure-mode analysis, ready to be tuned per part.
      const allPfmeaRows = await getAll('pq_pfmea_rows');
      const srcRows = allPfmeaRows
        .filter(r => r.partId == tmplId)
        .sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
      for (const r of srcRows) {
        await save('pq_pfmea_rows', Object.assign({}, r, {
          id: undefined, partId: newPid, status: 'Open', targetDate: '',
        }));
      }

      toast(`Part created with ${srcSteps.length} steps and ${srcRows.length} PFMEA rows copied from template`);
    } else {
      toast('Part created — open PFD to add steps');
    }

    renderDashboard();
  }

  async function deletePart(pid, partNo) {
    if (!confirm(`Delete part "${partNo}" and all its PFD steps?`)) return;
    const steps = await getAll('pq_pfd_steps');
    for (const s of steps.filter(s => s.partId == pid)) await remove('pq_pfd_steps', s.id);
    await remove('pq_parts', pid);
    toast('Deleted');
    renderDashboard();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PFD — PROCESS FLOW DIAGRAM
  // ══════════════════════════════════════════════════════════════════════
  async function openPfd(pid) {
    _s.partId = pid; _s.editMode = false; _s.pending = {};
    await _renderPfd();
  }

  async function _renderPfd() {
    const pid = _s.partId;
    const [parts, allSteps, allRevs] = await Promise.all([
      getAll('pq_parts'), getAll('pq_pfd_steps'), getAll('pq_revisions')
    ]);
    const part = parts.find(p => p.id == pid);
    if (!part) { toast('Part not found', 'e'); renderDashboard(); return; }

    const steps = allSteps
      .filter(s => s.partId == pid)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));

    const locked   = !_s.editMode;
    const status   = part.pfdStatus || 'Draft';
    const released = status === 'Released';
    const pending  = status === 'Pending Approval';
    const docNo    = `VRA-PFD-${part.partNumber||'XXX'}-REV-${part.pfdRev||'A'}`;

    // Status badge
    const badge = released ? `<span class="badge ba">Released</span>`
                : pending  ? `<span class="badge bp">⏳ Pending Approval</span>`
                           : `<span class="badge bd">Draft</span>`;

    // Action buttons — mimic document module flow
    // Draft/Rejected → Edit → Save (→ Pending Approval)
    // Pending Approval → Approve or back to Edit
    // Released → New Revision (→ Draft with bumped rev)
    const actions = _s.editMode
      ? `<button class="btn btn-g btn-sm" onclick="PQ._saveAll()">📤 Submit for Approval</button>
         <button class="btn btn-o btn-sm" onclick="PQ._cancelEdit()">Cancel</button>`
      : released
        ? `<button class="btn btn-o btn-sm" onclick="window.print()">🖨 Print</button>
           <button class="btn btn-o btn-sm" onclick="PQ._newRevision()">🔄 New Revision</button>`
        : pending
          ? `<button class="btn btn-o btn-sm" onclick="window.print()">🖨 Print</button>
             <button class="btn btn-g btn-sm" onclick="PQ._approve()">✓ Approve</button>
             <button class="btn btn-p btn-sm" onclick="PQ._startEdit()">✏️ Edit</button>`
          : `<button class="btn btn-o btn-sm" onclick="window.print()">🖨 Print</button>
             <button class="btn btn-p btn-sm" onclick="PQ._startEdit()">✏️ Edit</button>`;

    setC(`
      <style>
        @media print {
          .no-print { display:none !important; }
          aside, .topbar { display:none !important; }
          .main { margin:0 !important; }
          .content { padding:8px !important; }
          .pfd-print-hdr { display:table-header-group !important; }
          .pfd-print-ftr { display:table-footer-group !important; }
          @page { size:A4; margin:14mm 15mm 18mm 15mm; }
          @page { counter-increment: page; }
          .pfd-pgnum::after { content: counter(page); }
        }
        .pfd-print-hdr { display:none; }
        .pfd-print-ftr { display:none; }
        .pfd-page-wrap { display:table; width:100%; }
        .pfd-page-body { display:table-row-group; }
        .btn-g { background:#16a34a;color:#fff;border:none; }
        .btn-g:hover { background:#15803d; }
      </style>
      <!-- Print-only repeating header -->
      <div class="pfd-print-hdr">
        <table style="width:100%;border-collapse:collapse;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px">
          <tr>
            <td style="width:30%;font-weight:bold;font-size:12pt">V R ALUCAST<br><span style="font-size:7.5pt;font-weight:normal;color:#555">High Pressure Die Casting | ISO 9001</span></td>
            <td style="width:40%;text-align:center;font-weight:bold;font-size:11pt">PROCESS FLOW DIAGRAM<br><span style="font-size:8pt;font-weight:normal;color:#555">${esc(part.partName||'')}</span></td>
            <td style="width:30%;text-align:right;font-size:8.5pt;line-height:1.7"><b>Doc No:</b> ${esc(docNo)}<br><b>Rev:</b> ${esc(part.pfdRev||'A')}<br><b>Status:</b> ${esc(status)}</td>
          </tr>
        </table>
      </div>
      <!-- Print-only repeating footer -->
      <div class="pfd-print-ftr">
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #000;padding-top:4px;margin-top:6px">
          <tr>
            <td style="font-size:7.5pt;color:#444">${esc(docNo)} Rev ${esc(part.pfdRev||'A')}</td>
            <td style="text-align:center;font-size:7.5pt;color:#444">V R ALUCAST — CONFIDENTIAL</td>
            <td style="text-align:right;font-size:7.5pt;color:#444">Page <span class="pfd-pgnum"></span></td>
          </tr>
        </table>
      </div>

      <!-- Page header (hidden on print) -->
      <div class="ph no-print">
        <div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
            <span class="tp" style="background:#1d4ed8">PFD</span>
            ${badge}
            <span class="mono" style="color:#0d2f6e;font-weight:700">${esc(docNo)}</span>
            <span style="color:#9ca3af">Rev ${esc(part.pfdRev||'A')}</span>
          </div>
          <h2>${esc(part.partName||'')} — Process Flow Diagram</h2>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Parts</button>
          ${actions}
        </div>
      </div>

      ${_s.editMode ? `<div class="alert al-d no-print" style="margin-bottom:12px">
        ✏️ Editing — click <b>Submit for Approval</b> when done. Enter a change summary and the revision will increment automatically.
      </div>` : ''}
      ${pending && !_s.editMode ? `<div class="alert al-w no-print" style="margin-bottom:12px">
        ⏳ This document is pending approval. Click <b>Approve</b> to release it, or <b>Edit</b> to revise.
      </div>` : ''}

      <!-- Document header (printed) -->
      <div style="border:2px solid #0d2f6e;border-radius:0;margin-bottom:16px;font-size:12px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td rowspan="3" style="padding:10px 16px;border-right:1px solid #0d2f6e;width:180px;vertical-align:middle;text-align:center">
              <div style="font-weight:800;font-size:15px;color:#0d2f6e;letter-spacing:.5px">V R ALUCAST</div>
              <div style="font-size:9px;color:#6b7280;letter-spacing:.3px;margin-top:2px">QUALITY MANAGEMENT SYSTEM</div>
            </td>
            <td colspan="4" style="padding:8px 14px;border-bottom:1px solid #0d2f6e;font-weight:700;font-size:13px;color:#0d2f6e;text-align:center;letter-spacing:.5px">
              PROCESS FLOW DIAGRAM
            </td>
          </tr>
          <tr>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db;width:22%">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Part Name</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.partName||'')}</div>
            </td>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db;width:22%">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Part Number</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.partNumber||'')}</div>
            </td>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db;width:22%">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Material</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.material||'')}</div>
            </td>
            <td style="padding:6px 12px;border-bottom:1px solid #d1d5db">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Date</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.date||'')}</div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding:6px 12px;border-right:1px solid #d1d5db">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Document Number</div>
              <div style="font-weight:700;color:#0d2f6e;font-family:monospace;margin-top:2px">${esc(docNo)}</div>
            </td>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Revision</div>
              <div style="font-weight:800;font-size:16px;color:#0d2f6e;margin-top:2px">${esc(part.pfdRev||'A')}</div>
            </td>
            <td style="padding:6px 12px">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Status</div>
              <div style="font-weight:700;margin-top:2px;color:${released?'#16a34a':pending?'#d97706':'#6b7280'}">${esc(status)}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Main content + sidebar -->
      <div style="display:grid;grid-template-columns:1fr 240px;gap:14px;align-items:start">

        <!-- Flow diagram -->
        <div class="card">
          <div class="cb" style="padding:24px;display:flex;flex-direction:column;align-items:center">
            ${steps.length
              ? _buildFlow(steps, locked)
              : locked
                ? `<div style="padding:32px;text-align:center;color:#9ca3af">No steps — click <b>Edit</b> to add</div>`
                : `<div style="padding:12px;text-align:center">
                     <button class="btn btn-o" onclick="PQ._addStep()">+ Add first step</button>
                   </div>`
            }
          </div>
        </div>

        <!-- Sidebar -->
        <div class="no-print">
          <!-- Info -->
          <div class="card" style="margin-bottom:14px">
            <div class="ch"><h5>Info</h5></div>
            <div class="cb" style="padding:11px">
              ${[
                ['Part Number', part.partNumber||''],
                ['Part Name',   part.partName||''],
                ['Material',    part.material||''],
                ['Date',        part.date||''],
                ['Approved by', part.approvedBy||'—'],
              ].map(([l,v]) => `
                <div style="padding:5px 0;border-bottom:1px solid #f0f3f9">
                  <div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px">${l}</div>
                  <div style="font-size:12.5px;font-weight:600;margin-top:1px">${esc(String(v))}</div>
                </div>`).join('')}
            </div>
          </div>

          <!-- Revision history -->
          <div class="card">
            <div class="ch"><h5>Revisions</h5></div>
            <div class="cb" style="padding:8px">
              ${(() => {
                let entries = allRevs.filter(r => r.partId == pid && r.docType === 'pfd').sort((a, b) => b.id - a.id);
                if (!entries.length) {
                  entries = [{ revision: part.pfdRev||'A', status: part.pfdStatus||'Draft', date: part.date||'', changedBy: part.approvedBy||part.preparedBy||'', changeSummary: part.lastChangeSummary||'Initial revision', _fallback: true }];
                }
                return entries.map(r => {
                  const isCurrent = r._fallback || r.revision === part.pfdRev;
                  const stBadge = r.status === 'Released'
                    ? `<span class="badge ba" style="font-size:10px">Released</span>`
                    : r.status === 'Pending Approval'
                      ? `<span class="badge bp" style="font-size:10px">Pending</span>`
                      : `<span class="badge bd" style="font-size:10px">Draft</span>`;
                  return `<div style="padding:6px 7px;background:${isCurrent?'#edf1fb':'#f9fafc'};border-radius:6px;margin-bottom:3px;border:1px solid ${isCurrent?'#c5d0f0':'#e5e7eb'}">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <span class="mono" style="font-weight:700;color:#0d2f6e">Rev ${esc(r.revision)}</span>
                      ${stBadge}
                    </div>
                    <div class="muted" style="font-size:11px;margin-top:2px">${esc(r.date||'')} · ${esc(r.changedBy||'')}</div>
                    ${r.changeSummary ? `<div style="font-size:11px;color:#374151;margin-top:2px">${esc(r.changeSummary)}</div>` : ''}
                  </div>`;
                }).join('');
              })()}
            </div>
          </div>
        </div>

      </div>

      <!-- Revision History Table -->
      <div style="margin-top:24px">
        <div style="font-size:9pt;font-weight:bold;margin-bottom:6px;color:#1e3a5f">REVISION HISTORY</div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5pt">
          <thead><tr>
            <th style="background:#1e3a5f;color:#fff;padding:5px 8px;text-align:left;border:1px solid #ccc">Rev</th>
            <th style="background:#1e3a5f;color:#fff;padding:5px 8px;text-align:left;border:1px solid #ccc">Date</th>
            <th style="background:#1e3a5f;color:#fff;padding:5px 8px;text-align:left;border:1px solid #ccc">Prepared By</th>
            <th style="background:#1e3a5f;color:#fff;padding:5px 8px;text-align:left;border:1px solid #ccc">Approved By</th>
            <th style="background:#1e3a5f;color:#fff;padding:5px 8px;text-align:left;border:1px solid #ccc">Change Summary</th>
          </tr></thead>
          <tbody>
            ${(() => {
              let entries = allRevs.filter(r => r.partId == pid && r.docType === 'pfd').sort((a, b) => a.id - b.id);
              if (!entries.length) {
                entries = [{ revision: part.pfdRev||'A', date: part.date||'', changedBy: part.preparedBy||'', approvedBy: part.approvedBy||'Pending', changeSummary: part.lastChangeSummary||'Initial revision' }];
              }
              return entries.map(r => `<tr>
                <td style="border:1px solid #ccc;padding:5px 8px">${esc(r.revision||'')}</td>
                <td style="border:1px solid #ccc;padding:5px 8px">${esc(r.date||'')}</td>
                <td style="border:1px solid #ccc;padding:5px 8px">${esc(r.changedBy||'')}</td>
                <td style="border:1px solid #ccc;padding:5px 8px">${esc(r.approvedBy||'Pending')}</td>
                <td style="border:1px solid #ccc;padding:5px 8px">${esc(r.changeSummary||'')}</td>
              </tr>`).join('');
            })()}
          </tbody>
        </table>
      </div>
    `);
  }

  function _buildFlow(steps, locked) {
    return steps.map((s, i) => {
      const isFirst = i === 0;
      const isLast  = i === steps.length - 1;

      const box = locked
        ? `<div style="width:220px;padding:14px 18px;border:2px solid #0d2f6e;border-radius:4px;
                       background:#edf1fb;text-align:center;user-select:none">
             <div style="font-size:11px;font-weight:700;color:#1a4a9e;margin-bottom:4px">${esc(s.opNumber||'')}</div>
             <div style="font-size:13px;font-weight:700;color:#0d2f6e">${esc(s.opName||'—')}</div>
           </div>`
        : `<div style="width:240px;padding:10px 12px;border:2px solid #0d2f6e;border-radius:4px;background:#edf1fb;text-align:center">
             <input value="${esc(s.opNumber||'')}" placeholder="OP10"
               oninput="PQ._cell(${s.id},'opNumber',this.value)"
               style="width:68px;text-align:center;font-size:11px;font-weight:700;color:#1a4a9e;
                      border:1px solid #a5b4fc;border-radius:3px;padding:2px 4px;margin-bottom:6px;background:#fff">
             <br>
             <input value="${esc(s.opName||'')}" placeholder="Operation name"
               oninput="PQ._cell(${s.id},'opName',this.value)"
               style="width:100%;text-align:center;font-size:13px;font-weight:700;color:#0d2f6e;
                      border:1px solid #a5b4fc;border-radius:3px;padding:3px 8px;background:#fff">
             <div style="margin-top:8px;display:flex;justify-content:center;gap:4px">
               ${!isFirst ? `<button onclick="PQ._moveUp(${s.id})" title="Move up"
                 style="border:1px solid #c7d2fe;background:#e0e7ff;color:#3730a3;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:13px">▲</button>` : ''}
               ${!isLast  ? `<button onclick="PQ._moveDown(${s.id})" title="Move down"
                 style="border:1px solid #c7d2fe;background:#e0e7ff;color:#3730a3;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:13px">▼</button>` : ''}
               <button onclick="PQ._deleteStep(${s.id})" title="Delete"
                 style="border:1px solid #fca5a5;background:#fee2e2;color:#b91c1c;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:13px">✕</button>
             </div>
           </div>`;

      // Connector / insert button
      const afterConnector = isLast
        ? (locked ? '' : `
            <div style="margin-top:10px">
              <button onclick="PQ._addStep()"
                style="border:1px dashed #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:4px;
                       padding:4px 18px;cursor:pointer;font-size:12px">+ Add step</button>
            </div>`)
        : locked
          ? `<div style="display:flex;flex-direction:column;align-items:center">
               <div style="width:2px;height:20px;background:#4b5563"></div>
               <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #4b5563"></div>
             </div>`
          : `<div style="display:flex;flex-direction:column;align-items:center">
               <div style="width:2px;height:12px;background:#4b5563"></div>
               <button onclick="PQ._addStepAfter(${s.id})" title="Insert step below"
                 style="border:1px dashed #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:4px;
                        padding:2px 12px;cursor:pointer;font-size:11px">+ insert</button>
               <div style="width:2px;height:12px;background:#4b5563"></div>
               <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #4b5563"></div>
             </div>`;

      return `<div style="display:flex;flex-direction:column;align-items:center">${box}</div>${afterConnector}`;
    }).join('');
  }

  function _cell(id, field, val) {
    if (!_s.pending[id]) _s.pending[id] = {};
    _s.pending[id][field] = val;
  }

  function _startEdit() { _s.editMode = true; _renderPfd(); }
  function _cancelEdit() { _s.editMode = false; _s.pending = {}; _renderPfd(); }

  async function _flushPending() {
    if (!Object.keys(_s.pending).length) return;
    const allSteps = await getAll('pq_pfd_steps');
    for (const [id, changes] of Object.entries(_s.pending)) {
      const existing = allSteps.find(s => s.id == id);
      if (existing) await save('pq_pfd_steps', Object.assign({}, existing, changes, { id: parseInt(id) }));
    }
    _s.pending = {};
  }

  // Renumber all steps 10, 20, 30... in current sort order
  async function _renumberAll() {
    const allSteps = await getAll('pq_pfd_steps');
    const steps = allSteps
      .filter(s => s.partId == _s.partId)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    await Promise.all(steps.map((s, i) =>
      save('pq_pfd_steps', Object.assign({}, s, {
        id:        s.id,
        sortOrder: (i + 1) * 10,
        opNumber:  'OP' + String((i + 1) * 10).padStart(2, '0'),
      }))
    ));
  }

  const _userName = () => (typeof Auth !== 'undefined' && Auth.user?.name) ? Auth.user.name : 'User';
  const _fmtDate  = () => new Date().toISOString().slice(0, 10);

  async function _saveAll() {
    const summary = prompt('Change summary (required):');
    if (summary === null) return;
    if (!summary.trim()) { toast('Please enter a change summary', 'e'); return; }

    await _flushPending();

    const parts  = await getAll('pq_parts');
    const part   = parts.find(p => p.id == _s.partId);
    const newRev = nextRev(part.pfdRev || 'A');

    await save('pq_parts', Object.assign({}, part, {
      id:                part.id,
      pfdRev:            newRev,
      pfdStatus:         'Pending Approval',
      lastChangeSummary: summary.trim(),
      lastChangedAt:     new Date().toISOString(),
    }));

    // Log revision entry
    await save('pq_revisions', {
      partId:        _s.partId,
      docType:       'pfd',
      revision:      newRev,
      status:        'Pending Approval',
      changeSummary: summary.trim(),
      changedBy:     _userName(),
      date:          _fmtDate(),
    });

    _s.editMode = false;
    toast(`Submitted for approval — Rev ${newRev}`);
    _renderPfd();
  }

  async function _approve() {
    if (!confirm('Approve and release this PFD?')) return;
    const parts = await getAll('pq_parts');
    const part  = parts.find(p => p.id == _s.partId);
    const by    = _userName();

    await save('pq_parts', Object.assign({}, part, {
      id:         part.id,
      pfdStatus:  'Released',
      approvedBy: by,
      approvedAt: new Date().toISOString(),
    }));

    // Update the matching revision entry to Released
    const allRevs = await getAll('pq_revisions');
    const revEntry = allRevs.find(r => r.partId == _s.partId && r.docType === 'pfd' && r.revision === part.pfdRev);
    if (revEntry) {
      await save('pq_revisions', Object.assign({}, revEntry, {
        id:         revEntry.id,
        status:     'Released',
        approvedBy: by,
        approvedAt: _fmtDate(),
      }));
    }

    toast('PFD Released');
    _renderPfd();
  }

  async function _newRevision() {
    if (!confirm('Start a new revision? The current Released version will be superseded.')) return;
    const parts = await getAll('pq_parts');
    const part  = parts.find(p => p.id == _s.partId);
    await save('pq_parts', Object.assign({}, part, {
      id:        part.id,
      pfdStatus: 'Draft',
    }));
    _s.editMode = true;
    toast('New revision started — make your changes then Submit for Approval');
    _renderPfd();
  }

  // Add step at end
  async function _addStep() {
    await _flushPending();
    const allSteps = await getAll('pq_pfd_steps');
    const existing = allSteps.filter(s => s.partId == _s.partId);
    const maxOrder = existing.length ? Math.max(...existing.map(s => s.sortOrder ?? s.id)) : 0;
    await save('pq_pfd_steps', {
      partId:    _s.partId,
      opNumber:  'OP' + String((existing.length + 1) * 10).padStart(2, '0'),
      opName:    '',
      sortOrder: maxOrder + 10,
    });
    await _renumberAll();
    _s.editMode = true;
    _renderPfd();
  }

  // Insert step immediately after afterId
  async function _addStepAfter(afterId) {
    await _flushPending();
    const allSteps = await getAll('pq_pfd_steps');
    const steps = allSteps
      .filter(s => s.partId == _s.partId)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const idx      = steps.findIndex(s => s.id == afterId);
    const curOrder = steps[idx].sortOrder ?? steps[idx].id;
    const nextOrd  = steps[idx + 1] ? (steps[idx + 1].sortOrder ?? steps[idx + 1].id) : curOrder + 20;
    await save('pq_pfd_steps', {
      partId:    _s.partId,
      opNumber:  'OP__',
      opName:    '',
      sortOrder: (curOrder + nextOrd) / 2,
    });
    await _renumberAll();
    _s.editMode = true;
    _renderPfd();
  }

  async function _deleteStep(id) {
    if (!confirm('Delete this step?')) return;
    await remove('pq_pfd_steps', id);
    delete _s.pending[id];
    await _renumberAll();
    _renderPfd();
  }

  async function _moveUp(id)   { await _swapWith(id, 'up');   }
  async function _moveDown(id) { await _swapWith(id, 'down'); }

  async function _swapWith(id, dir) {
    await _flushPending();
    const allSteps = await getAll('pq_pfd_steps');
    const steps = allSteps.filter(s => s.partId == _s.partId)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const idx   = steps.findIndex(s => s.id == id);
    const other = dir === 'up' ? steps[idx - 1] : steps[idx + 1];
    if (!other) return;
    const cur = steps[idx];
    const aSO = cur.sortOrder   ?? cur.id;
    const bSO = other.sortOrder ?? other.id;
    await Promise.all([
      save('pq_pfd_steps', Object.assign({}, cur,   { id: cur.id,   sortOrder: bSO })),
      save('pq_pfd_steps', Object.assign({}, other, { id: other.id, sortOrder: aSO })),
    ]);
    await _renumberAll();
    _renderPfd();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PFMEA — PROCESS FAILURE MODE & EFFECTS ANALYSIS
  // ══════════════════════════════════════════════════════════════════════
  async function openPfmea(pid) {
    _s.partId = pid; _s.pfmeaEditMode = false; _s.pfmeaPending = {};
    await _renderPfmea();
  }

  // Match a PFD step name against the failure-mode library. A step can
  // match more than one category (e.g. "Trimming / Fettling").
  function _matchPfmeaTemplates(stepName, templates) {
    const s = String(stepName||'').toLowerCase();
    const cats = Object.entries(PFMEA_CATEGORY_KEYWORDS)
      .filter(([, kws]) => kws.some(k => s.includes(k)))
      .map(([cat]) => cat);
    if (!cats.length) return [];
    return templates
      .filter(t => cats.includes(t.processCategory))
      .sort((a, b) => cats.indexOf(a.processCategory) - cats.indexOf(b.processCategory) || (a.order||0) - (b.order||0));
  }

  // Generate/refresh PFMEA rows from the current PFD. Idempotent per step —
  // only adds rows for steps that don't already have any PFMEA row, so
  // running it again after adding a new PFD step only fills the gap.
  async function _generatePfmeaFromPfd() {
    await _pfmeaFlushPending();
    const [parts, allSteps, allRows, allTemplates] = await Promise.all([
      getAll('pq_parts'), getAll('pq_pfd_steps'), getAll('pq_pfmea_rows'), getAll('pq_pfmea_templates')
    ]);
    const part = parts.find(p => p.id == _s.partId);
    const steps = allSteps.filter(s => s.partId == _s.partId).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    if (!steps.length) { toast('No PFD steps yet — build the Process Flow Diagram first', 'e'); return; }

    const existingRows = allRows.filter(r => r.partId == _s.partId);
    const coveredOps = new Set(existingRows.map(r => r.opNumber));
    let order = existingRows.length ? Math.max(...existingRows.map(r => r.order || 0)) : 0;
    let added = 0;

    for (const step of steps) {
      if (coveredOps.has(step.opNumber)) continue;
      const stepName = step.stepName || step.opName || '';
      const matches = _matchPfmeaTemplates(stepName, allTemplates);
      const toAdd = matches.length ? matches : [{
        function: '', failureMode: '', failureEffect: '', severity: 1,
        failureCause: '', occurrence: 1, currentControls: '', detection: 1,
      }];
      for (const t of toAdd) {
        order += 1;
        await save('pq_pfmea_rows', {
          partId: _s.partId, opNumber: step.opNumber, processStep: stepName,
          function: t.function || '', failureMode: t.failureMode || '', failureEffect: t.failureEffect || '',
          severity: t.severity || 1, failureCause: t.failureCause || '', occurrence: t.occurrence || 1,
          currentControls: t.currentControls || '', detection: t.detection || 1,
          rpn: (t.severity||1) * (t.occurrence||1) * (t.detection||1),
          recommendedAction: t.recommendedAction || '', responsibility: t.responsibility || '',
          targetDate: '', status: 'Open', order,
        });
        added++;
      }
    }

    toast(added ? `Generated ${added} PFMEA row(s) from process flow` : 'All PFD steps already have PFMEA rows');
    _renderPfmea();
  }

  async function _renderPfmea() {
    const pid = _s.partId;
    const [parts, allSteps, allRows, allRevs] = await Promise.all([
      getAll('pq_parts'), getAll('pq_pfd_steps'), getAll('pq_pfmea_rows'), getAll('pq_revisions')
    ]);
    const part = parts.find(p => p.id == pid);
    if (!part) { toast('Part not found', 'e'); renderDashboard(); return; }

    const steps = allSteps.filter(s => s.partId == pid).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const rows  = allRows.filter(r => r.partId == pid).sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    const locked   = !_s.pfmeaEditMode;
    const status   = part.pfmeaStatus || 'Draft';
    const released = status === 'Released';
    const pending  = status === 'Pending Approval';
    const docNo    = `VRA-PFMEA-${part.partNumber||'XXX'}-REV-${part.pfmeaRev||'A'}`;

    const badge = released ? `<span class="badge ba">Released</span>`
                : pending  ? `<span class="badge bp">⏳ Pending Approval</span>`
                           : `<span class="badge bd">Draft</span>`;

    const genBtn = `<button class="btn btn-o btn-sm" onclick="PQ._generatePfmeaFromPfd()">⚙️ Generate from Process Flow</button>`;
    const actions = _s.pfmeaEditMode
      ? `${genBtn}
         <button class="btn btn-g btn-sm" onclick="PQ._pfmeaSaveAll()">📤 Submit for Approval</button>
         <button class="btn btn-o btn-sm" onclick="PQ._pfmeaCancelEdit()">Cancel</button>`
      : released
        ? `<button class="btn btn-o btn-sm" onclick="window.print()">🖨 Print</button>
           <button class="btn btn-o btn-sm" onclick="PQ._pfmeaNewRevision()">🔄 New Revision</button>`
        : pending
          ? `<button class="btn btn-o btn-sm" onclick="window.print()">🖨 Print</button>
             <button class="btn btn-g btn-sm" onclick="PQ._pfmeaApprove()">✓ Approve</button>
             <button class="btn btn-p btn-sm" onclick="PQ._pfmeaStartEdit()">✏️ Edit</button>`
          : `${genBtn}
             <button class="btn btn-o btn-sm" onclick="window.print()">🖨 Print</button>
             <button class="btn btn-p btn-sm" onclick="PQ._pfmeaStartEdit()">✏️ Edit</button>`;

    // Risk summary
    const bands = { Critical:0, High:0, Medium:0, Low:0, OK:0 };
    rows.forEach(r => { bands[rpnColor(r.rpn||0).label]++; });
    const topRisks = [...rows].sort((a,b) => (b.rpn||0)-(a.rpn||0)).slice(0, 5);

    setC(`
      <style>
        @media print {
          .no-print { display:none !important; }
          aside, .topbar { display:none !important; }
          .main { margin:0 !important; }
          .content { padding:8px !important; }
        }
        .btn-g { background:#16a34a;color:#fff;border:none; }
        .btn-g:hover { background:#15803d; }
        .pf-tbl { width:100%; border-collapse:collapse; font-size:11.5px; }
        .pf-tbl th { background:#1e3a5f; color:#fff; padding:6px 8px; text-align:left; border:1px solid #ccc; font-size:10px; text-transform:uppercase; letter-spacing:.2px; }
        .pf-tbl td { padding:5px 7px; border:1px solid #e5e7eb; vertical-align:top; }
        .pf-in { width:100%; border:1px solid #c7d2fe; border-radius:3px; padding:3px 5px; font-size:11.5px; background:#fff; font-family:inherit; }
        .pf-num { width:44px; text-align:center; border:1px solid #c7d2fe; border-radius:3px; padding:3px 2px; font-size:11.5px; }
        .pf-rpn { display:inline-block; min-width:38px; text-align:center; font-weight:800; padding:3px 6px; border-radius:4px; font-size:12px; }
      </style>

      <div class="ph no-print">
        <div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
            <span class="tp" style="background:#b91c1c">PFMEA</span>
            ${badge}
            <span class="mono" style="color:#0d2f6e;font-weight:700">${esc(docNo)}</span>
            <span style="color:#9ca3af">Rev ${esc(part.pfmeaRev||'A')}</span>
          </div>
          <h2>${esc(part.partName||'')} — PFMEA</h2>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Parts</button>
          ${actions}
        </div>
      </div>

      ${_s.pfmeaEditMode ? `<div class="alert al-d no-print" style="margin-bottom:12px">
        ✏️ Editing — rows can be freely added, edited or deleted while in Draft; nothing is logged until you click <b>Submit for Approval</b>.
      </div>` : ''}
      ${pending && !_s.pfmeaEditMode ? `<div class="alert al-w no-print" style="margin-bottom:12px">
        ⏳ Pending approval. Click <b>Approve</b> to release it, or <b>Edit</b> to revise.
      </div>` : ''}
      ${!rows.length ? `<div class="alert al-d no-print" style="margin-bottom:12px">
        No PFMEA rows yet. Click <b>Generate from Process Flow</b> to auto-create rows from the PFD, pre-filled from the standard failure-mode library where a process match is found.
      </div>` : ''}

      <!-- Document header -->
      <div style="border:2px solid #0d2f6e;margin-bottom:16px;font-size:12px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td rowspan="3" style="padding:10px 16px;border-right:1px solid #0d2f6e;width:180px;vertical-align:middle;text-align:center">
              <div style="font-weight:800;font-size:15px;color:#0d2f6e;letter-spacing:.5px">V R ALUCAST</div>
              <div style="font-size:9px;color:#6b7280;letter-spacing:.3px;margin-top:2px">QUALITY MANAGEMENT SYSTEM</div>
            </td>
            <td colspan="4" style="padding:8px 14px;border-bottom:1px solid #0d2f6e;font-weight:700;font-size:13px;color:#0d2f6e;text-align:center;letter-spacing:.5px">
              PROCESS FAILURE MODE &amp; EFFECTS ANALYSIS (PFMEA)
            </td>
          </tr>
          <tr>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db;width:22%">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Part Name</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.partName||'')}</div>
            </td>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db;width:22%">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Part Number</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.partNumber||'')}</div>
            </td>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db;width:22%">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Material</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.material||'')}</div>
            </td>
            <td style="padding:6px 12px;border-bottom:1px solid #d1d5db">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Date</div>
              <div style="font-weight:600;margin-top:2px">${esc(part.date||'')}</div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding:6px 12px;border-right:1px solid #d1d5db">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Controlled Document Number</div>
              <div style="font-weight:700;color:#0d2f6e;font-family:monospace;margin-top:2px">${esc(docNo)}</div>
            </td>
            <td style="padding:6px 12px;border-right:1px solid #d1d5db">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Revision</div>
              <div style="font-weight:800;font-size:16px;color:#0d2f6e;margin-top:2px">${esc(part.pfmeaRev||'A')}</div>
            </td>
            <td style="padding:6px 12px">
              <div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase">Status</div>
              <div style="font-weight:700;margin-top:2px;color:${released?'#16a34a':pending?'#d97706':'#6b7280'}">${esc(status)}</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 240px;gap:14px;align-items:start">

        <div>
          ${steps.map(step => _buildPfmeaGroup(step, rows.filter(r => r.opNumber === step.opNumber), locked)).join('')}
          ${!steps.length ? `<div class="card"><div class="cb" style="padding:24px;text-align:center;color:#9ca3af">No PFD steps — build the Process Flow Diagram first</div></div>` : ''}
        </div>

        <div class="no-print">
          <div class="card" style="margin-bottom:14px">
            <div class="ch"><h5>Risk Summary</h5></div>
            <div class="cb" style="padding:11px">
              ${['Critical','High','Medium','Low','OK'].map(label => {
                const c = { Critical:'#991b1b', High:'#c2410c', Medium:'#a16207', Low:'#4d7c0f', OK:'#166534' }[label];
                return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12.5px">
                  <span style="color:${c};font-weight:600">${label}</span><span style="font-weight:700">${bands[label]}</span>
                </div>`;
              }).join('')}
              <div style="border-top:1px solid #f0f3f9;margin-top:6px;padding-top:6px;font-size:12px;color:#6b7280">${rows.length} row(s) total</div>
            </div>
          </div>

          ${topRisks.length ? `<div class="card" style="margin-bottom:14px">
            <div class="ch"><h5>Top Risks</h5></div>
            <div class="cb" style="padding:8px">
              ${topRisks.map(r => {
                const rc = rpnColor(r.rpn||0);
                return `<div style="padding:6px 7px;background:#f9fafc;border-radius:6px;margin-bottom:3px;border:1px solid #e5e7eb">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                    <span style="font-size:11px;font-weight:600;color:#374151">${esc(r.opNumber||'')} — ${esc((r.failureMode||'').slice(0,40))}</span>
                    <span class="pf-rpn" style="background:${rc.bg};color:${rc.fg}">${r.rpn||0}</span>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>` : ''}

          <div class="card">
            <div class="ch"><h5>Revisions</h5></div>
            <div class="cb" style="padding:8px">
              ${(() => {
                let entries = allRevs.filter(r => r.partId == pid && r.docType === 'pfmea').sort((a, b) => b.id - a.id);
                if (!entries.length) {
                  entries = [{ revision: part.pfmeaRev||'A', status: part.pfmeaStatus||'Draft', date: part.date||'', changedBy: part.approvedBy||'', changeSummary: 'Initial revision', _fallback: true }];
                }
                return entries.map(r => {
                  const isCurrent = r._fallback || r.revision === part.pfmeaRev;
                  const stBadge = r.status === 'Released'
                    ? `<span class="badge ba" style="font-size:10px">Released</span>`
                    : r.status === 'Pending Approval'
                      ? `<span class="badge bp" style="font-size:10px">Pending</span>`
                      : `<span class="badge bd" style="font-size:10px">Draft</span>`;
                  return `<div style="padding:6px 7px;background:${isCurrent?'#edf1fb':'#f9fafc'};border-radius:6px;margin-bottom:3px;border:1px solid ${isCurrent?'#c5d0f0':'#e5e7eb'}">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <span class="mono" style="font-weight:700;color:#0d2f6e">Rev ${esc(r.revision)}</span>
                      ${stBadge}
                    </div>
                    <div class="muted" style="font-size:11px;margin-top:2px">${esc(r.date||'')} · ${esc(r.changedBy||'')}</div>
                    ${r.changeSummary ? `<div style="font-size:11px;color:#374151;margin-top:2px">${esc(r.changeSummary)}</div>` : ''}
                  </div>`;
                }).join('');
              })()}
            </div>
          </div>
        </div>
      </div>
    `);
  }

  function _buildPfmeaGroup(step, rows, locked) {
    const stepName = step.stepName || step.opName || '';
    const body = rows.length ? rows.map(r => _buildPfmeaRow(r, locked)).join('') :
      `<tr><td colspan="${locked?12:13}" style="text-align:center;color:#9ca3af;padding:10px">No failure modes for this step${locked?'':' — click "+ Add Failure Mode" below'}</td></tr>`;

    return `
      <div class="card" style="margin-bottom:14px">
        <div class="ch" style="display:flex;justify-content:space-between;align-items:center">
          <h5><span class="mono" style="color:#0d2f6e">${esc(step.opNumber||'')}</span> ${esc(stepName)}</h5>
        </div>
        <div class="cb" style="padding:0;overflow-x:auto">
          <table class="pf-tbl">
            <thead><tr>
              <th style="min-width:140px">Function / Requirement</th>
              <th style="min-width:140px">Potential Failure Mode</th>
              <th style="min-width:140px">Potential Effect</th>
              <th>S</th>
              <th style="min-width:140px">Potential Cause</th>
              <th>O</th>
              <th style="min-width:140px">Current Controls</th>
              <th>D</th>
              <th>RPN</th>
              <th style="min-width:140px">Recommended Action</th>
              <th style="min-width:100px">Responsibility</th>
              <th>Status</th>
              ${locked ? '' : '<th></th>'}
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${!locked ? `<div style="padding:8px 12px">
          <button class="btn btn-o btn-xs" onclick="PQ._addPfmeaRow('${esc(step.opNumber||'')}','${esc(stepName).replace(/'/g,"\\'")}')">+ Add Failure Mode</button>
        </div>` : ''}
      </div>`;
  }

  function _buildPfmeaRow(r, locked) {
    const rc = rpnColor(r.rpn||0);
    if (locked) {
      return `<tr>
        <td>${esc(r.function||'')}</td>
        <td style="font-weight:600">${esc(r.failureMode||'')}</td>
        <td>${esc(r.failureEffect||'')}</td>
        <td style="text-align:center;font-weight:700">${r.severity||''}</td>
        <td>${esc(r.failureCause||'')}</td>
        <td style="text-align:center;font-weight:700">${r.occurrence||''}</td>
        <td>${esc(r.currentControls||'')}</td>
        <td style="text-align:center;font-weight:700">${r.detection||''}</td>
        <td style="text-align:center"><span class="pf-rpn" style="background:${rc.bg};color:${rc.fg}">${r.rpn||0}</span></td>
        <td>${esc(r.recommendedAction||'')}</td>
        <td>${esc(r.responsibility||'')}</td>
        <td>${esc(r.status||'Open')}</td>
      </tr>`;
    }
    return `<tr>
      <td><textarea class="pf-in" rows="2" oninput="PQ._pfmeaCell(${r.id},'function',this.value)">${esc(r.function||'')}</textarea></td>
      <td><textarea class="pf-in" rows="2" oninput="PQ._pfmeaCell(${r.id},'failureMode',this.value)">${esc(r.failureMode||'')}</textarea></td>
      <td><textarea class="pf-in" rows="2" oninput="PQ._pfmeaCell(${r.id},'failureEffect',this.value)">${esc(r.failureEffect||'')}</textarea></td>
      <td><input type="number" min="1" max="10" class="pf-num" value="${r.severity||1}"
            onchange="PQ._pfmeaRatingChange(${r.id},'severity',this.value)"></td>
      <td><textarea class="pf-in" rows="2" oninput="PQ._pfmeaCell(${r.id},'failureCause',this.value)">${esc(r.failureCause||'')}</textarea></td>
      <td><input type="number" min="1" max="10" class="pf-num" value="${r.occurrence||1}"
            onchange="PQ._pfmeaRatingChange(${r.id},'occurrence',this.value)"></td>
      <td><textarea class="pf-in" rows="2" oninput="PQ._pfmeaCell(${r.id},'currentControls',this.value)">${esc(r.currentControls||'')}</textarea></td>
      <td><input type="number" min="1" max="10" class="pf-num" value="${r.detection||1}"
            onchange="PQ._pfmeaRatingChange(${r.id},'detection',this.value)"></td>
      <td style="text-align:center"><span id="pf-rpn-${r.id}" class="pf-rpn" style="background:${rc.bg};color:${rc.fg}">${r.rpn||0}</span></td>
      <td><textarea class="pf-in" rows="2" oninput="PQ._pfmeaCell(${r.id},'recommendedAction',this.value)">${esc(r.recommendedAction||'')}</textarea></td>
      <td><input class="pf-in" value="${esc(r.responsibility||'')}" oninput="PQ._pfmeaCell(${r.id},'responsibility',this.value)"></td>
      <td>
        <select class="pf-in" onchange="PQ._pfmeaCell(${r.id},'status',this.value)">
          ${['Open','In Progress','Closed'].map(s => `<option value="${s}" ${((r.status||'Open')===s)?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><button onclick="PQ._deletePfmeaRow(${r.id})" title="Delete"
            style="border:1px solid #fca5a5;background:#fee2e2;color:#b91c1c;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:12px">✕</button></td>
    </tr>`;
  }

  function _pfmeaCell(id, field, val) {
    if (!_s.pfmeaPending[id]) _s.pfmeaPending[id] = {};
    _s.pfmeaPending[id][field] = val;
  }

  // Rating change (S/O/D) — update pending + recompute RPN live without a full re-render
  function _pfmeaRatingChange(id, field, val) {
    const n = Math.min(10, Math.max(1, parseInt(val, 10) || 1));
    _pfmeaCell(id, field, n);
    // recompute using pending values merged over nothing we can read back easily;
    // read the three number inputs from the row directly via DOM
    const row = document.getElementById(`pf-rpn-${id}`)?.closest('tr');
    if (!row) return;
    const nums = row.querySelectorAll('input[type=number]');
    const s = parseInt(nums[0]?.value, 10) || 1;
    const o = parseInt(nums[1]?.value, 10) || 1;
    const d = parseInt(nums[2]?.value, 10) || 1;
    const rpn = s * o * d;
    _pfmeaCell(id, 'rpn', rpn);
    const rc = rpnColor(rpn);
    const badge = document.getElementById(`pf-rpn-${id}`);
    if (badge) { badge.textContent = rpn; badge.style.background = rc.bg; badge.style.color = rc.fg; }
  }

  async function _pfmeaFlushPending() {
    if (!Object.keys(_s.pfmeaPending).length) return;
    const allRows = await getAll('pq_pfmea_rows');
    for (const [id, changes] of Object.entries(_s.pfmeaPending)) {
      const existing = allRows.find(r => r.id == id);
      if (existing) await save('pq_pfmea_rows', Object.assign({}, existing, changes, { id: parseInt(id) }));
    }
    _s.pfmeaPending = {};
  }

  function _pfmeaStartEdit() { _s.pfmeaEditMode = true; _renderPfmea(); }
  function _pfmeaCancelEdit() { _s.pfmeaEditMode = false; _s.pfmeaPending = {}; _renderPfmea(); }

  async function _addPfmeaRow(opNumber, processStep) {
    await _pfmeaFlushPending();
    const allRows = await getAll('pq_pfmea_rows');
    const existing = allRows.filter(r => r.partId == _s.partId);
    const maxOrder = existing.length ? Math.max(...existing.map(r => r.order || 0)) : 0;
    await save('pq_pfmea_rows', {
      partId: _s.partId, opNumber, processStep,
      function: '', failureMode: '', failureEffect: '', severity: 1,
      failureCause: '', occurrence: 1, currentControls: '', detection: 1, rpn: 1,
      recommendedAction: '', responsibility: '', targetDate: '', status: 'Open',
      order: maxOrder + 1,
    });
    _s.pfmeaEditMode = true;
    _renderPfmea();
  }

  async function _deletePfmeaRow(id) {
    if (!confirm('Delete this failure mode row?')) return;
    await remove('pq_pfmea_rows', id);
    delete _s.pfmeaPending[id];
    _renderPfmea();
  }

  async function _pfmeaSaveAll() {
    const summary = prompt('Change summary (required):');
    if (summary === null) return;
    if (!summary.trim()) { toast('Please enter a change summary', 'e'); return; }

    await _pfmeaFlushPending();

    const parts  = await getAll('pq_parts');
    const part   = parts.find(p => p.id == _s.partId);
    const newRev = nextRev(part.pfmeaRev || 'A');

    await save('pq_parts', Object.assign({}, part, {
      id: part.id, pfmeaRev: newRev, pfmeaStatus: 'Pending Approval',
      pfmeaLastChangeSummary: summary.trim(), pfmeaLastChangedAt: new Date().toISOString(),
    }));

    await save('pq_revisions', {
      partId: _s.partId, docType: 'pfmea', revision: newRev, status: 'Pending Approval',
      changeSummary: summary.trim(), changedBy: _userName(), date: _fmtDate(),
    });

    _s.pfmeaEditMode = false;
    toast(`Submitted for approval — Rev ${newRev}`);
    _renderPfmea();
  }

  async function _pfmeaApprove() {
    if (!confirm('Approve and release this PFMEA?')) return;
    const parts = await getAll('pq_parts');
    const part  = parts.find(p => p.id == _s.partId);
    const by    = _userName();

    await save('pq_parts', Object.assign({}, part, {
      id: part.id, pfmeaStatus: 'Released', pfmeaApprovedBy: by, pfmeaApprovedAt: new Date().toISOString(),
    }));

    const allRevs = await getAll('pq_revisions');
    const revEntry = allRevs.find(r => r.partId == _s.partId && r.docType === 'pfmea' && r.revision === part.pfmeaRev);
    if (revEntry) {
      await save('pq_revisions', Object.assign({}, revEntry, {
        id: revEntry.id, status: 'Released', approvedBy: by, approvedAt: _fmtDate(),
      }));
    }

    toast('PFMEA Released');
    _renderPfmea();
  }

  async function _pfmeaNewRevision() {
    if (!confirm('Start a new revision? The current Released version will be superseded.')) return;
    const parts = await getAll('pq_parts');
    const part  = parts.find(p => p.id == _s.partId);
    await save('pq_parts', Object.assign({}, part, { id: part.id, pfmeaStatus: 'Draft' }));
    _s.pfmeaEditMode = true;
    toast('New revision started — make your changes then Submit for Approval');
    _renderPfmea();
  }

  // ── Public ────────────────────────────────────────────────────────────
  return {
    renderDashboard,
    newPart, editPart, _savePart, deletePart, _toggleTemplateSelect,
    openPfd,
    _startEdit, _cancelEdit, _saveAll, _approve, _newRevision,
    _addStep, _addStepAfter, _deleteStep, _moveUp, _moveDown,
    _cell,
    openPfmea, _generatePfmeaFromPfd,
    _pfmeaStartEdit, _pfmeaCancelEdit, _pfmeaSaveAll, _pfmeaApprove, _pfmeaNewRevision,
    _addPfmeaRow, _deletePfmeaRow, _pfmeaCell, _pfmeaRatingChange,
  };
})();

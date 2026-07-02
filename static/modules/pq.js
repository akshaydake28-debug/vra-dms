// Process Quality — Phase 1: Process Flow Diagram
const PQ = (() => {

  const _s = { partId: null, editMode: false, pending: {} };

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
        <td>
          <button class="btn btn-o btn-xs" onclick="PQ.openPfd(${p.id})">Open PFD</button>
          <button class="btn btn-o btn-xs" style="margin-left:4px" onclick="PQ.editPart(${p.id})">Edit</button>
          <button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;margin-left:4px"
            onclick="PQ.deletePart(${p.id},'${esc(p.partNumber||'')}')">Delete</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="5" style="padding:28px;text-align:center;color:#9ca3af">
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
            <thead><tr><th>Part No.</th><th>Part Name</th><th>Material</th><th>PFD Status</th><th></th></tr></thead>
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
    };

    if (pid) {
      // Preserve existing rev/status on edit
      const parts = await getAll('pq_parts');
      const existing = parts.find(p => p.id == pid);
      if (existing) { data.pfdRev = existing.pfdRev; data.pfdStatus = existing.pfdStatus; }
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
      toast(`Part created with ${srcSteps.length} steps copied from template`);
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
    const [parts, allSteps] = await Promise.all([getAll('pq_parts'), getAll('pq_pfd_steps')]);
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
        }
        .btn-g { background:#16a34a;color:#fff;border:none; }
        .btn-g:hover { background:#15803d; }
      </style>

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

    _s.editMode = false;
    toast(`Submitted for approval — Rev ${newRev}`);
    _renderPfd();
  }

  async function _approve() {
    if (!confirm('Approve and release this PFD?')) return;
    const parts = await getAll('pq_parts');
    const part  = parts.find(p => p.id == _s.partId);
    await save('pq_parts', Object.assign({}, part, {
      id:           part.id,
      pfdStatus:    'Released',
      approvedBy:   typeof Auth !== 'undefined' ? Auth.user?.name : 'User',
      approvedAt:   new Date().toISOString(),
    }));
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

  // ── Public ────────────────────────────────────────────────────────────
  return {
    renderDashboard,
    newPart, editPart, _savePart, deletePart, _toggleTemplateSelect,
    openPfd,
    _startEdit, _cancelEdit, _saveAll, _approve, _newRevision,
    _addStep, _addStepAfter, _deleteStep, _moveUp, _moveDown,
    _cell,
  };
})();

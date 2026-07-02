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

  // ══════════════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════════════
  async function renderDashboard() {
    _s.partId = null; _s.editMode = false; _s.pending = {};
    setC('<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>');
    const parts = await getAll('pq_parts');

    const rows = parts.map(p => `
      <tr>
        <td style="font-weight:600;color:#0d2f6e">${esc(p.partNumber||'')}</td>
        <td>${esc(p.partName||'')}</td>
        <td>${esc(p.material||'')}</td>
        <td>
          <button class="btn btn-o btn-xs" onclick="PQ.openPfd(${p.id})">Open PFD</button>
          <button class="btn btn-o btn-xs" style="margin-left:4px" onclick="PQ.editPart(${p.id})">Edit</button>
          <button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;margin-left:4px"
            onclick="PQ.deletePart(${p.id},'${esc(p.partNumber||'')}')">Delete</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="4" style="padding:28px;text-align:center;color:#9ca3af">
        No parts yet — <a style="color:#0d2f6e;font-weight:600;cursor:pointer" onclick="PQ.newPart()">create the first part →</a>
      </td></tr>`;

    setC(`
      <div class="card">
        <div class="ch">
          <h5>Process Quality — Parts</h5>
          <button class="btn btn-sm" onclick="PQ.newPart()">+ New Part</button>
        </div>
        <div class="tw">
          <table>
            <thead><tr><th>Part No.</th><th>Part Name</th><th>Material</th><th></th></tr></thead>
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

  function _partForm(p) {
    const isNew = !p;
    setC(`
      <div class="card" style="max-width:520px;margin:0 auto">
        <div class="ch">
          <h5>${isNew ? 'New Part' : 'Edit Part'}</h5>
          <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Back</button>
        </div>
        <div class="cb" style="display:flex;flex-direction:column;gap:14px;padding:20px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Part Number *</label>
            <input id="f-pno" class="input" value="${esc(p?.partNumber||'')}" placeholder="e.g. VRA-DC-001">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Part Name *</label>
            <input id="f-pname" class="input" value="${esc(p?.partName||'')}" placeholder="e.g. ADC12 Die Cast Component">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Material / Grade</label>
            <input id="f-mat" class="input" value="${esc(p?.material||'')}" placeholder="e.g. ADC12">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Revision</label>
            <input id="f-rev" class="input" value="${esc(p?.pfdRev||'A')}" placeholder="A" style="width:80px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Date</label>
            <input id="f-date" type="date" class="input" value="${esc(p?.date||new Date().toISOString().slice(0,10))}" style="width:160px">
          </div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn" onclick="PQ._savePart(${p?.id||'null'})">Save</button>
            <button class="btn btn-o" onclick="PQ.renderDashboard()">Cancel</button>
          </div>
        </div>
      </div>`);
  }

  async function _savePart(pid) {
    const pno   = document.getElementById('f-pno').value.trim();
    const pname = document.getElementById('f-pname').value.trim();
    if (!pno || !pname) { toast('Part number and name are required', 'e'); return; }
    const data = {
      partNumber: pno,
      partName:   pname,
      material:   document.getElementById('f-mat').value.trim(),
      pfdRev:     document.getElementById('f-rev').value.trim() || 'A',
      date:       document.getElementById('f-date').value,
    };
    if (pid) data.id = pid;
    await save('pq_parts', data);
    toast('Part saved');
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

    const locked = !_s.editMode;
    const docNo  = `VRA-PFD-${part.partNumber||'XXX'}-REV-${part.pfdRev||'A'}`;
    const today  = part.date || new Date().toISOString().slice(0,10);

    setC(`
      <style>
        @media print {
          .no-print { display: none !important; }
          aside, .topbar { display: none !important; }
          .main { margin: 0 !important; }
          .content { padding: 8px !important; }
        }
      </style>

      <!-- Toolbar -->
      <div class="no-print" style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Parts</button>
        <h5 style="margin:0;font-size:14px">${esc(part.partName||'')} — Process Flow Diagram</h5>
        <span style="margin-left:auto;display:flex;gap:6px">
          ${locked
            ? `<button class="btn btn-o btn-sm" onclick="window.print()">🖨 Print</button>
               <button class="btn btn-sm" onclick="PQ._startEdit()">Edit</button>`
            : `<button class="btn btn-sm" style="background:#16a34a;color:#fff;border:none" onclick="PQ._saveAll()">Save</button>
               <button class="btn btn-o btn-sm" onclick="PQ._cancelEdit()">Cancel</button>`
          }
        </span>
      </div>

      <!-- Document Header -->
      <div style="border:2px solid #1d4ed8;border-radius:6px;margin-bottom:16px;overflow:hidden">
        <div style="background:#1d4ed8;color:#fff;padding:8px 16px;font-weight:700;font-size:13px;letter-spacing:.5px">
          V R ALUCAST — Process Flow Diagram
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 100px 100px;gap:0;font-size:12px">
          <div style="padding:8px 14px;border-right:1px solid #dbeafe">
            <div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:2px">Part Name</div>
            <div style="font-weight:600">${esc(part.partName||'')}</div>
          </div>
          <div style="padding:8px 14px;border-right:1px solid #dbeafe">
            <div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:2px">Part Number</div>
            <div style="font-weight:600">${esc(part.partNumber||'')}</div>
          </div>
          <div style="padding:8px 14px;border-right:1px solid #dbeafe">
            <div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:2px">Document Number</div>
            <div style="font-weight:600;font-family:monospace;color:#1d4ed8">${esc(docNo)}</div>
          </div>
          <div style="padding:8px 14px;border-right:1px solid #dbeafe">
            <div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:2px">Rev</div>
            <div style="font-weight:700;font-size:15px;color:#1d4ed8">${esc(part.pfdRev||'A')}</div>
          </div>
          <div style="padding:8px 14px">
            <div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:2px">Date</div>
            <div style="font-weight:600">${esc(today)}</div>
          </div>
        </div>
      </div>

      <!-- Flow -->
      <div class="card">
        <div class="cb" style="padding:24px;display:flex;flex-direction:column;align-items:center;gap:0">
          ${steps.length
            ? _buildFlow(steps, locked)
            : locked
              ? `<div style="padding:32px;text-align:center;color:#9ca3af">No steps yet — click <b>Edit</b> to add steps</div>`
              : `<div style="padding:12px;text-align:center;color:#9ca3af">
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
        ? `<div style="width:210px;padding:14px 18px;border:2px solid #1d4ed8;border-radius:6px;
                       background:#dbeafe;text-align:center;user-select:none">
             <div style="font-size:11px;font-weight:700;color:#3b82f6;margin-bottom:4px">${esc(s.opNumber||'')}</div>
             <div style="font-size:13px;font-weight:700;color:#1e3a8a">${esc(s.opName||'—')}</div>
           </div>`
        : `<div style="width:230px;padding:10px 12px;border:2px solid #1d4ed8;border-radius:6px;background:#dbeafe;text-align:center">
             <input value="${esc(s.opNumber||'')}" placeholder="OP10"
               oninput="PQ._cell(${s.id},'opNumber',this.value)"
               style="width:64px;text-align:center;font-size:11px;font-weight:700;color:#3b82f6;
                      border:1px solid #93c5fd;border-radius:3px;padding:2px 4px;margin-bottom:6px;background:#fff">
             <br>
             <input value="${esc(s.opName||'')}" placeholder="Operation name"
               oninput="PQ._cell(${s.id},'opName',this.value)"
               style="width:100%;text-align:center;font-size:13px;font-weight:700;color:#1e3a8a;
                      border:1px solid #93c5fd;border-radius:3px;padding:3px 8px;background:#fff">
             <div style="margin-top:8px;display:flex;justify-content:center;gap:4px">
               ${!isFirst ? `<button onclick="PQ._moveUp(${s.id})" title="Move up"
                 style="border:none;background:#e0e7ff;color:#3730a3;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:13px">▲</button>` : ''}
               ${!isLast  ? `<button onclick="PQ._moveDown(${s.id})" title="Move down"
                 style="border:none;background:#e0e7ff;color:#3730a3;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:13px">▼</button>` : ''}
               <button onclick="PQ._deleteStep(${s.id})" title="Delete"
                 style="border:none;background:#fee2e2;color:#b91c1c;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:13px">✕</button>
             </div>
           </div>`;

      const connector = locked
        ? `<div style="display:flex;flex-direction:column;align-items:center">
             <div style="width:2px;height:20px;background:#60a5fa"></div>
             <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #60a5fa"></div>
           </div>`
        : `<div style="display:flex;flex-direction:column;align-items:center">
             <div style="width:2px;height:12px;background:#60a5fa"></div>
             <button onclick="PQ._addStepAfter(${s.id})" title="Insert step below"
               style="border:1px dashed #60a5fa;background:#eff6ff;color:#1d4ed8;border-radius:4px;
                      padding:2px 12px;cursor:pointer;font-size:11px">+ insert</button>
             <div style="width:2px;height:12px;background:#60a5fa"></div>
             <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #60a5fa"></div>
           </div>`;

      // After last step: just close, no arrow; in edit mode show "add step" at bottom
      const after = isLast
        ? (locked ? '' : `
            <div style="margin-top:10px">
              <button onclick="PQ._addStep()"
                style="border:1px dashed #60a5fa;background:#eff6ff;color:#1d4ed8;border-radius:4px;
                       padding:4px 18px;cursor:pointer;font-size:12px">+ Add step</button>
            </div>`)
        : connector;

      return `<div style="display:flex;flex-direction:column;align-items:center">${box}</div>${after}`;
    }).join('');
  }

  function _cell(id, field, val) {
    if (!_s.pending[id]) _s.pending[id] = {};
    _s.pending[id][field] = val;
  }

  function _startEdit() { _s.editMode = true; _renderPfd(); }
  function _cancelEdit() { _s.editMode = false; _s.pending = {}; _renderPfd(); }

  // Flush user edits in pending to DB
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
    await _flushPending();
    _s.editMode = false;
    toast('PFD saved');
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
    // Renumber so everything is clean 10, 20, 30...
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
    const idx       = steps.findIndex(s => s.id == afterId);
    const curOrder  = steps[idx].sortOrder ?? steps[idx].id;
    const nextOrder = steps[idx + 1] ? (steps[idx + 1].sortOrder ?? steps[idx + 1].id) : curOrder + 20;
    // Place new step in the middle fractionally
    const newOrder  = (curOrder + nextOrder) / 2;
    await save('pq_pfd_steps', {
      partId:    _s.partId,
      opNumber:  'OP__',   // placeholder, renumber will fix it
      opName:    '',
      sortOrder: newOrder,
    });
    // Renumber all steps so they become 10, 20, 30...
    await _renumberAll();
    _s.editMode = true;
    _renderPfd();
  }

  async function _deleteStep(id) {
    if (!confirm('Delete this step?')) return;
    await remove('pq_pfd_steps', id);
    delete _s.pending[id];
    // Renumber remaining steps
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
    const cur   = steps[idx];
    const aSO   = cur.sortOrder   ?? cur.id;
    const bSO   = other.sortOrder ?? other.id;
    await Promise.all([
      save('pq_pfd_steps', Object.assign({}, cur,   { id: cur.id,   sortOrder: bSO })),
      save('pq_pfd_steps', Object.assign({}, other, { id: other.id, sortOrder: aSO })),
    ]);
    // Renumber so op numbers reflect new order
    await _renumberAll();
    _renderPfd();
  }

  // ── Public ────────────────────────────────────────────────────────────
  return {
    renderDashboard,
    newPart, editPart, _savePart, deletePart,
    openPfd,
    _startEdit, _cancelEdit, _saveAll,
    _addStep, _addStepAfter, _deleteStep, _moveUp, _moveDown,
    _cell,
  };
})();

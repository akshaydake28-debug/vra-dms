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
  const save   = (mod, data) => api('POST', `/api/qms2/${mod}`, data);   // create or update (id in body)
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
  //  DASHBOARD — list parts
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
          <button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;margin-left:4px" onclick="PQ.deletePart(${p.id},'${esc(p.partNumber||'')}')">Delete</button>
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
    const part  = parts.find(p => p.id == pid);
    if (!part) { toast('Part not found', 'e'); renderDashboard(); return; }

    const steps = allSteps
      .filter(s => s.partId == pid)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));

    const locked = !_s.editMode;

    const flowHtml = _buildFlow(steps, locked);

    setC(`
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Parts</button>
        <h5 style="margin:0;font-size:14px">${esc(part.partName||'')} — Process Flow Diagram</h5>
        <span class="badge bd" style="font-size:11px">Part No: ${esc(part.partNumber||'')}</span>
        <span style="margin-left:auto;display:flex;gap:6px">
          ${locked
            ? `<button class="btn btn-sm" onclick="PQ._startEdit()">Edit</button>`
            : `<button class="btn btn-sm" style="background:#16a34a;color:#fff;border:none" onclick="PQ._saveAll()">Save</button>
               <button class="btn btn-o btn-sm" onclick="PQ._cancelEdit()">Cancel</button>`
          }
        </span>
      </div>

      <div class="card">
        <div class="cb" style="padding:24px;display:flex;flex-direction:column;align-items:center;gap:0">
          ${flowHtml}
          ${!locked && !steps.length ? `
            <div style="padding:32px;text-align:center;color:#9ca3af">
              <button class="btn btn-o" onclick="PQ._addStep()">+ Add first step</button>
            </div>` : ''}
        </div>
      </div>

      ${locked && steps.length ? `
      <div style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center">
        Click <b>Edit</b> to add, rename or reorder steps
      </div>` : ''}
    `);
  }

  function _buildFlow(steps, locked) {
    if (!steps.length) {
      return `<div style="color:#9ca3af;padding:32px;text-align:center">No steps yet — click <b>Edit → Add Step</b> to begin</div>`;
    }

    return steps.map((s, i) => {
      const isFirst = i === 0;
      const isLast  = i === steps.length - 1;

      // Box
      const box = locked
        ? `<div style="
              width:200px;padding:14px 16px;
              border:2px solid #1d4ed8;border-radius:6px;
              background:#dbeafe;text-align:center;
              font-weight:700;font-size:13px;color:#1e3a8a;
              user-select:none">
              <div style="font-size:11px;color:#3b82f6;margin-bottom:2px">${esc(s.opNumber||'')}</div>
              ${esc(s.opName||'—')}
           </div>`
        : `<div style="
              width:220px;padding:10px 12px;
              border:2px solid #1d4ed8;border-radius:6px;
              background:#dbeafe;text-align:center">
              <input
                value="${esc(s.opNumber||'')}"
                placeholder="OP10"
                oninput="PQ._cell(${s.id},'opNumber',this.value)"
                style="width:60px;text-align:center;font-size:11px;font-weight:700;color:#3b82f6;
                       border:1px solid #93c5fd;border-radius:3px;padding:2px 4px;margin-bottom:4px;background:#fff">
              <input
                value="${esc(s.opName||'')}"
                placeholder="Operation name"
                oninput="PQ._cell(${s.id},'opName',this.value)"
                style="width:100%;text-align:center;font-size:13px;font-weight:700;color:#1e3a8a;
                       border:1px solid #93c5fd;border-radius:3px;padding:3px 6px;background:#fff">
              <div style="margin-top:8px;display:flex;justify-content:center;gap:4px">
                ${!isFirst ? `<button onclick="PQ._moveUp(${s.id})" title="Move up"
                  style="border:none;background:#e0e7ff;color:#3730a3;border-radius:3px;padding:2px 7px;cursor:pointer;font-size:12px">▲</button>` : ''}
                ${!isLast  ? `<button onclick="PQ._moveDown(${s.id})" title="Move down"
                  style="border:none;background:#e0e7ff;color:#3730a3;border-radius:3px;padding:2px 7px;cursor:pointer;font-size:12px">▼</button>` : ''}
                <button onclick="PQ._deleteStep(${s.id})" title="Delete"
                  style="border:none;background:#fee2e2;color:#b91c1c;border-radius:3px;padding:2px 7px;cursor:pointer;font-size:12px">✕</button>
              </div>
           </div>`;

      // Connector below (arrow, and in edit mode an "add below" button)
      const arrow = isLast
        ? (locked ? '' : `
            <div style="display:flex;flex-direction:column;align-items:center;margin-top:8px">
              <button onclick="PQ._addStep()" title="Add step at end"
                style="border:1px dashed #60a5fa;background:#eff6ff;color:#1d4ed8;border-radius:4px;
                       padding:3px 14px;cursor:pointer;font-size:12px">+ Add step</button>
            </div>`)
        : locked
          ? `<div style="display:flex;flex-direction:column;align-items:center">
               <div style="width:2px;height:20px;background:#60a5fa"></div>
               <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #60a5fa"></div>
             </div>`
          : `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;position:relative">
               <div style="width:2px;height:14px;background:#60a5fa"></div>
               <button onclick="PQ._addStepAfter(${s.id})" title="Insert step below"
                 style="border:1px dashed #60a5fa;background:#eff6ff;color:#1d4ed8;border-radius:4px;
                        padding:2px 10px;cursor:pointer;font-size:11px;z-index:1">+ insert</button>
               <div style="width:2px;height:14px;background:#60a5fa"></div>
               <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #60a5fa"></div>
             </div>`;

      return `<div style="display:flex;flex-direction:column;align-items:center">${box}</div>${arrow}`;
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

  async function _saveAll() {
    await _flushPending();
    _s.editMode = false;
    toast('PFD saved');
    _renderPfd();
  }

  // Add step at the end (header button)
  async function _addStep() {
    await _flushPending();
    const allSteps = await getAll('pq_pfd_steps');
    const existing = allSteps.filter(s => s.partId == _s.partId)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const maxOrder = existing.length ? Math.max(...existing.map(s => s.sortOrder ?? s.id)) : 0;
    const n = existing.length + 1;
    await save('pq_pfd_steps', {
      partId:    _s.partId,
      opNumber:  'OP' + String(n * 10).padStart(2, '0'),
      opName:    '',
      sortOrder: maxOrder + 10,
    });
    _s.editMode = true;
    _renderPfd();
  }

  // Insert a new step immediately after the given step id
  async function _addStepAfter(afterId) {
    await _flushPending();
    const allSteps = await getAll('pq_pfd_steps');
    const steps = allSteps.filter(s => s.partId == _s.partId)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const idx = steps.findIndex(s => s.id == afterId);
    const cur  = steps[idx];
    const next = steps[idx + 1];
    // Place new step halfway between cur and next sortOrders
    const curOrder  = cur.sortOrder  ?? cur.id;
    const nextOrder = next ? (next.sortOrder ?? next.id) : curOrder + 20;
    const newOrder  = Math.round((curOrder + nextOrder) / 2);
    const n = steps.length + 1;
    await save('pq_pfd_steps', {
      partId:    _s.partId,
      opNumber:  'OP' + String(n * 10).padStart(2, '0'),
      opName:    '',
      sortOrder: newOrder,
    });
    _s.editMode = true;
    _renderPfd();
  }

  async function _deleteStep(id) {
    if (!confirm('Delete this step?')) return;
    await remove('pq_pfd_steps', id);
    delete _s.pending[id];
    _renderPfd();
  }

  async function _moveUp(id) {
    await _swapWith(id, 'up');
  }
  async function _moveDown(id) {
    await _swapWith(id, 'down');
  }

  async function _swapWith(id, dir) {
    const allSteps = await getAll('pq_pfd_steps');
    const steps = allSteps.filter(s => s.partId == _s.partId)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const idx = steps.findIndex(s => s.id == id);
    const other = dir === 'up' ? steps[idx - 1] : steps[idx + 1];
    if (!other) return;
    const cur = steps[idx];
    const aSO = cur.sortOrder  ?? cur.id;
    const bSO = other.sortOrder ?? other.id;
    await Promise.all([
      save('pq_pfd_steps', Object.assign({}, cur,   { id: cur.id,   sortOrder: bSO })),
      save('pq_pfd_steps', Object.assign({}, other, { id: other.id, sortOrder: aSO })),
    ]);
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

// Process Quality Module — PFD → PFMEA → Control Plan → Check Sheet
const PQ = (() => {
  // ── State ────────────────────────────────────────────────────────────
  const _s = {
    view: 'dashboard',     // dashboard | part | pfd | pfmea | cp | cs
    partId: null,
    pfdLocked: true,
    pfmeaLocked: true,
    cpLocked: true,
    pfmeaPending: {},      // rowId -> {field:val}
    cpPending: {},         // rowId -> {field:val}
    pfdPending: {},        // stepId -> {field:val}
    pfdStepOrder: [],      // ordered stepIds after a drag (future)
  };

  // ── API helpers ──────────────────────────────────────────────────────
  const api = async (method, url, body) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };
  const getAll = mod => api('GET', `/api/qms2/${mod}`);
  const getOne = (mod, id) => api('GET', `/api/qms2/${mod}/${id}`);
  const post   = (mod, data) => api('POST', `/api/qms2/${mod}`, data);
  const put    = (mod, id, data) => api('PUT', `/api/qms2/${mod}/${id}`, data);
  const del    = (mod, id) => api('DELETE', `/api/qms2/${mod}/${id}`);

  const setC = html => document.getElementById('content').innerHTML = html;
  const esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const toast = (msg, t='s') => {
    const el = document.createElement('div');
    el.className = `alert al-${t}`;
    el.style = 'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.2)';
    el.textContent = msg; document.body.appendChild(el); setTimeout(()=>el.remove(), 3000);
  };

  // ── Rev letters ──────────────────────────────────────────────────────
  const nextRev = rev => {
    if (!rev) return 'A';
    const c = rev.charCodeAt(rev.length-1);
    return c < 90 ? rev.slice(0,-1) + String.fromCharCode(c+1) : rev + 'A';
  };

  // ══════════════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════════════
  async function renderDashboard() {
    _s.view = 'dashboard'; _s.partId = null;
    _s.pfmeaPending = {}; _s.cpPending = {}; _s.pfdPending = {};
    setC('<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>');
    const parts = await getAll('pq_parts');
    const rows = parts.map(p => {
      const d = p.data || p;
      const pid = p.id;
      const pfdRev   = d.pfdRev   || '—';
      const pfmeaRev = d.pfmeaRev || '—';
      const cpRev    = d.cpRev    || '—';
      const pfdSt    = d.pfdStatus   || 'Draft';
      const pfmeaSt  = d.pfmeaStatus || 'Draft';
      const cpSt     = d.cpStatus    || 'Draft';
      const badge = st => {
        if (st === 'Released' || st === 'Approved') return `<span class="badge ba">${st}</span>`;
        if (st === 'Superseded') return `<span class="badge bs">${st}</span>`;
        return `<span class="badge bd">${st}</span>`;
      };
      return `<tr>
        <td style="font-weight:600;color:#0d2f6e">${esc(d.partNumber||'')}</td>
        <td>${esc(d.partName||'')}</td>
        <td>${esc(d.material||'')}</td>
        <td>${badge(pfdSt)} Rev ${esc(pfdRev)}
          <button class="btn btn-o btn-xs" style="margin-left:4px" onclick="PQ.openPfd(${pid})">Open</button></td>
        <td>${badge(pfmeaSt)} Rev ${esc(pfmeaRev)}
          <button class="btn btn-o btn-xs" style="margin-left:4px" onclick="PQ.openPfmea(${pid})">Open</button></td>
        <td>${badge(cpSt)} Rev ${esc(cpRev)}
          <button class="btn btn-o btn-xs" style="margin-left:4px" onclick="PQ.openCp(${pid})">Open</button>
          <button class="btn btn-o btn-xs" style="margin-left:2px" onclick="PQ.openCs(${pid})">Check Sheet</button></td>
        <td>
          <button class="btn btn-o btn-xs" onclick="PQ.editPartForm(${pid})">Edit</button>
          <button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;margin-left:2px" onclick="PQ.deletePart(${pid},'${esc(d.partNumber||'')}')">Del</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af">
      No parts yet. <a style="color:#0d2f6e;cursor:pointer;font-weight:600" onclick="PQ.newPartForm()">Create first part →</a></td></tr>`;

    setC(`
      <div class="card" style="margin-bottom:14px">
        <div class="ch">
          <h5>Process Quality — Parts</h5>
          <button class="btn btn-sm" onclick="PQ.newPartForm()">+ New Part</button>
        </div>
        <div class="tw">
          <table>
            <thead><tr>
              <th>Part No.</th><th>Part Name</th><th>Material</th>
              <th>PFD</th><th>PFMEA</th><th>Control Plan / Check Sheet</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PART FORM
  // ══════════════════════════════════════════════════════════════════════
  function newPartForm() { _partForm(null); }
  async function editPartForm(pid) {
    const rec = await getOne('pq_parts', pid);
    _partForm(rec);
  }

  function _partForm(rec) {
    const d = rec ? (rec.data || rec) : {};
    const pid = rec ? rec.id : null;
    const title = pid ? 'Edit Part' : 'New Part';
    // Core team as comma list for editing
    const team = Array.isArray(d.coreTeam) ? d.coreTeam.join(', ') : (d.coreTeam || '');
    setC(`
      <div class="card" style="max-width:600px;margin:0 auto">
        <div class="ch"><h5>${title}</h5>
          <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Back</button></div>
        <div class="cb" style="display:flex;flex-direction:column;gap:12px;padding:16px">
          <div><label style="font-size:12px;font-weight:600;color:#374151">Part Number *</label>
            <input id="pq-pno" class="input" value="${esc(d.partNumber||'')}" placeholder="e.g. VRA-DC-001" style="margin-top:4px"></div>
          <div><label style="font-size:12px;font-weight:600;color:#374151">Part Name *</label>
            <input id="pq-pname" class="input" value="${esc(d.partName||'')}" placeholder="e.g. ADC12 Die Cast Component" style="margin-top:4px"></div>
          <div><label style="font-size:12px;font-weight:600;color:#374151">Material / Grade</label>
            <input id="pq-mat" class="input" value="${esc(d.material||'')}" placeholder="e.g. ADC12" style="margin-top:4px"></div>
          <div><label style="font-size:12px;font-weight:600;color:#374151">Customer</label>
            <input id="pq-cust" class="input" value="${esc(d.customer||'')}" style="margin-top:4px"></div>
          <div><label style="font-size:12px;font-weight:600;color:#374151">Core Team (comma-separated)</label>
            <input id="pq-team" class="input" value="${esc(team)}" placeholder="Name1, Name2, Name3" style="margin-top:4px"></div>
          <div><label style="font-size:12px;font-weight:600;color:#374151">Date</label>
            <input id="pq-date" type="date" class="input" value="${esc(d.date||new Date().toISOString().slice(0,10))}" style="margin-top:4px"></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn" onclick="PQ._savePartForm(${pid||'null'})">Save Part</button>
            <button class="btn btn-o" onclick="PQ.renderDashboard()">Cancel</button>
          </div>
        </div>
      </div>`);
  }

  async function _savePartForm(pid) {
    const pno   = document.getElementById('pq-pno').value.trim();
    const pname = document.getElementById('pq-pname').value.trim();
    if (!pno || !pname) { toast('Part number and name are required','e'); return; }
    const team = document.getElementById('pq-team').value.split(',').map(s=>s.trim()).filter(Boolean);
    const data = {
      partNumber: pno, partName: pname,
      material:  document.getElementById('pq-mat').value.trim(),
      customer:  document.getElementById('pq-cust').value.trim(),
      coreTeam:  team,
      date:      document.getElementById('pq-date').value,
      pfdRev:    'A', pfdStatus: 'Draft',
      pfmeaRev:  'A', pfmeaStatus: 'Draft',
      cpRev:     'A', cpStatus:    'Draft',
    };
    try {
      if (pid) {
        const existing = await getOne('pq_parts', pid);
        const ex = existing.data || existing;
        // Preserve rev/status fields
        data.pfdRev     = ex.pfdRev     || 'A';
        data.pfdStatus  = ex.pfdStatus  || 'Draft';
        data.pfmeaRev   = ex.pfmeaRev   || 'A';
        data.pfmeaStatus= ex.pfmeaStatus|| 'Draft';
        data.cpRev      = ex.cpRev      || 'A';
        data.cpStatus   = ex.cpStatus   || 'Draft';
        await put('pq_parts', pid, data);
      } else {
        await post('pq_parts', data);
      }
      toast('Part saved');
      renderDashboard();
    } catch(e) { toast('Error: ' + e.message, 'e'); }
  }

  async function deletePart(pid, partNo) {
    if (!confirm(`Delete part "${partNo}" and ALL its PFD/PFMEA/CP data? This cannot be undone.`)) return;
    try {
      // Delete all child rows
      for (const mod of ['pq_pfd_steps','pq_pfmea_rows','pq_cp_rows']) {
        const rows = await getAll(mod);
        for (const r of rows) {
          if ((r.data||r).partId == pid) await del(mod, r.id);
        }
      }
      await del('pq_parts', pid);
      toast('Part deleted');
      renderDashboard();
    } catch(e) { toast('Error: ' + e.message, 'e'); }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PFD — PROCESS FLOW DIAGRAM
  // ══════════════════════════════════════════════════════════════════════
  async function openPfd(pid) {
    _s.view = 'pfd'; _s.partId = pid;
    _s.pfdLocked = true; _s.pfdPending = {};
    setC('<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>');
    await _renderPfd(pid);
  }

  async function _renderPfd(pid) {
    const [part, allSteps] = await Promise.all([getOne('pq_parts', pid), getAll('pq_pfd_steps')]);
    const d = part.data || part;
    const steps = allSteps.filter(r => (r.data||r).partId == pid)
      .sort((a,b) => ((a.data||a).opNumber||'').localeCompare((b.data||b).opNumber||''));
    const locked = _s.pfdLocked;
    const docNo = `VRA-PFD-${d.partNumber||''}-REV-${d.pfdRev||'A'}`;
    const isReleased = d.pfdStatus === 'Released';

    const headerBtns = isReleased
      ? (locked
          ? `<button class="btn btn-sm" onclick="PQ._pfdStartNewRev(${pid})">Start New Revision</button>`
          : `<button class="btn btn-sm" onclick="PQ._pfdRelease(${pid})">Release</button>
             <button class="btn btn-o btn-sm" onclick="PQ._pfdCancelEdit(${pid})">Cancel</button>`)
      : (locked
          ? `<button class="btn btn-sm" onclick="PQ._pfdEdit(${pid})">Edit</button>
             <button class="btn btn-sm" style="background:#16a34a;color:#fff;border:none;margin-left:4px" onclick="PQ._pfdRelease(${pid})">Release</button>`
          : `<button class="btn btn-sm" onclick="PQ._pfdSave(${pid})">Save</button>
             <button class="btn btn-o btn-sm" onclick="PQ._pfdCancelEdit(${pid})">Cancel</button>`);

    const stepsHtml = steps.length
      ? steps.map((r,i) => _pfdStepHtml(r, i, locked)).join('')
      : `<div style="text-align:center;padding:32px;color:#9ca3af">No process steps yet. Click Edit to add steps.</div>`;

    // Visual flowchart
    const flowHtml = _buildFlowchart(steps);

    setC(`
      <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Dashboard</button>
        <h5 style="margin:0">${esc(d.partName||'')} — Process Flow Diagram</h5>
        <span class="badge ${isReleased?'ba':'bd'}">${d.pfdStatus||'Draft'} Rev ${d.pfdRev||'A'}</span>
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${headerBtns}</span>
      </div>

      <!-- Header Card -->
      <div class="card" style="margin-bottom:12px">
        <div class="cb" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;font-size:12px">
          <div><b>Doc No:</b> ${esc(docNo)}</div>
          <div><b>Part No:</b> ${esc(d.partNumber||'')}</div>
          <div><b>Part Name:</b> ${esc(d.partName||'')}</div>
          <div><b>Material:</b> ${esc(d.material||'')}</div>
          <div><b>Date:</b> ${esc(d.date||'')}</div>
          <div><b>Core Team:</b> ${esc((d.coreTeam||[]).join(', '))}</div>
        </div>
      </div>

      <!-- Visual Flowchart -->
      <div class="card" style="margin-bottom:12px">
        <div class="ch"><h5>Visual Flow</h5></div>
        <div class="cb" style="padding:16px;overflow-x:auto">${flowHtml}</div>
      </div>

      <!-- Steps Table -->
      <div class="card">
        <div class="ch">
          <h5>Process Steps</h5>
          ${!locked ? `<button class="btn btn-sm" onclick="PQ._pfdAddStep(${pid})">+ Add Step</button>` : ''}
        </div>
        <div class="tw">
          <table>
            <thead><tr>
              <th style="width:70px">Op No.</th>
              <th style="width:130px">Operation Name</th>
              <th style="width:90px">Type</th>
              <th>Inputs</th>
              <th>Outputs</th>
              <th>Key Points / Parameters</th>
              ${!locked ? '<th style="width:60px"></th>' : ''}
            </tr></thead>
            <tbody id="pfd-tbody">${stepsHtml}</tbody>
          </table>
        </div>
      </div>`);
  }

  function _pfdStepHtml(r, i, locked) {
    const d = r.data || r;
    const id = r.id;
    const typeOpts = ['Operation','Inspection','Transport','Storage','Delay'].map(t =>
      `<option value="${t}" ${d.stepType===t?'selected':''}>${t}</option>`).join('');
    const inp = s => locked
      ? `<span>${esc(d[s]||'')}</span>`
      : `<input class="input" style="width:100%;font-size:12px" value="${esc(d[s]||'')}" oninput="PQ._pfdCell(${id},'${s}',this.value)">`;
    const ta = s => locked
      ? `<span style="white-space:pre-wrap">${esc(d[s]||'')}</span>`
      : `<textarea class="input" style="width:100%;font-size:12px;min-height:48px;resize:vertical" oninput="PQ._pfdCell(${id},'${s}',this.value)">${esc(d[s]||'')}</textarea>`;
    const typeCell = locked
      ? `<span>${esc(d.stepType||'Operation')}</span>`
      : `<select class="input" style="font-size:12px" onchange="PQ._pfdCell(${id},'stepType',this.value)">${typeOpts}</select>`;
    return `<tr id="pfd-row-${id}">
      <td>${inp('opNumber')}</td>
      <td>${inp('opName')}</td>
      <td>${typeCell}</td>
      <td>${ta('inputs')}</td>
      <td>${ta('outputs')}</td>
      <td>${ta('keyPoints')}</td>
      ${!locked ? `<td><button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca" onclick="PQ._pfdDelStep(${id},${_s.partId})">Del</button></td>` : ''}
    </tr>`;
  }

  function _buildFlowchart(steps) {
    if (!steps.length) return '<div style="color:#9ca3af;padding:12px">No steps defined.</div>';
    const shapes = steps.map(r => {
      const d = r.data || r;
      const t = (d.stepType||'Operation').toLowerCase();
      let shape;
      if (t === 'inspection') {
        shape = `<div style="width:100px;height:50px;border:2px solid #d97706;background:#fef3c7;display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;font-weight:600;color:#92400e;transform:rotate(45deg);margin:8px auto">
          <span style="transform:rotate(-45deg)">${esc(d.opNumber||'')} ${esc(d.opName||'')}</span></div>`;
      } else if (t === 'transport') {
        shape = `<div style="width:110px;padding:8px 4px;border:2px solid #7c3aed;background:#ede9fe;border-radius:50%;text-align:center;font-size:11px;font-weight:600;color:#5b21b6;margin:0 auto">${esc(d.opNumber||'')} ${esc(d.opName||'')}</div>`;
      } else {
        shape = `<div style="width:110px;padding:10px 6px;border:2px solid #1d4ed8;background:#dbeafe;border-radius:4px;text-align:center;font-size:11px;font-weight:600;color:#1e3a8a;margin:0 auto">${esc(d.opNumber||'')} ${esc(d.opName||'')}</div>`;
      }
      return `<div style="display:flex;flex-direction:column;align-items:center">${shape}</div>`;
    });

    // Connect with arrows
    const connected = shapes.map((s, i) =>
      i < shapes.length - 1
        ? s + `<div style="width:2px;height:20px;background:#9ca3af;margin:0 auto"></div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #9ca3af;margin:0 auto"></div>`
        : s
    ).join('');

    return `<div style="display:flex;flex-direction:column;align-items:center;gap:0;min-width:180px">${connected}</div>`;
  }

  function _pfdCell(id, field, val) {
    if (!_s.pfdPending[id]) _s.pfdPending[id] = {};
    _s.pfdPending[id][field] = val;
  }

  function _pfdEdit(pid) { _s.pfdLocked = false; _renderPfd(pid); }
  function _pfdCancelEdit(pid) { _s.pfdLocked = true; _s.pfdPending = {}; _renderPfd(pid); }

  async function _pfdSave(pid) {
    await _pfdFlush();
    _s.pfdLocked = true;
    toast('PFD saved');
    _renderPfd(pid);
  }

  async function _pfdFlush() {
    for (const [id, changes] of Object.entries(_s.pfdPending)) {
      const rec = await getOne('pq_pfd_steps', id);
      const d = Object.assign({}, rec.data || rec, changes);
      await put('pq_pfd_steps', id, d);
    }
    _s.pfdPending = {};
  }

  async function _pfdRelease(pid) {
    const summary = prompt('Release notes / change summary:');
    if (summary === null) return;
    await _pfdFlush();
    const part = await getOne('pq_parts', pid);
    const d = Object.assign({}, part.data || part, { pfdStatus: 'Released' });
    await put('pq_parts', pid, d);
    _s.pfdLocked = true;
    toast('PFD released');
    _renderPfd(pid);
  }

  async function _pfdStartNewRev(pid) {
    if (!confirm('Start a new draft revision of this PFD? Current released revision will be superseded.')) return;
    const part = await getOne('pq_parts', pid);
    const d = Object.assign({}, part.data || part, {
      pfdStatus: 'Draft',
      pfdRev: nextRev(part.data?.pfdRev || part.pfdRev || 'A'),
    });
    await put('pq_parts', pid, d);
    _s.pfdLocked = false;
    toast('New revision started');
    _renderPfd(pid);
  }

  async function _pfdAddStep(pid) {
    await _pfdFlush();
    const allSteps = await getAll('pq_pfd_steps');
    const existing = allSteps.filter(r => (r.data||r).partId == pid);
    const nextOp = 'OP' + String((existing.length + 1) * 10).padStart(2,'0');
    await post('pq_pfd_steps', {
      partId: pid, opNumber: nextOp, opName: 'New Operation',
      stepType: 'Operation', inputs: '', outputs: '', keyPoints: ''
    });
    _renderPfd(pid);
  }

  async function _pfdDelStep(stepId, pid) {
    if (!confirm('Delete this process step?')) return;
    await del('pq_pfd_steps', stepId);
    _renderPfd(pid);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PFMEA
  // ══════════════════════════════════════════════════════════════════════
  async function openPfmea(pid) {
    _s.view = 'pfmea'; _s.partId = pid;
    _s.pfmeaLocked = true; _s.pfmeaPending = {};
    setC('<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>');
    await _renderPfmea(pid);
  }

  async function _renderPfmea(pid) {
    const [part, allSteps, allRows] = await Promise.all([
      getOne('pq_parts', pid), getAll('pq_pfd_steps'), getAll('pq_pfmea_rows')
    ]);
    const d = part.data || part;
    const locked = _s.pfmeaLocked;
    const isReleased = d.pfmeaStatus === 'Released';
    const docNo = `VRA-PFMEA-${d.partNumber||''}-REV-${d.pfmeaRev||'A'}`;

    const rows = allRows.filter(r => (r.data||r).partId == pid)
      .sort((a,b) => ((a.data||a).opNumber||'').localeCompare((b.data||b).opNumber||''));

    const headerBtns = isReleased
      ? (locked
          ? `<button class="btn btn-sm" onclick="PQ._pfmeaStartNewRev(${pid})">Start New Revision</button>`
          : `<button class="btn btn-sm" onclick="PQ._pfmeaRelease(${pid})">Save & Release</button>
             <button class="btn btn-o btn-sm" onclick="PQ._pfmeaCancelEdit(${pid})">Cancel</button>`)
      : (locked
          ? `<button class="btn btn-sm" onclick="PQ._pfmeaEdit(${pid})">Edit</button>
             <button class="btn btn-sm" style="background:#16a34a;color:#fff;border:none;margin-left:4px" onclick="PQ._pfmeaRelease(${pid})">Release</button>`
          : `<button class="btn btn-sm" onclick="PQ._pfmeaSaveRev(${pid})">Save Revision</button>
             <button class="btn btn-o btn-sm" onclick="PQ._pfmeaCancelEdit(${pid})">Cancel</button>`);

    const pendingCount = Object.keys(_s.pfmeaPending).length;

    setC(`
      <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Dashboard</button>
        <button class="btn btn-o btn-sm" onclick="PQ.openPfd(${pid})">← PFD</button>
        <h5 style="margin:0">${esc(d.partName||'')} — PFMEA</h5>
        <span class="badge ${isReleased?'ba':'bd'}">${d.pfmeaStatus||'Draft'} Rev ${d.pfmeaRev||'A'}</span>
        ${pendingCount ? `<span style="color:#d97706;font-size:12px;font-weight:600">● Unsaved changes</span>` : ''}
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${headerBtns}</span>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="cb" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;font-size:12px">
          <div><b>Doc No:</b> ${esc(docNo)}</div>
          <div><b>Part No:</b> ${esc(d.partNumber||'')}</div>
          <div><b>Part Name:</b> ${esc(d.partName||'')}</div>
          <div><b>Material:</b> ${esc(d.material||'')}</div>
          <div><b>Date:</b> ${esc(d.date||'')}</div>
          <div><b>Core Team:</b> ${esc((d.coreTeam||[]).join(', '))}</div>
        </div>
      </div>

      ${isReleased && locked ? '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#92400e">🔒 This revision is Released and read-only. Click <b>Start New Revision</b> to make changes.</div>' : ''}

      <div class="card">
        <div class="ch">
          <h5>PFMEA Rows</h5>
          ${!locked ? `<button class="btn btn-sm" onclick="PQ._pfmeaAddRow(${pid})">+ Add Row</button>` : ''}
        </div>
        <div style="overflow-x:auto">
          <table style="min-width:1400px;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#f0f3f9">
                <th style="padding:8px;border:1px solid #e5e7eb;width:60px">Op No.</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:120px">Process Step / Function</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Potential Failure Mode</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Potential Effect of Failure</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:40px">SEV</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Potential Cause of Failure</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:40px">OCC</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:140px">Current Prevention Controls</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:140px">Current Detection Controls</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:40px">DET</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:50px">RPN</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:160px">Recommended Action</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:120px">Responsibility</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:80px">Target Date</th>
                ${!locked ? '<th style="padding:8px;border:1px solid #e5e7eb;width:50px"></th>' : ''}
              </tr>
            </thead>
            <tbody id="pfmea-tbody">
              ${rows.map(r => _pfmeaRowHtml(r, locked)).join('')}
              ${!rows.length ? `<tr><td colspan="${locked?14:15}" style="padding:24px;text-align:center;color:#9ca3af">No rows yet. Click Edit → Add Row.</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>`);
  }

  function _pfmeaRowHtml(r, locked) {
    const d = r.data || r;
    const id = r.id;
    const sev = parseInt(d.severity||1), occ = parseInt(d.occurrence||1), det = parseInt(d.detection||1);
    const rpn = sev * occ * det;
    const rpnColor = rpn >= 200 ? '#b91c1c' : rpn >= 100 ? '#d97706' : '#16a34a';

    const inp = (field, width) => {
      const val = esc(d[field]||'');
      if (locked) return `<td style="padding:6px 8px;border:1px solid #e5e7eb;white-space:pre-wrap;word-break:break-word">${val}</td>`;
      return `<td style="padding:4px;border:1px solid #e5e7eb"><input class="input" style="width:${width||'100%'};font-size:11px" value="${val}" oninput="PQ._pfmeaCell(${id},'${field}',this.value)"></td>`;
    };
    const ta = field => {
      const val = esc(d[field]||'');
      if (locked) return `<td style="padding:6px 8px;border:1px solid #e5e7eb;white-space:pre-wrap;word-break:break-word;max-width:160px">${val}</td>`;
      return `<td style="padding:4px;border:1px solid #e5e7eb"><textarea class="input" style="width:100%;font-size:11px;min-height:52px;resize:vertical" oninput="PQ._pfmeaCell(${id},'${field}',this.value)">${esc(d[field]||'')}</textarea></td>`;
    };
    const num = (field, max) => {
      const val = d[field]||1;
      if (locked) return `<td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700">${val}</td>`;
      const opts = Array.from({length:max},(_,i)=>`<option value="${i+1}" ${val==i+1?'selected':''}>${i+1}</option>`).join('');
      return `<td style="padding:4px;border:1px solid #e5e7eb"><select class="input" style="font-size:11px;text-align:center" onchange="PQ._pfmeaCell(${id},'${field}',this.value);PQ._pfmeaRpn(${id})">${opts}</select></td>`;
    };

    return `<tr id="pfmea-row-${id}">
      ${inp('opNumber')}
      ${ta('processStep')}
      ${ta('failureMode')}
      ${ta('failureEffect')}
      ${num('severity',10)}
      ${ta('failureCause')}
      ${num('occurrence',10)}
      ${ta('preventionControls')}
      ${ta('detectionControls')}
      ${num('detection',10)}
      <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:${rpnColor}" id="pfmea-rpn-${id}">${rpn}</td>
      ${ta('recommendedAction')}
      ${ta('responsibility')}
      ${inp('targetDate')}
      ${!locked ? `<td style="padding:4px;border:1px solid #e5e7eb"><button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca" onclick="PQ._pfmeaDelRow(${id},${_s.partId})">Del</button></td>` : ''}
    </tr>`;
  }

  function _pfmeaCell(id, field, val) {
    if (!_s.pfmeaPending[id]) _s.pfmeaPending[id] = {};
    _s.pfmeaPending[id][field] = val;
    const ind = document.querySelector('[style*="Unsaved changes"]');
    if (!ind) {
      const h5 = document.querySelector('h5');
      if (h5) {
        const sp = document.createElement('span');
        sp.style.cssText = 'color:#d97706;font-size:12px;font-weight:600';
        sp.textContent = '● Unsaved changes';
        h5.parentElement.insertBefore(sp, h5.nextSibling);
      }
    }
  }

  function _pfmeaRpn(id) {
    // Recalculate RPN display immediately from selects
    const row = document.getElementById(`pfmea-row-${id}`);
    if (!row) return;
    const sels = row.querySelectorAll('select');
    const vals = Array.from(sels).map(s => parseInt(s.value)||1);
    if (vals.length >= 3) {
      const rpn = vals[0] * vals[1] * vals[2];
      const el = document.getElementById(`pfmea-rpn-${id}`);
      if (el) {
        el.textContent = rpn;
        el.style.color = rpn >= 200 ? '#b91c1c' : rpn >= 100 ? '#d97706' : '#16a34a';
      }
    }
  }

  function _pfmeaEdit(pid) { _s.pfmeaLocked = false; _renderPfmea(pid); }
  function _pfmeaCancelEdit(pid) { _s.pfmeaLocked = true; _s.pfmeaPending = {}; _renderPfmea(pid); }

  async function _pfmeaFlush() {
    for (const [id, changes] of Object.entries(_s.pfmeaPending)) {
      const rec = await getOne('pq_pfmea_rows', id);
      const d = Object.assign({}, rec.data || rec, changes);
      await put('pq_pfmea_rows', id, d);
    }
    _s.pfmeaPending = {};
  }

  async function _pfmeaSaveRev(pid) {
    const summary = prompt('Change summary (required):');
    if (!summary) { toast('Please enter a change summary','e'); return; }
    await _pfmeaFlush();
    _s.pfmeaLocked = true;
    toast('PFMEA saved');
    _renderPfmea(pid);
  }

  async function _pfmeaRelease(pid) {
    const summary = prompt('Release notes / change summary:');
    if (summary === null) return;
    await _pfmeaFlush();
    const part = await getOne('pq_parts', pid);
    const d = Object.assign({}, part.data || part, { pfmeaStatus: 'Released' });
    await put('pq_parts', pid, d);
    _s.pfmeaLocked = true;
    toast('PFMEA released');
    _renderPfmea(pid);
  }

  async function _pfmeaStartNewRev(pid) {
    if (!confirm('Start a new draft revision?')) return;
    const part = await getOne('pq_parts', pid);
    const existing = part.data || part;
    const d = Object.assign({}, existing, {
      pfmeaStatus: 'Draft',
      pfmeaRev: nextRev(existing.pfmeaRev || 'A'),
    });
    await put('pq_parts', pid, d);
    _s.pfmeaLocked = false;
    toast('New revision started');
    _renderPfmea(pid);
  }

  async function _pfmeaAddRow(pid) {
    await _pfmeaFlush();
    const allRows = await getAll('pq_pfmea_rows');
    const existing = allRows.filter(r => (r.data||r).partId == pid);
    const nextOp = 'OP' + String((existing.length + 1) * 10).padStart(2,'0');
    await post('pq_pfmea_rows', {
      partId: pid, opNumber: nextOp, processStep: '', failureMode: '', failureEffect: '',
      severity: 1, failureCause: '', occurrence: 1,
      preventionControls: '', detectionControls: '', detection: 1,
      recommendedAction: '', responsibility: '', targetDate: ''
    });
    _renderPfmea(pid);
  }

  async function _pfmeaDelRow(rowId, pid) {
    if (!confirm('Delete this PFMEA row?')) return;
    await del('pq_pfmea_rows', rowId);
    delete _s.pfmeaPending[rowId];
    _renderPfmea(pid);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CONTROL PLAN
  // ══════════════════════════════════════════════════════════════════════
  async function openCp(pid) {
    _s.view = 'cp'; _s.partId = pid;
    _s.cpLocked = true; _s.cpPending = {};
    setC('<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>');
    await _renderCp(pid);
  }

  async function _renderCp(pid) {
    const [part, allRows] = await Promise.all([getOne('pq_parts', pid), getAll('pq_cp_rows')]);
    const d = part.data || part;
    const locked = _s.cpLocked;
    const isApproved = d.cpStatus === 'Approved' || d.cpStatus === 'Released';
    const docNo = `VRA-CP-${d.partNumber||''}-REV-${d.cpRev||'A'}`;

    const rows = allRows.filter(r => (r.data||r).partId == pid)
      .sort((a,b) => ((a.data||a).charNumber||'').localeCompare((b.data||b).charNumber||''));

    const headerBtns = isApproved
      ? (locked
          ? `<button class="btn btn-sm" onclick="PQ._cpStartNewRev(${pid})">Start New Revision</button>`
          : `<button class="btn btn-sm" onclick="PQ._cpApprove(${pid})">Approve</button>
             <button class="btn btn-o btn-sm" onclick="PQ._cpCancelEdit(${pid})">Cancel</button>`)
      : (locked
          ? `<button class="btn btn-sm" onclick="PQ._cpEdit(${pid})">Edit</button>
             <button class="btn btn-sm" style="background:#16a34a;color:#fff;border:none;margin-left:4px" onclick="PQ._cpApprove(${pid})">Approve</button>`
          : `<button class="btn btn-sm" onclick="PQ._cpSaveRev(${pid})">Save Revision</button>
             <button class="btn btn-o btn-sm" onclick="PQ._cpCancelEdit(${pid})">Cancel</button>`);

    const pendingCount = Object.keys(_s.cpPending).length;

    setC(`
      <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Dashboard</button>
        <button class="btn btn-o btn-sm" onclick="PQ.openPfmea(${pid})">← PFMEA</button>
        <h5 style="margin:0">${esc(d.partName||'')} — Control Plan</h5>
        <span class="badge ${isApproved?'ba':'bd'}">${d.cpStatus||'Draft'} Rev ${d.cpRev||'A'}</span>
        ${pendingCount ? `<span style="color:#d97706;font-size:12px;font-weight:600">● Unsaved changes</span>` : ''}
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          ${headerBtns}
          <button class="btn btn-o btn-sm" onclick="PQ.openCs(${pid})">Check Sheet →</button>
        </span>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="cb" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;font-size:12px">
          <div><b>Doc No:</b> ${esc(docNo)}</div>
          <div><b>Part No:</b> ${esc(d.partNumber||'')}</div>
          <div><b>Part Name:</b> ${esc(d.partName||'')}</div>
          <div><b>Material:</b> ${esc(d.material||'')}</div>
          <div><b>Date:</b> ${esc(d.date||'')}</div>
          <div><b>Core Team:</b> ${esc((d.coreTeam||[]).join(', '))}</div>
        </div>
      </div>

      ${isApproved && locked ? '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#92400e">🔒 This revision is Approved and read-only. Click <b>Start New Revision</b> to make changes.</div>' : ''}

      <div class="card">
        <div class="ch">
          <h5>Control Plan Rows</h5>
          ${!locked ? `<button class="btn btn-sm" onclick="PQ._cpAddRow(${pid})">+ Add Row</button>` : ''}
        </div>
        <div style="overflow-x:auto">
          <table style="min-width:1600px;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#f0f3f9">
                <th style="padding:8px;border:1px solid #e5e7eb;width:70px">Char. No.</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:100px">Op No.</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Operation Name</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Characteristic</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:70px">Class</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Specification / Tolerance</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Control Method</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:120px">Gauge / Instrument</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:80px">Sample Size</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:80px">Frequency</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:130px">Reaction Plan</th>
                <th style="padding:8px;border:1px solid #e5e7eb;width:50px;text-align:center" title="Include in Check Sheet">CS?</th>
                ${!locked ? '<th style="padding:8px;border:1px solid #e5e7eb;width:50px"></th>' : ''}
              </tr>
            </thead>
            <tbody id="cp-tbody">
              ${rows.map(r => _cpRowHtml(r, locked)).join('')}
              ${!rows.length ? `<tr><td colspan="${locked?12:13}" style="padding:24px;text-align:center;color:#9ca3af">No rows yet. Click Edit → Add Row.</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>`);
  }

  function _cpRowHtml(r, locked) {
    const d = r.data || r;
    const id = r.id;
    const inp = (field, placeholder) => {
      const val = esc(d[field]||'');
      if (locked) return `<td style="padding:6px 8px;border:1px solid #e5e7eb;white-space:pre-wrap;word-break:break-word">${val}</td>`;
      return `<td style="padding:4px;border:1px solid #e5e7eb"><input class="input" style="width:100%;font-size:11px" value="${val}" placeholder="${placeholder||''}" oninput="PQ._cpCell(${id},'${field}',this.value)"></td>`;
    };
    const ta = field => {
      const val = esc(d[field]||'');
      if (locked) return `<td style="padding:6px 8px;border:1px solid #e5e7eb;white-space:pre-wrap;word-break:break-word;max-width:130px">${val}</td>`;
      return `<td style="padding:4px;border:1px solid #e5e7eb"><textarea class="input" style="width:100%;font-size:11px;min-height:48px;resize:vertical" oninput="PQ._cpCell(${id},'${field}',this.value)">${esc(d[field]||'')}</textarea></td>`;
    };
    const cls = d.charClass || '';
    const clsOpts = ['','Critical','Major','Minor'].map(c => `<option value="${c}" ${cls===c?'selected':''}>${c||'—'}</option>`).join('');
    const classCell = locked
      ? `<td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(cls)}</td>`
      : `<td style="padding:4px;border:1px solid #e5e7eb"><select class="input" style="font-size:11px" onchange="PQ._cpCell(${id},'charClass',this.value)">${clsOpts}</select></td>`;
    const checked = d.includeInChecksheet ? 'checked' : '';
    const csCell = locked
      ? `<td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">${d.includeInChecksheet ? '✓' : ''}</td>`
      : `<td style="padding:4px;border:1px solid #e5e7eb;text-align:center"><input type="checkbox" ${checked} onchange="PQ._cpCell(${id},'includeInChecksheet',this.checked)"></td>`;
    return `<tr id="cp-row-${id}">
      ${inp('charNumber')} ${inp('opNumber')} ${inp('opName')} ${ta('characteristic')}
      ${classCell} ${ta('specification')} ${ta('controlMethod')} ${inp('gauge')}
      ${inp('sampleSize')} ${inp('frequency')} ${ta('reactionPlan')}
      ${csCell}
      ${!locked ? `<td style="padding:4px;border:1px solid #e5e7eb"><button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca" onclick="PQ._cpDelRow(${id},${_s.partId})">Del</button></td>` : ''}
    </tr>`;
  }

  function _cpCell(id, field, val) {
    if (!_s.cpPending[id]) _s.cpPending[id] = {};
    _s.cpPending[id][field] = val;
  }

  function _cpEdit(pid) { _s.cpLocked = false; _renderCp(pid); }
  function _cpCancelEdit(pid) { _s.cpLocked = true; _s.cpPending = {}; _renderCp(pid); }

  async function _cpFlush() {
    for (const [id, changes] of Object.entries(_s.cpPending)) {
      const rec = await getOne('pq_cp_rows', id);
      const d = Object.assign({}, rec.data || rec, changes);
      await put('pq_cp_rows', id, d);
    }
    _s.cpPending = {};
  }

  async function _cpSaveRev(pid) {
    const summary = prompt('Change summary (required):');
    if (!summary) { toast('Please enter a change summary','e'); return; }
    await _cpFlush();
    _s.cpLocked = true;
    toast('Control Plan saved');
    _renderCp(pid);
  }

  async function _cpApprove(pid) {
    const summary = prompt('Approval notes / change summary:');
    if (summary === null) return;
    await _cpFlush();
    const part = await getOne('pq_parts', pid);
    const d = Object.assign({}, part.data || part, { cpStatus: 'Approved' });
    await put('pq_parts', pid, d);
    _s.cpLocked = true;
    toast('Control Plan approved');
    _renderCp(pid);
  }

  async function _cpStartNewRev(pid) {
    if (!confirm('Start a new draft revision of the Control Plan?')) return;
    const part = await getOne('pq_parts', pid);
    const existing = part.data || part;
    const d = Object.assign({}, existing, {
      cpStatus: 'Draft',
      cpRev: nextRev(existing.cpRev || 'A'),
    });
    await put('pq_parts', pid, d);
    _s.cpLocked = false;
    toast('New revision started');
    _renderCp(pid);
  }

  async function _cpAddRow(pid) {
    await _cpFlush();
    const allRows = await getAll('pq_cp_rows');
    const existing = allRows.filter(r => (r.data||r).partId == pid);
    const n = existing.length + 1;
    await post('pq_cp_rows', {
      partId: pid, charNumber: `OP${String(n*10).padStart(2,'0')}.0${n}`,
      opNumber: '', opName: '', characteristic: '', charClass: '',
      specification: '', controlMethod: '', gauge: '',
      sampleSize: '', frequency: '', reactionPlan: '',
      includeInChecksheet: true
    });
    _renderCp(pid);
  }

  async function _cpDelRow(rowId, pid) {
    if (!confirm('Delete this Control Plan row?')) return;
    await del('pq_cp_rows', rowId);
    delete _s.cpPending[rowId];
    _renderCp(pid);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CHECK SHEET
  // ══════════════════════════════════════════════════════════════════════
  async function openCs(pid, opFilter) {
    _s.view = 'cs'; _s.partId = pid;
    setC('<div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div>');
    await _renderCs(pid, opFilter || null);
  }

  async function _renderCs(pid, opFilter) {
    const [part, allRows] = await Promise.all([getOne('pq_parts', pid), getAll('pq_cp_rows')]);
    const d = part.data || part;
    const allCpRows = allRows.filter(r => {
      const rd = r.data || r;
      return rd.partId == pid && rd.includeInChecksheet;
    }).sort((a,b) => ((a.data||a).charNumber||'').localeCompare((b.data||b).charNumber||''));

    // Get unique ops for filter buttons
    const ops = [...new Set(allCpRows.map(r => (r.data||r).opNumber).filter(Boolean))].sort();
    const rows = opFilter ? allCpRows.filter(r => (r.data||r).opNumber === opFilter) : allCpRows;

    const opBtns = ops.map(op =>
      `<button class="btn btn-xs ${opFilter===op?'':'btn-o'}" style="margin-right:4px;margin-bottom:4px" onclick="PQ.openCs(${pid},'${esc(op)}')">${esc(op)}</button>`
    ).join('');

    const rowsHtml = rows.map(r => {
      const rd = r.data || r;
      const critBadge = rd.charClass === 'Critical' ? ' 🔴' : rd.charClass === 'Major' ? ' 🟠' : '';
      return `<tr>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;font-weight:600">${esc(rd.charNumber||'')}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(rd.opNumber||'')} ${esc(rd.opName||'')}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(rd.characteristic||'')}${critBadge}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(rd.specification||'')}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(rd.gauge||'')}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(rd.sampleSize||'')}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(rd.frequency||'')}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;width:90px"></td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;width:90px"></td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;width:90px"></td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;width:120px">${esc(rd.reactionPlan||'')}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;width:100px"></td>
      </tr>`;
    }).join('') || `<tr><td colspan="12" style="padding:24px;text-align:center;color:#9ca3af">No rows marked for check sheet. Go to Control Plan and check the CS column.</td></tr>`;

    const docNo = `VRA-CS-${d.partNumber||''}-REV-${d.cpRev||'A'}`;

    setC(`
      <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap" class="no-print">
        <button class="btn btn-o btn-sm" onclick="PQ.renderDashboard()">← Dashboard</button>
        <button class="btn btn-o btn-sm" onclick="PQ.openCp(${pid})">← Control Plan</button>
        <h5 style="margin:0">${esc(d.partName||'')} — In-Process Check Sheet</h5>
        <span style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-sm" onclick="window.print()">🖨 Print</button>
        </span>
      </div>

      <!-- Operation filter -->
      <div class="no-print" style="margin-bottom:12px">
        <span style="font-size:12px;font-weight:600;color:#374151;margin-right:8px">Filter by Operation:</span>
        <button class="btn btn-xs ${!opFilter?'':'btn-o'}" style="margin-right:4px;margin-bottom:4px" onclick="PQ.openCs(${pid})">All</button>
        ${opBtns}
      </div>

      <!-- Printable area -->
      <div id="cs-print-area">
        <div style="margin-bottom:12px;border:2px solid #1d4ed8;border-radius:6px;padding:12px">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:12px">
            <div><b>Document No:</b> ${esc(docNo)}</div>
            <div><b>Part No:</b> ${esc(d.partNumber||'')}</div>
            <div><b>Part Name:</b> ${esc(d.partName||'')}</div>
            <div><b>Material:</b> ${esc(d.material||'')}</div>
            <div><b>Date:</b> ___________________</div>
            <div><b>Shift:</b> ___________________</div>
            <div><b>Operator:</b> ___________________</div>
            <div><b>Inspector:</b> ___________________</div>
            <div><b>Batch No:</b> ___________________</div>
          </div>
        </div>

        ${opFilter ? `<div style="margin-bottom:8px;font-weight:600;color:#1d4ed8">Operation: ${esc(opFilter)}</div>` : ''}

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#dbeafe">
                <th style="padding:8px;border:2px solid #1d4ed8;width:70px">Char. No.</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:140px">Operation</th>
                <th style="padding:8px;border:2px solid #1d4ed8">Characteristic</th>
                <th style="padding:8px;border:2px solid #1d4ed8">Specification</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:100px">Gauge</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:70px">Sample</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:80px">Frequency</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:90px">Reading 1</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:90px">Reading 2</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:90px">Reading 3</th>
                <th style="padding:8px;border:2px solid #1d4ed8">Reaction Plan</th>
                <th style="padding:8px;border:2px solid #1d4ed8;width:100px">Remarks</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>

        <div style="margin-top:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;font-size:12px">
          <div style="border-top:1px solid #374151;padding-top:6px;text-align:center">Prepared By</div>
          <div style="border-top:1px solid #374151;padding-top:6px;text-align:center">Checked By</div>
          <div style="border-top:1px solid #374151;padding-top:6px;text-align:center">Approved By</div>
        </div>
      </div>

      <style>
        @media print {
          .no-print { display: none !important; }
          aside, .topbar { display: none !important; }
          .main { margin: 0 !important; }
          .content { padding: 12px !important; }
          #cs-print-area { width: 100%; }
        }
      </style>`);
  }

  // ── Public API ────────────────────────────────────────────────────────
  return {
    renderDashboard,
    newPartForm, editPartForm, _savePartForm, deletePart,
    openPfd, _pfdEdit, _pfdCancelEdit, _pfdSave, _pfdRelease, _pfdStartNewRev,
    _pfdAddStep, _pfdDelStep, _pfdCell,
    openPfmea, _pfmeaEdit, _pfmeaCancelEdit, _pfmeaSaveRev, _pfmeaRelease, _pfmeaStartNewRev,
    _pfmeaAddRow, _pfmeaDelRow, _pfmeaCell, _pfmeaRpn,
    openCp, _cpEdit, _cpCancelEdit, _cpSaveRev, _cpApprove, _cpStartNewRev,
    _cpAddRow, _cpDelRow, _cpCell,
    openCs,
  };
})();

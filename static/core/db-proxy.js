const API_BASE = window.location.origin;

// Universal API helper
async function _api(method, path, body) {
  try {
    const opts = { method, headers: {'Content-Type':'application/json'} };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch(e) { throw e; }
}

// ── TABLE PROXY ──
// Creates an object that mimics Dexie table API but calls our Flask backend
function makeTable(module) {
  const cache = { data: null, ts: 0 };
  
  async function getAll(force) {
    if (!force && cache.data && (Date.now() - cache.ts < 5000)) return cache.data;
    try {
      const rows = await _api('GET', `/api/${module}`);
      cache.data = rows.map(r => ({...r.data, id: r.id, _rid: r.id}));
      cache.ts = Date.now();
      return cache.data;
    } catch(e) { return []; }
  }
  
  function invalidate() { cache.data = null; cache.ts = 0; }

  return {
    async toArray() { return getAll(); },
    async count() { return (await getAll()).length; },
    async get(id) {
      const all = await getAll();
      return all.find(r => r.id === id || r._rid === id) || null;
    },
    async add(obj) {
      try {
        const r = await _api('POST', `/api/${module}`, obj);
        invalidate();
        return r.id;
      } catch(e) { return null; }
    },
    async update(id, changes) {
      try {
        const all = await getAll();
        const existing = all.find(r => r.id === id || r._rid === id) || {};
        const merged = {...existing, ...changes};
        delete merged._rid;
        await _api('POST', `/api/${module}/${id}`, merged);
        invalidate();
        return 1;
      } catch(e) { return 0; }
    },
    async delete(id) {
      try {
        await _api('DELETE', `/api/${module}/${id}`);
        invalidate();
      } catch(e) {}
    },
    async put(obj) {
      if (obj.id) return this.update(obj.id, obj);
      return this.add(obj);
    },
    // Dexie where() chain emulation
    where(field) {
      return {
        _field: field,
        _val: null,
        equals(val) { this._val = val; return this; },
        and(fn) { this._fn = fn; return this; },
        async toArray() {
          const all = await getAll();
          let filtered = all.filter(r => r[this._field] === this._val);
          if (this._fn) filtered = filtered.filter(this._fn);
          return filtered;
        },
        async first() { return (await this.toArray())[0] || null; },
        async last() { const a = await this.toArray(); return a[a.length-1] || null; },
        async count() { return (await this.toArray()).length; },
        async delete() {
          const items = await this.toArray();
          for (const item of items) {
            await _api('DELETE', `/api/${module}/${item.id || item._rid}`);
          }
          invalidate();
        },
      };
    },
    orderBy(field) {
      return {
        reverse() { return this; },
        async toArray() {
          const all = await getAll(true);
          return [...all].sort((a,b) => {
            if (a[field] < b[field]) return -1;
            if (a[field] > b[field]) return 1;
            return 0;
          });
        }
      };
    },
  };
}

// ── SETTINGS TABLE ──
const settingsTable = {
  async get(key) {
    try {
      const r = await _api('GET', `/api/settings/${key}`);
      return r.value !== null ? {key, value: r.value} : null;
    } catch(e) { return null; }
  },
  async put(obj) {
    try { await _api('POST', `/api/settings/${obj.key}`, {value: obj.value}); }
    catch(e) {}
  }
};

// ── AUDIT TABLE ──
const auditTable = {
  async add(obj) {
    try { await _api('POST', '/api/auditlog', obj); } catch(e) {}
  },
  async toArray() {
    try { return await _api('GET', '/api/auditlog'); } catch(e) { return []; }
  },
  where(field) {
    return {
      equals(val) { this._val = val; return this; },
      async toArray() {
        const all = await _api('GET', '/api/auditlog').catch(()=>[]);
        return all.filter(r => r[field] === this._val);
      }
    };
  }
};

// ── VERSIONS TABLE ──
const versionsTable = {
  _cache: {},
  async add(obj) {
    try {
      const r = await _api('POST', '/api/versions', obj);
      this._cache = {};
      return r.id;
    } catch(e) { return null; }
  },
  async update(id, changes) {
    try {
      const existing = await this.get(id) || {};
      await _api('POST', `/api/versions/${id}`, {...existing, ...changes});
      this._cache = {};
      return 1;
    } catch(e) { return 0; }
  },
  async get(id) {
    try {
      const all = await _api('GET', '/api/versions');
      return all.find(v => v.id === id) || null;
    } catch(e) { return null; }
  },
  where(field) {
    return {
      _field: field,
      _val: null,
      equals(val) { this._val = val; return this; },
      and(fn) { this._fn = fn; return this; },
      async toArray() {
        const all = await _api('GET', `/api/versions?${this._field}=${this._val}`).catch(()=>[]);
        let filtered = all.filter(r => r[this._field] === this._val);
        if (this._fn) filtered = filtered.filter(this._fn);
        return filtered;
      },
      async first() { return (await this.toArray())[0] || null; },
      async last() { const a = await this.toArray(); return a[a.length-1]||null; },
    };
  }
};

// ── DOCUMENTS TABLE ──
const documentsTable = {
  _cache: null, _ts: 0,
  async _getAll(force) {
    if (!force && this._cache && Date.now()-this._ts < 3000) return this._cache;
    try {
      const docs = await _api('GET', '/api/documents');
      this._cache = docs.map(d => ({
        id: d.id, docNumber: d.docNumber, title: d.title,
        docType: d.docType, revision: d.revision, status: d.status,
        content: d.content, createdBy: d.createdBy, approvedBy: d.approvedBy,
        createdDate: d.createdDate, approvedDate: d.approvedDate,
        ...(d.extra||{})
      }));
      this._ts = Date.now();
      return this._cache;
    } catch(e) { return []; }
  },
  invalidate() { this._cache = null; },
  async toArray() { return this._getAll(); },
  async count() { return (await this._getAll()).length; },
  async get(id) { return (await this._getAll()).find(d=>d.id===id)||null; },
  async add(obj) {
    try {
      const r = await _api('POST', '/api/documents', {
        docNumber:obj.docNumber, title:obj.title, docType:obj.docType,
        revision:obj.revision, status:obj.status, content:obj.content||'',
        createdBy:obj.createdBy||'', approvedBy:obj.approvedBy||'',
        createdDate:obj.createdDate||'', approvedDate:obj.approvedDate||'',
        extra: obj.extra||{}
      });
      this.invalidate();
      return r.id;
    } catch(e) { return null; }
  },
  async update(id, changes) {
    try {
      const doc = await this.get(id);
      if (!doc) return 0;
      const merged = {...doc, ...changes};
      await _api('POST', '/api/documents', {
        docNumber:merged.docNumber, title:merged.title, docType:merged.docType,
        revision:merged.revision, status:merged.status, content:merged.content||'',
        createdBy:merged.createdBy||'', approvedBy:merged.approvedBy||'',
        createdDate:merged.createdDate||'', approvedDate:merged.approvedDate||'',
        extra: merged.extra||{}
      });
      this.invalidate();
      return 1;
    } catch(e) { return 0; }
  },
  where(field) {
    const self = this;
    return {
      _field: field, _val: null,
      equals(val) { this._val = val; return this; },
      async first() { return (await self._getAll()).find(d=>d[this._field]===this._val)||null; },
      async count() { return (await self._getAll()).filter(d=>d[this._field]===this._val).length; },
      async toArray() { return (await self._getAll()).filter(d=>d[this._field]===this._val); },
    };
  }
};

// ── USERS TABLE ──
const usersTable = {
  async toArray() {
    try { return await _api('GET', '/api/auth/users'); } catch(e) { return []; }
  },
  async count() { return (await this.toArray()).length; },
  async add(obj) {
    try { return await _api('POST', '/api/auth/users', obj); } catch(e) {}
  },
  where(field) {
    return {
      equals(val) { this._val = val; this._field = field; return this; },
      async first() {
        const all = await _api('GET', '/api/auth/users').catch(()=>[]);
        return all.find(u => u[this._field] === this._val) || null;
      }
    };
  }
};

// ── DIRHANDLES TABLE (local only - can't put file handles in DB) ──
const _dirHandlesStore = {};
const dirHandlesTable = {
  async get(key) { return _dirHandlesStore[key] || null; },
  async put(obj) { _dirHandlesStore[obj.key] = obj; },
  async delete(key) { delete _dirHandlesStore[key]; }
};

// ── CUSTOM DOC TYPES ──
const customDocTypesTable = makeTable('customDocTypes');

// ── WIRE UP: replace the dexie `db` object ──
// All modules that call db.tableName directly now go through our proxy
const db = {
  // Core
  users:          usersTable,
  documents:      documentsTable,
  versions:       versionsTable,
  audit:          auditTable,
  customDocTypes: customDocTypesTable,
  settings:       settingsTable,
  dirHandles:     dirHandlesTable,
  parts:          makeTable('parts'),
  // Quality
  complaints:     makeTable('complaints'),
  qualAlerts:     makeTable('qualAlerts'),
  capas:          makeTable('capas'),
  capaActions:    makeTable('capaActions'),
  // Process Quality
  qmsPfmea:       makeTable('qmsPfmea'),
  qmsCp:          makeTable('qmsCp'),
  qmsCsMaster:    makeTable('qmsCsMaster'),
  qmsCsRecords:   makeTable('qmsCsRecords'),
  // HR & Training
  hrEmployees:    makeTable('hrEmployees'),
  hrSkillDefs:    makeTable('hrSkillDefs'),
  hrCompetency:   makeTable('hrCompetency'),
  hrSkillMatrix:  makeTable('hrSkillMatrix'),
  hrTrainings:    makeTable('hrTrainings'),
  hrTrainAtt:     makeTable('hrTrainAtt'),
  hrSkillDocs:    makeTable('hrSkillDocs'),
  // Marketing
  mktEnquiries:   makeTable('mktEnquiries'),
  mktFeasibility: makeTable('mktFeasibility'),
  mktFeasQns:     makeTable('mktFeasQns'),
  // Calibration
  calGauges:      makeTable('calGauges'),
  calRecords:     makeTable('calRecords'),
  // Purchasing
  purVendors:     makeTable('purVendors'),
  purVendorLots:  makeTable('purVendorLots'),
  // version() is a no-op — schema managed by server
  version() { return { stores() {} }; },
};

// Keep DB object interface same as before (used by render functions)
const DB = {
  async seed() { /* handled by server */ },
  getUser: u => db.users.where('username').equals(u).first(),
  getUsers: () => db.users.toArray(),
  addUser: u => db.users.add(u),
  async nextNum(type) {
    const count = await db.documents.where('docType').equals(type).count();
    return `VRA-${type}-${String(count+1).padStart(3,'0')}`;
  },
  createDoc: d => db.documents.add(d),
  getDoc: id => db.documents.get(id),
  updateDoc: (id,d) => db.documents.update(id,d),
  listDocs: async (f={}) => {
    let docs = await db.documents.toArray();
    return docs.filter(d =>
      (!f.type||d.docType===f.type) &&
      (!f.status||d.status===f.status) &&
      (!f.q||d.title?.toLowerCase().includes(f.q.toLowerCase())||
             d.docNumber?.toLowerCase().includes(f.q.toLowerCase()))
    ).sort((a,b)=>b.id-a.id);
  },
  createVer: v => db.versions.add(v),
  getVer: (docId,rev) => db.versions.where('docId').equals(docId).and(v=>v.revision===rev).last(),
  getAllVers: docId => db.versions.where('docId').equals(docId).toArray(),
  updateVer: (id,d) => db.versions.update(id,d),
  log: e => db.audit.add({...e, timestamp:new Date().toISOString()}),
  getAudit: async docId => {
    const logs = await db.audit.toArray();
    if (docId) return logs.filter(l=>l.docId===docId).slice(0,30);
    return logs.slice(0,300);
  },
  getCustomTypes: () => db.customDocTypes.toArray().catch(()=>[]),
  addCustomType: async t => {
    const existing = await db.customDocTypes.toArray().catch(()=>[]);
    const withId = {...t, id: Date.now()};
    return db.customDocTypes.add(withId);
  },
  deleteCustomType: id => db.customDocTypes.delete(id),
  getSetting: async key => { const r=await db.settings.get(key).catch(()=>null); return r?.value; },
  setSetting: (key,value) => db.settings.put({key,value}),
  getDirHandle: key => db.dirHandles.get(key).catch(()=>null),
  setDirHandle: (key,handle,name) => db.dirHandles.put({key,handle,name}).catch(()=>{}),
  clearDirHandle: key => db.dirHandles.delete(key).catch(()=>{}),
  getParts: () => db.parts.toArray().catch(()=>[]),
  addPart: p => db.parts.add(p),
  getPart: id => db.parts.get(id).catch(()=>null),
  getComplaints: () => db.complaints.toArray().catch(()=>[]),
  getComplaint: id => db.complaints.get(id).catch(()=>null),
  addComplaint: c => db.complaints.add(c),
  updateComplaint: (id,c) => db.complaints.update(id,c),
  getAlert: id => db.qualAlerts.get(id).catch(()=>null),
  getAlertByComplaint: cId => db.qualAlerts.where('complaintId').equals(cId).first().catch(()=>null),
  addAlert: a => db.qualAlerts.add(a),
  updateAlert: (id,a) => db.qualAlerts.update(id,a),
  getCapa: id => db.capas.get(id).catch(()=>null),
  getCapaByAlert: aId => db.capas.where('alertId').equals(aId).first().catch(()=>null),
  addCapa: c => db.capas.add(c),
  updateCapa: (id,c) => db.capas.update(id,c),
  getCapaActions: capaId => db.capaActions.where('capaId').equals(capaId).toArray().catch(()=>[]),
  addCapaAction: a => db.capaActions.add(a),
  updateCapaAction: (id,a) => db.capaActions.update(id,a),
  deleteCapaAction: id => db.capaActions.delete(id).catch(()=>{}),
};

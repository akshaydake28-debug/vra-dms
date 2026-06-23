// VRA DMS — BACKUP & RESTORE MODULE

async function renderBackup() {
  const lastBackup = localStorage.getItem('vra_last_backup') || 'Never';
  let counts = {};
  try {
    const data = await fetch(window.location.origin + '/api/backup').then(r => r.json());
    counts = {
      documents: data.documents?.length || 0,
      versions: data.versions?.length || 0,
    };
    // Count generic modules
    const skip = new Set(['exportedAt','exportedBy','appVersion','company','documents','versions','audit','users','rm_lots','settings']);
    let total = 0;
    for (const [k, v] of Object.entries(data)) {
      if (!skip.has(k) && Array.isArray(v)) total += v.length;
    }
    counts.total = total;
  } catch(e) { counts = {documents: 0, versions: 0, total: 0}; }

  let _importData = null;

  setC(`
  <div class="ph"><h2>💾 Backup & Restore</h2></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card">
      <div class="ch"><h5>📤 Manual Backup</h5></div>
      <div class="cb">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:12px">
          <div style="font-size:13px;font-weight:600;color:#15803d;margin-bottom:6px">Current database contents:</div>
          <div style="font-size:12px;color:#166534">${counts.documents} documents · ${counts.versions} versions · ${counts.total} other records</div>
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:12px">Last backup: <strong>${lastBackup}</strong></div>
        <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:10px;font-size:12px;margin-bottom:12px">
          💡 Always take a manual backup before updating the software.
        </div>
        <button class="btn btn-p" style="width:100%;padding:9px" onclick="doExport()">⬇️ Download Full Backup (.json)</button>
      </div>
    </div>
    <div class="card">
      <div class="ch"><h5>📥 Import & Restore</h5></div>
      <div class="cb">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px;font-size:12px;margin-bottom:12px">
          <strong>Note:</strong> Restore clears existing data and replaces with backup contents.
        </div>
        <div id="drop-zone" style="border:2px dashed #d1d5db;border-radius:8px;padding:32px;text-align:center;cursor:pointer;margin-bottom:12px;transition:all .15s"
          onclick="document.getElementById('import-file').click()"
          ondragover="event.preventDefault();this.style.borderColor='#0d2f6e'"
          ondragleave="this.style.borderColor='#d1d5db'"
          ondrop="event.preventDefault();this.style.borderColor='#d1d5db';handleImportFile(event.dataTransfer.files[0])">
          <div style="font-size:28px;margin-bottom:8px">📁</div>
          <div style="font-size:13px;font-weight:600;color:#374151">Click or drag backup file here</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:4px">.json backup file</div>
        </div>
        <input type="file" id="import-file" accept=".json" style="display:none" onchange="handleImportFile(this.files[0])">
        <div id="import-info" style="display:none;font-size:12px;color:#374151;margin-bottom:8px"></div>
        <button class="btn btn-g" id="import-btn" style="width:100%;display:none" onclick="doImport()">📥 Restore All Data</button>
      </div>
    </div>
  </div>`);

  // Attach import handler
  window._importData = null;
  window.handleImportFile = function(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        window._importData = JSON.parse(e.target.result);
        const info = document.getElementById('import-info');
        const btn = document.getElementById('import-btn');
        if (info) { info.textContent = `✓ File loaded: ${file.name} (${(file.size/1024).toFixed(0)} KB)`; info.style.display = 'block'; }
        if (btn) btn.style.display = 'block';
      } catch(err) { toast('Invalid backup file','d'); }
    };
    reader.readAsText(file);
  };
}

async function doExport() {
  toast('Preparing backup...','s');
  try {
    const data = await fetch(window.location.origin + '/api/backup').then(r => r.json());
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `VRA_DMS_Backup_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem('vra_last_backup', d.toLocaleString('en-IN'));
    toast('✅ Full backup downloaded!','s');
    renderBackup();
  } catch(e) { toast('Backup failed: ' + e.message,'d'); }
}

async function doImport() {
  if (!window._importData) { toast('No file selected','d'); return; }
  toast('Restoring data — please wait...','s');
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', window.location.origin + '/api/restore', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status === 200) {
        const r = JSON.parse(xhr.responseText);
        window._importData = null;
        toast('✅ Restore complete — ' + JSON.stringify(r), 's');
        renderBackup();
      } else {
        toast('Restore failed: ' + xhr.status, 'd');
      }
    };
    xhr.onerror = () => toast('Restore failed — network error','d');
    xhr.send(JSON.stringify(window._importData));
  } catch(e) { toast('Restore failed: ' + e.message,'d'); }
}

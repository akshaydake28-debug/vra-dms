// VRA DMS — USERS MODULE v2.0
// Full user management with password visibility and reset for admin
// Password change for all users

async function renderUsers() {
  const users = await fetch(window.location.origin + '/api/auth/users/all')
    .then(r => r.json()).catch(() => []);
  const isApprover = Auth.user?.role === 'APPROVER';

  setC(`
  <div class="ph"><h2>👥 User Management</h2></div>

  <!-- CHANGE OWN PASSWORD — visible to all users -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><h5>🔑 Change My Password</h5></div>
    <div class="cb" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
      <div class="fg"><label class="lbl">Current Password</label>
        <input class="fc" id="cp-old" type="password" placeholder="Current password"></div>
      <div class="fg"><label class="lbl">New Password</label>
        <input class="fc" id="cp-new" type="password" placeholder="Min 6 characters"></div>
      <div class="fg"><label class="lbl">Confirm Password</label>
        <input class="fc" id="cp-confirm" type="password" placeholder="Confirm new password"></div>
      <button class="btn btn-p" onclick="changeMyPassword()">Update</button>
    </div>
    <div id="cp-msg" style="margin-top:8px;font-size:12px;display:none"></div>
  </div>

  ${isApprover ? `
  <!-- ADMIN: ALL USERS TABLE -->
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;align-items:start">
    <div class="card">
      <div class="ch"><h5>All Users</h5></div>
      <div class="tw"><table>
        <thead><tr>
          <th>Name</th><th>Username</th><th>Password</th>
          <th>Role</th><th>Reset Password</th><th>Remove</th>
        </tr></thead>
        <tbody>${users.map(u => `<tr>
          <td>
            <div style="display:flex;align-items:center;gap:7px">
              <div style="width:28px;height:28px;border-radius:50%;background:#0d2f6e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">
                ${u.name[0]}
              </div>
              <span style="font-weight:600">${esc(u.name)}</span>
            </div>
          </td>
          <td class="mono" style="color:#0d2f6e;font-weight:600">${esc(u.username)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:5px">
              <span id="pw-${u.id}" style="font-family:monospace;font-size:12px;background:#f3f4f6;padding:2px 8px;border-radius:4px">
                ••••••••
              </span>
              <button class="btn btn-o btn-xs" onclick="togglePw(${u.id},'${u.password}')">👁</button>
            </div>
          </td>
          <td>${u.role === 'APPROVER'
            ? '<span class="badge ba">APPROVER</span>'
            : '<span class="badge bd">CREATOR</span>'}</td>
          <td>
            <div style="display:flex;gap:4px;align-items:center">
              <input id="rp-${u.id}" type="text" placeholder="New password"
                style="height:28px;border:1px solid #e5e7eb;border-radius:5px;padding:0 8px;font-size:12px;width:110px">
              <button class="btn btn-o btn-xs" onclick="adminResetPw(${u.id})">Reset</button>
            </div>
          </td>
          <td>
            ${u.username !== Auth.user.username
              ? `<button class="btn btn-r btn-sm" onclick="deleteUser(${u.id},'${esc(u.name)}')">✕ Remove</button>`
              : '<span class="muted" style="font-size:11px">You</span>'}
          </td>
        </tr>`).join('')}
        </tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="ch"><h5>➕ Add New User</h5></div>
      <div class="cb">
        <div class="fg"><label class="lbl">Full Name</label>
          <input class="fc" id="nu-n" placeholder="e.g. Ravi Kumar"></div>
        <div class="fg"><label class="lbl">Username</label>
          <input class="fc" id="nu-u" placeholder="e.g. ravi_k (no spaces)"></div>
        <div class="fg"><label class="lbl">Initial Password</label>
          <input class="fc" id="nu-p" type="text" placeholder="Set initial password"></div>
        <div class="fg"><label class="lbl">Department / Role</label>
          <select class="fc" id="nu-r">
            <option value="CREATOR">Production / Quality (Creator)</option>
            <option value="APPROVER">Management (Approver)</option>
          </select></div>
        <button class="btn btn-p" style="width:100%;margin-top:4px" onclick="addUser()">➕ Add User</button>
      </div>
    </div>
  </div>
  <div id="wa-card" style="margin-top:14px"></div>
  ` : `
  <div class="card">
    <div style="padding:20px;text-align:center;color:#6b7280;font-size:13px">
      Contact Akshay Dake to manage other user accounts.
    </div>
  </div>`}
  `);
  if (isApprover) renderWhatsApp();
}

// ── WhatsApp access (admin) ─────────────────────────
// Numbers allowed to use the WhatsApp agent. "Can record entries" lets the
// number save production / fettling / dispatch; without it, questions and
// documents only. Any registered number can ask anything the assistant reads.
async function renderWhatsApp() {
  const box = document.getElementById('wa-card'); if (!box) return;
  const get = p => fetch(window.location.origin + p).then(r => r.ok ? r.json() : null).catch(() => null);
  const [st, contacts, acc] = await Promise.all([get('/api/whatsapp/status'), get('/api/whatsapp/contacts'), get('/api/whatsapp/access')]);
  const list = contacts || [];
  const state = !st ? '<span class="badge bd">unknown</span>'
    : st.enabled ? '<span class="badge ba">ON</span>'
    : `<span class="badge bd">OFF</span> <span style="font-size:11px;color:#6b7280">${st.missing?.length
        ? 'Missing in Railway → Variables: ' + esc(st.missing.join(', ')) : 'Set WHATSAPP_ENABLED=1 in Railway to switch on'}</span>`;
  box.innerHTML = `<div class="card">
    <div class="ch"><h5>💬 WhatsApp Agent — allowed numbers</h5><div>${state}</div></div>
    <div class="cb" style="font-size:12px;color:#374151;padding-bottom:0">
      Floor staff can send production, fettling and dispatch entries, ask questions and get approved documents on WhatsApp.
      Every entry is shown back to them and saved only after they reply YES.
      ${st ? `Webhook URL for Meta: <code style="background:#f3f4f6;padding:1px 6px;border-radius:4px">${esc(st.webhookUrl)}</code>` : ''}
    </div>
    <div class="tw"><table>
      <thead><tr><th>Name</th><th>WhatsApp number</th><th>Can record entries</th><th>Active</th><th></th></tr></thead>
      <tbody>${list.map(c => `<tr>
        <td style="font-weight:600">${esc(c.name)}</td>
        <td class="mono">+${esc(c.phone)}</td>
        <td><input type="checkbox" ${c.canEnter ? 'checked' : ''} onchange="waSaveContact(${c.id},{canEnter:this.checked})"></td>
        <td><input type="checkbox" ${c.active !== false ? 'checked' : ''} onchange="waSaveContact(${c.id},{active:this.checked})"></td>
        <td><button class="btn btn-r btn-xs" onclick="waDeleteContact(${c.id})">✕ Remove</button></td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#6b7280">No numbers yet — add one below.</td></tr>'}</tbody>
    </table></div>
    <div class="cb" style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;align-items:end">
      <div class="fg" style="margin:0"><label class="lbl">Name (saved as "entered by")</label><input class="fc" id="wa-n" placeholder="e.g. Ramesh (Shift Supervisor)"></div>
      <div class="fg" style="margin:0"><label class="lbl">WhatsApp number with country code</label><input class="fc" id="wa-p" placeholder="91 98765 43210"></div>
      <label style="font-size:12px;display:flex;gap:5px;align-items:center;height:34px"><input type="checkbox" id="wa-e" checked> Can record entries</label>
      <button class="btn btn-p" onclick="waAddContact()">➕ Add</button>
    </div>
    ${acc ? `<div class="cb" style="border-top:1px solid #e5e7eb">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">What can be seen on WhatsApp</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Applies to every number. Unticked areas are never read or shown on WhatsApp — they stay visible in the software as usual.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px 16px">
        ${acc.groups.map(g => `<label style="font-size:12px;display:flex;gap:6px;align-items:flex-start">
          <input type="checkbox" ${acc.access[g.key] ? 'checked' : ''} onchange="waSaveAccess('${g.key}',this.checked)"> ${esc(g.label)}</label>`).join('')}
      </div></div>` : ''}
    </div>`;
  window._waContacts = list;
}

async function waSaveAccess(key, on) {
  const r = await fetch(window.location.origin + '/api/whatsapp/access', {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({access: {[key]: on}})}).catch(() => null);
  toast(r && r.ok ? 'Saved' : 'Save failed', r && r.ok ? 's' : 'd');
  if (!r || !r.ok) renderWhatsApp();
}

async function waPost(body) {
  const r = await fetch(window.location.origin + '/api/whatsapp/contacts', {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) { toast(d.error || 'Save failed', 'd'); return false; }
  return true;
}

async function waAddContact() {
  const name = document.getElementById('wa-n')?.value.trim(), phone = document.getElementById('wa-p')?.value.trim();
  if (!name || !phone) { toast('Name and number are required', 'd'); return; }
  if (await waPost({name, phone, canEnter: document.getElementById('wa-e')?.checked})) { toast('Number added', 's'); renderWhatsApp(); }
}

async function waSaveContact(id, changes) {
  const c = (window._waContacts || []).find(x => x.id === id); if (!c) return;
  if (await waPost({...c, ...changes})) toast('Saved', 's');
  renderWhatsApp();
}

async function waDeleteContact(id) {
  const c = (window._waContacts || []).find(x => x.id === id);
  if (!c || !confirm(`Remove WhatsApp access for ${c.name} (+${c.phone})?`)) return;
  await fetch(window.location.origin + `/api/whatsapp/contacts/${id}`, {method: 'DELETE'}).catch(() => null);
  toast('Removed', 's'); renderWhatsApp();
}

function togglePw(id, pw) {
  const el = document.getElementById('pw-' + id);
  if (!el) return;
  if (el.textContent.trim() === '••••••••') {
    el.textContent = pw;
    el.style.background = '#fef9c3';
  } else {
    el.textContent = '••••••••';
    el.style.background = '#f3f4f6';
  }
}

async function adminResetPw(id) {
  const inp = document.getElementById('rp-' + id);
  const newPw = inp?.value?.trim();
  if (!newPw) { toast('Enter a new password first', 'd'); return; }
  if (newPw.length < 6) { toast('Minimum 6 characters', 'd'); return; }
  try {
    await fetch(window.location.origin + '/api/auth/users/' + id + '/reset', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({newPassword: newPw})
    });
    toast('Password reset successfully', 's');
    inp.value = '';
    renderUsers();
  } catch(e) { toast('Reset failed', 'd'); }
}

async function addUser() {
  const n = document.getElementById('nu-n')?.value.trim();
  const u = document.getElementById('nu-u')?.value.trim().toLowerCase().replace(/\s+/g, '_');
  const p = document.getElementById('nu-p')?.value;
  const r = document.getElementById('nu-r')?.value;
  if (!n || !u || !p) { toast('All fields required', 'd'); return; }
  if (p.length < 6) { toast('Password must be at least 6 characters', 'd'); return; }
  const existing = await DB.getUser(u);
  if (existing) { toast('Username already exists — choose another', 'd'); return; }
  await DB.addUser({username: u, password: p, role: r, name: n});
  toast(`User ${n} added successfully!`, 's');
  renderUsers();
}

async function changeMyPassword() {
  const oldP = document.getElementById('cp-old')?.value;
  const newP = document.getElementById('cp-new')?.value;
  const confirmP = document.getElementById('cp-confirm')?.value;
  const msg = document.getElementById('cp-msg');

  const show = (text, color) => {
    if (msg) { msg.textContent = text; msg.style.color = color; msg.style.display = 'block'; }
  };

  if (!oldP || !newP || !confirmP) { show('⚠ All fields required.', '#dc2626'); return; }
  if (newP !== confirmP) { show('⚠ Passwords do not match.', '#dc2626'); return; }
  if (newP.length < 6) { show('⚠ Minimum 6 characters.', '#dc2626'); return; }

  try {
    const verify = await fetch(window.location.origin + '/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: Auth.user.username, password: oldP})
    });
    if (!verify.ok) { show('⚠ Current password is incorrect.', '#dc2626'); return; }

    const res = await fetch(window.location.origin + '/api/auth/password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: Auth.user.username, newPassword: newP})
    });
    if (!res.ok) throw new Error('Server error');

    show('✓ Password updated successfully.', '#15803d');
    ['cp-old', 'cp-new', 'cp-confirm'].forEach(id => {
      const e = document.getElementById(id); if (e) e.value = '';
    });
  } catch(e) {
    show('⚠ Failed to update password. Try again.', '#dc2626');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Remove user ${name}? This cannot be undone.`)) return;
  try {
    await fetch(window.location.origin + `/api/auth/users/${id}`, {method: 'DELETE'});
    toast(`User ${name} removed.`, 's');
    renderUsers();
  } catch(e) { toast('Failed to remove user', 'd'); }
}

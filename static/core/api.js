// VRA DMS — Core API
// All API calls go through here

const API_BASE = window.location.origin;

async function _apiCall(method, path, body) {
  try {
    const opts = { method, headers: {'Content-Type':'application/json'} };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch(e) { throw e; }
}

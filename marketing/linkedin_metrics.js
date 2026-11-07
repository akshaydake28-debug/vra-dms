#!/usr/bin/env node
// ══════════════════════════════════════════════════════
//  LinkedIn fact sheet — month vs previous month, straight from a
//  VRA DMS JSON backup (the daily export on the "backups" branch).
//
//  Production KPIs reuse the calculation code in
//  static/modules/production.js, so every number here matches what the
//  team sees on the Production dashboard.
//
//  Usage (from the repo root):
//    git fetch origin backups
//    git show origin/backups:backups/VRA_DMS_Backup_YYYY-MM-DD.json > /tmp/vra.json
//    node marketing/linkedin_metrics.js /tmp/vra.json [YYYY-MM]
//  The month defaults to the last complete month.
// ══════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const [, , dataPath, monthArg] = process.argv;
if (!dataPath) { console.error('Usage: node marketing/linkedin_metrics.js <backup.json> [YYYY-MM]'); process.exit(1); }

// ── load the production module's pure calculation section ──
const prodSrc = fs.readFileSync(path.join(__dirname, '..', 'static', 'modules', 'production.js'), 'utf8');
const calcEnd = prodSrc.indexOf('// Load all shift entries in a range');
if (calcEnd < 0) throw new Error('production.js layout changed — update the marker in linkedin_metrics.js');
const P = new Function(prodSrc.slice(0, calcEnd) + ';return {prodCalc, prodAgg, PROD_CFG_DEFAULT};')();

const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const arr = k => Array.isArray(d[k]) ? d[k] : [];
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const ym = s => String(s || '').slice(0, 7);
const prevMonth = m => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 2, 1)); return t.toISOString().slice(0, 7); };
const exported = String(d.exportedAt || new Date().toISOString()).slice(0, 10);
const month = monthArg || prevMonth(exported.slice(0, 7));
const prev = prevMonth(month);
const pct = (x, dp = 1) => isFinite(x) ? (x * 100).toFixed(dp) + '%' : '—';
const int = x => Math.round(x).toLocaleString('en-IN');
const delta = (a, b, dp = 1) => {
  if (!isFinite(a) || !isFinite(b)) return '';
  const s = ((a - b) * 100).toFixed(dp);
  return Number(s) === 0 ? 'no change' : `${Number(s) > 0 ? '+' : ''}${s} pts`;
};

const out = [];
const h = t => out.push('', `## ${t}`);
const row = (label, cur, prv, note = '') => out.push(`- ${label}: **${cur}** (prev ${prv})${note ? ' — ' + note : ''}`);

out.push(`# VR Alucast — LinkedIn fact sheet: ${month} vs ${prev}`, `_Source: VRA DMS backup exported ${exported}_`);

// ── Production ──
const settingCfg = d.settings && typeof d.settings.prodConfig === 'object' ? d.settings.prodConfig : {};
const cfg = { ...P.PROD_CFG_DEFAULT, ...settingCfg };
const ctx = {
  cfg,
  machineById: Object.fromEntries(arr('prodMachines').map(m => [m.id, m])),
  partById: Object.fromEntries(arr('prodParts').map(p => [p.id, p])),
};
const calcs = arr('prodShifts').map(s => ({ s, c: P.prodCalc(s, ctx) }));
// Shifts with shots on a part that had no target cycle time can't give a
// real Performance figure (it reads as 0), so leave them out of OEE trends.
const fair = x => !x.c.t.shotsNoCT;
const agg = (m, filt = () => true) => {
  const cs = calcs.filter(x => ym(x.s.date) === m && filt(x)).map(x => x.c);
  return cs.length ? { ...P.prodAgg(cs), n: cs.length } : null;
};
h('Production (HPDC)');
const cur = agg(month, fair), pre = agg(prev, fair);
const skipped = calcs.filter(x => ym(x.s.date) === month && !fair(x)).length;
if (cur) {
  const c = cur.t, p = pre ? pre.t : {};
  row('OEE', pct(c.oee), pct(p.oee), `${delta(c.oee, p.oee)}; target ${cfg.targetOeePct}%`);
  row('Availability', pct(c.A), pct(p.A), delta(c.A, p.A));
  row('Performance', pct(c.P), pct(p.P), delta(c.P, p.P));
  row('Quality (OK / cast)', pct(c.Q), pct(p.Q), delta(c.Q, p.Q));
  // Volumes count every shift (output is real even where OEE can't be scored)
  const vc = agg(month).t, vp = (agg(prev) || { t: {} }).t;
  row('OK castings (all shifts)', int(vc.okPcs), int(vp.okPcs || 0));
  row('Metal cast, kg (all shifts)', int(vc.netKg), int(vp.netKg || 0));
  row('Downtime (min)', int(c.downtime), int(p.downtime || 0));
  const top = Object.entries(cur.byDown).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${int(v)} min`).join(', ');
  out.push(`- Biggest downtime: ${top || 'none'}`);
  if (skipped) out.push(`- ⚠ ${skipped} shift(s) left out: a part had no target cycle time in Part Master.`);
  const weeks = {};
  for (const x of calcs.filter(x => ym(x.s.date) === month && fair(x))) {
    const t = new Date(x.s.date + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7);
    (weeks[t.toISOString().slice(0, 10)] = weeks[t.toISOString().slice(0, 10)] || []).push(x.c);
  }
  const best = Object.entries(weeks).map(([w, cs]) => [w, P.prodAgg(cs).t.oee]).sort((a, b) => b[1] - a[1])[0];
  if (best) out.push(`- Best week (starting ${best[0]}): OEE ${pct(best[1])}`);
} else out.push('- No production entries this month.');

// Fettling
const fet = m => {
  const rows = arr('prodFettling').filter(e => ym(e.date) === m).flatMap(e => e.rows || []);
  const qty = rows.reduce((s, r) => s + num(r.qty), 0), rej = rows.reduce((s, r) => s + Math.min(num(r.rej), num(r.qty)), 0);
  return { qty, rej, rp: qty ? rej / qty : NaN, people: new Set(rows.map(r => r.person)).size };
};
const fc = fet(month), fp = fet(prev);
row('Fettled parts', int(fc.qty), int(fp.qty), `rejection ${pct(fc.rp, 2)} (prev ${pct(fp.rp, 2)}), ${fc.people} people tracked`);
const disp = m => arr('prodDispatch').filter(x => ym(x.date) === m);
row('Dispatched pcs', int(disp(month).reduce((s, x) => s + num(x.qty), 0)), int(disp(prev).reduce((s, x) => s + num(x.qty), 0)),
  `${new Set(disp(month).map(x => x.customer)).size} customers`);

// ── Quality system ──
h('Quality system');
const capas = arr('capas');
const days = c => (new Date(c.closedAt.slice(0, 10)) - new Date(String(c.createdAt).slice(0, 10))) / 864e5;
const closedIn = m => capas.filter(c => c.closedAt && ym(c.closedAt) === m);
const avgDays = cs => cs.length ? (cs.reduce((s, c) => s + days(c), 0) / cs.length).toFixed(0) : '—';
row('CAPAs closed', closedIn(month).length, closedIn(prev).length, `avg ${avgDays(closedIn(month))} days to close (prev ${avgDays(closedIn(prev))})`);
row('Complaints logged', arr('complaints').filter(c => ym(c.date) === month).length, arr('complaints').filter(c => ym(c.date) === prev).length);
out.push(`- Open CAPAs now: ${capas.filter(c => c.status !== 'CLOSED').length}`);
const today = exported;
const last = {};
for (const r of arr('calRecords')) if (!last[r.gaugeId] || r.calibDate > last[r.gaugeId].calibDate) last[r.gaugeId] = r;
const gauges = arr('calGauges').filter(g => g.status !== 'Inactive');
out.push(`- Gauges: ${gauges.length} active, ${gauges.filter(g => last[g.id] && last[g.id].nextDue >= today).length} in calibration, ${gauges.filter(g => !last[g.id] || last[g.id].nextDue < today).length} overdue/never calibrated`);
out.push(`- Engineering: ${arr('pq_pfmea_rows').length} PFMEA risk lines, ${arr('pq_cp_rows').length} control-plan characteristics, ${arr('pq_parts').length} parts`);
out.push(`- Controlled documents: ${arr('documents').filter(x => x.status === 'ACTIVE').length} active, ${arr('versions').length} revisions on record`);
const fb = arr('custFeedback').filter(f => f.status === 'SUBMITTED');
const periods = [...new Set(fb.map(f => f.reviewPeriod))].sort();
const lastP = periods[periods.length - 1];
if (lastP) {
  const set = fb.filter(f => f.reviewPeriod === lastP);
  const avg = k => (set.reduce((s, f) => s + num((f.ratings || {})[k]), 0) / set.length).toFixed(1);
  out.push(`- Customer feedback ${lastP} (${set.length} responses — check for group companies): overall ${avg('overall')}, quality ${avg('quality')}, delivery ${avg('delivery')}, communication ${avg('communication')}, pricing ${avg('pricing')} /10`);
}

// ── Supply chain ──
h('Supply chain');
const vl = m => arr('purVendorLots').filter(r => ym(r.date) === m);
const onTime = rs => rs.length ? rs.filter(r => r.timing !== 'After5').length / rs.length : NaN;
const rejRate = rs => { const rc = rs.reduce((s, r) => s + num(r.qtyReceived), 0); return rc ? rs.reduce((s, r) => s + num(r.qtyRejected), 0) / rc : NaN; };
row('Supplier lots received', vl(month).length, vl(prev).length, `on time (≤5 days) ${pct(onTime(vl(month)), 0)} (prev ${pct(onTime(vl(prev)), 0)}), rejection ${pct(rejRate(vl(month)), 2)}`);
const rm = m => arr('rm_lots').filter(r => ym(r.date) === m);
row('Raw-material lots', rm(month).length, rm(prev).length,
  `${int(rm(month).reduce((s, r) => s + num(r.weightKg), 0))} kg; spectro done on ${rm(month).filter(r => r.spectro === 'Done').length}, not required on ${rm(month).filter(r => r.spectro === 'Not Required').length}`);

// ── People ──
h('People & skills');
const emp = arr('hrEmployees').filter(e => e.status === 'Active');
const sm = arr('hrSkillMatrix');
out.push(`- Active team: ${emp.length}; skills defined: ${arr('hrSkillDefs').length}`);
row('Skill assessments updated', sm.filter(s => ym(s.updatedAt) === month).length, sm.filter(s => ym(s.updatedAt) === prev).length);
const tr = m => arr('hrTrainings').filter(t => ym(t.date) === m);
row('Trainings held', tr(month).length, tr(prev).length, `${tr(month).reduce((s, t) => s + (t.attendeeIds || []).length, 0)} attendances`);

// ── Sales pipeline ──
h('Sales pipeline');
const enq = m => arr('mktEnquiries').filter(e => ym(e.date) === m);
row('New enquiries', enq(month).length, enq(prev).length, `${new Set(enq(month).map(e => String(e.customerName).trim().toUpperCase())).size} customers`);
row('Feasibility studies', arr('mktFeasibility').filter(f => ym(f.date) === month).length, arr('mktFeasibility').filter(f => ym(f.date) === prev).length);

console.log(out.join('\n'));

"""VRA DMS — AI assistant (Gemini with read-only lookup tools).

Gemini never sees raw tables or does arithmetic itself: it picks one of the
lookup functions below, the app computes the figures (production maths is a
port of static/modules/production.js — keep the two in sync), and Gemini
only phrases the answer.

Besides the calculated production / quality tools, generic tools let it read
any data area in the software (search, filter, count, read documents), so
questions about HR, marketing, purchasing, calibration, PFMEA etc. work too.
Secrets (passwords, tokens, keys) and images are always stripped.

`answer(messages, load)` is the entry point. `load(module)` returns the list
of records for a GenericRecord module (dicts incl. 'id'). Pseudo-modules:
'_modules' ([{module, count}]), '_rm_lots', '_documents', '_audit', '_users'.
"""
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'
DEFAULT_MODEL = 'gemini-flash-latest'   # Google's alias for the current Flash model
_picked_model = {}                      # key -> model found via ListModels after a 404
MAX_TOOL_ROUNDS = 6

# ══════════════════════════════════════════════════════
#  PRODUCTION CALCULATIONS  (mirror of production.js)
# ══════════════════════════════════════════════════════
SLOTS = 12
SHIFT_START = {'A': 8, 'B': 20}
SUM_KEYS = ['planned', 'downtime', 'runtime', 'shots', 'off', 'offPcs', 'rejPcs', 'castPcs', 'okPcs',
            'idealMin', 'qualLossMin', 'netKg', 'lossKg', 'totalKg', 'shotsNoCT', 'shotsNoWt']
CFG_DEFAULT = {'meltLossPct': 6, 'consumptionBasis': 'all', 'plannedMinutes': 720,
               'workDays': 26, 'shiftsPerDay': 2, 'hoursPerShift': 12, 'targetOeePct': 75}


def num(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else 0.0
    except (TypeError, ValueError):
        return 0.0


def _key(v):
    return str(v) if v is not None else ''


def ct_of(part, machine_id):
    return num(((part or {}).get('cycleTimes') or {}).get(_key(machine_id)))


def run_ranges(runs):
    srt = sorted([dict(r, _i=i) for i, r in enumerate(runs or [])], key=lambda r: num(r.get('fromSlot')))
    out = []
    for k, r in enumerate(srt):
        nxt = num(srt[k + 1].get('fromSlot')) if k < len(srt) - 1 else SLOTS
        out.append(dict(r, _from=0 if k == 0 else int(num(r.get('fromSlot'))), _to=int(nxt) - 1))
    return out


def hours_of(sheet):
    hrs = sheet.get('hours')
    if isinstance(hrs, list):
        return [(hrs[i] if i < len(hrs) and isinstance(hrs[i], dict) else {}) for i in range(SLOTS)]
    hourly = sheet.get('hourly') or []
    return [{'total': hourly[i] if i < len(hourly) else ''} for i in range(SLOTS)]


def ratios(t):
    t = dict(t)
    t['A'] = t['runtime'] / t['planned'] if t['planned'] else 0
    t['pRaw'] = t['idealMin'] / t['runtime'] if t['runtime'] > 0 else 0
    t['P'] = min(1, t['pRaw'])
    t['Q'] = t['okPcs'] / t['castPcs'] if t['castPcs'] else 0
    t['oee'] = t['A'] * t['P'] * t['Q']
    t['rejPct'] = (t['offPcs'] + t['rejPcs']) / t['castPcs'] if t['castPcs'] else 0
    good = t['castPcs'] - t['offPcs']
    t['ppm'] = t['rejPcs'] / good * 1e6 if good > 0 else 0
    t['actCT'] = t['runtime'] * 60 / t['shots'] if t['shots'] else None
    shots_ct = t['shots'] - t['shotsNoCT']
    t['tgtCT'] = t['idealMin'] * 60 / shots_ct if shots_ct > 0 else None
    t['perfLossMin'] = max(0, t['runtime'] - t['idealMin'])
    return t


def calc_shift(sheet, ctx):
    cfg = ctx['cfg']
    loss = num(cfg['meltLossPct']) / 100
    basis_ok = cfg['consumptionBasis'] == 'ok'
    planned = num(sheet.get('plannedMinutes')) or num(cfg['plannedMinutes']) or 720
    downs = [d for d in (sheet.get('downtime') or []) if num(d.get('minutes')) > 0]
    downtime = min(planned, sum(num(d.get('minutes')) for d in downs))

    hrs = []
    for h in hours_of(sheet):
        total = num(h.get('total'))
        off = min(total, num(h.get('off')))
        rej = {c: num(v) for c, v in (h.get('rej') or {}).items() if num(v) > 0}
        rej_s = sum(rej.values())
        hrs.append({'total': total, 'off': off, 'rej': rej, 'rejS': rej_s,
                    'ok': max(0, total - off - rej_s), 'cav': h.get('cav')})

    runs = []
    for r in run_ranges(sheet.get('runs')):
        part = ctx['parts'].get(_key(r.get('partId')))
        cav = num(r.get('cavities')) or num((part or {}).get('cavities')) or 1
        legacy_off = num(r.get('offShots'))
        shots, off, rej_s, cast, off_pcs, rej_pcs, rej = 0, legacy_off, 0, 0, legacy_off * cav, 0, {}
        for s in range(r['_from'], r['_to'] + 1):
            h = hrs[s]
            hc = num(h['cav']) or cav
            shots += h['total']; off += h['off']; rej_s += h['rejS']
            cast += h['total'] * hc; off_pcs += h['off'] * hc
            for c, n in h['rej'].items():
                rej[c] = rej.get(c, 0) + n * hc; rej_pcs += n * hc
        for c, v in (r.get('rej') or {}).items():          # first-version entries: pcs on the run
            n = num(v)
            if n > 0:
                rej[c] = rej.get(c, 0) + n; rej_s += n / cav; rej_pcs += n
        off = min(shots, off); off_pcs = min(cast, off_pcs)
        ok_pcs = max(0, cast - off_pcs - rej_pcs)
        ct = ct_of(part, sheet.get('machineId'))
        wt = num((part or {}).get('netWeightKg'))
        net_kg = (ok_pcs if basis_ok else cast) * wt
        runs.append({'part': part, 'partId': r.get('partId'),
                     'grade': r.get('grade') or (part or {}).get('grade') or '—',
                     'cav': cav, 'shots': shots, 'off': off, 'offPcs': off_pcs, 'rej': rej, 'rejPcs': rej_pcs,
                     'castPcs': cast, 'okPcs': ok_pcs, 'okShots': max(0, shots - off - rej_s), 'ct': ct, 'wt': wt,
                     'idealMin': shots * ct / 60 if ct else 0,
                     'qualLossMin': (off + rej_s) * ct / 60 if ct else 0,
                     'shotsNoCT': 0 if ct else shots, 'shotsNoWt': 0 if wt else shots,
                     'netKg': net_kg, 'lossKg': net_kg * loss, 'totalKg': net_kg * (1 + loss)})

    t = {'planned': planned, 'downtime': downtime, 'runtime': planned - downtime}
    for k in SUM_KEYS:
        if k not in t:
            t[k] = sum(r[k] for r in runs)
    t['okShots'] = sum(r['okShots'] for r in runs)
    by_down = {}
    for d in downs:
        c = d.get('category') or 'Other'
        by_down[c] = by_down.get(c, 0) + num(d.get('minutes'))
    return {'runs': runs, 't': ratios(t), 'byDown': by_down}


def agg_totals(ts):
    t = {k: 0 for k in SUM_KEYS + ['okShots']}
    for x in ts:
        for k in t:
            t[k] += x.get(k, 0) or 0
    return ratios(t)


def runs_totals(runs):
    t = {k: 0 for k in SUM_KEYS + ['okShots']}
    for r in runs:
        for k in t:
            if k in r:
                t[k] += r[k]
    return ratios(t)


# ══════════════════════════════════════════════════════
#  DATA CONTEXT
# ══════════════════════════════════════════════════════
def build_ctx(load):
    cfg_rows = load('setting_prodConfig')
    raw = cfg_rows[0] if cfg_rows and isinstance(cfg_rows[0], dict) else {}
    cfg = dict(CFG_DEFAULT, **{k: v for k, v in raw.items() if k != 'id'})
    machines = load('prodMachines')
    parts = load('prodParts')
    return {'cfg': cfg, 'load': load,
            'machines': {_key(m['id']): m for m in machines},
            'parts': {_key(p['id']): p for p in parts},
            'defects': {d.get('code'): d.get('description') or d.get('code') for d in load('prodDefectCodes')}}


def today():
    return date.today()


def iso(d):
    return d.isoformat()


def default_range(start, end, days=7):
    end = end or iso(today())
    start = start or iso(datetime.fromisoformat(end).date() - timedelta(days=days - 1))
    return start, end


def machine_label(ctx, mid):
    m = ctx['machines'].get(_key(mid))
    return (m or {}).get('code') or (m or {}).get('name') or '?'


def match_machine(ctx, machine, mid):
    if not machine:
        return True
    m = ctx['machines'].get(_key(mid)) or {}
    q = str(machine).strip().lower()
    return q in (str(m.get('code', '')).lower(), str(m.get('name', '')).lower(), _key(mid)) \
        or q.replace(' ', '').replace('ton', 't') == str(m.get('code', '')).lower()


def find_part(ctx, part_number):
    if not part_number:
        return None
    q = str(part_number).strip().lower()
    for p in ctx['parts'].values():
        if str(p.get('partNumber', '')).lower() == q:
            return p
    for p in ctx['parts'].values():
        if q in str(p.get('partNumber', '')).lower() or q in str(p.get('partName', '')).lower():
            return p
    return None


def load_shifts(ctx, start, end, machine=None, shift=None):
    out = []
    for s in ctx['load']('prodShifts'):
        d = s.get('date') or ''
        if start and d < start or end and d > end:
            continue
        if shift and str(s.get('shift', '')).upper() != str(shift).upper():
            continue
        if not match_machine(ctx, machine, s.get('machineId')):
            continue
        out.append((s, calc_shift(s, ctx)))
    out.sort(key=lambda x: (x[0].get('date', ''), x[0].get('shift', '')))
    return out


def r0(v, dp=0):
    if v is None:
        return None
    return round(v, dp) if dp else int(round(v))


def pct(v, dp=1):
    return round(v * 100, dp) if v is not None else None


def headline(t):
    return {'shots': r0(t['shots']), 'ok_shots': r0(t['okShots']), 'parts_cast': r0(t['castPcs']),
            'ok_parts': r0(t['okPcs']), 'rejected_parts': r0(t['rejPcs']), 'off_shot_parts': r0(t['offPcs']),
            'rejection_pct_incl_off_shots': pct(t['rejPct']), 'rejection_ppm': r0(t['ppm']),
            'oee_pct': pct(t['oee']), 'availability_pct': pct(t['A']), 'performance_pct': pct(t['P']),
            'quality_pct': pct(t['Q']), 'planned_hours': r0(t['planned'] / 60, 1),
            'downtime_hours': r0(t['downtime'] / 60, 1), 'metal_used_kg': r0(t['totalKg'], 1),
            'actual_cycle_time_s': r0(t['actCT'], 1), 'target_cycle_time_s': r0(t['tgtCT'], 1)}


# ══════════════════════════════════════════════════════
#  TOOLS
# ══════════════════════════════════════════════════════
def t_production_summary(ctx, start_date=None, end_date=None, machine=None, shift=None, part_number=None, group_by='none'):
    start, end = default_range(start_date, end_date)
    rows = load_shifts(ctx, start, end, machine, shift)
    part = find_part(ctx, part_number)
    if part_number and not part:
        return {'error': f'No part matching "{part_number}" in Part Master.'}

    def pick(c):
        return [r for r in c['runs'] if not part or _key(r['partId']) == _key(part['id'])]

    if part:
        total = runs_totals([r for _, c in rows for r in pick(c)])
    else:
        total = agg_totals([c['t'] for _, c in rows])
    res = {'period': {'from': start, 'to': end}, 'filters': {'machine': machine, 'shift': shift,
           'part': part.get('partNumber') if part else None},
           'shift_entries': len(rows), 'days_with_entries': len({s['date'] for s, _ in rows}),
           'totals': headline(total)}
    if part:
        res['note'] = 'Part filter: OEE availability/performance are not meaningful per part; use totals for pcs, rejection and metal.'
    gb = (group_by or 'none').lower()
    if gb != 'none':
        groups = {}
        for s, c in rows:
            if gb in ('part', 'customer'):
                for r in pick(c):
                    p = r['part'] or {}
                    k = p.get('partNumber', '?') if gb == 'part' else (p.get('customer') or '(no customer)')
                    groups.setdefault(k, {'runs': []})['runs'].append(r)
            else:
                k = s['date'] if gb == 'day' else machine_label(ctx, s.get('machineId')) if gb == 'machine' \
                    else f"Shift {s.get('shift')}" if gb == 'shift' else None
                if k is None:
                    return {'error': 'group_by must be none, day, machine, shift, part or customer'}
                groups.setdefault(k, {'ts': []})['ts'].append(c['t'])
        out = []
        for k, g in groups.items():
            t = runs_totals(g['runs']) if 'runs' in g else agg_totals(g['ts'])
            h = headline(t)
            if 'runs' in g:
                for x in ('oee_pct', 'availability_pct', 'performance_pct', 'planned_hours', 'downtime_hours',
                          'actual_cycle_time_s'):
                    h.pop(x, None)
            out.append(dict({'group': k}, **h))
        if gb in ('part', 'customer') and out:
            tot_ok = sum(x['ok_parts'] for x in out) or 1
            for x in out:
                x['share_of_ok_parts_pct'] = round(x['ok_parts'] / tot_ok * 100, 1)
        out.sort(key=lambda x: x['group'] if gb == 'day' else -x['ok_parts'])
        res['groups'] = out
    return res


def t_rejection_analysis(ctx, start_date=None, end_date=None, machine=None, part_number=None):
    start, end = default_range(start_date, end_date, 30)
    part = find_part(ctx, part_number)
    if part_number and not part:
        return {'error': f'No part matching "{part_number}" in Part Master.'}
    runs = [r for _, c in load_shifts(ctx, start, end, machine) for r in c['runs']
            if not part or _key(r['partId']) == _key(part['id'])]
    t = runs_totals(runs)
    by_def, by_part = {}, {}
    for r in runs:
        for c, n in r['rej'].items():
            by_def[c] = by_def.get(c, 0) + n
        p = (r['part'] or {}).get('partNumber', '?')
        x = by_part.setdefault(p, {'cast': 0, 'off': 0, 'rej': 0, 'defects': {}})
        x['cast'] += r['castPcs']; x['off'] += r['offPcs']; x['rej'] += r['rejPcs']
        for c, n in r['rej'].items():
            x['defects'][c] = x['defects'].get(c, 0) + n
    tot = sum(by_def.values()) or 1
    defects = sorted(({'defect': ctx['defects'].get(c, c), 'code': c, 'rejected_parts': r0(n),
                       'share_pct': round(n / tot * 100, 1)} for c, n in by_def.items()), key=lambda x: -x['rejected_parts'])
    cum = 0
    for d in defects:
        cum += d['share_pct']; d['cumulative_pct'] = round(min(cum, 100), 1)
    parts = []
    for p, x in by_part.items():
        good = x['cast'] - x['off']
        top = max(x['defects'].items(), key=lambda kv: kv[1])[0] if x['defects'] else None
        parts.append({'part': p, 'parts_cast': r0(x['cast']), 'rejected_parts': r0(x['rej']),
                      'off_shot_parts': r0(x['off']), 'ppm': r0(x['rej'] / good * 1e6 if good > 0 else 0),
                      'top_defect': ctx['defects'].get(top, top) if top else None})
    parts.sort(key=lambda x: -x['ppm'])
    return {'period': {'from': start, 'to': end}, 'machine': machine, 'part': part.get('partNumber') if part else None,
            'totals': {'parts_cast': r0(t['castPcs']), 'ok_parts': r0(t['okPcs']), 'rejected_parts': r0(t['rejPcs']),
                       'off_shot_parts': r0(t['offPcs']), 'rejection_ppm': r0(t['ppm']),
                       'rejection_pct_incl_off_shots': pct(t['rejPct'])},
            'defects_pareto': defects, 'by_part': parts,
            'definitions': 'PPM = rejected parts / (parts cast - off-shot parts) x 1e6. Off shots are warm-up shots.'}


def t_downtime_analysis(ctx, start_date=None, end_date=None, machine=None):
    start, end = default_range(start_date, end_date)
    rows = load_shifts(ctx, start, end, machine)
    by, worst = {}, []
    for s, c in rows:
        for k, v in c['byDown'].items():
            by[k] = by.get(k, 0) + v
        if c['t']['downtime']:
            top = max(c['byDown'].items(), key=lambda kv: kv[1])[0] if c['byDown'] else None
            worst.append({'date': s['date'], 'shift': s.get('shift'), 'machine': machine_label(ctx, s.get('machineId')),
                          'downtime_min': r0(c['t']['downtime']), 'main_reason': top})
    tot = sum(by.values()) or 1
    t = agg_totals([c['t'] for _, c in rows])
    return {'period': {'from': start, 'to': end}, 'machine': machine,
            'downtime_hours': r0(t['downtime'] / 60, 1), 'planned_hours': r0(t['planned'] / 60, 1),
            'speed_loss_hours': r0(t['perfLossMin'] / 60, 1) if not t['shotsNoCT'] else None,
            'quality_loss_hours': r0(t['qualLossMin'] / 60, 1),
            'by_reason': sorted(({'reason': k, 'hours': r0(v / 60, 1), 'share_pct': round(v / tot * 100, 1)}
                                 for k, v in by.items()), key=lambda x: -x['hours']),
            'worst_shifts': sorted(worst, key=lambda x: -x['downtime_min'])[:5]}


def t_material_consumption(ctx, start_date=None, end_date=None, machine=None):
    start, end = default_range(start_date, end_date, 30)
    by = {}
    for _, c in load_shifts(ctx, start, end, machine):
        for r in c['runs']:
            g = by.setdefault(r['grade'], {'parts_cast': 0, 'net_kg': 0, 'melting_loss_kg': 0, 'total_kg': 0})
            g['parts_cast'] += r['castPcs']; g['net_kg'] += r['netKg']
            g['melting_loss_kg'] += r['lossKg']; g['total_kg'] += r['totalKg']
    grades = [{'grade': k, 'parts_cast': r0(v['parts_cast']), 'net_kg': r0(v['net_kg'], 1),
               'melting_loss_kg': r0(v['melting_loss_kg'], 1), 'total_metal_kg': r0(v['total_kg'], 1)}
              for k, v in by.items() if v['parts_cast']]
    cfg = ctx['cfg']
    return {'period': {'from': start, 'to': end}, 'by_grade': sorted(grades, key=lambda x: -x['total_metal_kg']),
            'total_metal_kg': r0(sum(g['total_metal_kg'] for g in grades), 1),
            'method': f"metal per part = net weight + {num(cfg['meltLossPct'])}% melting loss; counted on "
                      + ('OK parts' if cfg['consumptionBasis'] == 'ok' else 'all parts cast incl. rejects')}


def t_stock_status(ctx, as_on=None):
    as_on = as_on or iso(today())
    rm, pt = {}, {}
    lots = [l for l in ctx['load']('_rm_lots') if (l.get('date') or '') <= as_on]
    no_wt = [l.get('lotNumber') for l in lots if not num(l.get('weightKg'))]
    for l in lots:
        rm.setdefault(l.get('grade') or '—', {'adj': 0, 'recv': 0, 'used': 0})['recv'] += num(l.get('weightKg'))
    adjs = [a for a in ctx['load']('prodStockAdj') if (a.get('date') or '') <= as_on]
    for a in adjs:
        if a.get('kind') == 'rm':
            rm.setdefault(a.get('grade') or '—', {'adj': 0, 'recv': 0, 'used': 0})['adj'] += num(a.get('qty'))
        else:
            pt.setdefault(_key(a.get('partId')), {'adj': 0, 'made': 0, 'disp': 0})['adj'] += num(a.get('qty'))
    for _, c in load_shifts(ctx, None, as_on):
        for r in c['runs']:
            rm.setdefault(r['grade'], {'adj': 0, 'recv': 0, 'used': 0})['used'] += r['totalKg']
            pt.setdefault(_key(r['partId']), {'adj': 0, 'made': 0, 'disp': 0})['made'] += r['okPcs']
    for d in ctx['load']('prodDispatch'):
        if (d.get('date') or '') <= as_on:
            pt.setdefault(_key(d.get('partId')), {'adj': 0, 'made': 0, 'disp': 0})['disp'] += num(d.get('qty'))
    return {'as_on': as_on,
            'raw_material_kg': [{'grade': g, 'opening_and_adjustments': r0(v['adj'], 1), 'received': r0(v['recv'], 1),
                                 'consumed': r0(v['used'], 1), 'balance': r0(v['adj'] + v['recv'] - v['used'], 1)}
                                for g, v in sorted(rm.items())],
            'parts_pcs': [{'part': (ctx['parts'].get(k) or {}).get('partNumber', '?'),
                           'opening_and_adjustments': r0(v['adj']), 'ok_produced': r0(v['made']),
                           'dispatched': r0(v['disp']), 'balance': r0(v['adj'] + v['made'] - v['disp'])}
                          for k, v in pt.items()],
            'lots_without_weight': no_wt[:20]}


def t_capacity_status(ctx):
    cfg = ctx['cfg']
    avail = num(cfg['workDays']) * num(cfg['shiftsPerDay']) * num(cfg['hoursPerShift'])
    target = min(1, max(.01, num(cfg['targetOeePct']) / 100))
    start = iso(today() - timedelta(days=29))
    rows = load_shifts(ctx, start, iso(today()))
    days = len({s['date'] for s, _ in rows})
    out = []
    for mid, m in ctx['machines'].items():
        if m.get('active') is False:
            continue
        mine = [(s, c) for s, c in rows if _key(s.get('machineId')) == mid]
        t = agg_totals([c['t'] for _, c in mine])
        hist = sum(r['okShots'] * r['ct'] / 3600 for _, c in mine for r in c['runs'] if r['ct'])
        if days:
            hist = hist / days * num(cfg['workDays'])
        actual = t['oee'] if t['oee'] > 0 else None
        sched, sched_parts = 0, []
        for p in ctx['parts'].values():
            if p.get('active') is False or num(p.get('monthlySchedule')) <= 0:
                continue
            pm = _key(p.get('scheduleMachineId')) or next((k for k in ctx['machines'] if ct_of(p, k)), '')
            if pm != mid:
                continue
            ct = ct_of(p, mid)
            if ct:
                sched += num(p['monthlySchedule']) / (num(p.get('cavities')) or 1) * ct / 3600
                sched_parts.append({'part': p.get('partNumber'), 'pcs_per_month': r0(num(p['monthlySchedule']))})

        def free(ideal, oee):
            return r0(avail - ideal / oee, 1) if oee else None

        out.append({'machine': m.get('code'), 'available_hours_per_month': r0(avail, 1),
                    'actual_oee_pct': pct(actual), 'target_oee_pct': pct(target, 0),
                    'schedule': {'parts': sched_parts, 'good_part_hours': r0(sched, 1),
                                 'free_hours_at_actual_oee': free(sched, actual), 'free_hours_at_target_oee': free(sched, target)},
                    'last_30_days': {'good_part_hours_per_month': r0(hist, 1), 'days_with_entries': days,
                                     'free_hours_at_actual_oee': free(hist, actual), 'free_hours_at_target_oee': free(hist, target)}})
    return {'machines': out, 'method': 'load = good-part time at target cycle time / OEE; free = available - load. '
            'Pcs a new part could add = free hours x OEE x 3600 / cycle time x cavities.'}


def t_quality_records(ctx, kind='capa', status='open'):
    kind = (kind or 'capa').lower()
    status = (status or 'open').lower()
    today_s = iso(today())
    if kind in ('capa', 'capas'):
        rows = ctx['load']('capas')
        acts = ctx['load']('capaActions')
        def keep(r): return status == 'all' or (status == 'open') == (r.get('status') != 'CLOSED')
        out = []
        for r in rows:
            if not keep(r):
                continue
            mine = [a for a in acts if _key(a.get('capaId')) == _key(r['id'])]
            open_a = [a for a in mine if a.get('status') != 'COMPLETE']
            out.append({'capa_number': r.get('capaNumber'), 'status': r.get('status'), 'part': r.get('partNumber'),
                        'problem': (r.get('problem') or '')[:200], 'complaint': r.get('crNumber'),
                        'opened': (r.get('createdAt') or '')[:10], 'open_actions': len(open_a),
                        'overdue_actions': len([a for a in open_a if a.get('dueDate') and a['dueDate'] < today_s])})
        return {'kind': 'CAPA', 'status_filter': status, 'count': len(out), 'records': out[:50]}
    if kind in ('capa_action', 'capa_actions', 'actions'):
        caps = {_key(c['id']): c.get('capaNumber') for c in ctx['load']('capas')}
        out = [{'capa_number': caps.get(_key(a.get('capaId'))), 'type': a.get('type'), 'action': (a.get('action') or '')[:200],
                'responsible': a.get('responsible'), 'due': a.get('dueDate'), 'status': a.get('status'),
                'overdue': bool(a.get('status') != 'COMPLETE' and a.get('dueDate') and a['dueDate'] < today_s)}
               for a in ctx['load']('capaActions')
               if status == 'all' or (status == 'open') == (a.get('status') != 'COMPLETE')]
        out.sort(key=lambda x: x['due'] or '9999')
        return {'kind': 'CAPA actions', 'status_filter': status, 'count': len(out), 'records': out[:50]}
    if kind in ('complaint', 'complaints'):
        out = [{'cr_number': r.get('crNumber'), 'date': r.get('date'), 'type': r.get('type'), 'source': r.get('source'),
                'part': r.get('partNumber'), 'problem': (r.get('problem') or '')[:200], 'status': r.get('status')}
               for r in ctx['load']('complaints')
               if status == 'all' or (status == 'open') == (r.get('status') != 'CLOSED')]
        out.sort(key=lambda x: x['date'] or '', reverse=True)
        return {'kind': 'Complaints', 'status_filter': status, 'count': len(out), 'records': out[:50]}
    if kind in ('quality_alert', 'quality_alerts', 'alerts'):
        out = [{'qa_number': r.get('qaNumber'), 'date': r.get('date'), 'part': r.get('partNumber'),
                'problem': (r.get('problem') or '')[:200], 'status': r.get('status')}
               for r in ctx['load']('qualAlerts')
               if status == 'all' or (status == 'open') == (r.get('status') != 'CLOSED')]
        return {'kind': 'Quality alerts', 'status_filter': status, 'count': len(out), 'records': out[:50]}
    return {'error': 'kind must be capa, capa_action, complaint or quality_alert'}


def t_calibration_due(ctx, within_days=30):
    within = int(num(within_days) or 30)
    recs = ctx['load']('calRecords')
    today_d = today()
    out = []
    for g in ctx['load']('calGauges'):
        if g.get('status') not in (None, '', 'Active'):
            continue
        mine = sorted([r for r in recs if _key(r.get('gaugeId')) == _key(g['id'])], key=lambda r: r.get('calibDate') or '')
        nd = mine[-1].get('nextDue') if mine else ''
        try:
            left = (date.fromisoformat(nd) - today_d).days if nd else None
        except ValueError:
            left = None
        if left is None or left <= within:
            out.append({'gauge_id': g.get('gaugeId'), 'name': g.get('name'), 'location': g.get('location'),
                        'next_due': nd or None, 'days_left': left,
                        'state': 'never calibrated' if left is None else 'overdue' if left < 0 else 'due soon'})
    out.sort(key=lambda x: x['days_left'] if x['days_left'] is not None else -9999)
    return {'within_days': within, 'count': len(out), 'gauges': out[:50]}


def t_pending_approvals(ctx):
    docs = [d for d in ctx['load']('_documents') if d.get('status') == 'PENDING_APPROVAL']
    return {'count': len(docs), 'documents': [{'doc_number': d.get('docNumber'), 'title': d.get('title'),
            'type': d.get('docType'), 'revision': d.get('revision'), 'created_by': d.get('createdBy')} for d in docs[:50]]}


def t_master_data(ctx, kind='parts'):
    kind = (kind or 'parts').lower()
    if kind == 'machines':
        return {'machines': [{'code': m.get('code'), 'name': m.get('name'), 'tonnage': m.get('tonnage'),
                              'active': m.get('active') is not False} for m in ctx['machines'].values()]}
    if kind in ('defects', 'defect_codes'):
        return {'defect_codes': [{'code': k, 'description': v} for k, v in ctx['defects'].items()]}
    if kind == 'customers':
        cs = {}
        for p in ctx['parts'].values():
            cs.setdefault(p.get('customer') or '(no customer)', []).append(p.get('partNumber'))
        return {'customers': [{'customer': k, 'parts': v} for k, v in cs.items()]}
    return {'parts': [{'part_number': p.get('partNumber'), 'name': p.get('partName'), 'customer': p.get('customer'),
                       'grade': p.get('grade'), 'net_weight_kg': p.get('netWeightKg'), 'cavities': p.get('cavities'),
                       'target_cycle_time_s': {machine_label(ctx, k): v for k, v in (p.get('cycleTimes') or {}).items()},
                       'monthly_schedule_pcs': p.get('monthlySchedule'), 'active': p.get('active') is not False}
                      for p in ctx['parts'].values()]}


# ══════════════════════════════════════════════════════
#  GENERIC READ ACCESS — every data area in the software
# ══════════════════════════════════════════════════════
AREA_INFO = {
    # production
    'prodShifts': 'Production — shift entries (raw hourly shots, rejections, downtime per machine/shift). Use production_summary for figures.',
    'prodParts': 'Production — part master (weight, cavities, cycle times, customer, monthly schedule)',
    'prodMachines': 'Production — machines', 'prodDefectCodes': 'Production — rejection/defect codes',
    'prodDispatch': 'Production — dispatch register (parts sent to customers)', 'prodStockAdj': 'Production — stock adjustments / opening stock',
    # quality
    'complaints': 'Quality — customer & internal complaints', 'qualAlerts': 'Quality — quality alerts',
    'capas': 'Quality — CAPA (corrective & preventive actions, 5-why)', 'capaActions': 'Quality — CAPA action items (responsible, due date)',
    'custFeedback': 'Quality — customer feedback / satisfaction surveys', 'parts': 'Quality — parts list used by complaints',
    # process quality
    'pq_parts': 'Process Quality — parts with PFD/PFMEA/Control Plan status', 'pq_pfd_steps': 'Process Quality — process flow steps',
    'pq_pfmea_rows': 'Process Quality — PFMEA rows (failure modes, S/O/D, RPN)', 'pq_cp_rows': 'Process Quality — control plan characteristics',
    'pq_cs_records': 'Process Quality — check sheet records', 'pq_revisions': 'Process Quality — revision history',
    'pq_grades': 'Process Quality — alloy grade master (chemical composition)',
    'pq_pfmea_templates': 'Process Quality — PFMEA templates', 'pq_cp_templates': 'Process Quality — control plan templates',
    'qmsPfmea': 'QMS — PFMEA (older module)', 'qmsCp': 'QMS — control plan (older module)',
    'qmsCsMaster': 'QMS — check sheet master', 'qmsCsRecords': 'QMS — check sheet records',
    # others
    'hrEmployees': 'HR — employee register', 'hrSkillDefs': 'HR — skill definitions', 'hrSkillMatrix': 'HR — skill matrix ratings',
    'hrCompetency': 'HR — competency records', 'hrTrainings': 'HR — training register / schedule', 'hrTrainAtt': 'HR — training attendance',
    'hrSkillDocs': 'HR — skill to document mapping',
    'mktEnquiries': 'Marketing — customer enquiry register', 'mktFeasibility': 'Marketing — feasibility reviews',
    'mktFeasQns': 'Marketing — feasibility questions', 'mktQuotations': 'Marketing — quotations',
    'purVendors': 'Purchasing — supplier register / approved suppliers', 'purVendorLots': 'Purchasing — invoice / delivery register',
    'calGauges': 'Calibration — gauge / instrument register', 'calRecords': 'Calibration — calibration records (next due dates)',
    'customDocTypes': 'Documents — custom document types',
    '_rm_lots': 'Raw material — lot register (grade, supplier, invoice, weight kg, spectro)',
    '_documents': 'Documents — registry (SOPs, WIs, formats…: number, title, type, revision, status)',
    '_audit': 'Audit trail — recent actions by users', '_users': 'Users — names and roles',
}
HIDDEN_AREAS = {'qms2_images'}
SECRET_KEY = re.compile(r'pass(word)?|token|secret|api_?key|hash', re.I)
TAG = re.compile(r'<[^>]+>')


def clean(v, depth=0):
    """Strip secrets and images, shorten long text, cap nested lists."""
    if isinstance(v, dict):
        if depth > 3:
            return '…'
        return {k: clean(x, depth + 1) for k, x in v.items() if not SECRET_KEY.search(str(k))}
    if isinstance(v, list):
        out = [clean(x, depth + 1) for x in v[:30]]
        return out + [f'… {len(v) - 30} more'] if len(v) > 30 else out
    if isinstance(v, str):
        if v.startswith('data:'):
            return '[image]'
        if '<' in v and '>' in v:
            v = TAG.sub(' ', v)
        v = re.sub(r'\s+', ' ', v).strip()
        return v[:400] + '…' if len(v) > 400 else v
    return v


def areas(ctx):
    names = [m['module'] for m in ctx['load']('_modules')]
    out = [n for n in names if not n.startswith('setting_') and n not in HIDDEN_AREAS]
    return out + ['_rm_lots', '_documents', '_audit', '_users']


def resolve_area(ctx, area):
    if not area:
        return None
    a = str(area).strip()
    all_ = areas(ctx)
    for n in all_:
        if n.lower() == a.lower() or n.lstrip('_').lower() == a.lower():
            return n
    q = a.lower().replace('_', ' ')
    for n in all_:
        if q in (AREA_INFO.get(n, '') + ' ' + n).lower():
            return n
    return None


def area_records(ctx, name):
    return [clean(r) for r in ctx['load'](name)]


def parse_filters(filters):
    out = []
    for part in re.split(r'[;,]\s*', str(filters or '')):
        m = re.match(r'\s*([\w.]+)\s*(>=|<=|!=|=|>|<|~)\s*(.+?)\s*$', part)
        if m:
            out.append(m.groups())
    return out


def rec_match(r, query, filters):
    if query and str(query).lower() not in json.dumps(r, ensure_ascii=False, default=str).lower():
        return False
    for f, op, val in filters:
        x = r
        for k in f.split('.'):
            x = x.get(k) if isinstance(x, dict) else None
        xs, vs = str(x if x is not None else '').lower(), val.lower().strip('\'"')
        try:
            xn, vn = float(xs), float(vs)
            numeric = True
        except ValueError:
            numeric = False
        a, b = (xn, vn) if numeric else (xs, vs)
        ok = {'=': a == b, '!=': a != b, '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b, '~': vs in xs}[op]
        if not ok:
            return False
    return True


def t_list_data_areas(ctx):
    counts = {m['module']: m['count'] for m in ctx['load']('_modules')}
    out = []
    for n in areas(ctx):
        c = counts.get(n)
        if c is None:
            c = len(ctx['load'](n))
        out.append({'area': n.lstrip('_'), 'records': c, 'what': AREA_INFO.get(n, n)})
    return {'areas': out, 'hint': 'Use search_records / count_records with one of these area names.'}


def t_search_records(ctx, area, query=None, filters=None, fields=None, sort_by=None, descending=True, limit=20):
    name = resolve_area(ctx, area)
    if not name:
        return {'error': f'Unknown area "{area}". Call list_data_areas to see what exists.'}
    fl = parse_filters(filters)
    rows = [r for r in area_records(ctx, name) if rec_match(r, query, fl)]
    if sort_by:
        rows.sort(key=lambda r: str(r.get(sort_by, '')), reverse=bool(descending))
    keys = sorted({k for r in rows[:200] for k in r.keys()})
    want = [f.strip() for f in str(fields or '').split(',') if f.strip()]
    lim = max(1, min(int(num(limit) or 20), 50))
    shown = [{k: r.get(k) for k in ['id'] + want if k in r} if want else r for r in rows[:lim]]
    return {'area': name.lstrip('_'), 'what': AREA_INFO.get(name, ''), 'total_matches': len(rows),
            'showing': len(shown), 'available_fields': keys, 'records': shown}


def t_count_records(ctx, area, group_by=None, query=None, filters=None):
    name = resolve_area(ctx, area)
    if not name:
        return {'error': f'Unknown area "{area}". Call list_data_areas to see what exists.'}
    rows = [r for r in area_records(ctx, name) if rec_match(r, query, parse_filters(filters))]
    res = {'area': name.lstrip('_'), 'total': len(rows)}
    if group_by:
        c = {}
        for r in rows:
            v = r.get(group_by)
            k = ', '.join(map(str, v)) if isinstance(v, list) else str(v if v not in (None, '') else '(blank)')
            c[k] = c.get(k, 0) + 1
        res['by_' + group_by] = dict(sorted(c.items(), key=lambda kv: -kv[1])[:40])
        if not any(group_by in r for r in rows[:50]):
            res['note'] = f'No field "{group_by}" found; fields are: ' + ', '.join(sorted({k for r in rows[:50] for k in r}))
    return res


def t_search_everywhere(ctx, query):
    q = str(query or '').strip()
    if len(q) < 2:
        return {'error': 'query too short'}
    hits = []
    for n in areas(ctx):
        rows = [r for r in area_records(ctx, n) if rec_match(r, q, [])]
        if rows:
            hits.append({'area': n.lstrip('_'), 'what': AREA_INFO.get(n, ''), 'matches': len(rows), 'first': rows[:3]})
    hits.sort(key=lambda h: -h['matches'])
    return {'query': q, 'areas_with_matches': len(hits), 'results': hits[:12]}


def t_read_document(ctx, doc_number=None, title=None):
    docs = ctx['load']('_documents')
    q = str(doc_number or title or '').strip().lower()
    d = next((x for x in docs if str(x.get('docNumber', '')).lower() == q), None) \
        or next((x for x in docs if q and (q in str(x.get('docNumber', '')).lower() or q in str(x.get('title', '')).lower())), None)
    if not d:
        return {'error': f'No document matching "{doc_number or title}".'}
    text = re.sub(r'\s+', ' ', TAG.sub(' ', str(d.get('content') or ''))).strip()
    meta = {k: d.get(k) for k in ('docNumber', 'title', 'docType', 'revision', 'status', 'createdBy', 'approvedBy',
                                  'createdDate', 'approvedDate')}
    return dict(meta, content=text[:12000] + ('… (truncated)' if len(text) > 12000 else ''))


S, I, B = 'STRING', 'INTEGER', 'BOOLEAN'
DATE = {'type': S, 'description': 'YYYY-MM-DD'}
TOOLS = {
    'production_summary': (t_production_summary,
        'Production figures for a date range: shots, OK parts, rejection %, PPM, OEE (availability/performance/quality), '
        'downtime, metal used, cycle time. Optionally filtered and/or grouped (by day, machine, shift, part or customer — '
        'customer grouping gives customer mix %).',
        {'start_date': DATE, 'end_date': DATE, 'machine': {'type': S, 'description': 'machine code e.g. 280T'},
         'shift': {'type': S, 'description': 'A (day 08-20) or B (night 20-08)'},
         'part_number': {'type': S}, 'group_by': {'type': S, 'enum': ['none', 'day', 'machine', 'shift', 'part', 'customer']}}),
    'rejection_analysis': (t_rejection_analysis,
        'Rejections for a date range: defect Pareto (top defect reasons with share and cumulative %), PPM by part.',
        {'start_date': DATE, 'end_date': DATE, 'machine': {'type': S}, 'part_number': {'type': S}}),
    'downtime_analysis': (t_downtime_analysis,
        'Downtime / breakdown for a date range: hours by reason, speed and quality loss, worst shifts.',
        {'start_date': DATE, 'end_date': DATE, 'machine': {'type': S}}),
    'material_consumption': (t_material_consumption,
        'Metal consumed by alloy grade for a date range (net weight, melting loss, total kg).',
        {'start_date': DATE, 'end_date': DATE, 'machine': {'type': S}}),
    'stock_status': (t_stock_status,
        'Current raw-material stock by grade (kg) and casting stock by part (pcs), as on a date.',
        {'as_on': DATE}),
    'capacity_status': (t_capacity_status,
        'Machine capacity per month: available hours, load from monthly customer schedule and from last 30 days, '
        'free hours at actual and target OEE. Use for "how much capacity is open for new business".', {}),
    'quality_records': (t_quality_records,
        'Lists CAPAs, CAPA actions, customer/internal complaints or quality alerts, open or closed.',
        {'kind': {'type': S, 'enum': ['capa', 'capa_action', 'complaint', 'quality_alert']},
         'status': {'type': S, 'enum': ['open', 'closed', 'all']}}),
    'calibration_due': (t_calibration_due,
        'Gauges/instruments overdue or due for calibration within N days.', {'within_days': {'type': I}}),
    'pending_approvals': (t_pending_approvals, 'Documents waiting for approval in the document registry.', {}),
    'master_data': (t_master_data, 'Parts (weight, cavities, cycle time, customer, schedule), machines, defect codes or customers.',
        {'kind': {'type': S, 'enum': ['parts', 'machines', 'defect_codes', 'customers']}}),
    # generic — anything else in the software
    'list_data_areas': (t_list_data_areas,
        'Lists every data area in the software (HR, marketing, purchasing, calibration, documents, PFMEA, RM lots, '
        'audit trail…) with record counts. Call this first when a question is not covered by the specific tools.', {}),
    'search_records': (t_search_records,
        'Reads records from any data area, with optional keyword search and field filters. Returns matching records '
        'and the field names available.',
        {'area': {'type': S, 'description': 'area name from list_data_areas, e.g. mktEnquiries, hrEmployees, purVendors, documents, rm_lots'},
         'query': {'type': S, 'description': 'keyword matched anywhere in the record'},
         'filters': {'type': S, 'description': 'comma-separated field conditions: status=OPEN, date>=2026-09-01, customer~tata (~ = contains)'},
         'fields': {'type': S, 'description': 'comma-separated fields to return (default all)'},
         'sort_by': {'type': S}, 'descending': {'type': B}, 'limit': {'type': I, 'description': 'max 50'}},
        ),
    'count_records': (t_count_records, 'Counts records in any data area, optionally grouped by a field (e.g. status, customer, department).',
        {'area': {'type': S}, 'group_by': {'type': S}, 'query': {'type': S}, 'filters': {'type': S}}),
    'search_everywhere': (t_search_everywhere,
        'Finds a keyword (part number, supplier, customer, person, document number…) across all data areas.',
        {'query': {'type': S}}),
    'read_document': (t_read_document, 'Reads a controlled document (SOP, WI, format…) by number or title, including its text.',
        {'doc_number': {'type': S}, 'title': {'type': S}}),
}
REQUIRED = {'search_records': ['area'], 'count_records': ['area'], 'search_everywhere': ['query']}


def tool_declarations():
    out = []
    for name, (_, desc, props) in TOOLS.items():
        d = {'name': name, 'description': desc}
        if props:
            d['parameters'] = {'type': 'OBJECT', 'properties': props}
            if name in REQUIRED:
                d['parameters']['required'] = REQUIRED[name]
        out.append(d)
    return out


def run_tool(name, args, ctx):
    fn = TOOLS.get(name, (None,))[0]
    if not fn:
        return {'error': f'unknown tool {name}'}
    try:
        return fn(ctx, **(args or {}))
    except TypeError as e:
        return {'error': f'bad arguments: {e}'}
    except Exception as e:   # a lookup must never crash the chat
        return {'error': f'lookup failed: {type(e).__name__}: {e}'}


# ══════════════════════════════════════════════════════
#  GEMINI
# ══════════════════════════════════════════════════════
def system_prompt(ctx):
    t = today()
    ms = ', '.join(f"{m.get('code')} ({m.get('name') or ''})" for m in ctx['machines'].values()) or 'none set up'
    return f"""You are the assistant inside VRA DMS, the management system of V R Alucast, an aluminium high-pressure die-casting company in India.
Today is {t.isoformat()} ({t.strftime('%A')}). Machines: {ms}. Shift A = 08:00-20:00, shift B = 20:00-08:00 (dated by its start day).

Rules:
- Every number you state must come from a tool result. Never estimate, extrapolate or invent figures, records or names. If the tools can't answer, say what is missing and where in the software it is entered.
- Turn relative dates into explicit ranges: "last 15 days" = {(t - timedelta(days=14)).isoformat()} to {t.isoformat()} (inclusive, today included); "this month" = {t.replace(day=1).isoformat()} to today; "yesterday" = {(t - timedelta(days=1)).isoformat()}.
- Always say the period and filters the figures cover, and mention if there were few or no entries.
- Parts (pcs) = shots x cavities. OK parts exclude off shots (warm-up) and rejections. Use Indian digit grouping (1,23,456) and units.
- Be brief: lead with the answer, then a short list or small markdown table if useful. No preamble.
- For production, rejection, downtime, material, stock, capacity, CAPA/complaints, calibration and approvals use the specific tools (they calculate correctly).
- For anything else in the software (HR, training, enquiries, quotations, feasibility, suppliers, invoices, gauges, PFMEA, control plans, documents, RM lots, audit trail…) use list_data_areas, then search_records / count_records; use search_everywhere for a name or number when unsure where it lives.
- You can only read data; you cannot create, change or delete anything. If asked to, explain where in the software the user can do it.
- Answer only questions about this company's data and the software; politely decline anything else."""


def _gemini(key, model, body):
    req = urllib.request.Request(GEMINI_URL.format(model=model), data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': key}, method='POST')
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


def _list_models(key):
    req = urllib.request.Request(MODELS_URL, headers={'x-goog-api-key': key})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode())
    return [m['name'].split('/', 1)[-1] for m in data.get('models', [])
            if 'generateContent' in (m.get('supportedGenerationMethods') or [])]


def rank_models(names):
    """Usable chat models, best first: newest stable Flash, then Flash previews, then Pro."""
    skip = ('image', 'tts', 'audio', 'live', 'embed', 'vision', 'learnlm', 'gemma', 'computer', 'robotics', 'exp')
    def rank(n):
        m = re.match(r'gemini-(\d+(?:\.\d+)?)', n)
        ver = float(m.group(1)) if m else 0.0
        return ('flash' in n, 'lite' not in n, 'preview' not in n, ver, n.endswith('latest'))
    cands = [n for n in names if n.startswith('gemini') and not any(x in n for x in skip)]
    return sorted(cands, key=rank, reverse=True)


def pick_model(names):
    r = rank_models(names)
    return r[0] if r else None


def fallback_model(names, current):
    """A different model to try when `current` is overloaded. Skips "-latest" aliases and, when
    `current` is an alias, the top-ranked model too — it is most likely the same one underneath."""
    ranked = [n for n in rank_models(names) if n != current and not n.endswith('latest')]
    if current.endswith('latest') and len(ranked) > 1:
        ranked = ranked[1:]
    return ranked[0] if ranked else None


BUSY_CODES = (500, 502, 503, 504)
BUSY_RETRIES = 2          # same model, after 1.5 s and 3 s


class AssistantError(Exception):
    pass


def answer(messages, load, key=None, model=None, call=None, lister=None, sleep=time.sleep):
    """messages: [{'role': 'user'|'assistant', 'text': str}], oldest first. Returns (reply, tools_used)."""
    key = key or os.environ.get('GEMINI_API_KEY', '').strip()
    if not key:
        raise AssistantError('The assistant is not set up: add GEMINI_API_KEY in Railway → Variables and redeploy.')
    model = model or os.environ.get('GEMINI_MODEL', '').strip() or _picked_model.get(key) or DEFAULT_MODEL
    call = call or _gemini
    lister = lister or _list_models
    rediscovered = False
    busy, fell_back = 0, False
    ctx = build_ctx(load)
    contents = [{'role': 'model' if m.get('role') == 'assistant' else 'user', 'parts': [{'text': str(m.get('text', ''))[:4000]}]}
                for m in messages[-12:] if str(m.get('text', '')).strip()]
    body = {'systemInstruction': {'parts': [{'text': system_prompt(ctx)}]},
            'tools': [{'functionDeclarations': tool_declarations()}],
            'generationConfig': {'temperature': 0.2}}
    used = []
    rounds = 0
    while rounds < MAX_TOOL_ROUNDS:
        try:
            res = call(key, model, dict(body, contents=contents))
        except urllib.error.HTTPError as e:
            detail = ''
            try:
                detail = json.loads(e.read().decode()).get('error', {}).get('message', '')
            except Exception:
                pass
            if e.code in (401, 403) or 'API key' in detail:
                raise AssistantError('Gemini rejected the API key — check GEMINI_API_KEY in Railway.')
            if e.code == 404 and not rediscovered:
                # Model names change over time: ask Google which models this key can use and switch.
                rediscovered = True
                try:
                    names = lister(key)
                except Exception:
                    names = []
                best = pick_model(names)
                if best and best != model:
                    model = _picked_model[key] = best
                    continue
                raise AssistantError(f'Gemini model "{model}" is not available for this key'
                                     + (f' (available: {", ".join(sorted(names)[:8])})' if names else '')
                                     + ' — set GEMINI_MODEL in Railway.')
            if e.code == 404:
                raise AssistantError(f'Gemini model "{model}" not found — set GEMINI_MODEL in Railway to a current model name.')
            if e.code in BUSY_CODES:
                # Google overloaded ("high demand"): wait and retry, then try another model once.
                if busy < BUSY_RETRIES:
                    busy += 1
                    sleep(1.5 * busy)
                    continue
                if not fell_back:
                    fell_back = True
                    try:
                        alt = fallback_model(lister(key), model)
                    except Exception:
                        alt = None
                    if alt:
                        model, busy = alt, BUSY_RETRIES - 1     # one more retry allowed on the fallback
                        continue
                raise AssistantError('Gemini is very busy right now (high demand on Google\'s side) — '
                                     'please try again in a minute.')
            if e.code == 429:
                raise AssistantError('Gemini usage limit reached — try again in a minute (or move the key to the paid tier).')
            raise AssistantError(f'Gemini error {e.code}: {detail or e.reason}')
        except (urllib.error.URLError, TimeoutError) as e:
            raise AssistantError(f'Could not reach Gemini: {getattr(e, "reason", e)}')
        rounds += 1
        cands = res.get('candidates') or []
        if not cands:
            reason = (res.get('promptFeedback') or {}).get('blockReason')
            raise AssistantError(f'Gemini returned no answer{f" ({reason})" if reason else ""}.')
        content = cands[0].get('content') or {}
        parts = content.get('parts') or []
        calls = [p['functionCall'] for p in parts if 'functionCall' in p]
        if not calls:
            text = ''.join(p.get('text', '') for p in parts if not p.get('thought')).strip()
            return text or 'Sorry, I could not produce an answer.', used
        contents.append(content)          # keep the model turn as-is (incl. thought signatures)
        replies = []
        for fc in calls:
            name, args = fc.get('name'), fc.get('args') or {}
            used.append({'tool': name, 'args': args})
            replies.append({'functionResponse': {'name': name, 'response': {'result': run_tool(name, args, ctx)}}})
        contents.append({'role': 'user', 'parts': replies})
    return 'Sorry — that needed too many lookups. Try asking a narrower question.', used

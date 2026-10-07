"""VRA DMS — WhatsApp agent (Meta WhatsApp Cloud API + the Gemini assistant).

Registered floor staff message the company WhatsApp number to
  * record entries — die-casting production per machine/shift, fettling,
    dispatch — typed, as a voice note, or as a photo of the handwritten sheet;
  * ask anything the in-app assistant can answer (production, stock, CAPAs…);
  * get a controlled document (SOP, WI, format…) as a 24-hour link.

Nothing is written straight from a message: the draft tools below validate
the entry against the masters (machines, parts, defect codes) and build the
exact record the Production screens would save. The user sees a summary and
must reply YES (or tap ✅ Save) before it is stored; a correction re-drafts.

Records match what static/modules/production.js saves (prodShifts,
prodFettling, prodDispatch) — keep the two in sync. Every entry is stamped
with source 'WhatsApp' and the contact's name.

Storage is in app.py (`Store`); this module only parses, validates, talks to
Meta and runs the conversation. `handle_message(msg, store)` is the entry.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

import assistant as A

GRAPH = 'https://graph.facebook.com/v21.0'
CONTACTS, SESSIONS, LINKS = 'waContacts', 'waSessions', 'waDocLinks'
PENDING_HOURS = 6           # an unconfirmed draft is dropped after this
LINK_HOURS = 24             # document links expire after this
HISTORY = 10                # chat turns kept for context
MAX_MEDIA = 10 * 1024 * 1024

# mirrors of production.js constants
DOWN_CATS = ['Die Loading / Unloading', 'Die Maintenance', 'Machine & Furnace Maintenance',
             'Melting / Metal Not Ready', 'Shot End Component', 'Spray Gun / Die Coat', 'Central Compressor', 'Crane',
             'Power Cut', 'Manpower', 'Material Shortage', 'No Plan', 'Plan Completed', 'Quality Hold', 'Other']
NOT_PLANNED = ('No Plan', 'Plan Completed')
NOT_RUN = ['No Plan'] + [c for c in DOWN_CATS if c not in NOT_PLANNED]
FET_REASONS = ['Fettling damage', 'Crack', 'Porosity / blow hole', 'Non fill', 'Cold shut', 'Dimension NG', 'Other']

YES = {'yes', 'y', 'ok', 'okay', 'save', 'confirm', 'confirmed', 'haan', 'ha', 'han', 'ho', 'hoy', 'theek', 'thik',
       'हाँ', 'हां', 'हो', 'ठीक', '✅', '👍'}
NO = {'no', 'n', 'cancel', 'nahi', 'nahin', 'nako', 'नहीं', 'नाही', 'रद्द', '❌'}

HELP = """*VRA DMS on WhatsApp* 🏭

*Record entries* (type, send a voice note, or a photo of the sheet):
• _Production:_ "280T shift A, operator Ramesh, part 1234 1200 shots, 10 off shots, 15 non fill, die maintenance 30 min"
• _Fettling:_ "Fettling today: Suresh part 1234 400 done 5 crack"
• _Dispatch:_ "Dispatched 2000 pcs of 1234 to Tata, invoice 556"
I'll show what I understood — reply *YES* to save, *NO* to cancel, or send a correction.

*Ask anything:* "yesterday's rejection on 400T", "stock of part 1234", "open CAPAs"

*Get a document:* "send SOP 001" or "send die casting work instruction"
"""


class WhatsAppError(Exception):
    pass


# ══════════════════════════════════════════════════════
#  CONFIG & META API
# ══════════════════════════════════════════════════════
def env(name):
    return os.environ.get(name, '').strip()


def config_status():
    need = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'GEMINI_API_KEY']
    return {'configured': all(env(n) for n in need), 'missing': [n for n in need if not env(n)]}


def verify_signature(body, header, secret=None):
    """Meta signs every webhook POST with the app secret (X-Hub-Signature-256)."""
    secret = secret if secret is not None else env('WHATSAPP_APP_SECRET')
    if not secret or not header or not header.startswith('sha256='):
        return False
    want = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, header[7:])


def normalize_phone(p):
    """Digits only, with country code (a 10-digit Indian number gets 91)."""
    d = re.sub(r'\D', '', str(p or '')).lstrip('0')
    return '91' + d if len(d) == 10 else d


def _graph(path, payload=None, raw=False, url=None):
    req = urllib.request.Request(url or f'{GRAPH}/{path}', headers={'Authorization': f"Bearer {env('WHATSAPP_TOKEN')}"})
    if payload is not None:
        req.data = json.dumps(payload).encode()
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return (data, r.headers.get('Content-Type', '')) if raw else json.loads(data.decode() or '{}')
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = json.loads(e.read().decode()).get('error', {}).get('message', '')
        except Exception:
            pass
        raise WhatsAppError(f'WhatsApp API error {e.code}: {detail or e.reason}')
    except (urllib.error.URLError, TimeoutError) as e:
        raise WhatsAppError(f'Could not reach WhatsApp: {getattr(e, "reason", e)}')


def send_text(to, body):
    # WhatsApp allows 4096 characters per message
    for i in range(0, max(len(body), 1), 4000):
        _graph(f"{env('WHATSAPP_PHONE_ID')}/messages",
               {'messaging_product': 'whatsapp', 'to': to, 'type': 'text',
                'text': {'body': body[i:i + 4000], 'preview_url': True}})


def send_confirm(to, body):
    """Summary with ✅ Save / ❌ Cancel buttons (button messages allow 1024 characters)."""
    if len(body) > 1000:
        return send_text(to, body + '\n\nReply *YES* to save or *NO* to cancel.')
    _graph(f"{env('WHATSAPP_PHONE_ID')}/messages",
           {'messaging_product': 'whatsapp', 'to': to, 'type': 'interactive',
            'interactive': {'type': 'button', 'body': {'text': body},
                            'action': {'buttons': [{'type': 'reply', 'reply': {'id': 'YES', 'title': '✅ Save'}},
                                                   {'type': 'reply', 'reply': {'id': 'NO', 'title': '❌ Cancel'}}]}}})


def download_media(media_id):
    meta = _graph(media_id)
    if int(meta.get('file_size') or 0) > MAX_MEDIA:
        raise WhatsAppError('file too large')
    data, ctype = _graph(None, raw=True, url=meta['url'])
    if len(data) > MAX_MEDIA:
        raise WhatsAppError('file too large')
    mime = (meta.get('mime_type') or ctype or 'application/octet-stream').split(';')[0].strip()
    return mime, data


def parse_webhook(payload):
    """Incoming user messages from a webhook body (delivery/read receipts are ignored)."""
    out = []
    for entry in (payload or {}).get('entry') or []:
        for ch in entry.get('changes') or []:
            v = ch.get('value') or {}
            names = {c.get('wa_id'): (c.get('profile') or {}).get('name', '') for c in v.get('contacts') or []}
            for m in v.get('messages') or []:
                t = m.get('type')
                msg = {'id': m.get('id'), 'from': m.get('from'), 'type': t, 'text': '', 'media_id': None,
                       'profile': names.get(m.get('from'), '')}
                if t == 'text':
                    msg['text'] = (m.get('text') or {}).get('body', '')
                elif t == 'interactive':
                    it = m.get('interactive') or {}
                    rep = it.get('button_reply') or it.get('list_reply') or {}
                    msg['text'] = rep.get('id') or rep.get('title') or ''
                elif t == 'button':
                    msg['text'] = (m.get('button') or {}).get('payload') or (m.get('button') or {}).get('text', '')
                elif t in ('audio', 'image', 'document'):
                    md = m.get(t) or {}
                    msg['media_id'] = md.get('id')
                    msg['text'] = md.get('caption', '')
                out.append(msg)
    return out


# ══════════════════════════════════════════════════════
#  RESOLVING NAMES AGAINST THE MASTERS
# ══════════════════════════════════════════════════════
def _fmt(v):
    """Indian digit grouping: 123456 -> 1,23,456."""
    v = A.num(v)
    neg, n = v < 0, abs(v)
    s = f'{n:.2f}'.rstrip('0').rstrip('.') if n != int(n) else str(int(n))
    i, _, f = s.partition('.')
    if len(i) > 3:
        head, tail = i[:-3], i[-3:]
        head = re.sub(r'(\d)(?=(\d\d)+$)', r'\1,', head)
        i = head + ',' + tail
    return ('-' if neg else '') + i + ('.' + f if f else '')


def _norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s or '').lower())


def resolve_part(ctx, q):
    """Exact part number first, then a unique partial match on number or name."""
    parts = [p for p in ctx['parts'].values() if p.get('active') is not False]
    nq = _norm(q)
    if not nq:
        return None, 'part number missing'
    exact = [p for p in parts if _norm(p.get('partNumber')) == nq]
    if len(exact) == 1:
        return exact[0], None
    cands = exact or [p for p in parts if nq in _norm(p.get('partNumber')) or nq in _norm(p.get('partName'))]
    if len(cands) == 1:
        return cands[0], None
    if not cands:
        return None, f'no part "{q}" in the part master'
    return None, f'"{q}" matches several parts: ' + ', '.join(str(p.get('partNumber')) for p in cands[:8])


def resolve_machine(ctx, q):
    ms = [m for m in ctx['machines'].values() if m.get('active') is not False]
    nq = _norm(q).replace('ton', 't')
    for m in ms:
        if nq and nq in (_norm(m.get('code')), _norm(m.get('name')).replace('ton', 't'), _norm(m.get('id'))):
            return m, None
    hits = [m for m in ms if nq and (nq in _norm(m.get('code')) or nq in _norm(m.get('name')))]
    if len(hits) == 1:
        return hits[0], None
    return None, f'no machine "{q}" — machines are ' + ', '.join(str(m.get('code')) for m in ms)


def resolve_defect(ctx, q):
    nq = _norm(q)
    for code, desc in ctx['defects'].items():
        if nq in (_norm(code), _norm(desc)):
            return code, None
    hits = [code for code, desc in ctx['defects'].items() if nq and (nq in _norm(desc) or _norm(code) in nq)]
    if len(hits) == 1:
        return hits[0], None
    return None, f'unknown defect "{q}" — defect codes are ' + ', '.join(f'{c} ({d})' for c, d in ctx['defects'].items())


def resolve_choice(q, choices, default=None):
    nq = _norm(q)
    for c in choices:
        if nq == _norm(c):
            return c
    hits = [c for c in choices if nq and (nq in _norm(c) or _norm(c) in nq)]
    return hits[0] if len(hits) == 1 else default


def parse_date(v):
    try:
        d = date.fromisoformat(str(v or '').strip()[:10])
    except ValueError:
        return None, f'date "{v}" is not YYYY-MM-DD'
    if d > A.today():
        return None, f'{d.isoformat()} is in the future'
    if d < A.today() - timedelta(days=90):
        return None, f'{d.isoformat()} is more than 90 days ago — enter old data in the software'
    return d.isoformat(), None


def nonneg_int(v, what):
    n = A.num(v)
    if n < 0 or n != int(n):
        raise ValueError(f'{what} must be a whole number ≥ 0 (got {v})')
    return int(n)


def pretty_date(iso_d):
    return datetime.fromisoformat(iso_d).strftime('%a %d-%b-%Y')


# ══════════════════════════════════════════════════════
#  DRAFT TOOLS — validate and stage an entry; nothing is saved here
# ══════════════════════════════════════════════════════
def _stage(ctx, item):
    wa = ctx['wa']
    if not wa['contact'].get('canEnter'):
        return {'error': 'This WhatsApp number may only ask questions, not record entries. An admin can allow it in Users → WhatsApp.'}
    wa['drafts'].append(item)
    return {'ok': True, 'draft_number': len(wa['drafts']), 'summary': item['summary'],
            'note': 'The user will be shown this summary with Save / Cancel buttons. Do not repeat it.'}


def t_draft_shift_entry(ctx, date=None, shift=None, machine=None, operator1=None, operator2=None, supervisor=None,
                        runs=None, downtime=None, not_run_reason=None, remarks=None):
    errs = []
    d, e = parse_date(date)
    e and errs.append(e)
    sh = str(shift or '').strip().upper()[:1]
    if sh not in ('A', 'B'):
        errs.append('shift must be A (day) or B (night)')
    m, e = resolve_machine(ctx, machine)
    e and errs.append(e)
    if errs:
        return {'error': '; '.join(errs)}
    dup = next((s for s in ctx['load']('prodShifts')
                if s.get('date') == d and str(s.get('shift')) == sh and A._key(s.get('machineId')) == A._key(m['id'])), None)
    if dup:
        return {'error': f"{m.get('code')} shift {sh} on {d} is already entered (by {dup.get('createdBy') or 'someone'}). "
                         'Changes to it must be made in the software (Production → Daily Entry).'}
    planned = A.num(ctx['cfg'].get('plannedMinutes')) or 720
    who = ctx['wa']['contact'].get('name', '')
    now = datetime.utcnow().isoformat() + 'Z'
    base = {'date': d, 'shift': sh, 'machineId': m['id'], 'plannedMinutes': planned,
            'remarks': str(remarks or '').strip(), 'source': 'WhatsApp',
            'createdAt': now, 'createdBy': who, 'updatedAt': now, 'updatedBy': who}
    head = f"🏭 *Production — {pretty_date(d)}, shift {sh}, {m.get('code')}*"

    if not_run_reason:
        reason = resolve_choice(not_run_reason, NOT_RUN)
        if not reason:
            return {'error': f'not-run reason must be one of: {", ".join(NOT_RUN)}'}
        rec = dict(base, notRun=reason, operator1='', operator2='', supervisor='', dieCoatL='', runs=[], downtime=[])
        return _stage(ctx, {'kind': 'shift', 'module': 'prodShifts', 'record': rec,
                            'summary': f'{head}\nMachine did *not run*: {reason}'})

    out_runs, lines = [], []
    try:
        for r in runs or []:
            part, e = resolve_part(ctx, r.get('part_number'))
            if e:
                raise ValueError(e)
            cav = nonneg_int(r.get('cavities') or part.get('cavities') or 1, 'cavities') or 1
            shots = nonneg_int(r.get('shots'), 'shots')
            off = nonneg_int(r.get('off_shots') or 0, 'off shots')
            if not shots:
                raise ValueError(f"{part.get('partNumber')}: shots missing")
            if off > shots:
                raise ValueError(f"{part.get('partNumber')}: off shots ({off}) are more than total shots ({shots})")
            rej = {}
            for x in r.get('rejections') or []:
                code, e = resolve_defect(ctx, x.get('defect'))
                if e:
                    raise ValueError(e)
                rej[code] = rej.get(code, 0) + nonneg_int(x.get('pcs'), 'rejected pcs')
            rej = {k: v for k, v in rej.items() if v > 0}
            cast = shots * cav
            if sum(rej.values()) > cast - off * cav:
                raise ValueError(f"{part.get('partNumber')}: rejected pcs are more than pcs cast")
            run = {'partId': part['id'], 'grade': part.get('grade') or '', 'cavities': cav, 'shots': shots}
            if off:
                run['offShots'] = off
            if rej:
                run['rej'] = rej
            out_runs.append(run)
            ok = cast - off * cav - sum(rej.values())
            lines.append(f"• *{part.get('partNumber')}* ({cav} cav): {_fmt(shots)} shots = {_fmt(cast)} pcs"
                         + (f', {_fmt(off)} off shots' if off else '')
                         + (', rejected ' + ', '.join(f'{k} {_fmt(v)}' for k, v in rej.items()) if rej else '')
                         + f' → *OK {_fmt(ok)}*')
        out_down = []
        for x in downtime or []:
            mins = nonneg_int(x.get('minutes'), 'downtime minutes')
            if not mins:
                continue
            cat = resolve_choice(x.get('category'), DOWN_CATS, 'Other')
            remark = str(x.get('remark') or '').strip()
            if cat == 'Other' and _norm(x.get('category')) not in ('', 'other'):
                remark = (str(x.get('category')) + (' — ' + remark if remark else '')).strip()
            out_down.append({'category': cat, 'minutes': mins, 'remark': remark})
    except ValueError as e:
        return {'error': str(e)}
    if not out_runs and not out_down:
        return {'error': 'no production or downtime given — ask for part, shots and rejections (or why the machine did not run)'}
    if sum(x['minutes'] for x in out_down) > planned:
        return {'error': f'downtime adds up to more than the {int(planned)}-minute shift'}
    ops = [str(o or '').strip() for o in (operator1, operator2)]
    rec = dict(base, operator1=ops[0], operator2=ops[1], supervisor=str(supervisor or '').strip(), dieCoatL='',
               runs=out_runs, downtime=out_down)
    summary = [head]
    if any(ops):
        summary.append('Operators: ' + ', '.join(o for o in ops if o))
    summary += lines
    if out_down:
        summary.append('Downtime: ' + '; '.join(f"{x['category']} {x['minutes']} min" + (f" ({x['remark']})" if x['remark'] else '')
                                                for x in out_down))
    if rec['remarks']:
        summary.append('Remarks: ' + rec['remarks'])
    return _stage(ctx, {'kind': 'shift', 'module': 'prodShifts', 'record': rec, 'summary': '\n'.join(summary)})


def t_draft_fettling(ctx, date=None, rows=None, remarks=None):
    d, e = parse_date(date)
    if e:
        return {'error': e}
    out, lines = [], []
    try:
        for r in rows or []:
            person = str(r.get('person') or '').strip()
            if not person:
                raise ValueError('every row needs the person who fettled')
            part, e = resolve_part(ctx, r.get('part_number'))
            if e:
                raise ValueError(e)
            qty, rej = nonneg_int(r.get('qty'), 'fettled qty'), nonneg_int(r.get('rejected') or 0, 'rejected')
            if not qty and not rej:
                continue
            if rej > qty:
                raise ValueError(f'{person}: rejected ({rej}) is more than fettled ({qty})')
            reason = resolve_choice(r.get('reason'), FET_REASONS, 'Other') if rej else ''
            out.append({'person': person, 'partId': part['id'], 'qty': qty, 'rej': rej, 'reason': reason})
            lines.append(f"• {person} — *{part.get('partNumber')}*: {_fmt(qty)} fettled"
                         + (f', {_fmt(rej)} rejected ({reason})' if rej else '') + f' → OK {_fmt(qty - rej)}')
    except ValueError as e:
        return {'error': str(e)}
    if not out:
        return {'error': 'no fettling quantities given — ask who fettled which part and how many'}
    who = ctx['wa']['contact'].get('name', '')
    existing = next((f for f in ctx['load']('prodFettling') if f.get('date') == d), None)
    head = f'🔨 *Fettling — {pretty_date(d)}*'
    if existing:
        head += f"\n_(added to the {len(existing.get('rows') or [])} rows already entered for this date)_"
    rec = {'date': d, 'rows': out, 'remarks': str(remarks or '').strip(), 'source': 'WhatsApp',
           'updatedAt': datetime.utcnow().isoformat() + 'Z', 'updatedBy': who}
    return _stage(ctx, {'kind': 'fettling', 'module': 'prodFettling', 'record': rec,
                        'summary': '\n'.join([head] + lines + ([f"Remarks: {rec['remarks']}"] if rec['remarks'] else []))})


def t_draft_dispatch(ctx, date=None, part_number=None, qty=None, customer=None, invoice=None, remark=None):
    d, e = parse_date(date)
    if e:
        return {'error': e}
    part, e = resolve_part(ctx, part_number)
    if e:
        return {'error': e}
    try:
        n = nonneg_int(qty, 'quantity')
    except ValueError as e:
        return {'error': str(e)}
    if not n:
        return {'error': 'dispatch quantity missing'}
    rec = {'date': d, 'partId': part['id'], 'qty': n, 'customer': str(customer or part.get('customer') or '').strip(),
           'invoice': str(invoice or '').strip(), 'remark': str(remark or '').strip(), 'source': 'WhatsApp',
           'createdBy': ctx['wa']['contact'].get('name', '')}
    summary = (f"🚚 *Dispatch — {pretty_date(d)}*\n• *{part.get('partNumber')}*: {_fmt(n)} pcs"
               + (f" to {rec['customer']}" if rec['customer'] else '')
               + (f"\nInvoice / challan: {rec['invoice']}" if rec['invoice'] else '')
               + (f"\nRemark: {rec['remark']}" if rec['remark'] else ''))
    return _stage(ctx, {'kind': 'dispatch', 'module': 'prodDispatch', 'record': rec, 'summary': summary})


def t_share_document(ctx, doc_number=None, title=None):
    docs = ctx['load']('_documents')
    q = _norm(doc_number or title)
    if not q:
        return {'error': 'which document?'}
    active = [x for x in docs if x.get('status') == 'ACTIVE']
    hits = [x for x in active if _norm(x.get('docNumber')) == q] \
        or [x for x in active if q in _norm(x.get('docNumber')) or q in _norm(x.get('title'))]
    if not hits:
        other = [x for x in docs if q in _norm(x.get('docNumber')) or q in _norm(x.get('title'))]
        if other:
            return {'error': f"{other[0].get('docNumber')} is not approved / active (status {other[0].get('status')}) — it can't be shared."}
        return {'error': f'no active document matching "{doc_number or title}"'}
    if len(hits) > 5:
        return {'error': 'too many matches — ask which one', 'matches': [f"{x.get('docNumber')} — {x.get('title')}" for x in hits[:15]]}
    for x in hits:
        if x['id'] not in [o['id'] for o in ctx['wa']['docs']]:
            ctx['wa']['docs'].append({'id': x['id'], 'docNumber': x.get('docNumber'), 'title': x.get('title'),
                                      'revision': x.get('revision')})
    return {'ok': True, 'sending': [f"{x.get('docNumber')} — {x.get('title')}" for x in hits],
            'note': 'A link to each document is sent automatically after your reply. Do not write any link yourself.'}


S, I, ARR, OBJ = 'STRING', 'INTEGER', 'ARRAY', 'OBJECT'
DATE = {'type': S, 'description': 'YYYY-MM-DD'}
WRITE_TOOLS = {
    'draft_shift_entry': (t_draft_shift_entry,
        'Stages a die-casting production entry for ONE machine and ONE shift (the user confirms before it is saved). '
        'One run per part (or per cavity count if a cavity went down). Shots, off shots and rejections are shift totals.',
        {'date': DATE, 'shift': {'type': S, 'enum': ['A', 'B']}, 'machine': {'type': S, 'description': 'machine code e.g. 280T'},
         'operator1': {'type': S}, 'operator2': {'type': S}, 'supervisor': {'type': S},
         'runs': {'type': ARR, 'items': {'type': OBJ, 'properties': {
             'part_number': {'type': S}, 'shots': {'type': I}, 'cavities': {'type': I, 'description': 'only if fewer than the die has'},
             'off_shots': {'type': I, 'description': 'warm-up / scrap shots'},
             'rejections': {'type': ARR, 'items': {'type': OBJ, 'properties': {
                 'defect': {'type': S, 'description': 'defect code or name'}, 'pcs': {'type': I}}}}}}},
         'downtime': {'type': ARR, 'items': {'type': OBJ, 'properties': {
             'category': {'type': S, 'description': ', '.join(DOWN_CATS)}, 'minutes': {'type': I}, 'remark': {'type': S}}}},
         'not_run_reason': {'type': S, 'description': 'only when the machine did not run the whole shift: ' + ', '.join(NOT_RUN)},
         'remarks': {'type': S}}),
    'draft_fettling': (t_draft_fettling,
        'Stages fettling work for one date: who fettled which part, how many, how many rejected (user confirms before saving).',
        {'date': DATE, 'rows': {'type': ARR, 'items': {'type': OBJ, 'properties': {
            'person': {'type': S}, 'part_number': {'type': S}, 'qty': {'type': I, 'description': 'parts fettled'},
            'rejected': {'type': I}, 'reason': {'type': S, 'description': ', '.join(FET_REASONS)}}}},
         'remarks': {'type': S}}),
    'draft_dispatch': (t_draft_dispatch, 'Stages a dispatch of finished parts to a customer (user confirms before saving).',
        {'date': DATE, 'part_number': {'type': S}, 'qty': {'type': I}, 'customer': {'type': S},
         'invoice': {'type': S, 'description': 'invoice / challan number'}, 'remark': {'type': S}}),
}
READ_TOOLS = {
    'share_document': (t_share_document,
        'Sends the user a link to an approved (active) controlled document — SOP, work instruction, format, drawing… '
        'Use when they ask for a document / file / SOP / WI to be sent.',
        {'doc_number': {'type': S}, 'title': {'type': S, 'description': 'words from the title when no number is given'}}),
}
WRITE_REQUIRED = {'draft_shift_entry': ['date', 'shift', 'machine'], 'draft_fettling': ['date', 'rows'],
                  'draft_dispatch': ['date', 'part_number', 'qty']}


def wa_prompt(contact, pending):
    now = A.now_ist()
    can = bool(contact.get('canEnter'))
    p = f"""You are on WhatsApp with {contact.get('name') or 'a staff member'} from the shop floor. It is now {now.strftime('%H:%M')} IST.
Messages may be English, Hindi, Marathi or a mix, typed, a voice note, or a photo of a handwritten sheet. Reply in the user's language, very short. WhatsApp formatting only: *bold*, _italic_, simple lines — no markdown tables or headings.
To send a document use share_document (only approved documents can be shared)."""
    if can:
        p += f"""
Recording entries:
- Use draft_shift_entry (die-casting production, one machine + one shift per call), draft_fettling, draft_dispatch. Call a draft tool once per machine/shift — a photo of a full day sheet can need several calls in one turn.
- Never guess a number, part, machine or shift. If something needed is missing or unreadable, ask a short question instead of drafting.
- No date given = today ({A.today().isoformat()}). Shift B (night, 20:00-08:00) is dated by its start day, so night-shift figures sent before 08:00 belong to yesterday ({(A.today() - timedelta(days=1)).isoformat()}).
- If a draft tool returns an error, tell the user plainly what to fix. If it succeeds, the user is shown the summary with Save / Cancel buttons — your reply should then be empty or one short line.
- Drafts made in a turn replace any earlier unconfirmed drafts, so for a correction call the draft tools again for ALL entries with the corrected figures."""
    else:
        p += '\nThis number may only ask questions and request documents; it cannot record entries.'
    if pending:
        p += '\n\nWaiting for the user to confirm (not saved yet):\n' + '\n\n'.join(x['summary'] for x in pending['items'])
    return p


# ══════════════════════════════════════════════════════
#  CONVERSATION
# ══════════════════════════════════════════════════════
def _word(text):
    return re.sub(r'[\s.!]+$', '', str(text or '').strip().lower())


def handle_message(msg, store, send=None, confirm=None, llm_call=None, media_loader=None, base_url=''):
    """Process one incoming message end to end. `store` is app.py's Store (holds the session lock)."""
    send = send or send_text
    confirm = confirm or send_confirm
    media_loader = media_loader or download_media
    phone = normalize_phone(msg.get('from'))
    contact = store.contact(phone)
    if not contact:
        send(phone, 'This number is not registered with VRA DMS. Please ask your admin to add it (Users → WhatsApp).')
        return
    sess = store.lock_session(phone)
    if msg.get('id') in sess.get('seen', []):
        store.release()
        return                                  # Meta re-delivered a message we already handled
    sess['seen'] = (sess.get('seen', []) + [msg.get('id')])[-40:]
    pending = sess.get('pending')
    if pending and datetime.utcnow() - datetime.fromisoformat(pending['at']) > timedelta(hours=PENDING_HOURS):
        pending = sess['pending'] = None
    history = sess.get('history', [])
    text = str(msg.get('text') or '').strip()
    word = _word(text)
    outgoing = []                               # (kind, body) sent after the session is saved

    if pending and not msg.get('media_id') and word in YES:
        try:
            done = store.commit(pending['items'], contact)
            reply = '✅ Saved: ' + ', '.join(done) + '.'
        except Exception as e:                  # e.g. someone entered the same shift meanwhile
            reply = f'⚠️ Not saved — {e}'
        sess['pending'] = None
        outgoing.append(('text', reply))
        history += [{'role': 'user', 'text': text}, {'role': 'assistant', 'text': reply}]
    elif pending and not msg.get('media_id') and word in NO:
        sess['pending'] = None
        outgoing.append(('text', 'Cancelled — nothing was saved.'))
        history += [{'role': 'user', 'text': text}, {'role': 'assistant', 'text': 'Cancelled — nothing was saved.'}]
    elif word in ('help', 'menu', '?', 'madad', 'मदद'):
        outgoing.append(('text', HELP))
    else:
        media, label = [], text
        if msg.get('media_id'):
            try:
                mime, data = media_loader(msg['media_id'])
                if not mime.startswith(('audio/', 'image/')) and mime != 'application/pdf':
                    raise WhatsAppError(f'{mime} files are not supported')
                media = [{'mime': mime, 'data': base64.b64encode(data).decode()}]
                kind = {'audio': 'voice note', 'image': 'photo'}.get(mime.split('/')[0], 'PDF')
                label = f'[{kind}]' + (f' {text}' if text else '')
            except WhatsAppError as e:
                outgoing.append(('text', f"Sorry, I couldn't read that file ({e}). Please type the details instead."))
        if media or text:
            wa = {'contact': contact, 'drafts': [], 'docs': []}
            can = bool(contact.get('canEnter'))
            try:
                reply, _ = A.answer(history[-HISTORY:] + [{'role': 'user', 'text': text, 'media': media}], store.loader(),
                                    call=llm_call, extra_tools=dict(READ_TOOLS, **(WRITE_TOOLS if can else {})),
                                    extra_required=WRITE_REQUIRED if can else {}, extra_prompt=wa_prompt(contact, pending),
                                    ctx_extra={'wa': wa}, can_write=can)
            except A.AssistantError as e:
                reply = f'⚠️ {e}'
            if wa['drafts']:
                sess['pending'] = {'at': datetime.utcnow().isoformat(), 'items': wa['drafts']}
                body = '\n\n'.join(x['summary'] for x in wa['drafts'])
                if reply.strip() and reply != A.NO_ANSWER and len(reply) < 300:
                    body += '\n\n' + reply.strip()
                outgoing.append(('confirm', body + '\n\nSave this?'))
                reply = body
            else:
                outgoing.append(('text', reply))
            for doc in wa['docs']:
                token = store.doc_link(doc['id'], phone, LINK_HOURS)
                outgoing.append(('text', f"📄 *{doc['docNumber']} — {doc['title']}* (Rev {doc.get('revision') or '-'})\n"
                                         f"{base_url.rstrip('/')}/wa/doc/{token}\n_Link valid for {LINK_HOURS} hours._"))
            history += [{'role': 'user', 'text': label}, {'role': 'assistant', 'text': reply}]
    sess['history'] = history[-2 * HISTORY:]
    store.save_session(phone, sess)
    for kind, body in outgoing:
        (confirm if kind == 'confirm' else send)(phone, body)

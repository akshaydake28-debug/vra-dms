from flask import Flask, request, jsonify, send_from_directory, session, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import json
import re
import secrets
import base64
import hashlib
import math

app = Flask(__name__, static_folder='static')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32MB

secret_key = os.environ.get('SECRET_KEY')
if not secret_key:
    secret_key = secrets.token_hex(32)
    print('WARNING: SECRET_KEY env var not set — using a random key that will '
          'change on every restart, logging everyone out each time the app '
          'redeploys. Set SECRET_KEY in Railway to fix this.', flush=True)
app.secret_key = secret_key
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

db_url = os.environ.get('DATABASE_URL', 'sqlite:///vra_dms.db')
if db_url.startswith('postgres://'):
    db_url = db_url.replace('postgres://', 'postgresql://', 1)
if db_url.startswith('postgresql://'):
    # Force the psycopg2 driver explicitly (only one installed, per
    # requirements.txt). Newer SQLAlchemy versions default a bare
    # "postgresql://" URL to the psycopg (v3) driver instead, which isn't
    # installed — that took production down with a ModuleNotFoundError
    # the moment a routine dependency install picked up a newer SQLAlchemy.
    db_url = db_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ══════════════════════════════════════════════════════
#  MODELS
# ══════════════════════════════════════════════════════

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Document(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    doc_number = db.Column(db.String(50), unique=True)
    title = db.Column(db.String(500))
    doc_type = db.Column(db.String(20))
    revision = db.Column(db.String(10))
    status = db.Column(db.String(30))
    content = db.Column(db.Text)
    created_by = db.Column(db.String(100))
    approved_by = db.Column(db.String(100))
    created_date = db.Column(db.String(30))
    approved_date = db.Column(db.String(30))
    extra = db.Column(db.Text)

class RMLot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lot_number = db.Column(db.String(50), unique=True)
    date = db.Column(db.String(20))
    grade = db.Column(db.String(20))
    supplier = db.Column(db.String(100))
    invoice = db.Column(db.String(50))
    approved_by = db.Column(db.String(100))
    spectro = db.Column(db.String(20))
    bundles = db.Column(db.Integer)
    weight_kg = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id':self.id,'lotNumber':self.lot_number,'date':self.date,
            'grade':self.grade,'supplier':self.supplier,'invoice':self.invoice,
            'approvedBy':self.approved_by,'spectro':self.spectro,'bundles':self.bundles,
            'weightKg':self.weight_kg}

def _grade_key(g):
    # "ADC 12", "adc-12" and "ADC12" all compare equal
    return re.sub(r'[^A-Z0-9]', '', str(g or '').upper())

def _master_grade(g):
    # Grade Master spelling of g ("adc 12" -> "ADC12"), or None if it is not in the Grade Master
    k = _grade_key(g)
    if not k:
        return None
    for r in GenericRecord.query.filter_by(module='pq_grades').all():
        name = safe_json_loads(r.data, {}).get('grade')
        if name and _grade_key(name) == k:
            return name
    return None

GRADE_NOT_IN_MASTER = 'Grade must be selected from the Grade Master'

def _to_float(v):
    try:
        f = float(v)
        return f if f >= 0 else None
    except (TypeError, ValueError):
        return None

class GenericRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    module = db.Column(db.String(50), index=True)
    data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(50))
    module = db.Column(db.String(50))
    record_id = db.Column(db.Integer)
    user = db.Column(db.String(100))
    detail = db.Column(db.Text)
    doc_id = db.Column(db.Integer)
    doc_number = db.Column(db.String(50))
    notes = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# ══════════════════════════════════════════════════════
#  FRONTEND
# ══════════════════════════════════════════════════════

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/static/modules/<path:filename>')
def serve_module(filename):
    return send_from_directory('static/modules', filename)

@app.route('/static/core/<path:filename>')
def serve_core(filename):
    return send_from_directory('static/core', filename)

@app.after_request
def no_stale_frontend(resp):
    # Browsers must re-check the app's HTML/JS on every load (a cheap 304 when unchanged),
    # otherwise after a deploy they can keep running the old screens.
    if request.path == '/' or request.path.startswith('/static/'):
        resp.headers['Cache-Control'] = 'no-cache'
    return resp

@app.route('/feedback/<token>')
def customer_feedback_page(token):
    # Standalone page, not the logged-in app shell — a customer opening
    # this link has no VRA-DMS account. The token itself is looked up
    # client-side against /api/public/feedback/<token>.
    return send_from_directory('static', 'feedback.html')

# ══════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════

PUBLIC_PATHS = {'/api/auth/login'}
# Customer feedback links are opened by people with no VRA-DMS account at
# all — the unguessable token in the URL is what gates access, not a login
# session. Everything under this prefix must independently validate its
# own token and never expose data beyond that one record.
PUBLIC_PREFIXES = ('/api/public/feedback/', '/api/public/wi/', '/api/public/wi-photo/')
BACKUP_API_TOKEN = os.environ.get('BACKUP_API_TOKEN')
BACKUP_FORMAT = 2   # see backup() / _restore_data()
HASH_PREFIXES = ('pbkdf2:', 'scrypt:', 'argon2:')
# APPROVER is this app's admin-equivalent role — it's what the frontend
# already gates the Users management screen on (see nav-users in index.html).
ADMIN_ROLE = 'APPROVER'

def is_hashed(pw):
    return bool(pw) and pw.startswith(HASH_PREFIXES)

def safe_json_loads(raw, default):
    """Parse stored JSON, tolerating a corrupted row instead of raising —
    one bad record must never take down a whole listing endpoint.
    Also falls back to `default` if the value parses but isn't the expected
    type (e.g. a row that somehow got stored as the JSON literal `null`,
    or a list) — callers rely on getting back the same shape as `default`,
    and callers like list_versions/qms2_flat do `d['id'] = ...` on the
    result, which crashes with a TypeError on anything that isn't a dict.
    """
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return default
    if default is not None and not isinstance(parsed, type(default)):
        return default
    return parsed

def json_object_body():
    """Return the request body if it is a JSON object, else None. The record
    write endpoints store whatever they are given, so a body that is `null`,
    a list or plain text would be saved as-is and then be skipped (and so
    silently left out) by the nightly backup, which only accepts objects."""
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None

BAD_BODY = ({'error': 'Request body must be a JSON object'}, 400)

def body_or_empty():
    """Request body as a dict; {} if missing or not a JSON object, so a
    malformed request gets a clean 400/'missing fields' instead of a 500."""
    return json_object_body() or {}

@app.before_request
def require_login():
    path = request.path
    if not path.startswith('/api/') or path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES):
        return None
    if 'user_id' in session:
        # The session cookie lasts 30 days, so confirm the account still exists
        # (a deleted user must be locked out at once) and pick up role changes.
        u = db.session.get(User, session.get('user_id'))
        if u:
            session['role'] = u.role
            return None
        session.clear()
        return jsonify({'error': 'Not authenticated'}), 401
    # Dedicated token for the automated backup workflow only — lets the
    # nightly export run unattended without needing a real user's login.
    if path == '/api/backup' and BACKUP_API_TOKEN and request.headers.get('X-Backup-Token') == BACKUP_API_TOKEN:
        return None
    return jsonify({'error': 'Not authenticated'}), 401

def require_admin():
    if session.get('role') != ADMIN_ROLE:
        return jsonify({'error': 'Admin access required'}), 403
    return None

@app.route('/api/auth/login', methods=['POST'])
def login():
    d = body_or_empty()
    user = User.query.filter_by(username=d.get('username')).first()
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    pwd = d.get('password','')
    if is_hashed(user.password):
        if not check_password_hash(user.password, pwd):
            return jsonify({'error': 'Invalid credentials'}), 401
    else:
        # Legacy plaintext account — verify directly, then upgrade to a
        # proper hash transparently so it's never stored in the clear again.
        if user.password != pwd:
            return jsonify({'error': 'Invalid credentials'}), 401
        user.password = generate_password_hash(pwd)
        db.session.commit()
    session.clear()
    session['user_id'] = user.id
    session['username'] = user.username
    session['role'] = user.role
    session.permanent = True
    return jsonify({'id': user.id, 'username': user.username, 'role': user.role, 'name': user.name})

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'ok': True})

@app.route('/api/auth/users', methods=['GET'])
def get_users():
    return jsonify([{'id':u.id,'username':u.username,'role':u.role,'name':u.name} for u in User.query.all()])

@app.route('/api/auth/users/all', methods=['GET'])
def get_users_with_passwords():
    err = require_admin()
    if err: return err
    # Passwords are hashed at rest, but this still only goes to admins.
    return jsonify([{'id':u.id,'username':u.username,'role':u.role,'name':u.name,'password':u.password} for u in User.query.all()])

@app.route('/api/auth/users', methods=['POST'])
def create_user():
    err = require_admin()
    if err: return err
    d = body_or_empty()
    username, password, role, name = d.get('username'), d.get('password'), d.get('role'), d.get('name')
    if not username or not password or not role or not name:
        return jsonify({'error': 'Missing fields'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
    u = User(username=username, password=generate_password_hash(password), role=role, name=name)
    db.session.add(u)
    db.session.commit()
    return jsonify({'id': u.id})

@app.route('/api/auth/users/<int:uid>', methods=['DELETE'])
def delete_user(uid):
    err = require_admin()
    if err: return err
    u = User.query.get_or_404(uid)
    db.session.delete(u)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/auth/password', methods=['POST'])
def change_password():
    d = body_or_empty()
    username = d.get('username','')
    new_password = d.get('newPassword','')
    if not username or not new_password:
        return jsonify({'error': 'Missing fields'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Password too short'}), 400
    # Only change your own password, unless you're an admin.
    if username != session.get('username') and session.get('role') != ADMIN_ROLE:
        return jsonify({'error': 'Not authorized'}), 403
    u = User.query.filter_by(username=username).first()
    if not u:
        return jsonify({'error': 'User not found'}), 404
    u.password = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/auth/users/<int:uid>/reset', methods=['POST'])
def reset_user_password(uid):
    err = require_admin()
    if err: return err
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    new_password = d.get('newPassword') or 'vra@2025'
    u = User.query.get_or_404(uid)
    u.password = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  DOCUMENTS
# ══════════════════════════════════════════════════════

@app.route('/api/documents', methods=['GET'])
def list_documents():
    docs = Document.query.order_by(Document.id.desc()).all()
    return jsonify([{
        'id':d.id,'docNumber':d.doc_number,'title':d.title,
        'docType':d.doc_type,'revision':d.revision,'status':d.status,
        'content':d.content,'createdBy':d.created_by,'approvedBy':d.approved_by,
        'createdDate':d.created_date,'approvedDate':d.approved_date,
        'extra':safe_json_loads(d.extra, {})
    } for d in docs])

@app.route('/api/documents', methods=['POST'])
def save_document():
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    existing = Document.query.filter_by(doc_number=d.get('docNumber')).first()
    if existing and d.get('isNew'):
        # A brand-new document must never take over an existing number —
        # this endpoint upserts by number, so it would overwrite that document.
        return jsonify({'error': 'Document number already in use'}), 409
    if existing:
        existing.title = d.get('title',existing.title)
        existing.doc_type = d.get('docType',existing.doc_type)
        existing.revision = d.get('revision',existing.revision)
        existing.status = d.get('status',existing.status)
        existing.content = d.get('content',existing.content)
        existing.created_by = d.get('createdBy',existing.created_by)
        existing.approved_by = d.get('approvedBy',existing.approved_by)
        existing.created_date = d.get('createdDate',existing.created_date)
        existing.approved_date = d.get('approvedDate',existing.approved_date)
        existing.extra = json.dumps(d.get('extra',{}))
        db.session.commit()
        return jsonify({'id': existing.id})
    doc = Document(
        doc_number=d.get('docNumber'), title=d.get('title'),
        doc_type=d.get('docType'), revision=d.get('revision'),
        status=d.get('status'), content=d.get('content',''),
        created_by=d.get('createdBy',''), approved_by=d.get('approvedBy',''),
        created_date=d.get('createdDate',''), approved_date=d.get('approvedDate',''),
        extra=json.dumps(d.get('extra',{}))
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify({'id': doc.id})

@app.route('/api/documents/<int:did>', methods=['DELETE'])
def delete_document(did):
    d = Document.query.get_or_404(did)
    db.session.delete(d)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  VERSIONS
# ══════════════════════════════════════════════════════

@app.route('/api/versions', methods=['GET'])
def list_versions():
    doc_id = request.args.get('docId', type=int)
    records = GenericRecord.query.filter_by(module='versions').order_by(GenericRecord.id.asc()).all()
    result = []
    for r in records:
        d = safe_json_loads(r.data, {})
        d['id'] = r.id
        if doc_id is None or d.get('docId') == doc_id:
            result.append(d)
    return jsonify(result)

@app.route('/api/versions', methods=['POST'])
def save_version():
    body = json_object_body()
    if body is None: return jsonify(BAD_BODY[0]), 400
    r = GenericRecord(module='versions', data=json.dumps(body))
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})

@app.route('/api/versions/<int:rid>', methods=['POST'])
def update_version(rid):
    r = GenericRecord.query.get_or_404(rid)
    body = json_object_body()
    if body is None: return jsonify(BAD_BODY[0]), 400
    # Record ids are shared by every module — without this check, this URL
    # could rewrite any other record (including a task, bypassing task_guard).
    if r.module != 'versions':
        return jsonify({'error': 'Not found'}), 404
    existing = safe_json_loads(r.data, {})
    existing.update(body)
    r.data = json.dumps(existing)
    r.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'id': r.id})

# ══════════════════════════════════════════════════════
#  AUDIT LOG
# ══════════════════════════════════════════════════════

@app.route('/api/auditlog', methods=['GET'])
def get_audit_log():
    logs = AuditLog.query.order_by(AuditLog.id.desc()).limit(300).all()
    return jsonify([{
        'id':l.id,'docId':l.doc_id,'action':l.action,
        'user':l.user,'notes':l.notes or l.detail,
        'docNumber':l.doc_number,'timestamp':str(l.timestamp)
    } for l in logs])

@app.route('/api/auditlog', methods=['POST'])
def post_audit_log():
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    log = AuditLog(
        action=d.get('action',''),
        module='documents',
        doc_id=d.get('docId'),
        doc_number=d.get('docNumber',''),
        user=d.get('user',''),
        notes=str(d.get('notes','')),
        detail=str(d.get('notes',''))
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({'id': log.id})

# ══════════════════════════════════════════════════════
#  SETTINGS
# ══════════════════════════════════════════════════════

@app.route('/api/settings/<key>', methods=['GET'])
def get_setting(key):
    r = GenericRecord.query.filter_by(module='setting_'+key).first()
    return jsonify({'value': safe_json_loads(r.data, default=None) if r else None})

@app.route('/api/settings/<key>', methods=['POST'])
def save_setting(key):
    body = json_object_body()
    if body is None: return jsonify(BAD_BODY[0]), 400
    r = GenericRecord.query.filter_by(module='setting_'+key).first()
    if r:
        r.data = json.dumps(body.get('value'))
        r.updated_at = datetime.utcnow()
    else:
        r = GenericRecord(module='setting_'+key, data=json.dumps(body.get('value')))
        db.session.add(r)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  GENERIC MODULE RECORDS
#  All other modules: complaints, capas, gauges, HR, etc.
# ══════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════
#  RAW MATERIAL LOTS
# ══════════════════════════════════════════════════════

@app.route('/api/rm/lots', methods=['GET'])
def list_rm_lots():
    lots = RMLot.query.order_by(RMLot.id.desc()).all()
    return jsonify([l.to_dict() for l in lots])

@app.route('/api/rm/lots', methods=['POST'])
def save_rm_lot():
    d = body_or_empty()
    existing = RMLot.query.filter_by(lot_number=d.get('lotNumber','')).first()
    if existing:
        return jsonify({'id': existing.id})
    grade = _master_grade(d.get('grade'))
    if not grade:
        return jsonify({'error': GRADE_NOT_IN_MASTER}), 400
    lot = RMLot(
        lot_number=d.get('lotNumber'), date=d.get('date',''),
        grade=grade, supplier=d.get('supplier',''),
        invoice=d.get('invoice',''), approved_by=d.get('approvedBy',''),
        spectro=d.get('spectro',''), bundles=d.get('bundles',1),
        weight_kg=_to_float(d.get('weightKg'))
    )
    db.session.add(lot)
    db.session.commit()
    return jsonify({'id': lot.id})

@app.route('/api/rm/lots/<int:lid>', methods=['POST'])
def update_rm_lot(lid):
    # Partial update: only the fields sent are changed. The lot number stays as printed on the labels.
    l = RMLot.query.get(lid)
    if not l:
        return jsonify({'error': 'Not found'}), 404
    d = request.get_json(silent=True) or {}
    if 'grade' in d and d.get('grade') != l.grade:
        # A changed grade must come from the Grade Master; an old unchanged one is left as is
        grade = _master_grade(d.get('grade'))
        if not grade:
            return jsonify({'error': GRADE_NOT_IN_MASTER}), 400
        d['grade'] = grade
    fields = {'date':'date', 'grade':'grade', 'supplier':'supplier', 'invoice':'invoice',
              'approvedBy':'approved_by', 'spectro':'spectro'}
    for k, col in fields.items():
        if k in d:
            setattr(l, col, str(d.get(k) or '').strip())
    if 'bundles' in d:
        try:
            l.bundles = max(1, int(d.get('bundles')))
        except (TypeError, ValueError):
            pass
    if 'weightKg' in d:
        l.weight_kg = _to_float(d.get('weightKg'))
    db.session.commit()
    return jsonify(l.to_dict())

@app.route('/api/rm/lots/rename-grade', methods=['POST'])
def rename_rm_grade():
    # Merge a misspelled / duplicate grade into the correct one across all lots.
    d = request.get_json(silent=True) or {}
    old, new = str(d.get('from') or ''), _master_grade(d.get('to'))
    if not new:
        return jsonify({'error': GRADE_NOT_IN_MASTER}), 400
    n = RMLot.query.filter(RMLot.grade == old).update({'grade': new})
    db.session.commit()
    return jsonify({'updated': n})

@app.route('/api/rm/lots/<int:lid>', methods=['DELETE'])
def delete_rm_lot(lid):
    err = busy_lot_guard(lid)
    if err: return err
    l = RMLot.query.get(lid)
    if l:
        db.session.delete(l)
        db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/backup', methods=['GET'])
def backup():
    data = {
        'exportedAt': str(datetime.utcnow()),
        'exportedBy': 'System',
        'appVersion': '4.0',
        # 2 = complete snapshot that keeps every record's id; restore() then
        # puts the database back exactly as it was (see restore()).
        'backupFormat': BACKUP_FORMAT,
        'documents': [],
        'versions': [],
        'audit': [],
        'users': [],
    }
    backup_errors = []
    for d in Document.query.order_by(Document.id).all():
        try:
            extra = json.loads(d.extra) if d.extra else {}
        except (TypeError, ValueError):
            backup_errors.append(f'document {d.id} ({d.doc_number}): unreadable extra data, skipped')
            extra = {}
        data['documents'].append({
            'id':d.id,'docNumber':d.doc_number,'title':d.title,'docType':d.doc_type,
            'revision':d.revision,'status':d.status,'content':d.content,
            'createdBy':d.created_by,'approvedBy':d.approved_by,
            'createdDate':d.created_date,'approvedDate':d.approved_date,
            'extra':extra
        })
    for l in AuditLog.query.all():
        data['audit'].append({'id':l.id,'docId':l.doc_id,'action':l.action,
            'user':l.user,'notes':l.notes,'timestamp':str(l.timestamp)})
    for u in User.query.all():
        data['users'].append({'id':u.id,'username':u.username,'role':u.role,'name':u.name})
    data['rm_lots'] = [l.to_dict() for l in RMLot.query.order_by(RMLot.id).all()]
    # All generic modules
    modules = {}
    for r in GenericRecord.query.order_by(GenericRecord.id).all():
        # Earlier restores left a stale generic 'rm_lots' copy behind; the real
        # lots are exported above from their own table, so never let it override them.
        if r.module == 'rm_lots':
            continue
        try:
            parsed = json.loads(r.data)
        except (TypeError, ValueError):
            backup_errors.append(f'{r.module} record {r.id}: unreadable data, skipped')
            continue
        # Non-setting records are stored as objects; a row holding `null`, a
        # list or a bare string (the update endpoints don't enforce a shape)
        # would crash the whole backup on `parsed['id'] = ...` below.
        if not r.module.startswith('setting_') and not isinstance(parsed, dict):
            backup_errors.append(f'{r.module} record {r.id}: data is not an object, skipped')
            continue
        if r.module.startswith('setting_'):
            key = r.module.replace('setting_','')
            if 'settings' not in data: data['settings'] = {}
            data['settings'][key] = parsed
        else:
            if r.module not in modules: modules[r.module] = []
            parsed['id'] = r.id
            modules[r.module].append(parsed)
    data.update(modules)
    if backup_errors:
        data['backupErrors'] = backup_errors
    return jsonify(data)

@app.route('/api/restore', methods=['POST'])
def restore():
    err = require_admin()
    if err: return err
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict): return jsonify({'error':'No data'}),400

    # Validate the shapes up front, before anything is deleted, so a wrong or
    # partial file is rejected cleanly instead of failing half-way through.
    docs_in = data.get('documents')
    if docs_in is not None and (not isinstance(docs_in, list) or not all(isinstance(x, dict) for x in docs_in)):
        return jsonify({'error':'Invalid backup: "documents" must be a list of objects'}), 400
    if data.get('settings') is not None and not isinstance(data['settings'], dict):
        return jsonify({'error':'Invalid backup: "settings" must be an object'}), 400
    if isinstance(data.get('audit'), list) and not all(isinstance(x, dict) for x in data['audit']):
        return jsonify({'error':'Invalid backup: "audit" must be a list of objects'}), 400
    for key, value in data.items():
        if key in ('exportedAt','exportedBy','appVersion','company','documents',
                   'users','customDocTypes','settings','records','backupErrors'):
            continue
        if isinstance(value, list) and not all(isinstance(x, dict) for x in value):
            return jsonify({'error':f'Invalid backup: "{key}" must be a list of objects'}), 400

    try:
        result = _restore_data(data)
    except Exception as e:
        # Everything happens in one transaction: on any error nothing is
        # changed, and the database stays exactly as it was before.
        db.session.rollback()
        return jsonify({'error': f'Restore failed — nothing was changed. ({e})'}), 500
    return jsonify(result)

def _valid_id(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v > 0 else None

def _reset_id_sequences(*models):
    """Rows restored with their original ids don't advance Postgres' id
    counter; move it past the highest id so the next new record can't
    collide. SQLite needs nothing (it always uses max(id)+1).
    The counter only ever moves forward: it isn't undone by a rollback, so
    lowering it during a restore that then fails would leave it below the
    ids still in the table."""
    if db.engine.dialect.name != 'postgresql':
        return
    for m in models:
        t = m.__table__.name
        seq = f"pg_get_serial_sequence('\"{t}\"', 'id')"
        db.session.execute(db.text(
            f"SELECT setval({seq}, GREATEST(COALESCE((SELECT MAX(id) FROM \"{t}\"), 0) + 1, nextval({seq})), false)"))

def _restore_data(data):
    """Records point at each other by id (an invoice at its supplier, a
    shift entry or dispatch at its part, a PFMEA row at its part, a skill
    at its documents), so every restored row keeps its original id.

    A complete backup (backupFormat >= 2) is a snapshot: the database is put
    back exactly as it was — modules that were empty at backup time end up
    empty, and settings take the backed-up values. Older files keep the
    previous, cautious behaviour: only what the file contains is replaced.
    """
    fmt = data.get('backupFormat')
    full = isinstance(fmt, int) and not isinstance(fmt, bool) and fmt >= 2
    keep_ids, renumber = [], []      # (row, wanted id) / rows that get a new id

    def place(row, wanted, taken):
        wanted = _valid_id(wanted)
        if wanted and wanted not in taken:
            row.id = wanted
            taken.add(wanted)
            keep_ids.append(row)
        else:
            renumber.append(row)

    # Documents — replaced only if the file actually contains a documents
    # list; a file without one must not wipe them.
    docs_in = data.get('documents')
    doc_count = 0
    doc_id_map = {}  # old document id (in the backup) -> new id after restore
    new_docs = []
    if docs_in is not None:
        Document.query.delete()
        taken = set()
        for d in docs_in:
            place(Document(
                doc_number=d.get('docNumber'), title=d.get('title'),
                doc_type=d.get('docType'), revision=d.get('revision'),
                status=d.get('status'), content=d.get('content',''),
                created_by=d.get('createdBy',''), approved_by=d.get('approvedBy',''),
                created_date=d.get('createdDate',''), approved_date=d.get('approvedDate',''),
                extra=json.dumps(d.get('extra',{}))
            ), d.get('id'), taken)
            doc_count += 1

    # Module records
    skip_keys = {'exportedAt','exportedBy','appVersion','backupFormat','company','documents',
                 'versions','audit','users','customDocTypes','settings','records','backupErrors','rm_lots'}
    modules_in = {k: v for k, v in data.items()
                  if k not in skip_keys and isinstance(v, list) and (v or full)}
    if 'versions' in data and isinstance(data['versions'], list) and (data['versions'] or full):
        modules_in['versions'] = data['versions']   # document versions are module records too
    settings_in = data.get('settings') or {}
    if data.get('customDocTypes') and 'customDocTypes' not in settings_in:
        settings_in = {**settings_in, 'customDocTypes': data['customDocTypes']}

    kept_settings = {}
    if full:
        # Snapshot: clear every module. Settings aren't referenced by id, so
        # they're taken out and re-added afterwards with fresh ids — that way
        # they can never sit on an id a restored record needs.
        for r in GenericRecord.query.filter(GenericRecord.module.startswith('setting_', autoescape=True)).all():
            key = r.module[len('setting_'):]
            if key not in settings_in:
                kept_settings[key] = r.data
        GenericRecord.query.delete()
    else:
        for key in modules_in:
            GenericRecord.query.filter_by(module=key).delete()
    db.session.flush()
    taken = {rid for (rid,) in db.session.query(GenericRecord.id).all()}

    module_count = 0
    for key, rows in modules_in.items():
        for rec in rows:
            nr = {k:v for k,v in rec.items() if k not in ('id','_rid')}
            place(GenericRecord(module=key, data=json.dumps(nr)), rec.get('id'), taken)
            module_count += 1

    # Audit log — only replaced if the file actually contains entries, so a
    # backup without any can't wipe the trail. Document ids are kept on
    # restore, so each entry still points at its document.
    audit_in = data.get('audit')
    audit_count = 0
    if isinstance(audit_in, list) and audit_in:
        AuditLog.query.delete()
        for a in audit_in:
            try:
                ts = datetime.fromisoformat(str(a.get('timestamp')))
            except (TypeError, ValueError):
                ts = datetime.utcnow()
            db.session.add(AuditLog(
                action=a.get('action',''), module='documents', doc_id=a.get('docId'),
                user=a.get('user',''), notes=a.get('notes'),
                detail=a.get('notes'), timestamp=ts))
            audit_count += 1

    # RM lots — replaced only if the file holds them (a complete backup always
    # does, even when empty).
    rm_in = data.get('rm_lots')
    rm_count = 0
    if isinstance(rm_in, list) and (rm_in or full):
        RMLot.query.delete()
        taken_lots = set()
        for l in rm_in:
            place(RMLot(
                lot_number=l.get('lotNumber'), date=l.get('date',''),
                grade=l.get('grade',''), supplier=l.get('supplier',''),
                invoice=l.get('invoice',''), approved_by=l.get('approvedBy',''),
                spectro=l.get('spectro',''), bundles=l.get('bundles',1),
                weight_kg=_to_float(l.get('weightKg'))
            ), l.get('id'), taken_lots)
            rm_count += 1

    # Rows with their original id go in first; then the id counters are moved
    # past them, and only then do rows needing a new id (and settings) get one.
    db.session.add_all(keep_ids)
    db.session.flush()
    _reset_id_sequences(Document, GenericRecord, RMLot)
    db.session.add_all(renumber)

    for key, value in settings_in.items():
        # Older files only fill in settings that don't exist yet (unchanged behaviour)
        if full or not GenericRecord.query.filter_by(module='setting_'+key).first():
            db.session.add(GenericRecord(module='setting_'+key, data=json.dumps(value)))
    for key, raw in kept_settings.items():
        db.session.add(GenericRecord(module='setting_'+key, data=raw))

    db.session.commit()
    result = {'ok': True, 'complete': full, 'documents': doc_count,
              'records': module_count, 'rmLots': rm_count, 'audit': audit_count,
              'renumbered': len(renumber)}
    if data.get('backupErrors'):
        result['backupErrors'] = len(data['backupErrors'])
    return result


# ══════════════════════════════════════════════════════
#  WORK INSTRUCTIONS (step-by-step documents with photos)
#  A WI/SOP made in the step builder is an ordinary Document (same number
#  series, revisions and approval) whose extra.format is 'steps'; its steps
#  live on the version record under 'wi'. Step photos are stored one per
#  GenericRecord under module 'wiph_<token>' — the indexed module column
#  makes the token lookup fast, and the normal backup/restore carries them
#  with no extra code. The token is random and unguessable, so photos can
#  be served without a login to the phone view opened from the printed QR.
# ══════════════════════════════════════════════════════
WI_PHOTO_PREFIX = 'wiph_'
WI_PHOTO_TYPES = ('image/jpeg', 'image/png', 'image/webp')
WI_PHOTO_MAX_BYTES = 4 * 1024 * 1024
_WI_TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{16,40}$')

def _wi_store_photo(raw_bytes, mime, created_by=''):
    token = secrets.token_urlsafe(18)
    db.session.add(GenericRecord(module=WI_PHOTO_PREFIX + token, data=json.dumps({
        'mime': mime, 'b64': base64.b64encode(raw_bytes).decode('ascii'),
        'createdBy': created_by, 'createdAt': datetime.utcnow().isoformat()})))
    return token

@app.route('/api/wi/photos', methods=['POST'])
def wi_upload_photo():
    d = body_or_empty()
    m = re.match(r'^data:(image/[a-z]+);base64,(.+)$', str(d.get('dataUrl', '')), re.S)
    if not m or m.group(1) not in WI_PHOTO_TYPES:
        return jsonify({'error': 'Send a JPG, PNG or WEBP image'}), 400
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (ValueError, TypeError):
        return jsonify({'error': 'The image data is damaged'}), 400
    if not raw or len(raw) > WI_PHOTO_MAX_BYTES:
        return jsonify({'error': 'Image is empty or larger than 4 MB'}), 400
    token = _wi_store_photo(raw, m.group(1), _current_user_name() or '')
    db.session.commit()
    return jsonify({'token': token})

@app.route('/api/public/wi-photo/<token>', methods=['GET'])
def wi_get_photo(token):
    if not _WI_TOKEN_RE.match(token or ''):
        return jsonify({'error': 'Not found'}), 404
    r = GenericRecord.query.filter_by(module=WI_PHOTO_PREFIX + token).first()
    d = safe_json_loads(r.data, {}) if r else {}
    if not d.get('b64'):
        return jsonify({'error': 'Not found'}), 404
    try:
        raw = base64.b64decode(d['b64'])
    except (ValueError, TypeError):
        return jsonify({'error': 'Not found'}), 404
    resp = Response(raw, mimetype=d.get('mime') if d.get('mime') in WI_PHOTO_TYPES else 'image/jpeg')
    # A token always points at the same bytes (edits create a new photo).
    resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return resp

def _wi_active_version(doc_id):
    best = None
    for r in GenericRecord.query.filter_by(module='versions').order_by(GenericRecord.id.asc()).all():
        v = safe_json_loads(r.data, {})
        if v.get('docId') == doc_id and v.get('status') == 'ACTIVE':
            best = v
    return best

@app.route('/api/public/wi/<doc_number>', methods=['GET'])
def wi_public_doc(doc_number):
    # Phone view opened from the QR on a printed WI. Only ever returns the
    # current APPROVED revision of a step-format document — drafts, pending
    # and rejected revisions are never shown here.
    doc = Document.query.filter_by(doc_number=doc_number).first()
    if not doc or safe_json_loads(doc.extra, {}).get('format') != 'steps':
        return jsonify({'error': 'Not found'}), 404
    v = _wi_active_version(doc.id)
    if not v:
        return jsonify({'error': 'This document has no approved revision yet'}), 404
    wi = v.get('wi') or {}
    return jsonify({
        'docNumber': doc.doc_number, 'title': doc.title, 'docType': doc.doc_type,
        'revision': v.get('revision'), 'approvedBy': v.get('approvedBy', ''),
        'approvalDate': v.get('approvalDate', ''),
        'revisionInProgress': doc.revision if doc.revision != v.get('revision') else None,
        'wi': {k: wi.get(k) for k in ('photos', 'machineLabel', 'partLabel', 'area', 'instruments', 'ppe', 'steps')},
    })

@app.route('/wi/<doc_number>')
def wi_phone_page(doc_number):
    return send_from_directory('static', 'wi.html')

# ── Demo work instructions (seeded once, removable from the app) ──
WI_DEMO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_data', 'wi_demo')

def _wi_demo_html(wi):
    rows = []
    n = 0
    for s in wi['steps']:
        if s.get('kind') == 'section':
            rows.append(f"<tr><th colspan=\"3\">{s.get('text','')}</th></tr>")
            continue
        n += 1
        img = f"<img src=\"/api/public/wi-photo/{s['photo']}\" style=\"width:240px\">" if s.get('photo') else ''
        extra = ''.join(f"<div><b>{lab}:</b> {s[k]}</div>" for k, lab in
                        (('key', 'Key point'), ('check', 'Check'), ('avoid', 'Avoid')) if s.get(k))
        rows.append(f"<tr><td>{n}</td><td>{img}</td><td><p>{s.get('text','')}</p>{extra}</td></tr>")
    return '<table>' + ''.join(rows) + '</table>'

def seed_wi_demo():
    if GenericRecord.query.filter_by(module='setting_wiDemoSeeded').first():
        return
    if not os.path.isdir(WI_DEMO_DIR):
        return
    def photo(name):
        with open(os.path.join(WI_DEMO_DIR, name), 'rb') as f:
            return _wi_store_photo(f.read(), 'image/jpeg', 'Demo')
    def recs(module):
        out = []
        for r in GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.asc()).all():
            d = safe_json_loads(r.data, {}); d['id'] = r.id; out.append(d)
        return out
    gauges = [g for g in recs('calGauges') if (g.get('status') or 'Active') == 'Active']
    vern = next((g for g in gauges if 'vernier' in str(g.get('name', '')).lower()), gauges[0] if gauges else None)
    parts = recs('prodParts'); part = next((p for p in parts if not p.get('demo')), parts[0] if parts else None)
    inst = [{'id': vern['id'], 'gaugeId': vern.get('gaugeId', ''), 'name': vern.get('name', '')}] if vern else []
    tool = vern['id'] if vern else ''
    def S(text, ph=None, **kw):
        return {'kind': 'step', 'text': text, 'photo': photo(ph) if ph else '', 'photoBase': '', 'ann': [],
                'key': kw.get('key', ''), 'check': kw.get('check', ''), 'avoid': kw.get('avoid', ''), 'tool': kw.get('tool', '')}
    def H(text): return {'kind': 'section', 'text': text}
    now = datetime.utcnow().isoformat()
    demos = [
        ('VRA-WI-DEMO-1', '[DEMO] How to measure with a vernier caliper', 'ACTIVE', {
            'photos': True, 'area': 'Inspection room / any station', 'machineId': '', 'machineLabel': '',
            'partId': '', 'partLabel': '', 'instruments': inst, 'ppe': ['Safety shoes', 'Cotton gloves'],
            'steps': [
                H('Before you start'),
                S('Wipe both jaws and the part face with a clean, lint-free cloth.', 'v1_clean.jpg',
                  check='No dust, oil or burr on the jaws.', avoid='Cleaning the jaws with emery paper or a file.'),
                S('Check the calibration sticker on the caliper.', 'v2_sticker.jpg',
                  check='Due date not crossed; gauge ID matches the gauge register.',
                  avoid='Using a caliper with an expired or missing sticker. Hand it to Quality.', tool=tool),
                S('Close the jaws fully and confirm the zero.', 'v3_zero.jpg',
                  check='Digital display reads 0.00.', key='If it does not read 0.00, press ZERO. If it still drifts, report it.'),
                H('Measuring'),
                S('Place the part deep inside the outside jaws, square to the face, and close gently with the thumb roller.', 'v4_measure.jpg',
                  key='Measure at the same marked point every time.', avoid='Forcing the jaws or measuring at the jaw tips.', tool=tool),
                S('Read the main scale, then find the vernier line that lines up exactly.', 'v5_read.jpg',
                  check='Reading = main scale + (vernier line x 0.02). Example: 12 + 0.24 = 12.24 mm.'),
                H('After use'),
                S('Clean the caliper, leave a small gap between the jaws and keep it in its box.', 'v6_store.jpg',
                  avoid='Dropping it, keeping it in a pocket or leaving it on the machine.'),
            ]}),
        ('VRA-WI-DEMO-2', '[DEMO] How to read a Quality Alert', 'DRAFT', {
            'photos': True, 'area': 'All production stations', 'machineId': '', 'machineLabel': '',
            'partId': part['id'] if part else '', 'partLabel': (f"{part.get('partNumber','')} — {part.get('partName','')}" if part else ''),
            'instruments': [], 'ppe': ['Safety shoes'],
            'steps': [
                S('Check the QA number, part number and date at the top of the alert.', 'q1_header.jpg',
                  check='The part number matches the part you are running.'),
                S('Look at the GOOD photo first. This is what an OK part looks like.', 'q2_good.jpg'),
                S('Look at the BAD photo. The red circle shows where the defect is.', 'q3_bad.jpg',
                  key='Check exactly that area on every part you make.'),
                S('Read the action box: what to do if you find this defect.', 'q4_action.jpg',
                  check='Red tag the part, put it in the quarantine bin, inform the supervisor.'),
                S('Sign the alert at your station to confirm you have read it.', 'q5_sign.jpg',
                  avoid='Starting work without reading and signing a new alert.'),
            ]}),
    ]
    for number, title, status, wi in demos:
        if Document.query.filter_by(doc_number=number).first():
            continue
        doc = Document(doc_number=number, title=title, doc_type='WI', revision='A', status=status,
                       content='', created_by='Demo (sample data)', approved_by='Demo (sample data)' if status == 'ACTIVE' else '',
                       created_date=now, approved_date=now if status == 'ACTIVE' else '',
                       extra=json.dumps({'format': 'steps', 'demo': True}))
        db.session.add(doc); db.session.flush()
        ver = {'docId': doc.id, 'revision': 'A', 'content': _wi_demo_html(wi), 'wi': wi,
               'changeSummary': 'Initial creation (sample data)', 'preparedBy': 'Demo (sample data)',
               'preparedDate': now, 'status': status}
        if status == 'ACTIVE':
            ver.update({'approvedBy': 'Demo (sample data)', 'approvalDate': now, 'approvalNotes': ''})
        db.session.add(GenericRecord(module='versions', data=json.dumps(ver)))
        db.session.add(AuditLog(action='CREATED', module='documents', doc_id=doc.id, doc_number=number,
                                user='Demo (sample data)', notes=f'"{title}" created as sample data'))
    db.session.add(GenericRecord(module='setting_wiDemoSeeded', data=json.dumps(True)))
    db.session.commit()


# ══════════════════════════════════════════════════════
#  CUSTOMER FEEDBACK — public, token-gated (no login)
#  Internal request/response records live as normal GenericRecords under
#  module 'custFeedback' (created/listed via the generic endpoints below,
#  behind the standard login gate). These two routes are the only way an
#  outside customer, with no account, can read or write a single one of
#  those records — scoped strictly to the record whose token they hold.
# ══════════════════════════════════════════════════════
CF_RATING_KEYS = ('quality', 'delivery', 'communication', 'pricing', 'overall')
# 10 Excellent · 8 Good · 6 Satisfactory · 4 Needs Improvement · 2 Unsatisfactory
CF_VALID_SCORES = (2, 4, 6, 8, 10)

def _find_feedback_by_token(token):
    for r in GenericRecord.query.filter_by(module='custFeedback').all():
        d = safe_json_loads(r.data, {})
        if d.get('token') == token:
            return r, d
    return None, None

@app.route('/api/public/feedback/<token>', methods=['GET'])
def public_feedback_get(token):
    r, d = _find_feedback_by_token(token)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    if d.get('status') == 'SUBMITTED':
        return jsonify({'error': 'This feedback link has already been used'}), 410
    return jsonify({'customerName': d.get('customerName', ''), 'reviewPeriod': d.get('reviewPeriod', '')})

@app.route('/api/public/feedback/<token>', methods=['POST'])
def public_feedback_submit(token):
    r, d = _find_feedback_by_token(token)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    if d.get('status') == 'SUBMITTED':
        return jsonify({'error': 'This feedback link has already been used'}), 410

    body = body_or_empty()
    raw_ratings = body.get('ratings')
    if not isinstance(raw_ratings, dict): raw_ratings = {}
    ratings = {}
    for key in CF_RATING_KEYS:
        try:
            val = int(raw_ratings.get(key))
        except (TypeError, ValueError):
            val = None
        if val not in CF_VALID_SCORES:
            return jsonify({'error': f'Rating for "{key}" must be one of {CF_VALID_SCORES}'}), 400
        ratings[key] = val

    respondent_name = str(body.get('respondentName', '')).strip()[:200]
    respondent_designation = str(body.get('respondentDesignation', '')).strip()[:200]
    if not respondent_name or not respondent_designation:
        return jsonify({'error': 'Respondent name and designation are required'}), 400

    d['ratings'] = ratings
    d['comments'] = str(body.get('comments', ''))[:2000]
    d['respondentName'] = respondent_name
    d['respondentDesignation'] = respondent_designation
    d['status'] = 'SUBMITTED'
    d['submittedAt'] = datetime.utcnow().isoformat()
    r.data = json.dumps(d)
    r.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  AI ASSISTANT — read-only questions about any data in the app
#  (Gemini + lookup tools in assistant.py; key from GEMINI_API_KEY)
# ══════════════════════════════════════════════════════
import assistant

def _assistant_loader():
    cache = {}
    def load(module):
        if module in cache:
            return cache[module]
        if module == '_modules':
            rows = [{'module': m, 'count': c} for m, c in
                    db.session.query(GenericRecord.module, db.func.count(GenericRecord.id)).group_by(GenericRecord.module).all()]
        elif module == '_rm_lots':
            rows = [l.to_dict() for l in RMLot.query.all()]
        elif module == '_documents':
            rows = [{'id': d.id, 'docNumber': d.doc_number, 'title': d.title, 'docType': d.doc_type,
                     'revision': d.revision, 'status': d.status, 'content': d.content or '',
                     'createdBy': d.created_by, 'approvedBy': d.approved_by,
                     'createdDate': d.created_date, 'approvedDate': d.approved_date} for d in Document.query.all()]
        elif module == '_audit':
            rows = [{'id': a.id, 'timestamp': str(a.timestamp), 'user': a.user, 'action': a.action,
                     'docNumber': a.doc_number, 'module': a.module, 'notes': a.notes or a.detail}
                    for a in AuditLog.query.order_by(AuditLog.id.desc()).limit(300).all()]
        elif module == '_users':
            rows = [{'id': u.id, 'name': u.name, 'role': u.role} for u in User.query.all()]
        else:
            rows = []
            for r in GenericRecord.query.filter_by(module=module).all():
                d = safe_json_loads(r.data, {})
                d['id'] = r.id
                rows.append(d)
        cache[module] = rows
        return rows
    return load

def _assistant_enabled():
    # Switched off by default; set ASSISTANT_ENABLED=1 in Railway to turn it on.
    return os.environ.get('ASSISTANT_ENABLED', '').strip().lower() in ('1', 'true', 'yes', 'on')

@app.route('/api/assistant/status', methods=['GET'])
def assistant_status():
    return jsonify({'enabled': _assistant_enabled()})

@app.route('/api/assistant', methods=['POST'])
def ask_assistant():
    if not _assistant_enabled():
        return jsonify({'error': 'The assistant is switched off.'}), 403
    body = request.get_json(silent=True) or {}
    msgs = body.get('messages')
    if not isinstance(msgs, list) or not msgs:
        return jsonify({'error': 'No question'}), 400
    msgs = [{'role': str(m.get('role', 'user')), 'text': str(m.get('text', ''))} for m in msgs if isinstance(m, dict)]
    try:
        reply, used = assistant.answer(msgs, _assistant_loader())
    except assistant.AssistantError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify({'reply': reply, 'tools': used})

# ── Task Manager permissions ──
# Only a task's owner or its creator may change it (status included) or
# delete it; anyone logged in can view tasks and create new ones. Checked
# here, not just in the UI, and keyed on the stored record's module so a
# task can't be changed through some other module's URL.
TASK_MODULE = 'tasks'

def _current_user_name():
    u = User.query.get(session.get('user_id')) if session.get('user_id') else None
    return u.name if u else None

def task_guard(existing, incoming=None):
    """Return an error response if the current user may not change
    `existing` (a GenericRecord, or None for a new task). When `incoming`
    is given, pins createdBy/createdAt so they can't be forged or edited."""
    me = _current_user_name()
    if existing is None:
        if incoming is not None:
            incoming['createdBy'] = me or incoming.get('createdBy', '')
        return None
    old = safe_json_loads(existing.data, {})
    if not me or me not in (old.get('owner'), old.get('createdBy')):
        return jsonify({'error': 'Only the task owner or the person who created it can change this task'}), 403
    if incoming is not None:
        incoming['createdBy'] = old.get('createdBy', '')
        if old.get('createdAt'):
            incoming['createdAt'] = old['createdAt']
    return None

@app.route('/api/<module>', methods=['GET'])
def list_generic(module):
    records = GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.desc()).all()
    return jsonify([{'id':r.id,'data':safe_json_loads(r.data, {}),'createdAt':str(r.created_at)} for r in records])

@app.route('/api/<module>', methods=['POST'])
def save_generic(module):
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    err = busy_guard(module)
    if err: return err
    # If record has an id, update instead of insert
    existing_id = d.get('id') or d.get('_rid')
    if existing_id:
        r = GenericRecord.query.get(existing_id)
        if r and r.module == module:
            clean = {k:v for k,v in d.items() if k not in ('id','_rid')}
            if module == TASK_MODULE:
                err = task_guard(r, clean)
                if err: return err
            r.data = json.dumps(clean)
            r.updated_at = datetime.utcnow()
            db.session.commit()
            return jsonify({'id': r.id})
    # New record — insert
    clean = {k:v for k,v in d.items() if k not in ('id','_rid')}
    if module == TASK_MODULE:
        task_guard(None, clean)
    r = GenericRecord(module=module, data=json.dumps(clean))
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})

@app.route('/api/<module>/<int:rid>', methods=['GET'])
def get_generic_one(module, rid):
    r = GenericRecord.query.get(rid)
    if not r: return jsonify(None), 404
    return jsonify({'id':r.id,'data':safe_json_loads(r.data, {}),'createdAt':str(r.created_at)})

@app.route('/api/<module>/<int:rid>', methods=['POST'])
def update_generic_one(module, rid):
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    err = busy_guard(module)
    if err: return err
    r = GenericRecord.query.get(rid)
    if r:
        # Record ids are shared across every module, so make sure this id
        # really belongs to the module in the URL before overwriting it.
        if r.module != module:
            return jsonify({'error': 'Not found'}), 404
        if r.module == TASK_MODULE:
            err = task_guard(r, d)
            if err: return err
        r.data = json.dumps(d)
        r.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'id': r.id})
    if module == TASK_MODULE:
        task_guard(None, d)
    r = GenericRecord(module=module, data=json.dumps(d))
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})

@app.route('/api/<module>/<int:rid>', methods=['DELETE'])
def delete_generic_one(module, rid):
    err = busy_guard(module, rid, deleting=True)
    if err: return err
    r = GenericRecord.query.get(rid)
    if r and r.module == module:
        if r.module == TASK_MODULE:
            err = task_guard(r)
            if err: return err
        db.session.delete(r)
        db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  BUSY LINK — purchase and sales invoices imported from BUSY exports
#  The browser reads the Excel/CSV file and groups its rows into invoices;
#  everything that decides what gets saved happens here, in one transaction
#  per import:
#    • purchases → busyPurchases (one per supplier bill). Raw material is
#      received at the gate first (Label Generator + Invoice / Delivery
#      entry), so a bill that needs inspection is LINKED to those receipt
#      entries when they can be found, never duplicated. A bill with no
#      receipt yet waits on the BUSY Check page.
#    • sales     → prodDispatch lines (part stock goes down)
#  Each import is a busyBatches record listing exactly what it created, so
#  it can be undone on its own. A bill is identified by its DMS supplier +
#  supplier bill no. or BUSY voucher no. + financial year; importing it again
#  is refused, and a copy that differs is reported, never overwritten.
#  Suppliers BUSY names differently are matched once and remembered as
#  aliases (busyNames); duplicates can be merged.
# ══════════════════════════════════════════════════════
BUSY_KINDS = ('purchase', 'sale')
BUSY_ITEM_MAP = 'busyItemMap'                     # setting: item key -> what the item is
BUSY_SUPPLIER_CHOICES = 'busySupplierChoices'     # setting: BUSY party key -> 'new' (decided: not an existing supplier)
BUSY_CUSTOMER_MAP = 'busyCustomerMap'             # setting: BUSY customer name key -> customer name used in the DMS
BUSY_MANAGED = ('busyPurchases', 'busyBatches')   # only written through /api/busy/*
BUSY_PURCHASE_TYPES = ('rm', 'inspect', 'none')   # raw material / needs QC / no inspection
BUSY_SALE_TYPES = ('part', 'skip')                # a part (dispatch) / not a part (freight etc.)
BUSY_TIMINGS = ('OnTime', 'Within5', 'After5')
BUSY_RECEIPT_DAYS = 60                            # a receipt is looked for within this many days of the bill
BUSY_QTY_TOLERANCE = 0.005                        # 0.5 % (at least 1 unit) before quantities count as different
_KG_PER_UNIT = {'KG': 1, 'KGS': 1, 'KILOGRAM': 1, 'KILOGRAMS': 1, 'MT': 1000, 'TON': 1000, 'TONS': 1000,
                'TONNE': 1000, 'TONNES': 1000, 'QTL': 100, 'QUINTAL': 100, 'QUINTALS': 100}
_BUSY_NAME_NOISE = re.compile(r'\b(M\s*/\s*S|MESSRS|THE|PVT|PRIVATE|LTD|LIMITED|LLP|CO|COMPANY|AND)\b\.?')

def _bnorm(v):
    return re.sub(r'[^A-Z0-9]', '', str(v or '').upper())

def _bparty_name_key(name):
    n = str(name or '').upper().strip()
    n = re.sub(r'^M\s*/\s*S\.?\s+|^MESSRS\.?\s+', '', n)
    return _bnorm(n)

def _bloose(name):
    """Name with M/s, Pvt, Ltd … removed — for suggesting a match, never for deciding one."""
    return _bnorm(_BUSY_NAME_NOISE.sub(' ', str(name or '').upper().replace('&', ' ')))

def _bdigits(v):
    return re.sub(r'\D', '', str(v or '')).lstrip('0')

def _bnumbers(*values):
    """All the ways a bill / voucher number may have been written: exact, and digits only."""
    out = set()
    for v in values:
        n = _bnorm(v)
        if n: out.add('N' + n)
        d = _bdigits(v)
        if len(d) >= 2: out.add('D' + d)
    return out

def _bgstin(v):
    g = _bnorm(v)
    return g if len(g) == 15 else ''

def _bparty_key(inv):
    return _bgstin(inv.get('gstin')) or _bparty_name_key(inv.get('party'))

def _bfy(date_str):
    y, m = int(date_str[:4]), int(date_str[5:7])
    return f'{y}-{y+1}' if m >= 4 else f'{y-1}-{y}'

def _bday(s):
    try: return datetime.strptime(str(s or '')[:10], '%Y-%m-%d')
    except ValueError: return None

def _bnear(a, b, days=BUSY_RECEIPT_DAYS):
    da, dbb = _bday(a), _bday(b)
    return bool(da and dbb and abs((da - dbb).days) <= days)

def _bitem_key(kind, item):
    return ('P|' if kind == 'purchase' else 'S|') + _bnorm(item)

def _bnum(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None

def _bclean_invoice(kind, inv):
    """Validate one invoice sent by the browser. Returns (clean, error)."""
    if not isinstance(inv, dict):
        return None, 'not an invoice'
    date = str(inv.get('date') or '')
    try:
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        return None, 'date missing or not understood'
    party = str(inv.get('party') or '').strip()
    vch, bill = str(inv.get('vchNo') or '').strip(), str(inv.get('billNo') or '').strip()
    if not party:
        return None, 'party (supplier / customer) name missing'
    number = bill or vch if kind == 'purchase' else vch
    if not number:
        return None, 'bill / voucher number missing'
    lines = []
    for ln in inv.get('lines') or []:
        if not isinstance(ln, dict):
            continue
        item = str(ln.get('item') or '').strip()
        qty, amount, rate = _bnum(ln.get('qty')), _bnum(ln.get('amount')), _bnum(ln.get('rate'))
        if not item:
            continue
        if qty is None or qty < 0:
            return None, f'quantity for "{item}" missing or not a number'
        lines.append({'item': item, 'qty': qty, 'unit': str(ln.get('unit') or '').strip(),
                      'rate': rate, 'amount': amount})
    if not lines:
        return None, 'no item lines'
    clean = {'date': date, 'party': party, 'gstin': _bgstin(inv.get('gstin')), 'vchNo': vch,
             'billNo': bill, 'lines': lines}
    clean['key'] = ('P|' + _bparty_key(clean) if kind == 'purchase' else 'S') + '|' + _bnorm(number) + '|' + _bfy(date)
    sig = [clean['date'], _bparty_name_key(party)] + sorted(
        [_bnorm(l['item']), round(l['qty'], 3), round(l['amount'] or 0, 2)] for l in lines)
    clean['hash'] = hashlib.sha1(json.dumps(sig).encode()).hexdigest()
    return clean, None

def _brows(module):
    return [(r, safe_json_loads(r.data, {})) for r in GenericRecord.query.filter_by(module=module).all()]

def _bvendor_approved(v):
    return ((v.get('sample1') or {}).get('decision') == 'ACCEPT' and
            (v.get('sample2') or {}).get('decision') == 'ACCEPT' and v.get('includeInApprovedList') == 'Y')

def _bvendor_names(v):
    return [n for n in [v.get('name'), v.get('busyName')] + list(v.get('busyNames') or []) if n]

def _bkg(line):
    f = _KG_PER_UNIT.get(_bnorm(line.get('unit')))
    return None if f is None else line['qty'] * f

def _bdiffers(a, b):
    return abs((a or 0) - (b or 0)) > max(1.0, BUSY_QTY_TOLERANCE * max(abs(a or 0), abs(b or 0)))

class _BusyIndex:
    """What already exists, loaded once per request."""
    def __init__(self, kind):
        self.kind = kind
        self.vendors = _brows('purVendors')
        self.vendor_by_id = {r.id: v for r, v in self.vendors}
        self.by_gstin, self.by_name, self.by_alias = {}, {}, {}
        for r, v in self.vendors:
            self._index_vendor(r, v)
        self.saved_choices = _bsetting(BUSY_SUPPLIER_CHOICES)
        self.parts = {r.id: d for r, d in _brows('prodParts')}
        self.item_map = _bitem_map()
        if kind == 'purchase':
            self.purchases = _brows('busyPurchases')
            self.imported = {d.get('key'): d.get('hash') for _, d in self.purchases}
            self.by_vendor_fy = {}
            self.linked_vls, self.linked_lots, self.inspection_vls = set(), set(), set()
            for r, d in self.purchases:
                self.by_vendor_fy.setdefault((d.get('vendorId'), _bfy(d['date'])), []).append(d)
                link, insp = d.get('link') or {}, d.get('inspection') or {}
                self.linked_vls.update(link.get('vendorLotIds') or [])
                self.linked_lots.update(link.get('rmLotIds') or [])
                self.linked_lots.update(insp.get('rmLotIds') or [])
                if insp.get('vendorLotId'): self.inspection_vls.add(insp['vendorLotId'])
            self.vendor_lots = [(r, d) for r, d in _brows('purVendorLots') if not d.get('busyPurchaseId')]
            self.rm_lots = [l.to_dict() for l in RMLot.query.all()]
        else:
            self.imported = {}
            self.customer_map = _bsetting(BUSY_CUSTOMER_MAP)
            self.manual, self.manual_sig = set(), set()
            for _, d in _brows('prodDispatch'):
                if d.get('busyKey'):
                    self.imported.setdefault(d['busyKey'], d.get('busyHash'))
                else:
                    if d.get('invoice'): self.manual |= _bnumbers(d['invoice'])
                    self.manual_sig.add((d.get('date'), d.get('partId'), _bnum(d.get('qty'))))

    def _index_vendor(self, r, v):
        g = _bgstin(v.get('gstNo'))
        if g: self.by_gstin.setdefault(g, (r, v))
        for n in _bvendor_names(v):
            k = _bparty_name_key(n)
            if k: self.by_name.setdefault(k, (r, v))
        for n in [v.get('busyName')] + list(v.get('busyNames') or []):   # names BUSY uses for it (decided)
            k = _bparty_name_key(n)
            if k: self.by_alias[k] = (r, v)

    def resolve(self, inv, supplier_map=None):
        """(vendor id or None, row info). A GSTIN match is certain. A name-only match
        is used unless other suppliers look alike (likely duplicates) — then the user
        is asked, as for a name the DMS doesn't know."""
        g = inv.get('gstin')
        hit = (g and self.by_gstin.get(g)) or self.by_alias.get(_bparty_name_key(inv['party']))
        sug = []
        if not hit:
            hit = self.by_name.get(_bparty_name_key(inv['party']))
            sug = self.suggest_vendors(inv)
            if hit and len({x['id'] for x in sug} | {hit[0].id}) > 1:
                hit = None
        if hit:
            return hit[0].id, {'id': hit[0].id, 'name': hit[1].get('name'), 'approved': _bvendor_approved(hit[1]),
                               'needsApproval': hit[1].get('approvalNeeded') != 'N'}
        choice = _bsupplier_choice(supplier_map, inv, self)
        vid = choice if isinstance(choice, int) else None
        return vid, {'id': vid, 'name': inv['party'], 'unknown': True, 'choice': choice, 'suggestions': sug}

    def suggest_vendors(self, inv):
        """Existing suppliers that look like this BUSY party (for the user to confirm)."""
        k = _bloose(inv['party'])
        out = []
        if len(k) < 3:
            return out
        for r, v in self.vendors:
            for n in _bvendor_names(v):
                lk = _bloose(n)
                if lk and (lk == k or (min(len(lk), len(k)) >= 4 and (lk in k or k in lk))):
                    out.append({'id': r.id, 'name': v.get('name'), 'supNumber': v.get('supNumber'),
                                'gstNo': v.get('gstNo') or '', 'exact': lk == k})
                    break
        return sorted(out, key=lambda x: not x['exact'])[:6]

    def status(self, inv, vid=None):
        """new / imported / changed / manual (sales only: looks like an entry made by hand)."""
        if inv['key'] in self.imported:
            return 'imported' if self.imported[inv['key']] == inv['hash'] else 'changed'
        if self.kind == 'purchase':
            if vid:
                nums = _bnumbers(inv['billNo'], inv['vchNo'])
                for d in self.by_vendor_fy.get((vid, _bfy(inv['date'])), []):
                    if nums & _bnumbers(d.get('billNo'), d.get('vchNo')):
                        return 'imported' if d.get('hash') == inv['hash'] else 'changed'
            return 'new'
        if _bnumbers(inv['vchNo']) & self.manual:
            return 'manual'
        for l in inv['lines']:
            m = self.line_map(l['item'])
            if m and m['type'] == 'part' and (inv['date'], m['partId'], l['qty']) in self.manual_sig:
                return 'manual'
        return 'new'

    def receipts(self, vid, date, nums, grades, broad=False):
        """Gate receipts (Invoice / Delivery entries and RM lots) that belong to this bill.
        broad=True also returns entries without a matching number, for the user to pick from."""
        if not vid:
            return [], []
        names = {_bloose(n) for n in _bvendor_names(self.vendor_by_id.get(vid, {}))} - {''}
        days = 90 if broad else BUSY_RECEIPT_DAYS
        vls = []
        for r, d in self.vendor_lots:
            if d.get('vendorId') != vid or r.id in self.linked_vls or not _bnear(d.get('date'), date, days):
                continue
            hit = bool(nums & _bnumbers(d.get('refNo')))
            if hit or broad:
                vls.append({'id': r.id, 'refNo': d.get('refNo'), 'date': d.get('date'), 'qtyReceived': d.get('qtyReceived'),
                            'qtyRejected': d.get('qtyRejected'), 'timing': d.get('timing'), 'numberMatch': hit})
        lots = []
        for l in self.rm_lots:
            if l['id'] in self.linked_lots or not _bnear(l.get('date'), date, days):
                continue
            lk = _bloose(l.get('supplier'))
            same_sup = bool(lk) and any(lk == n or (min(len(lk), len(n)) >= 4 and (lk in n or n in lk)) for n in names)
            hit = same_sup and bool(nums & _bnumbers(l.get('invoice'))) and (not grades or l.get('grade') in grades)
            if hit or (broad and same_sup):
                lots.append({**l, 'numberMatch': hit})
        return vls, lots

    def line_map(self, item):
        m = self.item_map.get(_bitem_key(self.kind, item))
        if not isinstance(m, dict):
            return None
        if self.kind == 'purchase':
            if m.get('type') not in BUSY_PURCHASE_TYPES: return None
            if m['type'] == 'rm' and not _master_grade(m.get('grade')): return None
        else:
            if m.get('type') not in BUSY_SALE_TYPES: return None
            if m['type'] == 'part' and m.get('partId') not in self.parts: return None
        return m

def _bsetting(key):
    r = GenericRecord.query.filter_by(module='setting_' + key).first()
    return safe_json_loads(r.data, {}) if r else {}

def _bput_setting(key, value):
    r = GenericRecord.query.filter_by(module='setting_' + key).first()
    if r:
        r.data = json.dumps(value); r.updated_at = datetime.utcnow()
    else:
        db.session.add(GenericRecord(module='setting_' + key, data=json.dumps(value)))

def _bitem_map():
    return _bsetting(BUSY_ITEM_MAP)

def _bsave_item_map(updates, kind):
    """Merge the item matches chosen in the preview into the saved map (validated)."""
    if not isinstance(updates, dict) or not updates:
        return None
    parts = {r.id for r in GenericRecord.query.filter_by(module='prodParts').all()}
    clean = {}
    for k, m in updates.items():
        if not isinstance(m, dict) or not isinstance(k, str):
            return f'item match for "{k}" is not valid'
        t = m.get('type')
        if kind == 'purchase' and k.startswith('P|') and t in BUSY_PURCHASE_TYPES:
            if t == 'rm':
                g = _master_grade(m.get('grade'))
                if not g: return f'grade for "{m.get("item") or k}" is not in the Grade Master'
                clean[k] = {'type': 'rm', 'grade': g, 'item': m.get('item')}
            else:
                clean[k] = {'type': t, 'item': m.get('item')}
        elif kind == 'sale' and k.startswith('S|') and t in BUSY_SALE_TYPES:
            if t == 'part':
                if m.get('partId') not in parts: return f'part for "{m.get("item") or k}" not found'
                clean[k] = {'type': 'part', 'partId': m['partId'], 'item': m.get('item')}
            else:
                clean[k] = {'type': 'skip', 'item': m.get('item')}
        else:
            return f'item match for "{m.get("item") or k}" is not valid'
    r = GenericRecord.query.filter_by(module='setting_' + BUSY_ITEM_MAP).first()
    cur = safe_json_loads(r.data, {}) if r else {}
    cur.update(clean)
    if r:
        r.data = json.dumps(cur); r.updated_at = datetime.utcnow()
    else:
        db.session.add(GenericRecord(module='setting_' + BUSY_ITEM_MAP, data=json.dumps(cur)))
    db.session.flush()
    return None

def _bparse_request():
    d = json_object_body()
    if d is None:
        return None, None, (jsonify(BAD_BODY[0]), 400)
    kind = d.get('kind')
    if kind not in BUSY_KINDS:
        return None, None, (jsonify({'error': 'kind must be purchase or sale'}), 400)
    if not isinstance(d.get('invoices'), list) or not d['invoices']:
        return None, None, (jsonify({'error': 'No invoices found in the file'}), 400)
    return d, kind, None

def _bsupplier_choice(supplier_map, inv, idx):
    """The supplier the user picked for an unknown BUSY party: a vendor id, 'new', or None (not chosen)."""
    pk = _bparty_key(inv)
    c = (supplier_map or {}).get(pk) or idx.saved_choices.get(pk)
    if c == 'new':
        return 'new'
    if isinstance(c, int) and not isinstance(c, bool) and c in idx.vendor_by_id:
        return c
    return None

def _bpreview(kind, invoices, supplier_map=None):
    idx = _BusyIndex(kind)
    out, unknown, seen = [], {}, set()
    for i, raw in enumerate(invoices):
        inv, err = _bclean_invoice(kind, raw)
        row = {'index': i, 'ref': (raw or {}).get('ref') if isinstance(raw, dict) else None}
        if err:
            row.update(status='error', error=err); out.append(row); continue
        row.update(key=inv['key'], partyKey=_bparty_key(inv), date=inv['date'], party=inv['party'],
                   number=inv['billNo'] or inv['vchNo'], lines=len(inv['lines']),
                   qty=sum(l['qty'] for l in inv['lines']), amount=sum(l['amount'] or 0 for l in inv['lines']))
        if inv['key'] in seen:
            row.update(status='error', error='appears twice in this file'); out.append(row); continue
        seen.add(inv['key'])
        vid = None
        if kind == 'purchase':
            vid, row['vendor'] = idx.resolve(inv, supplier_map)
        row['status'] = idx.status(inv, vid)
        grades = set()
        for l in inv['lines']:
            m = idx.line_map(l['item'])
            if not m:
                k = _bitem_key(kind, l['item'])
                u = unknown.setdefault(k, {'key': k, 'item': l['item'], 'unit': l['unit'], 'invoices': 0})
                u['invoices'] += 1
            elif m['type'] == 'rm':
                grades.add(_master_grade(m['grade']))
        if kind == 'purchase' and vid and row['status'] == 'new':
            vls, lots = idx.receipts(vid, inv['date'], _bnumbers(inv['billNo'], inv['vchNo']), grades)
            row['receipt'] = {'vendorLots': len(vls), 'rmLots': len(lots)}
        out.append(row)
    return out, list(unknown.values()), idx

@app.route('/api/busy/preview', methods=['POST'])
def busy_preview():
    d, kind, err = _bparse_request()
    if err: return err
    rows, unknown, _ = _bpreview(kind, d['invoices'], d.get('supplierMap'))
    counts = {}
    for r in rows: counts[r['status']] = counts.get(r['status'], 0) + 1
    return jsonify({'invoices': rows, 'unknownItems': unknown, 'counts': counts})

def _bnext_sup_number(vendors):
    n = 0
    for _, v in vendors:
        m = re.search(r'(\d+)\s*$', str(v.get('supNumber') or ''))
        if m: n = max(n, int(m.group(1)))
    return f'VRA-SUP-{n+1:03d}'

def _block_imports():
    # One import at a time: two people importing the same file at once must
    # not both see every bill as new. (SQLite already serialises writers.)
    if db.engine.dialect.name == 'postgresql':
        db.session.execute(db.text('SELECT pg_advisory_xact_lock(7316201)'))

def _bremember_alias(vr, v, inv):
    """BUSY calls this supplier something else — remember it (and its GSTIN) for next time."""
    names = list(v.get('busyNames') or [])
    if _bparty_name_key(inv['party']) not in {_bparty_name_key(n) for n in [v.get('busyName')] + names}:
        names.append(inv['party'])
    v['busyNames'] = names
    if inv['gstin'] and not _bgstin(v.get('gstNo')):
        v['gstNo'] = inv['gstin']
    vr.data = json.dumps(v); vr.updated_at = datetime.utcnow()

@app.route('/api/busy/import', methods=['POST'])
def busy_import():
    d, kind, err = _bparse_request()
    if err: return err
    force = set(k for k in (d.get('includeManual') or []) if isinstance(k, str))
    supplier_map = d.get('supplierMap') if isinstance(d.get('supplierMap'), dict) else {}
    user = _current_user_name() or ''
    now = datetime.utcnow().isoformat()
    try:
        _block_imports()
        e = _bsave_item_map(d.get('itemMap'), kind)
        if e:
            db.session.rollback()
            return jsonify({'error': e}), 400
        rows, unknown, idx = _bpreview(kind, d['invoices'], supplier_map)
        take = [r for r in rows if r['status'] == 'new' or (r['status'] == 'manual' and r['key'] in force)]
        need = {u['item'] for u in unknown}
        blocked = [r for r in take if any(not idx.line_map(l['item'])
                   for l in _bclean_invoice(kind, d['invoices'][r['index']])[0]['lines'])]
        if blocked:
            db.session.rollback()
            return jsonify({'error': 'Some items are not matched yet: ' + ', '.join(sorted(need)[:10]),
                            'unknownItems': unknown}), 400
        undecided = sorted({r['party'] for r in take if kind == 'purchase' and r['vendor'].get('unknown')
                            and r['vendor']['suggestions'] and not r['vendor'].get('choice')})
        if undecided:
            db.session.rollback()
            return jsonify({'error': 'Choose whether these suppliers are new or already in the DMS: ' + ', '.join(undecided[:10])}), 400
        if not take:
            db.session.rollback()
            return jsonify({'error': 'Nothing new to import — every invoice in the file is already in, changed, or has an error.'}), 400

        batch = GenericRecord(module='busyBatches', data='{}')
        db.session.add(batch); db.session.flush()
        created = {'busyPurchases': [], 'prodDispatch': [], 'purVendors': []}
        linked = 0
        new_vendors = {}
        for r in take:
            inv = _bclean_invoice(kind, d['invoices'][r['index']])[0]
            if kind == 'purchase':
                vid, vinfo = idx.resolve(inv, supplier_map)
                choice = vinfo.get('choice')
                if not vinfo.get('unknown'):
                    pass
                elif isinstance(choice, int):
                    vr = GenericRecord.query.get(vid)
                    _bremember_alias(vr, idx.vendor_by_id[vid], inv)
                    idx._index_vendor(vr, idx.vendor_by_id[vid])
                else:
                    pk = _bparty_key(inv)
                    if pk not in new_vendors:
                        rec = {'supNumber': _bnext_sup_number(idx.vendors), 'date': inv['date'], 'name': inv['party'],
                               'busyName': inv['party'], 'gstNo': inv['gstin'], 'source': 'BUSY',
                               'createdAt': now, 'createdBy': user, 'busyBatchId': batch.id}
                        vr = GenericRecord(module='purVendors', data=json.dumps(rec))
                        db.session.add(vr); db.session.flush()
                        idx.vendors.append((vr, rec)); idx.vendor_by_id[vr.id] = rec
                        idx._index_vendor(vr, rec)
                        new_vendors[pk] = vr.id
                        created['purVendors'].append(vr.id)
                    vid = new_vendors[pk]
                lines = []
                for l in inv['lines']:
                    m = idx.line_map(l['item'])
                    lines.append({**l, 'type': m['type'], **({'grade': _master_grade(m['grade'])} if m['type'] == 'rm' else {})})
                # rent, electricity … suppliers (no approval needed) never wait for a gate receipt
                needs = any(l['type'] in ('rm', 'inspect') for l in lines) and idx.vendor_by_id.get(vid, {}).get('approvalNeeded') != 'N'
                rec = {'key': inv['key'], 'hash': inv['hash'], 'batchId': batch.id, 'vendorId': vid,
                       'party': inv['party'], 'gstin': inv['gstin'], 'billNo': inv['billNo'], 'vchNo': inv['vchNo'],
                       'date': inv['date'], 'lines': lines, 'total': sum(l['amount'] or 0 for l in lines),
                       'status': 'awaiting' if needs else 'not-required', 'importedAt': now, 'importedBy': user}
                if needs:
                    vls, lots = idx.receipts(vid, inv['date'], _bnumbers(inv['billNo'], inv['vchNo']),
                                             {l['grade'] for l in lines if l['type'] == 'rm'})
                    if vls or lots:
                        rec['status'] = 'matched'
                        rec['link'] = {'vendorLotIds': [x['id'] for x in vls], 'rmLotIds': [x['id'] for x in lots],
                                       'auto': True, 'by': user, 'at': now}
                        idx.linked_vls.update(rec['link']['vendorLotIds']); idx.linked_lots.update(rec['link']['rmLotIds'])
                        linked += 1
                pr = GenericRecord(module='busyPurchases', data=json.dumps(rec))
                db.session.add(pr); db.session.flush()
                created['busyPurchases'].append(pr.id)
                idx.by_vendor_fy.setdefault((vid, _bfy(inv['date'])), []).append(rec)
            else:
                for l in inv['lines']:
                    m = idx.line_map(l['item'])
                    if m['type'] != 'part' or l['qty'] <= 0:
                        continue
                    rec = {'date': inv['date'], 'partId': m['partId'], 'qty': l['qty'],
                           'customer': idx.customer_map.get(_bparty_name_key(inv['party'])) or inv['party'], 'busyParty': inv['party'],
                           'invoice': inv['vchNo'], 'remark': 'From BUSY', 'source': 'BUSY', 'busyKey': inv['key'],
                           'busyHash': inv['hash'], 'busyItem': l['item'], 'rate': l['rate'], 'amount': l['amount'],
                           'batchId': batch.id, 'createdBy': user}
                    dr = GenericRecord(module='prodDispatch', data=json.dumps(rec))
                    db.session.add(dr); db.session.flush()
                    created['prodDispatch'].append(dr.id)
        counts = {}
        for r in rows: counts[r['status']] = counts.get(r['status'], 0) + 1
        info = {'kind': kind, 'fileName': str(d.get('fileName') or '')[:200], 'importedAt': now, 'importedBy': user,
                'invoices': len(take), 'created': created, 'fileCounts': counts, 'status': 'active', 'linked': linked}
        batch.data = json.dumps(info)
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Import failed — nothing was saved. ({ex})'}), 500
    return jsonify({'ok': True, 'batchId': batch.id, 'invoices': len(take), 'linked': linked,
                    'created': {k: len(v) for k, v in created.items()},
                    'skipped': {k: v for k, v in counts.items() if k != 'new'}})

@app.route('/api/busy/batches/<int:bid>/undo', methods=['POST'])
def busy_undo(bid):
    err = require_admin()
    if err: return err
    b = GenericRecord.query.get(bid)
    info = safe_json_loads(b.data, {}) if b and b.module == 'busyBatches' else None
    if not info:
        return jsonify({'error': 'Import not found'}), 404
    if info.get('status') != 'active':
        return jsonify({'error': 'This import was already undone'}), 400
    created = info.get('created') or {}
    pids = set(created.get('busyPurchases') or [])
    rows = {r.id: (r, safe_json_loads(r.data, {})) for r in GenericRecord.query.filter(GenericRecord.id.in_(pids)).all()} if pids else {}
    inspected = [d.get('billNo') or d.get('vchNo') for r, d in rows.values() if d.get('status') == 'inspected']
    if inspected:
        return jsonify({'error': 'Undo the receipt made from BUSY for these bills first: ' + ', '.join(inspected[:15])}), 409
    try:
        removed = 0
        for module in ('busyPurchases', 'prodDispatch'):
            for rid in created.get(module) or []:
                r = GenericRecord.query.get(rid)
                if r and r.module == module and safe_json_loads(r.data, {}).get('batchId') == bid:
                    db.session.delete(r); removed += 1
        db.session.flush()
        kept = []
        for vid in created.get('purVendors') or []:
            r = GenericRecord.query.get(vid)
            if not r or r.module != 'purVendors':
                continue
            v = safe_json_loads(r.data, {})
            used = any(dd.get('vendorId') == vid for m in ('busyPurchases', 'purVendorLots') for _, dd in _brows(m))
            touched = (v.get('sample1') or v.get('sample2') or v.get('includeInApprovedList') or v.get('updatedAt'))
            if used or touched:
                kept.append(v.get('name'))
            else:
                db.session.delete(r); removed += 1
        info.update(status='undone', undoneAt=datetime.utcnow().isoformat(), undoneBy=_current_user_name() or '',
                    keptSuppliers=kept)
        b.data = json.dumps(info)
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Undo failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True, 'removed': removed, 'keptSuppliers': kept})

def _bnext_lot_number(date_str, taken):
    ds = date_str[8:10] + date_str[5:7] + date_str[2:4]
    prefix = f'VRA-RM-{ds}-'
    used = {l.lot_number for l in RMLot.query.filter(RMLot.lot_number.like(prefix + '%')).all()} | taken
    n = 1
    while f'{prefix}{n:02d}' in used: n += 1
    num = f'{prefix}{n:02d}'
    taken.add(num)
    return num

def _bpurchase(pid):
    r = GenericRecord.query.get(pid)
    p = safe_json_loads(r.data, {}) if r and r.module == 'busyPurchases' else None
    return r, p

def _bremove_inspection(p):
    """Delete the rating entry and RM lots a 'receipt made from BUSY' created."""
    insp = p.get('inspection') or {}
    vl = GenericRecord.query.get(insp.get('vendorLotId')) if insp.get('vendorLotId') else None
    if vl and vl.module == 'purVendorLots':
        db.session.delete(vl)
    for lid in insp.get('rmLotIds') or []:
        lot = RMLot.query.get(lid)
        if lot: db.session.delete(lot)
    p.setdefault('history', []).append({'removedInspection': insp, 'by': _current_user_name() or '',
                                        'at': datetime.utcnow().isoformat()})
    p.pop('inspection', None)

# "Make receipt from BUSY": for a bill whose material was NOT entered at the
# gate — creates the rating entry and RM lots from the bill.
@app.route('/api/busy/purchases/<int:pid>/inspect', methods=['POST'])
def busy_inspect(pid):
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    r, p = _bpurchase(pid)
    if not p:
        return jsonify({'error': 'Purchase not found'}), 404
    if p.get('status') != 'awaiting':
        return jsonify({'error': 'This bill already has a receipt'}), 409
    recv = str(d.get('receivedDate') or p['date'])
    try: datetime.strptime(recv, '%Y-%m-%d')
    except ValueError: return jsonify({'error': 'Received date is not valid'}), 400
    timing = d.get('timing')
    if timing not in BUSY_TIMINGS:
        return jsonify({'error': 'Choose the delivery timing'}), 400
    given = {x.get('idx'): x for x in d.get('lines') or [] if isinstance(x, dict)}
    vendor = GenericRecord.query.get(p['vendorId'])
    vname = safe_json_loads(vendor.data, {}).get('name') if vendor else p.get('party')
    user = _current_user_name() or ''
    try:
        lots, taken, tot_q, tot_rej, units, insp_lines = [], set(), 0.0, 0.0, set(), []
        for i, l in enumerate(p['lines']):
            if l.get('type') not in ('rm', 'inspect'):
                continue
            x = given.get(i) or {}
            rej = _bnum(x.get('rejected')) or 0
            if rej < 0 or rej > l['qty']:
                db.session.rollback()
                return jsonify({'error': f'Rejected qty for "{l["item"]}" must be between 0 and {l["qty"]}'}), 400
            acc = l['qty'] - rej
            tot_q += l['qty']; tot_rej += rej; units.add(l.get('unit') or '')
            entry = {'idx': i, 'item': l['item'], 'qty': l['qty'], 'rejected': rej, 'accepted': acc}
            if l['type'] == 'rm':
                grade = _master_grade(l.get('grade'))
                if not grade:
                    db.session.rollback()
                    return jsonify({'error': f'Grade "{l.get("grade")}" for "{l["item"]}" is no longer in the Grade Master'}), 400
                factor = _KG_PER_UNIT.get(_bnorm(l.get('unit')))
                if factor is None:
                    db.session.rollback()
                    return jsonify({'error': f'"{l["item"]}" is in "{l.get("unit") or "no unit"}" — raw material must be in kg, MT or quintal to become a lot'}), 400
                spectro = x.get('spectro') if x.get('spectro') in ('Done', 'Pending', 'Not Required') else 'Pending'
                approver = str(x.get('approvedBy') or '').strip()
                if not approver:
                    db.session.rollback()
                    return jsonify({'error': f'"Approved by" is required for raw material "{l["item"]}"'}), 400
                try: bundles = max(1, int(x.get('bundles') or 1))
                except (TypeError, ValueError): bundles = 1
                lot = RMLot(lot_number=_bnext_lot_number(recv, taken), date=recv, grade=grade, supplier=vname,
                            invoice=p.get('billNo') or p.get('vchNo'), approved_by=approver, spectro=spectro,
                            bundles=bundles, weight_kg=round(acc * factor, 3))
                db.session.add(lot); db.session.flush()
                lots.append(lot.id)
                entry.update(lotId=lot.id, lotNumber=lot.lot_number, spectro=spectro, approvedBy=approver, bundles=bundles)
            insp_lines.append(entry)
        lot_rec = {'vendorId': p['vendorId'], 'refNo': p.get('billNo') or p.get('vchNo'), 'date': recv,
                   'qtyReceived': tot_q, 'qtyRejected': tot_rej, 'qtyAccepted': tot_q - tot_rej, 'timing': timing,
                   'remarks': str(d.get('remarks') or '').strip(), 'source': 'BUSY', 'busyPurchaseId': pid,
                   'unit': units.pop() if len(units) == 1 else 'mixed', 'createdAt': datetime.utcnow().isoformat()}
        vl = GenericRecord(module='purVendorLots', data=json.dumps(lot_rec))
        db.session.add(vl); db.session.flush()
        p.update(status='inspected', inspection={'receivedDate': recv, 'timing': timing, 'remarks': lot_rec['remarks'],
                 'lines': insp_lines, 'vendorLotId': vl.id, 'rmLotIds': lots, 'by': user, 'at': datetime.utcnow().isoformat()})
        r.data = json.dumps(p); r.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Save failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True, 'vendorLotId': vl.id, 'rmLots': [RMLot.query.get(i).to_dict() for i in lots]})

@app.route('/api/busy/purchases/<int:pid>/inspect', methods=['DELETE'])
def busy_undo_inspect(pid):
    r, p = _bpurchase(pid)
    if not p:
        return jsonify({'error': 'Purchase not found'}), 404
    if p.get('status') != 'inspected':
        return jsonify({'error': 'This bill has no receipt made from BUSY'}), 409
    try:
        _bremove_inspection(p)
        p['status'] = 'awaiting'
        r.data = json.dumps(p); r.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Undo failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True})

@app.route('/api/busy/purchases/<int:pid>/candidates', methods=['GET'])
def busy_candidates(pid):
    """Gate receipts this bill could be linked to (number matches first)."""
    r, p = _bpurchase(pid)
    if not p:
        return jsonify({'error': 'Purchase not found'}), 404
    idx = _BusyIndex('purchase')
    link = p.get('link') or {}
    idx.linked_vls -= set(link.get('vendorLotIds') or []); idx.linked_lots -= set(link.get('rmLotIds') or [])
    grades = {l.get('grade') for l in p['lines'] if l.get('type') == 'rm'}
    vls, lots = idx.receipts(p['vendorId'], p['date'], _bnumbers(p.get('billNo'), p.get('vchNo')), grades, broad=True)
    key = lambda x: (not x['numberMatch'], abs((_bday(x.get('date')) - _bday(p['date'])).days) if _bday(x.get('date')) else 999)
    return jsonify({'vendorLots': sorted(vls, key=key), 'rmLots': sorted(lots, key=key),
                    'linked': {'vendorLotIds': link.get('vendorLotIds') or [], 'rmLotIds': link.get('rmLotIds') or []}})

@app.route('/api/busy/purchases/<int:pid>/link', methods=['POST'])
def busy_link(pid):
    """Link a bill to the receipts entered at the gate. With replaceInspection,
    a receipt that was made from BUSY (a duplicate) is removed first."""
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    r, p = _bpurchase(pid)
    if not p:
        return jsonify({'error': 'Purchase not found'}), 404
    vl_ids = [x for x in d.get('vendorLotIds') or [] if isinstance(x, int)]
    lot_ids = [x for x in d.get('rmLotIds') or [] if isinstance(x, int)]
    if not vl_ids and not lot_ids:
        return jsonify({'error': 'Pick at least one receipt entry or RM lot'}), 400
    if p.get('status') == 'inspected' and not d.get('replaceInspection'):
        return jsonify({'error': 'This bill has a receipt made from BUSY — choose to replace it'}), 409
    if p.get('status') not in ('awaiting', 'matched', 'inspected'):
        return jsonify({'error': 'This bill does not need a receipt'}), 409
    idx = _BusyIndex('purchase')
    own = p.get('link') or {}
    idx.linked_vls -= set(own.get('vendorLotIds') or []); idx.linked_lots -= set(own.get('rmLotIds') or [])
    insp_lots = set((p.get('inspection') or {}).get('rmLotIds') or [])
    manual = {rr.id: dd for rr, dd in idx.vendor_lots}
    for i in vl_ids:
        if i not in manual or manual[i].get('vendorId') != p['vendorId']:
            return jsonify({'error': 'That receipt entry belongs to another supplier or no longer exists'}), 400
        if i in idx.linked_vls:
            return jsonify({'error': f'Receipt entry {manual[i].get("refNo")} is already linked to another BUSY bill'}), 409
    lots = {l['id'] for l in idx.rm_lots}
    for i in lot_ids:
        if i not in lots or i in insp_lots:
            return jsonify({'error': 'That RM lot no longer exists'}), 400
        if i in idx.linked_lots:
            return jsonify({'error': 'That RM lot is already linked to another BUSY bill'}), 409
    try:
        if p.get('status') == 'inspected':
            _bremove_inspection(p)
        p['status'] = 'matched'
        p['link'] = {'vendorLotIds': vl_ids, 'rmLotIds': lot_ids, 'auto': False,
                     'by': _current_user_name() or '', 'at': datetime.utcnow().isoformat()}
        r.data = json.dumps(p); r.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Link failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True})

@app.route('/api/busy/purchases/<int:pid>/link', methods=['DELETE'])
def busy_unlink(pid):
    r, p = _bpurchase(pid)
    if not p:
        return jsonify({'error': 'Purchase not found'}), 404
    if p.get('status') != 'matched':
        return jsonify({'error': 'This bill is not linked'}), 409
    p['status'] = 'awaiting'
    p.setdefault('history', []).append({'unlinked': p.pop('link', None), 'by': _current_user_name() or '',
                                        'at': datetime.utcnow().isoformat()})
    r.data = json.dumps(p); r.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/busy/rematch', methods=['POST'])
def busy_rematch():
    """Look again for gate receipts of every bill still waiting for one."""
    idx = _BusyIndex('purchase')
    n, now, user = 0, datetime.utcnow().isoformat(), _current_user_name() or ''
    for r, p in idx.purchases:
        if p.get('status') != 'awaiting':
            continue
        vls, lots = idx.receipts(p['vendorId'], p['date'], _bnumbers(p.get('billNo'), p.get('vchNo')),
                                 {l.get('grade') for l in p['lines'] if l.get('type') == 'rm'})
        if vls or lots:
            p['status'] = 'matched'
            p['link'] = {'vendorLotIds': [x['id'] for x in vls], 'rmLotIds': [x['id'] for x in lots],
                         'auto': True, 'by': user, 'at': now}
            idx.linked_vls.update(p['link']['vendorLotIds']); idx.linked_lots.update(p['link']['rmLotIds'])
            r.data = json.dumps(p); r.updated_at = datetime.utcnow()
            n += 1
    db.session.commit()
    return jsonify({'ok': True, 'linked': n})

@app.route('/api/busy/check', methods=['GET'])
def busy_check():
    """BUSY ↔ DMS check for a period: bills without a gate receipt, linked
    bills whose quantities differ, receipts made twice, and gate receipts
    with no BUSY bill yet."""
    frm, to = str(request.args.get('from') or ''), str(request.args.get('to') or '')
    if not (_bday(frm) and _bday(to)):
        return jsonify({'error': 'Give a from and to date'}), 400
    idx = _BusyIndex('purchase')
    vl_by_id = {rr.id: dd for rr, dd in _brows('purVendorLots')}
    lot_by_id = {l['id']: l for l in idx.rm_lots}
    vname = lambda vid: (idx.vendor_by_id.get(vid) or {}).get('name')
    inside = lambda s: frm <= str(s or '')[:10] <= to
    out = {'noReceipt': [], 'differs': [], 'duplicates': [], 'notBilled': {'vendorLots': [], 'rmLots': []},
           'counts': {'bills': 0, 'matched': 0, 'madeFromBusy': 0, 'noInspection': 0}}
    for r, p in idx.purchases:
        if not inside(p.get('date')):
            continue
        out['counts']['bills'] += 1
        base = {'id': r.id, 'date': p['date'], 'billNo': p.get('billNo') or p.get('vchNo'), 'supplier': vname(p['vendorId']) or p.get('party'),
                'lines': [{'item': l['item'], 'qty': l['qty'], 'unit': l.get('unit'), 'type': l.get('type'), 'grade': l.get('grade')} for l in p['lines']]}
        st = p.get('status')
        if st == 'awaiting' and (idx.vendor_by_id.get(p['vendorId']) or {}).get('approvalNeeded') == 'N':
            st = 'not-required'                       # supplier marked "no approval needed" after import
        if st == 'not-required':
            out['counts']['noInspection'] += 1
        elif st == 'awaiting':
            out['noReceipt'].append(base)
        elif st == 'inspected':
            out['counts']['madeFromBusy'] += 1
            vls, lots = idx.receipts(p['vendorId'], p['date'], _bnumbers(p.get('billNo'), p.get('vchNo')),
                                     {l.get('grade') for l in p['lines'] if l.get('type') == 'rm'})
            if vls or lots:
                out['duplicates'].append({**base, 'manualVendorLots': vls, 'manualRmLots': lots,
                                          'busyLots': [lot_by_id[i] for i in (p.get('inspection') or {}).get('rmLotIds') or [] if i in lot_by_id]})
        elif st == 'matched':
            out['counts']['matched'] += 1
            link = p.get('link') or {}
            vls = [vl_by_id[i] for i in link.get('vendorLotIds') or [] if i in vl_by_id]
            lots = [lot_by_id[i] for i in link.get('rmLotIds') or [] if i in lot_by_id]
            issues = []
            billed = sum(l['qty'] for l in p['lines'] if l.get('type') in ('rm', 'inspect'))
            if not vls:
                issues.append('No Invoice / Delivery entry (supplier rating) linked')
            elif _bdiffers(billed, sum(_bnum(v.get('qtyReceived')) or 0 for v in vls)):
                issues.append(f'Billed {billed:g}, receipt entry says {sum(_bnum(v.get("qtyReceived")) or 0 for v in vls):g}')
            rm_lines = [l for l in p['lines'] if l.get('type') == 'rm']
            for g in sorted({l.get('grade') for l in rm_lines}):
                if not [l for l in lots if l.get('grade') == g]:
                    issues.append(f'No RM lot for {g}')
            kg = [_bkg(l) for l in rm_lines]
            if rm_lines and lots and None not in kg:
                # lots hold what was accepted: billed minus what the gate entry rejected
                rejected = sum(_bnum(v.get('qtyRejected')) or 0 for v in vls)
                want, have = sum(kg) - rejected, sum(_bnum(l.get('weightKg')) or 0 for l in lots)
                if _bdiffers(want, have):
                    issues.append(f'RM lots {have:g} kg, but billed {sum(kg):g} kg' + (f' − {rejected:g} rejected' if rejected else ''))
            if issues:
                out['differs'].append({**base, 'issues': issues})
    for rr, d in idx.vendor_lots:
        if inside(d.get('date')) and rr.id not in idx.linked_vls:
            out['notBilled']['vendorLots'].append({'id': rr.id, 'date': d.get('date'), 'refNo': d.get('refNo'),
                                                  'supplier': vname(d.get('vendorId')), 'qtyReceived': d.get('qtyReceived')})
    for l in idx.rm_lots:
        if inside(l.get('date')) and l['id'] not in idx.linked_lots:
            out['notBilled']['rmLots'].append(l)
    return jsonify(out)

@app.route('/api/admin/merge/suppliers', methods=['POST'])
def busy_merge_suppliers():
    """Merge a duplicate supplier into the one to keep: its bills and rating
    entries move across and its names become aliases of the kept supplier."""
    err = require_admin()
    if err: return err
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    fr, to = GenericRecord.query.get(d.get('fromId')), GenericRecord.query.get(d.get('toId'))
    if not fr or not to or fr.module != 'purVendors' or to.module != 'purVendors' or fr.id == to.id:
        return jsonify({'error': 'Pick two different suppliers'}), 400
    vf, vt = safe_json_loads(fr.data, {}), safe_json_loads(to.data, {})
    has_approval = lambda v: bool(v.get('sample1') or v.get('sample2') or v.get('includeInApprovedList') == 'Y')
    if has_approval(vf) and not has_approval(vt):
        return jsonify({'error': f'{vf.get("name")} has approval / sample records and {vt.get("name")} has none — merge the other way round.'}), 400
    g1, g2 = _bgstin(vf.get('gstNo')), _bgstin(vt.get('gstNo'))
    if g1 and g2 and g1 != g2:
        return jsonify({'error': f'They have different GST numbers ({g1} / {g2}) — they are different suppliers.'}), 400
    try:
        moved = 0
        for module in ('busyPurchases', 'purVendorLots'):
            for r, x in _brows(module):
                if x.get('vendorId') == fr.id:
                    x['vendorId'] = to.id; r.data = json.dumps(x); r.updated_at = datetime.utcnow(); moved += 1
        names = list(vt.get('busyNames') or [])
        have = {_bparty_name_key(n) for n in _bvendor_names(vt)}
        for n in _bvendor_names(vf):
            if _bparty_name_key(n) not in have:
                names.append(n); have.add(_bparty_name_key(n))
        vt['busyNames'] = names
        if g1 and not g2: vt['gstNo'] = vf.get('gstNo')
        vt.setdefault('mergedFrom', []).append({'supNumber': vf.get('supNumber'), 'name': vf.get('name'),
                                                'by': _current_user_name() or '', 'at': datetime.utcnow().isoformat()})
        to.data = json.dumps(vt); to.updated_at = datetime.utcnow()
        db.session.delete(fr)
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Merge failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True, 'moved': moved, 'kept': vt.get('name')})

def _blinked_ids():
    vls, lots, refs = set(), set(), {}
    for _, p in _brows('busyPurchases'):
        bill = p.get('billNo') or p.get('vchNo')
        for i in (p.get('link') or {}).get('vendorLotIds') or []: vls.add(i); refs[('vl', i)] = bill
        for i in ((p.get('link') or {}).get('rmLotIds') or []) + ((p.get('inspection') or {}).get('rmLotIds') or []):
            lots.add(i); refs[('lot', i)] = bill
    return vls, lots, refs

def busy_guard(module, rid=None, deleting=False):
    """Records the BUSY link depends on can't be changed around it."""
    if module in BUSY_MANAGED:
        return jsonify({'error': 'Change BUSY imports from the BUSY pages (undo the import, or unlink / undo the receipt).'}), 409
    if rid is None or not deleting:
        return None
    r = GenericRecord.query.get(rid)
    d = safe_json_loads(r.data, {}) if r and r.module == module else {}
    if module == 'purVendorLots':
        if d.get('busyPurchaseId'):
            return jsonify({'error': 'This entry was made from a BUSY bill — undo it on the BUSY Purchases page instead.'}), 409
        vls, _, refs = _blinked_ids()
        if rid in vls:
            return jsonify({'error': f'This entry is linked to BUSY bill {refs[("vl", rid)]} — unlink it on the BUSY Purchases page first.'}), 409
    if module == 'purVendors' and any(x.get('vendorId') == rid for _, x in _brows('busyPurchases')):
        return jsonify({'error': 'This supplier has purchases imported from BUSY, so it cannot be deleted (use Merge for a duplicate).'}), 409
    return None

def busy_lot_guard(lid):
    _, lots, refs = _blinked_ids()
    if lid in lots:
        return jsonify({'error': f'This lot is linked to BUSY bill {refs[("lot", lid)]} — unlink it (or undo its receipt) on the BUSY Purchases page first.'}), 409
    return None

# ── First-time matching: every BUSY party / item against the DMS, answered once ──
def _dms_customer_names():
    names = {}
    for module, field in (('prodDispatch', 'customer'), ('prodParts', 'customer')):
        for _, x in _brows(module):
            n = str(x.get(field) or '').strip()
            if n: names[n] = names.get(n, 0) + 1
    return names

@app.route('/api/busy/matching/preview', methods=['POST'])
def busy_matching_preview():
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    pidx, sidx = _BusyIndex('purchase'), _BusyIndex('sale')
    sups, seen = [], set()
    for x in d.get('suppliers') or []:
        if not isinstance(x, dict) or not str(x.get('party') or '').strip(): continue
        inv = {'party': str(x['party']).strip(), 'gstin': _bgstin(x.get('gstin'))}
        pk = _bparty_key(inv)
        if pk in seen: continue
        seen.add(pk)
        vid, info = pidx.resolve(inv)
        status = 'known' if not info.get('unknown') else ('decided-new' if info.get('choice') == 'new'
                 else 'ask' if info['suggestions'] else 'new')
        sups.append({'party': inv['party'], 'gstin': inv['gstin'], 'partyKey': pk, 'status': status,
                     'vendor': {'id': vid, 'name': info.get('name')} if status == 'known' else None,
                     'suggestions': info.get('suggestions') or []})
    dms_names = _dms_customer_names()
    cmap = sidx.customer_map
    custs, seen = [], set()
    for n in d.get('customers') or []:
        n = str(n or '').strip(); k = _bparty_name_key(n)
        if not n or k in seen: continue
        seen.add(k)
        if k in cmap:
            custs.append({'name': n, 'status': 'known', 'dmsName': cmap[k]}); continue
        exact = [m for m in dms_names if _bparty_name_key(m) == k]
        lk = _bloose(n)
        like = [m for m in dms_names if m not in exact and _bloose(m) and (_bloose(m) == lk or (min(len(lk), len(_bloose(m))) >= 4 and (lk in _bloose(m) or _bloose(m) in lk)))]
        custs.append({'name': n, 'status': 'known' if exact and not like else ('ask' if exact or like else 'new'),
                      'dmsName': exact[0] if exact and not like else None, 'suggestions': exact + like})
    items = {}
    for kind, key, idx in (('purchase', 'purchaseItems', pidx), ('sale', 'saleItems', sidx)):
        out, seen = [], set()
        for x in d.get(key) or []:
            item = str((x or {}).get('item') if isinstance(x, dict) else x or '').strip()
            k = _bitem_key(kind, item)
            if not item or k in seen: continue
            seen.add(k)
            m = idx.line_map(item)
            out.append({'key': k, 'item': item, 'unit': (x or {}).get('unit', '') if isinstance(x, dict) else '',
                        'status': 'known' if m else 'ask', 'match': m})
        items[kind] = out
    return jsonify({'suppliers': sups, 'customers': custs, 'dmsCustomers': sorted(dms_names, key=str.upper),
                    'purchaseItems': items['purchase'], 'saleItems': items['sale']})

@app.route('/api/busy/matching/save', methods=['POST'])
def busy_matching_save():
    err = require_admin()
    if err: return err
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    try:
        idx = _BusyIndex('purchase')
        choices = _bsetting(BUSY_SUPPLIER_CHOICES)
        n_same = n_new = 0
        for x in d.get('suppliers') or []:
            if not isinstance(x, dict): continue
            inv = {'party': str(x.get('party') or '').strip(), 'gstin': _bgstin(x.get('gstin'))}
            if not inv['party']: continue
            pk, c = _bparty_key(inv), x.get('choice')
            if c == 'new':
                choices[pk] = 'new'; n_new += 1
            elif isinstance(c, int) and not isinstance(c, bool) and c in idx.vendor_by_id:
                vr = GenericRecord.query.get(c)
                _bremember_alias(vr, idx.vendor_by_id[c], inv)
                choices.pop(pk, None); n_same += 1
            else:
                db.session.rollback()
                return jsonify({'error': f'Choose same or different for supplier "{inv["party"]}"'}), 400
        _bput_setting(BUSY_SUPPLIER_CHOICES, choices)
        cmap = _bsetting(BUSY_CUSTOMER_MAP)
        n_cust = 0
        for x in d.get('customers') or []:
            if not isinstance(x, dict): continue
            n, to = str(x.get('name') or '').strip(), str(x.get('dmsName') or '').strip()
            if n and to:
                cmap[_bparty_name_key(n)] = to; n_cust += 1
        _bput_setting(BUSY_CUSTOMER_MAP, cmap)
        im = d.get('itemMap') if isinstance(d.get('itemMap'), dict) else {}
        for kind, pfx in (('purchase', 'P|'), ('sale', 'S|')):
            e = _bsave_item_map({k: v for k, v in im.items() if isinstance(k, str) and k.startswith(pfx)}, kind)
            if e:
                db.session.rollback()
                return jsonify({'error': e}), 400
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Save failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True, 'sameSuppliers': n_same, 'newSuppliers': n_new, 'customers': n_cust, 'items': len(im)})

# ── Invoice / Delivery Register: one bill entered as several rows ──
_TIMING_RANK = {'OnTime': 0, 'Within5': 1, 'After5': 2}

@app.route('/api/purchasing/lots/combine', methods=['POST'])
def combine_vendor_lots():
    """Combine several Invoice / Delivery entries of one bill into one delivery:
    quantities are added, the earliest date and the latest timing are kept.
    BUSY links that pointed at a removed row now point at the kept one."""
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    ids = [i for i in d.get('ids') or [] if isinstance(i, int) and not isinstance(i, bool)]
    keep = d.get('keepId')
    if len(set(ids)) < 2 or keep not in ids:
        return jsonify({'error': 'Tick at least two entries of the same bill'}), 400
    rows = {r.id: (r, safe_json_loads(r.data, {})) for r in GenericRecord.query.filter(GenericRecord.id.in_(ids)).all()
            if r.module == 'purVendorLots'}
    if len(rows) != len(set(ids)):
        return jsonify({'error': 'Some of these entries no longer exist — reload the page'}), 400
    if len({x.get('vendorId') for _, x in rows.values()}) != 1:
        return jsonify({'error': 'These entries are under different supplier records — merge the suppliers first (Merge Duplicates)'}), 400
    if any(x.get('busyPurchaseId') for _, x in rows.values()):
        return jsonify({'error': 'One of these was made from a BUSY bill — fix it on BUSY Check ("Entered twice") instead'}), 409
    try:
        num = lambda v: _bnum(v) or 0
        recv = sum(num(x.get('qtyReceived')) for _, x in rows.values())
        rej = sum(num(x.get('qtyRejected')) for _, x in rows.values())
        acc = sum(num(x.get('qtyAccepted')) if x.get('qtyAccepted') not in ('', None)
                  else max(num(x.get('qtyReceived')) - num(x.get('qtyRejected')), 0) for _, x in rows.values())
        kr, kx = rows[keep]
        kx.update(qtyReceived=recv, qtyRejected=rej, qtyAccepted=acc,
                  date=min(str(x.get('date') or '9999') for _, x in rows.values()),
                  timing=max((x.get('timing') or 'OnTime' for _, x in rows.values()), key=lambda t: _TIMING_RANK.get(t, 0)),
                  remarks='; '.join(dict.fromkeys(str(x.get('remarks') or '').strip() for _, x in rows.values() if str(x.get('remarks') or '').strip())),
                  combinedFrom=kx.get('combinedFrom', []) + [{'id': i, 'qtyReceived': x.get('qtyReceived'), 'qtyRejected': x.get('qtyRejected'),
                                                             'date': x.get('date'), 'timing': x.get('timing')} for i, (_, x) in rows.items()],
                  updatedAt=datetime.utcnow().isoformat())
        kr.data = json.dumps(kx); kr.updated_at = datetime.utcnow()
        gone = set(rows) - {keep}
        for i in gone:
            db.session.delete(rows[i][0])
        for r, p in _brows('busyPurchases'):          # keep BUSY links pointing at a row that still exists
            link = p.get('link') or {}
            ids_l = link.get('vendorLotIds') or []
            if gone & set(ids_l):
                link['vendorLotIds'] = list(dict.fromkeys(keep if i in gone else i for i in ids_l))
                r.data = json.dumps(p); r.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Combine failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True, 'combined': len(rows), 'qtyReceived': recv})

# ══════════════════════════════════════════════════════
#  MERGE DUPLICATES — parts and customer names (suppliers: above)
#  Admin only, one transaction each. Every record that points at the
#  duplicate is re-pointed at the one kept, then the duplicate is removed.
# ══════════════════════════════════════════════════════
PART_REF_MODULES = ('prodShifts', 'prodFettling', 'prodDispatch', 'prodStockAdj', 'versions')

def _repoint(obj, key, old, new):
    """Replace obj[...][key] == old with new anywhere inside obj; returns the number replaced."""
    n = 0
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key and not isinstance(v, (dict, list)) and v not in ('', None) and str(v) == str(old):
                obj[k] = new if isinstance(v, int) else str(new); n += 1
            else:
                n += _repoint(v, key, old, new)
    elif isinstance(obj, list):
        for v in obj: n += _repoint(v, key, old, new)
    return n

@app.route('/api/admin/merge/parts', methods=['POST'])
def merge_parts():
    err = require_admin()
    if err: return err
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    fr, to = GenericRecord.query.get(d.get('fromId')), GenericRecord.query.get(d.get('toId'))
    if not fr or not to or fr.module != 'prodParts' or to.module != 'prodParts' or fr.id == to.id:
        return jsonify({'error': 'Pick two different parts'}), 400
    pf, pt = safe_json_loads(fr.data, {}), safe_json_loads(to.data, {})
    try:
        moved = 0
        for module in PART_REF_MODULES:
            for r, x in _brows(module):
                n = _repoint(x, 'partId', fr.id, to.id)
                if n:
                    if module == 'versions' and isinstance(x.get('wi'), dict) and str(x['wi'].get('partId')) == str(to.id):
                        x['wi']['partLabel'] = f"{pt.get('partNumber','')} — {pt.get('partName','')}"
                    r.data = json.dumps(x); r.updated_at = datetime.utcnow(); moved += n
        m = GenericRecord.query.filter_by(module='setting_' + BUSY_ITEM_MAP).first()
        if m:
            mp = safe_json_loads(m.data, {})
            n = _repoint(mp, 'partId', fr.id, to.id)
            if n: m.data = json.dumps(mp); moved += n
        for k, v in pf.items():                         # keep details the kept part is missing
            if k not in ('demo', 'active', 'mergedFrom') and (k not in pt or pt.get(k) in ('', None, {}, [])):
                pt[k] = v
        pt.setdefault('mergedFrom', []).append({'partNumber': pf.get('partNumber'), 'partName': pf.get('partName'),
                                                'by': _current_user_name() or '', 'at': datetime.utcnow().isoformat()})
        to.data = json.dumps(pt); to.updated_at = datetime.utcnow()
        db.session.delete(fr)
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Merge failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True, 'moved': moved, 'kept': pt.get('partNumber')})

CUSTOMER_FIELDS = (('prodDispatch', 'customer'), ('prodParts', 'customer'))

@app.route('/api/admin/merge/customers', methods=['GET'])
def list_customer_names():
    names = {}
    for module, field in CUSTOMER_FIELDS:
        for _, x in _brows(module):
            n = str(x.get(field) or '').strip()
            if n: names[n] = names.get(n, 0) + 1
    return jsonify([{'name': n, 'count': c} for n, c in sorted(names.items(), key=lambda t: t[0].upper())])

@app.route('/api/admin/merge/customers', methods=['POST'])
def merge_customers():
    """Rename every use of one customer name to another (dispatches and parts)."""
    err = require_admin()
    if err: return err
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    old, new = str(d.get('from') or '').strip(), str(d.get('to') or '').strip()
    if not old or not new or old == new:
        return jsonify({'error': 'Pick the name to replace and the name to keep'}), 400
    try:
        n = 0
        for module, field in CUSTOMER_FIELDS:
            for r, x in _brows(module):
                if str(x.get(field) or '').strip() == old:
                    x[field] = new; r.data = json.dumps(x); r.updated_at = datetime.utcnow(); n += 1
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        return jsonify({'error': f'Merge failed — nothing was changed. ({ex})'}), 500
    return jsonify({'ok': True, 'changed': n})

# ══════════════════════════════════════════════════════
#  BACKUP & RESTORE
# ══════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════
#  STARTUP
# ══════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════
#  ADMIN — DEDUP
# ══════════════════════════════════════════════════════

@app.route('/api/admin/dedup/all', methods=['POST'])
def dedup_all():
    err = require_admin()
    if err: return err
    modules_to_dedup = ['hrSkillDefs','mktFeasQns','calGauges']
    results = {}
    for module in modules_to_dedup:
        records = GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.asc()).all()
        seen = set()
        deleted = 0
        for r in records:
            try:
                d = json.loads(r.data)
                # Use all values as key
                key = json.dumps(d, sort_keys=True)
                if key in seen:
                    db.session.delete(r)
                    deleted += 1
                else:
                    seen.add(key)
            except: pass
        db.session.commit()
        results[module] = {'deleted': deleted, 'remaining': GenericRecord.query.filter_by(module=module).count()}
    return jsonify(results)

@app.route('/api/admin/dedup/<module>', methods=['POST'])
def dedup_module(module):
    err = require_admin()
    if err: return err
    records = GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.asc()).all()
    seen = set()
    deleted = 0
    key_fields = {
        'hrSkillDefs': ['category','skillName'],
        'qmsPfmea': ['step','failure'],
        'qmsCp': ['step','parameter'],
        'qmsCsMaster': ['step','checkItem'],
        'mktFeasQns': ['section','question'],
    }
    fields = key_fields.get(module)
    if not fields:
        # No duplicate key defined: every record would look identical and all
        # but one would be deleted.
        return jsonify({'error': 'Dedup is not supported for this module'}), 400
    for r in records:
        try:
            d = json.loads(r.data)
            key = '|'.join(str(d.get(f,'')) for f in fields)
            if key in seen:
                db.session.delete(r)
                deleted += 1
            else:
                seen.add(key)
        except: pass
    db.session.commit()
    remaining = GenericRecord.query.filter_by(module=module).count()
    return jsonify({'ok':True,'deleted':deleted,'remaining':remaining})


def seed_users():
    if User.query.count() == 0:
        for username,password,role,name in [
            ('akshay','admin123','APPROVER','Akshay Dake'),
            ('sagar','vra@2025','CREATOR','Sagar Shirgure'),
            ('manish','vra@2025','CREATOR','Manish Yadav'),
        ]:
            db.session.add(User(username=username,password=password,role=role,name=name))
        db.session.commit()

def seed_defaults():
    """Seed default data for HR skills, MKT feasibility questions.
    Only runs if no data exists for that module."""

    # HR Skill Definitions
    if GenericRecord.query.filter_by(module='hrSkillDefs').count() == 0:
        staff_skills = [
            'Education Qualification','Work Experience','Computer Awareness',
            'ISO/IATF Awareness','Drawing Reading','Man Power Handling',
            'PDC Knowledge','Communication Skill','Die Setting',
            'Instrument Handling','Inspection Knowledge','Accounts Knowledge',
            'Marketing Knowledge','Maintenance Knowledge',
            'Stores / Purchase Knowledge','5S & Housekeeping','Safety Knowledge'
        ]
        worker_skills = [
            'ISO Awareness','CNC/VMC Machining','Job Setting',
            'Instrument / Gauge Reading','On Time Reporting','5S Awareness',
            'CNC/VMC Offset','Record Keeping','Control Plan Reading',
            'Daily Preventive Maintenance','Material Handling',
            'Communication Skills','Discipline','Conventional Machine Operating',
            'Inspection Knowledge','Packing & Dispatch','Safety Knowledge'
        ]
        for s in staff_skills:
            db.session.add(GenericRecord(module='hrSkillDefs',
                data=json.dumps({'category':'Staff','skillName':s})))
        for s in worker_skills:
            db.session.add(GenericRecord(module='hrSkillDefs',
                data=json.dumps({'category':'Worker','skillName':s})))
        db.session.commit()

    # Marketing Feasibility Questions
    if GenericRecord.query.filter_by(module='mktFeasQns').count() == 0:
        feas_qns = [
            {'section':'FEASIBILITY','question':'Is Material feasible for Manufacturing?','order':1},
            {'section':'FEASIBILITY','question':'Is machinery suitable for this Grade?','order':2},
            {'section':'FEASIBILITY','question':'Is specification / Tolerance achievable?','order':3},
            {'section':'FEASIBILITY','question':'Is there any other process or treatment required which is needed to be outsourced?','order':4},
            {'section':'FEASIBILITY','question':'Are inspection and testing facilities adequate?','order':5},
            {'section':'FEASIBILITY','question':'Is development cost paid by Customer or tooling given by the customer?','order':6},
            {'section':'FEASIBILITY','question':'Monthly Requirement Clear?','order':7},
            {'section':'FEASIBILITY','question':'Weight of Casting?','order':8},
            {'section':'FEASIBILITY','question':'Is Current Spare Capacity Available for this requirement?','order':9},
            {'section':'FEASIBILITY','question':'Is Customer Reliable?','order':10},
        ]
        for q in feas_qns:
            db.session.add(GenericRecord(module='mktFeasQns', data=json.dumps(q)))
        db.session.commit()


# ══════════════════════════════════════════════════════
#  QMS v2 — PFMEA + CONTROL PLAN + CHECKSHEET
#  Flat JSON API (returns {id, ...fields} not {id, data:{...}})
# ══════════════════════════════════════════════════════

QMS2_MODULES = [
    'qms2_grades','qms2_pfmea_templates','qms2_pfmea_parts','qms2_pfmea_rows',
    'qms2_cp_parts','qms2_cp_rows','qms2_cp_revisions',
    'qms2_cs_records','qms2_cs_results','qms2_images','qms2_cp_templates',
    'qms2_op_order',
    # Process Quality (PQ) modules
    'pq_parts','pq_pfd_steps','pq_pfmea_rows','pq_pfmea_templates','pq_cp_rows','pq_cp_templates','pq_cs_records','pq_revisions',
    'pq_grades',
]

def qms2_flat(r):
    """Return a GenericRecord as flat dict with id."""
    d = safe_json_loads(r.data, {})
    d['id'] = r.id
    d['_createdAt'] = str(r.created_at)
    return d

@app.route('/api/qms2/<module>', methods=['GET'])
def qms2_list(module):
    if module not in QMS2_MODULES:
        prefixed = 'qms2_' + module
        if prefixed in QMS2_MODULES:
            module = prefixed
        else:
            return jsonify({'error':'Unknown module'}), 400
    # Support filtering by any query param
    recs = GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.asc()).all()
    result = [qms2_flat(r) for r in recs]
    # Filter by query params (e.g. ?partId=5&archived=false)
    for key, val in request.args.items():
        try: val = int(val)
        except: val = val if val not in ('true','false') else val=='true'
        result = [r for r in result if str(r.get(key,'')) == str(val) or r.get(key) == val]
    return jsonify(result)

@app.route('/api/qms2/<module>', methods=['POST'])
def qms2_save(module):
    if module not in QMS2_MODULES:
        prefixed = 'qms2_' + module
        if prefixed in QMS2_MODULES:
            module = prefixed
        else:
            return jsonify({'error':'Unknown module'}), 400
    d = json_object_body()
    if d is None: return jsonify(BAD_BODY[0]), 400
    existing_id = d.get('id')
    clean = {k:v for k,v in d.items() if k not in ('id','_createdAt')}
    if existing_id:
        r = GenericRecord.query.get(existing_id)
        if r and r.module == module:
            r.data = json.dumps(clean)
            r.updated_at = datetime.utcnow()
            db.session.commit()
            return jsonify(qms2_flat(r))
    r = GenericRecord(module=module, data=json.dumps(clean))
    db.session.add(r)
    db.session.commit()
    return jsonify(qms2_flat(r))

@app.route('/api/qms2/<module>/<int:rid>', methods=['DELETE'])
def qms2_delete(module, rid):
    if module not in QMS2_MODULES:
        prefixed = 'qms2_' + module
        if prefixed in QMS2_MODULES:
            module = prefixed
        else:
            return jsonify({'error':'Unknown module'}), 400
    r = GenericRecord.query.get(rid)
    if r and r.module == module:
        db.session.delete(r)
        db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/qms2/<module>/bulk-delete', methods=['POST'])
def qms2_bulk_delete(module):
    """Delete all records of a module (for clean restart)."""
    err = require_admin()
    if err: return err
    if module not in QMS2_MODULES:
        prefixed = 'qms2_' + module
        if prefixed in QMS2_MODULES:
            module = prefixed
        else:
            return jsonify({'error':'Unknown module'}), 400
    body = json_object_body()
    if body is None: return jsonify(BAD_BODY[0]), 400
    ids = body.get('ids') or []
    if not isinstance(ids, list):
        return jsonify({'error': '"ids" must be a list'}), 400
    if ids:
        for rid in ids:
            r = GenericRecord.query.get(rid)
            if r and r.module == module:
                db.session.delete(r)
    else:
        GenericRecord.query.filter_by(module=module).delete()
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/qms2/impact/<int:pfmea_part_id>', methods=['GET'])
def qms2_impact(pfmea_part_id):
    """Return impact analysis for a PFMEA part change."""
    cp_parts = [qms2_flat(r) for r in GenericRecord.query.filter_by(module='qms2_cp_parts').all()
                if safe_json_loads(r.data, {}).get('pfmeaPartId') == pfmea_part_id]
    cp_ids = [c['id'] for c in cp_parts]
    cp_rows = []
    cs_records = []
    for cp_id in cp_ids:
        cp_rows += [qms2_flat(r) for r in GenericRecord.query.filter_by(module='qms2_cp_rows').all()
                    if safe_json_loads(r.data, {}).get('cpId') == cp_id]
        cs_records += [qms2_flat(r) for r in GenericRecord.query.filter_by(module='qms2_cs_records').all()
                       if safe_json_loads(r.data, {}).get('cpId') == cp_id]
    return jsonify({
        'pfmeaPartId': pfmea_part_id,
        'controlPlans': len(cp_parts),
        'cpDetails': [{'id':c['id'],'cpNumber':c.get('cpNumber'),'status':c.get('status'),'revision':c.get('revision')} for c in cp_parts],
        'characteristics': len(cp_rows),
        'checksheets': len(cs_records),
        'reactionPlans': len([r for r in cp_rows if r.get('reactionPlan')]),
    })

def seed_qms2():
    if GenericRecord.query.filter_by(module='qms2_grades').count() > 0:
        return

    GRADES = [
        {'grade':'ADC12','colourCode':'Yellow','composition':{'Si':'9.6–12.0','Fe':'≤1.3','Cu':'1.5–3.5','Mg':'≤0.30','Mn':'≤0.50','Ti':'≤0.30','Zn':'≤1.0','Ni':'≤0.50','Pb':'≤0.20','Sn':'≤0.20','Al':'Balance'}},
        {'grade':'A380','colourCode':'Red','composition':{'Si':'7.5–9.5','Fe':'≤1.3','Cu':'3.0–4.0','Mg':'≤0.10','Mn':'≤0.50','Zn':'≤3.0','Ni':'≤0.50','Sn':'≤0.35','Al':'Balance'}},
        {'grade':'A383','colourCode':'Blue','composition':{'Si':'9.5–11.5','Fe':'≤0.8','Cu':'2.0–3.0','Mg':'0.10–0.20','Mn':'≤0.50','Zn':'≤3.0','Ni':'≤0.30','Sn':'≤0.15','Al':'Balance'}},
        {'grade':'AC4B','colourCode':'','composition':{'Si':'7.0–10.0','Fe':'≤0.8','Cu':'2.0–4.0','Mg':'≤0.50','Mn':'≤0.50','Ti':'≤0.20','Zn':'≤0.10','Ni':'≤0.10','Pb':'≤0.20','Sn':'≤0.10','Al':'Balance'}},
        {'grade':'ANSi360','colourCode':'','composition':{'Si':'9.0–10.0','Fe':'≤2.0','Cu':'≤0.4','Mg':'0.40–0.60','Mn':'≤0.35','Zn':'≤0.5','Ni':'≤0.5','Sn':'≤0.15','Al':'Balance'}},
        {'grade':'LM2','colourCode':'Orange','composition':{'Si':'9.0–11.5','Fe':'≤1.0','Cu':'0.7–2.5','Mg':'≤0.30','Mn':'≤0.50','Ti':'≤0.20','Zn':'≤2.0','Ni':'≤0.50','Pb':'≤0.10','Sn':'≤0.20','Al':'Balance'}},
        {'grade':'LM6','colourCode':'Green','composition':{'Si':'10.0–13.0','Fe':'≤0.5','Cu':'≤0.2','Mg':'≤0.20','Mn':'≤0.50','Ti':'≤0.20','Zn':'≤0.1','Ni':'≤0.1','Pb':'≤0.10','Sn':'≤0.05','Al':'Balance'}},
        {'grade':'LM24','colourCode':'White','composition':{'Si':'7.5–9.5','Fe':'≤1.3','Cu':'3.0–4.0','Mg':'0.20–0.40','Mn':'≤0.50','Ti':'≤0.20','Zn':'≤3.0','Ni':'≤0.50','Pb':'≤0.30','Sn':'≤0.20','Sr':'≤0.50','Al':'Balance'}},
    ]
    for g in GRADES:
        db.session.add(GenericRecord(module='qms2_grades', data=json.dumps(g)))

    # Operation master
    OPS = [
        {'opNumber':'OP10','opName':'Incoming Inspection','processStep':'Receiving Inspection','order':1},
        {'opNumber':'OP20','opName':'Melting','processStep':'Melting','order':2},
        {'opNumber':'OP30','opName':'Die Casting','processStep':'Die Casting','order':3},
        {'opNumber':'OP40','opName':'Trimming / Fettling','processStep':'Trimming/Fettling','order':4},
        {'opNumber':'OP50','opName':'Shot Blasting','processStep':'Shot Blasting','order':5},
        {'opNumber':'OP60','opName':'Machining','processStep':'Machining','order':6},
        {'opNumber':'OP70','opName':'Final Inspection','processStep':'Final Inspection','order':7},
        {'opNumber':'OP80','opName':'Packing & Dispatch','processStep':'Packing & Dispatch','order':8},
    ]
    for op in OPS:
        db.session.add(GenericRecord(module='qms2_cp_templates', data=json.dumps(op)))

    db.session.commit()
    print("QMS2 seed data inserted")

@app.route('/api/qms2/admin/clear-cp', methods=['POST'])
def qms2_clear_cp():
    """Delete all CP parts, rows, revisions and checksheet records for a fresh start."""
    err = require_admin()
    if err: return err
    for mod in ['qms2_cp_parts','qms2_cp_rows','qms2_cp_revisions','qms2_cs_records','qms2_cs_results']:
        GenericRecord.query.filter_by(module=mod).delete()
    db.session.commit()
    return jsonify({'ok': True, 'message': 'CP data cleared'})

def seed_pq():
    if GenericRecord.query.filter_by(module='pq_parts').count() > 0:
        return
    import datetime as dt
    today = dt.date.today().isoformat()

    # Sample part
    part = GenericRecord(module='pq_parts', data=json.dumps({
        'partNumber': 'VRA-DC-001',
        'partName': 'ADC12 Die Cast Component',
        'customer': 'Sample Customer',
        'grade': 'ADC12',
        'coreTeam': ['Production Manager', 'Quality Engineer', 'Process Engineer'],
        'preparedBy': 'Quality Team',
        'date': today,
        'pfdRev': 'A', 'pfdStatus': 'Draft',
        'pfmeaRev': 'A', 'pfmeaStatus': 'Draft',
        'cpRev': 'A', 'cpStatus': 'Draft',
        'revisionHistory': {}
    }))
    db.session.add(part)
    db.session.flush()
    pid = part.id

    # PFD steps
    pfd_steps = [
        {'partId': pid, 'order': 1, 'opNumber': 'OP10', 'stepName': 'Raw Material Inspection',
         'stepType': 'inspection', 'inputs': 'Incoming ADC12 ingots', 'outputs': 'Accepted/Rejected ingots',
         'keyPoints': 'Check composition, hardness certificate, supplier CoC'},
        {'partId': pid, 'order': 2, 'opNumber': 'OP20', 'stepName': 'Melting',
         'stepType': 'operation', 'inputs': 'ADC12 ingots, returns', 'outputs': 'Molten metal at 650–680°C',
         'keyPoints': 'Temperature control, degassing, dross removal'},
        {'partId': pid, 'order': 3, 'opNumber': 'OP30', 'stepName': 'Die Casting',
         'stepType': 'operation', 'inputs': 'Molten metal, die', 'outputs': 'Cast component',
         'keyPoints': 'Injection pressure, die temp, cycle time, shot speed'},
        {'partId': pid, 'order': 4, 'opNumber': 'OP40', 'stepName': 'Trimming / Fettling',
         'stepType': 'operation', 'inputs': 'Cast component with flash', 'outputs': 'Trimmed component',
         'keyPoints': 'Remove flash and gates, no damage to part surface'},
        {'partId': pid, 'order': 5, 'opNumber': 'OP50', 'stepName': 'Shot Blasting',
         'stepType': 'operation', 'inputs': 'Trimmed component', 'outputs': 'Clean surface component',
         'keyPoints': 'Shot size, time, surface finish Ra'},
        {'partId': pid, 'order': 6, 'opNumber': 'OP60', 'stepName': 'Fettling',
         'stepType': 'operation', 'inputs': 'Shot blasted component', 'outputs': 'Deburred component',
         'keyPoints': 'Remove remaining burrs, sharp edges'},
        {'partId': pid, 'order': 7, 'opNumber': 'OP70', 'stepName': 'Machining',
         'stepType': 'operation', 'inputs': 'Fettled component', 'outputs': 'Machined component',
         'keyPoints': 'CNC parameters, tool wear, dimensional tolerances'},
        {'partId': pid, 'order': 8, 'opNumber': 'OP80', 'stepName': 'Final Inspection',
         'stepType': 'inspection', 'inputs': 'Machined component', 'outputs': 'OK / Rejected component',
         'keyPoints': 'Dimensional check, visual inspection, hardness'},
        {'partId': pid, 'order': 9, 'opNumber': 'OP90', 'stepName': 'Packing & Dispatch',
         'stepType': 'operation', 'inputs': 'Inspected OK component', 'outputs': 'Packed & labelled component',
         'keyPoints': 'Packaging material, label, quantity per box'},
    ]
    for s in pfd_steps:
        db.session.add(GenericRecord(module='pq_pfd_steps', data=json.dumps(s)))

    # PFMEA rows for the sample part are generated after the failure-mode
    # template library is seeded — see seed_pq_pfmea_rows_for_sample_part().

    # Control Plan rows
    cp_rows = [
        {'partId': pid, 'opNumber': 'OP10', 'processStep': 'Raw Material Inspection',
         'machine': 'Incoming Area', 'charNumber': 'OP10.01', 'charName': 'Chemical Composition',
         'classification': 'Critical', 'specification': 'ADC12 per JIS H5302',
         'tolerance': 'Si:9.6–12.0%, Fe:≤1.3%, Cu:1.5–3.5%', 'method': 'Spectrometer / CoC',
         'gauge': 'OES Spectrometer', 'sampleSize': '1 per batch', 'frequency': 'Every incoming lot',
         'controlMethod': 'Check supplier CoC + spectrometer test', 'reactionPlan': 'Reject lot, raise NCR',
         'remarks': '', 'includeInChecksheet': True, 'order': 1},
        {'partId': pid, 'opNumber': 'OP20', 'processStep': 'Melting',
         'machine': 'Melting Furnace', 'charNumber': 'OP20.01', 'charName': 'Metal Temperature',
         'classification': 'Critical', 'specification': '650–680°C',
         'tolerance': '±5°C', 'method': 'Digital Pyrometer',
         'gauge': 'K-type thermocouple', 'sampleSize': '1', 'frequency': 'Every 30 min',
         'controlMethod': 'Temperature log sheet, visual check', 'reactionPlan': 'Adjust furnace, do not cast if out of range',
         'remarks': '', 'includeInChecksheet': True, 'order': 2},
        {'partId': pid, 'opNumber': 'OP20', 'processStep': 'Melting',
         'machine': 'Melting Furnace', 'charNumber': 'OP20.02', 'charName': 'Degassing Time',
         'classification': 'Special', 'specification': 'Min 10 minutes',
         'tolerance': '±1 min', 'method': 'Timer',
         'gauge': 'Digital timer', 'sampleSize': '1 per heat', 'frequency': 'Every heat',
         'controlMethod': 'Timed degassing cycle on rotor', 'reactionPlan': 'Repeat degassing if time short',
         'remarks': '', 'includeInChecksheet': True, 'order': 3},
        {'partId': pid, 'opNumber': 'OP30', 'processStep': 'Die Casting',
         'machine': 'Die Casting Machine', 'charNumber': 'OP30.01', 'charName': 'Injection Pressure',
         'classification': 'Critical', 'specification': '800–1000 bar',
         'tolerance': '±50 bar', 'method': 'Machine Display',
         'gauge': 'Pressure transducer', 'sampleSize': '1 per shot', 'frequency': 'Continuous / every 10 shots',
         'controlMethod': 'Machine parameter sheet, SPC chart', 'reactionPlan': 'Stop machine, check hydraulic system',
         'remarks': '', 'includeInChecksheet': True, 'order': 4},
        {'partId': pid, 'opNumber': 'OP30', 'processStep': 'Die Casting',
         'machine': 'Die Casting Machine', 'charNumber': 'OP30.02', 'charName': 'Die Temperature',
         'classification': 'Special', 'specification': '180–220°C',
         'tolerance': '±10°C', 'method': 'Thermal Gun',
         'gauge': 'Infrared thermometer', 'sampleSize': '1', 'frequency': 'Start of shift + every 50 shots',
         'controlMethod': 'Die temperature log', 'reactionPlan': 'Wait for die to reach temp, adjust die cooling',
         'remarks': '', 'includeInChecksheet': True, 'order': 5},
        {'partId': pid, 'opNumber': 'OP30', 'processStep': 'Die Casting',
         'machine': 'Die Casting Machine', 'charNumber': 'OP30.03', 'charName': 'Visual — No Short Shot',
         'classification': 'Major', 'specification': 'No short shot / misrun',
         'tolerance': 'Zero defects', 'method': 'Visual Inspection',
         'gauge': 'Visual', 'sampleSize': '100%', 'frequency': '100%',
         'controlMethod': '100% operator visual check at press', 'reactionPlan': 'Scrap, investigate cause',
         'remarks': '', 'includeInChecksheet': True, 'order': 6},
        {'partId': pid, 'opNumber': 'OP50', 'processStep': 'Shot Blasting',
         'machine': 'Shot Blast Machine', 'charNumber': 'OP50.01', 'charName': 'Surface Finish',
         'classification': 'Minor', 'specification': 'Ra ≤ 6.3 µm',
         'tolerance': '', 'method': 'Surface Roughness Tester',
         'gauge': 'Profilometer', 'sampleSize': '2 per batch', 'frequency': 'Per batch',
         'controlMethod': 'Visual + profilometer check', 'reactionPlan': 'Re-blast or scrap if beyond limit',
         'remarks': '', 'includeInChecksheet': False, 'order': 7},
        {'partId': pid, 'opNumber': 'OP70', 'processStep': 'Machining',
         'machine': 'CNC Machining Centre', 'charNumber': 'OP70.01', 'charName': 'Critical Bore Diameter',
         'classification': 'Critical', 'specification': 'As per drawing',
         'tolerance': '±0.05 mm', 'method': 'Bore Gauge',
         'gauge': 'Digital bore gauge', 'sampleSize': 'First off + 1 per 50 pcs', 'frequency': 'First off + periodic',
         'controlMethod': 'First-off inspection, SPC chart', 'reactionPlan': 'Stop machine, re-check tool, adjust offset',
         'remarks': '', 'includeInChecksheet': True, 'order': 8},
        {'partId': pid, 'opNumber': 'OP70', 'processStep': 'Machining',
         'machine': 'CNC Machining Centre', 'charNumber': 'OP70.02', 'charName': 'Critical Length',
         'classification': 'Critical', 'specification': 'As per drawing',
         'tolerance': '±0.1 mm', 'method': 'Vernier Caliper / CMM',
         'gauge': 'Vernier caliper', 'sampleSize': 'First off + 1 per 50 pcs', 'frequency': 'First off + periodic',
         'controlMethod': 'First-off inspection record', 'reactionPlan': 'Stop, adjust, re-inspect',
         'remarks': '', 'includeInChecksheet': True, 'order': 9},
        {'partId': pid, 'opNumber': 'OP80', 'processStep': 'Final Inspection',
         'machine': 'Inspection Table', 'charNumber': 'OP80.01', 'charName': 'Visual — No Cracks / Porosity',
         'classification': 'Critical', 'specification': 'Zero visible defects',
         'tolerance': 'Zero defects', 'method': 'Visual Inspection',
         'gauge': 'Visual + 10x magnifier', 'sampleSize': '100%', 'frequency': '100%',
         'controlMethod': '100% visual by QC', 'reactionPlan': 'Isolate, segregate, raise NCR',
         'remarks': '', 'includeInChecksheet': True, 'order': 10},
        {'partId': pid, 'opNumber': 'OP80', 'processStep': 'Final Inspection',
         'machine': 'Inspection Table', 'charNumber': 'OP80.02', 'charName': 'Hardness',
         'classification': 'Special', 'specification': '75–95 HRB',
         'tolerance': '', 'method': 'Hardness Tester',
         'gauge': 'Rockwell Hardness Tester', 'sampleSize': '2 per batch', 'frequency': 'Per batch',
         'controlMethod': 'Hardness log sheet', 'reactionPlan': 'Segregate, investigate heat treatment / composition',
         'remarks': '', 'includeInChecksheet': True, 'order': 11},
    ]
    for row in cp_rows:
        db.session.add(GenericRecord(module='pq_cp_rows', data=json.dumps(row)))

    db.session.commit()


# ══════════════════════════════════════════════════════
#  PFMEA FAILURE-MODE LIBRARY (starter template)
#  Sourced from the VRA PFMEA Master Template (57 rows, OP10-OP100,
#  10 process categories). "Generate PFMEA from Process Flow" matches
#  each PFD step's name against these categories (keyword match, a
#  step can match more than one category, e.g. "Trimming / Fettling").
#  Ratings are realistic starting points — always meant to be
#  reviewed/edited per part, not used as-is.
# ══════════════════════════════════════════════════════

PFMEA_TEMPLATE_ROW_COUNT = 57

def seed_pq_pfmea_templates():
    existing = GenericRecord.query.filter_by(module='pq_pfmea_templates').count()
    if existing == PFMEA_TEMPLATE_ROW_COUNT:
        return
    if existing:
        # Old/partial library from a previous version — replace with the
        # current master-template-derived set.
        GenericRecord.query.filter_by(module='pq_pfmea_templates').delete()
        db.session.commit()

    def row(cat, function, mode, effect, sev, cause, occ, prevention, detection_ctrl, det, action, resp, order):
        return {
            'processCategory': cat, 'function': function, 'failureMode': mode,
            'failureEffect': effect, 'severity': sev, 'failureCause': cause,
            'occurrence': occ, 'preventionControls': prevention, 'detectionControls': detection_ctrl,
            'detection': det, 'rpn': sev * occ * det, 'recommendedAction': action,
            'responsibility': resp, 'order': order,
        }

    TEMPLATE_ROWS = [
        row('Raw Material Inspection', 'Verify incoming alloy grade matches purchase order', 'Wrong alloy grade received (e.g. LM24 instead of ADC12)', 'Non-conforming castings; customer rejection; scrap',
            9, 'Supplier dispatch error; missing or incorrect CoC; no incoming check', 2, 'PO-linked CoC mandatory; colour-coded rack assignment', 'Spectrometer check on receipt (OES)', 2,
            'Mandatory spectro on every heat before GRN; supplier corrective action', 'QC Inspector', 1),
        row('Raw Material Inspection', 'Verify chemical composition is within grade limits', 'Chemical composition out of specified limits', 'Porosity, brittleness, hot tearing; casting rejection',
            9, 'Supplier process deviation; recycled/mixed scrap in ingot', 3, 'Incoming spectro on every heat', 'OES Spectrometer — element-by-element check vs grade certificate', 2,
            'Reject lot; quarantine; raise supplier NCR; re-test next lot', 'QC Inspector', 2),
        row('Raw Material Inspection', 'Verify quantity and weight of incoming material', 'Short quantity or incorrect weight received', 'Production shortage; schedule disruption',
            5, 'Supplier packing error; transit loss; weighbridge error', 2, 'Weigh all lots on platform scale; match against invoice', 'Platform weighing scale; compare with invoice', 2,
            'Raise discrepancy report; inform purchase; do not consume until resolved', 'Stores In-charge', 3),
        row('Raw Material Inspection', 'Ensure physical condition of ingots is acceptable', 'Cracked, corroded or contaminated ingots received', 'Inclusions in melt; porosity; machine damage',
            7, 'Poor supplier handling; improper transit; no visual check at receipt', 2, '100% visual inspection on receipt; photographic record if rejected', 'Visual inspection under adequate lighting', 2,
            'Reject damaged ingots; raise NCR; photograph and return', 'Stores In-charge', 4),
        row('Raw Material Inspection', 'Ensure correct identification and segregated storage', 'Mixed grade storage; wrong colour code applied', 'Wrong grade used in production; mass rejection',
            8, 'No segregation system; operator error in labelling', 2, 'Colour-coded racks per grade; GRN label before storage', 'Visual check of rack label and ingot colour code', 3,
            'Re-segregate immediately; notify QC; spectro re-verify', 'Stores In-charge', 5),
        row('Raw Material Inspection', 'Ensure incoming material is dry before storage', 'Wet or moisture-laden ingots stored or used', 'Steam explosion on charging; severe hydrogen porosity',
            10, 'Open-air storage; rain exposure; no dryness check', 2, 'Covered storage mandatory; visual check before receipt', 'Visual inspection; touch test for moisture', 3,
            'Quarantine wet material; dry before use; preheat returns', 'Stores In-charge', 6),
        row('Melting', 'Melt aluminium ingot to correct temperature for casting', 'Metal temperature too low before casting', 'Cold shut; misrun; short fill; casting rejection',
            8, 'Thermocouple failure; operator not monitoring; furnace malfunction', 3, 'Digital pyrometer check before every heat; alarm at minimum threshold', 'Digital pyrometer at furnace and at machine', 2,
            'Do not cast; adjust furnace; verify temperature; re-check', 'Production In-charge', 1),
        row('Melting', 'Melt aluminium ingot to correct temperature for casting', 'Metal temperature too high / overheating', 'Excessive oxide formation; hydrogen pickup; porosity; die erosion',
            7, 'Furnace control failure; long idle holding time; inattentive operator', 2, 'Maximum temperature alarm; holding time limit per SOP', 'Digital pyrometer; furnace panel display', 3,
            'Stop casting; skim oxides; lower temperature to range; check controls', 'Production In-charge', 2),
        row('Melting', 'Maintain correct holding temperature between heats', 'Holding temperature drops below specified minimum', 'Premature solidification; cold shut; misrun',
            7, 'Holding furnace power failure; broken thermocouple; power fluctuation', 2, 'Continuous thermocouple monitoring; low-temp alarm on holding furnace', 'Panel thermocouple; pyrometer spot check every 30 min', 3,
            'Adjust holding furnace; verify temperature before next casting cycle', 'Operator', 3),
        row('Melting', 'Remove dissolved hydrogen from melt by degassing', 'Inadequate degassing — insufficient time or flux', 'Hydrogen porosity in casting; rejection at final inspection or customer',
            8, 'Operator skipped degassing; insufficient degassing time; wrong flux quantity', 3, 'Timed degassing per SOP; flux weighed before addition; log mandatory', 'Timer log; Reduced Pressure Test (RPT) sample if available', 4,
            'Re-degas; do not cast; record deviation; RPT sample check', 'Production In-charge', 4),
        row('Melting', 'Add correct flux quantity for dross removal', 'Wrong flux type or quantity added', 'Poor degassing; dross inclusions; surface defects in casting',
            7, 'Operator estimating instead of weighing; wrong flux selected', 3, 'Flux weighed on scale; type and quantity per SOP; recorded in shift log', 'Weighing scale; shift log entry', 3,
            'Add correct quantity; re-degas; record correction in log', 'Operator', 5),
        row('Melting', 'Skim dross and oxides before casting', 'Skimming not done; oxide layer carried into casting', 'Oxide inclusions; hard spots; surface defects; rejection',
            8, 'Operator skip; time pressure; no sign-off requirement', 3, 'Mandatory skim sign-off in shift log before every casting cycle', 'Visual inspection of melt surface before each ladle fill', 3,
            'Re-skim; do not cast until surface is clean; supervisory sign-off', 'Operator', 6),
        row('Melting', 'Verify chemical composition before casting', 'Composition not verified; out-of-spec metal cast', 'Non-conforming castings throughout batch; customer rejection',
            9, 'Spectro skipped; assumed OK from supplier CoC alone', 2, 'Spectro result mandatory before first casting of each heat', 'OES Spectrometer result vs grade limits', 2,
            'Halt casting; re-spectro; adjust with correct alloy; document', 'QC Inspector', 7),
        row('Melting', 'Maintain ladle in clean and pre-heated condition', 'Cold or contaminated ladle used', 'Temperature drop on transfer; contamination; cold shut',
            7, 'Ladle not pre-heated; residue from previous heat not cleaned', 2, 'Ladle pre-heat check before use; visual inspection; clean mandatory', 'Visual inspection; thermal check', 3,
            'Pre-heat ladle; clean thoroughly; do not use if cracked', 'Operator', 8),
        row('Melting', 'Maintain crucible in sound condition', 'Cracked or deteriorated crucible in use', 'Metal leakage; safety hazard; contamination of melt',
            9, 'No crucible life tracking; no inspection schedule; thermal fatigue', 2, 'Daily visual inspection; crucible life counter; replace at crack', 'Visual inspection; physical tap test for cracks', 2,
            'Replace immediately; stop production; safety check', 'Production In-charge', 9),
        row('Die Casting', 'Produce casting with complete fill to drawing geometry', 'Short fill / misrun', 'Incomplete casting; 100% scrap; production loss',
            8, 'Low metal temperature; insufficient shot pressure; blocked gate or vent', 3, 'Process parameter log; first-off inspection before production run', 'Visual inspection every casting; weight check', 2,
            'Scrap casting; check metal temp, pressure, gate; adjust; re-run first-off', 'Production In-charge', 1),
        row('Die Casting', 'Produce casting free of cold shut defects', 'Cold shut — visible seam / weak joint line on casting surface', 'Structural weakness; visual rejection; customer complaint',
            8, 'Low metal temperature; slow injection speed; poor gate design', 3, 'Metal temp monitoring; injection speed parameter check', 'Visual inspection every casting under adequate lighting', 3,
            'Scrap; increase metal temperature; review injection speed', 'Production In-charge', 2),
        row('Die Casting', 'Produce casting free of internal and surface porosity', 'Porosity — gas, shrinkage, or hydrogen', 'Leak path; structural failure; machining exposure; customer rejection',
            9, 'Trapped air; inadequate venting; hydrogen in melt; shrinkage', 4, 'Vacuum system; optimised vent design; degassing; intensification pressure', 'Visual on every casting; machining exposure check; X-ray if specified', 4,
            'Scrap; review venting; increase intensification pressure; check degassing', 'Production In-charge', 3),
        row('Die Casting', 'Maintain correct clamping force to prevent flash', 'Excessive flash on parting line and at die inserts', 'Extra material requiring trimming; dimensional risk; die damage',
            5, 'Insufficient clamping tonnage; worn parting line; damaged die face', 3, 'Clamping force set per die design requirement; die inspection at change', 'Visual every casting; parting line gap check with feeler gauge', 2,
            'Check clamping force; inspect parting line; shim or refurb die face', 'Die Setter', 4),
        row('Die Casting', 'Maintain correct metal temperature at point of injection', 'Metal temperature out of range at shot sleeve', 'Cold shut / porosity / misrun depending on direction of deviation',
            8, 'Long delay between ladle fill and shot; no machine-side monitoring', 3, 'Pyrometer check every 10 shots at machine; mandatory log', 'Digital pyrometer at machine; process parameter record', 3,
            'Stop; adjust; verify temperature; re-run first-off before continuing', 'Operator', 5),
        row('Die Casting', 'Maintain correct die temperature before and during production', 'Die too cold at start of run — below minimum operating temperature', 'Cold shut; surface defects; dimension variation on first shots',
            7, 'Insufficient warm-up shots; no die temperature verification procedure', 3, 'Minimum warm-up shots defined in process sheet; pyrometer verification', 'IR pyrometer on fixed and moving half; temperature log', 3,
            'Additional warm-up shots; re-check temperature; first-off after warm-up', 'Operator', 6),
        row('Die Casting', 'Maintain correct die temperature during sustained production', 'Die overheating — above maximum operating temperature', 'Die soldering; sticking; surface defects; accelerated die wear',
            7, 'Cooling channel blocked; insufficient die spray; high cycle rate', 3, 'Cooling water flow check; die spray timing and dilution per SOP', 'IR pyrometer; visual for die soldering / drag marks', 3,
            'Increase die spray; check cooling channels; reduce cycle rate if needed', 'Operator', 7),
        row('Die Casting', 'Apply correct die lubrication at correct spray pattern', 'Insufficient or uneven die lubrication', 'Sticking; die soldering; surface defects; premature die wear',
            7, 'Blocked nozzle; wrong dilution ratio; spray timer misadjusted', 3, 'Spray pattern visual check; dilution ratio log; nozzle inspection at shift start', 'Visual spray coverage check each cycle; dilution ratio measurement', 3,
            'Clean/replace nozzle; adjust spray timer; re-check coverage', 'Operator', 8),
        row('Die Casting', 'Maintain plunger tip in correct condition', 'Worn or cracked plunger tip', 'Metal leakback; inconsistent shot weight; porosity',
            7, 'No plunger tip life tracking; delayed replacement; no inspection schedule', 3, 'Plunger tip life counter; inspection at every die change', 'Visual inspection at die change; shot weight monitoring', 3,
            'Replace plunger tip; monitor shot weight for first 10 shots after replacement', 'Die Setter', 9),
        row('Die Casting', 'Maintain die vents in clear and functional condition', 'Blocked vents — metal or die coat buildup', 'Trapped air; gas porosity; incomplete fill',
            8, 'No vent cleaning schedule; metal splash into vents', 3, 'Vent cleaning at every die change; visual inspection before closing', 'Visual inspection of vents before die close; casting porosity monitoring', 4,
            'Clean vents; check vacuum system if fitted; run trial shots before production', 'Die Setter', 10),
        row('Die Casting', 'Maintain die cavity in correct dimensional condition', 'Die cavity wear — dimensional drift over die life', 'Out-of-tolerance castings; customer assembly failures',
            8, 'No die life tracking; no scheduled inspection; abrasive metal flow', 3, 'Die shot counter; scheduled cavity inspection at defined intervals', 'Dimensional check on castings; CMM/Vernier periodic measurement', 4,
            'Dimensional check on castings; die repair or replacement when out of tolerance', 'Tool Room / QC', 11),
        row('Die Casting', 'Produce casting to all drawing dimensions', 'Critical dimension out of tolerance', 'Assembly failure at customer; batch rejection; warranty claim',
            9, 'Die wear; thermal expansion; wrong setup; damaged insert', 2, 'First-off mandatory; periodic dimensional check per control plan', 'CMM / Vernier caliper / go-no-go gauge per drawing requirement', 3,
            'Stop production; 100% inspect batch; adjust die or process; supervisor sign-off', 'QC Inspector', 12),
        row('Trimming', 'Remove runner, gates and overflow completely from casting', 'Incomplete runner or gate removal — stub remaining', 'Assembly interference at customer; rejection; rework',
            7, 'Worn trim die; casting mislocated in die; operator skip', 2, '100% visual after trimming; go/no-go gauge for gate stub height', 'Visual + go/no-go gauge at gate locations', 2,
            'Re-trim; inspect trim die; replace if worn; raise NCR if repeated', 'Operator', 1),
        row('Trimming', 'Remove all flash from casting surfaces', 'Flash not fully removed on functional or mating surfaces', 'Assembly interference; cosmetic rejection; customer complaint',
            6, 'Operator miss; complex geometry; insufficient fettling after trim', 3, 'WI with marked flash locations; 100% visual + tactile check', '100% visual + touch on all parting lines and flash areas', 3,
            'Re-fettle; document location of miss; update WI if new flash area found', 'Operator', 2),
        row('Trimming', 'Trim casting without introducing new damage', 'Casting cracked or damaged during trimming operation', 'Structural failure; scrap; dimensional distortion',
            8, 'Casting still hot; excessive press force; wrong die clearance; misloading', 2, 'Minimum cooling time before trimming defined in SOP; die clearance check', 'Visual inspection after every trim; crack detection if critical part', 2,
            'Scrap; review cooling time; inspect die clearance; operator retraining', 'Production In-charge', 3),
        row('Trimming', 'Load casting correctly in trim die every cycle', 'Casting incorrectly loaded in trim die', 'Wrong area trimmed; casting damage; die damage; scrap',
            8, 'No locating pins; similar-looking casting faces; operator error', 2, 'Locating pins on trim die (poka-yoke); visual loading check before stroke', 'Visual check of casting seating before every press stroke', 2,
            'Stop; re-seat; inspect die; add poka-yoke if not present', 'Die Setter', 4),
        row('Trimming', 'Maintain trim die in correct condition', 'Trim die worn, chipped or misaligned', 'Inconsistent trimming; casting damage; flash not removed',
            7, 'No trim die inspection schedule; no die life tracking', 3, 'Trim die inspection at defined intervals; die life counter', 'Visual inspection at shift start and after every die change', 3,
            'Sharpen or replace die; raise work order to tool room', 'Tool Room', 5),
        row('Fettling', 'Remove all sharp edges from functional and handling surfaces', 'Sharp edge not removed from assembly or handling surface', 'Operator injury; customer assembly worker injury; rejection',
            7, 'Operator missed edge; inadequate WI; complex geometry; fatigue', 3, 'Fettling map on WI with all sharp edges marked; gloves mandatory; 100% touch check', 'Visual + tactile (gloved hand) on all marked surfaces', 3,
            'Deburr; update WI if new edge found; operator training', 'Operator', 1),
        row('Fettling', 'Remove residual flash from blind spots and internal areas', 'Flash remaining in blind spots, holes or internal cavities', 'Customer assembly failure; field complaint',
            7, 'Difficult geometry; no specific instruction for internal areas; visual miss', 3, 'Part-specific WI identifying all internal flash areas; use mirror or probe', 'Visual with mirror / air-blow probe check of internal areas', 4,
            'Re-fettle; document location; update WI; raise NCR if repeated', 'Operator', 2),
        row('Fettling', 'Complete fettling without introducing surface damage', 'Casting surface damaged during fettling — gouges, dents', 'Cosmetic rejection; dimensional change; customer complaint',
            6, 'Excessive force; wrong tool; casting slipping; no fixture', 2, 'Correct tool per WI; rubber-padded fixture if required', 'Visual inspection post-fettling', 3,
            'Segregate; assess damage vs drawing tolerance; raise NCR if rejected', 'Operator', 3),
        row('Shot Blasting', 'Clean casting surface and achieve required surface finish', 'Insufficient blasting coverage — surface not fully cleaned', 'Residual die coat / oxide; corrosion risk; poor paint or plating adhesion',
            6, 'Low cycle time; blocked nozzle; overloaded basket; low shot velocity', 2, 'Cycle time set per SOP; coverage check on first batch; nozzle inspection', 'Visual coverage check; timer log', 2,
            'Re-blast batch; check nozzle; verify cycle time setting', 'Operator', 1),
        row('Shot Blasting', 'Clean casting surface without causing physical damage', 'Surface damage — dents, peening marks, dimensional change', 'Cosmetic rejection; tolerance impact on critical surfaces',
            5, 'Excessive cycle time; wrong shot size; over-blasting thin sections', 2, 'Cycle time limit; shot size specification per part; protective masking if required', 'Visual inspection post-blast; check critical dimension if applicable', 2,
            'Remove from blaster; assess; mask critical surfaces before re-blasting', 'Operator', 2),
        row('Shot Blasting', 'Maintain correct shot media size and condition', 'Shot media degraded, undersized or contaminated', 'Poor cleaning efficiency; surface appearance inconsistency',
            5, 'No media inspection schedule; media attrition not monitored', 3, 'Weekly sieve check of shot size distribution; media top-up schedule', 'Sieve check record; visual check of blasted surface appearance', 3,
            'Replace degraded media; clean machine; re-blast affected parts', 'Operator', 3),
        row('Shot Blasting', 'Ensure no casting mix-up during blasting', 'Wrong parts or mixed parts loaded into blasting batch', 'Wrong parts processed; traceability lost; customer complaint',
            7, 'Unlabelled or mixed bins; similar-looking parts; no batch segregation', 2, 'Batch tag mandatory before blasting; one part number per basket', 'Visual check of basket tag before loading; check after unloading', 2,
            'Stop; identify and segregate; re-tag correctly; inform supervisor', 'Operator', 4),
        row('Machining', 'Machine casting to all critical dimensions on drawing', 'Critical dimension out of tolerance', 'Assembly failure at customer; batch rejection; warranty claim',
            9, 'Tool wear; fixture error; wrong offset; thermal expansion; worn spindle', 3, 'First-off 100% dimensional check; periodic check every 25 pieces', 'CMM / Vernier caliper / micrometer / go-no-go per drawing', 2,
            'Stop; 100% inspect batch; adjust CNC offsets; replace tool if worn', 'Operator / QC', 1),
        row('Machining', 'Ensure correct CNC program is loaded before production', 'Wrong program loaded — incorrect revision or wrong part program', 'Entire batch machined incorrectly; 100% scrap; high cost loss',
            10, 'Setup error; multiple programs with similar names; no verification step', 1, 'Program number + revision verified against job card before every run', 'Program name displayed on CNC controller vs job card check', 1,
            'Stop immediately; identify affected parts; scrap; supervisor sign-off; lock program', 'Operator', 2),
        row('Machining', 'Maintain cutting tool in correct condition throughout run', 'Worn, chipped or broken cutting tool', 'Out-of-tolerance dimensions; poor surface finish; scrap',
            8, 'No tool life tracking; delayed replacement; tool breakage undetected', 3, 'Tool life counter per program; inspection every 50 pieces or shift start', 'Visual tool inspection; surface finish check on machined part', 2,
            'Replace tool; 100% inspect parts machined since last tool check', 'Operator', 3),
        row('Machining', 'Locate and clamp casting correctly in machining fixture', 'Casting incorrectly located or clamped in fixture', 'All dimensions shifted; batch rejection; potential fixture damage',
            9, 'No poka-yoke; similar casting faces; worn locating pins; operator error', 2, 'Locating pin check before run; clamping force verification; poka-yoke fixture', 'Visual seating check; first-off dimensional check', 1,
            'Stop; re-locate; re-check first-off; inspect fixture pins and clamps', 'Operator', 4),
        row('Machining', 'Produce burr-free machined surfaces on functional areas', 'Burrs remaining on machined surfaces — holes, bores, faces', 'Assembly interference; injury to assembly worker; customer complaint',
            6, 'Tool wear; high feed rate; no deburring step; inadequate WI', 3, 'Deburring step mandatory after machining; 100% check per WI', 'Visual + tactile check on all machined surfaces', 2,
            'Deburr; re-inspect; check tool condition; adjust feed if recurring', 'Operator', 5),
        row('Machining', 'Maintain coolant level and flow during machining', 'Insufficient coolant — low level or blocked delivery', 'Tool overheating; surface burn; dimensional error; shortened tool life',
            6, 'No coolant level check at shift start; blocked delivery pipe; pump failure', 3, 'Coolant level and flow check at shift start; alarm if flow drops', 'Visual flow check; temperature monitoring if available', 3,
            'Top up coolant; check pump; clean filter; stop if flow not restored', 'Operator', 6),
        row('Final Inspection', 'Inspect 100% of castings for visible surface defects', 'Non-conforming casting despatched to customer — surface defects', 'Customer rejection; line stoppage; warranty claim; penalty',
            10, 'Inspection skip; inadequate lighting; operator fatigue; no AQL plan', 2, 'Mandatory 100% visual under min 500 lux; two-stage inspection if critical', '100% visual; fluorescent light inspection for critical surfaces', 3,
            'Reject non-conforming; raise NCR; root cause analysis within 24 hours', 'QC Inspector', 1),
        row('Final Inspection', 'Verify all critical and major dimensions before despatch', 'Out-of-tolerance dimension not detected and despatched', 'Customer assembly failure; field recall; warranty claim',
            10, 'Sampling plan too lenient; gauge not calibrated; measurement error', 2, 'Calibrated gauges; AQL sampling per customer or internal standard', 'CMM / Vernier / Go-No-Go gauge per inspection plan', 2,
            'Reject batch; 100% re-inspect; check gauge calibration; notify customer', 'QC Inspector', 2),
        row('Final Inspection', 'Verify correct part identification and marking on every piece', 'Unidentified parts despatched; wrong part number marked', 'Customer identification failure; line stoppage; traceability loss',
            8, 'Label printing error; manual marking illegible; no check step', 2, 'Printed label from system; 100% label check before packing sign-off', 'Visual check of label vs packing list; barcode scan if available', 2,
            'Re-label; re-verify; do not despatch without confirmed identity', 'QC Inspector', 3),
        row('Final Inspection', 'Verify quantity against despatch order before packing', 'Wrong quantity passed to packing', 'Customer short supply; line stoppage; emergency air freight cost',
            7, 'Count error; mix-up of reject and accept bins; manual count only', 2, 'Weigh-count on calibrated scale; count vs work order before releasing to packing', 'Weigh-count record vs work order', 2,
            'Recount; correct quantity; document discrepancy; inform production', 'QC Inspector', 4),
        row('Packing', 'Pack castings in correct packaging per customer standard', 'Wrong packaging type used — incorrect boxes, dividers or foam', 'Parts damaged in transit; customer rejection; rework',
            7, 'No customer packing standard available; old packing used; operator error', 2, 'Customer packing standard on file; packing WI with photos; supervisor check', 'Visual check vs packing WI / customer standard', 2,
            'Re-pack; obtain correct materials; update packing WI', 'Stores In-charge', 1),
        row('Packing', 'Pack correct quantity per box as per packing standard', 'Wrong quantity per box — over or under packed', 'Customer count error; line disruption; claim',
            6, 'Manual counting; distraction; no weigh-count step', 2, 'Weigh-count each box before sealing; weigh-count log', 'Weigh-count record per box', 2,
            'Recount box; correct quantity; re-weigh; record correction', 'Stores In-charge', 2),
        row('Packing', 'Apply correct customer label on every box', 'Incorrect, missing or illegible label applied to box', 'Customer identification failure; wrong box opened on line; rejection',
            8, 'Label printing error; wrong template used; illegible thermal print', 2, 'Label printed from system-linked template; 100% label verify before sealing', 'Visual label check vs packing list; scan if barcode used', 2,
            'Reprint label; re-verify; do not seal box without confirmed label', 'Stores In-charge', 3),
        row('Packing', 'Protect castings from damage during packing operation', 'Casting surface scratched or damaged while being packed', 'Cosmetic rejection at customer; rework cost',
            6, 'Parts dropped; no protective layer; rushing; no handling WI', 2, 'Soft gloves mandatory; foam/paper liner in box base; handling WI', 'Visual check after packing; random box inspection before sealing', 3,
            'Inspect packed box; replace damaged parts; add protective liner', 'Stores In-charge', 4),
        row('Dispatch', 'Despatch correct material against correct delivery order', 'Wrong part or wrong customer order despatched', 'Customer assembly stoppage; emergency recall; relationship damage',
            10, 'Similar-looking orders; manual process; no cross-check with DO', 1, 'Cross-check delivery order vs packing list vs loaded boxes before sealing truck', 'Document check — delivery order vs packing list vs physical boxes', 2,
            'Stop despatch; re-verify all boxes; correct before loading; supervisor sign-off', 'Stores In-charge', 1),
        row('Dispatch', 'Ensure all despatch documents are present and correct', 'Missing or incorrect documents — invoice, packing list, CoC, LR', 'Customs hold; customer rejection; payment delay; audit non-conformance',
            7, 'Documents not prepared in time; wrong revision; manual errors', 2, 'Document checklist before despatch sign-off; system-generated packing list', 'Document review checklist signed before truck loading', 2,
            'Arrange missing documents; do not release truck without complete set', 'Stores In-charge', 2),
        row('Dispatch', 'Ensure boxes are properly sealed and secured for transit', 'Improperly sealed or poorly secured boxes in transit', 'Parts damaged in transit; customer complaint; replacement cost',
            7, 'Tape running out; no strapping on heavy boxes; no vehicle check', 2, 'Sealing check before loading; strapping on boxes >5 kg; vehicle dunnage check', 'Visual check of all sealed boxes before loading', 2,
            'Re-seal; re-strap; ensure proper dunnage in vehicle before departure', 'Stores In-charge', 3),
        row('Dispatch', 'Maintain correct lot number traceability through despatch', 'Lot number not recorded on despatch documents or labels', 'Loss of traceability; cannot isolate field complaint; audit failure',
            8, 'Manual lot tracking; no system link between production and despatch', 2, 'Lot number on every label; recorded on packing list and invoice', 'Lot number check on label vs packing list before despatch', 2,
            'Add lot number to label; update packing list; do not despatch without traceability', 'QC Inspector', 4),
    ]
    for r in TEMPLATE_ROWS:
        db.session.add(GenericRecord(module='pq_pfmea_templates', data=json.dumps(r)))
    db.session.commit()
    print("PFMEA failure-mode template library seeded")


# Mirrors PFMEA_CATEGORY_KEYWORDS in static/modules/pq.js — keep both in sync.
PFMEA_CATEGORY_KEYWORDS = {
    'Raw Material Inspection': ['raw material', 'incoming', 'receiving'],
    'Melting':                 ['melt'],
    'Die Casting':             ['die cast', 'casting'],
    'Trimming':                ['trim'],
    'Fettling':                ['fettl'],
    'Shot Blasting':           ['shot blast', 'blasting'],
    'Machining':               ['machin'],
    'Final Inspection':        ['final inspection', 'final insp'],
    'Packing':                 ['pack'],
    'Dispatch':                ['dispatch', 'shipping'],
}

def _match_pfmea_categories(step_name):
    s = (step_name or '').lower()
    return [cat for cat, kws in PFMEA_CATEGORY_KEYWORDS.items() if any(k in s for k in kws)]

def seed_pq_pfmea_rows_for_sample_part():
    """Generate PFMEA rows for the seeded sample part (VRA-DC-001) from the
    template library, the same way the UI's 'Generate from Process Flow'
    button does — keeps the demo data in sync with the master template."""
    part_rec = next((r for r in GenericRecord.query.filter_by(module='pq_parts').all()
                      if safe_json_loads(r.data, {}).get('partNumber') == 'VRA-DC-001'), None)
    if not part_rec:
        return
    pid = part_rec.id
    existing_rows = GenericRecord.query.filter_by(module='pq_pfmea_rows').all()
    if any(safe_json_loads(r.data, {}).get('partId') == pid for r in existing_rows):
        return

    steps = sorted(
        [d for d in (safe_json_loads(r.data, {}) for r in GenericRecord.query.filter_by(module='pq_pfd_steps').all())
         if d.get('partId') == pid],
        key=lambda s: s.get('order', 0))
    templates = [safe_json_loads(r.data, {}) for r in GenericRecord.query.filter_by(module='pq_pfmea_templates').all()]

    order = 0
    for step in steps:
        cats = _match_pfmea_categories(step.get('stepName', ''))
        matches = [t for t in templates if t.get('processCategory') in cats]
        for t in matches:
            order += 1
            db.session.add(GenericRecord(module='pq_pfmea_rows', data=json.dumps({
                'partId': pid, 'opNumber': step.get('opNumber'), 'processStep': step.get('stepName'),
                'function': t.get('function'), 'failureMode': t.get('failureMode'), 'failureEffect': t.get('failureEffect'),
                'severity': t.get('severity'), 'failureCause': t.get('failureCause'), 'occurrence': t.get('occurrence'),
                'preventionControls': t.get('preventionControls'), 'detectionControls': t.get('detectionControls'),
                'detection': t.get('detection'), 'rpn': t.get('rpn'), 'recommendedAction': t.get('recommendedAction'),
                'responsibility': t.get('responsibility'), 'targetDate': '', 'status': 'Open', 'order': order,
            })))
    db.session.commit()
    print(f"PFMEA rows generated for sample part ({order} rows)")


# ══════════════════════════════════════════════════════
#  CONTROL PLAN FALLBACK LIBRARY (starter template)
#  Used by "Generate Control Plan" for a PFD step that doesn't yet have
#  matching PFMEA rows to derive characteristics from. When PFMEA rows
#  do exist for a step, those are used instead (richer, part-tuned data).
# ══════════════════════════════════════════════════════

def seed_pq_cp_templates():
    if GenericRecord.query.filter_by(module='pq_cp_templates').count() > 0:
        return

    def row(cat, charName, classification, method, controlMethod, reactionPlan, order):
        return {
            'processCategory': cat, 'charName': charName, 'classification': classification,
            'method': method, 'controlMethod': controlMethod, 'reactionPlan': reactionPlan, 'order': order,
        }

    CP_TEMPLATE_ROWS = [
        row('Raw Material Inspection', 'Chemical Composition', 'Critical', 'OES Spectrometer',
            'CoC verification + spectro on every incoming heat', 'Reject lot; quarantine; raise supplier NCR', 1),
        row('Melting', 'Melt Temperature', 'Critical', 'Digital pyrometer',
            'Pyrometer check before every heat; alarm at threshold', 'Do not cast; adjust furnace; re-verify', 1),
        row('Melting', 'Degassing Time', 'Special', 'Timer log',
            'Timed degassing per SOP; flux weighed before addition', 'Re-degas; do not cast; record deviation', 2),
        row('Die Casting', 'Injection Pressure / Shot Profile', 'Critical', 'Machine parameter log',
            'Process parameter log; first-off inspection every run', 'Stop; adjust; re-run first-off', 1),
        row('Die Casting', 'Die / Metal Temperature', 'Special', 'IR pyrometer',
            'Pyrometer verification at warm-up and every 10 shots', 'Additional warm-up shots; re-check temperature', 2),
        row('Trimming', 'Gate / Flash Removal', 'Major', 'Visual + go/no-go gauge',
            '100% visual after trimming', 'Re-trim; inspect trim die; raise NCR if repeated', 1),
        row('Fettling', 'Sharp Edge / Burr Removal', 'Major', 'Visual + tactile check',
            'Fettling map on WI with all sharp edges marked', 'Deburr; update WI if new edge found', 1),
        row('Shot Blasting', 'Surface Cleanliness', 'Minor', 'Visual coverage check',
            'Cycle time set per SOP; coverage check on first batch', 'Re-blast batch; check nozzle', 1),
        row('Machining', 'Critical Dimensions', 'Critical', 'CMM / Vernier / go-no-go gauge',
            'First-off 100% dimensional check; periodic check every 25 pcs', 'Stop; 100% inspect batch; adjust offsets', 1),
        row('Final Inspection', 'Visual Surface Defects', 'Critical', '100% visual under min 500 lux',
            'Mandatory 100% visual; two-stage inspection if critical', 'Reject non-conforming; raise NCR', 1),
        row('Final Inspection', 'Critical Dimensions', 'Critical', 'CMM / Vernier / go-no-go gauge',
            'Calibrated gauges; AQL sampling per customer standard', 'Reject batch; 100% re-inspect', 2),
        row('Packing', 'Packaging Type & Quantity', 'Major', 'Visual + weigh-count',
            'Customer packing standard on file; weigh-count each box', 'Re-pack; obtain correct materials', 1),
        row('Dispatch', 'Delivery Order / Document Match', 'Major', 'Document checklist',
            'Cross-check delivery order vs packing list vs boxes', 'Stop despatch; re-verify all boxes', 1),
    ]
    for r in CP_TEMPLATE_ROWS:
        db.session.add(GenericRecord(module='pq_cp_templates', data=json.dumps(r)))
    db.session.commit()
    print("Control Plan fallback template library seeded")


# ══════════════════════════════════════════════════════
#  GRADE MASTER — controlled reference document
#  Sourced from VRA-SOP-001 (Raw Material Chemical Composition) and
#  VRA-SOP-017 (Alloy Specification and Color Codes), both Active Rev A
#  in the Documents module. AC4B and LM2 have composition data but no
#  color code assigned in SOP-017 (left blank until updated there).
# ══════════════════════════════════════════════════════

PQ_GRADE_ELEMENTS = ['Si', 'Fe', 'Cu', 'Mg', 'Mn', 'Ti', 'Zn', 'Ni', 'Pb', 'Sn', 'Sr', 'Al']

def seed_pq_grades():
    existing = GenericRecord.query.filter_by(module='pq_grades').all()
    # Upgrade-safe: reseed if empty, or if the stored rows predate the
    # structured per-element schema (older rows only had a flat 'composition'
    # string). Row count alone can't detect a schema change, so check shape.
    # Only wipe when NO row has the new shape (a genuine old-schema table);
    # one unreadable/odd row must never cause the whole Grade Master to be
    # deleted and reseeded on restart.
    if existing and any(safe_json_loads(r.data, {}).get('elements') for r in existing):
        return
    if existing:
        GenericRecord.query.filter_by(module='pq_grades').delete()
        db.session.commit()

    def grade(name, colour, notes, elements, order):
        return {'grade': name, 'colourCode': colour, 'notes': notes,
                'elements': elements, 'order': order}

    GRADES = [
        grade('ADC12', 'Green',
              'High-pressure die casting. Primary grade for V R Alucast production. Standard: JIS H5302.',
              {'Si':'9.6–12.0%','Fe':'≤1.3%','Cu':'1.5–3.5%','Mg':'≤0.30%','Mn':'≤0.50%','Ti':'≤0.30%',
               'Zn':'≤1.0%','Ni':'≤0.50%','Pb':'≤0.20%','Sn':'≤0.20%','Sr':'','Al':'Balance'}, 1),
        grade('A380', 'Blue',
              'General purpose die casting alloy. Good fluidity and pressure tightness. Standard: ASTM B85.',
              {'Si':'7.5–9.5%','Fe':'≤1.3%','Cu':'3.0–4.0%','Mg':'≤0.10%','Mn':'≤0.50%','Ti':'',
               'Zn':'≤3.0%','Ni':'≤0.50%','Pb':'','Sn':'≤0.35%','Sr':'','Al':'Balance'}, 2),
        grade('A383', 'Yellow',
              'Improved die casting alloy. Better for thin-wall complex parts. Standard: ASTM B85.',
              {'Si':'9.5–11.5%','Fe':'≤0.8%','Cu':'2.0–3.0%','Mg':'0.10–0.20%','Mn':'≤0.50%','Ti':'',
               'Zn':'≤3.0%','Ni':'≤0.30%','Pb':'','Sn':'≤0.15%','Sr':'','Al':'Balance'}, 3),
        grade('AC4B', '',
              'Sand/gravity casting. Good machinability and corrosion resistance. Standard: JIS H5202.',
              {'Si':'7.0–10.0%','Fe':'≤0.8%','Cu':'2.0–4.0%','Mg':'≤0.50%','Mn':'≤0.50%','Ti':'≤0.20%',
               'Zn':'≤0.10%','Ni':'≤0.10%','Pb':'≤0.20%','Sn':'≤0.10%','Sr':'','Al':'Balance'}, 4),
        grade('ANSI360', 'Black',
              'Similar to A380. Used in North American specifications. Standard: ANSI H35.1.',
              {'Si':'9.0–10.0%','Fe':'≤2.0%','Cu':'≤0.4%','Mg':'0.40–0.60%','Mn':'≤0.35%','Ti':'',
               'Zn':'≤0.5%','Ni':'≤0.5%','Pb':'','Sn':'≤0.15%','Sr':'','Al':'Balance'}, 5),
        grade('LM2', '',
              'British standard die casting alloy. General purpose. Standard: BS 1490.',
              {'Si':'9.0–11.5%','Fe':'≤1.0%','Cu':'0.7–2.5%','Mg':'≤0.30%','Mn':'≤0.50%','Ti':'≤0.20%',
               'Zn':'≤2.0%','Ni':'≤0.50%','Pb':'≤0.10%','Sn':'≤0.20%','Sr':'','Al':'Balance'}, 6),
        grade('LM6', 'Brown',
              'High silicon alloy. Excellent corrosion resistance and castability. Standard: BS 1490.',
              {'Si':'10.0–13.0%','Fe':'≤0.5%','Cu':'≤0.2%','Mg':'≤0.20%','Mn':'≤0.50%','Ti':'≤0.20%',
               'Zn':'≤0.1%','Ni':'≤0.1%','Pb':'≤0.10%','Sn':'≤0.05%','Sr':'','Al':'Balance'}, 7),
        grade('LM24', 'White',
              'High strength die casting alloy. Good pressure tightness. Standard: BS 1490.',
              {'Si':'7.5–9.5%','Fe':'≤1.3%','Cu':'3.0–4.0%','Mg':'0.20–0.40%','Mn':'≤0.50%','Ti':'≤0.20%',
               'Zn':'≤3.0%','Ni':'≤0.50%','Pb':'≤0.30%','Sn':'≤0.20%','Sr':'≤0.50%','Al':'Balance'}, 8),
    ]
    for g in GRADES:
        db.session.add(GenericRecord(module='pq_grades', data=json.dumps(g)))
    db.session.commit()
    print("Grade Master seeded (8 grades from VRA-SOP-001 / VRA-SOP-017)")

PQ_GRADE_ELEMENTS = ['Si','Fe','Cu','Mg','Mn','Ti','Zn','Ni','Pb','Sn','Sr','Al']

def merge_qms2_grades_into_grade_master():
    """One-time merge of the old PFMEA grade list (qms2_grades) into the Grade Master (pq_grades).
    Grade Master values win; grades missing there are copied, blank fields are filled,
    and every difference is saved as a report shown on the Grade Master page."""
    if GenericRecord.query.filter_by(module='setting_grades_merged').first():
        return
    norm = lambda v: re.sub(r'[\s%]', '', str(v or '')).lower()
    master = GenericRecord.query.filter_by(module='pq_grades').all()
    by_key = {_grade_key(safe_json_loads(r.data, {}).get('grade')): r for r in master}
    order = max([safe_json_loads(r.data, {}).get('order') or 0 for r in master] or [0])
    added, diffs = [], []
    for old in GenericRecord.query.filter_by(module='qms2_grades').all():
        o = safe_json_loads(old.data, {})
        name, comp = str(o.get('grade') or '').strip(), o.get('composition') or {}
        if not _grade_key(name):
            continue
        r = by_key.get(_grade_key(name))
        if not r:
            order += 1
            other = ', '.join(f'{k} {v}' for k, v in comp.items() if k not in PQ_GRADE_ELEMENTS and v)
            notes = 'Copied from the old PFMEA Grade Master.' + (f' Other elements: {other}' if other else '')
            new = {'grade': name, 'colourCode': o.get('colourCode') or '', 'notes': notes, 'order': order,
                   'elements': {el: comp.get(el, '') for el in PQ_GRADE_ELEMENTS}}
            r = GenericRecord(module='pq_grades', data=json.dumps(new))
            db.session.add(r)
            by_key[_grade_key(name)] = r
            added.append(name)
            continue
        g = safe_json_loads(r.data, {})
        g.setdefault('elements', {})
        if o.get('colourCode') and not g.get('colourCode'):
            g['colourCode'] = o['colourCode']
        elif o.get('colourCode') and norm(o['colourCode']) != norm(g.get('colourCode')):
            diffs.append(f"{g['grade']} colour code: Grade Master has {g['colourCode']}, PFMEA list had {o['colourCode']}")
        for el, v in comp.items():
            if not v:
                continue
            if el in PQ_GRADE_ELEMENTS and not g['elements'].get(el):
                g['elements'][el] = v
            elif norm(v) != norm(g['elements'].get(el)):
                diffs.append(f"{g['grade']} {el}: Grade Master has {g['elements'].get(el) or '(blank)'}, PFMEA list had {v}")
        r.data = json.dumps(g)
    db.session.add(GenericRecord(module='setting_grades_merged',
                                 data=json.dumps({'added': added, 'differences': diffs, 'dismissed': False})))
    db.session.commit()
    print(f"Grade lists merged: {len(added)} added, {len(diffs)} differences")

def migrate_columns():
    """create_all() never alters existing tables — add columns introduced after first deploy."""
    insp = db.inspect(db.engine)
    table = RMLot.__table__.name
    if table in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns(table)}
        if 'weight_kg' not in cols:
            with db.engine.begin() as conn:
                conn.execute(db.text(f'ALTER TABLE {table} ADD COLUMN weight_kg FLOAT'))

with app.app_context():
    try:
        db.create_all()
        migrate_columns()
        seed_users()
        seed_qms2()
        seed_pq()
        seed_pq_pfmea_templates()
        seed_pq_pfmea_rows_for_sample_part()
        seed_pq_cp_templates()
        seed_pq_grades()
        merge_qms2_grades_into_grade_master()
        # Note: seed_defaults() removed — default data comes from backup restore
    except Exception as e:
        print(f"Startup warning: {e}")
    try:
        seed_wi_demo()
    except Exception as e:
        db.session.rollback()
        print(f"Startup warning (demo work instructions): {e}")

if __name__ == '__main__':
    # Defaults to off so a stray `python app.py` never exposes the
    # Werkzeug debugger (arbitrary code execution) outside local dev.
    # Set FLASK_DEBUG=1 to opt in when developing locally.
    app.run(debug=os.environ.get('FLASK_DEBUG') == '1')

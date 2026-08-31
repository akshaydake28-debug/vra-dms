from flask import Flask, request, jsonify, send_from_directory, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import json
import re
import secrets
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
PUBLIC_PREFIXES = ('/api/public/feedback/',)
# Shared mailbox used to send Customer Feedback survey links. Unset until
# SMTP_USER/SMTP_PASSWORD are added in the hosting environment (Railway) —
# see the /api/customer-feedback/send route for the resulting error.
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.zoho.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')
SMTP_FROM_NAME = os.environ.get('SMTP_FROM_NAME', 'V R Alucast')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
BACKUP_API_TOKEN = os.environ.get('BACKUP_API_TOKEN')
HASH_PREFIXES = ('pbkdf2:', 'scrypt:', 'argon2:')
# APPROVER is this app's admin-equivalent role — it's what the frontend
# already gates the Users management screen on (see nav-users in index.html).
ADMIN_ROLE = 'APPROVER'

def is_hashed(pw):
    return bool(pw) and pw.startswith(HASH_PREFIXES)

@app.before_request
def require_login():
    path = request.path
    if not path.startswith('/api/') or path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES):
        return None
    if 'user_id' in session:
        return None
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
    d = request.json
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
    d = request.json
    u = User(username=d['username'], password=generate_password_hash(d['password']), role=d['role'], name=d['name'])
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
    d = request.json
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
    d = request.json
    new_password = d.get('newPassword','vra@2025')
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
        'extra':json.loads(d.extra) if d.extra else {}
    } for d in docs])

@app.route('/api/documents', methods=['POST'])
def save_document():
    d = request.json
    existing = Document.query.filter_by(doc_number=d.get('docNumber')).first()
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
        d = json.loads(r.data)
        d['id'] = r.id
        if doc_id is None or d.get('docId') == doc_id:
            result.append(d)
    return jsonify(result)

@app.route('/api/versions', methods=['POST'])
def save_version():
    r = GenericRecord(module='versions', data=json.dumps(request.json))
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})

@app.route('/api/versions/<int:rid>', methods=['POST'])
def update_version(rid):
    r = GenericRecord.query.get_or_404(rid)
    existing = json.loads(r.data)
    existing.update(request.json)
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
    d = request.json
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
    return jsonify({'value': json.loads(r.data) if r else None})

@app.route('/api/settings/<key>', methods=['POST'])
def save_setting(key):
    r = GenericRecord.query.filter_by(module='setting_'+key).first()
    if r:
        r.data = json.dumps(request.json.get('value'))
        r.updated_at = datetime.utcnow()
    else:
        r = GenericRecord(module='setting_'+key, data=json.dumps(request.json.get('value')))
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
    return jsonify([{
        'id':l.id,'lotNumber':l.lot_number,'date':l.date,
        'grade':l.grade,'supplier':l.supplier,'invoice':l.invoice,
        'approvedBy':l.approved_by,'spectro':l.spectro,'bundles':l.bundles
    } for l in lots])

@app.route('/api/rm/lots', methods=['POST'])
def save_rm_lot():
    d = request.json
    existing = RMLot.query.filter_by(lot_number=d.get('lotNumber','')).first()
    if existing:
        return jsonify({'id': existing.id})
    lot = RMLot(
        lot_number=d.get('lotNumber'), date=d.get('date',''),
        grade=d.get('grade',''), supplier=d.get('supplier',''),
        invoice=d.get('invoice',''), approved_by=d.get('approvedBy',''),
        spectro=d.get('spectro',''), bundles=d.get('bundles',1)
    )
    db.session.add(lot)
    db.session.commit()
    return jsonify({'id': lot.id})

@app.route('/api/rm/lots/<int:lid>', methods=['DELETE'])
def delete_rm_lot(lid):
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
        'documents': [],
        'versions': [],
        'audit': [],
        'users': [],
    }
    backup_errors = []
    for d in Document.query.all():
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
    data['rm_lots'] = [{'lotNumber':l.lot_number,'date':l.date,'grade':l.grade,
        'supplier':l.supplier,'invoice':l.invoice,'approvedBy':l.approved_by,
        'spectro':l.spectro,'bundles':l.bundles} for l in RMLot.query.all()]
    # All generic modules
    modules = {}
    for r in GenericRecord.query.all():
        try:
            parsed = json.loads(r.data)
        except (TypeError, ValueError):
            backup_errors.append(f'{r.module} record {r.id}: unreadable data, skipped')
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
    data = request.json
    if not data: return jsonify({'error':'No data'}),400

    # Documents — clear all and restore fresh
    Document.query.delete()
    doc_count = 0
    for d in data.get('documents',[]):
        doc = Document(
            doc_number=d.get('docNumber'), title=d.get('title'),
            doc_type=d.get('docType'), revision=d.get('revision'),
            status=d.get('status'), content=d.get('content',''),
            created_by=d.get('createdBy',''), approved_by=d.get('approvedBy',''),
            created_date=d.get('createdDate',''), approved_date=d.get('approvedDate',''),
            extra=json.dumps(d.get('extra',{}))
        )
        db.session.add(doc)
        doc_count += 1

    # Settings
    for key, value in data.get('settings',{}).items():
        if not GenericRecord.query.filter_by(module='setting_'+key).first():
            db.session.add(GenericRecord(module='setting_'+key, data=json.dumps(value)))

    # All array-type module data
    skip_keys = {'exportedAt','exportedBy','appVersion','company','documents',
                 'versions','audit','users','customDocTypes','settings','records'}
    module_count = 0
    for key, value in data.items():
        if key in skip_keys: continue
        if not isinstance(value, list): continue
        if not value: continue
        # Clear existing records for this module and restore fresh
        GenericRecord.query.filter_by(module=key).delete()
        db.session.flush()
        for rec in value:
            nr = {k:v for k,v in rec.items() if k not in ('id','_rid')}
            db.session.add(GenericRecord(module=key, data=json.dumps(nr)))
            module_count += 1

    # customDocTypes as setting
    if data.get('customDocTypes'):
        if not GenericRecord.query.filter_by(module='setting_customDocTypes').first():
            db.session.add(GenericRecord(module='setting_customDocTypes',
                data=json.dumps(data['customDocTypes'])))

    # RM Lots
    if data.get('rm_lots'):
        RMLot.query.delete()
        for l in data.get('rm_lots',[]):
            lot = RMLot(
                lot_number=l.get('lotNumber'), date=l.get('date',''),
                grade=l.get('grade',''), supplier=l.get('supplier',''),
                invoice=l.get('invoice',''), approved_by=l.get('approvedBy',''),
                spectro=l.get('spectro',''), bundles=l.get('bundles',1)
            )
            db.session.add(lot)

    db.session.commit()
    return jsonify({'ok':True,'documents':doc_count,'records':module_count})


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
        try:
            d = json.loads(r.data)
        except (TypeError, ValueError):
            continue
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

    body = request.json or {}
    raw_ratings = body.get('ratings') or {}
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

# Bulk-sends individual feedback-request emails from the shared VRA mailbox —
# session-protected (staff only), unlike the two public routes above. Each
# recipient gets their own email (never a single BCC blast) so each one's
# link stays theirs alone; {{name}}/{{period}}/{{link}} are filled in per
# recipient from the payload the frontend already assembled.
@app.route('/api/customer-feedback/send', methods=['POST'])
def send_customer_feedback_emails():
    if not SMTP_USER or not SMTP_PASSWORD:
        return jsonify({'error': 'Email sending is not configured yet. Set SMTP_USER and SMTP_PASSWORD (and optionally SMTP_HOST/SMTP_PORT/SMTP_FROM_NAME) in Railway.'}), 503

    body = request.json or {}
    subject_template = str(body.get('subject', '')).strip()
    message_template = str(body.get('message', ''))
    recipients = body.get('recipients') or []
    if not subject_template or not message_template.strip():
        return jsonify({'error': 'Subject and message are required'}), 400
    if not isinstance(recipients, list) or not recipients:
        return jsonify({'error': 'No recipients provided'}), 400
    if len(recipients) > 200:
        return jsonify({'error': 'Too many recipients in one batch (max 200) — split into smaller batches'}), 400

    try:
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
            server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
    except Exception as e:
        return jsonify({'error': f'Could not connect/authenticate to the mail server: {e}'}), 502

    results = []
    try:
        for r in recipients:
            email_addr = str(r.get('email', '')).strip()
            name = str(r.get('name', ''))
            period = str(r.get('period', ''))
            link = str(r.get('link', ''))
            if not email_addr or not EMAIL_RE.match(email_addr):
                results.append({'email': email_addr, 'ok': False, 'error': 'Invalid or missing email address'})
                continue

            def fill(t):
                return t.replace('{{name}}', name).replace('{{period}}', period).replace('{{link}}', link)

            msg = MIMEText(fill(message_template), 'plain', 'utf-8')
            msg['Subject'] = fill(subject_template)
            msg['From'] = formataddr((SMTP_FROM_NAME, SMTP_USER))
            msg['To'] = email_addr
            try:
                server.sendmail(SMTP_USER, [email_addr], msg.as_string())
                results.append({'email': email_addr, 'ok': True})
            except Exception as e:
                results.append({'email': email_addr, 'ok': False, 'error': str(e)})
    finally:
        try:
            server.quit()
        except Exception:
            pass

    return jsonify({'results': results})

@app.route('/api/<module>', methods=['GET'])
def list_generic(module):
    records = GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.desc()).all()
    return jsonify([{'id':r.id,'data':json.loads(r.data),'createdAt':str(r.created_at)} for r in records])

@app.route('/api/<module>', methods=['POST'])
def save_generic(module):
    d = request.json
    # If record has an id, update instead of insert
    existing_id = d.get('id') or d.get('_rid')
    if existing_id:
        r = GenericRecord.query.get(existing_id)
        if r and r.module == module:
            clean = {k:v for k,v in d.items() if k not in ('id','_rid')}
            r.data = json.dumps(clean)
            r.updated_at = datetime.utcnow()
            db.session.commit()
            return jsonify({'id': r.id})
    # New record — insert
    clean = {k:v for k,v in d.items() if k not in ('id','_rid')}
    r = GenericRecord(module=module, data=json.dumps(clean))
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})

@app.route('/api/<module>/<int:rid>', methods=['GET'])
def get_generic_one(module, rid):
    r = GenericRecord.query.get(rid)
    if not r: return jsonify(None), 404
    return jsonify({'id':r.id,'data':json.loads(r.data),'createdAt':str(r.created_at)})

@app.route('/api/<module>/<int:rid>', methods=['POST'])
def update_generic_one(module, rid):
    r = GenericRecord.query.get(rid)
    if r:
        r.data = json.dumps(request.json)
        r.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'id': r.id})
    r = GenericRecord(module=module, data=json.dumps(request.json))
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})

@app.route('/api/<module>/<int:rid>', methods=['DELETE'])
def delete_generic_one(module, rid):
    r = GenericRecord.query.get(rid)
    if r:
        db.session.delete(r)
        db.session.commit()
    return jsonify({'ok': True})

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
    fields = key_fields.get(module, ['id'])
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
    d = json.loads(r.data)
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
    d = request.json
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
    if module not in QMS2_MODULES:
        prefixed = 'qms2_' + module
        if prefixed in QMS2_MODULES:
            module = prefixed
        else:
            return jsonify({'error':'Unknown module'}), 400
    ids = request.json.get('ids', [])
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
                if json.loads(r.data).get('pfmeaPartId') == pfmea_part_id]
    cp_ids = [c['id'] for c in cp_parts]
    cp_rows = []
    cs_records = []
    for cp_id in cp_ids:
        cp_rows += [qms2_flat(r) for r in GenericRecord.query.filter_by(module='qms2_cp_rows').all()
                    if json.loads(r.data).get('cpId') == cp_id]
        cs_records += [qms2_flat(r) for r in GenericRecord.query.filter_by(module='qms2_cs_records').all()
                       if json.loads(r.data).get('cpId') == cp_id]
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
                      if json.loads(r.data).get('partNumber') == 'VRA-DC-001'), None)
    if not part_rec:
        return
    pid = part_rec.id
    existing_rows = GenericRecord.query.filter_by(module='pq_pfmea_rows').all()
    if any(json.loads(r.data).get('partId') == pid for r in existing_rows):
        return

    steps = sorted(
        [json.loads(r.data) for r in GenericRecord.query.filter_by(module='pq_pfd_steps').all()
         if json.loads(r.data).get('partId') == pid],
        key=lambda s: s.get('order', 0))
    templates = [json.loads(r.data) for r in GenericRecord.query.filter_by(module='pq_pfmea_templates').all()]

    order = 0
    for step in steps:
        cats = _match_pfmea_categories(step.get('stepName', ''))
        matches = [t for t in templates if t.get('processCategory') in cats]
        for t in matches:
            order += 1
            db.session.add(GenericRecord(module='pq_pfmea_rows', data=json.dumps({
                'partId': pid, 'opNumber': step.get('opNumber'), 'processStep': step.get('stepName'),
                'function': t['function'], 'failureMode': t['failureMode'], 'failureEffect': t['failureEffect'],
                'severity': t['severity'], 'failureCause': t['failureCause'], 'occurrence': t['occurrence'],
                'preventionControls': t['preventionControls'], 'detectionControls': t['detectionControls'],
                'detection': t['detection'], 'rpn': t['rpn'], 'recommendedAction': t['recommendedAction'],
                'responsibility': t['responsibility'], 'targetDate': '', 'status': 'Open', 'order': order,
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
    if existing and json.loads(existing[0].data).get('elements'):
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

with app.app_context():
    try:
        db.create_all()
        seed_users()
        seed_qms2()
        seed_pq()
        seed_pq_pfmea_templates()
        seed_pq_pfmea_rows_for_sample_part()
        seed_pq_cp_templates()
        seed_pq_grades()
        # Note: seed_defaults() removed — default data comes from backup restore
    except Exception as e:
        print(f"Startup warning: {e}")

if __name__ == '__main__':
    app.run(debug=True)

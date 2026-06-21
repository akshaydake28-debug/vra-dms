from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import os
import json

app = Flask(__name__, static_folder='static')
CORS(app)

# Database
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
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # APPROVER / CREATOR
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Document(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    doc_number = db.Column(db.String(50), unique=True)
    title = db.Column(db.String(200))
    doc_type = db.Column(db.String(20))
    revision = db.Column(db.String(10))
    status = db.Column(db.String(30))
    content = db.Column(db.Text)
    created_by = db.Column(db.String(50))
    approved_by = db.Column(db.String(50))
    created_date = db.Column(db.String(20))
    approved_date = db.Column(db.String(20))
    extra = db.Column(db.Text)  # JSON string for extra fields

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

class Complaint(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Text)  # full JSON
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class CAPA(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Supplier(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Gauge(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class GenericRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    module = db.Column(db.String(50))  # 'capa','alert','po','scorecard' etc
    data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(50))
    module = db.Column(db.String(50))
    record_id = db.Column(db.Integer)
    user = db.Column(db.String(50))
    detail = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# ══════════════════════════════════════════════════════
#  SERVE FRONTEND
# ══════════════════════════════════════════════════════

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

# ══════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════

@app.route('/api/auth/login', methods=['POST'])
def login():
    d = request.json
    user = User.query.filter_by(username=d.get('username')).first()
    if not user or user.password != d.get('password'):
        return jsonify({'error': 'Invalid credentials'}), 401
    return jsonify({'id': user.id, 'username': user.username, 'role': user.role, 'name': user.name})

@app.route('/api/auth/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([{'id': u.id, 'username': u.username, 'role': u.role, 'name': u.name} for u in users])

@app.route('/api/auth/users', methods=['POST'])
def create_user():
    d = request.json
    u = User(username=d['username'], password=d['password'], role=d['role'], name=d['name'])
    db.session.add(u)
    db.session.commit()
    return jsonify({'id': u.id})

@app.route('/api/auth/users/<int:uid>', methods=['DELETE'])
def delete_user(uid):
    u = User.query.get_or_404(uid)
    db.session.delete(u)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  DOCUMENTS
# ══════════════════════════════════════════════════════

@app.route('/api/documents', methods=['GET'])
def list_documents():
    docs = Document.query.order_by(Document.id.desc()).all()
    return jsonify([{
        'id': d.id, 'docNumber': d.doc_number, 'title': d.title,
        'docType': d.doc_type, 'revision': d.revision, 'status': d.status,
        'content': d.content, 'createdBy': d.created_by,
        'approvedBy': d.approved_by, 'createdDate': d.created_date,
        'approvedDate': d.approved_date,
        'extra': json.loads(d.extra) if d.extra else {}
    } for d in docs])

@app.route('/api/documents', methods=['POST'])
def save_document():
    d = request.json
    existing = Document.query.filter_by(doc_number=d.get('docNumber')).first()
    if existing:
        existing.title = d.get('title')
        existing.doc_type = d.get('docType')
        existing.revision = d.get('revision')
        existing.status = d.get('status')
        existing.content = d.get('content')
        existing.created_by = d.get('createdBy')
        existing.approved_by = d.get('approvedBy')
        existing.created_date = d.get('createdDate')
        existing.approved_date = d.get('approvedDate')
        existing.extra = json.dumps(d.get('extra', {}))
        db.session.commit()
        _log('UPDATE', 'documents', existing.id, d.get('createdBy'), d.get('title'))
        return jsonify({'id': existing.id})
    doc = Document(
        doc_number=d.get('docNumber'), title=d.get('title'),
        doc_type=d.get('docType'), revision=d.get('revision'),
        status=d.get('status'), content=d.get('content'),
        created_by=d.get('createdBy'), approved_by=d.get('approvedBy'),
        created_date=d.get('createdDate'), approved_date=d.get('approvedDate'),
        extra=json.dumps(d.get('extra', {}))
    )
    db.session.add(doc)
    db.session.commit()
    _log('CREATE', 'documents', doc.id, d.get('createdBy'), d.get('title'))
    return jsonify({'id': doc.id})

@app.route('/api/documents/<int:did>', methods=['DELETE'])
def delete_document(did):
    d = Document.query.get_or_404(did)
    db.session.delete(d)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  RAW MATERIAL LOTS
# ══════════════════════════════════════════════════════

@app.route('/api/rm/lots', methods=['GET'])
def list_rm_lots():
    lots = RMLot.query.order_by(RMLot.id.desc()).all()
    return jsonify([{
        'id': l.id, 'lotNumber': l.lot_number, 'date': l.date,
        'grade': l.grade, 'supplier': l.supplier, 'invoice': l.invoice,
        'approvedBy': l.approved_by, 'spectro': l.spectro, 'bundles': l.bundles
    } for l in lots])

@app.route('/api/rm/lots', methods=['POST'])
def save_rm_lot():
    d = request.json
    lot = RMLot(
        lot_number=d['lotNumber'], date=d['date'], grade=d['grade'],
        supplier=d['supplier'], invoice=d['invoice'],
        approved_by=d['approvedBy'], spectro=d['spectro'], bundles=d['bundles']
    )
    db.session.add(lot)
    db.session.commit()
    return jsonify({'id': lot.id})

@app.route('/api/rm/lots/<int:lid>', methods=['DELETE'])
def delete_rm_lot(lid):
    l = RMLot.query.get_or_404(lid)
    db.session.delete(l)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  GENERIC MODULE RECORDS
#  covers: complaints, capas, alerts, suppliers, gauges,
#          employees, PO, scorecard, enquiries, feasibility,
#          PFMEA, control plan, check sheet, HR training etc.
# ══════════════════════════════════════════════════════

@app.route('/api/<module>', methods=['GET'])
def list_generic(module):
    records = GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.desc()).all()
    return jsonify([{'id': r.id, 'data': json.loads(r.data), 'createdAt': str(r.created_at)} for r in records])

@app.route('/api/<module>', methods=['POST'])
def save_generic(module):
    d = request.json
    rid = d.get('id')
    if rid:
        r = GenericRecord.query.get(rid)
        if r:
            r.data = json.dumps(d)
            r.updated_at = datetime.utcnow()
            db.session.commit()
            return jsonify({'id': r.id})
    r = GenericRecord(module=module, data=json.dumps(d))
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})

@app.route('/api/<module>/<int:rid>', methods=['DELETE'])
def delete_generic(module, rid):
    r = GenericRecord.query.get_or_404(rid)
    db.session.delete(r)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  SETTINGS (grades, approvers, doc types etc)
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
#  BACKUP & RESTORE
# ══════════════════════════════════════════════════════

@app.route('/api/backup', methods=['GET'])
def backup():
    data = {
        'exportDate': str(datetime.utcnow()),
        'documents': [],
        'rm_lots': [],
        'records': {},
        'settings': {}
    }
    for d in Document.query.all():
        data['documents'].append({
            'docNumber': d.doc_number, 'title': d.title, 'docType': d.doc_type,
            'revision': d.revision, 'status': d.status, 'content': d.content,
            'createdBy': d.created_by, 'approvedBy': d.approved_by,
            'createdDate': d.created_date, 'approvedDate': d.approved_date,
            'extra': json.loads(d.extra) if d.extra else {}
        })
    for l in RMLot.query.all():
        data['rm_lots'].append({
            'lotNumber': l.lot_number, 'date': l.date, 'grade': l.grade,
            'supplier': l.supplier, 'invoice': l.invoice,
            'approvedBy': l.approved_by, 'spectro': l.spectro, 'bundles': l.bundles
        })
    for r in GenericRecord.query.all():
        if r.module.startswith('setting_'):
            data['settings'][r.module.replace('setting_','')] = json.loads(r.data)
        else:
            if r.module not in data['records']:
                data['records'][r.module] = []
            data['records'][r.module].append(json.loads(r.data))
    return jsonify(data)

@app.route('/api/restore', methods=['POST'])
def restore():
    data = request.json
    for d in data.get('documents', []):
        existing = Document.query.filter_by(doc_number=d['docNumber']).first()
        if not existing:
            doc = Document(
                doc_number=d['docNumber'], title=d['title'], doc_type=d['docType'],
                revision=d['revision'], status=d['status'], content=d['content'],
                created_by=d['createdBy'], approved_by=d.get('approvedBy'),
                created_date=d['createdDate'], approved_date=d.get('approvedDate'),
                extra=json.dumps(d.get('extra', {}))
            )
            db.session.add(doc)
    for l in data.get('rm_lots', []):
        existing = RMLot.query.filter_by(lot_number=l['lotNumber']).first()
        if not existing:
            lot = RMLot(
                lot_number=l['lotNumber'], date=l['date'], grade=l['grade'],
                supplier=l['supplier'], invoice=l['invoice'],
                approved_by=l['approvedBy'], spectro=l['spectro'], bundles=l['bundles']
            )
            db.session.add(lot)
    for module, records in data.get('records', {}).items():
        for rec in records:
            r = GenericRecord(module=module, data=json.dumps(rec))
            db.session.add(r)
    for key, value in data.get('settings', {}).items():
        r = GenericRecord.query.filter_by(module='setting_'+key).first()
        if not r:
            r = GenericRecord(module='setting_'+key, data=json.dumps(value))
            db.session.add(r)
    db.session.commit()
    return jsonify({'ok': True})

# ══════════════════════════════════════════════════════
#  AUDIT LOG
# ══════════════════════════════════════════════════════

def _log(action, module, record_id, user, detail):
    log = AuditLog(action=action, module=module, record_id=record_id, user=user, detail=str(detail))
    db.session.add(log)
    db.session.commit()

@app.route('/api/auditlog', methods=['GET'])
def get_audit_log():
    logs = AuditLog.query.order_by(AuditLog.id.desc()).limit(200).all()
    return jsonify([{
        'id': l.id, 'action': l.action, 'module': l.module,
        'recordId': l.record_id, 'user': l.user,
        'detail': l.detail, 'timestamp': str(l.timestamp)
    } for l in logs])

# ══════════════════════════════════════════════════════
#  STARTUP
# ══════════════════════════════════════════════════════

def seed_users():
    if User.query.count() == 0:
        users = [
            User(username='akshay', password='vra@2025', role='APPROVER', name='Akshay Dake'),
            User(username='sagar', password='vra@2025', role='CREATOR', name='Sagar Shirgure'),
            User(username='manish', password='vra@2025', role='CREATOR', name='Manish Yadav'),
        ]
        db.session.add_all(users)
        db.session.commit()

with app.app_context():
    db.create_all()
    seed_users()

if __name__ == '__main__':
    app.run(debug=True)
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import os
import json

app = Flask(__name__, static_folder='static')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32MB

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

# ══════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════

@app.route('/api/auth/login', methods=['POST'])
def login():
    d = request.json
    user = User.query.filter_by(username=d.get('username')).first()
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    # Accept plain text password (legacy) or direct match
    pwd = d.get('password','')
    if user.password != pwd:
        return jsonify({'error': 'Invalid credentials'}), 401
    return jsonify({'id': user.id, 'username': user.username, 'role': user.role, 'name': user.name})

@app.route('/api/auth/users', methods=['GET'])
def get_users():
    return jsonify([{'id':u.id,'username':u.username,'role':u.role,'name':u.name} for u in User.query.all()])

@app.route('/api/auth/users/all', methods=['GET'])
def get_users_with_passwords():
    # Returns passwords — admin only endpoint
    return jsonify([{'id':u.id,'username':u.username,'role':u.role,'name':u.name,'password':u.password} for u in User.query.all()])

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

@app.route('/api/auth/password', methods=['POST'])
def change_password():
    d = request.json
    username = d.get('username','')
    new_password = d.get('newPassword','')
    if not username or not new_password:
        return jsonify({'error': 'Missing fields'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Password too short'}), 400
    u = User.query.filter_by(username=username).first()
    if not u:
        return jsonify({'error': 'User not found'}), 404
    u.password = new_password
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/auth/users/<int:uid>/reset', methods=['POST'])
def reset_user_password(uid):
    d = request.json
    new_password = d.get('newPassword','vra@2025')
    u = User.query.get_or_404(uid)
    u.password = new_password
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
    for d in Document.query.all():
        data['documents'].append({
            'id':d.id,'docNumber':d.doc_number,'title':d.title,'docType':d.doc_type,
            'revision':d.revision,'status':d.status,'content':d.content,
            'createdBy':d.created_by,'approvedBy':d.approved_by,
            'createdDate':d.created_date,'approvedDate':d.approved_date,
            'extra':json.loads(d.extra) if d.extra else {}
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
        if r.module.startswith('setting_'):
            key = r.module.replace('setting_','')
            if 'settings' not in data: data['settings'] = {}
            data['settings'][key] = json.loads(r.data)
        else:
            if r.module not in modules: modules[r.module] = []
            rec = json.loads(r.data)
            rec['id'] = r.id
            modules[r.module].append(rec)
    data.update(modules)
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
        # Clear existing records for this module and restore fresh
        GenericRecord.query.filter_by(module=key).delete()
        for rec in value:
            nr = {k:v for k,v in rec.items() if k != 'id'}
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

@app.route('/api/<module>', methods=['GET'])
def list_generic(module):
    records = GenericRecord.query.filter_by(module=module).order_by(GenericRecord.id.desc()).all()
    return jsonify([{'id':r.id,'data':json.loads(r.data),'createdAt':str(r.created_at)} for r in records])

@app.route('/api/<module>', methods=['POST'])
def save_generic(module):
    d = request.json
    r = GenericRecord(module=module, data=json.dumps(d))
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
            {'section':'TECHNICAL','question':'Is Material feasible for Manufacturing?','order':1},
            {'section':'TECHNICAL','question':'Scope of Supply Clear?','order':2},
            {'section':'TECHNICAL','question':'Is machinery suitable for this Grade?','order':3},
            {'section':'TECHNICAL','question':'Is specification / Tolerance achievable?','order':4},
            {'section':'TECHNICAL','question':'Is there any other process or treatment required?','order':5},
            {'section':'TECHNICAL','question':'Are available machines adequate for demanded quantities?','order':6},
            {'section':'TECHNICAL','question':'Are inspection and testing facilities adequate?','order':7},
            {'section':'TECHNICAL','question':'Is development cost paid by Customer?','order':8},
            {'section':'TECHNICAL','question':'Is Tooling given by Customer?','order':9},
            {'section':'COMMERCIAL','question':'Application of Part Clear?','order':1},
            {'section':'COMMERCIAL','question':'Monthly Requirement Clear?','order':2},
            {'section':'COMMERCIAL','question':'Weight of Casting?','order':3},
            {'section':'COMMERCIAL','question':'Delivery Charges? (Paid by Us or Customer)','order':4},
            {'section':'COMMERCIAL','question':'Is any Specific requirement of Packing?','order':5},
            {'section':'CAPACITY','question':'Which Type of Machines Required?','order':1},
            {'section':'CAPACITY','question':'How Many Machines required?','order':2},
            {'section':'CAPACITY','question':'Is Current Spare Capacity Available?','order':3},
            {'section':'CAPACITY','question':'Is any New Machine Required?','order':4},
            {'section':'CAPACITY','question':'Is any Process required to be Outsourced?','order':5},
            {'section':'RISK ASSESSMENT','question':'Is Customer Reliable?','order':1},
            {'section':'RISK ASSESSMENT','question':'Market Status of Customer?','order':2},
            {'section':'RISK ASSESSMENT','question':'Is Payment in time?','order':3},
        ]
        for q in feas_qns:
            db.session.add(GenericRecord(module='mktFeasQns', data=json.dumps(q)))
        db.session.commit()

with app.app_context():
    try:
        db.create_all()
        seed_users()
        # Note: seed_defaults() removed — default data comes from backup restore
    except Exception as e:
        print(f"Startup warning: {e}")

if __name__ == '__main__':
    app.run(debug=True)

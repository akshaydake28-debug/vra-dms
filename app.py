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

@app.route('/static/modules/<path:filename>')
def serve_module(filename):
    return send_from_directory('static/modules', filename)

@app.route('/static/core/<path:filename>')
def serve_core(filename):
    return send_from_directory('static/core', filename)

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
    modules_to_dedup = ['hrSkillDefs','mktFeasQns','calGauges','purSuppliers']
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
            # DRAWING & DESIGN
            {'section':'DRAWING & DESIGN','question':'Is the 2D drawing available with complete dimensions and tolerances?','order':1},
            {'section':'DRAWING & DESIGN','question':'Is the 3D model available?','order':2},
            {'section':'DRAWING & DESIGN','question':'Are the specified tolerances and surface finish achievable through HPDC?','order':3},
            {'section':'DRAWING & DESIGN','question':'Is this a new part development or an existing part?','order':4},
            # MATERIAL & PROCESS
            {'section':'MATERIAL & PROCESS','question':'Is the required material / alloy grade feasible for HPDC?','order':1},
            {'section':'MATERIAL & PROCESS','question':'Is the estimated casting weight defined?','order':2},
            {'section':'MATERIAL & PROCESS','question':'Are any specific customer requirements or special characteristics identified?','order':3},
            # MACHINE & CAPACITY
            {'section':'MACHINE & CAPACITY','question':'Is the part feasible on our available machines (280T / 400T)?','order':1},
            {'section':'MACHINE & CAPACITY','question':'Is any new machine or additional setup required?','order':2},
            {'section':'MACHINE & CAPACITY','question':'Is current capacity available for the required monthly volumes?','order':3},
            {'section':'MACHINE & CAPACITY','question':'Are monthly volumes clearly defined by the customer?','order':4},
            # TOOLING
            {'section':'TOOLING','question':'Is tooling supplied by the customer or to be procured?','order':1},
            # SECONDARY OPERATIONS
            {'section':'SECONDARY OPERATIONS','question':'Is machining required after casting?','order':1},
            {'section':'SECONDARY OPERATIONS','question':'Is any process required to be outsourced?','order':2},
            {'section':'SECONDARY OPERATIONS','question':'If yes — is the vendor identified?','order':3},
            {'section':'SECONDARY OPERATIONS','question':'Is the identified vendor feasible (location, capacity, quality)?','order':4},
            # INSPECTION & PACKAGING
            {'section':'INSPECTION & PACKAGING','question':'Are inspection and testing facilities available for this part?','order':1},
            {'section':'INSPECTION & PACKAGING','question':'Is a packaging plan defined?','order':2},
            # COMMERCIAL & RISK
            {'section':'COMMERCIAL & RISK','question':'Is the customer reliable in terms of reputation and payment history?','order':1},
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
    'qms2_op_order',  # operation order per part
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
        {'grade':'ADC12','standard':'JIS H 5302','colourCode':'Yellow','composition':{'Si':'9.6–12.0','Cu':'1.5–3.5','Mg':'≤0.30','Zn':'≤1.0','Fe':'≤1.3','Mn':'≤0.50','Ni':'≤0.50','Sn':'≤0.20','Al':'Balance'},'tensileStrength':'≥310 MPa','hardness':'75–105 HB','meltingRange':'515–585°C','metalTempRange':'640–680°C','incomingCriteria':'Spectro check every heat. Colour code: Yellow band on ingot.','acceptanceCriteria':'Within spectro limits per JIS H 5302'},
        {'grade':'A380','standard':'ASTM B85','colourCode':'Red','composition':{'Si':'7.5–9.5','Cu':'3.0–4.0','Mg':'≤0.10','Zn':'≤3.0','Fe':'≤1.3','Mn':'≤0.50','Ni':'≤0.50','Sn':'≤0.35','Al':'Balance'},'tensileStrength':'≥317 MPa','hardness':'80 HB','meltingRange':'540–595°C','metalTempRange':'650–690°C','incomingCriteria':'Spectro check every heat. Colour code: Red band on ingot.','acceptanceCriteria':'Within spectro limits per ASTM B85'},
        {'grade':'A383','standard':'ASTM B85','colourCode':'Blue','composition':{'Si':'9.5–11.5','Cu':'2.0–3.0','Mg':'≤0.10','Zn':'≤3.0','Fe':'≤1.3','Mn':'≤0.50','Ni':'≤0.30','Sn':'≤0.15','Al':'Balance'},'tensileStrength':'≥310 MPa','hardness':'75 HB','meltingRange':'516–582°C','metalTempRange':'635–675°C','incomingCriteria':'Spectro check every heat. Colour code: Blue band.','acceptanceCriteria':'Within spectro limits per ASTM B85'},
        {'grade':'LM6','standard':'BS 1490','colourCode':'Green','composition':{'Si':'10.0–13.0','Cu':'≤0.10','Mg':'≤0.10','Zn':'≤0.10','Fe':'≤0.60','Mn':'≤0.50','Ni':'≤0.10','Sn':'≤0.05','Al':'Balance'},'tensileStrength':'≥160 MPa','hardness':'45–65 HB','meltingRange':'575–615°C','metalTempRange':'650–700°C','incomingCriteria':'Spectro check every heat. Colour code: Green band.','acceptanceCriteria':'Within spectro limits per BS 1490'},
        {'grade':'LM24','standard':'BS 1490','colourCode':'White','composition':{'Si':'7.5–9.5','Cu':'3.0–4.0','Mg':'≤0.30','Zn':'≤1.0','Fe':'≤1.0','Mn':'≤0.30','Ni':'≤0.30','Sn':'≤0.20','Al':'Balance'},'tensileStrength':'≥280 MPa','hardness':'70–90 HB','meltingRange':'520–580°C','metalTempRange':'640–680°C','incomingCriteria':'Spectro check every heat. Colour code: White band.','acceptanceCriteria':'Within spectro limits per BS 1490'},
        {'grade':'LM2','standard':'BS 1490','colourCode':'Orange','composition':{'Si':'10.0–13.0','Cu':'0.7–2.5','Mg':'≤0.30','Zn':'≤2.0','Fe':'≤1.0','Mn':'≤0.50','Ni':'≤0.30','Sn':'≤0.20','Al':'Balance'},'tensileStrength':'≥150 MPa','hardness':'55–80 HB','meltingRange':'575–620°C','metalTempRange':'655–700°C','incomingCriteria':'Spectro check every heat. Colour code: Orange band.','acceptanceCriteria':'Within spectro limits per BS 1490'},
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

with app.app_context():
    try:
        db.create_all()
        seed_users()
        seed_qms2()
        # Note: seed_defaults() removed — default data comes from backup restore
    except Exception as e:
        print(f"Startup warning: {e}")

if __name__ == '__main__':
    app.run(debug=True)

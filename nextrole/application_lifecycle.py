"""Private, account-scoped application events; stores metadata, never mail bodies."""
import hashlib
import re
import time
import uuid
from email.utils import parseaddr
from urllib.parse import urlsplit
from recruiter_mail import classify_message,message_text,current_action_text,REJECTION,HIRING_CONTEXT,phrase,POSITIVE
from interview_prep import email_context,clean_context

STAGES={'Referral confirmed':'Referred','Application received':'Applied','Recruiter outreach':'Recruiter reached out','Assessment / next step':'Assessment / next step','Interview invitation':'Interview','Offer':'Offer','Offer accepted':'Offer accepted','Joined':'Joined','Rejected':'Rejected','Withdrawn':'Withdrawn'}
RANK={'Referred':1,'Applied':2,'Recruiter reached out':3,'Assessment / next step':4,'Interview':5,'Offer':6,'Offer accepted':7,'Joined':8}

def account_key(email):return hashlib.sha256(email.strip().casefold().encode()).hexdigest() if email else ''
def initialize(db):
    db.executescript('''CREATE TABLE IF NOT EXISTS lifecycle_jobs(
id TEXT PRIMARY KEY,account TEXT NOT NULL,company TEXT NOT NULL,role TEXT NOT NULL,reference TEXT NOT NULL,url TEXT NOT NULL,created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS lifecycle_events(
account TEXT NOT NULL,message_id TEXT NOT NULL,application_id TEXT NOT NULL,thread_id TEXT NOT NULL,
subject TEXT NOT NULL,sender TEXT NOT NULL,received_at REAL NOT NULL,category TEXT NOT NULL,referrer TEXT NOT NULL DEFAULT '',
PRIMARY KEY(account,message_id));
CREATE INDEX IF NOT EXISTS lifecycle_application_events ON lifecycle_events(account,application_id,received_at);''')
    if 'resolution_needed' not in [r[1] for r in db.execute('PRAGMA table_info(lifecycle_jobs)')]:db.execute('ALTER TABLE lifecycle_jobs ADD COLUMN resolution_needed INTEGER NOT NULL DEFAULT 0')

def headers(message):return {h.get('name','').lower():h.get('value','') for h in message.get('payload',{}).get('headers',[])}
def context(subject,body=''):
    result=email_context(subject,body)
    text=subject+'\n'+body
    # Explicit company/role phrasing, never a guessed sender-domain company.
    if not result['company'] or not result['role']:
        match=re.search(r'(?im)(?:^|\bfor (?:the )?)([A-Za-z][A-Za-z0-9 &+().#/-]{2,70}?)\s+(?:role |position )?at\s+([A-Za-z][A-Za-z0-9 &+().-]{1,70}?)(?=[\n.!|]|$)',text)
        if match:
            role=re.sub(r'^(?:Re:\s*|Fwd:\s*|Interview (?:invitation|confirmation)(?: for)?\s*[-:]?\s*|Referral (?:confirmed|confirmation)(?: for)?\s*[-:]?\s*|Offer (?:letter|of employment)(?: for)?\s*[-:]?\s*)','',match[1],flags=re.I)
            result['company']=result['company'] or clean_context(match[2])
            result['role']=result['role'] or clean_context(role)
    ref=re.search(r'\b(?:job\s*(?:id|reference)|requisition\s*(?:id|number|#)?|req\s*(?:id|#)|application\s*(?:id|reference))\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,79})\b',text,re.I)
    result['reference']=ref[1] if ref else ''
    return result

def lifecycle_event(message,applications=(),own_email=''):
    h=headers(message);sender=h.get('from','');address=parseaddr(sender)[1].casefold()
    if not address or address==own_email.casefold() or h.get('list-id') or h.get('precedence','').lower() in ('bulk','list'):return None
    if set(message.get('labelIds',[]))&{'SENT','DRAFT','SPAM','TRASH'}:return None
    subject=h.get('subject','');body=message_text(message.get('payload',{}));action=current_action_text(body)
    if re.search(r'\b(?:job alerts?|jobs for you|recommended jobs|daily job digest)\b',subject,re.I):return None
    # Do not turn a conditional referral or an old quoted message into a new event.
    if re.search(r'\bif\b[^.!?\n]{0,120}\b(?:referred|referral)\b',action,re.I):action=re.sub(r'\bif\b[^.!?\n]*','',action,flags=re.I)
    positive=classify_message(message,applications,own_email)
    category=positive['category'] if positive else ''
    if category=='Offer' and re.search(r'\b(?:received your acceptance|your acceptance (?:has been|is) confirmed)\b',action,re.I):category='Offer accepted'
    if category=='Referral confirmed' and not any(pattern.search(action) for label,pattern in POSITIVE if label==category):category=''
    if not category and HIRING_CONTEXT.search(subject+'\n'+action):
        if REJECTION.search(current_action_text(subject)) or REJECTION.search(action):category='Rejected'
        elif re.search(r'\b(?:received your application|your application (?:has been|was) received|thank you for applying|application (?:was |has been )?submitted successfully)\b',action,re.I):category='Application received'
    if not category:return None
    try:received=int(message['internalDate'])/1000
    except (TypeError,ValueError,KeyError):return None
    if received<time.time()-90*86400 or received>time.time()+86400:return None
    info=context(subject,body)
    if positive and positive.get('application_id'):
        app=next((a for a in applications if a['id']==positive['application_id']),None)
        if app:info.update(company=app['company'],role=app['role'],reference=app.get('reference') or info['reference'],url=app.get('url',''))
    referrer=''
    if category=='Referral confirmed':
        if re.search(r'\b(?:i|we) (?:have )?referred you\b',action,re.I):referrer=parseaddr(sender)[0]
        explicit=re.search(r'\breferred by\s+([A-Za-z][A-Za-z .\u2019-]{1,65})(?=[\n,!]|$)',body,re.I)
        if explicit:referrer=explicit[1].strip()
    return {**info,'message_id':message['id'],'thread_id':message.get('threadId',message['id']),'subject':subject[:300],'sender':sender[:400],'received_at':received,'category':category,'referrer':referrer[:100]}

def norm(value):return ' '.join(re.findall(r'\w+',str(value).casefold()))
def ingest(db,email,event):
    owner=account_key(email)
    if not owner:return
    rows=[dict(r) for r in db.execute('SELECT * FROM lifecycle_jobs WHERE account=?',(owner,))]
    def compatible(row):return all(not event.get(k) or not row[k] or norm(event[k])==norm(row[k]) for k in ('company','role','reference'))
    candidates=[]
    if event.get('reference'):
        candidates=[r for r in rows if r['reference'] and norm(r['reference'])==norm(event['reference']) and compatible(r)]
    if not candidates and event.get('company') and event.get('role'):
        candidates=[r for r in rows if norm(r['company'])==norm(event['company']) and norm(r['role'])==norm(event['role']) and compatible(r)]
    if not candidates:
        threads={r[0] for r in db.execute('SELECT application_id FROM lifecycle_events WHERE account=? AND thread_id=?',(owner,event['thread_id']))}
        candidates=[r for r in rows if r['id'] in threads and compatible(r)]
    if len(candidates)==1:app=candidates[0]
    else:
        # No confident match: isolate this thread, never merge by company/domain alone.
        old=db.execute('SELECT application_id FROM lifecycle_events WHERE account=? AND message_id=?',(owner,event['message_id'])).fetchone()
        app=next((r for r in rows if old and r['id']==old[0]),None)
        if app is None:
            app={'id':uuid.uuid4().hex,'account':owner,'company':'','role':'','reference':'','url':'','created_at':event['received_at']}
            db.execute('INSERT INTO lifecycle_jobs(id,account,company,role,reference,url,created_at) VALUES(:id,:account,:company,:role,:reference,:url,:created_at)',app)
            if len(candidates)>1:db.execute('UPDATE lifecycle_jobs SET resolution_needed=1 WHERE id=?',(app['id'],))
    for key in ('company','role','reference','url'):
        if not app[key] and event.get(key):app[key]=str(event[key])[:300]
    db.execute('UPDATE lifecycle_jobs SET company=:company,role=:role,reference=:reference,url=:url WHERE id=:id AND account=:account',app)
    if event.get('reference'):db.execute('UPDATE lifecycle_jobs SET resolution_needed=0 WHERE id=? AND account=?',(app['id'],owner))
    db.execute('''INSERT INTO lifecycle_events VALUES(:account,:message_id,:application_id,:thread_id,:subject,:sender,:received_at,:category,:referrer)
ON CONFLICT(account,message_id) DO UPDATE SET application_id=excluded.application_id,category=excluded.category,referrer=excluded.referrer''',{'account':owner,'application_id':app['id'],**{k:event.get(k,'') for k in ('message_id','thread_id','subject','sender','received_at','category','referrer')}})

def records(db,email):
    owner=account_key(email);items=[]
    for row in db.execute('SELECT * FROM lifecycle_jobs WHERE account=?',(owner,)):
        app=dict(row);app.pop('account',None)
        events=[dict(r) for r in db.execute('SELECT message_id,thread_id,subject,sender,received_at,category,referrer FROM lifecycle_events WHERE account=? AND application_id=? ORDER BY received_at,message_id',(owner,app['id']))]
        if not events:continue
        status='';referred=False
        for event in events:
            stage=STAGES.get(event['category'],'Update received');referred|=stage=='Referred'
            if stage in ('Rejected','Withdrawn') or status in ('Rejected','Withdrawn') or RANK.get(stage,0)>=RANK.get(status,0):status=stage
        app.update(status=status,referred=referred,referrers=list(dict.fromkeys(e['referrer'] for e in events if e['referrer'])),events=events,last_updated=events[-1]['received_at'],needs_details=not(app['company'] and app['role']) or bool(app.pop('resolution_needed',0)))
        items.append(app)
    return sorted(items,key=lambda a:a['last_updated'],reverse=True)

def update_details(db,email,body):
    company=clean_context(body.get('company'));role=clean_context(body.get('role'));reference=body.get('reference','')
    if not company or not role or not isinstance(reference,str) or len(reference)>80:raise ValueError('Enter a company and role, and a job ID up to 80 characters.')
    changed=db.execute('UPDATE lifecycle_jobs SET company=?,role=?,reference=?,resolution_needed=0 WHERE id=? AND account=?',(company,role,reference.strip(),body.get('id'),account_key(email))).rowcount
    if not changed:raise ValueError('This application is not available for the connected Gmail account.')

"""Read-only Gmail OAuth, private local application tracking, positive notifications."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date,datetime,timedelta,timezone
import base64
import ctypes
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode,quote,urlsplit
from recruiter_mail import classify_message,message_text
from interview_prep import email_context,CATEGORIES

SCOPE='https://www.googleapis.com/auth/gmail.readonly'
ROOT=Path(__file__).parent
IST=timezone(timedelta(hours=5,minutes=30))

class MailError(Exception):pass

class Vault:
    """Credentials are encrypted for the Windows account running the backend."""
    def __init__(self,path):self.path=Path(path)
    def crypt(self,data,decrypt=False):
        if os.name!='nt':raise MailError('Encrypted Gmail connection storage requires Windows on this installation.')
        from ctypes import wintypes
        class Blob(ctypes.Structure):_fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]
        buf=ctypes.create_string_buffer(data);incoming=Blob(len(data),ctypes.cast(buf,ctypes.POINTER(ctypes.c_ubyte)));out=Blob()
        crypt32=ctypes.WinDLL('crypt32',use_last_error=True)
        fn=crypt32.CryptUnprotectData if decrypt else crypt32.CryptProtectData
        fn.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
        fn.restype=wintypes.BOOL
        if not fn(ctypes.byref(incoming),None,None,None,None,1,ctypes.byref(out)):
            if ctypes.get_last_error()==2:raise MailError('Windows credential storage is unavailable in this process. Start the backend from your own signed-in Windows PowerShell window.')
            raise MailError('The Gmail connection could not be unlocked by this Windows account. Reconnect Gmail.')
        try:return ctypes.string_at(out.data,out.size)
        finally:
            free=ctypes.windll.kernel32.LocalFree;free.argtypes=[ctypes.c_void_p];free.restype=ctypes.c_void_p;free(out.data)
    def load(self):
        if not self.path.exists():return {}
        try:return json.loads(self.crypt(self.path.read_bytes(),True))
        except MailError:raise
        except Exception:raise MailError('The saved Gmail connection could not be read. Reconnect Gmail.') from None
    def save(self,data):
        encrypted=self.crypt(json.dumps(data).encode());self.path.parent.mkdir(parents=True,exist_ok=True)
        tmp=self.path.with_suffix('.tmp');tmp.write_bytes(encrypted);os.replace(tmp,self.path)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def google_request(url,form=None,token=None):
    parsed=urlsplit(url)
    gmail=parsed.scheme=='https' and parsed.netloc=='gmail.googleapis.com' and re.fullmatch(r'/gmail/v1/users/me/(?:profile|messages(?:/[a-fA-F0-9]{8,64})?)',parsed.path) and form is None
    oauth=url in ('https://oauth2.googleapis.com/token','https://oauth2.googleapis.com/revoke') and form is not None
    if not (gmail or oauth):raise MailError('Only read-only Gmail endpoints and Google authorization endpoints are supported.')
    request=urllib.request.Request(url,data=urlencode(form).encode() if form is not None else None,headers={'Accept':'application/json'})
    if form is not None:request.add_header('Content-Type','application/x-www-form-urlencoded')
    if token:request.add_unredirected_header('Authorization','Bearer '+token)
    try:
        with urllib.request.build_opener(NoRedirect).open(request,timeout=12) as response:raw=response.read(2_000_001)
        if len(raw)>2_000_000:raise MailError('This email exceeds the supported size and could not be checked.')
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        if error.code in (400,401):raise MailError('Google authorization expired or was rejected. Reconnect Gmail.') from None
        if error.code in (403,429):raise MailError('Gmail access is unavailable or rate limited. Check that Gmail API is enabled and read-only access was granted.') from None
        raise MailError('Gmail is temporarily unavailable. Try again later.') from None
    except (OSError,ValueError):raise MailError('Gmail could not be reached. Existing notifications remain available.') from None

class RecruiterInbox:
    def __init__(self,path=None,vault=None,request=google_request):
        self.path=Path(path or ROOT/'data'/'recruiter-inbox.sqlite3');self.path.parent.mkdir(parents=True,exist_ok=True)
        self.vault=vault or Vault(ROOT/'data'/'gmail-auth.bin');self.request=request
        self.auth_lock=threading.RLock();self.sync_lock=threading.Lock();self.pending=None;self.syncing=False;self.error='';self.last_checked=None;self.last_started=0;self.generation=0
        self.prep_context={};self.seen=set();self.queue=[];self.cursor=None;self.signature=None
        with self.db() as db:db.executescript('''CREATE TABLE IF NOT EXISTS applications(
id TEXT PRIMARY KEY,company TEXT NOT NULL,role TEXT NOT NULL,url TEXT NOT NULL,reference TEXT NOT NULL,
applied_at REAL NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,application_id TEXT NOT NULL,
message_id TEXT NOT NULL,thread_id TEXT NOT NULL,subject TEXT NOT NULL,sender TEXT NOT NULL,
received_at REAL NOT NULL,category TEXT NOT NULL,seen INTEGER NOT NULL DEFAULT 0,UNIQUE(application_id,message_id));''')
    @contextmanager
    def db(self):
        db=sqlite3.connect(self.path,timeout=10);db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()
    def applications(self):
        with self.db() as db:return [dict(r) for r in db.execute('SELECT * FROM applications WHERE active=1 ORDER BY applied_at DESC')]
    def track(self,job,body):
        company=body.get('company',job['company']);role=body.get('role',job['title']);reference=body.get('reference','')
        if any(not isinstance(x,str) or not 2<=len(x.strip())<=300 for x in (company,role)) or not isinstance(reference,str) or len(reference)>100:raise MailError('Check the company, role and application reference.')
        try:
            applied=date.fromisoformat(body.get('applied_date',''))
            if not datetime.now(IST).date()-timedelta(days=365)<=applied<=datetime.now(IST).date():raise ValueError()
        except (ValueError,TypeError):raise MailError('Choose an application date within the past year.') from None
        with self.auth_lock,self.db() as db:
            existing=db.execute('SELECT * FROM applications WHERE id=?',(job['id'],)).fetchone()
            if (not existing or not existing['active']) and db.execute('SELECT count(*) FROM applications WHERE active=1').fetchone()[0]>=100:raise MailError('Untrack an older application before adding another (100 active applications maximum).')
            applied_at=datetime.combine(applied,datetime.min.time(),IST).timestamp()
            if existing and (existing['company'],existing['role'],existing['reference'],existing['applied_at'])!=(company.strip(),role.strip(),reference.strip(),applied_at):db.execute("UPDATE notifications SET application_id='' WHERE application_id=?",(job['id'],))
            db.execute('INSERT INTO applications VALUES(?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET company=excluded.company,role=excluded.role,url=excluded.url,reference=excluded.reference,applied_at=excluded.applied_at,active=1',
                       (job['id'],company.strip(),role.strip(),job['url'],reference.strip(),applied_at))
            self.generation+=1;self.seen.clear();self.queue=[];self.cursor=None;self.signature=None
        return {'tracked':True}
    def untrack(self,identity):
        with self.auth_lock,self.db() as db:
            db.execute('UPDATE applications SET active=0 WHERE id=?',(identity,));self.generation+=1
    def configure(self,body):
        installed=body.get('installed')
        if not isinstance(installed,dict):raise MailError('Choose the Google OAuth client JSON for a Desktop app, not a web app or service account.')
        client=installed.get('client_id','');secret=installed.get('client_secret','')
        if not isinstance(client,str) or not re.fullmatch(r'[A-Za-z0-9._-]{10,200}\.apps\.googleusercontent\.com',client) or not isinstance(secret,str) or not 6<=len(secret)<=300:raise MailError('The Desktop OAuth client JSON is invalid.')
        with self.auth_lock:
            self.vault.save({'client_id':client,'client_secret':secret});self.pending=None;self.generation+=1
            with self.db() as db:db.execute('DELETE FROM notifications')
        return {'configured':True}
    def begin(self,port):
        with self.auth_lock:
            auth=self.vault.load()
            if not auth.get('client_id'):raise MailError('Upload your Desktop OAuth client JSON first.')
            verifier=secrets.token_urlsafe(48);state=secrets.token_urlsafe(32)
            redirect=f'http://127.0.0.1:{int(port)}/api/gmail/callback'
            self.pending={'verifier':verifier,'state':state,'expires':time.time()+600,'redirect':redirect}
            params={'client_id':auth['client_id'],'redirect_uri':redirect,'response_type':'code','scope':SCOPE,'state':state,'access_type':'offline','prompt':'consent select_account','code_challenge_method':'S256','code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
            return {'url':'https://accounts.google.com/o/oauth2/v2/auth?'+urlencode(params)}
    def finish(self,params):
        with self.auth_lock:
            pending=self.pending
            state=params.get('state',[''])[0]
            if not pending or pending['expires']<time.time() or not secrets.compare_digest(state,pending['state']):raise MailError('This Gmail authorization request expired or is invalid. Connect Gmail again.')
            self.pending=None
            if params.get('error'):raise MailError('Gmail connection was cancelled or denied. No mailbox access was added.')
            code=params.get('code',[''])[0]
            if not code:raise MailError('Google did not return an authorization code.')
            auth=self.vault.load()
            token=self.request('https://oauth2.googleapis.com/token',{'client_id':auth['client_id'],'client_secret':auth['client_secret'],'code':code,'code_verifier':pending['verifier'],'redirect_uri':pending['redirect'],'grant_type':'authorization_code'})
            if not token.get('access_token') or (token.get('scope') and SCOPE not in token['scope'].split()):raise MailError('Read-only Gmail access was not granted.')
            profile=self.request('https://gmail.googleapis.com/gmail/v1/users/me/profile',token=token['access_token'])
            if not profile.get('emailAddress'):raise MailError('The selected Gmail account could not be verified.')
            if auth.get('email')!=profile['emailAddress']:
                with self.db() as db:db.execute('DELETE FROM notifications')
            elif not token.get('refresh_token') and auth.get('token',{}).get('refresh_token'):
                token['refresh_token']=auth['token']['refresh_token']
            auth.update({'token':token,'expires_at':time.time()+int(token.get('expires_in',3600))-60,'email':profile['emailAddress']})
            self.vault.save(auth);self.generation+=1;self.seen.clear();self.queue=[];self.cursor=None;self.signature=None;self.error=''
        self.sync(force=True)
    def access(self):
        with self.auth_lock:
            self.prep_context.clear()
            auth=self.vault.load();token=auth.get('token',{})
            if not token:raise MailError('Connect Gmail to check recruiter replies.')
            if auth.get('expires_at',0)<time.time():
                if not token.get('refresh_token'):raise MailError('Reconnect Gmail to renew read-only access.')
                updated=self.request('https://oauth2.googleapis.com/token',{'client_id':auth['client_id'],'client_secret':auth['client_secret'],'refresh_token':token['refresh_token'],'grant_type':'refresh_token'})
                if not updated.get('access_token'):raise MailError('Reconnect Gmail to renew read-only access.')
                token.update(updated);auth['token']=token;auth['expires_at']=time.time()+int(updated.get('expires_in',3600))-60;self.vault.save(auth)
            return token['access_token'],auth.get('email','')
    def status(self):
        try:auth=self.vault.load();storage_error=''
        except MailError as error:auth={};storage_error=str(error)
        with self.db() as db:count=db.execute('SELECT count(*) FROM notifications WHERE seen=0').fetchone()[0]
        return {'configured':bool(auth.get('client_id')),'connected':bool(auth.get('token')),'email':auth.get('email',''),'checking':self.syncing,'unread':count,'last_checked':self.last_checked,'error':storage_error or self.error,'applications':self.applications()}
    def notifications(self):
        with self.db() as db:return [dict(r) for r in db.execute('SELECT n.*,a.company,a.role,a.url AS job_url FROM notifications n LEFT JOIN applications a ON a.id=n.application_id ORDER BY n.received_at DESC LIMIT 100')]
    def interview_invitations(self):
        items=[]
        for item in self.notifications():
            if item['category'] not in CATEGORIES or item['received_at']<time.time()-90*86400:continue
            context=self.prep_context.get(item['message_id']) or email_context(item['subject'],application=item)
            items.append({**item,**context})
        return items
    def interview_context(self,identity):
        item=next((i for i in self.interview_invitations() if str(i['id'])==str(identity)),None)
        if not item:raise MailError('This interview invitation is no longer available.')
        if item.get('company') and item.get('role'):return item
        token,_=self.access()
        message=self.request('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+quote(item['message_id'])+'?format=full',token=token)
        # Reclassify the latest message so a stale/changed invitation cannot be used.
        positive=classify_message(message,self.applications(),self.status().get('email',''))
        if not positive or positive['category'] not in CATEGORIES:raise MailError('This message is not a current interview or assessment invitation.')
        context=email_context(item['subject'],message_text(message.get('payload',{})),item)
        self.prep_context[item['message_id']]=context
        return {**item,**context}
    def mark_seen(self):
        with self.db() as db:db.execute('UPDATE notifications SET seen=1')
    def disconnect(self):
        with self.auth_lock:
            self.prep_context.clear()
            auth=self.vault.load();token=auth.get('token',{})
            # Remove local access before the bounded remote revocation attempt.
            self.vault.save({k:v for k,v in auth.items() if k in ('client_id','client_secret')});self.generation+=1;self.pending=None;self.seen.clear();self.queue=[];self.error=''
            with self.db() as db:db.execute('DELETE FROM notifications')
        if token:
            try:self.request('https://oauth2.googleapis.com/revoke',{'token':token.get('refresh_token') or token.get('access_token')})
            except MailError:return {'disconnected':True,'message':'Local access removed. You can also revoke NextRole in your Google Account connections.'}
        return {'disconnected':True}
    def sync(self,force=False):
        if self.syncing or (not force and time.time()-self.last_started<60):return {'checking':self.syncing}
        if not self.sync_lock.acquire(False):return {'checking':True}
        self.syncing=True;self.last_started=time.time()
        def work():
            try:
                with self.auth_lock:
                    apps=self.applications()
                    generation=self.generation;token,email=self.access()
                # Find recruitment messages independently of application tracking.
                query='after:'+str(int(time.time()//86400)*86400-90*86400)+' -in:sent -in:drafts -in:spam -in:trash {interview recruiter recruitment hiring assessment shortlisted "offer of employment" "offer letter" "your application" "your profile" "career opportunity" "job opportunity" "role" "position" "resume" "cv" "screening" "selection process" "online test" "invitation"}'
                signature=(query,generation)
                if signature!=self.signature:self.signature=signature;self.queue=[];self.cursor=None;self.seen.clear()
                # Always revisit the newest page before continuing historical pages.
                # A long 90-day backlog must not delay a newly arrived invitation.
                params={'q':query,'maxResults':40}
                newest=self.request('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+urlencode(params),token=token)
                def unseen(result):return [m['id'] for m in result.get('messages',[]) if re.fullmatch(r'[a-fA-F0-9]{8,64}',m.get('id','')) and m['id'] not in self.seen]
                if not self.queue:
                    if self.cursor:
                        history=self.request('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+urlencode({**params,'pageToken':self.cursor}),token=token)
                    else:history=newest
                    self.cursor=history.get('nextPageToken');self.queue=unseen(history)
                self.queue=list(dict.fromkeys(unseen(newest)+self.queue))
                batch=self.queue[:20];self.queue=self.queue[20:]
                def read(identity):
                    message=self.request('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+quote(identity)+'?format=full',token=token)
                    return identity,classify_message(message,apps,email)
                with ThreadPoolExecutor(max_workers=4) as pool:
                    for identity,positive in pool.map(read,batch):
                        with self.auth_lock:
                            if generation!=self.generation:return
                            self.seen.add(identity)
                            if positive:
                                with self.db() as db:db.execute('INSERT OR IGNORE INTO notifications(application_id,message_id,thread_id,subject,sender,received_at,category) SELECT :application_id,:message_id,:thread_id,:subject,:sender,:received_at,:category WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE message_id=:message_id)',positive)
                self.last_checked=time.time();self.error=''
                if len(self.seen)>10000:self.seen.clear()
            except MailError as error:self.error=str(error)
            except Exception:self.error='Gmail could not be checked. Existing notifications remain available.'
            finally:self.syncing=False;self.sync_lock.release()
        threading.Thread(target=work,daemon=True,name='recruiter-inbox-check').start()
        return {'checking':True}
    def start(self):
        def loop():
            while True:
                if self.status()['connected']:self.sync()
                time.sleep(300)
        threading.Thread(target=loop,daemon=True,name='recruiter-inbox-poll').start()

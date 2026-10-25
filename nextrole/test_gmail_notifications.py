"""Synthetic mailbox tests: never connects to a real Gmail account."""
import base64
import copy
from datetime import datetime,timedelta
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from functools import partial
from urllib.parse import urlsplit,parse_qs
from unittest.mock import patch
from gmail_notifications import RecruiterInbox,Vault,MailError,SCOPE,IST,google_request
from recruiter_mail import classify_message,message_text

def message(text='Acme Labs Software Engineer: please complete the assessment.',subject='Next steps',**changes):
    result={'id':'abcdef123456','threadId':'123456abcdef','internalDate':str(int(time.time()*1000)),
            'labelIds':['INBOX'],'payload':{'mimeType':'text/plain','headers':[{'name':'From','value':'Recruiter <hiring@acme.example>'},{'name':'Subject','value':subject}],
            'body':{'data':base64.urlsafe_b64encode(text.encode()).decode()}}}
    result.update(changes);return result

APP={'id':'job-1','company':'Acme Labs','role':'Software Engineer','reference':'','applied_at':time.time()-86400}

class ClassificationTests(unittest.TestCase):
    def test_positive_categories(self):
        for text,category in [('Please complete the assessment.','Assessment / next step'),('We invite you to an interview.','Interview invitation'),('Your offer of employment is attached.','Offer')]:
            with self.subTest(category=category):self.assertEqual(classify_message(message('Acme Labs Software Engineer: '+text),[APP])['category'],category)
    def test_rejection_and_conditional_win(self):
        for text in ['Unfortunately we will not proceed.','Your application was unsuccessful.','We decided not to move forward.','If you are shortlisted, confirm your availability.','We are not able to move forward with your application.','Your application was rejected.']:
            with self.subTest(text=text):self.assertIsNone(classify_message(message('Acme Labs Software Engineer: '+text,'Interview invitation'),[APP]))
    def test_confirmed_shortlist_survives_conditional_boilerplate(self):
        body=('Thank you for your interest in our company and for sending your resume. '
              'We are pleased to inform you that your application has been shortlisted for the next stage of the recruitment process. '
              'If you are selected for an interview, we will send you the date and time. '
              'If you are not selected for the interview, please do not be discouraged.')
        result=classify_message(message(body,'Internship at ExampleCo'),[])
        self.assertEqual(result['category'],'Assessment / next step')
        for ending in ['Unfortunately, we will not proceed.','Your application was rejected.','We decided not to move forward.']:
            self.assertIsNone(classify_message(message(body+' '+ending,'Internship at ExampleCo'),[]))
    def test_only_conditional_outcomes_are_not_notifications(self):
        for body in ['If you are selected for an interview, confirm your availability.',
                     'If shortlisted, confirm your availability.',
                     "If you’re shortlisted, confirm your availability.",
                     'Candidates may be invited to an interview for the role.',
                     'You may be shortlisted. Please wait for an update.',
                     'If you are not selected, please continue your job search.']:
            self.assertIsNone(classify_message(message(body,'Internship at ExampleCo'),[]))
    def test_neutral_and_unrelated(self):
        for text in ['Thank you for applying. We received your application.','Here are our latest jobs.','Enjoy a special discount offer.']:
            self.assertIsNone(classify_message(message('Acme Labs Software Engineer: '+text),[APP]))
        self.assertIsNotNone(classify_message(message('Different Company Data Analyst role: interview invitation'),[]))
    def test_application_matching_is_optional(self):
        self.assertEqual(classify_message(message('Acme Labs: interview invitation'),[])['application_id'],'')
        self.assertEqual(classify_message(message(),[APP,{**APP,'id':'job-2'}])['application_id'],'')
        app={**APP,'reference':'ACME-1234'}
        self.assertEqual(classify_message(message('ACME-1234: interview invitation'),[app])['application_id'],'job-1')
        self.assertEqual(classify_message(message('ACME-12345: interview invitation'),[app])['application_id'],'')
    def test_untracked_outreach_and_rejections(self):
        self.assertEqual(classify_message(message('I came across your profile and have a software engineer role to discuss.'),[])['category'],'Recruiter outreach')
        self.assertIsNone(classify_message(message('I came across your profile. Unfortunately, the role is no longer available.'),[]))
        self.assertIsNone(classify_message(message('I came across your profile. Buy our marketing package.'),[]))
        self.assertIsNone(classify_message(message('I came across your profile for a new role.','Daily job digest'),[]))
        self.assertEqual(classify_message(message('Please share your updated resume for our engineer role.'),[])['category'],'Recruiter outreach')
        self.assertEqual(classify_message(message('Would you be interested in a Senior Data Engineer position?'),[])['category'],'Recruiter outreach')
    def test_old_and_own_messages_ignored(self):
        self.assertIsNone(classify_message(message(internalDate='1000'),[APP]))
        self.assertIsNone(classify_message(message(),[APP],'hiring@acme.example'))
        for label in ['SENT','SPAM','TRASH','DRAFT']:self.assertIsNone(classify_message(message(labelIds=[label]),[APP]))
    def test_mailing_lists_ignored(self):
        mail=message();mail['payload']['headers'].append({'name':'List-ID','value':'jobs.example'})
        self.assertIsNone(classify_message(mail,[APP]))
    def test_quoted_invitation_is_not_current_positive(self):
        self.assertIsNone(classify_message(message('Acme Labs Software Engineer: thank you for confirming.','Re: Interview invitation'),[APP]))
        for quoted in ['\nOn Tuesday Recruiter wrote:\nAcme Labs Software Engineer interview invitation','\n> Acme Labs Software Engineer interview invitation']:
            self.assertIsNone(classify_message(message('Thank you.'+quoted),[APP]))
        mail=message();mail['payload']['mimeType']='text/html'
        mail['payload']['body']['data']=base64.urlsafe_b64encode(b'<p>Thank you.</p><div class="gmail_quote"><div>Acme Labs Software Engineer interview invitation</div></div>').decode()
        self.assertIsNone(classify_message(mail,[APP]))
    def test_forwarded_invitation_stays_history(self):
        body=('---------- Forwarded message ---------\nFrom: hiring@example.com\n'
              'Subject: Engineering role\nTo: applicant@example.com\n\n'
              'Please complete the online assessment for the role.')
        self.assertIsNone(classify_message(message(body,'Fwd: Engineering role')))
        html='<div class="gmail_quote"><p>Please complete the online assessment for the role.</p></div>'
        mail=message(html,'Fwd: Engineering role');mail['payload']['mimeType']='text/html'
        self.assertIsNone(classify_message(mail))
    def test_common_invitation_variants_and_rescheduling(self):
        for body in ['We invite you to attend a virtual interview on Monday.',
                     'You have been selected for a technical interview.',
                     'We have scheduled your interview for Monday.',
                     'Unfortunately the interviewer is unavailable. Please reschedule your interview.',
                     'Please complete the online assessment for the role before meeting the other candidates.']:
            self.assertIsNotNone(classify_message(message(body,'Next steps')))
        mail=message('We invite you to attend a virtual interview on Monday.','Interview')
        mail['payload']['headers'][0]['value']='Person <person@example.com>'
        self.assertEqual(classify_message(mail)['category'],'Interview invitation')
        self.assertIsNone(classify_message(message('We invite you to an interview for our podcast.','Podcast interview')))
    def test_attachments_ignored(self):
        mail=message();part=copy.deepcopy(mail['payload']);part['filename']='invitation.txt'
        self.assertEqual(message_text({'parts':[part]}),'')

class MemoryVault:
    def __init__(self):self.data={}
    def load(self):return copy.deepcopy(self.data)
    def save(self,data):self.data=copy.deepcopy(data)

class InboxTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.vault=MemoryVault();self.calls=[];self.messages=[message()]
        self.inbox=RecruiterInbox(Path(self.tmp.name)/'private.sqlite3',self.vault,self.request)
        self.inbox.track({'id':'job-1','company':'Acme Labs','title':'Software Engineer','url':'https://acme.example/jobs/1'},{'applied_date':(datetime.now(IST)-timedelta(days=1)).date().isoformat()})
    def tearDown(self):
        self.wait();self.tmp.cleanup()
    def request(self,url,form=None,token=None):
        self.calls.append((url,form,token))
        if url.endswith('/token'):return {'access_token':'secret-access','refresh_token':'secret-refresh','expires_in':3600,'scope':SCOPE}
        if url.endswith('/profile'):return {'emailAddress':'applicant@example.com'}
        if '/messages?' in url:return {'messages':[{'id':m['id']} for m in self.messages]}
        if '/messages/' in url:return next(copy.deepcopy(m) for m in self.messages if m['id'] in url)
        return {}
    def configure(self):self.inbox.configure({'installed':{'client_id':'1234567890-example.apps.googleusercontent.com','client_secret':'secret-client','token_uri':'https://evil.example'}})
    def connect(self):
        self.configure();query=parse_qs(urlsplit(self.inbox.begin(8081)['url']).query)
        self.inbox.finish({'state':query['state'],'code':['secret-code']});self.wait()
    def wait(self):
        deadline=time.time()+3
        while self.inbox.syncing and time.time()<deadline:time.sleep(.01)
        self.assertFalse(self.inbox.syncing)
    def test_oauth_pkce_scope_and_fixed_endpoints(self):
        self.configure();q=parse_qs(urlsplit(self.inbox.begin(8081)['url']).query)
        self.assertEqual(q['scope'],[SCOPE]);self.assertEqual(q['code_challenge_method'],['S256'])
        with self.assertRaises(MailError):self.inbox.finish({'state':['wrong'],'code':['x']})
        self.assertEqual(self.calls,[])
        self.inbox.finish({'state':q['state'],'code':['secret-code']});self.wait()
        self.assertEqual(self.calls[0][0],'https://oauth2.googleapis.com/token')
        self.assertTrue(self.calls[0][1]['code_verifier'])
        with self.assertRaises(MailError):self.inbox.finish({'state':q['state'],'code':['secret-code']})
    def test_denied_and_expired_authorization(self):
        self.configure();q=parse_qs(urlsplit(self.inbox.begin(8081)['url']).query)
        with self.assertRaises(MailError):self.inbox.finish({'state':q['state'],'error':['access_denied']})
        self.inbox.begin(8081);self.inbox.pending['expires']=0
        with self.assertRaises(MailError):self.inbox.finish({'state':[self.inbox.pending['state']],'code':['x']})
        self.assertEqual(self.calls,[])
    def test_positive_only_dedup_and_no_body_storage(self):
        self.messages += [message('Acme Labs Software Engineer: unfortunately, not selected. BODY-CANARY',id='abcdef123457'),message('Acme Labs Software Engineer: received your application. BODY-CANARY',id='abcdef123458')]
        self.connect();self.assertEqual(len(self.inbox.notifications()),1)
        self.inbox.sync(force=True);self.wait();self.assertEqual(len(self.inbox.notifications()),1)
        self.assertEqual(self.inbox.status()['unread'],1)
        before=len(self.calls);self.inbox.mark_seen();self.assertEqual(len(self.calls),before)
        self.assertEqual(self.inbox.status()['unread'],0)
        self.assertNotIn(b'BODY-CANARY',self.inbox.path.read_bytes())
        public=json.dumps(self.inbox.status())
        for secret in ['secret-access','secret-refresh','secret-client']:self.assertNotIn(secret,public)
    def test_candidate_query_does_not_hide_promotions_labelled_recruiter_mail(self):
        self.connect()
        query=next(parse_qs(urlsplit(url).query)['q'][0] for url,_,_ in self.calls if '/messages?' in url)
        self.assertNotIn('-category:promotions',query)
    def test_new_mail_has_priority_over_existing_history_queue(self):
        self.connect()
        old=message('Received your application.',id='abcdef123459')
        new=message('Your application has been shortlisted.',subject='Internship at ExampleCo',id='abcdef123460')
        self.messages=[new,old,*self.messages]
        self.inbox.queue=[old['id']];self.inbox.cursor='old-history-page'
        self.inbox.sync(force=True);self.wait()
        self.assertTrue(any(n['message_id']==new['id'] for n in self.inbox.notifications()))
        reads=[url for url,_,_ in self.calls if '/messages/' in url]
        self.assertLess(next(i for i,url in enumerate(reads) if new['id'] in url),next(i for i,url in enumerate(reads) if old['id'] in url))
    def test_disconnect_keeps_applications_and_removes_access(self):
        self.connect();self.inbox.disconnect()
        self.assertFalse(self.inbox.status()['connected']);self.assertEqual(self.inbox.notifications(),[])
        self.assertEqual(len(self.inbox.applications()),1)
        self.assertEqual(self.calls[-1][0],'https://oauth2.googleapis.com/revoke')
    def test_untrack_does_not_hide_recruiter_notifications(self):
        self.connect();self.inbox.untrack('job-1')
        self.assertEqual(len(self.inbox.notifications()),1);self.assertEqual(self.inbox.status()['unread'],1)
    def test_refresh_preserves_refresh_token(self):
        self.connect();self.vault.data['expires_at']=0
        self.inbox.access();self.assertEqual(self.vault.data['token']['refresh_token'],'secret-refresh')
    def test_failed_check_keeps_existing_updates_and_hides_raw_errors(self):
        self.connect()
        def failed(*args,**kwargs):raise ValueError('PRIVATE-MAIL-CANARY')
        self.inbox.request=failed;self.inbox.sync(force=True);self.wait()
        self.assertEqual(len(self.inbox.notifications()),1)
        self.assertNotIn('PRIVATE-MAIL-CANARY',self.inbox.status()['error'])
    def test_changed_application_keeps_mail_but_removes_old_context(self):
        self.connect();self.inbox.untrack('job-1')
        self.inbox.track({'id':'job-1','company':'Other Company','title':'Other Role','url':'https://example.com/other'},{'applied_date':datetime.now(IST).date().isoformat()})
        self.assertEqual(len(self.inbox.notifications()),1)
        self.assertEqual(self.inbox.notifications()[0]['application_id'],'')
    def test_check_runs_without_any_tracked_applications(self):
        self.inbox.untrack('job-1');self.connect()
        self.assertEqual(len(self.inbox.notifications()),1)
        self.assertTrue(self.inbox.last_checked)
        queries=[parse_qs(urlsplit(url).query)['q'][0] for url,_,_ in self.calls if '/messages?' in url]
        self.assertTrue(queries);self.assertNotIn('Acme',queries[0])
        self.assertNotIn('-category:social',queries[0])
    def test_missing_readonly_grant_rejected(self):
        self.configure();q=parse_qs(urlsplit(self.inbox.begin(8081)['url']).query)
        self.inbox.request=lambda *args,**kwargs:{'access_token':'synthetic','scope':'openid email'}
        with self.assertRaises(MailError):self.inbox.finish({'state':q['state'],'code':['code']})
        self.assertFalse(self.inbox.status()['connected'])
    def test_readonly_endpoint_guard(self):
        for url,form in [('https://evil.example',None),('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{}),('https://gmail.googleapis.com/gmail/v1/users/me/messages/abcdef123456/modify',{}),('https://gmail.googleapis.com/gmail/v1/users/me/messages',{})]:
            with self.assertRaises(MailError):google_request(url,form)
    def test_windows_vault_roundtrip(self):
        if os.name!='nt':self.skipTest('Windows DPAPI')
        vault=Vault(Path(self.tmp.name)/'auth.bin')
        try:vault.save({'token':'synthetic-secret'})
        except MailError as error:
            if 'unavailable in this process' in str(error):self.skipTest('Sandbox Windows profile has no DPAPI key; verify in the user-run backend.')
            raise
        self.assertEqual(vault.load(),{'token':'synthetic-secret'})
        self.assertNotIn(b'synthetic-secret',vault.path.read_bytes())

class HttpInboxTests(unittest.TestCase):
    def setUp(self):
        from server import Handler,ROOT
        self.tmp=tempfile.TemporaryDirectory();self.inbox=RecruiterInbox(Path(self.tmp.name)/'inbox.sqlite3',MemoryVault())
        self.mock=patch('server.get_recruiter_inbox',return_value=self.inbox);self.mock.start()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.origin='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.mock.stop();self.tmp.cleanup()
    def get(self,path,headers=None):
        try:
            with urllib.request.urlopen(urllib.request.Request(self.origin+path,headers=headers or {})) as r:return r.status,r.read(),r.headers
        except urllib.error.HTTPError as e:return e.code,e.read(),e.headers
    def test_private_endpoint_rejects_unrelated_origin_and_host(self):
        self.assertEqual(self.get('/api/notifications')[0],200)
        self.assertEqual(self.get('/api/notifications',{'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.get('/api/notifications',{'Host':'evil.example:'+str(self.server.server_port)})[0],403)
    def test_interview_endpoints_are_private_and_require_real_invitation(self):
        self.assertEqual(self.get('/api/interviews')[0],200)
        self.assertEqual(self.get('/api/interviews',{'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.get('/api/interviews',{'Host':'evil.example:'+str(self.server.server_port)})[0],403)
        for path in ['/api/interviews/context','/api/interviews/prepare']:
            req=urllib.request.Request(self.origin+path,data=b'{"invitation_id":"invented","company":"Acme","role":"Engineer"}',headers={'Content-Type':'application/json'})
            with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(req)
            self.assertEqual(error.exception.code,422)
    def test_callback_does_not_echo_authorization_code(self):
        code,body,headers=self.get('/api/gmail/callback?state=invalid&code=PRIVATE-CANARY')
        self.assertEqual(code,200);self.assertNotIn(b'PRIVATE-CANARY',body)
        self.assertEqual(headers['Referrer-Policy'],'no-referrer')
    def test_unknown_job_not_tracked(self):
        with patch('server.get_job_store') as store:
            store.return_value.snapshot.return_value={'jobs':[]}
            req=urllib.request.Request(self.origin+'/api/applications/track',data=b'{"job_id":"invented"}',headers={'Content-Type':'application/json'})
            with self.assertRaises(urllib.error.HTTPError) as err:urllib.request.urlopen(req)
            self.assertEqual(err.exception.code,422)
        self.assertEqual(self.inbox.applications(),[])

if __name__=='__main__':unittest.main()

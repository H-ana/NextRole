"""Deterministic tests with model stubs, never real applicant data or API calls."""
import copy
import json
import io
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from functools import partial
from unittest.mock import patch
import agent_service as agent
from server import Handler, ROOT, ALLOWED_ORIGINS

RESUME = ('Alex Example\nProfile\nBuilt production Python services and reconciled SQL datasets to resolve payroll discrepancies for enterprise clients.\n'
          'Experience\nEngineer, Example Company | 2021–2024\nDeveloped an internal Python workflow service that reduced manual reconciliation effort by 20% without changing payroll records.\n'
          'Education\nBSc in Computer Science\nCertifications\nExample Certification\n')
JOB = dict(id='job-1', title='Backend Engineer', company='Example', location='Bengaluru', description='Required: Python service development. Requires 2 years of experience. Hybrid work in Bengaluru.')


def assessment():
    return dict(job_id='job-1', score=85, decision='shortlist', reason='Demonstrated service development.', work_style='Hybrid', work_style_quote='Hybrid work in Bengaluru.', experience='meets', experience_quote='Requires 2 years of experience.', requirements=[dict(requirement='Python service development', category='responsibility', importance='required', status='supported', job_quote='Required: Python service development.', resume_quote='Built production Python services')], questions=[])


class AgentTests(unittest.TestCase):
    def test_supported_evidence_survives(self):
        self.assertEqual(agent.validate_assessment(assessment(), JOB, RESUME, {'workstyle': 'Hybrid'})['decision'], 'shortlist')

    def test_fake_evidence_downgrades(self):
        item=assessment();item['requirements'][0]['resume_quote']='Led a department of 50 engineers'
        result=agent.validate_assessment(item, JOB, RESUME, {'workstyle': 'Hybrid'})
        self.assertEqual(result['decision'],'review');self.assertEqual(result['requirements'][0]['status'],'unknown')

    def test_required_gaps_exclude(self):
        for kind in ('requirement','experience','style'):
            item=assessment()
            if kind=='requirement':item['requirements'][0]['status']='missing'
            elif kind=='experience':item['experience']='gap'
            result=agent.validate_assessment(item, JOB, RESUME, {'workstyle':'Remote' if kind=='style' else 'Hybrid'})
            self.assertEqual(result['decision'],'exclude')

    def test_unknown_style_is_review(self):
        item=assessment();item['work_style_quote']='invented'
        self.assertEqual(agent.validate_assessment(item, JOB, RESUME, {'workstyle':'Hybrid'})['decision'],'review')

    def test_job_ids_checked(self):
        item=assessment();item['job_id']='unknown'
        with self.assertRaises(agent.AgentError):agent.validate_assessment(item, JOB, RESUME,{})

    def test_shortlist_uses_complete_resume(self):
        calls=[]
        def fake(schema,name,prompt):
            calls.append(prompt)
            if name=='resume_profile':return dict(summary='Backend workflow experience.',role_families=['Backend Engineer'],strengths=[dict(fact='Services',resume_quote='Built production Python services'),dict(fact='Fake',resume_quote='Unsupported credential')],uncertainties=[])
            self.assertEqual(prompt['resume'],RESUME)
            return {'assessments':[assessment()]}
        result=agent.shortlist(dict(resume=RESUME,preferences={'experience':2,'workstyle':'Hybrid'},jobs=[JOB],limit=12),fake)
        self.assertEqual(result['evaluated'],1);self.assertEqual(len(result['profile']['strengths']),1)
        self.assertEqual(result['assessments'][0]['decision'],'shortlist')
        self.assertEqual(calls[0]['resume'],RESUME)

    def test_no_keyword_dictionary_gate(self):
        profile={'role_families':['Workflow Automation Engineer']}
        ranked=agent.retrieve('Built process orchestration services to automate reconciliation.',[JOB],profile,12)
        self.assertEqual(ranked,[JOB])

    def test_small_review_keeps_only_complete_batches_on_later_failure(self):
        jobs=[{**JOB,'id':'job-'+str(i)} for i in range(8)]
        count=0
        def fake(schema,name,prompt):
            nonlocal count
            if name=='resume_profile':return dict(summary='Backend experience.',role_families=['Backend Engineer'],strengths=[],uncertainties=[])
            count+=1
            if count==2:raise agent.AgentError('Temporary model timeout.')
            return {'assessments':[{**assessment(),'job_id':job['id']} for job in prompt['jobs']]}
        result=agent.shortlist(dict(resume=RESUME,preferences={'experience':2,'workstyle':'Hybrid'},jobs=jobs,limit=8),fake)
        self.assertEqual(result['evaluated'],1);self.assertEqual(result['planned'],8)
        self.assertEqual(len(result['assessments']),1);self.assertTrue(result['warnings'])

    def test_four_opening_review_is_supported(self):
        def fake(schema,name,prompt):
            if name=='resume_profile':return dict(summary='Backend experience.',role_families=['Backend Engineer'],strengths=[],uncertainties=[])
            return {'assessments':[assessment()]}
        self.assertEqual(agent.shortlist(dict(resume=RESUME,preferences={'experience':2,'workstyle':'Hybrid'},jobs=[JOB],limit=4),fake)['evaluated'],1)

    def test_four_jobs_have_four_individual_model_requests(self):
        jobs=[{**JOB,'id':str(i)} for i in range(4)]
        calls=[]
        def fake(schema,name,prompt):
            if name=='resume_profile':return dict(summary='Backend experience.',role_families=['Backend Engineer'],strengths=[],uncertainties=[])
            calls.append(prompt)
            self.assertEqual(len(prompt['jobs']),1)
            return {'assessments':[{**assessment(),'job_id':prompt['jobs'][0]['id']}]}
        result=agent.shortlist(dict(resume=RESUME,preferences={'experience':2},jobs=jobs,limit=4),fake)
        self.assertEqual(result['evaluated'],4);self.assertEqual(len(calls),4)
        self.assertTrue(all(call['resume']==RESUME for call in calls))

    def test_profile_cache_reuse_invalidation_and_expiry(self):
        profile=dict(summary='Backend experience.',role_families=['Backend Engineer'],strengths=[],uncertainties=[])
        response=lambda:io.BytesIO(json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(profile)}]}}]}).encode())
        body=dict(resume=RESUME,preferences={'experience':2},jobs=[JOB],limit=4)
        with agent._cache_lock:agent._profile_cache.clear()
        with patch.dict(os.environ,{'GEMINI_API_KEY':'synthetic-secret','GEMINI_MODEL':'gemini-3.8-flash'}),patch('agent_service.urllib.request.urlopen',side_effect=lambda *a,**kw:response()) as send:
            first=agent.prepare(body);second=agent.prepare(body)
            self.assertFalse(first['profile_cached']);self.assertTrue(second['profile_cached']);self.assertEqual(send.call_count,1)
            second['profile']['summary']='Changed caller copy'
            self.assertEqual(agent.prepare(body)['profile']['summary'],profile['summary'])
            self.assertFalse(agent.prepare({**body,'resume':RESUME+'More experience.'})['profile_cached'])
            self.assertTrue(agent.prepare({**body,'preferences':{'experience':3,'cities':['Mumbai'],'workstyle':'Remote'}})['profile_cached'])
            self.assertFalse(agent.with_selected_model(agent.prepare,{**body,'model':'gemini-3.6-flash'})['profile_cached'])
            with agent._cache_lock:
                for key,(_,value) in list(agent._profile_cache.items()):agent._profile_cache[key]=(0,value)
            self.assertFalse(agent.prepare(body)['profile_cached']);self.assertEqual(send.call_count,4)
        with agent._cache_lock:agent._profile_cache.clear()

    def test_failed_profiles_are_not_cached(self):
        with agent._cache_lock:agent._profile_cache.clear()
        with patch.dict(os.environ,{'GEMINI_API_KEY':'synthetic-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=TimeoutError()):
            with self.assertRaises(agent.AgentError):agent.prepare(dict(resume=RESUME,preferences={'experience':2},jobs=[JOB],limit=4))
        self.assertEqual(len(agent._profile_cache),0)

    def test_model_override_is_scoped_and_validated(self):
        with patch.dict(os.environ,{'GEMINI_MODEL':'gemini-3.8-flash'}):
            self.assertEqual(agent.with_selected_model(lambda _:agent.selected_model(),{'model':'gemini-3.6-flash'}),'gemini-3.6-flash')
            self.assertEqual(agent.selected_model(),'gemini-3.8-flash')
            with self.assertRaises(agent.AgentError):agent.with_selected_model(lambda _:None,{'model':'untrusted-model'})

    def test_benchmark_uses_only_synthetic_resume_and_restores_model(self):
        calls=[]
        def fake(schema,name,prompt):
            calls.append((agent.selected_model(),prompt))
            return {'summary':'Synthetic','role_families':[],'strengths':[],'uncertainties':[]}
        with patch('agent_service.call_model',side_effect=fake),patch.dict(os.environ,{'GEMINI_MODEL':'gemini-3.6-flash'}):
            result=agent.benchmark_models()
            self.assertEqual(agent.selected_model(),'gemini-3.6-flash')
        self.assertTrue(result['synthetic_only']);self.assertEqual(len(calls),2)
        self.assertTrue(all('Alex Example' in prompt['resume'] for _,prompt in calls))

    def test_protected_lines_locked(self):
        indexes={line['line_index'] for line in agent.editable_lines(RESUME)}
        for index,line in enumerate(RESUME.splitlines()):
            if '2021' in line or 'BSc' in line or 'Certification' in line:self.assertNotIn(index,indexes)

    def test_tailoring_validated_before_return(self):
        editable=agent.editable_lines(RESUME);line=editable[-1]
        original=line['text'];replacement=original.replace('Developed an internal','Built an internal')
        def fake(schema,name,prompt):
            if name=='resume_suggestions':return {'suggestions':[dict(line_index=line['line_index'],original=original,replacement=replacement,job_quote='Python service development',rationale='Clear verb'),dict(line_index=999,original='BSc in Computer Science',replacement='PhD',job_quote='Python service development',rationale='Invalid')],'advice':['Keep existing qualifications.']}
            self.assertEqual(len(prompt['edits']),1)
            return {'checks':[dict(line_index=line['line_index'],faithful=True,reason='Equivalent wording.')]}
        result=agent.tailor({'resume':RESUME,'job':JOB},fake)
        self.assertEqual(len(result['suggestions']),1)
        self.assertEqual(result['suggestions'][0]['replacement'],replacement)
        self.assertIn('20%',result['suggestions'][0]['replacement'])

    def test_numbers_and_verifier_reject(self):
        self.assertFalse(agent.faithful_numbers('reduced effort by 20%','reduced effort by 80%'))
        line=agent.editable_lines(RESUME)[0]
        def fake(schema,name,prompt):
            if name=='resume_suggestions':return {'suggestions':[dict(line_index=line['line_index'],original=line['text'],replacement=line['text']+' Led a global department.',job_quote='Python service development',rationale='False leadership')],'advice':[]}
            return {'checks':[dict(line_index=line['line_index'],faithful=False,reason='Added leadership claim.')]}
        self.assertEqual(agent.tailor({'resume':RESUME,'job':JOB},fake)['suggestions'],[])

    def test_invalid_resume_rejected(self):
        with self.assertRaises(agent.AgentError):agent.shortlist({'resume':'hi'})
        with self.assertRaises(agent.AgentError):agent.tailor({'resume':''})


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
        cls.base='http://127.0.0.1:'+str(cls.server.server_port)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()

    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()

    def test_status_exposes_no_key(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret','GOOGLE_API_KEY':''}):
            with urllib.request.urlopen(self.base+'/api/status') as response:data=json.load(response)
        self.assertTrue(data['connected']);self.assertEqual(data['provider'],'Google Gemini');self.assertNotIn('test-only-secret',json.dumps(data))

    def post(self,body,origin='http://localhost:8080',path='/api/agent/shortlist'):
        request=urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':origin})
        try:
            with urllib.request.urlopen(request) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as error:return error.code,json.load(error)

    def test_consent_required_and_missing_key_is_honest(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'','GOOGLE_API_KEY':''}):
            self.assertEqual(self.post({})[0],400)
            status,data=self.post({'consent':True})
            self.assertEqual(status,503);self.assertIn('not connected',data['error'])

    def test_cross_origin_rejected(self):
        self.assertEqual(self.post({'consent':True},'https://unrelated.example')[0],403)

    def test_one_page_export_is_local_and_needs_no_gemini(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'','GOOGLE_API_KEY':''}),patch('server.export_one_page',return_value={'pages':1,'font_size':11,'base64':'synthetic'}) as export:
            code,data=self.post({'text':'Synthetic resume'},path='/api/resume/export')
            self.assertEqual(code,200);self.assertEqual(data['pages'],1)
            export.assert_called_once_with('Synthetic resume',preview=False)
            self.assertEqual(self.post({'text':'Synthetic resume'},origin='https://unrelated.example',path='/api/resume/export')[0],403)

    def test_platform_discovery_endpoint_needs_no_gemini_or_site_login(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'','GOOGLE_API_KEY':''}),patch('server.get_platform_search') as collector:
            collector.return_value.request.return_value={'configured':False,'refreshing':False,'message':'Job-data key required'}
            code,result=self.post({'resume':'Synthetic resume'},path='/api/jobs/platform-search')
            self.assertEqual(code,200);self.assertFalse(result['configured'])
            collector.return_value.request.assert_called_once_with({'resume':'Synthetic resume'})
            self.assertEqual(self.post({},origin='https://unrelated.example',path='/api/jobs/platform-search')[0],403)

    def test_platform_import_needs_no_key_or_ai_consent_and_rejects_other_origins(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'','GOOGLE_API_KEY':''}),patch('server.get_job_store') as store,patch('agent_service.call_model') as gemini:
            store.return_value.import_platform_job.return_value={'id':'manual:linkedin:fixture'}
            code,data=self.post({'title':'Synthetic job'},path='/api/jobs/import')
            self.assertEqual(code,200);self.assertEqual(data['job']['id'],'manual:linkedin:fixture')
            store.return_value.import_platform_job.assert_called_once_with({'title':'Synthetic job'})
            self.assertEqual(self.post({},origin='https://unrelated.example',path='/api/jobs/import')[0],403)
            store.return_value.import_platform_job.side_effect=ValueError('invalid')
            code,data=self.post({},path='/api/jobs/import')
            self.assertEqual(code,400);self.assertIn('job link',data['error']);gemini.assert_not_called()

    def test_connection_endpoint_uses_no_applicant_payload(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('server.test_connection',return_value={'verified':True,'message':'Synthetic test only.'}) as check:
            code,data=self.post({},path='/api/connection-test')
        self.assertEqual(code,200);self.assertTrue(data['verified']);check.assert_called_once_with()

    def test_connection_endpoint_checks_key(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'','GOOGLE_API_KEY':''}),patch('server.test_connection') as check:
            code,_=self.post({},path='/api/connection-test')
        self.assertEqual(code,503);check.assert_not_called()

    def test_prepare_endpoint_requires_consent_and_uses_selected_model(self):
        body={'consent':True,'model':'gemini-3.6-flash','resume':RESUME,'jobs':[JOB],'preferences':{'experience':2},'limit':4}
        with patch.dict(os.environ,{'GEMINI_API_KEY':'synthetic-secret'}),patch('server.prepare',side_effect=lambda _: {'model':agent.selected_model(),'jobs':[JOB]}) as prepare:
            code,data=self.post(body,path='/api/agent/prepare')
            self.assertEqual(code,200);self.assertEqual(data['model'],'gemini-3.6-flash');prepare.assert_called_once()
            self.assertEqual(self.post({**body,'consent':False},path='/api/agent/prepare')[0],400)
            self.assertEqual(self.post({**body,'model':'invalid'},path='/api/agent/prepare')[0],422)


class GeminiTransportTests(unittest.TestCase):
    def invoke(self,response):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret','GEMINI_MODEL':'gemini-3.8-flash','GOOGLE_API_KEY':''}), patch('agent_service.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(response).encode())) as send:
            value=agent.call_model(agent.obj(result=agent.STRING),'test_workflow',{'resume':'Synthetic professional text.'})
            return value,send.call_args.args[0]

    def test_gemini_wire_contract(self):
        value,request=self.invoke({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'private reasoning','thought':True},{'text':'{"result":"ok"}'}]}}]})
        self.assertEqual(value,{'result':'ok'})
        self.assertEqual(request.full_url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
        self.assertEqual(request.get_header('X-goog-api-key'),'test-only-secret')
        self.assertNotIn('test-only-secret',request.full_url)
        payload=json.loads(request.data)
        self.assertEqual(payload['generationConfig']['responseFormat']['text']['mimeType'],'APPLICATION_JSON')
        self.assertEqual(payload['generationConfig']['responseFormat']['text']['schema'],agent.obj(result=agent.STRING))
        self.assertEqual(payload['generationConfig']['thinkingConfig']['thinkingLevel'],'LOW')
        self.assertIn('untrusted data',payload['systemInstruction']['parts'][0]['text'])
        self.assertNotIn('Authorization',request.headers)

    def test_incomplete_and_blocked_are_rejected(self):
        for response in ({'candidates':[{'finishReason':'MAX_TOKENS','content':{'parts':[{'text':'{"result":"partial"}'}]}}]}, {'promptFeedback':{'blockReason':'SAFETY'}}, {'candidates':[]}):
            with self.assertRaises(agent.AgentError):self.invoke(response)

    def test_malformed_and_schema_invalid_are_rejected(self):
        for text in ('not-json','{}','{"result":5}','{"result":"ok","unexpected":true}'):
            with self.assertRaises(agent.AgentError):self.invoke({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':text}]}}]})

    def test_key_alias_and_model_id_validation(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'','GOOGLE_API_KEY':'fallback-test'}):self.assertEqual(agent.api_key(),'fallback-test')
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret','GEMINI_MODEL':'../../malicious?key=value'}),patch('agent_service.urllib.request.urlopen') as send:
            with self.assertRaises(agent.AgentError):agent.call_model(agent.PROFILE,'test',{})
            send.assert_not_called()


class GeminiRetryTests(unittest.TestCase):
    def error(self,code,message='Service unavailable',reason=None,headers=None):
        details=[{'reason':reason}] if reason else []
        return urllib.error.HTTPError('https://generativelanguage.googleapis.com/',code,'Error',headers or {},io.BytesIO(json.dumps({'error':{'message':message,'details':details}}).encode()))

    def success(self):
        return io.BytesIO(json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{"result":"ok"}'}]}}]}).encode())

    def invoke(self,effects):
        return agent.call_model(agent.obj(result=agent.STRING),'retry_test',{'task':'Synthetic connection test.'})

    def test_transient_503_recovers_with_backoff(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=[self.error(503),self.error(503),self.success()]) as send,patch('agent_service.time.sleep') as sleep,patch('agent_service.random.uniform',return_value=0):
            self.assertEqual(self.invoke(None),{'result':'ok'})
        self.assertEqual(send.call_count,3);self.assertEqual([c.args[0] for c in sleep.call_args_list],[1,2])

    def test_retry_budget_exhaustion_is_clear_and_redacted(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=[self.error(503,'private body test-only-secret') for _ in range(4)]) as send,patch('agent_service.time.sleep') as sleep,patch('agent_service.random.uniform',return_value=0):
            with self.assertRaises(agent.AgentError) as caught:self.invoke(None)
        self.assertEqual(send.call_count,4);self.assertEqual(sleep.call_count,3)
        self.assertIn('HTTP 503',str(caught.exception));self.assertIn('overloaded',str(caught.exception));self.assertNotIn('test-only-secret',str(caught.exception));self.assertNotIn('private body',str(caught.exception))

    def test_client_error_does_not_retry(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=self.error(400,reason='API_KEY_INVALID')) as send,patch('agent_service.time.sleep') as sleep:
            with self.assertRaises(agent.AgentError) as caught:self.invoke(None)
        self.assertEqual(send.call_count,1);sleep.assert_not_called();self.assertIn('rejected the API key',str(caught.exception))

    def test_exhausted_quota_does_not_retry(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=self.error(429,'Quota exceeded: daily limit: 0')) as send,patch('agent_service.time.sleep') as sleep:
            with self.assertRaises(agent.AgentError) as caught:self.invoke(None)
        self.assertEqual(send.call_count,1);sleep.assert_not_called();self.assertIn('quota or billing',str(caught.exception))

    def test_retry_after_is_honored(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=[self.error(503,headers={'Retry-After':'5'}),self.success()]),patch('agent_service.time.sleep') as sleep,patch('agent_service.random.uniform',return_value=0):
            self.assertEqual(self.invoke(None),{'result':'ok'})
        sleep.assert_called_once_with(5)

    def test_expired_workflow_deadline_prevents_api_call(self):
        token=agent._deadline.set(agent.time.monotonic()-1)
        try:
            with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen') as send:
                with self.assertRaises(agent.AgentError):self.invoke(None)
                send.assert_not_called()
        finally:agent._deadline.reset(token)

    def test_long_retry_after_never_retries_too_early(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=self.error(503,headers={'Retry-After':'120'})) as send,patch('agent_service.time.sleep') as sleep:
            with self.assertRaises(agent.AgentError) as caught:self.invoke(None)
        self.assertEqual(send.call_count,1);sleep.assert_not_called();self.assertIn('longer wait',str(caught.exception))

    def test_non_json_provider_failure_still_classifies_503(self):
        error=urllib.error.HTTPError('https://generativelanguage.googleapis.com/',503,'Error',{},io.BytesIO(b'<html>Service unavailable</html>'))
        message,retryable=agent.provider_failure(error)
        self.assertTrue(retryable);self.assertIn('HTTP 503',message);self.assertNotIn('<html>',message)

    def test_connection_probe_contains_no_resume(self):
        with patch('agent_service.call_model',return_value={'status':'ok'}) as model:
            self.assertTrue(agent.test_connection()['verified'])
        self.assertEqual(model.call_args.args[1],'connection_test')
        self.assertEqual(set(model.call_args.args[2]),{'task'})

    def test_generation_timeout_is_not_repeated_as_network_failure(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'test-only-secret'}),patch('agent_service.urllib.request.urlopen',side_effect=TimeoutError()) as send,patch('agent_service.time.sleep') as sleep:
            with self.assertRaises(agent.AgentError) as caught:self.invoke(None)
        self.assertEqual(send.call_count,1);sleep.assert_not_called();self.assertIn('120 seconds',str(caught.exception));self.assertNotIn('Check your connection',str(caught.exception))


if __name__=='__main__':unittest.main()

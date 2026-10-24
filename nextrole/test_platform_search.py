import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import types
from unittest.mock import patch
from platform_search import PlatformSearch,PlatformError,SOURCE,SITES,discovery_plan,normalize_results,platform_for_url,fetch_jobs
from job_store import JobStore
from test_job_store import FakeEncoder

DESCRIPTION='Requirements\nMinimum 2 years of experience.\nBuild reconciliation workflows using Python and SQL. Maintain reporting pipelines and automation.'
LINKS={
 'linkedin':'https://www.linkedin.com/jobs/view/12345/',
 'naukri':'https://www.naukri.com/job-listings-data-analyst-example-bengaluru-12345',
 'indeed':'https://in.indeed.com/viewjob?jk=abc123',
 'glassdoor':'https://www.glassdoor.co.in/job-listing/data-analyst-example-JV_IC.htm?jl=123',
 'zip_recruiter':'https://www.ziprecruiter.com/c/Example/Job/Data-Analyst/-in-Boston,MA?jid=abc',
 'bayt':'https://www.bayt.com/en/india/jobs/data-analyst-12345/',
 'bdjobs':'https://jobs.bdjobs.com/jobdetails.asp?id=12345',
 'hellowork':'https://www.hellowork.com/fr-fr/emplois/12345.html'}

def rows(site='indeed'):
    return [{'site':site,'job_url':LINKS[site],'title':'Data Analyst','company':'Example',
             'description':DESCRIPTION,'location':'Bengaluru, India','is_remote':False}]

class NormalizationTests(unittest.TestCase):
    def test_all_eight_sources_use_actual_application_links_and_original_requirements(self):
        jobs=normalize_results([row for site in SITES for row in rows(site)])
        self.assertEqual(len(jobs),8)
        self.assertEqual({j['listed_on'][0] for j in jobs},set(SITES.values()))
        self.assertTrue(all(j['years']==2 and j['description']==DESCRIPTION for j in jobs))
        self.assertEqual(normalize_results([{**rows()[0],'site':'linkedin'}]),[])
        for link in ('https://linkedin.com.evil.example/jobs/view/123','http://www.linkedin.com/jobs/view/123','https://user:pass@www.naukri.com/job-listings-123','https://in.indeed.com/jobs?q=data'):
            self.assertIsNone(platform_for_url(link))

    def test_incomplete_expired_duplicate_and_inferred_experience_are_not_accepted(self):
        for changed in ({'job_is_open':False},{'is_expired':True},{'description':'Short snippet'},{'company':None}):
            self.assertEqual(normalize_results([{**rows()[0],**changed}]),[])
        job=normalize_results([{**rows()[0],'experience_range':'20 years'},*rows()])
        self.assertEqual(len(job),1);self.assertEqual(job[0]['years'],2)

    def test_india_planning_privacy_and_remote(self):
        resume='Private Candidate\nprivate@example.com\nAspiring Agentic AI Developer with Python experience. EmployerSecret payroll projects.'
        plans,_=discovery_plan({'resume':resume,'preferences':{'cities':['Bengaluru','Chennai']}})
        self.assertEqual(len(plans),10)
        self.assertEqual({p['site'] for p in plans},{'linkedin','indeed','glassdoor','bayt','naukri'})
        self.assertEqual(plans[0]['role'],'Agentic AI Developer')
        self.assertNotIn('private',json.dumps(plans).lower());self.assertNotIn('EmployerSecret',json.dumps(plans))
        remote,_=discovery_plan({'resume':resume,'preferences':{'cities':['Mumbai'],'workstyle':'Remote'}})
        self.assertTrue(all(p['city']=='India' and p['remote'] for p in remote))
        with self.assertRaises(PlatformError):discovery_plan({'resume':resume,'preferences':{'target_roles':'private@example.com'}})

    def test_worker_timeout_and_inputs_do_not_include_keys_or_resume(self):
        plan=discovery_plan({'resume':'Data Analyst','preferences':{}})[0][0]
        result=subprocess.CompletedProcess([],0,json.dumps({'jobs':rows('linkedin'),'warnings':False}),'')
        with patch.dict(os.environ,{'GEMINI_API_KEY':'synthetic','JSEARCH_API_KEY':'unused','HTTP_PROXY':'secret-proxy'}),patch('platform_search.subprocess.run',return_value=result) as run:
            jobs,_=fetch_jobs(plan)
        self.assertEqual(len(jobs),1)
        self.assertEqual(json.loads(run.call_args.kwargs['input']),plan)
        self.assertNotIn('GEMINI_API_KEY',run.call_args.kwargs['env'])
        self.assertNotIn('JSEARCH_API_KEY',run.call_args.kwargs['env'])
        self.assertNotIn('HTTP_PROXY',run.call_args.kwargs['env'])
        self.assertEqual(run.call_args.kwargs['timeout'],90)
        with patch('platform_search.subprocess.run',side_effect=subprocess.TimeoutExpired('worker',90)):
            with self.assertRaisesRegex(PlatformError,'timed out'):fetch_jobs(plan)

    def test_worker_requests_full_descriptions_and_discards_unneeded_fields(self):
        import jobspy_worker
        class Frame:
            attrs={};columns=['site','job_url','title','company','description','location','is_remote','emails']
            def __getitem__(self,columns):
                if 'emails' in columns:raise AssertionError('Unneeded contact fields must not be returned')
                return self
            def to_json(self,orient):return json.dumps(rows('naukri'))
        calls=[]
        def scrape(**kwargs):calls.append(kwargs);return Frame()
        plan={'site':'naukri','role':'Data Analyst','city':'India','remote':True}
        with patch.dict('sys.modules',{'jobspy':types.SimpleNamespace(scrape_jobs=scrape)}):
            self.assertEqual(len(jobspy_worker.run(plan)['jobs']),1)
            self.assertTrue(calls[0]['fetch_description']);self.assertTrue(calls[0]['is_remote'])
            self.assertEqual(calls[0]['country_indeed'],'India')
            self.assertNotIn('proxies',calls[0])
            Frame.attrs={'errors':{'naukri':'blocked'}}
            self.assertIn('error',jobspy_worker.run(plan))

class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.manual=[{'provider':'manual','id':name.lower(),'company':name+' added by you'} for name in SITES.values()]
        self.store=JobStore(Path(self.temp.name)/'jobs.db',[SOURCE,*self.manual],FakeEncoder())
        self.collector=PlatformSearch(self.store)
    def tearDown(self):self.temp.cleanup()
    def wait(self):
        for _ in range(400):
            if not self.collector.refreshing:return
            time.sleep(.005)
        self.fail('Synthetic collector did not finish')

    def test_setup_required_no_keys_and_queries_continue_with_cache(self):
        calls=[]
        def fetch(plan):calls.append(plan);return normalize_results(rows(plan['site'])),False
        body={'resume':'Data Analyst with SQL skills','preferences':{'experience':2,'cities':['Bengaluru','Chennai']}}
        with patch('platform_search.jobspy_installed',return_value=False):
            self.assertFalse(self.collector.request(body,fetch)['configured']);self.assertEqual(calls,[])
        with patch('platform_search.jobspy_installed',return_value=True):
            self.collector.request(body,fetch);self.wait();self.assertEqual(len(calls),5)
            self.collector.request(body,fetch);self.wait();self.assertEqual(len(calls),10)
            self.collector.request(body,fetch);self.wait();self.assertEqual(len(calls),10)
            status=self.collector.status()
        self.assertEqual(status['counts']['Indeed'],1);self.assertEqual(status['counts']['Naukri'],1)
        self.assertEqual(status['sources']['BDJobs']['state'],'unsupported_location')
        result=self.store.search(body)
        self.assertEqual(result['eligible'],5)
        self.assertNotIn(body['resume'],self.store.path.read_bytes().decode('utf-8',errors='ignore'))

    def test_failures_are_not_zero_results_or_cache_deletion_and_have_cooldown(self):
        body={'resume':'Data Analyst','preferences':{}}
        self.store.update_source(SOURCE,normalize_results(rows()))
        def fetch(plan):
            if plan['site']=='indeed':raise PlatformError('Source blocked collection.')
            return [],False
        with patch('platform_search.jobspy_installed',return_value=True):
            self.collector.request(body,fetch);self.wait()
            status=self.collector.status()
            self.assertEqual(status['counts']['Indeed'],1)
            self.assertEqual(status['sources']['Indeed']['state'],'unavailable')
            self.assertEqual(status['sources']['Naukri']['state'],'no_results')
            with patch('platform_search.time.time',return_value=time.time()+901):
                calls=[]
                self.collector.request(body,lambda p:(calls.append(p) or [],False));self.wait()
                self.assertEqual([p['site'] for p in calls],['indeed'])

    def test_manual_application_identifiers_and_legacy_cache_exclusion(self):
        with patch.object(self.store,'build_index'):
            for site in SITES:
                job=self.store.import_platform_job({'url':LINKS[site],'title':'Data Analyst','company':'Example','location':'Bengaluru','description':DESCRIPTION})
                self.assertEqual(platform_for_url(job['url']),SITES[site])
                if site=='bdjobs':self.assertIn('id=12345',job['url'])
                if site=='glassdoor':self.assertIn('jl=123',job['url'])
                if site=='zip_recruiter':self.assertIn('jid=abc',job['url'])
        old={'provider':'platform','id':'indexed','company':'Legacy JSearch'}
        job={**normalize_results(rows())[0],'id':'platform:indexed:old','source':'platform:indexed'}
        self.store.update_source(old,[job])
        self.assertTrue(all(j['source']!='platform:indexed' for j in self.store.snapshot()['jobs']))

if __name__=='__main__':unittest.main()

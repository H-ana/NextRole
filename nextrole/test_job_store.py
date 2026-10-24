"""Synthetic feed/cache tests; optional local-model test never sends applicant data."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from job_store import JobStore, normalize_feed, experience_requirement, location_matches, source_key
from semantic_search import ENCODER, MODEL_VERSION, semantic_score
from test_agent import HttpTests, RESUME

SOURCE={'company':'Example','provider':'greenhouse','board':'example'}
def job(identity='one',description='Required: 2 years of experience. Build process automation.',location='Bengaluru',style='Hybrid'):
    return {'id':identity,'company':'Example','title':'Automation Engineer','description':description,'location':location,'style':style,'url':'https://careers.example.com/'+identity,'years':2,'experience_quote':'Required: 2 years of experience.','skills':[],'source':source_key(SOURCE)}


class FakeEncoder:
    def __init__(self):self.calls=[]
    def load(self):return True
    def status(self):return {'ready':True,'model':'synthetic','message':None}
    def encode(self,texts):self.calls.extend(texts);return [[1.,0.] for _ in texts]
    def query_vectors(self,text):return [[1.,0.]]


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.encoder=FakeEncoder();self.store=JobStore(Path(self.temp.name)/'jobs.db',[SOURCE],self.encoder)
    def tearDown(self):self.temp.cleanup()

    def test_refresh_success_removes_closed_jobs_and_failure_preserves_cache(self):
        self.store.refresh(lambda _: [job('one'),job('two')]);self.assertEqual(len(self.store.snapshot()['jobs']),2)
        self.store.refresh(lambda _: [job('two')]);self.assertEqual([j['id'] for j in self.store.snapshot()['jobs']],['two'])
        def fail(_):raise OSError('private diagnostic')
        self.store.refresh(fail);snapshot=self.store.snapshot();self.assertEqual(len(snapshot['jobs']),1)
        self.assertIn('retained',snapshot['sources'][0]['error']);self.assertNotIn('private',json.dumps(snapshot))
        reopened=JobStore(self.store.path,[SOURCE],self.encoder);self.assertEqual(len(reopened.snapshot()['jobs']),1)

    def test_empty_success_closes_jobs(self):
        self.store.update_source(SOURCE,[job()]);self.store.update_source(SOURCE,[]);self.assertEqual(self.store.snapshot()['jobs'],[])

    def test_only_changed_job_is_reembedded(self):
        first=job();self.store.update_source(SOURCE,[first]);self.store.build_index();self.assertEqual(len(self.encoder.calls),1)
        self.store.update_source(SOURCE,[first]);self.store.build_index();self.assertEqual(len(self.encoder.calls),1)
        self.store.update_source(SOURCE,[{**first,'description':'Changed responsibility.'}]);self.store.build_index();self.assertEqual(len(self.encoder.calls),2)

    def test_search_never_calls_gemini_or_stores_resume(self):
        unknown={**job('unknown'),'years':None,'style':'unknown'}
        self.store.update_source(SOURCE,[job(),{**job('senior'),'years':8},unknown,job('other',location='Mumbai')]);self.store.build_index()
        with patch('agent_service.call_model',side_effect=AssertionError('Gemini must not run for search')):
            result=self.store.search({'resume':RESUME,'preferences':{'experience':2,'cities':['Bengaluru'],'workstyle':'Hybrid'}})
        self.assertEqual(result['eligible'],2);self.assertEqual(result['experience_gaps'],1);self.assertEqual(result['ranking_mode'],'semantic')
        self.assertTrue(all(j['qualification_status']=='Not reviewed' for j in result['jobs']))
        self.assertNotIn(RESUME,self.store.path.read_bytes().decode('utf-8',errors='ignore'))

    def test_remote_skips_city_but_preserves_workstyle(self):
        self.store.update_source(SOURCE,[job('remote',location='Remote - India',style='Remote'),job('hybrid')]);self.store.build_index()
        result=self.store.search({'resume':'Python','preferences':{'experience':2,'cities':['Mumbai'],'workstyle':'Remote'}})
        self.assertEqual([j['id'] for j in result['jobs']],['remote'])
        self.assertTrue(location_matches('Gurgaon, India',['Gurugram']));self.assertTrue(location_matches('Bangalore',['Bengaluru']))

    def test_partial_index_uses_explicit_fulltext_fallback(self):
        self.store.update_source(SOURCE,[job(),job('two')]);result=self.store.search({'resume':'automation','preferences':{'experience':2}})
        self.assertEqual(result['ranking_mode'],'full-text');self.assertTrue(all(j['semantic_score'] is None for j in result['jobs']))

    def test_stale_sources_reported(self):
        self.store.update_source(SOURCE,[job()],now=1);self.assertTrue(self.store.snapshot()['stale'])

    def test_browse_is_not_a_zero_relevance_assessment(self):
        self.store.update_source(SOURCE,[job()])
        result=self.store.search({'resume':'','preferences':{'experience':2}})
        self.assertEqual(result['ranking_mode'],'browse')
        self.assertIsNone(result['jobs'][0]['relevance_score'])
        self.assertIsNone(result['jobs'][0]['ranking_method'])

    def test_actual_ranked_zero_is_retained(self):
        self.store.update_source(SOURCE,[job()]);self.store.build_index()
        with patch('job_store.semantic_score',return_value=0),patch('job_store.lexical_scores',return_value=[0]):
            result=self.store.search({'resume':'Synthetic unrelated resume','preferences':{'experience':2}})
        self.assertEqual(result['ranking_mode'],'semantic')
        self.assertEqual(result['jobs'][0]['relevance_score'],0)


class FeedTests(unittest.TestCase):
    def test_three_provider_shapes_and_published_links(self):
        gh={'jobs':[{'id':'1','title':'Engineer','location':{'name':'Bangalore'},'absolute_url':'https://careers.example.com/1','content':'<h2>Requirements</h2><p>2+ years of experience</p>'}]}
        self.assertEqual(normalize_feed(SOURCE,gh)[0]['years'],2)
        ashby={'jobs':[{'id':'1','title':'Engineer','location':'Remote - India','isListed':True,'workplaceType':'Hybrid','isRemote':True,'applyUrl':'https://jobs.ashbyhq.com/example/1/application','descriptionPlain':'Work on Python services.'},{'title':'Hidden','isListed':False}]}
        self.assertEqual(normalize_feed({**SOURCE,'provider':'ashby'},ashby)[0]['style'],'Hybrid')
        lever=[{'id':'1','text':'Engineer','categories':{'location':'Pune'},'hostedUrl':'https://jobs.lever.co/example/1','descriptionPlain':'Work on Python services.','lists':[],'workplaceType':'remote'}]
        self.assertEqual(normalize_feed({**SOURCE,'provider':'lever'},lever)[0]['style'],'Remote')
        gh['jobs'][0]['absolute_url']='javascript:alert(1)';self.assertEqual(normalize_feed(SOURCE,gh),[])

    def test_preferred_and_ambiguous_years_are_not_hard_filters(self):
        self.assertEqual(experience_requirement('Preferred qualifications\n8 years of experience'),(None,''))
        self.assertEqual(experience_requirement('We have 20 years of experience serving customers.'),(None,''))
        self.assertEqual(experience_requirement('Minimum qualifications\n2-4 years of software development experience')[0],2)

    def test_real_local_semantic_model(self):
        if not ENCODER.load():self.skipTest('Run setup_semantic.py to install the optional local model')
        query=ENCODER.query_vectors('Automated reconciliation workflows')
        vectors=ENCODER.encode(['Process automation','Restaurant food preparation'])
        self.assertGreater(semantic_score(query,[vectors[0]]),semantic_score(query,[vectors[1]])+.15)


class SearchHttpTests(HttpTests):
    def test_public_cache_search_requires_no_key_or_gemini_consent(self):
        with tempfile.TemporaryDirectory() as temporary:
            store=JobStore(Path(temporary)/'jobs.db',[SOURCE],FakeEncoder());store.update_source(SOURCE,[job()]);store.build_index()
            with patch('server.get_job_store',return_value=store),patch('server.api_key',return_value=''),patch('server.profile_resume') as profile:
                code,data=self.post({'resume':RESUME,'preferences':{'experience':2}},path='/api/jobs/search')
                self.assertEqual(code,200);self.assertEqual(len(data['jobs']),1);profile.assert_not_called()


if __name__=='__main__':unittest.main()

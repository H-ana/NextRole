import unittest,sys,time,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'public_feed'))
from collect import shard_sources,india_location
from merge import merge_feeds
from collect_platforms import collect,search_plan,ROLES

class ExpandedFeedTests(unittest.TestCase):
 def job(self,id='a',**extra):return dict(id=id,company='Microsoft',source='careers:microsoft',title='AI Engineer',description='Requires 2 years of Python development experience.',location='Bengaluru, India',url='https://careers.microsoft.com/jobs/'+id,last_checked=1000000,**extra)
 def test_partial_career_pages_retain_previous_pages_for_seven_days(self):
  # Load the collector's store explicitly; the personal backend has the same
  # module name and can already be cached by other tests in this process.
  import importlib.util
  spec=importlib.util.spec_from_file_location('public_feed_store_under_test',Path(__file__).parent/'public_feed'/'job_store.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);JobStore=module.JobStore
  source={'provider':'careers','id':'microsoft','company':'Microsoft','careers_url':'https://careers.microsoft.com'}
  with tempfile.TemporaryDirectory() as folder:
   store=JobStore(Path(folder)/'cache.sqlite3',sources=[source]);store.update_source(source,[self.job()],now=1000000,complete=False);store.update_source(source,[self.job('b')],now=1000000+2*86400,complete=False)
   with store.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM jobs WHERE active=1').fetchone()[0],2)
 def test_full_source_shards(self):
  sources=[dict(provider='careers',id=str(i)) for i in range(403)];parts=[shard_sources(sources,i,8) for i in range(8)];self.assertEqual(sum(map(len,parts)),403);self.assertEqual(len({s['id'] for p in parts for s in p}),403)
 def test_merge_ids_and_employers(self):
  a=self.job(job_requisition_id='R123');b={**a,'id':'li','source':'platform:public:linkedin','url':'https://www.linkedin.com/jobs/view/123','listed_on':['LinkedIn']};c={**a,'id':'other','company':'Amazon','url':'https://amazon.jobs/jobs/123'}
  result=merge_feeds([{'jobs':[a,b,c]}],now=1000100);self.assertEqual(len(result['jobs']),2);self.assertEqual(len(result['jobs'][0]['application_links']),2)
 def test_freshness(self):
  j=self.job();self.assertFalse(merge_feeds([{'jobs':[j]}],now=1000000+8*86400)['jobs']);j['source']='platform:public:indeed';self.assertFalse(merge_feeds([{'jobs':[j]}],now=1000000+2*86400)['jobs'])
 def test_platforms_do_not_need_applicant_data(self):
  calls=[]
  def fetch(plan):calls.append(plan);return [self.job()],False
  result=collect('linkedin',fetcher=fetch,now=1000100);self.assertEqual(len(calls),len(search_plan('linkedin',1000100)));self.assertEqual(len(result['jobs']),1);self.assertTrue(all(set(p)=={'site','role','city','remote','results'} for p in calls));self.assertTrue(all('resume' not in p for p in calls))
 def test_every_role_remote_and_targeted_employers_each_cycle(self):
  for now in (0,14400,28800):
   plans=search_plan('naukri',now)
   self.assertTrue(set(ROLES).issubset({p['role'] for p in plans if p['city']=='India'}))
   self.assertEqual(sum(p['remote'] for p in plans),2)
   self.assertEqual(len(plans),55)
   self.assertTrue(all(p['results']==40 for p in plans))
  self.assertTrue(all(p['results']==20 for p in search_plan('linkedin',0)))
 def test_employer_mentions_do_not_admit_unscoped_companies(self):
  result=collect('naukri',fetcher=lambda p:([{**self.job(),'company':'Unknown AI startup'}],False),now=1000100)
  self.assertEqual(result['jobs'],[])
 def test_india_scope(self):
  self.assertTrue(india_location('Bangalore, India'));self.assertFalse(india_location('Remote - United States'));self.assertTrue(india_location('Remote - Worldwide'))

if __name__=='__main__':unittest.main()

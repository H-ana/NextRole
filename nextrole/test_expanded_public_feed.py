import unittest,sys,time,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'public_feed'))
from collect import shard_sources,india_location
from merge import merge_feeds
from collect_platforms import collect,search_plan,ROLES,TARGET_BATCH,approved_targets

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
  result=collect('linkedin',fetcher=fetch,now=1000100);self.assertEqual(len(calls),len(search_plan('linkedin',1000100)));self.assertEqual(len(result['jobs']),1);self.assertTrue(all(set(p)<={'site','role','city','remote','results','employer','target_role_index','linkedin_company_ids'} for p in calls));self.assertTrue(all('resume' not in p for p in calls))
 def test_every_role_remote_and_targeted_employers_each_cycle(self):
  for now in (0,14400,28800):
   plans=search_plan('naukri',now)
   self.assertTrue(set(ROLES).issubset({p['role'] for p in plans if p['city']=='India'}))
   self.assertEqual(sum(p['remote'] for p in plans),2)
   self.assertEqual(len(plans),len(ROLES)+34+2+TARGET_BATCH)
   self.assertTrue(all(p['results']==40 for p in plans))
  self.assertTrue(all(p['results']==20 for p in search_plan('linkedin',0)))
 def test_employer_mentions_do_not_admit_unscoped_companies(self):
  result=collect('naukri',fetcher=lambda p:([{**self.job(),'company':'Unknown AI startup'}],False),now=1000100)
  self.assertEqual(result['jobs'],[])
 def test_india_scope(self):
  self.assertTrue(india_location('Bangalore, India'));self.assertFalse(india_location('Remote - United States'));self.assertTrue(india_location('Remote - Worldwide'))

 def test_every_registry_row_participates_and_progress_survives_refreshes(self):
  previous=None;seen=set()
  for cycle in range(4):
   now=1000100+cycle*14400
   plans=search_plan('linkedin',now,previous);targeted=[p for p in plans if p.get('employer')]
   self.assertEqual(len(targeted),TARGET_BATCH)
   self.assertEqual(len({p['employer'] for p in targeted}),TARGET_BATCH)
   seen.update(p['employer'] for p in targeted)
   previous=collect('linkedin',previous=previous,fetcher=lambda p:([],False),now=now)
  self.assertEqual(seen,set(approved_targets()))
  self.assertEqual(len(seen),251)
  self.assertTrue({'Apple','Meta','Anthropic','HashedIn by Deloitte','NCR Atleos'}.issubset(seen))
  states=previous['sources'][0]['employer_searches']
  self.assertTrue(all(states[name].get('last_attempt') for name in seen))
  self.assertTrue(any(p['role'].startswith('Generative AI Engineer ') for p in search_plan('linkedin',1100000,previous) if p.get('employer')))

 def test_deadline_skips_do_not_falsely_advance_employer_progress(self):
  from unittest.mock import patch
  class InlineExecutor:
   def __init__(self,**kw):pass
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def map(self,fn,plans):return map(fn,plans)
  names=list(approved_targets())[:2]
  plans=[dict(site='naukri',role='AI Engineer '+name,employer=name,target_role_index=0,city='India',remote=False,results=20) for name in names]
  with patch('collect_platforms.search_plan',return_value=plans),patch('collect_platforms.concurrent.futures.ThreadPoolExecutor',InlineExecutor),patch('collect_platforms.time.monotonic',side_effect=[0,0,2401]):
   result=collect('naukri',fetcher=lambda p:([],False),now=1000100)
  states=result['sources'][0]['employer_searches']
  self.assertEqual(states[names[0]]['last_attempt'],1000100)
  self.assertFalse(states[names[1]].get('last_attempt'))
  self.assertIn(names[1],{p['employer'] for p in search_plan('naukri',1014500,result) if p.get('employer')})

 def test_targeted_search_cannot_misattribute_another_approved_employer(self):
  from unittest.mock import patch
  plan=dict(site='naukri',role='AI Engineer Microsoft',employer='Microsoft',target_role_index=0,city='India',remote=False,results=20)
  with patch('collect_platforms.search_plan',return_value=[plan]):result=collect('naukri',fetcher=lambda p:([{**self.job(),'company':'Apple'}],False),now=1000100)
  self.assertEqual(result['jobs'],[])

 def test_linkedin_company_ids_require_explicit_verification(self):
  from unittest.mock import patch
  for verified in (False,True):
   row={'name':'Microsoft','linkedin_company_ids':[1234],'linkedin_ids_verified':verified}
   with patch('collect_platforms.approved_targets',return_value={'Microsoft':row}):
    plan=next(p for p in search_plan('linkedin',1000100) if p.get('employer'))
   self.assertEqual(plan.get('linkedin_company_ids'),[1234] if verified else None)
  row={'name':'Microsoft','linkedin_company_ids':[-1],'linkedin_ids_verified':True}
  with patch('collect_platforms.approved_targets',return_value={'Microsoft':row}):
   self.assertTrue(all('linkedin_company_ids' not in p for p in search_plan('linkedin',1000100)))

 def test_employer_progress_is_independent_for_each_platform(self):
  previous=collect('linkedin',fetcher=lambda p:([],False),now=1000100)
  fresh={p['employer'] for p in search_plan('naukri',1014500) if p.get('employer')}
  with_other_site_history={p['employer'] for p in search_plan('naukri',1014500,previous) if p.get('employer')}
  self.assertEqual(fresh,with_other_site_history)

 def test_full_platform_page_fetches_one_extra_page_and_deduplicates(self):
  from unittest.mock import patch
  calls=[]
  plan=dict(site='linkedin',role='AI Engineer',city='India',remote=False,results=20)
  def fetch(p):
   calls.append(p)
   return [self.job(str(i)) for i in range(20)] if not p.get('offset') else [self.job('19'),self.job('20')],False
  with patch('collect_platforms.search_plan',return_value=[plan]):result=collect('linkedin',fetcher=fetch,now=1000100)
  self.assertEqual([p.get('offset',0) for p in calls],[0,20]);self.assertEqual(len(result['jobs']),21)

 def test_failed_second_platform_page_preserves_first(self):
  from unittest.mock import patch
  plan=dict(site='naukri',role='AI Engineer',city='India',remote=False,results=20)
  def fetch(p):
   if p.get('offset'):raise RuntimeError('Source unavailable')
   return [self.job(str(i)) for i in range(20)],False
  with patch('collect_platforms.search_plan',return_value=[plan]):result=collect('naukri',fetcher=fetch,now=1000100)
  self.assertEqual(len(result['jobs']),20);self.assertEqual(result['sources'][0]['queries_attempted'],2)

if __name__=='__main__':unittest.main()

import json,sys,tempfile,time,unittest
from pathlib import Path
from job_availability import availability_key,closure_quote,is_unavailable
from job_store import JobStore
sys.path.insert(0,str(Path(__file__).parent/'public_feed'))
from check_availability import refresh_status
from merge import merge_feeds

class AvailabilityTests(unittest.TestCase):
 def job(self,**kw):return {'id':'test-job','source':'platform:public:linkedin','company':'HSBC','title':'AI Engineer','url':'https://www.linkedin.com/jobs/view/1234567890/','description':'Requires 2 years of experience. Build Python AI applications and SQL data workflows. '*3,'location':'Pune, India','last_checked':time.time(),**kw}
 def test_reported_job_and_tracking_variants_are_hidden(self):
  self.assertEqual(availability_key('https://www.linkedin.com/jobs/view/4487032589/?trk=search'),'linkedin:4487032589')
  self.assertTrue(is_unavailable(self.job(url='https://in.linkedin.com/jobs/view/4487032589/')))
  self.assertFalse(is_unavailable(self.job()))
 def test_explicit_closed_markers_and_false_positives(self):
  for text in ['Not currently accepting applications','No longer accepting applications','This job has been closed','This position is no longer available','Not currently\naccepting applications']:
   self.assertTrue(closure_quote(text),text)
  for text in ['We are accepting applications.','We are not currently accepting applications from recruitment agencies.','Recommended jobs\nNot currently accepting applications','A recent posting with no salary listed.']:
   self.assertFalse(closure_quote(text),text)
  self.assertTrue(is_unavailable(self.job(job_is_open=False)))
  self.assertTrue(is_unavailable(self.job(is_expired=True)))
 def test_failed_checks_do_not_suppress_jobs(self):
  feed={'jobs':[self.job()],'sources':[]}
  result,registry=refresh_status(feed,{'entries':[]},checker=lambda j:None)
  self.assertEqual(len(result['jobs']),1);self.assertFalse(registry['entries']);self.assertIn('availability_last_attempt',result['jobs'][0])
 def test_closed_proof_persists_and_stale_copy_cannot_resurrect(self):
  j=self.job();proof={'key':availability_key(j['url']),'url':j['url'],'status':'closed','checked_at':time.time(),'quote':'Not currently accepting applications'}
  result,registry=refresh_status({'jobs':[j],'sources':[]},{'entries':[]},checker=lambda j:proof)
  self.assertEqual(result['jobs'],[])
  self.assertEqual(merge_feeds([result,{'jobs':[j]}])['jobs'],[])
  self.assertEqual(refresh_status({'jobs':[j]},{'entries':registry['entries']},max_jobs=0)[0]['jobs'],[])
 def test_closed_metadata_deactivates_previously_cached_job(self):
  source={'provider':'platform','id':'jobspy','company':'JobSpy'}
  with tempfile.TemporaryDirectory() as folder:
   store=JobStore(Path(folder)/'test.db',sources=[source]);j=self.job();store.update_source(source,[j],complete=False)
   store.update_source(source,[{**j,'job_is_open':False}],complete=False)
   with store.connect() as db:self.assertEqual(db.execute('SELECT active FROM jobs WHERE id=?',(j['id'],)).fetchone()[0],0)

if __name__=='__main__':unittest.main()

import unittest,tempfile,time,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'public_feed'))
from collect import export
from job_store import JobStore
class PublicFeedTests(unittest.TestCase):
 def test_only_public_fresh_configured_employers(self):
  source={'id':'example','provider':'careers','company':'Accenture','careers_url':'https://www.accenture.com/careers'}
  with tempfile.TemporaryDirectory() as folder:
   store=JobStore(Path(folder)/'jobs.sqlite3',sources=[source])
   job={'id':'x','source':'careers:example','company':'Accenture','title':'Data Analyst','description':'Requires 2–4 years of experience. SQL reporting.','location':'Bengaluru','url':'https://www.accenture.com/jobs/123','style':'Hybrid','private_applicant_resume':'MUST NEVER EXPORT'}
   store.update_source(source,[job],now=1000000)
   data=export(store,now=1000100);self.assertEqual(len(data['jobs']),1);self.assertNotIn('private_applicant_resume',json.dumps(data));self.assertEqual(data['jobs'][0]['experience_requirement']['minimum'],2)
   self.assertEqual(export(store,now=1000000+8*86400)['jobs'],[])
   job['company']='Unlisted Company';store.update_source(source,[job],now=1000000);self.assertEqual(export(store,now=1000100)['jobs'],[])
if __name__=='__main__':unittest.main()

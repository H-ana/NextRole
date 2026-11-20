import gzip,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'public_feed'))
from build_delivery import build_delivery,buckets
from merge import merge_feeds

class DeliveryTests(unittest.TestCase):
 def job(self,i,location='Bengaluru, India',**kw):return {'id':str(i),'source':'platform:public:naukri','company':'Apple','title':'Software Engineer AI','location':location,'description':'Build AI applications using Python. Minimum 1 year of software engineering experience. '+('Details '*100),'url':'https://www.naukri.com/job-listings-engineer-apple-'+str(i),'last_checked':1000000,**kw}
 def test_location_delivery_preserves_facts_and_omits_private_fields(self):
  with tempfile.TemporaryDirectory() as folder:
   jobs=[self.job(1,private_resume='CANARY'),self.job(2,'Hyderābād, India'),self.job(3,'Remote - India',style='Remote')]
   result=build_delivery({'jobs':jobs},folder,now=1000010,max_bytes=1700)
   self.assertEqual(result['jobs'],3);self.assertEqual({s['key'] for s in result['shards']},{'bengaluru','hyderabad','remote'})
   for part in result['shards']:
    raw=(Path(folder)/part['url']).read_bytes();body=gzip.decompress(raw);data=json.loads(body)
    self.assertNotIn(b'CANARY',body);self.assertEqual(len(raw),part['bytes']);self.assertEqual(data['jobs'][0]['description'],jobs[int(data['jobs'][0]['id'])-1]['description'])
 def test_unchanged_chunks_keep_urls_and_old_manifest_can_finish(self):
  with tempfile.TemporaryDirectory() as folder:
   a=build_delivery({'jobs':[self.job(1)]},folder,now=1000010)
   b=build_delivery({'jobs':[self.job(1)]},folder,now=1000020);self.assertEqual(a['shards'],b['shards'])
   c=build_delivery({'jobs':[self.job(2)]},folder,now=1000030);self.assertTrue((Path(folder)/a['shards'][0]['url']).exists())
 def test_duplicate_requisition_prefers_precise_city_and_keeps_links(self):
  a=self.job(1,'KA, India');a['description']+='\nRole Number: 200689026-0321';a['source']='platform:public:indeed';a['url']='https://in.indeed.com/viewjob?jk=a'
  b=self.job(2);b['description']+='\nRole Number: 200689026-0321'
  result=merge_feeds([{'jobs':[a,b]}],now=1000010)
  self.assertEqual(len(result['jobs']),1);self.assertEqual(result['jobs'][0]['location'],'Bengaluru, India');self.assertEqual(len(result['jobs'][0]['application_links']),2)
 def test_nearby_places_are_addressable_without_changing_locations(self):
  self.assertIn('gurugram',buckets(self.job(1,'Gurgaon, India')));self.assertIn('hyderabad',buckets(self.job(1,'Hyderābād, India')))

if __name__=='__main__':unittest.main()

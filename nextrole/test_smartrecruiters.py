import json,unittest
from unittest.mock import patch
from careers_scraper import CareersCrawler,CrawlError
from company_collectors import collect_smartrecruiters

SOURCE=dict(id='synthetic',provider='careers',company='Bosch',careers_url='https://careers.smartrecruiters.com/BoschGroup',allowed_hosts=['api.smartrecruiters.com','jobs.smartrecruiters.com'],max_pages=3)
JD='Develop production AI applications and LLM agents with Python. Required 1 year of experience in software engineering. Build APIs and evaluate models.'
def detail(identity='1',**extra):
 return dict(company={'identifier':'BoschGroup'},name='AI Engineer',postingUrl='https://jobs.smartrecruiters.com/BoschGroup/'+identity,location={'city':'Bengaluru','country':'in','hybrid':True},jobAd={'sections':{'jobDescription':{'text':JD}}},releasedDate='2026-10-30',refNumber='REF'+identity,active=True,visibility='PUBLIC',**extra)
class SmartRecruitersTests(unittest.TestCase):
 def test_external_details_and_saved_cursor(self):
  calls=[];crawler=CareersCrawler(SOURCE)
  def read(url,**kw):
   calls.append(url)
   return json.dumps({'content':[{'id':'1'},{'id':'2'},{'id':'3'}],'totalFound':30} if '?' in url else detail(url.rsplit('/',1)[-1])),url
  with patch.object(crawler,'_open',side_effect=read):result=collect_smartrecruiters(SOURCE,crawler)
  self.assertEqual(len(result.jobs),2);self.assertEqual(result.next_cursor,2)
  self.assertIn('country=in',calls[0]);self.assertEqual(result.jobs[0]['years'],1)
  self.assertEqual(result.jobs[0]['style'],'Hybrid');self.assertEqual(result.jobs[0]['job_requisition_id'],'REF1')
  self.assertEqual(result.jobs[0]['date_posted'],'2026-10-30')
 def test_internal_or_wrong_employer_and_external_redirect_rejected(self):
  for change in [{'visibility':'INTERNAL'},{'active':False}]:
   item=detail();item.update(change);crawler=CareersCrawler(SOURCE)
   with patch.object(crawler,'_open',side_effect=[(json.dumps({'content':[{'id':'1'}],'totalFound':1}),'x'),(json.dumps(item),'x')]):result=collect_smartrecruiters(SOURCE,crawler)
   self.assertEqual(result.jobs,[])
  for change in [{'company':{'identifier':'Other'}},{'postingUrl':'https://evil.example/apply'}]:
   item=detail();item.update(change);crawler=CareersCrawler(SOURCE)
   with patch.object(crawler,'_open',side_effect=[(json.dumps({'content':[{'id':'1'}],'totalFound':1}),'x'),(json.dumps(item),'x')]):
    with self.assertRaises(CrawlError):collect_smartrecruiters(SOURCE,crawler)
 def test_partial_failure_keeps_verified_jobs_and_resume_cursor(self):
  source={**SOURCE,'max_pages':5,'scan_offset':20};crawler=CareersCrawler(source)
  with patch.object(crawler,'_open',side_effect=[(json.dumps({'content':[{'id':'1'},{'id':'2'}],'totalFound':30}),'x'),(json.dumps(detail()),'x'),CrawlError('Timed out')]):result=collect_smartrecruiters(source,crawler)
  self.assertEqual(len(result.jobs),1);self.assertEqual(result.next_cursor,21)
if __name__=='__main__':unittest.main()

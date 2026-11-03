"""Synthetic employer-site fixtures; no requests or applicant documents."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from careers_scraper import CareersCrawler, CrawlResult, CrawlError, is_detail
from company_collectors import collect_workday, collect_oracle, brand_matches
from job_store import JobStore, source_key
from mnc_employers import mnc_employer
from test_job_store import FakeEncoder

SOURCE={'id':'synthetic','provider':'careers','company':'Microsoft','careers_url':'https://synthetic.wd1.myworkdayjobs.com/External','adapter':'workday','max_pages':3}
JD='Responsibilities: Build and maintain Python backend services. Qualifications: Required 2 years of experience in software development and automated testing.'
def info(i,**extra):
    return {'jobPostingInfo':{'title':'Software Engineer','jobDescription':JD,'location':'India, Bangalore','additionalLocations':['India, Hyderabad'],'country':{'descriptor':'India'},'canApply':True,'posted':True,'startDate':'2026-10-25','jobReqId':'R'+str(i),**extra}}

class CompanyCollectorTests(unittest.TestCase):
    def crawler(self,source=SOURCE):return CareersCrawler(source)

    def test_public_workday_full_descriptions_dates_and_locations(self):
        crawler=self.crawler();calls=[]
        def read(url,**kw):
            calls.append((url,kw))
            if url.endswith('/jobs'):
                self.assertEqual(json.loads(kw['payload'])['searchText'],'India')
                return json.dumps({'total':4,'jobPostings':[{'externalPath':'/job/India/Engineer_R'+str(i)} for i in range(4)]}),url
            return json.dumps(info(1)),url
        with patch.object(crawler,'_open',side_effect=read):result=collect_workday(SOURCE,crawler)
        self.assertEqual(len(result.jobs),2);self.assertEqual(result.next_cursor,2)
        self.assertFalse(result.complete)
        self.assertIn('Hyderabad',result.jobs[0]['location']);self.assertEqual(result.jobs[0]['years'],2)
        self.assertEqual(result.jobs[0]['date_posted'],'2026-10-25')
        self.assertIn('/External/job/',result.jobs[0]['url']);self.assertEqual(len(calls),3)

    def test_closed_jobs_and_brand_unrelated_jobs_not_returned(self):
        source={**SOURCE,'brand_terms':['VMware']};crawler=self.crawler(source)
        with patch.object(crawler,'_open',side_effect=[(json.dumps({'total':2,'jobPostings':[{'externalPath':'/job/India/One_R1'},{'externalPath':'/job/India/Two_R2'}]}),'x'),(json.dumps(info(1,canApply=False)),'x'),(json.dumps(info(2)),'x')]):
            result=collect_workday(source,crawler)
        self.assertEqual(result.jobs,[]);self.assertEqual(result.next_cursor,0)
        self.assertTrue(brand_matches(source,'VMware Engineer',JD))
        self.assertFalse(brand_matches(source,'Other Engineer',JD))

    def test_pagination_starts_at_saved_cursor_and_empty_page_resets(self):
        source={**SOURCE,'scan_offset':40};crawler=self.crawler(source)
        def read(url,**kw):
            self.assertEqual(json.loads(kw['payload'])['offset'],40)
            return json.dumps({'total':10,'jobPostings':[]}),url
        with patch.object(crawler,'_open',side_effect=read):self.assertEqual(collect_workday(source,crawler).next_cursor,0)

    def test_invalid_host_and_external_job_path_are_rejected(self):
        with self.assertRaises(CrawlError):collect_workday({**SOURCE,'careers_url':'https://evil.example/External'})
        crawler=self.crawler()
        with patch.object(crawler,'_open',return_value=(json.dumps({'total':1,'jobPostings':[{'externalPath':'https://evil.example/job/1'}]}),'x')):
            with self.assertRaises(CrawlError):collect_workday(SOURCE,crawler)

    def test_partial_success_retains_jobs(self):
        crawler=self.crawler()
        responses=[(json.dumps({'total':2,'jobPostings':[{'externalPath':'/job/India/One_R1'},{'externalPath':'/job/India/Two_R2'}]}),'x'),(json.dumps(info(1)),'x'),CrawlError('timeout')]
        with patch.object(crawler,'_open',side_effect=responses):result=collect_workday(SOURCE,crawler)
        self.assertEqual(len(result.jobs),1);self.assertFalse(result.complete)
        self.assertEqual(result.next_cursor,1)

    def test_cursor_persists_only_after_success_and_failure_retains_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            store=JobStore(Path(folder)/'jobs.db',[SOURCE],FakeEncoder())
            store.refresh(lambda s:CrawlResult([],False,'partial',next_cursor=20))
            seen=[]
            def fail(s):seen.append(s['scan_offset']);raise CrawlError('blocked')
            store.refresh(fail);self.assertEqual(seen,[20])
            with store.connect() as db:self.assertEqual(db.execute('SELECT cursor FROM sources').fetchone()['cursor'],20)

    def test_company_specific_job_urls_not_landing_pages(self):
        for url in ['https://careers.example/job/engineer-india-jid-123','https://jobs.example/en_US/careers/JobDetail/Engineer/123','https://jobs.apple.com/en-in/details/200123456/software-engineer','https://jobs.intuit.com/job/bengaluru/engineer/27595/123456789']:
            self.assertTrue(is_detail(url),url)
        self.assertFalse(is_detail('https://jobs.example/careers/SearchJobs'))

class CatalogTests(unittest.TestCase):
    def test_all_100_companies_have_sources_and_pass_employer_policy(self):
        root=Path(__file__).parent
        catalog=json.loads((root/'dist/company-catalog.json').read_text(encoding='utf-8'))
        sources=json.loads((root/'job_sources.json').read_text(encoding='utf-8'))
        lookup={s['id']:s for s in sources}
        self.assertEqual(catalog['list_year'],2018);self.assertEqual(len(catalog['companies']),100)
        self.assertEqual(len({c['listed_name'] for c in catalog['companies']}),100)
        self.assertEqual(len({source_key(s) for s in sources}),len(sources))
        for row in catalog['companies']:
            for key in row['source_ids']:
                source=lookup[key]
                self.assertEqual(source['catalog'],catalog['id'])
                self.assertTrue(source['careers_url'].startswith('https://'))
                self.assertIsNotNone(mnc_employer({'company':source['company']}),source['company'])
        self.assertNotIn('Broadcom',{c['company'] for c in catalog['companies']},'Do not relabel all parent-company roles as an acquired brand')

class OracleCollectorTests(unittest.TestCase):
    def test_public_details_and_expired_roles(self):
        source={**SOURCE,'adapter':'oracle','careers_url':'https://synthetic.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs','site_number':'CX_1'}
        crawler=CareersCrawler(source)
        listing={'items':[{'TotalJobsCount':2,'requisitionList':[{'Id':'1'},{'Id':'2'}]}]}
        detail={'Title':'Backend Engineer','ExternalDescriptionStr':JD,'PrimaryLocation':'Bengaluru, Karnataka, India','WorkplaceType':'Hybrid','ExternalPostedStartDate':'2026-10-25T00:00:00Z'}
        responses=[(json.dumps(listing),'x'),(json.dumps({'items':[{**detail,'ExternalPostedEndDate':'2000-01-01T00:00:00Z'}]}),'x'),(json.dumps({'items':[detail]}),'x')]
        with patch.object(crawler,'_open',side_effect=responses):result=collect_oracle(source,crawler)
        self.assertEqual(len(result.jobs),1);self.assertEqual(result.jobs[0]['style'],'Hybrid')
        self.assertIn('/job/2',result.jobs[0]['url']);self.assertEqual(result.jobs[0]['years'],2)
        self.assertEqual(result.next_cursor,0)

    def test_empty_and_invalid_oracle_source(self):
        source={**SOURCE,'adapter':'oracle','careers_url':'https://synthetic.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs','site_number':'CX_1'}
        crawler=CareersCrawler(source)
        with patch.object(crawler,'_open',return_value=(json.dumps({'items':[{'TotalJobsCount':0,'requisitionList':[]}]}),'x')):
            self.assertEqual(collect_oracle(source,crawler).jobs,[])
        with self.assertRaises(CrawlError):collect_oracle({**source,'site_number':'CX_1;arbitrary=value'})

    def test_city_filters_still_apply_to_direct_company_jobs(self):
        from careers_scraper import make_job
        with tempfile.TemporaryDirectory() as folder:
            store=JobStore(Path(folder)/'jobs.db',[SOURCE],FakeEncoder())
            jobs=[make_job(SOURCE,'Backend Engineer',JD,city,'https://careers.example.com/job/'+str(i)) for i,city in enumerate(['Bangalore, India','Hyderabad, India','New York, United States'])]
            store.update_source(SOURCE,jobs)
            result=store.search({'preferences':{'experience':2,'cities':['Bengaluru','Hyderabad']}})
            self.assertEqual(len(result['jobs']),2);self.assertEqual(result['excluded_location'],1)

if __name__=='__main__':unittest.main()

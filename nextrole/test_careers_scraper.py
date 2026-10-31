"""Synthetic scraper tests. No public requests or applicant data."""
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from careers_scraper import (CareersCrawler, CrawlError, CrawlResult, PageParser,
                             is_detail, public_url, scrape_source, structured_jobs, scraping_mode, visible_location)
from job_store import JobStore, source_key, fetch_source
from test_job_store import FakeEncoder

SOURCE={'id':'example','provider':'careers','company':'Microsoft','careers_url':'https://careers.example.com/jobs','allowed_hosts':['jobs.lever.co']}
JD='Required: 2 years of experience.\nResponsibilities\nBuild automated reconciliation workflows and maintain financial reporting processes. Work with internal teams.'

def page(job_id='123456', **extra):
    data={'@context':'https://schema.org','@type':'JobPosting','title':'Automation Analyst',
          'description':JD,'jobLocation':{'address':{'addressLocality':'Bengaluru','addressCountry':'India'}},
          'url':'https://careers.example.com/jobs/'+job_id,**extra}
    return '<script type="application/ld+json">'+json.dumps({'@graph':[data]})+'</script>'


class ScraperTests(unittest.TestCase):
    def test_numeric_and_rel_next_pagination_are_collected(self):
        for navigation in ['<a href="/jobs?page=2">2</a>','<link rel="next" href="/jobs?page=2">','<a aria-label="Next page" href="/jobs?page=2">→</a>']:
            crawler=CareersCrawler({**SOURCE,'max_pages':4});calls=[]
            def read(url,**kw):
                calls.append(url)
                return (navigation if '?' not in url else page()),url
            with patch.object(crawler,'_open',side_effect=read):result=crawler.collect()
            self.assertIn('https://careers.example.com/jobs?page=2',calls)
            self.assertEqual(len(result.jobs),1)
    def test_greenhouse_visible_header_location_without_location_label(self):
        self.assertEqual(visible_location('Analyst, Banking Alliances','Back to jobs\nAnalyst, Banking Alliances\nChennai\nApply\nCompany works across India, Singapore and Malaysia.'),'Chennai')
        self.assertEqual(visible_location('Product Manager','Product Manager\nSan Francisco (Hybrid)\nApply\nResponsibilities'),'San Francisco (Hybrid)')
        self.assertEqual(visible_location('Engineer','Engineer\nResponsibilities\nWork with Bengaluru team.'),'')
        self.assertEqual(visible_location('Engineer','Engineer\nResponsibilities\nApply for this job\nLocation\nResume/CV'),'')
    def test_html_mode_never_attempts_browser_rendering(self):
        crawler=CareersCrawler(SOURCE);self.assertEqual(crawler.mode,'html')
        detail='https://careers.example.com/jobs/123456'
        def read(url):
            if url==SOURCE['careers_url']:return '<a href="/jobs/123456">Analyst</a>',url
            return '<h1>Automation Analyst</h1><h2>Location</h2><p>Bengaluru</p><h2>Requirements</h2><p>'+JD+'</p>',url
        with patch.object(crawler,'_open',side_effect=read),patch.object(crawler,'render',side_effect=AssertionError('Browser must not run')):
            result=crawler.collect()
        self.assertEqual(len(result.jobs),1);self.assertIn('HTML-only',result.note)
        self.assertEqual(result.jobs[0]['location'],'Bengaluru')
        with patch.object(crawler,'check_robots',side_effect=AssertionError('No browser request')):
            self.assertIsNone(CareersCrawler.render(crawler,detail))

    def test_html_mode_reports_js_only_page_without_installer_instruction(self):
        crawler=CareersCrawler(SOURCE)
        with patch.object(crawler,'_open',return_value=('<div id="app"></div>',SOURCE['careers_url'])),patch.object(crawler,'render') as render:
            with self.assertRaisesRegex(CrawlError,'HTML-only'):crawler.collect()
            render.assert_not_called()

    def test_missing_settings_default_to_html_and_browser_requires_opt_in(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'settings.json'
            with patch('careers_scraper.SETTINGS_PATH',path):
                self.assertEqual(scraping_mode(),'html')
                path.write_text('{"mode":"browser"}',encoding='utf-8');self.assertEqual(scraping_mode(),'browser')
                path.write_text('{broken',encoding='utf-8');self.assertEqual(scraping_mode(),'html')

    def test_json_ld_full_description_locations_remote_expired(self):
        p=PageParser();p.feed(page(jobLocationType='TELECOMMUTE',applicantLocationRequirements={'name':'India'}))
        jobs=structured_jobs(SOURCE,p,SOURCE['careers_url'])
        self.assertEqual(len(jobs),1);self.assertEqual(jobs[0]['years'],2)
        self.assertEqual(jobs[0]['style'],'Remote');self.assertIn('India',jobs[0]['location'])
        self.assertEqual(jobs[0]['url'],'https://careers.example.com/jobs/123456')
        self.assertEqual(jobs[0]['collection_method'],'careers-page scraping')
        p=PageParser();p.feed(page(validThrough='2000-01-01T00:00:00Z'))
        self.assertEqual(structured_jobs(SOURCE,p,SOURCE['careers_url']),[])

    def test_job_urls_not_careers_landing_pages(self):
        for url in ('https://stripe.com/careers/listing/ar-analyst/8247127','https://job-boards.greenhouse.io/example/jobs/123456','https://jobs.lever.co/example/12345678-abcd-abcd-abcd-123456789012'):
            self.assertTrue(is_detail(url),url)
        for url in ('https://example.com/careers','https://example.com/jobs/search','https://example.com/blog/jobs'):
            self.assertFalse(is_detail(url),url)

    def test_crawl_follows_employer_links_not_unknown_hosts_and_keeps_application_url(self):
        crawler=CareersCrawler(SOURCE)
        calls=[]
        def read(url):
            calls.append(url)
            if url==SOURCE['careers_url']:return '<a href="/jobs/123456">Analyst</a><a href="https://unconfigured.example/jobs/111111">Other job</a>',url
            return page(),url
        with patch.object(crawler,'_open',side_effect=read),patch.object(crawler,'render',return_value=None):
            result=crawler.collect()
        self.assertEqual(len(calls),2);self.assertEqual(len(result.jobs),1)
        self.assertFalse(result.complete);self.assertIn('additional openings',result.note)

    def test_access_denial_never_triggers_browser_retry(self):
        crawler=CareersCrawler(SOURCE)
        with patch.object(crawler,'_open',side_effect=CrawlError('Website blocked automated access.')),patch.object(crawler,'render') as render:
            with self.assertRaises(CrawlError):crawler.collect()
            render.assert_not_called()

    def test_challenge_is_not_a_job(self):
        crawler=CareersCrawler(SOURCE)
        with patch.object(crawler,'_open',return_value=('<title>Just a moment</title><h1>Verify you are human</h1>',SOURCE['careers_url'])),patch.object(crawler,'render') as render:
            with self.assertRaises(CrawlError):crawler.collect()
            render.assert_not_called()

    def test_private_addresses_and_unsafe_urls_rejected(self):
        for url in ('http://example.com/jobs','https://user:password@example.com/jobs','https://example.com:8081/jobs'):
            with self.assertRaises(CrawlError):public_url(url)
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(CrawlError):public_url('https://example.com/jobs')

    def test_robots_denial_stops_request(self):
        crawler=CareersCrawler(SOURCE)
        with patch.object(crawler,'_open',return_value=('User-agent: *\nDisallow: /jobs',SOURCE['careers_url'])) as opener:
            with self.assertRaisesRegex(CrawlError,'disallow'):crawler.check_robots(SOURCE['careers_url'])
            self.assertEqual(opener.call_count,1)

    def test_current_registry_never_calls_job_board_apis(self):
        sources=json.loads((Path(__file__).parent/'job_sources.json').read_text())
        self.assertTrue(all(s['provider'] in ('careers','restricted','manual','platform') for s in sources))
        with patch('job_store.urllib.request.urlopen',side_effect=AssertionError('No board APIs')),patch('careers_scraper.scrape_source',return_value=CrawlResult([])) as scraper:
            fetch_source(SOURCE);scraper.assert_called_once_with(SOURCE)
        blocked={'provider':'restricted','unavailable_reason':'Access unavailable'}
        with patch('urllib.request.urlopen') as request:
            with self.assertRaises(CrawlError):scrape_source(blocked)
            request.assert_not_called()


class ScrapedCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.manual={'provider':'manual','id':'linkedin','company':'LinkedIn jobs added by you'}
        self.store=JobStore(Path(self.temp.name)/'jobs.db',[SOURCE,self.manual],FakeEncoder())
        p=PageParser();p.feed(page());self.job=structured_jobs(SOURCE,p,SOURCE['careers_url'])[0]
    def tearDown(self):self.temp.cleanup()

    def test_partial_refresh_keeps_unvisited_jobs_and_exposes_note(self):
        first=self.job;other={**first,'id':first['id']+'2','url':first['url']+'2'}
        self.store.update_source(SOURCE,[first,other])
        self.store.refresh(lambda source:None if source['provider']=='manual' else CrawlResult([first],note='Some pages could not be read.'))
        snapshot=self.store.snapshot()
        self.assertEqual(len(snapshot['jobs']),2);self.assertIn('Some pages',snapshot['sources'][0]['note'])

    def test_old_scraped_jobs_expire_even_when_refresh_fails(self):
        self.store.update_source(SOURCE,[self.job],now=time.time()-90000,complete=False)
        self.assertEqual(self.store.snapshot()['jobs'],[])

    def test_repair_cached_header_location_preserves_actual_check_time_and_experience(self):
        missing={**self.job,'location':'Location not specified','description':self.job['title']+'\nChennai\nApply\n'+JD}
        checked=time.time()-600
        self.store.update_source(SOURCE,[missing],now=checked)
        self.assertEqual(self.store.repair_cached_locations(),1)
        self.assertEqual(self.store.repair_cached_locations(),0)
        repaired=self.store.snapshot()['jobs'][0]
        self.assertEqual(repaired['location'],'Chennai');self.assertEqual(repaired['last_checked'],checked)
        self.assertEqual(repaired['years'],2)
        result=self.store.search({'resume':'','preferences':{'experience':2,'cities':['Chennai']}})
        self.assertEqual(result['eligible'],1)
        with patch.object(self.store.encoder,'load',side_effect=AssertionError('Browse needs no model')):
            self.assertEqual(self.store.search({'resume':'','preferences':{'experience':2}})['eligible'],1)

    def test_platform_import_uses_original_facts_and_not_gemini(self):
        with patch('agent_service.call_model',side_effect=AssertionError('No Gemini')),patch.object(self.store,'build_index'):
            job=self.store.import_platform_job({'url':'https://www.linkedin.com/jobs/view/12345/?tracking=abc','company':'Employer','title':'Automation Analyst','location':'Remote - India','description':JD})
        self.assertEqual(job['description'],JD);self.assertEqual(job['company'],'Employer')
        self.assertEqual(job['url'],'https://www.linkedin.com/jobs/view/12345/')
        self.assertEqual(job['collection_method'],'Added by you')
        self.assertEqual(len(self.store.snapshot()['jobs']),1)
        with self.assertRaises(ValueError):self.store.import_platform_job({'url':'https://localhost/jobs/view/1'})
        with self.assertRaises(ValueError):self.store.import_platform_job({'url':'https://linkedin.com.evil.example/jobs/view/1'})


if __name__=='__main__':unittest.main()

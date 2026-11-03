"""Public employer feed safety and requested catalog coverage."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from careers_scraper import CareersCrawler,CrawlError,is_detail
from company_collectors import collect_published_board
from job_store import source_key

JD='Required 3 years of software development experience. Build Python services and reliable backend applications for customers.'
class PublishedCareersTests(unittest.TestCase):
    def source(self,host='jobs.ashbyhq.com'):
        return {'id':'synthetic','provider':'careers','company':'Example','careers_url':f'https://{host}/example','allowed_hosts':[host],'adapter':'published-board'}
    def test_ashby_public_full_description_dates_and_unlisted(self):
        row={'title':'Engineer','location':'Bengaluru, India','descriptionPlain':JD,'applyUrl':'https://jobs.ashbyhq.com/example/123/apply','publishedAt':'2026-10-25','workplaceType':'Hybrid'}
        with patch.object(CareersCrawler,'_open',return_value=(json.dumps({'jobs':[row,{**row,'isListed':False}]}),'x')) as read:
            result=collect_published_board(self.source())
        self.assertEqual(len(result.jobs),1);j=result.jobs[0]
        self.assertEqual(j['source'],'careers:synthetic');self.assertEqual(j['description'],JD)
        self.assertEqual(j['years'],3);self.assertEqual(j['date_posted'],'2026-10-25')
        self.assertEqual(j['style'],'Hybrid');self.assertFalse(result.complete)
        self.assertEqual(read.call_args.args[0],'https://api.ashbyhq.com/posting-api/job-board/example')
    def test_greenhouse_updates_not_publication_and_external_urls_rejected(self):
        row={'title':'Engineer','location':{'name':'Chennai'},'content':JD,'absolute_url':'https://boards.greenhouse.io/example/jobs/12345','updated_at':'2026-10-25'}
        with patch.object(CareersCrawler,'_open',return_value=(json.dumps({'jobs':[row,{**row,'absolute_url':'https://evil.example/jobs/12345'},{**row,'absolute_url':'https://boards.greenhouse.io/other/jobs/12345'}]}),'x')):
            result=collect_published_board(self.source('job-boards.greenhouse.io'))
        self.assertEqual(len(result.jobs),1);self.assertNotIn('date_posted',result.jobs[0])
    def test_lever_and_malformed_feed_preserve_cache_semantics(self):
        row={'text':'Engineer','categories':{'location':'Mumbai'},'descriptionPlain':JD,'applyUrl':'https://jobs.lever.co/example/abc/apply','createdAt':12345}
        with patch.object(CareersCrawler,'_open',return_value=(json.dumps([row]),'x')):
            result=collect_published_board(self.source('jobs.lever.co'))
        self.assertEqual(len(result.jobs),1);self.assertNotIn('date_posted',result.jobs[0])
        with patch.object(CareersCrawler,'_open',return_value=('{}','x')):
            with self.assertRaises(CrawlError):collect_published_board(self.source())
        with self.assertRaises(CrawlError):collect_published_board(self.source('evil.example'))
    def test_requested_catalog_provenance_connections_and_ambiguity(self):
        root=Path(__file__).parent
        catalog=json.loads((root/'dist/employer-catalogs.json').read_text(encoding='utf8'))
        sources=json.loads((root/'job_sources.json').read_text(encoding='utf8'))
        lookup={s['id']:s for s in sources}
        self.assertEqual(len(catalog['companies']),578)
        self.assertEqual(len({source_key(s) for s in sources}),len(sources))
        self.assertEqual(len(catalog['catalogs']),5)
        for row in catalog['companies']:
            self.assertTrue(row['list_references'])
            for sid in row['source_ids']:self.assertIn(sid,lookup)
            if row['identity_review_required']:self.assertFalse(row['source_ids'])
        named=[r for r in catalog['companies'] if 'User-requested employers' in r['list_references']]
        self.assertEqual(len(named),5)
        self.assertTrue(all(r['source_ids'] for r in named))
        self.assertTrue(is_detail('https://www.novartis.com/careers/career-search/job/details/req-10012345-engineer'))

if __name__=='__main__':unittest.main()

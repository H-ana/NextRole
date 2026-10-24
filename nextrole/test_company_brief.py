from datetime import datetime,timezone,timedelta
from email.utils import format_datetime
import unittest
from unittest.mock import patch
from company_brief import build_brief,parse_news,company_news,news_url,_cache

NOW=datetime(2026,10,24,12,tzinfo=timezone.utc)
def feed(items):
    return ('<rss><channel>'+''.join(f'<item><title>{title}</title><link>https://news.google.com/articles/{i}</link><pubDate>{date}</pubDate><source>Example Publisher</source></item>' for i,(title,date) in enumerate(items))+'</channel></rss>').encode()
def job(company='Example Company',title='Data Engineer',description='Build Python and SQL pipelines using AWS.',url='https://careers.example.com/job/123'):
    return dict(company=company,title=title,description=description,location='Bengaluru',url=url)
NEWS={'news':{'items':[],'available':True},'layoffs':{'items':[],'available':True},'checked_at':NOW.isoformat()}

class CompanyBriefTests(unittest.TestCase):
    def setUp(self):_cache.clear()
    def test_news_requires_company_identity_valid_recent_dates_and_deduplicates(self):
        data=feed([('Example Company launches product',format_datetime(NOW-timedelta(days=1))),
                   ('Example Company launches product',format_datetime(NOW-timedelta(days=1))),
                   ('Unrelated business launches product',format_datetime(NOW-timedelta(days=1))),
                   ('Example Company older article',format_datetime(NOW-timedelta(days=45))),
                   ('Example Company future article',format_datetime(NOW+timedelta(days=1))),
                   ('Example Company missing date','invalid')])
        items=parse_news(data,'Example Company',30,NOW)
        self.assertEqual(len(items),1);self.assertEqual(items[0]['publisher'],'Example Publisher')

    def test_layoff_related_headlines_not_confirmed_company_status(self):
        data=feed([('Example Company launches product',format_datetime(NOW-timedelta(days=1))),
                   ('Example Company denies layoffs',format_datetime(NOW-timedelta(days=40)))])
        items=parse_news(data,'Example Company',90,NOW)
        self.assertEqual(len(items),1);self.assertIn('denies',items[0]['title'])
        result=build_brief(job(),[],NEWS)
        self.assertEqual(result['layoffs']['items'],[])
        self.assertNotIn('no_layoffs',result)

    def test_feed_entities_and_excess_size_are_rejected(self):
        for data in (b'<!DOCTYPE foo><rss/>',b'x'*1_000_001):
            with self.assertRaises(ValueError):parse_news(data,'Example Company',30,NOW)

    def test_company_name_in_publisher_is_not_company_news(self):
        data=feed([('A music review - Example Publisher',format_datetime(NOW))])
        self.assertEqual(parse_news(data,'Example Publisher',30,NOW),[])

    def test_source_quotes_role_boundaries_and_deduplication(self):
        original=job(description='Use Python and AWS. Our interview process takes 2-3 weeks.')
        other=job('Other Employer',description='Use Java. Hiring process takes 1 day.')
        duplicated=job(url='https://www.linkedin.com/jobs/view/123')
        result=build_brief(original,[other,duplicated],NEWS)
        self.assertEqual(result['listing_count'],1)
        self.assertEqual({i['name'] for i in result['technology']},{'Python','AWS'})
        self.assertEqual(len(result['hiring_timelines']),1)
        self.assertIn(result['hiring_timelines'][0]['quote'],original['description'])
        self.assertTrue(all(i['quote'] in original['description'] and i['url']==original['url'] for i in result['technology']))

    def test_urgency_leave_benefits_and_listing_age_do_not_estimate_hiring_speed(self):
        for description in ('Urgently hiring! Immediate joiners. Posted yesterday.',
                            'We offer 25 days annual leave. Interview process includes a coding test.',
                            'Our hiring process includes training for 7 days after joining.'):
            self.assertEqual(build_brief(job(description=description),[],NEWS)['hiring_timelines'],[])

    def test_public_news_is_cached_and_failures_differ_from_empty_results(self):
        calls=[]
        def fetch(company,layoffs):calls.append((company,layoffs));return []
        first=company_news('Example Company',fetch);second=company_news('Example Company',fetch)
        self.assertEqual(len(calls),2);self.assertEqual(first,second);self.assertTrue(first['news']['available'])
        def broken(*args):raise OSError('network unavailable')
        result=company_news('Other Company',broken)
        self.assertFalse(result['news']['available']);self.assertEqual(result['news']['items'],[])
        self.assertNotIn('network unavailable',str(result))

    def test_news_query_is_fixed_host_and_only_public_company_name(self):
        from urllib.parse import urlsplit,parse_qs
        url=news_url('Example & Co',True,True)
        self.assertEqual(urlsplit(url).hostname,'news.google.com')
        self.assertIn('when:90d',parse_qs(urlsplit(url).query)['q'][0])

if __name__=='__main__':unittest.main()

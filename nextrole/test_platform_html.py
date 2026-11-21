import json,unittest
from datetime import datetime,timezone
from urllib.parse import parse_qs,urlsplit
from platform_html import parse_cards,parse_detail,posted_date,search_url,job_url,collect,PageUnavailable
from platform_worker import run,combine
from platform_search import normalize_results

DESCRIPTION='Build AI applications using Python and LangGraph. Minimum 1 year of software development experience. Collaborate with engineers to deliver production services.'
LI='''<ul class="jobs-search__results-list"><li><div class="base-card"><a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/software-engineer-4479117360/?trk=search">Open</a><h3 class="base-search-card__title">Software Engineer : AI</h3><h4 class="base-search-card__subtitle">Apple</h4><span class="job-search-card__location">Bengaluru, India</span><time datetime="2026-11-19">2 days ago</time></div></li></ul>'''
NAUKRI='''<div class="srp-jobtuple-wrapper"><div class="cust-job-tuple"><div class="row1"><a class="title" href="/job-listings-ai-engineer-microsoft-bengaluru-123456789">AI Engineer</a></div><div class="row2"><a class="comp-name">Microsoft</a></div><div class="row3"><span class="expwdth">1-3 Yrs</span><span class="locWdth">Bengaluru, India</span></div><div class="row4"><span class="job-desc">Build AI applications.</span></div><div class="row5"><li class="tag-li">Python</li></div><span class="job-post-day">Recently posted</span></div></div>'''

class PlatformHtmlTests(unittest.TestCase):
 def test_alternative_nested_cards_deduplicate_real_job_ids(self):
  rows=parse_cards('linkedin',LI);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['job_url'],'https://www.linkedin.com/jobs/view/4479117360');self.assertEqual(rows[0]['date_posted'],'2026-11-19')
  nk=parse_cards('naukri',NAUKRI);self.assertEqual(len(nk),1);self.assertEqual(nk[0]['experience_range'],'1-3 Yrs');self.assertNotIn('date_posted',nk[0])
  self.assertIsNone(job_url('linkedin','https://linkedin.com.evil.example/jobs/view/123'));self.assertIsNone(job_url('naukri','https://www.naukri.com/ai-jobs'))
 def test_pages_locations_and_freshness_are_preserved(self):
  plan={'site':'naukri','role':'AI Engineer','city':'Bengaluru','hours_old':48,'remote':True,'offset':40}
  url=search_url(plan);params=parse_qs(urlsplit(url).query);self.assertIn('-jobs-3?',url);self.assertEqual(params['l'],['Bengaluru']);self.assertEqual(params['jobAge'],['2']);self.assertEqual(params['wfhType'],['2'])
  params=parse_qs(urlsplit(search_url({**plan,'site':'linkedin'})).query);self.assertEqual(params['start'],['40']);self.assertEqual(params['f_TPR'],['r172800']);self.assertEqual(params['location'],['Bengaluru, India'])
 def test_unknown_dates_stay_unknown(self):
  for date in ('Recently posted','unknown','a month ago',''):self.assertIsNone(posted_date(date))
  self.assertEqual(posted_date('2 days ago',datetime(2026,11,21,0,tzinfo=timezone.utc)),'2026-11-19')
 def test_detail_text_qualifications_and_expiry_are_original(self):
  row=parse_cards('naukri',NAUKRI)[0]
  html='<script type="application/ld+json">'+json.dumps({'@type':'JobPosting','url':row['job_url'],'description':DESCRIPTION,'datePosted':'2026-11-18','validThrough':'2020-01-01'})+'</script>'
  detail=parse_detail(row,html);self.assertEqual(detail['description'],DESCRIPTION);self.assertEqual(detail['availability_status'],'closed');self.assertEqual(detail['date_posted'],'2026-11-18')
  row=parse_cards('linkedin',LI)[0];detail=parse_detail(row,'<div class="show-more-less-html__markup">'+DESCRIPTION+'</div>');job=normalize_results([detail])[0];self.assertEqual(job['years'],1);self.assertEqual(job['collection_method'],'Public search-page extraction')
 def test_rendered_search_then_detail_collection(self):
  calls=[];renders=[]
  def fetch(url,deadline):
   calls.append(url);return '<html>JavaScript shell</html>' if '/jobs/search/' in url else '<div class="show-more-less-html__markup">'+DESCRIPTION+'</div>'
  result=collect({'site':'linkedin','role':'AI Engineer','city':'Bengaluru','results':10},fetcher=fetch,renderer=lambda *args:(renders.append(args[0]) or LI))
  self.assertEqual(len(result['jobs']),1);self.assertEqual(len(renders),1);self.assertEqual(result['jobs'][0]['description'],DESCRIPTION)
 def test_pagination_preserves_prior_results_on_page_failure(self):
  calls=[]
  def fetch(url,deadline):
   calls.append(url)
   if '/job-listings-' in url:return '<div class="dang-inner-html">'+DESCRIPTION+'</div>'
   if 'pageNo=2' in url:raise PageUnavailable('blocked')
   return NAUKRI
  result=collect({'site':'naukri','role':'AI Engineer','city':'Bengaluru','results':40},fetcher=fetch)
  self.assertEqual(len(result['jobs']),1);self.assertTrue(result['warnings']);self.assertTrue(any('pageNo=2' in url for url in calls))
 def test_network_timeout_can_render_without_retrying_http_blocks(self):
  import urllib.error
  renders=[]
  def fetch(url,deadline):
   if '/jobs/search/' in url:raise TimeoutError()
   return '<div class="show-more-less-html__markup">'+DESCRIPTION+'</div>'
  plan={'site':'linkedin','role':'AI Engineer','city':'Bengaluru','results':10}
  result=collect(plan,fetcher=fetch,renderer=lambda *args:(renders.append(1) or LI));self.assertEqual(len(result['jobs']),1);self.assertEqual(renders,[1])
  with self.assertRaises(PageUnavailable):collect(plan,fetcher=lambda url,*args:(_ for _ in ()).throw(urllib.error.HTTPError(url,429,'rate limited',{},None)),renderer=lambda *args:self.fail('Must not render an HTTP block'))
 def test_production_render_first_uses_real_cards_and_preserves_block_reason(self):
  calls=[]
  def fetch(url,deadline):
   self.assertIn('/jobs/view/',url);return '<div class="show-more-less-html__markup">'+DESCRIPTION+'</div>'
  plan={'site':'linkedin','role':'AI Engineer','city':'Bengaluru','results':10}
  data=collect(plan,fetcher=fetch,renderer=lambda *args:(calls.append(args[0]) or LI),render_first=True)
  self.assertEqual(len(calls),1);self.assertEqual(len(data['jobs']),1)
  with self.assertRaises(PageUnavailable) as raised:collect(plan,fetcher=fetch,renderer=lambda *args:(_ for _ in ()).throw(PageUnavailable('Blocked','http_403')),render_first=True)
  self.assertEqual(raised.exception.reason,'http_403')
 def test_blocked_search_never_uses_renderer_or_template_jobs(self):
  def render(*args):self.fail('Blocked pages must not be retried in a browser')
  with self.assertRaises(PageUnavailable):collect({'site':'naukri','role':'AI Engineer','city':'India'},fetcher=lambda *args:'Access denied - captcha',renderer=render)
  result=run({'site':'naukri','results':10},html_collector=lambda p:(_ for _ in ()).throw(PageUnavailable()),jobspy_runner=lambda p:{'error':'blocked'})
  self.assertIn('error',result);self.assertFalse(result.get('jobs'))
 def test_partial_source_success_and_closed_duplicate_survive(self):
  row={**parse_cards('linkedin',LI)[0],'description':DESCRIPTION}
  result=run({'site':'linkedin','results':10},html_collector=lambda p:{'jobs':[row]},jobspy_runner=lambda p:{'error':'failed'})
  self.assertEqual(len(result['jobs']),1);self.assertTrue(result['warnings'])
  result=combine({'jobs':[row]},{'jobs':[{**row,'job_url':row['job_url']+'?trk=tracking','availability_status':'closed'}]})
  self.assertEqual(len(result['jobs']),1);self.assertEqual(result['jobs'][0]['availability_status'],'closed')

if __name__=='__main__':unittest.main()

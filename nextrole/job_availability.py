"""Explicit vacancy closure evidence. Fetch failures are never closure evidence."""
import json,re,time
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode

REGISTRY=Path(__file__).parent/'dist'/'closed-jobs.json'
CLOSED=re.compile(r'\b(?:not currently accepting applications|no longer accepting applications|applications (?:are|have been) closed|(?:this )?(?:job|position|vacancy) (?:is|has been) (?:closed|filled|expired)|(?:this )?(?:job|position) is no longer available)\b(?!\s+(?:from|for)\b)',re.I)

def availability_key(url):
 try:
  p=urlsplit(url);host=(p.hostname or '').lower()
  if p.scheme!='https' or p.username or p.password:return ''
  if host=='linkedin.com' or host.endswith('.linkedin.com'):
   m=re.search(r'/jobs/view/(?:[^/?]*-)?(\d+)/?$',p.path)
   if m:return 'linkedin:'+m[1]
  if host=='naukri.com' or host.endswith('.naukri.com'):
   m=re.search(r'-(\d{10,})/?$',p.path)
   if m:return 'naukri:'+m[1]
  if host in ('indeed.com','in.indeed.com','www.indeed.com','indeed.co.in'):
   key=dict(parse_qsl(p.query)).get('jk')
   if key:return 'indeed:'+key
  return 'url:'+urlunsplit(('https',p.netloc.lower(),p.path.rstrip('/'),urlencode(sorted((k,v) for k,v in parse_qsl(p.query) if not re.match(r'utm_|^(trk|ref|source)$',k,re.I))),''))
 except (TypeError,ValueError):return ''

@lru_cache(maxsize=4)
def _read_registry(path,mtime):
 try:
  data=json.loads(Path(path).read_text(encoding='utf-8'))
  return {r['key']:r for r in data.get('entries',[]) if r.get('status')=='closed' and isinstance(r.get('key'),str)}
 except (ValueError,OSError,TypeError):return {}

def closed_registry():
 try:return _read_registry(str(REGISTRY),REGISTRY.stat().st_mtime_ns)
 except OSError:return {}

def closure_quote(text):
 # Exclude recommendation widgets; their vacancy status is not this job's.
 text=re.split(r'\b(?:Similar jobs|People also viewed|Recommended jobs)\b',str(text or ''),maxsplit=1,flags=re.I)[0]
 match=CLOSED.search(re.sub(r'\s+',' ',text))
 return match.group(0) if match else ''

def is_unavailable(job,registry=None):
 if job.get('is_expired') is True or job.get('job_is_open') is False or job.get('accepting_applications') is False:return True
 if str(job.get('availability_status') or job.get('job_status') or '').lower() in ('closed','expired','filled','withdrawn','inactive'):return True
 if closure_quote(str(job.get('application_status',''))+'\n'+str(job.get('description',''))):return True
 return availability_key(job.get('url','')) in (closed_registry() if registry is None else registry)

def check_public_page(job):
 """Use existing crawler URL/DNS, robots, redirect and rate protections."""
 from careers_scraper import CareersCrawler,PageParser
 try:
  url=job['url'];crawler=CareersCrawler({'careers_url':url,'company':job.get('company','')},max_pages=2,seconds=12)
  raw,final=crawler._open(url)
  # A redirect to login or a listing page does not establish vacancy status.
  if availability_key(final)!=availability_key(url):return None
  parser=PageParser();parser.feed(raw)
  quote=closure_quote(parser.text)
  if not quote:return None
  return {'key':availability_key(url),'url':url,'status':'closed','checked_at':time.time(),'quote':quote}
 except Exception:return None

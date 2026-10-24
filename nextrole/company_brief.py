"""Source-linked company briefs from public listings and dated news headlines."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
import html
import re
import threading
import time
import urllib.request
from urllib.parse import urlencode, urlsplit
import xml.etree.ElementTree as ET

TECH=['Python','SQL','JavaScript','TypeScript','Java','React','Node.js','FastAPI','Django','PostgreSQL','MongoDB','AWS','Azure','Google Cloud','Docker','Kubernetes','Terraform','Spark','Snowflake','Databricks','PyTorch','TensorFlow','LangChain','LangGraph','Salesforce','SAP']
_cache={};_lock=threading.Lock()

def safe_link(value):
    try:
        p=urlsplit(value)
        return value if p.scheme=='https' and p.hostname and not p.username and not p.password and p.port in (None,443) else None
    except (TypeError,ValueError):return None

def company_key(name):return re.sub(r'\W+',' ',str(name).casefold()).strip()

def news_url(company,layoffs=False,rss=False):
    query='"'+company.replace('"','')+'"'+(' (layoffs OR "job cuts" OR retrenchment) when:90d' if layoffs else ' when:30d')
    return 'https://news.google.com/'+('rss/search?' if rss else 'search?')+urlencode({'q':query,'hl':'en-IN','gl':'IN','ceid':'IN:en'})

def parse_news(data,company,days,now=None):
    if len(data)>1_000_000 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('Unsupported news feed')
    now=now or datetime.now(timezone.utc);items=[];seen=set()
    for item in ET.fromstring(data).findall('./channel/item'):
        title=html.unescape(item.findtext('title','')).strip();link=safe_link(item.findtext('link',''))
        publisher=html.unescape(item.findtext('source','')).strip()
        # Google appends publisher names to titles. A publisher called Notion
        # must not make an unrelated music story look like Notion company news.
        if ' - ' in title and company_key(title.rsplit(' - ',1)[1])==company_key(publisher):title=title.rsplit(' - ',1)[0].strip()
        try:
            date=parsedate_to_datetime(item.findtext('pubDate',''))
            if date.tzinfo is None:continue
            date=date.astimezone(timezone.utc)
        except (ValueError,TypeError,AttributeError):continue
        if not now-timedelta(days=days)<=date<=now+timedelta(minutes=5):continue
        # Headlines must actually mention this employer, not just match a broad feed.
        if not title or not re.search(r'(?<!\w)'+re.escape(company_key(company))+r'(?!\w)',company_key(title)) or not link or title.casefold() in seen:continue
        if days==90 and not re.search(r'layoffs?|job cuts?|retrench',title,re.I):continue
        seen.add(title.casefold())
        items.append({'title':title[:240],'url':link,'publisher':publisher[:100] or 'News source','published_at':date.isoformat()})
    return sorted(items,key=lambda i:i['published_at'],reverse=True)[:3]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def fetch_news(company,layoffs=False):
    request=urllib.request.Request(news_url(company,layoffs,True),headers={'User-Agent':'NextRole-company-brief/1.0','Accept':'application/rss+xml, application/xml'})
    with urllib.request.build_opener(NoRedirect).open(request,timeout=10) as response:data=response.read(1_000_001)
    return parse_news(data,company,90 if layoffs else 30)

def company_news(company,fetcher=fetch_news):
    key=company_key(company)
    with _lock:
        cached=_cache.get(key)
        if cached and cached[0]>time.time():return cached[1]
    def collect(layoffs):
        try:return {'items':fetcher(company,layoffs)[:2 if layoffs else 3],'available':True}
        except Exception:return {'items':[],'available':False}
    with ThreadPoolExecutor(max_workers=2) as pool:news,layoffs=list(pool.map(collect,(False,True)))
    result={'news':news,'layoffs':layoffs,'checked_at':datetime.now(timezone.utc).isoformat()}
    with _lock:
        if len(_cache)>=32:_cache.pop(next(iter(_cache)))
        _cache[key]=(time.time()+(3600 if news['available'] and layoffs['available'] else 300),result)
    return result

def build_brief(job,jobs,news=None):
    company=job['company'];key=company_key(company)
    # Same named employer only. Keep one copy of a cross-posted role/location.
    relevant=[];seen=set()
    for item in [job,*jobs]:
        identity=(company_key(item.get('title','')),company_key(item.get('location','')))
        if company_key(item.get('company',''))==key and identity not in seen and safe_link(item.get('url')):
            seen.add(identity);relevant.append(item)
    technology=[]
    for term in TECH:
        pattern=re.compile(r'(?<![\w])'+re.escape(term)+r'(?![\w])',re.I)
        for item in relevant:
            text=item.get('description','');match=pattern.search(text)
            if match:
                technology.append({'name':term,'quote':text[max(0,match.start()-60):match.end()+100].strip(),'url':item['url'],'role':item['title']});break
        if len(technology)>=8:break
    speed=[]
    # A role's stated timeline is not a company average. Ignore urgency adjectives.
    pattern=re.compile(r'\b(?:hiring|recruitment|interview) process\s*(?:(?:typically )?(?:takes?|lasts?|within|duration)|:)?\s*(?:about |approximately |around |up to )?\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s*(?:business |working )?(?:days|weeks)\b',re.I)
    for item in relevant:
        match=pattern.search(item.get('description',''))
        if match and len(match.group(0))<=400:speed.append({'quote':match.group(0).strip(),'url':item['url'],'role':item['title']})
        if len(speed)>=2:break
    about=''
    for item in relevant:
        if isinstance(item.get('company_description'),str) and item['company_description'].strip():
            about=item['company_description'].strip()[:450];break
    headlines=news if news is not None else company_news(company)
    return {'company':company,'about':about,'overview_url':next((i['url'] for i in relevant if i.get('company_description')),job['url']),
            'listing_count':len(relevant),'locations':list(dict.fromkeys(i.get('location') or 'Not specified' for i in relevant))[:3],
            'roles':list(dict.fromkeys(i['title'] for i in relevant))[:3],'technology':technology,'hiring_timelines':speed,
            'job_url':job['url'],'news_search':news_url(company),'layoff_search':news_url(company,True),**headlines}

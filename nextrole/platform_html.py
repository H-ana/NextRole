"""Public search-page extraction, independently implemented from observed markup.

No generated vacancies, inferred posting dates, credentials or challenge bypass.
"""
import concurrent.futures,json,os,re,sys,time,urllib.request,urllib.error
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlencode,urljoin,urlsplit,urlunsplit

ROOT=Path(__file__).parent
if (ROOT/'.jobspy-deps').exists():sys.path.insert(0,str(ROOT/'.jobspy-deps'))
from bs4 import BeautifulSoup

class PageUnavailable(Exception):
    def __init__(self,message,reason='unavailable'):
        super().__init__(message);self.reason=reason

def job_url(site,value):
    base='https://www.linkedin.com' if site=='linkedin' else 'https://www.naukri.com'
    try:
        p=urlsplit(urljoin(base,value));host=p.hostname or ''
        if p.scheme!='https' or p.username or p.password or p.port not in (None,443):return None
        domain='linkedin.com' if site=='linkedin' else 'naukri.com'
        if host!=domain and not host.endswith('.'+domain):return None
        if site=='linkedin':
            match=re.fullmatch(r'/jobs/view/(?:[\w-]+-)?(\d+)/?',p.path)
            return 'https://www.linkedin.com/jobs/view/'+match.group(1) if match else None
        return urlunsplit(('https','www.naukri.com',p.path,'','')) if p.path.startswith('/job-listings-') else None
    except (ValueError,TypeError):return None

def search_url(plan,offset=None):
    role=plan['role'];city=plan['city'];offset=int(plan.get('offset',0) if offset is None else offset)
    hours=plan.get('hours_old');recent=isinstance(hours,int) and not isinstance(hours,bool) and 1<=hours<=720
    if plan['site']=='linkedin':
        params={'keywords':role,'location':city if city=='India' else city+', India','start':offset}
        if recent:params['f_TPR']='r'+str(hours*3600)
        if plan.get('remote'):params['f_WT']='2'
        ids=plan.get('linkedin_company_ids')
        if isinstance(ids,list) and ids and all(type(i) is int and i>0 for i in ids):params['f_C']=','.join(map(str,ids[:10]))
        return 'https://www.linkedin.com/jobs/search/?'+urlencode(params)
    slug=re.sub(r'[^a-z0-9]+','-',role.lower()).strip('-');page=offset//20+1
    params={'k':role,'l':city,'pageNo':page}
    if recent:params.update(jobAge=max(1,(hours+23)//24),sort='f')
    if plan.get('remote'):params['wfhType']='2'
    return 'https://www.naukri.com/'+slug+'-jobs'+('-'+str(page) if page>1 else '')+'?'+urlencode(params)

def text(node,selector):
    found=node.select_one(selector)
    return found.get_text(' ',strip=True) if found else ''

def posted_date(value,now=None):
    value=str(value or '').strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T[^\s]+)?',value):return value
    today=(now or datetime.now(timezone.utc)).astimezone(timezone(timedelta(hours=5,minutes=30)))
    match=re.fullmatch(r'(\d+)\s*(minutes?|hours?|days?|weeks?)\s+ago',value,re.I)
    if match:
        count=int(match[1]);unit=match[2].lower();delta=timedelta(**{('minutes' if unit.startswith('minute') else 'hours' if unit.startswith('hour') else 'days'):count*(7 if unit.startswith('week') else 1)})
        return (today-delta).date().isoformat()
    if value.lower()=='yesterday':return (today-timedelta(days=1)).date().isoformat()
    if value.lower() in ('today','just now'):return today.date().isoformat()
    return None

def parse_cards(site,html):
    soup=BeautifulSoup(html,'html.parser');rows=[];seen=set()
    selectors=('ul.jobs-search__results-list > li, .base-card, .job-search-card' if site=='linkedin' else '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple')
    for card in soup.select(selectors):
        link=card.select_one('a[href*="/jobs/view/"]' if site=='linkedin' else 'a[href*="/job-listings-"]')
        url=job_url(site,link.get('href','')) if link else None
        if not url or url in seen:continue
        title=text(card,'.base-search-card__title, h3' if site=='linkedin' else 'a.title, .title')
        company=text(card,'.base-search-card__subtitle, h4' if site=='linkedin' else '.comp-name, .companyInfo a')
        location=text(card,'.job-search-card__location' if site=='linkedin' else '.locWdth, .loc-wrap, .location')
        if not title or not company:continue
        row={'site':site,'job_url':url,'title':title,'company':company,'location':location,'description':text(card,'.job-desc, .job-description, .description'),'extraction_method':'public-search-html'}
        if re.search(r'\bremote\b',location,re.I):row['is_remote']=True
        if site=='naukri':
            exp=text(card,'.expwdth, .exp-wrap')
            if exp:row['experience_range']=exp
            skills=[tag.get_text(' ',strip=True) for tag in card.select('.tag-li')]
            if skills:row['description']+='\nSkills listed: '+', '.join(skills)
        date=card.select_one('time');raw=date.get('datetime') if date else text(card,'.job-post-day')
        posted=posted_date(raw)
        if posted:row['date_posted']=posted
        rows.append(row);seen.add(url)
    return rows

def parse_detail(row,html):
    soup=BeautifulSoup(html,'html.parser');result=dict(row)
    visible=soup.get_text(' ',strip=True)
    from job_availability import closure_quote
    quote=closure_quote(visible)
    if quote:return {**result,'availability_status':'closed','description':quote}
    def objects(value):
        if isinstance(value,list):
            for item in value:yield from objects(item)
        elif isinstance(value,dict):
            kind=value.get('@type')
            if kind=='JobPosting' or isinstance(kind,list) and 'JobPosting' in kind:yield value
            yield from objects(value.get('@graph',[]))
    postings=[]
    for script in soup.select('script[type="application/ld+json"]'):
        try:postings.extend(objects(json.loads(script.string or script.get_text())))
        except (ValueError,TypeError):pass
    # A page may embed unrelated recommended vacancies: accept only its own ID.
    for item in postings:
        if item.get('url') and job_url(row['site'],item['url'])!=row['job_url']:continue
        description=BeautifulSoup(str(item.get('description','')),'html.parser').get_text('\n',strip=True)
        if len(description)>=100:result['description']=description
        date=posted_date(item.get('datePosted'))
        if date:result['date_posted']=date
        expiry=item.get('validThrough')
        if expiry:
            try:
                end=datetime.fromisoformat(str(expiry).replace('Z','+00:00'))
                if end.replace(tzinfo=end.tzinfo or timezone.utc)<datetime.now(timezone.utc):result['availability_status']='closed'
            except ValueError:pass
        break
    description=text(soup,'.show-more-less-html__markup, .styles_JDC__dang-inner-html__h0K4t, .dang-inner-html, .job-desc-container, [class*="jobDescription"]')
    if len(description)>=100:result['description']=description
    return result

def fetch_html(url,deadline):
    remaining=deadline-time.monotonic()
    if remaining<.2:raise PageUnavailable('Page collection budget reached.')
    request=urllib.request.Request(url,headers={'User-Agent':'NextRoleJobDiscovery/1.0 (+https://github.com/H-ana/NextRole)','Accept':'text/html','Accept-Language':'en-IN,en;q=0.9'})
    # No proxy, auth session or arbitrary redirects outside the two public sites.
    class Redirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):
            host=urlsplit(newurl).hostname or ''
            if not any(host==d or host.endswith('.'+d) for d in ('linkedin.com','naukri.com')):raise PageUnavailable('Unexpected page redirect.')
            return super().redirect_request(req,fp,code,msg,headers,newurl)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),Redirect())
    with opener.open(request,timeout=min(8,remaining)) as response:
        raw=response.read(4_000_001)
        if len(raw)>4_000_000:raise PageUnavailable('Page exceeded collection size limit.')
        if any(s in response.url for s in ('/authwall','/checkpoint','/login','/uas/')):raise PageUnavailable('Public page requires sign-in.')
        return raw.decode('utf-8','replace')

def rendered_html(url,site,deadline):
    # Only render an ordinary successful HTML shell, never a blocked/challenge page.
    if time.monotonic()>deadline-4:raise PageUnavailable('No time for rendered extraction.')
    if (ROOT/'.local-deps').exists():sys.path.insert(0,str(ROOT/'.local-deps'))
    if (ROOT/'.browsers').exists():os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(ROOT/'.browsers'))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        try:
            context=browser.new_context(service_workers='block')
            def route(r):
                host=urlsplit(r.request.url).hostname or ''
                if r.request.resource_type in ('image','media','font') or not any(host==d or host.endswith('.'+d) for d in ('linkedin.com','licdn.com','naukri.com','naukristatic.com','naukimg.com')):r.abort()
                else:r.continue_()
            context.route('**/*',route);page=context.new_page()
            timeout=max(500,min(12000,int((deadline-time.monotonic())*1000)))
            response=page.goto(url,wait_until='domcontentloaded',timeout=timeout)
            if response and response.status>=400:raise PageUnavailable('Search page unavailable.','http_'+str(response.status))
            page.wait_for_selector('.base-card, .job-search-card' if site=='linkedin' else '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple',timeout=max(500,min(8000,int((deadline-time.monotonic())*1000))))
            return page.content()
        finally:browser.close()

def collect(plan,fetcher=fetch_html,renderer=rendered_html,seconds=35,render_first=False):
    if plan.get('site') not in ('linkedin','naukri'):raise PageUnavailable('Unsupported HTML source.')
    from mnc_employers import mnc_employer
    deadline=time.monotonic()+seconds;rows={};warnings=False;pages=0;reason='unavailable'
    count=max(10,min(60,int(plan.get('results',40))));start=max(0,min(400,int(plan.get('offset',0))));size=25 if plan['site']=='linkedin' else 20
    for offset in range(start,start+count,size):
        try:
            url=search_url(plan,offset)
            try:
                if render_first:
                    try:html=renderer(url,plan['site'],deadline)
                    except ImportError:html=fetcher(url,deadline)
                else:html=fetcher(url,deadline)
            except urllib.error.HTTPError:raise
            except (TimeoutError,urllib.error.URLError):html=renderer(url,plan['site'],deadline)
            if re.search(r'captcha|verify you are human|security verification|access denied|sign in to continue',html,re.I):raise PageUnavailable('Public search requires verification.')
            cards=parse_cards(plan['site'],html)
            if not cards:cards=parse_cards(plan['site'],renderer(url,plan['site'],deadline))
            pages+=1;new=[r for r in cards if r['job_url'] not in rows]
            for row in new:
                if mnc_employer(row):rows[row['job_url']]=row
            if not cards or not new:break
        except Exception as error:
            reason='http_'+str(error.code) if isinstance(error,urllib.error.HTTPError) else getattr(error,'reason',None) or ('timeout' if isinstance(error,TimeoutError) or type(error).__name__=='TimeoutError' else 'page_unavailable')
            warnings=True;break
    # Detail text is required before normal filtering; cards alone may omit qualifications.
    def detail(row):
        try:return parse_detail(row,fetcher(row['job_url'],deadline)),False
        except Exception:return row,True
    jobs=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for row,partial in pool.map(detail,list(rows.values())[:count]):
            warnings=warnings or partial
            if len(row.get('description',''))>=100 or row.get('availability_status')=='closed':jobs.append(row)
    if not jobs and warnings:raise PageUnavailable('Public HTML collection unavailable. Cached listings retained.',reason)
    return {'jobs':jobs,'warnings':warnings,'pages':pages,'method':'public-search-html'}

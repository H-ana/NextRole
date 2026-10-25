"""Source-linked interview research. Email bodies stay local; no model calls."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import html
import re
import threading
import time
import urllib.request
from urllib.parse import urlencode, urlsplit, parse_qs, urljoin
import xml.etree.ElementTree as ET
from careers_scraper import CareersCrawler, PageParser

SITES=('geeksforgeeks.org','leetcode.com','ambitionbox.com','glassdoor.com','indeed.com','interviewbit.com','interviewquery.com','hellointerview.com','amazon.jobs')
CATEGORIES=('Interview invitation','Assessment / next step')

def clean_context(value):
    if not isinstance(value,str):return ''
    if any(c in value for c in ('\n','\r','\t')):return ''
    value=' '.join(value.split()).strip(' -:|')
    # Only public employer/role names become search queries. Never email addresses,
    # links, phone numbers, invitation tokens or arbitrary email paragraphs.
    if not 2<=len(value)<=100 or re.search(r'[@\\<>?=:|\"]|https?:|www\.',value) or sum(c.isdigit() for c in value)>=6 or len(value.split())>14:return ''
    return value

def email_context(subject,body='',application=None):
    if application and application.get('company') and application.get('role'):
        return {'company':clean_context(application['company']),'role':clean_context(application['role'])}
    text=subject+'\n'+body;company='';role=''
    for label,key in [('(?:company|employer|client)','company'),('(?:job title|role|position)','role')]:
        match=re.search(r'(?im)^\s*'+label+r'\s*:\s*([^\n;|]{2,100})$',text)
        if match:
            if key=='company':company=clean_context(match[1])
            else:role=clean_context(match[1])
    # Explicit phrasing only; sender domain and recruiter name are not employers.
    match=re.search(r'(?i)\b(?:interview (?:invitation )?for|for the) ([A-Za-z][A-Za-z0-9 &+().#-]{2,70}?) (?:role |position )?at ([A-Za-z][A-Za-z0-9 &+().-]{1,70}?)(?=[\n.!|]|$)',text)
    if match:
        role=role or clean_context(re.sub(r'\s+(?:role|position)$','',match[1],flags=re.I))
        company=company or clean_context(match[2])
    return {'company':company,'role':role}

def source_url(value):
    try:
        p=urlsplit(value);host=(p.hostname or '').lower()
        return value if p.scheme=='https' and not p.username and not p.password and p.port in (None,443) and any(host==s or host.endswith('.'+s) for s in SITES) else None
    except (ValueError,TypeError):return None

ROLE_FAMILIES=(
 ('Software Development Engineer',('sde','swe','software development engineer','software engineer','software developer')),
 ('Machine Learning Engineer',('ml engineer','machine learning engineer')),
 ('Quality Assurance Engineer',('qa engineer','quality assurance engineer','software test engineer')),
 ('Site Reliability Engineer',('sre','site reliability engineer')),
 ('Business Intelligence Engineer',('bie','business intelligence engineer')),
)

def role_variants(role):
    value=re.sub(r'\s+',' ',role).strip()
    normalized_role=re.sub(r'\b(sde|swe)\s*-?\s*(?:iii|ii|i|[123])\b',r'\1',value,flags=re.I)
    for canonical,aliases in ROLE_FAMILIES:
        if any(word_match(alias,normalized_role) for alias in aliases):return list(dict.fromkeys([value,canonical,*aliases]))
    return [value]

def matches_role(role,text):
    variants=role_variants(role)
    if len(variants)>1:return any(word_match(alias,text) for alias in variants[1:]) or word_match(role,text)
    terms=[t for t in re.findall(r'[A-Za-z][A-Za-z+#.]*',role) if t.lower() not in ('senior','junior','lead','staff','principal','ii','iii','the','and','of','at')]
    return bool(terms) and sum(word_match(t,text) for t in terms)>=max(1,min(2,len(terms)))

def search_links(company,role):
    variants=role_variants(role)
    role_query='('+ ' OR '.join('"'+v+'"' for v in variants[:3])+')'
    query=f'"{company}" {role_query} interview experience questions'
    return [{'name':name,'url':'https://www.google.com/search?'+urlencode({'q':query+' site:'+site})} for name,site in [('GeeksforGeeks','geeksforgeeks.org'),('LeetCode discussions','leetcode.com'),('AmbitionBox','ambitionbox.com'),('Glassdoor','glassdoor.com')]]

def seed_sources(company,role):
    # Verified public starting points; fetched and validated like every discovered
    # page. This catalog contains URLs, not prewritten or invented interview claims.
    if company.casefold()=='amazon' and 'Software Development Engineer' in role_variants(role):
        return [
          {'url':'https://www.amazon.jobs/content/en-gb/how-we-hire/interview-prep/software-development-topics','title':'Amazon software development interview topics','official':True},
          {'url':'https://www.geeksforgeeks.org/interview-experiences/amazon-sde-2025-interview/','title':'Amazon SDE 2025 interview'},
          {'url':'https://www.geeksforgeeks.org/interview-experiences/amazon-interview-experience-for-sde-1-18/','title':'Amazon Interview Experience for SDE-1'},
        ]
    return []

def rss_search(query):
    req=urllib.request.Request('https://www.bing.com/search?'+urlencode({'format':'rss','q':query}),headers={'User-Agent':'NextRoleInterviewPrep/2.0','Accept':'application/rss+xml'})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    with urllib.request.build_opener(NoRedirect).open(req,timeout=8) as response:data=response.read(1_000_001)
    if len(data)>1_000_000 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():return []
    return [{'url':url,'title':item.findtext('title','')[:240]} for item in ET.fromstring(data).findall('./channel/item') if (url:=source_url(item.findtext('link','')))]

def html_search(query):
    url='https://html.duckduckgo.com/html/?'+urlencode({'q':query})
    crawler=CareersCrawler({'careers_url':url},max_pages=1,seconds=15)
    raw,_=crawler._open(url);parser=PageParser();parser.feed(raw);items=[]
    for href,title in parser.links:
        target=urljoin(url,href);target=parse_qs(urlsplit(target).query).get('uddg',[target])[0]
        if source_url(target):items.append({'url':target,'title':title[:240]})
    return items

def diversify(items,limit=12):
    unique=[];seen=set();counts={}
    for item in items:
        url=source_url(item.get('url'))
        if not url or url in seen:continue
        host=next((site for site in SITES if urlsplit(url).hostname==site or urlsplit(url).hostname.endswith('.'+site)),'')
        if counts.get(host,0)>=4:continue
        seen.add(url);counts[host]=counts.get(host,0)+1;unique.append(item)
        if len(unique)>=limit:break
    return unique

def discover(company,role,expanded=False):
    variants=role_variants(role);canonical=variants[1] if len(variants)>1 else role
    queries=[f'"{company}" {role} interview experience',f'"{company}" "{canonical}" interview questions',
             f'site:geeksforgeeks.org/interview-experiences/ "{company}" {role} interview',
             f'site:leetcode.com "{company}" "{canonical}" interview experience']
    if expanded:queries=[f'"{company}" "{canonical}" interview rounds',f'"{company}" {role} interview questions site:interviewbit.com',f'"{company}" {role} interview site:interviewquery.com']
    def collect(query):
        try:return (html_search if expanded else rss_search)(query)
        except Exception:return []
    items=seed_sources(company,role) if not expanded else []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for batch in pool.map(collect,queries):items.extend(batch)
    return diversify(items)

class ArticleParser(PageParser):
    def __init__(self):super().__init__();self.published=''
    def handle_starttag(self,tag,attrs):
        super().handle_starttag(tag,attrs)
        a=dict(attrs)
        if tag=='meta' and (a.get('property') or a.get('name')) in ('article:published_time','datePublished','date'):
            value=a.get('content','')
            if re.match(r'^20\d{2}-\d{2}-\d{2}',value):self.published=value[:10]

class ArticleScope(HTMLParser):
    """Prefer article/main content so navigation questions do not become evidence."""
    def __init__(self):super().__init__();self.depth={'main':0,'article':0};self.buffers={'main':[],'article':[]}
    def add(self,value):
        for key in self.depth:
            if self.depth[key]:self.buffers[key].append(value)
    def handle_starttag(self,tag,attrs):
        if tag in self.depth:self.depth[tag]+=1
        self.add(self.get_starttag_text())
    def handle_startendtag(self,tag,attrs):self.add(self.get_starttag_text())
    def handle_endtag(self,tag):
        self.add('</'+tag+'>')
        if tag in self.depth:self.depth[tag]=max(0,self.depth[tag]-1)
    def handle_data(self,data):self.add(html.escape(data))
    def content(self):
        for key in ('article','main'):
            value=''.join(self.buffers[key])
            if len(value)>200:return value
        return ''

def word_match(term,text):
    return bool(re.search(r'(?<!\w)'+re.escape(term)+r'(?!\w)',text,re.I))

def read_source(item,company,role):
    url=source_url(item.get('url'))
    if not url:return None
    crawler=CareersCrawler({'careers_url':url},max_pages=1,seconds=22)
    raw,final=crawler._open(url)
    if not source_url(final):return None
    parser=ArticleParser();parser.feed(raw)
    title=parser.headings[0] if parser.headings else item.get('title','')
    scope=ArticleScope();scope.feed(raw)
    body=PageParser();body.feed(scope.content() or raw)
    text=body.text
    # Some publishers put site navigation inside <main>. Start at the actual
    # article heading so generic tutorial menus cannot consume the excerpt budget.
    heading_at=text.casefold().find(title.casefold())
    if heading_at>=0:text=text[heading_at:]
    # Match inside article text as well as its title; broad search results alone
    # never establish company/role relevance.
    if not word_match(company,title+' '+text[:12000]):return None
    if not matches_role(role,title+' '+text[:16000]):return None
    lines=[]
    for line in text.splitlines():
        # Split long article paragraphs at sentence boundaries, preserving actual
        # source text instead of dropping every paragraph over 350 characters.
        lines.extend(part.strip() for part in re.split(r'(?<=[.?!])\s+',line) if 12<=len(part.strip())<=350)
    # At most 85 source words per page, then a per-publisher budget in build_guide.
    questions=[];patterns=[];words=0
    for line in lines:
        if re.search(r'\b(?:tutorials?|courses?|explore|subscribe|sign in|log in)\b',line,re.I) and '?' not in line:continue
        question=('?' in line or re.match(r'(?i)^(?:q\d*[).:]|implement |write (?:a |an )|design (?:a |an )|find (?:the |a )|explain |given (?:a |an ))',line))
        pattern=re.search(r'(?i)\b(?:round [1-9]|[1-9] (?:technical |interview )?rounds|online assessment|coding round|system design|technical interview|hiring manager|hr round|behavio(?:ral|ural)|leadership principles|data structures|algorithms|interview loop)\b',line)
        target=questions if question else patterns if pattern else None
        if target is None or len(target)>=5 or words+len(line.split())>85:continue
        target.append(line);words+=len(line.split())
    # Problem titles are often links rather than question sentences.
    for href,label in body.links:
        if re.search(r'/(?:dsa|problems)/',href) and 12<=len(label)<=180 and label not in questions and label in text and not re.search(r'\b(?:tutorials?|courses?|explore|practice problems|all problems)\b',label,re.I):
            count=len(label.split())
            if len(questions)<5 and words+count<=85:questions.append(label);words+=count
    if not questions and not patterns:return None
    years=sorted({year for year in re.findall(r'\b20[12]\d\b',title) if int(year)<=datetime.now().year})
    return {'title':title[:240],'url':final,'publisher':urlsplit(final).hostname,'published':parser.published,'reported_year':years[-1] if years else '',
            'questions':questions,'patterns':patterns,'kind':'Official employer guidance' if item.get('official') else 'Candidate-reported experience' if ('interview experience' in title.casefold() or re.search(r'(?i)\b(?:I (?:was interviewed|interviewed|applied|appeared|attended)|my interview|my experience|target position:)\b',text[:16000])) else 'Preparation article','role_match':'Related role; verify level and location'}

def practice(role):
    technical=bool(re.search(r'(?i)engineer|developer|sde|swe|programmer|data scientist|machine learning|\bai\b',role))
    items=[{'area':'Role and project discussion','tasks':['Prepare a two-minute introduction tied to this role.','Choose two genuine projects: explain your contribution, decisions, trade-offs and measured outcomes.']},
           {'area':'Behavioral interview','tasks':['Prepare STAR examples for teamwork, disagreement, mistakes and ownership.','Prepare questions about the team, success measures and the next interview stages.']}]
    if technical:items.insert(0,{'area':'DSA practice · general, not confirmed company questions','tasks':['Arrays, strings and hash maps: two-sum, frequency counting, sliding window.','Trees and graphs: traversals, BFS/DFS and shortest-path basics.','Sorting, binary search and complexity analysis; explain edge cases while coding.']})
    if re.search(r'(?i)data|analyst|sql|analytics',role):items.insert(0,{'area':'Data and SQL practice','tasks':['Practice joins, window functions, aggregation and data-quality checks.','Explain a real analysis, validation approach and business outcome.']})
    if re.search(r'(?i)\bai\b|machine learning|ml engineer',role):items.insert(0,{'area':'AI / ML practice','tasks':['Explain evaluation, data leakage, deployment and failure monitoring.','For LLM work, review retrieval, tool use, hallucination evaluation and latency/cost trade-offs.']})
    return items

def build_guide(company,role,discovery=None,reader=None,expansion=None):
    company=clean_context(company);role=clean_context(role)
    if not company or not role:raise ValueError('Confirm the company and role before preparing the guide.')
    default_discovery=discovery is None
    discovery=discovery or discover;reader=reader or read_source
    candidates=diversify(discovery(company,role));sources=[];budgets={};attempted=set()
    def read(item):
        attempted.add(item['url'])
        try:return reader(item,company,role)
        except Exception:return None
    with ThreadPoolExecutor(max_workers=4) as pool:
        for source in pool.map(read,candidates):
            if not source:continue
            domain=next((s for s in SITES if source['publisher']==s or source['publisher'].endswith('.'+s)),source['publisher'])
            budget=100-budgets.get(domain,0)
            for key in ('questions','patterns'):
                kept=[]
                for line in source[key]:
                    count=len(line.split())
                    if count<=budget:kept.append(line);budget-=count
                source[key]=kept
            budgets[domain]=100-budget
            if source['questions'] or source['patterns']:sources.append(source)
    # Expand after unsuccessful reads, not merely after a search returned zero URLs.
    if len(sources)<2 and (default_discovery or expansion is not None):
        extra=[item for item in (expansion(company,role) if expansion else discover(company,role,expanded=True)) if item['url'] not in attempted]
        candidates=diversify([*candidates,*extra],20)
        with ThreadPoolExecutor(max_workers=4) as pool:
            for source in pool.map(read,extra[:8]):
                if source:
                    domain=next((site for site in SITES if source['publisher']==site or source['publisher'].endswith('.'+site)),source['publisher'])
                    budget=100-budgets.get(domain,0)
                    for key in ('questions','patterns'):
                        kept=[]
                        for line in source[key]:
                            count=len(line.split())
                            if count<=budget:kept.append(line);budget-=count
                        source[key]=kept
                    budgets[domain]=100-budget
                    if source['questions'] or source['patterns']:sources.append(source)
    readable={source['url'] for source in sources}
    resources=[{**item,'publisher':urlsplit(item['url']).hostname} for item in candidates if item['url'] not in readable and word_match(company,item.get('title','')) and matches_role(role,item.get('title',''))][:6]
    sources.sort(key=lambda s:s.get('reported_year') or s.get('published') or '',reverse=True)
    return {'company':company,'role':role,'checked_at':datetime.now(timezone.utc).isoformat(),'sources':sources[:6],
            'resources':resources,'practice':practice(role),'search_links':search_links(company,role),
            'coverage':'Published experiences can differ by year, seniority and location. These are preparation leads, not guaranteed interview questions.',
            'research_status':'Sources collected' if sources else 'No readable company-and-role reports found. Use the source searches below; some sites limit automated access.'}

class InterviewResearch:
    def __init__(self,builder=build_guide):self.builder=builder;self.cache={};self.lock=threading.Lock();self.active=0
    def request(self,company,role,force=False):
        company=clean_context(company);role=clean_context(role)
        if not company or not role:raise ValueError('Enter a company and job title (2–100 characters each).')
        key=(company.casefold(),role.casefold())
        with self.lock:
            entry=self.cache.get(key)
            if entry and (entry['state']=='researching' or (not force and entry.get('expires',0)>time.time())):return dict(entry)
            if self.active>=2:raise ValueError('Two guides are being researched. Try again shortly.')
            if len(self.cache)>=50:
                old=next((k for k,v in self.cache.items() if v['state']!='researching'),None)
                if old:self.cache.pop(old)
            entry={'state':'researching','company':company,'role':role,'updated':time.time()};self.cache[key]=entry;self.active+=1
        def work():
            try:
                guide=self.builder(company,role)
                result={**entry,'state':'ready','guide':guide,'updated':time.time(),'expires':time.time()+(86400 if guide.get('sources') else 300)}
            except Exception:result={**entry,'state':'error','error':'Research is unavailable. Try again shortly.','updated':time.time(),'expires':time.time()+60}
            finally:
                with self.lock:
                    self.cache[key]=result;self.active-=1
        threading.Thread(target=work,daemon=True,name='interview-research').start()
        return dict(entry)

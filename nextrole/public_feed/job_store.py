"""Public careers-page ingestion and persistent cache. Never stores applicant documents."""
import concurrent.futures
from contextlib import contextmanager
import hashlib
import html
from html.parser import HTMLParser
import json
import re
import sqlite3
import threading
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from mnc_employers import mnc_employer
from experience_policy import requirement as experience_band, assess as assess_experience, VERSION as EXPERIENCE_POLICY
from semantic_search import ENCODER, MODEL_VERSION, chunks, lexical_scores, semantic_score

ROOT = Path(__file__).parent
REFRESH_SECONDS = 900


def safe_url(value):
    if not isinstance(value, str):
        return None
    parsed = urlsplit(value)
    return value if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password else None


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'):self.skip+=1
        if tag in ('p','div','li','br','h1','h2','h3'):self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script','style'):self.skip=max(0,self.skip-1)
        if tag in ('p','div','li','h1','h2','h3'):self.parts.append('\n')
    def handle_data(self, data):
        if not self.skip:self.parts.append(data)


def plain_text(value):
    parser=TextParser();parser.feed(html.unescape(str(value or '')))
    return re.sub(r'\n\s*\n+', '\n', ''.join(parser.parts)).strip()


def experience_requirement(description):
    band=experience_band(description)
    return (band['minimum'],band['quote']) if band['status']=='known' else (None,'')


def source_key(source):
    return source['provider']+':'+source.get('board',source.get('id',''))


def feed_url(source):
    board=source['board']
    if not re.fullmatch(r'[A-Za-z0-9_-]+',board):raise ValueError('Invalid board identifier')
    provider=source['provider']
    if provider=='greenhouse':return f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true'
    if provider=='ashby':return f'https://api.ashbyhq.com/posting-api/job-board/{board}'
    if provider=='lever':return f'https://api.lever.co/v0/postings/{board}?mode=json'
    raise ValueError('Unsupported provider')


def fetch_source(source):
    if source['provider'] in ('manual','platform'):return None
    if source['provider'] in ('careers','restricted'):
        from careers_scraper import scrape_source
        return scrape_source(source)
    request=urllib.request.Request(feed_url(source),headers={'Accept':'application/json','User-Agent':'NextRole-public-job-reader/1.0'})
    with urllib.request.urlopen(request,timeout=25) as response:
        raw=response.read(30_000_001)
    if len(raw)>30_000_000:raise ValueError('Feed exceeds supported size')
    return normalize_feed(source,json.loads(raw))


def normalize_feed(source,payload):
    provider=source['provider']
    items=payload if provider=='lever' else payload.get('jobs') if isinstance(payload,dict) else None
    if not isinstance(items,list):raise ValueError('Invalid job feed')
    result=[]
    for item in items:
        if not isinstance(item,dict):raise ValueError('Invalid job record')
        if provider=='greenhouse':
            if 'internal_job_id' in item and item['internal_job_id'] is None:continue
            title=item.get('title');location=(item.get('location') or {}).get('name','Location not specified')
            url=item.get('absolute_url');description=plain_text(item.get('content'));style='unknown'
        elif provider=='ashby':
            if item.get('isListed') is False:continue
            title=item.get('title');location='; '.join([item.get('location','')]+[x.get('location','') for x in item.get('secondaryLocations',[])])
            url=item.get('applyUrl') or item.get('jobUrl');description=item.get('descriptionPlain') or plain_text(item.get('descriptionHtml'))
            style={'remote':'Remote','hybrid':'Hybrid','onsite':'On-site','on-site':'On-site'}.get(str(item.get('workplaceType','')).lower(),'Remote' if item.get('isRemote') else 'unknown')
        else:
            title=item.get('text');location=(item.get('categories') or {}).get('location','Location not specified')
            url=item.get('applyUrl') or item.get('hostedUrl')
            description='\n'.join([item.get('descriptionPlain') or plain_text(item.get('description'))]+[str(x.get('text',''))+'\n'+plain_text(x.get('content')) for x in item.get('lists',[])]+[item.get('additionalPlain') or plain_text(item.get('additional'))])
            style={'remote':'Remote','hybrid':'Hybrid','onsite':'On-site'}.get(item.get('workplaceType'),'unknown')
        if not isinstance(title,str) or not isinstance(description,str):raise ValueError('Incomplete job record')
        if not safe_url(url):continue
        if not description.strip():raise ValueError('Job description unavailable; retaining previous source cache')
        if len(description)>80000:raise ValueError('Job description exceeds supported size')
        if style=='unknown':style='Hybrid' if re.search(r'\bhybrid\b',location,re.I) else 'Remote' if re.search(r'\bremote\b',location,re.I) else 'unknown'
        years,quote=experience_requirement(description)
        result.append({'id':source_key(source)+':'+str(item.get('id') or hashlib.sha256(url.encode()).hexdigest()[:20]),'company':source['company'],'title':title,'location':location,'style':style,'description':description,'url':url,'years':years,'experience_quote':quote,'skills':[],'source':source_key(source)})
    return result


CITY_ALIASES={'Bengaluru':['bengaluru','bangalore'],'Gurugram':['gurugram','gurgaon'],'New Delhi':['new delhi','delhi'],'Mumbai':['mumbai','bombay'],'Kolkata':['kolkata','calcutta'],'Kochi':['kochi','cochin'],'Thiruvananthapuram':['thiruvananthapuram','trivandrum']}


def location_matches(location,cities):
    normalized=re.sub(r'[^a-z0-9]+',' ',location.lower())
    return not cities or any(re.search(r'\b'+re.escape(alias)+r'\b',normalized) for city in cities for alias in CITY_ALIASES.get(city,[city.lower()]))


class JobStore:
    def __init__(self,path=None,sources=None,encoder=ENCODER):
        self.path=Path(path or ROOT/'data'/'jobs.sqlite3');self.path.parent.mkdir(parents=True,exist_ok=True)
        self.sources=sources if sources is not None else json.loads((ROOT/'job_sources.json').read_text(encoding='utf-8'))
        self.encoder=encoder;self.refresh_lock=threading.Lock();self.index_lock=threading.Lock();self.indexing=False;self.refreshing=False
        with self.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,source TEXT NOT NULL,payload TEXT NOT NULL,content_hash TEXT NOT NULL,last_seen REAL NOT NULL,active INTEGER NOT NULL,vector TEXT,vector_version TEXT);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY,last_attempt REAL,last_success REAL,error TEXT);''')
            if 'note' not in [r['name'] for r in db.execute('PRAGMA table_info(sources)')]:db.execute('ALTER TABLE sources ADD COLUMN note TEXT')
            if 'cursor' not in [r['name'] for r in db.execute('PRAGMA table_info(sources)')]:db.execute('ALTER TABLE sources ADD COLUMN cursor INTEGER NOT NULL DEFAULT 0')
            from posting_history import initialize
            initialize(db)
        self.repair_cached_locations()

    def repair_cached_locations(self):
        """Recover explicit page-header locations without changing freshness or vectors."""
        from careers_scraper import visible_location
        repaired=0
        with self.connect() as db:
            rows=db.execute("SELECT id,payload FROM jobs WHERE active=1 AND source LIKE 'careers:%'").fetchall()
            for row in rows:
                job=json.loads(row['payload'])
                if job.get('location') not in (None,'','Location not specified'):continue
                location=visible_location(job['title'],job['description'])
                if not location:continue
                job['location']=location
                if job.get('style')=='unknown':job['style']='Hybrid' if re.search(r'\bhybrid\b',location,re.I) else 'Remote' if re.search(r'\bremote\b',location,re.I) else 'unknown'
                repaired+=db.execute('UPDATE jobs SET payload=? WHERE id=? AND payload=?',(json.dumps(job),row['id'],row['payload'])).rowcount
        return repaired

    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=10);db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()

    def update_source(self,source,jobs,now=None,complete=True,note=None,next_cursor=None):
        jobs=list(jobs)
        now=time.time() if now is None else now;key=source_key(source)
        with self.connect() as db:
            if complete:db.execute('UPDATE jobs SET active=0 WHERE source=?',(key,))
            else:db.execute('UPDATE jobs SET active=0 WHERE source=? AND last_seen<?',(key,now-(30*86400 if source['provider']=='manual' else 7*86400 if source['provider']=='careers' else 86400)))
            for job in jobs:
                digest=hashlib.sha256((job['title']+'\n'+job['description']).encode()).hexdigest()
                db.execute('''INSERT INTO jobs(id,source,payload,content_hash,last_seen,active) VALUES(?,?,?,?,?,1)
ON CONFLICT(id) DO UPDATE SET source=excluded.source,payload=excluded.payload,last_seen=excluded.last_seen,active=1,
vector=CASE WHEN jobs.content_hash=excluded.content_hash THEN jobs.vector ELSE NULL END,
vector_version=CASE WHEN jobs.content_hash=excluded.content_hash THEN jobs.vector_version ELSE NULL END,content_hash=excluded.content_hash''',(job['id'],key,json.dumps(job),digest,now))
            from posting_history import record,WINDOW
            record(db,jobs,now)
            db.execute('DELETE FROM posting_history WHERE last_observed<?',(now-WINDOW,))
            db.execute('INSERT INTO sources(id,last_attempt,last_success,error,note) VALUES(?,?,?,NULL,?) ON CONFLICT(id) DO UPDATE SET last_attempt=excluded.last_attempt,last_success=excluded.last_success,error=NULL,note=excluded.note',(key,now,now,note))
            if next_cursor is not None:db.execute('UPDATE sources SET cursor=? WHERE id=?',(max(0,int(next_cursor)),key))

    def refresh(self,fetcher=fetch_source,max_sources=None,force=False):
        if not self.refresh_lock.acquire(blocking=False):return
        self.refreshing=True
        try:
            with self.connect() as db:states={r['id']:dict(r) for r in db.execute('SELECT id,cursor,last_attempt FROM sources')}
            selected=self.sources
            if max_sources is not None:
                now=time.time();due=[]
                for source in self.sources:
                    if source['provider'] in ('manual','platform'):continue
                    last=states.get(source_key(source),{}).get('last_attempt') or 0
                    interval=6*3600 if source.get('catalog') else REFRESH_SECONDS
                    if force or now-last>=interval:due.append(source)
                due.sort(key=lambda s:(states.get(source_key(s),{}).get('last_attempt') or 0,-s.get('priority',0)))
                ordinary=[s for s in due if not s.get('catalog')][:min(3,max_sources)]
                selected=ordinary+[s for s in due if s not in ordinary][:max(0,max_sources-len(ordinary))]
            from careers_scraper import scraping_mode
            with concurrent.futures.ThreadPoolExecutor(max_workers=3 if scraping_mode()=='browser' else 6) as pool:
                futures={pool.submit(fetcher,{**source,'scan_offset':states.get(source_key(source),{}).get('cursor',0)} if source.get('provider')=='careers' else source):source for source in selected}
                for future in concurrent.futures.as_completed(futures):
                    source=futures[future];key=source_key(source)
                    try:
                        result=future.result()
                        if result is None and source['provider'] in ('manual','platform'):continue
                        from careers_scraper import CrawlResult
                        if isinstance(result,CrawlResult):self.update_source(source,result.jobs,complete=result.complete,note=result.note,next_cursor=result.next_cursor)
                        else:self.update_source(source,result)
                    except Exception as error:
                        from careers_scraper import CrawlError
                        message=str(error) if isinstance(error,CrawlError) else 'Source unavailable. Previous cached listings retained.'
                        with self.connect() as db:
                            db.execute('INSERT INTO sources(id,last_attempt,error) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET last_attempt=excluded.last_attempt,error=excluded.error',(key,time.time(),message))
            # Bound historical public data; closed jobs are never returned by search.
            with self.connect() as db:db.execute('DELETE FROM jobs WHERE active=0 AND last_seen<?',(time.time()-7*86400,))
        finally:self.refreshing=False;self.refresh_lock.release()

    def request_refresh(self):
        if self.refreshing:return
        def work():
            self.refresh(max_sources=18,force=True);self.build_index()
        threading.Thread(target=work,daemon=True,name='public-job-refresh').start()

    def import_platform_job(self,body):
        from careers_scraper import make_job
        from urllib.parse import urlunsplit,parse_qsl,urlencode
        from platform_search import platform_for_url
        url=body.get('url','');p=urlsplit(url)
        host=(p.hostname or '').lower()
        platform=(platform_for_url(url) or '').lower()
        if not platform:raise ValueError('Use a direct supported platform job URL.')
        source=next((s for s in self.sources if s['provider']=='manual' and s.get('id')==platform),None)
        if not source:raise ValueError('This job source is not configured.')
        values={k:body.get(k,'') for k in ('company','title','location','description')}
        if any(not isinstance(v,str) for v in values.values()) or not values['company'].strip() or len(values['company'])>200 or len(values['location'])>500:raise ValueError('Invalid job details.')
        identifiers={'indeed':{'jk'},'glassdoor':{'jl','jobListingId'},'ziprecruiter':{'jid','lvk'},'bdjobs':{'id','Id','ID'}}
        query=urlencode([(k,v) for k,v in parse_qsl(p.query) if k in identifiers.get(platform,set())])
        clean_url=urlunsplit((p.scheme,p.netloc,p.path,query,''))
        job=make_job({**source,'company':values['company'].strip()},values['title'].strip(),values['description'].strip(),values['location'].strip(),clean_url,collection_method='Added by you',scraped_from=None)
        if not job:raise ValueError('Provide a job title and a full job description (100–80,000 characters).')
        self.update_source(source,[job],complete=False,note='Added by you; verify that the opening is still available on the original page.')
        threading.Thread(target=self.build_index,daemon=True,name='imported-job-index').start()
        return job

    def build_index(self):
        if not self.index_lock.acquire(blocking=False):return
        self.indexing=True
        try:
            if not self.encoder.load():return
            with self.connect() as db:
                rows=db.execute('SELECT id,payload,content_hash FROM jobs WHERE active=1 AND (vector IS NULL OR vector_version IS NOT ?)',(MODEL_VERSION,)).fetchall()
            for row in rows:
                job=json.loads(row['payload'])
                if job['source'] not in {source_key(s) for s in self.sources}:continue
                vectors=self.encoder.encode(chunks(job['title']+'\n'+job['description']))
                with self.connect() as db:
                    db.execute('UPDATE jobs SET vector=?,vector_version=? WHERE id=? AND content_hash=?',(json.dumps(vectors),MODEL_VERSION,row['id'],row['content_hash']))
        finally:self.indexing=False;self.index_lock.release()

    def snapshot(self):
        valid={source_key(s) for s in self.sources}
        with self.connect() as db:
            rows=db.execute('SELECT payload,last_seen FROM jobs WHERE active=1 ORDER BY id').fetchall()
            states={r['id']:dict(r) for r in db.execute('SELECT * FROM sources')}
            indexed=db.execute('SELECT count(*) FROM jobs WHERE active=1 AND vector IS NOT NULL AND vector_version=?',(MODEL_VERSION,)).fetchone()[0]
        jobs=[];seen=set()
        for row in rows:
            job=json.loads(row['payload'])
            if job['source'] not in valid or job['url'] in seen or (job['source'].startswith(('careers:','platform:')) and row['last_seen']<time.time()-86400) or (job['source'].startswith('manual:') and row['last_seen']<time.time()-30*86400):continue
            seen.add(job['url']);job['last_checked']=row['last_seen'];jobs.append(job)
        from posting_history import annotate
        with self.connect() as db:annotate(db,jobs)
        sources=[{**s,**states.get(source_key(s),{'last_success':None,'error':None})} for s in self.sources]
        success=[s['last_success'] for s in sources if s.get('last_success')]
        return {'jobs':jobs,'last_updated':max(success,default=None),'refreshing':self.refreshing,'refresh_interval_seconds':REFRESH_SECONDS,'collection_scheduler_seconds':60,'catalog_refresh_seconds':6*3600,'stale':not success or time.time()-min(success)>REFRESH_SECONDS*2,'sources':sources,'semantic':{**self.encoder.status(),'indexed':indexed,'indexing':self.indexing}}

    def search(self,body):
        resume=body.get('resume','');preferences=body.get('preferences',{})
        if not isinstance(resume,str) or len(resume)>60000 or not isinstance(preferences,dict):raise ValueError('Invalid search inputs')
        cities=preferences.get('cities',[]);style=preferences.get('workstyle','any');years=float(preferences.get('experience',0))
        if not isinstance(cities,list) or any(not isinstance(c,str) for c in cities) or not 0<=years<=80 or style not in ('any','Remote','Hybrid','On-site'):raise ValueError('Invalid preferences')
        limit=int(body.get('limit',50))
        if not 1<=limit<=200:raise ValueError('Use a result limit from 1 to 200')
        snapshot=self.snapshot();eligible=[];gaps=[];excluded_location=0;excluded_style=0;unknown_location=0;excluded_employer=0;unknown_experience=0
        for job in snapshot['jobs']:
            if not mnc_employer(job):excluded_employer+=1;continue
            if style!='Remote' and not location_matches(job['location'],cities):
                excluded_location+=1
                if job['location'] in ('','Location not specified'):unknown_location+=1
                continue
            if style!='any' and job['style'] not in (style,'unknown'):excluded_style+=1;continue
            band=experience_band(job.get('description',''));fit=assess_experience(band,years)
            if fit is None:
                if band['status']=='unknown':unknown_experience+=1
                else:gaps.append(job)
                continue
            job={**job,'years':band['minimum'],'experience_quote':band['quote'],'experience_requirement':band,'experience_match':fit}
            eligible.append(job)
        # Original resume supplies the evidence. An untrusted client summary cannot add qualifications.
        query=resume+'\n'+str(preferences.get('target_roles',''))
        lexical=lexical_scores(query,eligible)
        vectors={}
        # Browse does not need model loading or every historical job vector.
        if query.strip() and eligible:
            with self.connect() as db:
                ids=[job['id'] for job in eligible]
                for start in range(0,len(ids),500):
                    batch=ids[start:start+500]
                    placeholders=','.join('?' for _ in batch)
                    for row in db.execute(f'SELECT id,vector FROM jobs WHERE active=1 AND vector IS NOT NULL AND vector_version=? AND id IN ({placeholders})',(MODEL_VERSION,*batch)):
                        vectors[row['id']]=json.loads(row['vector'])
        semantic_ready=bool(query.strip()) and bool(eligible) and all(job['id'] in vectors for job in eligible) and self.encoder.load()
        query_vectors=self.encoder.query_vectors(query) if semantic_ready else None
        ranked=[]
        for job,lexical_score in zip(eligible,lexical):
            semantic=semantic_score(query_vectors,vectors[job['id']]) if query_vectors is not None and job['id'] in vectors else None
            rank=.8*semantic+.2*lexical_score if semantic is not None else lexical_score
            ranked.append({**job,'relevance_score':round(rank*100) if query.strip() else None,'semantic_score':round(semantic*100) if semantic is not None else None,'ranking_method':('semantic + full-text' if semantic is not None else 'full-text') if query.strip() else None,'qualification_status':'Not reviewed','preference_notes':(['Work style not confirmed by listing'] if job['style']=='unknown' else [])+(['Experience requirement not confirmed'] if job['years'] is None else [])})
        ranked.sort(key=lambda j:j['relevance_score'] if j['relevance_score'] is not None else -1,reverse=True)
        return {**snapshot,'jobs':ranked[:limit],'employer_policy':'mnc-only','excluded_employer':excluded_employer,'eligible':len(eligible),'experience_gaps':len(gaps),'excluded_experience_unknown':unknown_experience,'experience_policy':EXPERIENCE_POLICY,'stretch_count':sum(j['experience_match']['status']=='stretch' for j in eligible),'excluded_location':excluded_location,'unknown_location':unknown_location,'excluded_workstyle':excluded_style,'total':len(snapshot['jobs']),'ranking_mode':('semantic' if query_vectors is not None else 'full-text') if query.strip() else 'browse','method':'Relevance ranking only; qualifications require review. No Gemini calls were made for this search.','semantic':{**self.encoder.status(),'indexed':snapshot['semantic']['indexed'],'indexing':self.indexing}}

    def start(self):
        def index_loop():
            # Index cached/new arrivals without waiting for every company scan to finish.
            while True:
                try:self.build_index()
                except Exception:pass  # Search retains its local full-text fallback.
                time.sleep(30)
        def loop():
            while True:
                self.refresh(max_sources=18);self.build_index();time.sleep(60)
        threading.Thread(target=index_loop,daemon=True,name='job-index-scheduler').start()
        threading.Thread(target=loop,daemon=True,name='job-cache-scheduler').start()

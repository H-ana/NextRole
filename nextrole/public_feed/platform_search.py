"""Bounded JobSpy discovery. Only broad role/location terms leave the backend."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
from importlib.metadata import distributions
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

ROOT=Path(__file__).parent
DEPS=ROOT/'.jobspy-deps'
SOURCE={'provider':'platform','id':'jobspy','company':'JobSpy platform listings'}
SITES={'linkedin':'LinkedIn','indeed':'Indeed','glassdoor':'Glassdoor','zip_recruiter':'ZipRecruiter',
       'bayt':'Bayt','naukri':'Naukri','bdjobs':'BDJobs','hellowork':'HelloWork'}
REGIONS={'zip_recruiter':'US and Canada','bdjobs':'Bangladesh','hellowork':'France'}
ROLE=re.compile(r'\b((?:(?:agentic|generative|AI|machine learning|data|software|full[ -]stack|back[ -]end|front[ -]end|cloud|devops|business|financial|finance|product|project|marketing|sales|quality|automation|security|support|operations|human resources|HR|technical)\s+){1,3}(?:developer|engineer|analyst|scientist|manager|designer|specialist|consultant|associate))\b',re.I)

class PlatformError(Exception):pass

def jobspy_installed():
    return any(d.metadata.get('Name','').lower()=='python-jobspy' and d.version=='1.4.1'
               for d in distributions(path=[str(DEPS)]))

def platform_for_url(url):
    if not isinstance(url,str):return None
    try:
        p=urlsplit(url);host=(p.hostname or '').lower()
        if p.scheme!='https' or p.username or p.password or p.port not in (None,443):return None
    except ValueError:return None
    def domain(*bases):return any(host==b or host.endswith('.'+b) for b in bases)
    if domain('linkedin.com') and p.path.startswith('/jobs/view/'):return 'LinkedIn'
    if domain('naukri.com') and p.path.startswith('/job-listings-'):return 'Naukri'
    if domain('indeed.com','indeed.co.in') and re.search(r'/(?:m/)?viewjob|/rc/clk',p.path) and re.search(r'(?:^|&)jk=[^&]+',p.query):return 'Indeed'
    if domain('glassdoor.com','glassdoor.co.in','glassdoor.co.uk','glassdoor.fr') and re.search(r'/job-listing/|/partner/jobListing',p.path,re.I):return 'Glassdoor'
    if domain('ziprecruiter.com') and re.search(r'/(?:jobs|c|k|job)/',p.path,re.I):return 'ZipRecruiter'
    if domain('bayt.com') and re.search(r'/jobs/[^/]+-\d+/?$',p.path):return 'Bayt'
    if domain('bdjobs.com') and re.search(r'jobdetail|jobdetails',p.path,re.I):return 'BDJobs'
    if domain('hellowork.com') and re.search(r'/emplois/\d+',p.path):return 'HelloWork'
    return None

def discovery_plan(body):
    resume=body.get('resume','');prefs=body.get('preferences',{})
    if not isinstance(resume,str) or len(resume)>60000 or not isinstance(prefs,dict):raise PlatformError('Invalid platform search inputs.')
    role=str(prefs.get('target_roles','')).strip()
    if not role:
        match=ROLE.search(resume)
        if match:role=match.group(1)
    if not role:return [],'Enter a job title in the search field to discover platform listings.'
    if len(role)>80 or '@' in role or '://' in role or re.search(r'\d{5,}|[\r\n]',role):raise PlatformError('Use a short job title without personal details.')
    role=' '.join(re.findall(r'[A-Za-z][A-Za-z0-9+#./-]*',role))
    if not role:raise PlatformError('Enter a job title to search.')
    cities=prefs.get('cities',[]);remote=prefs.get('workstyle')=='Remote'
    if not isinstance(cities,list) or len(cities)>30 or any(not isinstance(c,str) or not re.fullmatch(r'[A-Za-z ]{2,50}',c) for c in cities):raise PlatformError('Invalid city preferences.')
    places=['India'] if remote or not cities else list(dict.fromkeys(cities))
    # The current product offers Indian cities. Do not search foreign regions
    # or treat overseas remote roles as available to applicants in India.
    return [{'role':role,'city':city,'remote':remote,'site':site}
            for city in places for site in SITES if site not in REGIONS],''

def normalize_results(rows):
    from careers_scraper import make_job
    from job_store import plain_text
    if not isinstance(rows,list):raise PlatformError('JobSpy returned an unreadable result.')
    jobs=[];seen=set()
    for item in rows:
        if not isinstance(item,dict):continue
        site=item.get('site');url=item.get('job_url')
        if site not in SITES or platform_for_url(url)!=SITES[site] or url in seen:continue
        if item.get('is_expired') is True or item.get('job_is_open') is False:continue
        values=[item.get(k) for k in ('title','company','description')]
        if not all(isinstance(v,str) and v.strip() for v in values):continue
        title,company,description=values
        # Preserve the site's explicit experience field: many Naukri pages put
        # it outside the description. Never guess years from the job title.
        raw_band=item.get('experience_range');source_band=None
        if site=='naukri' and isinstance(raw_band,str) and re.fullmatch(r'\s*\d{1,2}(?:\.\d+)?\s*(?:(?:-|–|—|to)\s*\d{1,2}(?:\.\d+)?)?\s*\+?\s*(?:years?|yrs?)?\s*',raw_band,re.I):
            source_band=raw_band.strip()
            label=source_band if re.search(r'years?|yrs?',source_band,re.I) else source_band+' years'
            description='Experience range: '+label+'\n\n'+description
        location=item.get('location') if isinstance(item.get('location'),str) else ''
        # Only an explicit remote flag or original location wording establishes style.
        style='Remote' if item.get('is_remote') is True else 'Hybrid' if re.search(r'\bhybrid\b',location,re.I) else 'unknown'
        declared_style=str(item.get('work_from_home_type') or '').strip().lower()
        if declared_style=='hybrid':style='Hybrid'
        elif declared_style=='remote':style='Remote'
        elif declared_style in ('work from office','onsite','on-site'):style='On-site'
        if style=='Remote' and 'remote' not in location.lower():location='Remote - '+(location or 'Location not specified')
        job=make_job({**SOURCE,'company':company},title,plain_text(description),location,url,
                     collection_method='JobSpy public listing',application_links=[{'platform':SITES[site],'url':url}],
                     listed_on=[SITES[site]],style=style,company_description=item.get('company_description','')[:2000] if isinstance(item.get('company_description'),str) else '')
        if job:
            if source_band:job.update(experience_source_quote=source_band,experience_source_url=url)
            direct=item.get('job_url_direct')
            if isinstance(direct,str):
                from job_store import safe_url
                if safe_url(direct) and not platform_for_url(direct):job['application_links'].append({'platform':'Company careers','url':direct})
            if isinstance(item.get('id'),str):job['source_job_id']=item['id']
            match=re.search(r'(?im)^\s*(?:job requisition|requisition|job)\s*(?:id|number|#)\s*[:#]\s*([A-Za-z0-9_-]{4,40})\s*$',description)
            if match:job['job_requisition_id']=match.group(1)
            # Preserve public source metadata; missing values remain unknown.
            for field in ('date_posted','min_amount','max_amount','interval','currency'):
                value=item.get(field)
                if isinstance(value,(str,int,float)) and not isinstance(value,bool):job[field]=value
            seen.add(url);jobs.append(job)
    return jobs

def fetch_jobs(plan):
    if plan.get('site') not in SITES:raise PlatformError('Unsupported job source.')
    # A subprocess bounds slow native/network scrapers and isolates dependencies.
    # Its input contains no resume, employer history, key or contact details.
    env={k:v for k,v in os.environ.items() if not any(s in k.upper() for s in ('API_KEY','TOKEN','SECRET','PROXY'))}
    try:
        result=subprocess.run([sys.executable,str(ROOT/'jobspy_worker.py')],input=json.dumps(plan),
                              text=True,capture_output=True,timeout=90,cwd=str(ROOT),env=env)
        if result.returncode:raise PlatformError('Collector failed. Cached listings remain available.')
        if len(result.stdout)>8_000_000:raise PlatformError('Collector response exceeded the supported size.')
        payload=json.loads(result.stdout)
        if payload.get('error'):raise PlatformError(payload['error'])
        jobs=normalize_results(payload.get('jobs'))
        return jobs, bool(payload.get('warnings'))
    except subprocess.TimeoutExpired:raise PlatformError('Collector timed out. Cached listings remain available.') from None
    except (OSError,ValueError):raise PlatformError('Collector could not run. Run python setup_jobspy.py, then restart the backend.') from None

class PlatformSearch:
    def __init__(self,store):
        self.store=store;self.lock=threading.Lock();self.refreshing=False;self.checked={};self.message='';self.completed=0;self.planned=0
        self.site_states={site:{'state':'unsupported_location','message':f'JobSpy covers {REGIONS[site]}; the current location preferences cover India.'}
                          if site in REGIONS else {'state':'not_searched','message':'Not searched this session.'} for site in SITES}

    def status(self):
        counts={name:0 for name in SITES.values()}
        with self.store.connect() as db:
            for row in db.execute("SELECT payload FROM jobs WHERE active=1 AND source=? AND last_seen>?",('platform:jobspy',time.time()-86400)):
                for name in json.loads(row['payload']).get('listed_on',[]):
                    if name in counts:counts[name]+=1
        installed=jobspy_installed()
        return {'provider':'JobSpy','configured':installed,'refreshing':self.refreshing,'message':self.message if installed else 'Run python setup_jobspy.py to install JobSpy. No platform key or login is required.',
                'counts':counts,'sources':{SITES[k]:dict(v) for k,v in self.site_states.items()},'completed_queries':self.completed,'planned_queries':self.planned}

    def request(self,body,fetcher=fetch_jobs):
        if not jobspy_installed():return self.status()
        plans,note=discovery_plan(body)
        if note:self.message=note;return self.status()
        def identity(plan):return hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest()
        missing=[p for p in plans if self.checked.get(identity(p),(0,0))[0]<time.time()-self.checked.get(identity(p),(0,0))[1]]
        if not self.lock.acquire(blocking=False):return self.status()
        if not missing:
            self.lock.release();self.message='Using cached JobSpy searches. Successful searches refresh after six hours; failed sources have a 15-minute cooldown.';return self.status()
        self.refreshing=True;self.planned=len(plans);self.completed=len(plans)-len(missing);self.message='Collecting public job listings with JobSpy.'
        def collect(plan):
            site=plan['site'];self.site_states[site]={'state':'collecting','message':'Checking public listings.'}
            try:
                jobs,warnings=fetcher(plan)
                jobs=[j for j in jobs if j.get('listed_on')==[SITES[site]]]
                self.store.update_source(SOURCE,jobs,complete=False,note='JobSpy public listings; verify availability at the destination. Collection may be partial.')
                self.checked[identity(plan)]=(time.time(),21600)
                state='partial' if warnings else 'updated' if jobs else 'no_results'
                self.site_states[site]={'state':state,'message':f'{len(jobs)} usable listings returned for {plan["city"]}.'+(' Some details could not be collected.' if warnings else '')}
            except Exception as error:
                self.checked[identity(plan)]=(time.time(),900)
                self.site_states[site]={'state':'unavailable','message':str(error) if isinstance(error,PlatformError) else 'Collector unavailable. Cached listings retained.'}
            finally:self.completed+=1
        def work():
            try:
                # One city per action; every applicable source gets a turn.
                with ThreadPoolExecutor(max_workers=2) as pool:
                    for future in as_completed([pool.submit(collect,p) for p in missing[:5]]):future.result()
                self.message='JobSpy collection finished. Confirm availability on the original site.'
                if self.completed<self.planned:self.message+=' Find jobs again to continue remaining locations.'
                self.store.build_index()
            except Exception:self.message='Collection interrupted. Cached jobs remain searchable.'
            finally:self.refreshing=False;self.lock.release()
        threading.Thread(target=work,daemon=True,name='jobspy-discovery').start()
        return self.status()

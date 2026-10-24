"""Retained observations of public adverts, never hiring or applicant outcomes."""
import json
import re
import time
from urllib.parse import parse_qs,urlsplit

WINDOW=180*86400
def normalized(value):return re.sub(r'\W+',' ',str(value).casefold()).strip()

def identity(url):
    from platform_search import platform_for_url
    site=platform_for_url(url)
    if not site:return None
    p=urlsplit(url);q=parse_qs(p.query)
    token=None
    if site=='Indeed':token=q.get('jk',[None])[0]
    elif site=='Glassdoor':token=q.get('jl',q.get('jobListingId',[None]))[0]
    elif site=='BDJobs':token=next((v[0] for k,v in q.items() if k.lower()=='id'),None)
    elif site=='ZipRecruiter':token=q.get('jid',q.get('lvk',[None]))[0]
    elif site in ('LinkedIn','Naukri','Bayt','HelloWork'):
        match=re.search(r'(\d+)(?:\.html)?/?$',p.path)
        if match:token=match.group(1)
    return site,token or p.netloc.lower()+p.path.rstrip('/')

def record(db,jobs,observed_at):
    for job in jobs:
        if job.get('source')!='platform:jobspy':continue
        key=identity(job.get('url'))
        if not key:continue
        site,listing=key
        db.execute('''INSERT INTO posting_history(site,listing,company,role,url,first_observed,last_observed)
VALUES(?,?,?,?,?,?,?) ON CONFLICT(site,listing) DO UPDATE SET
last_observed=MAX(posting_history.last_observed,excluded.last_observed),
first_observed=CASE WHEN posting_history.company=excluded.company AND posting_history.role=excluded.role
THEN MIN(posting_history.first_observed,excluded.first_observed) ELSE excluded.first_observed END,
company=excluded.company,role=excluded.role,url=excluded.url''',
                   (site,listing,normalized(job['company']),normalized(job['title']),job['url'],observed_at,observed_at))

def initialize(db):
    exists=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='posting_history'").fetchone()
    db.executescript('''CREATE TABLE IF NOT EXISTS posting_history(
site TEXT NOT NULL,listing TEXT NOT NULL,company TEXT NOT NULL,role TEXT NOT NULL,url TEXT NOT NULL,
first_observed REAL NOT NULL,last_observed REAL NOT NULL,PRIMARY KEY(site,listing));
CREATE INDEX IF NOT EXISTS posting_history_observed ON posting_history(last_observed);''')
    if not exists:
        # last_seen is a known observation, not a fabricated publication date.
        for row in db.execute("SELECT payload,last_seen FROM jobs WHERE source='platform:jobspy'").fetchall():
            record(db,[json.loads(row['payload'])],row['last_seen'])

def annotate(db,jobs,now=None):
    now=time.time() if now is None else now
    rows=[dict(r) for r in db.execute('SELECT * FROM posting_history WHERE last_observed>=?',(now-WINDOW,))]
    lookup={(r['site'],r['listing']):r for r in rows};groups={}
    for row in rows:groups.setdefault((row['site'],row['company'],row['role']),[]).append(row)
    for job in jobs:
        metrics={};urls=[job.get('url')]+[a.get('url') for a in job.get('application_links',[])]
        for url in urls:
            key=identity(url)
            if not key or key[0] in metrics:continue
            current=lookup.get(key)
            if not current:continue
            # Exact normalized title: no inference that a different seniority or
            # role family is equivalent. Exclude the current collection batch.
            previous=[r for r in groups.get((key[0],normalized(job['company']),normalized(job['title'])),[])
                      if r['listing']!=key[1] and r['first_observed']<=current['first_observed']-86400]
            previous.sort(key=lambda r:r['last_observed'],reverse=True)
            metrics[key[0]]={'prior_postings':len(previous),'current_first_observed':current['first_observed'],
                             'evidence':[{'url':r['url'],'observed_at':r['first_observed']} for r in previous[:3]]}
        job['site_history']={'window_days':180,'sites':metrics}

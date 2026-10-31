"""Scheduled public role/city searches. Never accepts resumes, user keys or cookies."""
import argparse,concurrent.futures,json,time
from pathlib import Path
from platform_search import fetch_jobs
from mnc_employers import mnc_employer
from experience_policy import requirement
from collect import FIELDS

CITIES=['Bengaluru','Hyderabad','Pune','Chennai','Mumbai','Gurugram','Noida','New Delhi','Kolkata','Kochi','Thiruvananthapuram','Ahmedabad','Chandigarh','Coimbatore','Indore','Jaipur','Bhubaneswar']
ROLES=['Software Engineer','AI Engineer','Machine Learning Engineer','Generative AI Engineer','Forward Deployed Engineer']
SITES={'linkedin':'LinkedIn','indeed':'Indeed','naukri':'Naukri','glassdoor':'Glassdoor','bayt':'Bayt'}

def collect(site,previous=None,fetcher=fetch_jobs,now=None):
 now=time.time() if now is None else now;source='platform:public:'+site
 role=ROLES[int(now//(4*3600))%len(ROLES)]
 jobs={j['id']:j for j in (previous or {}).get('jobs',[]) if j.get('source')==source and now-86400<=j.get('last_checked',0)<=now+300}
 successes=0
 def one(city):
  try:return fetcher({'site':site,'role':role,'city':city,'remote':False})[0]
  except Exception:return None
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for batch in pool.map(one,CITIES):
   if batch is None:continue
   successes+=1
   for j in batch:
    if not mnc_employer(j):continue
    clean={k:j[k] for k in FIELDS if k in j};clean.update(source=source,company=mnc_employer(j)['name'],last_checked=now,experience_requirement=requirement(j.get('description','')))
    jobs[clean['id']]=clean
 return {'format':'nextrole-public-jobs','version':1,'generated_at':now,'jobs':list(jobs.values()),'sources':[{'id':source,'company':SITES[site]+' public listings','last_attempt':now,'last_success':now if successes else None,'available':bool(successes),'queries_succeeded':successes,'queries_attempted':len(CITIES)}]}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',choices=[*SITES,'all'],required=True);p.add_argument('--previous');p.add_argument('--output',required=True);a=p.parse_args()
 old=json.loads(Path(a.previous).read_text(encoding='utf-8')) if a.previous and Path(a.previous).exists() else None
 if a.site=='all':
  from merge import merge_feeds
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:data=merge_feeds(list(pool.map(lambda site:collect(site,old),SITES)))
 else:data=collect(a.site,old)
 Path(a.output).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(json.dumps({'site':a.site,'jobs':len(data['jobs']),'successful_queries':sum(s.get('queries_succeeded',0) for s in data['sources'])}))

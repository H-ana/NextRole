"""Scheduled public role/city searches. Never accepts resumes, user keys or cookies."""
import argparse,concurrent.futures,json,time,math
from pathlib import Path
from platform_search import fetch_jobs
from mnc_employers import mnc_employer,REGISTRY
from experience_policy import requirement
from collect import FIELDS

CITIES=['Bengaluru','Hyderabad','Pune','Chennai','Mumbai','Gurugram','Noida','New Delhi','Kolkata','Kochi','Thiruvananthapuram','Ahmedabad','Chandigarh','Coimbatore','Indore','Jaipur','Bhubaneswar']
ROLES=['AI Engineer','Generative AI Engineer','GenAI Engineer','Agentic AI Engineer','LLM Engineer','Machine Learning Engineer','Forward Deployed Engineer','Python Developer','Software Engineer','Applied AI Engineer','AI Application Developer','LLM Application Engineer','Associate Software Engineer','SDE I','Software Engineer I']
SITES={'linkedin':'LinkedIn','indeed':'Indeed','naukri':'Naukri','glassdoor':'Glassdoor','bayt':'Bayt'}

TARGET_BATCH=64
TARGET_ROLES=['AI Engineer','Generative AI Engineer','Machine Learning Engineer','Software Engineer']

def approved_targets():
 # Use the source registry rather than the alias lookup: aliases can overlap
 # between parent companies and brands, but every approved row needs coverage.
 rows=json.loads(REGISTRY.read_text(encoding='utf-8'))['companies']
 return {row['name']:row for row in rows}

def employer_history(site,previous):
 source=next((s for s in (previous or {}).get('sources',[]) if s.get('id')=='platform:public:'+site),{})
 raw=source.get('employer_searches') or {};result={}
 if not isinstance(raw,dict):return result
 for name in approved_targets():
  state=raw.get(name,{})
  if not isinstance(state,dict):continue
  clean={}
  for field in ('last_attempt','last_success'):
   value=state.get(field)
   if isinstance(value,(int,float)) and math.isfinite(value) and value>=0:clean[field]=value
  index=state.get('next_role',0);clean['next_role']=index%len(TARGET_ROLES) if isinstance(index,int) else 0
  result[name]=clean
 return result

def search_plan(site,now,previous=None):
 count=20 if site=='linkedin' else 40
 general=[dict(site=site,role=role,city='India',remote=False,results=count) for role in ROLES]
 general += [dict(site=site,role=role,city=city,remote=False,results=count) for city in CITIES for role in ['AI Engineer','Generative AI Engineer']]
 general += [dict(site=site,role=role,city='India',remote=True,results=count) for role in ['AI Engineer','Generative AI Engineer']]
 history=employer_history(site,previous);rows=approved_targets()
 names=sorted(rows,key=lambda name:(history.get(name,{}).get('last_attempt',0),name.casefold()))[:TARGET_BATCH]
 targeted=[]
 for name in names:
  index=history.get(name,{}).get('next_role',0)
  plan=dict(site=site,role=TARGET_ROLES[index]+' '+name,city='India',remote=False,results=count,employer=name,target_role_index=index)
  # Optional IDs must be explicitly verified in the registry. Never infer them.
  ids=rows[name].get('linkedin_company_ids')
  if site=='linkedin' and rows[name].get('linkedin_ids_verified') is True and isinstance(ids,list) and ids and all(isinstance(i,int) and not isinstance(i,bool) and i>0 for i in ids):plan['linkedin_company_ids']=ids[:10]
  targeted.append(plan)
 # Interleave so either kind of discovery can progress before the time budget.
 plans=[]
 for i in range(max(len(general),len(targeted))):
  if i<len(targeted):plans.append(targeted[i])
  if i<len(general):plans.append(general[i])
 return plans

def collect(site,previous=None,fetcher=fetch_jobs,now=None):
 now=time.time() if now is None else now;source='platform:public:'+site
 plans=search_plan(site,now,previous);history=employer_history(site,previous)
 jobs={j['id']:j for j in (previous or {}).get('jobs',[]) if j.get('source')==source and now-86400<=j.get('last_checked',0)<=now+300}
 successes=0;attempts=0;deadline=time.monotonic()+40*60
 def one(plan):
  if time.monotonic()>=deadline:return plan,None,0,0
  try:batch=fetcher(plan)[0]
  except Exception:return plan,None,1,0
  attempted=1;successful=1
  # One additional page per query only when the first page fills. Failures on
  # the second page never throw away first-page results. No proxy or login.
  if len(batch)>=plan['results'] and time.monotonic()<deadline:
   attempted+=1
   try:
    extra=fetcher({**plan,'offset':plan['results']})[0];successful+=1
    batch=list({j['id']:j for j in [*batch,*extra]}.values())
   except Exception:pass
  return plan,batch,attempted,successful
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for plan,batch,count,successful in pool.map(one,plans):
   attempts+=count;successes+=successful
   if plan.get('employer') and count:
    state={**history.get(plan['employer'],{}),'last_attempt':now,'next_role':(plan['target_role_index']+1)%len(TARGET_ROLES)}
    if successful:state['last_success']=now
    history[plan['employer']]=state
   if batch is None:continue
   for j in batch:
    if not mnc_employer(j):continue
    if plan.get('employer') and mnc_employer(j)!=mnc_employer({'company':plan['employer']}):continue
    clean={k:j[k] for k in FIELDS if k in j};clean.update(source=source,company=mnc_employer(j)['name'],last_checked=now,experience_requirement=requirement(j.get('description','')))
    jobs[clean['id']]=clean
 return {'format':'nextrole-public-jobs','version':1,'generated_at':now,'jobs':list(jobs.values()),'sources':[{'id':source,'company':SITES[site]+' public listings','last_attempt':now,'last_success':now if successes else None,'available':bool(successes),'queries_succeeded':successes,'queries_attempted':attempts,'planned_queries':len(plans),'employer_searches':history,'approved_employers':len(approved_targets()),'targeted_employers_planned':sum(bool(p.get('employer')) for p in plans)}]}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',choices=[*SITES,'all'],required=True);p.add_argument('--previous');p.add_argument('--output',required=True);a=p.parse_args()
 old=json.loads(Path(a.previous).read_text(encoding='utf-8')) if a.previous and Path(a.previous).exists() else None
 if a.site=='all':
  from merge import merge_feeds
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:data=merge_feeds(list(pool.map(lambda site:collect(site,old),SITES)))
 else:data=collect(a.site,old)
 Path(a.output).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(json.dumps({'site':a.site,'jobs':len(data['jobs']),'successful_queries':sum(s.get('queries_succeeded',0) for s in data['sources'])}))

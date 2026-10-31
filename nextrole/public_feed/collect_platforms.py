"""Scheduled public role/city searches. Never accepts resumes, user keys or cookies."""
import argparse,concurrent.futures,json,time
from pathlib import Path
from platform_search import fetch_jobs
from mnc_employers import mnc_employer,EMPLOYERS
from experience_policy import requirement
from collect import FIELDS

CITIES=['Bengaluru','Hyderabad','Pune','Chennai','Mumbai','Gurugram','Noida','New Delhi','Kolkata','Kochi','Thiruvananthapuram','Ahmedabad','Chandigarh','Coimbatore','Indore','Jaipur','Bhubaneswar']
ROLES=['AI Engineer','Generative AI Engineer','GenAI Engineer','Agentic AI Engineer','LLM Engineer','Machine Learning Engineer','Forward Deployed Engineer','Python Developer','Software Engineer']
SITES={'linkedin':'LinkedIn','indeed':'Indeed','naukri':'Naukri','glassdoor':'Glassdoor','bayt':'Bayt'}

def search_plan(site,now):
 # Every role alias is searched each cycle. Never wait for a 20-hour title
 # rotation before discovering the role the applicant actually wants.
 count=20 if site=='linkedin' else 40
 plans=[dict(site=site,role=role,city='India',remote=False,results=count) for role in ROLES]
 plans += [dict(site=site,role=role,city=city,remote=False,results=count) for city in CITIES for role in ['AI Engineer','Generative AI Engineer']]
 plans += [dict(site=site,role=role,city='India',remote=True,results=count) for role in ['AI Engineer','Generative AI Engineer']]
 names=['Microsoft','Google','Amazon','NVIDIA','Salesforce','ServiceNow','Adobe','Oracle','SAP','IBM','Accenture','Deloitte','Infosys','Tata Consultancy Services','Cognizant','Capgemini','Wipro','HCLTech','Tech Mahindra','EPAM Systems','JPMorgan Chase','Morgan Stanley','Bank of America','Citi','Wells Fargo','HSBC','Barclays','Intuit','PayPal','Visa','Mastercard','Novartis','Eli Lilly','Roche','Warner Bros. Discovery','Palo Alto Networks','Atlassian','Databricks','Snowflake','NetApp']
 approved={row['name'] for row in EMPLOYERS.values()};names=[n for n in names if n in approved]
 offset=(int(now//(4*3600))*10)%max(1,len(names))
 for name in (names+names)[offset:offset+min(10,len(names))]:plans.append(dict(site=site,role='AI Engineer '+name,city='India',remote=False,results=count))
 return plans

def collect(site,previous=None,fetcher=fetch_jobs,now=None):
 now=time.time() if now is None else now;source='platform:public:'+site
 plans=search_plan(site,now)
 jobs={j['id']:j for j in (previous or {}).get('jobs',[]) if j.get('source')==source and now-86400<=j.get('last_checked',0)<=now+300}
 successes=0
 def one(plan):
  try:return fetcher(plan)[0]
  except Exception:return None
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for batch in pool.map(one,plans):
   if batch is None:continue
   successes+=1
   for j in batch:
    if not mnc_employer(j):continue
    clean={k:j[k] for k in FIELDS if k in j};clean.update(source=source,company=mnc_employer(j)['name'],last_checked=now,experience_requirement=requirement(j.get('description','')))
    jobs[clean['id']]=clean
 return {'format':'nextrole-public-jobs','version':1,'generated_at':now,'jobs':list(jobs.values()),'sources':[{'id':source,'company':SITES[site]+' public listings','last_attempt':now,'last_success':now if successes else None,'available':bool(successes),'queries_succeeded':successes,'queries_attempted':len(plans)}]}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',choices=[*SITES,'all'],required=True);p.add_argument('--previous');p.add_argument('--output',required=True);a=p.parse_args()
 old=json.loads(Path(a.previous).read_text(encoding='utf-8')) if a.previous and Path(a.previous).exists() else None
 if a.site=='all':
  from merge import merge_feeds
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:data=merge_feeds(list(pool.map(lambda site:collect(site,old),SITES)))
 else:data=collect(a.site,old)
 Path(a.output).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(json.dumps({'site':a.site,'jobs':len(data['jobs']),'successful_queries':sum(s.get('queries_succeeded',0) for s in data['sources'])}))

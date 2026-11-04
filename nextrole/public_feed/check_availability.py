"""Bounded public vacancy-status checks. No cookies, login, resume or AI calls."""
import argparse,concurrent.futures,json,time
from pathlib import Path
from job_availability import availability_key,is_unavailable,check_public_page,closure_quote

def refresh_status(feed,registry,checker=check_public_page,max_jobs=120,seconds=240,now=None):
 now=time.time() if now is None else now
 records={r['key']:r for r in registry.get('entries',[]) if r.get('status')=='closed' and r.get('key')}
 records.update({r['key']:r for r in feed.get('closed_jobs',[]) if r.get('status')=='closed' and r.get('key')})
 jobs=feed.get('jobs',[])
 for job in jobs:
  if is_unavailable(job,records):
   key=availability_key(job.get('url',''))
   if key and key not in records:records[key]={'key':key,'url':job['url'],'status':'closed','checked_at':now,'quote':job.get('availability_quote') or closure_quote(job.get('description')) or 'Source marks this vacancy closed'}
 candidates=sorted((j for j in jobs if not is_unavailable(j,records)),key=lambda j:(j.get('availability_last_attempt',0),not str(j.get('source','')).startswith('platform:')) )[:max_jobs]
 deadline=time.monotonic()+seconds
 def check(job):
  if time.monotonic()>=deadline:return job,None,False
  try:return job,checker(job),True
  except Exception:return job,None,True
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for job,result,attempted in pool.map(check,candidates):
   if attempted:job['availability_last_attempt']=now
   # A timeout, access block, missing marker or unreadable page is unknown.
   if not isinstance(result,dict) or result.get('status')!='closed' or result.get('key')!=availability_key(job['url']):continue
   records[result['key']]=result
 output={**feed,'jobs':[j for j in jobs if not is_unavailable(j,records)],'closed_jobs':list(records.values())}
 return output,{'format':'nextrole-closed-jobs','version':1,'updated_at':now,'entries':list(records.values())}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--feed',required=True);p.add_argument('--registry',required=True);p.add_argument('--max-jobs',type=int,default=120);a=p.parse_args()
 path=Path(a.registry);registry=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'entries':[]}
 feed=json.loads(Path(a.feed).read_text(encoding='utf-8'));result,registry=refresh_status(feed,registry,max_jobs=max(0,min(a.max_jobs,500)))
 Path(a.feed).write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8');path.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'retained':len(result['jobs']),'closed_records':len(registry['entries']),'bounded_page_checks':a.max_jobs}))

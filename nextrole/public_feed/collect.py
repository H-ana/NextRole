"""Publish only configured company careers listings. No applicant input or AI requests."""
import argparse,json,time,tempfile,sqlite3,hashlib,re
from pathlib import Path
from job_store import JobStore,source_key
from experience_policy import requirement
from mnc_employers import mnc_employer
ROOT=Path(__file__).parent
FIELDS=('id','source','company','title','description','location','url','style','years','skills','experience_quote','experience_requirement','last_checked','collection_method','posted_at','date_posted','posting_date','salary_min','salary_max','salary_currency','salary_interval','salary_source','scraped_from','job_requisition_id','application_links','listed_on','source_job_id','experience_source_quote','experience_source_url')

def shard_sources(sources,index,count):
 if count<1 or not 0<=index<count:raise ValueError('Invalid source shard')
 return [s for s in sources if int(hashlib.sha256(source_key(s).encode()).hexdigest()[:8],16)%count==index]

def india_location(location):
 # Public users currently choose Indian cities. Do not fill the feed with
 # overseas-only roles, or assume every remote vacancy accepts Indian workers.
 return bool(re.search(r'\b(?:India|Secunderabad|Cyberabad|Thane|Panvel|Pimpri|Chinchwad|Whitefield|Hosur|Tambaram|Sriperumbudur|Mohali|Panchkula|Kakkanad|Bengaluru|Bangalore|Hyderabad|Pune|Chennai|Mumbai|Bombay|Gurugram|Gurgaon|Noida|New Delhi|Kolkata|Calcutta|Kochi|Cochin|Thiruvananthapuram|Trivandrum|Ahmedabad|Chandigarh|Coimbatore|Indore|Jaipur|Bhubaneswar|worldwide|anywhere in the world)\b',str(location),re.I))
def export(store,now=None):
 now=now or time.time();valid={source_key(s) for s in store.sources if s['provider']=='careers'};jobs=[]
 with store.connect() as db:rows=db.execute('SELECT payload,last_seen FROM jobs WHERE active=1').fetchall();states={r['id']:dict(r) for r in db.execute('SELECT * FROM sources')}
 for row in rows:
  j=json.loads(row['payload'])
  if j.get('source') not in valid or not mnc_employer(j) or row['last_seen']<now-7*86400 or not india_location(j.get('location')):continue
  clean={k:j[k] for k in FIELDS if k in j};clean['last_checked']=row['last_seen'];clean['experience_requirement']=requirement(clean.get('description',''));jobs.append(clean)
 return {'format':'nextrole-public-jobs','version':1,'generated_at':now,'max_age_seconds':7*86400,'jobs':jobs,'sources':[{'id':source_key(s),'company':s['company'],'careers_url':s['careers_url'],'last_success':states.get(source_key(s),{}).get('last_success'),'cursor':states.get(source_key(s),{}).get('cursor',0),'last_attempt':states.get(source_key(s),{}).get('last_attempt'),'available':not bool(states.get(source_key(s),{}).get('error'))} for s in store.sources if s['provider']=='careers']}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--previous');parser.add_argument('--seed-cache');parser.add_argument('--sources-file');parser.add_argument('--max-sources',type=int,default=512);parser.add_argument('--shard-index',type=int,default=0);parser.add_argument('--shard-count',type=int,default=1);args=parser.parse_args()
 sources=shard_sources([s for s in json.loads((Path(args.sources_file) if args.sources_file else ROOT/'job_sources.json').read_text(encoding='utf-8')) if s['provider']=='careers' and mnc_employer({'company':s['company']})],args.shard_index,args.shard_count);index={source_key(s):s for s in sources}
 with tempfile.TemporaryDirectory() as folder:
  store=JobStore(Path(folder)/'public.sqlite3',sources=sources)
  if args.previous and Path(args.previous).exists():
   old=json.loads(Path(args.previous).read_text(encoding='utf-8'))
   if old.get('format')!='nextrole-public-jobs':raise ValueError('Not a public jobs feed')
   for j in old.get('jobs',[]):
    if j.get('source') in index:store.update_source(index[j['source']],[j],now=float(j.get('last_checked',0)),complete=False)
   with store.connect() as db:
    for s in old.get('sources',[]):
     if s.get('id') in index:db.execute('INSERT INTO sources(id,last_attempt,last_success,cursor) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_attempt=excluded.last_attempt,last_success=excluded.last_success,cursor=excluded.cursor',(s['id'],s.get('last_attempt'),s.get('last_success'),s.get('cursor',0)))
  if args.seed_cache:
   db=sqlite3.connect('file:'+str(Path(args.seed_cache).resolve())+'?mode=ro',uri=True)
   for payload,last in db.execute('SELECT payload,last_seen FROM jobs WHERE active=1'):
    j=json.loads(payload)
    if j.get('source') in index and time.time()-last<7*86400:store.update_source(index[j['source']],[j],now=last,complete=False)
   db.close()
  if args.max_sources:store.refresh(max_sources=max(1,min(512,args.max_sources)),force=True)
  payload=export(store);out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(json.dumps({'jobs':len(payload['jobs']),'sources':len(payload['sources'])}))
if __name__=='__main__':main()

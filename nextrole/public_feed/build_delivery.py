"""Small location-addressed public feeds; never receives applicant data."""
import argparse,gzip,hashlib,json,re,unicodedata
from pathlib import Path
from collect import FIELDS
from merge import merge_feeds

from build_delivery_locations import CITIES,slug,norm
MAX_BYTES=2_000_000

def buckets(job):
 location=norm(job.get('location',''));keys=[slug(city) for city,aliases in CITIES.items() if any(re.search(r'(?<![a-z])'+re.escape(norm(alias))+r'(?![a-z])',location) for alias in [city,*aliases])]
 if job.get('style')=='Remote':keys.append('remote')
 return keys or ['other']
def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8')

def build_delivery(feed,output,now=None,max_bytes=MAX_BYTES):
 output=Path(output);directory=output/'job-feeds';directory.mkdir(parents=True,exist_ok=True)
 previous=[]
 try:previous=json.loads((output/'jobs-index.json').read_text(encoding='utf-8')).get('shards',[])
 except (OSError,ValueError):pass
 safe={**feed,'jobs':[{k:j[k] for k in FIELDS if k in j} for j in feed.get('jobs',[])]};data=merge_feeds([safe],now=now)
 groups={}
 for job in data['jobs']:
  for key in buckets(job):groups.setdefault(key,[]).append(job)
 entries=[]
 for key,jobs in sorted(groups.items()):
  # First chunks contain the most recently verified roles, without inventing posting dates.
  jobs.sort(key=lambda j:-float(j.get('last_checked',0)));chunks=[];chunk=[];size=400
  for job in jobs:
   length=len(encode(job))+1
   if chunk and size+length>max_bytes:chunks.append(chunk);chunk=[];size=400
   chunk.append(job);size+=length
  if chunk:chunks.append(chunk)
  for index,rows in enumerate(chunks):
   payload=encode({'format':'nextrole-public-jobs','version':1,'generated_at':max(float(j.get('last_checked',0)) for j in rows),'jobs':rows,'sources':[]})
   compressed=gzip.compress(payload,mtime=0);digest=hashlib.sha256(compressed).hexdigest()[:16];name=f'{key}-{index}-{digest}.json.gz';(directory/name).write_bytes(compressed)
   entries.append({'key':key,'url':'job-feeds/'+name,'jobs':len(rows),'bytes':len(compressed),'uncompressed_bytes':len(payload)})
 manifest={'format':'nextrole-job-index','version':1,'generated_at':data['generated_at'],'jobs':len(data['jobs']),'sources':data.get('sources',[]),'closed_jobs':data.get('closed_jobs',[]),'shards':entries}
 (output/'jobs-index.json').write_bytes(encode(manifest))
 # Remove only generated JSON files within the known delivery directory.
 wanted={Path(e['url']).name for e in [*entries,*previous] if isinstance(e.get('url'),str)}
 for old in [*directory.glob('*.json'),*directory.glob('*.json.gz')]:
  if old.name not in wanted:old.unlink()
 return manifest

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--feed',required=True);p.add_argument('--output-dir',required=True);a=p.parse_args();result=build_delivery(json.loads(Path(a.feed).read_text(encoding='utf-8')),a.output_dir);print(json.dumps({'jobs':result['jobs'],'shards':len(result['shards'])}))

"""Merge independently refreshed public shards. No applicant data is accepted."""
import argparse,json,time,re
from pathlib import Path
from urllib.parse import urlsplit,parse_qsl,urlencode,urlunsplit
from mnc_employers import mnc_employer,normalize_employer
from collect import india_location

def canonical(url):
 p=urlsplit(url)
 return urlunsplit((p.scheme,p.netloc.lower(),p.path.rstrip('/'),urlencode(sorted((k,v) for k,v in parse_qsl(p.query) if not re.match(r'utm_|^(source|ref|gh_src|trk|trackingId)$',k,re.I))),''))

def identity_keys(j):
 employer=normalize_employer((mnc_employer(j) or {}).get('name',j.get('company','')))
 keys=['url:'+canonical(u) for u in [j.get('url',''),*(l.get('url','') for l in j.get('application_links',[]))] if u.startswith('https://')]
 if j.get('id'):keys.append('id:'+employer+'|'+j['id'])
 req=str(j.get('job_requisition_id') or '').strip().lower()
 if req:keys.append('req:'+employer+'|'+req)
 return keys

def merge_feeds(feeds,now=None):
 now=time.time() if now is None else now;groups=[];lookup={};sources={}
 # The most recently verified employer page is preferred over platform copies.
 jobs=sorted((j for f in feeds for j in f.get('jobs',[])),key=lambda j:(not str(j.get('source','')).startswith('careers:'),-float(j.get('last_checked',0))))
 for j in jobs:
  if not mnc_employer(j) or not india_location(j.get('location')) or not now-(86400 if str(j.get('source','')).startswith('platform:') else 7*86400)<=float(j.get('last_checked',0))<=now+300:continue
  keys=identity_keys(j);hits={lookup[k] for k in keys if k in lookup}
  target=min(hits) if hits else len(groups)
  if not hits:groups.append(dict(j))
  existing=groups[target]
  # Join bridged groups too (e.g. LinkedIn points to an employer URL already seen).
  copies=[j]+[groups[i] for i in hits if i!=target]
  for copy in copies:
   links=[{'url':copy.get('url'),'platform':copy.get('listed_on',['Company careers'])[0] if copy.get('listed_on') else 'Company careers'},*copy.get('application_links',[]),*existing.get('application_links',[])]
   existing['application_links']=list({canonical(l['url']):l for l in links if isinstance(l.get('url'),str) and l['url'].startswith('https://')}.values())
   existing['listed_on']=sorted(set(existing.get('listed_on',[])+copy.get('listed_on',[])))
  for i in hits:
   if i!=target:
    groups[i]=None
    for key,value in list(lookup.items()):
     if value==i:lookup[key]=target
  for key in keys:lookup[key]=target
 for f in feeds:
  for s in f.get('sources',[]):
   if float(s.get('last_attempt') or 0)>=float(sources.get(s['id'],{}).get('last_attempt') or 0):sources[s['id']]=s
 return {'format':'nextrole-public-jobs','version':1,'generated_at':now,'max_age_seconds':7*86400,'jobs':[j for j in groups if j],'sources':list(sources.values())}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--input-dir',required=True);p.add_argument('--previous');p.add_argument('--output',required=True);a=p.parse_args()
 files=list(Path(a.input_dir).glob('*.json'));feeds=[json.loads(f.read_text(encoding='utf-8')) for f in files]
 # Partial shards already retain their own cache. Import previous entries only
 # for a missing shard/source; do not resurrect a successfully closed job.
 if a.previous and Path(a.previous).exists():
  old=json.loads(Path(a.previous).read_text(encoding='utf-8'));updated={s['id'] for f in feeds for s in f.get('sources',[])}
  feeds.append({**old,'jobs':[j for j in old.get('jobs',[]) if j.get('source') not in updated],'sources':[s for s in old.get('sources',[]) if s['id'] not in updated]})
 if not files:raise SystemExit('No refreshed shards; refusing to replace public feed')
 result=merge_feeds(feeds);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(json.dumps({'jobs':len(result['jobs']),'companies':len({j['company'] for j in result['jobs']}),'sources':len(result['sources'])}))

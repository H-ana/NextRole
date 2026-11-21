"""Isolated public HTML collector plus bounded JobSpy supplementation."""
import json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).parent

def combine(primary,secondary):
    rows={}
    from platform_html import job_url
    for payload in (primary,secondary):
        for row in payload.get('jobs',[]):
            key=job_url(row.get('site'),row.get('job_url')) if row.get('site') in ('linkedin','naukri') else row.get('job_url')
            if not key:continue
            row={**row,'job_url':key};old=rows.get(key)
            if old:
                # A closure beats an open copy; otherwise preserve the richer source text.
                if old.get('availability_status')=='closed':continue
                if row.get('availability_status')!='closed' and len(old.get('description',''))>=len(row.get('description','')):
                    row={**row,**old}
            rows[key]=row
    if not rows and primary.get('error') and secondary.get('error'):return {'error':'Public page extraction and platform collection are unavailable. Cached listings retained.'}
    return {'jobs':list(rows.values()),'warnings':bool(primary.get('warnings') or secondary.get('warnings') or primary.get('error') or secondary.get('error')),'methods':['public-search-html','jobspy']}

def run(plan,html_collector=None,jobspy_runner=None):
    if plan.get('site') not in ('linkedin','naukri'):
        from jobspy_worker import run as jobspy
        return jobspy(plan)
    if html_collector is None:
        from platform_html import collect
        html_collector=lambda p:collect(p,render_first=True)
    try:primary=html_collector(plan)
    except Exception as error:primary={'error':'Public HTML collection unavailable.','reason':getattr(error,'reason','unavailable')}
    if len(primary.get('jobs',[]))>=plan.get('results',40):return primary
    if jobspy_runner is None:
        def jobspy_runner(plan):
            result=subprocess.run([sys.executable,str(ROOT/'jobspy_worker.py')],input=json.dumps(plan),text=True,capture_output=True,timeout=45)
            if result.returncode or len(result.stdout)>8_000_000:raise ValueError('Platform worker failed.')
            return json.loads(result.stdout)
    try:secondary=jobspy_runner(plan)
    except Exception:secondary={'error':'Supplementary platform collection unavailable.'}
    return combine(primary,secondary)

if __name__=='__main__':
    try:result=run(json.loads(sys.stdin.read(4096)))
    except Exception:result={'error':'Public platform collection unavailable. Cached listings retained.'}
    print(json.dumps(result))

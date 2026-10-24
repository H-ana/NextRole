"""One bounded JobSpy query in an isolated process; no applicant input or keys."""
import contextlib
import io
import json
from pathlib import Path
import sys

def run(plan):
    sys.path.insert(0,str(Path(__file__).parent/'.jobspy-deps'))
    # JobSpy can log URLs and low-level errors; return only a bounded status.
    with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
        from jobspy import scrape_jobs
        options=dict(site_name=[plan['site']],search_term=plan['role'],location=plan['city'] if plan['city']=='India' else plan['city']+', India',
                     country_indeed='India',results_wanted=20,description_format='plain',fetch_description=True,verbose=0)
        if plan['remote']:options['is_remote']=True
        frame=scrape_jobs(**options)
        if frame.attrs.get('errors'):return {'error':'This source blocked or failed collection. Cached listings remain available; try after the cooldown.'}
        # pandas serializes NaN and datetimes safely; retain only public fields.
        fields=['site','job_url','title','company','description','location','is_remote','company_description']
        rows=json.loads(frame[[c for c in fields if c in frame.columns]].to_json(orient='records'))
        return {'jobs':rows,'warnings':bool(frame.attrs.get('warnings'))}

if __name__=='__main__':
    try:result=run(json.loads(sys.stdin.read(4096)))
    except Exception:result={'error':'JobSpy collector could not run. Check setup and source availability.'}
    print(json.dumps(result))

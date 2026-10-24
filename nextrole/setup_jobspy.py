"""Install the pinned upstream JobSpy package separately from semantic dependencies."""
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
if sys.version_info<(3,10):raise SystemExit('JobSpy requires Python 3.10 or newer.')
subprocess.run([sys.executable,'-m','pip','install','--upgrade','--target',str(ROOT/'.jobspy-deps'),'python-jobspy==1.4.1'],check=True)
sys.path.insert(0,str(ROOT/'.jobspy-deps'))
from jobspy import scrape_jobs
from jobspy.model import Site
import inspect
required={'linkedin','indeed','glassdoor','zip_recruiter','bayt','naukri','bdjobs','hellowork'}
if not required.issubset({s.value for s in Site}) or 'fetch_description' not in inspect.signature(scrape_jobs).parameters:
    raise SystemExit('Installed JobSpy lacks required source/description support.')
print('JobSpy setup complete: all eight adapters available. Restart the backend. No platform key or login is needed.')

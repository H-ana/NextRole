"""Install optional Chromium rendering for JavaScript careers pages. No resume access."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
deps = ROOT / '.local-deps'
env = dict(os.environ)
env['PYTHONPATH'] = str(deps)
env['PLAYWRIGHT_BROWSERS_PATH'] = str(ROOT / '.browsers')
subprocess.run([sys.executable, '-m', 'pip', 'install', '--target', str(deps), 'playwright==1.56.0'], check=True)
subprocess.run([sys.executable, '-m', 'playwright', 'install', 'chromium'], env=env, check=True)
print('Careers-page browser setup complete. Restart the backend to use it. No resume was uploaded.')

"""Prompt for an API key without echoing or saving it, then start the local app."""
import getpass
import os
import runpy
from pathlib import Path
from agent_service import api_key

if not api_key():
    value = getpass.getpass('Optional Gemini key for AI resume help (hidden; Enter to skip): ').strip()
    if value:os.environ['GEMINI_API_KEY'] = value
    del value
runpy.run_path(str(Path(__file__).with_name('server.py')), run_name='__main__')

"""Conservative employer-name policy. Unknown employers never pass by description keywords."""
import json
import re
import unicodedata
from pathlib import Path

REGISTRY = Path(__file__).parent / 'dist' / 'mnc-employers.json'


def normalize_employer(value):
    value = re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD',str(value or '')).encode('ascii','ignore').decode().lower()).strip()
    suffix = r'\s+(?:private limited|pvt ltd|pvt limited|pte ltd|limited|ltd|incorporated|inc|corporation|corp|llc|llp|plc)$'
    while re.search(suffix, value):
        value = re.sub(suffix, '', value).strip()
    return value


def load_registry():
    data = json.loads(REGISTRY.read_text(encoding='utf-8'))
    return {normalize_employer(alias): row for row in data['companies']
            for alias in [row['name'], *row.get('aliases', [])]}


EMPLOYERS = load_registry()


def mnc_employer(job):
    return EMPLOYERS.get(normalize_employer(job.get('company')))

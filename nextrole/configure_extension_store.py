"""Set the real store listing after Partner Center assigns it; no credentials needed."""
import argparse,json
from pathlib import Path
from urllib.parse import urlsplit
parser=argparse.ArgumentParser();parser.add_argument('--store-url',required=True);args=parser.parse_args()
url=urlsplit(args.store_url)
if url.scheme!='https' or url.netloc!='microsoftedge.microsoft.com' or not url.path.startswith('/addons/detail/') or url.username or url.password:parser.error('Use the real Microsoft Edge Add-ons listing URL.')
path=Path(__file__).parent/'dist/extension-settings.json';data=json.loads(path.read_text(encoding='utf-8'));data['storeUrl']=args.store_url;path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print('Store URL saved. Rebuild the extension and deploy the updated website configuration.')

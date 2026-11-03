"""Package only the explicitly listed public extension code; never applicant data."""
from pathlib import Path
import json,hashlib,re
from urllib.parse import urlsplit
from zipfile import ZipFile,ZIP_DEFLATED
ROOT=Path(__file__).parent
FILES=('manifest.json','popup.html','popup.css','popup.js','form-engine.js','autofill-parser.js','autofill-history.js','documents.js','extension-config.js','site-bridge.js','background.js','confirm.html','confirm.js','README.md',*[f'icons/icon{n}.png' for n in [16,32,48,128]])
def settings():
    data=json.loads((ROOT/'dist/extension-settings.json').read_text(encoding='utf-8'))
    url=urlsplit(data['productionOrigin'])
    if url.scheme!='https' or not url.hostname or url.username or url.password or url.path or url.query or url.fragment or url.port:raise ValueError('Use an exact HTTPS production origin without a path or credentials.')
    if data.get('storeUrl'):
        store=urlsplit(data['storeUrl'])
        if store.scheme!='https' or store.netloc!='microsoftedge.microsoft.com' or not store.path.startswith('/addons/detail/'):raise ValueError('Use the assigned Microsoft Edge Add-ons listing URL.')
    return data
def config(data,release=False):
    return 'globalThis.NextRoleExtensionConfig=Object.freeze('+json.dumps({**data,'allowedOrigins':[data['productionOrigin']] if release else [data['productionOrigin'],'http://localhost:8080','http://127.0.0.1:8080']},separators=(',',':'))+');\n'
if __name__=='__main__':
    data=settings();public=config(data)
    (ROOT/'dist/extension-config.js').write_text(public,encoding='utf-8')
    client=ROOT/'dist/extension-client.mjs'
    if client.exists():
        source=client.read_text(encoding='utf-8');source=re.sub(r'extension-config\.js\?v=[^\x27]+','extension-config.js?v='+hashlib.sha256(public.encode()).hexdigest()[:12],source);client.write_text(source,encoding='utf-8')
    (ROOT/'browser-extension/extension-config.js').write_text(public,encoding='utf-8')
    for name in ['autofill-parser.js','autofill-history.js']:
        (ROOT/'browser-extension'/name).write_bytes((ROOT/'dist'/name).read_bytes())
    output=ROOT/'dist/nextrole-autofill-edge.zip'
    with ZipFile(output,'w',ZIP_DEFLATED) as archive:
        for name in FILES:archive.write(ROOT/'browser-extension'/name,name)
    print('Built public Edge extension package: '+str(output))
    release=ROOT/'extension-release';release.mkdir(exist_ok=True)
    output=release/'NextRole-Edge-Addons.zip'
    manifest=json.loads((ROOT/'browser-extension/manifest.json').read_text(encoding='utf-8'))
    manifest['content_scripts'][0]['matches']=[data['productionOrigin']+'/*']
    with ZipFile(output,'w',ZIP_DEFLATED) as archive:
        for name in FILES:
            if name=='manifest.json':archive.writestr(name,json.dumps(manifest,indent=2)+'\n')
            elif name=='extension-config.js':archive.writestr(name,config(data,release=True))
            else:archive.write(ROOT/'browser-extension'/name,name)
    print('Built store submission package (production origin only): '+str(output))

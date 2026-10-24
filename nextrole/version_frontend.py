"""Keep the static frontend module graph on one cache-busting release version."""
from pathlib import Path
import re
import sys
version=sys.argv[1]
if not re.fullmatch(r'\d+',version):raise SystemExit('Use an integer frontend version.')
root=Path(__file__).with_name('dist')
pattern=re.compile(r'''(?P<q>['"])(?P<path>\./[^'"]+\.mjs)(?:\?v=[^'"]+)?(?P=q)''')
for path in [root/'app.js',*root.glob('*.mjs')]:
    source=path.read_text(encoding='utf-8-sig')
    source=pattern.sub(lambda m:f'{m["q"]}{m["path"]}?v={version}{m["q"]}',source)
    path.write_text(source,encoding='utf-8')
path=root/'index.html';source=path.read_text(encoding='utf-8-sig')
source=re.sub(r'app\.js\?v=\d+',f'app.js?v={version}',source)
path.write_text(source,encoding='utf-8')
print(f'Frontend entrypoint and module imports updated to version {version}.')

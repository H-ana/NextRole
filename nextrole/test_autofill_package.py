import json
from pathlib import Path
from zipfile import ZipFile
import unittest
from build_autofill_extension import FILES

class AutofillPackageTests(unittest.TestCase):
    def test_public_package_has_only_extension_code_and_minimal_permissions(self):
        root=Path(__file__).parent
        with ZipFile(root/'dist/nextrole-autofill-edge.zip') as archive:
            self.assertEqual(set(archive.namelist()),set(FILES))
            manifest=json.loads(archive.read('manifest.json'))
            self.assertEqual(set(manifest['permissions']),{'activeTab','scripting','storage'})
            self.assertNotIn('host_permissions',manifest)
            self.assertEqual(manifest['background']['service_worker'],'background.js')
            matches=manifest['content_scripts'][0]['matches']
            self.assertEqual(set(matches),{'https://nextrole-job-match.blueowl129.chatgpt.site/*','http://localhost/*','http://127.0.0.1/*'})
            self.assertFalse(manifest['content_scripts'][0]['all_frames'])
            self.assertNotIn('optional_host_permissions',manifest)
            self.assertEqual(archive.read('autofill-parser.js'),(root/'dist/autofill-parser.js').read_bytes())
            for name in ['popup.js','form-engine.js','autofill-parser.js','autofill-history.js','documents.js','background.js','site-bridge.js','confirm.js']:
                source=archive.read(name).decode()
                for forbidden in ['fetch(', 'XMLHttpRequest', 'eval(', 'new Function', '.submit(', '.requestSubmit(']:self.assertNotIn(forbidden,source)
        with ZipFile(root/'extension-release/NextRole-Edge-Addons.zip') as archive:
            self.assertEqual(set(archive.namelist()),set(FILES))
            manifest=json.loads(archive.read('manifest.json'))
            self.assertEqual(manifest['content_scripts'][0]['matches'],['https://nextrole-job-match.blueowl129.chatgpt.site/*'])
            self.assertNotIn('localhost',archive.read('extension-config.js').decode())
            for size in [16,32,48,128]:
                data=archive.read(f'icons/icon{size}.png');self.assertEqual(data[:8],b'\x89PNG\r\n\x1a\n')
                self.assertEqual(int.from_bytes(data[16:20],'big'),size)

if __name__=='__main__':unittest.main()

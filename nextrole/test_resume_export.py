import base64
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import zipfile
import io
import xml.etree.ElementTree as ET
from resume_export import build_compact_docx, extracted_text, export_one_page, ResumeExportError

TEXT='Alex Example\nalex@example.com | Bengaluru\n\nSUMMARY\nFinance analyst experienced in reconciliation and SQL reporting.\nEXPERIENCE\nAnalyst, Example Co | 2022–2024\n- Automated reconciliation workflows; reduced reporting time by 20%.\nEDUCATION\nBCom, Example University\nSKILLS\nSQL, Excel\nUnicode: résumé — हिंदी & <tag>'


class ExportTests(unittest.TestCase):
    def test_compact_docx_preserves_content_and_uses_simple_readable_styles(self):
        data=build_compact_docx(TEXT)
        self.assertEqual(extracted_text(data).rstrip('\n'),TEXT)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertIsNone(archive.testzip())
            for name in archive.namelist():ET.fromstring(archive.read(name))
            xml=archive.read('word/document.xml').decode();styles=archive.read('word/styles.xml').decode()
        self.assertNotIn('<w:tbl',xml);self.assertNotIn('<w:drawing',xml)
        self.assertIn('Calibri',styles);self.assertNotIn('Arial Narrow',styles);self.assertIn('w:sz w:val="22"',styles)
        self.assertIn('w:val="Title"',xml);self.assertIn('w:val="Heading1"',xml)
        with self.assertRaises(ResumeExportError):build_compact_docx('')

    def renderer(self,**meta):
        def run(*args,**kwargs):
            env=kwargs['env'];self.assertNotIn('GEMINI_API_KEY',env)
            Path(env['NEXTROLE_EXPORT_RESULT']).write_text(json.dumps({'rendered_text':TEXT,'font':'Calibri',**meta}),encoding='utf-8')
        return run

    def test_success_requires_real_pagination_result_and_keeps_text(self):
        with patch('resume_export.subprocess.run',side_effect=self.renderer(pages=1,font_size=10.5)):
            result=export_one_page(TEXT)
        self.assertEqual(result['pages'],1);self.assertEqual(result['font_size'],10.5)
        self.assertEqual(extracted_text(base64.b64decode(result['base64'])).rstrip('\n'),TEXT)

    def test_multiple_pages_or_tiny_type_never_yield_download(self):
        for meta in ({'pages':2,'font_size':10},{'pages':1,'font_size':8},{'error':'unavailable'}):
            with patch('resume_export.subprocess.run',side_effect=self.renderer(**meta)):
                with self.assertRaises(ResumeExportError):export_one_page(TEXT)
        with patch('resume_export.subprocess.run',side_effect=self.renderer(error='overflow',pages=3)):
            with self.assertRaisesRegex(ResumeExportError,'No content was removed'):export_one_page(TEXT)

    def test_content_changes_from_renderer_are_rejected(self):
        def change(*args,**kwargs):
            env=kwargs['env'];Path(env['NEXTROLE_EXPORT_INPUT']).write_bytes(build_compact_docx(TEXT.replace('20%','80%')))
            Path(env['NEXTROLE_EXPORT_RESULT']).write_text(json.dumps({'pages':1,'font_size':11,'font':'Calibri','rendered_text':TEXT}),encoding='utf-8')
        with patch('resume_export.subprocess.run',side_effect=change):
            with self.assertRaisesRegex(ResumeExportError,'content change'):export_one_page(TEXT)

    def test_word_reading_order_and_actual_font_must_match(self):
        for meta in ({'rendered_text':TEXT.replace('SUMMARY','MISSING')},{'font':'Arial Narrow'}):
            with patch('resume_export.subprocess.run',side_effect=self.renderer(pages=1,font_size=11,**meta)):
                with self.assertRaises(ResumeExportError):export_one_page(TEXT)


if __name__=='__main__':unittest.main()

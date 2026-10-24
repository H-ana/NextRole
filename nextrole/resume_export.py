"""Compact, fact-preserving DOCX export with an actual Word pagination check."""
import base64
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import zipfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
from resume_structure import HEADINGS as SECTION_HEADINGS

EXPORT_LOCK=threading.Lock()
SCRIPT=Path(__file__).with_name('fit_resume.ps1')
HEADINGS=re.compile(r'^(?:relevant skills|professional summary|summary|experience|work experience|professional experience|employment history|education|skills|technical skills|projects|certifications|achievements|publications|languages)\s*:?$',re.I)
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


class ResumeExportError(Exception):pass


def clean_text(text):
    if not isinstance(text,str) or not text.strip() or len(text)>60000:raise ResumeExportError('Provide a resume draft of up to 60,000 characters.')
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',text.replace('\r\n','\n').replace('\r','\n'))


def build_compact_docx(text):
    text=clean_text(text);paragraphs=[];first=True
    for line in text.split('\n'):
        heading=bool(HEADINGS.fullmatch(line.strip()))
        style='Spacer' if not line.strip() else 'Heading1' if heading else 'Title' if first and len(line)<100 and '@' not in line else 'Normal'
        if line.strip():first=False
        paragraphs.append(f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr><w:r><w:t xml:space="preserve">{escape(line)}</w:t></w:r></w:p>')
    document='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="'+NS['w']+'"><w:body>'+''.join(paragraphs)+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>'
    styles='''<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="000000"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="10" w:line="240" w:lineRule="auto"/><w:widowControl w:val="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="60" w:after="30"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="2"/></w:rPr></w:style></w:styles>'''
    files={'word/document.xml':document,'word/styles.xml':styles,
           '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
           '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
           'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'}
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,content in files.items():archive.writestr(name,content.encode('utf-8'))
    return output.getvalue()


def extracted_text(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:root=ET.fromstring(archive.read('word/document.xml'))
    pieces=[]
    for paragraph in root.findall('w:body/w:p',NS):
        for node in paragraph.iter():
            if node.tag=='{'+NS['w']+'}t':pieces.append(node.text or '')
            elif node.tag in ('{'+NS['w']+'}tab','{'+NS['w']+'}br'):pieces.append(' ')
        pieces.append('\n')
    return ''.join(pieces)


def validate_export(text,data,meta):
    """Cross-check the approved draft, saved OOXML and Word's rendered text."""
    normalize=lambda value:' '.join(value.split())
    saved=extracted_text(data);rendered=meta.get('rendered_text')
    if not isinstance(rendered,str) or meta.get('font')!='Calibri':
        raise ResumeExportError('The Word renderer did not return Calibri and reading-order verification. Restart the backend and retry.')
    if normalize(saved)!=normalize(text) or normalize(rendered)!=normalize(text):
        raise ResumeExportError('The formatting check found a content change or reading-order mismatch. Export stopped; your original draft is unchanged.')
    contacts=re.findall(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https?://[^\s|]+|\+?\d[\d ()-]{7,}\d',text)
    headings=[line.strip() for line in text.splitlines() if SECTION_HEADINGS.fullmatch(line.strip())]
    checks={'content_preserved':True,'reading_order_preserved':True,
            'contact_preserved':all(normalize(c) in normalize(rendered) for c in contacts),
            'sections_preserved':all(normalize(h) in normalize(rendered) for h in headings)}
    if not all(checks.values()):raise ResumeExportError('Contact details or sections did not pass the document checks. Your draft is unchanged.')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        root=ET.fromstring(archive.read('word/document.xml'))
        if root.findall('.//w:tbl',NS) or root.findall('.//w:drawing',NS):raise ResumeExportError('The export contains an unexpected layout element.')
    return checks


def export_one_page(text,preview=False):
    text=clean_text(text)
    if os.name!='nt':raise ResumeExportError('One-page Word verification requires Microsoft Word on this local Windows backend.')
    if not EXPORT_LOCK.acquire(blocking=False):raise ResumeExportError('Another resume is being formatted. Please try again shortly.')
    try:
        with tempfile.TemporaryDirectory(prefix='nextrole-resume-') as folder:
            folder=Path(folder);docx=folder/'resume.docx';result=folder/'result.json';pdf=folder/'preview.pdf'
            docx.write_bytes(build_compact_docx(text))
            env=dict(os.environ)
            for key in ('GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','JSEARCH_API_KEY'):env.pop(key,None)
            env.update(NEXTROLE_EXPORT_INPUT=str(docx),NEXTROLE_EXPORT_RESULT=str(result),NEXTROLE_EXPORT_PREVIEW=str(pdf) if preview else '')
            try:
                subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command','-'],input=SCRIPT.read_text(encoding='utf-8')+'\n\n',text=True,encoding='utf-8',capture_output=True,env=env,cwd=folder,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                meta=json.loads(result.read_text(encoding='utf-8-sig'))
            except (OSError,ValueError,subprocess.TimeoutExpired):
                raise ResumeExportError('Could not verify the one-page layout. Start the backend from your Windows PowerShell session with Microsoft Word available, then retry. Your draft is unchanged.') from None
            if meta.get('error')=='overflow':raise ResumeExportError('The draft is too long to fit one readable page at 10-point type. Shorten repeated wording while preserving qualifications and experience, then retry. No content was removed.')
            if meta.get('pages')!=1 or not 10<=meta.get('font_size',0)<=11:raise ResumeExportError('Microsoft Word could not verify a one-page layout. Your draft is unchanged; no download was created.')
            data=docx.read_bytes()
            checks=validate_export(text,data,meta)
            response={'base64':base64.b64encode(data).decode('ascii'),'pages':1,'font':meta['font'],'font_size':meta['font_size'],'verified_with':'Microsoft Word','checks':checks}
            if preview and pdf.exists():response['preview_pdf']=base64.b64encode(pdf.read_bytes()).decode('ascii')
            return response
    finally:EXPORT_LOCK.release()


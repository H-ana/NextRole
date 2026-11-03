"""Local-only LibreOffice PDF verification; no server or network listener."""
import argparse,re,shutil,subprocess,tempfile,zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

def docx_text(path):
 with zipfile.ZipFile(path) as z:
  for name in z.namelist():
   if 'vbaproject' in name.lower() or '/embeddings/' in name.lower():raise ValueError('Use a plain NextRole DOCX without embedded code or objects.')
   if name.endswith('.rels'):
    if z.getinfo(name).file_size>200000:raise ValueError('Relationships too large')
    rel=ET.fromstring(z.read(name))
    if any(r.get('TargetMode')=='External' for r in rel):raise ValueError('Use a NextRole DOCX without external resource relationships.')
  if z.getinfo('word/document.xml').file_size>2_000_000:raise ValueError('Document too large')
  doc=ET.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
  return '\n'.join(''.join(node.itertext()) for node in doc.findall('.//w:body/w:p',ns))
def validate_pdf(path,expected):
 from pypdf import PdfReader
 reader=PdfReader(path)
 if len(reader.pages)!=1:raise ValueError(f'Rendered PDF has {len(reader.pages)} pages. Approve wording reductions and export again. Nothing was deleted.')
 actual='\n'.join(p.extract_text() or '' for p in reader.pages)
 normalize=lambda s:re.sub(r'\s+','',s).replace('\u00ad','')
 if normalize(actual)!=normalize(expected):raise ValueError('Rendered PDF text differs from the approved DOCX. Export blocked; inspect the original.')
 return {'pages':1,'content_preserved':True,'renderer':'LibreOffice (not Microsoft Word)'}
def render(source,output,executable=None):
 source=Path(source).resolve();output=Path(output).resolve()
 if source.suffix.lower()!='.docx' or not source.is_file():raise ValueError('Choose a DOCX file.')
 if output.suffix.lower()!='.pdf' or output.exists():raise ValueError('Choose a new .pdf output path; existing files are not overwritten.')
 expected=docx_text(source);office=executable or shutil.which('soffice') or shutil.which('libreoffice')
 if not office:
  candidate=Path('C:/Program Files/LibreOffice/program/soffice.exe');office=str(candidate) if candidate.exists() else None
 if not office:raise ValueError('Install LibreOffice from https://www.libreoffice.org/ first.')
 with tempfile.TemporaryDirectory(prefix='nextrole-render-') as folder:
  profile=(Path(folder)/'profile').as_uri();subprocess.run([office,'-env:UserInstallation='+profile,'--headless','--convert-to','pdf','--outdir',folder,str(source)],check=True,timeout=120,capture_output=True)
  pdf=Path(folder)/(source.stem+'.pdf')
  if not pdf.exists():raise ValueError('LibreOffice did not produce a PDF.')
  checks=validate_pdf(pdf,expected);output.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(pdf,output);return checks
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('docx');parser.add_argument('pdf');parser.add_argument('--libreoffice');args=parser.parse_args()
 try:print(render(args.docx,args.pdf,args.libreoffice))
 except Exception as error:print('Export stopped:',error);raise SystemExit(1)

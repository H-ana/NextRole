import sys,json,base64,io,zipfile,xml.etree.ElementTree as ET
data=json.load(sys.stdin)
with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['base64']))) as z:
    assert z.testzip() is None
    for name in z.namelist(): ET.fromstring(z.read(name))
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    doc=ET.fromstring(z.read('word/document.xml'))
    paragraphs=[''.join(p.itertext()) for p in doc.findall('w:body/w:p',ns)]
    assert '\n'.join(paragraphs)==data['text']
    assert not doc.findall('.//w:tbl',ns)
    assert not doc.findall('.//w:drawing',ns)
    from docx import Document
    word=Document(io.BytesIO(base64.b64decode(data['base64'])))
    assert '\n'.join(p.text for p in word.paragraphs)==data['text']
print('Passed: ZIP CRCs, all OOXML parts parse, python-docx opens document, exact text and Unicode preserved, single-column body without tables/images.')

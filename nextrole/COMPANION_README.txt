NextRole optional local document companion

1. Install Python 3.10+ and LibreOffice from their official websites:
   https://www.python.org/downloads/
   https://www.libreoffice.org/
2. In your own terminal, install the free PDF parser:
   python -m pip install pypdf
3. Generate your reviewed DOCX in NextRole, then run:
   python companion.py approved-resume.docx checked-resume.pdf

The companion has no network listener and uploads nothing. It uses a temporary
LibreOffice profile and discards temporary render files. It only writes the requested
new PDF when it is one page and extracted text matches the DOCX in reading order.
It never deletes resume content or overwrites an existing output file.

This checks LibreOffice rendering, not Microsoft Word or an employer's ATS.
Font substitution can occur if Calibri is absent. Install a licensed Calibri font
if you need it; this package does not include fonts or Microsoft software.
If text extraction differs (even for a harmless rendering difference), export stops.
Your original DOCX remains untouched. Use the browser print preview as the simpler
alternative if you do not want to install the companion.

Use a plain NextRole-generated DOCX. Embedded objects, macros and external resource
relationships are rejected; the companion does not support arbitrary Office files.

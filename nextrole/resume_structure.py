"""Conservative structural boundaries for fact-preserving resume suggestions."""
import re

HEADINGS = re.compile(r'^(profile|summary|professional summary|career objective|objective|experience|work experience|professional experience|employment history|projects|education|skills|technical skills|relevant skills|certifications|certificates|qualifications|licenses|achievements|publications|languages)\s*:?$', re.I)
ACTION = re.compile(r'^(?:[-*•–]\s+)?(?:built|developed|created|implemented|automated|analy[sz]ed|validated|supported|contributed|maintained|designed|delivered|optimized|managed|collaborated|tested|resolved|improved|reduced|led|worked|used|assisted|prepared|processed|reconciled|integrated|deployed|gained)\b', re.I)
CONTACT = re.compile(r'https?://|@|linkedin\.com|\+?\d[\d ()-]{7,}')


def structure(resume):
    lines=resume.split('\n'); sections=[]; current=None
    for i,line in enumerate(lines):
        if HEADINGS.fullmatch(line.strip()):
            if current:current['end']=i
            current={'heading':line.strip().rstrip(':').lower(),'start':i,'end':len(lines)};sections.append(current)
    editable=[];summary=[];groups=[]
    for section in sections:
        kind=section['heading'];start,end=section['start']+1,section['end']
        if kind in ('profile','summary','professional summary','career objective','objective'):
            summary=[i for i in range(start,end) if lines[i].strip() and not CONTACT.search(lines[i]) and not re.search(r'\b(?:19|20)\d{2}\b',lines[i])]
            editable.extend(summary)
        elif kind in ('experience','work experience','professional experience','employment history','projects'):
            entries=[];active=None
            for i in range(start,end):
                text=lines[i].strip()
                if not text:continue
                if not ACTION.match(text) and not re.match(r'^[-*•–]\s+',text):
                    # A short non-action line is an entry boundary, never editable.
                    if len(text)<=160:
                        if active:active['end']=i
                        active={'start':i,'end':end,'lines':[]};entries.append(active)
                    continue
                if active and len(text)>=12 and not CONTACT.search(text) and not re.search(r'\b(?:19|20)\d{2}\b',text):
                    editable.append(i);active['lines'].append(i)
            for entry in entries:
                if len(entry['lines'])>1:groups.append({'id':f'bullets-{entry["start"]}','kind':'bullets','label':lines[entry['start']],'items':[[i] for i in entry['lines']]})
            if kind=='projects' and len(entries)>1:
                groups.append({'id':f'projects-{section["start"]}','kind':'projects','label':'Project order','items':[list(range(e['start'],e['end'])) for e in entries]})
    return {'lines':lines,'sections':sections,'summary_indices':summary,'editable_indices':sorted(set(editable)),'ordering_groups':groups}


def protected_terms(text):
    """Numbers and explicit proficiency/ownership terms may not be strengthened."""
    return re.findall(r'\b(?:expert|advanced|intermediate|beginner|exposure|familiar|supported|assisted|led|leadership)\b',text.lower())

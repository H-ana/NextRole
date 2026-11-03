"""Evidence coverage scores, never normalized against other applicants/jobs."""
import re

VERSION='qualifications-v1'
METADATA=re.compile(r'^(?:work (?:mode|style|arrangement)|locations?|experience range|job title|salary|compensation)\s*:',re.I)
def normal(text):return re.sub(r'\s+',' ',str(text or '')).strip().lower()

def statements(description):
    """Conservative qualification inventory; retain exact source spans."""
    section=None;result=[]
    # Platform descriptions often flatten HTML lists. Split only at explicit headings,
    # retaining exact substrings; never repair mangled numbers or invent punctuation.
    boundary=r'(?=\b(?:Locations?|Work mode|Experience range|Languages|Frameworks|LLMs|Vector Databases|Cloud Platforms|DevOps & CI/CD|Monitoring Tools|Other Tools)\s*:)|(?=\b(?:Job Description|Technical Skills|Qualifications|Strong understanding of|Excellent problem-solving)\b)'
    for raw in re.split(r'\n|(?<=[.!?])\s+(?=[A-Z])|;|'+boundary,description):
        line=raw.strip()
        if not line:continue
        if METADATA.match(line):continue
        heading=re.sub(r'^[\s*•●-]+','',line).strip().rstrip(':').lower()
        if re.fullmatch(r'(?:minimum |basic |required |essential |key )?(?:qualifications|requirements|skills|skills and experience|what you bring|what you.ll bring|what you need|who you are)',heading):section='required';continue
        if re.fullmatch(r'(?:preferred|desired|nice.to.have)(?: qualifications| requirements| skills)?',heading):section='preferred';continue
        if re.fullmatch(r'(?:responsibilities|benefits|about us|about the company|what we offer|salary|compensation|equal opportunity)',heading):section=None;continue
        importance='preferred' if re.search(r'\b(?:preferred|nice.to.have|bonus|desirable)\b',line,re.I) else section
        if importance is None and re.search(r'\b(?:required|requires|must have|must possess|mandatory|proficien\w*|expertise in|experience (?:in|with)|bachelor|master|certification|frameworks|llms|vector databases|cloud platforms|monitoring tools|other tools|strong understanding|excellent problem.solving)\b',line,re.I):importance='required'
        # Total years have a dedicated reviewed criterion; do not count twice.
        if re.fullmatch(r'(?:requires?|minimum|at least)?\s*\d+(?:\s*[-–+]\s*\d*)?\s+years?\s+(?:of )?experience[.!]?',line,re.I):continue
        if importance and len(line)>=8 and normal(line) not in {normal(r['quote']) for r in result}:
            result.append({'quote':line,'importance':importance})
    return result

def complete_inventory(item,description):
    requirements=item.setdefault('requirements',[])
    for row in statements(description):
        # A tiny fragment such as "Python" cannot cover an entire qualification.
        covered=any(normal(row['quote']) in normal(r.get('job_quote')) and r.get('importance')==row['importance'] for r in requirements)
        if not covered:
            requirements.append({'requirement':row['quote'],'category':'skill','importance':row['importance'],'status':'unknown','job_quote':row['quote'],'resume_quote':''})

def calculate(item):
    groups={}
    for r in item.get('requirements',[]):
        # One source statement counts once, and all assessed parts must be supported.
        key=(r.get('importance'),normal(r.get('job_quote')) or normal(r.get('requirement')))
        groups.setdefault(key,[]).append(r.get('status','unknown'))
    def counts(importance):
        values=[v for (kind,_),v in groups.items() if kind==importance]
        return {'total':len(values),'supported':sum(all(s=='supported' for s in v) for v in values),
                'partial':sum('partial' in v and not any(s in ('unknown','missing') for s in v) for v in values),
                'missing':sum('missing' in v for v in values),'unclear':sum('unknown' in v and 'missing' not in v for v in values)}
    required=counts('required');preferred=counts('preferred')
    # Stated years are reviewed independently, even when no numeric inventory line exists.
    required['total']+=1
    field={'meets':'supported','gap':'missing'}.get(item.get('experience'),'unclear')
    required[field]+=1
    score=int(100*required['supported']/required['total']) if required['total']>1 else None
    return {'version':VERSION,'score':score,'required':required,'preferred':preferred,
            'basis':'Fully supported mandatory source statements plus experience. Partial, missing and unclear count as unmet; preferred criteria are separate. Automated coverage is not an eligibility guarantee.'}

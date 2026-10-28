"""Source-backed experience bands for recommendations; no model or title inference."""
import re

VERSION='strict-experience-v2'
NUMBER=r'\d{1,2}(?:\.\d+)?'
YEARS=r'(?:years?|yrs?)(?:[\u2019\u0027])?'
BAND=rf'(?P<low>{NUMBER})(?:\s*(?:[-\u2013\u2014]|to)\s*(?P<high>{NUMBER}))?\s*(?P<plus>\+)?\s*{YEARS}'
AFTER=re.compile(rf'\b{BAND}\s+(?:of\s+)?(?:[A-Za-z][\w/+,&()-]*\s+){{0,14}}?experience\b',re.I)
BEFORE=re.compile(rf'\bexperience\s*(?:(?:required|range|level|needed|of|is)\s*)?[:=\u2013\u2014-]?\s*{BAND}\b',re.I)
ROLE=re.compile(rf'^\s*(?:[\u2022\u25cf*-]\s*)?(?:minimum\s+(?:of\s+)?|at least\s+)?{BAND}\s+(?:in|as|working|building|developing|managing)\b.+',re.I)
ONLY=re.compile(rf'^\s*(?:[\u2022\u25cf*-]\s*)?{BAND}\s*[.]?$',re.I)
OPTIONAL=re.compile(r'\b(?:preferred|preferably|nice.to.have|bonus|desirable|advantage|not required|not mandatory)\b',re.I)
COMPANY=re.compile(r'\b(?:we|our (?:company|team)|the company|our business)\s+(?:have|has|bring|brings)|\b(?:combined|collective|since \d{4}|founded|serving (?:clients|customers))\b',re.I)


def requirement(description):
    if not isinstance(description,str):return {'status':'unknown','reason':'No readable job description'}
    found=[];section='';ambiguous=False
    for raw in re.split(r'\n|(?<=[.!?])\s+(?=[A-Z])|;',description):
        line=raw.strip()
        if not line:continue
        heading=re.sub(r'^[-\u2022*\s]+','',line).strip().rstrip(':').lower()
        if re.fullmatch(r'(?:minimum |basic |required |essential |key )?(?:qualifications|requirements|experience|skills and experience|what you bring|what you.ll bring)',heading):section='required';continue
        if re.fullmatch(r'(?:preferred|desired|nice.to.have)(?: qualifications| requirements| skills)?',heading):section='preferred';continue
        if re.fullmatch(r'(?:responsibilities|benefits|about (?:us|the company)|what we offer|salary|compensation)',heading):section='';continue
        if COMPANY.search(line):continue
        optional=OPTIONAL.search(line) or section=='preferred'
        if re.search(r'\bno (?:prior |previous |professional |work )?experience (?:is )?(?:required|necessary|needed)\b|\bfreshers? (?:are )?(?:welcome|eligible)\b',line,re.I):
            found.append((0.,None,line));continue
        matches=list(AFTER.finditer(line))+list(BEFORE.finditer(line))
        if not matches and (section=='required' or re.search(r'\b(?:role|development|engineering|support|software|sales|design|analytics)\b',line,re.I)):
            match=ROLE.search(line) or (ONLY.search(line) if section=='required' else None)
            if match:matches=[match]
        if not matches:continue
        if optional:continue
        if re.search(r'\bor\b|\bequivalent\b',line,re.I) and re.search(r'\b(?:degree|bachelor|master|ph\.?d|education)\b',line,re.I):ambiguous=True;continue
        for match in matches:
            low=float(match['low']);high=float(match['high']) if match['high'] else None
            if not 0<=low<=80 or high is not None and (high<low or high>80):ambiguous=True;continue
            if match['plus'] and high is not None:ambiguous=True;continue
            quote=line[max(0,match.start()-80):min(len(line),match.end()+100)].strip()
            found.append((low,high,quote))
    if ambiguous:return {'status':'unknown','reason':'Experience depends on an ambiguous or alternative qualification'}
    if not found:return {'status':'unknown','reason':'No explicit required experience band established'}
    if len(found)>20:return {'status':'unknown','reason':'Too many experience constraints for a focused automatic check'}
    # All mandatory constraints apply. Detect contradictory statements rather than picking one.
    low=max(row[0] for row in found);uppers=[row[1] for row in found if row[1] is not None]
    high=min(uppers) if uppers else None
    if high is not None and high<low:return {'status':'unknown','reason':'Conflicting experience requirements'}
    quote=next(row[2] for row in found if row[0]==low)
    quotes=list(dict.fromkeys(row[2] for row in found))
    return {'status':'known','minimum':low,'maximum':high,'quote':quote,'quotes':quotes,'policy_version':VERSION}


def assess(band,actual):
    if band.get('status')!='known':return None
    try:actual=float(actual)
    except (TypeError,ValueError):return None
    if not 0<=actual<=80:return None
    minimum=band['minimum'];maximum=band.get('maximum')
    shortfall=max(0,minimum-actual)
    if shortfall>0 or maximum is not None and actual>maximum:return None
    return {'status':'within-range','shortfall':0,'confirmed_years':actual,'policy_version':VERSION}

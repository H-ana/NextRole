"""Conservative, local classification of recruiter emails. No AI or mail mutations."""
import base64
from email.utils import parseaddr
from html.parser import HTMLParser
import re
import time
import unicodedata

def normalized(value):
    text=unicodedata.normalize('NFKC',str(value)).casefold()
    return ' '.join(re.findall(r'\w+',text))

def phrase(needle,haystack):return bool(needle) and (' '+normalized(needle)+' ') in (' '+normalized(haystack)+' ')

class MailText(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        blocked=tag in ('script','style','blockquote') or any(k=='class' and any(c in v for c in ('gmail_quote','yahoo_quoted','moz-cite-prefix')) for k,v in attrs if v)
        if tag not in ('br','hr','img','meta','input','link','wbr') and (self.skip or blocked):self.skip+=1
        if tag in ('p','div','br','li'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if self.skip and tag not in ('br','hr','img','meta','input','link','wbr'):self.skip-=1
        if tag in ('p','div','li'):self.parts.append('\n')
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def message_text(payload):
    plain=[];html=[]
    def visit(part):
        if part.get('filename'):return
        content=part.get('body',{}).get('data','')
        if content and len(content)<500_000:
            try:text=base64.urlsafe_b64decode(content+'='*(-len(content)%4)).decode('utf-8',errors='replace')[:65000]
            except (ValueError,TypeError):text=''
            if part.get('mimeType')=='text/plain':plain.append(text)
            elif part.get('mimeType')=='text/html':
                parser=MailText();parser.feed(text);html.append(''.join(parser.parts))
        for child in part.get('parts',[])[:30]:visit(child)
    visit(payload)
    text='\n'.join(plain or html)
    # Only the current message, not a quoted earlier invitation or rejection.
    text=re.split(r'(?im)^\s*(?:On .{3,200}wrote:|[-_]{2,}\s*(?:Original Message|Forwarded message)|From:\s)',text)[0]
    return '\n'.join(line for line in text.splitlines() if not line.lstrip().startswith('>'))[:65000]

REJECTION=re.compile(r"\b(?:reject(?:ed|ion)|not (?:able|going) to (?:proceed|progress|move forward)|decided against|not (?:been )?selected|not (?:be )?moving forward|not to (?:proceed|progress|move forward)|will not (?:be )?(?:proceed\w*|progress\w*|mov\w*)|won[’']?t (?:be )?(?:proceed\w*|progress\w*|mov\w*)|unsuccessful|regret to inform|(?:proceeding|moving forward|going) with other candidates?|(?:role|position) (?:is |has become )?no longer available|position (?:has been |is )?(?:filled|closed|withdrawn)|unable to (?:offer|proceed|move forward)|no longer (?:considering|proceeding)|not shortlisted|not successful|declin(?:e|ed|ing) your application)\b",re.I)
POSITIVE=[
 ('Recruiter outreach',re.compile(r'\b(?:came across your profile|impressed (?:by|with) your (?:profile|experience)|(?:are you|would you be) (?:open to|interested in) (?:a |an |the |discussing |exploring )?(?:new |job |career )?(?:opportunity|role|position)|like to (?:discuss|speak with you about) (?:a |an |the |our )?(?:job |career )?(?:opportunity|role|position))\b',re.I)),
 ('Offer',re.compile(r'\b(?:offer of employment|employment offer|offer letter|pleased to offer you|formal job offer)\b',re.I)),
 ('Interview invitation',re.compile(r'\b(?:interview invitation|invite you (?:to|for) (?:an? |the |a technical )?interview|invited (?:to|for) (?:an? |the )?interview|schedule (?:an? |the |your )?(?:technical |next )?interview|confirm your (?:interview|availability)|availability for (?:an? |the )?(?:call|interview)|interview (?:has been |is )?scheduled)\b',re.I)),
 ('Assessment / next step',re.compile(r'\b(?:please (?:complete|take|submit) (?:the |our |an? |your )?(?:online |technical )?(?:assessment|coding (?:test|challenge)|assignment)|you (?:have been|are|were) shortlisted|your application (?:has been |is )?shortlisted|proceed to (?:the )?next (?:round|stage)|move forward with your application|like to (?:discuss|speak with you about) your application)\b',re.I)),
]
POSITIVE.insert(0,('Interview invitation',re.compile(r'\b(?:your (?:technical |virtual |onsite |on-site )?interview (?:is confirmed|has been confirmed|will (?:be|take place))|(?:you (?:have been|are) )?shortlisted for (?:an? |the )?(?:technical )?interview|interview (?:details|confirmation) for (?:the |your )?(?:role|position))\b',re.I)))
POSITIVE.insert(0,('Interview invitation',re.compile(r"\b(?:(?:invite|inviting) you (?:to attend|to participate in|to|for) (?:an? |the |your )?(?:(?:technical|virtual|video|phone|onsite|on-site|hr|final|first|second|panel|coding) )*interview|(?:you (?:have been|are) )?selected for (?:an? |the |your )?(?:(?:technical|virtual|video|phone|onsite|on-site|hr|final|panel) )*interview|(?:we have |we've )scheduled (?:an? |the |your )?(?:technical )?interview|reschedule (?:the |your )?(?:technical )?interview|your (?:technical )?interview (?:has been |is )?rescheduled)\b",re.I)))
# Prefer a concrete next step over a general introduction in the same message.
POSITIVE.sort(key=lambda item:item[0]=='Recruiter outreach')
POSITIVE.append(('Recruiter outreach',re.compile(r'\b(?:please (?:share|send)(?: (?:with )?(?:me|us))? (?:your |an? )?(?:updated |latest )?(?:resume|cv)|(?:would you be|are you) (?:open to|interested in) [^\n.!?]{0,100}\b(?:role|position|job opportunity))\b',re.I)))

HIRING_CONTEXT=re.compile(r'\b(?:job|role|position|application|hiring|recruit(?:er|ing|ment)|candidate|career|employment|resume|cv|coding (?:test|challenge)|technical interview)\b',re.I)

def current_action_text(value):
    """Exclude hypothetical outcome clauses, rather than rejecting the whole mail."""
    text=' '.join(value.split())
    # Preserve actual decisions after a conditional preface: "If you have questions,
    # contact us. Your application was rejected" still contains a real rejection.
    hypothetical=re.compile(r"\b(?:if (?:(?:you|your application) (?:are |have been |were |is |has been )?|you['’]re |you['’]ve been )?(?:not )?(?:selected|shortlisted|successful)|should you (?:be |have been )?(?:selected|shortlisted|successful)|(?:(?:you|your application) )?(?:may|might) be (?:selected|shortlisted|invited))\b[^.!?;]*[.!?;]?",re.I)
    return hypothetical.sub(' ',text)

def classify_message(message,applications=(),own_email=''):
    headers={h.get('name','').lower():h.get('value','') for h in message.get('payload',{}).get('headers',[])}
    sender=headers.get('from','');address=parseaddr(sender)[1].lower()
    if not address or address==own_email.lower() or headers.get('list-id') or headers.get('precedence','').lower() in ('bulk','list'):return None
    if set(message.get('labelIds',[]))&{'SENT','DRAFT','SPAM','TRASH'}:return None
    subject=headers.get('subject','');body=message_text(message.get('payload',{}));text=subject+'\n'+body
    if re.search(r'\b(?:job alerts?|jobs for you|recommended jobs|daily job digest)\b',subject,re.I):return None
    action_body=current_action_text(body)
    if REJECTION.search(current_action_text(subject)) or REJECTION.search(action_body):return None
    # A reused subject such as "Re: Interview invitation" is not a new next step.
    category=next((label for label,pattern in POSITIVE if pattern.search(action_body)),None)
    if not category:return None
    try:received=int(message['internalDate'])/1000
    except (ValueError,TypeError,KeyError):return None
    if received<time.time()-90*86400:return None
    eligible=[a for a in applications if received>=a['applied_at']]
    references=[a for a in eligible if a.get('reference') and phrase(a['reference'],text)]
    matches=references or [a for a in eligible if phrase(a['company'],text+' '+sender) and phrase(a['role'],text)]
    non_hiring=re.search(r'\b(?:podcast|journalis[tm]|research study|admissions?|visa interview|media interview)\b',text,re.I)
    if non_hiring and not HIRING_CONTEXT.search(text):return None
    context=text if category=='Recruiter outreach' else text+' '+sender
    if not HIRING_CONTEXT.search(context):
        # A direct invitation need not repeat the words job/role or come from a
        # company domain. Exclude clear non-employment interview contexts.
        if category!='Interview invitation' or re.search(r'\b(?:podcast|journalis[tm]|research study|admissions?|visa interview|media interview)\b',context,re.I):return None
    return {'application_id':matches[0]['id'] if len(matches)==1 else '', 'message_id':message['id'],'thread_id':message.get('threadId',message['id']),
            'subject':subject[:300],'sender':sender[:400],'received_at':received,'category':category}

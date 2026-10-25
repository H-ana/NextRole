// Explainable checks on collected public adverts, not a fraud or hiring verdict.
const DAY=86400000;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dateMillis(value){
 if(typeof value==='number')return value>1e12?value:value*1000;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(value))return NaN;
 return Date.parse(value);
}
export function listingChecks(job,now=Date.now()){
 const text=String(job.description||''),signals=[];
 const add=(id,kind,title,detail,evidence='')=>signals.push({id,kind,title,detail,evidence});
 const sentences=text.split(/(?:[.!?]\s+|\n+)/).map(s=>s.trim()).filter(Boolean);
 const rules=[
  ['payment','Payment requested for a job',/\b(?:pay|payment|deposit|charge|fee)\b.{0,65}\b(?:registration|recruitment|application|training|equipment|security deposit|to (?:get|secure) (?:the |a )?job)\b|\b(?:registration|recruitment|application|training|equipment) (?:fee|payment|deposit)\b/i],
  ['transfer','Money-transfer or task-payment pattern',/\b(?:deposit|cash) (?:a |the |our )?(?:check|cheque)\b.{0,100}\b(?:send|transfer|return|buy)\b|\b(?:pay|deposit|send|transfer)\b.{0,65}\b(?:crypto(?:currency)?|gift cards?|unlock (?:tasks?|earnings?))\b/i],
  ['secrets','Sensitive credentials requested',/\b(?:send|share|provide|submit)\b.{0,60}\b(?:otp|one.time password|bank password|bank login|credit card (?:number|details)|cvv)\b/i],
  ['chat-only','Hiring restricted to messaging apps',/\b(?:interview|hiring|recruitment)\b.{0,60}\b(?:only|exclusively)\b.{0,30}\b(?:telegram|whatsapp|text|chat)\b/i],
 ];
 for(const [id,title,pattern] of rules){
  const quote=sentences.find(line=>pattern.test(line)&&!(/\b(?:never|do not|don't|will not|won't|no (?:[a-z]+ ){0,3}fees?|not required|beware|scams?|fraud|avoid|without)\b/i.test(line)));
  if(quote)add(id,'caution',title,'Check this request directly with the employer through independently found contact details before sharing information or paying.',quote.slice(0,350));
 }
 const personal=sentences.find(line=>/\b(?:apply|send|share|resume|cv|contact|recruiter)\b/i.test(line)&&/[\w.+-]+@(?:gmail|yahoo|outlook|hotmail|protonmail)\.com\b/i.test(line));
 if(personal)add('personal-email','verify','Personal email in recruiting instructions','A personal address needs independent verification; small employers and agencies may legitimately use one.',personal.slice(0,350));
 const published=dateMillis(job.date_posted);
 if(Number.isFinite(published)&&published<=now&&now-published>=60*DAY)add('old-date','freshness','Older advertised posting date',`The source reports a posting date at least ${Math.floor((now-published)/DAY)} days ago. Confirm this vacancy is still active; age alone does not establish a ghost job.`,String(job.date_posted));
 for(const [site,history] of Object.entries(job.site_history?.sites||{})){
  const first=Number(history.current_first_observed)*1000;
  if(first>0&&first<=now&&now-first>=60*DAY)add('observed-'+site,'freshness','Listing observed over multiple months',`NextRole first observed this listing on ${site} ${Math.floor((now-first)/DAY)} days ago. This is observation history, not proof of continuous hiring or reposting.`,new Date(first).toISOString().slice(0,10));
  const prior=(history.evidence||[]).filter(e=>Number(e.observed_at)>0&&Number(e.observed_at)*1000<=now-60*DAY);
  if(history.prior_postings>=2&&prior.length)add('repeat-'+site,'freshness','Possible recurring or reposted role',`NextRole observed ${history.prior_postings} other listing IDs with the same company and title on ${site}, including observations over 60 days ago. These may be separate vacancies or evergreen hiring.`,prior.map(e=>new Date(e.observed_at*1000).toISOString().slice(0,10)).join(', '));
 }
 const words=text.trim().split(/\s+/).filter(Boolean).length;
 if(words<80)add('description','info','Limited job details collected',`Only ${words} words are available here. This may be a short advert or incomplete collection. Check the original page for responsibilities and requirements.`,text.slice(0,220));
 const structuredSalary=[job.min_amount,job.max_amount].some(n=>typeof n==='number'&&Number.isFinite(n)&&n>0);
 const salaryInText=/(?:₹|\$|€|£|\b(?:INR|USD|EUR|GBP|Rs\.?))\s*[\d,]+|\b\d+(?:\.\d+)?\s*(?:LPA|lakhs? per annum|lacs? per annum)\b|\b(?:salary|pay|compensation)\b.{0,30}\d[\d,]*(?:\s*[-–]\s*\d[\d,]*)?/i.test(text);
 if(!structuredSalary&&!salaryInText)add('salary','info','Salary not found in collected listing','This is a transparency gap, not evidence of a scam. Ask for the compensation range.');
 return {signals,cautions:signals.filter(s=>s.kind==='caution').length,freshness:signals.filter(s=>s.kind==='freshness').length};
}
export function listingBadge(job){
 const checks=listingChecks(job);
 if(!checks.cautions&&!checks.freshness)return '';
 return `<button type="button" class="listing-check-badge ${checks.cautions?'caution':'freshness'}" data-detail="${escape(job.id)}">${checks.cautions?'⚑ Review scam signals':'◷ Check vacancy freshness'}</button>`;
}
export function eligibleListings(jobs,now=Date.now()){
 return jobs.filter(job=>{
  const checks=listingChecks(job,now);
  return checks.cautions===0&&checks.freshness===0;
 });
}
export function listingCheckPanel(job){
 const {signals}=listingChecks(job);
 const people=new URL('https://www.linkedin.com/search/results/people/');people.searchParams.set('keywords',`${job.company||''} recruiter`);
 return `<details class="listing-checks"><summary>Posting checks${signals.length?' · '+signals.length+(signals.length===1?' item to review':' items to review'):''}</summary><p>Based on collected text and available posting history. These checks do not confirm fraud, recruiter identity, or whether an employer intends to hire.</p>${signals.map(s=>`<article class="listing-signal ${s.kind}"><strong>${escape(s.title)}</strong><p>${escape(s.detail)}</p>${s.evidence?`<blockquote>${escape(s.evidence)}</blockquote>`:''}</article>`).join('')||'<p>No configured warning patterns found in the available data. This does not verify the job.</p>'}<p><strong>Recruiter identity: not independently verified.</strong> Missing profiles do not prove a person does not exist. Confirm their employment and this vacancy through the company’s official website or switchboard.</p><a href="${escape(people.href)}" target="_blank" rel="noopener noreferrer">Look up company recruiters ↗</a> · <a href="https://consumer.ftc.gov/articles/job-scams" target="_blank" rel="noopener noreferrer">Recognize job scams ↗</a></details>`;
}

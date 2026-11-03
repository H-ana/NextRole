// The backend derives bands from the original description. Never infer years from titles/scores.
const normalized=value=>String(value||'').replace(/\s+/g,' ').trim();
export function experienceFit(job,actual){
 if(typeof actual==='string'&&!actual.trim())return null;
 const band=job.experience_requirement;actual=Number(actual);
 // Legacy source-backed bands can be rechecked locally during backend rollout.
 if(!band||band.status!=='known'||!['minimum-experience-v3','strict-experience-v2','within-two-years-v1'].includes(band.policy_version)||!Number.isFinite(actual)||actual<0||actual>80)return null;
 const low=band.minimum,high=band.maximum;
 if(!Number.isFinite(low)||low<0||low>80||high!==null&&(!Number.isFinite(high)||high<low||high>80))return null;
 const quotes=band.quotes||[band.quote];
 if(!quotes.length||quotes.some(q=>!normalized(q)||!normalized(job.description).includes(normalized(q))))return null;
 const shortfall=Math.max(0,low-actual);
 if(shortfall>0)return null;
 return {shortfall:0,status:high!==null&&actual>high?'meets-minimum':'within-range'};
}
export function experienceLabel(job,actual){
 const fit=experienceFit(job,actual),band=job.experience_requirement;
 if(!fit)return '';
 const range=band.maximum===null?`${band.minimum}+`:`${band.minimum}–${band.maximum}`;
 return fit.status==='meets-minimum'?`Your confirmed ${actual} years meet the minimum ${band.minimum} years; the listing states ${range} years. Check the role level before applying.`:`Your confirmed ${actual} years fit the stated ${range} years; check the role-specific requirements.`;
}

// Unknown is a separate discovery group, never confirmed experience eligibility.
export function recommendationExperience(job,actual){
 const titleBand=String(job.title||'').match(/\b(\d+(?:\.\d+)?)\s*(?:[-–—]\s*\d+(?:\.\d+)?|\+)?\s*(?:years?|yrs?)\b/i);
 if(titleBand&&Number(actual)<Number(titleBand[1]))return null;
 const fit=experienceFit(job,actual);if(fit)return {...fit,group:'confirmed'};
 if(typeof actual==='string'&&!actual.trim()||!Number.isFinite(Number(actual))||Number(actual)<0||Number(actual)>80)return null;
 const band=job.experience_requirement;
 if(band?.status==='known')return null;
 if(band&&!(band.status==='unknown'&&/^No (?:explicit required experience band established|readable job description)/.test(band.reason||'')))return null;
 // Recheck legacy 'unknown' metadata against the original text before
 // allowing discovery. Preferred years and company-history years are not minima.
 let preferred=false;
 for(const raw of String(job.description||'').split(/\n|(?<=[.!?])\s+(?=[A-Z])/)){
  const line=raw.trim();
  if(/^(?:preferred|desired|nice.to.have)(?: qualifications| requirements| skills)?\s*:?$/i.test(line)){preferred=true;continue;}
  if(/^(?:minimum|basic|required|essential|key)?\s*(?:qualifications|requirements|experience|what you bring|what you.ll need|what you need|responsibilities)\s*:?$/i.test(line)){preferred=false;continue;}
  if(/\b(?:preferred|preferably|nice.to.have|bonus|desirable|advantage|not required|not mandatory)\b/i.test(line)||preferred&&!/\b(?:required|minimum|must have|at least)\b/i.test(line)||/\b(?:our company|the company|founded|combined|collective|serving clients)\b/i.test(line))continue;
  const pattern=/\b(\d{1,2}(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*\d{1,2}(?:\.\d+)?)?\s*\+?\s*(?:years?|yrs?)(?:['’])?\s+(?:of\s+)?(?:[A-Za-z][\w/+,&()-]*\s+){0,14}?experience\b|\bexperience\s*(?:(?:required|range|of|is)\s*)?[:=-]?\s*(\d{1,2}(?:\.\d+)?)(?:\s*[-–—]\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)/gi;
  for(const m of line.matchAll(pattern))if(Number(m[1]||m[2])>Number(actual))return null;
 }
 if(String(job.description||'').trim().length<80)return null;
 return {status:'not-specified',group:'unknown',shortfall:null};
}

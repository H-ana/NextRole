import {CATALOG,contains} from './resume-tools.mjs?v=113';
// Check explicit mandatory technical/degree requirements against original text.
// eligible means retained as a recommendation, not certified employer eligibility.
// Unconfirmed foundational/soft skills remain review items, never invented facts.
export function qualificationFit(job,resume){
 const supports=term=>String(resume).split(/[\n.!?]/).some(line=>contains(line,term)&&!/\b(?:no experience|not experienced|never used|no hands-on|lack experience|not proficient|not familiar)\b/i.test(line));
 const nonBlocking=new Set(['Communication','Agile','Git','Project Management']);
 const lines=String(job.description||'').split(/\n|[•●▪]/).map(s=>s.trim()).filter(Boolean);let required=false;const checked=[],gaps=[],review=[];
 const titleTerms=CATALOG.filter(t=>['JavaScript','TypeScript','React','Node.js','Python','SQL','PostgreSQL','Java','AWS','Docker','Kubernetes','Go','Rust','C++','C#','HTML','CSS'].includes(t)&&contains(job.title||'',t));const titleMissing=titleTerms.filter(t=>!supports(t));if(titleMissing.length&&(!/\bor\b|\//i.test(job.title||'')||titleMissing.length===titleTerms.length))gaps.push({quote:job.title,missing:titleMissing});
 for(const line of lines){
  if(/^(?:preferred|desirable|nice to have|bonus|what we offer|benefits|responsibilities|what you.ll do)\b/i.test(line)){required=false;continue;}
  if(/^(?:minimum qualifications|required qualifications|basic qualifications|required skills|requirements|what you.ll bring|qualifications|required)\s*:?$/i.test(line)){required=true;continue;}
  if(!required&&!/\b(?:must have|must possess|required|mandatory|minimum qualifications)\b/i.test(line))continue;
  if(/\b(?:preferred|nice to have|optional|a plus|advantageous|added advantage|an advantage)\b/i.test(line))continue;
  const detected=CATALOG.filter(term=>contains(line,term));for(const term of detected.filter(t=>nonBlocking.has(t)&&!supports(t)))review.push({quote:line,unconfirmed:[term]});
  const terms=detected.filter(term=>!nonBlocking.has(term));
  if(terms.length){
   const missing=terms.filter(term=>!supports(term));
   // Language alternatives and example lists are not conjunctions.
   const listChoice=/\b(?:at least one|one or more|one of|any of|either|such as|for example|e\.g\.)\b/i.test(line)||/,\s*or\b/i.test(line);
   const alternatives=/\bor\b|\//i.test(line);
   let supported=!missing.length;
   if(listChoice&&terms.length>1)supported=terms.some(supports);
   else if(alternatives&&terms.length>1){
    const groups=line.split(/\bor\b/i).map(part=>({part,terms:terms.filter(term=>contains(part,term))})).filter(group=>group.terms.length);
    supported=groups.some(group=>/\band\b|\bplus\b|along with/i.test(group.part)?group.terms.every(supports):group.terms.some(supports));
   }
   checked.push({quote:line,terms,supported});if(!supported)gaps.push({quote:line,missing});
  }
  const level=/\b(?:Ph\.?D\.?|doctorate)\b/i.test(line)?'doctorate':/\bmaster.?s|\bM\.?S\.?\b|\bM\.?Tech\b/i.test(line)?'masters':/\bbachelor.?s|\bB\.?Tech\b/i.test(line)?'bachelors':null;
  if(level&&!/\bor\b|equivalent/i.test(line)){
   const evidence={doctorate:/\bPh\.?D\.?|doctorate/i,masters:/\bmaster.?s|\bM\.?S\.?\b|\bM\.?Tech\b|\bPh\.?D/i,bachelors:/\bbachelor|\bB\.?Tech\b|\bB\.?E\.?\b|\bB\.?Sc\b|\bmaster|\bM\.?Tech\b|\bPh\.?D/i}[level].test(resume);
   checked.push({quote:line,degree:level,supported:evidence});if(!evidence)gaps.push({quote:line,missing:[level+' degree evidence']});
  }
 }
 return {eligible:!gaps.length,status:gaps.length?'mandatory-evidence-gap':review.length?'qualification-review-needed':checked.length?'explicit-requirements-checked':'requirements-unclear',checked,gaps,review};
}

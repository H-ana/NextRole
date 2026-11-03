// Role intent is separate from skill relevance. No AI request or qualification inference.
const normalize=value=>String(value||'').toLowerCase().replace(/[-\u2010-\u2014/]/g,' ').replace(/\s+/g,' ').trim();
const AI='(?:agentic ai|generative ai|gen\\s?ai|artificial intelligence|machine learning|deep learning|ai|ml|llm|nlp)';
const TECH='(?:engineer|developer|architect|scientist|researcher)';
const roles=[
 ['ai',new RegExp('\\b'+AI+'(?:[ ,&-]+[a-z]+){0,2}[ ,&-]+'+TECH+'\\b|\\b'+TECH+'(?:[ ,&-]+[a-z]+){0,2}[ ,&-]+'+AI+'\\b','i')],
 ['software',/\b(?:software(?: development)?|full[ -]?stack|back[ -]?end|front[ -]?end|web|mobile|application|python|java|javascript|typescript) (?:engineer|developer|architect)\b|\b(?:sde|swe|programmer|forward deployed (?:software )?engineer|member of technical staff)\b/i],
 ['data-engineering',/\b(?:data|analytics|etl|big data) (?:engineer|developer|architect)\b/i],
 ['analytics',/\b(?:data|business|financial|reporting|bi|intelligence) analyst\b|\b(?:business intelligence|power bi|tableau) developer\b/i],
 ['support',/\b(?:(?:technical|application|production|customer|it) )?support (?:engineer|specialist|analyst|associate|technician|consultant|manager)\b|\bincident (?:management|manager|analyst|coordinator)\b|\b(?:service desk|help desk|helpdesk|service delivery)\b/i],
 ['infra',/\b(?:devops|site reliability|platform|cloud|infrastructure|systems?|network) (?:engineer|architect|administrator)\b|\bsre\b/i],
 ['qa',/\b(?:qa|quality assurance|test|testing|sdet|quality) (?:engineer|analyst|specialist|automation)\b|\bsdet\b/i],
 ['design',/\b(?:(?:product|ux|ui|user experience|graphic|visual) )designer\b/i],
 ['product',/\b(?:product|program|project) (?:manager|owner)\b/i],
 ['security',/\b(?:security|cybersecurity|cyber security) (?:engineer|analyst|architect|specialist)\b/i],
 ['sales',/\b(?:sales|presales|pre sales|account|customer success|business development) (?:engineer|manager|executive|specialist|representative)\b/i],
 ['marketing',/\b(?:marketing|seo|content) (?:manager|specialist|executive|analyst|writer)\b/i],
 ['hr',/\b(?:recruiter|talent acquisition|human resources|hr (?:manager|specialist))\b/i],
];
function family(text){const matches=roles.map(([name,pattern])=>({name,match:normalize(text).match(pattern)})).filter(item=>item.match).sort((a,b)=>a.match.index-b.match.index);return matches[0]?.name||null;}
export function resumeRoleIntent(resume,target=''){
 const explicit=family(target);if(explicit)return {family:explicit,source:'search-role'};
 const lines=String(resume||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const boundary=lines.findIndex(line=>/^(?:work experience|professional experience|experience|employment history|education|skills|technical skills|projects|certifications)\s*:?$/i.test(line));
 const foreground=lines.slice(0,boundary<0?12:boundary).slice(0,16);
 // A headline/summary describes intent; bullet responsibilities and technology lists do not.
 const usable=line=>line.length<700&&!/^(?:[-•*]|built\b|developed\b|supported\b|contributed\b|worked\b|implemented\b|skills\s*:)/i.test(line)&&!/@|https?:\/\//.test(line)&&!/^\s*(?:no|not|never)\b/i.test(line);
 for(const line of foreground){if(!usable(line))continue;const found=family(line);if(found)return {family:found,source:'resume-headline'};}
 // Fall back to short role headings, never phrases buried in accomplishment bullets.
 for(const line of lines){if(!usable(line)||line.length>150||/[.!?]$/.test(line))continue;const found=family(line);if(found)return {family:found,source:'resume-role'};}
 return null;
}
const related={ai:['ai','software'],software:['software','ai'], 'data-engineering':['data-engineering'],analytics:['analytics'],support:['support'],infra:['infra'],qa:['qa'],design:['design'],product:['product'],security:['security'],sales:['sales'],marketing:['marketing'],hr:['hr']};
export function roleAlignment(job,intent){
 if(!intent)return {aligned:true,score:0,family:null,kind:'unknown-intent'};
 const title=normalize(job.title),support=roles.find(([name])=>name==='support')[1];
 // Shared Python/SQL/AI words in a support description cannot override its occupation.
 if(intent.family!=='support'&&support.test(title))return {aligned:false,score:0,family:'support',kind:'different-role'};
 if(['ai','software'].includes(intent.family)&&roles.filter(([name])=>['sales','hr','marketing','product','qa'].includes(name)).some(([,pattern])=>pattern.test(title)))return {aligned:false,score:0,family:family(title),kind:'different-role'};
 if(['ai','software'].includes(intent.family)&&/\b(?:engineer in test|development engineer in test)\b/i.test(title))return {aligned:false,score:0,family:'qa',kind:'different-role'};
 const actual=family(title);
 if(!actual){
  // An unfamiliar title needs explicit development responsibilities, not a skill list.
  const text=normalize(job.description).slice(0,16000);
  const delivery=/\b(?:build|develop|design|implement|deploy|engineer|create)(?:s|ing)?\b[^.!?\n]{0,140}\b(?:ai (?:applications?|agents?|systems?|solutions?)|llm|generative ai|machine learning (?:models?|systems?)|agentic (?:ai|workflows?))\b/i.test(text);
  const engineering=/\b(?:production|software development|backend|apis?|model evaluation|rag|langgraph|langchain|inference|fine tuning)\b/i.test(text);
  const unrelated=/\b(?:support|incident|service desk|sales|marketing|recruiter|human resources|account executive|product manager|project manager|business analyst)\b/i.test(title);
  if(['ai','software'].includes(intent.family)&&delivery&&engineering&&!unrelated)return {aligned:true,score:65,family:'ai',kind:'description-supported'};
  return {aligned:false,score:0,family:null,kind:'unclear-role'};
 }
 const aligned=(related[intent.family]||[intent.family]).includes(actual);
 return {aligned,score:aligned?(actual===intent.family?100:80):0,family:actual,kind:aligned?(actual===intent.family?'direct':'related'):'different-role'};
}
export function filterRoleAlignedJobs(jobs,resume,preferences={}){const intent=resumeRoleIntent(resume,preferences.target_roles);return jobs.filter(job=>roleAlignment(job,intent).aligned);}

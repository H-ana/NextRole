export const CATALOG=['JavaScript','TypeScript','React','Node.js','Python','SQL','PostgreSQL','Java','AWS','Docker','Kubernetes','Figma','Product Design','UX','UI','HTML','CSS','Excel','Tableau','Power BI','Go','Rust','C++','C#','Sales','Marketing','SEO','Project Management','Agile','Git','Machine Learning','Data Analysis','Communication'];
export function contains(text,term){const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9+#])','i').test(text);}
export function extract(text){const years=[...text.matchAll(/(\d+)\+?\s*(?:years|yrs)\b/gi)].map(m=>Number(m[1]));return {skills:CATALOG.filter(s=>contains(text,s)),years:years.length?Math.max(...years):null};}
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function evidenceFor(text,term){return text.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).filter(line=>contains(line,term)).map(line=>line.trim());}
export function hasSkillOverlap(jobSkills,profileSkills){return jobSkills.some(s=>profileSkills.some(p=>p.toLowerCase()===s.toLowerCase()));}
export function requiredYears(description){
 let section=description;
 const headings=[...description.matchAll(/^\s*minimum (?:requirements|qualifications)\s*$/gmi)];
 const minimum=headings.length?headings[headings.length-1].index:-1;
 if(minimum>=0)section=description.slice(minimum).split(/preferred qualifications|nice.to.have|pay and benefits/i)[0];
 else section=description.split(/preferred qualifications|nice.to.have/i)[0];
 const matches=[...section.matchAll(/\b(\d{1,2})(?:\s*[-–—]\s*\d{1,2})?\+?\s*(?:years|yrs)\s+(?:of\s+)?(?:[\w/-]+\s+){0,8}experience\b/gi)];
 return matches.length?Math.max(...matches.map(m=>Number(m[1]))):Infinity;
}
export function meetsKnownExperience(required,actual){return !Number.isFinite(required)||actual>=required;}
export function tailorResume(original,job,confirmed=[]){
 if(!original.trim())throw new Error('Upload a resume or paste its text first.');
 const supported=job.skills.filter(skill=>contains(original,skill));
 const selected=supported.filter(skill=>confirmed.includes(skill));
 // Keep every source line in order. Only whitespace and bullet glyphs change.
 const formatted=original.replace(/\r\n?/g,'\n').replace(/\t/g,'  ').split('\n').map(line=>line.replace(/^\s*[•●▪◦]\s*/,'- ').trimEnd()).join('\n').trim();
 const lines=formatted.split('\n');
 if(selected.length){
  const firstSection=lines.findIndex(line=>/^(profile|summary|professional summary|experience|work experience|professional experience|employment history|education|skills|technical skills|projects|certifications)\s*:?$/i.test(line.trim()));
  const position=firstSection>0?firstSection:lines.length;
  lines.splice(position,0,'RELEVANT SKILLS',selected.join(', '),'');
 }
 return {text:lines.join('\n'),
 supported,selected,missing:job.skills.filter(skill=>!supported.includes(skill)),
 changes:[...(selected.length?['Added a role-specific skills index using only resume-supported skills you confirmed.']:[]),'Kept original resume content and its order; normalized bullet symbols, tabs, and trailing whitespace.']};
}

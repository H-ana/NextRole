// Change separators only. Never infer skills or correct their spelling.
import {personalContact} from './resume-header.mjs?v=39';
const known=['Anthropic Claude','Microsoft Excel','Prompt Engineering','Machine Learning','Data Analysis','PostgreSQL','PostgresSQL','NoSQL','MySQL','OpenAPI','ReactJS','Python','FastAPI','LangGraph','Claude API','Power BI','SQL','API','Excel','Docker','Kubernetes','JavaScript','TypeScript','React','Git','Node.js','Java','AWS','Figma','Product Design','Project Management','Communication','Tableau','Agile','HTML','CSS','C++','C#','Rust','Go','R'].sort((a,b)=>b.length-a.length);
const skillHeading=/^\s*(?:skills|technical skills|relevant skills|soft skills|additional skills)\s*:?\s*$/i;
const sectionHeading=/^\s*(?:profile|career objective|objective|professional summary|summary|experience|work experience|professional experience|employment history|education|projects|certifications|certificates|qualifications|licenses|achievements|publications|languages)\s*:?\s*$/i;

function splitKnown(chunk){
 let rest=chunk.trim(),tokens=[];
 while(rest){
  const term=known.find(t=>rest.toLowerCase().startsWith(t.toLowerCase()));
  if(!term)return [chunk.trim()];
  tokens.push(rest.slice(0,term.length));rest=rest.slice(term.length).trimStart();
 }
 return tokens;
}

export function formatSkillSections(text){
 const lines=text.replace(/\r\n?/g,'\n').split('\n'),result=[];
 for(let i=0;i<lines.length;i++){
  const inline=lines[i].match(/^(\s*(?:skills|technical skills|relevant skills|soft skills|additional skills)\s*:)(\S.*|\s+\S.*)$/i);
  if(!skillHeading.test(lines[i])&&!inline){result.push(lines[i]);continue;}
  result.push(inline?inline[1]:lines[i]);
  const entries=inline?[inline[2]]:[];
  while(i+1<lines.length&&!skillHeading.test(lines[i+1])&&!sectionHeading.test(lines[i+1]))entries.push(lines[++i]);
  if(entries.some(line=>personalContact.test(line))){result.push(...entries);continue;}
  const skills=entries.flatMap(line=>line.trim().replace(/^[-*•●▪◦–]\s*/,'').split(/[,;|•●▪◦\t]+/)).filter(s=>s.trim()).flatMap(splitKnown);
  if(skills.length)result.push(skills.join(', '));
  if(entries.length&&entries.at(-1).trim()===''&&i+1<lines.length)result.push('');
 }
 return result.join('\n');
}


const headings=/^(profile|career objective|objective|relevant skills|professional summary|summary|experience|work experience|professional experience|employment history|education|skills|technical skills|soft skills|additional skills|projects|certifications|certificates|achievements|publications|languages)\s*:?$/i;
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

import {formatSkillSections} from './skill-format.mjs?v=91';
import {personalContact} from './resume-header.mjs?v=91';
// Formatting only: preserve skill names and never infer qualifications.
export function resumePreview(text){
 text=formatSkillSections(text);
 let first=true,section='',entryPending=false;
 const paragraphs=text.replace(/\r\n?/g,'\n').split('\n').map(line=>{
  const value=line.trim();let role='body';
  if(!value)return '<div class="resume-space" aria-hidden="true"></div>';
  if(headings.test(value)){role='section';section=value.toLowerCase().replace(/:$/,'');entryPending=true;}
  else if(first&&value.length<100&&!personalContact.test(value))role='name';
  else if(!section&&/@|https?:\/\/|linkedin\.com|\+?\d[\d ()-]{7,}/.test(value))role='contact';
  else if(/^[-*\u2022\u2013]\s+/.test(value)){role='bullet';entryPending=false;}
  else if(/experience|employment|education|projects/.test(section)&&value.length<=150&&(entryPending||/\s{2,}.*\d{4}|\|.*\d{4}/.test(value)||(section==='projects'&&/\([^)]{2,60}\)\s*$/.test(value)))){role='entry';entryPending=false;}
  else entryPending=false;
  first=false;
  return `<p class="resume-${role}">${escape(line)}</p>`;
 });
 return `<div class="resume-paper" aria-label="Formatted resume preview">${paragraphs.join('')}</div><p class="resume-preview-note">Layout preview. The Word download checks the final one-page fit. All resume text is preserved.</p>`;
}


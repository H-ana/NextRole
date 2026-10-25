import {formatSkillSections} from './skill-format.mjs?v=91';
import {resumePreview} from './resume-preview.mjs?v=91';

const heading=/^(profile|summary|professional summary|career objective|objective|experience|work experience|professional experience|employment history|projects|education|skills|technical skills|relevant skills|soft skills|additional skills|certifications|certificates|qualifications|licenses|achievements|publications|languages)\s*:?$/i;
const skillHeading=/^(?:skills|technical skills|relevant skills|soft skills|additional skills)\s*:?$/i;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// A lossless section model: every source line belongs to the header or one section.
// No example resume data, inferred qualifications, or generated job title is inserted.
export function resumeSections(text){
 const header=[],sections=[];
 for(const line of formatSkillSections(text).split('\n')){
  if(heading.test(line.trim()))sections.push({id:`section-${sections.length}`,heading:line,body:[]});
  else if(sections.length)sections.at(-1).body.push(line);
  else header.push(line);
 }
 return {header,sections};
}
export function sectionText(model){
 if(new Set(model.sections.map(s=>s.id)).size!==model.sections.length)throw new Error('Duplicate resume section. Rebuild this draft.');
 return [...model.header,...model.sections.flatMap(s=>[s.heading,...s.body])].join('\n');
}
export function moveResumeSection(model,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=model.sections.length||to>=model.sections.length)throw new Error('Invalid section move.');
 const sections=[...model.sections],item=sections.splice(from,1)[0];sections.splice(to,0,item);
 return {...model,sections};
}
export function skillMatchesJob(skill,description){
 if(!description||!skill.trim())return false;
 const phrase=skill.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
 return new RegExp(`(^|[^a-z0-9])${phrase}(?=$|[^a-z0-9+#])`,'i').test(description);
}
export function prioritizeExistingSkills(model,description){
 return {...model,sections:model.sections.map(section=>{
  if(!skillHeading.test(section.heading.trim()))return section;
  const skills=section.body.filter(line=>line.trim()).flatMap(line=>line.split(',')).map(s=>s.trim()).filter(Boolean);
  const ranked=skills.map((skill,index)=>({skill,index,match:skillMatchesJob(skill,description)})).sort((a,b)=>Number(b.match)-Number(a.match)||a.index-b.index);
  const trailing=section.body.length&&section.body.at(-1)===''?['']:[];
  return {...section,body:ranked.length?[ranked.map(s=>s.skill).join(', '),...trailing]:section.body};
 })};
}
export function resumeChecks(text){
 const parsed=resumeSections(text),names=parsed.sections.map(s=>s.heading.trim().replace(/:$/,'').toLowerCase()),words=text.trim().split(/\s+/).filter(Boolean).length;
 return [
  {label:'Contact information',ok:/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)&&/\+?\d[\d ()-]{7,}\d/.test(parsed.header.join('\n')),detail:'Check that an email and phone number appear in the document body.'},
  {label:'Recognizable sections',ok:names.length>=2,detail:'Standard headings help organize the document. No section is invented or filled automatically.'},
  {label:'Experience or projects',ok:names.some(n=>/experience|employment|projects/.test(n)),detail:'Use existing responsibilities and achievements as evidence for the role.'},
  {label:'Skills section',ok:names.some(n=>skillHeading.test(n)),detail:'Existing skill names remain comma-separated; missing job skills are never added.'},
  {label:'Concise content',ok:words<=650,detail:`${words} words. This is a length guide; Word checks the actual one-page fit on download.`}
 ];
}

export function mountResumeBuilder(root,{text,job={},onChange=()=>{}}){
 const original=resumeSections(text);let model=original;
 const current=()=>sectionText(model);
 function render(){
  const openPanels=[...root.querySelectorAll('.builder-controls details')].map(panel=>panel.open);
  const skillList=model.sections.filter(s=>skillHeading.test(s.heading.trim())).flatMap(s=>s.body.filter(Boolean).flatMap(line=>line.split(','))).map(s=>s.trim()).filter(Boolean);
  const matched=skillList.filter(s=>skillMatchesJob(s,job.description));
  root.innerHTML=`<section class="resume-workbench"><div class="builder-heading"><h4>Build your role-specific resume</h4><p>${esc(job.title||'Selected role')}${job.company?` · ${esc(job.company)}`:''}</p></div><p>Review the content, arrange whole sections, then download the verified Word resume. Your original matching resume and employment chronology stay unchanged.</p><div class="builder-controls"><details><summary>Arrange resume sections</summary><p>Move complete sections to emphasize relevant experience. Entries and dates inside each section stay together.</p><ol class="builder-sections">${model.sections.map((s,i)=>`<li><span>${esc(s.heading)}</span><div><button type="button" class="secondary" data-section-up="${i}" ${i===0?'disabled':''} aria-label="Move ${esc(s.heading)} up">↑</button><button type="button" class="secondary" data-section-down="${i}" ${i===model.sections.length-1?'disabled':''} aria-label="Move ${esc(s.heading)} down">↓</button></div></li>`).join('')||'<li>No standard sections found. Review the original extracted text.</li>'}</ol><button type="button" class="secondary" data-reset-layout>Reset layout to this draft</button></details><details><summary>Skills for this job</summary><p>Exact phrases found in the job description, among skills already in this draft: <strong>${matched.length?matched.map(esc).join(', '):'None identified'}</strong>.</p><p>This is a terminology check, not proof of proficiency or qualification. Use the AI evidence map for a fuller review.</p><button type="button" class="secondary" data-prioritize-skills ${!matched.length?'disabled':''}>Put matching existing skills first</button></details><details><summary>Resume readiness checklist</summary><ul class="builder-checks">${resumeChecks(current()).map(c=>`<li><strong>${c.ok?'✓':'Review'} · ${esc(c.label)}</strong><p>${esc(c.detail)}</p></li>`).join('')}</ul><p>These are local structure checks, not an employer’s ATS score. The download also checks page count, text, contact details and reading order.</p></details></div><div class="builder-live-preview">${resumePreview(current())}</div></section>`;
  [...root.querySelectorAll('.builder-controls details')].forEach((panel,i)=>{panel.open=!!openPanels[i];});
  for(const button of root.querySelectorAll('[data-section-up]'))button.onclick=()=>{model=moveResumeSection(model,Number(button.dataset.sectionUp),Number(button.dataset.sectionUp)-1);render();onChange(current());};
  for(const button of root.querySelectorAll('[data-section-down]'))button.onclick=()=>{model=moveResumeSection(model,Number(button.dataset.sectionDown),Number(button.dataset.sectionDown)+1);render();onChange(current());};
  root.querySelector('[data-reset-layout]').onclick=()=>{model=original;render();onChange(current());};
  root.querySelector('[data-prioritize-skills]').onclick=()=>{model=prioritizeExistingSkills(model,job.description);render();onChange(current());};
 }
 render();return {getText:current};
}

export const resumeHeading=/^(profile|career objective|objective|relevant skills|professional summary|summary|experience|work experience|professional experience|employment history|education|skills|technical skills|soft skills|additional skills|projects|certifications|certificates|qualifications|licenses|achievements|publications|languages)\s*:?$/i;
export const personalContact=/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|linkedin\.com|\+?\d[\d ()-]{7,}\d)/i;
const skills=/^(skills|technical skills|relevant skills|soft skills|additional skills)\s*:?$/i;
export function assertResumeHeader(text){
 const lines=text.split('\n'),first=lines.find(line=>line.trim());
 if(!first||resumeHeading.test(first.trim())||personalContact.test(first))throw new Error('The resume name must come before section headings. Rebuild this draft from your original resume before downloading.');
 let inSkills=false;
 for(const line of lines){
  if(resumeHeading.test(line.trim()))inSkills=skills.test(line.trim());
  else if(inSkills&&personalContact.test(line))throw new Error('Contact details were found inside the skills section. Rebuild this draft from your original resume before downloading.');
 }
}

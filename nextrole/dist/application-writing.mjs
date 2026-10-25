import {safeUrl} from './resume-tools.mjs?v=91';
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
export const WRITING_TONES=['formal','friendly','concise'];
export function applicationVariants(job,name='[Your name]'){
 const role=clean(job.title),company=clean(job.company),signature=clean(name)||'[Your name]';
 const link=safeUrl(job.url),reference=link?'\n\nRole: '+link:'';
 return {
  formal:{cover:`Dear Hiring Team,\n\nI am writing to apply for the ${role} position at ${company}. I would appreciate the opportunity to discuss how my background relates to the requirements of this role.\n\nI would welcome a conversation about the position and the contribution I could make. Thank you for considering my application.\n\nSincerely,\n${signature}`,
   recruiter:`Dear [Recruiter name],\n\nI am interested in the ${role} position at ${company}. Could you please let me know whether you are the appropriate contact for this vacancy?\n\nI would appreciate the opportunity to discuss the role and can share my resume for your review.\n\nKind regards,\n${signature}${reference}`},
  friendly:{cover:`Hello Hiring Team,\n\nThe ${role} opening at ${company} caught my interest. I would love to learn more about the team and share the experience I could bring to the role.\n\nThank you for taking the time to review my application. I would be happy to talk about the team's needs and where my background could be useful.\n\nBest,\n${signature}`,
   recruiter:`Hi [Recruiter name],\n\nI came across the ${role} opening at ${company} and would love to learn more.\n\nAre you the right person to speak with about the role? I would be happy to share my resume. Thanks for your time!\n\n${signature}${reference}`},
  concise:{cover:`Dear Hiring Team,\n\nI am applying for the ${role} role at ${company}.\n\nI would welcome a discussion about my fit for the position. Thank you for your consideration.\n\n${signature}`,
   recruiter:`Hi [Recruiter name], I am interested in the ${role} role at ${company}.\n\nCould we discuss the opening, or could you direct me to the right contact?\n\n${signature}${reference}`}
 };
}
const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function mountApplicationWriting(root,job){
 root.className='application-writing';
 root.innerHTML='<summary>Cover letter & recruiter message</summary><p>Choose a tone and edit the drafts before using them. Drafting runs locally and does not send messages.</p><label>Your name<input data-writing-name maxlength="150" placeholder="Your name"></label><fieldset><legend>Pick a tone</legend><div class="writing-tones"></div></fieldset><button type="button" class="secondary" data-generate-writing>Generate drafts</button><p data-writing-status role="status"></p><div data-writing-output hidden><label>Cover letter<textarea data-cover-draft rows="12"></textarea></label><button type="button" class="secondary" data-copy-cover>Copy cover letter</button><label>Recruiter message<textarea data-recruiter-draft rows="8"></textarea></label><button type="button" class="secondary" data-copy-recruiter>Copy recruiter message</button><p class="writing-review">Replace name placeholders and check every fact. These drafts do not claim that you have already applied, contacted someone, or met every qualification.</p></div>';
 const find=s=>root.querySelector(s),status=find('[data-writing-status]'),cover=find('[data-cover-draft]'),recruiter=find('[data-recruiter-draft]');
 let tone='formal',drafts=null;
 const save=()=>{if(drafts)drafts[tone]={cover:cover.value,recruiter:recruiter.value};};
 const show=()=>{if(!drafts)return;cover.value=drafts[tone].cover;recruiter.value=drafts[tone].recruiter;find('[data-writing-output]').hidden=false;};
 for(const value of WRITING_TONES){const label=make('label'),radio=make('input');radio.type='radio';radio.name='application-writing-tone';radio.value=value;radio.checked=value===tone;radio.onchange=()=>{save();tone=value;show();status.textContent='';};label.append(radio,make('span',value[0].toUpperCase()+value.slice(1)));find('.writing-tones').append(label);}
 find('[data-generate-writing]').onclick=()=>{
  drafts=applicationVariants(job,find('[data-writing-name]').value);show();
  status.textContent='Three tones are ready. Switching tones preserves your edits. Reset drafts replaces your edits.';
  find('[data-generate-writing]').textContent='Reset drafts';
  find('[data-generate-writing]').title='Rebuild all tone variants using your current name. This replaces your edits.';
 };
 for(const [selector,field] of [['[data-copy-cover]',cover],['[data-copy-recruiter]',recruiter]])find(selector).onclick=async()=>{
  try{await navigator.clipboard.writeText(field.value);status.textContent='Copied. Review and paste it when you are ready.';}
  catch{field.focus();field.select();status.textContent='Select and copy the draft from the text box.';}
 };
}

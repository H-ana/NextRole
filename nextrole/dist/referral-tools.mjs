const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,300);
const companyQuery=value=>'"'+clean(value).replace(/["\\]/g,'')+'"';

export function referralSearches(job){
 const company=companyQuery(job.company),role=clean(job.title).replace(/["\\]/g,'');
 const search=keywords=>{const url=new URL('https://www.linkedin.com/search/results/people/');url.searchParams.set('keywords',keywords);return url.href;};
 return {people:search(company),recruiters:search(`${company} (recruiter OR "talent acquisition")`),similar:search(`${company} ${role}`)};
}

export function referralDraft(job){
 let link='';
 try{const url=new URL(job.url);if(url.protocol==='https:'&&!url.username&&!url.password)link=url.href;}catch{}
 return `Hi [Name], I’m interested in the ${clean(job.title)} role at ${clean(job.company)}. Would you be open to considering a referral, or pointing me to the right person? I can share my resume for you to review. Thank you!${link?'\n\nJob link: '+link:''}`;
}

export function mountReferralTools(root,job){
 root.id='referral-tools';root.className='referral-tools';root.tabIndex=-1;
 root.innerHTML='<h3>Find a referral on LinkedIn</h3><p class="referral-context"></p><div class="referral-links"><a data-referral-link="people" target="_blank" rel="noopener noreferrer">Find people at the company ↗</a><a data-referral-link="recruiters" target="_blank" rel="noopener noreferrer">Find recruiters ↗</a><a data-referral-link="similar" target="_blank" rel="noopener noreferrer">Find people in similar roles ↗</a></div><p class="referral-hint">These searches open on LinkedIn and may require sign-in. Check each person’s current company and whether they can refer you.</p><details><summary>Draft a referral request</summary><label for="referral-message">Edit before sharing</label><textarea id="referral-message" rows="6"></textarea><button id="copy-referral-message" type="button" class="secondary">Copy request</button><span id="referral-copy-status" role="status"></span></details>';
 root.querySelector('.referral-context').textContent=`Explore contacts for ${clean(job.title)} at ${clean(job.company)}.`;
 const urls=referralSearches(job);
 for(const [key,url] of Object.entries(urls))root.querySelector(`[data-referral-link="${key}"]`).href=url;
 const message=root.querySelector('#referral-message'),status=root.querySelector('#referral-copy-status');
 message.value=referralDraft(job);
 message.addEventListener('input',()=>{status.textContent='';});
 root.querySelector('#copy-referral-message').onclick=async()=>{
  const text=message.value;
  try{await navigator.clipboard.writeText(text);if(message.value===text)status.textContent='Copied. Paste it into a message when you’re ready.';}
  catch{message.focus();message.select();status.textContent='Select and copy the request from the text box.';}
 };
}

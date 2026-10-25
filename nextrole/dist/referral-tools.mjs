import {HIRING_CITIES,matchesLocation} from './locations.mjs?v=91';
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,300);
const companyQuery=value=>'"'+clean(value).replace(/["\\]/g,'')+'"';
// Verified from Figma's own LinkedIn "See all employees" link:
// https://www.linkedin.com/company/figma (organization 3650502).
const COMPANY_IDENTITIES={figma:{id:'3650502',url:'https://www.linkedin.com/company/figma/'}};
export function employerIdentity(job){
 const known=COMPANY_IDENTITIES[clean(job.company).toLowerCase()];
 if(known)return known;
 for(const value of [job.company_linkedin_url,job.company_url]){
  try{
   const url=new URL(value);
   if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='linkedin.com'||url.hostname.endsWith('.linkedin.com')))continue;
   const match=url.pathname.match(/^\/company\/([A-Za-z0-9_-]+)\/?$/);
   if(match)return {id:/^\d+$/.test(match[1])?match[1]:null,url:'https://www.linkedin.com/company/'+match[1]+'/'};
  }catch{}
 }
 return null;
}
export function recruiterLocations(job){
 const location=clean(job.location);
 if(/^remote$/i.test(clean(job.style))||/\b(?:remote|anywhere|work from home|worldwide)\b/i.test(location))return [];
 return HIRING_CITIES.filter(city=>matchesLocation(location,city));
}
const CITY_SEARCH_ALIASES={Bengaluru:['Bengaluru','Bangalore'],Gurugram:['Gurugram','Gurgaon'],'New Delhi':['New Delhi','Delhi'],Kochi:['Kochi','Cochin'],Thiruvananthapuram:['Thiruvananthapuram','Trivandrum'],Kolkata:['Kolkata','Calcutta']};

export function referralSearches(job){
 const company=companyQuery(job.company),role=clean(job.title).replace(/["\\]/g,'').replace(/\([^)]*\)/g,part=>recruiterLocations({location:part}).length||/\bremote\b/i.test(part)?'':part).split(/\s+[–—-]\s+/)[0].trim();
 const identity=employerIdentity(job);
 const search=(keywords='',degree)=>{
  const url=new URL('https://www.linkedin.com/search/results/people/');
  if(identity?.id)url.searchParams.set('currentCompany',JSON.stringify([identity.id]));
  const query=[identity?.id?'':company,keywords].filter(Boolean).join(' AND ');
  if(query)url.searchParams.set('keywords',query);
  if(degree)url.searchParams.set('network',JSON.stringify([degree]));
  return url.href;
 };
 const cities=recruiterLocations(job),locationTerms=[...new Set(cities.flatMap(city=>CITY_SEARCH_ALIASES[city]||[city]))];
 const locationQuery=locationTerms.length?'('+locationTerms.map(city=>'"'+city+'"').join(' OR ')+')':'';
 const scoped=keywords=>[keywords,locationQuery].filter(Boolean).join(' AND ');
 return {first:search(scoped(''),'F'),second:search(scoped(''),'S'),people:search(scoped('')),recruiters:search(scoped('(recruiter OR recruitment OR "talent acquisition")')),similar:search(scoped(role?'"'+role+'"':''))};
}

export function referralDraft(job,tone='friendly'){
 let link='';
 try{const url=new URL(job.url);if(url.protocol==='https:'&&!url.username&&!url.password)link=url.href;}catch{}
 const role=clean(job.title),company=clean(job.company),reference=link?'\n\nJob link: '+link:'';
 const drafts={
  formal:`Dear [Name],\n\nI am interested in the ${role} position at ${company}. Would you be willing to review my resume and consider referring me for this opportunity? If another colleague is the appropriate contact, I would appreciate an introduction.\n\nThank you for your time and consideration.\n\nKind regards,\n[Your name]${reference}`,
  friendly:`Hi [Name],\n\nI came across the ${role} role at ${company} and would love to learn more. Would you be open to taking a look at my resume and considering a referral? If someone else on the team is a better contact, an introduction would be helpful too.\n\nThanks for your time!\n[Your name]${reference}`,
  concise:`Hi [Name], I am interested in the ${role} role at ${company}. Would you consider a referral after reviewing my resume, or introduce me to the right person? Thank you!\n\n[Your name]${reference}`
 };
 return drafts[tone]||drafts.friendly;
}

export function mountReferralTools(root,job,{onExplore}={}){
 root.id='referral-tools';root.className='referral-tools';root.tabIndex=-1;
 root.innerHTML='<h3>Find a referral on LinkedIn</h3><p class="referral-context"></p><div class="referral-links"><a data-referral-link="people" target="_blank" rel="noopener noreferrer">Find people at the company ↗</a><a data-referral-link="recruiters" target="_blank" rel="noopener noreferrer">Find recruiters ↗</a><a data-referral-link="similar" target="_blank" rel="noopener noreferrer">Find people in similar roles ↗</a></div><p class="referral-hint">Searches open directly on LinkedIn and may require sign-in. LinkedIn determines the result order using your search and network; a strict first-degree, second-degree, then others order cannot be guaranteed. Confirm each person’s current company.</p><details><summary>Draft a referral request</summary><fieldset class="referral-tone-picker"><legend>Pick a tone</legend><div data-referral-tones></div></fieldset><label for="referral-message">Edit before sharing</label><textarea id="referral-message" rows="6"></textarea><button id="copy-referral-message" type="button" class="secondary">Copy request</button><button id="reset-referral-message" type="button" class="secondary" title="Replaces edits in all three tone variants">Reset drafts</button><span id="referral-copy-status" role="status"></span></details>';
 root.querySelector('.referral-context').textContent=`Explore contacts for ${clean(job.title)} at ${clean(job.company)}.`;
 const urls=referralSearches(job);
 const identity=employerIdentity(job);
 root.querySelector('.referral-hint').textContent=identity?.id?'Searches use LinkedIn’s Current company filter for this employer. LinkedIn may require sign-in.':'Opens LinkedIn people results using the company name. Confirm each person’s current employer; use Current company to refine results if needed.';
 for(const key of ['people','recruiters','similar']){const link=root.querySelector(`[data-referral-link="${key}"]`);link.href=urls[key];link.onclick=()=>onExplore?.(job);link.onauxclick=event=>{if(event.button===1)onExplore?.(job);};}
 const locations=recruiterLocations(job);
 if(locations.length){
  const labels={people:'Find people at the company',recruiters:'Find recruiters',similar:'Find people in similar roles'};
  for(const key of Object.keys(labels)){
   const link=root.querySelector(`[data-referral-link="${key}"]`);link.textContent=labels[key]+' · '+locations.join(' / ')+' ↗';
   link.title=identity?.id?'Search this employer using the posted job cities. Confirm the current company and location on LinkedIn.':'Search people using the company name and posted cities. Refine with LinkedIn’s Current company and Locations filters if needed.';
  }
  root.querySelector('.referral-hint').textContent+=' All three searches include '+locations.join(', ')+'. Confirm the person’s location or refine with LinkedIn’s Locations filter.';
 }
 const message=root.querySelector('#referral-message'),status=root.querySelector('#referral-copy-status');
 let tone='friendly',drafts=Object.fromEntries(['formal','friendly','concise'].map(value=>[value,referralDraft(job,value)]));
 message.value=drafts[tone];
 for(const value of ['formal','friendly','concise']){
  const label=document.createElement('label'),radio=document.createElement('input'),text=document.createElement('span');radio.type='radio';radio.name='referral-request-tone';radio.value=value;radio.checked=value===tone;text.textContent=value[0].toUpperCase()+value.slice(1);
  radio.onchange=()=>{drafts[tone]=message.value;tone=value;message.value=drafts[tone];status.textContent='';};label.append(radio,text);root.querySelector('[data-referral-tones]').append(label);
 }
 root.querySelector('#reset-referral-message').onclick=()=>{drafts=Object.fromEntries(['formal','friendly','concise'].map(value=>[value,referralDraft(job,value)]));message.value=drafts[tone];status.textContent='All referral tones reset. Replace name placeholders before sharing.';};
 message.addEventListener('input',()=>{status.textContent='';});
 root.querySelector('#copy-referral-message').onclick=async()=>{
  const text=message.value;
  try{await navigator.clipboard.writeText(text);if(message.value===text)status.textContent='Copied. Paste it into a message when you’re ready.';}
  catch{message.focus();message.select();status.textContent='Select and copy the request from the text box.';}
 };
}

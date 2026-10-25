import {findBackend,apiRequest} from './api-client.mjs?v=91';

const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
const link=(text,url)=>{const e=node('a',text);const href=safe(url);if(href){e.href=href;e.target='_blank';e.rel='noopener noreferrer';}return e;};
const date=value=>{const d=new Date(value);return Number.isNaN(d.valueOf())?'Date unavailable':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});};

export function listingOverview(job){
 const company=String(job.company||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 if(!company)return '';
 const text=String(job.description||'');
 const match=new RegExp(`\\b${company}\\s+(?:is|provides|offers|helps|builds|develops|operates|creates)\\b`,'i').exec(text);
 if(!match)return '';
 const excerpt=text.slice(match.index,match.index+450);
 const end=excerpt.search(/[.!?](?:\s|$)/);
 return end>=0?excerpt.slice(0,end+1):excerpt.length===450?excerpt.slice(0,excerpt.lastIndexOf(' ')):excerpt;
}

export function companyHeadlines(group,company){
 const key=value=>String(value||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const companyKey=key(company);
 const business=/\b(?:compan\w*|software|ai|launch\w*|fund\w*|acqui\w*|merger\w*|earning\w*|revenue|profit\w*|appoint\w*|ceo|cto|cfo|layoff\w*|job cuts?|retrench\w*|workforce|hiring|staff|employees?|expan\w*|growth|invest\w*|partner\w*|product\w*|platform\w*|business|bank\w*|technolog\w*|enterprise|capital|stocks?|shares?|shareholders?)\b/i;
 return {...group,items:(group?.items||[]).map(item=>{
  const parts=item.title.split(' - ');
  return {...item,title:parts.length>1&&key(parts.at(-1))===key(item.publisher)?parts.slice(0,-1).join(' - '):item.title};
 }).filter(item=>companyKey&&(' '+key(item.title)+' ').includes(' '+companyKey+' ')&&business.test(item.title))};
}

export function renderCompanyBrief(root,data){
 root.replaceChildren();
 root.append(node('h3',data.company),node('p',`Company brief · Updated ${date(data.checked_at)}`,'company-brief-date'));
 const grid=node('div','', 'company-brief-grid'),left=node('div'),right=node('div');grid.append(left,right);root.append(grid);
 left.append(node('h4','Company snapshot'));
 if(data.about){left.append(node('p',data.about),link('Overview source ↗',data.overview_url));}
 else left.append(node('p','A business overview is not available in the current job listings.'));
 left.append(node('p',`${data.listing_count} distinct roles in our current listings. Locations include ${(data.locations||[]).join('; ')}.`));
 const roleList=node('ul');for(const role of data.roles||[])roleList.append(node('li',role));left.append(roleList);
 left.append(node('h4','Tech stack signals'),node('p','Technologies mentioned in job descriptions; these may vary by team.','company-brief-note'));
 const tech=node('div','', 'company-brief-tech');
 for(const item of data.technology||[]){const a=link(item.name,item.url);a.title=`${item.role}: ${item.quote}`;tech.append(a);}
 left.append(tech);
 if(!data.technology?.length)left.append(node('p','No recognizable technology mentions were found in these listings.'));
 left.append(node('h4','How fast do they hire?'),node('p','Company-wide time to hire: unknown.'));
 if(data.hiring_timelines?.length){for(const item of data.hiring_timelines){left.append(node('p',`“${item.quote}”`),link(`Stated for ${item.role} ↗`,item.url));}left.append(node('p','These are role-specific statements, not measured hiring averages.','company-brief-note'));}
 else left.append(node('p','No explicit hiring timeline was found. Ask the recruiter about stages and expected decision dates.','company-brief-note'));
 function headlines(title,group,url,empty){
  group=companyHeadlines(group,data.company);
  right.append(node('h4',title));
  const list=node('ul','', 'company-brief-news');
  for(const item of group?.items||[]){const li=node('li');li.append(link(item.title,item.url),node('small',`${item.publisher} · ${date(item.published_at)}`));list.append(li);}
  right.append(list);
  if(!group?.items?.length)right.append(node('p',group?.available?empty:'Recent headlines could not be retrieved. Open the news search to check.'));
  right.append(link('Explore reports ↗',url));
 }
 headlines('Recent news · 30 days',data.news,data.news_search,'No dated, company-named headlines were returned for this period.');
 headlines('Layoff-related reports · 90 days',data.layoffs,data.layoff_search,'No matching headlines were returned. This does not establish that no layoffs occurred.');
 right.append(node('p','Headlines are discovery links, not verified event summaries. Check the publisher and company identity before drawing conclusions.','company-brief-note'));
 root.append(node('p','Based on current public listings and dated news headlines. Job listings are a partial snapshot of the company.','company-brief-footer'));
}

export function mountCompanyBrief(root,job){
 root.id='company-brief';root.className='company-brief';
 const summary=node('summary','One-page company brief'),page=node('div','', 'company-brief-page');root.append(summary,page);
 let loaded=false,loading=false;
 async function load(){
  if(loaded||loading)return;loading=true;page.replaceChildren(node('p','Preparing company brief…'));
  try{
   const backend=await findBackend();
   if(!(backend.status.capabilities||[]).includes('company-brief'))throw new Error('Restart the backend to load company briefs.');
   const data=await apiRequest(backend.origin,'/api/company/brief',{job_id:job.id},30000);
   if(!root.isConnected)return;
   const overview=data.about||listingOverview(job);
   renderCompanyBrief(page,{...data,about:overview,overview_url:data.about?data.overview_url:job.url});loaded=true;
  }catch(error){if(root.isConnected){page.replaceChildren(node('p',error.message));const retry=node('button','Try again','secondary');retry.type='button';retry.onclick=load;page.append(retry);}}
  finally{loading=false;}
 }
 root.addEventListener('toggle',()=>{if(root.open)load();});
 return {open(){root.open=true;load();root.scrollIntoView({block:'start'});summary.focus();}};
}

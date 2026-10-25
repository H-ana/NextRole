// Connection exports stay in this tab's memory. No email fields are retained.
let connections=[];
const normalized=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function companyIdentity(value){return normalized(value).replace(/\b(?:private|pvt|limited|ltd|incorporated|inc|llc|llp|corporation|corp)\b/g,'').replace(/\s+/g,' ').trim();}
export function connectionProfile(value){
 try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(url.hostname==='linkedin.com'||url.hostname.endsWith('.linkedin.com'))&&/^\/(?:in|pub)\/[^/]+/.test(url.pathname)){url.search='';url.hash='';return url.href;}}catch{}
 return null;
}
function csvRows(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field==='')quoted=!quoted;else field+=c;}
  else if(c===','&&!quoted){row.push(field);field='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';if(rows.length>31000)throw Error('This export has too many rows. Choose a Connections.csv file with at most 30,000 connections.');}
  else field+=c;
 }
 if(quoted)throw Error('The CSV has an unfinished quoted field. Download a fresh Connections.csv file.');
 if(field||row.length){row.push(field);rows.push(row);}return rows;
}
export function parseConnections(text){
 if(typeof text!=='string'||text.length>5_000_000)throw Error('Choose a Connections.csv file smaller than 5 MB.');
 const rows=csvRows(text.replace(/^\uFEFF/,''));
 const headerIndex=rows.findIndex(row=>row.map(normalized).includes('first name')&&row.map(normalized).includes('company'));
 if(headerIndex<0)throw Error('The file needs LinkedIn connection columns: First Name, Last Name, Company and Position.');
 const header=rows[headerIndex].map(normalized),index=key=>header.indexOf(key),col=(r,key)=>String(r[index(key)]||'').trim();
 const result=[],seen=new Set();
 for(const row of rows.slice(headerIndex+1)){
  const name=[col(row,'first name'),col(row,'last name')].filter(Boolean).join(' ').slice(0,300),company=col(row,'company').slice(0,500),position=col(row,'position').slice(0,500);
  if(!name||!company)continue;
  const url=connectionProfile(col(row,'url')||col(row,'profile url')),key=url||normalized(name)+'|'+companyIdentity(company)+'|'+normalized(position);
  if(seen.has(key))continue;seen.add(key);result.push({name,company,position,url});
 }
 if(!result.length)throw Error('No connections with company information were found in this file.');
 if(result.length>30000)throw Error('This export exceeds 30,000 connections.');
 return result;
}
export function companyConnections(people,company){
 const key=companyIdentity(company);return key?people.filter(person=>companyIdentity(person.company)===key):[];
}
export function peopleStep(people,company,skipFirst=false,skipSecond=false){
 if(!skipFirst&&(!people.length||companyConnections(people,company).length))return 'first';
 return skipSecond?'other':'second';
}
const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function mountReferralNetwork(root,job,searches){
 root.className='referral-network';
 root.innerHTML='<h4>Find people at the company</h4><p>Start with first-degree contacts, then second-degree connections, then a broader company search. Empty first-degree results from your imported file are skipped automatically.</p><details><summary>Import your connections</summary><p>On LinkedIn, open Settings & Privacy → Data privacy → Download your data and request your connections. Select the Connections.csv file from the downloaded archive here.</p><a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener noreferrer">Open LinkedIn data download ↗</a><label>LinkedIn Connections.csv<input type="file" accept=".csv,text/csv" data-connections-file></label><p>Your file stays in this tab’s memory. It is not uploaded, sent to Gemini or stored after a page refresh. Email addresses are not retained.</p></details><p data-network-status role="status"></p><button type="button" class="secondary" data-clear-connections hidden>Remove imported connections</button><div data-people-step></div><p>Live LinkedIn result counts are unavailable here. If a search has no matches, use the next-step button. NextRole cannot automatically detect empty second-degree results.</p>';
 const find=s=>root.querySelector(s),status=find('[data-network-status]');
 let skipFirst=false,skipSecond=false;
 function render(){
  const list=find('[data-people-step]');list.replaceChildren();find('[data-clear-connections]').hidden=!connections.length;
  const matches=companyConnections(connections,job.company);
  status.textContent=connections.length?`${connections.length} contacts loaded · ${matches.length} company-name matches in the export.`:'No connection file imported. You can check your contacts on LinkedIn below.';
  const step=peopleStep(connections,job.company,skipFirst,skipSecond);
  const headings={first:'1. First-degree connections',second:'2. Second-degree connections',other:'3. Other people at the company'};
  list.append(el('h4',headings[step]));
  if(step==='first')for(const person of matches){const card=el('article');card.className='network-contact';const name=el(person.url?'a':'strong',person.name);if(person.url){name.href=person.url;name.target='_blank';name.rel='noopener noreferrer';}card.append(name,el('p',[person.position,person.company].filter(Boolean).join(' · ')),el('small','First-degree connection in your imported export · confirm current employment'));list.append(card);}
  if(step==='second')list.append(el('p',connections.length&&!matches.length?'No first-degree company-name matches in your export. Check second-degree connections on LinkedIn.':'Check people at the company who may share a connection with you.'));
  if(step==='other')list.append(el('p','Showing the broader search after the earlier connection checks were empty or skipped.'));
  const link=el('a',step==='first'?'Check first-degree connections on LinkedIn ↗':step==='second'?'Check second-degree connections on LinkedIn ↗':'Find other people at the company ↗');link.href=searches[step==='other'?'people':step];link.target='_blank';link.rel='noopener noreferrer';list.append(link);
  if(step!=='other'){const next=el('button',step==='first'?'No first-degree matches — try second-degree':'No second-degree matches — show other people');next.type='button';next.className='secondary';next.onclick=()=>{if(step==='first')skipFirst=true;else skipSecond=true;render();};list.append(next);}
  if(skipFirst||skipSecond){const reset=el('button','Start with my connections again');reset.type='button';reset.className='secondary';reset.onclick=()=>{skipFirst=false;skipSecond=false;render();};list.append(reset);}

 }
 find('[data-connections-file]').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>5_000_000)throw Error('Choose a CSV file smaller than 5 MB.');const next=parseConnections(await file.text());connections=next;skipFirst=false;skipSecond=false;render();}
  catch(error){status.textContent=error.message;}finally{event.target.value='';}
 };
 find('[data-clear-connections]').onclick=()=>{connections=[];skipFirst=false;skipSecond=false;render();};render();
}

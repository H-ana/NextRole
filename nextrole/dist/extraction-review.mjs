const terms=['Anthropic Claude','Microsoft Excel','Prompt Engineering','Machine Learning','Data analysis','PostgreSQL','PostgresSQL','NoSQL','MySQL','OpenAPI','ReactJS','Python','FastAPI','LangGraph','Claude API','Power BI','SQL','API','Excel','Docker','Kubernetes','JavaScript','TypeScript','React','Git'];
const heading=/^(profile|summary|professional summary|experience|work experience|professional experience|employment history|education|skills|technical skills|relevant skills|projects|certifications|certificates|qualifications|licenses|achievements|publications|languages)\s*:?$/i;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function pdfPageText(items){
 const rows=[];
 for(const item of items){
  if(typeof item.str!=='string'||!item.transform)continue;
  const x=item.transform[4],y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<Math.max(2,(item.height||10)*.25));
  if(!row){row={y,items:[]};rows.push(row);}row.items.push({...item,x});
 }
 return rows.sort((a,b)=>b.y-a.y).map(row=>{
  let end=null,line='';
  for(const item of row.items.sort((a,b)=>a.x-b.x)){
   const gap=end===null?0:item.x-end;
   line+=(line&&!/\s$/.test(line)&&!/^\s/.test(item.str)&&gap>Math.max(1,(item.height||10)*.12)?gap>100?'            ':gap>36?'    ':' ':'')+item.str;
   end=item.x+(item.width||0);
  }
  return line;
 }).join('\n');
}

function splitSkills(line){
 let rest=line.trim(),tokens=[];
 while(rest){
  const term=[...terms].sort((a,b)=>b.length-a.length).find(t=>rest.toLowerCase().startsWith(t.toLowerCase()));
  if(!term)return null;
  tokens.push(rest.slice(0,term.length));rest=rest.slice(term.length).replace(/^[ ,;|Â·]+/,'');
 }
 const replacement=tokens.join(', ');
 return tokens.length>1&&tokens.some((t,i)=>i&&line.includes(tokens[i-1]+t))?replacement:null;
}
export function extractionIssues(text){
 const issues=[];
 text.replace(/\r\n?/g,'\n').split('\n').forEach((line,index)=>{
  if(!line.trim()||heading.test(line.trim()))return;
  const corrected=splitSkills(line);
  if(corrected)issues.push({index,original:line,replacement:corrected,reason:'Possible joined skill names. Confirm the separators match your source.'});
  else if(!/@|https?:\/\//.test(line)&&line.split(/[^A-Za-z]+/).some(word=>!terms.some(t=>t.toLowerCase()===word.toLowerCase())&&terms.some(t=>!t.includes(' ')&&t.length>=3&&word.includes(t)&&word!==t))){
   issues.push({index,original:line,replacement:null,reason:'A skill name may be joined to another word. Edit the imported text using your original document; no correction was guessed.'});
  }
  if(/\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|1[0-2])[/-]\d{2,4}\b/.test(line))issues.push({index,original:line,replacement:null,reason:'Ambiguous numeric date. Check day/month order against your original.'});
  if((/^[a-z]{1,3}$/i.test(line.trim())&&!/^(AI|API|SQL|HR|AWS|UI|UX|Git|Go|BSc|MSc)$/i.test(line.trim()))||(/\S{45,}/.test(line)&&!/@|https?:\/\//.test(line)))issues.push({index,original:line,replacement:null,reason:'Possible fragmented line or joined text. Compare with your original.'});
  if(/\S\s{12,}\S/.test(line))issues.push({index,original:line,replacement:null,reason:'Widely separated text may come from columns. Verify reading order.'});
 });
 return issues;
}
export function applyExtractionCorrections(text,issues,selected){
 const lines=text.split('\n'),seen=new Map();
 for(const i of selected){const issue=issues[i];if(!issue?.replacement)continue;if(seen.has(issue.index)){if(seen.get(issue.index)!==issue.replacement)throw new Error('Different corrections target the same line. Select one correction for that line.');continue;}if(lines[issue.index]!==issue.original)throw new Error('Resume changed. Review the extraction again.');lines[issue.index]=issue.replacement;seen.set(issue.index,issue.replacement);}
 return lines.join('\n');
}
export function setupExtractionReview({getResume,onCorrected}){
 let acknowledged=null;
 const panel=document.createElement('section');panel.id='extraction-review';panel.className='extraction-review';document.getElementById('job-search-form').after(panel);
 function render(){
  const source=getResume(),issues=extractionIssues(source);
  if(!issues.length){panel.hidden=true;return;}panel.hidden=false;
  panel.innerHTML=`<h3>Check your imported resume</h3><p>Review all proposed corrections, then apply them together or individually. Dates and uncertain text need your own correction; they are never guessed. Job search can continue.</p><div class="correction-actions"><button type="button" id="select-all-extraction" class="secondary">Select all available corrections</button><button type="button" id="clear-extraction-selection" class="secondary">Clear selection</button><button type="button" id="apply-all-extraction" class="find-jobs">Apply all available corrections</button></div>${issues.map((r,i)=>`<div class="extraction-issue"><label><input type="checkbox" data-correction="${i}" ${!r.replacement?'disabled':''}> ${r.replacement?'Apply proposed correction':'Apply my manual correction'}</label><p>${esc(r.reason)}</p><div><strong>Imported</strong><p>${esc(r.original)}</p>${r.replacement?`<strong>Proposed</strong><p>${esc(r.replacement)}</p>`:`<label>Corrected text from your original document<textarea data-manual-correction="${i}" aria-label="Manual correction for line ${r.index+1}" rows="2">${esc(r.original)}</textarea></label><p>Edit this text to make the correction available.</p>`}</div></div>`).join('')}<button type="button" id="apply-extraction" class="secondary">Apply selected corrections</button> <button type="button" id="ack-extraction" class="secondary">I checked the remaining warnings</button><p id="extraction-status" role="status">${acknowledged===source?'Warnings acknowledged for this resume.':''}</p>`;
  const selectAll=()=>{for(const input of panel.querySelectorAll('[data-correction]'))input.checked=!input.disabled;};
  document.getElementById('select-all-extraction').onclick=selectAll;
  document.getElementById('clear-extraction-selection').onclick=()=>{for(const input of panel.querySelectorAll('[data-correction]'))input.checked=false;};
  for(const field of panel.querySelectorAll('[data-manual-correction]'))field.oninput=()=>{const index=Number(field.dataset.manualCorrection),input=panel.querySelector(`[data-correction="${index}"]`);input.disabled=!field.value.trim()||field.value===issues[index].original;input.checked=!input.disabled;};
  document.getElementById('apply-extraction').onclick=()=>{
   if(getResume()!==source){render();return;}
   const current=issues.map(issue=>({...issue}));
   for(const field of panel.querySelectorAll('[data-manual-correction]'))if(field.value.trim()&&field.value!==current[Number(field.dataset.manualCorrection)].original)current[Number(field.dataset.manualCorrection)].replacement=field.value;
   const selected=[...panel.querySelectorAll('[data-correction]:checked')].filter(x=>!x.disabled).map(x=>Number(x.dataset.correction));
   try{const updated=applyExtractionCorrections(source,current,selected);if(updated!==source){acknowledged=null;onCorrected(updated);render();}else document.getElementById('extraction-status').textContent='Select an available correction or enter corrected text first.';}catch(error){document.getElementById('extraction-status').textContent=error.message;}
  };
  document.getElementById('apply-all-extraction').onclick=()=>{selectAll();document.getElementById('apply-extraction').onclick();};
  document.getElementById('ack-extraction').onclick=()=>{if(getResume()!==source){render();return;}acknowledged=source;document.getElementById('extraction-status').textContent='Warnings acknowledged for this resume.';};
 }
 return {render,ready(source){return !extractionIssues(source).length||acknowledged===source;},reset(){acknowledged=null;render();}};
}

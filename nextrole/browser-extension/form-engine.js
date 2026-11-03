/* Runs in the extension's isolated world. No network calls, navigation or submission. */
(()=>{
 const normalize=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const rules=[
  ['firstName',/^(?:first name|given name|given names|fname)$/],['lastName',/^(?:last name|family name|surname|lname)$/],['fullName',/^(?:full name|your name|name|candidate name)$/],
  ['email',/^(?:(?:confirm |re enter |your )?e ?mail(?: address)?)$/],['phone',/^(?:(?:your |mobile |contact |telephone )?(?:phone|mobile|telephone|contact)(?: number)?|tel)$/],
  ['address',/^(?:street address|address line 1|address 1|address)$/],['city',/^(?:city|current city|city of residence)$/],['state',/^(?:state|province|state province|state or province)$/],['postalCode',/^(?:zip|zip code|postal code|postcode|pin code)$/],['country',/^(?:country|country of residence|current country)$/],
  ['linkedin',/^(?:linkedin|linkedin url|linkedin profile|linkedin profile url)$/],['github',/^(?:github|github url|github profile|github profile url)$/],['website',/^(?:website|personal website|portfolio|portfolio url|website url|portfolio website)$/],
  ['currentCompany',/^(?:current company|current employer|current organization)$/],['currentTitle',/^(?:current job title|current title|current position|current designation)$/],['experience',/^(?:total years of experience|years of experience|total experience|total professional experience)$/],
  ['noticePeriod',/^(?:notice period|what is your notice period|notice period in days)$/],['availableStartDate',/^(?:available start date|earliest start date|when can you start)$/],['willingToRelocate',/^(?:willing to relocate|are you willing to relocate)$/],['willingToTravel',/^(?:willing to travel|are you willing to travel)$/],
  ['school',/^(?:school|university|college|school name|university name|institution)$/],['degree',/^(?:degree|degree earned|highest degree)$/],['fieldOfStudy',/^(?:field of study|major|specialization)$/],['graduationYear',/^(?:graduation year|year of graduation)$/],
 ];
 const sensitive=/\b(?:password|passcode|otp|captcha|social security|ssn|national id|passport|aadhaar|aadhar|pan number|tax id|bank|salary|compensation|gender|sex|ethnicity|race|religion|disability|veteran|citizenship|nationality|visa|sponsorship|work authorization|authorized|legally|legal name|signature|consent|terms|privacy|reference|referee|emergency|manager name|manager email|preferred name|birth)\b/;
 function classify(label,name='',autocomplete=''){
  if(sensitive.test(normalize(label+' '+name)))return null;
  const labels=[label,name].map(normalize).map(s=>s.replace(/\b(required|optional)\b/g,'').replace(/^enter (?:your )?/,'').trim());
  const explicit=rules.find(([,pattern])=>pattern.test(labels[0]));if(explicit)return explicit[0];
  // A conflicting visible label wins over a technical name/autocomplete hint.
  if(labels[0]&&normalize(label)!==normalize(name))return null;
  const auto={'given-name':'firstName','family-name':'lastName',name:'fullName',email:'email',tel:'phone','street-address':'address','address-line1':'address','address-level2':'city','address-level1':'state','postal-code':'postalCode','country-name':'country',country:'country',url:'website'};
  for(const part of autocomplete.split(/\s+/))if(auto[part])return auto[part];
  for(const label of labels){const match=rules.find(([,pattern])=>pattern.test(label));if(match)return match[0];}
  return null;
 }
 function labelFor(node){
  if(node.type==='file'&&node.id==='resume'&&/\.greenhouse\.io$/.test(location.hostname||'')&&/resume|cv/i.test(document.getElementById('upload-label-resume')?.textContent||''))return 'Resume/CV';
  const explicit=[...(node.labels||[])].map(label=>{if(!label.cloneNode)return label.innerText||label.textContent||'';const copy=label.cloneNode(true);copy.querySelectorAll('input,textarea,select,button').forEach(child=>child.remove());return copy.textContent||'';}).join(' ').trim();
  const labelled=(node.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();
  return (explicit||node.getAttribute('aria-label')||labelled||node.getAttribute('placeholder')||node.name||node.id||'Field').replace(/\s+/g,' ').trim().slice(0,240);
 }
 function contextFor(node){const fieldset=node.closest('fieldset');return fieldset?.querySelector('legend')?.textContent||'';}
 function combo(node){return node.getAttribute('role')==='combobox'&&node.tagName!=='SELECT';}
 function selectedText(node){return combo(node)?node.closest('.select__value-container')?.querySelector('.select__single-value')?.textContent?.trim()||'':'';}
 function visible(node){return node.isConnected&&!node.disabled&&!node.readOnly&&!node.closest('[hidden],[aria-hidden="true"],[inert]')&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).display!=='none';}
 function empty(node){if(selectedText(node))return false;return !String(node.value||'').trim()||(node.tagName==='SELECT'&&/^(?:select|choose|please select|--)/i.test(node.selectedOptions[0]?.textContent?.trim()||''));}
 function historyValue(node,label,profile,groups){
  let kind,group=node.closest('.employment-form,[data-nextrole-group="employment"]');if(group)kind='employment';else{group=node.closest('.education-form,[data-nextrole-group="education"]');if(group)kind='education';}
  if(!group)return null;const map=groups[kind];if(!map.has(group)){const explicit=/\.greenhouse\.io$/.test(location.hostname||'')?node.id.match(/^(?:company-name|title|start-date-month|start-date-year|end-date-month|end-date-year)-(\d+)$/)?.[1]:null;map.set(group,explicit===null||explicit===undefined?map.size:Number(explicit));}const index=map.get(group),keyLabel=normalize(label).replace(/\b(required|optional)\b/g,'').trim();
  const keys={company:'company', 'company name':'company',employer:'company',title:'title','job title':'title',designation:'title',school:'school',university:'school',degree:'degree','field of study':'fieldOfStudy',major:'fieldOfStudy','start date month':'startMonth','start month':'startMonth','start date year':'startYear','start year':'startYear','end date month':'endMonth','end month':'endMonth','end date year':'endYear','end year':'endYear','current role':'current','currently studying':'current'};
  const key=keys[keyLabel];if(!key)return null;const entry=profile[kind+'History']?.[index];return {key:'history:'+kind+':'+index+':'+key,value:entry?.[key]||'',checkbox:node.type==='checkbox'&&key==='current',month:/Month$/.test(key),omit:entry?.current==='Yes'&&/^(?:endMonth|endYear)$/.test(key)};
 }
 function optionFor(options,value,key){
  const aliases={country:{india:['india','in','ind'],unitedstates:['united states','united states of america','us','usa'],unitedkingdom:['united kingdom','uk','gb']},city:{bengaluru:['bengaluru','bangalore'],gurugram:['gurugram','gurgaon'],kochi:['kochi','cochin']}};
  const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'],monthIndex=monthNames.indexOf(normalize(value));
  const group=Object.values(aliases[key]||{}).find(g=>g.includes(normalize(value))),values=group||(/Month$/.test(key)&&monthIndex>=0?[normalize(value),normalize(value).slice(0,3),String(monthIndex+1),String(monthIndex+1).padStart(2,'0')]:[normalize(value)]);
  const matches=[...options].filter(o=>!o.disabled&&!/^(?:select|choose|please select|--)/i.test(o.textContent.trim())&&values.some(v=>normalize(o.textContent)===v||normalize(o.value)===v));
  return matches.length===1?matches[0]:null;
 }
 let plan=new Map(),origin='',revision='';
 function scan(profile,resume){
  plan=new Map();origin=location.origin;revision=location.href;const rows=[],questions=[],counts={};
  const candidates=[...document.querySelectorAll('input,textarea,select')],groups={employment:new Map(),education:new Map()};
  const applicationPage=candidates.some(n=>visible(n)&&(/\b(resume|cv)\b/i.test(labelFor(n))||classify(labelFor(n),n.name||n.id||'',n.autocomplete||'')==='email'));
  for(const node of candidates){
   if(!visible(node))continue;
   const label=labelFor(node),context=contextFor(node),history=historyValue(node,label,profile,groups);if(history?.omit||sensitive.test(normalize(context)))continue;
   const currentCheckbox=history?.checkbox;if(currentCheckbox){if(node.checked||history.value!=='Yes')continue;}else if(!empty(node)||['password','hidden','checkbox','radio','submit','button','reset','month'].includes(node.type))continue;
   const file=node.type==='file';let key=history?.key||(file&&/\b(resume|cv)\b/i.test(label)&&!/cover|transcript|certificate/i.test(label)?'resume':file?null:classify(label,node.name||node.id||'',node.autocomplete||''));
   if(sensitive.test(normalize(label+' '+(node.name||''))))continue;
   if(!key&&!file&&applicationPage&&label.length>=12&&!/\b(search|filter|coupon|newsletter)\b/i.test(label)&&['text','number','url','email','tel','select-one','textarea'].includes(node.type||node.tagName.toLowerCase()))key='question';
   let reusable=null;if(!history&&(!key||key==='question'||!profile[key])){const matching=(profile.answers||[]).filter(a=>normalize(a.question)===normalize(label));if(matching.length===1)reusable=matching[0].answer;}
   if(!key&&reusable)key='question';if(!key)continue;
   let value=history?history.value:key==='fullName'?[profile.firstName,profile.lastName].filter(Boolean).join(' '):key==='resume'?resume?.name:profile[key]||reusable;
   if(!value&&key==='question'){const onsite=label.match(/^are you willing to work from (?:the )?office in (.+?)\??\s*\*?$/i);if(onsite&&String(profile.onsiteCities||'').split(/[,;]/).some(city=>normalize(city)===normalize(onsite[1])))value='Yes';}
   if(node.type==='date'&&key!=='availableStartDate')continue;
   if(key==='fullName'&&(!profile.firstName||!profile.lastName))value='';
   if(file&&!value)continue;
   let option=null;if(node.tagName==='SELECT'&&value){option=optionFor(node.options,value,key);if(!option)value='';}
   if(file){const accepts=(node.accept||'').toLowerCase();if(accepts&&!accepts.split(',').some(a=>a.trim()===resume.type||resume.name.toLowerCase().endsWith(a.trim())||a.trim()==='application/*'))continue;}
   const id=crypto.randomUUID(),record={node,key,label,value:String(value||''),optionValue:option?.value,original:node.value||'',context,currentCheckbox,originalChecked:!!node.checked,month:history?.month};
   plan.set(id,record);counts[key]=(counts[key]||0)+1;
   if(value)rows.push({id,key,label,value:String(value)});
   else questions.push({id,key,label,context,options:node.tagName==='SELECT'?[...node.options].filter(o=>!o.disabled&&o.value).map(o=>({value:o.value,label:o.textContent.trim()})):null});
  }
  // Repeated school/employment groups must not all receive the same history entry.
  const singular=new Set(['school','degree','fieldOfStudy','graduationYear','currentCompany','currentTitle','experience','resume']);
  const unique=r=>(!singular.has(r.key)&&!r.key.startsWith('history:'))||counts[r.key]===1;
  const safe=rows.filter(unique),safeQuestions=questions.filter(unique);for(const row of [...rows,...questions])if(!safe.includes(row)&&!safeQuestions.includes(row))plan.delete(row.id);
  return {origin,rows:safe,questions:safeQuestions};
 }
 function answer(answers,expectedOrigin){
  if(location.origin!==origin||location.origin!==expectedOrigin||location.href!==revision)throw Error('The page changed. Scan it again.');
  const rows=[];
  for(const {id,value} of answers){const item=plan.get(id);if(!item||item.value||typeof value!=='string'||!value.trim()||value.length>2000)continue;
   const node=item.node;if(!visible(node)||node.value!==item.original||labelFor(node)!==item.label||contextFor(node)!==item.context)continue;
   let option=null;if(node.tagName==='SELECT'){option=[...node.options].find(o=>!o.disabled&&o.value===value);if(!option)continue;}
   item.value=option?option.textContent.trim():value.trim();item.optionValue=option?.value;rows.push({id:item.id||id,key:item.key,label:item.label,value:item.value});
  }return rows;
 }
 function setValue(node,value){const type=node.tagName==='TEXTAREA'?HTMLTextAreaElement:node.tagName==='SELECT'?HTMLSelectElement:HTMLInputElement;const setter=Object.getOwnPropertyDescriptor(type.prototype,'value')?.set;if(!setter)throw Error('Unsupported input');setter.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}
 async function selectCombo(node,value,month){
  node.focus();setValue(node,value);let choices=[];
  for(let attempt=0;attempt<12;attempt++){const ids=(node.getAttribute('aria-controls')||node.getAttribute('aria-owns')||'').split(/\s+/);const lists=ids.map(id=>document.getElementById(id)).filter(Boolean);choices=lists.flatMap(list=>[...list.querySelectorAll('[role="option"]')]).filter(option=>visible(option)&&option.getAttribute('aria-disabled')!=='true'&&(normalize(option.textContent)===normalize(value)||(month&&normalize(option.textContent).slice(0,3)===normalize(value).slice(0,3))));if(choices.length)break;await new Promise(resolve=>setTimeout(resolve,100));}
  if(choices.length!==1){setValue(node,'');node.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));throw Error('Choose this dropdown manually');}
  choices[0].click();if(normalize(selectedText(node))!==normalize(choices[0].textContent))throw Error('Dropdown selection could not be verified');
 }
 async function fill(ids,expectedOrigin,resume){
  if(location.origin!==origin||location.origin!==expectedOrigin||location.href!==revision)throw Error('The page changed. Scan it again.');
  const result={filled:0,skipped:0,failed:0};
  for(const id of ids){const item=plan.get(id);if(!item||!item.value){result.skipped++;continue;}const {node}=item;
   if(!visible(node)||node.value!==item.original||labelFor(node)!==item.label||contextFor(node)!==item.context||(item.currentCheckbox?node.checked!==item.originalChecked:!empty(node))){result.skipped++;continue;}
   try{
    if(item.key==='resume'){
     if(!resume||resume.name!==item.value||resume.size>5*1024*1024)throw Error('Choose the same resume again');
     const bytes=Uint8Array.from(atob(resume.base64),c=>c.charCodeAt(0));if(bytes.length!==resume.size)throw Error('Incomplete resume');
     const transfer=new DataTransfer();transfer.items.add(new File([bytes],resume.name,{type:resume.type}));node.files=transfer.files;node.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(item.currentCheckbox){node.click();if(!node.checked)throw Error('Current role was not retained');
    }else if(combo(node)){await selectCombo(node,item.value,item.month);
    }else{
     const value=item.optionValue??item.value;if(node.maxLength>0&&value.length>node.maxLength)throw Error('Field too short');setValue(node,value);
     if(node.validity&&!node.validity.valid){setValue(node,item.original);throw Error('The site rejected this format');}
     if(node.value!==value)throw Error('The site did not retain this value');
    }
    result.filled++;plan.delete(id);
   }catch{result.failed++;}
  }
  return result;
 }
 globalThis.NextRoleAutofill={scan,answer,fill,classify,optionFor};
})();

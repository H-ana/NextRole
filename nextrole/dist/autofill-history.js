/* Local structured history extraction and reviewed profile schema. No inferred dates. */
(()=>{
 const base=globalThis.NextRoleResumeProfile,parseBase=base.parse;
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const employmentFields=[['company','Company name'],['title','Job title'],['startMonth','Start month'],['startYear','Start year'],['endMonth','End month'],['endYear','End year'],['current','Current role (Yes/No)'],['location','Job location']];
 const educationFields=[['school','University / school'],['degree','Degree'],['fieldOfStudy','Field of study'],['startMonth','Start month'],['startYear','Start year'],['endMonth','End month'],['endYear','End / graduation year'],['current','Currently studying (Yes/No)'],['grade','Grade / GPA exactly as stated']];
 const extra=[['noticePeriod','Notice period'],['availableStartDate','Available start date (YYYY-MM-DD)'],['preferredLocations','Cities you would consider working in'],['onsiteCities','Cities where you agree to work from the office'],['willingToRelocate','Willing to relocate (Yes/No)'],['willingToTravel','Willing to travel (Yes/No)'],['employmentType','Preferred employment type'],['skills','Skills you actually possess']];
 base.fields=[...base.fields,...extra];
 function month(value){const n=Number(value);if(Number.isInteger(n)&&n>=1&&n<=12)return months[n-1];const found=months.find(m=>m.toLowerCase().startsWith(String(value||'').trim().toLowerCase().replace(/\.$/,'')));return value&&found?found:'';}
 const point='(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s*\\d{4}|\\d{1,2}[/-]\\d{4}|\\d{4})';
 const interval=new RegExp('('+point+')\\s*(?:-|\\u2013|\\u2014|to)\\s*('+point+'|Present|Current|Now)','i');
 function date(value){const year=value.match(/(?:19|20)\d{2}/)?.[0];const token=value.replace(year||'','').replace(/[/\s-]+/g,'').trim();return {year:year||'',month:token?month(token):''};}
 function section(text,kind){const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),heading=kind==='employment'?/^(?:professional experience|work experience|employment(?: history)?|experience)\s*:?$/i:/^(?:education|academic qualifications)\s*:?$/i;const at=lines.findIndex(s=>heading.test(s));if(at<0)return [];const rest=lines.slice(at+1),end=rest.findIndex(s=>/^(?:skills|technical skills|projects|personal projects|certifications|professional experience|work experience|employment history|experience|education|academic qualifications|achievements|summary|profile)\s*:?$/i.test(s));return end<0?rest:rest.slice(0,end);}
 const role=/\b(?:engineer|developer|analyst|consultant|manager|intern|specialist|associate|scientist|architect|lead|designer|officer|executive|trainee|accountant|director)\b/i;
 const degree=/^(?:bachelor|master|doctor|ph\.?d|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.?\s?e\.?\b|m\.?\s?e\.?\b|mba\b|bca\b|mca\b)/i;
 function history(text,kind){const lines=section(text,kind),rows=[],usedEducationLines=new Set();let previous=-1;
  for(let i=0;i<lines.length;i++){const match=lines[i].match(interval);if(!match)continue;const a=date(match[1]),isCurrent=/^(?:present|current|now)$/i.test(match[2]),b=isCurrent?{}:date(match[2]);
   const headerStart=Math.max(previous+1,i-3);const header=lines.slice(headerStart,i+1).filter((_,offset)=>!usedEducationLines.has(headerStart+offset)).map(line=>line.replace(interval,'').replace(/\s*[|,\u2013\u2014-]\s*$/,'').trim()).filter(s=>s&&!/^[\u2022*\-]/.test(s)&&s.length<=180).flatMap(s=>s.split(/\s*[|\u2022]\s*|\t+|\s{2,}|\s+[\u2013\u2014]\s+/).filter(Boolean));previous=i;
   const following=lines.slice(i+1,i+4),nextDate=following.findIndex(line=>interval.test(line)),after=nextDate<0?following:following.slice(0,nextDate);
   const record={startMonth:a.month,startYear:a.year,endMonth:b.month||'',endYear:b.year||'',current:isCurrent?'Yes':'No'};
   if(kind==='employment'){
    const at=header.map(s=>s.match(/^(.+?)\s+at\s+(.+)$/i)).find(Boolean);const titles=header.filter(s=>role.test(s)&&!/^current employer\s*:/i.test(s));
    if(at){record.title=at[1];record.company=at[2];}else{if(titles.length===1)record.title=titles[0].replace(/^(?:title|designation|position)\s*:\s*/i,'');const companies=header.filter(s=>!role.test(s)&&!/\b(?:remote|hybrid|india)\b/i.test(s)&&!degree.test(s)&&!/^\d/.test(s));if(companies.length===1)record.company=companies[0].replace(/^(?:company|employer)\s*:\s*/i,'');}
    if(!record.title){const stated=after.map(s=>s.match(/\b(?:working as|worked as|as (?:a|an))\s+([^.;,]{2,80})/i)?.[1]).filter(s=>s&&role.test(s));if(stated.length===1)record.title=stated[0].trim();else if(after[0]&&role.test(after[0])&&after[0].length<90&&!/^[\u2022*\-]|[.!?]$/.test(after[0]))record.title=after[0];}
    if(record.company||record.title)rows.push(record);
   }else{const schools=header.filter(s=>/\b(?:university|college|institute|school|IIT|NIT|IIIT|BITS)\b/i.test(s)&&!degree.test(s)),degrees=[...header,...after].filter(s=>degree.test(s));if(schools.length===1)record.school=schools[0];if(degrees.length===1){record.degree=degrees[0];record.fieldOfStudy=record.degree.match(/\bin\s+(.+)$/i)?.[1]||'';}else{const secondary=after.map(s=>s.match(/^(.*?)\s*\((\d{1,2}(?:th|st|nd|rd)?\s+Grade)\)/i)).find(Boolean);if(secondary){record.degree=secondary[2];record.fieldOfStudy=secondary[1].trim();}}const grades=after.map(s=>s.match(/^(?:CGPA|GPA|Grade)\s*[-:]\s*(.{1,40})$/i)?.[1]).filter(Boolean);if(grades.length===1)record.grade=grades[0];after.forEach((line,j)=>{if(degree.test(line)||/^(?:CGPA|GPA|Grade)\s*[-:]/i.test(line)||/\(\d{1,2}(?:th|st|nd|rd)?\s+Grade\)/i.test(line))usedEducationLines.add(i+1+j);});if(record.school||record.degree)rows.push(record);}
  }return rows;
 }
 function parse(text,years){text=String(text||'').replace(/\u00a0/g,' ').replace(/^(?:employment history|professional background|career history)\s*:?\s*$/gim,'WORK EXPERIENCE').replace(/^(?:academic background|educational qualifications|education & qualifications)\s*:?\s*$/gim,'EDUCATION');const profile=parseBase(text,years),employmentHistory=history(text,'employment'),educationHistory=history(text,'education');
  const resumeLines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),skillAt=resumeLines.findIndex(s=>/^(?:skills|technical skills|relevant skills)\s*:?$/i.test(s));
  if(skillAt>=0){const rest=resumeLines.slice(skillAt+1),end=rest.findIndex(s=>/^(?:experience|work experience|professional experience|education|projects|certifications|summary|profile)\s*:?$/i.test(s)),skillLines=end<0?rest:rest.slice(0,end);if(skillLines.length&&skillLines.join(', ').length<=1000)profile.skills=skillLines.join(', ');}
  for(const [key,label] of [['noticePeriod','notice period'],['availableStartDate','available start date'],['skills','(?:technical )?skills']]){const matches=resumeLines.map(line=>line.match(new RegExp('^'+label+'\\s*:\\s*(.{1,300})$','i'))?.[1]).filter(Boolean);if(new Set(matches).size===1)profile[key]=matches[0];}
  if(employmentHistory.length)profile.employmentHistory=employmentHistory;if(educationHistory.length)profile.educationHistory=educationHistory;
  const primary=educationHistory[0];if(primary?.degree){for(const key of ['school','degree','fieldOfStudy'])profile[key]??=primary[key];if(primary.current==='No'&&primary.endYear)profile.graduationYear??=primary.endYear;}
  const current=employmentHistory.filter(r=>r.current==='Yes');if(current.length===1){profile.currentCompany??=current[0].company;profile.currentTitle??=current[0].title;}
  return profile;
 }
 function sanitize(input){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid profile.');const profile={};
  for(const [key] of base.fields){const value=input[key];if(value===undefined||value===null)continue;if(!['string','number'].includes(typeof value))throw Error('Invalid profile field.');const text=String(value).trim();if(text.length>1000)throw Error('Keep profile fields under 1,000 characters.');if(text)profile[key]=text;}
  if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))throw Error('Check the email address.');
  for(const key of ['linkedin','github','website'])if(profile[key]){let u;try{u=new URL(profile[key]);}catch{throw Error('Use complete https:// profile URLs.');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Use complete https:// profile URLs.');}
  if(profile.experience!==undefined&&(!Number.isFinite(Number(profile.experience))||Number(profile.experience)<0||Number(profile.experience)>80))throw Error('Check your total years of experience.');
  if(profile.availableStartDate&&!/^\d{4}-\d{2}-\d{2}$/.test(profile.availableStartDate))throw Error('Use YYYY-MM-DD for availability.');
  for(const [key,fields] of [['employmentHistory',employmentFields],['educationHistory',educationFields]]){
   if(input[key]!==undefined&&!Array.isArray(input[key]))throw Error('Invalid history.');const rows=input[key]||[];if(rows.length>30)throw Error('Keep each history list under 30 entries.');
   const cleaned=rows.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid history entry.');const entry={};for(const [field] of fields){if(row[field]===undefined||row[field]==='')continue;if(typeof row[field]!=='string'||row[field].length>300)throw Error('Invalid history field.');entry[field]=row[field].trim();}
    for(const prefix of ['start','end']){if(entry[prefix+'Month']){const m=month(entry[prefix+'Month']);if(!m)throw Error('Check history months.');entry[prefix+'Month']=m;}if(entry[prefix+'Year']&&!/^(?:19|20)\d{2}$/.test(entry[prefix+'Year']))throw Error('Use four-digit history years.');}
    if(entry.current&&!/^(?:Yes|No)$/.test(entry.current))throw Error('Choose Yes or No for current entries.');if(entry.current==='Yes'&&(entry.endMonth||entry.endYear))throw Error('A current entry cannot have an end date.');
    if(entry.startYear&&entry.endYear&&(Number(entry.endYear)*12+months.indexOf(entry.endMonth)<Number(entry.startYear)*12+months.indexOf(entry.startMonth)))throw Error('An end date cannot precede its start date.');return entry;}).filter(row=>Object.keys(row).length);
   if(cleaned.length)profile[key]=cleaned;
  }
  if(input.answers!==undefined&&!Array.isArray(input.answers))throw Error('Invalid reusable answers.');if((input.answers||[]).length>50)throw Error('Keep reusable answers under 50 entries.');
  const answers=(input.answers||[]).filter(a=>a?.question?.trim()&&a?.answer?.trim()).map(a=>{if(typeof a.question!=='string'||typeof a.answer!=='string'||a.question.length>300||a.answer.length>2000)throw Error('Invalid reusable answer.');return {question:a.question.trim(),answer:a.answer.trim()};});if(answers.length)profile.answers=answers;
  if(!Object.keys(profile).length)throw Error('Add at least one confirmed profile detail.');return profile;
 }
 base.parse=parse;globalThis.NextRoleAutofillProfile={months,month,employmentFields,educationFields,history,sanitize};
})();

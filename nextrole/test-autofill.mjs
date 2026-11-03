import assert from 'node:assert/strict';
import {autofillPayload,suggestedAutofillProfile,mergeAutofillProfile} from './dist/autofill-profile.mjs';
import './browser-extension/form-engine.js';
const engine=globalThis.NextRoleAutofill;
const suggested=suggestedAutofillProfile('Alex Example\nalex@example.com\n+91 98765 43210\nhttps://linkedin.com/in/alex-example',2);
assert.equal(suggested.firstName,'Alex');assert.equal(suggested.email,'alex@example.com');assert.equal(suggested.experience,'2');
assert.equal(suggestedAutofillProfile('RELEVANT SKILLS\nPython, SQL',2).firstName,undefined);
assert.throws(()=>autofillPayload({website:'javascript:alert(1)'}));assert.throws(()=>autofillPayload({email:'bad'}));
const payload=autofillPayload({firstName:'Alex',email:'alex@example.com',experience:'2',unexpected:'secret'});
assert.equal(payload.reviewed,true);assert(!('unexpected' in payload.profile));
const explicit=suggestedAutofillProfile('Alex Example\nalex@example.com\nCurrent city: Bengaluru\nCurrent employer: Example Ltd\nCurrent job title: Analyst\nEDUCATION\nBachelor of Technology in Computer Science\nExample University\nSKILLS\nPython, SQL',2);
assert.equal(suggestedAutofillProfile('Alex Example\nEDUCATION\nExample University\t\tJun 2020-Jun 2024',2).school,'Example University');
assert.equal(explicit.city,'Bengaluru');assert.equal(explicit.currentCompany,'Example Ltd');assert.equal(explicit.school,'Example University');assert.equal(explicit.degree,'Bachelor of Technology in Computer Science');assert.equal(explicit.fieldOfStudy,'Computer Science');
assert.equal(suggestedAutofillProfile('Alex Example\nPROJECTS\nWebsite for Example University',2).school,undefined);
assert.equal(suggestedAutofillProfile('Alex Example\nEDUCATION\nExample University\nOther University',2).school,undefined,'Ambiguous qualifications stay unanswered');
assert.equal(suggestedAutofillProfile('Alex Example\nDesired city: Delhi\nEXPERIENCE\nFormer employer: Example Ltd',2).city,undefined);
assert.equal(suggestedAutofillProfile('Alex Example\nCurrent city: Delhi\nCurrent city: Kochi',2).city,undefined);
assert.deepEqual(mergeAutofillProfile({email:'new@example.com'},{revision:'old',profile:{email:'old@example.com',city:'Delhi'}},'new'),{email:'new@example.com'});
assert.equal(mergeAutofillProfile({email:'new@example.com'},{revision:'same',profile:{email:'old@example.com'}},'same').email,'old@example.com');
assert.notEqual(await NextRoleResumeProfile.revision('old',2),await NextRoleResumeProfile.revision('new',2));
assert.notEqual(await NextRoleResumeProfile.revision('same',2),await NextRoleResumeProfile.revision('same',3));
for(const label of ['Password','Email password','National ID','Salary','Gender','Disability','Work authorization','Visa sponsorship','Reference email','Legal full name','Signature','Date of birth'])assert.equal(engine.classify(label),null,label);
assert.equal(engine.classify('Former employer','currentCompany','organization'),null);
assert.equal(engine.classify('First name','first_name','given-name'),'firstName');assert.equal(engine.classify('Current employer'),'currentCompany');
assert.equal(engine.classify('Full name'),'fullName');

class Input{
 constructor(label,{type='text',value='',name='',hidden=false,readonly=false,context=''}={}){this.tagName='INPUT';this.type=type;this._value=value;this.name=name;this.id='';this.labels=[{innerText:label}];this.autocomplete='';this.disabled=false;this.readOnly=readonly;this.isConnected=true;this.hidden=hidden;this.context=context;this.maxLength=-1;this.events=[];}
 get value(){return this._value;}set value(v){this._value=String(v);}
 getAttribute(){return '';}
 closest(selector){if(selector==='fieldset')return this.context?{querySelector:()=>({textContent:this.context})}:null;return this.hidden?{}:null;}
 getClientRects(){return this.hidden?[]:[{}];}
 dispatchEvent(event){this.events.push(event.type);}
 get validity(){return {valid:true};}
 click(){throw Error('No clicks permitted');}submit(){throw Error('No submissions permitted');}
}
class Select extends Input{constructor(label,options){super(label);this.tagName='SELECT';this.type='select-one';this.options=options;}get value(){return this._value;}set value(v){this._value=String(v);}get selectedOptions(){return this.options.filter(o=>o.value===this.value);}}
globalThis.HTMLInputElement=Input;globalThis.HTMLTextAreaElement=Input;globalThis.HTMLSelectElement=Select;
globalThis.location={origin:'https://careers.example',href:'https://careers.example/apply'};
globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
let fields=[];globalThis.document={querySelectorAll:()=>fields,getElementById:()=>null};
const first=new Input('First name'),last=new Input('Last name'),email=new Input('Email address'),existing=new Input('Phone number',{value:'my own answer'}),hidden=new Input('Email',{hidden:true}),sensitive=new Input('Reference email'),readOnly=new Input('City',{readonly:true}),checkbox=new Input('I accept terms',{type:'checkbox'}),country=new Select('Country',[{textContent:'Select country',value:''},{textContent:'India',value:'IN'}]);
fields=[first,last,email,existing,hidden,sensitive,readOnly,checkbox,country];
const profile={firstName:'Alex',lastName:'Example',email:'alex@example.com',phone:'+919876543210',city:'Bengaluru',country:'India'};
let plan=engine.scan(profile,null);assert.equal(plan.rows.length,4);
let result=await engine.fill(plan.rows.map(r=>r.id),plan.origin,null);assert.equal(result.filled,4);assert.equal(country.value,'IN');assert.equal(email.value,profile.email);assert.deepEqual(first.events,['input','change']);assert.equal(existing.value,'my own answer');assert.equal(sensitive.value,'');assert.equal(checkbox.value,'');
fields=[new Input('University'),new Input('University')];assert.equal(engine.scan({school:'Example University'},null).rows.length,0,'Do not duplicate one education entry into multiple roles');
fields=[new Input('First name')];plan=engine.scan(profile,null);fields[0].value='Changed by user';result=await engine.fill(plan.rows.map(r=>r.id),plan.origin,null);assert.equal(result.skipped,1);assert.equal(fields[0].value,'Changed by user');
fields=[new Input('First name')];plan=engine.scan(profile,null);fields[0].labels[0].innerText='Reference first name';result=await engine.fill(plan.rows.map(r=>r.id),plan.origin,null);assert.equal(result.skipped,1);
fields=[new Input('Email')];plan=engine.scan(profile,null);location.href+='?next=1';await assert.rejects(()=>engine.fill(plan.rows.map(r=>r.id),plan.origin,null),/page changed/);
assert.equal(engine.optionFor([{textContent:'India',value:'IN'},{textContent:'India',value:'other'}],'India','country'),null,'Ambiguous options stay manual');
fields=[new Input('Email'),new Input('Current city'),new Input('Why are you interested in this role?'),new Input('Passport number')];
plan=engine.scan({email:'alex@example.com'},null);assert.equal(plan.rows.length,1);assert.equal(plan.questions.length,2);assert(!plan.questions.some(q=>q.label==='Email'));
assert.equal(fields[1].value,'','Scanning must not write answers');
const answers=engine.answer(plan.questions.map(q=>({id:q.id,value:q.key==='city'?'Kochi':'I am interested in this team.'})),plan.origin);
assert.equal(answers.length,2);assert.equal(fields[1].value,'','Questions must be reviewed before filling');
result=await engine.fill(answers.map(r=>r.id),plan.origin,null);assert.equal(result.filled,2);assert.equal(fields[1].value,'Kochi');assert.equal(fields[3].value,'');
fields=[new Input('Email'),new Input('Why are you interested in this other role?')];plan=engine.scan({email:'alex@example.com'},null);assert.equal(plan.questions.length,1,'Job-specific answers must not transfer to another application');
assert.equal(engine.answer([{id:answers[1].id,value:'stale answer'}],plan.origin).length,0);
fields=[new Input('Email'),new Input('Country')];plan=engine.scan({email:'alex@example.com'},null);fields[1].value='Typed after preview';assert.equal(engine.answer([{id:plan.questions[0].id,value:'India'}],plan.origin).length,0);
console.log('Reviewed profile, sensitive-field exclusions, native form filling, dropdowns, stale-page checks, duplicate history and non-overwrite safeguards passed.');
const resumeHistory='Alex Example\nalex@example.com\nWORK EXPERIENCE\nExample Ltd | Data Analyst | Jun2024 - Present\n- Built automated reconciliation workflows.\nOther Corp | Intern | Jan 2023 - May 2024\nEDUCATION\nExample University | B.Tech in Computer Science | Jun 2020-Jun 2024\nSKILLS\nPython, SQL';
const parsedHistory=suggestedAutofillProfile(resumeHistory,2);
assert.equal(parsedHistory.employmentHistory.length,2);assert.equal(parsedHistory.employmentHistory[0].company,'Example Ltd');assert.equal(parsedHistory.employmentHistory[0].startMonth,'June');assert.equal(parsedHistory.employmentHistory[0].startYear,'2024');assert.equal(parsedHistory.currentCompany,'Example Ltd');assert.equal(parsedHistory.employmentHistory[1].endMonth,'May');assert.equal(parsedHistory.educationHistory[0].endYear,'2024');
const yearOnly=suggestedAutofillProfile('Alex Example\nEXPERIENCE\nExample Ltd | Analyst | 2023 - 2024',2);assert.equal(yearOnly.employmentHistory[0].startMonth,'','Do not invent months from year-only dates');
class HistoryInput extends Input{constructor(label,group,options={}){super(label,options);this.group=group;}closest(selector){return selector.startsWith('.employment-form')?this.group:super.closest(selector);}}
const groupA={},groupB={},companyA=new HistoryInput('Company name*',groupA),companyB=new HistoryInput('Company name',groupB),startA=new HistoryInput('Start date month*',groupA),startB=new HistoryInput('Start date year',groupB);
fields=[companyA,startA,companyB,startB];plan=engine.scan(parsedHistory,null);assert.equal(plan.questions.length,0);assert.equal(plan.rows.length,4);await engine.fill(plan.rows.map(r=>r.id),plan.origin,null);assert.equal(companyA.value,'Example Ltd');assert.equal(companyB.value,'Other Corp');assert.equal(startA.value,'June');assert.equal(startB.value,'2023');
fields=[new HistoryInput('Company name',groupA),new HistoryInput('Company name',groupA)];assert.equal(engine.scan(parsedHistory,null).rows.length,0,'Ambiguous duplicate groups cannot reuse one job incorrectly');
fields=[new Input('Email'),new Input('What is your notice period?')];plan=engine.scan({email:'alex@example.com',answers:[{question:'What is your notice period?',answer:'30 days'}]},null);assert.equal(plan.questions.length,0);assert.equal(plan.rows[1].value,'30 days');
fields=[new Input('Email'),new Input('Why do you want to join Example?')];plan=engine.scan({email:'alex@example.com',answers:[{question:'Why do you want to join Other?',answer:'An answer for another employer'}]},null);assert.equal(plan.questions.length,1,'Different questions must not borrow answers');
assert.throws(()=>autofillPayload({firstName:'Alex',employmentHistory:[{company:'Example',startYear:'2025',endYear:'2024'}]}),/precede/);
assert.throws(()=>autofillPayload({firstName:'Alex',employmentHistory:[{company:'Example',startMonth:'Unknown'}]}),/months/);
assert.throws(()=>autofillPayload({firstName:'Alex',employmentHistory:[{current:'Yes',endYear:'2024'}]}),/end date/);
console.log('Employment and education history, source dates, separate role groups, reusable answers and date validation passed.');
const stacked=suggestedAutofillProfile('Alex Example\nExperience\nExample Ltd | AUGUST 2024 - PRESENT\nContributed to projects as a Data Analyst / Tech Analyst.\nEducation\nExample University\tJun 2020-Jun 2024\nB.Tech in Computer Science\nCGPA-8.99\nOther school\tJun 2019-Jun 2020\nScience (12th Grade)',2);
assert.equal(stacked.employmentHistory[0].title,'Data Analyst / Tech Analyst');assert.equal(stacked.educationHistory[0].degree,'B.Tech in Computer Science');assert.equal(stacked.educationHistory[0].grade,'8.99');assert.equal(stacked.educationHistory[1].degree,'12th Grade');assert.equal(stacked.educationHistory[1].fieldOfStudy,'Science');assert.equal(stacked.graduationYear,'2024');
console.log('Stacked resume headers, stated role titles, education lines and GPA extraction passed.');

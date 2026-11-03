/* Persistent local documents. No cloud sync, network calls or credentials. */
(()=>{
 const PROFILE='nextroleApprovedProfile',RESUME='nextroleSavedResume',META='nextroleDocumentsMetadata';
 async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value);return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
 function validateProfile(payload){if(!payload||payload.format!=='nextrole-autofill'||![1,2].includes(payload.version)||payload.reviewed!==true)throw Error('Export a reviewed profile from NextRole first.');return {format:payload.format,version:2,reviewed:true,profile:NextRoleAutofillProfile.sanitize(payload.profile)};}
 async function load(){
  if(chrome.storage.local.setAccessLevel)await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const data=await chrome.storage.local.get([PROFILE,RESUME]);let profile=null;
  if(data[PROFILE])profile=validateProfile(data[PROFILE].format?data[PROFILE]:{format:'nextrole-autofill',version:1,reviewed:true,profile:data[PROFILE]});
  return {payload:profile,resume:data[RESUME]||null};
 }
 async function saveProfile(file){if(!file||file.size>256*1024)throw Error('Choose a reviewed profile JSON under 256 KB.');const payload=validateProfile(JSON.parse(await file.text()));await chrome.storage.local.set({[PROFILE]:payload,[META]:{savedAt:Date.now()}});return payload;}
 async function resumeDocument(file){
  if(!file||file.size>5*1024*1024||!/^.+\.(?:pdf|docx)$/i.test(file.name))throw Error('Choose a PDF or DOCX resume under 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());if(!bytes.length)throw Error('Choose a non-empty resume.');
  const pdf=/\.pdf$/i.test(file.name);if(pdf?String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-':bytes[0]!==80||bytes[1]!==75)throw Error('The file does not look like the selected PDF or DOCX format.');
  let binary='';for(let i=0;i<bytes.length;i+=16000)binary+=String.fromCharCode(...bytes.subarray(i,i+16000));
  const resume={name:file.name,size:bytes.length,type:pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',base64:btoa(binary),digest:await hash(bytes)};
  return resume;
 }
 async function saveResume(file){const resume=await resumeDocument(file);await chrome.storage.local.set({[RESUME]:resume,[META]:{savedAt:Date.now()}});return resume;}
 async function validateTransfer(documents){
  if(!documents||typeof documents!=='object'||JSON.stringify(documents.payload||{}).length>256*1024)throw Error('The reviewed profile is too large.');
  const payload=validateProfile(documents.payload),input=documents.resume;
  if(!input||typeof input.name!=='string'||input.name.length>200||!Number.isInteger(input.size)||input.size<=0||input.size>5*1024*1024||typeof input.base64!=='string'||input.base64.length>7*1024*1024)throw Error('Choose a PDF or DOCX resume under 5 MB.');
  let binary;try{binary=atob(input.base64);}catch{throw Error('The resume transfer is incomplete.');}if(binary.length!==input.size)throw Error('The resume transfer is incomplete.');
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const resume=await resumeDocument({name:input.name,size:input.size,arrayBuffer:async()=>bytes.buffer});return {payload,resume};
 }
 async function savePair(documents){await chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'});await chrome.storage.local.set({[PROFILE]:documents.payload,[RESUME]:documents.resume,[META]:{savedAt:Date.now()}});}
 async function revision(documents){if(!documents.payload||!documents.resume)throw Error('Upload both your reviewed profile JSON and resume once. They stay saved until you replace or remove them.');return hash(JSON.stringify(documents.payload)+'\n'+documents.resume.digest);}
 async function metadata(){const documents=await load(),data=await chrome.storage.local.get(META);return {hasProfile:!!documents.payload,hasResume:!!documents.resume,resumeName:documents.resume?.name||'',savedAt:data[META]?.savedAt||null,fingerprint:documents.payload&&documents.resume?await revision(documents):null};}
 async function remove(kind){await chrome.storage.local.remove(kind==='all'?[PROFILE,RESUME,META]:[kind==='profile'?PROFILE:RESUME,META]);}
 globalThis.NextRoleAutofillDocuments={PROFILE,RESUME,validateProfile,validateTransfer,savePair,metadata,load,saveProfile,saveResume,revision,remove};
})();

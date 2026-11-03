import {autofillPayload} from './autofill-profile.mjs?v=126';
import {extensionRequest,transferDocuments,awaitTransfer} from './extension-client.mjs?v=126';
import {documentFingerprint} from './autofill-save-status.mjs?v=126';
export async function backupExtensionDocuments(data){
 const entries=data.entries||{},review=JSON.parse(entries['nextrole-autofill-profile-v1']||'null'),resume=JSON.parse(entries['nextrole-retained-resume-v1']||'null'),preferences=JSON.parse(entries['nextrole-profile']||'null');
 if(!review?.profile||!resume?.text?.trim()||!data.file)throw Error('This backup needs a reviewed autofill profile and a PDF/Word resume. Open Application autofill after reloading to complete them.');
 if(!preferences||review.revision!==await NextRoleResumeProfile.revision(resume.text,preferences.experience))throw Error('The backed-up autofill profile needs review for this resume. Open Application autofill after reloading, review it and save to the extension.');
 const bytes=Uint8Array.from(atob(data.file.bytes),c=>c.charCodeAt(0)),pdf=/\.pdf$/i.test(data.file.name);
 if(!bytes.length||bytes.length>5*1024*1024||!/^.+\.(pdf|docx)$/i.test(data.file.name)||(pdf?String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-':bytes[0]!==80||bytes[1]!==75))throw Error('The backup resume is not a valid PDF/Word attachment. Choose a valid file in Application autofill.');
 return {payload:autofillPayload(review.profile),file:new File([bytes],data.file.name,{type:pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})};
}
export async function restoreBackupToExtension(data,{signal,onConfirm=()=>{},request=extensionRequest,transfer=transferDocuments,wait=awaitTransfer}={}){
 const documents=await backupExtensionDocuments(data);
 if(signal?.aborted)return {state:'cancelled'};
 await request('PING',{},1500);
 if(signal?.aborted)return {state:'cancelled'};
 const result=await transfer(documents.payload,documents.file);onConfirm();
 const state=await wait(result.requestId,{signal});
 if(!['saved','cancelled'].includes(state))throw Error('Extension restore was not confirmed. Retry restoring to the extension.');
 return {state,fingerprint:state==='saved'?await documentFingerprint(documents.payload,documents.file):null};
}

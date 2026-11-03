importScripts('extension-config.js','autofill-parser.js','autofill-history.js','documents.js');
const PENDING='nextrolePendingTransfer',RECEIPT='nextroleTransferReceipt',TTL=10*60*1000;
let preparing=false;
function trustedSite(sender){try{const url=new URL(sender.url||'');return sender.frameId===0&&!!sender.tab?.id&&NextRoleExtensionConfig.allowedOrigins.includes(url.origin);}catch{return false;}}
function ownConfirmation(sender){return !sender.tab?.url?.startsWith('http')&&sender.url===chrome.runtime.getURL('confirm.html');}
async function handle(message,sender){
 if(message?.type?.startsWith('SITE_')){
  if(!trustedSite(sender))throw Error('Only the NextRole website can connect.');
  const origin=new URL(sender.url).origin;
  if(message.type==='SITE_PING')return {ok:true,version:chrome.runtime.getManifest().version,documentManagement:true,savedDocuments:await NextRoleAutofillDocuments.metadata()};
  if(message.type==='SITE_STATUS'){
   const receipt=(await chrome.storage.session.get(RECEIPT))[RECEIPT];
   if(!receipt||receipt.id!==message.requestId||receipt.origin!==origin||receipt.tabId!==sender.tab.id||Date.now()-receipt.created>TTL)throw Error('This transfer expired. Send it again.');
   return {ok:true,state:receipt.state};
  }
  if(['SITE_PREPARE','SITE_PREPARE_CLEAR'].includes(message.type)){
   if(preparing)throw Error('A transfer is already being prepared.');preparing=true;
   try{
    const old=(await chrome.storage.session.get(PENDING))[PENDING];if(old&&Date.now()-old.created<TTL)throw Error('Finish or cancel the open extension confirmation first.');
    const mode=message.type==='SITE_PREPARE_CLEAR'?'remove':'save',documents=mode==='save'?await NextRoleAutofillDocuments.validateTransfer(message.documents):null,id=crypto.randomUUID(),created=Date.now(),pending={id,origin,tabId:sender.tab.id,created,mode,documents};
    await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
    await chrome.storage.session.set({[PENDING]:pending,[RECEIPT]:{id,origin,tabId:sender.tab.id,created,state:'pending'}});
    try{const opened=await chrome.windows.create({url:chrome.runtime.getURL('confirm.html'),type:'popup',width:500,height:650,focused:true});await chrome.storage.session.set({[PENDING]:{...pending,windowId:opened.id}});}
    catch{await chrome.storage.session.remove([PENDING,RECEIPT]);throw Error('Could not open the extension confirmation. Try again.');}
    return {ok:true,requestId:id,state:'pending'};
   }finally{preparing=false;}
  }
  throw Error('Unsupported request.');
 }
 if(!ownConfirmation(sender))throw Error('Untrusted extension request.');
 const data=await chrome.storage.session.get([PENDING,RECEIPT]),pending=data[PENDING];
 if(!pending||Date.now()-pending.created>TTL){await chrome.storage.session.remove(PENDING);throw Error('This transfer expired. Send it again from NextRole.');}
 if(message.type==='CONFIRM_INFO'&&pending.mode==='remove')return {ok:true,id:pending.id,origin:pending.origin,mode:'remove'};
 if(message.type==='CONFIRM_INFO')return {ok:true,id:pending.id,origin:pending.origin,resumeName:pending.documents.resume.name,resumeSize:pending.documents.resume.size,name:[pending.documents.payload.profile.firstName,pending.documents.payload.profile.lastName].filter(Boolean).join(' ')};
 if(message.requestId!==pending.id)throw Error('This confirmation is no longer current.');
 if(message.type==='CONFIRM_SAVE'){
  if(pending.mode==='remove')await NextRoleAutofillDocuments.remove('all');else await NextRoleAutofillDocuments.savePair(pending.documents);
  await chrome.storage.session.set({[RECEIPT]:{...data[RECEIPT],state:pending.mode==='remove'?'removed':'saved'}});await chrome.storage.session.remove(PENDING);return {ok:true,state:pending.mode==='remove'?'removed':'saved'};
 }
 if(message.type==='CONFIRM_CANCEL'){
  await chrome.storage.session.set({[RECEIPT]:{...data[RECEIPT],state:'cancelled'}});await chrome.storage.session.remove(PENDING);return {ok:true,state:'cancelled'};
 }
 throw Error('Unsupported request.');
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 handle(message,sender).then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
});
chrome.windows.onRemoved.addListener(async windowId=>{
 const data=await chrome.storage.session.get([PENDING,RECEIPT]),pending=data[PENDING];
 if(pending?.windowId===windowId){await chrome.storage.session.set({[RECEIPT]:{...data[RECEIPT],state:'cancelled'}});await chrome.storage.session.remove(PENDING);}
});

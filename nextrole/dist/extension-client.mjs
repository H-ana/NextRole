import './extension-config.js?v=5c74b5c0ae6c';
export function extensionRequest(type,body={},timeout=5000){
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('NextRole autofill is not connected. Install the extension in this browser, then reload this page.'));},timeout);
  function receive(event){if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='nextrole-from-extension'||event.data.id!==id)return;clearTimeout(timer);window.removeEventListener('message',receive);const response=event.data.response;if(response?.ok)resolve(response);else reject(Error(response?.error||'Could not connect to the extension.'));}
  window.addEventListener('message',receive);window.postMessage({channel:'nextrole-to-extension',id,type,...body},location.origin);
 });
}
export async function transferDocuments(payload,file){
 if(!file||!/^.+\.(?:pdf|docx)$/i.test(file.name)||file.size>5*1024*1024)throw Error('Choose a PDF or Word resume under 5 MB to save with your profile.');
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16000)binary+=String.fromCharCode(...bytes.subarray(i,i+16000));
 return extensionRequest('PREPARE',{documents:{payload,resume:{name:file.name,size:file.size,type:file.type,base64:btoa(binary)}}},15000);
}
export async function awaitTransfer(requestId,{onPending=()=>{},signal}={}){
 for(let i=0;i<150;i++){if(signal?.aborted)return 'cancelled';const response=await extensionRequest('STATUS',{requestId});if(response.state!=='pending')return response.state;onPending();await new Promise(resolve=>setTimeout(resolve,2000));}
 throw Error('The confirmation timed out. Save from NextRole again.');
}

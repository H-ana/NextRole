/* Top-frame bridge on NextRole only. It never reads the DOM or stored documents. */
(()=>{
 if(window!==window.top||!NextRoleExtensionConfig.allowedOrigins.includes(location.origin))return;
 window.addEventListener('message',event=>{
  const message=event.data;
  if(event.source!==window||event.origin!==location.origin||message?.channel!=='nextrole-to-extension'||typeof message.id!=='string'||message.id.length>80)return;
  if(!['PING','PREPARE','PREPARE_CLEAR','STATUS'].includes(message.type))return;
  const reply=response=>window.postMessage({channel:'nextrole-from-extension',id:message.id,response},location.origin);
  try{chrome.runtime.sendMessage({type:'SITE_'+message.type,id:message.id,documents:message.documents,requestId:message.requestId},response=>{
   const error=chrome.runtime.lastError;
   reply(error?{ok:false,error:'The extension was updated. Reload NextRole and try again.'}:response);
  });}catch{reply({ok:false,error:'The extension was updated. Reload NextRole and try again.'});}
 });
})();

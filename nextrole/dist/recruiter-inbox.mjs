import {findBackend,apiRequest} from './api-client.mjs?v=91';

const el=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
const shortDate=value=>new Date(value*1000).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

export function setupRecruiterInbox(){
 const bell=el('button','Notifications','inbox-bell');bell.id='notifications-button';bell.type='button';
 const badge=el('span','0','inbox-badge');badge.hidden=true;bell.prepend(el('span','🔔 '));bell.append(badge);document.querySelector('header').append(bell);
 const dialog=el('dialog');dialog.id='recruiter-inbox';
 dialog.innerHTML='<button type="button" class="inbox-close" aria-label="Close notifications">×</button><h2>Recruiter updates</h2><p>Positive recruiter messages, interview invitations, assessments, next steps and offers. No application tracking is needed. Rejections and routine job alerts are filtered out.</p><p id="gmail-connection-state" role="status"></p><div class="inbox-actions"><button id="connect-gmail" class="primary" type="button" hidden>Connect Gmail</button><button id="check-recruiter-mail" class="secondary" type="button" disabled>Check now</button><button id="seen-recruiter-mail" class="secondary" type="button" disabled>Mark all seen</button></div><a id="gmail-authorize-link" target="_blank" rel="noopener noreferrer" hidden>Continue with Google · read-only access ↗</a><details id="gmail-setup" hidden><summary>One-time Gmail connection setup</summary><p>NextRole needs its own Google authorization; your Gmail connection in this chat cannot be reused by the app. Use the Gmail account you applied with.</p><ol><li><a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">Enable Gmail API in your Google Cloud project ↗</a>.</li><li>Configure Google Auth Platform branding and audience. For a personal testing app, add your Gmail address as a test user.</li><li>Create an <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">OAuth client with application type Desktop app ↗</a>, then download its JSON file.</li><li>Select that file here. It is sent only to your local backend and encrypted for your Windows account. Do not paste credentials into chat or commit the JSON file.</li></ol><label for="gmail-client-file">Desktop OAuth client JSON<input id="gmail-client-file" type="file" accept=".json,application/json"></label><button id="save-gmail-client" class="secondary" type="button">Save connection setup</button><p>Then click Connect Gmail and approve read-only access on Google’s screen. This app reads relevant messages but cannot send or modify emails. Email bodies are processed locally, never sent to Gemini, and not saved.</p><p><a href="https://developers.google.com/identity/protocols/oauth2/native-app" target="_blank" rel="noopener noreferrer">Google’s setup guide ↗</a>. Testing-mode Google authorizations may need reconnection.</p></details><p id="inbox-action-status" role="status"></p><div id="positive-recruiter-notifications"></div><p class="inbox-footnote">Messages from the last 90 days are checked automatically while NextRole is running. “Seen” only changes your NextRole badge.</p>';
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),action=$('#inbox-action-status');
 let state=null,loading=false,authorizing=false,lastError='';
 async function api(path,body){const backend=await findBackend();if(!(backend.status.capabilities||[]).includes('recruiter-mail-inbox-v2'))throw new Error('Restart the backend to load recruiter notifications without application tracking.');return apiRequest(backend.origin,path,body,30000);}
 function render(){
  if(!state)return;
  badge.hidden=!state.unread;badge.textContent=String(state.unread||0);bell.setAttribute('aria-label',`Notifications, ${state.unread||0} unseen positive updates`);
  const reconnect=state.connected&&/reconnect|authorization expired/i.test(state.error||'');
  $('#gmail-connection-state').textContent=state.connected?(state.checking?'Checking for recruiter messages…':state.last_checked?'Last checked '+shortDate(state.last_checked):'Recruiter messages will appear here automatically.'):'Connect Gmail once to receive recruiter messages.';
  $('#connect-gmail').hidden=state.connected&&!reconnect;
  $('#connect-gmail').textContent=reconnect?'Reconnect Gmail':'Connect Gmail';
  $('#check-recruiter-mail').hidden=!state.connected;
  $('#check-recruiter-mail').disabled=!state.connected||state.checking;
  $('#seen-recruiter-mail').hidden=!state.connected;
  $('#seen-recruiter-mail').disabled=!state.unread;
  $('#gmail-setup').hidden=state.connected||state.configured;
  if(state.connected&&!reconnect){$('#gmail-authorize-link').hidden=true;if(authorizing)action.textContent='';authorizing=false;}
  if(state.error)action.textContent=state.error;
  else if(lastError&&action.textContent===lastError)action.textContent='';
  lastError=state.error||'';
  const list=$('#positive-recruiter-notifications');list.replaceChildren();
  for(const item of state.notifications||[]){
   const card=el('a','',item.seen?'inbox-notification seen':'inbox-notification');
   card.href=`https://mail.google.com/mail/?authuser=${encodeURIComponent(state.email||'')}#all/${encodeURIComponent(item.message_id||item.thread_id)}`;
   card.target='_blank';card.rel='noopener noreferrer';
   card.setAttribute('aria-label',`Open ${item.subject||'recruiter message'} in Gmail`);
   card.append(el('strong',item.category),el('p',item.subject),el('small',`${item.sender} · ${shortDate(item.received_at)}`));
   card.append(el('span','Open in Gmail ↗','inbox-open-label'));list.append(card);
  }
  if(!list.children.length)list.append(el('p',state.connected?'No positive recruiter messages found yet.':'Your recruiter messages will appear here once Gmail is connected.','inbox-empty'));
 }
 async function refresh(){if(loading)return;loading=true;try{state=await api('/api/notifications');render();}catch(error){if(dialog.open)action.textContent=error.message;}finally{loading=false;}}
 bell.onclick=async()=>{dialog.showModal();await refresh();if(state?.connected)try{await api('/api/gmail/check',{});await refresh();}catch(error){action.textContent=error.message;}};
 $('.inbox-close').onclick=()=>dialog.close();
 $('#save-gmail-client').onclick=async()=>{
  const file=$('#gmail-client-file').files[0];
  if(!file||file.size>32000){action.textContent='Choose a Desktop OAuth client JSON file smaller than 32 KB.';return;}
  let config;try{config=JSON.parse(await file.text());}catch{action.textContent='That file is not valid JSON.';return;}
  const button=$('#save-gmail-client');button.disabled=true;
  try{await api('/api/gmail/configure',config);$('#gmail-client-file').value='';action.textContent='Setup saved locally. Click Connect Gmail to choose an account and grant read-only access.';await refresh();}
  catch(error){action.textContent=error.message;}finally{button.disabled=false;}
 };
 $('#connect-gmail').onclick=async()=>{
  if(!state?.configured){$('#gmail-setup').hidden=false;$('#gmail-setup').open=true;action.textContent='Complete the one-time Desktop OAuth setup below first.';return;}
  try{const result=await api('/api/gmail/connect',{});const url=new URL(result.url);if(url.origin!=='https://accounts.google.com')throw new Error('Google authorization URL was invalid.');$('#gmail-authorize-link').href=url.href;$('#gmail-authorize-link').hidden=false;authorizing=true;action.textContent='Continue with Google using the link above. You choose whether to grant read-only mailbox access.';}
  catch(error){action.textContent=error.message;}
 };
 $('#check-recruiter-mail').onclick=async()=>{try{await api('/api/gmail/check',{});action.textContent='';await refresh();}catch(error){action.textContent=error.message;}};
 $('#seen-recruiter-mail').onclick=async()=>{try{await api('/api/notifications/seen',{});await refresh();}catch(error){action.textContent=error.message;}};
 async function poll(){await refresh();setTimeout(poll,dialog.open||authorizing?5000:60000);}poll();
}

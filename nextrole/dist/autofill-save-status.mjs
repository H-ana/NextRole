const fileHashes=new WeakMap();
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function documentFingerprint(payload,file){let digest=fileHashes.get(file);if(!digest){digest=file.arrayBuffer().then(hash);fileHashes.set(file,digest);}const canonical={format:'nextrole-autofill',version:2,reviewed:true,profile:globalThis.NextRoleAutofillProfile.sanitize(payload.profile)};return hash(JSON.stringify(canonical)+'\n'+await digest);}
export function savedTime(time){return Number.isFinite(time)&&time>0?' · '+new Date(time).toLocaleString():'';}
export function extensionSaveStatus(connection,fingerprint){
 if(!connection)return 'Connect the extension to check its saved profile and resume.';
 if(!connection.documentManagement)return 'This extension version cannot verify saved documents. Save to extension after changes; use its popup to check saved files.';
 const saved=connection.savedDocuments;
 if(!saved?.hasProfile||!saved?.hasResume)return 'The extension needs both your reviewed profile and resume. Save them here once.';
 if(!fingerprint)return 'The extension has '+saved.resumeName+savedTime(saved.savedAt)+'. Choose a resume here to compare versions.';
 return fingerprint===saved.fingerprint?'Extension is up to date · '+saved.resumeName+savedTime(saved.savedAt)+'.':'Profile or resume changed — update extension. Its saved resume is '+saved.resumeName+savedTime(saved.savedAt)+'.';
}

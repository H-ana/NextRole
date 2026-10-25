const KEY='nextrole-retained-resume-v1';
export function readRetainedResume(storage){
 try{const record=JSON.parse(storage.getItem(KEY)||'null');return record?.version===1&&typeof record.text==='string'?record.text:'';}catch{return '';}
}
export function retainResume(storage,text){
 if(typeof text!=='string')throw new Error('Resume text must be a string.');
 try{
  if(text.trim())storage.setItem(KEY,JSON.stringify({version:1,text}));
  else storage.removeItem(KEY);
  return true;
 }catch{
  // Never restore an older document after a replacement could not be saved.
  try{storage.removeItem(KEY);}catch{}
  return false;
 }
}

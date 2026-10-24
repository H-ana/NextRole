export async function findBackend(){
 const origins=[location.origin];
 if(['localhost','127.0.0.1'].includes(location.hostname)&&location.port!=='8081')origins.push('http://localhost:8081');
 for(const origin of origins){
  try{const response=await fetch(origin+'/api/status',{signal:AbortSignal.timeout(2500)});if(!response.ok)continue;const status=await response.json();if(typeof status.connected==='boolean')return {origin,status};}catch{}
 }
 throw new Error('Start the local backend with python start_agent.py, or python server.py for job search without Gemini.');
}

export async function apiRequest(origin,path,body,timeout=360000){
 const options={signal:AbortSignal.timeout(timeout)};
 if(body!==undefined)Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const response=await fetch(origin+path,options);
 let data;try{data=await response.json();}catch{throw new Error('The backend returned an unreadable response.');}
 if(!response.ok)throw new Error(data.error||'Request failed.');
 return data;
}

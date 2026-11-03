import assert from 'node:assert/strict';
import {createGeminiClient,GEMINI_LIMITS,GEMINI_MODEL,geminiFailureMessage,redactGeminiDiagnostic,validGeminiJSON} from './dist/gemini-client.mjs';
import {REVIEW_SCHEMA,EDIT_SCHEMA,AUDIT_SCHEMA} from './dist/gemini-tailoring.mjs';
let now=Date.UTC(2026,9,30),calls=[],mode='ok';const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
const key='synthetic_test_key_1234567890';
const fetcher=async(url,options)=>{calls.push({url,options});if(mode==='429')return {ok:false,status:429};if(mode==='broken')return {ok:true,text:async()=>JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]})};return {ok:true,text:async()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]})};};
const client=createGeminiClient({storage,fetcher,now:()=>now,lock:task=>task(),wait:async ms=>{now+=ms;}});
await assert.rejects(()=>client.startReview(),/Connect/);await client.connect(key);assert(!JSON.stringify([...values]).includes(key));
let review=await client.startReview();const result=await client.request(review,'synthetic task',{text:'synthetic resume'},{type:'object'});assert.equal(result.ok,true);assert.equal(calls.length,1);assert.equal(calls[0].options.headers['x-goog-api-key'],key);assert(!calls[0].url.includes(key));assert(calls[0].url.includes(GEMINI_MODEL));const body=JSON.parse(calls[0].options.body);assert(!JSON.stringify(body).includes(key));assert(!('thinkingConfig' in body.generationConfig));assert(!('tools' in body));
await client.request(review,'synthetic task',{text:'synthetic resume'},{type:'object'});assert.equal(calls.length,1,'Cached response makes no request');
await client.request(review,'different task',{},{});assert.equal(calls.length,2);assert(now>=Date.UTC(2026,9,30)+GEMINI_LIMITS.minIntervalMs,'Requests are paced');
mode='429';await assert.rejects(()=>client.request(review,'quota',{},{}),/quota or rate limit/);assert.equal(calls.length,3,'Quota errors are not retried');
mode='broken';await assert.rejects(()=>client.request(review,'incomplete',{},{}),/complete response/);assert.equal(calls.length,4);
mode='ok';await client.request(review,'fifth call',{},{});await assert.rejects(()=>client.request(review,'sixth call',{},{}),/request or input limit/);assert.equal(calls.length,5);
await client.startReview();await client.startReview();await assert.rejects(()=>client.startReview(),/limit is reached/);
client.disconnect();assert(!client.isConnected());await assert.rejects(()=>client.request(review,'after disconnect',{},{}),/Reconnect/);
assert(!JSON.stringify([...values]).includes(key));assert(!JSON.stringify([...values]).includes('synthetic resume'),'Only counters, no resumes, are persisted');
now+=86400000;await client.connect(key);assert.equal((await client.usage()).reviewsLeft,3);
const unavailable=createGeminiClient({storage:{getItem:()=>null,setItem(){throw Error('Quota');}},fetcher});await unavailable.connect(key);await assert.rejects(()=>unavailable.startReview(),/could not be saved/);
console.log('Gemini transport: memory-only key, header-only authentication, structured output, cache, pacing, 5-request/3-review caps, quota stop, incomplete output, disconnect, date reset and storage failure passed.');

// Accept opaque Google key formats without assuming the legacy short character set.
const formats=createGeminiClient({storage,fetcher,now:()=>now,lock:task=>task()});
for(const candidate of ['synthetic.test.'+'a'.repeat(250),'synthetic_test_key_1234567890']){await formats.connect(candidate);assert(formats.isConnected());}
await assert.rejects(()=>formats.connect(''),/Enter your Gemini API key above/);
await assert.rejects(()=>formats.connect('synthetic key with internal spaces'),/spaces, line breaks/);
await assert.rejects(()=>formats.connect('short'),/incomplete/);
assert(!JSON.stringify([...values]).includes('synthetic.test.'));
console.log('Opaque dotted and long key formats accepted; empty, truncated and whitespace-containing input rejected without exposing the key.');

assert.equal(body.generationConfig.responseMimeType,'application/json');
assert(!('responseFormat' in body.generationConfig));assert(!('responseSchema' in body.generationConfig));assert(!('responseJsonSchema' in body.generationConfig));
assert.deepEqual(JSON.parse(body.contents[0].parts[0].text).output_schema,{type:'object'});
for(const [status,detail,pattern] of [[400,{message:'Invalid value at thinking_config.thinking_level'},/thinking configuration/],[400,{message:'Unknown name responseJsonSchema'},/structured-output/],[400,{details:[{reason:'API_KEY_INVALID'}]},/API_KEY_INVALID/],[400,{message:'Unrecognized failure synthetic_secret and resume text'},/Google detail/],[403,{details:[{reason:'API_KEY_HTTP_REFERRER_BLOCKED'}]},/website restriction/]]){const text=geminiFailureMessage(status,{error:detail},['synthetic_secret']);assert.match(text,pattern);assert(!text.includes('synthetic_secret'));}
console.log('Minimal JSON-mode requests omit server schema compilation and custom thinking settings; safe diagnostics still redact private inputs.');

let rejectedCalls=0;const rejected=createGeminiClient({storage,now:()=>now+86400000,lock:task=>task(),fetcher:async()=>{rejectedCalls++;return {ok:false,status:400,text:async()=>JSON.stringify({error:{status:'INVALID_ARGUMENT',message:'Invalid value at thinking_config.thinking_level synthetic_secret'}})};}});await rejected.connect(key);const rejectedReview=await rejected.startReview();await assert.rejects(()=>rejected.request(rejectedReview,'synthetic',{},{type:'object'}),/thinking configuration/);assert.equal(rejectedCalls,1);
console.log('HTTP 400 provider responses are parsed, classified and stopped after one request.');

const providerDetail={error:{message:'Request contains invalid argument. synthetic_test_key_1234567890 alex@example.com',details:[{reason:'CREDENTIALS_MISSING',metadata:{private:'do not display'}},{fieldViolations:[{field:'generation_config',description:'Schema has too many states.'}]}]}};
const diagnostic=redactGeminiDiagnostic(providerDetail,[key]);assert(!diagnostic.includes(key));assert(!diagnostic.includes('alex@example.com'));assert(!diagnostic.includes('do not display'));assert(diagnostic.includes('CREDENTIALS_MISSING'));assert(diagnostic.includes('Schema has too many states.'));
assert(redactGeminiDiagnostic({error:{message:'Original private resume line'}},['Original private resume line']).includes('[redacted]'));
assert(redactGeminiDiagnostic({error:{message:'x'.repeat(50000)}}).length<=1600);
console.log('Provider messages, reason codes and field violations are visible with key, email, URL and supplied resume text redaction; arbitrary metadata is excluded.');

const probeValues=new Map(),probeCalls=[];const probe=createGeminiClient({storage:{getItem:k=>probeValues.get(k)||null,setItem:(k,v)=>probeValues.set(k,v)},lock:task=>task(),fetcher:async(url,options)=>{probeCalls.push(JSON.parse(options.body));return {ok:true,text:async()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]})};}});await probe.connect(key);assert((await probe.checkConnection()).connected);assert.equal(probeCalls.length,1);assert.deepEqual(Object.keys(probeCalls[0]).sort(),['contents','generationConfig','systemInstruction']);assert.deepEqual(probeCalls[0].generationConfig,{maxOutputTokens:128,responseMimeType:'application/json'});assert.deepEqual(JSON.parse(probeCalls[0].contents[0].parts[0].text).data,{});assert.equal((await probe.usage()).reviews,0);assert.equal((await probe.usage()).requests,1);await probe.checkConnection();assert.equal(probeCalls.length,1);
console.log('Minimal connection probe sends a fixed phrase only, counts against the daily request limit without consuming a resume review, and reuses successful results.');

const nested={type:'object',properties:{checks:{type:'array',maxItems:1,items:{type:'object',properties:{id:{type:'string'},faithful:{type:'boolean'}},required:['id','faithful'],additionalProperties:false}}},required:['checks'],additionalProperties:false};
assert(validGeminiJSON({checks:[{id:'edit-1',faithful:true}]},nested));
for(const bad of [{},{checks:[{id:'edit-1',faithful:'true'}]},{checks:[{id:'edit-1',faithful:true,extra:'invented'}]},{checks:[{id:'a',faithful:true},{id:'b',faithful:true}]}])assert(!validGeminiJSON(bad,nested));
const invalidShape=createGeminiClient({storage,now:()=>now+2*86400000,lock:task=>task(),fetcher:async()=>({ok:true,text:async()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"checks":[{"id":"a","faithful":"true"}]}'}]}}]})})});await invalidShape.connect(key);const shapeReview=await invalidShape.startReview();await assert.rejects(()=>invalidShape.request(shapeReview,'audit',{},nested),/required response format/);
console.log('Local validation rejects missing fields, unexpected fields, oversized arrays and string booleans before they can authorize an edit.');

// Exercise each real tailoring response contract through the simplified wire
// request. This is a synthetic provider, not a live Google verification.
const fixtures=[{requirements:[],questions:[],summary:{text:'',block_ids:[],job_quote:'',rationale:''},orderings:[],advice:[]},{suggestions:[]},{checks:[{id:'edit-1',faithful:true}]}];
let contractCalls=0,contractTime=now+3*86400000;
const contractClient=createGeminiClient({storage,now:()=>contractTime,wait:async ms=>{contractTime+=ms;},lock:task=>task(),fetcher:async(url,options)=>{
 const body=JSON.parse(options.body);
 assert.deepEqual(Object.keys(body.generationConfig).sort(),['maxOutputTokens','responseMimeType']);
 assert.equal(body.generationConfig.responseMimeType,'application/json');
 const prompt=JSON.parse(body.contents[0].parts[0].text);
 assert(prompt.output_schema&&prompt.task&&prompt.data);
 return {ok:true,text:async()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(fixtures[contractCalls++])}]}}]})};
}});
await contractClient.connect(key);const token=await contractClient.startReview();
for(const [i,schema] of [REVIEW_SCHEMA,EDIT_SCHEMA,AUDIT_SCHEMA].entries())assert.deepEqual(await contractClient.request(token,'contract-'+i,{},schema),fixtures[i]);
assert.equal(contractCalls,3);
console.log('All three production review/edit/audit contracts pass through minimal JSON transport with unchanged local response validation and pacing.');

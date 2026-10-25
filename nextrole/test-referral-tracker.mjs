import assert from 'node:assert/strict';
import {referralRecord,linkedinUrl,readReferrals,saveReferrals,addReferralJob,matchesReferral,sourceJobId} from './dist/referral-tracker.mjs';
const job={id:'one',title:'Engineer',company:'Example',location:'Bengaluru',url:'https://example.com/jobs/one'};
const input={name:'Test contact',contacted:'2026-10-25',profile:'https://www.linkedin.com/in/test-contact/',notes:'Awaiting a response'};
const first=referralRecord(input,job,'first');
assert.equal(first.status,'Awaiting reply');assert.equal(first.responseSource,'Manual update');assert.deepEqual(first.job,{...job,source_job_id:''});
assert.equal(referralRecord({...input,status:'Responded'},job,'first').status,'Responded');
for(const status of ['Sent automatically','Interview','']){
 if(status)assert.throws(()=>referralRecord({...input,status},job,'bad'));
}
for(const date of ['2026-02-30','not a date','2026-13-01'])assert.throws(()=>referralRecord({...input,contacted:date},job,'bad'));
for(const url of ['javascript:alert(1)','https://linkedin.com.evil.test/in/person','https://www.linkedin.com/feed/','https://user:pass@linkedin.com/in/a'])assert.throws(()=>linkedinUrl(url));
assert.equal(linkedinUrl('https://www.linkedin.com/messaging/thread/abc/'),'https://www.linkedin.com/messaging/thread/abc/');
assert.throws(()=>referralRecord({...input,name:'  '},job,'bad'));
assert.equal(referralRecord(input,{...job,url:'javascript:alert(1)'},'safe').job.url,'');
let stored='';const storage={getItem:()=>stored,setItem:(key,value)=>{stored=value;}};
const second=referralRecord(input,{...job,id:'two',title:'Analyst'},'second');saveReferrals(storage,[first,second]);
assert.equal(readReferrals(storage).length,2);assert.equal(readReferrals(storage)[1].job.title,'Analyst');
stored=JSON.stringify([first,{name:'broken'}]);assert.equal(readReferrals(storage).length,1);
stored='null';assert.deepEqual(readReferrals(storage),[]);stored='{broken';assert.deepEqual(readReferrals(storage),[]);
assert.throws(()=>saveReferrals({setItem:()=>{throw new Error('Storage full');}},[first]),/Storage full/);
console.log('Referral tracking validation, job associations, statuses, URLs and storage checks passed.');

const pending=addReferralJob([],job);assert.equal(pending.length,1);assert.equal(pending[0].status,'Not contacted yet');assert.equal(pending[0].name,'');assert.equal(pending[0].contacted,'');assert.equal(readReferrals({getItem:()=>JSON.stringify(pending)}).length,1);
assert.equal(addReferralJob(pending,job),pending);assert.equal(addReferralJob(pending,{...job,id:'changed'}),pending);assert.equal(addReferralJob(pending,{...job,id:'two',url:'https://example.com/jobs/two'}).length,2);
const linked={...job,url:'https://www.linkedin.com/jobs/view/test-role-1234567890/'};assert.equal(sourceJobId(linked),'1234567890');const sourceRecord=addReferralJob([],linked)[0];assert(matchesReferral(sourceRecord,'All','123456'));assert(matchesReferral(sourceRecord,'All','ONE'));assert(!matchesReferral(sourceRecord,'Responded','123456'));assert(!matchesReferral(sourceRecord,'All','different'));
assert.equal(sourceJobId({...job,url:'https://www.indeed.com/viewjob?jk=abc123'}),'abc123');
assert.throws(()=>referralRecord({status:'Responded',contacted:'2026-10-25'},job,'bad'),/name/);
const updated=referralRecord({...pending[0],name:'Contact',contacted:'2026-10-25',status:'Responded'},pending[0].job,pending[0].id);assert.equal(updated.id,pending[0].id);assert.equal(updated.added,pending[0].added);assert(matchesReferral(updated,'Responded','one'));
console.log('Automatic referral capture, deduplication, pending-record migration and job ID filtering passed.');

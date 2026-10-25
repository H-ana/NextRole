// Synthetic browser DOM and HTTP stubs. Never reads real Gmail.
import assert from 'node:assert/strict';
import {setupRecruiterInbox} from './dist/recruiter-inbox.mjs';
const nodes=new Map(),created=[],calls=[];
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.disabled=false;this.textContent='';created.push(this);}
 set id(value){this._id=value;nodes.set(value,this);} get id(){return this._id;}
 set innerHTML(value){this.html=value;for(const match of value.matchAll(/<\w+[^>]*\bid="([^"]+)"[^>]*>/g)){const child=new Element();child.id=match[1];child.hidden=/\bhidden\b/.test(match[0]);child.disabled=/\bdisabled\b/.test(match[0]);}this.closeButton=new Element('button');}
 querySelector(selector){return selector.startsWith('#')?nodes.get(selector.slice(1)):this.closeButton;}
 append(...children){this.children.push(...children);}prepend(child){this.children.unshift(child);}
 setAttribute(name,value){this[name]=value;}replaceChildren(...children){this.children=children;}
 showModal(){this.open=true;}close(){this.open=false;}
}
const header=new Element();
globalThis.document={body:new Element(),createElement:tag=>new Element(tag),querySelector:selector=>selector==='header'?header:null};
globalThis.location={origin:'http://localhost:8080',hostname:'localhost',port:'8080'};
let snapshot={connected:true,configured:true,checking:false,error:'',unread:1,applications:[],email:'synthetic@example.com',notifications:[{category:'Recruiter outreach',subject:'<img src=x onerror=bad()> New role',sender:'Recruiter <hiring@example.com>',received_at:Date.now()/1000,message_id:'abcdef654321',thread_id:'abcdef123456',seen:0}]};
globalThis.setTimeout=()=>0;
globalThis.fetch=async(url,options={})=>{
 calls.push(url);
 let data={};
 if(url.endsWith('/api/status'))data={connected:false,capabilities:['recruiter-mail-inbox-v2']};
 else if(url.endsWith('/api/notifications'))data=snapshot;
 else if(url.endsWith('/api/notifications/seen'))snapshot={...snapshot,unread:0};
 else if(!url.endsWith('/api/gmail/check'))throw Error('Unexpected request '+url);
 return {ok:true,json:async()=>data};
};
setupRecruiterInbox();await new Promise(resolve=>setImmediate(resolve));
const node=id=>nodes.get(id),open=()=>node('notifications-button').onclick();
assert.equal(node('connect-gmail').hidden,true,'Connected inbox hides connection controls');
assert.equal(node('gmail-setup').hidden,true,'Connected inbox hides initial setup');
assert.equal(nodes.has('disconnect-gmail'),false,'No disconnect control in Notifications');
assert.equal(nodes.has('track-application'),false,'No application tracking requirement');
assert.equal(node('check-recruiter-mail').disabled,false,'Check works with zero applications');
const mailCard=node('positive-recruiter-notifications').children[0];
assert.equal(mailCard.tag,'a','The whole email card is a native keyboard-accessible link');
assert.equal(mailCard.href,'https://mail.google.com/mail/?authuser=synthetic%40example.com#all/abcdef654321','Opens the specific message using the connected Gmail account');
assert.equal(mailCard.target,'_blank');assert.match(mailCard.rel,/noopener/);
assert.equal(created.some(e=>e.textContent===snapshot.notifications[0].subject),true,'Subjects use textContent');
assert.equal(created.some(e=>e.html?.includes(snapshot.notifications[0].subject)),false,'Mail HTML never becomes page HTML');
assert.equal(created.some(e=>e.textContent?.includes('null')),false,'No missing company/role placeholders');
await open();assert.equal(calls.some(url=>url.endsWith('/api/gmail/check')),true,'Opening inbox checks untracked recruiter mail');
await node('seen-recruiter-mail').onclick();assert.equal(node('seen-recruiter-mail').disabled,true);
snapshot={...snapshot,connected:false,configured:false,notifications:[]};await open();
assert.equal(node('connect-gmail').hidden,false);assert.equal(node('gmail-setup').hidden,false,'Initial connection setup is available');
snapshot={...snapshot,connected:true,configured:true,error:'Google authorization expired. Reconnect Gmail.'};await open();
assert.equal(node('connect-gmail').hidden,false,'Recovery appears only when access needs renewal');
assert.equal(node('connect-gmail').textContent,'Reconnect Gmail');
snapshot={...snapshot,error:''};await open();
assert.equal(node('connect-gmail').hidden,true);assert.equal(node('inbox-action-status').textContent,'');
console.log('Passed: connected inbox hides setup/account controls; no tracking required; opening checks recruiter mail; safe text rendering; seen state and expired-access recovery.');

import {CATALOG,contains} from './resume-tools.mjs?v=113';
const categories=new Set(['hard_skills','title_function','business_context','actions','domain','hard_filters']);
export const KEYWORD_WEIGHTS=Object.freeze({hard_skills:2,title_function:1.5,business_context:1,actions:1,domain:1,hard_filters:0});
const normal=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const aliases=[['machine learning','ml'],['large language models','large language model','llm','llms'],['generative ai','genai','generative artificial intelligence'],['natural language processing','nlp'],['fastapi','fast api'],['langgraph','lang graph'],['postgresql','postgres']];
function canonical(value){let result=normal(value);for(const group of aliases)for(const item of [...group].sort((a,b)=>b.length-a.length)){const escaped=item.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');result=result.replace(new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9+#])','gi'),(_,prefix)=>prefix+group[0]);}return result;}
export const keywordMatches=(text,term)=>contains(canonical(text),canonical(term));
export function buildFactBank(source,parsed){
 const editable=new Set(parsed.blocks.flatMap(b=>b.indices)),entries=new Map();
 for(const block of parsed.blocks){const id=block.entry;if(!entries.has(id))entries.set(id,{id,kind:block.kind,block_ids:[]});entries.get(id).block_ids.push(block.id);}
 return {version:1,entries:[...entries.values()],protected_lines:source.split('\n').flatMap((text,index)=>!editable.has(index)&&text.trim()?[{index,text}]:[])};
}
export function validateKeywordReport(raw,job){
 const full=normal(job.title+'\n'+job.description),seen=new Set(),rows=[];
 for(const item of (Array.isArray(raw)?raw:[]).slice(0,48)){
  const term=String(item?.term||'').trim(),quote=String(item?.job_quote||'').trim(),key=canonical(term);
  if(term.length<2||term.length>70||/[\r\n]/.test(term)||!categories.has(item.category)||!quote||!full.includes(normal(quote))||!contains(normal(quote),normal(term))||seen.has(key))continue;
  rows.push({term,category:item.category,job_quote:quote,weight:KEYWORD_WEIGHTS[item.category]});seen.add(key);
 }
 if(!rows.length){for(const term of CATALOG)if(contains(job.description,term))rows.push({term,category:'hard_skills',job_quote:job.description,weight:2});if(job.title?.trim())rows.push({term:job.title.trim(),category:'title_function',job_quote:job.title.trim(),weight:1.5});}
 return rows;
}
export function keywordCoverage(text,report){
 const covered=[],missing=[];let total=0,earned=0;
 for(const item of report){const matched=keywordMatches(text,item.term),weight=KEYWORD_WEIGHTS[item.category]??0;total+=weight;if(matched)earned+=weight;(matched?covered:missing).push(item);}
 return {score:total?Math.round(earned/total*100):null,covered,missing,total,earned};
}
export function prioritizeSkills(text,report){
 const score=value=>report.reduce((sum,item)=>sum+(keywordMatches(value,item.term)?item.weight:0),0);
 const rank=items=>items.map((text,index)=>({text,index,score:score(text)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(row=>row.text);
 const result=text.split('\n').map(line=>{const match=line.match(/^(\s*(?:[-*•]\s*)?[^:]{1,45}:\s*)(.*)$/),prefix=match?match[1]:'',body=match?match[2]:line,items=body.split(',').map(x=>x.trim());return items.length>1&&items.every(Boolean)?prefix+rank(items).join(', '):line;});
 return result.every(line=>line.trim()&&!line.includes(':'))?rank(result).join('\n'):result.join('\n');
}
export function createRoleDraftStore(limit=8){
 const drafts=new Map();
 const key=(source,job)=>JSON.stringify([source,job.id||'',job.url||'',job.title||'',job.company||'',job.description||'']);
 return {key,get(id){return drafts.get(id);},set(id,text){if(!id)return;drafts.delete(id);drafts.set(id,text);while(drafts.size>limit)drafts.delete(drafts.keys().next().value);}};
}

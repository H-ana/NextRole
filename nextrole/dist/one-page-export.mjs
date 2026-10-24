import {findBackend,apiRequest} from './api-client.mjs?v=39';
import {formatSkillSections} from './skill-format.mjs?v=39';
import {assertResumeHeader} from './resume-header.mjs?v=39';

export async function downloadOnePageResume(text,filename,isCurrent=()=>true){
 text=formatSkillSections(text);
 assertResumeHeader(text);
 const backend=await findBackend();
 if(!(backend.status.capabilities||[]).includes('one-page-resume-export'))throw new Error('Restart the backend with python start_agent.py to load verified one-page Word export.');
 if(!(backend.status.capabilities||[]).includes('resume-export-v2'))throw new Error('Restart the backend with python start_agent.py to load Calibri and document validation.');
 const result=await apiRequest(backend.origin,'/api/resume/export',{text},110000);
 if(!isCurrent())throw new Error('The draft changed during formatting. Download the updated draft again.');
 if(result.pages!==1||result.font_size<10||result.font!=='Calibri'||!['content_preserved','reading_order_preserved','contact_preserved','sections_preserved'].every(k=>result.checks?.[k]===true)||!result.base64)throw new Error('A readable one-page Calibri layout and document checks could not be verified. Your draft is unchanged.');
 const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
 if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('The Word export was invalid. Please retry.');
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
 const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 return result;
}

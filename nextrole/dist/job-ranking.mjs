// A score is meaningful only after ranking or an explicit fit review.
const validScore=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
export function displayedScore(job,ranked=false){
 if(validScore(job.agent?.score))return job.agent.score;
 return ranked&&validScore(job.relevance_score)?job.relevance_score:null;
}
const text=value=>String(value||'').replace(/\s+/g,' ').trim();
const quoted=(quote,source)=>!!text(quote)&&text(source).includes(text(quote));
export function strongMatch(job,resume,preferences={}){
 const assessment=job.agent;
 if(!assessment)return {strong:false,reason:'Fit review needed'};
 if(assessment.job_id!==job.id||assessment.decision!=='shortlist')return {strong:false,reason:'Fit review did not establish a clear fit'};
 if(assessment.experience!=='meets'||!quoted(assessment.experience_quote,job.description))return {strong:false,reason:'Experience fit is not established'};
 if(Number.isFinite(job.years)&&(!Number.isFinite(Number(preferences.experience))||Number(preferences.experience)<job.years))return {strong:false,reason:'Confirmed experience is below the stated minimum'};
 const required=(assessment.requirements||[]).filter(r=>r.importance==='required');
 if(!required.length)return {strong:false,reason:'Mandatory requirements need review'};
 if(required.some(r=>r.status!=='supported'||!quoted(r.job_quote,job.description)||!quoted(r.resume_quote,resume)))return {strong:false,reason:'A mandatory requirement is missing, partial or unclear'};
 const style=preferences.workstyle||'any';
 if(style!=='any'&&(assessment.work_style!==style||!quoted(assessment.work_style_quote,job.description+' '+job.location)))return {strong:false,reason:'Work style fit needs confirmation'};
 return {strong:true,reason:'Reviewed mandatory requirements have resume evidence; experience fit is established'};
}
export function fitReviewContext(job,resume,preferences){
 return JSON.stringify({resume,preferences,job:{id:job.id,title:job.title,company:job.company,description:job.description,location:job.location,years:job.years,style:job.style}});
}

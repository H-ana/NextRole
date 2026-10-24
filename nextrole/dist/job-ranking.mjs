// A score is meaningful only after ranking or an explicit fit review.
const validScore=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
export function displayedScore(job,ranked=false){
 if(validScore(job.agent?.score))return job.agent.score;
 return ranked&&validScore(job.relevance_score)?job.relevance_score:null;
}

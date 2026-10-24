export function allCorrectionChoices(data){
 const wordings=data.suggestions.map((_,i)=>i),orderings=(data.ordering_suggestions||[]).map((_,i)=>i);
 const conflict=data.suggestions.some(s=>(data.summary_suggestion?.replace_indices||[]).includes(s.line_index));
 return {wordings,orderings,summary:!!data.summary_suggestion&&!conflict,conflict};
}
export function mergeCorrectionBatch(previous,next){
 const seen=new Set(previous.suggestions.map(s=>s.line_index));
 return {...previous,suggestions:[...previous.suggestions,...next.suggestions.filter(s=>!seen.has(s.line_index))],advice:[...new Set([...previous.advice,...next.advice])],review_progress:next.review_progress};
}

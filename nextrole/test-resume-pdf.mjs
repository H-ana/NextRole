import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createResumePdf,pdfRows,planResumePdf,registerPdfFonts} from './dist/resume-pdf.mjs';
import {clarificationSource,resumeStructure,applyGeminiChanges} from './dist/gemini-tailoring.mjs';
const require=createRequire(import.meta.url),{jsPDF}=require('./dist/vendor/jspdf.umd.min.js');
const fonts={regular:(await fs.readFile('dist/fonts/Carlito-Regular.ttf')).toString('base64'),bold:(await fs.readFile('dist/fonts/Carlito-Bold.ttf')).toString('base64')};
const source='Alex Example\nalex@example.com | +91 9000000000\nPROFILE\nAI developer building Python applications and SQL workflows.\nEXPERIENCE\nExample Company\nSoftware Engineer | 2023–Present\n• Built Python workflows to validate 12 datasets.\n● Evaluated model responses with documented test cases.\n  ▪ Integrated SQL data checks into the workflow.\nPROJECTS\nApplication Assistant\n1. Developed APIs using Python and PostgreSQL.\n2. Validated outputs before presenting recommendations.\nEDUCATION\nExample University\nBachelor of Engineering | 2023\nSKILLS\nPython, SQL, PostgreSQL';
const question=resumeStructure(source).blocks.find(b=>b.text.includes('12 datasets'));
const working=clarificationSource(source,[{...question,block_id:question.id,original:question.text}],[{block_id:question.id,approved:true,text:'Reduced manual review time by 20%.'}]);
assert(working.includes('Reduced manual review time by 20%.'));
assert.equal(applyGeminiChanges(working,{edits:[],orderings:[],summary:null},[]),working,'Confirmed answers survive even when no AI edits are selected');
assert.deepEqual(pdfRows(source).filter(r=>r.marker).map(r=>r.marker),['•','●','▪','1.','2.']);
const doc=new jsPDF({unit:'pt',format:'a4'});registerPdfFonts(doc,fonts);
let dense='';
for(let n=20;n<100;n++){
 const value='Alex Example\nalex@example.com\nEXPERIENCE\nExample Company\nSoftware Engineer | 2023–Present\n'+Array.from({length:n},(_,i)=>'• Built and validated Python workflow '+(i+1)+' using SQL records and automated checks.').join('\n');
 if(!planResumePdf(doc,value,11).fits&&planResumePdf(doc,value,10).fits){dense=value;break;}
}
assert(dense,'Synthetic resume exercises readable automatic compaction');
await fs.mkdir('qa/pdf-export',{recursive:true});
for(const [name,text] of [['approved-answers',working],['dense-one-page',dense],['bullets-and-spacing',source.replaceAll('\n','\n\n\n')]]){
 const result=await createResumePdf(text,{jsPDF,fonts});assert.equal(result.pageCount,1);assert(result.fontSize>=10);assert(result.layout.fits);
 if(name==='dense-one-page')assert(result.fontSize<11);
 await fs.writeFile('qa/pdf-export/'+name+'.pdf',result.bytes);await fs.writeFile('qa/pdf-export/'+name+'.txt',text);
 console.log(name+': one page, '+result.fontSize+' pt, '+result.bytes.length+' bytes');
}
await assert.rejects(()=>createResumePdf(source+'\n'+('• Built Python data validation workflows for production services.\n'.repeat(200)),{jsPDF,fonts}),/cannot fit one page/);
console.log('PDF tests passed: preserved markers, confirmed evidence, compact spacing, readable fit and explicit overflow rejection.');

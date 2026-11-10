// Render + OCR the register through lib/ocr.js and lib/parse.js directly, so
// the result can be eyeballed before any of it goes near a database.
const fs=require('fs');
const DT='/home/user/joepap/dues-tracker';
const ocr=require(DT+'/lib/ocr');
const parse=require(DT+'/lib/parse');
const PDF=process.argv[2], OUT=process.argv[3];
const ZOOM=300/72;
(async()=>{
  const { mu, doc, pageCount } = await ocr.openPdf(fs.readFileSync(PDF));
  console.log('pages:',pageCount);
  const all=[];
  for(let p=0;p<pageCount;p++){
    const t0=Date.now();
    const r=ocr.renderPage(mu,doc,p,ZOOM,false);
    let rows=[], via='';
    if(r.textLines&&r.textLines.length){ rows=parse.parseTextLines(r.textLines); via='text layer'; }
    else { const words=await ocr.ocrPage(r.png,m=>console.log(m)); rows=parse.parseWords(words); via='ocr'; }
    all.push({page:p+1,via,rows});
    console.log('page '+(p+1)+'/'+pageCount+'  '+via+'  '+rows.length+' rows  '+(Date.now()-t0)+'ms');
    fs.writeFileSync(OUT,JSON.stringify(all));
  }
  await ocr.shutdown();
  console.log('DONE  total rows:',all.reduce((a,x)=>a+x.rows.length,0));
})().catch(e=>{console.error('FAILED:',e.message);console.error(e.stack);process.exit(1);});

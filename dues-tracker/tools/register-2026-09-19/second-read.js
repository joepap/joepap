// A second, independent read of every payroll number: the left-hand strip of
// each page (department, SSN, payroll number) rendered at twice the resolution
// and read on its own. Two reads that agree are worth far more than one.
const fs=require('fs'), path=require('path');
const DT='/home/user/joepap/dues-tracker';
const ocr=require(DT+'/lib/ocr'), parse=require(DT+'/lib/parse');
const S=(process.env.REG_WORK || '/tmp/register-work/');
const first=JSON.parse(fs.readFileSync(S+'ocr.json','utf8'));
const Z1=300/72, Z2=600/72, K=Z2/Z1;
(async()=>{
  await ocr.ensureTessdata();
  const { createWorker, OEM } = require(DT+'/node_modules/tesseract.js');
  const w = await createWorker('eng', OEM.LSTM_ONLY, { cachePath: ocr.TESSDATA_DIR, gzip:false });
  await w.setParameters({ tessedit_pageseg_mode:'6' });
  const { mu, doc } = await ocr.openPdf(fs.readFileSync(S+'register.pdf'));
  const out=[];
  for(const pg of first){
    if(!pg.rows.length) continue;
    const t0=Date.now();
    const r=ocr.renderPage(mu,doc,pg.page-1,Z2,false);
    const { data } = await w.recognize(r.png,{ rectangle:{ left:0, top:0, width:Math.round(r.width*0.235), height:r.height } });
    const words=(data.words||[]).map(x=>({t:x.text,x:x.bbox.x0,y:(x.bbox.y0+x.bbox.y1)/2}));
    let agree=0;
    for(const [i,row] of pg.rows.entries()){
      const y0=row.by0*K-6, y1=row.by1*K+6;
      const line=words.filter(x=>x.y>=y0&&x.y<=y1).sort((a,b)=>a.x-b.x);
      // the payroll number is the last token on the strip that reads as one
      let second='';
      for(const x of line){ const e=parse.asEmplid(x.t); if(e) second=e.value; }
      out.push({page:pg.page,line:i+1,name:row.name,first:row.emplid||'',second,strip:line.map(x=>x.t).join(' ')});
      if(second&&second===row.emplid) agree++;
    }
    console.log('page '+pg.page+'  '+agree+'/'+pg.rows.length+' agree  '+(Date.now()-t0)+'ms');
    fs.writeFileSync(S+'second.json',JSON.stringify(out));
  }
  await w.terminate();
  console.log('DONE');
})().catch(e=>{console.error('FAILED',e.message,e.stack);process.exit(1);});

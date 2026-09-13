const fs=require('fs');
const root='.codex-test-tmp/day-evaluation';
const quant=(a,q)=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(q*a.length)-1]:null;
const sum=a=>a.reduce((a,b)=>a+b,0);
const summaries=[];
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.json')&&!n.includes('checkpoint'))){
 const d=JSON.parse(fs.readFileSync(`${root}/${name}`));
 const accepted=d.rows.filter(r=>r.success),calls=d.rows.flatMap(r=>r.calls),texts=accepted.flatMap(r=>r.lines.map(l=>l.text||''));
 const s={name,diagnostic:d.diagnosticStylePrompt,stop:d.stopReason,collectionNote:d.collectionNote,attempts:d.rows.length,successful:d.successful,final:d.finalState,calls:calls.length,
 foregroundMs:sum(d.rows.map(r=>r.metrics?.totalMs||0)),withBackgroundMs:sum(d.rows.map(r=>r.elapsedIncludingBackgroundMs||0)),
 playableMedianMs:quant(accepted.map(r=>r.metrics?.playableMs).filter(Number.isFinite),.5),playableP90Ms:quant(accepted.map(r=>r.metrics?.playableMs).filter(Number.isFinite),.9),
 acceptedChars:sum(texts.map(t=>t.length)),emptyTurns:accepted.filter(r=>!r.lines.length).map(r=>r.turn),zeroMinuteTurns:accepted.filter(r=>r.before.time===r.after.time).map(r=>r.turn),stateTurns:accepted.filter(r=>r.metrics?.stages?.some(s=>s.name==='state')).map(r=>r.turn),
 firstTokenMedianMs:quant(accepted.map(r=>r.metrics?.firstTokenMs).filter(Number.isFinite),.5),
 maxRequestChars:Math.max(...calls.map(c=>c.inputChars||0)),maxReportedPromptTokens:Math.max(...calls.map(c=>c.usage?.prompt_tokens||0)),httpStatuses:calls.reduce((a,c)=>(a[c.status??c.error??'unknown']=(a[c.status??c.error??'unknown']||0)+1,a),{}),
 tokens:{prompt:sum(calls.map(c=>c.usage?.prompt_tokens||0)),completion:sum(calls.map(c=>c.usage?.completion_tokens||0)),reported:calls.filter(c=>c.usage).length},
 styleRejected:d.diagnosticStylePrompt==='observe-only'?d.rows.filter(r=>r.styleFindings?.some(f=>!f.approved)).length:null,
 errors:d.rows.filter(r=>!r.success).map(r=>({attempt:r.attempt,error:r.error})),
 timeline:accepted.map(r=>({turn:r.turn,attempt:r.attempt,input:r.input,options:r.options,from:r.before.time,to:r.after.time,minutes:(Date.parse(r.after.time)-Date.parse(r.before.time))/60000,location:r.after.location,stamina:r.after.stamina,sanity:r.after.sanity,deathNews:r.after.deathNews,knowledge:r.after.knowledge,facts:r.after.facts,chars:sum(r.lines.map(l=>(l.text||'').length)),calls:r.calls.length,playableMs:r.metrics?.playableMs,reset:r.resetReason}))};
 summaries.push(s);
 let out=`# ${name}\n\nDiagnostic: ${d.diagnosticStylePrompt}; stop: ${d.stopReason}\n`;
 for(const r of d.rows){out+=`\n## Attempt ${r.attempt} / Turn ${r.turn} / ${r.success?'ACCEPTED':'REJECTED'}\n\nInput: ${r.input}\n\n${r.before.time} → ${r.after.time}; ${r.after.location}; stamina ${r.after.stamina}, sanity ${r.after.sanity}; ${r.after.deathNews}\n\n`;
 if(r.success)out+=r.lines.map(l=>`${l.speaker||''} (${l.character||''}/${l.emotion||''}): ${l.text||''}`).join('\n\n')+`\n\nOptions: ${JSON.stringify(r.options)}\n\nKnowledge: ${JSON.stringify(r.after.knowledge)}\n\nFacts: ${JSON.stringify(r.after.facts)}\n`;
 else out+=`Error: ${r.error}\n`;
 if(r.styleFindings?.length)out+=`\nStyle results: ${JSON.stringify(r.styleFindings)}\n`;
 if(r.resetScene)out+=`\nRESET: ${JSON.stringify(r.resetScene)}\n`;
 }
 fs.writeFileSync(`${root}/${name.replace('.json','-transcript.md')}`,out);
}
fs.writeFileSync(`${root}/../day-summary.json`,JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries.map(({name,stop,attempts,successful,calls,foregroundMs,withBackgroundMs,playableMedianMs,acceptedChars,final})=>({name,stop,attempts,successful,calls,foregroundMs,withBackgroundMs,playableMedianMs,acceptedChars,time:final.time,cycle:final.cycleCount})),null,2));

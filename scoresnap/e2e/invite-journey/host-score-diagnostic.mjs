// Run inside page.evaluate. Only allowlisted score state leaves browser storage;
// never return raw envelopes, identity keys, credentials, or exception messages.
export function readHostScoreState({contestId, playerId, playerName, hole}, storage=globalThis.localStorage) {
  const result={storageReadable:true,contestPresent:false,players:[],outboxes:[]};
  try {
    const contest=JSON.parse(storage.getItem('snapscore-contests')??'null')?.state?.contests?.find(c=>c.id===contestId);
    if(contest) {
      result.contestPresent=true;
      result.completed=contest.status==='completed';
      result.remoteRestored=contest.remoteRestored===true;
      result.currentRound=Number.isInteger(contest.currentRound)?contest.currentRound:null;
      const scopes=[{groups:contest.groups},...(contest.rounds??[])];
      for(const scope of scopes) for(const group of scope.groups??[]) for(const player of group.players??[]) {
        if(player.id!==playerId && player.name!==playerName) continue;
        const score=player.scores?.[hole-1];
        result.players.push({idMatches:player.id===playerId,roundSelected:scope.number===contest.currentRound,
          strokes:Number.isFinite(score)?score:null,hasScore:typeof score==='number' && score>0});
      }
    }
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);
      if(!key?.startsWith('snapscore.outbox.v1.')) continue;
      try {
        const box=JSON.parse(storage.getItem(key));
        const entries=(box.entries??[]).filter(e=>e.draft?.contest_id===contestId && e.draft?.player_id===playerId && e.draft?.hole===hole);
        result.outboxes.push({valid:box.format===1,entries:entries.map(e=>({
          state:['queued','conflict','denied'].includes(e.state)?e.state:'unknown',
          strokes:Number.isFinite(e.draft.strokes)?e.draft.strokes:null,requestMaterialized:!!e.request
        }))});
      } catch { result.outboxes.push({valid:false}); }
    }
  } catch { result.storageReadable=false; }
  return result;
}

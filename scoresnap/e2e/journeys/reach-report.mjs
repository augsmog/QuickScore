export function renderReachReport(report,manifest) {
  const width=report.viewport?.width,height=report.viewport?.height,bottom=report.safeArea?.bottom??0;
  const resultById=new Map((report.results||[]).map(result=>[result.id,result]));
  const lines=[
    '# Journey reach depth',
    '',
    `Device profile: ${report.deviceProfile||'unspecified'} (${width}×${height}; bottom inset ${bottom}px).`,
    `Source SHA: ${report.sha||'unavailable'}.`,
    '',
    '| Journey | Persona | Start | Feature | Taps from start | Scrolls | Above fold | Named | Budget | Position (x, y, w, h) | Result |',
    '|---|---|---|---|---:|---:|---|---|---:|---|---|',
  ];
  let unmeasured=0;
  for(const journey of manifest.journeys.filter(j=>j.status!=='deferred')) {
    const result=resultById.get(journey.id);
    for(const feature of journey.features) {
      const measured=result?.metrics?.reachability?.find(item=>item.feature===feature.name);
      const rect=measured?.rect;
      const reached=Boolean(measured);
      if(!reached)unmeasured++;
      const aboveFold=rect?(measured.scrolls===0&&(rect.y+rect.height)<=height-bottom?'yes':'no'):'not measured';
      const named=measured?.status==='passed'?'yes':measured?.status==='expected_failure'?'known issue':measured?`failed: ${measured.signature||'unknown'}`:'not measured';
      const position=rect?`${Math.round(rect.x)}, ${Math.round(rect.y)}, ${Math.round(rect.width)}, ${Math.round(rect.height)}`:'not measured';
      const depth=reached?measured.depth:'not measured';
      const scrolls=reached?measured.scrolls:'not measured';
      const budget=`${feature.maxActivations} taps / ${feature.maxScrolls} scrolls`;
      lines.push(`| ${journey.id} | ${journey.persona||'unspecified'} | ${journey.start||'unspecified'} | ${feature.name} (${feature.accessibleName}) | ${depth} | ${scrolls} | ${aboveFold} | ${named} | ${budget} | ${position} | ${result?.status||'missing'} |`);
    }
  }
  lines.push('',`Unmeasured features: ${unmeasured}.`,
    '“Above fold” means the feature was reached with zero scrolls and the full control rectangle ends before the simulated home-indicator inset. “Named” reflects the journey runner exact-role/name check; known issues remain explicit expected failures.');
  return lines.join('\n')+'\n';
}

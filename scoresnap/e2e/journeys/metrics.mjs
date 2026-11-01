// Pure measurement and gate policy. No browser dependencies.
export function createMetrics() {
  return {activations:0,textEdit:0,focus:0,scroll:0,screens:[],transitions:[],actions:[],reachability:[],durationMs:0};
}
export function count(metrics, kind, detail={}) {
  if (!['activations','textEdit','focus','scroll'].includes(kind)) throw Error(`Unknown counter ${kind}`);
  metrics[kind]++;
  metrics.actions.push({kind,...detail});
}
export function screen(metrics, id) {
  const from=metrics.transitions.at(-1)?.to;
  if (from===id) return;
  if (!metrics.screens.includes(id)) metrics.screens.push(id);
  metrics.transitions.push({from:from??null,to:id});
}
export function issueErrors(issue, now=new Date()) {
  if (!issue?.linear || !issue.signature) return ['invalid known issue marker'];
  const date=Date.parse(issue.date), renewal=Date.parse(issue.renewedUntil);
  return !Number.isFinite(date) || (now-date>14*86400000 && !(renewal>=now.getTime()))
    ? ['stale known issue; explicit renewal required'] : [];
}
export function evaluate(journey, attempt, {baseline=journey.baseline, now=new Date()}={}) {
  const errors=[];
  const m=attempt.metrics;
  if (!m) return {status:'failed',errors:['missing metrics']};
  if (['skipped','errored'].includes(attempt.status)) errors.push(`required attempt ${attempt.status}`);
  if (!['gated','known_issue'].includes(journey.status)) errors.push('non-executable journey status');
  if (m.activations>journey.budget.activations) errors.push('activation budget exceeded');
  if (m.screens.length>journey.budget.screens) errors.push('screen budget exceeded');
  if (m.durationMs>journey.budget.timeoutMs || attempt.timedOut) errors.push('absolute timeout exceeded');
  if (baseline) {
    const delta=m.activations-baseline.activations;
    if (delta>0.2*baseline.activations) errors.push('activation baseline regression >20%');
    if (delta>2) errors.push('activation baseline regression >2');
    if (baseline.timeSamples?.length>=10) {
      const values=[...baseline.timeSamples].sort((a,b)=>a-b), mid=Math.floor(values.length/2);
      const median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
      if (m.durationMs>1.5*median) errors.push('time baseline regression >50%');
    }
  }
  if (journey.status==='known_issue') {
    const issue=journey.knownIssue;
    errors.push(...issueErrors(issue,now));
    if (!journey.assertions.includes(issue.signature)) errors.push('unknown xfail assertion signature');
    if (!attempt.error) errors.push('unexpected pass: remove marker');
    else if (attempt.signature!==issue.signature) errors.push(`xfail signature mismatch: ${attempt.signature??'unclassified'}`);
  } else if (attempt.error) errors.push(attempt.error);
  // Only assertions after the declared failing assertion may be absent in a strict xfail.
  const expected=journey.assertions;
  const failIndex=journey.status==='known_issue'?expected.indexOf(attempt.signature):-1;
  const needed=failIndex>=0?expected.slice(0,failIndex):expected;
  for (const id of needed) if (!attempt.assertions?.includes(id)) errors.push(`missing assertion: ${id}`);
  for (const feature of journey.features??[]) {
    const entries=m.reachability.filter(r=>r.feature===feature.name);
    if (entries.length!==1) {errors.push(`missing/duplicate feature: ${feature.name}`);continue;}
    const r=entries[0];
    if(r.depth>feature.maxActivations || r.depth>(feature.class==='core'?2:3)) errors.push(`feature activation budget: ${feature.name}`);
    if(feature.class==='core' && r.disclosures?.length) errors.push(`core behind disclosure: ${feature.name}`);
    if(r.scrolls>feature.maxScrolls || r.scrolls>(feature.class==='core'?0:1)) errors.push(`feature scroll budget: ${feature.name}`);
    if(feature.reachability?.status==='known_issue') {
      errors.push(...issueErrors(feature.reachability,now));
      if(!r.signature) errors.push(`${feature.name}: unexpected pass: remove marker`);
      else if(r.signature!==feature.reachability.signature || r.status!=='expected_failure') errors.push(`${feature.name}: xfail signature mismatch`);
    } else if(r.status!=='passed') errors.push(`${feature.name}: reachability failed`);
  }
  if (attempt.captureError) errors.push('screenshot capture failed');
  const steps=journey.requiredSteps;
  if (!Array.isArray(steps)||!steps.length||new Set(steps).size!==steps.length) errors.push('invalid required step capture inventory');
  else for (const name of steps) if (!attempt.steps?.some(s=>s.name===name)) errors.push(`missing step capture: ${name}`);
  if (attempt.pageErrors?.length) errors.push('browser runtime error');
  return {status:errors.length?'failed':journey.status==='known_issue'?'expected_failure':'passed',errors};
}
export function aggregate(required, results) {
  const errors=[];
  if (!required.length || new Set(required).size!==required.length) errors.push('empty/duplicate required inventory');
  if (results.length!==required.length) errors.push('missing/extra journey results');
  for (const id of required) {
    const matches=results.filter(r=>r.id===id);
    if (matches.length!==1) errors.push(`missing/duplicate required journey: ${id}`);
    else if (!['passed','expected_failure'].includes(matches[0].status)) errors.push(`${id}: ${matches[0].status}`);
  }
  for (const r of results) if (!required.includes(r.id)) errors.push(`unexpected journey: ${r.id}`);
  return {status:errors.length?'failed':'passed',errors};
}

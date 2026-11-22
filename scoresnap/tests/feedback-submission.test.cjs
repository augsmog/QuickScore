const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sourcePath = path.join(__dirname, '../src/services/feedback-submission.ts');
function load(source = fs.readFileSync(sourcePath, 'utf8')) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', js)(mod.exports, mod);
  return mod.exports;
}
const { FeedbackSubmission, validateFeedbackDraft } = load();
const key = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const draft = (patch = {}) => ({ category: 'bug', summary: ' Summary ', description: ' Details ', ...patch });
const ack = request => ({ status: 'accepted', durable: true, submissionKey: request.submissionKey, receiptId: key(999) });
function setup(submit = async request => ack(request), Model = FeedbackSubmission) {
  let n = 0;
  const transport = { submit: jest.fn(submit), reconcile: jest.fn() };
  const model = new Model(transport, () => key(++n)); model.edit(draft());
  return { model, transport };
}
test.each(['bug','feature'])('trims and accepts %s; replay sends once', async category => {
  const { model, transport } = setup(); model.edit(draft({ category }));
  expect((await model.submit()).phase).toBe('accepted');
  expect(transport.submit.mock.calls[0][0]).toEqual({ version:1,category,summary:'Summary',description:'Details',submissionKey:key(1) });
  const accepted = model.getState(); expect(await model.submit()).toBe(accepted);
  expect(transport.submit).toHaveBeenCalledTimes(1);
  expect(accepted.receipt).toEqual({receiptId:key(999),submissionKey:key(1)});
});
test.each([['summary',120],['description',4000],['reproductionSteps',2000]])('%s Unicode limits count code points', (field,max) => {
  expect(validateFeedbackDraft(draft({[field]:` ${'🏌'.repeat(max)} `})).errors).toEqual([]);
  expect(validateFeedbackDraft(draft({[field]:'🏌'.repeat(max+1)})).errors).toContain(field);
});
test.each(['summary','description'])('rejects empty/mistyped %s without transport', async field => {
  const {model,transport} = setup(); model.edit(draft({[field]:'  '}));
  expect((await model.submit()).errors).toContain(field); expect(transport.submit).not.toHaveBeenCalled();
  expect(validateFeedbackDraft(draft({[field]:123})).errors).toContain(field);
});
test('invalid category and feature reproduction are structured errors', () => {
  expect(validateFeedbackDraft(draft({category:'other'})).errors).toContain('category');
  expect(validateFeedbackDraft(draft({category:'feature',reproductionSteps:'old bug'})).errors).toEqual(['reproduction_not_allowed']);
  expect(validateFeedbackDraft(draft({reproductionSteps:' steps '})).value.reproductionSteps).toBe('steps');
});
test.each(['token','credentials','userId','playerId','roundId','linearIssueId','attachments','diagnostics'])('rejects unapproved field %s', field => {
  const input=draft({[field]:'private'}); expect(validateFeedbackDraft(input).errors).toEqual(['fields']);
  const {model}=setup(); expect(model.edit(input)).toBe(false); expect(model.getState().draft).not.toHaveProperty(field);
});
test('rejects getters, symbols, arrays, null and inherited fields', () => {
  const getter=draft(); Object.defineProperty(getter,'summary',{get(){throw new Error('must not read');}});
  const symbol=draft(); symbol[Symbol('private')]='x';
  for (const input of [getter,symbol,[],null,Object.assign(Object.create({token:'x'}),draft())]) expect(validateFeedbackDraft(input).errors).toEqual(['fields']);
});
test('double submit shares promise; request and state are immutable', async () => {
  let resolve;
  const {model,transport}=setup(request=>new Promise(r=>{resolve=()=>r(ack(request));}));
  const first=model.submit(); expect(model.getState().phase).toBe('submitting'); expect(model.submit()).toBe(first);
  expect(model.edit(draft({summary:'changed'}))).toBe(false); await Promise.resolve();
  expect(Object.isFrozen(transport.submit.mock.calls[0][0])).toBe(true);
  expect(Object.isFrozen(model.getState().draft)).toBe(true); expect(Object.isFrozen(model.getState().errors)).toBe(true);
  resolve(); await first; expect(transport.submit).toHaveBeenCalledTimes(1);
});
test.each(['offline','validation','rate_limited','server'])('%s preserves draft/key and locks edits', async code => {
  const {model,transport}=setup(async()=>({status:'rejected',code})); const before=model.getState().draft;
  expect((await model.submit()).errors).toEqual([code]); expect(model.getState().draft).toBe(before);
  expect(model.edit(draft({summary:'changed'}))).toBe(false);
  transport.submit.mockImplementation(async request=>ack(request)); expect((await model.submit()).phase).toBe('accepted');
  expect(transport.submit.mock.calls[0][0]).toBe(transport.submit.mock.calls[1][0]);
});
test.each([null,{}, {status:'queued'}, {status:'accepted',durable:false}, {...ack({submissionKey:key(5)})}, {...ack({submissionKey:key(1)}),receiptId:'AUG-123'}, {...ack({submissionKey:key(1)}),linearIssueId:'private'}])('malformed acknowledgement never succeeds: %j', async response => {
  const {model}=setup(async()=>response); expect((await model.submit()).phase).toBe('retry');
  expect(model.getState().receipt).toBeUndefined(); expect(model.edit(draft())).toBe(false);
});
test('lost acknowledgement retry creates one mock acceptance with frozen key/payload', async () => {
  const accepted=new Map(); let first=true;
  const {model,transport}=setup(async request=>{
    if(!accepted.has(request.submissionKey)) accepted.set(request.submissionKey,ack(request));
    if(first){first=false;throw new Error('private network detail');} return accepted.get(request.submissionKey);
  });
  expect((await model.submit()).errors).toEqual(['network']); expect((await model.submit()).phase).toBe('accepted');
  expect(accepted.size).toBe(1); expect(transport.submit.mock.calls[0][0]).toBe(transport.submit.mock.calls[1][0]);
});
test('sync transport and key failures are contained', async () => {
  const {model}=setup(()=>{throw new Error('sensitive');}); expect((await model.submit()).errors).toEqual(['network']);
  const other=new FeedbackSubmission({},()=>{throw new Error('sensitive');}); other.edit(draft());
  expect((await other.submit()).errors).toEqual(['key']);
});
test('reconcile accepted request returns safe receipt without resending', async () => {
  const {model,transport}=setup(async()=>{throw new Error('timeout');}); await model.submit();
  transport.reconcile.mockResolvedValue(ack({submissionKey:key(1)})); expect((await model.reconcile()).phase).toBe('accepted');
  await model.submit(); expect(transport.submit).toHaveBeenCalledTimes(1);
});
test('only matching authoritative not_accepted allows editing and fresh key', async () => {
  const {model,transport}=setup(async()=>{throw new Error('timeout');}); await model.submit();
  for(const response of [null,{status:'not_accepted',submissionKey:key(2)},{status:'not_accepted',submissionKey:key(1),token:'private'}]){
    transport.reconcile.mockResolvedValue(response); expect((await model.reconcile()).errors).toEqual(['reconciliation']); expect(model.edit(draft())).toBe(false);
  }
  transport.reconcile.mockRejectedValue(new Error('private')); expect((await model.reconcile()).errors).toEqual(['reconciliation']);
  transport.reconcile.mockResolvedValue({status:'not_accepted',submissionKey:key(1)}); expect((await model.reconcile()).phase).toBe('editing');
  expect(model.edit(draft({summary:'revised'}))).toBe(true); transport.submit.mockImplementation(async request=>ack(request)); await model.submit();
  expect(transport.submit.mock.calls[1][0].submissionKey).toBe(key(2));
});
test('reconciliation blocks submit and edits while in flight', async () => {
  const {model,transport}=setup(async()=>{throw new Error('timeout');}); await model.submit(); let resolve;
  transport.reconcile.mockImplementation(()=>new Promise(r=>{resolve=r;})); const pending=model.reconcile();
  expect(model.submit()).toBe(pending); expect(model.edit(draft())).toBe(false); await Promise.resolve();
  resolve({status:'not_accepted',submissionKey:key(1)}); await pending;
});
test('invalid and reused UUIDs cannot become new submissions', async () => {
  for(const id of ['bad',null,key(1)]){
    const transport={submit:jest.fn(async request=>ack(request)),reconcile:jest.fn()}; const model=new FeedbackSubmission(transport,()=>id); model.edit(draft());
    await model.submit(); if(id===key(1)){model.edit(draft({summary:'new'}));await model.submit();}
    expect(model.getState().errors).toEqual(['key']); expect(transport.submit).toHaveBeenCalledTimes(id===key(1)?1:0);
  }
});
test('negative control: removing durable check admits an unaccepted receipt', async () => {
  const source=fs.readFileSync(sourcePath,'utf8'); const mutated=source.replace('response.durable !== true || ',''); expect(mutated).not.toBe(source);
  const unsafe={...ack({submissionKey:key(1)}),durable:false};
  const {model:safe}=setup(async()=>unsafe); const {model:broken}=setup(async()=>unsafe,load(mutated).FeedbackSubmission);
  expect((await safe.submit()).phase).toBe('retry'); expect((await broken.submit()).phase).toBe('accepted');
});

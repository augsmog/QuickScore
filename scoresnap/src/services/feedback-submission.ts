/** Pure mocked-contract groundwork. No endpoint or UI is activated by this module. */
export type FeedbackDraft = { category: string; summary: string; description: string; reproductionSteps?: string };
export type FeedbackRequest = Readonly<{
  version: 1; category: 'bug' | 'feature'; summary: string; description: string;
  reproductionSteps?: string; submissionKey: string;
}>;
export type FeedbackError = 'fields' | 'category' | 'summary' | 'description' |
  'reproductionSteps' | 'reproduction_not_allowed' | 'key' | 'network' |
  'offline' | 'validation' | 'rate_limited' | 'server' | 'acknowledgement' | 'reconciliation';
export type FeedbackReceipt = Readonly<{ receiptId: string; submissionKey: string }>;
export type FeedbackState = Readonly<{
  phase: 'editing' | 'submitting' | 'retry' | 'accepted'; draft: Readonly<FeedbackDraft>;
  errors: readonly FeedbackError[]; receipt?: FeedbackReceipt;
}>;
export interface FeedbackTransport {
  submit(request: FeedbackRequest): Promise<unknown>;
  /** Must authoritatively reconcile the original key, never guess from a timeout. */
  reconcile(submissionKey: string): Promise<unknown>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAFT_FIELDS = ['category', 'summary', 'description', 'reproductionSteps'];
const ownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value: Record<string, unknown>, fields: string[]) =>
  Reflect.ownKeys(value).every(k => typeof k === 'string' && fields.includes(k) &&
    Object.getOwnPropertyDescriptor(value, k)?.get === undefined);
const emptyDraft = (): FeedbackDraft => ({ category: 'bug', summary: '', description: '' });

export function validateFeedbackDraft(input: unknown): {
  errors: FeedbackError[]; value?: Omit<FeedbackRequest, 'version' | 'submissionKey'>;
} {
  if (!ownRecord(input) || !exactKeys(input, DRAFT_FIELDS)) return { errors: ['fields'] };
  const errors: FeedbackError[] = [];
  const text = (field: 'summary' | 'description' | 'reproductionSteps', min: number, max: number) => {
    const raw = input[field];
    if (field === 'reproductionSteps' && raw === undefined) return '';
    if (typeof raw !== 'string') { errors.push(field); return ''; }
    const value = raw.trim();
    const length = Array.from(value).length;
    if (length < min || length > max) errors.push(field);
    return value;
  };
  const category = input.category;
  if (category !== 'bug' && category !== 'feature') errors.push('category');
  const summary = text('summary', 1, 120);
  const description = text('description', 1, 4000);
  const reproductionSteps = text('reproductionSteps', 0, 2000);
  // Feature requests never carry stale reproduction steps from a previous bug draft.
  if (category === 'feature' && reproductionSteps) errors.push('reproduction_not_allowed');
  if (errors.length) return { errors };
  return { errors, value: { category: category as 'bug' | 'feature', summary, description,
    ...(reproductionSteps ? { reproductionSteps } : {}) } };
}
function receiptFrom(response: unknown, key: string): FeedbackReceipt | undefined {
  if (!ownRecord(response) || !exactKeys(response, ['status', 'durable', 'submissionKey', 'receiptId'])) return;
  if (response.status !== 'accepted' || response.durable !== true || response.submissionKey !== key ||
    typeof response.receiptId !== 'string' || !UUID.test(response.receiptId)) return;
  return Object.freeze({ receiptId: response.receiptId, submissionKey: key });
}
function responseError(response: unknown): FeedbackError {
  if (ownRecord(response) && exactKeys(response, ['status', 'code']) && response.status === 'rejected') {
    const code = response.code;
    if (code === 'offline' || code === 'validation' || code === 'rate_limited' || code === 'server') return code;
  }
  return 'acknowledgement';
}

/** Failures retain the immutable request until authoritative reconciliation or acceptance. */
export class FeedbackSubmission {
  private state: FeedbackState = Object.freeze({ phase: 'editing', draft: Object.freeze(emptyDraft()), errors: Object.freeze([]) });
  private request?: FeedbackRequest;
  private active?: Promise<FeedbackState>;
  private usedKeys = new Set<string>();
  constructor(private transport: FeedbackTransport, private newKey: () => string) {}
  getState(): FeedbackState { return this.state; }
  private update(patch: Partial<FeedbackState>): FeedbackState {
    this.state = Object.freeze({ ...this.state, ...patch,
      errors: Object.freeze([...(patch.errors ?? this.state.errors)]) });
    return this.state;
  }
  /** Returns false while an outcome is uncertain; the caller must reconcile first. */
  edit(input: unknown): boolean {
    if (this.active || this.request && this.state.phase !== 'accepted') return false;
    if (!ownRecord(input) || !exactKeys(input, DRAFT_FIELDS) ||
      !['category', 'summary', 'description'].every(k => typeof input[k] === 'string') ||
      (input.reproductionSteps !== undefined && typeof input.reproductionSteps !== 'string')) {
      this.update({ errors: ['fields'] }); return false;
    }
    const draft: FeedbackDraft = { category: input.category as string, summary: input.summary as string,
      description: input.description as string,
      ...(typeof input.reproductionSteps === 'string' ? { reproductionSteps: input.reproductionSteps } : {}) };
    this.request = undefined;
    this.update({ phase: 'editing', draft: Object.freeze(draft), errors: [], receipt: undefined });
    return true;
  }
  submit(): Promise<FeedbackState> {
    if (this.active) return this.active;
    if (this.state.phase === 'accepted') return Promise.resolve(this.state);
    if (!this.request) {
      const validated = validateFeedbackDraft(this.state.draft);
      if (!validated.value) return Promise.resolve(this.update({ errors: validated.errors }));
      let key: string;
      try { key = this.newKey(); } catch { return Promise.resolve(this.update({ errors: ['key'] })); }
      if (typeof key !== 'string' || !UUID.test(key) || this.usedKeys.has(key.toLowerCase())) {
        return Promise.resolve(this.update({ errors: ['key'] }));
      }
      this.usedKeys.add(key.toLowerCase());
      this.request = Object.freeze({ version: 1, ...validated.value, submissionKey: key });
    }
    const request = this.request;
    this.update({ phase: 'submitting', errors: [] });
    this.active = Promise.resolve().then(() => this.transport.submit(request)).then(response => {
      const receipt = receiptFrom(response, request.submissionKey);
      return receipt ? this.update({ phase: 'accepted', receipt, errors: [] }) :
        this.update({ phase: 'retry', errors: [responseError(response)] });
    }).catch(() => this.update({ phase: 'retry', errors: ['network'] })).finally(() => { this.active = undefined; });
    return this.active;
  }
  reconcile(): Promise<FeedbackState> {
    if (this.active) return this.active;
    if (!this.request || this.state.phase === 'accepted') return Promise.resolve(this.state);
    const key = this.request.submissionKey;
    this.active = Promise.resolve().then(() => this.transport.reconcile(key)).then(response => {
      const receipt = receiptFrom(response, key);
      if (receipt) return this.update({ phase: 'accepted', receipt, errors: [] });
      if (ownRecord(response) && exactKeys(response, ['status', 'submissionKey']) &&
        response.status === 'not_accepted' && response.submissionKey === key) {
        this.request = undefined;
        return this.update({ phase: 'editing', errors: [], receipt: undefined });
      }
      return this.update({ phase: 'retry', errors: ['reconciliation'] });
    }).catch(() => this.update({ phase: 'retry', errors: ['reconciliation'] })).finally(() => { this.active = undefined; });
    return this.active;
  }
}

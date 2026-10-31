import type { WriteArgs } from './tournament-sync-plan';
export type ScoreDraft = Omit<WriteArgs, 'op_id' | 'request_hash' | 'expected_version'>;
export interface Receipt { status: 'accepted' | 'conflict'; version: number; strokes: number | null; revision: number }
export interface Entry { localCell?: string; localEdit?: string; id: string; draft: ScoreDraft; expected: number; request?: WriteArgs; state: 'queued' | 'conflict' | 'denied'; receipt?: Receipt }
interface Envelope { settlement?: { removed: Entry[]; retained?: Entry }; format: 1; actor: string; entries: Entry[]; versions: Record<string, number> }
export interface EnvelopeStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
const cell = (d: ScoreDraft) => JSON.stringify([d.contest_id, d.round_id, d.player_id, d.hole]);
/** One durable envelope, serialized writer; never acknowledge enqueue before storage commits. */
export function scoreOutbox(storage: EnvelopeStorage, actor: string, uuid: () => string, send: (args: WriteArgs) => Promise<Receipt>, settled: (entries: Entry[], retained?: Entry) => Promise<void> = async () => {}) {
  const key = `snapscore.outbox.v1.${actor}`;
  let serial: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = serial.then(work); serial = next.catch(() => undefined); return next;
  };
  async function read(): Promise<Envelope> {
    const raw = await storage.getItem(key);
    if (raw === null) return { format: 1, actor, entries: [], versions: {} };
    const box = JSON.parse(raw);
    if (box.format !== 1 || box.actor !== actor || !Array.isArray(box.entries) || !box.versions) throw Error('Outbox damaged; unsent scores retained for recovery');
    if (box.settlement) {
      await settled(box.settlement.removed, box.settlement.retained);
      delete box.settlement;
      await storage.setItem(key, JSON.stringify(box));
    }
    return box;
  }
  async function finish(box: Envelope) {
    if (!box.settlement) return;
    await settled(box.settlement.removed, box.settlement.retained);
    delete box.settlement;
    await save(box);
  }
  const save = (box: Envelope) => storage.setItem(key, JSON.stringify(box));
  return {
    inspect: () => run(read),
    enqueue: (draft: ScoreDraft, expected: number, localEdit?: string, localCell?: string) => run(async () => {
      if (!draft.contest_id || !draft.round_id || !draft.player_id || !Number.isInteger(expected) || expected < 0 || !Number.isInteger(draft.hole) || draft.hole < 1 || draft.hole > 18 || !(draft.action === 'clear' && draft.strokes === null || draft.action === 'set' && Number.isInteger(draft.strokes) && draft.strokes! >= 1 && draft.strokes! <= 15)) throw Error('Invalid score draft');
      const box = await read();
      const id = uuid();
      box.entries.push({ id, localEdit, localCell, draft: { ...draft }, expected, state: 'queued' });
      await save(box); return id;
    }),
    replay: () => run(async () => {
      const box = await read();
      const blocked = new Set<string>();
      for (const entry of [...box.entries]) {
        const target = cell(entry.draft);
        if (entry.state !== 'queued') { blocked.add(target); continue; }
        if (blocked.has(target)) continue;
        if (!entry.request) {
          // A successor uses only the durable predecessor receipt, never an optimistic version.
          const version = Math.max(box.versions[target] ?? 0, entry.expected);
          entry.request = { ...entry.draft, expected_version: version, op_id: entry.id, request_hash: entry.id };
          await save(box); // immutable before first transmission
        }
        let receipt: Receipt;
        try { receipt = await send({ ...entry.request }); }
        catch (error: any) {
          if (['42501', '22023', '55000', '23505'].includes(error?.code) || [400, 401, 403].includes(error?.status)) {
            entry.state = 'denied'; await save(box); blocked.add(target); continue;
          }
          throw error; // transport retry retains the exact materialized request
        }
        if (!receipt || !['accepted', 'conflict'].includes(receipt.status) || !Number.isInteger(receipt.version) || receipt.version < 0) throw Error('Invalid score receipt');
        if (receipt.status === 'conflict') {
          entry.state = 'conflict'; entry.receipt = receipt; blocked.add(target);
        } else {
          box.versions[target] = receipt.version;
          box.entries = box.entries.filter(e => e.id !== entry.id);
        }
        if (receipt.status === 'accepted') box.settlement = { removed: [entry] };
        await save(box); // failure here retries the identical request on restart
        await finish(box);
      }
      return box;
    }),
    resolve: (id: string, choice: 'keep-current' | 'use-mine', confirmCancelSuccessors: boolean) => run(async () => {
      const box = await read();
      const entry = box.entries.find(e => e.id === id);
      if (!entry || entry.state !== 'conflict' || !entry.receipt || !confirmCancelSuccessors) throw Error('Confirm conflict choice and cancellation of dependent drafts');
      const target = cell(entry.draft);
      const removed = box.entries.filter(e => cell(e.draft) === target);
      box.entries = box.entries.filter(e => cell(e.draft) !== target);
      box.versions[target] = entry.receipt.version;
      if (choice === 'use-mine') box.entries.push({ id: uuid(), draft: entry.draft, expected: entry.receipt.version, state: 'queued', localEdit: entry.localEdit, localCell: entry.localCell });
      box.settlement = { removed, retained: choice === 'use-mine' ? box.entries[box.entries.length - 1] : undefined };
      await save(box);
      await finish(box);
    }),
  };
}

export interface QuickSettleCompletion {
  operationId: string;
  ownerId: string;
  contestId: string;
  attempts: number;
}

interface Box { format: 1; ownerId: string; operations: QuickSettleCompletion[]; completedContestIds: string[] }
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
interface Identity { ownerId: string; epoch: number }

const keyFor = (ownerId: string) => `snapscore.quick-settle-completion.v1.${ownerId}`;

/** Durable, per-owner completion outbox. An operation is persisted before the first send. */
export function quickSettleCompletionOutbox(deps: {
  storage: Storage;
  identity(): Promise<Identity | null>;
  send(operation: QuickSettleCompletion): Promise<{ operationId: string; ownerId: string }>;
  uuid(): string;
  maxAttempts?: number;
}) {
  const maxAttempts = deps.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('Invalid retry limit');
  let serial: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = serial.then(work);
    serial = next.catch(() => undefined);
    return next;
  };
  async function read(ownerId: string): Promise<Box> {
    const raw = await deps.storage.getItem(keyFor(ownerId));
    if (raw === null) return { format: 1, ownerId, operations: [], completedContestIds: [] };
    const box = JSON.parse(raw);
    if (box.format !== 1 || box.ownerId !== ownerId || !Array.isArray(box.operations) || !Array.isArray(box.completedContestIds) ||
        box.operations.some((op: any) => op.ownerId !== ownerId || typeof op.operationId !== 'string' ||
          typeof op.contestId !== 'string' || !Number.isInteger(op.attempts) || op.attempts < 0 || op.attempts > maxAttempts)) {
      throw new Error('Quick Settle completion outbox is damaged; no operation was sent');
    }
    return box;
  }
  const save = (box: Box) => deps.storage.setItem(keyFor(box.ownerId), JSON.stringify(box));

  async function flushOwner(identity: Identity): Promise<void> {
    const box = await read(identity.ownerId);
    for (const original of [...box.operations]) {
      while (original.attempts < maxAttempts) {
        const before = await deps.identity();
        if (!before || before.ownerId !== identity.ownerId || before.epoch !== identity.epoch) return;
        // Reload so a late response can never overwrite a newer operation/ack.
        const current = await read(identity.ownerId);
        const op = current.operations.find(item => item.operationId === original.operationId && item.ownerId === identity.ownerId);
        if (!op || op.attempts >= maxAttempts) break;
        op.attempts += 1;
        await save(current); // Count before transmission; a crash cannot exceed the bound.
        const immediatelyBeforeSend = await deps.identity();
        if (!immediatelyBeforeSend || immediatelyBeforeSend.ownerId !== identity.ownerId || immediatelyBeforeSend.epoch !== identity.epoch) return;
        try {
          const ack = await deps.send({ ...op });
          const after = await deps.identity();
          if (!after || after.ownerId !== identity.ownerId || after.epoch !== identity.epoch) return;
          if (ack?.operationId !== op.operationId || ack?.ownerId !== op.ownerId) continue;
          const latest = await read(identity.ownerId);
          latest.operations = latest.operations.filter(item => !(item.operationId === ack.operationId && item.ownerId === ack.ownerId));
          if (!latest.completedContestIds.includes(op.contestId)) latest.completedContestIds.push(op.contestId);
          await save(latest); // Acknowledgment clears only this owner + operation pair.
          break;
        } catch {
          // The same operation ID is retried; the server RPC is idempotent.
        }
      }
    }
  }

  return {
    enqueue: (contestId: string, capturedIdentity?: Identity | null) => {
      // Capture auth before entering the serialized queue. A wait behind another write
      // must never bind a completion created by A to whichever account signs in later.
      const identityAtCall = capturedIdentity === undefined ? deps.identity() : Promise.resolve(capturedIdentity);
      return run(async () => {
      if (!contestId) throw new Error('Quick Settle contest ID is required');
      const identity = await identityAtCall;
      if (!identity?.ownerId) return false; // Anonymous/local-only Quick Settle is excluded.
      const box = await read(identity.ownerId);
      if (box.completedContestIds.includes(contestId)) return true;
      if (!box.operations.some(op => op.contestId === contestId)) {
        box.operations.push({ operationId: deps.uuid(), ownerId: identity.ownerId, contestId, attempts: 0 });
        await save(box);
      }
      await flushOwner(identity);
      return true;
      });
    },
    flush: () => run(async () => {
      const identity = await deps.identity();
      if (identity?.ownerId) await flushOwner(identity);
    }),
    inspect: async (ownerId: string) => read(ownerId),
  };
}

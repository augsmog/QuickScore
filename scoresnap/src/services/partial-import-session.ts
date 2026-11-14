/**
 * Mid-round draft-session controller for AUG-348 / AUG-1135 (AUG-348e).
 * This module intentionally has no React, store, AsyncStorage/Supabase, or network imports:
 * the host screen owns persistence and identity, and passes both in explicitly.
 *
 * Wraps `buildPartialImport` with the session safety rules from AUG-348's Nov 2 draft-session
 * comments: same-account Back/Cancel keeps the draft, an account switch/sign-out clears it,
 * a stale reviewed-input callback cannot resurrect a superseded draft, a stale context blocks
 * confirm until the caller re-reviews, a blocked draft cannot confirm, and a repeated confirm
 * for an already-confirmed context never re-applies the write.
 */
import { buildPartialImport } from "./partial-import";
import type { PartialImportCell, PartialImportInput, PartialImportResult } from "./partial-import";

export interface PartialImportSessionContext {
  accountId: string;
  contestId: string;
  roundId: string | null;
  groupId: string;
}

export type PartialImportSessionState =
  | { status: "empty" }
  | { status: "draft"; context: PartialImportSessionContext; result: PartialImportResult }
  | { status: "confirmed"; context: PartialImportSessionContext; patch: readonly PartialImportCell[] };

function contextEquals(a: PartialImportSessionContext, b: PartialImportSessionContext): boolean {
  return a.accountId === b.accountId && a.contestId === b.contestId &&
    a.roundId === b.roundId && a.groupId === b.groupId;
}

/** A token minted by `beginReview`; a later `completeReview` must present the exact token it got back. */
export type ReviewToken = number;

export class PartialImportSession {
  private accountId: string | null = null;
  private generation: ReviewToken = 0;
  private state: PartialImportSessionState = { status: "empty" };

  getState(): PartialImportSessionState {
    return this.state;
  }

  /**
   * Must be called whenever the host's active account identity changes (switch or sign-out).
   * A no-op when the account is unchanged, so Back/Cancel (which does not change account) never
   * reaches this and never clears the draft.
   */
  setAccount(accountId: string | null): void {
    if (accountId === this.accountId) return;
    this.accountId = accountId;
    this.generation += 1;
    this.state = { status: "empty" };
  }

  /**
   * Starts (or restarts) review for the given context under the current account and returns an
   * opaque token. Call this synchronously right before kicking off the (possibly async, host-owned)
   * OCR/review work; deliver the result back through `completeReview(token, ...)`.
   */
  beginReview(accountId: string, context: PartialImportSessionContext): ReviewToken {
    if (accountId !== this.accountId) throw new Error("Review belongs to a different account");
    if (accountId !== context.accountId) throw new Error("Review context does not match the reviewing account");
    this.generation += 1;
    return this.generation;
  }

  /**
   * Delivers reviewed input for a prior `beginReview` token. A token superseded by a newer
   * `beginReview`, `setAccount`, `confirm`, or `discard` is silently dropped (returns null) --
   * it must never resurrect a stale or cleared draft.
   */
  completeReview(token: ReviewToken, context: PartialImportSessionContext, input: PartialImportInput): PartialImportSessionState | null {
    if (token !== this.generation) return null;
    const result = buildPartialImport(input);
    this.state = { status: "draft", context, result };
    return this.state;
  }

  /** True when there is a draft whose context exactly matches the caller's current context. */
  isCurrent(context: PartialImportSessionContext): boolean {
    return this.state.status === "draft" && contextEquals(this.state.context, context);
  }

  /**
   * Confirms the current draft for `context`, invoking `apply` with the reviewed patch exactly
   * once. Idempotent: if this context was already confirmed, returns the existing confirmed
   * state without calling `apply` again (repeated confirm/retry never duplicates a write).
   * Throws rather than silently confirming when the account/context is stale or the draft is
   * blocked -- the caller must `setAccount`/re-review before confirm can proceed.
   */
  confirm(
    accountId: string,
    context: PartialImportSessionContext,
    apply: (patch: readonly PartialImportCell[]) => void
  ): PartialImportSessionState {
    if (accountId !== this.accountId) throw new Error("Confirm belongs to a different account");
    if (this.state.status === "confirmed" && contextEquals(this.state.context, context)) {
      return this.state;
    }
    if (this.state.status !== "draft") throw new Error("No reviewed draft to confirm");
    if (!contextEquals(this.state.context, context)) {
      throw new Error("Draft context is stale; re-run review before confirming");
    }
    if (!this.state.result.ok) throw new Error("Cannot confirm a draft with unresolved blockers");
    const patch = this.state.result.patch;
    apply(patch);
    this.generation += 1;
    this.state = { status: "confirmed", context, patch };
    return this.state;
  }

  /** Explicit discard (user abandons the flow). Ordinary Back/Cancel must not call this. */
  discard(): void {
    this.generation += 1;
    this.state = { status: "empty" };
  }
}

/**
 * tools/policies/drafter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability classification for the Document Drafter copilot
 * (createDocumentDrafterAgent).
 *
 * Eight tools, one of them approval-gated. There is no override in this table and
 * that is deliberate: `replaceBlock` overwrites a block the user already wrote,
 * which is the `destructive` definition verbatim (irrecoverably overwrites
 * existing work), so the default derivation table in `tools/capability.ts`
 * already produces the right behaviour. No `approval` field is needed, which is
 * why there is no `reason` string either — see the `ToolPolicy` doc comment:
 * `reason` exists to justify *overrides*, and this map has none.
 *
 * WHY THE BIG LIST OF ABSENCES IS THE ACTUAL SAFETY BOUNDARY
 * ────────────────────────────────────────────────────────────
 * The classification below only decides how much friction the drafter meets. The
 * real guarantee is the shape of the tool set itself. Nothing here can:
 *
 *   - send or draft email            (no network capability, no mail tool)
 *   - export or download a file      (no export tool of any kind)
 *   - write, move or delete a file   (no filesystem *write* tool; the document
 *                                    store and the two project-file reads below
 *                                    are the only surfaces)
 *   - delete a document or a block   (no `deleteDocument` / `deleteBlocks` tool
 *                                    — this is the one mutation that would be
 *                                    unrecoverable, and it is simply not
 *                                    exposed)
 *   - mark a task complete           (no task tools at all; `taskId` is context
 *                                    for the prose, not a handle on the board)
 *   - file anything with a court,
 *     registry, or agency            (no network egress of any kind, so there is
 *                                    no path by which a filing could happen)
 *   - read outside the project's
 *     own folder                     (see below — `read` here means "scoped",
 *                                    not "the whole disk")
 *
 * A prompt injection in a source document cannot escalate past this list
 * because the list is the tool set. So the omissions are load-bearing and must
 * stay that way: if a future "export to PDF" or "email this to the client"
 * capability is added, that is a new tool, and it needs a new classification
 * here AND a deliberate decision about whether the drafter should have it at
 * all. Adding the name to this table is not the check — not having the tool is.
 *
 * Note also that `createApprovalPolicy` fails CLOSED on any name it does not
 * find, so a tool added to `documentDrafterTools` without a matching row here
 * will be denied at runtime rather than silently allowed. The `reason` string it
 * returns points back at this directory.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ToolPolicyMap } from '../capability';

/** Shorthand so the table below reads as a classification, not as boilerplate. */
const t = (
  capability: ToolPolicyMap[string]['capability'],
): ToolPolicyMap[string] => ({
  capability,
});

export const documentDrafterToolPolicies: ToolPolicyMap = {
  // ── Orientation and evidence ────────────────────────────────────────────────
  // getDocumentOutline is the cheap "what is in here" call; readDocument pulls
  // the actual text. Both are pure reads over the user's own store.
  getDocumentOutline: t('read'),
  readDocument: t('read'),

  // ── Source material from the project's own folder ──────────────────────────
  // `read`, same as the reads above and for the same reason: nothing here can
  // mutate state, so gating it would be friction with no safety value.
  //
  // Note carefully what `read` is being asserted here, because the capability
  // vocabulary is blast-radius-shaped and the chat agent uses the same word for
  // its UNBOUNDED readFile/listDir. These two are narrower than that: the root
  // comes from `projects.repo_path` via a project id the model names (never a
  // model-authored path), the model's own path must be relative and is proven
  // contained after `realpath`, symlinks are never followed, and output is
  // capped (200 names / 30 KB). The label says "cannot harm"; the scoping in
  // `tools/project-files.ts` says "cannot roam". Do not relax that scoping and
  // keep this row — that combination would make `read` here quietly mean
  // "arbitrary read", which is precisely the escalation the drafter policy
  // header is arguing against.
  listProjectFiles: t('read'),
  readProjectFile: t('read'),

  // ── Drafting: additive local writes ────────────────────────────────────────
  // All three create new blocks. Nothing the user wrote is touched, so if the
  // draft is wrong the user simply deletes it by hand.
  createDocument: t('write-local'),
  appendBlocks: t('write-local'),
  insertBlocksAt: t('write-local'),

  // ── The only gated call ────────────────────────────────────────────────────
  // replaceBlock overwrites an existing block, so whatever the user (or an
  // earlier turn) wrote there is gone unless they approved this call. Derived
  // `destructive` => `user-approval`, which the UI renders as Approve/Deny.
  replaceBlock: t('destructive'),
};

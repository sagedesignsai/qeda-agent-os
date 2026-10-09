/**
 * components/documents/DocumentsWelcome.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The empty state for `/documents`: a centred composer as the primary action,
 * with the template catalogue beneath it as scaffolding rather than as a
 * gallery that outranks the user's own work.
 *
 * WHY THIS SHAPE
 * This used to open with a marketing hero ("Document Composer & Studio") and
 * then put the product's templates ahead of the user's documents, so a
 * returning user had to scroll past a sales pitch to reach their own work —
 * which was demoted to six 12px rows under a `text-xs uppercase` label. The
 * app's own AI-first precedent is the chat empty state
 * (`components/chat/ChatWelcome.tsx`), where the composer IS the page. This
 * mirrors that: one input, centred, with quick-start affordances below it.
 *
 * Templates are deliberately NOT click-to-create. That was the old behaviour
 * and it had two problems — a bare click created a document with no
 * confirmation, and the async create had no in-flight guard, so a double-click
 * produced two documents. Here a template click *seeds the composer* with the
 * shape of document you picked, and you send it. The draft is then built by
 * the Document Drafter, which is the AI-first story: you describe the document
 * you want, the agent writes it.
 *
 * Recent documents are NOT here. They live in the sidebar
 * (`components/sidebar/DocumentsMenu.tsx`), which lists all of them with
 * search, rename and delete — duplicating a capped slice of that list on the
 * landing page was a dead end that also double-fetched the same query.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  FileTextIcon,
  Loader2Icon,
  ReceiptIcon,
  TerminalIcon,
  UserCheckIcon,
  PlusIcon,
} from 'lucide-react';
import { ChatInput } from '@/components/chat/ChatInput';
import { DOCUMENT_TEMPLATES } from '@/lib/pdf-studio/templates';

interface DocumentsWelcomeProps {
  /** Called with the user's prompt (or a template-seeded prompt) to draft. */
  onDraft: (prompt: string) => void;
  loading: boolean;
  /** True when the fetch has settled and there genuinely are no documents. */
  isEmpty: boolean;
}

/**
 * Per-template icon.
 *
 * Copied in shape from `TemplatePickerModal.tsx:36-49`, which is the richer of
 * the two existing treatments — the old inline grid on this page dropped the
 * icons entirely. These are lucide glyphs, not bespoke SVG illustrations; the
 * catalogue has no artwork of its own and inventing placeholder illustrations
 * would misrepresent what the templates look like.
 */
function getTemplateIcon(id: string) {
  switch (id) {
    case 'executive-proposal':
      return FileTextIcon;
    case 'professional-invoice':
      return ReceiptIcon;
    case 'modern-resume':
      return UserCheckIcon;
    case 'technical-spec':
      return TerminalIcon;
    default:
      return PlusIcon;
  }
}

/**
 * Seed a prompt from a template. The template fixes the *shape*; the user
 * still supplies the substance, which is what makes the result useful rather
 * than a generic form letter.
 */
function promptForTemplate(name: string, category: string): string {
  return `Draft a ${name.toLowerCase()} (${category}). Ask me for any details you need, then write it out as a complete document.`;
}

export function DocumentsWelcome({
  onDraft,
  loading,
  isEmpty,
}: DocumentsWelcomeProps) {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center px-4 pb-16">
      <h2 className="text-balance text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        What would you like written?
      </h2>
      <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
        Describe the document and Qeda will draft it. You review every word
        before it goes anywhere.
      </p>

      {/* Composer — the single primary action, mirroring ChatWelcome. */}
      <div className="mt-6 w-full max-w-2xl">
        <ChatInput
          onSend={onDraft}
          tall
          placeholder="Draft a letter of demand, a proposal, a client memo…"
        />
      </div>

      {/* Templates seed the composer instead of creating a document outright,
          so nothing is produced until you ask for it. */}
      <div className="mt-8 w-full max-w-5xl">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Start from a template
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {DOCUMENT_TEMPLATES.map((tmpl) => {
            const Icon = getTemplateIcon(tmpl.id);
            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() =>
                  onDraft(promptForTemplate(tmpl.name, tmpl.category))
                }
                className="group flex flex-col items-start rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 cursor-pointer"
              >
                <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex w-full items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                    {tmpl.name}
                  </h4>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {tmpl.category}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {tmpl.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading and empty are told apart deliberately. Previously `loading` was
          never read, so "fetching", "IPC failed" and "you have none" all
          rendered the same confident marketing hero — a user whose fetch broke
          was told they had no documents. */}
      {loading && (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          <span>Loading your documents…</span>
        </div>
      )}

      {!loading && isEmpty && (
        <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
          No documents yet. Describe one above, or pick a template — your drafts
          appear in the sidebar as you work.
        </p>
      )}
    </div>
  );
}

/**
 * components/correspondence/CorrespondenceEmpty.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The first-run state for `/correspondence` — shown only when the registry is
 * *globally* empty, not merely empty in the current project scope.
 *
 * WHY THAT DISTINCTION MATTERS
 * "Nobody to write to yet" is a fact about a new install. A scoped view of a
 * populated registry is a different thing entirely ("nothing filed under this
 * project"), and showing a first-run hero there would tell a user with 40 contacts
 * that they have none. Scoped emptiness is handled inside `ContactList`.
 *
 * WHY THERE IS NO "ADD CONTACT" FORM HERE
 * A correspondence system is adopted by falling into it from work you already did.
 * So the primary door is Harvest — point at a page, a document or pasted text and
 * the organisations come back for review — and the manual form exists one click
 * deeper, where a user who actually wants it will look. The first screen never
 * asks for 147 cells of typing.
 *
 * Spreadsheet import is deliberately shown as not-yet rather than as a button that
 * does nothing: the honest label costs one word and keeps the whole screen
 * trustworthy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router';
import {
  ClipboardPasteIcon,
  FileTextIcon,
  NotebookIcon,
  SendIcon,
  SheetIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item';
import { RecipientLanePreview } from './RecipientLanePreview';

export interface CorrespondenceEmptyProps {
  /**
   * Open Harvest. `door` selects which source step it lands on, so the "paste a
   * list" entry point does not open on a page picker the user did not ask for.
   */
  onHarvest: (door?: 'page' | 'document' | 'text') => void;
}

export function CorrespondenceEmpty({ onHarvest }: CorrespondenceEmptyProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-10">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SendIcon />
          </EmptyMedia>
          <EmptyTitle>Nobody to write to yet</EmptyTitle>
          <EmptyDescription>
            Correspondence tracks what you send out and what has not come back:
            one message, many recipients, each on its own clock — including the
            ones you send by phone or post.
          </EmptyDescription>
        </EmptyHeader>

        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onHarvest('page')}
            >
              <NotebookIcon className="size-3.5" />
              Harvest from a notebook
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => onHarvest('text')}
            >
              <ClipboardPasteIcon className="size-3.5" />
              Paste a list
            </Button>
          </div>
        </EmptyContent>
      </Empty>

      <RecipientLanePreview />

      <section
        aria-label="How contacts will be added"
        className="hidden w-full max-w-3xl gap-2 md:grid md:grid-cols-3"
      >
        <button
          type="button"
          onClick={() => onHarvest('page')}
          className="text-left"
        >
          <Item
            variant="outline"
            size="sm"
            className="h-full flex-col items-start gap-1.5 transition-colors hover:bg-muted/50"
          >
            <NotebookIcon className="size-4" />
            <ItemContent className="gap-0.5">
              <ItemTitle className="text-xs">
                Harvest what you already have
              </ItemTitle>
              <ItemDescription className="text-[11px] leading-snug">
                A notebook page or document becomes a reviewed contact list.
              </ItemDescription>
            </ItemContent>
          </Item>
        </button>

        <button
          type="button"
          onClick={() => onHarvest('text')}
          className="text-left"
        >
          <Item
            variant="outline"
            size="sm"
            className="h-full flex-col items-start gap-1.5 transition-colors hover:bg-muted/50"
          >
            <ClipboardPasteIcon className="size-4" />
            <ItemContent className="gap-0.5">
              <ItemTitle className="text-xs">Paste a list</ItemTitle>
              <ItemDescription className="text-[11px] leading-snug">
                Paste names and addresses from anywhere you typed them.
              </ItemDescription>
            </ItemContent>
          </Item>
        </button>

        {/* Not yet built, and labelled as such instead of failing silently. */}
        <Item
          variant="outline"
          size="sm"
          className="h-full flex-col items-start gap-1.5 opacity-60"
        >
          <SheetIcon className="size-4 text-muted-foreground" />
          <ItemContent className="gap-0.5">
            <ItemTitle className="flex items-center gap-1.5 text-xs">
              Import a spreadsheet
              <Badge variant="outline" className="text-[10px]">
                Later
              </Badge>
            </ItemTitle>
            <ItemDescription className="text-[11px] leading-snug">
              For a contact sheet you already keep elsewhere.
            </ItemDescription>
          </ItemContent>
        </Item>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Or{' '}
        <Link to="/workspace" className="underline underline-offset-4">
          open a notebook
        </Link>{' '}
        and see what Harvest would read from it.
      </p>
    </div>
  );
}

/**
 * renderer/pages/Correspondence.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The `/correspondence` route view — Qeda's ninth system, and the only one that is
 * contact-centric rather than project-, task- or document-centric.
 *
 * INFORMATION ARCHITECTURE
 * Two surfaces and one creation verb:
 *
 *   Board     everything waiting on the user, the rail, and the sent record — the
 *             default, because it is the only screen that answers a question the
 *             user actually has.
 *   Contacts  the registry, with verification per channel — opened deliberately,
 *             not as a landing page.
 *   Compose   the single "new item" affordance, in the header.
 *
 * First run is decided from the UNscoped contact count, because "nobody to write to
 * yet" is a fact about a new install; a project-scoped view of a populated registry
 * must not claim it. The page itself owns no data beyond that count and no contact
 * or message state at all — the write path stays single: components → main → SQLite
 * → `correspondence:changed` → the resource hooks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, type PageCrumb } from '@/components/PageHeader';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { AttentionBoard } from '@/components/correspondence/AttentionBoard';
import { ContactList } from '@/components/correspondence/ContactList';
import { CorrespondenceEmpty } from '@/components/correspondence/CorrespondenceEmpty';
import { HarvestSheet } from '@/components/correspondence/HarvestSheet';
import { MessageComposer } from '@/components/correspondence/MessageComposer';
import { cn } from '@/lib/utils';
import { useProjectScope } from '@/hooks/use-project-scope';
import {
  useCorrespondenceCounts,
  useMessageCounts,
} from '@/hooks/use-correspondence';

type HarvestDoor = 'page' | 'document' | 'text';
type Surface = 'board' | 'contacts';

export default function Correspondence() {
  const { projectId, activeProjectName, clear: clearProjectScope } =
    useProjectScope();

  const [surface, setSurface] = useState<Surface>('board');
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [harvestDoor, setHarvestDoor] = useState<HarvestDoor>('page');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDoc, setComposeDoc] = useState<string | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  // Unscoped on purpose — see the banner. The scoped lens is applied inside each
  // surface, where an empty scope has its own, quieter answer.
  const registry = useCorrespondenceCounts(null);
  const counts = useMessageCounts(projectId);
  const isFirstRun = !registry.loading && (registry.data?.contacts ?? 0) === 0;

  const crumbs: PageCrumb[] = [{ label: 'Correspondence' }];

  const openHarvest = (door: HarvestDoor = 'page') => {
    setHarvestDoor(door);
    setHarvestOpen(true);
  };

  /** Compose from scratch — the header button, or a board's own affordance. */
  const openCompose = () => {
    setComposeDoc(null);
    setComposeSubject('');
    setComposeOpen(true);
  };

  // A document's "Send this…" arrives as `?document=<id>&project=<id>`. The project
  // is already applied by the scope hook; the document is handed to the composer and
  // then dropped from the URL, so closing and reopening Compose later does not
  // silently re-attach the same document.
  const documentParam = searchParams.get('document');
  const subjectParam = searchParams.get('subject') ?? '';
  useEffect(() => {
    if (!documentParam) return;
    setComposeDoc(documentParam);
    setComposeSubject(subjectParam);
    setComposeOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('document');
    next.delete('subject');
    setSearchParams(next, { replace: true });
  }, [documentParam, subjectParam, searchParams, setSearchParams]);

  const subtitle = isFirstRun
    ? undefined
    : counts.counts
      ? `${counts.counts.awaiting} awaiting · ${counts.counts.overdue} past date`
      : undefined;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <PageHeader
        crumbs={crumbs}
        subtitle={subtitle}
        nav={
          isFirstRun ? undefined : (
            <div className="flex items-center gap-0.5">
              <SurfaceButton
                label="Board"
                active={surface === 'board'}
                onClick={() => setSurface('board')}
              />
              <SurfaceButton
                label="Contacts"
                active={surface === 'contacts'}
                onClick={() => setSurface('contacts')}
              />
            </div>
          )
        }
        meta={
          <ProjectScopeChip
            name={activeProjectName}
            onClear={clearProjectScope}
          />
        }
        actions={
          isFirstRun ? undefined : (
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
              onClick={openCompose}
            >
              <SendIcon className="size-3.5" />
              Compose
            </Button>
          )
        }
      />

      {isFirstRun ? (
        <CorrespondenceEmpty onHarvest={openHarvest} />
      ) : surface === 'board' ? (
        <AttentionBoard projectId={projectId} onCompose={openCompose} />
      ) : (
        <ContactList projectId={projectId} onHarvest={() => openHarvest('page')} />
      )}

      {/* Both stay mounted while closed so they keep their exit transitions. The
          per-open reset lives inside each of them. */}
      <HarvestSheet
        open={harvestOpen}
        onOpenChange={setHarvestOpen}
        projectId={projectId}
        initialDoor={harvestDoor}
      />

      <MessageComposer
        open={composeOpen}
        onOpenChange={setComposeOpen}
        projectId={projectId}
        initialDocumentId={composeDoc}
        initialSubject={composeSubject}
      />
    </div>
  );
}

/** One segment of the two-surface switcher in the header. */
function SurfaceButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className={cn(
        'h-6 px-2 text-[11px]',
        !active && 'text-muted-foreground',
      )}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Button>
  );
}

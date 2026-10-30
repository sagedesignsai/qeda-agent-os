/**
 * renderer/pages/Motion.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Route /motion — the product-showcase motion studio.
 *
 * The page owns app-level navigation and keyboard shortcuts. The editor shell
 * composes the scene panel, preview, timeline and inspector.
 *
 * Keyboard shortcuts live here rather than in the timeline kit: the kit is
 * reusable and must not claim global keys on whatever surface mounts it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { Redo2Icon, Undo2Icon } from 'lucide-react';

import { MotionEditor } from '@/components/motion/MotionEditor';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';

export default function Motion() {
  const { doc, canUndo, canRedo } = useMotionSnapshot();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;

      if (event.code === 'Space') {
        event.preventDefault();
        motionStore.togglePlay();
        return;
      }
      if (modifier && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) motionStore.redo();
        else motionStore.undo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        crumbs={[{ label: 'Motion', to: '/motion' }]}
        meta={
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {doc.meta.name}
          </span>
        }
        actions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={() => motionStore.undo()}
            >
              <Undo2Icon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={() => motionStore.redo()}
            >
              <Redo2Icon className="size-3.5" />
            </Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <MotionEditor />
      </div>
    </div>
  );
}

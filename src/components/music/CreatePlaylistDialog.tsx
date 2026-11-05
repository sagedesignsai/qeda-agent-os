/**
 * components/music/CreatePlaylistDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dialog for creating a new playlist with a name input.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Loader2Icon } from 'lucide-react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface CreatePlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}

function CreatePlaylistDialogImpl({
  open,
  onOpenChange,
  onCreate,
}: CreatePlaylistDialogProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreate(name);
      setName('');
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New playlist</DialogTitle>
          <DialogDescription>
            Give it a name now; add tracks from the library afterwards.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Playlist name"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleCreate();
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
          >
            {creating && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const CreatePlaylistDialog = memo(CreatePlaylistDialogImpl);

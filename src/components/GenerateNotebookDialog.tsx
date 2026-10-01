/**
 * components/GenerateNotebookDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured kickoff for notebook generation. The user gives a topic (plus an
 * optional audience and scope), and this dialog creates a chat session and
 * navigates to it with an `initialPrompt` that turns on the agent's
 * notebook-generation protocol: plan an outline, research each section,
 * build an overview page with nested section pages, cite sources inline and
 * finish with a Sources page.
 *
 * A context exposes `open()` so the command palette and the welcome screen can
 * launch it without prop drilling through the route tree.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NotebookPenIcon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { buildNotebookPrompt, type NotebookDepth } from '@/lib/notebook-prompt';

interface GenerateNotebookContextValue {
  open: () => void;
}

const GenerateNotebookContext =
  createContext<GenerateNotebookContextValue | null>(null);

/** Open the notebook generation dialog from anywhere below the provider. */
export function useGenerateNotebook(): GenerateNotebookContextValue {
  const ctx = useContext(GenerateNotebookContext);
  if (!ctx) {
    throw new Error(
      'useGenerateNotebook must be used within a GenerateNotebookProvider.',
    );
  }
  return ctx;
}

export function GenerateNotebookProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const value = useMemo<GenerateNotebookContextValue>(
    () => ({ open: () => setOpen(true) }),
    [],
  );
  return (
    <GenerateNotebookContext.Provider value={value}>
      {children}
      <GenerateNotebookDialog open={open} onOpenChange={setOpen} />
    </GenerateNotebookContext.Provider>
  );
}

interface GenerateNotebookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateNotebookDialog({
  open,
  onOpenChange,
}: GenerateNotebookDialogProps) {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [depth, setDepth] = useState<NotebookDepth>('standard');
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setTopic('');
    setAudience('');
    setDepth('standard');
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleGenerate = async () => {
    const trimmed = topic.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const session = await window.electron.ipc.invoke<{ id: string }>(
        'sessions:create',
        {
          title: trimmed.slice(0, 40),
        },
      );
      const prompt = buildNotebookPrompt({ topic: trimmed, depth, audience });
      reset();
      onOpenChange(false);
      // `intent` is declared rather than inferred. The agent used to pick
      // notebook mode by regex-matching the prompt text above, which made this
      // one string a single point of failure — reword it and the whole
      // generation protocol silently never fires.
      navigate(`/chat/${session.id}`, {
        state: { initialPrompt: prompt, intent: 'notebook' as const },
      });
    } catch (err) {
      toast.error(
        `Failed to start notebook generation: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPenIcon className="h-4 w-4 text-primary" />
            Generate a notebook
          </DialogTitle>
          <DialogDescription>
            Vellum researches your topic, then builds a notebook with an
            overview page and one nested page per section — with sources cited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="gn-topic">Topic</Label>
            <Textarea
              id="gn-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Integrating the Jules API into a VS Code extension, or Building a 2.5D platformer in Godot"
              className="min-h-[72px] resize-none text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gn-depth">Scope</Label>
              <Select
                value={depth}
                onValueChange={(v) => setDepth(v as NotebookDepth)}
              >
                <SelectTrigger id="gn-depth" className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick — 3–4 sections</SelectItem>
                  <SelectItem value="standard">
                    Standard — 5–7 sections
                  </SelectItem>
                  <SelectItem value="deep">Deep — 8–12 sections</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gn-audience">Audience (optional)</Label>
              <Input
                id="gn-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. beginner, senior engineer"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={busy || !topic.trim()}
            className="gap-1.5"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            {busy ? 'Starting…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export function ComputerUseView() {
  const [enabled, setEnabled] = useState(false);
  const [allowed, setAllowed] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electron.ipc
      .invoke<{ computerUse?: { enabled?: boolean; allowedWindows?: string[] } }>(
        'settings:get',
      )
      .then((s) => {
        if (cancelled) return;
        setEnabled(Boolean(s?.computerUse?.enabled));
        setAllowed((s?.computerUse?.allowedWindows ?? []).join('\n'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await window.electron.ipc.invoke('settings:save', {
        computerUse: {
          enabled,
          allowedWindows: allowed
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      toast.success('Computer use settings saved');
    } catch (err) {
      toast.error('Failed to save: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Label>Enable computer use</Label>
          <p className="text-xs text-muted-foreground">
            Allow agents to capture screenshots and drive mouse/keyboard input.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-1">
        <Label>Allowed windows (one substring per line)</Label>
        <Textarea
          value={allowed}
          onChange={(e) => setAllowed(e.target.value)}
          placeholder="Showcase Studio\nMy App"
          className="min-h-24"
        />
        <p className="text-xs text-muted-foreground">
          Actions are rejected unless the foreground window title contains one of
          these substrings.
        </p>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

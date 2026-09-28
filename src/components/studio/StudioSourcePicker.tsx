/**
 * components/studio/StudioSourcePicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog for selecting screen or application window capture targets.
 * Includes live thumbnail previews, microphone toggle, and 3-second countdown.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import {
  MonitorIcon,
  AppWindowIcon,
  MicIcon,
  MicOffIcon,
  VideoIcon,
  Loader2Icon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { CaptureSource } from '@/hooks/use-studio';

interface StudioSourcePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSource: (source: {
    sourceId: string;
    sourceName: string;
    includeMic: boolean;
  }) => void;
  onListSources: () => Promise<CaptureSource[]>;
}

export function StudioSourcePicker({
  open,
  onOpenChange,
  onSelectSource,
  onListSources,
}: StudioSourcePickerProps) {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeMic, setIncludeMic] = useState(true);
  const [selectedSource, setSelectedSource] = useState<CaptureSource | null>(
    null,
  );
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      setSelectedSource(null);
      setCountdown(null);
      setLoading(true);

      try {
        const res = await onListSources();
        if (!cancelled) {
          setSources(res || []);
          if (res && res.length > 0) {
            setSelectedSource(res[0]);
          }
        }
      } catch {
        if (!cancelled) {
          setSources([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, onListSources]);

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => !s.id.startsWith('screen:'));

  const handleStartWithCountdown = () => {
    if (!selectedSource) return;

    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          onOpenChange(false);
          onSelectSource({
            sourceId: selectedSource.id,
            sourceName: selectedSource.name,
            includeMic,
          });
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <VideoIcon className="w-5 h-5 text-primary" />
            Select Showcase Capture Target
          </DialogTitle>
          <DialogDescription>
            Choose an entire display or a specific application window to record.
          </DialogDescription>
        </DialogHeader>

        {countdown !== null ? (
          <div className="py-16 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
            <div className="w-24 h-24 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-5xl font-mono font-bold text-primary animate-pulse shadow-2xl">
              {countdown}
            </div>
            <p className="mt-6 text-sm text-muted-foreground font-medium">
              Get ready to showcase {selectedSource?.name}...
            </p>
          </div>
        ) : loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2Icon className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Scanning desktop and window sources...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <Tabs defaultValue="screens" className="w-full">
              <TabsList className="grid grid-cols-2 w-full bg-secondary/60">
                <TabsTrigger value="screens" className="text-xs">
                  <MonitorIcon className="w-3.5 h-3.5 mr-1.5" />
                  Entire Screens ({screens.length})
                </TabsTrigger>
                <TabsTrigger value="windows" className="text-xs">
                  <AppWindowIcon className="w-3.5 h-3.5 mr-1.5" />
                  App Windows ({windows.length})
                </TabsTrigger>
              </TabsList>

              {/* Screens Grid */}
              <TabsContent value="screens" className="mt-3">
                <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1">
                  {screens.map((source) => {
                    const isSelected = selectedSource?.id === source.id;
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => setSelectedSource(source)}
                        className={`group relative flex flex-col rounded-lg border p-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                            : 'border-border/50 hover:border-border hover:bg-secondary/40'
                        }`}
                      >
                        <div className="aspect-video w-full overflow-hidden rounded bg-black/40 mb-2 border border-border/30">
                          <img
                            src={source.thumbnailDataUrl}
                            alt={source.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <span className="text-xs font-medium truncate w-full">
                          {source.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Windows Grid */}
              <TabsContent value="windows" className="mt-3">
                <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1">
                  {windows.map((source) => {
                    const isSelected = selectedSource?.id === source.id;
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => setSelectedSource(source)}
                        className={`group relative flex flex-col rounded-lg border p-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                            : 'border-border/50 hover:border-border hover:bg-secondary/40'
                        }`}
                      >
                        <div className="aspect-video w-full overflow-hidden rounded bg-black/40 mb-2 border border-border/30">
                          <img
                            src={source.thumbnailDataUrl}
                            alt={source.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <span className="text-xs font-medium truncate w-full">
                          {source.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>

            {/* Options Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <div className="flex items-center gap-2">
                <Switch
                  id="mic-toggle"
                  checked={includeMic}
                  onCheckedChange={setIncludeMic}
                />
                <Label
                  htmlFor="mic-toggle"
                  className="text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {includeMic ? (
                    <MicIcon className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <MicOffIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  {includeMic
                    ? 'Record Microphone Audio'
                    : 'Silent Recording (AI Voiceover)'}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                  onClick={handleStartWithCountdown}
                  disabled={!selectedSource}
                >
                  <VideoIcon className="w-4 h-4" />
                  Start Recording
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

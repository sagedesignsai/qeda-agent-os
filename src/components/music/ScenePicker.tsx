/**
 * components/music/ScenePicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Scenes are the product-level unit: "rain room", "deep work", "late night".
 *
 * Built-ins are code (`lib/music/scenes.ts`) and cannot be edited; user scenes
 * live in SQLite and can be renamed or deleted. Merging them here — instead of
 * seeding built-ins into the DB — means a new built-in arrives with an app
 * update rather than a migration.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2Icon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useIpcEvent } from '@/hooks/use-ipc';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { useSoundscape } from '@/hooks/use-soundscape';
import { useMusicStore } from '@/stores/music-store';
import { SOUNDSCAPE_LAYERS } from '@/lib/soundscape/layers';
import { BUILTIN_SCENES, DEFAULT_SCENE } from '@/lib/music/scenes';
import { fetchSceneTracks } from '@/lib/music/scene-tracks';
import type {
  AudioSceneConfig,
  MusicPlaylist,
  MusicScene,
  SoundscapeLayerId,
} from '@/lib/music/types';

type MusicMode = 'none' | 'library' | 'playlist';

export interface ScenePickerProps {
  className?: string;
  /** Applied after `setScene`; the Music page uses it to start playback. */
  onApply?: (scene: MusicScene) => void;
  compact?: boolean;
}

function sceneAccent(scene: MusicScene): string {
  const layers = Object.keys(scene.config.soundscape.layers) as SoundscapeLayerId[];
  if (layers.includes('thunder') || layers.includes('heavy_rain')) return 'from-indigo-500/25 to-slate-900/60';
  if (layers.includes('forest') || layers.includes('forest_after_rain')) return 'from-emerald-500/25 to-slate-900/60';
  if (layers.includes('waves')) return 'from-sky-500/25 to-slate-900/60';
  return 'from-primary/20 to-slate-900/60';
}

function describe(scene: MusicScene): string {
  const layers = Object.keys(scene.config.soundscape.layers) as SoundscapeLayerId[];
  const names = layers
    .slice(0, 3)
    .map((id) => SOUNDSCAPE_LAYERS[id]?.label ?? id);
  if (scene.config.soundscape.noise) {
    names.push(`${scene.config.soundscape.noise} noise`);
  }
  if (names.length === 0) names.push('Silent');
  if (scene.config.music) names.push('music');
  return names.join(' · ');
}

export function ScenePicker({ className, onApply, compact }: ScenePickerProps) {
  const [userScenes, setUserScenes] = useState<MusicScene[]>([]);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('My scene');
  const [musicMode, setMusicMode] = useState<MusicMode>('none');
  const [musicPlaylistId, setMusicPlaylistId] = useState<string>('');

  const { state, sceneId, setScene, start } = useSoundscape();
  const { crossfadeSec, duckDb, setCrossfadeSec, setDuckDb } = useMusicPlayer();

  const load = useCallback(async () => {
    try {
      const rows = await window.electron.ipc.invoke<MusicScene[]>(
        'music:scenes-list',
      );
      setUserScenes(rows ?? []);
    } catch {
      /* scenes are best-effort */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      setPlaylists(
        await window.electron.ipc.invoke<MusicPlaylist[]>(
          'music:playlists-list',
        ),
      );
    } catch {
      /* the playlist source is optional */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPlaylists();
  }, [load, loadPlaylists]);
  useIpcEvent('music:changed', () => {
    void load();
    void loadPlaylists();
  });

  const scenes = useMemo(
    () => [...BUILTIN_SCENES, ...userScenes],
    [userScenes],
  );

  const apply = async (scene: MusicScene) => {
    setScene(scene.id, scene.config.soundscape);
    setCrossfadeSec(scene.config.crossfadeSec);
    setDuckDb(scene.config.duckDb);
    // Applying a scene is an explicit user gesture, so starting the ambience
    // here satisfies the autoplay policy as well as matching expectation.
    await start(scene.config.soundscape);

    // A scene with a music source is a ritual, not just a mix: start it unless
    // the user is already listening to something they chose.
    const source = scene.config.music;
    if (source && !useMusicStore.getState().playing) {
      try {
        const tracks = await fetchSceneTracks(source);
        if (tracks.length > 0) {
          await useMusicStore.getState().playTracks(tracks, 0);
        }
      } catch {
        /* an empty library is not an error */
      }
    }
    onApply?.(scene);
  };

  const saveCurrent = async () => {
    setSaving(true);
    try {
      const music: AudioSceneConfig['music'] =
        musicMode === 'library'
          ? { source: 'library', shuffle: true }
          : musicMode === 'playlist' && musicPlaylistId
            ? { source: 'playlist', id: musicPlaylistId, shuffle: true }
            : null;
      const scene = await window.electron.ipc.invoke<MusicScene>(
        'music:scene-save',
        {
          name: name.trim() || 'My scene',
          config: {
            soundscape: state,
            music,
            crossfadeSec,
            duckDb,
          },
        },
      );
      setUserScenes((prev) => [scene, ...prev]);
      setSaveOpen(false);
      toast.success(`Saved “${scene.name}”`);
    } catch {
      toast.error('Could not save the scene');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await window.electron.ipc.invoke('music:scene-delete', { id });
      setUserScenes((prev) => prev.filter((scene) => scene.id !== id));
    } catch {
      toast.error('Could not delete the scene');
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Scenes
          </p>
        </div>
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 rounded-full px-2.5 text-[11px]">
              <PlusIcon className="size-3" /> Save current
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Save the current mix</DialogTitle>
              <DialogDescription>
                Stores the soundscape, crossfade and ducking settings as a
                reusable scene.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Scene name"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveCurrent();
              }}
            />

            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-foreground">
                Music for this scene
              </p>
              <Select
                value={musicMode}
                onValueChange={(value) => setMusicMode(value as MusicMode)}
              >
                <SelectTrigger size="sm" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">
                    Ambience only
                  </SelectItem>
                  <SelectItem value="library" className="text-xs">
                    Shuffle the whole library
                  </SelectItem>
                  <SelectItem value="playlist" className="text-xs">
                    A playlist
                  </SelectItem>
                </SelectContent>
              </Select>
              {musicMode === 'playlist' && (
                <Select
                  value={musicPlaylistId}
                  onValueChange={setMusicPlaylistId}
                >
                  <SelectTrigger size="sm" className="text-xs">
                    <SelectValue placeholder="Choose a playlist" />
                  </SelectTrigger>
                  <SelectContent>
                    {playlists.length === 0 && (
                      <SelectItem value="none" disabled className="text-xs">
                        No playlists yet
                      </SelectItem>
                    )}
                    {playlists.map((playlist) => (
                      <SelectItem
                        key={playlist.id}
                        value={playlist.id}
                        className="text-xs"
                      >
                        {playlist.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[10px] text-muted-foreground">
                Starting a work phase starts this music. The soundscape keeps
                playing through breaks.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void saveCurrent()} disabled={saving}>
                {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                Save scene
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className={cn(compact ? 'max-h-72' : 'max-h-[26rem]')}>
        <div className={cn('grid gap-2 pr-2', compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')}>
          {loading && (
            <p className="px-1 py-4 text-xs text-muted-foreground">
              Loading scenes…
            </p>
          )}
          {scenes.map((scene) => {
            const active = scene.id === sceneId || (!sceneId && scene.id === DEFAULT_SCENE.id);
            return (
              <div
                key={scene.id}
                className={cn(
                  'group relative overflow-hidden rounded-xl border p-3 transition-all',
                  active
                    ? 'border-primary/60 shadow-sm ring-1 ring-primary/20'
                    : 'border-border/50 hover:border-border',
                )}
              >
                <div
                  className={cn(
                    'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80',
                    sceneAccent(scene),
                  )}
                />
                <div className="relative flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {scene.name}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {describe(scene)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {scene.builtin ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[9px] uppercase">
                          Built-in
                        </Badge>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                          onClick={() => void remove(scene.id)}
                          aria-label={`Delete ${scene.name}`}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {scene.config.crossfadeSec}s fade · {scene.config.duckDb} dB duck
                    </span>
                    <Button
                      size="sm"
                      variant={active ? 'secondary' : 'default'}
                      className="h-6 rounded-full px-2.5 text-[10px]"
                      onClick={() => void apply(scene)}
                    >
                      {active ? 'Reapply' : 'Apply'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * components/studio/plugins/StudioPluginsModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog for inspecting, configuring, and applying Showcase Studio Motion Plugins:
 *   1. Device Mockup Frame Plugin (Browser, MacBook, iPhone, Glass)
 *   2. Intro & Outro Motion Cards Plugin (Title, Subtitle, CTA Badge, Presets)
 *   3. Lower Thirds & Feature Badges Plugin
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  MonitorIcon,
  FilmIcon,
  SparklesIcon,
  XIcon,
  CheckIcon,
  SlidersIcon,
  LayersIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  StudioStyling,
  DeviceFrameType,
  StudioDeviceFrame,
  StudioMotionCard,
} from '@/lib/studio-types';
import { BUILTIN_STUDIO_PLUGINS } from './StudioPluginRegistry';

interface StudioPluginsModalProps {
  open: boolean;
  styling: StudioStyling;
  onOpenChange: (open: boolean) => void;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
}

export function StudioPluginsModal({
  open,
  styling,
  onOpenChange,
  onUpdateStyling,
}: StudioPluginsModalProps) {
  const [activeTab, setActiveTab] = useState<string>('plugin-device-frames');

  // Local state for Device Frame Plugin
  const [deviceFrame, setDeviceFrame] = useState<StudioDeviceFrame>(
    styling.deviceFrame || {
      type: 'browser',
      title: 'Showcase Demo',
      url: 'https://qeda.app',
      theme: 'dark',
      showControls: true,
    },
  );

  // Local state for Intro Card Plugin
  const [introCard, setIntroCard] = useState<StudioMotionCard>(
    styling.introCard || {
      enabled: true,
      title: 'Product Walkthrough',
      subtitle: 'Built with Qeda Studio',
      badge: 'NEW RELEASE',
      durationMs: 3000,
      preset: 'minimal',
    },
  );

  // Local state for Outro Card Plugin
  const [outroCard, setOutroCard] = useState<StudioMotionCard>(
    styling.outroCard || {
      enabled: true,
      title: 'Try Qeda Today',
      subtitle: 'qeda.app • Open Source Agent OS',
      badge: 'GET STARTED',
      durationMs: 3000,
      preset: 'gradient',
    },
  );

  const handleApplyDeviceFrame = () => {
    onUpdateStyling({ deviceFrame });
    onOpenChange(false);
  };

  const handleApplyMotionCards = () => {
    onUpdateStyling({ introCard, outroCard });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-card border-border/80 text-card-foreground p-0 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-border/60 bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <SlidersIcon className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Showcase Motion Studio Plugins
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Extensible dialog plugins for device frame mockups, motion intros, and overlays.
              </DialogDescription>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase">
            3 Plugins Active
          </Badge>
        </div>

        {/* Plugin Tabs */}
        <div className="p-5">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full bg-muted/40 p-1 rounded-xl">
              <TabsTrigger
                value="plugin-device-frames"
                className="text-xs font-medium flex items-center gap-2 cursor-pointer"
              >
                <MonitorIcon className="w-3.5 h-3.5 text-primary" />
                <span>Device Mockup Frame</span>
              </TabsTrigger>
              <TabsTrigger
                value="plugin-intro-outro"
                className="text-xs font-medium flex items-center gap-2 cursor-pointer"
              >
                <FilmIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Intro & Outro Cards</span>
              </TabsTrigger>
              <TabsTrigger
                value="plugin-kinetic-callout"
                className="text-xs font-medium flex items-center gap-2 cursor-pointer"
              >
                <SparklesIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Badges & Lower Thirds</span>
              </TabsTrigger>
            </TabsList>

            {/* Content: Device Mockup Frame Plugin */}
            <TabsContent value="plugin-device-frames" className="mt-4 space-y-4">
              <div className="p-4 rounded-xl border border-border/60 bg-muted/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MonitorIcon className="w-4 h-4 text-primary" />
                    <h4 className="text-xs font-semibold text-foreground">
                      SVG Device Mockup Frame
                    </h4>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    v1.2.0
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      Frame Model
                    </Label>
                    <Select
                      value={deviceFrame.type}
                      onValueChange={(val: DeviceFrameType) =>
                        setDeviceFrame({ ...deviceFrame, type: val })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Standard Window)</SelectItem>
                        <SelectItem value="browser">Browser Window (Chrome / Safari)</SelectItem>
                        <SelectItem value="macbook">MacBook Laptop Bezel & Notch</SelectItem>
                        <SelectItem value="iphone">iPhone Mobile Frame & Island</SelectItem>
                        <SelectItem value="minimal-svg">Minimal SVG Line Frame</SelectItem>
                        <SelectItem value="glass">Frosted Glass Specular Frame</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      Color Theme
                    </Label>
                    <Select
                      value={deviceFrame.theme || 'dark'}
                      onValueChange={(val: 'dark' | 'light' | 'accent') =>
                        setDeviceFrame({ ...deviceFrame, theme: val })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark Slate</SelectItem>
                        <SelectItem value="light">Light Slate</SelectItem>
                        <SelectItem value="accent">Indigo Glass</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {deviceFrame.type === 'browser' && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Address Bar URL
                        </Label>
                        <Input
                          value={deviceFrame.url || ''}
                          placeholder="https://qeda.app"
                          onChange={(e) =>
                            setDeviceFrame({ ...deviceFrame, url: e.target.value })
                          }
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Window Title
                        </Label>
                        <Input
                          value={deviceFrame.title || ''}
                          placeholder="Showcase Demo"
                          onChange={(e) =>
                            setDeviceFrame({ ...deviceFrame, title: e.target.value })
                          }
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-border/40">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyDeviceFrame}
                    className="h-8 text-xs font-medium cursor-pointer"
                  >
                    <CheckIcon className="w-3.5 h-3.5 mr-1.5" />
                    Apply Device Frame Plugin
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Content: Intro & Outro Motion Plugin */}
            <TabsContent value="plugin-intro-outro" className="mt-4 space-y-4">
              <div className="p-4 rounded-xl border border-border/60 bg-muted/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FilmIcon className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-semibold text-foreground">
                      Intro & Outro Title Cards
                    </h4>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    v1.1.0
                  </Badge>
                </div>

                {/* Intro Card Config */}
                <div className="p-3 rounded-lg border border-border/50 bg-background/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LayersIcon className="w-3.5 h-3.5 text-primary" />
                      Intro Motion Card
                    </Label>
                    <Button
                      type="button"
                      variant={introCard.enabled ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 text-[10px] px-2 cursor-pointer"
                      onClick={() =>
                        setIntroCard({ ...introCard, enabled: !introCard.enabled })
                      }
                    >
                      {introCard.enabled ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>

                  {introCard.enabled && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">Title</Label>
                        <Input
                          value={introCard.title}
                          onChange={(e) =>
                            setIntroCard({ ...introCard, title: e.target.value })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">Subtitle</Label>
                        <Input
                          value={introCard.subtitle || ''}
                          onChange={(e) =>
                            setIntroCard({ ...introCard, subtitle: e.target.value })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">Badge Pill</Label>
                        <Input
                          value={introCard.badge || ''}
                          onChange={(e) =>
                            setIntroCard({ ...introCard, badge: e.target.value })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">Motion Preset</Label>
                        <Select
                          value={introCard.preset || 'minimal'}
                          onValueChange={(val: 'minimal' | 'kinetic' | 'gradient' | 'cyber') =>
                            setIntroCard({ ...introCard, preset: val })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minimal">Minimal Dark</SelectItem>
                            <SelectItem value="kinetic">Kinetic Glow</SelectItem>
                            <SelectItem value="gradient">Linear Mesh</SelectItem>
                            <SelectItem value="cyber">Cyberpunk Glass</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Outro Card Config */}
                <div className="p-3 rounded-lg border border-border/50 bg-background/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LayersIcon className="w-3.5 h-3.5 text-indigo-400" />
                      Outro Call to Action Card
                    </Label>
                    <Button
                      type="button"
                      variant={outroCard.enabled ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 text-[10px] px-2 cursor-pointer"
                      onClick={() =>
                        setOutroCard({ ...outroCard, enabled: !outroCard.enabled })
                      }
                    >
                      {outroCard.enabled ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>

                  {outroCard.enabled && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">Title</Label>
                        <Input
                          value={outroCard.title}
                          onChange={(e) =>
                            setOutroCard({ ...outroCard, title: e.target.value })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">Subtitle / URL</Label>
                        <Input
                          value={outroCard.subtitle || ''}
                          onChange={(e) =>
                            setOutroCard({ ...outroCard, subtitle: e.target.value })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">CTA Badge</Label>
                        <Input
                          value={outroCard.badge || ''}
                          onChange={(e) =>
                            setOutroCard({ ...outroCard, badge: e.target.value })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">Motion Preset</Label>
                        <Select
                          value={outroCard.preset || 'gradient'}
                          onValueChange={(val: 'minimal' | 'kinetic' | 'gradient' | 'cyber') =>
                            setOutroCard({ ...outroCard, preset: val })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minimal">Minimal Dark</SelectItem>
                            <SelectItem value="kinetic">Kinetic Glow</SelectItem>
                            <SelectItem value="gradient">Linear Mesh</SelectItem>
                            <SelectItem value="cyber">Cyberpunk Glass</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-border/40">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyMotionCards}
                    className="h-8 text-xs font-medium cursor-pointer"
                  >
                    <CheckIcon className="w-3.5 h-3.5 mr-1.5" />
                    Apply Motion Cards Plugin
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Content: Lower Thirds & Callouts Plugin */}
            <TabsContent value="plugin-kinetic-callout" className="mt-4 space-y-4">
              <div className="p-4 rounded-xl border border-border/60 bg-muted/10 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-semibold text-foreground">
                      Lower Thirds & Tech Badges
                    </h4>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    v1.0.0
                  </Badge>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Lower Thirds & Feature Callout overlays automatically style subtitles and key event callouts as animated badges on the lower canvas.
                </p>
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-mono text-[11px]">
                  ✨ Synchronized with timeline Subtitles and Kinetic Zooms.
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

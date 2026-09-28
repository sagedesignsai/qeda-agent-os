/**
 * components/studio/StudioSocialKitModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog for inspecting and copying AI-generated showcase social release copy
 * (X/Twitter thread, GitHub changelog markdown, LinkedIn post, and summaries).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  Share2Icon,
  CheckIcon,
  CopyIcon,
  FileCodeIcon,
  BriefcaseIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { StudioSocialKit } from '@/main/ipc/channels';

interface StudioSocialKitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  socialKit: StudioSocialKit | null;
}

export function StudioSocialKitModal({
  open,
  onOpenChange,
  socialKit,
}: StudioSocialKitModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard!');
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  if (!socialKit) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Share2Icon className="w-5 h-5 text-indigo-400" />
            Showcase Social Release Kit
          </DialogTitle>
          <DialogDescription>
            AI-crafted social posts and changelogs ready to publish alongside
            your video.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-4">
          <Tabs defaultValue="tweet" className="w-full">
            <TabsList className="grid grid-cols-3 w-full bg-secondary/60">
              <TabsTrigger value="tweet" className="text-xs">
                <span className="font-bold mr-1.5 text-sky-400">𝕏</span>X /
                Twitter
              </TabsTrigger>
              <TabsTrigger value="changelog" className="text-xs">
                <FileCodeIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                GitHub Changelog
              </TabsTrigger>
              <TabsTrigger value="linkedin" className="text-xs">
                <BriefcaseIcon className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                LinkedIn
              </TabsTrigger>
            </TabsList>

            {/* ── Tab 1: X / Twitter ────────────────────────────────────────── */}
            <TabsContent value="tweet" className="mt-3 flex flex-col gap-3">
              <div className="relative rounded-lg bg-secondary/30 border border-border/40 p-4 font-sans text-sm whitespace-pre-wrap leading-relaxed">
                {socialKit.tweet}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  onClick={() => copyToClipboard(socialKit.tweet, 'tweet')}
                >
                  {copiedKey === 'tweet' ? (
                    <CheckIcon className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )}
                  {copiedKey === 'tweet' ? 'Copied!' : 'Copy Tweet'}
                </Button>
              </div>
            </TabsContent>

            {/* ── Tab 2: GitHub Changelog ───────────────────────────────────── */}
            <TabsContent value="changelog" className="mt-3 flex flex-col gap-3">
              <div className="relative rounded-lg bg-secondary/30 border border-border/40 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {socialKit.changelog}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    copyToClipboard(socialKit.changelog, 'changelog')
                  }
                >
                  {copiedKey === 'changelog' ? (
                    <CheckIcon className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )}
                  {copiedKey === 'changelog' ? 'Copied!' : 'Copy Markdown'}
                </Button>
              </div>
            </TabsContent>

            {/* ── Tab 3: LinkedIn ───────────────────────────────────────────── */}
            <TabsContent value="linkedin" className="mt-3 flex flex-col gap-3">
              <div className="relative rounded-lg bg-secondary/30 border border-border/40 p-4 font-sans text-sm whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {socialKit.linkedIn}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    copyToClipboard(socialKit.linkedIn, 'linkedin')
                  }
                >
                  {copiedKey === 'linkedin' ? (
                    <CheckIcon className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )}
                  {copiedKey === 'linkedin' ? 'Copied!' : 'Copy Post'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

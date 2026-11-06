/**
 * components/trace/SponsorCardGenerator.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * UI component for generating and exporting sponsor cards.
 *
 * Features:
 *  - Feature list input form
 *  - Real-time generation preview
 *  - Export as React component or SVG
 *  - Copy-to-clipboard or download options
 */

'use client';

import { stageOf } from '@/lib/trace/document';
import { useState, useRef } from 'react';
import { useSponsorCard } from '@/hooks/use-sponsor-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SponsorCardFeature } from '@/lib/trace/templates/sponsor-card';
import type { TraceDocument } from '@/lib/trace/types';

interface Feature {
  title: string;
  subtitle: string;
}

export function SponsorCardGenerator() {
  const [features, setFeatures] = useState<Feature[]>([
    { title: 'Local Agent OS', subtitle: 'Full machine access from desktop' },
    { title: 'One-shot Planning', subtitle: 'Goal → steps → approval → run' },
    { title: 'Real Completion', subtitle: 'Track every command & result' },
  ]);
  const [project, setProject] = useState<TraceDocument | null>(null);
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'react' | 'vanilla'>('react');
  const [exportSvg, setExportSvg] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const { generate, exportGsap, exportSvg: doExportSvg, loading, error } = useSponsorCard();

  // Add feature row
  const addFeature = () => {
    setFeatures([...features, { title: '', subtitle: '' }]);
  };

  // Remove feature row
  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  // Update feature
  const updateFeature = (index: number, key: 'title' | 'subtitle', value: string) => {
    const updated = [...features];
    updated[index][key] = value;
    setFeatures(updated);
  };

  // Generate project
  const handleGenerate = async () => {
    const result = await generate(features as SponsorCardFeature[]);
    if (result) {
      setProject(result.project);
      setExportCode(null);
      setExportSvg(null);
    }
  };

  // Export as GSAP code
  const handleExportGsap = async () => {
    if (!project) return;
    const result = await exportGsap(project, exportFormat, 'QedaSponsorCard');
    if (result) {
      setExportCode(result.code);
      copyToClipboard(result.code);
    }
  };

  // Export as SVG
  const handleExportSvg = async () => {
    if (!project) return;
    const result = await doExportSvg(project);
    if (result) {
      setExportSvg(result.svg);
      downloadSvg(result.svg);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    } catch {
      downloadFile(text, 'sponsor-card.tsx', 'text/typescript');
    }
  };

  // Download SVG
  const downloadSvg = (svg: string) => {
    downloadFile(svg, 'sponsor-card.svg', 'image/svg+xml');
  };

  // Download file
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold mb-2">Sponsor Card Generator</h1>
        <p className="text-slate-400">Create animated Qeda sponsor cards with staggered feature reveals</p>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-100 p-4 rounded">
          Error: {error.message}
        </div>
      )}

      {/* Features List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Features (Max 6)</h2>
        {features.slice(0, 6).map((feature, index) => (
          <div key={index} className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Feature title"
                value={feature.title}
                onChange={(e) => updateFeature(index, 'title', e.target.value)}
                className="bg-slate-800 border-slate-600"
              />
            </div>
            <div className="flex-1">
              <Input
                placeholder="Subtitle / description"
                value={feature.subtitle}
                onChange={(e) => updateFeature(index, 'subtitle', e.target.value)}
                className="bg-slate-800 border-slate-600"
              />
            </div>
            <Button
              onClick={() => removeFeature(index)}
              variant="destructive"
              size="sm"
            >
              Remove
            </Button>
          </div>
        ))}
        {features.length < 6 && (
          <Button onClick={addFeature} variant="outline" className="w-full">
            + Add Feature
          </Button>
        )}
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={loading || features.length === 0}
        size="lg"
        className="w-full"
      >
        {loading ? 'Generating...' : 'Generate Sponsor Card'}
      </Button>

      {/* Project Info */}
      {project && (
        <div className="bg-slate-800 border border-slate-700 p-4 rounded space-y-3">
          <h3 className="font-semibold">Project Generated</h3>
          <div className="text-sm text-slate-300 space-y-1">
            <p>Dimensions: {project.width}×{project.height}px</p>
            <p>Duration: {project.durationMs}ms ({(project.durationMs / 1000).toFixed(1)}s)</p>
            <p>FPS: {project.fps}</p>
            <p>Elements: {Object.keys(stageOf(project).elements).length}</p>
          </div>
        </div>
      )}

      {/* Export Options */}
      {project && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Export</h2>

          {/* GSAP Export */}
          <div className="space-y-2">
            <p className="text-sm font-medium">GSAP Code</p>
            <div className="flex gap-2">
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'react' | 'vanilla')}
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm"
              >
                <option value="react">React Component</option>
                <option value="vanilla">Vanilla JavaScript</option>
              </select>
              <Button
                onClick={handleExportGsap}
                disabled={loading}
                variant="secondary"
              >
                {loading ? 'Exporting...' : 'Export GSAP Code'}
              </Button>
            </div>
            {exportCode && (
              <Textarea
                readOnly
                value={exportCode}
                className="font-mono text-xs bg-slate-900 border-slate-700 h-40"
              />
            )}
          </div>

          {/* SVG Export */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Animated SVG</p>
            <Button
              onClick={handleExportSvg}
              disabled={loading}
              variant="secondary"
              className="w-full"
            >
              {loading ? 'Exporting...' : 'Export Animated SVG'}
            </Button>
            {exportSvg && (
              <div className="bg-slate-900 border border-slate-700 p-4 rounded max-h-40 overflow-auto">
                <p className="text-xs text-slate-400">SVG preview (truncated)</p>
                <code className="text-xs text-slate-300">{exportSvg.slice(0, 200)}...</code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview */}
      {exportSvg && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Live Preview</h2>
          <div
            ref={previewRef}
            className="bg-black rounded border border-slate-700 overflow-hidden"
            dangerouslySetInnerHTML={{ __html: exportSvg }}
          />
        </div>
      )}
    </div>
  );
}

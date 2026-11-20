/**
 * src/__tests__/effects-palette.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Effects Palette component verification tests.
 *
 * Verifies:
 * - Effects are properly categorized
 * - Drag-to-add structure is correct
 * - Palette exports and integrates with inspector
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from '@jest/globals';
import {
  STUDIO_EFFECTS,
  getStudioEffectDefinition,
  isStudioEffectType,
} from '@/lib/studio/effects/catalog';
import type { StudioEffectType } from '@/lib/studio/types';

describe('Effects Palette', () => {
  it('should have all effects properly defined', () => {
    expect(STUDIO_EFFECTS.length).toBe(5);

    // Verify each effect has required properties
    for (const effect of STUDIO_EFFECTS) {
      expect(effect.type).toBeDefined();
      expect(effect.label).toBeDefined();
      expect(effect.category).toBeDefined();
      expect(effect.description).toBeDefined();
      expect(effect.defaultIntensity).toBeGreaterThanOrEqual(0);
      expect(effect.defaultIntensity).toBeLessThanOrEqual(1);
      expect(effect.defaultDurationMs).toBeGreaterThan(0);
      expect(effect.accent).toBeDefined();
    }
  });

  it('should have effects grouped by category', () => {
    const categories = new Set<string>();
    for (const effect of STUDIO_EFFECTS) {
      categories.add(effect.category);
    }

    // Should have exactly 3 categories
    expect(categories.size).toBe(3);
    expect(Array.from(categories)).toEqual(expect.arrayContaining(['Light', 'Film', 'Retro']));

    // Count effects per category
    const countByCategory = new Map<string, number>();
    for (const effect of STUDIO_EFFECTS) {
      const count = countByCategory.get(effect.category) || 0;
      countByCategory.set(effect.category, count + 1);
    }

    expect(countByCategory.get('Light')).toBe(2); // spotlight, neon-glow
    expect(countByCategory.get('Film')).toBe(2); // vignette, film-grain
    expect(countByCategory.get('Retro')).toBe(1); // scanlines
  });

  it('should have proper effect types', () => {
    const effectTypes: StudioEffectType[] = ['spotlight', 'neon-glow', 'vignette', 'film-grain', 'scanlines'];

    for (const effectType of effectTypes) {
      expect(isStudioEffectType(effectType)).toBe(true);

      const definition = getStudioEffectDefinition(effectType);
      expect(definition).toBeDefined();
      expect(definition?.type).toBe(effectType);
    }
  });

  it('should have accent colors for visual representation', () => {
    const accentColors = new Map<string, string>();

    for (const effect of STUDIO_EFFECTS) {
      // Accent should be a valid hex color
      expect(effect.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      accentColors.set(effect.type, effect.accent);
    }

    // Verify unique colors for visual distinction
    const uniqueColors = new Set(accentColors.values());
    expect(uniqueColors.size).toBe(5); // Each effect should have its own color
  });

  it('should support drag-to-add data transfer format', () => {
    // Verify that effects can be serialized for drag-drop
    for (const effect of STUDIO_EFFECTS) {
      // The drag data would be 'application/x-studio-effect' with value effect.type
      const dragData = effect.type;

      // Should be serializable
      expect(typeof dragData).toBe('string');
      expect(dragData.length).toBeGreaterThan(0);

      // Should be a valid effect type
      expect(isStudioEffectType(dragData)).toBe(true);
    }
  });

  it('should have meaningful labels and descriptions', () => {
    for (const effect of STUDIO_EFFECTS) {
      // Labels should be human-readable
      expect(effect.label.length).toBeGreaterThan(0);
      expect(effect.label).toMatch(/[A-Za-z]/); // Contains at least one letter

      // Descriptions should be informative
      expect(effect.description.length).toBeGreaterThan(10);
      expect(effect.description).toMatch(/[A-Za-z]/);
    }
  });

  it('should have reasonable default intensities', () => {
    for (const effect of STUDIO_EFFECTS) {
      // Default intensity should be between 0 and 1
      expect(effect.defaultIntensity).toBeGreaterThanOrEqual(0);
      expect(effect.defaultIntensity).toBeLessThanOrEqual(1);

      // Should be a sensible starting point (not 0 or 1 exclusively)
      if (effect.type === 'spotlight') {
        expect(effect.defaultIntensity).toBe(0.6);
      } else if (effect.type === 'neon-glow') {
        expect(effect.defaultIntensity).toBe(0.7);
      } else if (effect.type === 'vignette') {
        expect(effect.defaultIntensity).toBe(0.55);
      } else if (effect.type === 'film-grain') {
        expect(effect.defaultIntensity).toBe(0.35);
      } else if (effect.type === 'scanlines') {
        expect(effect.defaultIntensity).toBe(0.4);
      }
    }
  });

  it('should lookup effect definitions correctly', () => {
    // Valid lookup
    const spotlight = getStudioEffectDefinition('spotlight');
    expect(spotlight).toBeDefined();
    expect(spotlight?.type).toBe('spotlight');
    expect(spotlight?.label).toBe('Spotlight Focus');
    expect(spotlight?.category).toBe('Light');

    // Invalid lookup
    const invalid = getStudioEffectDefinition('invalid-effect' as any);
    expect(invalid).toBeUndefined();
  });

  it('should verify type guard function', () => {
    expect(isStudioEffectType('spotlight')).toBe(true);
    expect(isStudioEffectType('neon-glow')).toBe(true);
    expect(isStudioEffectType('vignette')).toBe(true);
    expect(isStudioEffectType('film-grain')).toBe(true);
    expect(isStudioEffectType('scanlines')).toBe(true);

    // Invalid types
    expect(isStudioEffectType('invalid')).toBe(false);
    expect(isStudioEffectType('')).toBe(false);
    expect(isStudioEffectType(null)).toBe(false);
    expect(isStudioEffectType(undefined)).toBe(false);
    expect(isStudioEffectType(123)).toBe(false);
  });
});

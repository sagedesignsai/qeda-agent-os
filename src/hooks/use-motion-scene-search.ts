/**
 * hooks/use-motion-scene-search.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Search and filter logic for Motion Scene Panel nodes and assets.
 * Supports substring matching on name and type.
 */

import { useMemo, useState, useCallback } from 'react';
import type { MotionNode, MotionTrack } from '@/lib/motion/types';

export interface UseMotionSceneSearchOptions {
  nodes?: readonly MotionNode[];
  tracks?: readonly MotionTrack[];
}

export function useMotionSceneSearch({ nodes = [], tracks = [] }: UseMotionSceneSearchOptions) {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value.trim());
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchValue('');
  }, []);

  const matchesSearch = useCallback(
    (text: string): boolean => {
      if (!searchValue) return true;
      return text.toLowerCase().includes(searchValue.toLowerCase());
    },
    [searchValue],
  );

  const filteredNodes = useMemo(() => {
    if (!searchValue) return nodes;
    return nodes.filter(
      (node) =>
        matchesSearch(node.name) ||
        matchesSearch(node.type),
    );
  }, [nodes, searchValue, matchesSearch]);

  const filteredTracks = useMemo(() => {
    if (!searchValue) return tracks;
    return tracks.filter((track) => matchesSearch(track.name));
  }, [tracks, searchValue, matchesSearch]);

  return {
    searchValue,
    onSearchChange: handleSearchChange,
    onClearSearch: handleClearSearch,
    filteredNodes,
    filteredTracks,
    hasActiveSearch: searchValue.length > 0,
  };
}

/**
 * components/workspace/renderers/DividerRenderer.tsx
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface DividerRendererProps {
  className?: string;
}

export function DividerRenderer({ className }: DividerRendererProps) {
  return <hr className={cn('border-border/40 my-4', className)} />;
}

/**
 * components/documents/primitives/DynamicLucideIcon.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic Lucide icon lookup component with robust fallback.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  CheckIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  StarIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  MailIcon,
  PhoneIcon,
  GlobeIcon,
  MapPinIcon,
  CalendarIcon,
  FileTextIcon,
  TagIcon,
  UserIcon,
  ShieldCheckIcon,
  ZapIcon,
  SparklesIcon,
  ExternalLinkIcon,
  SearchIcon,
  HeartIcon,
  AwardIcon,
  BookmarkIcon,
  ClockIcon,
  FolderIcon,
  LayersIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  check: CheckIcon,
  'alert-circle': AlertCircleIcon,
  'alert-triangle': AlertTriangleIcon,
  info: InfoIcon,
  star: StarIcon,
  'arrow-right': ArrowRightIcon,
  'arrow-left': ArrowLeftIcon,
  'chevron-right': ChevronRightIcon,
  'chevron-left': ChevronLeftIcon,
  mail: MailIcon,
  phone: PhoneIcon,
  globe: GlobeIcon,
  'map-pin': MapPinIcon,
  calendar: CalendarIcon,
  'file-text': FileTextIcon,
  tag: TagIcon,
  user: UserIcon,
  'shield-check': ShieldCheckIcon,
  zap: ZapIcon,
  sparkles: SparklesIcon,
  'external-link': ExternalLinkIcon,
  search: SearchIcon,
  heart: HeartIcon,
  award: AwardIcon,
  bookmark: BookmarkIcon,
  clock: ClockIcon,
  folder: FolderIcon,
  layers: LayersIcon,
};

interface DynamicLucideIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function DynamicLucideIcon({
  name,
  size = 16,
  className,
  style,
}: DynamicLucideIconProps) {
  const normalized = name.toLowerCase().trim().replace(/_/g, '-');
  const IconComponent = ICON_MAP[normalized] || SparklesIcon;

  return (
    <IconComponent
      className={className}
      style={{ width: `${size}px`, height: `${size}px`, ...style }}
    />
  );
}

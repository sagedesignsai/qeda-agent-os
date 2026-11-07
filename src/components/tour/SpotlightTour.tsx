/**
 * components/tour/SpotlightTour.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight spotlight overlay component for the first-launch app tour.
 *
 * Highlights one element at a time with a semi-transparent overlay and a
 * tooltip-style card. Built on motion/react for smooth transitions.
 * No external library — integrates cleanly with the existing overlay system.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { XIcon, ChevronRightIcon, ChevronLeftIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TourStep } from './tour-steps';

interface SpotlightTourProps {
  step: TourStep;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/** Placement offsets from the target element. */
const PLACEMENT_PADDING = 16;

function getTooltipRect(
  targetRect: DOMRect,
  placement: 'top' | 'bottom' | 'right' | 'left',
  cardWidth: number,
  cardHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = PLACEMENT_PADDING;

  let top: number;
  let left: number;

  switch (placement) {
    case 'top':
      top = targetRect.top - cardHeight - pad;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      break;
    case 'bottom':
      top = targetRect.bottom + pad;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      break;
    case 'right':
      top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
      left = targetRect.right + pad;
      break;
    case 'left':
      top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
      left = targetRect.left - cardWidth - pad;
      break;
  }

  // Clamp to viewport
  left = Math.max(12, Math.min(left, vw - cardWidth - 12));
  top = Math.max(12, Math.min(top, vh - cardHeight - 12));

  return { top, left };
}

export function SpotlightTour({
  step,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onClose,
}: SpotlightTourProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 340, height: 120 });
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cutout, setCutout] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    borderRadius: number;
  } | null>(null);

  const measureTarget = useCallback(() => {
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);
    setCutout({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      borderRadius: 12,
    });

    // Measure the card after it renders
    requestAnimationFrame(() => {
      if (cardRef.current) {
        const cardRect = cardRef.current.getBoundingClientRect();
        setCardSize({ width: cardRect.width, height: cardRect.height });
      }
    });
  }, [step.target]);

  useEffect(() => {
    // Delay measurement to let the DOM settle
    const timer = setTimeout(measureTarget, 100);
    return () => clearTimeout(timer);
  }, [measureTarget]);

  useEffect(() => {
    const onResize = () => measureTarget();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureTarget]);

  const tooltipPosition = useMemo(() => {
    if (!targetRect) return { top: 0, left: 0 };
    return getTooltipRect(
      targetRect,
      step.placement ?? 'bottom',
      cardSize.width,
      cardSize.height,
    );
  }, [targetRect, step.placement, cardSize]);

  const overlay = (
    <>
      {/* Semi-transparent overlay with cutout */}
      <div
        className="fixed inset-0 z-[100] transition-opacity"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      >
        {cutout && (
          <div
            className="absolute bg-transparent pointer-events-none"
            style={{
              top: cutout.top - 8,
              left: cutout.left - 8,
              width: cutout.width + 16,
              height: cutout.height + 16,
              borderRadius: cutout.borderRadius + 8,
              boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.55)`,
            }}
          />
        )}
      </div>

      {/* Spotlight glow on the target */}
      {cutout && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: cutout.top,
            left: cutout.left,
            width: cutout.width,
            height: cutout.height,
            borderRadius: cutout.borderRadius,
            outline: '2px solid hsl(var(--primary) / 0.6)',
            outlineOffset: '2px',
            boxShadow: '0 0 24px hsl(var(--primary) / 0.25)',
          }}
        />
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          ref={cardRef}
          className="fixed z-[101] pointer-events-auto"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            width: 340,
          }}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="rounded-xl border border-border bg-card shadow-2xl p-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-foreground leading-snug">
                {step.title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Close tour"
              >
                <XIcon size={14} />
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              {step.description}
            </p>

            {/* Progress & Navigation */}
            <div className="flex items-center justify-between">
              {/* Step indicators */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === currentStep
                        ? 'w-6 bg-primary'
                        : i < currentStep
                          ? 'w-1.5 bg-primary/40'
                          : 'w-1.5 bg-muted',
                    )}
                  />
                ))}
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {currentStep + 1} / {totalSteps}
                </span>
                {currentStep > 0 && (
                  <button
                    type="button"
                    onClick={onPrev}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
                  >
                    <ChevronLeftIcon size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onNext}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors',
                    currentStep < totalSteps - 1
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500',
                  )}
                >
                  {currentStep < totalSteps - 1 ? 'Next' : 'Got it'}
                  <ChevronRightIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );

  // Use a portal to render at the document body level
  return createPortal(overlay, document.body);
}

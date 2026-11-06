/**
 * lib/animations/chat-animations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GSAP animation utilities for the Chat page. Provides reusable animation
 * definitions for entrance effects, message appearance, and interactive feedback.
 *
 * All animations respect prefers-reduced-motion for accessibility.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import gsap from 'gsap';

/**
 * Check if user prefers reduced motion
 */
export const prefersReducedMotion = () => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get safe animation config based on accessibility preferences
 */
export const getSafeAnimationConfig = (config: gsap.TweenVars) => {
  if (prefersReducedMotion()) {
    return { ...config, duration: 0 };
  }
  return config;
};

/**
 * ChatWelcome entrance animation - stagger fade-in
 * Animates: logo, heading, input, suggestions
 */
export const chatWelcomeEntranceAnimation = (
  container: HTMLElement | null,
) => {
  if (!container || prefersReducedMotion()) return;

  const elements = container.querySelectorAll(
    '[data-animate="welcome"]',
  ) as NodeListOf<HTMLElement>;

  if (elements.length === 0) return;

  gsap.fromTo(
    elements,
    {
      opacity: 0,
      y: 20,
    },
    {
      opacity: 1,
      y: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  );
};

/**
 * Message entrance animation - fade-in from bottom with slight scale
 */
export const messageEntranceAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.fromTo(
    element,
    {
      opacity: 0,
      y: 15,
      scale: 0.95,
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.4,
      ease: 'power2.out',
    },
  );
};

/**
 * Tool card entrance animation - staggered fade-in
 */
export const toolCardAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.fromTo(
    element,
    {
      opacity: 0,
      x: -10,
    },
    {
      opacity: 1,
      x: 0,
      duration: 0.35,
      ease: 'power2.out',
    },
  );
};

/**
 * Plan panel slide-down animation
 */
export const planPanelAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.fromTo(
    element,
    {
      opacity: 0,
      y: -10,
      height: 0,
    },
    {
      opacity: 1,
      y: 0,
      height: 'auto',
      duration: 0.4,
      ease: 'back.out(1.7)',
    },
  );
};

/**
 * Input focus animation - subtle border glow pulse
 */
export const inputFocusAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.to(element, {
    duration: 0.3,
    ease: 'power2.out',
    boxShadow: '0 0 20px rgba(var(--primary-rgb), 0.4)',
  });
};

/**
 * Input blur animation - fade glow out
 */
export const inputBlurAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.to(element, {
    duration: 0.3,
    ease: 'power2.out',
    boxShadow: '0 0 0px rgba(var(--primary-rgb), 0)',
  });
};

/**
 * Suggestion chip hover animation - scale and elevate
 */
export const suggestionChipHoverAnimation = (
  element: HTMLElement | null,
  isHovering: boolean,
) => {
  if (!element || prefersReducedMotion()) return;

  gsap.to(element, {
    duration: 0.2,
    scale: isHovering ? 1.05 : 1,
    y: isHovering ? -2 : 0,
    boxShadow: isHovering
      ? '0 4px 12px rgba(0, 0, 0, 0.15)'
      : '0 0px 0px rgba(0, 0, 0, 0)',
  });
};

/**
 * Shimmer animation pulse (for streaming indicator)
 */
export const shimmerPulseAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.to(element, {
    duration: 0.6,
    opacity: 0.7,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
};

/**
 * Modal entrance animation - fade + scale
 */
export const modalEntranceAnimation = (
  overlay: HTMLElement | null,
  content: HTMLElement | null,
) => {
  if (!overlay || !content || prefersReducedMotion()) return;

  gsap.fromTo(
    overlay,
    { opacity: 0 },
    { opacity: 1, duration: 0.3, ease: 'power1.out' },
  );

  gsap.fromTo(
    content,
    { opacity: 0, scale: 0.95, y: 20 },
    { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)' },
  );
};

/**
 * Status transition animation - color pulse
 */
export const statusTransitionAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.fromTo(
    element,
    { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
    {
      backgroundColor: 'rgba(34, 197, 94, 0)',
      duration: 1,
      ease: 'power2.out',
    },
  );
};

/**
 * Batch message entrance with stagger
 */
export const messagesEntranceAnimation = (
  messages: HTMLElement[] | NodeListOf<HTMLElement>,
) => {
  if (messages.length === 0 || prefersReducedMotion()) return;

  gsap.fromTo(
    messages,
    {
      opacity: 0,
      y: 20,
    },
    {
      opacity: 1,
      y: 0,
      duration: 0.4,
      stagger: 0.05,
      ease: 'power2.out',
    },
  );
};

/**
 * Attachment thumbnail fade in
 */
export const attachmentThumbAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.fromTo(
    element,
    {
      opacity: 0,
      scale: 0.8,
    },
    {
      opacity: 1,
      scale: 1,
      duration: 0.3,
      ease: 'back.out(2)',
    },
  );
};

/**
 * Loading spinner animation
 */
export const loadingSpinnerAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.to(element, {
    rotation: 360,
    duration: 1,
    repeat: -1,
    ease: 'none',
  });
};

/**
 * Context control fade in
 */
export const contextControlAnimation = (element: HTMLElement | null) => {
  if (!element || prefersReducedMotion()) return;

  gsap.fromTo(
    element,
    {
      opacity: 0,
      x: -8,
    },
    {
      opacity: 1,
      x: 0,
      duration: 0.3,
      ease: 'power2.out',
    },
  );
};

/**
 * Kill all animations on unmount for cleanup
 */
export const killAllAnimations = () => {
  gsap.killTweensOf('*');
};

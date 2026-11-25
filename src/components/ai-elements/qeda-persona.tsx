'use client';

import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { memo, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { PersonaState } from './persona';

gsap.registerPlugin(useGSAP, MotionPathPlugin);

interface QedaPersonaProps {
  state: PersonaState;
  className?: string;
}

const stateLabels: Record<PersonaState, string> = {
  idle: 'ready',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  asleep: 'inactive',
};

export const QedaPersona = memo(function QedaPersona({
  state,
  className,
}: QedaPersonaProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const head = root.querySelector<SVGGElement>('[data-head]');
      const ring = root.querySelector<SVGPathElement>('[data-ring]');
      const bolt = root.querySelector<SVGPathElement>('[data-bolt]');
      const antenna = root.querySelector<SVGGElement>('[data-antenna]');
      const pulse = root.querySelector<SVGCircleElement>('[data-pulse]');
      const charge = root.querySelector<SVGCircleElement>('[data-charge]');
      const orbit = root.querySelector<SVGPathElement>('[data-orbit]');
      if (!head || !ring || !bolt || !antenna || !pulse || !charge || !orbit) {
        return;
      }

      gsap.set(head, { opacity: 1 });
      gsap.set(ring, { opacity: 1 });
      gsap.set(bolt, { opacity: 1, transformOrigin: '50% 50%' });
      gsap.set([pulse, charge], { autoAlpha: 0 });

      if (state === 'asleep') {
        gsap.set([head, bolt], { opacity: 0.55 });
        return;
      }

      if (
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
        false
      ) {
        return;
      }

      if (state === 'idle') {
        gsap.to(antenna, {
          y: -1.5,
          duration: 1.8,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      } else if (state === 'listening') {
        gsap.fromTo(
          pulse,
          { autoAlpha: 0.38, scale: 0.92 },
          {
            autoAlpha: 0,
            scale: 1.18,
            duration: 1.25,
            ease: 'power1.out',
            repeat: -1,
            transformOrigin: '50% 50%',
          },
        );
        gsap.to(bolt, {
          y: -2,
          duration: 0.65,
          ease: 'back.out(2)',
          repeat: -1,
          repeatDelay: 0.35,
          yoyo: true,
        });
      } else if (state === 'thinking') {
        gsap.set(charge, { autoAlpha: 1 });
        gsap.to(charge, {
          duration: 2.2,
          ease: 'none',
          repeat: -1,
          motionPath: {
            path: orbit,
            align: orbit,
            alignOrigin: [0.5, 0.5],
          },
        });
        gsap.to(bolt, {
          rotation: 5,
          duration: 0.8,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      } else if (state === 'speaking') {
        gsap.fromTo(
          pulse,
          { autoAlpha: 0.38, scale: 0.9 },
          {
            autoAlpha: 0,
            scale: 1.2,
            duration: 0.9,
            ease: 'power1.out',
            repeat: -1,
            transformOrigin: '50% 50%',
          },
        );
        gsap.to(bolt, {
          scale: 1.08,
          duration: 0.45,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      }
    },
    { dependencies: [state], revertOnUpdate: true, scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className={cn('size-16 shrink-0', className)}
      data-state={state}
      role="img"
      aria-label={`Qeda assistant, ${stateLabels[state]}`}
    >
      <svg className="size-full overflow-visible" viewBox="0 0 96 96" aria-hidden="true">
        <defs>
          <path
            d="M48 23 A25 25 0 1 1 48 73 A25 25 0 1 1 48 23"
            data-orbit
          />
        </defs>
        <circle
          cx="48"
          cy="48"
          r="36"
          fill="none"
          stroke="#20b5e8"
          strokeWidth="2.5"
          opacity="0"
          data-pulse
        />
        <g data-head>
          <rect x="10" y="40" width="16" height="18" rx="8" fill="currentColor" />
          <rect x="70" y="40" width="16" height="18" rx="8" fill="currentColor" />
          <path
            d="M70 70 A31 31 0 1 1 76 61"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            data-ring
          />
          <g data-antenna>
            <path
              d="M48 17V11"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="48" cy="8" r="4.5" fill="#20b5e8" />
          </g>
          <rect x="27" y="30" width="42" height="38" rx="15" fill="currentColor" />
          <rect x="32" y="35" width="32" height="27" rx="10" fill="#101820" />
          <ellipse cx="41" cy="45" rx="2.5" ry="3.5" fill="#20b5e8" />
          <ellipse cx="55" cy="45" rx="2.5" ry="3.5" fill="#20b5e8" />
          <path
            d="M41 54Q48 59 55 54"
            fill="none"
            stroke="#9beaff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <path d="M62 54H70L87 73H78L83 89 57 66H67Z" fill="#20b5e8" data-bolt />
        <circle cx="48" cy="23" r="1.8" fill="#9beaff" data-charge />
      </svg>
    </div>
  );
});

QedaPersona.displayName = 'QedaPersona';

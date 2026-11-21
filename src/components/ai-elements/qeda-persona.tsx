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

const ringPath =
  'm 99.333958,165.81275 c -9.570989,-0.70831 -18.077945,-5.25085 -24.258468,-12.95353 -2.929114,-3.6505 -5.28556,-8.39527 -6.412457,-12.91166 -1.202843,-4.82077 -1.340603,-9.56439 -0.424147,-14.605 1.556562,-8.56128 6.647752,-16.5092 13.841355,-21.60792 2.778149,-1.96911 5.363706,-3.28857 8.585918,-4.38156 3.545596,-1.202686 6.358767,-1.685167 10.244671,-1.757039 4.12374,-0.07627 7.48586,0.423288 11.13366,1.654289 5.07306,1.71197 9.49381,4.4878 13.25948,8.32574 1.75046,1.78407 3.22159,3.63609 4.56253,5.74382 0.83688,1.31543 2.32445,4.25231 2.89473,5.715 0.99204,2.54445 1.70935,5.44064 2.10746,8.509 0.18377,1.41633 0.25799,5.45307 0.1278,6.95072 -0.49673,5.71432 -2.28132,10.97771 -5.37278,15.84619 -0.37715,0.59396 -0.71355,1.07021 -0.74755,1.05834 -0.034,-0.0119 -0.96892,-1.37413 -2.0776,-3.02725 -1.10868,-1.65312 -2.36984,-3.52607 -2.80259,-4.16211 l -0.7868,-1.15644 0.17631,-0.3456 c 0.27644,-0.54187 0.93079,-2.16846 1.24662,-3.09885 1.53883,-4.53325 1.69241,-9.47987 0.44833,-14.44008 -0.79316,-3.16236 -2.44389,-6.45821 -4.59001,-9.16439 -0.83202,-1.04915 -2.88986,-3.12316 -3.87393,-3.90437 -2.63005,-2.08789 -6.03214,-3.7919 -9.1422,-4.57906 -2.07521,-0.52524 -3.79748,-0.7299 -6.14302,-0.72997 -3.765604,-1.3e-4 -7.214629,0.80579 -10.580444,2.47229 -4.055181,2.00781 -7.276653,4.86558 -9.822188,8.71325 -1.573431,2.3783 -2.611922,4.78146 -3.338345,7.72522 -0.41196,1.66944 -0.564547,2.69403 -0.689538,4.63013 -0.18643,2.88778 0.310965,6.45909 1.280259,9.19231 1.369517,3.86178 3.263303,6.87916 6.086782,9.69812 2.549674,2.54559 5.082564,4.21232 8.345697,5.49177 1.946518,0.76322 3.960743,1.30425 5.55636,1.49248 l 0.47636,0.0562 1.346303,1.28272 c 6.827894,6.50543 8.072644,7.70126 8.072644,7.75542 0,0.0636 -1.35513,0.27275 -2.794,0.43127 -1.09488,0.12062 -4.72948,0.16994 -5.937202,0.0806 z';
const boltPath =
  'm 137.82022,188.73672 c -2.40095,-2.19311 -17.2883,-16.15904 -21.50006,-20.16938 -0.93133,-0.88679 -3.71263,-3.51629 -6.18067,-5.84334 -5.37724,-5.07007 -6.4084,-6.06691 -6.34323,-6.13217 0.0272,-0.0273 2.27171,-0.0687 4.9877,-0.0919 l 4.93816,-0.0423 -1.39455,-1.905 c -0.76701,-1.04775 -2.28139,-3.10514 -3.36529,-4.57199 -1.0839,-1.46685 -2.70807,-3.67665 -3.60927,-4.91067 -0.9012,-1.23402 -1.97791,-2.69776 -2.39269,-3.25277 -0.8865,-1.18619 -2.28304,-3.09396 -2.37572,-3.2454 -0.0516,-0.0844 1.53287,-0.10583 7.81391,-0.10583 h 7.87869 l 3.80141,5.69383 c 3.70041,5.54253 8.37426,12.47183 11.78647,17.47424 0.92555,1.35689 1.70638,2.52846 1.73518,2.6035 0.0478,0.12452 -0.38731,0.13643 -4.98379,0.13643 h -5.03614 l 0.7629,1.29116 c 0.41959,0.71015 1.13412,1.90077 1.58784,2.64584 2.52419,4.14509 11.09935,18.42867 12.02122,20.02366 0.20186,0.34925 0.42221,0.72073 0.48968,0.8255 0.0675,0.10478 0.10637,0.1905 0.0865,0.1905 -0.0199,0 -0.3386,-0.27622 -0.70821,-0.61383 z';

export const QedaPersona = memo(function QedaPersona({
  state,
  className,
}: QedaPersonaProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const ring = root.querySelector<SVGPathElement>('[data-ring]');
      const bolt = root.querySelector<SVGPathElement>('[data-bolt]');
      const pulse = root.querySelector<SVGCircleElement>('[data-pulse]');
      const charge = root.querySelector<SVGCircleElement>('[data-charge]');
      const orbit = root.querySelector<SVGPathElement>('[data-orbit]');
      if (!ring || !bolt || !pulse || !charge || !orbit) return;

      gsap.set(ring, { opacity: 1 });
      gsap.set(bolt, { opacity: 1, transformOrigin: '50% 50%' });
      gsap.set([pulse, charge], { autoAlpha: 0 });

      if (state === 'asleep') {
        gsap.set([ring, bolt], { opacity: 0.55 });
        return;
      }

      if (
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
        false
      ) {
        return;
      }

      if (state === 'idle') {
        gsap.to(bolt, {
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
      <svg
        className="size-full overflow-visible"
        viewBox="0 0 70.891411 91.762123"
        aria-hidden="true"
      >
        <defs>
          <path
            d="M 35.4,10.5 A 23,23 0 1 1 35.4,56.5 A 23,23 0 1 1 35.4,10.5"
            data-orbit
          />
        </defs>
        <g transform="translate(-67.642249,-97.588516)">
          <path d={ringPath} fill="currentColor" data-ring />
          <circle
            cx="99.5"
            cy="131.5"
            r="35"
            fill="none"
            stroke="#20b5e8"
            strokeWidth="2.5"
            opacity="0"
            data-pulse
          />
          <path d={boltPath} fill="#20b5e8" data-bolt />
        </g>
        <circle cx="35.4" cy="33.5" r="1.8" fill="#9beaff" data-charge />
      </svg>
    </div>
  );
});

QedaPersona.displayName = 'QedaPersona';

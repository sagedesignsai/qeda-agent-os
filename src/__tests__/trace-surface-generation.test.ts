import {
  compileSurfaceProposal,
  surfaceProposalProject,
  type SurfaceGenerationRequest,
  type SurfaceProposalCandidate,
} from '@/lib/trace/addons/surfaces/generation';
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup';

const REQUEST: SurfaceGenerationRequest = {
  width: 320,
  height: 180,
  durationMs: 4000,
  fps: 60,
  prompt: 'A calm aurora backdrop',
  intensity: 50,
  loop: true,
};

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.8" />
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect id="base" x="0" y="0" width="320" height="180" fill="#0b1120" />
  <circle id="orb" cx="160" cy="90" r="60" fill="url(#glow)" />
</svg>`;

function candidate(overrides: Partial<SurfaceProposalCandidate> = {}): SurfaceProposalCandidate {
  return {
    summary: 'Calm aurora',
    svg: SVG,
    tracks: [
      {
        elementId: 'orb',
        property: 'opacity',
        keyframes: [
          { timeMs: 0, value: 0.55, easing: 'ease-in-out' },
          { timeMs: 2000, value: 0.95, easing: 'ease-in-out' },
          { timeMs: 4000, value: 0.55, easing: 'ease-in-out' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Surface generation compiler', () => {
  it('compiles SVG and tracks into an insertable, animated fragment', () => {
    const proposal = compileSurfaceProposal(REQUEST, candidate());

    expect(proposal.width).toBe(320);
    expect(proposal.height).toBe(180);
    expect(proposal.fragment.elements.base).toBeDefined();
    expect(proposal.fragment.elements.orb.tracks).toHaveLength(1);
    expect(proposal.fragment.elements.orb.tracks[0].property).toBe('opacity');
    expect(proposal.fragment.gradients).toBeUndefined();
    expect(proposal.fragment.defs).toContain('radialGradient');
    expect(proposal.tracks).toHaveLength(1);
    expect(proposal.previewSvg.startsWith('<svg')).toBe(true);

    const project = surfaceProposalProject(proposal);
    const mid = staticSvgMarkup(project, 2000);
    expect(mid).toContain('radialGradient');
    expect(mid).toContain('opacity="0.95"');
  });

  it('rejects an SVG whose viewBox does not match the project canvas', () => {
    expect(() =>
      compileSurfaceProposal(REQUEST, {
        ...candidate(),
        svg: SVG.replace('viewBox="0 0 320 180"', 'viewBox="0 0 1920 1080"'),
      }),
    ).toThrow(/exact canvas size/);
  });

  it('rejects SMIL instead of silently dropping the animation', () => {
    const withSmil = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
      <rect id="base" width="320" height="180" fill="#0b1120" />
      <circle id="orb" cx="160" cy="90" r="40" fill="#38bdf8">
        <animate attributeName="opacity" values="0.4;1" dur="2s" />
      </circle>
    </svg>`;
    expect(() =>
      compileSurfaceProposal(REQUEST, { ...candidate(), svg: withSmil }),
    ).toThrow(/SMIL/);
  });

  it('rejects CSS-class styling that would not survive import', () => {
    const withCss = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
      <style>.warm { fill: #f97316; }</style>
      <rect id="base" class="warm" width="320" height="180" />
    </svg>`;
    expect(() =>
      compileSurfaceProposal(REQUEST, { ...candidate(), svg: withCss }),
    ).toThrow(/CSS class/);
  });

  it('rejects clip paths that would silently change the artwork', () => {
    const withClip = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
      <rect id="base" width="320" height="180" fill="#0b1120" clip-path="url(#c)" />
    </svg>`;
    expect(() =>
      compileSurfaceProposal(REQUEST, { ...candidate(), svg: withClip }),
    ).toThrow(/Presentation attributes/);
  });

  it('reports unknown track element ids with the imported ids', () => {
    expect(() =>
      compileSurfaceProposal(REQUEST, {
        ...candidate(),
        tracks: [
          {
            elementId: 'missing-layer',
            property: 'opacity',
            keyframes: [
              { timeMs: 0, value: 0.5 },
              { timeMs: 4000, value: 0.5 },
            ],
          },
        ],
      }),
    ).toThrow(/unknown SVG element id "missing-layer"/);
  });

  it('enforces seamlessness on continuous looping tracks', () => {
    expect(() =>
      compileSurfaceProposal(REQUEST, {
        ...candidate(),
        tracks: [
          {
            elementId: 'orb',
            property: 'x',
            keyframes: [
              { timeMs: 0, value: 0 },
              { timeMs: 4000, value: 24 },
            ],
          },
        ],
      }),
    ).toThrow(/must end at its starting value/);
  });

  it('accepts a full-turn rotation as a seamless loop', () => {
    const proposal = compileSurfaceProposal(REQUEST, {
      ...candidate(),
      tracks: [
        {
          elementId: 'orb',
          property: 'rotation',
          keyframes: [
            { timeMs: 0, value: 0, easing: 'linear' },
            { timeMs: 4000, value: 360, easing: 'linear' },
          ],
        },
      ],
    });
    expect(proposal.tracks[0].keyframes.at(-1)?.value).toBe(360);
  });

  it('allows one-shot surfaces when loop is false', () => {
    const proposal = compileSurfaceProposal(
      { ...REQUEST, loop: false },
      {
        ...candidate(),
        tracks: [
          {
            elementId: 'orb',
            property: 'x',
            keyframes: [
              { timeMs: 0, value: 0 },
              { timeMs: 4000, value: 24 },
            ],
          },
        ],
      },
    );
    expect(proposal.tracks[0].keyframes.at(-1)?.value).toBe(24);
  });

  it('rejects dash tracks on layers without a stroke', () => {
    expect(() =>
      compileSurfaceProposal(REQUEST, {
        ...candidate(),
        tracks: [
          {
            elementId: 'orb',
            property: 'strokeDashoffset',
            keyframes: [
              { timeMs: 0, value: 0 },
              { timeMs: 4000, value: 0 },
            ],
          },
        ],
      }),
    ).toThrow(/has no stroke/);
  });
});
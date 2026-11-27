import {
  compileSurfaceProposal,
  surfaceProposalProject,
  type SurfaceGenerationRequest,
  type SurfaceProposalCandidate,
} from '@/lib/trace/addons/surfaces/generation';
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup';
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

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

  it('compiles in the Electron main process using the XML fallback', () => {
    // The main process has no browser DOM. This is the path the specialist uses.
    const domParser = {
      parseFromString: (text: string, mimeType: string) =>
        new XmlDomParser().parseFromString(text, mimeType),
    };
    const proposal = compileSurfaceProposal(REQUEST, candidate(), {
      domParser,
      measureWithDom: false,
    });

    expect(proposal.fragment.elements.base).toBeDefined();
    expect(proposal.fragment.elements.orb).toBeDefined();
    expect(proposal.fragment.defs).toContain('radialGradient');
    expect(proposal.fragment.elements.orb.tracks).toHaveLength(1);
    expect(proposal.previewSvg).toContain('radialGradient');
  });

  it('expands use references without a browser DOM', () => {
    const domParser = {
      parseFromString: (text: string, mimeType: string) =>
        new XmlDomParser().parseFromString(text, mimeType),
    };
    const withUse = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
      <defs>
        <g id="dot"><circle id="dot-shape" cx="0" cy="0" r="8" fill="#38bdf8" /></g>
      </defs>
      <rect id="base" width="320" height="180" fill="#0b1120" />
      <use href="#dot" x="80" y="90" />
      <use href="#dot" x="220" y="90" transform="scale(2)" />
    </svg>`;
    const proposal = compileSurfaceProposal(
      REQUEST,
      { ...candidate(), svg: withUse, tracks: [] },
      { domParser, measureWithDom: false },
    );
    expect(proposal.fragment.rootElementIds).toHaveLength(3);
    expect(
      Object.values(proposal.fragment.elements).filter(
        (element) => element.type === 'circle',
      ),
    ).toHaveLength(2);
  });

  it('extracts a fenced SVG and repairs bare ampersands', () => {
    const messy =
      'Here is the surface:\n```svg\n' +
      SVG.replace(
        '</svg>',
        '<text id="copy" x="12" y="24" font-size="14" fill="#fff">A & B</text></svg>',
      ) +
      '\n```';
    const proposal = compileSurfaceProposal(REQUEST, {
      ...candidate(),
      svg: messy,
      tracks: [],
    });
    expect(proposal.fragment.elements.copy).toBeDefined();
    expect(proposal.fragment.elements.copy.attributes.text).toBe('A & B');
  });

  it('fits an SVG whose viewBox does not match the project canvas', () => {
    const proposal = compileSurfaceProposal(REQUEST, {
      ...candidate(),
      svg: SVG.replace('viewBox="0 0 320 180"', 'viewBox="0 0 1920 1080"'),
    });
    expect(proposal.width).toBe(320);
    expect(proposal.height).toBe(180);
    expect(proposal.fragment.rootElementIds).toHaveLength(1);
    const root = proposal.fragment.elements[proposal.fragment.rootElementIds[0]];
    expect(root.type).toBe('group');
    expect(Number(root.attributes.scaleX)).toBeGreaterThan(0);
    expect(Number(root.attributes.scaleX)).toBeLessThan(1);
    expect(proposal.warnings.some((warning) => /Scaled the/.test(warning))).toBe(
      true,
    );
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

  it('closes a drifting loop track instead of failing the turn', () => {
    const proposal = compileSurfaceProposal(REQUEST, {
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
    });
    expect(proposal.tracks[0].keyframes.at(-1)?.value).toBe(0);
    expect(
      proposal.warnings.some((warning) => /Closed looping track/.test(warning)),
    ).toBe(true);
  });

  it('normalises string numbers, clamps ranges and merges duplicate times', () => {
    const proposal = compileSurfaceProposal(REQUEST, {
      ...candidate(),
      tracks: [
        {
          elementId: 'orb',
          property: 'opacity',
          keyframes: [
            { timeMs: 0, value: '0.2' },
            { timeMs: 500, value: 1.8 },
            { timeMs: 500, value: 1.4 },
            { timeMs: 9000, value: 0.2 },
          ],
        },
      ],
    });
    const keyframes = proposal.tracks[0].keyframes;
    expect(keyframes).toHaveLength(3);
    expect(keyframes[0].value).toBe(0.2);
    expect(keyframes[1].value).toBe(1);
    expect(keyframes.at(-1)?.timeMs).toBe(4000);
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
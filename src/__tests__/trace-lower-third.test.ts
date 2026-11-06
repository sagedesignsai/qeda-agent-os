import { instantiateLowerThirdTemplate } from '@/lib/trace/templates/lower-third';
import { generateGsapCode } from '@/lib/trace/export/gsap-code';
import { compileProjectToAnimatedSvg } from '@/lib/trace/export/animated-svg';

describe('Lower Third Overlay Template', () => {
  it('instantiates with minimal config', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Test Title',
    });
    expect(project.name).toBe('Lower Third Overlay');
    expect(project.width).toBe(1920);
    expect(project.height).toBe(1080);
    expect(project.durationMs).toBe(4000);
  });

  it('creates background card with correct properties', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title',
    });
    const bgCard = project.elements['bg-card'];

    expect(bgCard).toBeDefined();
    expect(bgCard.type).toBe('rect');
    expect(bgCard.attributes.x).toBe(40);
    expect(bgCard.attributes.y).toBe(880);
    expect(bgCard.attributes.width).toBe(600);
    expect(bgCard.attributes.height).toBe(140);
    expect(bgCard.attributes.rx).toBe(12);
    expect(bgCard.attributes.fill).toBe('#000000');
    expect(bgCard.attributes.opacity).toBe(0.9);
  });

  it('animates card slide-in from left with ease-out', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title',
      enterDurationMs: 400,
    });
    const bgCard = project.elements['bg-card'];
    const xTrack = bgCard.tracks.find((t) => t.property === 'x');

    expect(xTrack).toBeDefined();
    expect(xTrack?.keyframes[0].value).toBeLessThan(0); // Off-screen left
    expect(xTrack?.keyframes[1].value).toBe(40); // Card position
    expect(xTrack?.keyframes[1].timeMs).toBe(400);
    expect(xTrack?.keyframes[1].easing).toBe('power3.out');
  });

  it('animates card fade-in and fade-out', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title',
      durationMs: 4000,
      enterDurationMs: 400,
      exitDurationMs: 300,
    });
    const bgCard = project.elements['bg-card'];
    const opacityTrack = bgCard.tracks.find((t) => t.property === 'opacity');

    expect(opacityTrack).toBeDefined();
    expect(opacityTrack?.keyframes[0].value).toBe(0); // Start transparent
    expect(opacityTrack?.keyframes[1].value).toBe(0.9); // After entrance
    expect(opacityTrack?.keyframes[2].value).toBe(0.9); // Hold
    expect(opacityTrack?.keyframes[3].value).toBe(0); // Fade out at end
  });

  it('creates title text element', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Status Update',
    });
    const titleText = project.elements['title-text'];

    expect(titleText).toBeDefined();
    expect(titleText.type).toBe('text');
    expect(titleText.attributes.text).toBe('Status Update');
    expect(titleText.attributes.fontSize).toBe(32);
    expect(titleText.attributes.fontWeight).toBe(700);
    expect(titleText.attributes.fill).toBe('#ffffff');
  });

  it('creates subtitle text when provided', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title',
      subtitle: 'Step description here',
    });
    const subtitleText = project.elements['subtitle-text'];

    expect(subtitleText).toBeDefined();
    expect(subtitleText.type).toBe('text');
    expect(subtitleText.attributes.text).toBe('Step description here');
    expect(subtitleText.attributes.fontSize).toBe(16);
    expect(subtitleText.attributes.fill).toBe('#cbd5e1');
  });

  it('creates metric badge when provided', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title',
      metric: '5/10',
    });

    expect(project.elements['metric-badge-bg']).toBeDefined();
    expect(project.elements['metric-text']).toBeDefined();

    const metricText = project.elements['metric-text'];
    expect(metricText.attributes.text).toBe('5/10');
    expect(metricText.attributes.fontSize).toBe(24);
    expect(metricText.attributes.fill).toBe('#3b82f6');
  });

  it('animates metric badge slide-in from right', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title',
      metric: '3/12',
      enterDurationMs: 400,
    });
    const badgeBg = project.elements['metric-badge-bg'];
    const xTrack = badgeBg.tracks.find((t) => t.property === 'x');

    expect(xTrack).toBeDefined();
    expect(xTrack?.keyframes[0].value).toBeGreaterThan(1920); // Off-screen right
    expect(xTrack?.keyframes[1].timeMs).toBe(550); // 400 + 150 offset
  });

  it('handles custom timing', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title',
      durationMs: 6000,
      enterDurationMs: 600,
      exitDurationMs: 500,
    });

    expect(project.durationMs).toBe(6000);
    const bgCard = project.elements['bg-card'];
    const xTrack = bgCard.tracks.find((t) => t.property === 'x');
    expect(xTrack?.keyframes[1].timeMs).toBe(600);
  });

  it('generates valid GSAP React code', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Processing',
      subtitle: 'Uploading files...',
      metric: '45%',
    });

    const code = generateGsapCode(project, {
      format: 'react',
      componentName: 'LowerThirdOverlay',
    });

    expect(code).toContain('LowerThirdOverlay');
    expect(code).toContain('useGSAP');
    expect(code).toContain('gsap.timeline');
  });

  it('compiles to animated SVG', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Status',
      subtitle: 'Subtext',
      metric: '100',
    });

    const svg = compileProjectToAnimatedSvg(project, { loop: false });

    expect(svg).toContain('<svg');
    expect(svg).toContain('<animate');
    expect(svg).toContain('Status');
  });

  it('skips subtitle and metric when not provided', () => {
    const project = instantiateLowerThirdTemplate({
      title: 'Title Only',
    });

    expect(project.elements['subtitle-text']).toBeUndefined();
    expect(project.elements['metric-badge-bg']).toBeUndefined();
    expect(project.elements['metric-text']).toBeUndefined();
  });
});

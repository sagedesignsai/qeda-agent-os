import { stageOf } from '@/lib/trace/document';
import { instantiateSponsorCardTemplate } from '@/lib/trace/templates/sponsor-card';
import { generateGsapCode } from '@/lib/trace/export/gsap-code';
import { compileProjectToAnimatedSvg } from '@/lib/trace/export/animated-svg';

describe('Sponsor Card Template', () => {
  it('instantiates with default empty features', () => {
    const project = instantiateSponsorCardTemplate();
    expect(project.name).toBe('Qeda Sponsor Card');
    expect(project.width).toBe(1920);
    expect(project.height).toBe(1080);
    expect(project.durationMs).toBe(3500);
    expect(project.fps).toBe(60);
  });

  it('creates background and glow elements', () => {
    const project = instantiateSponsorCardTemplate();
    expect(stageOf(project).elements['bg-base']).toBeDefined();
    expect(stageOf(project).elements['glow-left']).toBeDefined();
    expect(stageOf(project).elements['glow-right']).toBeDefined();
    expect(stageOf(project).elements['bg-base'].type).toBe('rect');
    expect(stageOf(project).elements['bg-base'].attributes.fill).toBe('#0f172a');
  });

  it('centers the Qeda logo with scale animation', () => {
    const project = instantiateSponsorCardTemplate();
    const logo = stageOf(project).elements['logo-mark'];

    expect(logo).toBeDefined();
    expect(logo.type).toBe('path');
    expect(logo.attributes.fill).toBe('#ffffff');

    const scaleXTrack = logo.tracks.find((t) => t.property === 'scaleX');
    expect(scaleXTrack).toBeDefined();
    expect(scaleXTrack?.keyframes).toHaveLength(2);
    expect(scaleXTrack?.keyframes[0].value).toBe(0.9);
    expect(scaleXTrack?.keyframes[1].value).toBe(1.0);
    expect(scaleXTrack?.keyframes[1].timeMs).toBe(500);
  });

  it('animates logo opacity fade-in', () => {
    const project = instantiateSponsorCardTemplate();
    const logo = stageOf(project).elements['logo-mark'];
    const opacityTrack = logo.tracks.find((t) => t.property === 'opacity');

    expect(opacityTrack).toBeDefined();
    expect(opacityTrack?.keyframes[0].value).toBe(0);
    expect(opacityTrack?.keyframes[1].value).toBe(1);
  });

  it('populates feature list with bullets and text', () => {
    const features = [
      { title: 'Feature One', subtitle: 'Subtitle text' },
      { title: 'Feature Two', subtitle: 'More context' },
      { title: 'Feature Three', subtitle: 'Additional details' },
    ];

    const project = instantiateSponsorCardTemplate(features);

    // Check bullets
    expect(stageOf(project).elements['bullet-0']).toBeDefined();
    expect(stageOf(project).elements['bullet-1']).toBeDefined();
    expect(stageOf(project).elements['bullet-2']).toBeDefined();

    // Check titles
    expect(stageOf(project).elements['title-0']).toBeDefined();
    const title0 = stageOf(project).elements['title-0'];
    expect(title0.type).toBe('text');
    expect(title0.attributes.text).toBe('Feature One');

    // Check subtitles
    expect(stageOf(project).elements['subtitle-0']).toBeDefined();
    const subtitle0 = stageOf(project).elements['subtitle-0'];
    expect(subtitle0.type).toBe('text');
    expect(subtitle0.attributes.text).toBe('Subtitle text');
  });

  it('staggers feature animations by 200ms', () => {
    const features = [
      { title: 'F1' },
      { title: 'F2' },
      { title: 'F3' },
    ];

    const project = instantiateSponsorCardTemplate(features);

    const bullet0 = stageOf(project).elements['bullet-0'];
    const bullet1 = stageOf(project).elements['bullet-1'];
    const bullet2 = stageOf(project).elements['bullet-2'];

    const opacity0 = bullet0.tracks.find((t) => t.property === 'opacity');
    const opacity1 = bullet1.tracks.find((t) => t.property === 'opacity');
    const opacity2 = bullet2.tracks.find((t) => t.property === 'opacity');

    expect(opacity0?.keyframes[0].timeMs).toBe(500);
    expect(opacity1?.keyframes[0].timeMs).toBe(700);
    expect(opacity2?.keyframes[0].timeMs).toBe(900);
  });

  it('generates valid GSAP React code', () => {
    const features = [
      { title: 'Demo Feature', subtitle: 'Demo Subtitle' },
    ];
    const project = instantiateSponsorCardTemplate(features);

    const code = generateGsapCode(project, {
      format: 'react',
      componentName: 'QedaSponsorCard',
    });

    expect(code).toContain('useGSAP');
    expect(code).toContain('QedaSponsorCard');
    expect(code).toContain('gsap.timeline');
    expect(code).toContain('svgMarkup');
  });

  it('compiles to animated SVG', () => {
    const features = [
      { title: 'Feature', subtitle: 'Subtitle' },
    ];
    const project = instantiateSponsorCardTemplate(features);

    const svg = compileProjectToAnimatedSvg(project, { loop: true });

    expect(svg).toContain('<svg');
    expect(svg).toContain('<animate');
    expect(svg).toContain('Qeda Sponsor Card');
  });

  it('handles max 6 features (3 per column)', () => {
    const manyFeatures = Array.from({ length: 10 }, (_, i) => ({
      title: `Feature ${i + 1}`,
    }));

    const project = instantiateSponsorCardTemplate(manyFeatures);

    // Should only create 6 features max
    expect(stageOf(project).elements['bullet-0']).toBeDefined();
    expect(stageOf(project).elements['bullet-5']).toBeDefined();
    expect(stageOf(project).elements['bullet-6']).toBeUndefined();
  });
});

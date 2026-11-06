import {
  COMPOSITION_TEMPLATES,
  getCompositionTemplate,
  instantiateCompositionTemplate,
} from '@/lib/trace/templates';

describe('Trace Templates Catalog', () => {
  it('includes both new templates in the catalog', () => {
    const templateIds = COMPOSITION_TEMPLATES.map((t) => t.id);
    expect(templateIds).toContain('sponsor-card');
    expect(templateIds).toContain('lower-third-overlay');
  });

  it('sponsor-card template has correct metadata', () => {
    const template = getCompositionTemplate('sponsor-card');
    expect(template.id).toBe('sponsor-card');
    expect(template.title).toBe('Sponsor card');
    expect(template.category).toBe('Branding');
    expect(template.width).toBe(1920);
    expect(template.height).toBe(1080);
    expect(template.durationMs).toBe(3500);
    expect(template.previewColor).toBe('#0f172a');
  });

  it('lower-third-overlay template has correct metadata', () => {
    const template = getCompositionTemplate('lower-third-overlay');
    expect(template.id).toBe('lower-third-overlay');
    expect(template.title).toBe('Lower third overlay');
    expect(template.category).toBe('Broadcast');
    expect(template.width).toBe(1920);
    expect(template.height).toBe(1080);
    expect(template.durationMs).toBe(4000);
    expect(template.previewColor).toBe('#1e293b');
  });

  it('instantiates sponsor-card from catalog', () => {
    const project = instantiateCompositionTemplate('sponsor-card', {
      name: 'My Sponsor Card',
    });
    expect(project.name).toBe('My Sponsor Card');
    expect(project.width).toBe(1920);
    expect(project.height).toBe(1080);
    expect(project.durationMs).toBe(3500);
    expect(Object.keys(project.elements).length).toBeGreaterThan(0);
  });

  it('instantiates lower-third-overlay from catalog', () => {
    const project = instantiateCompositionTemplate('lower-third-overlay', {
      name: 'Status Overlay',
      durationMs: 5000,
    });
    expect(project.name).toBe('Status Overlay');
    expect(project.durationMs).toBe(5000); // Respects override
    expect(Object.keys(project.elements).length).toBeGreaterThan(0);
  });

  it('maintains backward compatibility with existing templates', () => {
    const blank = instantiateCompositionTemplate('blank');
    expect(blank.name).toBe('Untitled Trace');
    expect(Object.keys(blank.elements).length).toBe(0);

    const mark = instantiateCompositionTemplate('nova-mark');
    expect(mark.name).toBe('NovaTrace Mark');

    const kinetic = instantiateCompositionTemplate('kinetic-type');
    expect(kinetic.name).toBe('Kinetic Headline');

    const metrics = instantiateCompositionTemplate('metrics');
    expect(metrics.name).toBe('Key Metrics');
  });

  it('returns blank template when templateId is undefined', () => {
    const template = getCompositionTemplate(undefined);
    expect(template.id).toBe('blank');
  });

  it('returns blank template when templateId is unknown', () => {
    const template = getCompositionTemplate('unknown-template');
    expect(template.id).toBe('blank');
  });

  it('all templates have required metadata fields', () => {
    COMPOSITION_TEMPLATES.forEach((template) => {
      expect(template.id).toBeTruthy();
      expect(template.title).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.category).toBeTruthy();
      expect(template.width).toBeGreaterThan(0);
      expect(template.height).toBeGreaterThan(0);
      expect(template.durationMs).toBeGreaterThan(0);
      expect(template.fps).toBeGreaterThan(0);
      expect(template.previewColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof template.create).toBe('function');
    });
  });

  it('templates are grouped by category', () => {
    const categories = COMPOSITION_TEMPLATES.map((t) => t.category);
    expect(categories).toContain('Blank');
    expect(categories).toContain('Branding');
    expect(categories).toContain('Typography');
    expect(categories).toContain('Infographics');
    expect(categories).toContain('Broadcast');
  });

  it('categories for new templates are correct', () => {
    const sponsorCategory = COMPOSITION_TEMPLATES.find(
      (t) => t.id === 'sponsor-card',
    )?.category;
    const lowerThirdCategory = COMPOSITION_TEMPLATES.find(
      (t) => t.id === 'lower-third-overlay',
    )?.category;

    expect(sponsorCategory).toBe('Branding');
    expect(lowerThirdCategory).toBe('Broadcast');
  });
});

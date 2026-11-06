/**
 * examples/lower-third-overlay.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Example: Generate a lower third overlay for task status/progress display.
 *
 * Scenarios:
 *  - Task execution status updates
 *  - Progress indicators with metrics
 *  - Step descriptions during processing
 *
 * Usage:
 *  npx ts-node examples/lower-third-overlay.ts
 */

import { instantiateLowerThirdTemplate } from '@/lib/trace/templates/lower-third';
import { generateGsapCode } from '@/lib/trace/export/gsap-code';
import { compileProjectToAnimatedSvg } from '@/lib/trace/export/animated-svg';

// Example 1: Task Progress
console.log('📊 Example 1: Task Progress Overlay');
console.log('─'.repeat(60));

const progressProject = instantiateLowerThirdTemplate({
  title: 'Building Project',
  subtitle: 'Compiling TypeScript and bundling assets...',
  metric: '7/12',
  durationMs: 5000,
  enterDurationMs: 400,
  exitDurationMs: 300,
});

const progressSvg = compileProjectToAnimatedSvg(progressProject, {
  loop: false,
  includeDimensions: true,
});

console.log('✓ Project generated');
console.log(`  Duration: ${progressProject.durationMs}ms`);
console.log(`  Elements: ${Object.keys(progressProject.elements).length}`);
console.log(`  SVG size: ${progressSvg.length} bytes`);

// Example 2: Status Update with React Export
console.log('\n📝 Example 2: Status Update as React Component');
console.log('─'.repeat(60));

const statusProject = instantiateLowerThirdTemplate({
  title: 'Uploading Files',
  subtitle: 'Transferring 156 MB to server...',
  metric: '87%',
  durationMs: 6000,
  enterDurationMs: 400,
  exitDurationMs: 500,
});

const reactCode = generateGsapCode(statusProject, {
  format: 'react',
  componentName: 'UploadStatusOverlay',
  includeMarkup: true,
  loop: false,
});

console.log('✓ React component generated');
console.log(`  Code length: ${reactCode.length} bytes`);
console.log('\nComponent usage:');
console.log(`  <UploadStatusOverlay autoPlay={true} />`);

// Example 3: Error State
console.log('\n⚠️  Example 3: Error Status Overlay');
console.log('─'.repeat(60));

const errorProject = instantiateLowerThirdTemplate({
  title: 'Failed to Deploy',
  subtitle: 'Network timeout on production server',
  metric: '0/3',
  durationMs: 4000,
});

const errorSvg = compileProjectToAnimatedSvg(errorProject, { loop: false });

console.log('✓ Error overlay generated');
console.log(`  Duration: ${errorProject.durationMs}ms`);
console.log(`  SVG size: ${errorSvg.length} bytes`);

// Example 4: Multi-step Process
console.log('\n🔄 Example 4: Multi-step Process Indicator');
console.log('─'.repeat(60));

const steps = [
  { title: 'Validating Input', metric: '1/5' },
  { title: 'Processing Data', subtitle: 'Running ML model...', metric: '2/5' },
  { title: 'Saving Results', subtitle: 'Writing to database...', metric: '3/5' },
  { title: 'Generating Report', subtitle: 'Creating PDF...', metric: '4/5' },
  { title: 'Complete', subtitle: 'All tasks finished successfully', metric: '5/5' },
];

const stepProjects = steps.map((step, idx) =>
  instantiateLowerThirdTemplate({
    ...step,
    durationMs: 3000 + idx * 500,
    enterDurationMs: 400,
    exitDurationMs: 300,
  }),
);

console.log(`✓ Generated ${stepProjects.length} step overlays`);
stepProjects.forEach((proj, idx) => {
  console.log(`  Step ${idx + 1}: ${proj.durationMs}ms duration`);
});

// Example 5: Vanilla JS Export
console.log('\n📜 Example 5: Vanilla JavaScript Factory');
console.log('─'.repeat(60));

const vanillaCode = generateGsapCode(statusProject, {
  format: 'vanilla',
  componentName: 'createStatusOverlay',
  includeMarkup: true,
  loop: false,
});

console.log('✓ Vanilla factory function generated');
console.log(`  Code length: ${vanillaCode.length} bytes`);
console.log('\nUsage:');
console.log(`  const tl = createStatusOverlay(svgElement, { autoPlay: true });`);
console.log(`  tl.play(); // or tl.pause(), tl.seek(...)`);

console.log('\n✨ All examples complete');
console.log('\nExport options:');
console.log('  • Animated SVG (plays in any browser, no JS)');
console.log('  • GSAP React (React/Next.js component)');
console.log('  • GSAP Vanilla (reusable factory with timeline API)');

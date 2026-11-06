/**
 * examples/sponsor-card-stinger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Example: Generate a Qeda sponsor card stinger with animated logo reveal
 * and staggered feature list.
 *
 * Features:
 *  - Dark slate background with ambient glow accents (3.5s composition)
 *  - Qeda logo scale-up reveal (90% → 100%, 0.5s)
 *  - Two-column feature list with bullet icons
 *  - Staggered fade-in animations (0.2s per feature)
 *  - Export as GSAP React component or standalone animated SVG
 *
 * Usage:
 *  npx ts-node examples/sponsor-card-stinger.ts
 */

import { instantiateSponsorCardTemplate } from '@/lib/trace/templates/sponsor-card';
import { generateGsapCode } from '@/lib/trace/export/gsap-code';
import { compileProjectToAnimatedSvg } from '@/lib/trace/export/animated-svg';

// Define the features to display
const sponsorFeatures = [
  {
    title: 'Local Agent OS',
    subtitle: 'Full machine access from desktop',
  },
  {
    title: 'One-shot Planning',
    subtitle: 'Goal → steps → approval → run',
  },
  {
    title: 'Real Completion',
    subtitle: 'Track every command & result',
  },
  {
    title: 'Workspace Notebooks',
    subtitle: 'Local knowledge + RAG',
  },
  {
    title: 'Terminal Integration',
    subtitle: 'Shell mode & agent autopilot',
  },
  {
    title: 'Task Copilot',
    subtitle: 'AI-assisted focus sessions',
  },
];

// 1. Instantiate the template
console.log('📐 Creating Qeda sponsor card template...');
const project = instantiateSponsorCardTemplate(sponsorFeatures);

console.log(`   Project: ${project.name}`);
console.log(`   Dimensions: ${project.width}×${project.height}px`);
console.log(`   Duration: ${project.durationMs}ms`);
console.log(`   Elements: ${Object.keys(project.elements).length}`);

// 2. Export as GSAP React component
console.log('\n💾 Generating GSAP React code...');
const reactCode = generateGsapCode(project, {
  format: 'react',
  componentName: 'QedaSponsorCardStinger',
  includeMarkup: true,
  loop: true,
});

console.log('   ✓ React component generated');
console.log(`   Code length: ${reactCode.length} bytes`);

// 3. Export as standalone animated SVG
console.log('\n🎬 Compiling to animated SVG...');
const animatedSvg = compileProjectToAnimatedSvg(project, {
  loop: true,
  includeDimensions: true,
});

console.log('   ✓ Animated SVG compiled');
console.log(`   SVG length: ${animatedSvg.length} bytes`);

// 4. Summary
console.log('\n✨ Export Summary');
console.log('─'.repeat(60));
console.log('Format 1: GSAP React Component');
console.log('  → Drop into Next.js/React apps');
console.log('  → Full timeline API for control');
console.log('  → TextPlugin support for dynamic text');
console.log('');
console.log('Format 2: Animated SVG');
console.log('  → Standalone playback in any browser');
console.log('  → No JavaScript runtime required');
console.log('  → Works in <img> and embed contexts');
console.log('');
console.log('✓ Both exports ready for production use');

// Example output files (in a real scenario):
if (process.env.EXPORT_FILES === 'true') {
  const fs = require('fs');
  const path = require('path');

  const outDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outDir, 'QedaSponsorCardStinger.tsx'),
    reactCode,
  );
  fs.writeFileSync(
    path.join(outDir, 'qeda-sponsor-card.svg'),
    animatedSvg,
  );

  console.log('\n📂 Files written to dist/');
  console.log('   - QedaSponsorCardStinger.tsx');
  console.log('   - qeda-sponsor-card.svg');
}

/**
 * scripts/test-openrouter-vision.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validate which OpenRouter models support vision.
 *
 * Run: bun run scripts/test-openrouter-vision.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

interface ModelInfo {
  id: string;
  name: string;
  supports_vision: boolean;
  free_tier: boolean;
  context_length: number;
}

async function getOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ OpenRouter API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = (await response.json()) as any;
    const models = data.data || [];

    return models
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        supports_vision: m.architecture?.modality?.includes('vision') ?? false,
        free_tier: m.id.endsWith(':free') || m.pricing?.prompt === '0',
        context_length: m.context_length || 0,
      }))
      .sort((a: ModelInfo, b: ModelInfo) => {
        // Sort: free + vision first, then free, then vision
        const aScore =
          (a.free_tier ? 100 : 0) + (a.supports_vision ? 50 : 0);
        const bScore =
          (b.free_tier ? 100 : 0) + (b.supports_vision ? 50 : 0);
        return bScore - aScore;
      });
  } catch (error) {
    console.error('❌ Error fetching OpenRouter models:', error);
    return [];
  }
}

async function testModelVision(
  apiKey: string,
  modelId: string,
): Promise<{ works: boolean; error?: string }> {
  try {
    // Create a minimal test image (1x1 pixel PNG)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, // IHDR chunk size
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x01, // width: 1
      0x00, 0x00, 0x00, 0x01, // height: 1
      0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color, etc
      0x90, 0x77, 0x53, 0xde, // CRC
      0x00, 0x00, 0x00, 0x0c, // IDAT chunk size
      0x49, 0x44, 0x41, 0x54, // IDAT
      0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x02, // data
      0x00, 0x01, // CRC start
      0x3e, 0x21, 0xbc, 0x33, // CRC
      0x00, 0x00, 0x00, 0x00, // IEND chunk size
      0x49, 0x45, 0x4e, 0x44, // IEND
      0xae, 0x42, 0x60, 0x82, // CRC
    ]);

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${pngBuffer.toString('base64')}`,
                },
              },
            ],
          },
        ],
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        works: false,
        error: `HTTP ${response.status}: ${error.slice(0, 100)}`,
      };
    }

    const data = (await response.json()) as any;
    if (data.error) {
      return {
        works: false,
        error: data.error.message || String(data.error),
      };
    }

    return { works: true };
  } catch (error) {
    return {
      works: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  // Get API key from environment or .env.local
  let apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/OPENROUTER_API_KEY=(.+)/);
      if (match) {
        apiKey = match[1].trim();
      }
    }
  }

  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY not found in environment or .env.local');
    console.error('   Set OPENROUTER_API_KEY=your_key and try again');
    process.exit(1);
  }

  console.log('📡 Fetching OpenRouter model list...\n');
  const models = await getOpenRouterModels(apiKey);

  if (models.length === 0) {
    console.error('❌ Could not fetch model list from OpenRouter');
    process.exit(1);
  }

  console.log(`✅ Found ${models.length} OpenRouter models\n`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Categorize models
  const freeVisionModels = models.filter((m) => m.free_tier && m.supports_vision);
  const freeTextModels = models.filter((m) => m.free_tier && !m.supports_vision);
  const paidVisionModels = models.filter((m) => !m.free_tier && m.supports_vision);

  console.log(`🎯 VISION CAPABILITY SUMMARY:\n`);
  console.log(`   Free + Vision:     ${freeVisionModels.length} models`);
  console.log(`   Free + Text Only:  ${freeTextModels.length} models`);
  console.log(`   Paid + Vision:     ${paidVisionModels.length} models\n`);

  if (freeVisionModels.length > 0) {
    console.log(`✅ FREE TIER MODELS WITH VISION SUPPORT:\n`);
    for (const model of freeVisionModels.slice(0, 5)) {
      console.log(`   • ${model.id}`);
      console.log(`     Name: ${model.name}`);
      console.log(`     Context: ${model.context_length.toLocaleString()} tokens\n`);
    }
  } else {
    console.log(`❌ NO FREE TIER MODELS WITH VISION SUPPORT\n`);
  }

  console.log(`📄 ALL FREE TIER MODELS (${freeTextModels.length}):\n`);
  for (const model of freeTextModels.slice(0, 10)) {
    console.log(`   • ${model.id} (text-only)`);
  }

  // Test a model if available
  if (freeVisionModels.length > 0) {
    console.log(`\n\n═══════════════════════════════════════════════════════════════════\n`);
    console.log(`🧪 Testing first free vision model: ${freeVisionModels[0].id}\n`);

    const testResult = await testModelVision(apiKey, freeVisionModels[0].id);
    if (testResult.works) {
      console.log(`✅ Vision test PASSED\n`);
      console.log(`   This model CAN process images!\n`);
    } else {
      console.log(`⚠️  Vision test FAILED\n`);
      console.log(`   Error: ${testResult.error}\n`);
    }
  }

  console.log(`═══════════════════════════════════════════════════════════════════\n`);
  console.log(`📋 RECOMMENDATION:\n`);

  if (freeVisionModels.length > 0) {
    console.log(`   ✅ OpenRouter DOES have free vision models!`);
    console.log(`   \n   Suggested update to vision-provider.ts:`);
    console.log(`   - Add OpenRouter vision model as Priority 1`);
    console.log(`   - Then fall back to Gemini, Ollama, SmolVLM2\n`);
  } else {
    console.log(`   ❌ OpenRouter free tier: text-only (no vision)`);
    console.log(`   \n   Paid OpenRouter vision models available (${paidVisionModels.length})`);
    console.log(`   but not recommended for free-tier strategy.\n`);
  }
}

main().catch(console.error);

/**
 * ai/presence-coach.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The AI half of the Presence coach.
 *
 * A single `generateObject` call that returns 3–8 suggestions mixed across
 * kinds (post drafts, platform suggestions, connections, engagement prompts,
 * group suggestions). The system prompt carries the coach persona: warm,
 * encouraging, action-first, celebrates small wins.
 *
 * Reads contacts from the existing contacts table (read-only) to suggest
 * outreach targets — helping the user "knock on doors."
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';

// ─── Model resolution ────────────────────────────────────────────────────────

function activeModel() {
  const settings = getSettings();
  const model = resolveModel(settings.activeProvider, settings.activeModel);
  if (!model) {
    throw new Error(
      'No AI model configured for Presence coach. Set a provider and model in Settings.',
    );
  }
  return model;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const PRESENCE_BATCH_SCHEMA = z.object({
  summary: z.string().describe(
    'A warm, encouraging one-liner summarizing this batch. E.g. "Here are 5 ideas to keep your momentum going."',
  ),
  items: z
    .array(
      z.object({
        kind: z.enum([
          'post_draft',
          'platform_suggestion',
          'connection_suggestion',
          'engagement_prompt',
          'group_suggestion',
        ]),
        title: z.string().describe('Short, action-oriented title.'),
        body: z.string().describe(
          'The suggestion content. For post_draft: the full post text. For others: what to do and why.',
        ),
        platform: z.enum(['linkedin', 'x', 'facebook', 'instagram', 'discord', 'any']),
        sourceKind: z
          .enum(['document', 'page', 'contact'])
          .nullable()
          .describe('What this suggestion is based on, or null.'),
        sourceId: z.string().nullable().describe('ID of the source, or null.'),
      }),
    )
    .min(3)
    .max(8),
});

export interface PresenceSuggestionItem {
  kind:
    | 'post_draft'
    | 'platform_suggestion'
    | 'connection_suggestion'
    | 'engagement_prompt'
    | 'group_suggestion';
  title: string;
  body: string;
  platform: 'linkedin' | 'x' | 'facebook' | 'instagram' | 'discord' | 'any';
  sourceKind: 'document' | 'page' | 'contact' | null;
  sourceId: string | null;
}

export interface PresenceBatchResult {
  summary: string;
  items: PresenceSuggestionItem[];
}

// ─── System prompt ───────────────────────────────────────────────────────────

const COACH_SYSTEM = `You are a warm, encouraging social presence coach. Your job is to help users reconnect with society and build their social media presence, one step at a time.

Principles:
- You propose, you never post. The user takes action manually.
- Write conversational intro lines for each suggestion — like you're talking to them.
- Celebrate small wins. One post is better than zero.
- Mix suggestion kinds: post drafts, platform suggestions, connection prompts, engagement prompts, and group suggestions.
- Use only the context provided. Never invent facts about the user.
- Be action-first: every suggestion should be something the user can do right now.
- Help the user "knock on doors" by suggesting people from their contacts to reach out to.
- Keep suggestions realistic and scoped — don't overwhelm.
- Write post drafts that sound authentic, not corporate.

Platforms: LinkedIn (professional), X/Twitter (short-form), Facebook (community), Instagram (visual), Discord (real-time chat).

Suggestion kinds:
- post_draft: A ready-to-post draft. Write the full text the user can copy.
- platform_suggestion: Propose joining a platform they don't have yet. Explain why.
- connection_suggestion: Suggest reaching out to a specific person. Explain why.
- engagement_prompt: Suggest commenting, liking, or engaging with content.
- group_suggestion: Suggest joining a group or community.`;

// ─── Generate ────────────────────────────────────────────────────────────────

export async function generatePresenceBatch(input: {
  projectId: string;
  focus?: string;
  context?: {
    projectName?: string;
    projectOutcome?: string;
    projectDeadline?: string | null;
    contacts?: Array<{
      name: string;
      role: string;
      id: string;
    }>;
    documentTitles?: string[];
    pageTitles?: string[];
    recentItems?: Array<{
      kind: string;
      status: string;
      feedback: string;
      title: string;
    }>;
    onboardingPlatforms?: string[];
    onboardingGoal?: string;
    streakCount?: number;
  };
}): Promise<PresenceBatchResult> {
  const ctx = input.context ?? {};

  const contactsSection =
    ctx.contacts && ctx.contacts.length > 0
      ? `Contacts (people you can reach out to):
${ctx.contacts.slice(0, 20).map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ''}`).join('\n')}`
      : 'No contacts in the registry yet.';

  const documentsSection =
    ctx.documentTitles && ctx.documentTitles.length > 0
      ? `Recent document titles:
${ctx.documentTitles.slice(0, 20).map((t) => `- ${t}`).join('\n')}`
      : 'No documents yet.';

  const pagesSection =
    ctx.pageTitles && ctx.pageTitles.length > 0
      ? `Workspace page titles:
${ctx.pageTitles.slice(0, 20).map((t) => `- ${t}`).join('\n')}`
      : 'No workspace pages yet.';

  const feedbackSection =
    ctx.recentItems && ctx.recentItems.length > 0
      ? `Recent activity (what the user has tried):
${ctx.recentItems
  .slice(0, 10)
  .map(
    (item) =>
      `- [${item.status}] ${item.title} (${item.kind})${item.feedback ? ` — "${item.feedback}"` : ''}`,
  )
  .join('\n')}`
      : 'No recent activity — this is a fresh start.';

  const onboardingSection =
    ctx.onboardingPlatforms && ctx.onboardingPlatforms.length > 0
      ? `User's platforms: ${ctx.onboardingPlatforms.join(', ')}
${ctx.onboardingGoal ? `Main goal: ${ctx.onboardingGoal}` : ''}`
      : 'Onboarding not yet completed.';

  const streakSection =
    ctx.streakCount !== undefined && ctx.streakCount > 0
      ? `The user is on a ${ctx.streakCount}-day streak. They're building a habit — keep encouraging them.`
      : '';

  const { object } = await generateObject({
    model: activeModel(),
    schema: PRESENCE_BATCH_SCHEMA,
    system: COACH_SYSTEM,
    prompt: `Generate a batch of social presence suggestions for this project.

Project: ${ctx.projectName ?? 'Untitled'}
${ctx.projectOutcome ? `Outcome: ${ctx.projectOutcome}` : ''}
${ctx.projectDeadline ? `Deadline: ${ctx.projectDeadline}` : ''}
${input.focus ? `Focus area: ${input.focus}` : ''}

${contactsSection}

${documentsSection}

${pagesSection}

${feedbackSection}

${onboardingSection}
${streakSection}

Rules:
- Generate 3 to 8 suggestions.
- Mix the kinds: include at least one post_draft. If the user has few platforms, include a platform_suggestion.
- If contacts exist, include at least one connection_suggestion referencing a real contact.
- Write post drafts that are 1–3 short paragraphs, authentic and conversational.
- Each suggestion should feel like the coach is talking to the user, not a sterile task.
- Tailor platforms to the user's onboarding answers if available.
- If the user has a streak, acknowledge it subtly in the summary.`,
  });

  return {
    summary: object.summary,
    items: object.items,
  };
}

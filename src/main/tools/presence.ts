/**
 * tools/presence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Presence Copilot's tools — generate suggestions, read profiles, and
 * manage batches and items.
 *
 * Classes:
 *   • additive  — generate batches, get context (profile, recent items, contacts)
 *   • risky     — update item status, delete items (user-approval required)
 *
 * The factory binds `projectId` in its closure: the AI SDK does not pass a
 * project id to `execute`, so a tool that needs one must be built per project.
 * This mirrors the rest of the tool registry (studio, trace, music).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
  generatePresenceBatch,
  type PresenceSuggestionItem,
} from '../ai/presence-coach.js';
import {
  listBatches,
  getBatchDetail,
  createBatch,
  createItem,
  updateItem,
  deleteItem,
  logPost,
  counts,
  getProfile,
  updateProfile,
  getStreak,
  updateStreak,
  listRecentItems,
  type PresenceBatch,
  type PresenceItem,
  type PresenceProfile,
} from '../db/presence.js';
import { getProject } from '../db/projects.js';
import { listContacts as dbListContacts } from '../db/correspondence.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeProfile(profile: PresenceProfile | null) {
  if (!profile) return null;
  let platforms: string[];
  try {
    platforms = JSON.parse(profile.platforms_json) as string[];
  } catch {
    platforms = [];
  }
  return {
    id: profile.id,
    onboarding_complete: profile.onboarding_complete,
    streak_count: profile.streak_count,
    last_active_date: profile.last_active_date,
    platforms,
    goal: profile.goal,
  };
}

function serializeItem(item: PresenceItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    platform: item.platform,
    status: item.status,
    feedback: item.feedback,
    outcome: item.outcome,
    posted_at: item.posted_at,
  };
}

function serializeBatch(batch: PresenceBatch | null) {
  if (!batch) return null;
  return {
    id: batch.id,
    focus: batch.focus,
    created_at: batch.created_at,
  };
}

// ─── Tool set ─────────────────────────────────────────────────────────────────

export function createPresenceTools(projectId: string | null) {
  /** Presence data is project-scoped; refuse rather than write an orphan row. */
  const requireProjectId = (): string => {
    if (!projectId) {
      throw new Error(
        'No project selected. Pick a project before using presence tools.',
      );
    }
    return projectId;
  };

  // ── Additive tools (no approval gate) ──────────────────────────────────────

  /**
   * Create a new empty batch for presence suggestions. Returns the batch ID so
   * the copilot can add items to it.
   */
  const createPresenceBatch = tool({
    description:
      'Create a new empty batch for presence suggestions. Returns the batch ID so you can add items to it.',
    inputSchema: z.object({
      focus: z
        .string()
        .optional()
        .describe(
          'Optional theme or focus area for this batch (e.g., "LinkedIn thought leadership", "Community engagement").',
        ),
    }),
    execute: async (input) => {
      try {
        const batch = createBatch(requireProjectId(), input.focus ?? '', {
          focus: input.focus,
          createdBy: 'copilot',
        });

        return {
          success: true,
          batch_id: batch.id,
          message: `Created batch "${batch.focus || 'Untitled'}". Now add items using createPresenceItem.`,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * Create a single presence item within a batch.
   */
  const createPresenceItem = tool({
    description:
      'Create a single presence suggestion item within a batch. Use this after creating a batch with createPresenceBatch.',
    inputSchema: z.object({
      batch_id: z.string().describe('The batch ID'),
      kind: z
        .enum([
          'post_draft',
          'platform_suggestion',
          'connection_suggestion',
          'engagement_prompt',
          'group_suggestion',
        ])
        .describe('Type of suggestion'),
      title: z.string().min(1).describe('Short, action-oriented title'),
      body: z
        .string()
        .min(1)
        .describe('The full suggestion text or post draft'),
      platform: z
        .enum(['linkedin', 'x', 'facebook', 'instagram', 'discord', 'any'])
        .describe('Target platform'),
      source_kind: z
        .enum(['document', 'page', 'contact'])
        .optional()
        .describe('What this is based on'),
      source_id: z.string().optional().describe('ID of the source'),
    }),
    execute: async (input) => {
      try {
        const item = createItem(
          input.batch_id,
          input.kind,
          input.title,
          input.body,
          input.platform,
          input.source_kind ?? null,
          input.source_id ?? null,
        );

        return {
          success: true,
          item_id: item.id,
          message: `Created ${input.kind}: "${item.title}"`,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // ── Legacy (backward compatibility) ────────────────────────────────────────

  /**
   * Generate a fresh batch of presence suggestions via the AI coach.
   * The old non-agentic flow. Still available so a parent agent can delegate the
   * whole generation in one call, but the copilot normally uses
   * createPresenceBatch + createPresenceItem.
   */
  const generatePresenceBatchTool = tool({
    description:
      'Generate a new batch of social presence suggestions using the AI coach (non-agentic). Deprecated in favor of createPresenceBatch + createPresenceItem for agentic flows.',
    inputSchema: z.object({
      focus: z
        .string()
        .optional()
        .describe(
          'Optional theme or focus area for this batch (e.g., "LinkedIn thought leadership", "Community engagement"). If omitted, suggestions will be general.',
        ),
    }),
    execute: async (input) => {
      try {
        const scopedProjectId = requireProjectId();

        // Gather context
        const contacts = dbListContacts(scopedProjectId).slice(0, 20);
        const recentItems = listRecentItems(scopedProjectId, 10);
        const profile = getProfile(scopedProjectId);
        const project = getProject(scopedProjectId);

        const result = await generatePresenceBatch({
          projectId: scopedProjectId,
          focus: input.focus,
          context: {
            projectName: project?.name ?? '',
            projectOutcome: (project as any)?.outcome ?? '',
            projectDeadline: (project as any)?.deadline ?? null,
            contacts: contacts.map((c: any) => ({
              name: c.name,
              role: c.role,
              id: c.id,
            })),
            recentItems: recentItems.map((item) => ({
              kind: item.kind,
              status: item.status,
              feedback: item.feedback,
              title: item.title,
            })),
            onboardingPlatforms: profile
              ? (JSON.parse(profile.platforms_json) as string[])
              : [],
            onboardingGoal: profile?.goal ?? '',
            streakCount: profile?.streak_count ?? 0,
          },
        });

        // Create batch and items
        const batch = createBatch(scopedProjectId, input.focus ?? '', {
          focus: input.focus,
          generatedAt: Math.floor(Date.now() / 1000),
        });

        result.items.forEach((item: PresenceSuggestionItem) => {
          createItem(
            batch.id,
            item.kind,
            item.title,
            item.body,
            item.platform,
            item.sourceKind,
            item.sourceId,
          );
        });

        return {
          success: true,
          batch_id: batch.id,
          summary: result.summary,
          item_count: result.items.length,
          message: `Generated ${result.items.length} suggestions: ${result.summary}`,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * Get the user's presence profile: onboarding status, streak, platforms, goal.
   */
  const getPresenceProfile = tool({
    description:
      "Retrieve the user's presence profile: onboarding status, streak count, selected platforms, and goal.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const profile = getProfile(requireProjectId());
        return {
          success: true,
          profile: serializeProfile(profile),
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * Get the user's current streak.
   */
  const getPresenceStreak = tool({
    description:
      "Get the user's current presence streak: count and last active date.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const streak = getStreak(requireProjectId());
        return {
          success: true,
          ...streak,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * List all batches for this project.
   */
  const listPresenceBatches = tool({
    description:
      'List all presence suggestion batches for this project, most recent first.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const batches = listBatches(requireProjectId());
        return {
          success: true,
          batches: batches.map(serializeBatch),
          count: batches.length,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * Get a batch with its items.
   */
  const getPresenceBatch = tool({
    description: 'Retrieve a specific batch with all its suggestion items.',
    inputSchema: z.object({
      batch_id: z.string().describe('The batch ID'),
    }),
    execute: async (input) => {
      try {
        const detail = getBatchDetail(input.batch_id);
        if (!detail) {
          return { success: false, error: 'Batch not found' };
        }
        return {
          success: true,
          batch: serializeBatch(detail.batch),
          items: detail.items.map(serializeItem),
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * List recent items with their status for AI context.
   */
  const listRecentPresenceItems = tool({
    description:
      'List recent presence items (completed, skipped, edited) to understand what suggestions resonated with the user.',
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Max items to return; default 10.'),
    }),
    execute: async (input) => {
      try {
        const items = listRecentItems(requireProjectId(), input.limit ?? 10);
        return {
          success: true,
          items: items.map(serializeItem),
          count: items.length,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * Get presence stats: batch count, pending/done/skipped items.
   */
  const getPresenceCounts = tool({
    description:
      'Get overall presence stats: number of batches and item statuses.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const c = counts(requireProjectId());
        return {
          success: true,
          ...c,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // ── Risky tools (approval-gated) ───────────────────────────────────────────

  /**
   * Update an item's status, feedback, body, or mark it as posted.
   * Approval-gated.
   */
  const updatePresenceItem = tool({
    description:
      'Update a presence item: mark as done/skipped/edited, add feedback, or update the body text. Automatically updates the streak if marked done.',
    inputSchema: z.object({
      item_id: z.string().describe('The item ID'),
      status: z
        .enum(['pending', 'done', 'skipped', 'edited'])
        .optional()
        .describe('New status'),
      feedback: z
        .string()
        .optional()
        .describe('User feedback or outcome notes'),
      body: z.string().optional().describe('Updated item body text'),
      posted_at: z
        .number()
        .optional()
        .describe('Unix timestamp if the item was posted'),
    }),
    execute: async (input) => {
      try {
        const scopedProjectId = requireProjectId();
        const updated = updateItem(input.item_id, {
          status: input.status,
          feedback: input.feedback,
          body: input.body,
          posted_at: input.posted_at,
        });

        if (!updated) {
          return { success: false, error: 'Item not found' };
        }

        // Update streak if marked done/edited (the same rule the IPC path uses).
        if (input.status === 'done' || input.status === 'edited') {
          const newStreak = updateStreak(scopedProjectId);
          return {
            success: true,
            item: serializeItem(updated),
            streak_updated: newStreak,
          };
        }

        return {
          success: true,
          item: serializeItem(updated),
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * Delete an item.
   * Approval-gated.
   */
  const deletePresenceItem = tool({
    description: 'Delete a presence suggestion item.',
    inputSchema: z.object({
      item_id: z.string().describe('The item ID to delete'),
    }),
    execute: async (input) => {
      try {
        const deleted = deleteItem(input.item_id);
        if (!deleted) {
          return { success: false, error: 'Item not found' };
        }
        return { success: true, message: 'Item deleted' };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  /**
   * Update the profile: onboarding, platforms, goal.
   * Approval-gated.
   */
  const updatePresenceProfile = tool({
    description:
      'Update the presence profile: mark onboarding complete, set selected platforms, or define the main goal.',
    inputSchema: z.object({
      onboarding_complete: z
        .boolean()
        .optional()
        .describe('Mark onboarding as complete'),
      platforms: z
        .array(z.string())
        .optional()
        .describe(
          'Selected platforms: linkedin, x, facebook, instagram, discord',
        ),
      goal: z
        .enum(['personal_brand', 'business_growth', 'networking', 'learning'])
        .optional()
        .describe("The user's main presence goal"),
    }),
    execute: async (input) => {
      try {
        const profile = updateProfile(requireProjectId(), {
          onboarding_complete: input.onboarding_complete,
          platforms_json: input.platforms
            ? JSON.stringify(input.platforms)
            : undefined,
          goal: input.goal,
        });

        return {
          success: true,
          profile: serializeProfile(profile),
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // ── Tool registry ──────────────────────────────────────────────────────────

  return {
    // Batch and item creation (agentic flow)
    createPresenceBatch,
    createPresenceItem,
    // Batch generation (backward compat)
    generatePresenceBatch: generatePresenceBatchTool,
    // Read context
    getPresenceProfile,
    getPresenceStreak,
    listPresenceBatches,
    getPresenceBatch,
    listRecentPresenceItems,
    getPresenceCounts,
    // Mutations (approval-gated)
    updatePresenceItem,
    deletePresenceItem,
    updatePresenceProfile,
    // Dispatch is a separate UI action, not an autonomous agent verb.
    logPresencePost: tool({
      description:
        'Record a post the user published manually. Only call this when the user confirms they posted it.',
      inputSchema: z.object({
        platform: z
          .enum(['linkedin', 'x', 'facebook', 'instagram', 'discord', 'any'])
          .describe('Where it was posted'),
        content: z.string().min(1).describe('The published content'),
        metrics: z.string().optional().describe('Any engagement metrics'),
        item_id: z.string().optional().describe('Related suggestion item id'),
      }),
      execute: async (input) => {
        try {
          const post = logPost(
            requireProjectId(),
            input.platform,
            input.content,
            input.metrics ?? '',
            input.item_id ?? null,
          );
          return { success: true, post };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  };
}

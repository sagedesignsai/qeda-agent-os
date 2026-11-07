# Qeda Copilots Architecture

Complete inspection of all AI/Agent systems, their tools, and approval policies.

## Quick Reference

| Copilot | Purpose | Budget | Cached | Tools | Approval |
|---------|---------|--------|--------|-------|----------|
| **Chat Agent** | General conversation, research, notebooks | 40/60/120 | Yes | 27 groups | Derived from `chatToolPolicies` |
| **Terminal Agent** | Shell commands with approval gates | 20 | No | 3 (shell + read + plan) | Every `runShell` needs approval |
| **Task Copilot** | Focus, breakdown, scheduling | 25 | No | 28 | Derived from `copilotToolPolicies` (strict on cost) |
| **Studio Copilot** | Video editing, timeline, captions | 25 | No | 8 | Auto-approved (editing domain) |
| **Motion Copilot** | 3D scene building, animation | 25 | No | 4 | Auto-approved (scene ops) |
| **Music Copilot** | DJ, playlists, ambience | 20 | No | 8 | Auto-approved (library domain) |
| **Correspondence Copilot** | Message drafting, recipient logic | 25 | No | 6 | Auto-approved (read); destructive ops gated |
| **Document Drafter** | Professional document writing | 20 | No | 9 | Only `replaceBlock` needs approval |
| **Model Builder** | 3D geometry/scene composition | 25 | No | 4 | Auto-approved (same as motion, no animation) |

## Files in This Directory

- **`README.md`** – This file; quick reference and navigation
- **`core-chat-agent.md`** – Chat agent: general-purpose desktop agent
- **`terminal-agent.md`** – Terminal agent: shell command executor
- **`task-copilot.md`** – Task copilot: focus & productivity
- **`studio-copilot.md`** – Studio copilot: video editing
- **`motion-copilot.md`** – Motion copilot: 3D animation
- **`music-copilot.md`** – Music copilot: DJ & playlists
- **`correspondence-copilot.md`** – Correspondence copilot: message management
- **`document-drafter.md`** – Document drafter: professional documents
- **`model-builder.md`** – Model builder: 3D geometry
- **`tool-registry.md`** – Complete tool inventory (28 files, 47+ tools)
- **`approval-policies.md`** – How approval derivation works
- **`architecture.md`** – System design, IPC orchestration, caching

## Key Principles

1. **One Approval Source**: `createApprovalPolicy(policyMap)` in `capability.ts` is the single source of truth for approval decisions across UI, IPC, and agents.

2. **Fail Closed**: Unknown tools are denied, not passed through silently.

3. **Per-Turn Rebuilds**: Copilots rebuild on every turn so system prompts carry current time (critical for scheduling, dating documents).

4. **Safety in Tool Sets**: For sensitive domains (drafter, correspondence), the real safety boundary is the **deliberately absent tools**, not the prompt.

5. **Scoped Access**: 
   - Drafter: project folder only (`listProjectFiles`, `readProjectFile`)
   - Correspondence: read board + record; cannot send
   - Terminal: pure shell; no network, workspace, clipboard

6. **Grounding First**: All agents prefer "read before write"—search/fetch/scan rather than inventing facts.

## Navigation

**System Design & Architecture:**
- Start here: `architecture.md` for IPC flow, caching, rebuild strategy
- Tool inventory: `tool-registry.md` (what each file contains, which agents use it)
- Approval system: `approval-policies.md` (derivation engine, policy maps, why overrides exist)

**Per-Agent Deep Dive:**
- General-purpose: `core-chat-agent.md` (27 tool groups, 3 modes, caching strategy)
- Command execution: `terminal-agent.md` (stateful loop, block-level approval)
- Productivity: `task-copilot.md` (task verbs, grounding, destructive gates)
- Creative domains:
  - `studio-copilot.md` (video editing, timeline, marketing)
  - `motion-copilot.md` (3D scenes, keyframe animation, procedural geometry)
  - `music-copilot.md` (library grounding, playlists, focus integration)
- Correspondence: `correspondence-copilot.md` ("Qeda does not send" principle)
- Document authoring:
  - `document-drafter.md` (block-level writes, approval on destructive)
  - `model-builder.md` (3D geometry, no timeline)

## Quick Start: Finding What You Need

**Q: "How do I understand approval gates?"**
→ `approval-policies.md` (derivation engine) + agent-specific docs

**Q: "Where do tools live and what does each agent get?"**
→ `tool-registry.md` (all 28 files, which agents use them)

**Q: "How are agents cached and rebuilt?"**
→ `architecture.md` § IPC Orchestration

**Q: "What is the difference between terminal agent and task copilot?"**
→ `terminal-agent.md` vs `task-copilot.md`; see `architecture.md` for when each is used

**Q: "Can the drafter send emails or export files?"**
→ `document-drafter.md` § Safety Boundary (deliberately absent tools)

**Q: "How does correspondence drafting work?"**
→ `correspondence-copilot.md` § "Qeda Does Not Send" principle

**Q: "What is the step budget and why does it differ?"**
→ Each agent doc lists its budget; `architecture.md` explains the reasoning

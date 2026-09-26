/**
 * lib/workflows.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parameterized Workflows (Runbooks) for Vellum Terminal (Warp Pillar 4).
 *
 * Replaces memorized shell one-liners with parameterized, structured templates:
 *   e.g. `lsof -ti:{{port:3000}} | xargs kill -9`
 *   e.g. `git checkout -b {{branch_name}} origin/{{base_branch:main}}`
 *
 * Parameters support syntax:
 *   - `{{param_name}}` (required/blank default)
 *   - `{{param_name:default_value}}` (pre-filled default)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface WorkflowParam {
  name: string;
  defaultValue?: string;
  description?: string;
}

export interface TerminalWorkflow {
  id: string;
  name: string;
  description: string;
  command: string;
  category: 'git' | 'docker' | 'system' | 'ports' | 'dev' | 'custom';
  params: WorkflowParam[];
  isCustom?: boolean;
}

/** Regex matching `{{name}}` or `{{name:default}}` */
export const PARAM_REGEX = /\{\{([a-zA-Z0-9_-]+)(?::([^}]+))?\}\}/g;

/**
 * Extracts unique parameters from a command template.
 */
export function extractWorkflowParams(command: string): WorkflowParam[] {
  const seen = new Set<string>();
  const params: WorkflowParam[] = [];
  const regex = new RegExp(PARAM_REGEX.source, 'g');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(command)) !== null) {
    const name = match[1];
    const defaultValue = match[2];
    if (!seen.has(name)) {
      seen.add(name);
      params.push({
        name,
        defaultValue: defaultValue !== undefined ? defaultValue.trim() : undefined,
      });
    }
  }

  return params;
}

/**
 * Replaces `{{param}}` and `{{param:default}}` placeholders with values from
 * `paramValues`. Falls back to the template default or an empty string.
 */
export function interpolateWorkflow(
  command: string,
  paramValues: Record<string, string>,
): string {
  return command.replace(PARAM_REGEX, (_fullMatch, name: string, defaultValue?: string) => {
    const provided = paramValues[name];
    if (provided !== undefined && provided.trim() !== '') {
      return provided.trim();
    }
    return defaultValue !== undefined ? defaultValue.trim() : '';
  });
}

// ─── Built-in Curated Runbooks ────────────────────────────────────────────────

export const BUILTIN_WORKFLOWS: TerminalWorkflow[] = [
  // Ports & Processes
  {
    id: 'ports-kill',
    name: 'Kill Process on Port',
    description: 'Find whatever process is holding a port and forcefully terminate it.',
    command: 'lsof -ti:{{port:3000}} | xargs kill -9',
    category: 'ports',
    params: [{ name: 'port', defaultValue: '3000', description: 'Port number to free up' }],
  },
  {
    id: 'ports-find',
    name: 'Find Process on Port',
    description: 'Inspect the process listening on a given network port.',
    command: 'lsof -i :{{port:3000}}',
    category: 'ports',
    params: [{ name: 'port', defaultValue: '3000', description: 'Port number to inspect' }],
  },
  {
    id: 'ports-listening',
    name: 'List All Listening Ports',
    description: 'Show all local open listening TCP/UDP sockets.',
    command: 'ss -tuln 2>/dev/null || netstat -tuln',
    category: 'ports',
    params: [],
  },

  // Docker
  {
    id: 'docker-clean-images',
    name: 'Prune Dangling Images',
    description: 'Remove all untagged / dangling Docker images.',
    command: 'docker rmi $(docker images -f "dangling=true" -q) 2>/dev/null || docker image prune -f',
    category: 'docker',
    params: [],
  },
  {
    id: 'docker-stop-all',
    name: 'Stop All Containers',
    description: 'Gracefully stop all currently running Docker containers.',
    command: 'docker stop $(docker ps -q)',
    category: 'docker',
    params: [],
  },
  {
    id: 'docker-logs-tail',
    name: 'Tail Container Logs',
    description: 'Stream realtime stdout/stderr logs from a specific container.',
    command: 'docker logs -f --tail {{lines:100}} {{container_name}}',
    category: 'docker',
    params: [
      { name: 'lines', defaultValue: '100', description: 'Number of past lines to show' },
      { name: 'container_name', defaultValue: '', description: 'Container ID or name' },
    ],
  },
  {
    id: 'docker-exec-sh',
    name: 'Exec Shell into Container',
    description: 'Open an interactive shell inside a running container.',
    command: 'docker exec -it {{container_name}} {{shell:sh}}',
    category: 'docker',
    params: [
      { name: 'container_name', defaultValue: '', description: 'Target container' },
      { name: 'shell', defaultValue: 'sh', description: 'Shell binary (sh, bash)' },
    ],
  },

  // Git
  {
    id: 'git-new-branch',
    name: 'Create & Switch Branch',
    description: 'Create a new git branch from base and check it out.',
    command: 'git checkout -b {{branch_name}} {{base_branch:HEAD}}',
    category: 'git',
    params: [
      { name: 'branch_name', defaultValue: '', description: 'Name of the new branch' },
      { name: 'base_branch', defaultValue: 'HEAD', description: 'Start point' },
    ],
  },
  {
    id: 'git-delete-branch',
    name: 'Force Delete Local Branch',
    description: 'Force delete a local git branch that is no longer needed.',
    command: 'git branch -D {{branch_name}}',
    category: 'git',
    params: [{ name: 'branch_name', defaultValue: '', description: 'Branch to delete' }],
  },
  {
    id: 'git-log-graph',
    name: 'Visual Commit History',
    description: 'Print a compact, colorful commit tree graph.',
    command: 'git log --graph --oneline --decorate -n {{count:15}}',
    category: 'git',
    params: [{ name: 'count', defaultValue: '15', description: 'Number of commits' }],
  },
  {
    id: 'git-discard-changes',
    name: 'Discard All Local Changes',
    description: 'Revert modified tracked files and clean untracked files.',
    command: 'git restore . && git clean -fd',
    category: 'git',
    params: [],
  },

  // System & Files
  {
    id: 'system-find-large-files',
    name: 'Find Large Files',
    description: 'Locate files exceeding a specific size threshold.',
    command: 'find {{directory:.}} -type f -size +{{min_size:50M}} -exec ls -lh {} + 2>/dev/null',
    category: 'system',
    params: [
      { name: 'directory', defaultValue: '.', description: 'Directory to search' },
      { name: 'min_size', defaultValue: '50M', description: 'Minimum size (e.g. 10M, 100M, 1G)' },
    ],
  },
  {
    id: 'system-folder-sizes',
    name: 'Folder Disk Usage Summary',
    description: 'Calculate disk space used by directories, sorted largest first.',
    command: 'du -sh {{path:./*}} 2>/dev/null | sort -hr | head -n {{limit:10}}',
    category: 'system',
    params: [
      { name: 'path', defaultValue: './*', description: 'Target path or glob' },
      { name: 'limit', defaultValue: '10', description: 'Top N directories' },
    ],
  },
  {
    id: 'system-top-procs',
    name: 'Top Memory/CPU Processes',
    description: 'Display top running processes sorted by memory consumption.',
    command: 'ps aux --sort=-%mem | head -n {{lines:15}}',
    category: 'system',
    params: [{ name: 'lines', defaultValue: '15', description: 'Number of processes' }],
  },

  // Dev & Project
  {
    id: 'dev-clean-node-modules',
    name: 'Clean & Reinstall Node Modules',
    description: 'Remove node_modules and lockfiles, then trigger a fresh install.',
    command: 'rm -rf node_modules package-lock.json && npm install',
    category: 'dev',
    params: [],
  },
  {
    id: 'dev-grep-todos',
    name: 'Find TODO and FIXME Tags',
    description: 'Search repository code for TODO, FIXME, or HACK comments.',
    command: 'grep -rnE "(TODO|FIXME|HACK):" {{path:.}} --exclude-dir=node_modules --exclude-dir=.git',
    category: 'dev',
    params: [{ name: 'path', defaultValue: '.', description: 'Directory path' }],
  },
];

// ─── Local Storage for Custom Workflows ────────────────────────────────────────

const CUSTOM_WORKFLOWS_STORAGE_KEY = 'docugent_custom_workflows_v1';

export function getCustomWorkflows(): TerminalWorkflow[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(CUSTOM_WORKFLOWS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TerminalWorkflow[];
  } catch {
    return [];
  }
}

export function saveCustomWorkflow(workflow: Omit<TerminalWorkflow, 'id' | 'isCustom'>): TerminalWorkflow {
  const customList = getCustomWorkflows();
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const created: TerminalWorkflow = {
    ...workflow,
    id,
    isCustom: true,
    category: 'custom',
    params: workflow.params?.length ? workflow.params : extractWorkflowParams(workflow.command),
  };
  const updated = [created, ...customList];
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(CUSTOM_WORKFLOWS_STORAGE_KEY, JSON.stringify(updated));
  }
  return created;
}

export function deleteCustomWorkflow(id: string): void {
  const customList = getCustomWorkflows();
  const filtered = customList.filter((w) => w.id !== id);
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(CUSTOM_WORKFLOWS_STORAGE_KEY, JSON.stringify(filtered));
  }
}

export function getAllWorkflows(): TerminalWorkflow[] {
  return [...getCustomWorkflows(), ...BUILTIN_WORKFLOWS];
}

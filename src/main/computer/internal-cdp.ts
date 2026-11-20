/**
 * computer/internal-cdp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic "self-driving" channel for Electron windows Qeda owns.
 * Uses webContents.debugger (CDP) to read the accessibility tree and direct
 * DOM/Runtime commands to inspect and manipulate without moving the OS cursor.
 */

import type { BrowserWindow, WebContents } from 'electron';
import type { SemanticElement, SemanticSnapshot } from './tree-diff.js';

type DebuggerTarget = {
  win: BrowserWindow;
  wc: WebContents;
};

function getElectron(): any {
  try {
    return require('electron');
  } catch {
    return null;
  }
}

function listQedaWindows(): BrowserWindow[] {
  const electron = getElectron();
  const BW = electron?.BrowserWindow;
  if (!BW?.getAllWindows) return [];
  try {
    return BW.getAllWindows().filter((w: BrowserWindow) => {
      try {
        return !w.isDestroyed();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

export function resolveInternalTarget(opts?: {
  windowId?: string | number;
  titleIncludes?: string;
}): DebuggerTarget | null {
  const wins = listQedaWindows();
  if (wins.length === 0) return null;

  let chosen: BrowserWindow | undefined;
  if (opts?.windowId != null) {
    const id = Number(opts.windowId);
    chosen = wins.find((w) => w.id === id);
  }
  if (!chosen && opts?.titleIncludes) {
    const needle = opts.titleIncludes.toLowerCase();
    chosen = wins.find((w) => {
      try {
        return w.getTitle().toLowerCase().includes(needle);
      } catch {
        return false;
      }
    });
  }
  if (!chosen) {
    // Prefer focused, else first visible.
    chosen =
      wins.find((w) => {
        try {
          return w.isFocused();
        } catch {
          return false;
        }
      }) ??
      wins.find((w) => {
        try {
          return w.isVisible();
        } catch {
          return false;
        }
      }) ??
      wins[0];
  }
  if (!chosen) return null;
  try {
    return { win: chosen, wc: chosen.webContents };
  } catch {
    return null;
  }
}

async function withDebugger<T>(wc: WebContents, fn: () => Promise<T>): Promise<T> {
  const dbg = wc.debugger;
  const wasAttached = (() => {
    try {
      return dbg.isAttached();
    } catch {
      return false;
    }
  })();
  if (!wasAttached) {
    dbg.attach('1.3');
  }
  try {
    return await fn();
  } finally {
    if (!wasAttached) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
  }
}

function axValue(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v.value === 'string') return v.value;
  if (typeof v.value === 'number' || typeof v.value === 'boolean') return String(v.value);
  return undefined;
}

function mapAxNode(node: any, ref: string): SemanticElement {
  const actions: string[] = [];
  const states: string[] = [];
  if (Array.isArray(node?.properties)) {
    for (const p of node.properties) {
      if (!p?.name) continue;
      if (p.name === 'focusable' && p.value?.value) states.push('focusable');
      if (p.name === 'focused' && p.value?.value) states.push('focused');
      if (p.name === 'disabled' && p.value?.value) states.push('disabled');
      if (p.name === 'editable' && p.value?.value) states.push('editable');
      if (p.name === 'expanded' && p.value?.value === true) states.push('expanded');
      if (p.name === 'checked' && p.value?.value === true) states.push('checked');
    }
  }
  // CDP AX nodes don't always expose actions directly; infer common ones.
  const role = axValue(node?.role);
  if (role && /button|link|menuitem|tab|checkbox|radio/i.test(role)) actions.push('click');
  if (role && /textbox|searchbox|combobox|textarea/i.test(role)) actions.push('setValue');

  return {
    ref,
    role,
    name: axValue(node?.name),
    description: axValue(node?.description),
    value: axValue(node?.value),
    actions: actions.length ? actions : undefined,
    states: states.length ? states : undefined,
  };
}

export async function getInternalAppState(opts?: {
  windowId?: string | number;
  titleIncludes?: string;
}): Promise<SemanticSnapshot | { error: string }> {
  const target = resolveInternalTarget(opts);
  if (!target) return { error: 'No Qeda window found for internal inspection.' };
  const { win, wc } = target;

  try {
    return await withDebugger(wc, async () => {
      try {
        await wc.debugger.sendCommand('Accessibility.enable');
      } catch {
        // some runtimes auto-enable
      }
      let ax: any;
      try {
        ax = await wc.debugger.sendCommand('Accessibility.getFullAXTree');
      } catch (e) {
        return { error: `Failed to read accessibility tree: ${(e as Error).message}` };
      }
      const nodes: any[] = Array.isArray(ax?.nodes) ? ax.nodes : [];
      const elements: Record<string, SemanticElement> = {};
      const roots: string[] = [];
      let i = 1;
      for (const n of nodes) {
        // Skip ignored nodes to keep output compact.
        if (n?.ignored) continue;
        const role = axValue(n?.role);
        const name = axValue(n?.name);
        // Keep nodes that are meaningful for interaction or structure.
        if (!role && !name) continue;
        const ref = `@e${i++}`;
        const el = mapAxNode(n, ref);
        // Preserve backend DOM node id for actions when available.
        if (n?.backendDOMNodeId != null) {
          (el as any).backendDOMNodeId = n.backendDOMNodeId;
        }
        if (n?.nodeId) (el as any).nodeId = n.nodeId;
        if (el.role === 'RootWebArea' || el.role === 'WebArea') roots.push(ref);
        elements[ref] = el;
        if (i > 500) break; // cap for prompt size
      }
      if (roots.length === 0 && Object.keys(elements).length) {
        roots.push(Object.keys(elements)[0]);
      }
      let title = '';
      try {
        title = win.getTitle();
      } catch {
        title = '';
      }
      return {
        at: Date.now(),
        app: 'qeda',
        windowId: String(win.id),
        title,
        elements,
        roots,
      } satisfies SemanticSnapshot;
    });
  } catch (e) {
    return { error: (e as Error).message || 'Internal CDP inspection failed.' };
  }
}

export async function internalClickElement(opts: {
  windowId?: string | number;
  elementRef?: string;
  backendDOMNodeId?: number;
  selector?: string;
}): Promise<{ success: boolean; error?: string }> {
  const target = resolveInternalTarget({ windowId: opts.windowId });
  if (!target) return { success: false, error: 'No Qeda window found.' };
  const { wc } = target;
  try {
    if (opts.selector) {
      await wc.executeJavaScript(
        `(() => { const el = document.querySelector(${JSON.stringify(opts.selector)}); if (!el) throw new Error('Element not found'); el.click(); return true; })()`,
        true,
      );
      return { success: true };
    }
    if (opts.backendDOMNodeId != null) {
      return await withDebugger(wc, async () => {
        try {
          await wc.debugger.sendCommand('DOM.enable');
        } catch {}
        const { object } = await wc.debugger.sendCommand('DOM.resolveNode', {
          backendNodeId: opts.backendDOMNodeId,
        } as any);
        if (!object?.objectId) throw new Error('Could not resolve DOM node');
        await wc.debugger.sendCommand('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: 'function(){ this.scrollIntoViewIfNeeded?.(); this.click?.(); }',
          returnByValue: true,
        } as any);
        return { success: true };
      });
    }
    return { success: false, error: 'No actionable element target provided.' };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function internalSetValue(opts: {
  windowId?: string | number;
  backendDOMNodeId?: number;
  selector?: string;
  value: string;
}): Promise<{ success: boolean; error?: string }> {
  const target = resolveInternalTarget({ windowId: opts.windowId });
  if (!target) return { success: false, error: 'No Qeda window found.' };
  const { wc } = target;
  try {
    if (opts.selector) {
      await wc.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(opts.selector)});
          if (!el) throw new Error('Element not found');
          const v = ${JSON.stringify(opts.value)};
          if ('value' in el) el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`,
        true,
      );
      return { success: true };
    }
    if (opts.backendDOMNodeId != null) {
      return await withDebugger(wc, async () => {
        try {
          await wc.debugger.sendCommand('DOM.enable');
        } catch {}
        const { object } = await wc.debugger.sendCommand('DOM.resolveNode', {
          backendNodeId: opts.backendDOMNodeId,
        } as any);
        if (!object?.objectId) throw new Error('Could not resolve DOM node');
        await wc.debugger.sendCommand('Runtime.callFunctionOn', {
          objectId: object.objectId,
          arguments: [{ value: opts.value }],
          functionDeclaration: `function(v){
            this.focus?.();
            if ('value' in this) this.value = v;
            if (this.isContentEditable) this.textContent = v;
            this.dispatchEvent(new Event('input', { bubbles: true }));
            this.dispatchEvent(new Event('change', { bubbles: true }));
          }`,
          returnByValue: true,
        } as any);
        return { success: true };
      });
    }
    return { success: false, error: 'No target element provided.' };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

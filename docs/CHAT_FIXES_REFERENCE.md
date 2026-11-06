# Chat Page Fixes - Quick Reference

## 1️⃣ Stop/Abort Streaming

### Added IPC Channel
```typescript
// src/main/ipc/channels.ts
'agent:abort': { req: void; res: void };
```

### Handler Implementation
```typescript
// src/main/ipc/handlers/agent-chat.ts
const activeStreamControllers = new Map<string, AbortController>();

// In handler: create/track controller
const abortController = new AbortController();
activeStreamControllers.set(sessionId, abortController);

// Register abort handler
ipcMain.handle('agent:abort', async () => {
  for (const controller of activeStreamControllers.values()) {
    controller.abort();
  }
  activeStreamControllers.clear();
});
```

### Hook Export
```typescript
// src/hooks/use-agent-chat.ts
export interface UseAgentChatReturn {
  // ... other fields
  abortStream: () => void;  // NEW
}

const abortStream = useCallback(() => {
  if (!streamingRef.current) return;
  window.electron.ipc.invoke('agent:abort').catch(() => {});
}, []);
```

### Wire to UI
```typescript
// src/renderer/pages/Chat.tsx
<ChatWelcome onStop={abortStream} {...} />
<ChatInput onStop={abortStream} {...} />
```

---

## 2️⃣ Removed ModelIndicator

### Before
```typescript
function ModelIndicator() {
  const [label, setLabel] = useState('');
  // ... fetch + listen to settings:changed
  return <span>{label}</span>;
}

export function ChatWelcome({ onSend, disabled, isStreaming }) {
  const footerLeft = <ModelIndicator />;
  return (
    <ChatInput footerLeft={footerLeft} {...} />
  );
}
```

### After
```typescript
export function ChatWelcome({ onSend, onStop, disabled, isStreaming }) {
  return (
    <ChatInput onStop={onStop} {...} />
  );
}
```

---

## 3️⃣ Fix Plan Leak

### Before
```typescript
export function useIpcPlan(channel, messages) {
  const [livePlan, setLivePlan] = useState(null);
  // No sessionId tracking - plan survives route changes
}
```

### After
```typescript
export function useIpcPlan(channel, messages, sessionId) {
  const [livePlan, setLivePlan] = useState(null);
  
  useEffect(() => {
    setLivePlan(null);  // Clear on session change
  }, [sessionId]);
}

// In Chat.tsx
const { plan } = useIpcPlan('agent:plan-event', messages, sessionId);
```

---

## 4️⃣ Wire sessions:changed Event

### Before
```typescript
// Event emitted but never listened to
mainWindow.webContents.send('sessions:changed');
```

### After
```typescript
// src/components/sidebar/ChatMenu.tsx
import { useIpcEvent } from '@/hooks/use-ipc';

useIpcEvent('sessions:changed', () => {
  reload();  // Refresh conversation list
}, []);
```

---

## 5️⃣ Wire onRetry

### Before
```typescript
// MessageList supports onRetry but Chat.tsx doesn't pass it
<MessageList onRetry={undefined} {...} />
```

### After
```typescript
<MessageList onRetry={handleSend} {...} />
```

---

## 6️⃣ Research Tool Names

### Before
```typescript
default:
  title = toolName;  // Shows "startResearchRun", "recordSource", etc
```

### After
```typescript
case 'startResearchRun':
  title = 'Starting research investigation';
  break;
case 'recordSource':
  const q = typeof input.text === 'string' ? input.text : '';
  title = q ? `Recording quote: "${q.slice(0, 37)}..."` : 'Recording source quote';
  break;
case 'recordEvidence':
  title = 'Recording evidence: ...';
  break;
case 'completeResearchRun':
  title = 'Finalizing research run';
  break;
case 'advancedSearch':
  title = 'Searching for "...query..."';
  break;
case 'scrapePage':
  title = 'Scraping domain.com';
  break;
```

---

## 7️⃣ Deep Research Chip

### Before
```typescript
const SUGGESTIONS: Suggestion[] = [
  { label: 'Inspect project', icon: FolderIcon, prompt: '...' },
  { label: 'Run a command', icon: TerminalIcon, prompt: '...' },
  { label: 'Read clipboard', icon: ClipboardIcon, prompt: '...' },
  { label: 'Plan a feature', icon: SparklesIcon, prompt: '...' },
];
```

### After
```typescript
const SUGGESTIONS: Suggestion[] = [
  { label: 'Inspect project', icon: FolderIcon, prompt: '...' },
  { label: 'Run a command', icon: TerminalIcon, prompt: '...' },
  { label: 'Read clipboard', icon: ClipboardIcon, prompt: '...' },
  { label: 'Plan a feature', icon: SparklesIcon, prompt: '...' },
  {
    label: 'Deep research',
    icon: SparklesIcon,
    prompt: 'Conduct a deep research investigation...',
  },
];
```

---

## 8️⃣ Standardize Icons

### Before
```typescript
// Tasks
{value?.taskId === task.id && <span>✓</span>}

// Notebooks
{value?.notebookId === notebook.id && <XIcon className="rotate-45" />}

// Pages
{value?.pageId === page.id && <span>•</span>}
```

### After
```typescript
// All three sections
{value?.taskId === task.id && <CheckIcon />}
{value?.notebookId === notebook.id && <CheckIcon />}
{value?.pageId === page.id && <CheckIcon />}
```

---

## Summary of Changes

| File | Lines | Change Type | Risk |
|------|-------|-------------|------|
| ChatWelcome.tsx | ~40 | Removed component | Low |
| ToolCard.tsx | ~40 | Added cases | Low |
| ChatContextPicker.tsx | ~10 | Icon replacement | Low |
| use-agent-plan.ts | ~15 | Added effect | Low |
| use-agent-chat.ts | ~20 | Added callback | Low |
| Chat.tsx | ~5 | Prop passing | Low |
| channels.ts | ~2 | Added channel | Low |
| agent-chat.ts | ~85 | Major: added abort | Medium |
| ChatMenu.tsx | ~3 | Added listener | Low |

**Total Impact:** All changes are localized and low-risk. No breaking changes. All features remain backward compatible.

---

## To Test Locally

```bash
# No build required per steering message
# Just start the app and verify:

1. Hero screen: ModelIndicator gone ✓
2. Click Stop while streaming ✓
3. Switch conversations: plan clears ✓
4. Rename session: sidebar updates ✓
5. Hover message: retry button works ✓
6. Watch research tools: labels polished ✓
7. Welcome screen: Deep Research chip visible ✓
8. Context picker: consistent CheckIcons ✓
```

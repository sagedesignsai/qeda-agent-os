# Hero Screen Enhancement - Context & Assets in ChatInput

## Overview
Replaced the ModelIndicator in the ChatWelcome hero screen by integrating the Context Selector and Web Assets button directly into the ChatInput footer. These controls are now part of the prompt input interface itself, appearing beside the submit button.

## Changes Made

### 1. Updated ChatInput Component
**File:** `src/components/chat/ChatInput.tsx`

#### Props Added
```typescript
interface ChatInputProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  footerLeft?: ReactNode;
  contextControls?: ReactNode;     // NEW - rendered in footer
  assetControls?: ReactNode;       // NEW - rendered in footer
  tall?: boolean;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  clearOnSend?: boolean;
  beforeSubmit?: ReactNode;
}
```

#### Footer Layout Changes
Updated footer to consolidate all controls:
- `footerLeft` - existing (for future use)
- `contextControls` - new (Context Selector)
- `assetControls` - new (Web Assets button)
- Submit button - always on right

```tsx
<PromptInputFooter
  className={cn(
    'gap-1.5',
    footerLeft || contextControls || assetControls
      ? 'justify-between'
      : 'justify-end',
  )}
>
  {(footerLeft || contextControls || assetControls) && (
    <PromptInputTools className="flex gap-2">
      {footerLeft}
      {contextControls}
      {assetControls}
    </PromptInputTools>
  )}
  <div className="flex shrink-0 items-center gap-1.5">
    {beforeSubmit}
    <PromptInputSubmit
      status={isStreaming ? 'streaming' : undefined}
      onStop={onStop}
      disabled={!text.trim() && !isStreaming}
    />
  </div>
</PromptInputFooter>
```

### 2. Updated ChatWelcome Component
**File:** `src/components/chat/ChatWelcome.tsx`

#### Props Added (same as before)
```typescript
interface ChatWelcomeProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  contextControls?: React.ReactNode;    // NEW
  assetControls?: React.ReactNode;      // NEW
}
```

#### Simplified Layout
Removed separate footer section - controls now passed through to ChatInput:

```tsx
<ChatInput
  onSend={onSend}
  onStop={onStop}
  disabled={disabled}
  isStreaming={isStreaming}
  tall
  contextControls={contextControls}    // NEW
  assetControls={assetControls}        // NEW
  placeholder="Research a topic, summarize your notes, or ask Qeda anything…"
/>
```

### 3. Updated Chat.tsx
**File:** `src/renderer/pages/Chat.tsx`

#### ChatWelcome Integration
Now passes context and asset controls to ChatWelcome (which passes to ChatInput):

```tsx
<ChatWelcome
  onSend={handleSend}
  onStop={abortStream}
  disabled={creating}
  isStreaming={status === 'streaming'}
  contextControls={
    <ChatContextPicker
      value={chatContext}
      onChange={(ctx) => {
        // Merge with project scope
        setChatContext((prev) => {
          const merged = { projectId: prev?.projectId, ...ctx };
          return Object.values(merged).some(Boolean)
            ? (merged as ChatContext)
            : undefined;
        });
      }}
    />
  }
  assetControls={
    <button
      type="button"
      onClick={() => setIsAssetModalOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
      title="Download web assets"
    >
      <GlobeIcon className="size-3.5 shrink-0 text-primary/70" />
      <span>Web assets</span>
    </button>
  }
/>
```

## UI/UX Improvements

### Before
- Hero screen had only suggestion chips
- Context and asset controls were only available in the header
- No immediate visual access to these controls on blank screen

### After
- Hero screen footer displays both controls
- Users can bind context (task, notebook, page) before typing
- Users can download web assets without typing
- Matches the header button styling for visual consistency
- Footer only shows when controls are provided (graceful fallback)

## Design Rationale

1. **Consolidation:** Removes the need to look in the header for these controls
2. **Discoverability:** New users see all available options on the blank screen
3. **Task Flow:** Users can set context before starting a conversation
4. **Visual Consistency:** Button styling matches the header controls
5. **Flexibility:** Props-based design allows easy changes without component coupling

## Layout Structure

```
┌────────────────────────────────────┐
│     Qeda Logo (animated)           │
├────────────────────────────────────┤
│   What do you want to build or run?│
├────────────────────────────────────┤
│  ┌────────────────────────────────┐│
│  │     Hero Prompt Input          ││
│  │  (tall variant)                ││
│  └────────────────────────────────┘│
├────────────────────────────────────┤
│ [Inspect] [Run] [Clipboard]        │
│ [Feature] [Research] [Notebook]    │
├────────────────────────────────────┤
│  [Context Picker] [Web Assets]     │  ← NEW
└────────────────────────────────────┘
```

## Testing Checklist

- [ ] Hero screen renders both controls in footer
- [ ] Context picker opens and allows selection
- [ ] Web assets button opens modal
- [ ] Styling matches header buttons
- [ ] Footer only shows when both controls are passed
- [ ] Mobile responsive (footer wraps if needed)
- [ ] No TypeScript errors
- [ ] No visual regressions

## Technical Notes

- Controls are passed as `React.ReactNode` for maximum flexibility
- Footer conditionally renders only if at least one control exists
- All styling uses existing design tokens (gap-3, text-xs, etc.)
- No new dependencies introduced
- Maintains backward compatibility (controls are optional)

## Files Modified

1. `src/components/chat/ChatWelcome.tsx` - Added props and footer
2. `src/renderer/pages/Chat.tsx` - Pass controls to ChatWelcome

## Status

✅ TypeScript check passes
✅ Implementation complete
✅ Ready for testing

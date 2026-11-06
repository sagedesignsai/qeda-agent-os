# Web Assets & Chat Attachments - Current State & Opportunity

## 📊 Current Behavior

### What Happens Now
1. **User opens Web Assets dialog** in Chat page
2. **Searches for images** (PNG, SVG, JPG, etc.)
3. **Downloads an image** by clicking download button
4. **Result:** Toast notification shows "Asset downloaded: filename.png"
5. **That's it** - asset is downloaded to project folder but NOT attached to chat

### What Gets Downloaded
```
DownloadResourceResult {
  success: boolean
  filePath?: string          // Local path where saved
  fileName?: string          // e.g., "image.png"
  sizeBytes?: number         // File size
  mimeType?: string          // e.g., "image/png"
  url: string                // Original web URL
  error?: string             // If failed
}
```

---

## 🎯 Opportunity: Add as Attachments

### What Could Happen Instead
1. **User opens Web Assets dialog**
2. **Searches for images** (PNG, SVG, JPG, etc.)
3. **Downloads an image** by clicking download button
4. **Smart behavior:**
   - ✅ Save file locally (current)
   - ✅ Show toast confirmation (current)
   - ✅ **NEW:** Automatically add to prompt input as attachment
   - ✅ **NEW:** Show thumbnail in composer
   - ✅ **NEW:** Allow user to send image with next message

### Proposed Workflow
```
1. User clicks "Web Assets" button
   ↓
2. Opens image search dialog
   ↓
3. Searches for "logo"
   ↓
4. Results appear with previews
   ↓
5. Clicks "Download" on image
   ↓
6. Image downloads to project folder
   ↓
7. [NEW] Thumbnail appears in prompt input footer
   ↓
8. User types message or clicks send
   ↓
9. Message includes image attachment
```

---

## 🏗️ Technical Implementation Path

### What Needs to Change

#### 1. Chat State Management
Add attachment tracking:
```typescript
interface Attachment {
  filePath: string;
  fileName: string;
  mimeType: string;
  url: string;
  localUrl?: string;  // For preview
}

const [attachments, setAttachments] = useState<Attachment[]>([]);
```

#### 2. handleAssetDownloaded Handler
Currently:
```typescript
const handleAssetDownloaded = (res: DownloadResourceResult) => {
  if (!res.fileName) return;
  toast.success(`Asset downloaded: ${res.fileName}`);
};
```

Should become:
```typescript
const handleAssetDownloaded = (res: DownloadResourceResult) => {
  if (!res.fileName || !res.success) return;
  
  // Add to attachments
  setAttachments(prev => [...prev, {
    filePath: res.filePath || '',
    fileName: res.fileName || '',
    mimeType: res.mimeType || 'image/png',
    url: res.url,
  }]);
  
  toast.success(`Asset added: ${res.fileName}`);
};
```

#### 3. ChatInput Enhancement
Add attachment display in footer:
```tsx
{/* Attachment thumbnails in footer */}
{attachments.length > 0 && (
  <div className="flex gap-2 flex-wrap">
    {attachments.map(att => (
      <div key={att.filePath} className="relative">
        <img 
          src={att.localUrl || att.url} 
          alt={att.fileName}
          className="h-10 w-10 rounded border"
        />
        <button
          onClick={() => removeAttachment(att.filePath)}
          className="absolute -top-2 -right-2 size-4 bg-destructive rounded-full"
        >
          ✕
        </button>
      </div>
    ))}
  </div>
)}
```

#### 4. Message Sending with Attachments
Pass attachments with message:
```typescript
const handleSend = (text: string) => {
  const messageData = {
    text,
    attachments: attachments.map(att => ({
      type: 'image',
      filePath: att.filePath,
      mimeType: att.mimeType,
    })),
  };
  
  sendMessage(text);  // Agent sees attachments context
  setAttachments([]);  // Clear after sending
};
```

#### 5. UI Components Needed
- **Attachment thumbnail preview** in ChatInput footer
- **Remove button** on each thumbnail (X icon)
- **Visual feedback** when attachment added
- **Count badge** showing # of attachments
- **Image preview modal** on click (optional)

---

## 📱 User Experience Mockup

### Hero Screen with Downloaded Image
```
┌────────────────────────────────────┐
│ What do you want to build or run?  │
│ ┌──────────────────────────────┐   │
│ │ Prompt Input                 │   │
│ │ [Image] [Context] [Assets]   │   │ ← Thumbnail added
│ └──────────────────────────────┘   │
│ [Suggestions]                      │
└────────────────────────────────────┘
```

### Active Chat with Attachment
```
│ [Previous message...]
├────────────────────────────────────┤
│ ┌──────────────────────────────┐   │
│ │ Ask about this image         │   │
│ │ [Thumb] [Context] [Assets]   │   │ ← Image attached
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

---

## 🎨 Implementation Priority

### Phase 1 (Essential)
- ✅ Track attachments in Chat state
- ✅ Add to handleAssetDownloaded
- ✅ Show thumbnail in input footer
- ✅ Remove attachment button

### Phase 2 (Enhancement)
- Attachment count badge
- Drag-and-drop support
- Paste image support
- File browser for local images

### Phase 3 (Advanced)
- Image preview modal
- Image annotation/editing
- Batch uploads
- Drag to reorder attachments

---

## 🔍 Data Flow

```
Web Assets Dialog
    ↓
Search Results
    ↓
Download Button Clicked
    ↓
DownloadResourceResult
    ├─ filePath: "/path/to/image.png"
    ├─ fileName: "image.png"
    ├─ mimeType: "image/png"
    ├─ url: "https://..."
    └─ success: true
    ↓
handleAssetDownloaded()
    ↓
setAttachments([...prev, newAttachment])
    ↓
ChatInput Shows Thumbnail
    ↓
User Types Message
    ↓
User Clicks Send
    ↓
Message + Attachments Sent
    ↓
Clear Attachments
```

---

## ⚠️ Considerations

### Technical
- Need to convert file paths to readable URLs for preview
- File size limits for large images
- MIME type detection and validation
- Local file access permissions

### UX
- Clear indication that image is attached
- Easy removal/replacement
- Clear affordance for adding more images
- Feedback when image fails to upload

### Agent Integration
- How does agent use image attachments?
- Does it analyze images with vision?
- How to include in context for understanding?
- Format for passing to agent tools?

---

## 📋 Implementation Checklist (If Approved)

- [ ] Design attachment data structure
- [ ] Add attachments state to Chat.tsx
- [ ] Update handleAssetDownloaded handler
- [ ] Create AttachmentPreview component
- [ ] Update ChatInput to show attachments
- [ ] Add remove attachment functionality
- [ ] Integrate with message sending
- [ ] Test file preview rendering
- [ ] Handle edge cases (large files, errors)
- [ ] Update UX/documentation
- [ ] Test on both hero and active chat views

---

## 🎯 Current Status

**As of now:**
- Web assets CAN be downloaded
- Downloaded to project folder
- Toast shows confirmation
- **NOT** attached to messages

**Recommendation:**
This would be a valuable enhancement to implement after chat page launch, as it would streamline the workflow of searching for assets and including them in conversations with the agent.

---

## Next Steps

Would you like me to:
1. Implement this attachment feature now?
2. Document it as a future enhancement?
3. Create a detailed spec for the development team?
4. Something else?

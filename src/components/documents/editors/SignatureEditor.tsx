/**
 * components/documents/editors/SignatureEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editor for formal Signature blocks (signee name, role, company, date).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Input } from '@/components/ui/input';
import type { SignatureBlock } from '@/lib/pdf-studio/types';

interface SignatureEditorProps {
  block: SignatureBlock;
  onUpdate: (updates: Partial<SignatureBlock>) => void;
}

export function SignatureEditor({ block, onUpdate }: SignatureEditorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        placeholder="Signee Name"
        value={block.signeeName}
        onChange={(e) => onUpdate({ signeeName: e.target.value })}
        className="h-7 text-xs font-semibold"
      />
      <Input
        placeholder="Role / Title"
        value={block.role || ''}
        onChange={(e) => onUpdate({ role: e.target.value || undefined })}
        className="h-7 text-xs"
      />
      <Input
        placeholder="Company / Organization"
        value={block.company || ''}
        onChange={(e) => onUpdate({ company: e.target.value || undefined })}
        className="h-7 text-xs"
      />
      <Input
        placeholder="Date"
        value={block.date || ''}
        onChange={(e) => onUpdate({ date: e.target.value || undefined })}
        className="h-7 text-xs"
      />
    </div>
  );
}

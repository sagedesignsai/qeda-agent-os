/**
 * hooks/use-documents.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React state and transport hooks for Document Studio.
 *
 * Provides:
 *   - useDocuments: list, create, delete, and reactive 'documents:changed' sync
 *   - useDocumentEditor: active document editing with auto-save debounce,
 *     block mutations, and theme management
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type {
  PdfDocumentRecord,
  PdfDocumentSummary,
} from '@/main/ipc/channels';
import type {
  PdfDocument,
  PdfBlock,
  BlockType,
  HeadingBlock,
  ParagraphBlock,
  ColumnsBlock,
  TableBlock,
  CalloutBlock,
  MetricsBlock,
  DividerBlock,
  PageBreakBlock,
  SignatureBlock,
  ImageBlock,
  DocumentTheme,
  PageSize,
  PageOrientation,
  DocumentMargins,
  DocumentHeaderConfig,
  DocumentFooterConfig,
} from '@/lib/pdf-studio/types';
import { DOCUMENT_TEMPLATES } from '@/lib/pdf-studio/templates';

export function useDocuments(projectId?: string | null) {
  const [documents, setDocuments] = useState<PdfDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocuments = useCallback(async () => {
    try {
      const list = await window.electron.ipc.invoke<PdfDocumentSummary[]>(
        'documents:list',
        { projectId: projectId ?? null },
      );
      setDocuments(list || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDocuments();

    // Listen for reactive invalidations
    const cleanup = window.electron.ipc.on('documents:changed', () => {
      void loadDocuments();
    });

    return () => {
      cleanup();
    };
  }, [loadDocuments]);

  const createFromTemplate = async (
    templateId: string,
    targetProjectId?: string | null,
  ): Promise<string | null> => {
    try {
      const template =
        DOCUMENT_TEMPLATES.find((t) => t.id === templateId) ||
        DOCUMENT_TEMPLATES[0];
      const initialDoc = template.factory(targetProjectId ?? projectId ?? null);

      const record = await window.electron.ipc.invoke<PdfDocumentRecord>(
        'documents:save',
        {
          id: initialDoc.id,
          projectId: initialDoc.projectId,
          title: initialDoc.title,
          description: initialDoc.description,
          templateId: initialDoc.templateId,
          dataJson: JSON.stringify(initialDoc),
        },
      );

      toast.success(`Created "${record.title}"`);
      await loadDocuments();
      return record.id;
    } catch (err) {
      toast.error('Failed to create document');
      console.error(err);
      return null;
    }
  };

  const deleteDoc = async (id: string): Promise<boolean> => {
    try {
      const ok = await window.electron.ipc.invoke<boolean>('documents:delete', {
        id,
      });
      if (ok) {
        toast.success('Document deleted');
        await loadDocuments();
      }
      return ok;
    } catch {
      toast.error('Failed to delete document');
      return false;
    }
  };

  return {
    documents,
    loading,
    reload: loadDocuments,
    createFromTemplate,
    deleteDocument: deleteDoc,
  };
}

export function useDocumentEditor(documentId: string | null) {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef<PdfDocument | null>(null);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const record = await window.electron.ipc.invoke<PdfDocumentRecord | null>(
        'documents:get',
        { id },
      );
      if (record && record.data_json) {
        const parsed = JSON.parse(record.data_json) as PdfDocument;
        setDoc(parsed);
      } else {
        setDoc(null);
      }
    } catch (err) {
      console.error('Failed to load document detail:', err);
      setDoc(null);
    } finally {
      setLoading(false);
      setIsDirty(false);
    }
  }, []);

  useEffect(() => {
    if (documentId) {
      void loadDetail(documentId);
    } else {
      setDoc(null);
      setLoading(false);
    }
  }, [documentId, loadDetail]);

  const saveToBackend = useCallback(async (currentDoc: PdfDocument) => {
    setIsSaving(true);
    try {
      await window.electron.ipc.invoke<PdfDocumentRecord>('documents:save', {
        id: currentDoc.id,
        projectId: currentDoc.projectId ?? null,
        title: currentDoc.title,
        description: currentDoc.description,
        templateId: currentDoc.templateId,
        dataJson: JSON.stringify(currentDoc),
      });
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to auto-save document:', err);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Debounced auto-save
  const triggerAutoSave = useCallback(
    (nextDoc: PdfDocument) => {
      setDoc(nextDoc);
      setIsDirty(true);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        void saveToBackend(nextDoc);
      }, 800);
    },
    [saveToBackend],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        if (docRef.current && isDirty) {
          void saveToBackend(docRef.current);
        }
      }
    };
  }, [isDirty, saveToBackend]);

  const setTitle = useCallback(
    (title: string) => {
      if (!doc) return;
      triggerAutoSave({ ...doc, title, updatedAt: Date.now() });
    },
    [doc, triggerAutoSave],
  );

  const setPageSize = useCallback(
    (pageSize: PageSize) => {
      if (!doc) return;
      triggerAutoSave({
        ...doc,
        settings: { ...doc.settings, pageSize },
        updatedAt: Date.now(),
      });
    },
    [doc, triggerAutoSave],
  );

  const setOrientation = useCallback(
    (orientation: PageOrientation) => {
      if (!doc) return;
      triggerAutoSave({
        ...doc,
        settings: { ...doc.settings, orientation },
        updatedAt: Date.now(),
      });
    },
    [doc, triggerAutoSave],
  );

  const setTheme = useCallback(
    (theme: DocumentTheme) => {
      if (!doc) return;
      triggerAutoSave({
        ...doc,
        settings: { ...doc.settings, theme },
        updatedAt: Date.now(),
      });
    },
    [doc, triggerAutoSave],
  );

  const updateMargins = useCallback(
    (margins: Partial<DocumentMargins>) => {
      if (!doc) return;
      triggerAutoSave({
        ...doc,
        settings: {
          ...doc.settings,
          margins: { ...doc.settings.margins, ...margins },
        },
        updatedAt: Date.now(),
      });
    },
    [doc, triggerAutoSave],
  );

  const updateHeader = useCallback(
    (header: Partial<DocumentHeaderConfig>) => {
      if (!doc) return;
      triggerAutoSave({
        ...doc,
        settings: {
          ...doc.settings,
          header: { ...doc.settings.header, ...header },
        },
        updatedAt: Date.now(),
      });
    },
    [doc, triggerAutoSave],
  );

  const updateFooter = useCallback(
    (footer: Partial<DocumentFooterConfig>) => {
      if (!doc) return;
      triggerAutoSave({
        ...doc,
        settings: {
          ...doc.settings,
          footer: { ...doc.settings.footer, ...footer },
        },
        updatedAt: Date.now(),
      });
    },
    [doc, triggerAutoSave],
  );

  const addBlock = useCallback(
    <T extends BlockType>(
      type: T,
      index?: number,
      initialData?: Partial<Extract<PdfBlock, { type: T }>>,
    ) => {
      if (!doc) return;
      const id = nanoid();
      let newBlock: PdfBlock;

      switch (type) {
        case 'heading':
          newBlock = {
            id,
            type: 'heading',
            level: 2,
            text: 'Section Heading',
            marginBottom: 8,
            ...(initialData as Partial<HeadingBlock>),
          };
          break;
        case 'paragraph':
          newBlock = {
            id,
            type: 'paragraph',
            content: 'Write your text content here...',
            fontSize: 10,
            lineHeight: 1.45,
            marginBottom: 6,
            ...(initialData as Partial<ParagraphBlock>),
          };
          break;
        case 'columns':
          newBlock = {
            id,
            type: 'columns',
            gap: 12,
            columns: [
              {
                id: nanoid(),
                title: 'Column 1',
                widthRatio: 1,
                blocks: [
                  {
                    id: nanoid(),
                    type: 'paragraph',
                    content: 'First column content.',
                    fontSize: 10,
                  },
                ],
              },
              {
                id: nanoid(),
                title: 'Column 2',
                widthRatio: 1,
                blocks: [
                  {
                    id: nanoid(),
                    type: 'paragraph',
                    content: 'Second column content.',
                    fontSize: 10,
                  },
                ],
              },
            ],
            marginBottom: 8,
            ...(initialData as Partial<ColumnsBlock>),
          };
          break;
        case 'table':
          newBlock = {
            id,
            type: 'table',
            wrap: false,
            columns: [
              { id: 'col1', header: 'Item', widthPct: 60, align: 'left' },
              { id: 'col2', header: 'Cost', widthPct: 40, align: 'right' },
            ],
            rows: [
              ['Consulting & Implementation', '$5,000'],
              ['Cloud Architecture Sandbox', '$2,500'],
            ],
            striped: true,
            showBorders: true,
            marginBottom: 10,
            ...(initialData as Partial<TableBlock>),
          };
          break;
        case 'callout':
          newBlock = {
            id,
            type: 'callout',
            variant: 'info',
            title: 'Important Note',
            text: 'Highlight crucial requirements or executive takeaways in this box.',
            marginBottom: 8,
            ...(initialData as Partial<CalloutBlock>),
          };
          break;
        case 'metrics':
          newBlock = {
            id,
            type: 'metrics',
            columns: 2,
            items: [
              {
                id: nanoid(),
                label: 'Metric 1',
                value: '100%',
                change: 'Target goal',
              },
              {
                id: nanoid(),
                label: 'Metric 2',
                value: '4.8x',
                change: 'Growth factor',
              },
            ],
            marginBottom: 8,
            ...(initialData as Partial<MetricsBlock>),
          };
          break;
        case 'divider':
          newBlock = {
            id,
            type: 'divider',
            thickness: 0.5,
            spacing: 8,
            ...(initialData as Partial<DividerBlock>),
          };
          break;
        case 'page-break':
          newBlock = {
            id,
            type: 'page-break',
            ...(initialData as Partial<PageBreakBlock>),
          };
          break;
        case 'signature':
          newBlock = {
            id,
            type: 'signature',
            wrap: false,
            signeeName: 'Jane Doe',
            role: 'Director of Operations',
            company: 'Acme Inc.',
            date: new Date().toLocaleDateString(),
            ...(initialData as Partial<SignatureBlock>),
          };
          break;
        case 'image':
          newBlock = {
            id,
            type: 'image',
            src: 'https://via.placeholder.com/300x150.png',
            width: 200,
            height: 100,
            align: 'center',
            ...(initialData as Partial<ImageBlock>),
          };
          break;
      }

      const nextBlocks = [...doc.blocks];
      if (
        typeof index === 'number' &&
        index >= 0 &&
        index <= nextBlocks.length
      ) {
        nextBlocks.splice(index, 0, newBlock);
      } else {
        nextBlocks.push(newBlock);
      }

      triggerAutoSave({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
    },
    [doc, triggerAutoSave],
  );

  const updateBlock = useCallback(
    (id: string, updates: Partial<PdfBlock>) => {
      if (!doc) return;
      const nextBlocks = doc.blocks.map((b) => {
        if (b.id === id) {
          return { ...b, ...updates } as PdfBlock;
        }
        return b;
      });
      triggerAutoSave({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
    },
    [doc, triggerAutoSave],
  );

  const moveBlock = useCallback(
    (id: string, direction: 'up' | 'down') => {
      if (!doc) return;
      const index = doc.blocks.findIndex((b) => b.id === id);
      if (index === -1) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= doc.blocks.length) return;

      const nextBlocks = [...doc.blocks];
      const [moved] = nextBlocks.splice(index, 1);
      nextBlocks.splice(targetIndex, 0, moved);

      triggerAutoSave({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
    },
    [doc, triggerAutoSave],
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      if (!doc) return;
      const index = doc.blocks.findIndex((b) => b.id === id);
      if (index === -1) return;
      const source = doc.blocks[index];
      const cloned = JSON.parse(JSON.stringify(source)) as PdfBlock;
      cloned.id = nanoid();

      const nextBlocks = [...doc.blocks];
      nextBlocks.splice(index + 1, 0, cloned);
      triggerAutoSave({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
    },
    [doc, triggerAutoSave],
  );

  const removeBlock = useCallback(
    (id: string) => {
      if (!doc) return;
      const nextBlocks = doc.blocks.filter((b) => b.id !== id);
      triggerAutoSave({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
    },
    [doc, triggerAutoSave],
  );

  return {
    doc,
    loading,
    isSaving,
    isDirty,
    setTitle,
    setPageSize,
    setOrientation,
    setTheme,
    updateMargins,
    updateHeader,
    updateFooter,
    addBlock,
    updateBlock,
    moveBlock,
    duplicateBlock,
    removeBlock,
    updateDocument: triggerAutoSave,
    saveNow: () => (doc ? saveToBackend(doc) : Promise.resolve()),
  };
}

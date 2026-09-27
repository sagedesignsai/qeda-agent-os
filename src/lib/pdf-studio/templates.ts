/**
 * lib/pdf-studio/templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-crafted starter templates implementing best practices for:
 *   - Executive proposals
 *   - Professional invoices
 *   - Resumes & CVs
 *   - Technical specifications
 *   - Clean blank slate
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import type { PdfDocument, PdfBlock } from './types';
import { DOCUMENT_THEMES } from './themes';

export interface DocumentTemplateMeta {
  id: string;
  name: string;
  description: string;
  category: 'business' | 'finance' | 'technical' | 'career' | 'general';
  themeKey: string;
  factory: (projectId?: string | null) => PdfDocument;
}

export function createExecutiveProposal(
  projectId?: string | null,
): PdfDocument {
  const now = Date.now();
  const blocks: PdfBlock[] = [
    {
      id: nanoid(),
      type: 'heading',
      level: 1,
      text: 'Enterprise AI Agent Platform',
      subtitle: 'Strategic Project Proposal & Architecture Deliverables',
      align: 'left',
      badge: 'PROPOSAL • Q4 2026',
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'info',
      title: 'Executive Summary',
      text: 'This proposal details the design, phased rollout, and operational model for deploying a local-first agentic operating system within your engineering organization. The platform delivers autonomous coding, continuous task orchestration, and air-gapped knowledge retrieval with enterprise-grade auditability.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 3,
      items: [
        {
          id: nanoid(),
          label: 'Velocity Increase',
          value: '+42%',
          change: 'Estimated engineer sprint throughput',
          isPositive: true,
        },
        {
          id: nanoid(),
          label: 'Task Automation',
          value: '68%',
          change: 'Repetitive ticket handling',
          isPositive: true,
        },
        {
          id: nanoid(),
          label: 'Time to Value',
          value: '4 Weeks',
          change: 'From sandbox to production pilot',
          isPositive: true,
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Core Solution Pillars',
      subtitle: 'Architectural overview across client and runtime boundaries',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 12,
      columns: [
        {
          id: nanoid(),
          title: 'Local Agent Engine',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Autonomous desktop runtime with persistent PTY subprocess execution, strict permission guardrails, and deterministic tool loops.',
              fontSize: 10,
            },
          ],
        },
        {
          id: nanoid(),
          title: 'RAG Knowledge Graph',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Embedded SQLite vector storage (vec0) with local tokenization, semantic document indexing, and zero external data leakage.',
              fontSize: 10,
            },
          ],
        },
      ],
      marginBottom: 16,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Phased Investment & Milestones',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'phase', header: 'Phase', widthPct: 20, align: 'left' },
        {
          id: 'scope',
          header: 'Scope & Key Deliverables',
          widthPct: 50,
          align: 'left',
        },
        { id: 'duration', header: 'Duration', widthPct: 15, align: 'center' },
        { id: 'cost', header: 'Investment', widthPct: 15, align: 'right' },
      ],
      rows: [
        [
          'Phase 1',
          'Infrastructure Foundation & Model Gateway Integration',
          '2 Weeks',
          '$18,500',
        ],
        [
          'Phase 2',
          'Tool Execution Runtime & PTY Shell Sandboxing',
          '3 Weeks',
          '$24,000',
        ],
        [
          'Phase 3',
          'Enterprise Rollout, Telemetry & Security Audit',
          '2 Weeks',
          '$16,500',
        ],
      ],
      striped: true,
      showBorders: true,
      marginBottom: 20,
    },
    {
      id: nanoid(),
      type: 'signature',
      wrap: false,
      signeeName: 'Alex Mercer',
      role: 'Principal Systems Architect',
      company: 'Docugent Intelligent Systems',
      date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    },
  ];

  return {
    id: nanoid(),
    title: 'Enterprise AI Agent Platform Proposal',
    description:
      'Executive proposal with scope, metrics, milestones, and formal sign-off.',
    projectId: projectId ?? null,
    templateId: 'executive-proposal',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      theme: DOCUMENT_THEMES.navy,
      header: {
        enabled: true,
        leftText: 'Docugent Enterprise Solutions',
        rightText: 'Confidential Proposal',
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Enterprise AI Agent Platform',
        rightText: 'Docugent Inc.',
        pageNumberFormat: 'page_of_total',
        showDivider: true,
      },
    },
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

export function createProfessionalInvoice(
  projectId?: string | null,
): PdfDocument {
  const now = Date.now();
  const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const blocks: PdfBlock[] = [
    {
      id: nanoid(),
      type: 'heading',
      level: 1,
      text: 'INVOICE',
      subtitle: `Invoice #${invoiceNumber} • Due within 14 days`,
      align: 'left',
      badge: 'DUE UPON RECEIPT',
      marginBottom: 16,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 16,
      columns: [
        {
          id: nanoid(),
          title: 'Billed To',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Acme Corporation\nAttn: Accounts Payable\n100 Enterprise Boulevard, Suite 400\nSan Francisco, CA 94105',
              fontSize: 10,
              lineHeight: 1.4,
            },
          ],
        },
        {
          id: nanoid(),
          title: 'Issued By',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Docugent Engineering Ltd.\n42 Innovation Way\nAustin, TX 78701\nbilling@docugent.io',
              fontSize: 10,
              lineHeight: 1.4,
            },
          ],
        },
      ],
      marginBottom: 16,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'item', header: 'Description', widthPct: 50, align: 'left' },
        { id: 'hours', header: 'Hrs / Qty', widthPct: 15, align: 'center' },
        { id: 'rate', header: 'Unit Rate', widthPct: 15, align: 'right' },
        { id: 'total', header: 'Amount', widthPct: 20, align: 'right' },
      ],
      rows: [
        [
          'Desktop Application Core Architecture & IPC Split',
          '40 hrs',
          '$175.00',
          '$7,000.00',
        ],
        [
          'Vector Database Integration & SQLite-Vec Indexing',
          '32 hrs',
          '$175.00',
          '$5,600.00',
        ],
        [
          'React-PDF Engine Studio & Dynamic Composing Engine',
          '28 hrs',
          '$175.00',
          '$4,900.00',
        ],
        [
          'Security Hardening, Subprocess Isolation & QA',
          '16 hrs',
          '$175.00',
          '$2,800.00',
        ],
      ],
      striped: true,
      showBorders: true,
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 2,
      items: [
        { id: nanoid(), label: 'Subtotal Due', value: '$20,300.00' },
        {
          id: nanoid(),
          label: 'Total Due (USD)',
          value: '$20,300.00',
          change: 'Payment Terms: Net 14',
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'success',
      title: 'Remittance & Payment Instructions',
      text:
        'Please submit electronic bank transfer to: First Tech Bank • Routing: 121000358 • Account: 9876-5432-10 • Reference: ' +
        invoiceNumber,
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        'Thank you for your business. For any questions regarding this invoice, please reach out to billing@docugent.io.',
      fontSize: 9,
      color: '#64748b',
      align: 'center',
    },
  ];

  return {
    id: nanoid(),
    title: `Invoice ${invoiceNumber}`,
    description:
      'Clean commercial billing invoice with itemized services and wire remittance info.',
    projectId: projectId ?? null,
    templateId: 'professional-invoice',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 32, right: 32, bottom: 32, left: 32 },
      theme: DOCUMENT_THEMES.emerald,
      header: {
        enabled: true,
        leftText: 'Docugent Billing & Invoicing',
        rightText: invoiceNumber,
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Docugent Engineering Ltd.',
        pageNumberFormat: 'page_of_total',
        showDivider: true,
      },
    },
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

export function createModernResume(projectId?: string | null): PdfDocument {
  const now = Date.now();
  const blocks: PdfBlock[] = [
    {
      id: nanoid(),
      type: 'heading',
      level: 1,
      text: 'Dr. Morgan Vance',
      subtitle:
        'Staff AI Systems Architect • Distributed Runtimes & Agentic OS',
      align: 'left',
      badge:
        'morgan.vance@alum.mit.edu • github.com/mvance • San Francisco, CA',
      marginBottom: 10,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        'Principal architect with 10+ years designing resilient distributed systems, high-throughput model inferencing runtimes, and local-first desktop developer tools. Proven track record leading multi-disciplinary teams from initial whitepaper through scaled enterprise adoption.',
      fontSize: 10,
      lineHeight: 1.45,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Core Competencies',
      marginBottom: 6,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 10,
      columns: [
        {
          id: nanoid(),
          title: 'Systems & Runtime',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                '• Rust, TypeScript, C++, Node.js\n• Linux PTYs, MicroVMs, Sandboxing\n• High-performance Electron & Vite',
              fontSize: 9,
              lineHeight: 1.4,
            },
          ],
        },
        {
          id: nanoid(),
          title: 'AI & Data Architecture',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                '• Vercel AI SDK, LangChain, Transformers\n• SQLite-vec, ChromaDB, PGVector\n• Structured tool calling & agent loops',
              fontSize: 9,
              lineHeight: 1.4,
            },
          ],
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Selected Experience',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'note',
      title: 'Docugent Inc. — Lead Systems Architect (2024 – Present)',
      text: 'Spearheaded development of Qeda/Docugent local agent desktop platform. Designed unified IPC contract layer, isolated process manager, and sub-10ms sqlite-vec local RAG retrieval.',
      marginBottom: 10,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'note',
      title: 'Anthropic / Research Partner — Systems Fellow (2022 – 2024)',
      text: 'Architected evaluation pipelines for multi-modal model tool use. Reduced latency overhead by 34% through streaming JSON reconcilers and preemptive token buffering.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Education & Honors',
      marginBottom: 6,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'inst', header: 'Institution', widthPct: 35, align: 'left' },
        {
          id: 'degree',
          header: 'Degree / Program',
          widthPct: 45,
          align: 'left',
        },
        { id: 'year', header: 'Year', widthPct: 20, align: 'right' },
      ],
      rows: [
        [
          'Massachusetts Institute of Technology',
          'Ph.D. in Distributed Systems & AI',
          '2022',
        ],
        [
          'Stanford University',
          'B.S. in Computer Science (Summa Cum Laude)',
          '2017',
        ],
      ],
      striped: true,
      showBorders: true,
    },
  ];

  return {
    id: nanoid(),
    title: 'Morgan Vance — Technical Resume',
    description:
      'Clean executive curriculum vitae with competencies, experience, and academic record.',
    projectId: projectId ?? null,
    templateId: 'modern-resume',
    settings: {
      pageSize: 'LETTER',
      orientation: 'portrait',
      margins: { top: 32, right: 32, bottom: 32, left: 32 },
      theme: DOCUMENT_THEMES.indigo,
      header: {
        enabled: true,
        leftText: 'Morgan Vance • Curriculum Vitae',
        rightText: 'Staff Systems Architect',
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Confidential & Proprietary',
        pageNumberFormat: 'page_of_total',
        showDivider: true,
      },
    },
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTechnicalSpec(projectId?: string | null): PdfDocument {
  const now = Date.now();
  const blocks: PdfBlock[] = [
    {
      id: nanoid(),
      type: 'heading',
      level: 1,
      text: 'RFC-0104: PTY Isolation & Agent IPC Architecture',
      subtitle: 'Technical Specification & Security Threat Model',
      align: 'left',
      badge: 'STATUS: APPROVED • REVISION 2.4',
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'warning',
      title: 'Security Notice',
      text: 'This architecture specification defines privilege boundaries between Electron privileged main process and child terminal execution. All subprocesses run strictly within unprivileged user sandboxes.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 3,
      items: [
        {
          id: nanoid(),
          label: 'Target PTY Latency',
          value: '< 4ms',
          change: 'Round-trip IPC echo',
        },
        {
          id: nanoid(),
          label: 'Max Concurrency',
          value: '16 Shells',
          change: 'Active PTY instances',
        },
        {
          id: nanoid(),
          label: 'Memory Footprint',
          value: '< 45 MB',
          change: 'Per idle subprocess',
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Component Boundaries',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'module', header: 'Subsystem', widthPct: 25, align: 'left' },
        {
          id: 'runtime',
          header: 'Runtime Layer',
          widthPct: 20,
          align: 'center',
        },
        {
          id: 'protocol',
          header: 'Protocol / Channel',
          widthPct: 25,
          align: 'left',
        },
        {
          id: 'isolation',
          header: 'Isolation Mechanism',
          widthPct: 30,
          align: 'left',
        },
      ],
      rows: [
        [
          'PtyManager',
          'Main Process (Node.js)',
          'pty:create, pty:write',
          'node-pty native C++ binding',
        ],
        [
          'Preload Bridge',
          'Preload (Chromium)',
          'contextBridge.exposeInMainWorld',
          'Isolated JS context realm',
        ],
        [
          'Xterm Terminal',
          'Renderer (React 19)',
          'TerminalCanvas / AddonFit',
          'No direct Node or Electron access',
        ],
      ],
      striped: true,
      showBorders: true,
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Threat Model & Failure Modes',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        'In the event of an abnormal terminal termination (SIGKILL or exit code != 0), the main process initiates deterministic resource reclamation: file descriptors are released, orphan task listeners are unbound, and an event is published over the pty:exit channel to notify the user interface.',
      fontSize: 10,
      lineHeight: 1.5,
    },
  ];

  return {
    id: nanoid(),
    title: 'RFC-0104: PTY Isolation Architecture',
    description:
      'Technical architecture specification with metrics, component tables, and threat model.',
    projectId: projectId ?? null,
    templateId: 'technical-spec',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      theme: DOCUMENT_THEMES.navy,
      header: {
        enabled: true,
        leftText: 'Engineering Architecture RFC-0104',
        rightText: 'Docugent Core Systems',
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Confidential • Internal Distribution Only',
        pageNumberFormat: 'page_of_total',
        showDivider: true,
      },
    },
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankDocument(projectId?: string | null): PdfDocument {
  const now = Date.now();
  const blocks: PdfBlock[] = [
    {
      id: nanoid(),
      type: 'heading',
      level: 1,
      text: 'Untitled Document',
      subtitle: 'Start composing by adding blocks or asking the AI assistant.',
      align: 'left',
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        'This is the start of your document. Use the block composer on the left to add headings, paragraphs, structured tables, columns, callout cards, and metrics. Your changes render in real-time in the PDF preview pane on the right.',
      fontSize: 10,
      lineHeight: 1.5,
    },
  ];

  return {
    id: nanoid(),
    title: 'Untitled Document',
    description: 'Fresh clean canvas ready for custom blocks and styling.',
    projectId: projectId ?? null,
    templateId: 'blank-document',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      theme: DOCUMENT_THEMES.navy,
      header: {
        enabled: true,
        leftText: 'Docugent Document Studio',
        showDivider: true,
      },
      footer: {
        enabled: true,
        pageNumberFormat: 'page_of_total',
        showDivider: true,
      },
    },
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

export const DOCUMENT_TEMPLATES: DocumentTemplateMeta[] = [
  {
    id: 'executive-proposal',
    name: 'Executive Business Proposal',
    description:
      'Strategic project proposal with executive summary, ROI metrics, deliverables table, and formal sign-off.',
    category: 'business',
    themeKey: 'navy',
    factory: createExecutiveProposal,
  },
  {
    id: 'professional-invoice',
    name: 'Professional Consulting Invoice',
    description:
      'Commercial invoice with client details, itemized hours/services table, subtotal metrics, and wire instructions.',
    category: 'finance',
    themeKey: 'emerald',
    factory: createProfessionalInvoice,
  },
  {
    id: 'modern-resume',
    name: 'Modern Tech Resume / CV',
    description:
      'Executive curriculum vitae with contact badges, 2-column competencies, experience cards, and education.',
    category: 'career',
    themeKey: 'indigo',
    factory: createModernResume,
  },
  {
    id: 'technical-spec',
    name: 'Technical Architecture Specification',
    description:
      'RFC spec with security alerts, system metrics, component isolation tables, and threat model.',
    category: 'technical',
    themeKey: 'navy',
    factory: createTechnicalSpec,
  },
  {
    id: 'blank-document',
    name: 'Blank Document Canvas',
    description:
      'A clean starting slate ready for custom content and structure.',
    category: 'general',
    themeKey: 'navy',
    factory: createBlankDocument,
  },
];

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
      text: 'Strategic Initiative Proposal',
      subtitle: 'Comprehensive Business Case & Investment Analysis',
      align: 'left',
      badge: 'PROPOSAL • 2026',
      marginBottom: 4,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 2,
      color: '#0f172a',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'info',
      title: 'Executive Summary',
      text: 'This proposal outlines a strategic opportunity for organizational growth and operational excellence. It presents a comprehensive business case, detailed implementation roadmap, and expected ROI across financial, operational, and strategic dimensions.',
      marginBottom: 16,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Strategic Opportunity',
      marginBottom: 2,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        'Market analysis indicates significant demand for innovative solutions. This initiative positions us to capture emerging opportunities while establishing competitive differentiation in our sector.',
      fontSize: 10,
      lineHeight: 1.5,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 3,
      items: [
        {
          id: nanoid(),
          label: 'Revenue Impact',
          value: '+$2.5M',
          change: 'Projected Year 1 increase',
          isPositive: true,
        },
        {
          id: nanoid(),
          label: 'Efficiency Gain',
          value: '35%',
          change: 'Operating cost reduction',
          isPositive: true,
        },
        {
          id: nanoid(),
          label: 'Time to Market',
          value: '6 Months',
          change: 'From approval to launch',
          isPositive: true,
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Solution Architecture',
      marginBottom: 2,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 14,
      columns: [
        {
          id: nanoid(),
          title: 'Core Components',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Modular, scalable architecture designed for enterprise integration.',
              fontSize: 10,
              lineHeight: 1.4,
              marginBottom: 8,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                '• Service-oriented design\n• Real-time data sync\n• Advanced security layer\n• 24/7 monitoring',
              fontSize: 9,
              lineHeight: 1.5,
              color: '#1e293b',
            },
          ],
        },
        {
          id: nanoid(),
          title: 'Implementation',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Phased rollout with proven change management methodology.',
              fontSize: 10,
              lineHeight: 1.4,
              marginBottom: 8,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                '• Discovery & Planning\n• Development & Testing\n• Training & Deployment\n• Optimization & Support',
              fontSize: 9,
              lineHeight: 1.5,
              color: '#1e293b',
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
      text: 'Investment Breakdown',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'item', header: 'Scope Item', widthPct: 30, align: 'left' },
        {
          id: 'duration',
          header: 'Timeline',
          widthPct: 20,
          align: 'center',
        },
        { id: 'allocation', header: 'Resource', widthPct: 20, align: 'center' },
        { id: 'investment', header: 'Investment', widthPct: 30, align: 'right' },
      ],
      rows: [
        ['Discovery & Design', '4 Weeks', '3 FTE', '$65,000'],
        ['Development Phase', '12 Weeks', '5 FTE', '$180,000'],
        ['Testing & QA', '4 Weeks', '2 FTE', '$45,000'],
        ['Training & Launch', '2 Weeks', '2 FTE', '$22,000'],
        ['Total Investment', '', '', '$312,000'],
      ],
      striped: true,
      showBorders: true,
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Risk & Success Factors',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'warning',
      title: 'Key Success Metrics',
      text: 'Adoption target of 85% within 90 days of launch. Sustained user satisfaction score ≥4.2/5.0. Zero critical incidents in first 6 months of operation.',
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'success',
      title: 'Expected Outcomes',
      text: 'Operational efficiency gains, enhanced decision-making capability, improved customer satisfaction, and competitive market position.',
      marginBottom: 16,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 1,
      color: '#e2e8f0',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'signature',
      wrap: false,
      signeeName: 'Your Name',
      role: 'Strategic Initiative Lead',
      date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    },
  ];

  return {
    id: nanoid(),
    title: 'Strategic Initiative Proposal',
    description:
      'Professional proposal template with executive summary, KPI metrics, phased investment breakdown, risk analysis, and formal signature block.',
    projectId: projectId ?? null,
    templateId: 'executive-proposal',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      theme: DOCUMENT_THEMES.navy,
      header: {
        enabled: true,
        leftText: 'Strategic Proposal',
        rightText: 'Confidential',
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Prepared by Strategic Team',
        rightText: 'Page {{pageNumber}} of {{totalPages}}',
        pageNumberFormat: 'simple',
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
      align: 'center',
      marginBottom: 2,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 3,
      color: '#047857',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 20,
      columns: [
        {
          id: nanoid(),
          title: 'Invoice Details',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content: `Invoice Number\n${invoiceNumber}`,
              fontSize: 9,
              bold: true,
              marginBottom: 8,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content: `Issue Date\n${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
              fontSize: 9,
              marginBottom: 8,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content: 'Due Date\nNet 30 days',
              fontSize: 9,
              color: '#047857',
            },
          ],
        },
        {
          id: nanoid(),
          title: 'Bill To',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content: 'Client Name\nAttn: Accounts Department\n123 Business Street\nCity, State 12345\nclient@company.com',
              fontSize: 9,
              lineHeight: 1.6,
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
              content: 'Your Company Name\n456 Your Street\nCity, State 54321\nbilling@yourcompany.com',
              fontSize: 9,
              lineHeight: 1.6,
              color: '#047857',
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
      text: 'Services & Items',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'description', header: 'Description', widthPct: 45, align: 'left' },
        { id: 'qty', header: 'Qty / Hrs', widthPct: 15, align: 'center' },
        { id: 'rate', header: 'Rate', widthPct: 20, align: 'right' },
        { id: 'amount', header: 'Amount', widthPct: 20, align: 'right' },
      ],
      rows: [
        ['Professional Services - Consulting', '40 hrs', '$150.00', '$6,000.00'],
        ['Implementation & Setup', '24 hrs', '$150.00', '$3,600.00'],
        ['Training & Support', '16 hrs', '$125.00', '$2,000.00'],
        ['', '', '', ''],
      ],
      striped: true,
      showBorders: true,
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 1,
      color: '#e5e7eb',
      style: 'solid',
      spacing: 8,
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 2,
      items: [
        {
          id: nanoid(),
          label: 'Subtotal',
          value: '$11,600.00',
        },
        {
          id: nanoid(),
          label: 'Total Due (USD)',
          value: '$11,600.00',
          change: 'Payment due within 30 days',
          isPositive: true,
        },
      ],
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'success',
      title: 'Payment Instructions',
      text: `Wire Transfer: Bank Name | Routing: 121000358 | Account: 9876-5432-10\nACH: Account ${invoiceNumber}\nReference this invoice number in all payment correspondence.`,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'note',
      title: 'Terms & Conditions',
      text: 'Payment terms are Net 30 from invoice date. Late payments will accrue interest at 1.5% per month. Thank you for your business.',
      marginBottom: 16,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 1,
      color: '#e5e7eb',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'signature',
      wrap: false,
      signeeName: 'Your Name',
      role: 'Billing Manager',
      date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    },
  ];

  return {
    id: nanoid(),
    title: `Invoice ${invoiceNumber}`,
    description:
      'Professional invoice with itemized services, metrics summary, payment instructions, and terms & conditions.',
    projectId: projectId ?? null,
    templateId: 'professional-invoice',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      theme: DOCUMENT_THEMES.emerald,
      header: {
        enabled: true,
        leftText: 'Professional Invoice',
        rightText: 'Confidential',
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Thank you for your business',
        rightText: 'Page {{pageNumber}}',
        pageNumberFormat: 'simple',
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
      subtitle: 'Principal Architect • Strategic Technology Leader',
      align: 'left',
      marginBottom: 2,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        'morgan@example.com • (555) 123-4567 • linkedin.com/in/morganvance • github.com/mvance • San Francisco, CA',
      fontSize: 9,
      color: '#6b7280',
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 2,
      color: '#312e81',
      style: 'solid',
      spacing: 8,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'note',
      title: 'Executive Profile',
      text: 'Strategic technologist with 12+ years architecting distributed systems, leading high-performance engineering teams, and delivering products that scale globally. Track record of translating complex technical challenges into business outcomes.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Core Competencies',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 12,
      columns: [
        {
          id: nanoid(),
          title: 'Systems & Architecture',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'TypeScript • Rust • Python • Go\nMicroservices • Event-Driven\nCloud Infrastructure • DevOps\nContainerization • Kubernetes',
              fontSize: 9,
              lineHeight: 1.5,
            },
          ],
        },
        {
          id: nanoid(),
          title: 'Data & Performance',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'SQL • PostgreSQL • Redis\nData Pipeline Design • Analytics\nPerformance Optimization\nSystem Scalability',
              fontSize: 9,
              lineHeight: 1.5,
            },
          ],
        },
        {
          id: nanoid(),
          title: 'Leadership',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Team Building & Mentorship\nArchitectural Decision Making\nCross-functional Collaboration\nAgile Methodologies',
              fontSize: 9,
              lineHeight: 1.5,
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
      text: 'Professional Experience',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'info',
      title: 'Principal Architect — TechCorp (2023–Present)',
      text: 'Led architectural design of distributed platform serving 10M+ users. Spearheaded migration of legacy monolith to microservices, reducing latency by 60% and improving system reliability to 99.99% uptime.',
      marginBottom: 10,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'info',
      title: 'Senior Engineering Manager — InnovateLabs (2020–2023)',
      text: 'Managed cross-functional team of 8 engineers. Delivered 3 major product releases, each serving 100K+ daily active users. Established engineering best practices and mentored 5 junior engineers to mid-level positions.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Education & Certifications',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'institution', header: 'Institution', widthPct: 40, align: 'left' },
        { id: 'credential', header: 'Credential', widthPct: 40, align: 'left' },
        { id: 'year', header: 'Year', widthPct: 20, align: 'right' },
      ],
      rows: [
        [
          'Stanford University',
          'Ph.D. in Computer Science',
          '2015',
        ],
        [
          'UC Berkeley',
          'B.S. in EECS (Summa Cum Laude)',
          '2011',
        ],
        [
          'AWS',
          'Solutions Architect Professional',
          '2022',
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
      text: 'Notable Achievements',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 3,
      items: [
        {
          id: nanoid(),
          label: 'Products Shipped',
          value: '12+',
          change: 'Successful launches',
        },
        {
          id: nanoid(),
          label: 'Team Led',
          value: '40+ Engineers',
          change: 'Across 3 organizations',
        },
        {
          id: nanoid(),
          label: 'System Scale',
          value: '100M+ QPS',
          change: 'Peak capacity achieved',
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 1,
      color: '#e4e4e7',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content: 'References and portfolio available upon request.',
      fontSize: 9,
      color: '#71717a',
      align: 'center',
    },
  ];

  return {
    id: nanoid(),
    title: 'Morgan Vance — Technical Resume',
    description:
      'Executive curriculum vitae with professional profile, competencies, experience, education, and key achievements.',
    projectId: projectId ?? null,
    templateId: 'modern-resume',
    settings: {
      pageSize: 'LETTER',
      orientation: 'portrait',
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      theme: DOCUMENT_THEMES.indigo,
      header: {
        enabled: true,
        leftText: 'Morgan Vance • Curriculum Vitae',
        rightText: 'Principal Architect',
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Confidential',
        rightText: 'Page {{pageNumber}}',
        pageNumberFormat: 'simple',
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
      text: 'Technical Architecture Specification',
      subtitle: 'System Design, Security Threat Model & Implementation Guide',
      align: 'left',
      badge: 'APPROVED • v2.1',
      marginBottom: 4,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 2,
      color: '#0f172a',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'warning',
      title: 'Security & Compliance Notice',
      text: 'This specification defines critical system boundaries and privilege isolation mechanisms. All implementations MUST follow the documented isolation layers and security policies. Unauthorized modifications to sandbox boundaries may compromise system integrity.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Executive Overview',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 3,
      items: [
        {
          id: nanoid(),
          label: 'Target Latency',
          value: '< 4ms',
          change: 'Round-trip operation',
          isPositive: true,
        },
        {
          id: nanoid(),
          label: 'Max Concurrency',
          value: '16',
          change: 'Active instances',
        },
        {
          id: nanoid(),
          label: 'Memory/Instance',
          value: '< 45 MB',
          change: 'Idle footprint',
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'System Architecture Layers',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 14,
      columns: [
        {
          id: nanoid(),
          title: 'Privileged Layer',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content: 'Main Process (Node.js)',
              fontSize: 10,
              bold: true,
              marginBottom: 4,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Manages system resources, file descriptors, subprocess lifecycle, and privileged operations.',
              fontSize: 9,
              lineHeight: 1.5,
            },
          ],
        },
        {
          id: nanoid(),
          title: 'Isolation Layer',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content: 'IPC Bridge & Preload',
              fontSize: 10,
              bold: true,
              marginBottom: 4,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Enforces context isolation via contextBridge, typed message passing, and capability-based access control.',
              fontSize: 9,
              lineHeight: 1.5,
            },
          ],
        },
        {
          id: nanoid(),
          title: 'User-Facing Layer',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content: 'Renderer (React)',
              fontSize: 10,
              bold: true,
              marginBottom: 4,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'No direct system access. All operations routed through secure IPC channels.',
              fontSize: 9,
              lineHeight: 1.5,
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
      text: 'Component Responsibility Matrix',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'table',
      wrap: false,
      columns: [
        { id: 'module', header: 'Module', widthPct: 20, align: 'left' },
        { id: 'responsibility', header: 'Responsibility', widthPct: 35, align: 'left' },
        { id: 'isolation', header: 'Isolation Method', widthPct: 25, align: 'left' },
        { id: 'validation', header: 'Validation', widthPct: 20, align: 'center' },
      ],
      rows: [
        [
          'ResourceManager',
          'File descriptor lifecycle, subprocess cleanup',
          'Native C++ binding',
          'YES',
        ],
        [
          'IPCRouter',
          'Message routing, capability checking',
          'contextBridge isolation',
          'YES',
        ],
        [
          'ExecutionEngine',
          'Command execution, TTY simulation',
          'Subprocess sandbox',
          'YES',
        ],
        [
          'StateMonitor',
          'Health checks, telemetry collection',
          'Read-only snapshots',
          'YES',
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
      text: 'Security & Threat Mitigation',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'success',
      title: 'Privilege Escalation Prevention',
      text: 'Main process validates all IPC requests against capability whitelist. Renderer cannot directly invoke privileged operations. All subprocess execution runs under restricted user context.',
      marginBottom: 10,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'info',
      title: 'Resource Exhaustion Protection',
      text: 'Subprocess limits enforce memory caps (512 MB), CPU time budgets (60s), and connection limits (32 open descriptors). Violations trigger immediate termination and event dispatch.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Operational Guidelines',
      marginBottom: 8,
      bookmark: true,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        'Deployment Checklist:\n\n1. Verify sandboxing flags in electron-builder config\n2. Confirm contextIsolation: true in all BrowserWindow instances\n3. Test IPC channel permissions against capability matrix\n4. Validate resource limits in subprocess spawner\n5. Run security audit suite against production binaries\n6. Monitor telemetry stream for anomalies',
      fontSize: 9,
      lineHeight: 1.6,
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 1,
      color: '#e2e8f0',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'signature',
      wrap: false,
      signeeName: 'Your Name',
      role: 'Chief Architect',
      date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    },
  ];

  return {
    id: nanoid(),
    title: 'Technical Architecture Specification',
    description:
      'Comprehensive technical specification with system layers, component matrix, security threat model, and operational guidelines.',
    projectId: projectId ?? null,
    templateId: 'technical-spec',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      theme: DOCUMENT_THEMES.navy,
      header: {
        enabled: true,
        leftText: 'Technical Specification',
        rightText: 'Architecture v2.1',
        showDivider: true,
      },
      footer: {
        enabled: true,
        leftText: 'Internal Use Only',
        rightText: 'Page {{pageNumber}} of {{totalPages}}',
        pageNumberFormat: 'simple',
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
      text: 'Your Document Title',
      subtitle: 'Subtitle, tagline, or date goes here',
      align: 'left',
      marginBottom: 4,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 2,
      color: '#0f172a',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'info',
      title: 'Getting Started',
      text: 'Click any element above to edit it. Use the left panel to add new blocks: headings, paragraphs, tables, metrics cards, columns, callouts, and more. Mix and match to build professional documents.',
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Available Building Blocks',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'columns',
      gap: 12,
      columns: [
        {
          id: nanoid(),
          title: 'Text Formatting',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Paragraphs with custom font size, color, alignment, and line height. Add bold, italic, or code formatting inline.',
              fontSize: 9,
              lineHeight: 1.5,
              marginBottom: 8,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content: 'Perfect for body copy, descriptions, and detailed content.',
              fontSize: 8,
              italic: true,
              color: '#64748b',
            },
          ],
        },
        {
          id: nanoid(),
          title: 'Data Visualization',
          widthRatio: 1,
          blocks: [
            {
              id: nanoid(),
              type: 'paragraph',
              content:
                'Tables with striped rows and custom column widths. Metrics cards for KPIs and statistics. Both render beautifully with theme colors.',
              fontSize: 9,
              lineHeight: 1.5,
              marginBottom: 8,
            },
            {
              id: nanoid(),
              type: 'paragraph',
              content: 'Use tables for structured data, metrics for headlines.',
              fontSize: 8,
              italic: true,
              color: '#64748b',
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
      text: 'Design Features',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'metrics',
      columns: 3,
      items: [
        {
          id: nanoid(),
          label: 'Themes',
          value: '5+',
          change: 'Navy, Emerald, Indigo, and more',
        },
        {
          id: nanoid(),
          label: 'Block Types',
          value: '10+',
          change: 'Everything you need to build',
        },
        {
          id: nanoid(),
          label: 'Page Sizes',
          value: '4',
          change: 'A4, Letter, Legal, Tabloid',
        },
      ],
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'callout',
      variant: 'success',
      title: 'Pro Tips',
      text: 'Use headings (H1–H4) to structure your document outline. Add dividers between sections. Use callout boxes sparingly for important notices. Tables work best for comparing data, metrics for highlighting numbers.',
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'heading',
      level: 2,
      text: 'Common Use Cases',
      marginBottom: 8,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content:
        '📄 Proposals & Business Cases • 💼 Invoices & Estimates\n📋 Reports & Specifications • 📄 Resumes & CVs\n💬 Memos & Correspondence • 📊 Executive Summaries',
      fontSize: 10,
      lineHeight: 1.6,
      marginBottom: 14,
    },
    {
      id: nanoid(),
      type: 'divider',
      thickness: 1,
      color: '#e2e8f0',
      style: 'solid',
      spacing: 12,
      marginBottom: 12,
    },
    {
      id: nanoid(),
      type: 'paragraph',
      content: 'Start editing now by clicking any element or using the left sidebar to add new blocks.',
      fontSize: 9,
      color: '#64748b',
      align: 'center',
      marginBottom: 12,
    },
  ];

  return {
    id: nanoid(),
    title: 'Blank Document',
    description:
      'Fresh canvas with interactive guide. Click elements to edit, use the sidebar to add blocks. Build professional documents with headings, tables, metrics, columns, and more.',
    projectId: projectId ?? null,
    templateId: 'blank-document',
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      theme: DOCUMENT_THEMES.navy,
      header: {
        enabled: true,
        leftText: 'Your Document',
        showDivider: true,
      },
      footer: {
        enabled: true,
        pageNumberFormat: 'simple',
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

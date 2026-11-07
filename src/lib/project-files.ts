/**
 * lib/project-files.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Project File Browser's vocabulary, shared by main and renderer.
 *
 * This module is deliberately UI-free and Electron-free: the scanner classifies
 * a file by its name, the renderer picks the same icon and preview mode from the
 * same function, and the media host constant is declared once so the two sides
 * cannot drift. Anything that needs the filesystem or the database belongs
 * beside them, not here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The `qeda-media://` host that streams a catalogued project file by id. */
export const PROJECT_FILE_HOST = 'project-file';

// ─── Kinds ────────────────────────────────────────────────────────────────────

export const PROJECT_FILE_KINDS = [
  'image',
  'video',
  'audio',
  'document',
  'text',
  'archive',
  'other',
] as const;

export type ProjectFileKind = (typeof PROJECT_FILE_KINDS)[number];

export const PROJECT_FILE_KIND_LABELS: Record<ProjectFileKind, string> = {
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
  document: 'Documents',
  text: 'Text',
  archive: 'Archives',
  other: 'Other',
};

// ─── Sources ──────────────────────────────────────────────────────────────────

/**
 * Where a catalogued file was discovered.
 *
 * `repo`, `code-project` and `assets` come from a filesystem scan; the rest are
 * references the database already holds. A file can have several sources — the
 * same PDF may be both inside the repo and attached to a message — so the table
 * stores a JSON array rather than one value.
 */
export const PROJECT_FILE_SOURCES = [
  'repo',
  'code-project',
  'assets',
  'studio-take',
  'attachment',
  'research-file',
  'indexed',
] as const;

export type ProjectFileSource = (typeof PROJECT_FILE_SOURCES)[number];

export const PROJECT_FILE_SOURCE_LABELS: Record<ProjectFileSource, string> = {
  repo: 'Project repo',
  'code-project': 'Code projects',
  assets: 'Project assets',
  'studio-take': 'Studio takes',
  attachment: 'Attachments',
  'research-file': 'Research files',
  indexed: 'Indexed files',
};

/**
 * Which source wins when a file has more than one. User-authored artifacts
 * (a recording, an attachment) are the more meaningful answer to "what is
 * this?", so they outrank a plain repository scan.
 */
export const PROJECT_FILE_SOURCE_PRIORITY: Record<ProjectFileSource, number> = {
  'studio-take': 60,
  attachment: 50,
  'research-file': 40,
  indexed: 30,
  assets: 20,
  'code-project': 10,
  repo: 0,
};

export function isFilesystemSource(source: ProjectFileSource): boolean {
  return source === 'repo' || source === 'code-project' || source === 'assets';
}

export function pickPrimarySource(
  sources: readonly ProjectFileSource[],
): ProjectFileSource {
  let best: ProjectFileSource = 'repo';
  let bestScore = -1;
  for (const source of sources) {
    const score = PROJECT_FILE_SOURCE_PRIORITY[source] ?? 0;
    if (score > bestScore) {
      best = source;
      bestScore = score;
    }
  }
  return best;
}

// ─── View models ──────────────────────────────────────────────────────────────

export interface ProjectFileRoot {
  /** `repo` | `code:<codeProjectId>` | `assets` */
  key: string;
  label: string;
  type: 'repo' | 'code-project' | 'assets';
  path: string;
  exists: boolean;
}

export interface ProjectFileDirectory {
  /** Path relative to the root, no leading or trailing slash. */
  path: string;
  name: string;
  fileCount: number;
  sizeBytes: number;
}

export interface ProjectFileEntry {
  id: string;
  projectId: string;
  name: string;
  /** Absolute path on disk. Renderer-safe: existing views already handle these. */
  path: string;
  relativePath: string;
  rootKey: string;
  kind: ProjectFileKind;
  mimeType: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
  sources: ProjectFileSource[];
  primarySource: ProjectFileSource;
  missing: boolean;
  /** `qeda-media://project-file/<id>` for previewable kinds, else null. */
  mediaUrl: string | null;
  /** Filmstrip for a Studio take, when one was generated. */
  thumbnailUrl: string | null;
  meta: Record<string, unknown>;
}

/** What a consumer receives when the user confirms a selection. */
export interface ProjectFileSelection {
  /** Owning project, so consumers can make follow-up project-scoped calls. */
  projectId: string;
  id: string;
  name: string;
  path: string;
  kind: ProjectFileKind;
  mimeType: string;
  sizeBytes: number | null;
  mediaUrl: string | null;
  source: ProjectFileSource;
}

export interface ProjectFileRootsInfo {
  roots: ProjectFileRoot[];
  totals: Record<ProjectFileSource, number>;
  scannedAt: number | null;
  stale: boolean;
  truncated: boolean;
}

export interface ProjectFileListResult {
  files: ProjectFileEntry[];
  directories: ProjectFileDirectory[];
  total: number;
  truncated: boolean;
  scannedAt: number | null;
}

export interface ProjectFileTextResult {
  text: string;
  truncated: boolean;
  sizeBytes: number;
}

/** One catalogued image inlined as a `data:` URI, for embedding in a document. */
export interface ProjectFileDataUrlResult {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
}

// ─── Classification ───────────────────────────────────────────────────────────

const EXTENSION_KIND: Record<string, ProjectFileKind> = {
  // images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  avif: 'image',
  bmp: 'image',
  ico: 'image',
  heic: 'image',
  // video
  mp4: 'video',
  m4v: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
  avi: 'video',
  // audio
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  m4b: 'audio',
  aac: 'audio',
  ogg: 'audio',
  oga: 'audio',
  flac: 'audio',
  opus: 'audio',
  // documents
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  xls: 'document',
  xlsx: 'document',
  ppt: 'document',
  pptx: 'document',
  odt: 'document',
  ods: 'document',
  odp: 'document',
  rtf: 'document',
  epub: 'document',
  // text
  md: 'text',
  mdx: 'text',
  txt: 'text',
  json: 'text',
  jsonc: 'text',
  ts: 'text',
  tsx: 'text',
  js: 'text',
  jsx: 'text',
  mjs: 'text',
  cjs: 'text',
  css: 'text',
  scss: 'text',
  html: 'text',
  htm: 'text',
  yml: 'text',
  yaml: 'text',
  toml: 'text',
  xml: 'text',
  csv: 'text',
  sql: 'text',
  sh: 'text',
  bash: 'text',
  py: 'text',
  rb: 'text',
  go: 'text',
  rs: 'text',
  java: 'text',
  c: 'text',
  h: 'text',
  cpp: 'text',
  hpp: 'text',
  swift: 'text',
  kt: 'text',
  env: 'text',
  ini: 'text',
  cfg: 'text',
  conf: 'text',
  // archives
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  xz: 'archive',
  '7z': 'archive',
  rar: 'archive',
};

export function projectFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function classifyProjectFile(name: string): ProjectFileKind {
  return EXTENSION_KIND[projectFileExtension(name)] ?? 'other';
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  opus: 'audio/ogg',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  epub: 'application/epub+zip',
  md: 'text/markdown',
  mdx: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  jsonc: 'application/json',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  scss: 'text/x-scss',
  js: 'text/javascript',
  jsx: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  xml: 'application/xml',
  yml: 'application/yaml',
  yaml: 'application/yaml',
  toml: 'application/toml',
  sql: 'application/sql',
  sh: 'application/x-sh',
  bash: 'application/x-sh',
  py: 'text/x-python',
  go: 'text/x-go',
  rs: 'text/x-rust',
  java: 'text/x-java',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
};

export function projectFileMimeType(name: string): string {
  return (
    MIME_BY_EXTENSION[projectFileExtension(name)] ?? 'application/octet-stream'
  );
}

/** Kinds the modal can render without a native app. */
export function isPreviewableKind(kind: ProjectFileKind): boolean {
  return (
    kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'text' ||
    kind === 'document'
  );
}

export function projectFileMediaUrl(id: string): string {
  return `qeda-media://${PROJECT_FILE_HOST}/${encodeURIComponent(id)}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return '—';
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

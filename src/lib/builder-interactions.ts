/**
 * lib/builder-interactions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-safe interaction contracts for OpenCode tool approvals and forms.
 * These mirror OpenCode v2 payloads without exposing its transport/client types
 * across the Electron IPC boundary.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BuilderFormValue = string | number | boolean | string[];
export type BuilderFormAnswer = Record<string, BuilderFormValue>;

export interface BuilderFormOption {
  value: string;
  label: string;
  description?: string;
}

export interface BuilderFormCondition {
  key: string;
  op: 'eq' | 'neq';
  value: string | number | boolean;
}

interface BuilderFormFieldBase {
  key: string;
  title?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  when?: BuilderFormCondition[];
}

export type BuilderFormField =
  | (BuilderFormFieldBase & {
      type: 'string';
      format?: 'email' | 'uri' | 'date' | 'date-time';
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      placeholder?: string;
      default?: string;
      options?: BuilderFormOption[];
      custom?: boolean;
    })
  | (BuilderFormFieldBase & {
      type: 'number' | 'integer';
      minimum?: number;
      maximum?: number;
      default?: number;
    })
  | (BuilderFormFieldBase & {
      type: 'boolean';
      default?: boolean;
    })
  | (BuilderFormFieldBase & {
      type: 'multiselect';
      options: BuilderFormOption[];
      minItems?: number;
      maxItems?: number;
      custom?: boolean;
      default?: string[];
    })
  | (BuilderFormFieldBase & {
      type: 'external';
      url: string;
      description?: string;
    });

export interface BuilderFormRequest {
  id: string;
  sessionID: string;
  title: string;
  fields: BuilderFormField[];
}

export interface BuilderPermissionRequest {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  message?: string;
}

export type BuilderPermissionDecision = 'once' | 'always' | 'reject';

/** OpenCode `when` clauses are conjunctive: every condition must match. */
export function isBuilderFormFieldVisible(
  field: BuilderFormField,
  answer: BuilderFormAnswer,
): boolean {
  if (field.hidden) return false;
  return (field.when ?? []).every((condition) => {
    const actual = answer[condition.key];
    const matches = Array.isArray(actual)
      ? actual.includes(String(condition.value))
      : actual === condition.value;
    return condition.op === 'eq' ? matches : !matches;
  });
}

export function getBuilderFormDefaults(
  fields: BuilderFormField[],
): BuilderFormAnswer {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.type === 'external' || field.default === undefined
        ? []
        : [[field.key, field.default]],
    ),
  );
}

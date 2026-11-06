import type { BaseTraceElement } from '../core/base-element';

export interface TextAttributes {
  /** The text string content */
  text: string;
  /** Font size in pixels */
  fontSize: number;
  /** CSS font family string */
  fontFamily: string;
  /** Font weight (e.g. 400, 600, 700, 800) */
  fontWeight: number | string;
  /** Font style ('normal' | 'italic') */
  fontStyle?: 'normal' | 'italic';
  /** Letter spacing in pixels */
  letterSpacing?: number;
  /** Line height multiplier or pixels */
  lineHeight?: number;
  /** SVG text alignment anchor */
  textAnchor?: 'start' | 'middle' | 'end';
  /** SVG vertical baseline alignment */
  dominantBaseline?: 'auto' | 'central' | 'hanging';
  /** Primary text color / fill */
  fill?: string;
  /** Fill transparency 0..1 */
  fillOpacity?: number;
  /** Outline stroke color */
  stroke?: string;
  /** Outline stroke thickness in pixels */
  strokeWidth?: number;
  /** Canvas X coordinate */
  baseX?: number;
  x?: number;
  /** Canvas Y coordinate */
  baseY?: number;
  y?: number;
  /** Overall opacity 0..1 */
  opacity?: number;
  /** ID of target SVG path when bound via <textPath> */
  textPathTargetId?: string;
  /** Text path start offset percentage (0..100) or pixel value */
  startOffset?: number;
  /** Typewriter cursor character to render at tail of string */
  typewriterCursor?: string;
  /** Whether the typewriter cursor should blink */
  cursorBlink?: boolean;
  [key: string]: any;
}

export interface TextElement extends BaseTraceElement {
  type: 'text';
  attributes: TextAttributes;
}

/**
 * types.ts
 * TypeScript interfaces for the declarative AnimationSpec.
 * These mirror the JSON schema defined in files/llm-schema.md exactly.
 */

export type ObjectType = 'circle' | 'rect' | 'line' | 'arrow' | 'path' | 'text' | 'particle';

export type ActionType =
  | 'fadeIn'
  | 'fadeOut'
  | 'moveTo'
  | 'applyForce'
  | 'oscillate'
  | 'followPath'
  | 'rotateTo'
  | 'pulse'
  | 'setText'
  | 'remove';

export type EasingType = 'linear' | 'easeInOutQuad' | 'easeOutCubic' | 'easeInCubic';

export interface Point {
  x: number;
  y: number;
}

export interface ObjectProps {
  /** circle / particle radius */
  r?: number;
  /** rect width */
  w?: number;
  /** rect height */
  h?: number;
  fill?: string;
  stroke?: string;
  strokeWeight?: number;
  /** physics mass (default 1) */
  mass?: number;
  /** initial text for type=text */
  text?: string;
  /** font size for type=text */
  size?: number;
  /** arrow: point along current velocity */
  followVelocity?: boolean;
  velocityScale?: number;
  /** start invisible (use when first event is fadeIn) */
  startVisible?: boolean;
}

export interface AnimationObject {
  id: string;
  type: ObjectType;
  /** x/y mirrors another object's position every frame (for force arrows etc.) */
  attachTo?: string;
  x?: number;
  y?: number;
  /** endpoint for line/arrow types */
  to?: Point;
  /** polyline points for path type (max 200) */
  points?: Point[];
  rotation?: number;
  props?: ObjectProps;
}

export interface TimelineEvent {
  target: string;
  /** milliseconds from start when this action begins */
  at: number;
  action: ActionType;
  /** duration of the action in ms */
  duration?: number;
  easing?: EasingType;
  /** moveTo destination */
  to?: Point;
  /** applyForce vector */
  force?: Point;
  /** oscillate amplitude in px */
  amplitude?: number;
  /** oscillate frequency in Hz */
  frequency?: number;
  /** oscillate axis */
  axis?: 'x' | 'y';
  /** followPath override (defaults to object's own points) */
  path?: Point[];
  /** setText value */
  text?: string;
  /** scale peak for pulse action */
  scale?: number;
}

export interface AnimationSpec {
  /** total animation duration in ms (max 60 000) */
  duration: number;
  /** optional canvas background hex color */
  background?: string;
  /** whether the animation loops */
  loop?: boolean;
  objects: AnimationObject[];
  timeline: TimelineEvent[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

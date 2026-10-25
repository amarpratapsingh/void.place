/**
 * Core domain types for void.place
 */

export interface Coordinate {
  x: number;
  y: number;
  zoom: number; // Zoom level (e.g. -10 to +30)
}

export interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  zoom: number;
}

export type SectorKey = string; // e.g. "sector:z12:x104:y89"

export interface SectorInfo {
  key: SectorKey;
  zoomLevel: number;
  sectorX: number;
  sectorY: number;
  lastActive: number;
  elementCount: number;
}

export type ElementType = 'stroke' | 'text' | 'image' | 'embedded-link';

export interface BaseCanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  zoom: number;
  createdAt: number;
  authorId?: string;
}

export interface StrokeElement extends BaseCanvasElement {
  type: 'stroke';
  color: string;
  width: number;
  points: number[]; // Flattened [dx0, dy0, dx1, dy1, ...] relative to element x,y
}

export interface TextElement extends BaseCanvasElement {
  type: 'text';
  content: string;
  fontSize: number;
  color: string;
}

export type CanvasElement = StrokeElement | TextElement;

export interface DiveTarget {
  x: number;
  y: number;
  zoom: number;
  sectorKey: SectorKey;
  description?: string;
}

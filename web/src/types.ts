export type Point = { x: number; y: number };
export type Rotation = 0 | 90 | 180 | 270;
export type EnhanceMode = 'color' | 'gray' | 'bw';
export type PageSize = 'a4' | 'letter' | 'image';

export interface ScanPage {
  id: string;
  name: string;
  sourceUrl: string;
  width: number;
  height: number;
  rotation: Rotation;
  corners: Point[];
  mode: EnhanceMode;
  strength: number;
  detected: boolean;
  thumbUrl?: string;
}

export interface RenderedPage {
  blob: Blob;
  width: number;
  height: number;
}

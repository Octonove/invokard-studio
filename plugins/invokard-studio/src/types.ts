export interface Asset {
  id: string;
  kind: 'image' | 'video' | 'audio';
  path: string;
  source?: { provider: string; creationId?: string; model?: string; url?: string };
}
export interface Scene {
  audioVolume?: number;
  id: string;
  assetId?: string;
  duration: number;
  trimStart?: number;
  text?: string;
  background?: string;
  motion?: 'none' | 'zoom';
}
export interface CaptionWord { start: number; end: number; text: string; }
export interface Caption { start: number; end: number; text: string; words?: CaptionWord[]; }
export interface CaptionStyle {
  mode?: 'auto' | 'word' | 'plain';
  fontSize?: number;
  color?: string;
  activeColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  bold?: boolean;
  maxWordsPerLine?: number;
  maxLines?: number;
  /** Fraction of canvas height reserved below captions. */
  marginBottom?: number;
}
export interface Brand { background: string; color: string; accent: string; fontFamily: string; fontFile?: string; }
export interface Project {
  script?: string;
  carousel?: CarouselSlide[];
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  format: { width: number; height: number; fps: number };
  assets: Asset[];
  scenes: Scene[];
  captions: Caption[];
  captionStyle?: CaptionStyle;
  brand: Brand;
  audio: { voiceAssetId?: string; musicAssetId?: string; musicVolume: number; voiceVolume: number };
  copy: { caption: string; hashtags: string[] };
}
export interface CarouselSlide { title: string; body?: string; assetId?: string; background?: string; }
export interface RenderOptions { preview?: boolean; signal?: AbortSignal; onProgress?: (message: string) => void; }
export interface RenderResult { video: string; subtitles: string; styledSubtitles?: string; captionTiming?: {wordTimedCaptions:number;totalCaptions:number;warnings:string[]}; poster: string; copy: string; }
export interface ProviderJob { id: string; provider: string; remoteId?: string; model: string; status: 'pending' | 'submitted' | 'completed' | 'failed' | 'submission_unknown'; createdAt: string; updatedAt: string; outputUrls?: string[]; error?: string; }

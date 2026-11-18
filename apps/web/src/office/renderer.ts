import type { Pt } from "./graph";
import type { SimFrame } from "./sim";

export interface RenderOptions {
  labels: boolean;
  selectedId: string | null;
  /** Soat matni (masalan 14:05) */
  clock: string;
}

/**
 * Render qatlami shartnomasi. Hozir: Canvas2DRenderer (fon rasmi + canvas).
 * Keyingi versiya: ThreeRenderer (three.js 3D sahna) — xuddi shu interfeys bilan,
 * simulyatsiya va React komponenti o'zgarmaydi.
 */
export interface OfficeRenderer {
  /** Konteynerga ulash (o'lchamni o'zi kuzatadi). */
  mount(container: HTMLElement): void;
  draw(frame: SimFrame, opts: RenderOptions): void;
  /** Ekran koordinatasini (clientX/Y) dunyo birligiga aylantiradi. */
  toWorld(clientX: number, clientY: number): Pt | null;
  destroy(): void;
}

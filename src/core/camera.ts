import { clamp } from '../sim/util';

/**
 * Camera over the side-view world. `zoom` = low-res pixels per world unit.
 * The canvas renders at low resolution (pixel art) and is upscaled with nearest-neighbour.
 */
export class Camera {
  x = 600;    // world center
  y = 850;
  zoom = 0.6;
  lowW = 400;
  lowH = 300;
  cssW = 800;
  cssH = 600;
  worldW = 3000;
  worldH = 1400;
  followId: number | null = null;

  get scale() { return this.lowW / this.cssW; } // low px per css px
  get left() { return this.x - this.lowW / 2 / this.zoom; }
  get top() { return this.y - this.lowH / 2 / this.zoom; }
  get viewW() { return this.lowW / this.zoom; }
  get viewH() { return this.lowH / this.zoom; }

  minZoom() { return Math.min(this.lowW / (this.worldW + 900), this.lowH / (this.worldH + 600)); }
  maxZoom() { return 2.6 * this.scale; }

  cssToWorld(cx: number, cy: number) {
    return { x: this.left + (cx * this.scale) / this.zoom, y: this.top + (cy * this.scale) / this.zoom };
  }
  worldToCss(wx: number, wy: number) {
    return { x: ((wx - this.left) * this.zoom) / this.scale, y: ((wy - this.top) * this.zoom) / this.scale };
  }
  /** world units per css pixel */
  get unitPerCss() { return this.scale / this.zoom; }

  zoomAt(cx: number, cy: number, factor: number) {
    const before = this.cssToWorld(cx, cy);
    this.zoom = clamp(this.zoom * factor, this.minZoom(), this.maxZoom());
    const after = this.cssToWorld(cx, cy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  panCss(dx: number, dy: number) {
    this.x -= dx * this.unitPerCss;
    this.y -= dy * this.unitPerCss;
    this.followId = null;
    this.clamp();
  }

  clamp() {
    this.zoom = clamp(this.zoom, this.minZoom(), this.maxZoom());
    const hw = this.viewW / 2, hh = this.viewH / 2;
    this.x = hw * 2 >= this.worldW + 900 ? this.worldW / 2 - 250 : clamp(this.x, hw - 700, this.worldW + 200 - hw); // the sea extends to the left
    const bottom = this.worldH + 45; // a little earth below the ground, not a wall of dirt
    const topLimit = -400;
    this.y = hh * 2 >= bottom - topLimit ? (bottom + topLimit) / 2 : clamp(this.y, topLimit + hh, bottom - hh);
  }
}

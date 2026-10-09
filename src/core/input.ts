import type { Camera } from './camera';

export interface InputHandler {
  /** single tap (no drag) at world coords */
  tap(wx: number, wy: number): void;
  /** a one-finger drag begins; return true to capture it (e.g. moving a ghost), false to pan the camera */
  dragStart(wx: number, wy: number): boolean;
  dragMove(wx: number, wy: number): void;
  /** vx, vy: finger velocity in world units per second (for flicks) */
  dragEnd(wx: number, wy: number, vx: number, vy: number): void;
  /** finger/mouse pressed (single pointer) — used for hold actions */
  press?(wx: number, wy: number): void;
  /** press ended or turned into a pan/pinch */
  release?(): void;
  /** pointer hover (mouse only) */
  hover?(wx: number, wy: number): void;
}

const TAP_SLOP = 9; // css px

/** Unified mouse/touch input: tap, captured drag, one-finger pan, two-finger pinch zoom, wheel zoom. */
export class Input {
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private dragging: 'none' | 'pan' | 'capture' = 'none';
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  private wasPinch = false;
  private trail: { t: number; x: number; y: number }[] = [];

  constructor(private el: HTMLElement, private cam: Camera, private h: InputHandler) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  private local(e: PointerEvent | WheelEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent) => {
    try { this.el.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    const p = this.local(e);
    this.pts.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now() });
    if (this.pts.size === 2) {
      if (this.dragging === 'capture') { const w = this.cam.cssToWorld(p.x, p.y); this.h.dragEnd(w.x, w.y, 0, 0); }
      this.dragging = 'none';
      this.wasPinch = true;
      const [a, b] = [...this.pts.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    } else if (this.pts.size === 1) {
      this.wasPinch = false;
      this.trail = [{ t: performance.now(), x: p.x, y: p.y }];
      const w = this.cam.cssToWorld(p.x, p.y);
      this.h.press?.(w.x, w.y);
    }
    if (this.pts.size >= 2) this.h.release?.();
  };

  private move = (e: PointerEvent) => {
    const p = this.local(e);
    const pt = this.pts.get(e.pointerId);
    if (!pt) {
      if (e.pointerType === 'mouse' && this.h.hover) { const w = this.cam.cssToWorld(p.x, p.y); this.h.hover(w.x, w.y); }
      return;
    }
    const dx = p.x - pt.x, dy = p.y - pt.y;
    pt.x = p.x; pt.y = p.y;
    const now = performance.now();
    this.trail.push({ t: now, x: p.x, y: p.y });
    while (this.trail.length > 2 && now - this.trail[0].t > 90) this.trail.shift();
    if (this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0) this.cam.zoomAt(mid.x, mid.y, d / this.pinchDist);
      this.cam.panCss(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
      this.pinchDist = d;
      this.pinchMid = mid;
      return;
    }
    if (this.wasPinch) return;
    if (this.dragging === 'none') {
      if (Math.hypot(p.x - pt.sx, p.y - pt.sy) < TAP_SLOP) return;
      const w = this.cam.cssToWorld(pt.sx, pt.sy);
      this.dragging = this.h.dragStart(w.x, w.y) ? 'capture' : 'pan';
      if (this.dragging === 'pan') { this.h.release?.(); this.cam.panCss(p.x - pt.sx, p.y - pt.sy); }
      else { const w2 = this.cam.cssToWorld(p.x, p.y); this.h.dragMove(w2.x, w2.y); }
      return;
    }
    if (this.dragging === 'pan') this.cam.panCss(dx, dy);
    else { const w = this.cam.cssToWorld(p.x, p.y); this.h.dragMove(w.x, w.y); }
  };

  private up = (e: PointerEvent) => {
    const pt = this.pts.get(e.pointerId);
    this.pts.delete(e.pointerId);
    if (!pt) return;
    if (this.pts.size > 0) { this.pinchDist = 0; const r = [...this.pts.values()][0]; this.pinchMid = { x: r.x, y: r.y }; return; }
    const w = this.cam.cssToWorld(pt.x, pt.y);
    this.h.release?.();
    if (this.dragging === 'capture') {
      const v = this.velocity();
      this.h.dragEnd(w.x, w.y, v.x * this.cam.unitPerCss, v.y * this.cam.unitPerCss);
    }
    else if (this.dragging === 'none' && !this.wasPinch) this.h.tap(w.x, w.y);
    this.dragging = 'none';
    this.wasPinch = false;
  };

  /** css px per second over the last ~90 ms */
  private velocity() {
    const tr = this.trail;
    if (tr.length < 2) return { x: 0, y: 0 };
    const a = tr[0], b = tr[tr.length - 1];
    const dt = Math.max(16, b.t - a.t) / 1000;
    if (performance.now() - b.t > 120) return { x: 0, y: 0 }; // finger stopped before lifting
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }

  private cancel = (e: PointerEvent) => {
    this.pts.delete(e.pointerId);
    this.h.release?.();
    if (this.pts.size === 0) {
      if (this.dragging === 'capture') { const w = this.cam.cssToWorld(e.clientX, e.clientY); this.h.dragEnd(w.x, w.y, 0, 0); }
      this.dragging = 'none';
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.local(e);
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) this.cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    else this.cam.panCss(-e.deltaX, 0);
  };
}

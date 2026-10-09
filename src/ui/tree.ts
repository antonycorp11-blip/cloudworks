// The Engineering Tree screen: a pannable/zoomable blueprint of brass nodes joined by pipes.
import { MACHINES } from '../data/machines';
import { BRANCHES, NODE, TREE, type Branch } from '../data/tree';
import { PERMANENT, UPGRADES } from '../data/upgrades';
import type { Game } from '../game';
import { drawIcon } from '../render/renderer';
import { fmt } from '../sim/util';
import { icon } from './icons';

const UNIT = 122;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

export class TreeView {
  private board: HTMLElement;
  private svg: SVGSVGElement;
  private nodes = new Map<string, HTMLElement>();
  private edges: { el: SVGGElement; from: string; to: string }[] = [];
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private minX = 0;
  private minY = 0;
  private selected: string | null = null;
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private pinch = 0;
  private moved = false;
  private nodeKeys = new Map<string, string>();
  private detailKey = '';
  private headKey = '';
  isOpen = false;

  constructor(private g: Game) {
    this.board = $('tree-board');
    this.svg = document.getElementById('tree-svg') as unknown as SVGSVGElement;
    this.build();
    const vp = $('tree-view');
    vp.addEventListener('pointerdown', this.down);
    vp.addEventListener('pointermove', this.move);
    vp.addEventListener('pointerup', this.up);
    vp.addEventListener('pointercancel', this.up);
    vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    $('tree-close').onclick = () => this.close();
    $('tree-center').onclick = () => this.center(true);
    $('tree-close').innerHTML = icon('close', 18);
    $('tree-center').innerHTML = icon('build', 20);
  }

  // ───────────── construction ─────────────
  private build() {
    this.minX = Math.min(...TREE.map(n => n.x)) - 1.2;
    this.minY = Math.min(...TREE.map(n => n.y)) - 1.2;
    const maxX = Math.max(...TREE.map(n => n.x)) + 1.2, maxY = Math.max(...TREE.map(n => n.y)) + 1.4;
    const W = (maxX - this.minX) * UNIT, H = (maxY - this.minY) * UNIT;
    this.board.style.width = `${W}px`;
    this.board.style.height = `${H}px`;
    this.svg.setAttribute('width', String(W));
    this.svg.setAttribute('height', String(H));
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // branch titles, faint and huge, behind everything
    const labels = $('tree-labels');
    labels.innerHTML = '';
    for (const b of Object.keys(BRANCHES) as Branch[]) {
      if (b === 'core') continue;
      const ns = TREE.filter(n => n.branch === b);
      const cx = ns.reduce((s, n) => s + n.x, 0) / ns.length, cy = ns.reduce((s, n) => s + n.y, 0) / ns.length;
      const far = TREE.filter(n => n.branch === b).reduce((a, n) => (Math.hypot(n.x, n.y) > Math.hypot(a.x, a.y) ? n : a));
      const lx = cx + (far.x - cx) * 0.35, ly = cy + (far.y - cy) * 0.35;
      const el = document.createElement('div');
      el.className = 'tree-branch';
      el.style.left = `${this.px(lx)}px`;
      el.style.top = `${this.py(ly) - 70}px`;
      el.style.setProperty('--c', BRANCHES[b].color);
      el.innerHTML = `${icon(BRANCHES[b].icon, 26)}<span>${BRANCHES[b].name}</span>`;
      labels.appendChild(el);
    }
    // pipes
    this.svg.innerHTML = '';
    this.edges = [];
    const NS = 'http://www.w3.org/2000/svg';
    for (const n of TREE) for (const r of n.requires) {
      const p = NODE[r];
      const x1 = this.px(p.x), y1 = this.py(p.y), x2 = this.px(n.x), y2 = this.py(n.y);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const d = Math.abs(x2 - x1) > Math.abs(y2 - y1)
        ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
        : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      const gEl = document.createElementNS(NS, 'g');
      gEl.setAttribute('class', 'edge');
      gEl.style.setProperty('--c', BRANCHES[n.branch].color);
      for (const cls of ['pipe-bg', 'pipe', 'flow']) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', cls);
        gEl.appendChild(path);
      }
      this.svg.appendChild(gEl);
      this.edges.push({ el: gEl, from: r, to: n.id });
    }
    // nodes
    const host = $('tree-nodes');
    host.innerHTML = '';
    this.nodes.clear();
    for (const n of TREE) {
      const el = document.createElement('button');
      el.className = `tnode ${n.id === 'core' ? 'root' : ''} ${n.unlock ? 'research' : ''} ${n.perm ? 'legacy' : ''}`;
      el.style.left = `${this.px(n.x)}px`;
      el.style.top = `${this.py(n.y)}px`;
      el.style.setProperty('--c', BRANCHES[n.branch].color);
      el.innerHTML = `<div class="medal">${icon(n.icon, n.id === 'core' ? 40 : 30)}</div><div class="pips"></div><div class="tname">${n.name}</div><div class="tcost"></div>`;
      el.dataset.id = n.id;
      host.appendChild(el);
      this.nodes.set(n.id, el);
    }
  }
  private px(x: number) { return (x - this.minX) * UNIT; }
  private py(y: number) { return (y - this.minY) * UNIT; }

  // ───────────── open / close ─────────────
  open(focus?: string) {
    this.isOpen = true;
    this.nodeKeys.clear();
    this.detailKey = '';
    this.headKey = '';
    $('tree').classList.remove('hidden');
    this.refresh();
    if (focus) { this.select(focus); this.center(false, focus); }
    else if (!this.selected) this.center(false);
  }
  close() {
    this.isOpen = false;
    $('tree').classList.add('hidden');
    this.g.ui.refreshBar();
  }

  center(animate: boolean, id = 'core') {
    const vp = $('tree-view').getBoundingClientRect();
    const n = NODE[id];
    const phone = vp.width < 560;
    this.scale = phone ? 0.62 : Math.max(0.5, Math.min(1, vp.width / 900));
    this.ox = vp.width / 2 - this.px(n.x) * this.scale;
    this.oy = vp.height * (phone && this.selected ? 0.3 : 0.45) - this.py(n.y) * this.scale;
    this.board.style.transition = animate ? 'transform .45s cubic-bezier(.2,.8,.2,1)' : 'none';
    this.apply();
    setTimeout(() => { this.board.style.transition = 'none'; }, 460);
  }
  private apply() { this.board.style.transform = `translate(${this.ox}px, ${this.oy}px) scale(${this.scale})`; }
  private zoomAt(x: number, y: number, f: number) {
    const ns = Math.max(0.35, Math.min(1.8, this.scale * f));
    const k = ns / this.scale;
    this.ox = x - (x - this.ox) * k;
    this.oy = y - (y - this.oy) * k;
    this.scale = ns;
    this.apply();
  }

  // ───────────── input: pan, pinch, tap ─────────────
  private down = (e: PointerEvent) => {
    const r = $('tree-view').getBoundingClientRect();
    this.pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX, sy: e.clientY });
    try { $('tree-view').setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (this.pts.size === 1) this.moved = false;
    if (this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.moved = true; }
  };
  private move = (e: PointerEvent) => {
    const p = this.pts.get(e.pointerId);
    if (!p) return;
    const r = $('tree-view').getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (this.pts.size >= 2) {
      p.x = x; p.y = y;
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinch);
      this.pinch = d;
      return;
    }
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) this.moved = true;
    if (this.moved) { this.ox += x - p.x; this.oy += y - p.y; this.apply(); }
    p.x = x; p.y = y;
  };
  private up = (e: PointerEvent) => {
    this.pts.delete(e.pointerId);
    if (this.pts.size > 0) return;
    this.pinch = 0;
    if (!this.moved) {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.tnode') as HTMLElement | null;
      if (el?.dataset.id) this.select(el.dataset.id);
      else this.select(null);
    }
  };

  // ───────────── state rendering ─────────────
  select(id: string | null) {
    this.selected = id;
    this.nodeKeys.clear();
    for (const [nid, el] of this.nodes) el.classList.toggle('sel', nid === id);
    this.renderDetail();
  }

  /** Only touches the DOM where something actually changed (this runs several times a second). */
  refresh() {
    if (!this.isOpen) return;
    const s = this.g.sim;
    const head = `${fmt(s.credits)}|${s.patents}`;
    if (head !== this.headKey) {
      this.headKey = head;
      $('tree-credits').innerHTML = `${icon('coin', 18)}<b>${fmt(s.credits)}</b>`;
      $('tree-patents').innerHTML = `${icon('star', 18)}<b>${s.patents}</b>`;
    }
    for (const n of TREE) {
      const el = this.nodes.get(n.id)!;
      const st = s.nodeState(n.id);
      const lvl = s.nodeLevel(n.id), max = s.nodeMax(n.id);
      const cost = s.nodeCost(n.id);
      const can = st === 'available' || st === 'owned' ? (n.perm ? s.patents >= cost : s.canAfford(cost)) : false;
      const key = `${st}|${lvl}|${cost}|${can}|${n.id === this.selected}`;
      if (this.nodeKeys.get(n.id) === key) continue;
      this.nodeKeys.set(n.id, key);
      el.className = `tnode ${n.id === 'core' ? 'root' : ''} ${n.unlock ? 'research' : ''} ${n.perm ? 'legacy' : ''} ${st} ${can ? 'afford' : ''} ${n.id === this.selected ? 'sel' : ''}`;
      const pips = el.querySelector('.pips') as HTMLElement;
      pips.innerHTML = max <= 1 || n.id === 'core' ? '' : max <= 8
        ? Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')
        : `<span>${lvl}/${max}</span>`;
      const tc = el.querySelector('.tcost') as HTMLElement;
      tc.innerHTML = st === 'maxed' || st === 'locked' || n.id === 'core' ? '' : n.perm ? `${icon('star', 12)}${cost}` : `${icon('coin', 12)}${fmt(cost)}`;
    }
    for (const e of this.edges) {
      const on = s.nodeLevel(e.to) > 0, ready = s.nodeLevel(e.from) > 0;
      const cls = `edge ${on ? 'on' : ready ? 'ready' : 'off'}`;
      if (e.el.getAttribute('class') !== cls) e.el.setAttribute('class', cls);
    }
    this.renderDetail();
  }

  private renderDetail() {
    const box = $('tree-detail');
    const id = this.selected;
    if (!id) { this.detailKey = ''; box.classList.add('hidden'); return; }
    const s = this.g.sim, n = NODE[id];
    const st = s.nodeState(id), lvl = s.nodeLevel(id), max = s.nodeMax(id), cost = s.nodeCost(id);
    // rebuild only when what it shows changes — rebuilding under the finger swallowed taps on "Pesquisar"
    const dkey = `${id}|${st}|${lvl}|${cost}|${(n.perm ? s.patents >= cost : s.canAfford(cost))}`;
    if (dkey === this.detailKey) return;
    this.detailKey = dkey;
    const br = BRANCHES[n.branch];
    let effect = '';
    if (n.mod) {
      const u = UPGRADES.find(x => x.id === n.mod)!;
      effect = `<div class="eff"><span>Agora</span><b>${lvl ? u.effectText(lvl) : '—'}</b><span>→</span><b class="next">${lvl < max ? u.effectText(lvl + 1) : 'máximo'}</b></div>`;
    }
    if (n.perm) { const p = PERMANENT.find(x => x.id === n.perm)!; effect = `<div class="eff"><span>Nível</span><b>${s.mods.perm[n.perm]}/${p.max}</b><span>Permanente entre biomas</span></div>`; }
    let unlock = '';
    if (n.unlock) unlock = `<div class="unlocks">${n.unlock.map(k => `<div class="ucard"><canvas data-k="${k}" width="56" height="46"></canvas><span>${MACHINES[k].name}</span></div>`).join('')}<small>Pesquisa permanente — vale em todos os biomas</small></div>`;
    const req = st === 'locked' ? `<div class="req">Requer: ${n.requires.filter(r => s.nodeLevel(r) === 0).map(r => NODE[r].name).join(', ')}</div>` : '';
    const can = (st === 'available' || st === 'owned') && (n.perm ? s.patents >= cost : s.canAfford(cost));
    const btn = id === 'core' ? '' : st === 'maxed'
      ? `<button class="btn iron" disabled>${n.unlock ? 'Pesquisado' : 'Nível máximo'}</button>`
      : `<button class="btn ${can ? 'green' : ''}" id="tree-buy" ${can ? '' : 'disabled'}>${n.unlock ? 'Pesquisar' : n.perm ? 'Adquirir' : 'Melhorar'} · ${n.perm ? `${icon('star', 14)}${cost}` : `${icon('coin', 14)}${fmt(cost)}`}</button>`;
    box.innerHTML = `
      <div class="td-head" style="--c:${br.color}"><div class="medal">${icon(n.icon, 30)}</div>
        <div><small>${br.name}${max > 1 && !n.perm ? ` · nível ${lvl}/${max}` : ''}</small><b>${n.name}</b></div></div>
      <p>${n.desc}</p>${effect}${unlock}${req}<div class="td-actions">${btn}</div>`;
    box.classList.remove('hidden');
    box.querySelectorAll<HTMLCanvasElement>('canvas[data-k]').forEach(cv => drawIcon(cv, cv.dataset.k as keyof typeof MACHINES));
    const b = document.getElementById('tree-buy');
    if (b) b.onclick = () => this.buy(id);
  }

  private buy(id: string) {
    const r = this.g.sim.research(id);
    if (!r.ok) { this.g.ui.toast(r.reason ?? 'Indisponível', 'warn'); this.g.audio.play('error'); return; }
    const el = this.nodes.get(id)!;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    for (let i = 0; i < 14; i++) {
      const sp = document.createElement('i');
      sp.className = 'spark';
      const a = (i / 14) * Math.PI * 2, d = 50 + Math.random() * 40;
      sp.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      sp.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      el.appendChild(sp);
      setTimeout(() => sp.remove(), 700);
    }
    if (NODE[id].unlock) this.g.ui.toast(`Pesquisa concluída: ${NODE[id].unlock!.map(k => MACHINES[k].name).join(' e ')} na Oficina!`, 'good');
    this.refresh();
    this.g.ui.refreshShopNow();
  }
}

// DOM interface: HUD, the Ancient's panel & speech, missions, workshop, upgrades, modals, title screen.
import { BIOMES } from '../data/biomes';
import { MOOD_LABEL } from '../data/creatures';
import { MACHINES, SHOP_ORDER, type MachineKind } from '../data/machines';
import type { Game } from '../game';
import { normAngle } from '../game';
import type { SimEvent } from '../sim/events';
import { drawIcon } from '../render/renderer';
import { fmt } from '../sim/util';
import { icon } from './icons';
import { TreeView } from './tree';
import { TREE } from '../data/tree';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const deg = (r: number) => Math.round((r * 180) / Math.PI);
const coin = (n: number | string, size = 14) => `${icon('coin', size)}<span>${typeof n === 'number' ? fmt(n) : n}</span>`;
const EYE: Record<string, string> = { starving: '#ff3a2a', thirsty: '#ffb347', content: '#9ae8ff', euphoric: '#c8ff7a', sleeping: '#555' };

export class UI {
  paused = false;
  private ctxKey = '';
  tree: TreeView;
  private tick = 0;
  private shopCards: { kind: MachineKind; el: HTMLElement }[] = [];
  private speech: { text: string; shown: number; life: number; angry: boolean } | null = null;
  private missionId = '';

  constructor(private g: Game) {
    document.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon!, Number(el.dataset.size ?? 22)); });
    document.querySelectorAll<HTMLElement>('.x').forEach(el => { el.innerHTML = icon('close', 18); });
    $('b-build').onclick = () => this.toggleShop();
    $('b-pipe').onclick = () => { this.close('shop'); g.setMode(g.view.mode === 'pipe' ? 'play' : 'pipe'); };
    $('b-up').onclick = () => this.openUpgrades();
    $('b-target').onclick = () => g.goTarget();
    $('b-home').onclick = () => g.goHome();
    $('b-menu').onclick = () => this.open('menu');
    $('creature').onclick = () => g.goTarget();
    document.querySelectorAll<HTMLElement>('[data-close]').forEach(b => { b.onclick = () => this.close(b.dataset.close!); });
    this.tree = new TreeView(g);
    for (const id of ['menu']) $(id).addEventListener('pointerdown', e => { if (e.target === $(id)) this.close(id); });
    $('m-sound').onclick = () => { g.audio.setEnabled(!g.audio.enabled); this.refreshMenu(); };
    $('m-save').onclick = () => { g.save(); this.toast('Jogo salvo', 'good'); };
    $('m-help').onclick = () => $('help').classList.toggle('hidden');
    $('m-reset').onclick = () => { if (confirm('Apagar todo o progresso e recomeçar?')) { this.close('menu'); g.restart(); } };
    $('win-stay').onclick = () => this.close('win');
    $('win-next').onclick = () => { this.close('win'); g.nextLevel(); };
    $('intro-go').onclick = () => { this.close('intro'); this.paused = false; g.audio.unlock(); };
    $('t-play').onclick = () => {
      g.audio.unlock();
      g.audio.play('roar');
      $('title').classList.add('leaving');
      setTimeout(() => { $('title').classList.add('hidden'); this.paused = false; if (g.sim.time < 2) this.showIntro(); }, 650);
    };
    this.paused = true; // title screen first; the world keeps rendering behind it
    this.rebuild();
  }

  rebuild() {
    this.buildShop();
    this.ctxKey = '';
    this.missionId = '';
    const d = this.g.sim.creature.def;
    $('cr-name').textContent = d.name;
    $('cr-title').textContent = d.title;
    $('cr-pips').innerHTML = d.needs.map(() => '<i></i>').join('');
    this.refreshCtx();
    this.refreshBar();
    this.refreshMenu();
  }

  // ───────────── generic ─────────────
  open(id: string) { $(id).classList.remove('hidden'); if (id === 'menu') this.refreshMenu(); }
  close(id: string) { $(id).classList.add('hidden'); this.refreshBar(); }
  closeAll() { for (const id of ['shop', 'menu']) this.close(id); this.tree.close(); }

  toast(text: string, kind: 'info' | 'good' | 'warn' | 'mission' = 'info', html = false) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    if (html) el.innerHTML = text; else el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild?.remove();
    setTimeout(() => el.remove(), 2950);
  }

  float(wx: number, wy: number, text: string, color = '#fff') {
    const p = this.g.cam.worldToCss(wx, wy);
    if (p.x < -50 || p.y < -50 || p.x > this.g.cam.cssW + 50 || p.y > this.g.cam.cssH + 50) return;
    const el = document.createElement('div');
    el.className = 'float';
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.color = color;
    el.textContent = text;
    $('floats').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /** coins fly from the rain to the credits plate */
  private coins(wx: number, wy: number, amount: number) {
    const p = this.g.cam.worldToCss(wx, wy);
    const plate = $('h-credits-plate').getBoundingClientRect();
    const tx = plate.left + 18, ty = plate.top + plate.height / 2;
    const onScreen = p.x > -20 && p.y > -20 && p.x < this.g.cam.cssW + 20 && p.y < this.g.cam.cssH + 20;
    if (onScreen) this.float(wx, wy, `+${amount < 10 ? amount.toFixed(1) : fmt(amount)}`, '#ffd76a');
    const n = onScreen ? Math.min(7, 1 + Math.floor(Math.sqrt(amount))) : 1;
    const sx = onScreen ? p.x : this.g.cam.cssW / 2, sy = onScreen ? p.y : this.g.cam.cssH / 2;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'coin';
      el.innerHTML = icon('coin', 18);
      const jx = (Math.random() - 0.5) * 40, jy = (Math.random() - 0.5) * 30;
      el.style.transform = `translate(${sx + jx}px, ${sy + jy}px)`;
      if (!onScreen) el.style.opacity = '0';
      $('floats').appendChild(el);
      setTimeout(() => {
        el.style.transform = `translate(${tx}px, ${ty}px) scale(.7)`;
        el.style.opacity = '0';
      }, 30 + i * 70);
      setTimeout(() => {
        el.remove();
        const pl = $('h-credits-plate');
        pl.classList.add('bump');
        setTimeout(() => pl.classList.remove('bump'), 120);
        if (i === 0) this.g.audio.play('coin');
      }, 850 + i * 70);
    }
  }

  onEvent(e: SimEvent) {
    switch (e.type) {
      case 'toast': this.toast(e.text, e.kind); break;
      case 'float': this.float(e.x, e.y, e.text, e.color); break;
      case 'coins': this.coins(e.x, e.y, e.amount); break;
      case 'levelComplete': setTimeout(() => this.showWin(), 2200); break;
      case 'firstRain': $('b-build').classList.add('pulse'); break;
      case 'mission':
        this.toast(`${icon('check', 18)} ${e.text.replace('{C}', this.g.sim.creature.def.name)} &nbsp;<b>+${fmt(e.reward)}</b>`, 'mission', true);
        $('mission').classList.remove('done');
        void $('mission').offsetWidth;
        $('mission').classList.add('done');
        break;
      case 'speak':
        this.speech = { text: e.text, shown: 0, life: 3 + e.text.length / 16, angry: e.mood === 'starving' || e.kind === 'missed' };
        $('speech-name').textContent = this.g.sim.creature.def.name;
        $('speech-text').textContent = '';
        $('speech').classList.remove('hidden');
        $('speech').classList.toggle('angry', this.speech.angry);
        break;
    }
  }

  showIntro() {
    const s = this.g.sim, b = s.biome, d = s.creature.def;
    $('intro-sub').textContent = `${b.subtitle} · ${b.name}`;
    $('intro-title').textContent = `${d.name}, ${d.title}`;
    $('intro-text').textContent = `${b.intro} A chuva que chega ao destino alimenta ${d.name}. Leve-o à forma final.`;
    this.paused = true;
    this.open('intro');
  }

  private showWin() {
    const s = this.g.sim, b = s.biome, d = s.creature.def;
    $('win-title').textContent = `${d.name} despertou por completo`;
    const next = BIOMES[s.biomeIndex + 1];
    $('win-text').textContent = `“Agora sou grande o bastante para chamar a chuva sozinho. Vá, pequeno engenheiro. Outros como eu ainda dormem.”`;
    const st = s.stats;
    const t = Math.round(s.time);
    $('win-stats').innerHTML = [
      ['Tempo', `${Math.floor(t / 60)}m ${t % 60}s`], ['Chuva entregue', `${fmt(st.rainTarget)} L`],
      ['Vapor gerado', `${fmt(st.steam)} L`], ['Fusões de nuvens', `${st.merges}`],
      ['Créditos ganhos', `${fmt(st.earned)}`], ['Patentes', `+${b.reward}`],
    ].map(([a, v]) => `<span>${a}</span><b>${v}</b>`).join('');
    ($('win-next') as HTMLButtonElement).textContent = next ? `Próximo: ${next.name}` : 'Recomeçar o último';
    this.open('win');
  }

  refreshMenu() { $('m-sound').textContent = this.g.audio.enabled ? 'Som: ligado' : 'Som: desligado'; }

  refreshBar() {
    const v = this.g.view;
    $('b-build').classList.toggle('on', !$('shop').classList.contains('hidden') || v.mode === 'place');
    $('b-pipe').classList.toggle('on', v.mode === 'pipe');
    $('b-up').classList.toggle('on', !!this.tree?.isOpen);
  }

  // ───────────── workshop ─────────────
  toggleShop() {
    const sh = $('shop');
    if (sh.classList.contains('hidden')) {
      if (this.g.view.mode === 'pipe') this.g.setMode('play');
      this.g.select(null);
      sh.classList.remove('hidden');
      $('b-build').classList.remove('pulse');
    } else sh.classList.add('hidden');
    this.refreshBar();
    this.refreshShop();
  }

  private buildShop() {
    const box = $('shop-cards');
    box.innerHTML = '';
    this.shopCards = [];
    for (const kind of SHOP_ORDER) {
      const d = MACHINES[kind];
      const el = document.createElement('button');
      el.className = 'card';
      const cv = document.createElement('canvas');
      cv.width = 76; cv.height = 62;
      drawIcon(cv, kind);
      el.appendChild(cv);
      el.insertAdjacentHTML('beforeend', `<div class="n">${d.name}</div><div class="p">${coin(d.cost)}</div>`);
      el.title = d.desc;
      el.onclick = () => {
        if (!this.g.sim.isUnlocked(kind)) {
          const node = this.g.sim.unlockNodeFor(kind);
          $('shop').classList.add('hidden');
          this.tree.open(node?.id);
          return;
        }
        $('shop').classList.add('hidden');
        this.g.startPlacing(kind);
      };
      box.appendChild(el);
      this.shopCards.push({ kind, el });
    }
  }

  refreshShopNow() { this.refreshShop(); }
  private refreshShop() {
    for (const { kind, el } of this.shopCards) {
      const d = MACHINES[kind];
      const locked = !this.g.sim.isUnlocked(kind);
      el.classList.toggle('locked', locked);
      el.classList.toggle('poor', !locked && !this.g.sim.canAfford(d.cost));
      el.querySelector('.p')!.innerHTML = locked ? `${icon('lock', 14)}<span>Pesquisar</span>` : coin(d.cost);
    }
  }

  // ───────────── engineering tree ─────────────
  openUpgrades() {
    this.close('shop');
    this.tree.open();
    this.refreshBar();
  }

  // ───────────── context panel ─────────────
  refreshCtx() { this.ctxKey = ''; this.renderCtx(); }

  private renderCtx() {
    const g = this.g, v = g.view, s = g.sim;
    const box = $('ctx');
    let key: string = v.mode;
    if (v.mode === 'place' && v.ghost) key += `:${v.ghost.kind}:${v.ghost.ok}:${v.ghost.reason}:${deg(v.ghost.angle)}:${v.ghost.flip}:${v.ghost.moveId}`;
    if (v.mode === 'pipe') key += `:${v.pendingPort?.m}:${v.pendingPort?.port}`;
    if (v.mode === 'play' && v.selection) {
      key += `:${v.selection.type}:${v.selection.id}:${g.cam.followId}`;
      if (v.selection.type === 'machine') key += `:${s.byId.get(v.selection.id)?.on}`;
    }
    if (key === this.ctxKey) { this.updateCtxStats(); return; }
    this.ctxKey = key;

    if (v.mode === 'place' && v.ghost) {
      const gh = v.ghost, d = MACHINES[gh.kind];
      const moving = gh.moveId != null;
      box.innerHTML = `<h3>${moving ? 'Mover: ' : ''}${d.name}<span class="cost">${moving ? '' : coin(d.cost)}</span></h3>
        <div class="desc">Arraste (ou toque no mapa) para posicionar.${d.rotatable ? ` Direção: <b>${deg(-gh.angle)}°</b>` : ''}</div>
        <div class="reason">${gh.ok ? '' : gh.reason ?? ''}</div>
        <div class="actions">
          ${d.rotatable ? '<button class="btn iron" data-a="rl">⟲ 15°</button><button class="btn iron" data-a="rr">⟳ 15°</button>' : ''}
          ${d.ports.length ? '<button class="btn iron" data-a="flip">⇋ Espelhar</button>' : ''}
          <button class="btn red" data-a="cancel">Cancelar</button>
          <button class="btn green" data-a="ok">${moving ? 'Mover' : 'Construir'}</button>
        </div>`;
    } else if (v.mode === 'pipe') {
      box.innerHTML = `<h3>${icon('pipe', 20)} Tubulação</h3>
        <div class="desc">${v.pendingPort ? 'Agora toque numa <b>entrada</b> compatível — ou arraste até ela.' : 'Arraste de uma <b>saída</b> (quadrado cheio) até uma <b>entrada</b> (quadrado vazado). Azul = água, branco = vapor.'}</div>
        <div class="actions"><button class="btn" data-a="pipedone">Concluir</button></div>`;
    } else if (v.selection) {
      box.innerHTML = this.selectionHtml();
    } else box.innerHTML = '';
    box.classList.toggle('hidden', box.innerHTML === '');
    box.querySelectorAll<HTMLElement>('[data-a]').forEach(b => { b.onclick = () => this.action(b.dataset.a!); });
    box.querySelectorAll<HTMLInputElement>('input[data-s]').forEach(inp => { inp.oninput = () => this.slider(inp.dataset.s!, Number(inp.value)); });
    this.updateCtxStats();
  }

  private selectionHtml() {
    const g = this.g, s = g.sim, sel = g.view.selection!;
    if (sel.type === 'cloud') {
      if (!g.cloudInfo(sel.id)) { g.view.selection = null; return ''; }
      const following = g.cam.followId === sel.id;
      return `<h3>${icon('cloud', 20)} Nuvem</h3><div class="stats" id="ctx-stats"></div>
        <div class="desc">Arraste a nuvem e solte com força para arremessá-la.</div>
        <div class="actions"><button class="btn ${following ? 'iron' : ''}" data-a="follow">${following ? 'Parar de seguir' : 'Seguir com a câmera'}</button></div>`;
    }
    if (sel.type === 'pipe') {
      const p = s.pipes.find(q => q.id === sel.id);
      if (!p) { g.view.selection = null; return ''; }
      return `<h3>${icon(p.fluid === 'water' ? 'drop' : 'steam', 20)} Tubo de ${p.fluid === 'water' ? 'água' : 'vapor'}</h3><div class="stats" id="ctx-stats"></div>
        <div class="actions"><button class="btn red" data-a="rmpipe">Remover tubo</button></div>`;
    }
    const m = s.byId.get(sel.id);
    if (!m) { g.view.selection = null; return ''; }
    const d = MACHINES[m.kind];
    let extra = '';
    if (m.kind === 'boiler') extra += `<button class="btn iron" data-a="pour">${icon('bucket', 16)}Despejar</button><button class="btn iron" data-a="stoke">${icon('fire', 16)}Acender</button>`;
    if (m.kind === 'valve') extra += `<button class="btn ${m.on ? 'red' : 'green'}" data-a="toggle">${m.on ? 'Fechar' : 'Abrir'}</button>`;
    const isBoiler = m.kind === 'boiler' || m.kind === 'boiler_ind';
    if (m.kind !== 'valve' && m.kind !== 'platform' && m.kind !== 'splitter' && m.kind !== 'reservoir' && !isBoiler) extra += `<button class="btn iron" data-a="toggle">${m.on ? 'Desligar' : 'Ligar'}</button>`;
    if (d.ports.some(p => p.fluid === 'water' && p.dir === 'in') && m.kind !== 'boiler') extra += `<button class="btn iron" data-a="pour">${icon('bucket', 16)}Despejar</button>`;
    let sliders = '';
    if (d.rotatable) {
      sliders = `<label class="slider"><span>Direção</span><input type="range" min="-180" max="180" step="5" value="${deg(-m.angle)}" data-s="angle"><b id="sl-angle">${deg(-m.angle)}°</b></label>
        <label class="slider"><span>Intensidade</span><input type="range" min="0" max="100" step="5" value="${Math.round(m.power * 100)}" data-s="power"><b id="sl-power">${Math.round(m.power * 100)}%</b></label>`;
    }
    const tip = m.kind === 'boiler' || m.kind === 'boiler_ind' ? '<div class="desc">Segure o dedo na caldeira para usar o fole.</div>' : `<div class="desc">${d.desc}</div>`;
    return `<h3>${d.name}</h3>${tip}<div class="stats" id="ctx-stats"></div>${sliders}
      <div class="actions">${extra}<button class="btn iron" data-a="move">Mover</button><button class="btn iron" data-a="copy">Copiar</button><button class="btn red" data-a="sell">Vender ${coin(Math.floor(d.cost * 0.75), 12)}</button>${isBoiler ? `<button class="btn ${m.on ? 'red' : 'green'}" data-a="toggle">${m.on ? 'Desligar' : 'Ligar'}</button>` : ''}</div>`;
  }

  private updateCtxStats() {
    const el = document.getElementById('ctx-stats');
    if (!el) return;
    const g = this.g, s = g.sim, sel = g.view.selection;
    if (!sel) return;
    let rows: [string, string][] = [];
    if (sel.type === 'cloud') {
      const info = g.cloudInfo(sel.id);
      if (!info) { g.select(null); return; }
      const { c, cap, r } = info;
      const sp = Math.hypot(c.vx, c.vy);
      const ang = Math.atan2(-c.vy, c.vx);
      const arrows = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
      const ratio = c.mass / cap;
      rows = [
        ['Água', `${fmt(c.mass)} L`], ['Tamanho', `${Math.round(r * 2)} m`],
        ['Velocidade', `${(sp * 0.25).toFixed(1)} m/s`], ['Direção', `${arrows[(Math.round(ang / (Math.PI / 4)) + 8) % 8]} ${deg(ang)}°`],
        ['Temperatura', `${c.temp.toFixed(1)} °C`], ['Saturação', `${Math.round(ratio * 100)}%`],
        ['Potencial', `${fmt(c.mass * 0.75)} L`], ['Estado', c.raining ? `Chovendo ${c.rainRate.toFixed(1)} L/s` : ratio > 0.7 ? 'Quase chovendo' : 'Viajando'],
      ];
    } else if (sel.type === 'pipe') {
      const p = s.pipes.find(q => q.id === sel.id);
      if (!p) { g.select(null); return; }
      rows = [['Vazão', `${p.flow.toFixed(2)} L/s`], ['Capacidade', `${s.mods.pipeCap(p.fluid).toFixed(1)} L/s`], ['Comprimento', `${Math.round(p.length)} m`]];
    } else {
      const m = s.byId.get(sel.id);
      if (!m) { g.select(null); return; }
      const wc = s.mods.waterCap(m.kind), sc = s.mods.steamCap(m.kind);
      if (wc) rows.push(['Água', `${m.water.toFixed(1)} / ${fmt(wc)} L`]);
      switch (m.kind) {
        case 'pump': case 'pump_hp':
          rows.push(['Vazão máx.', `${s.mods.pumpRate(m.kind).toFixed(1)} L/s`], ['Pressão', `${Math.round(s.mods.head(m.kind))} m`], ['Bombeando', `${m.rate.toFixed(2)} L/s`], ['Estado', s.isPumpValid(m) ? (m.on ? 'no mar' : 'desligada') : 'fora d’água']);
          break;
        case 'boiler': case 'boiler_ind':
          rows.push(['Temperatura', `${Math.round(20 + m.heat * 100)} °C`], ['Vapor', `${m.rate.toFixed(2)} L/s`]);
          if (m.kind === 'boiler') rows.push(['Fogo', s.mods.lvl('autoStoke') ? 'automático' : m.fire > 0 ? `${Math.ceil(m.fire)} s` : 'apagado']);
          rows.push(['Saída', s.pipes.some(p => p.from.m === m.id) ? 'tubo de vapor' : `ao ar (${Math.round(s.mods.ventEff() * 100)}% vira nuvem)`]);
          rows.push(['Estado', ({
            off: 'DESLIGADA — toque em Ligar',
            nowater: 'SEM ÁGUA — balde ou bomba',
            nofire: 'FOGO APAGADO — toque para reacender',
            lowwater: `Pouca água (${m.rate.toFixed(1)} de ${s.mods.boilerRate(m.kind).toFixed(1)} L/s) — mais bombas`,
            blocked: 'Vapor travado — o tubo de saída não dá vazão',
            heating: 'Esquentando…',
            ok: 'Fervendo',
          } as Record<string, string>)[s.boilerStatus(m)]]);
          break;
        case 'condenser':
          rows.push(['Vapor', `${m.steam.toFixed(1)} / ${fmt(sc)} L`], ['Eficiência', `${Math.round(s.mods.condenserEff() * 100)}%`], ['Nuvem', `${(m.rate * s.mods.condenserEff()).toFixed(2)} L/s`]);
          break;
        case 'fan': case 'fan_ind': case 'turbine': {
          const w = s.mods.wind(m.kind)!;
          rows.push(['Força', `${Math.round(w.power * m.power)}`], ['Alcance', `${Math.round(w.range)} m`], ['Altura', `${Math.round(s.terrain.groundY(m.x) - m.y)} m`]);
          break;
        }
        case 'valve': rows.push(['Estado', m.on ? 'aberta' : 'fechada']); break;
        case 'divider': rows.push(['Divide nuvens', '≥ 8 L'], ['Estado', m.on ? 'ativo' : 'desligado']); break;
      }
    }
    el.innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  }

  private action(a: string) {
    const g = this.g, s = g.sim, sel = g.view.selection;
    const m = sel?.type === 'machine' ? s.byId.get(sel.id) : undefined;
    const res = (r: { ok: boolean; reason?: string }) => { if (!r.ok && r.reason) { this.toast(r.reason, 'warn'); g.audio.play('error'); } };
    switch (a) {
      case 'rl': g.rotateGhost(-Math.PI / 12); break;
      case 'rr': g.rotateGhost(Math.PI / 12); break;
      case 'flip': g.flipGhost(); break;
      case 'ok': g.confirmGhost(); break;
      case 'cancel': g.cancelGhost(); break;
      case 'pipedone': g.setMode('play'); break;
      case 'follow': if (sel) { g.cam.followId = g.cam.followId === sel.id ? null : sel.id; this.refreshCtx(); } break;
      case 'rmpipe': if (sel) { s.removePipe(sel.id); g.audio.play('sell'); g.select(null); } break;
      case 'pour': if (m) res(s.pourBucket(m)); break;
      case 'stoke': if (m) s.stoke(m); break;
      case 'toggle': if (m) { s.toggle(m.id); this.refreshCtx(); } break;
      case 'move': if (m) g.startMove(m.id); break;
      case 'copy': if (m) {
        const d = MACHINES[m.kind];
        g.startPlacing(m.kind, { angle: m.angle, flip: m.flip, power: m.power, x: m.x + d.w + 20, y: d.placement === 'mast' ? m.y : m.y - 2 });
      } break;
      case 'sell': if (m) { const r = s.sell(m.id); res(r); if (r.ok) g.select(null); } break;
    }
  }

  private slider(kind: string, val: number) {
    const g = this.g, sel = g.view.selection;
    if (sel?.type !== 'machine') return;
    if (kind === 'angle') { g.sim.setAngle(sel.id, normAngle((-val * Math.PI) / 180)); $('sl-angle').textContent = `${val}°`; }
    if (kind === 'power') { g.sim.setPower(sel.id, val / 100); $('sl-power').textContent = `${val}%`; }
  }

  // ───────────── per-frame HUD ─────────────
  update(dt: number) {
    this.updateSpeech(dt);
    this.tick += dt;
    if (this.tick < 0.2) return;
    this.tick = 0;
    const s = this.g.sim, b = s.biome, cr = s.creature;
    $('h-credits').textContent = fmt(s.credits);
    $('h-income').textContent = s.rates.income > 0.05 ? `+${fmt(s.rates.income)}/s` : '';
    $('h-water').textContent = s.rates.water.toFixed(1);
    $('h-steam').textContent = s.rates.steam.toFixed(1);
    $('h-clouds').textContent = String(s.clouds.clouds.length);
    $('h-bucket-v').textContent = s.bucket.toFixed(0);
    $('h-bucket').classList.toggle('full', s.bucket > 0);
    // the Ancient
    const sat = s.climate.humidity / b.humidity.target;
    $('cr-hum').textContent = `${Math.round(sat * 100)}%`;
    $('cr-fill').style.width = `${Math.min(100, (sat / 1.2) * 100)}%`;
    $('cr-notch').style.left = `${100 / 1.2}%`;
    $('cr-tube').classList.toggle('low', cr.mood === 'starving' || cr.mood === 'thirsty' || cr.mood === 'sleeping');
    const mood = $('cr-mood');
    mood.textContent = MOOD_LABEL[cr.mood];
    mood.className = `cr-mood ${cr.mood}`;
    const eye = $('cr-eye');
    eye.classList.toggle('sleeping', cr.mood === 'sleeping');
    eye.style.setProperty('--eye', EYE[cr.mood]);
    $('cr-pips').querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < cr.stage));
    ($('cr-gfill').style.width = `${Math.round(Math.min(1, cr.progress) * 100)}%`);
    $('cr-rain').innerHTML = s.rates.rain > 0.02 ? `${s.rates.rain.toFixed(1)} L/s` : '';
    this.updateMission();
    if (!$('shop').classList.contains('hidden')) this.refreshShop();
    if (this.tree.isOpen) this.tree.refresh();
    $('b-up').classList.toggle('pulse', !this.tree.isOpen && TREE.some(n => n.id !== 'core' && !n.perm && (s.nodeState(n.id) === 'available' || s.nodeState(n.id) === 'owned') && s.canAfford(s.nodeCost(n.id)) && (n.unlock || s.nodeLevel(n.id) === 0)));
    this.renderCtx();
  }

  private updateMission() {
    const m = this.g.sim.currentMission();
    const box = $('mission');
    if (!m) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    if (m.id === this.missionId) return;
    this.missionId = m.id;
    const name = this.g.sim.creature.def.name;
    $('m-text').textContent = m.text.replace('{C}', name);
    $('m-hint').textContent = m.hint.replace('{C}', name);
    $('m-reward').innerHTML = `+${fmt(this.g.sim.missionReward(m.reward))}`;
  }

  /** typewriter speech bubble anchored over the Ancient's head (docked under its panel if off-screen) */
  private updateSpeech(dt: number) {
    const sp = this.speech;
    const el = $('speech');
    if (!sp) return;
    sp.life -= dt;
    if (sp.life <= 0) { this.speech = null; el.classList.add('hidden'); return; }
    if (sp.shown < sp.text.length) {
      sp.shown = Math.min(sp.text.length, sp.shown + dt * 42);
      $('speech-text').textContent = sp.text.slice(0, Math.floor(sp.shown));
    }
    const head = this.g.renderer.creatureHead;
    const p = this.g.cam.worldToCss(head.x, head.y);
    const panel = $('creature').getBoundingClientRect();
    const visible = p.x > 40 && p.x < this.g.cam.cssW - 40 && p.y > panel.bottom + 90 && p.y < this.g.cam.cssH - 90;
    el.classList.toggle('docked', !visible);
    if (visible) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; el.style.right = ''; }
    else {
      const hudBottom = Math.max(...[...document.querySelectorAll('#hud > *')].map(n => (n as HTMLElement).getBoundingClientRect().bottom));
      el.style.top = `${hudBottom + 8}px`;
      el.style.left = `${Math.max(8, Math.min(this.g.cam.cssW - el.offsetWidth - 8, panel.right - el.offsetWidth))}px`;
    }
  }
}

// Tiny event bus: simulation emits, UI/audio/render listen. Keeps sim free of DOM.
export type SimEvent =
  | { type: 'toast'; text: string; kind?: 'info' | 'good' | 'warn' }
  | { type: 'float'; x: number; y: number; text: string; color?: string }
  | { type: 'sfx'; name: SfxName; x?: number; y?: number }
  | { type: 'levelComplete' }
  | { type: 'firstRain' }
  | { type: 'merge'; x: number; y: number; r: number }
  | { type: 'bucket'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'coins'; x: number; y: number; amount: number }
  | { type: 'mission'; text: string; reward: number }
  | { type: 'throw'; x: number; y: number; speed: number }
  | { type: 'speak'; text: string; mood: string; kind: string }
  | { type: 'stageUp'; stage: number; final: boolean }
  | { type: 'uproot'; x: number; y: number };

export type SfxName =
  | 'pour' | 'bucket' | 'stoke' | 'buy' | 'build' | 'sell' | 'pipe' | 'error'
  | 'merge' | 'firstDrops' | 'milestone' | 'win' | 'click' | 'split' | 'upgrade'
  | 'thunder' | 'whoosh' | 'bellows' | 'coin' | 'mission' | 'grab' | 'grumble' | 'roar';

export class EventBus {
  private listeners: ((e: SimEvent) => void)[] = [];
  on(fn: (e: SimEvent) => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(l => l !== fn); }; }
  emit(e: SimEvent) { for (const l of this.listeners) l(e); }
}

import { Sim, type SaveData } from './sim';

const KEY = 'cloudworks.save.v1';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function saveGame(sim: Sim, store: KV) {
  try {
    store.setItem(KEY, JSON.stringify(sim.serialize()));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(store: KV): Sim | null {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    return Sim.deserialize(JSON.parse(raw) as SaveData);
  } catch (e) {
    console.warn('Cloudworks: save ignored', e);
    return null;
  }
}

export function wipeSave(store: KV) {
  try { store.removeItem(KEY); } catch { /* ignore */ }
}

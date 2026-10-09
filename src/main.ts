import { Game } from './game';

declare global { interface Window { cloudworks?: Game } }

window.cloudworks = new Game();

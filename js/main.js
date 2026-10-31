import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { formatNumber } from './core.js';

const canvas = document.getElementById('game');
const menuScreen = document.getElementById('menuScreen');
const pauseScreen = document.getElementById('pauseScreen');
const overScreen = document.getElementById('overScreen');
const pauseBtn = document.getElementById('pauseBtn');
const muteBtn = document.getElementById('muteBtn');
const playBtn = document.getElementById('playBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const quitBtn = document.getElementById('quitBtn');
const retryBtn = document.getElementById('retryBtn');
const menuBtn = document.getElementById('menuBtn');
const bestMenu = document.getElementById('bestMenu');
const finalScore = document.getElementById('finalScore');
const statWave = document.getElementById('statWave');
const statKills = document.getElementById('statKills');
const statBest = document.getElementById('statBest');
const newBest = document.getElementById('newBest');

const audio = new AudioEngine();
const input = new Input(canvas);
let gameRef = null;

function setVisible(el, visible) {
  el.classList.toggle('hidden', !visible);
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function syncMute() {
  muteBtn.classList.toggle('muted', audio.muted);
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  muteBtn.title = audio.muted ? 'Unmute sound (M)' : 'Mute sound (M)';
}

const game = new Game(canvas, input, audio, {
  onState(state, stats) {
    const playing = state === 'playing' || state === 'dying';
    document.body.classList.toggle('playing', playing);

    if (state === 'menu') {
      setVisible(menuScreen, true);
      setVisible(pauseScreen, false);
      setVisible(overScreen, false);
      pauseBtn.classList.add('hidden');
      bestMenu.textContent = formatNumber(gameRef ? gameRef.best : 0);
      syncMute();
    } else if (state === 'playing') {
      setVisible(menuScreen, false);
      setVisible(pauseScreen, false);
      setVisible(overScreen, false);
      pauseBtn.classList.remove('hidden');
    } else if (state === 'paused') {
      setVisible(pauseScreen, true);
      pauseBtn.classList.add('hidden');
    } else if (state === 'dying') {
      setVisible(pauseScreen, false);
      setVisible(overScreen, false);
      pauseBtn.classList.add('hidden');
    } else if (state === 'gameover') {
      setVisible(overScreen, true);
      pauseBtn.classList.add('hidden');
      finalScore.textContent = formatNumber(stats.score);
      statWave.textContent = String(stats.wave);
      statKills.textContent = formatNumber(stats.kills);
      statBest.textContent = formatNumber(stats.best);
      newBest.classList.toggle('hidden', !stats.isBest);
      bestMenu.textContent = formatNumber(stats.best);
      retryBtn.focus({ preventScroll: true });
    }
  },
});

function startRun() {
  audio.init();
  game.start();
}

gameRef = game;
window.__reef = game;
bestMenu.textContent = formatNumber(game.best);

playBtn.addEventListener('click', startRun);
retryBtn.addEventListener('click', startRun);
resumeBtn.addEventListener('click', () => game.resume());

restartBtn.addEventListener('click', () => {
  audio.init();
  game.start();
});
quitBtn.addEventListener('click', () => game.quitToMenu());
menuBtn.addEventListener('click', () => game.quitToMenu());

pauseBtn.addEventListener('click', () => {
  if (game.state === 'playing') game.pause();
  else if (game.state === 'paused') game.resume();
});

muteBtn.addEventListener('click', () => {
  audio.init();
  audio.toggleMuted();
  syncMute();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  if (e.code === 'KeyM') {
    audio.init();
    audio.toggleMuted();
    syncMute();
    return;
  }

  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.state === 'playing') game.pause();
    else if (game.state === 'paused') game.resume();
    return;
  }

  if (e.code === 'Enter') {
    if (game.state === 'menu') startRun();
    else if (game.state === 'gameover') startRun();
    else if (game.state === 'paused') game.resume();
    else if (game.state === 'dying') e.preventDefault();
  }
});

syncMute();

// Friendly console note for anyone poking around.
console.log('%cREEF RAMPAGE', 'font:900 20px Arial Black;color:#ffc247;text-shadow:0 0 8px #ff7a3d', '— one fish, one harpoon, zero chill.');

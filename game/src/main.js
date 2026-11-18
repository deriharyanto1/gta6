// Boot and the one loop: Meridian Heat. The renderer, the city, the player, traffic,
// police, pedestrians, missions and HUD are built once; the loop advances them in
// fixed 1/60 s steps and paints. Screens: title, play, paused, busted/wasted, story
// complete. ?shot=start|drive|chase|mission (with &seed=N) stages that scene instead
// of waiting for Play, and sets window.__shotReady once it has painted.

import { MISSIONS, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import { SoundEngine } from './audio.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, Input } from './input.js';
import { buildCity } from './city.js';
import { PoliceSystem, TrafficSystem } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { MissionSystem } from './missions.js';
import { Hud } from './hud.js';
import { stageShot } from './shots.js';

const THREE = window.THREE;
const STEP = 1 / 60;
const MAX_FRAME = 0.25;

window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message || event.error));
  const box = document.getElementById('errBox');
  if (box) box.textContent = window.__errors.join('\n');
});
window.addEventListener('unhandledrejection', (event) => {
  window.__errors.push(String(event.reason));
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);

const city = buildCity(scene, rng);
const audio = new SoundEngine();
const input = new Input(canvas);
const traffic = new TrafficSystem(scene, city, rng);
const police = new PoliceSystem(scene, city, rng);
const peds = new PedestrianSystem(scene, city, rng);
const hud = new Hud();
const missions = new MissionSystem(scene, traffic, audio);
const player = new Player(scene, city, input, audio);

const game = {
  player, traffic, police, peds, missions, hud, audio, input, camera, scene, city,
  time: 0, shotCamera: null,
};
const world = game;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: player.cash,
      missionIndex: Math.min(missions.index, MISSIONS.length - 1),
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function announce(message) {
  status.textContent = message;
}

let screen = 'title';
let framesPainted = 0;

function showOnly(id) {
  for (const el of ['startScreen', 'pauseScreen', 'overScreen', 'doneScreen']) {
    document.getElementById(el).classList.toggle('hidden', el !== id);
  }
  if (id) hud.hide();
  else hud.show();
}

function startPlaying(fromSave) {
  audio.unlock();
  if (fromSave) {
    const save = readSave();
    if (save) {
      player.cash = save.cash;
      missions.start(Math.min(save.missionIndex, MISSIONS.length - 1));
    } else {
      missions.start(0);
    }
  } else {
    player.cash = 0;
    player.health = 100;
    player.setWanted(0, true);
    missions.start(0);
  }
  showOnly(null);
  screen = 'play';
  announce('Playing. Follow the mission marker.');
}

function pauseGame() {
  if (screen !== 'play') return;
  screen = 'paused';
  showOnly('pauseScreen');
  input.releasePointerLock();
  announce('Paused.');
  writeSave();
}

function resumeGame() {
  if (screen !== 'paused') return;
  showOnly(null);
  screen = 'play';
  announce('Playing.');
}

function endGame() {
  const nearCop = police.nearestDistance(player.position) < 25;
  const lost = Math.max(0, Math.floor(player.cash * 0.1));
  player.cash -= lost;
  screen = 'over';
  document.getElementById('overTitle').textContent = nearCop ? 'BUSTED' : 'WASTED';
  document.getElementById('overText').textContent = nearCop
    ? `The Meridian Bay police caught Rex. They took $${lost} off him. Mama Rosa is not impressed.`
    : `Rex went down in Meridian Bay. The hospital patched him up and took $${lost} for the trouble.`;
  showOnly('overScreen');
  input.releasePointerLock();
  announce(nearCop ? 'Busted.' : 'Wasted.');
  writeSave();
}

function respawn() {
  if (player.inCar) {
    player.car = null;
    player.inCar = false;
    player.speed = 0;
  }
  player.mesh.visible = true;
  player.pos.set(city.hospitalPos.x, 0, city.hospitalPos.z);
  player.mesh.position.copy(player.pos);
  player.health = 100;
  player.setWanted(0, true);
  police.clear();
  showOnly(null);
  screen = 'play';
  announce('Back on the streets.');
}

function storyComplete() {
  screen = 'done';
  document.getElementById('doneText').textContent =
    `All five jobs done. Rex walks away with $${player.cash.toLocaleString('en-US')} and the whole bay knows his name. ` +
    'The city is yours now — free roam.';
  showOnly('doneScreen');
  input.releasePointerLock();
  announce('Story complete.');
  writeSave();
}

// ---- wiring ---------------------------------------------------------------
player.onWanted = (level) => {
  police.setWanted(level);
};
player.onDeath = () => {
  hud.flashDamage();
  endGame();
};
missions.onToast = (text) => hud.toast(text);
missions.onObjective = (mission) => {
  hud.setMission(mission.title, mission.objective);
  hud.toast(mission.briefing, 4.5);
};
missions.onComplete = () => {
  writeSave();
  if (missions.done) storyComplete();
};

// ---- buttons --------------------------------------------------------------
document.getElementById('playBtn').addEventListener('click', () => startPlaying(false));
document.getElementById('continueBtn').addEventListener('click', () => startPlaying(true));
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('retryBtn').addEventListener('click', respawn);
document.getElementById('freeRoamBtn').addEventListener('click', () => {
  showOnly(null);
  screen = 'play';
  announce('Free roam.');
});

const save = readSave();
if (save && save.missionIndex > 0) {
  const btn = document.getElementById('continueBtn');
  document.getElementById('continueInfo').textContent =
    `$${save.cash.toLocaleString('en-US')} · JOB ${Math.min(save.missionIndex + 1, MISSIONS.length)}`;
  btn.classList.remove('hidden');
}

// ---- shot mode ------------------------------------------------------------
let shotMode = null;
if (shot) {
  const staged = stageShot(shot, game);
  shotMode = staged.mode;
  if (staged.screen === 'title') {
    showOnly('startScreen');
    screen = 'title';
  } else {
    showOnly(null);
    screen = 'play';
    const mission = missions.current;
    if (mission) hud.setMission(mission.title, mission.objective);
  }
  announce(`Meridian Heat — ${shotMode} scene.`);
} else {
  missions.start(0);
}

// ---- the loop -------------------------------------------------------------
let accumulator = 0;
let last = performance.now();
let wasLocked = false;

function stepWorld(dt) {
  game.time += dt;
  player.update(dt, world, camera);
  traffic.update(dt);
  police.update(dt, player, (damage) => {
    player.damage(damage);
    hud.flashDamage();
  }, () => {
    if (Math.random() < 0.45) {
      player.damage(6);
      hud.flashDamage();
    }
  });
  peds.update(dt);
  missions.update(dt, player, world);
  city.updateSun(player.position);
  if (game.shotChaseCam && player.inCar && player.car) {
    // Chase camera: ahead of the car and off to the side, looking back down the
    // road so the player car and the police behind it are both in frame.
    const h = player.car.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const cx = player.car.pos.x + fx * 16 + rx * 11;
    const cz = player.car.pos.z + fz * 16 + rz * 11;
    camera.position.set(cx, 9.5, cz);
    camera.lookAt(player.car.pos.x - fx * 14, 1.5, player.car.pos.z - fz * 14);
  } else if (game.shotCamera) {
    camera.position.copy(game.shotCamera.pos);
    camera.lookAt(game.shotCamera.lookAt);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    if (screen === 'play') pauseGame();
    else if (screen === 'paused') resumeGame();
  }
  if (actions & ACTION_MUTE) audio.setMuted(!audio.muted);
  if (actions & ACTION_CONFIRM && screen === 'title' && !shot) startPlaying(false);

  if (screen === 'play' || screen === 'title') {
    while (accumulator >= STEP && (screen === 'play' || screen === 'title')) {
      stepWorld(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }

  // Pointer lock lost while playing pauses the game (Esc does this in Chrome).
  const locked = document.pointerLockElement === canvas;
  if (wasLocked && !locked && screen === 'play' && !shot) pauseGame();
  wasLocked = locked;

  if (screen === 'play') hud.update(Math.min((now - last) / 1000 + STEP, 0.1), game);
  renderer.render(scene, camera);
  framesPainted += 1;
  if (shot && framesPainted === 12) window.__shotReady = true;
  input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play' && !shot) pauseGame();
});

announce(shot ? `Meridian Heat — ${shotMode} scene.` : 'Meridian Heat. Press Play to start.');
requestAnimationFrame(frame);

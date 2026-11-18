// The HUD: health bar, cash, wanted stars, mission tracker, speed, hints, toasts and
// the minimap — a top-down canvas of the city with the player, traffic, police and
// the mission marker. All DOM; the 3D scene never draws UI.

import { CITY } from './config.js';

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      health: document.getElementById('healthFill'),
      cash: document.getElementById('cashLabel'),
      missionTitle: document.getElementById('missionTitle'),
      missionText: document.getElementById('missionText'),
      missionDist: document.getElementById('missionDist'),
      stars: document.querySelectorAll('#wantedBox .star'),
      minimap: document.getElementById('minimap'),
      speed: document.getElementById('speedBox'),
      hint: document.getElementById('hintBar'),
      toast: document.getElementById('toast'),
      crosshair: document.getElementById('crosshair'),
      ammo: document.getElementById('ammoBox'),
      vignette: document.getElementById('vignette'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.lastCash = -1;
    this.lastHealth = -1;
    this.lastWanted = -1;
  }

  show() {
    this.el.hud.classList.remove('hidden');
  }

  hide() {
    this.el.hud.classList.add('hidden');
  }

  setMission(title, text) {
    this.el.missionTitle.textContent = title;
    this.el.missionText.textContent = text;
  }

  toast(text, seconds) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds ?? 2.6;
  }

  flashDamage() {
    this.el.vignette.style.opacity = '1';
    window.setTimeout(() => {
      this.el.vignette.style.opacity = '0';
    }, 180);
  }

  update(dt, game) {
    const player = game.player;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    // Health bar (only touch the DOM when it moved).
    const health = Math.round(player.health);
    if (health !== this.lastHealth) {
      this.lastHealth = health;
      this.el.health.style.width = `${health}%`;
      this.el.health.style.background = health > 50
        ? 'linear-gradient(90deg,#37d67a,#9be15d)'
        : health > 25 ? 'linear-gradient(90deg,#e8a13c,#f2c94c)' : 'linear-gradient(90deg,#e5534b,#ff8a7a)';
    }
    if (player.cash !== this.lastCash) {
      this.lastCash = player.cash;
      this.el.cash.textContent = `$${player.cash.toLocaleString('en-US')}`;
    }
    if (player.wanted !== this.lastWanted) {
      this.lastWanted = player.wanted;
      this.el.stars.forEach((star, i) => star.classList.toggle('lit', i < player.wanted));
    }
    // Mission distance.
    const mission = game.missions.current;
    if (mission && game.missions.markerPosition) {
      const m = game.missions.markerPosition;
      const d = Math.hypot(player.position.x - m.x, player.position.z - m.z);
      this.el.missionDist.textContent = `◈ ${Math.round(d)} m`;
    } else if (mission && mission.kind === 'collect') {
      const left = game.missions.collectLeft;
      const t = Math.max(0, Math.ceil(game.missions.timer));
      this.el.missionDist.textContent = `◈ ${left} drops left — ${t}s`;
    } else {
      this.el.missionDist.textContent = '';
    }
    // Speed and hints.
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.speed) * 3.6);
      this.el.speed.innerHTML = `<b>${kmh}</b> km/h<br>E — exit car`;
      this.el.crosshair.classList.add('hidden');
      this.el.ammo.classList.add('hidden');
      this.el.hint.textContent = 'W/S drive · A/D steer · E exit car';
    } else {
      this.el.speed.innerHTML = 'On foot<br>E — enter car';
      this.el.crosshair.classList.remove('hidden');
      this.el.ammo.classList.remove('hidden');
      this.el.ammo.textContent = player.reloadTimer > 0 ? 'RELOADING…' : `AMMO ${player.ammo} / 12 — R reload`;
      this.el.hint.textContent = 'WASD move · Shift run · Click shoot · E enter car';
    }
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const size = 190;
    const half = CITY.half;
    const toMap = (v) => ((v + half) / (half * 2)) * size;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(0, 0, size, size);
    // Water strip at the south edge.
    ctx.fillStyle = '#2e7fb8';
    ctx.fillRect(0, toMap(CITY.waterZ), size, size - toMap(CITY.waterZ));
    // Roads.
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 5;
    for (const r of CITY.roads) {
      ctx.beginPath();
      ctx.moveTo(0, toMap(r));
      ctx.lineTo(size, toMap(r));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toMap(r), 0);
      ctx.lineTo(toMap(r), size);
      ctx.stroke();
    }
    // Mission marker / cash drops.
    const missions = game.missions;
    ctx.fillStyle = '#ffd21f';
    if (missions.markerPosition) {
      const m = missions.markerPosition;
      const x = toMap(m.x);
      const y = toMap(m.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    ctx.fillStyle = '#33ff66';
    for (const drop of missions.dropMarkers) {
      if (drop.taken) continue;
      ctx.beginPath();
      ctx.arc(toMap(drop.x), toMap(drop.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic.
    ctx.fillStyle = '#9aa0a8';
    for (const car of game.traffic.cars) {
      ctx.fillRect(toMap(car.pos.x) - 2, toMap(car.pos.z) - 2, 4, 4);
    }
    // Police, flashing red/blue.
    const blink = Math.floor(game.time * 3) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3333' : '#3388ff';
    for (const car of game.police.cars) {
      ctx.beginPath();
      ctx.arc(toMap(car.pos.x), toMap(car.pos.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const player = game.player;
    const px = toMap(player.position.x);
    const py = toMap(player.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.inCar && player.car ? player.car.heading : player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

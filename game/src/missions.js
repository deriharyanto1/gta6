// Mama Rosa's five jobs: the story. Each mission drops a glowing marker in the city
// (a light beam plus a floating diamond, and a blip on the minimap), watches the
// player reach it or do what it asks, pays the reward and briefs the next job.
// The mission system owns the markers and the timer; the player owns the cash.

import { MISSIONS } from './config.js';

const THREE = window.THREE;

function makeMarker(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  group.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.5),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 5;
  group.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.1, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  group.userData.diamond = diamond;
  group.userData.beam = beam;
  return group;
}

export class MissionSystem {
  constructor(scene, traffic, audio) {
    this.scene = scene;
    this.traffic = traffic;
    this.audio = audio;
    this.index = 0;
    this.done = false;
    this.marker = null;
    this.markerPos = null;
    this.markedCar = null;
    this.collectLeft = 0;
    this.dropMarkers = [];
    this.timer = 0;
    this.phase = 'goto';
    this.hasPackage = false;
    this.onComplete = null;
    this.onToast = null;
    this.onObjective = null;
  }

  get current() {
    return MISSIONS[this.index] ?? null;
  }

  get markerPosition() {
    return this.markerPos;
  }

  start(index) {
    this.index = index;
    this.done = false;
    this.hasPackage = false;
    this.timer = 0;
    const mission = this.current;
    if (!mission) {
      this.done = true;
      return;
    }
    this.phase = 'goto';
    this.clearMarkers();
    if (mission.wantedOnStart !== undefined) this.pendingWanted = mission.wantedOnStart;
    else this.pendingWanted = 0;
    if (mission.kind === 'steal-deliver') {
      this.markedCar = this.traffic.spawnParkedCar(mission.carSpot.x, mission.carSpot.z, 0xc0392b, Math.PI / 2);
      this.setMarker(mission.carSpot.x, mission.carSpot.z, 0xff3333);
      this.phase = 'steal';
    } else if (mission.kind === 'collect') {
      this.collectLeft = mission.drops.length;
      for (const drop of mission.drops) {
        const marker = makeMarker(0x33ff66);
        marker.position.set(drop.x, 0, drop.z);
        this.scene.add(marker);
        this.dropMarkers.push({ marker, x: drop.x, z: drop.z, taken: false });
      }
      this.timer = mission.timeLimit;
      this.markerPos = null;
    } else if (mission.kind === 'pickup-deliver') {
      this.setMarker(mission.pickup.x, mission.pickup.z, 0xffd21f);
      this.phase = 'pickup';
    } else {
      this.setMarker(mission.target.x, mission.target.z, 0xffd21f);
    }
    if (this.onObjective) this.onObjective(mission);
  }

  setMarker(x, z, color) {
    this.clearMarkers();
    this.marker = makeMarker(color);
    this.marker.position.set(x, 0, z);
    this.scene.add(this.marker);
    this.markerPos = { x, z };
  }

  clearMarkers() {
    if (this.marker) {
      this.scene.remove(this.marker);
      this.marker = null;
    }
    this.markerPos = null;
    for (const drop of this.dropMarkers) this.scene.remove(drop.marker);
    this.dropMarkers = [];
  }

  complete(player) {
    const mission = this.current;
    if (!mission) return;
    player.addCash(mission.reward);
    this.audio.jingle();
    if (this.onToast) this.onToast(`JOB DONE — +$${mission.reward}`);
    this.clearMarkers();
    if (this.markedCar) {
      this.traffic.removeCar(this.markedCar);
      this.markedCar = null;
    }
    this.index += 1;
    if (this.index >= MISSIONS.length) {
      this.done = true;
      if (this.onComplete) this.onComplete();
      return;
    }
    this.start(this.index);
  }

  /** Called every frame with the player; returns nothing, fires toasts on progress. */
  update(dt, player, world) {
    const mission = this.current;
    if (!mission || this.done) return;
    // A mission that starts hot (the escape) raises the wanted level on its first frame.
    if (this.pendingWanted) {
      player.setWanted(this.pendingWanted);
      this.pendingWanted = 0;
    }
    // Marker animation.
    if (this.marker) {
      this.marker.userData.diamond.rotation.y += dt * 2.4;
      this.marker.userData.diamond.position.y = 5 + Math.sin(world.time * 2.2) * 0.7;
    }
    for (const drop of this.dropMarkers) {
      drop.marker.userData.diamond.rotation.y += dt * 2.4;
      drop.marker.userData.diamond.position.y = 5 + Math.sin(world.time * 2.2 + drop.x) * 0.7;
    }
    const px = player.position.x;
    const pz = player.position.z;
    const near = (x, z, r) => Math.hypot(px - x, pz - z) < r;

    if (mission.kind === 'collect') {
      this.timer -= dt;
      for (const drop of this.dropMarkers) {
        if (!drop.taken && near(drop.x, drop.z, 4)) {
          drop.taken = true;
          this.scene.remove(drop.marker);
          this.collectLeft -= 1;
          player.addCash(150);
          this.audio.pickup();
          if (this.onToast) this.onToast(`Cash drop — ${this.collectLeft} left`);
        }
      }
      if (this.collectLeft === 0) {
        this.complete(player);
        return;
      }
      if (this.timer <= 0) {
        if (this.onToast) this.onToast('Too slow — the drops are gone. Try again!');
        this.start(this.index);
      }
      return;
    }

    if (mission.kind === 'steal-deliver') {
      if (this.phase === 'steal') {
        if (this.markedCar && player.inCar && player.car === this.markedCar) {
          this.phase = 'deliver';
          this.setMarker(mission.deliver.x, mission.deliver.z, 0xffd21f);
          if (this.onToast) this.onToast('Got the Comet GT — take it to the garage!');
        }
        return;
      }
      if (this.phase === 'deliver' && near(mission.deliver.x, mission.deliver.z, 6)) {
        this.complete(player);
      }
      return;
    }

    if (mission.kind === 'pickup-deliver') {
      if (this.phase === 'pickup') {
        if (near(mission.pickup.x, mission.pickup.z, 4)) {
          this.phase = 'deliver';
          this.hasPackage = true;
          this.setMarker(mission.deliver.x, mission.deliver.z, 0xffd21f);
          this.audio.pickup();
          if (this.onToast) this.onToast('Briefcase secured — now run!');
          if (mission.wantedOnPickup) player.setWanted(mission.wantedOnPickup);
        }
        return;
      }
      if (this.phase === 'deliver' && near(mission.deliver.x, mission.deliver.z, 6)) {
        this.complete(player);
      }
      return;
    }

    if (mission.kind === 'escape') {
      if (near(mission.target.x, mission.target.z, 7)) {
        player.setWanted(0, true);
        if (this.onToast) this.onToast('You lost them. The heat is off.');
        this.complete(player);
      }
      return;
    }

    // 'goto': reach the marker (in a car when the job says so).
    if (near(mission.target.x, mission.target.z, 6)) {
      if (mission.needsCar && !player.inCar) {
        if (this.onToast) this.onToast('You need a car for this job!');
        return;
      }
      this.complete(player);
    }
  }
}

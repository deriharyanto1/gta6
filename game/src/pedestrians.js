// Pedestrians: simple low-poly people who stroll the sidewalks. They walk a loop of
// sidewalk waypoints, flee when a gun goes off nearby, and fall when a car hits them
// or a bullet finds them — which is a crime the wanted system notices.

import { CITY, PALETTE } from './config.js';

const THREE = window.THREE;

const BODY_GEO = new THREE.CylinderGeometry(0.32, 0.38, 1.05, 8);
const HEAD_GEO = new THREE.SphereGeometry(0.26, 10, 8);
const LEG_GEO = new THREE.BoxGeometry(0.2, 0.55, 0.2);
const SKIN_MAT = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
const PANTS_MAT = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

function sidewalkWaypoints(rng) {
  // A loop around one block, on the sidewalk just outside its edge.
  const roads = CITY.roads;
  const i = rng.int(0, roads.length - 2);
  const j = rng.int(0, roads.length - 2);
  const x0 = roads[i] + CITY.roadWidth / 2 + 1.5;
  const x1 = roads[i + 1] - CITY.roadWidth / 2 - 1.5;
  const z0 = roads[j] + CITY.roadWidth / 2 + 1.5;
  const z1 = roads[j + 1] - CITY.roadWidth / 2 - 1.5;
  return [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
}

function makePedMesh(shirtColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const body = new THREE.Mesh(BODY_GEO, shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(HEAD_GEO, SKIN_MAT);
  head.position.y = 1.82;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(LEG_GEO, PANTS_MAT);
  legL.position.set(-0.14, 0.28, 0);
  group.add(legL);
  const legR = new THREE.Mesh(LEG_GEO, PANTS_MAT);
  legR.position.set(0.14, 0.28, 0);
  group.add(legR);
  group.userData.legs = [legL, legR];
  return group;
}

export class PedestrianSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.rng = rng;
    this.peds = [];
    this.shootables = [];
    for (let i = 0; i < 20; i += 1) this.spawnPed();
  }

  spawnPed() {
    const mesh = makePedMesh(this.rng.pick(PALETTE.pedShirt));
    const loop = sidewalkWaypoints(this.rng);
    const start = loop[0];
    mesh.position.set(start.x, 0, start.z);
    this.scene.add(mesh);
    const ped = {
      mesh, loop, wp: 1, speed: this.rng.range(1.1, 1.9),
      heading: 0, state: 'walk', fallTimer: 0, walkPhase: this.rng.range(0, 6),
      pos: mesh.position,
    };
    ped.heading = Math.atan2(loop[1].x - start.x, loop[1].z - start.z);
    this.peds.push(ped);
    this.shootables.push(mesh);
    return ped;
  }

  /** The closest walking pedestrian within maxDist metres, or null. */
  nearestPed(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of this.peds) {
      if (ped.state !== 'walk') continue;
      const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }

  /** A gunshot nearby: pedestrians within earshot run away from it. */
  scare(pos, radius) {
    for (const ped of this.peds) {
      if (ped.state !== 'walk') continue;
      const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
      if (d < radius) {
        ped.state = 'flee';
        ped.fleeFrom = { x: pos.x, z: pos.z };
        ped.fleeTimer = 4;
      }
    }
  }

  /** Knock a pedestrian down (car hit or bullet). Returns false if already down. */
  knockDown(ped) {
    if (ped.state === 'fallen') return false;
    ped.state = 'fallen';
    ped.fallTimer = 5;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.35;
    return true;
  }

  update(dt) {
    for (const ped of this.peds) {
      if (ped.state === 'fallen') {
        ped.fallTimer -= dt;
        if (ped.fallTimer <= 0) {
          // Get back up and carry on, a little shaken.
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
        }
        continue;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walk';
          ped.loop = sidewalkWaypoints(this.rng);
          ped.wp = 0;
        } else {
          const dx = ped.pos.x - ped.fleeFrom.x;
          const dz = ped.pos.z - ped.fleeFrom.z;
          const d = Math.hypot(dx, dz) || 1;
          ped.heading = Math.atan2(dx, dz);
          ped.pos.x += (dx / d) * 3.2 * dt;
          ped.pos.z += (dz / d) * 3.2 * dt;
          ped.mesh.rotation.y = ped.heading;
          ped.walkPhase += dt * 11;
          const swing = Math.sin(ped.walkPhase) * 0.5;
          ped.mesh.userData.legs[0].rotation.x = swing;
          ped.mesh.userData.legs[1].rotation.x = -swing;
          continue;
        }
      }
      const target = ped.loop[ped.wp];
      const dx = target.x - ped.pos.x;
      const dz = target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        ped.wp = (ped.wp + 1) % ped.loop.length;
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
      ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.mesh.rotation.y = ped.heading;
      ped.walkPhase += dt * 7;
      const swing = Math.sin(ped.walkPhase) * 0.45;
      ped.mesh.userData.legs[0].rotation.x = swing;
      ped.mesh.userData.legs[1].rotation.x = -swing;
    }
  }
}

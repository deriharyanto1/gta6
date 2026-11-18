// Cars: a low-poly car built from boxes (body, cabin, four wheels, lights), the traffic
// system that drives them around the city's road loops, and the police system that
// spawns patrol cars, chases the player and rams them at higher wanted levels.

import { CAR, CITY, PALETTE, POLICE } from './config.js';
import { resolveCircle } from './city.js';

const THREE = window.THREE;

const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
WHEEL_GEO.rotateZ(Math.PI / 2);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x14161a });
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x1c2b3a });
const HEADLIGHT_MAT = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffe9a8, emissiveIntensity: 0.7 });
const TAILLIGHT_MAT = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.6 });
const POLICE_BODY = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
const POLICE_BLUE = new THREE.MeshLambertMaterial({ color: 0x2255ff, emissive: 0x2244ff, emissiveIntensity: 0.4 });
const POLICE_RED = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 0.4 });
const POLICE_RED_DIM = new THREE.MeshLambertMaterial({ color: 0x550000 });
const POLICE_BLUE_DIM = new THREE.MeshLambertMaterial({ color: 0x000055 });

/** A drivable-looking car. Returns { group, wheels, bodyMat, lightBar }. */
export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = isPolice ? POLICE_BODY : new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.1), isPolice ? bodyMat : GLASS_MAT);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.2, 4.42), new THREE.MeshLambertMaterial({ color: 0x1a3a8a }));
    stripe.position.y = 0.72;
    group.add(stripe);
  }
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    wheel.position.set(x, 0.42, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  for (const x of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), HEADLIGHT_MAT);
    head.position.set(x, 0.62, 2.21);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), TAILLIGHT_MAT);
    tail.position.set(x, 0.62, -2.21);
    group.add(tail);
  }
  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), POLICE_RED);
    red.position.set(-0.4, 1.55, -0.25);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), POLICE_BLUE);
    blue.position.set(0.4, 1.55, -0.25);
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.userData = { red, blue };
    group.add(lightBar);
  }
  group.traverse((child) => {
    if (child.isMesh) child.userData.carGroup = group;
  });
  return { group, wheels, bodyMat, lightBar };
}

/** A rectangular loop around one block, as waypoints at the intersections. */
function blockLoop(rng) {
  const roads = CITY.roads;
  const i = rng.int(0, roads.length - 2);
  const j = rng.int(0, roads.length - 2);
  const x0 = roads[i];
  const x1 = roads[i + 1];
  const z0 = roads[j];
  const z1 = roads[j + 1];
  const inset = 3.5;
  const loop = [
    { x: x0 + inset, z: z0 + inset },
    { x: x1 - inset, z: z0 + inset },
    { x: x1 - inset, z: z1 - inset },
    { x: x0 + inset, z: z1 - inset },
  ];
  return rng.next() < 0.5 ? loop : loop.reverse();
}

export class TrafficSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.shootables = [];
    for (let i = 0; i < 12; i += 1) this.spawnTrafficCar();
  }

  spawnTrafficCar() {
    const color = this.rng.pick(PALETTE.car);
    const { group } = makeCarMesh(color, false);
    const loop = blockLoop(this.rng);
    const start = loop[0];
    group.position.set(start.x, 0, start.z);
    this.scene.add(group);
    const car = {
      mesh: group, loop, wp: 1, speed: this.rng.range(8, 12),
      heading: 0, occupied: true, parked: false, hits: 0, smoke: null,
      pos: group.position,
    };
    car.heading = Math.atan2(loop[1].x - start.x, loop[1].z - start.z);
    this.cars.push(car);
    this.shootables.push(group);
    return car;
  }

  /** A parked, empty car at a spot (mission cars, respawn). */
  spawnParkedCar(x, z, color, heading) {
    const { group } = makeCarMesh(color, false);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    const car = {
      mesh: group, loop: null, wp: 0, speed: 0, heading,
      occupied: false, parked: true, hits: 0, smoke: null, pos: group.position,
    };
    this.cars.push(car);
    this.shootables.push(group);
    return car;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
    this.shootables = this.shootables.filter((m) => m !== car.mesh);
  }

  /** The closest car the player could steal, within maxDist metres. */
  nearestCar(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const dx = car.pos.x - pos.x;
      const dz = car.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  update(dt) {
    for (const car of this.cars) {
      if (car.parked || !car.loop) continue;
      const target = car.loop[car.wp];
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3) {
        car.wp = (car.wp + 1) % car.loop.length;
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      // Slow down for the car ahead.
      let slow = 1;
      for (const other of this.cars) {
        if (other === car || other.parked) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const od = Math.hypot(ox, oz);
        if (od < 9 && Math.abs(Math.atan2(ox, oz) - car.heading) < 0.6) slow = 0.35;
      }
      const speed = car.speed * slow;
      car.pos.x += Math.sin(car.heading) * speed * dt;
      car.pos.z += Math.cos(car.heading) * speed * dt;
      car.mesh.rotation.y = car.heading;
      for (const wheel of car.mesh.children) {
        if (wheel.geometry === WHEEL_GEO) wheel.rotation.x += (speed * dt) / 0.42;
      }
    }
  }
}

export class PoliceSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.wanted = 0;
    this.spawnTimer = 0;
    this.shootTimer = 0;
    this.ramTimer = 0;
    this.lightTimer = 0;
    this.lightRed = true;
  }

  setWanted(level) {
    this.wanted = level;
  }

  /** Spawn one patrol car at an exact spot (screenshot staging). */
  spawnAt(x, z) {
    const { group, lightBar } = makeCarMesh(0, true);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const car = {
      mesh: group, lightBar, heading: 0, speed: 0, hits: 0, disabled: false,
      pos: group.position, smoke: null,
    };
    this.cars.push(car);
    return car;
  }

  clear() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars = [];
  }

  nearestDistance(pos) {
    let best = Infinity;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  update(dt, target, onRam, onShoot) {
    // Spawn patrol cars while wanted, up to the cap.
    this.spawnTimer -= dt;
    if (this.wanted > 0 && this.cars.length < Math.min(this.wanted, POLICE.maxActive) && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      const angle = this.rng.range(0, Math.PI * 2);
      const dist = this.rng.range(80, 120);
      const x = Math.max(-235, Math.min(235, target.pos.x + Math.sin(angle) * dist));
      const z = Math.max(-235, Math.min(235, target.pos.z + Math.cos(angle) * dist));
      const { group, lightBar } = makeCarMesh(0, true);
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.cars.push({
        mesh: group, lightBar, heading: 0, speed: 0, hits: 0, disabled: false,
        pos: group.position, smoke: null,
      });
    }
    // Light bar flash.
    this.lightTimer += dt;
    if (this.lightTimer > 0.35) {
      this.lightTimer = 0;
      this.lightRed = !this.lightRed;
      for (const car of this.cars) {
        if (!car.lightBar) continue;
        car.lightBar.userData.red.material = this.lightRed ? POLICE_RED : POLICE_RED_DIM;
        car.lightBar.userData.blue.material = this.lightRed ? POLICE_BLUE_DIM : POLICE_BLUE;
      }
    }
    // Chase.
    const chaseSpeed = POLICE.chaseSpeed[Math.min(this.wanted, 5)];
    this.ramTimer -= dt;
    this.shootTimer -= dt;
    for (const car of this.cars) {
      if (car.disabled) continue;
      const dx = target.pos.x - car.pos.x;
      const dz = target.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
      car.speed = Math.min(chaseSpeed, car.speed + 14 * dt);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      car.mesh.rotation.y = car.heading;
      resolveCircle(car.pos, CAR.radius, this.city.colliders);
      if (dist < 4.5 && this.ramTimer <= 0) {
        this.ramTimer = POLICE.ramCooldown;
        onRam(POLICE.ramDamage);
      }
      if (this.wanted >= 3 && dist < POLICE.shootRange && this.shootTimer <= 0) {
        this.shootTimer = POLICE.shootInterval;
        onShoot(POLICE.shotDamage);
      }
    }
    // Despawn the force when the heat is off.
    if (this.wanted === 0 && this.cars.length > 0) {
      const keep = this.cars.filter((c) => Math.hypot(c.pos.x - target.pos.x, c.pos.z - target.pos.z) < 60);
      for (const car of this.cars) if (!keep.includes(car)) this.scene.remove(car.mesh);
      this.cars = keep;
    }
  }
}

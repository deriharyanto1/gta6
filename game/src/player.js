// Rex Marlowe, the player: on foot (third-person, mouse-look camera) and behind the
// wheel (arcade driving, enter and exit cars with E). Stealing a car, hitting a
// pedestrian and shooting are crimes that raise the wanted level; the police answer.

import { CAR, PLAYER, WANTED } from './config.js';
import { ACTION_ENTER, ACTION_RELOAD } from './input.js';
import { resolveCircle } from './city.js';

const THREE = window.THREE;

function makePersonMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.05, 8), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.82;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), jeans);
  legL.position.set(-0.14, 0.28, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), jeans);
  legR.position.set(0.14, 0.28, 0);
  group.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.32, 1.25, 0.3);
  group.add(gun);
  group.userData.legs = [legL, legR];
  return group;
}

export class Player {
  constructor(scene, city, input, audio) {
    this.scene = scene;
    this.city = city;
    this.input = input;
    this.audio = audio;
    this.mesh = makePersonMesh();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(0, 0, 120);
    this.heading = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.inCar = false;
    this.car = null;
    this.speed = 0;
    this.health = PLAYER.health;
    this.cash = 0;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.ammo = PLAYER.pistolAmmo;
    this.reloadTimer = 0;
    this.lastDamageAt = -99;
    this.time = 0;
    this.walkPhase = 0;
    this.raycaster = new THREE.Raycaster();
    this.tracer = null;
    this.tracerTimer = 0;
    this.flash = new THREE.PointLight(0xffcc66, 0, 12);
    scene.add(this.flash);
    // Callbacks the game wires up: onWanted(level), onDeath(kind), onToast(text).
    this.onWanted = null;
    this.onDeath = null;
    this.onToast = null;
  }

  get position() {
    return this.inCar && this.car ? this.car.pos : this.pos;
  }

  addCash(amount) {
    this.cash += amount;
  }

  setWanted(level, silent) {
    const next = Math.max(0, Math.min(WANTED.maxStars, level));
    if (next === this.wanted) return;
    this.wanted = next;
    this.wantedTimer = 0;
    if (this.onWanted) this.onWanted(next);
    if (!silent && next > 0 && this.onToast) this.onToast(`WANTED — ${next} star${next > 1 ? 's' : ''}`);
  }

  commitCrime(kind) {
    if (kind === 'steal') this.setWanted(this.wanted + WANTED.stealCar);
    else if (kind === 'hitPed') this.setWanted(this.wanted + WANTED.hitPed);
    else if (kind === 'shoot') this.setWanted(this.wanted + WANTED.shoot);
    else if (kind === 'killCop') this.setWanted(this.wanted + WANTED.killCop);
  }

  damage(amount) {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = this.time;
    if (this.health <= 0 && this.onDeath) this.onDeath();
  }

  enterCar(car) {
    if (this.inCar) return;
    if (car.occupied) {
      car.occupied = false;
      this.commitCrime('steal');
    }
    car.loop = null;
    car.parked = false;
    this.car = car;
    this.inCar = true;
    this.speed = 0;
    this.mesh.visible = false;
    if (this.onToast) this.onToast('Car stolen — drive!');
  }

  exitCar() {
    if (!this.inCar || !this.car) return;
    const car = this.car;
    car.parked = true;
    car.speed = 0;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.pos.set(car.pos.x + sideX * 3, 0, car.pos.z + sideZ * 3);
    resolveCircle(this.pos, PLAYER.radius, this.city.colliders);
    this.heading = car.heading;
    this.car = null;
    this.inCar = false;
    this.speed = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }

  shoot(camera, world) {
    if (this.reloadTimer > 0 || this.ammo <= 0) return;
    this.ammo -= 1;
    this.audio.gunshot();
    this.commitCrime('shoot');
    world.peds.scare(this.position, 40);
    const from = new THREE.Vector3();
    camera.getWorldPosition(from);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.raycaster.set(from, dir);
    this.raycaster.far = PLAYER.pistolRange;
    const roots = [...world.traffic.shootables, ...world.peds.shootables];
    for (const car of world.police.cars) roots.push(car.mesh);
    const hits = this.raycaster.intersectObjects(roots, true);
    let end = from.clone().add(dir.clone().multiplyScalar(PLAYER.pistolRange));
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
      const root = obj;
      const ped = world.peds.peds.find((p) => p.mesh === root);
      if (ped) {
        if (world.peds.knockDown(ped)) this.commitCrime('hitPed');
      } else {
        const tCar = world.traffic.cars.find((c) => c.mesh === root);
        if (tCar) {
          tCar.hits += 1;
          if (tCar.hits >= 3 && tCar.loop) {
            tCar.loop = null;
            tCar.parked = true;
          }
        } else {
          const pCar = world.police.cars.find((c) => c.mesh === root);
          if (pCar) {
            pCar.hits += 1;
            if (pCar.hits >= 4 && !pCar.disabled) {
              pCar.disabled = true;
              this.commitCrime('killCop');
              if (this.onToast) this.onToast('Police car disabled!');
            }
          }
        }
      }
    }
    // Tracer + muzzle flash, both gone in a blink.
    if (this.tracer) this.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    this.scene.add(this.tracer);
    this.tracerTimer = 0.07;
    this.flash.position.copy(from).add(dir.clone().multiplyScalar(1.2));
    this.flash.intensity = 14;
  }

  update(dt, world, camera) {
    this.time += dt;
    const input = this.input;
    const mouse = input.takeMouse();
    this.camYaw -= mouse.dx * 0.0032;
    this.camPitch = Math.max(-0.15, Math.min(0.9, this.camPitch + mouse.dy * 0.0028));

    // Wanted decays when quiet and no police close by.
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      const nearestCop = world.police.nearestDistance(this.position);
      if (this.wantedTimer > WANTED.decaySeconds && nearestCop > 45) {
        this.setWanted(this.wanted - 1, true);
      }
    }
    // Health creeps back when the heat is off.
    if (this.wanted === 0 && this.health > 0 && this.health < PLAYER.health && this.time - this.lastDamageAt > 6) {
      this.health = Math.min(PLAYER.health, this.health + 3 * dt);
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = PLAYER.pistolAmmo;
    }
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0 && this.tracer) {
        this.scene.remove(this.tracer);
        this.tracer = null;
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 220);

    if (this.inCar && this.car) this.updateDriving(dt, world, camera);
    else this.updateOnFoot(dt, world, camera);

    // Engine hum follows the car; silent on foot.
    if (this.inCar) {
      this.audio.setEngine(Math.abs(this.speed) / CAR.maxSpeed, input.throttle() !== 0 ? 1 : 0.25);
    } else {
      this.audio.setEngine(0, 0);
    }
    this.audio.setSiren(world.police.nearestDistance(this.position));
    this.audio.stepSiren(dt);
  }

  updateOnFoot(dt, world, camera) {
    const input = this.input;
    const fwd = input.throttle();
    const strafe = input.steer();
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let mx = fx * fwd + rx * strafe;
    let mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.mesh.userData.legs[0].rotation.x = swing;
      this.mesh.userData.legs[1].rotation.x = -swing;
    } else {
      this.mesh.userData.legs[0].rotation.x = 0;
      this.mesh.userData.legs[1].rotation.x = 0;
    }
    this.pos.x = Math.max(-248, Math.min(248, this.pos.x));
    this.pos.z = Math.max(-248, Math.min(248, this.pos.z));
    resolveCircle(this.pos, PLAYER.radius, this.city.colliders);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;

    // Enter a nearby car.
    const actions = input.takeActions();
    if (actions & ACTION_ENTER) {
      const car = world.traffic.nearestCar(this.pos, 4.5);
      if (car) this.enterCar(car);
    }
    // Fire the pistol.
    if (input.takeClick() && this.ammo > 0 && this.reloadTimer <= 0) {
      this.shoot(camera, world);
    }
    if ((actions & ACTION_RELOAD) && this.ammo < PLAYER.pistolAmmo && this.reloadTimer <= 0) {
      this.reloadTimer = 1.1;
    }

    // Third-person camera behind the player.
    const dist = 7;
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = this.pos.y + 1.7 + Math.sin(this.camPitch) * dist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(this.pos.x, this.pos.y + 1.7, this.pos.z);
  }

  updateDriving(dt, world, camera) {
    const input = this.input;
    const car = this.car;
    const throttle = input.throttle();
    const steer = input.steer();
    const prevSpeed = this.speed;
    if (throttle > 0) this.speed += CAR.accel * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= CAR.brake * dt;
      else this.speed -= CAR.reverseAccel * dt;
    } else {
      this.speed -= this.speed * 0.9 * dt;
    }
    if (Math.abs(this.speed) < 0.15 && throttle === 0) this.speed = 0;
    this.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, this.speed));
    const steerFactor = Math.min(1, Math.abs(this.speed) / 9);
    car.heading += steer * CAR.steer * steerFactor * dt * (this.speed >= 0 ? 1 : -1);
    car.pos.x += Math.sin(car.heading) * this.speed * dt;
    car.pos.z += Math.cos(car.heading) * this.speed * dt;
    car.mesh.rotation.y = car.heading;
    car.mesh.position.y = Math.sin(this.time * 22) * 0.02 * Math.min(1, Math.abs(this.speed) / 20);

    // Buildings: bounce off, hard hits hurt and make noise.
    const hitWall = resolveCircle(car.pos, CAR.radius, this.city.colliders);
    if (hitWall && Math.abs(prevSpeed) > 9) {
      this.audio.crash(Math.abs(prevSpeed) / CAR.maxSpeed);
      this.speed *= 0.4;
      if (Math.abs(prevSpeed) > 22) this.damage(5);
    } else if (hitWall) {
      this.speed *= 0.6;
    }
    // Other cars: push apart.
    for (const other of world.traffic.cars) {
      if (other === car) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / 2;
        car.pos.x += (dx / d) * push;
        car.pos.z += (dz / d) * push;
        if (Math.abs(this.speed) > 12) this.audio.crash(0.4);
        this.speed *= 0.85;
      }
    }
    for (const cop of world.police.cars) {
      const dx = car.pos.x - cop.pos.x;
      const dz = car.pos.z - cop.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / 2;
        car.pos.x += (dx / d) * push;
        car.pos.z += (dz / d) * push;
        this.speed *= 0.9;
      }
    }
    // Pedestrians: hitting one at speed is a crime.
    for (const ped of world.peds.peds) {
      if (ped.state !== 'walk') continue;
      const d = Math.hypot(car.pos.x - ped.pos.x, car.pos.z - ped.pos.z);
      if (d < 2.4 && Math.abs(this.speed) > 3) {
        if (world.peds.knockDown(ped)) {
          this.commitCrime('hitPed');
          this.audio.crash(0.5);
          this.speed *= 0.92;
        }
      }
    }
    // Wheels spin with speed.
    for (const child of car.mesh.children) {
      if (child.geometry && child.geometry.type === 'CylinderGeometry') {
        child.rotation.x += (this.speed * dt) / 0.42;
      }
    }
    // Exit the car.
    const actions = input.takeActions();
    if (actions & ACTION_ENTER) this.exitCar();

    // Chase camera behind the car, yaw following it with a little lag.
    const targetYaw = car.heading + Math.PI;
    let dyaw = targetYaw - this.camYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.camYaw += dyaw * Math.min(1, 3.2 * dt);
    const dist = 10.5;
    const cx = car.pos.x + Math.sin(this.camYaw) * dist;
    const cz = car.pos.z + Math.cos(this.camYaw) * dist;
    camera.position.lerp(new THREE.Vector3(cx, 4.6, cz), Math.min(1, 7 * dt));
    camera.lookAt(car.pos.x + Math.sin(car.heading) * 8, 1.4, car.pos.z + Math.cos(car.heading) * 8);
  }
}

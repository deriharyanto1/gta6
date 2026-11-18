// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one stages the
// real game — the same world, player, traffic and police the player plays — from a
// fixed seed, so the frame is what a short game really looks like and the same seed
// always gives the same frame. The loop keeps running after staging (traffic drives,
// police chase), so a screenshot taken a few seconds in is alive, not posed.

import { SHOT_MODES } from './config.js';

const THREE = window.THREE;

/**
 * Stage the named scene on the live game object and return the screen the page
 * should show ('title' keeps the start overlay; 'play' shows the HUD).
 * game: { player, traffic, police, peds, missions, city, camera, scene, hud }.
 */
export function stageShot(name, game) {
  const mode = SHOT_MODES.includes(name) ? name : 'start';
  const { player, traffic, police, missions } = game;

  // A clean slate: no wanted level, no police, mission 1 briefing.
  player.setWanted(0, true);
  player.health = 100;
  police.clear();
  missions.start(0);

  if (mode === 'start') {
    // Rex on foot in the central plaza, the tower behind him, traffic passing.
    player.pos.set(-14, 0, 96);
    player.heading = Math.PI;
    player.camYaw = Math.PI;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    game.shotCamera = {
      pos: new THREE.Vector3(64, 48, 196),
      lookAt: new THREE.Vector3(-8, 12, -30),
    };
    return { screen: 'title', mode };
  }

  if (mode === 'drive') {
    // Behind the wheel on the east avenue, city streaming past.
    const car = traffic.nearestCar(player.pos, 500) || traffic.cars[0];
    car.pos.set(-160, 0, -37);
    car.heading = Math.PI / 2;
    car.mesh.position.set(-160, 0, -37);
    car.mesh.rotation.y = car.heading;
    player.enterCar(car);
    player.speed = 16;
    game.shotCamera = null;
    return { screen: 'play', mode };
  }

  if (mode === 'chase') {
    // Three stars, two patrol cars on Rex's tail on the south avenue.
    const car = traffic.nearestCar(player.pos, 500) || traffic.cars[0];
    car.pos.set(-120, 0, 37);
    car.heading = Math.PI / 2;
    car.mesh.position.set(-120, 0, 37);
    car.mesh.rotation.y = car.heading;
    player.enterCar(car);
    player.speed = 24;
    player.setWanted(3);
    const cop1 = police.spawnAt(-132, 33);
    cop1.heading = Math.PI / 2;
    cop1.speed = 20;
    const cop2 = police.spawnAt(-140, 42);
    cop2.heading = Math.PI / 2;
    cop2.speed = 19;
    // A chase camera that rides ahead of the car and looks back at it, so the
    // patrol cars on Rex's tail stay in frame.
    game.shotCamera = null;
    game.shotChaseCam = true;
    return { screen: 'play', mode };
  }

  // 'mission': on foot on the North Market road, the marker glowing ahead.
  player.pos.set(-170, 0, -185);
  player.heading = Math.PI / 2;
  player.camYaw = -Math.PI / 2;
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  game.shotCamera = null;
  return { screen: 'play', mode };
}

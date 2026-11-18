# Meridian Heat

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/deriharyanto1/gta6/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/deriharyanto1/gta6/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).
Rex Marlowe is back in Meridian Bay with empty pockets and a fast reputation. Mama Rosa
has five jobs for him — and the Meridian Bay police have other plans.

## Play

Serve `game/` with any static server (`node serve.ts`, then open http://localhost:8080)
and play in a desktop browser. No network needed: every file is local.

- **W A S D** move / drive · **Mouse** look · **E** enter / exit car
- **Click** shoot · **R** reload · **Shift** run · **Esc / P** pause · **M** mute

## What is in the game

- A sun-soaked 3D coastal city (three.js, vendored under `game/vendor/`): 25 blocks,
  a beach and pier, parks, streetlights, a tower landmark — all procedural.
- On foot and by car: steal any car, arcade driving, traffic that follows the roads.
- Pedestrians on the sidewalks; hitting one is a crime.
- A wanted level (1–5 stars): police cars spawn, chase, ram, and shoot at 3+ stars.
- Five story missions with markers, timers, and cash rewards, plus a story-complete
  ending and free roam after.
- Combat: a pistol with tracer fire, muzzle flash, and reload.
- HUD with health, cash, wanted stars, mission tracker, and a live minimap.
- Start screen, pause, busted/wasted, and a localStorage save (cash + mission progress).
- Sound, all synthesised with WebAudio: engine hum, sirens, gunshots, pickups.

## Layout

- `game/index.html` — page, HUD, and screens.
- `game/src/config.js` — tuning, city layout, the five missions.
- `game/src/city.js` — procedural Meridian Bay (ground, buildings, lights, beach).
- `game/src/vehicles.js` — car meshes, traffic AI, police AI.
- `game/src/pedestrians.js` — pedestrians on the sidewalks.
- `game/src/player.js` — Rex on foot and behind the wheel, shooting, wanted level.
- `game/src/missions.js` — Mama Rosa's five jobs.
- `game/src/hud.js` — HUD and minimap.
- `game/src/audio.js` — synthesised WebAudio sounds.
- `game/src/input.js` — keyboard and mouse.
- `game/src/shots.js` — the four screenshot scenes (`?shot=start|drive|chase|mission`).
- `game/src/main.js` — boot, loop, screens, save/load.
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to `/output` and
  writes `/output/dossier.json`.

## License

MIT — see [LICENSE](LICENSE). three.js (MIT) is vendored under `game/vendor/`.

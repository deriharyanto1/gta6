// Meridian Heat — every tuneable number of the game in one place.
// The city is a grid of blocks and roads; all positions are metres, +X east, +Z south.

export const CITY = {
  // Road centre lines, both directions. Blocks sit between them.
  roads: [-185, -111, -37, 37, 111, 185],
  pitch: 74,
  block: 60,
  roadWidth: 14,
  half: 250,
  groundSize: 560,
  waterZ: 252,
};

export const PALETTE = {
  sky: 0x8ec9ee,
  fog: 0xcfe4f2,
  sun: 0xffe3b3,
  water: 0x2e7fb8,
  building: [0xe8dcc8, 0xd8c1a5, 0xb8c4d4, 0xe8b48c, 0xc9b8d8, 0x9fb8a8, 0xf0e6d2],
  car: [0xc0392b, 0x2e6fb0, 0xf0c040, 0x7f8c8d, 0x222831, 0xe8e8e8, 0x27ae60, 0x8e44ad, 0xe67e22],
  pedShirt: [0xd94f4f, 0x4f7fd9, 0x53b06a, 0xe0a83c, 0x9b59b6, 0xeeeeee, 0x333333],
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 9.5,
  health: 100,
  radius: 0.6,
  eyeHeight: 1.7,
  pistolAmmo: 12,
  pistolRange: 70,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 38,
  maxReverse: 10,
  steer: 0.55,
  radius: 2.2,
};

export const WANTED = {
  stealCar: 1,
  hitPed: 2,
  shoot: 1,
  killCop: 2,
  decaySeconds: 14,
  maxStars: 5,
};

export const POLICE = {
  ramDamage: 8,
  ramCooldown: 0.9,
  shotDamage: 6,
  shootRange: 42,
  shootInterval: 1.3,
  chaseSpeed: [0, 15, 17, 19, 21, 23],
  maxActive: 4,
};

export const SAVE_KEY = 'meridian-heat-save-v1';

// The story: five jobs for Mama Rosa. Each mission names its objective in plain
// words; the mission system (missions.js) turns these into markers and checks.
export const MISSIONS = [
  {
    id: 'first-job',
    title: 'JOB 1 — THE PICKUP',
    briefing: 'Mama Rosa needs a package from the North Market. Get in a car and bring it back to the marker.',
    objective: 'Get in a car, then drive to the glowing marker at the North Market.',
    reward: 300,
    kind: 'goto',
    target: { x: -148, z: -185 },
    needsCar: true,
  },
  {
    id: 'hot-wheels',
    title: 'JOB 2 — HOT WHEELS',
    briefing: 'A red Comet GT is parked by the marina. Steal it and deliver it to Rosa\'s garage. The owner will not be pleased.',
    objective: 'Steal the red Comet GT at the marina and deliver it to the garage.',
    reward: 600,
    kind: 'steal-deliver',
    carSpot: { x: 148, z: 222 },
    deliver: { x: 111, z: -111 },
  },
  {
    id: 'heat-wave',
    title: 'JOB 3 — HEAT WAVE',
    briefing: 'The cops are all over you. Lose them — reach the hideout in the east docks and the heat dies down.',
    objective: 'Reach the hideout in the east docks while the police chase you.',
    reward: 900,
    kind: 'escape',
    target: { x: 222, z: 37 },
    wantedOnStart: 3,
  },
  {
    id: 'cash-run',
    title: 'JOB 4 — CASH RUN',
    briefing: 'Five cash drops are stashed around the bay. Grab them all before the timer runs out.',
    objective: 'Collect all 5 cash drops before time runs out.',
    reward: 1200,
    kind: 'collect',
    timeLimit: 180,
    drops: [
      { x: -185, z: -148 }, { x: 185, z: -111 }, { x: -111, z: 185 },
      { x: 37, z: 148 }, { x: -37, z: -37 },
    ],
  },
  {
    id: 'big-score',
    title: 'JOB 5 — THE BIG SCORE',
    briefing: 'One briefcase on the south pier. Grab it, then deliver it to the Meridian Tower penthouse. The whole force will be on you.',
    objective: 'Pick up the briefcase at the south pier, then deliver it to Meridian Tower.',
    reward: 2500,
    kind: 'pickup-deliver',
    pickup: { x: -37, z: 222 },
    deliver: { x: 0, z: 0 },
    wantedOnPickup: 4,
  },
];

export const SHOT_MODES = ['start', 'drive', 'chase', 'mission'];

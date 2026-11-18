// Meridian Bay itself: a procedurally built coastal city. One canvas texture paints the
// whole ground (roads, sidewalks, crosswalks, parks, beach), buildings are boxes with
// windowed facades, streetlights and trees are instanced, and the south edge is water.
// buildCity also owns the sun, sky and fog, and the collision boxes every mover uses.

import { CITY, PALETTE } from './config.js';

const THREE = window.THREE;

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function facadeTexture(base, lit) {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, size);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, 128, 10);
    for (let row = 0; row < 15; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        const x = 8 + col * 20;
        const y = 16 + row * 16;
        const litWindow = ((row * 7 + col * 3) % 9) < 2;
        ctx.fillStyle = litWindow ? lit : '#2c3e50';
        ctx.fillRect(x, y, 12, 9);
      }
    }
  });
}

/** Push a circle (x, z, radius) out of every axis-aligned box it overlaps. */
export function resolveCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration.
      const pushL = pos.x - c.minX + radius;
      const pushR = c.maxX - pos.x + radius;
      const pushT = pos.z - c.minZ + radius;
      const pushB = c.maxZ - pos.z + radius;
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) pos.x = c.minX - radius;
      else if (m === pushR) pos.x = c.maxX + radius;
      else if (m === pushT) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  return hit;
}

export function buildCity(scene, rng) {
  const S = CITY.groundSize;
  const half = S / 2;
  const toCanvas = (v) => ((v + half) / S) * 1024;
  const colliders = [];

  // ---- sky, fog, sun -------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 700);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-160, 220, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x8a7a5a, 1.7);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);

  // ---- ground: one painted canvas -----------------------------------------
  const roads = CITY.roads;
  const blockEdges = [];
  for (let i = 0; i < roads.length - 1; i += 1) {
    blockEdges.push([roads[i] + CITY.roadWidth / 2, roads[i + 1] - CITY.roadWidth / 2]);
  }
  const parkBlocks = new Set(['-148,-148', '74,148']);
  const parkingBlocks = new Set(['148,-148']);
  const groundTex = canvasTexture(1024, (ctx) => {
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(0, 0, 1024, 1024);
    // Block interiors.
    for (const [x0, x1] of blockEdges) {
      for (const [z0, z1] of blockEdges) {
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const key = `${cx},${cz}`;
        ctx.fillStyle = parkBlocks.has(key) ? '#5d9b52' : parkingBlocks.has(key) ? '#3a3f47' : '#c8b89a';
        ctx.fillRect(toCanvas(x0), toCanvas(z0), toCanvas(x1) - toCanvas(x0), toCanvas(z1) - toCanvas(z0));
        if (parkingBlocks.has(key)) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 2;
          for (let i = 0; i < 5; i += 1) {
            const px = toCanvas(x0 + 8 + i * 11);
            ctx.beginPath();
            ctx.moveTo(px, toCanvas(z0 + 8));
            ctx.lineTo(px, toCanvas(z0 + 26));
            ctx.stroke();
          }
        }
      }
    }
    // Roads.
    ctx.fillStyle = '#3a4048';
    for (const r of roads) {
      ctx.fillRect(0, toCanvas(r - CITY.roadWidth / 2), 1024, toCanvas(CITY.roadWidth));
      ctx.fillRect(toCanvas(r - CITY.roadWidth / 2), 0, toCanvas(CITY.roadWidth), 1024);
    }
    // Centre dashes.
    ctx.fillStyle = '#e8c832';
    for (const r of roads) {
      for (let d = -490; d < 500; d += 18) {
        ctx.fillRect(toCanvas(d), toCanvas(r) - 1.5, toCanvas(6) - toCanvas(0), 3);
        ctx.fillRect(toCanvas(r) - 1.5, toCanvas(d), 3, toCanvas(6) - toCanvas(0));
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const rx of roads) {
      for (const rz of roads) {
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(toCanvas(rx + i * 2) - 3, toCanvas(rz - CITY.roadWidth / 2) + 2, 6, 8);
          ctx.fillRect(toCanvas(rx + i * 2) - 3, toCanvas(rz + CITY.roadWidth / 2) - 10, 6, 8);
        }
      }
    }
    // Beach sand along the south edge.
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, toCanvas(232), 1024, 1024 - toCanvas(232));
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(S, S),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- water south of the beach --------------------------------------------
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(S + 400, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, CITY.waterZ + 130);
  scene.add(water);

  // ---- buildings -----------------------------------------------------------
  const facades = [
    facadeTexture('#e8dcc8', '#ffd27f'),
    facadeTexture('#b8c4d4', '#ffe9a8'),
    facadeTexture('#d8a08c', '#ffd27f'),
  ];
  const facadeMats = facades.map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const centres = [];
  for (let i = 0; i < blockEdges.length; i += 1) {
    for (let j = 0; j < blockEdges.length; j += 1) {
      centres.push({ x: (blockEdges[i][0] + blockEdges[i][1]) / 2, z: (blockEdges[j][0] + blockEdges[j][1]) / 2 });
    }
  }
  let towerPos = { x: 0, z: 0 };
  for (const c of centres) {
    const key = `${c.x},${c.z}`;
    if (parkBlocks.has(key) || parkingBlocks.has(key)) continue;
    const isTower = c.x === 0 && c.z === 0;
    const isHospital = c.x === -148 && c.z === 148;
    if (isTower) {
      const tower = new THREE.Mesh(unitBox, [
        facadeMats[1], facadeMats[1], roofMat, roofMat, facadeMats[1], facadeMats[1],
      ]);
      tower.scale.set(34, 96, 34);
      tower.position.set(0, 0, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      scene.add(tower);
      colliders.push({ minX: -17, maxX: 17, minZ: -17, maxZ: 17 });
      towerPos = { x: 0, z: 0 };
      continue;
    }
    const cells = [[-15, -15], [15, -15], [-15, 15], [15, 15]];
    const chosen = rng.shuffle(cells).slice(0, isHospital ? 1 : rng.int(1, 3));
    for (const [ox, oz] of chosen) {
      const w = rng.range(16, 26);
      const d = rng.range(16, 26);
      const h = isHospital ? 16 : rng.range(11, 52);
      const mat = isHospital
        ? new THREE.MeshLambertMaterial({ color: 0xf2f2ee })
        : facadeMats[rng.int(0, facadeMats.length - 1)];
      const mesh = new THREE.Mesh(unitBox, [mat, mat, roofMat, roofMat, mat, mat]);
      mesh.scale.set(w, h, d);
      mesh.position.set(c.x + ox, 0, c.z + oz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      colliders.push({
        minX: c.x + ox - w / 2, maxX: c.x + ox + w / 2,
        minZ: c.z + oz - d / 2, maxZ: c.z + oz + d / 2,
      });
    }
  }

  // ---- pier on the south beach ---------------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 60), pierMat);
  pier.position.set(-37, 0.6, 282);
  pier.castShadow = true;
  scene.add(pier);
  colliders.push({ minX: -42, maxX: -32, minZ: 252, maxZ: 312 });

  // ---- streetlights (instanced) --------------------------------------------
  const lightPositions = [];
  for (const rx of roads) {
    for (const rz of roads) {
      lightPositions.push([rx + 9, rz + 9]);
      lightPositions.push([rx - 9, rz - 9]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightPositions.length);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffd27f, emissiveIntensity: 0.9 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lightPositions.length);
  const m4 = new THREE.Matrix4();
  lightPositions.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, 7, z);
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);

  // ---- trees in the parks (instanced) --------------------------------------
  const treeSpots = [];
  for (const key of parkBlocks) {
    const [bx, bz] = key.split(',').map(Number);
    for (let i = 0; i < 9; i += 1) {
      treeSpots.push([bx + rng.range(-24, 24), bz + rng.range(-24, 24)]);
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const leafGeo = new THREE.SphereGeometry(1.9, 8, 6);
  leafGeo.translate(0, 3.4, 0);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeSpots.length);
  treeSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z);
    trunks.setMatrixAt(i, m4);
    leaves.setMatrixAt(i, m4);
  });
  scene.add(trunks);
  scene.add(leaves);

  return {
    colliders,
    roads,
    towerPos,
    hospitalPos: { x: -148, z: 178 },
    garagePos: { x: 111, z: -111 },
    /** Keep the sun's shadow box centred on the player. */
    updateSun(playerPos) {
      sun.position.set(playerPos.x - 160, 220, playerPos.z - 120);
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      sun.target.updateMatrixWorld();
    },
    /** A random point on a random road (for spawning). */
    randomRoadPoint() {
      const horizontal = rng.next() < 0.5;
      const road = rng.pick(roads);
      const along = rng.range(-230, 230);
      return horizontal ? { x: along, z: road } : { x: road, z: along };
    },
  };
}

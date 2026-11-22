/**
 * Auren — procedural model of the Meridian One headphones.
 *
 * Everything is generated from lathe profiles and primitives, so there is
 * no model file to download. The earcup is built from the same seven parts
 * that the "Inside Meridian One" section takes apart.
 *
 * Earcup coordinates: the cup axis is local Y, +Y points away from the ear,
 * and the housing radius is 1 unit.
 */
import { THREE } from './kit.js';

const COLOR = {
  aluminium: 0xd3d8df,
  graphite: 0x2b2e35,
  darkMetal: 0x17191e,
  accent: 0x8c3f5a,
  leather: 0x17191d,
  fabric: 0x1b1d22,
  board: 0x1a2a2d,
  chip: 0x0d0f12,
  pearl: 0xc9ced6,
};

/* ---------- Textures (drawn on canvas) ---------- */

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createTextures() {
  // Fine leather grain.
  const grain = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5200; i += 1) {
      const value = 70 + Math.floor(Math.random() * 120);
      ctx.fillStyle = `rgba(${value}, ${value}, ${value}, 0.5)`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 0.6 + Math.random() * 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Concentric machining lines for the spun aluminium cap.
  const spun = canvasTexture(256, (ctx, size) => {
    for (let y = 0; y < size; y += 1) {
      const value = 120 + Math.floor(Math.random() * 110);
      ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
      ctx.fillRect(0, y, size, 1);
    }
  });

  // Woven acoustic mesh in the accent colour.
  const weave = canvasTexture(64, (ctx, size) => {
    ctx.fillStyle = '#853c55';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#4c2232';
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        ctx.beginPath();
        ctx.arc(x + 4, y + 4, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  weave.colorSpace = THREE.SRGBColorSpace;
  weave.repeat.set(12, 12);

  return { grain, spun, weave };
}

/* ---------- Materials ---------- */

/**
 * Returns material factories. Every call creates a fresh material so that
 * individual parts can be dimmed independently in the exploded view.
 */
export function createMaterials() {
  const textures = createTextures();
  const side = THREE.DoubleSide;

  const repeated = (texture, x, y) => {
    const copy = texture.clone();
    copy.repeat.set(x, y);
    copy.needsUpdate = true;
    return copy;
  };

  return {
    spun: () =>
      new THREE.MeshPhysicalMaterial({
        color: COLOR.aluminium,
        metalness: 1,
        roughness: 0.3,
        anisotropy: 0.7,
        bumpMap: repeated(textures.spun, 1, 2),
        bumpScale: 0.3,
        side,
      }),
    aluminium: () =>
      new THREE.MeshPhysicalMaterial({ color: COLOR.aluminium, metalness: 1, roughness: 0.36, side }),
    accent: () =>
      new THREE.MeshPhysicalMaterial({ color: COLOR.accent, metalness: 0.85, roughness: 0.34, side }),
    graphite: () =>
      new THREE.MeshPhysicalMaterial({
        color: COLOR.graphite,
        metalness: 0.25,
        roughness: 0.5,
        clearcoat: 0.25,
        clearcoatRoughness: 0.6,
        side,
      }),
    darkMetal: () =>
      new THREE.MeshPhysicalMaterial({ color: COLOR.darkMetal, metalness: 0.9, roughness: 0.42, side }),
    leather: (repeatX = 10, repeatY = 3) =>
      new THREE.MeshPhysicalMaterial({
        color: COLOR.leather,
        metalness: 0,
        roughness: 0.6,
        bumpMap: repeated(textures.grain, repeatX, repeatY),
        bumpScale: 0.9,
        sheen: 0.5,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color(0x56606e),
        side,
      }),
    fabric: () =>
      new THREE.MeshStandardMaterial({ color: COLOR.fabric, metalness: 0, roughness: 0.92, side }),
    weave: () =>
      new THREE.MeshStandardMaterial({ map: textures.weave, metalness: 0, roughness: 0.85, side }),
    board: () =>
      new THREE.MeshStandardMaterial({ color: COLOR.board, metalness: 0.2, roughness: 0.55, side }),
    chip: () =>
      new THREE.MeshStandardMaterial({ color: COLOR.chip, metalness: 0.4, roughness: 0.45 }),
    pearl: () =>
      new THREE.MeshPhysicalMaterial({ color: COLOR.pearl, metalness: 0.85, roughness: 0.28, side }),
  };
}

/* ---------- Geometry helpers ---------- */

/**
 * Turns a polyline into a lathe profile: rounds the corners, orders the
 * points so that normals face outwards and subdivides long segments so
 * that textures are spread evenly along the surface.
 */
function profile(points, radius = 0.03, maxSegment = 0.045) {
  const source = points.map(([x, y]) => new THREE.Vector2(x, y));

  // Counter-clockwise order gives outward-facing lathe normals.
  let area = 0;
  for (let i = 0; i < source.length; i += 1) {
    const a = source[i];
    const b = source[(i + 1) % source.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) source.reverse();

  // Rounded corners (quadratic fillets).
  const rounded = [source[0]];
  const STEPS = 5;
  for (let i = 1; i < source.length - 1; i += 1) {
    const corner = source[i];
    const toPrev = source[i - 1].clone().sub(corner);
    const toNext = source[i + 1].clone().sub(corner);
    const r = Math.min(radius, toPrev.length() / 2, toNext.length() / 2);
    const start = corner.clone().add(toPrev.normalize().multiplyScalar(r));
    const end = corner.clone().add(toNext.normalize().multiplyScalar(r));
    for (let step = 0; step <= STEPS; step += 1) {
      const t = step / STEPS;
      const u = 1 - t;
      rounded.push(
        new THREE.Vector2(
          u * u * start.x + 2 * u * t * corner.x + t * t * end.x,
          u * u * start.y + 2 * u * t * corner.y + t * t * end.y
        )
      );
    }
  }
  rounded.push(source[source.length - 1]);

  // Even out the spacing.
  const result = [rounded[0]];
  for (let i = 1; i < rounded.length; i += 1) {
    const from = rounded[i - 1];
    const to = rounded[i];
    const pieces = Math.max(1, Math.ceil(from.distanceTo(to) / maxSegment));
    for (let piece = 1; piece <= pieces; piece += 1) {
      result.push(from.clone().lerp(to, piece / pieces));
    }
  }
  return result;
}

function lathe(points, radius, segments = 96) {
  return new THREE.LatheGeometry(profile(points, radius), segments);
}

function addMesh(parent, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Elliptical arc used for the headband. */
class BandCurve extends THREE.Curve {
  constructor(radiusX, radiusY, centerY, startAngle, endAngle) {
    super();
    this.radiusX = radiusX;
    this.radiusY = radiusY;
    this.centerY = centerY;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = this.startAngle + (this.endAngle - this.startAngle) * t;
    return target.set(
      this.radiusX * Math.cos(angle),
      this.centerY + this.radiusY * Math.sin(angle),
      0
    );
  }
}

/* ---------- Earcup ---------- */

/** Order of the earcup layers, from the outside in. */
export const CUP_PARTS = ['cap', 'ring', 'shell', 'board', 'driver', 'baffle', 'cushion'];

/**
 * Builds one earcup. Each layer is its own group (see CUP_PARTS).
 * With `detailed: false` the hidden internals are skipped.
 */
export function buildCup(materials, { detailed = false } = {}) {
  const group = new THREE.Group();
  const parts = {};
  const part = (name) => {
    const partGroup = new THREE.Group();
    partGroup.name = name;
    group.add(partGroup);
    parts[name] = partGroup;
    return partGroup;
  };

  // 1. Spun aluminium cap.
  addMesh(
    part('cap'),
    lathe([[0, 0.3], [0.765, 0.3], [0.765, 0.352], [0.715, 0.4], [0, 0.412]], 0.02, 256),
    materials.spun()
  );

  // 2. Anodised microphone ring.
  const ring = part('ring');
  const accent = materials.accent();
  addMesh(
    ring,
    lathe(
      [[0.78, 0.29], [0.862, 0.29], [0.862, 0.368], [0.84, 0.39], [0.8, 0.39], [0.78, 0.368], [0.78, 0.29]],
      0.008
    ),
    accent
  );
  if (detailed) {
    // Microphone ports around the ring.
    const portMaterial = materials.chip();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + 0.2;
      const port = addMesh(ring, new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12), portMaterial);
      port.position.set(Math.cos(angle) * 0.82, 0.39, Math.sin(angle) * 0.82);
    }
  }

  // 3. Housing.
  const shell = part('shell');
  const graphite = materials.graphite();
  addMesh(
    shell,
    lathe(
      [
        [0, 0.23], [0.74, 0.23], [0.86, 0.16], [0.9, 0], [0.9, -0.172], [0.962, -0.172],
        [1, -0.12], [1, 0.02], [0.985, 0.2], [0.885, 0.3], [0, 0.3],
      ],
      0.06
    ),
    graphite
  );
  const trim = addMesh(shell, new THREE.TorusGeometry(0.972, 0.016, 12, 96), materials.darkMetal());
  trim.rotation.x = Math.PI / 2;
  trim.position.y = -0.176;
  if (detailed) {
    // Screw bosses under the cap.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const boss = addMesh(shell, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), graphite);
      boss.position.set(Math.cos(angle) * 0.56, 0.305, Math.sin(angle) * 0.56);
    }
  }

  // 4. Logic board and battery (internal).
  if (detailed) {
    const board = part('board');
    addMesh(board, lathe([[0, 0.115], [0.74, 0.115], [0.74, 0.14], [0, 0.14]], 0.005), materials.board());

    const battery = addMesh(board, new THREE.BoxGeometry(0.62, 0.066, 0.4), materials.aluminium());
    battery.position.set(-0.02, 0.174, 0.16);

    const chipMaterial = materials.chip();
    const chips = [
      [0.3, -0.3, 0.22, 0.22],
      [-0.26, -0.33, 0.26, 0.14],
      [0.02, -0.52, 0.12, 0.12],
      [-0.52, -0.1, 0.1, 0.16],
      [0.52, -0.02, 0.1, 0.12],
    ];
    chips.forEach(([x, z, width, depth]) => {
      const chip = addMesh(board, new THREE.BoxGeometry(width, 0.03, depth), chipMaterial);
      chip.position.set(x, 0.155, z);
    });

    const capacitorMaterial = materials.aluminium();
    [[0.5, -0.3], [0.56, 0.22], [-0.48, -0.36], [0.06, -0.26], [-0.08, -0.14]].forEach(([x, z]) => {
      const capacitor = addMesh(board, new THREE.CylinderGeometry(0.028, 0.028, 0.05, 16), capacitorMaterial);
      capacitor.position.set(x, 0.165, z);
    });
  }

  // 5. Driver (internal).
  if (detailed) {
    const driver = part('driver');
    const frame = materials.darkMetal();
    const magnet = addMesh(driver, new THREE.CylinderGeometry(0.25, 0.25, 0.085, 48), frame);
    magnet.position.y = 0.055;
    const pole = addMesh(driver, new THREE.CylinderGeometry(0.16, 0.16, 0.014, 40), materials.aluminium());
    pole.position.y = 0.103;
    addMesh(
      driver,
      lathe(
        [
          [0.25, -0.01], [0.29, -0.01], [0.56, -0.085], [0.56, -0.105], [0.61, -0.105],
          [0.61, -0.06], [0.57, -0.06], [0.3, 0.02], [0.25, 0.02], [0.25, -0.01],
        ],
        0.008
      ),
      materials.aluminium()
    );
    // Diaphragm: dust cap, cone and surround.
    addMesh(
      driver,
      lathe(
        [
          [0, -0.092], [0.08, -0.086], [0.15, -0.066], [0.2, -0.035],
          [0.47, -0.088], [0.5, -0.104], [0.535, -0.104], [0.56, -0.088],
        ],
        0.01,
        72
      ),
      materials.pearl()
    );
  }

  // 6. Acoustic baffle with woven mesh.
  const baffle = part('baffle');
  addMesh(
    baffle,
    lathe([[0.5, -0.168], [0.93, -0.168], [0.93, -0.112], [0.5, -0.112], [0.5, -0.168]], 0.01),
    materials.fabric()
  );
  const mesh = addMesh(baffle, new THREE.CircleGeometry(0.505, 64), materials.weave());
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = -0.14;

  // 7. Memory-foam cushion on its mounting plate.
  const cushion = part('cushion');
  addMesh(
    cushion,
    lathe([[0.4, -0.21], [0.95, -0.21], [0.95, -0.172], [0.4, -0.172], [0.4, -0.21]], 0.008),
    materials.fabric()
  );
  const pad = addMesh(cushion, new THREE.TorusGeometry(0.7, 0.27, 28, 96), materials.leather(10, 3));
  pad.rotation.x = Math.PI / 2;
  pad.scale.z = 0.9;
  pad.position.y = -0.46;

  return { group, parts };
}

/* ---------- Complete headphones ---------- */

/**
 * Builds the full headphones, standing upright.
 * Bounds: roughly x ±1.55, y −2.12 … 1.82.
 */
export function buildHeadphones(materials) {
  const group = new THREE.Group();

  const CUP_X = 1.2;
  const CUP_Y = -1.3;
  const CUP_SCALE = 0.82;
  const BAND = { radiusX: 1.44, radiusY: 1.62, centerY: 0.12 };

  // Headband: leather outer band with a softer inner pad.
  const bandCurve = new BandCurve(BAND.radiusX, BAND.radiusY, BAND.centerY, -0.07, Math.PI + 0.07);
  const band = addMesh(group, new THREE.TubeGeometry(bandCurve, 120, 0.08, 20), materials.leather(18, 2));
  band.scale.z = 2.4;

  const padCurve = new BandCurve(BAND.radiusX - 0.07, BAND.radiusY - 0.07, BAND.centerY, 0.5, Math.PI - 0.5);
  const padGroup = new THREE.Group();
  padGroup.scale.z = 2.1;
  group.add(padGroup);
  const padMaterial = materials.fabric();
  addMesh(padGroup, new THREE.TubeGeometry(padCurve, 80, 0.075, 16), padMaterial);
  [0, 1].forEach((t) => {
    const end = addMesh(padGroup, new THREE.SphereGeometry(0.075, 16, 12), padMaterial);
    end.position.copy(padCurve.getPoint(t));
  });

  // Arm blade profile (shared by both sides).
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.15, 0);
  bladeShape.lineTo(0.15, 0);
  bladeShape.lineTo(0.11, -0.46);
  bladeShape.quadraticCurveTo(0.11, -0.58, 0, -0.58);
  bladeShape.quadraticCurveTo(-0.11, -0.58, -0.11, -0.46);
  bladeShape.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 16,
  });
  const collarGeometry = lathe([[0, -0.13], [0.105, -0.13], [0.105, 0.13], [0, 0.13]], 0.025, 48);

  [-1, 1].forEach((side) => {
    // Earcup: local +Y (outside) points along ±X.
    const { group: cup } = buildCup(materials);
    cup.scale.setScalar(CUP_SCALE);
    cup.rotation.z = (-side * Math.PI) / 2;
    cup.position.set(side * CUP_X, CUP_Y, 0);
    group.add(cup);

    // Aluminium collar where the band meets the arm.
    const collar = addMesh(group, collarGeometry, materials.aluminium());
    collar.scale.z = 2.05;
    collar.position.set(side * (BAND.radiusX - 0.003), 0, 0);

    // Aluminium arm running down onto the housing.
    const blade = addMesh(group, bladeGeometry, materials.aluminium());
    blade.rotation.y = (side * Math.PI) / 2;
    blade.position.set(side * 1.457, -0.04, 0);
  });

  return group;
}

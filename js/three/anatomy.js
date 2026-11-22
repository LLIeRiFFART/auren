/**
 * Auren — "Inside Meridian One": one earcup that comes apart along its axis.
 * The page script drives it through setExplode() and setActive().
 */
import { THREE, createStage, createLoop, createProjectedBounds, damp } from './kit.js';
import { createMaterials, buildCup, CUP_PARTS } from './model.js';

/** How far each layer travels along the cup axis when fully exploded. */
const TRAVEL = { cap: 2.75, ring: 2.2, shell: 1.5, board: 0.2, driver: -0.6, baffle: -1.4, cushion: -2.2 };

/** Hotspot anchor for each layer: [radius, position on the axis]. */
const ANCHOR = {
  cap: [0.765, 0.35],
  ring: [0.862, 0.34],
  shell: [1.0, 0.05],
  board: [0.74, 0.13],
  driver: [0.61, -0.03],
  baffle: [0.93, -0.14],
  cushion: [0.97, -0.46],
};

const DIMMED = 0.36;
const YAW_LIMIT = 1.0;

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {HTMLElement[]} options.hotspots  One element per layer, positioned over the canvas.
 * @param {boolean} options.reducedMotion   Applies changes instantly instead of animating.
 * @param {boolean} options.guard           Enables the performance guard.
 * @param {Function} options.onFail         Called if the scene has to be abandoned.
 */
export function createAnatomy(container, { hotspots = [], reducedMotion = false, guard = true, onFail = () => {} } = {}) {
  const stage = createStage(container, { fov: 26 });
  const { scene, camera, canvas } = stage;

  const root = new THREE.Group();
  const { group: cup, parts } = buildCup(createMaterials(), { detailed: true });
  root.add(cup);
  scene.add(root);
  const responsiveView = window.matchMedia('(max-width: 1023px)');
  const projectedBounds = createProjectedBounds(root);
  const preciseBounds = createProjectedBounds(root, { precise: true });

  // Per-layer materials, remembered so layers can be dimmed and restored.
  const layers = CUP_PARTS.map((name) => {
    const materials = new Set();
    parts[name].traverse((object) => {
      if (object.isMesh) materials.add(object.material);
    });
    return {
      name,
      group: parts[name],
      level: 1,
      materials: [...materials].map((material) => ({
        material,
        color: material.color.clone(),
        envMapIntensity: material.envMapIntensity,
      })),
    };
  });

  const state = {
    explode: 0,
    targetExplode: 0,
    active: -1,
    yaw: 0,
    targetYaw: 0,
    landscape: true,
    base: { x: 0, y: 0, z: 0 },
    distance: { assembled: 10, exploded: 20 },
  };
  const drag = { active: false, id: null, lastX: 0 };
  const anchor = new THREE.Vector3();

  /** Picks the composition for the current canvas shape. */
  function layout() {
    const aspect = camera.aspect;
    // Touch layouts retain one horizontal composition down to 320px.
    // Only the desktop two-column scene still adapts to its canvas shape.
    state.landscape = responsiveView.matches || aspect > 1.5;

    let halfWidth;
    let halfHeight;
    if (state.landscape) {
      // Axis runs left to right, cap towards the viewer on the left.
      cup.rotation.set(0, 0, Math.PI / 2);
      root.position.y = 0;
      state.base = { x: 0.2, y: 0.62, z: -0.16 };
      halfWidth = 3.4;
      halfHeight = 2.2;
    } else {
      // Axis runs top to bottom, seen slightly from above.
      // Slightly raised resting composition for the vertical stack.
      cup.rotation.set(0, 0, 0);
      root.position.y = 0.3;
      state.base = { x: 0.52, y: -0.45, z: 0 };
      halfWidth = 1.8;
      halfHeight = 3.8;
    }

    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fit = (width, height) => Math.max(height / tan, width / (tan * aspect));
    state.distance.exploded = fit(halfWidth, halfHeight) * 1.04;
    state.distance.assembled = Math.max(fit(1.45, 1.45) * 1.25, state.distance.exploded * 0.55);
  }

  function applyPose() {
    const eased = THREE.MathUtils.smootherstep(state.explode, 0, 1);
    layers.forEach((layer) => {
      layer.group.position.y = TRAVEL[layer.name] * eased;
    });
    root.rotation.set(state.base.x, state.base.y + state.yaw, state.base.z);
    camera.position.set(0, 0, THREE.MathUtils.lerp(state.distance.assembled, state.distance.exploded, eased));
    camera.lookAt(0, 0, 0);
    // Shift only the exploded composition down by exactly 35 CSS pixels.
    // A camera view offset keeps projected hotspots aligned with every layer.
    if (stage.width && stage.height) {
      const offsetY = -35 * eased * (responsiveView.matches ? Math.min(1, stage.width / 768) : 1);
      camera.setViewOffset(stage.width, stage.height, 0, offsetY, stage.width, stage.height);
      const bounds = projectedBounds(camera);
      const centerX = (bounds.min.x + bounds.max.x) * stage.width / 4;
      // Touch scenes start 16px into the canvas, rather than accumulating
      // a large invisible top margin above the horizontally arranged model.
      const top = (1 - bounds.max.y) * stage.height / 2;
      const framedOffsetY = responsiveView.matches ? offsetY + top - 16 : offsetY;
      camera.setViewOffset(stage.width, stage.height, centerX, framedOffsetY, stage.width, stage.height);
      if (responsiveView.matches) {
        // Trim only empty canvas below the actual mesh. The canvas keeps its
        // render size; the 40px safety frame + 20px text margin form a 60px gap.
        const actual = preciseBounds(camera);
        const modelBottom = (1 - actual.min.y) * stage.height / 2;
        const crop = Math.max(0, stage.height - modelBottom - 40);
        container.style.setProperty('--anatomy-crop-bottom', `${crop.toFixed(2)}px`);
      } else {
        container.style.removeProperty('--anatomy-crop-bottom');
      }
    }
  }

  function applyDimming() {
    layers.forEach((layer) => {
      layer.materials.forEach(({ material, color, envMapIntensity }) => {
        material.color.copy(color).multiplyScalar(layer.level);
        material.envMapIntensity = envMapIntensity * layer.level;
      });
    });
  }

  /** Projects each layer's anchor to the screen and moves its hotspot there. */
  function placeHotspots() {
    if (!hotspots.length) return;
    scene.updateMatrixWorld();
    const visibility = THREE.MathUtils.clamp((state.explode - 0.55) / 0.35, 0, 1);
    layers.forEach((layer, index) => {
      const element = hotspots[index];
      if (!element) return;
      const [radius, axis] = ANCHOR[layer.name];
      anchor.set(radius + 0.24, axis, 0);
      layer.group.localToWorld(anchor);
      anchor.project(camera);
      const x = (anchor.x * 0.5 + 0.5) * stage.width;
      const y = (-anchor.y * 0.5 + 0.5) * stage.height;
      element.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      element.style.opacity = visibility.toFixed(2);
      element.style.pointerEvents = visibility > 0.5 ? 'auto' : 'none';
      element.tabIndex = visibility > 0.5 ? 0 : -1;
      element.setAttribute('aria-hidden', String(visibility <= 0.5));
    });
  }

  function update(dt) {
    let changed = false;
    let poseChanged = false;
    const instant = reducedMotion;

    const explodeDelta = state.targetExplode - state.explode;
    if (Math.abs(explodeDelta) > 0.0005) {
      state.explode += instant ? explodeDelta : explodeDelta * damp(5, dt);
      changed = true;
      poseChanged = true;
    }

    const yawDelta = state.targetYaw - state.yaw;
    if (Math.abs(yawDelta) > 0.0005) {
      state.yaw += instant ? yawDelta : yawDelta * damp(7, dt);
      changed = true;
      poseChanged = true;
    }

    layers.forEach((layer, index) => {
      const target = state.active === -1 || state.active === index ? 1 : DIMMED;
      const delta = target - layer.level;
      if (Math.abs(delta) > 0.003) {
        layer.level += instant ? delta : delta * damp(8, dt);
        changed = true;
      }
    });

    if (changed) {
      if (poseChanged) applyPose();
      applyDimming();
    }
    return changed;
  }

  function render() {
    stage.render();
    placeHotspots();
  }

  // Drag to turn the assembly (vertical swipes still scroll the page).
  function onPointerDown(event) {
    drag.active = true;
    drag.id = event.pointerId;
    drag.lastX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  }

  function onPointerMove(event) {
    if (!drag.active || event.pointerId !== drag.id) return;
    state.targetYaw = THREE.MathUtils.clamp(
      state.targetYaw + (event.clientX - drag.lastX) * 0.006,
      -YAW_LIMIT,
      YAW_LIMIT
    );
    drag.lastX = event.clientX;
  }

  function onPointerUp(event) {
    if (event.pointerId !== drag.id) return;
    drag.active = false;
    canvas.classList.remove('is-dragging');
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  const loop = createLoop({
    target: container,
    update,
    render,
    guard,
    onSlow(level) {
      if (level === 1) {
        stage.pixelRatio = 1;
        stage.resize();
        loop.invalidate();
      } else {
        dispose();
        onFail('slow');
      }
    },
  });

  const resizeObserver = new ResizeObserver(() => {
    if (stage.resize()) {
      layout();
      applyPose();
      loop.invalidate();
    }
  });
  resizeObserver.observe(container);

  function dispose() {
    loop.dispose();
    resizeObserver.disconnect();
    stage.dispose();
  }

  stage.resize();
  layout();
  applyPose();
  render();

  return {
    canvas,
    dispose,

    /** 0 — assembled, 1 — fully exploded. */
    setExplode(value, { immediate = false } = {}) {
      state.targetExplode = THREE.MathUtils.clamp(value, 0, 1);
      if (immediate) {
        state.explode = state.targetExplode;
        applyPose();
        render();
      }
      loop.invalidate();
    },

    /** Highlights one layer (index into CUP_PARTS) or none (-1). */
    setActive(index) {
      state.active = index;
      loop.invalidate();
    },
  };
}

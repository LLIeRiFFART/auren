/**
 * Auren — shared 3D scene kit.
 * Renderer + studio lighting set-up and an on-demand render loop
 * with a simple performance guard.
 */
import * as THREE from '../vendor/three.min.js';

export { THREE };

/** Cached model-only screen bounds (excludes lights, floor and empty canvas). */
export function createProjectedBounds(object, { precise = false } = {}) {
  const meshes = [];
  const point = new THREE.Vector3();
  const bounds = new THREE.Box2();
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    if (precise) {
      meshes.push({ mesh, positions: geometry.getAttribute('position') });
    } else {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox;
      const corners = [];
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
      meshes.push({ mesh, corners });
    }
  });
  return (camera) => {
    object.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    bounds.makeEmpty();
    for (const { mesh, positions, corners } of meshes) {
      if (!mesh.visible) continue;
      if (positions) {
        for (let i = 0; i < positions.count; i += 1) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
          bounds.expandByPoint(point);
        }
      } else {
        for (const corner of corners) {
          point.copy(corner).applyMatrix4(mesh.matrixWorld).project(camera);
          bounds.expandByPoint(point);
        }
      }
    }
    return bounds;
  };
}

/**
 * Creates a transparent WebGL stage inside `container`.
 * Throws if a WebGL context cannot be created.
 */
export function createStage(container, { fov = 28, shadows = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = shadows;

  const scene = new THREE.Scene();

  // Neutral studio reflections, generated once (no HDR download needed).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);

  // Key from upper right, cool rim from behind, soft fill from the left.
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(4, 7, 6);
  const rim = new THREE.DirectionalLight(0xe6ecff, 3.2);
  rim.position.set(-6, 4, -6);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-5, 1, 5);
  scene.add(key, rim, fill);

  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const stage = {
    renderer,
    scene,
    camera,
    canvas,
    lights: { key, rim, fill },
    width: 0,
    height: 0,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),

    /** Syncs renderer and camera with the container size. */
    resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return false;
      stage.width = width;
      stage.height = height;
      renderer.setPixelRatio(stage.pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      return true;
    },

    render() {
      renderer.render(scene, camera);
    },

    dispose() {
      scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      canvas.remove();
    },
  };

  return stage;
}

/**
 * Render loop that only runs while `target` is on screen and only draws
 * when `update()` reports a change (or after `invalidate()`).
 *
 * `onSlow(level)` is called when the average frame time stays too high:
 * level 1 — reduce quality, level 2 — give up and use the static image.
 */
export function createLoop({ target, update, render, onSlow, guard = true }) {
  const WARMUP_FRAMES = 12;
  const SAMPLE_SIZE = 45;
  const SLOW_FRAME_MS = 45;

  let frameId = 0;
  let last = 0;
  let running = false;
  let visible = false;
  let dirty = true;
  let disposed = false;
  let previousFrameRendered = false;
  let warmup = 0;
  let samples = [];
  let slowLevel = 0;

  function measure(ms) {
    if (warmup < WARMUP_FRAMES) {
      warmup += 1;
      return;
    }
    samples.push(ms);
    if (samples.length < SAMPLE_SIZE) return;
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    samples = [];
    if (average > SLOW_FRAME_MS && slowLevel < 2) {
      slowLevel += 1;
      if (onSlow) onSlow(slowLevel);
    }
  }

  function frame(now) {
    if (!running) return;
    frameId = requestAnimationFrame(frame);
    const elapsed = last ? now - last : 16;
    last = now;
    const changed = update(Math.min(elapsed / 1000, 0.05), now / 1000);
    if (changed || dirty) {
      render();
      dirty = false;
      if (guard && previousFrameRendered) measure(elapsed);
      previousFrameRendered = true;
    } else {
      previousFrameRendered = false;
    }
  }

  function sync() {
    const shouldRun = visible && !document.hidden && !disposed;
    if (shouldRun && !running) {
      running = true;
      last = 0;
      previousFrameRendered = false;
      frameId = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frameId);
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      sync();
    },
    { rootMargin: '120px' }
  );
  observer.observe(target);
  document.addEventListener('visibilitychange', sync);

  return {
    invalidate() {
      dirty = true;
    },
    dispose() {
      disposed = true;
      sync();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    },
  };
}

/** Frame-rate independent easing factor. */
export function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

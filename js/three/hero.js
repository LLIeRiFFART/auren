/**
 * Auren — hero scene: Meridian One, reacting gently to the pointer.
 */
import { THREE, createStage, createLoop, createProjectedBounds, damp } from './kit.js';
import { createMaterials, buildHeadphones } from './model.js';

const REST = { yaw: -0.6, pitch: 0.06 };
const HOVER_RANGE = { yaw: 0.26, pitch: 0.09 };
const DRAG_LIMIT = 0.7;

/**
 * @param {HTMLElement} container  Element the canvas is added to.
 * @param {object} options
 * @param {boolean} options.reducedMotion  Disables idle and hover motion.
 * @param {boolean} options.guard          Enables the performance guard.
 * @param {Function} options.onFail        Called if the scene has to be abandoned.
 */
export function createHero(container, { reducedMotion = false, guard = true, onFail = () => {} } = {}) {
  const stage = createStage(container, { fov: 26, shadows: true });
  const { scene, camera, canvas, lights } = stage;

  // Model, centred on its pivot.
  const pivot = new THREE.Group();
  const model = buildHeadphones(createMaterials());
  model.position.y = 0.15;
  pivot.add(model);
  scene.add(pivot);
  const responsiveView = window.matchMedia('(max-width: 1023px)');
  const projectedBounds = createProjectedBounds(pivot, { precise: true });

  // Soft shadow on an otherwise invisible floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.36 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.02;
  floor.receiveShadow = true;
  scene.add(floor);

  lights.key.position.set(2.5, 8, 4.5);
  const shadow = lights.key.shadow;
  lights.key.castShadow = true;
  shadow.mapSize.set(1024, 1024);
  shadow.camera.left = -4.5;
  shadow.camera.right = 4.5;
  shadow.camera.top = 4.5;
  shadow.camera.bottom = -4.5;
  shadow.camera.near = 1;
  shadow.camera.far = 30;
  shadow.bias = -0.0004;
  shadow.normalBias = 0.02;
  shadow.radius = 6;

  function fitCamera() {
    if (!stage.width || !stage.height) return;
    const halfHeight = 2.2;
    const halfWidth = 2.0;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = Math.max(halfHeight / tan, halfWidth / (tan * camera.aspect)) * 1.18;
    camera.clearViewOffset();
    const placeCamera = () => {
      camera.position.set(0, 0.3, distance);
      camera.lookAt(0, -0.05, 0);
    };
    placeCamera();
    if (responsiveView.matches) {
      // Fit actual headphone vertices, not a padded canvas rectangle.
      const rotation = pivot.rotation.clone();
      pivot.rotation.set(REST.pitch, REST.yaw, 0);
      const availableX = 2 * Math.max(1, stage.width - 40) / stage.width;
      const availableY = 2 * Math.max(1, stage.height - 40) / stage.height;
      for (let i = 0; i < 8; i += 1) {
        const bounds = projectedBounds(camera);
        const ratio = Math.max((bounds.max.x - bounds.min.x) / availableX, (bounds.max.y - bounds.min.y) / availableY);
        if (Math.abs(ratio - 1) < 0.001) break;
        distance *= ratio;
        placeCamera();
      }
      const bounds = projectedBounds(camera);
      const centerX = (bounds.min.x + bounds.max.x) * stage.width / 4;
      const top = (1 - bounds.max.y) * stage.height / 2;
      camera.setViewOffset(stage.width, stage.height, centerX, top - 20, stage.width, stage.height);
      pivot.rotation.copy(rotation);
    }
  }

  // Interaction state.
  const hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const idleSway = !reducedMotion && !hoverCapable;
  const pointer = { x: 0, y: 0 };
  const drag = { active: false, id: null, lastX: 0, yaw: 0 };
  const current = { yaw: reducedMotion || responsiveView.matches ? REST.yaw : REST.yaw - 0.4, pitch: REST.pitch };

  function onWindowPointerMove(event) {
    if (event.pointerType !== 'mouse' || drag.active) return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }

  function onPointerDown(event) {
    drag.active = true;
    drag.id = event.pointerId;
    drag.lastX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  }

  function onPointerMove(event) {
    if (!drag.active || event.pointerId !== drag.id) return;
    drag.yaw = THREE.MathUtils.clamp(drag.yaw + (event.clientX - drag.lastX) * 0.006, -DRAG_LIMIT, DRAG_LIMIT);
    drag.lastX = event.clientX;
  }

  function onPointerUp(event) {
    if (event.pointerId !== drag.id) return;
    drag.active = false;
    canvas.classList.remove('is-dragging');
  }

  if (hoverCapable && !reducedMotion) {
    window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function update(dt, time) {
    // After a drag the model eases back to its resting angle.
    if (!drag.active) drag.yaw += (0 - drag.yaw) * damp(1.1, dt);

    let targetYaw = REST.yaw + pointer.x * HOVER_RANGE.yaw + drag.yaw;
    const targetPitch = REST.pitch + pointer.y * HOVER_RANGE.pitch;
    if (idleSway && !drag.active) targetYaw += Math.sin(time * 0.45) * 0.1;

    const ease = damp(3.2, dt);
    const deltaYaw = targetYaw - current.yaw;
    const deltaPitch = targetPitch - current.pitch;
    current.yaw += deltaYaw * ease;
    current.pitch += deltaPitch * ease;
    pivot.rotation.set(current.pitch, current.yaw, 0);

    return idleSway || drag.active || Math.abs(deltaYaw) > 0.0004 || Math.abs(deltaPitch) > 0.0004;
  }

  const loop = createLoop({
    target: container,
    update,
    render: stage.render,
    guard,
    onSlow(level) {
      if (level === 1) {
        // First step: render at a lower resolution.
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
      fitCamera();
      loop.invalidate();
    }
  });
  resizeObserver.observe(container);

  function dispose() {
    loop.dispose();
    resizeObserver.disconnect();
    window.removeEventListener('pointermove', onWindowPointerMove);
    stage.dispose();
  }

  // First frame is drawn synchronously so the canvas can fade in right away.
  stage.resize();
  fitCamera();
  update(0, 0);
  stage.render();

  return { canvas, dispose };
}

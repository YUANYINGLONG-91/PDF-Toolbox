import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const mountMarker = Symbol('scanner-scene-mounted');
type ScannerHost = HTMLElement & { [mountMarker]?: boolean };

const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;

export function mountScannerScene(host: HTMLElement): () => void {
  const sceneHost = host as ScannerHost;
  if (sceneHost[mountMarker]) return () => undefined;
  sceneHost[mountMarker] = true;

  let renderer: THREE.WebGLRenderer | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let disposed = false;
  let contextLost = false;
  let frameId = 0;
  let hasSize = false;
  let inViewport = true;
  let welcomeVisible = true;
  let lastTime = 0;
  let elapsed = 1.25;
  let renderWidth = 0;
  let renderHeight = 0;
  let renderDpr = 0;

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const cleanupTasks: Array<() => void> = [];

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    host.classList.remove('is-webgl-ready');
    delete host.dataset.webgl;
    delete host.dataset.rotation;

    for (const task of cleanupTasks.splice(0)) {
      try { task(); } catch { /* A failed observer must not block disposal. */ }
    }
    for (const geometry of geometries) {
      try { geometry.dispose(); } catch { /* Continue releasing the scene. */ }
    }
    for (const material of materials) {
      try { material.dispose(); } catch { /* Continue releasing the scene. */ }
    }
    for (const texture of textures) {
      try { texture.dispose(); } catch { /* Continue releasing the scene. */ }
    }
    if (renderer) {
      try { renderer.dispose(); } catch { /* The context may already be gone. */ }
    }
    canvas?.remove();
    delete sceneHost[mountMarker];
  };

  try {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.style.userSelect = 'none';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x101315, 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xe9e8e2, 13, 29);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    const target = new THREE.Vector3(0, 0.78, 0.35);
    const defaultYaw = Math.atan2(6, 6.65);
    const defaultPitch = Math.atan2(3.82, Math.hypot(6, 6.65));
    const defaultDistance = Math.hypot(6, 3.82, 6.65);
    let yaw = defaultYaw;
    let pitch = defaultPitch;
    let cameraFit = 1;

    const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T): T => {
      geometries.add(geometry);
      return geometry;
    };
    const trackMaterial = <T extends THREE.Material>(material: T): T => {
      materials.add(material);
      return material;
    };
    const makeMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parent: THREE.Object3D,
      castShadow = true,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const rounded = (width: number, height: number, depth: number, radius = 0.06): RoundedBoxGeometry =>
      trackGeometry(new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, height / 2, depth / 2)));

    const chassisMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x292d30,
      metalness: 0.52,
      roughness: 0.34,
    }));
    const lowerMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x171a1c,
      metalness: 0.42,
      roughness: 0.48,
    }));
    const trimMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x899195,
      metalness: 0.9,
      roughness: 0.23,
    }));
    const darkTrimMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x3d4448,
      metalness: 0.78,
      roughness: 0.3,
    }));
    const rubberMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x090b0c,
      metalness: 0.05,
      roughness: 0.88,
    }));
    const slotMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x050607,
      metalness: 0.1,
      roughness: 0.72,
    }));
    const glassMaterial = trackMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x779095,
      metalness: 0.08,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    }));
    const undersideMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x343a3d,
      metalness: 0.16,
      roughness: 0.62,
    }));

    const scanner = new THREE.Group();
    scene.add(scanner);

    const lowerBase = makeMesh(rounded(4.64, 0.24, 3.36, 0.11), lowerMaterial, scanner);
    lowerBase.position.set(0, 0.29, 0);
    const chassis = makeMesh(rounded(4.8, 0.94, 3.5, 0.15), chassisMaterial, scanner);
    chassis.position.set(0, 0.78, 0);
    const upperDeck = makeMesh(rounded(4.66, 0.2, 3.36, 0.08), darkTrimMaterial, scanner);
    upperDeck.position.set(0, 1.27, -0.01);

    const footGeometry = trackGeometry(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 16));
    for (const x of [-1.86, 1.86]) {
      for (const z of [-1.24, 1.24]) {
        const foot = makeMesh(footGeometry, rubberMaterial, scanner);
        foot.position.set(x, 0.1, z);
      }
    }

    const frontSeam = makeMesh(rounded(4.38, 0.025, 0.026, 0.01), trimMaterial, scanner, false);
    frontSeam.position.set(0, 0.4, 1.754);
    for (const x of [-2.402, 2.402]) {
      const sideSeam = makeMesh(rounded(0.018, 0.025, 3.08, 0.008), darkTrimMaterial, scanner, false);
      sideSeam.position.set(x, 0.4, 0);
    }

    const bed = makeMesh(rounded(4.28, 0.07, 3.02, 0.055), slotMaterial, scanner);
    bed.position.set(0, 1.385, -0.02);
    const glass = makeMesh(rounded(4.1, 0.045, 2.84, 0.045), glassMaterial, scanner, false);
    glass.position.set(0, 1.435, -0.02);
    glass.renderOrder = 1;

    for (const x of [-2.15, 2.15]) {
      const rail = makeMesh(rounded(0.075, 0.055, 3.04, 0.02), trimMaterial, scanner);
      rail.position.set(x, 1.42, -0.02);
    }
    for (const z of [-1.53, 1.49]) {
      const rail = makeMesh(rounded(4.34, 0.055, 0.075, 0.02), trimMaterial, scanner);
      rail.position.set(0, 1.42, z);
    }

    const lid = new THREE.Group();
    lid.position.set(0, 1.45, -1.57);
    lid.rotation.x = -0.135;
    scanner.add(lid);
    const lidShell = makeMesh(rounded(4.68, 0.2, 3.26, 0.12), chassisMaterial, lid);
    lidShell.position.set(0, 0.12, 1.52);
    const lidUnderside = makeMesh(rounded(4.3, 0.04, 2.9, 0.04), undersideMaterial, lid);
    lidUnderside.position.set(0, 0.005, 1.52);
    const lidInset = makeMesh(rounded(3.98, 0.018, 2.58, 0.035), lowerMaterial, lid, false);
    lidInset.position.set(0, -0.024, 1.52);

    const hingeGeometry = trackGeometry(new THREE.CylinderGeometry(0.115, 0.115, 4.12, 20));
    const hinge = makeMesh(hingeGeometry, darkTrimMaterial, scanner);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 1.46, -1.61);
    const hingeCapGeometry = trackGeometry(new THREE.CylinderGeometry(0.145, 0.145, 0.16, 20));
    for (const x of [-2.13, 2.13]) {
      const cap = makeMesh(hingeCapGeometry, trimMaterial, scanner);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(x, 1.46, -1.61);
    }

    const outputSlot = makeMesh(rounded(3.62, 0.29, 0.065, 0.055), slotMaterial, scanner, false);
    outputSlot.position.set(-0.25, 0.88, 1.758);
    const slotLip = makeMesh(rounded(3.55, 0.065, 0.16, 0.025), darkTrimMaterial, scanner);
    slotLip.position.set(-0.25, 0.72, 1.8);
    const outputTray = makeMesh(rounded(3.68, 0.075, 0.92, 0.04), lowerMaterial, scanner);
    outputTray.position.set(-0.25, 0.45, 2.04);
    outputTray.rotation.x = -0.055;
    const trayEdge = makeMesh(rounded(3.52, 0.07, 0.055, 0.02), darkTrimMaterial, scanner);
    trayEdge.position.set(-0.25, 0.48, 2.49);

    const rollerGeometry = trackGeometry(new THREE.CylinderGeometry(0.085, 0.085, 0.42, 14));
    for (let index = 0; index < 7; index += 1) {
      const roller = makeMesh(rollerGeometry, rubberMaterial, scanner);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(-1.54 + index * 0.43, 0.91, 1.81);
    }

    const buttonGeometry = trackGeometry(new THREE.CylinderGeometry(0.125, 0.125, 0.075, 24));
    const powerButton = makeMesh(buttonGeometry, darkTrimMaterial, scanner);
    powerButton.rotation.x = Math.PI / 2;
    powerButton.position.set(1.91, 0.84, 1.79);
    const powerRing = makeMesh(trackGeometry(new THREE.TorusGeometry(0.068, 0.008, 6, 24)), trimMaterial, scanner, false);
    powerRing.position.set(1.91, 0.84, 1.833);
    const powerStroke = makeMesh(rounded(0.014, 0.062, 0.012, 0.005), trimMaterial, scanner, false);
    powerStroke.position.set(1.91, 0.906, 1.837);

    const smallButton = makeMesh(trackGeometry(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 20)), lowerMaterial, scanner);
    smallButton.rotation.x = Math.PI / 2;
    smallButton.position.set(1.91, 0.55, 1.78);
    const statusMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xb8ef62,
      emissive: 0x91d63e,
      emissiveIntensity: 1.25,
      metalness: 0.05,
      roughness: 0.28,
    }));
    const statusLight = makeMesh(trackGeometry(new THREE.SphereGeometry(0.036, 16, 10)), statusMaterial, scanner, false);
    statusLight.position.set(1.91, 1.12, 1.765);

    for (let index = 0; index < 5; index += 1) {
      const vent = makeMesh(rounded(0.018, 0.035, 0.64, 0.008), slotMaterial, scanner, false);
      vent.position.set(2.405, 0.54 + index * 0.09, -0.58);
    }

    const screwGeometry = trackGeometry(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 12));
    for (const x of [-2.15, 2.15]) {
      for (const z of [-1.46, 1.43]) {
        const screw = makeMesh(screwGeometry, trimMaterial, scanner, false);
        screw.position.set(x, 1.458, z);
      }
    }

    const printCanvas = document.createElement('canvas');
    printCanvas.width = 640;
    printCanvas.height = 880;
    const printContext = printCanvas.getContext('2d');
    if (!printContext) throw new Error('Canvas textures are unavailable');
    printContext.fillStyle = '#f4f0e6';
    printContext.fillRect(0, 0, 640, 880);
    printContext.fillStyle = '#263238';
    printContext.font = '700 31px Arial, sans-serif';
    printContext.fillText('PDF TOOLBOX', 62, 82);
    printContext.fillStyle = '#758078';
    printContext.font = '15px Arial, sans-serif';
    printContext.fillText('DOCUMENT / SCAN 01', 64, 111);
    printContext.fillStyle = '#a6c86a';
    printContext.fillRect(62, 135, 516, 5);
    printContext.fillStyle = '#4b5352';
    printContext.font = '600 20px Arial, sans-serif';
    printContext.fillText('A clearer digital original.', 62, 190);
    const lineWidths = [500, 476, 507, 423, 494, 452];
    lineWidths.forEach((width, index) => {
      printContext.fillStyle = index % 2 ? '#c6c7bf' : '#afb4ae';
      printContext.fillRect(62, 225 + index * 23, width, 6);
    });
    printContext.strokeStyle = '#8d9690';
    printContext.lineWidth = 3;
    printContext.strokeRect(62, 405, 240, 177);
    printContext.strokeStyle = '#b3bdB5';
    printContext.lineWidth = 2;
    printContext.beginPath();
    printContext.moveTo(84, 544);
    printContext.lineTo(137, 483);
    printContext.lineTo(183, 514);
    printContext.lineTo(274, 435);
    printContext.stroke();
    printContext.fillStyle = '#a6c86a';
    printContext.beginPath();
    printContext.arc(274, 435, 7, 0, Math.PI * 2);
    printContext.fill();
    printContext.fillStyle = '#3f4847';
    printContext.font = '600 17px Arial, sans-serif';
    printContext.fillText('SCAN NOTES', 340, 420);
    for (let index = 0; index < 6; index += 1) {
      printContext.fillStyle = index === 0 ? '#98a199' : '#c2c5bd';
      printContext.fillRect(340, 447 + index * 23, index === 5 ? 135 : 220 - (index % 3) * 24, 6);
    }
    printContext.fillStyle = '#aeb4ac';
    for (let index = 0; index < 5; index += 1) {
      printContext.fillRect(62, 640 + index * 25, 506 - (index % 2) * 62, 6);
    }
    printContext.fillStyle = '#7b857e';
    printContext.font = '13px Arial, sans-serif';
    printContext.fillText('CAPTURE  •  CLEAN  •  EXPORT', 62, 820);

    const paperTexture = new THREE.CanvasTexture(printCanvas);
    textures.add(paperTexture);
    paperTexture.colorSpace = THREE.SRGBColorSpace;
    paperTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const paperMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xfffdf5,
      map: paperTexture,
      metalness: 0,
      roughness: 0.86,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    }));

    const createPaperGeometry = (): THREE.BufferGeometry => {
      const widthSegments = 6;
      const lengthSegments = 28;
      const width = 2.78;
      const length = 3.05;
      const thickness = 0.014;
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const stride = widthSegments + 1;

      for (let row = 0; row <= lengthSegments; row += 1) {
        const t = row / lengthSegments;
        for (let column = 0; column <= widthSegments; column += 1) {
          const u = column / widthSegments;
          const x = (u - 0.5) * width;
          const edgeCurl = 0.018 * Math.pow(Math.abs(u - 0.5) * 2, 3) * Math.sin(t * Math.PI);
          const y = 0.025 * Math.sin(t * Math.PI * 1.4) - 0.19 * t * t * t + edgeCurl;
          const z = t * length;
          positions.push(x, y + thickness / 2, z, x, y - thickness / 2, z);
          uvs.push(u, 1 - t, u, 1 - t);
        }
      }

      const vertex = (row: number, column: number, bottom = false): number =>
        (row * stride + column) * 2 + (bottom ? 1 : 0);
      for (let row = 0; row < lengthSegments; row += 1) {
        for (let column = 0; column < widthSegments; column += 1) {
          const a = vertex(row, column);
          const b = vertex(row, column + 1);
          const c = vertex(row + 1, column);
          const d = vertex(row + 1, column + 1);
          indices.push(a, c, b, b, c, d);
          indices.push(a + 1, b + 1, c + 1, b + 1, d + 1, c + 1);
        }
      }
      for (let row = 0; row < lengthSegments; row += 1) {
        const left = vertex(row, 0);
        const nextLeft = vertex(row + 1, 0);
        const right = vertex(row, widthSegments);
        const nextRight = vertex(row + 1, widthSegments);
        indices.push(left, left + 1, nextLeft, left + 1, nextLeft + 1, nextLeft);
        indices.push(right, nextRight, right + 1, right + 1, nextRight, nextRight + 1);
      }
      for (let column = 0; column < widthSegments; column += 1) {
        const back = vertex(0, column);
        const nextBack = vertex(0, column + 1);
        const front = vertex(lengthSegments, column);
        const nextFront = vertex(lengthSegments, column + 1);
        indices.push(back, nextBack, back + 1, nextBack, nextBack + 1, back + 1);
        indices.push(front, front + 1, nextFront, front + 1, nextFront + 1, nextFront);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return trackGeometry(geometry);
    };

    const paper = makeMesh(createPaperGeometry(), paperMaterial, scanner);
    paper.position.set(-0.25, 0.845, -0.4);

    const groundMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xe9e8e2,
      roughness: 0.96,
    }));
    const ground = makeMesh(trackGeometry(new THREE.PlaneGeometry(50, 50)), groundMaterial, scene, false);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.005;

    const hemisphere = new THREE.HemisphereLight(0xfff1d8, 0x253039, 1.65);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xffdfb5, 3.4);
    keyLight.position.set(-3.8, 7.5, 5.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.00025;
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.radius = 3;
    scene.add(keyLight);
    cleanupTasks.push(() => keyLight.shadow.dispose());
    const fillLight = new THREE.DirectionalLight(0xc9ddf2, 1.25);
    fillLight.position.set(5, 3.8, -3.5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffedD5, 0.8);
    rimLight.position.set(-4, 3, -5);
    scene.add(rimLight);

    const continuousMotion = (): boolean =>
      finePointer.matches && !coarsePointer.matches && !reducedMotion.matches && window.innerWidth >= 700;
    const canRender = (): boolean =>
      !disposed && !contextLost && hasSize && inViewport && welcomeVisible && !document.hidden;

    const updateCamera = (autoYaw = 0): void => {
      const orbitYaw = yaw + autoYaw;
      const distance = defaultDistance * cameraFit;
      const horizontal = Math.cos(pitch) * distance;
      camera.position.set(
        target.x + Math.sin(orbitYaw) * horizontal,
        target.y + Math.sin(pitch) * distance,
        target.z + Math.cos(orbitYaw) * horizontal,
      );
      camera.lookAt(target);
    };

    const renderFrame = (): boolean => {
      if (!renderer || disposed || contextLost) return false;
      try {
        renderer.render(scene, camera);
        if (!disposed && !contextLost && !host.classList.contains('is-webgl-ready')) {
          host.classList.add('is-webgl-ready');
          host.dataset.webgl = 'ready';
        }
        return true;
      } catch {
        cleanup();
        host.dataset.webgl = 'fallback';
        return false;
      }
    };

    const scheduleFrame = (): void => {
      if (!frameId && canRender()) frameId = requestAnimationFrame(onFrame);
    };

    const onFrame = (time: number): void => {
      frameId = 0;
      if (!canRender()) {
        lastTime = 0;
        return;
      }
      const animated = continuousMotion();
      if (animated) {
        const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
        elapsed += delta;
        const cycle = (elapsed % 8) / 8;
        const feed = smoothstep(cycle, 0.04, 0.86);
        paper.position.z = -1.15 + feed * 1.5;
        paperMaterial.opacity = smoothstep(cycle, 0, 0.045) * (1 - smoothstep(cycle, 0.91, 1));
        updateCamera(Math.sin(elapsed * 0.22) * 0.045);
      } else {
        paper.position.z = -0.4;
        paperMaterial.opacity = 1;
        updateCamera();
      }
      lastTime = time;
      if (renderFrame() && animated) scheduleFrame();
    };

    const updateActivity = (): void => {
      if (!canRender()) {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        lastTime = 0;
        return;
      }
      scheduleFrame();
    };

    const resize = (): void => {
      if (!renderer || disposed) return;
      const bounds = host.getBoundingClientRect();
      const width = Math.max(0, bounds.width);
      const height = Math.max(0, bounds.height);
      hasSize = width > 1 && height > 1;
      if (!hasSize) {
        updateActivity();
        return;
      }
      const mobile = coarsePointer.matches || window.innerWidth < 700;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
      try {
        if (dpr !== renderDpr) {
          renderer.setPixelRatio(dpr);
          renderDpr = dpr;
        }
        if (Math.round(width) !== renderWidth || Math.round(height) !== renderHeight) {
          renderer.setSize(width, height, false);
          renderWidth = Math.round(width);
          renderHeight = Math.round(height);
        }
        camera.aspect = width / height;
        cameraFit = camera.aspect < 1.15 ? 1.15 / camera.aspect : 1;
        camera.updateProjectionMatrix();
        updateCamera();
      } catch {
        cleanup();
        host.dataset.webgl = 'fallback';
        return;
      }
      updateActivity();
    };

    let activePointer: number | null = null;
    let activePointerType = '';
    let startX = 0;
    let startY = 0;
    let previousX = 0;
    let previousY = 0;
    let horizontalDrag = false;

    const endPointer = (event: PointerEvent): void => {
      if (activePointer !== event.pointerId || !canvas) return;
      if (canvas.hasPointerCapture(event.pointerId)) {
        try { canvas.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
      }
      activePointer = null;
      horizontalDrag = false;
      canvas.style.cursor = 'grab';
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (!canvas || activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      activePointer = event.pointerId;
      activePointerType = event.pointerType;
      startX = previousX = event.clientX;
      startY = previousY = event.clientY;
      horizontalDrag = event.pointerType === 'mouse';
      if (horizontalDrag) {
        try { canvas.setPointerCapture(event.pointerId); } catch { activePointer = null; return; }
        canvas.style.cursor = 'grabbing';
        event.preventDefault();
      }
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!canvas || activePointer !== event.pointerId) return;
      if (!horizontalDrag && activePointerType !== 'mouse') {
        const totalX = event.clientX - startX;
        const totalY = event.clientY - startY;
        if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 6) return;
        if (Math.abs(totalY) >= Math.abs(totalX)) {
          activePointer = null;
          return;
        }
        horizontalDrag = true;
        try { canvas.setPointerCapture(event.pointerId); } catch { activePointer = null; return; }
        canvas.style.cursor = 'grabbing';
      }
      if (!horizontalDrag) return;
      event.preventDefault();
      yaw = clamp(yaw + (event.clientX - previousX) * 0.005, defaultYaw - 0.8, defaultYaw + 0.8);
      pitch = clamp(pitch + (event.clientY - previousY) * 0.004, 0.18, 0.7);
      previousX = event.clientX;
      previousY = event.clientY;
      updateCamera();
      host.dataset.rotation = `${THREE.MathUtils.radToDeg(yaw).toFixed(2)},${THREE.MathUtils.radToDeg(pitch).toFixed(2)}`;
      scheduleFrame();
    };
    const cancelPointer = (event: PointerEvent): void => {
      if (activePointer === event.pointerId) {
        activePointer = null;
        horizontalDrag = false;
        if (canvas) canvas.style.cursor = 'grab';
      }
    };
    const onContextLost = (event: Event): void => {
      event.preventDefault();
      contextLost = true;
      host.classList.remove('is-webgl-ready');
      host.dataset.webgl = 'lost';
      updateActivity();
    };
    const onContextRestored = (): void => {
      if (disposed) return;
      contextLost = false;
      lastTime = 0;
      updateActivity();
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', cancelPointer);
    canvas.addEventListener('lostpointercapture', cancelPointer);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    cleanupTasks.push(() => {
      canvas?.removeEventListener('pointerdown', onPointerDown);
      canvas?.removeEventListener('pointermove', onPointerMove);
      canvas?.removeEventListener('pointerup', endPointer);
      canvas?.removeEventListener('pointercancel', cancelPointer);
      canvas?.removeEventListener('lostpointercapture', cancelPointer);
      canvas?.removeEventListener('webglcontextlost', onContextLost);
      canvas?.removeEventListener('webglcontextrestored', onContextRestored);
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    cleanupTasks.push(() => resizeObserver.disconnect());
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      inViewport = entry.isIntersecting && entry.intersectionRatio > 0;
      updateActivity();
    }, { threshold: 0 });
    intersectionObserver.observe(host);
    cleanupTasks.push(() => intersectionObserver.disconnect());

    const welcome = document.getElementById('welcome');
    if (welcome) {
      welcomeVisible = !welcome.hidden;
      const welcomeObserver = new MutationObserver(() => {
        welcomeVisible = !welcome.hidden;
        updateActivity();
      });
      welcomeObserver.observe(welcome, { attributes: true, attributeFilter: ['hidden'] });
      cleanupTasks.push(() => welcomeObserver.disconnect());
    }

    const onVisibilityChange = (): void => updateActivity();
    document.addEventListener('visibilitychange', onVisibilityChange);
    cleanupTasks.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
    const onMotionChange = (): void => {
      lastTime = 0;
      resize();
    };
    reducedMotion.addEventListener('change', onMotionChange);
    finePointer.addEventListener('change', onMotionChange);
    coarsePointer.addEventListener('change', onMotionChange);
    cleanupTasks.push(() => {
      reducedMotion.removeEventListener('change', onMotionChange);
      finePointer.removeEventListener('change', onMotionChange);
      coarsePointer.removeEventListener('change', onMotionChange);
    });

    host.appendChild(canvas);
    updateCamera();
    resize();
    return cleanup;
  } catch {
    cleanup();
    host.dataset.webgl = 'fallback';
    return () => undefined;
  }
}

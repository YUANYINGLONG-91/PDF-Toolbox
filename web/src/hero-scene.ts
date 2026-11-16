import * as THREE from 'three';

export type SceneMode = 'fan' | 'crop' | 'enhanced';

export interface DocumentSceneHandle {
  destroy(): void;
  selectPage(index: number): void;
  toggleFan(): void;
  setMode(mode: SceneMode): void;
  reset(): void;
}

const mountMarker = Symbol('document-scene-mounted');
type DocumentHost = HTMLElement & { [mountMarker]?: boolean };

type Pose = {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
};

type Transition = {
  kind: 'layout' | 'enhanced';
  start: number;
  duration: number;
  from: Pose[];
  to: Pose[];
  cleanFrom: number;
  cleanTo: number;
  outputFrom: number;
  outputTo: number;
};

const clamp = THREE.MathUtils.clamp;
const PAGE_COUNT = 5;
const PAGE_WIDTH = 2.68;
const PAGE_LENGTH = 3.55;
const PAGE_THICKNESS = 0.022;

export function mountDocumentScene(host: HTMLElement): DocumentSceneHandle {
  const sceneHost = host as DocumentHost;
  if (sceneHost[mountMarker]) {
    return {
      destroy: () => undefined,
      selectPage: () => undefined,
      toggleFan: () => undefined,
      setMode: () => undefined,
      reset: () => undefined,
    };
  }
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
  let renderWidth = 0;
  let renderHeight = 0;
  let renderDpr = 0;

  let selectedPage = 0;
  let fanOpen = true;
  let mode: SceneMode = 'fan';
  let transition: Transition | null = null;
  let cleanAmount = 0;
  let outputAmount = 0;

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const cleanupTasks: Array<() => void> = [];

  const syncDataset = (): void => {
    host.dataset.rotation = '0.00';
    host.dataset.sceneState = mode;
    host.dataset.selectedPage = String(selectedPage + 1);
    host.dataset.fan = fanOpen ? 'open' : 'closed';
    host.dataset.sceneTransition = transition?.kind === 'enhanced' ? 'enhancing' : 'idle';
  };

  const fallbackHandle = (): DocumentSceneHandle => ({
    destroy: () => undefined,
    selectPage: (index: number) => {
      if (disposed || !Number.isInteger(index)) return;
      selectedPage = clamp(index, 0, PAGE_COUNT - 1);
      host.dataset.selectedPage = String(selectedPage + 1);
    },
    toggleFan: () => {
      if (disposed) return;
      fanOpen = !fanOpen;
      host.dataset.fan = fanOpen ? 'open' : 'closed';
    },
    setMode: (nextMode: SceneMode) => {
      if (disposed) return;
      mode = nextMode;
      host.dataset.sceneState = nextMode;
    },
    reset: () => {
      if (disposed) return;
      selectedPage = 0;
      fanOpen = true;
      mode = 'fan';
      syncDataset();
    },
  });

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    transition = null;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    host.classList.remove('is-webgl-ready');
    for (const key of ['webgl', 'rotation', 'sceneState', 'selectedPage', 'fan', 'sceneTransition']) {
      delete host.dataset[key];
    }

    for (const task of cleanupTasks.splice(0)) {
      try { task(); } catch { /* One failed observer must not block disposal. */ }
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
    renderer = undefined;
    canvas = undefined;
    delete sceneHost[mountMarker];
  };

  syncDataset();

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
    canvas.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x101416, 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x111719, 16, 32);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    const target = new THREE.Vector3(0, 0.5, 0.18);
    const defaultYaw = 0.58;
    const defaultPitch = 0.68;
    let yaw = defaultYaw;
    let pitch = defaultPitch;
    let orbitYaw = defaultYaw;
    let orbitPitch = defaultPitch;
    let cameraDistance = 11.8;
    let fittedDistance = cameraDistance;

    const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T): T => {
      geometries.add(geometry);
      return geometry;
    };
    const trackMaterial = <T extends THREE.Material>(material: T): T => {
      materials.add(material);
      return material;
    };
    const trackTexture = <T extends THREE.Texture>(texture: T): T => {
      textures.add(texture);
      return texture;
    };
    const makeMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material | THREE.Material[],
      parent: THREE.Object3D,
      castShadow = true,
      receiveShadow = true,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
      return mesh;
    };

    const paperBase = (context: CanvasRenderingContext2D, clean: boolean): void => {
      context.fillStyle = clean ? '#ffffff' : '#edf1f2';
      context.fillRect(0, 0, 768, 1024);
      if (!clean) {
        const shade = context.createLinearGradient(0, 0, 768, 1024);
        shade.addColorStop(0, 'rgba(255,255,255,0.32)');
        shade.addColorStop(0.55, 'rgba(213,222,225,0.03)');
        shade.addColorStop(1, 'rgba(174,187,192,0.13)');
        context.fillStyle = shade;
        context.fillRect(0, 0, 768, 1024);
      }
    };

    const drawDocument = (index: number, clean: boolean): HTMLCanvasElement => {
      const printCanvas = document.createElement('canvas');
      printCanvas.width = 768;
      printCanvas.height = 1024;
      const context = printCanvas.getContext('2d');
      if (!context) throw new Error('Canvas textures are unavailable');
      paperBase(context, clean);

      const ink = clean ? '#10171a' : '#263238';
      const secondary = clean ? '#465156' : '#657278';
      const faint = clean ? '#a4adb0' : '#b6bfc2';
      const rule = clean ? '#c3c9cb' : '#ccd3d5';
      const teal = clean ? '#086f70' : '#287e80';
      const titles = ['Document intelligence', 'A clearer original', 'Project summary', 'Visual report', 'Notes & next steps'];
      const labels = ['PDF TOOLBOX / WORKSPACE', 'SCAN NOTES / ORIGINAL', 'QUARTERLY REVIEW / 04', 'RESEARCH BRIEF / 08', 'ACTION PLAN / FINAL'];

      context.fillStyle = teal;
      context.fillRect(58, 54, 9, 46);
      context.fillStyle = ink;
      context.font = '700 25px Arial, Helvetica, sans-serif';
      context.fillText('PDF TOOLBOX', 84, 78);
      context.fillStyle = secondary;
      context.font = '600 13px Arial, Helvetica, sans-serif';
      context.fillText(labels[index], 84, 101);
      context.textAlign = 'right';
      context.font = '600 14px Arial, Helvetica, sans-serif';
      context.fillText(`0${index + 1} / 05`, 708, 80);
      context.textAlign = 'left';
      context.fillStyle = rule;
      context.fillRect(58, 128, 652, 2);

      context.fillStyle = ink;
      context.font = '700 43px Arial, Helvetica, sans-serif';
      context.fillText(titles[index], 58, 199);
      context.fillStyle = secondary;
      context.font = '18px Arial, Helvetica, sans-serif';
      context.fillText('Capture, refine and organize every detail.', 60, 237);

      const paragraphWidths = [646, 615, 652, 575, 638, 602, 510];
      paragraphWidths.forEach((width, line) => {
        context.fillStyle = line % 3 === 0 ? secondary : faint;
        context.fillRect(60, 278 + line * 23, width, line % 3 === 0 ? 5 : 6);
      });

      if (index === 0 || index === 3) {
        context.fillStyle = rule;
        context.fillRect(58, 480, 650, 2);
        context.fillStyle = ink;
        context.font = '700 21px Arial, Helvetica, sans-serif';
        context.fillText(index === 0 ? 'DOCUMENT OVERVIEW' : 'WEEKLY ACTIVITY', 60, 523);
        context.strokeStyle = rule;
        context.lineWidth = 2;
        context.strokeRect(60, 552, 394, 245);
        for (let grid = 1; grid < 4; grid += 1) {
          context.fillStyle = '#e0e4e5';
          context.fillRect(77, 552 + grid * 55, 360, 1);
        }
        const values = index === 0 ? [72, 119, 94, 156, 135, 185] : [48, 83, 128, 102, 169, 193];
        values.forEach((value, bar) => {
          context.fillStyle = bar === values.length - 1 ? teal : (clean ? '#657176' : '#91a0a5');
          context.fillRect(84 + bar * 56, 772 - value, 30, value);
        });
        context.fillStyle = teal;
        context.fillRect(492, 552, 216, 9);
        context.fillStyle = ink;
        context.font = '700 37px Arial, Helvetica, sans-serif';
        context.fillText(index === 0 ? '98.4%' : '+24%', 492, 615);
        context.fillStyle = secondary;
        context.font = '15px Arial, Helvetica, sans-serif';
        context.fillText(index === 0 ? 'TEXT CONFIDENCE' : 'PAGES PROCESSED', 492, 643);
        for (let line = 0; line < 5; line += 1) {
          context.fillStyle = line === 0 ? secondary : faint;
          context.fillRect(492, 682 + line * 23, 205 - (line % 3) * 30, 6);
        }
      } else if (index === 1) {
        context.fillStyle = ink;
        context.font = '700 21px Arial, Helvetica, sans-serif';
        context.fillText('CAPTURE CHECKLIST', 60, 510);
        const checks = ['Align the document edges', 'Preserve the original detail', 'Remove visual distractions', 'Export a clean digital copy'];
        checks.forEach((label, item) => {
          const y = 560 + item * 65;
          context.strokeStyle = item < 3 ? teal : faint;
          context.lineWidth = 3;
          context.strokeRect(62, y - 19, 24, 24);
          if (item < 3) {
            context.beginPath();
            context.moveTo(67, y - 7);
            context.lineTo(74, y);
            context.lineTo(85, y - 14);
            context.stroke();
          }
          context.fillStyle = ink;
          context.font = '19px Arial, Helvetica, sans-serif';
          context.fillText(label, 108, y);
          context.fillStyle = rule;
          context.fillRect(108, y + 17, 550 - item * 35, 2);
        });
      } else if (index === 2) {
        context.fillStyle = ink;
        context.font = '700 21px Arial, Helvetica, sans-serif';
        context.fillText('PROJECT MILESTONES', 60, 510);
        for (let row = 0; row < 4; row += 1) {
          const y = 550 + row * 65;
          context.fillStyle = row === 0 ? teal : (clean ? '#e1e5e6' : '#d5dcde');
          context.fillRect(60, y, 648, 48);
          context.fillStyle = row === 0 ? '#ffffff' : ink;
          context.font = '600 16px Arial, Helvetica, sans-serif';
          context.fillText(['01   Source captured', '02   Pages organized', '03   Details enhanced', '04   Ready to share'][row], 78, y + 30);
          context.textAlign = 'right';
          context.fillText(row < 3 ? 'COMPLETE' : 'READY', 686, y + 30);
          context.textAlign = 'left';
        }
      } else {
        context.fillStyle = ink;
        context.font = '700 21px Arial, Helvetica, sans-serif';
        context.fillText('NEXT ACTIONS', 60, 510);
        for (let item = 0; item < 5; item += 1) {
          const y = 559 + item * 51;
          context.fillStyle = teal;
          context.font = '700 16px Arial, Helvetica, sans-serif';
          context.fillText(`0${item + 1}`, 60, y);
          context.fillStyle = secondary;
          context.fillRect(108, y - 13, 560 - (item % 3) * 65, 7);
          context.fillStyle = rule;
          context.fillRect(108, y + 7, 480 - (item % 2) * 90, 4);
        }
      }

      context.fillStyle = rule;
      context.fillRect(58, 864, 650, 2);
      context.fillStyle = secondary;
      context.font = '600 13px Arial, Helvetica, sans-serif';
      context.fillText('CAPTURE  /  CLEAN  /  ORGANIZE  /  EXPORT', 60, 905);
      context.fillStyle = faint;
      context.font = '13px Arial, Helvetica, sans-serif';
      context.fillText('A considered workspace for your documents.', 60, 936);
      context.fillStyle = teal;
      context.fillRect(60, 970, 64, 5);
      context.fillStyle = faint;
      context.fillRect(135, 970, 573, 2);
      return printCanvas;
    };

    const createTexture = (index: number, clean: boolean): THREE.CanvasTexture => {
      const texture = trackTexture(new THREE.CanvasTexture(drawDocument(index, clean)));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 1);
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    };

    const paperHeight = (u: number, t: number): number => {
      const longCurl = 0.07 * Math.sin(t * Math.PI) + 0.045 * t * t;
      const sideCurl = 0.036 * Math.pow(Math.abs(u - 0.5) * 2, 3) * Math.sin(t * Math.PI);
      return longCurl + sideCurl;
    };

    const createPaperGeometry = (topOnly = false): THREE.BufferGeometry => {
      const widthSegments = 10;
      const lengthSegments = 28;
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const stride = widthSegments + 1;

      for (let row = 0; row <= lengthSegments; row += 1) {
        const t = row / lengthSegments;
        for (let column = 0; column <= widthSegments; column += 1) {
          const u = column / widthSegments;
          const x = (u - 0.5) * PAGE_WIDTH;
          const y = paperHeight(u, t);
          const z = (t - 0.5) * PAGE_LENGTH;
          if (topOnly) {
            positions.push(x, y + PAGE_THICKNESS / 2 + 0.0015, z);
            uvs.push(u, 1 - t);
          } else {
            positions.push(x, y + PAGE_THICKNESS / 2, z, x, y - PAGE_THICKNESS / 2, z);
            uvs.push(u, 1 - t, u, 1 - t);
          }
        }
      }

      const vertex = (row: number, column: number, bottom = false): number =>
        (row * stride + column) * (topOnly ? 1 : 2) + (bottom ? 1 : 0);
      const topStart = indices.length;
      for (let row = 0; row < lengthSegments; row += 1) {
        for (let column = 0; column < widthSegments; column += 1) {
          const a = vertex(row, column);
          const b = vertex(row, column + 1);
          const c = vertex(row + 1, column);
          const d = vertex(row + 1, column + 1);
          indices.push(a, c, b, b, c, d);
        }
      }
      if (topOnly) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return trackGeometry(geometry);
      }

      const bottomStart = indices.length;
      for (let row = 0; row < lengthSegments; row += 1) {
        for (let column = 0; column < widthSegments; column += 1) {
          const a = vertex(row, column, true);
          const b = vertex(row, column + 1, true);
          const c = vertex(row + 1, column, true);
          const d = vertex(row + 1, column + 1, true);
          indices.push(a, b, c, b, d, c);
        }
      }
      const edgeStart = indices.length;
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
      geometry.addGroup(topStart, bottomStart - topStart, 0);
      geometry.addGroup(bottomStart, edgeStart - bottomStart, 1);
      geometry.addGroup(edgeStart, indices.length - edgeStart, 2);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return trackGeometry(geometry);
    };

    const paperGeometry = createPaperGeometry();
    const cleanGeometry = createPaperGeometry(true);
    const backMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xd9dfe0,
      roughness: 0.94,
      metalness: 0,
    }));
    const edgeMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xf0f3f2,
      roughness: 0.88,
      metalness: 0,
    }));

    const pages: THREE.Group[] = [];
    const pickMeshes: THREE.Mesh[] = [];
    const cleanMaterials: THREE.MeshStandardMaterial[] = [];
    for (let index = 0; index < PAGE_COUNT; index += 1) {
      const group = new THREE.Group();
      group.name = `document-page-${index + 1}`;
      scene.add(group);
      const sourceMaterial = trackMaterial(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: createTexture(index, false),
        roughness: 0.91,
        metalness: 0,
      }));
      const paper = makeMesh(paperGeometry, [sourceMaterial, backMaterial, edgeMaterial], group);
      paper.userData.pageIndex = index;
      pickMeshes.push(paper);
      const cleanMaterial = trackMaterial(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: createTexture(index, true),
        roughness: 0.78,
        metalness: 0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }));
      const cleanSurface = makeMesh(cleanGeometry, cleanMaterial, group, false, true);
      cleanSurface.renderOrder = 2 + index;
      cleanMaterials.push(cleanMaterial);
      pages.push(group);
    }

    const bracketMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x45aaa5,
      roughness: 0.7,
      metalness: 0.08,
      transparent: true,
      opacity: 1,
    }));
    const outlineMaterial = trackMaterial(new THREE.LineBasicMaterial({
      color: 0x63bcb5,
      transparent: true,
      opacity: 0.8,
    }));
    const cropRig = new THREE.Group();
    cropRig.name = 'crop-guides';
    scene.add(cropRig);
    const outlineGeometry = trackGeometry(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-PAGE_WIDTH / 2 - 0.08, 0, -PAGE_LENGTH / 2 - 0.08),
      new THREE.Vector3(PAGE_WIDTH / 2 + 0.08, 0, -PAGE_LENGTH / 2 - 0.08),
      new THREE.Vector3(PAGE_WIDTH / 2 + 0.08, 0, PAGE_LENGTH / 2 + 0.08),
      new THREE.Vector3(-PAGE_WIDTH / 2 - 0.08, 0, PAGE_LENGTH / 2 + 0.08),
    ]));
    const cropOutline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
    cropRig.add(cropOutline);
    const horizontalBracket = trackGeometry(new THREE.BoxGeometry(0.4, 0.034, 0.045));
    const verticalBracket = trackGeometry(new THREE.BoxGeometry(0.045, 0.034, 0.4));
    for (const xSign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const horizontal = makeMesh(horizontalBracket, bracketMaterial, cropRig, false, false);
        horizontal.position.set(xSign * (PAGE_WIDTH / 2 + 0.08 - 0.18), 0.018, zSign * (PAGE_LENGTH / 2 + 0.08));
        const vertical = makeMesh(verticalBracket, bracketMaterial, cropRig, false, false);
        vertical.position.set(xSign * (PAGE_WIDTH / 2 + 0.08), 0.018, zSign * (PAGE_LENGTH / 2 + 0.08 - 0.18));
      }
    }

    const outputGroup = new THREE.Group();
    outputGroup.name = 'pdf-output-page';
    scene.add(outputGroup);
    const outputBackingMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x323c40,
      roughness: 0.86,
      metalness: 0.05,
      transparent: true,
      opacity: 0,
    }));
    const outputTopMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: createTexture(0, true),
      roughness: 0.82,
      metalness: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }));
    const outputBacking = makeMesh(
      trackGeometry(new THREE.BoxGeometry(1.78, 0.065, 2.38)),
      outputBackingMaterial,
      outputGroup,
      true,
      true,
    );
    outputBacking.position.y = 0.012;
    const outputTop = makeMesh(
      trackGeometry(new THREE.PlaneGeometry(1.72, 2.3)),
      outputTopMaterial,
      outputGroup,
      false,
      true,
    );
    outputTop.rotation.x = -Math.PI / 2;
    outputTop.position.y = 0.047;
    outputTop.renderOrder = 9;
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 256;
    badgeCanvas.height = 128;
    const badgeContext = badgeCanvas.getContext('2d');
    if (!badgeContext) throw new Error('Canvas textures are unavailable');
    badgeContext.fillStyle = '#167d7c';
    badgeContext.fillRect(0, 0, 256, 128);
    badgeContext.fillStyle = '#ffffff';
    badgeContext.font = '700 62px Arial, Helvetica, sans-serif';
    badgeContext.textAlign = 'center';
    badgeContext.fillText('PDF', 128, 84);
    const badgeTexture = trackTexture(new THREE.CanvasTexture(badgeCanvas));
    badgeTexture.colorSpace = THREE.SRGBColorSpace;
    const badgeMaterial = trackMaterial(new THREE.MeshBasicMaterial({
      map: badgeTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }));
    const badge = makeMesh(trackGeometry(new THREE.PlaneGeometry(0.62, 0.31)), badgeMaterial, outputGroup, false, false);
    badge.rotation.x = -Math.PI / 2;
    badge.position.set(0.39, 0.05, 0.83);
    badge.renderOrder = 10;

    const workPlaneMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x20272a,
      roughness: 0.97,
      metalness: 0.03,
    }));
    const workPlane = makeMesh(
      trackGeometry(new THREE.BoxGeometry(8.8, 0.16, 7.25)),
      workPlaneMaterial,
      scene,
      false,
      true,
    );
    workPlane.position.set(0, -0.12, 0.12);

    const gridPoints: THREE.Vector3[] = [];
    for (let x = -4; x <= 4; x += 1) {
      gridPoints.push(new THREE.Vector3(x, -0.036, -3.25), new THREE.Vector3(x, -0.036, 3.5));
    }
    for (let z = -3; z <= 3; z += 1) {
      gridPoints.push(new THREE.Vector3(-4.15, -0.036, z), new THREE.Vector3(4.15, -0.036, z));
    }
    for (const x of [-3.75, 3.75]) {
      for (const z of [-2.85, 3.05]) {
        gridPoints.push(
          new THREE.Vector3(x - 0.18, -0.033, z), new THREE.Vector3(x + 0.18, -0.033, z),
          new THREE.Vector3(x, -0.033, z - 0.18), new THREE.Vector3(x, -0.033, z + 0.18),
        );
      }
    }
    const gridMaterial = trackMaterial(new THREE.LineBasicMaterial({
      color: 0x647277,
      transparent: true,
      opacity: 0.19,
    }));
    const grid = new THREE.LineSegments(trackGeometry(new THREE.BufferGeometry().setFromPoints(gridPoints)), gridMaterial);
    scene.add(grid);

    const groundMaterial = trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x111719,
      roughness: 1,
      metalness: 0,
    }));
    const ground = makeMesh(trackGeometry(new THREE.PlaneGeometry(60, 60)), groundMaterial, scene, false, true);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.215;

    const hemisphere = new THREE.HemisphereLight(0xe2edf2, 0x172025, 1.65);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xe7f0f4, 3.25);
    keyLight.position.set(-3.8, 8.5, 5.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1536, 1536);
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.bias = -0.0002;
    keyLight.shadow.normalBias = 0.018;
    keyLight.shadow.radius = 3;
    scene.add(keyLight);
    cleanupTasks.push(() => keyLight.shadow.dispose());
    const fillLight = new THREE.DirectionalLight(0xbfd5e2, 1.35);
    fillLight.position.set(5, 4.5, -2.5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xd9e5e9, 0.8);
    rimLight.position.set(-4, 3, -5);
    scene.add(rimLight);

    const canRender = (): boolean =>
      !disposed && !contextLost && hasSize && inViewport && welcomeVisible && !document.hidden;

    const updateCamera = (): void => {
      const horizontal = Math.cos(pitch) * fittedDistance;
      camera.position.set(
        target.x + Math.sin(yaw) * horizontal,
        target.y + Math.sin(pitch) * fittedDistance,
        target.z + Math.cos(yaw) * horizontal,
      );
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };

    const poseForPage = (index: number): Pose => {
      const offset = index - (PAGE_COUNT - 1) / 2;
      const selected = index === selectedPage;
      if (mode === 'crop') {
        return {
          x: offset * 0.025,
          y: 0.055 + index * 0.042 + (selected ? 0.17 : 0),
          z: offset * -0.018 + (selected ? 0.16 : 0),
          rx: 0,
          ry: 0,
          rz: offset * 0.004,
        };
      }
      if (mode === 'enhanced') {
        return {
          x: selected ? -0.45 : -0.45 + offset * 0.018,
          y: selected ? 0.77 : 0.025 + index * 0.027,
          z: selected ? 0.03 : -0.08,
          rx: 0,
          ry: 0,
          rz: 0,
        };
      }
      if (!fanOpen) {
        return {
          x: offset * 0.018,
          y: 0.045 + index * 0.034 + (selected ? 0.19 : 0),
          z: (selected ? 0.27 : 0),
          rx: 0,
          ry: 0,
          rz: offset * 0.003,
        };
      }
      return {
        x: offset * 0.88 + (selected ? 0.06 : 0),
        y: 0.04 + index * 0.085 + (selected ? 0.85 : 0),
        z: offset * 0.28 + (selected ? 0.45 : 0),
        rx: selected ? -0.08 : 0,
        ry: offset * -0.25,
        rz: offset * -0.035,
      };
    };

    const readPoses = (): Pose[] => pages.map((page) => ({
      x: page.position.x,
      y: page.position.y,
      z: page.position.z,
      rx: page.rotation.x,
      ry: page.rotation.y,
      rz: page.rotation.z,
    }));

    const applyPose = (page: THREE.Group, pose: Pose): void => {
      page.position.set(pose.x, pose.y, pose.z);
      page.rotation.set(pose.rx, pose.ry, pose.rz);
    };

    const updateAttachedDetails = (): void => {
      const selected = pages[selectedPage];
      cropRig.position.copy(selected.position);
      cropRig.rotation.copy(selected.rotation);
      cropRig.position.y += 0.085;
      cropRig.visible = mode === 'crop' && !contextLost;
      const bracketOpacity = transition?.kind === 'layout'
        ? clamp((performance.now() - transition.start) / Math.max(1, transition.duration), 0, 1)
        : 1;
      bracketMaterial.opacity = mode === 'crop' ? bracketOpacity : 0;
      outlineMaterial.opacity = mode === 'crop' ? bracketOpacity * 0.78 : 0;

      outputGroup.visible = outputAmount > 0.002 && !contextLost;
      outputGroup.position.set(2.13, 0.16 + outputAmount * 0.28, -0.18);
      outputGroup.rotation.set(0, -0.13, 0);
      outputGroup.scale.setScalar(0.78 + outputAmount * 0.22);
      outputBackingMaterial.opacity = outputAmount;
      outputTopMaterial.opacity = outputAmount;
      badgeMaterial.opacity = outputAmount;
    };

    const applyVisuals = (): void => {
      cleanMaterials.forEach((material, index) => {
        material.opacity = index === selectedPage ? cleanAmount : 0;
        material.visible = material.opacity > 0.001;
      });
      updateAttachedDetails();
    };

    const renderFrame = (): boolean => {
      if (!renderer || disposed || contextLost) return false;
      try {
        scene.updateMatrixWorld();
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

    const settlePoses = (): void => {
      pages.forEach((page, index) => applyPose(page, poseForPage(index)));
    };

    function onFrame(time: number): void {
      frameId = 0;
      if (!canRender()) {
        lastTime = 0;
        return;
      }
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
      lastTime = time;
      let active = false;

      if (transition) {
        const raw = clamp((time - transition.start) / transition.duration, 0, 1);
        const eased = raw * raw * (3 - 2 * raw);
        pages.forEach((page, index) => {
          const from = transition?.from[index];
          const to = transition?.to[index];
          if (!from || !to) return;
          applyPose(page, {
            x: THREE.MathUtils.lerp(from.x, to.x, eased),
            y: THREE.MathUtils.lerp(from.y, to.y, eased),
            z: THREE.MathUtils.lerp(from.z, to.z, eased),
            rx: THREE.MathUtils.lerp(from.rx, to.rx, eased),
            ry: THREE.MathUtils.lerp(from.ry, to.ry, eased),
            rz: THREE.MathUtils.lerp(from.rz, to.rz, eased),
          });
        });
        cleanAmount = THREE.MathUtils.lerp(transition.cleanFrom, transition.cleanTo, eased);
        outputAmount = THREE.MathUtils.lerp(transition.outputFrom, transition.outputTo, eased);
        active = raw < 1;
        if (!active) {
          const wasEnhanced = transition.kind === 'enhanced';
          transition = null;
          settlePoses();
          cleanAmount = mode === 'enhanced' ? 1 : 0;
          outputAmount = mode === 'enhanced' ? 1 : 0;
          if (wasEnhanced) host.dataset.sceneTransition = 'idle';
        }
      }

      const damping = reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 13);
      const yawDifference = orbitYaw - yaw;
      const pitchDifference = orbitPitch - pitch;
      if (Math.abs(yawDifference) > 0.00005 || Math.abs(pitchDifference) > 0.00005) {
        yaw += yawDifference * damping;
        pitch += pitchDifference * damping;
        if (Math.abs(orbitYaw - yaw) < 0.00005 && Math.abs(orbitPitch - pitch) < 0.00005) {
          yaw = orbitYaw;
          pitch = orbitPitch;
        } else {
          active = true;
        }
        host.dataset.rotation = THREE.MathUtils.radToDeg(yaw - defaultYaw).toFixed(2);
      }
      updateCamera();
      applyVisuals();
      if (renderFrame() && active) scheduleFrame();
    }

    function scheduleFrame(): void {
      if (!frameId && canRender()) frameId = requestAnimationFrame(onFrame);
    }

    const requestSettle = (): void => {
      if (reducedMotion.matches) {
        transition = null;
        settlePoses();
        cleanAmount = mode === 'enhanced' ? 1 : 0;
        outputAmount = mode === 'enhanced' ? 1 : 0;
        host.dataset.sceneTransition = 'idle';
        updateCamera();
        applyVisuals();
        scheduleFrame();
        return;
      }
      scheduleFrame();
    };

    const startLayoutTransition = (animate = true): void => {
      const to = pages.map((_, index) => poseForPage(index));
      if (!animate || reducedMotion.matches) {
        transition = null;
        settlePoses();
        cleanAmount = mode === 'enhanced' ? 1 : 0;
        outputAmount = mode === 'enhanced' ? 1 : 0;
        host.dataset.sceneTransition = 'idle';
      } else {
        transition = {
          kind: 'layout',
          start: performance.now(),
          duration: 460,
          from: readPoses(),
          to,
          cleanFrom: cleanAmount,
          cleanTo: 0,
          outputFrom: outputAmount,
          outputTo: 0,
        };
        cleanAmount = 0;
        outputAmount = 0;
        host.dataset.sceneTransition = 'idle';
      }
      applyVisuals();
      requestSettle();
    };

    const selectPage = (index: number): void => {
      if (disposed || !Number.isInteger(index)) return;
      const next = clamp(index, 0, PAGE_COUNT - 1);
      if (next === selectedPage) return;
      selectedPage = next;
      host.dataset.selectedPage = String(selectedPage + 1);
      // Selection is reflected in state and picking immediately, even during a move.
      startLayoutTransition(mode !== 'enhanced');
      if (mode === 'enhanced') {
        cleanMaterials.forEach((material, pageIndex) => { material.opacity = pageIndex === selectedPage ? 1 : 0; });
        pages.forEach((page, pageIndex) => applyPose(page, poseForPage(pageIndex)));
        outputTopMaterial.map?.dispose();
        textures.delete(outputTopMaterial.map as THREE.Texture);
        outputTopMaterial.map = createTexture(selectedPage, true);
        outputTopMaterial.needsUpdate = true;
        outputAmount = 1;
        applyVisuals();
        scheduleFrame();
      }
    };

    const toggleFan = (): void => {
      if (disposed) return;
      fanOpen = !fanOpen;
      host.dataset.fan = fanOpen ? 'open' : 'closed';
      startLayoutTransition();
    };

    const setMode = (nextMode: SceneMode): void => {
      if (disposed || nextMode === mode) return;
      const previousMode = mode;
      mode = nextMode;
      host.dataset.sceneState = mode;
      if (nextMode === 'enhanced') {
        cropRig.visible = false;
        bracketMaterial.opacity = 0;
        outlineMaterial.opacity = 0;
        if (reducedMotion.matches) {
          transition = null;
          settlePoses();
          cleanAmount = 1;
          outputAmount = 1;
          host.dataset.sceneTransition = 'idle';
        } else {
          transition = {
            kind: 'enhanced',
            start: performance.now(),
            duration: 720,
            from: readPoses(),
            to: pages.map((_, index) => poseForPage(index)),
            cleanFrom: cleanAmount,
            cleanTo: 1,
            outputFrom: outputAmount,
            outputTo: 1,
          };
          host.dataset.sceneTransition = 'enhancing';
        }
        updateAttachedDetails();
        scheduleFrame();
        return;
      }

      const wasEnhanced = previousMode === 'enhanced' || transition?.kind === 'enhanced';
      if (reducedMotion.matches) {
        transition = null;
        settlePoses();
        cleanAmount = 0;
        outputAmount = 0;
        host.dataset.sceneTransition = 'idle';
      } else {
        transition = {
          kind: wasEnhanced ? 'enhanced' : 'layout',
          start: performance.now(),
          duration: wasEnhanced ? 600 : 440,
          from: readPoses(),
          to: pages.map((_, index) => poseForPage(index)),
          cleanFrom: cleanAmount,
          cleanTo: 0,
          outputFrom: outputAmount,
          outputTo: 0,
        };
        host.dataset.sceneTransition = wasEnhanced ? 'enhancing' : 'idle';
      }
      applyVisuals();
      scheduleFrame();
    };

    const reset = (): void => {
      if (disposed) return;
      selectedPage = 0;
      fanOpen = true;
      mode = 'fan';
      transition = null;
      cleanAmount = 0;
      outputAmount = 0;
      yaw = orbitYaw = defaultYaw;
      pitch = orbitPitch = defaultPitch;
      host.dataset.rotation = '0.00';
      host.dataset.sceneState = mode;
      host.dataset.selectedPage = '1';
      host.dataset.fan = 'open';
      host.dataset.sceneTransition = 'idle';
      outputTopMaterial.map?.dispose();
      textures.delete(outputTopMaterial.map as THREE.Texture);
      outputTopMaterial.map = createTexture(0, true);
      outputTopMaterial.needsUpdate = true;
      settlePoses();
      updateCamera();
      applyVisuals();
      scheduleFrame();
    };

    const resize = (): void => {
      if (!renderer || disposed) return;
      const bounds = host.getBoundingClientRect();
      const width = Math.max(0, bounds.width);
      const height = Math.max(0, bounds.height);
      hasSize = width > 1 && height > 1;
      if (!hasSize) {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
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
        const narrowFit = camera.aspect < 1.28 ? 1.28 / camera.aspect : 1;
        fittedDistance = cameraDistance * Math.min(narrowFit, 2.35);
        camera.updateProjectionMatrix();
        updateCamera();
      } catch {
        cleanup();
        host.dataset.webgl = 'fallback';
        return;
      }
      scheduleFrame();
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

    let activePointer: number | null = null;
    let activePointerType = '';
    let startX = 0;
    let startY = 0;
    let previousX = 0;
    let previousY = 0;
    let horizontalDrag = false;
    let dragged = false;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const releasePointer = (event: PointerEvent): void => {
      if (!canvas) return;
      if (canvas.hasPointerCapture(event.pointerId)) {
        try { canvas.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
      }
    };

    const pickPage = (event: PointerEvent): void => {
      if (!canvas || !renderer || contextLost) return;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      pointerNdc.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      scene.updateMatrixWorld();
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects(pickMeshes, false)[0];
      if (hit) selectPage(hit.object.userData.pageIndex as number);
    };

    const endPointer = (event: PointerEvent): void => {
      if (activePointer !== event.pointerId || !canvas) return;
      const movement = Math.hypot(event.clientX - startX, event.clientY - startY);
      const wasHorizontalDrag = horizontalDrag;
      releasePointer(event);
      activePointer = null;
      horizontalDrag = false;
      canvas.style.cursor = 'grab';
      if (movement < 7 && !dragged) pickPage(event);
      else if (wasHorizontalDrag) scheduleFrame();
      dragged = false;
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!canvas || activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      activePointer = event.pointerId;
      activePointerType = event.pointerType;
      startX = previousX = event.clientX;
      startY = previousY = event.clientY;
      horizontalDrag = event.pointerType === 'mouse';
      dragged = false;
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
        if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 7) return;
        if (Math.abs(totalY) >= Math.abs(totalX) * 1.05) {
          activePointer = null;
          dragged = true;
          return;
        }
        horizontalDrag = true;
        try { canvas.setPointerCapture(event.pointerId); } catch { activePointer = null; return; }
        canvas.style.cursor = 'grabbing';
      }
      if (!horizontalDrag) return;
      event.preventDefault();
      const deltaX = event.clientX - previousX;
      const deltaY = event.clientY - previousY;
      if (Math.abs(event.clientX - startX) > 5 || Math.abs(event.clientY - startY) > 5) dragged = true;
      orbitYaw = clamp(orbitYaw + deltaX * 0.005, defaultYaw - 0.72, defaultYaw + 0.72);
      orbitPitch = clamp(orbitPitch + deltaY * 0.0035, 0.39, 0.98);
      if (reducedMotion.matches) {
        yaw = orbitYaw;
        pitch = orbitPitch;
        host.dataset.rotation = THREE.MathUtils.radToDeg(yaw - defaultYaw).toFixed(2);
      }
      previousX = event.clientX;
      previousY = event.clientY;
      scheduleFrame();
    };

    const cancelPointer = (event: PointerEvent): void => {
      if (activePointer === event.pointerId) {
        releasePointer(event);
        activePointer = null;
        horizontalDrag = false;
        dragged = true;
        if (canvas) canvas.style.cursor = 'grab';
      }
    };

    const onContextLost = (event: Event): void => {
      event.preventDefault();
      contextLost = true;
      host.classList.remove('is-webgl-ready');
      host.dataset.webgl = 'lost';
      cropRig.visible = false;
      outputGroup.visible = false;
      updateActivity();
    };

    const onContextRestored = (): void => {
      if (disposed) return;
      contextLost = false;
      lastTime = 0;
      renderWidth = 0;
      renderHeight = 0;
      renderDpr = 0;
      applyVisuals();
      resize();
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
      if (reducedMotion.matches && transition) {
        transition = null;
        settlePoses();
        cleanAmount = mode === 'enhanced' ? 1 : 0;
        outputAmount = mode === 'enhanced' ? 1 : 0;
        host.dataset.sceneTransition = 'idle';
      }
      if (reducedMotion.matches) {
        yaw = orbitYaw;
        pitch = orbitPitch;
      }
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

    settlePoses();
    updateCamera();
    applyVisuals();
    host.appendChild(canvas);
    resize();

    return {
      destroy: cleanup,
      selectPage,
      toggleFan,
      setMode,
      reset,
    };
  } catch {
    cleanup();
    host.dataset.webgl = 'fallback';
    syncDataset();
    return fallbackHandle();
  }
}

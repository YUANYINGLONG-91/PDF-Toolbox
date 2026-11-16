const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

function motionEnabled(): boolean {
  return finePointer.matches && !reducedMotion.matches;
}

function addTilt(element: HTMLElement, maxAngle: number, scene = false): void {
  let frame = 0;
  let pointerX = 0;
  let pointerY = 0;

  const render = () => {
    frame = 0;
    const bounds = element.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (pointerX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (pointerY - bounds.top) / bounds.height * 2 - 1));

    if (scene) {
      element.style.setProperty('--scene-x', `${(-y * maxAngle).toFixed(2)}deg`);
      element.style.setProperty('--scene-y', `${(x * maxAngle).toFixed(2)}deg`);
    } else {
      element.style.setProperty('--tilt-x', `${(-y * maxAngle).toFixed(2)}deg`);
      element.style.setProperty('--tilt-y', `${(x * maxAngle).toFixed(2)}deg`);
      element.style.setProperty('--glow-x', `${((x + 1) * 50).toFixed(1)}%`);
      element.style.setProperty('--glow-y', `${((y + 1) * 50).toFixed(1)}%`);
    }
  };

  const reset = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const properties = scene ? ['--scene-x', '--scene-y'] : ['--tilt-x', '--tilt-y', '--glow-x', '--glow-y'];
    properties.forEach((property) => element.style.removeProperty(property));
  };

  element.addEventListener('pointermove', (event) => {
    if (!motionEnabled()) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!frame) frame = requestAnimationFrame(render);
  });
  element.addEventListener('pointerleave', reset);
  reducedMotion.addEventListener('change', reset);
}

export function initVisualEffects(): void {
  document.querySelectorAll<HTMLElement>('[data-visual-scene]').forEach((scene) => addTilt(scene, 7, true));
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => addTilt(card, 2.2));
}

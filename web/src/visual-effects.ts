import { t } from './i18n';
import type { DocumentSceneHandle } from './hero-scene';

function initDepthEffects(): () => void {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active: HTMLElement | null = null;

  const reset = (): void => {
    if (!active) return;
    active.style.removeProperty('--depth-rx');
    active.style.removeProperty('--depth-ry');
    active = null;
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!finePointer.matches || reducedMotion.matches || event.pointerType === 'touch') {
      reset();
      return;
    }
    const origin = event.target instanceof Element ? event.target : null;
    const target = origin?.closest<HTMLElement>('[data-depth]') ?? null;
    if (target !== active) reset();
    if (!target) return;
    active = target;
    const bounds = target.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    target.style.setProperty('--depth-rx', `${((0.5 - y) * 1.1).toFixed(3)}deg`);
    target.style.setProperty('--depth-ry', `${((x - 0.5) * 1.3).toFixed(3)}deg`);
  };
  const onPointerOut = (event: PointerEvent): void => {
    if (!active) return;
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !active.contains(next)) reset();
  };
  const onPreferenceChange = (): void => reset();

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('pointercancel', reset, { passive: true });
  window.addEventListener('blur', reset);
  finePointer.addEventListener('change', onPreferenceChange);
  reducedMotion.addEventListener('change', onPreferenceChange);

  return () => {
    reset();
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('pointercancel', reset);
    window.removeEventListener('blur', reset);
    finePointer.removeEventListener('change', onPreferenceChange);
    reducedMotion.removeEventListener('change', onPreferenceChange);
  };
}

export function initVisualEffects(): () => void {
  const disposeDepth = initDepthEffects();
  const host = document.querySelector<HTMLElement>('[data-visual-scene]');
  if (!host) return disposeDepth;

  const pageButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-scene-page]'));
  const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-scene-action]'));
  const fanLabel = document.querySelector<HTMLElement>('[data-scene-action="fan"] [data-i18n]');
  const status = document.getElementById('sceneStatus');
  let handle: DocumentSceneHandle | undefined;
  let disposed = false;

  const setStatus = (key: Parameters<typeof t>[0], page?: number): void => {
    if (status) status.textContent = t(key).replace('{page}', String(page ?? ''));
  };
  const syncControls = (): void => {
    const ready = host.dataset.webgl === 'ready';
    const selected = Number(host.dataset.selectedPage ?? '1');
    const mode = host.dataset.sceneState ?? 'fan';
    const fanOpen = host.dataset.fan !== 'closed';
    for (const button of [...pageButtons, ...actionButtons]) button.disabled = !ready;
    pageButtons.forEach((button) => {
      const active = Number(button.dataset.scenePage) + 1 === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const fanButton = actionButtons.find((button) => button.dataset.sceneAction === 'fan');
    fanButton?.setAttribute('aria-pressed', String(fanOpen));
    fanButton?.classList.toggle('active', fanOpen);
    if (fanLabel) {
      const key = fanOpen ? 'sceneGather' : 'sceneFan';
      fanLabel.dataset.i18n = key;
      fanLabel.textContent = t(key);
    }
    for (const modeName of ['crop', 'enhance'] as const) {
      const button = actionButtons.find((candidate) => candidate.dataset.sceneAction === modeName);
      const active = mode === (modeName === 'enhance' ? 'enhanced' : 'crop');
      button?.setAttribute('aria-pressed', String(active));
      button?.classList.toggle('active', active);
    }
    if (!ready && host.dataset.webgl === 'fallback') setStatus('sceneStatusFallback');
  };

  const onPage = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const page = Number(button.dataset.scenePage);
    if (!handle || !Number.isInteger(page)) return;
    handle.selectPage(page);
    syncControls();
    setStatus('sceneStatusPage', page + 1);
  };
  const onAction = (event: Event): void => {
    if (!handle) return;
    const action = (event.currentTarget as HTMLButtonElement).dataset.sceneAction;
    if (action === 'fan') {
      handle.toggleFan();
      setStatus(host.dataset.fan === 'closed' ? 'sceneStatusFanOpen' : 'sceneStatusFanClosed');
    } else if (action === 'crop') {
      handle.setMode(host.dataset.sceneState === 'crop' ? 'fan' : 'crop');
      setStatus('sceneStatusCrop');
    } else if (action === 'enhance') {
      handle.setMode(host.dataset.sceneState === 'enhanced' ? 'fan' : 'enhanced');
      setStatus('sceneStatusEnhanced');
    } else if (action === 'reset') {
      handle.reset();
      setStatus('sceneStatusReset');
    }
    syncControls();
  };
  const onLanguageChange = (): void => {
    syncControls();
    if (host.dataset.webgl === 'fallback') setStatus('sceneStatusFallback');
  };

  pageButtons.forEach((button) => button.addEventListener('click', onPage));
  actionButtons.forEach((button) => button.addEventListener('click', onAction));
  document.addEventListener('pdf-toolbox-language-change', onLanguageChange);
  const observer = new MutationObserver(syncControls);
  observer.observe(host, {
    attributes: true,
    attributeFilter: ['data-webgl', 'data-scene-state', 'data-selected-page', 'data-fan'],
  });
  syncControls();

  void import('./hero-scene')
    .then(({ mountDocumentScene }) => {
      if (disposed) return;
      handle = mountDocumentScene(host);
      syncControls();
    })
    .catch(() => {
      if (disposed) return;
      host.dataset.webgl = 'fallback';
      host.classList.remove('is-webgl-ready');
      syncControls();
    });

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    pageButtons.forEach((button) => button.removeEventListener('click', onPage));
    actionButtons.forEach((button) => button.removeEventListener('click', onAction));
    document.removeEventListener('pdf-toolbox-language-change', onLanguageChange);
    handle?.destroy();
    disposeDepth();
  };
}

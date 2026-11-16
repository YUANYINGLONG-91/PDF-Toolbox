export function initVisualEffects(): void {
  const host = document.querySelector<HTMLElement>('[data-visual-scene]');
  if (!host) return;

  void import('./hero-scene')
    .then(({ mountScannerScene }) => {
      mountScannerScene(host);
    })
    .catch(() => {
      host.dataset.webgl = 'fallback';
      host.classList.remove('is-webgl-ready');
    });
}

(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const elements = [...document.querySelectorAll('[data-reveal]')];
  const progress = document.querySelector('.scroll-progress');
  let observer;
  let scheduled = false;
  function initialize() {
    observer?.disconnect();
    elements.forEach(element => element.classList.remove('is-pending'));
    if (preference.matches || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('is-pending');
          observer.unobserve(entry.target);
        }
      });
    }, {threshold: 0.08, rootMargin: '0px 0px 32px 0px'});
    elements.forEach(element => {
      // Never hide content already visible or above the current scroll position.
      if (element.getBoundingClientRect().top > window.innerHeight) {
        element.classList.add('is-pending');
        observer.observe(element);
      }
    });
  }
  function updateProgress() {
    scheduled = false;
    if (!progress || preference.matches) return;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0})`;
  }
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; window.requestAnimationFrame(updateProgress); }
  }, {passive: true});
  window.addEventListener('resize', updateProgress);
  window.addEventListener('hashchange', () => {
    const target = document.getElementById(window.location.hash.slice(1));
    target?.classList.remove('is-pending');
    target?.querySelectorAll('.is-pending').forEach(element => element.classList.remove('is-pending'));
  });
  document.addEventListener('focusin', event => event.target.closest('[data-reveal]')?.classList.remove('is-pending'));
  preference.addEventListener('change', initialize);
  window.addEventListener('pageshow', initialize);
  initialize();
  updateProgress();
})();

/* The v13 entrance, adapted to the existing halo and smile without changing
   their final appearance, content, layout, or any navigation behavior. */
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || !Element.prototype.animate) return;

  const root = document.documentElement;
  const listeners = new AbortController();
  const animations = new Set();
  let overlay;
  let finished = false;
  let watchdog;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    listeners.abort();
    root.classList.remove('intro-pending');
    animations.forEach(animation => animation.cancel());
    overlay?.remove();
  }

  function animate(element, frames, options) {
    const animation = element.animate(frames, { fill: 'both', ...options });
    animations.add(animation);
    // Cancellation is normal when the visitor interacts or resizes the page.
    return animation.finished.catch(() => {});
  }

  root.classList.add('intro-pending');
  watchdog = setTimeout(finish, 5000);
  for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pagehide']) {
    window.addEventListener(event, finish, { passive: true, signal: listeners.signal });
  }
  reducedMotion.addEventListener('change', event => {
    if (event.matches) finish();
  }, { signal: listeners.signal });

  async function play() {
    if (finished) return;
    const halo = document.querySelector('.home-page .cosmic-halo');
    const smile = document.querySelector('.home-page .hero-note .smile');
    if (!halo || !smile || window.scrollY > innerHeight / 2 || document.hidden) { finish(); return; }

    try {
      overlay = document.createElement('div');
      overlay.className = 'portfolio-intro';
      overlay.setAttribute('aria-hidden', 'true');
      const screen = document.createElement('div');
      screen.className = 'portfolio-intro__screen';
      const ring = document.createElement('div');
      ring.className = 'portfolio-intro__ring';
      const face = smile.cloneNode(true);
      face.setAttribute('class', 'portfolio-intro__face');
      const eyes = face.querySelector('.smile-eyes');
      // Separate the existing eye strokes so only the right eye winks.
      eyes.removeAttribute('class');
      eyes.replaceChildren();
      for (const x of [10, 22]) {
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        eye.setAttribute('d', `M${x} 9v4`);
        eye.setAttribute('class', 'portfolio-intro__eye');
        eyes.appendChild(eye);
      }

      const haloStyle = getComputedStyle(halo);
      ring.style.border = haloStyle.border;
      ring.style.boxShadow = haloStyle.boxShadow;
      const ringWidth = Math.min(innerWidth * .78, 470);
      const faceSize = Math.min(innerWidth * .38, 160);
      Object.assign(ring.style, {
        left: '50%', top: '50%', width: `${ringWidth}px`,
        height: `${ringWidth / 1.55}px`, transform: 'translate(-50%, -50%)'
      });
      Object.assign(face.style, {
        left: `${(innerWidth - faceSize) / 2}px`,
        top: `${(innerHeight - faceSize) / 2}px`,
        width: `${faceSize}px`, height: `${faceSize}px`,
        transformOrigin: 'top left', stroke: getComputedStyle(smile).stroke
      });
      overlay.append(screen, ring, face);
      document.body.appendChild(overlay);
      const viewportWidth = innerWidth, viewportHeight = innerHeight;
      window.addEventListener('resize', () => {
        if (innerWidth !== viewportWidth || innerHeight !== viewportHeight) finish();
      }, { passive: true, signal: listeners.signal });

      const ease = 'cubic-bezier(.18,.78,.2,1)';
      await Promise.all([
        animate(face, [{ opacity: 0, scale: .86 }, { opacity: 1, scale: 1 }], { duration: 500, easing: ease }),
        animate(ring, [
          { opacity: 0, transform: 'translate(-50%, -50%) scale(.84)' },
          { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }
        ], { duration: 620, easing: ease })
      ]);
      if (finished) return;
      await animate(eyes.lastElementChild, [
        { transform: 'scaleY(1)' }, { transform: 'scaleY(.08)', offset: .45 },
        { transform: 'scaleY(.08)', offset: .6 }, { transform: 'scaleY(1)' }
      ], { delay: 100, duration: 260, easing: 'ease-in-out' });
      if (finished) return;

      const from = face.getBoundingClientRect();
      const to = smile.getBoundingClientRect();
      const parent = halo.offsetParent.getBoundingClientRect();
      const dx = to.left - from.left;
      const dy = to.top - from.top;
      const ringEnd = {
        left: `${parent.left + halo.offsetLeft}px`,
        top: `${parent.top + halo.offsetTop}px`,
        width: haloStyle.width, height: haloStyle.height,
        transform: haloStyle.transform, opacity: 1
      };

      const reveals = [...document.querySelectorAll(
        '.home-page .site-header, .home-page .hero-copy, .home-page .creative-stage, .home-page .home-paths, .home-page .footer'
      )].map((element, index) => animate(element,
        [{ opacity: 0 }, { opacity: 1 }],
        { delay: 120 + index * 65, duration: 680, easing: 'ease-out' }
      ));
      await Promise.all([
        ...reveals,
        animate(screen, [{ opacity: 1 }, { opacity: 0 }], { duration: 850, easing: 'ease-out' }),
        animate(face, [
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(${dx * .45}px, ${dy * .4 - 12}px) scale(.85)`, offset: .52 },
          { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width}, ${to.height / from.height})` }
        ], { duration: 1300, easing: ease }),
        animate(ring, [
          { left: `${innerWidth / 2}px`, top: `${innerHeight / 2}px`, width: `${ringWidth}px`, height: `${ringWidth / 1.55}px`, transform: 'translate(-50%, -50%)', opacity: 1 },
          ringEnd
        ], { duration: 1300, easing: ease })
      ]);
    } finally {
      finish();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { play().catch(finish); }, { once: true });
  } else {
    play().catch(finish);
  }
})();

/* A small, reusable wake of delayed shadows; it never copies page content. */
(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const emptyTrail = {
    finish: () => Promise.resolve(),
    destroy() {},
  };

  function create(source, { parent = document.body, zIndex = 89 } = {}) {
    if (reducedMotion.matches || !source?.isConnected || !parent?.isConnected) return emptyTrail;

    const wrapper = document.createElement("div");
    wrapper.className = "gravity-wake";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.style.zIndex = String(zIndex);
    const count = innerWidth <= 540 ? 4 : 6;
    const echoes = Array.from({ length: count }, (_, index) => {
      const echo = document.createElement("span");
      echo.className = "gravity-wake__echo";
      echo.style.setProperty("--wake-blur", `${3.2 + index * 0.5}px`);
      echo.style.setProperty("--wake-wave", String(0.32 - index * 0.03));
      wrapper.appendChild(echo);
      return echo;
    });
    parent.appendChild(wrapper);

    const listeners = new AbortController();
    const history = [];
    let frame;
    let fadeTimer;
    let destroyed = false;
    let finishing = false;
    let lastPaint = -Infinity;
    let previous;
    let lastMotion = -Infinity;
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      clearTimeout(fadeTimer);
      listeners.abort();
      wrapper.remove();
      history.length = 0;
      resolveDone();
    }

    function finish() {
      if (destroyed || finishing) return done;
      finishing = true;
      cancelAnimationFrame(frame);
      wrapper.classList.add("gravity-wake--fading");
      fadeTimer = setTimeout(destroy, 520);
      return done;
    }

    function paint(now) {
      if (destroyed || finishing) return;
      if (!source.isConnected || !wrapper.isConnected) return destroy();
      // Six composited, masked elements are enough; do not repaint at 120Hz.
      if (now - lastPaint >= 30) {
        const rect = source.getBoundingClientRect();
        if (!rect.width || !rect.height) return destroy();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const dx = previous ? x - previous.x : 0;
        const dy = previous ? y - previous.y : 0;
        const distance = Math.hypot(dx, dy);
        const changedSize = previous ? Math.abs(rect.width - previous.width) : 0;
        if (distance > 0.6 || changedSize > 0.6) lastMotion = now;
        const sample = {
          x, y, width: rect.width, height: rect.height, time: now,
          angle: distance > 0.4 ? Math.atan2(dy, dx) : previous?.angle || 0,
          speed: previous ? distance / Math.max(now - previous.time, 1) : 0,
        };
        history.push(sample);
        while (history.length && now - history[0].time > 620) history.shift();
        const motion = Math.max(0, 1 - Math.max(0, now - lastMotion - 90) / 240);

        echoes.forEach((echo, index) => {
          const delay = 50 + index * (380 / (count - 1));
          let past;
          for (let cursor = history.length - 1; cursor >= 0; cursor--) {
            if (history[cursor].time <= now - delay) {
              past = history[cursor];
              break;
            }
          }
          if (!past) {
            echo.style.opacity = "0";
            return;
          }
          const separation = Math.hypot(x - past.x, y - past.y) + Math.abs(rect.width - past.width) * 0.4;
          const reveal = Math.min(separation / Math.max(rect.width * 0.06, 12), 1);
          const sizeFactor = 0.78 - index * 0.026;
          const width = past.width * sizeFactor;
          const height = past.height * sizeFactor;
          const stretch = 1 + Math.min(past.speed * 0.14, 0.2);
          echo.style.width = `${width}px`;
          echo.style.height = `${height}px`;
          echo.style.transform = `translate3d(${past.x - width / 2}px, ${past.y - height / 2}px, 0) rotate(${past.angle}rad) scale(${stretch}, ${1 / Math.sqrt(stretch)})`;
          echo.style.opacity = String((0.7 - index * 0.075) * reveal * motion);
        });
        previous = sample;
        lastPaint = now;
      }
      frame = requestAnimationFrame(paint);
    }

    window.addEventListener("pagehide", destroy, { passive: true, signal: listeners.signal });
    window.addEventListener("resize", destroy, { passive: true, signal: listeners.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) destroy();
    }, { signal: listeners.signal });
    reducedMotion.addEventListener("change", (event) => {
      if (event.matches) destroy();
    }, { signal: listeners.signal });
    frame = requestAnimationFrame(paint);
    return { finish, destroy };
  }

  window.PortfolioGravityTrail = Object.freeze({ create });
})();

/* Build the light in layers, then let gravity carry the scene into the page. */
(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const navigation = performance.getEntriesByType("navigation")[0];
  if (reducedMotion.matches || !Element.prototype.animate || location.hash || navigation?.type === "back_forward") return;

  const root = document.documentElement;
  const listeners = new AbortController();
  const animations = new Set();
  let overlay;
  let halo;
  let blackHole;
  let gravityTrail;
  let finished = false;
  let watchdog;
  let flightFrame;
  let resolveFlight;

  // Preserve the moving disk's phase when a temporary scene takes its place.
  function syncDisk(from, to) {
    const source = from.getAnimations({ subtree: true }).filter((item) => item.animationName);
    const target = to.getAnimations({ subtree: true }).filter((item) => item.animationName);
    target.forEach((animation, index) => {
      if (animation.animationName === source[index]?.animationName) {
        animation.currentTime = source[index].currentTime;
      }
    });
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    cancelAnimationFrame(flightFrame);
    resolveFlight?.();
    resolveFlight = null;
    listeners.abort();
    gravityTrail?.destroy();
    if (blackHole?.isConnected && halo?.isConnected) syncDisk(blackHole, halo);
    root.classList.remove("intro-pending");
    animations.forEach((animation) => animation.cancel());
    overlay?.remove();
  }

  function animate(element, frames, options) {
    const animation = element.animate(frames, { fill: "both", ...options });
    animations.add(animation);
    return animation.finished.catch(() => {});
  }

  function flyToTargets(face, smile, duration) {
    const blackHoleStart = blackHole.getBoundingClientRect();
    const faceStart = face.getBoundingClientRect();
    for (const [element, rect] of [[blackHole, blackHoleStart], [face, faceStart]]) {
      element.getAnimations().forEach((animation) => animation.cancel());
      Object.assign(element.style, {
        left: "0px",
        top: "0px",
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        opacity: "1",
        transformOrigin: "top left",
        transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
      });
    }

    const mix = (start, end, amount) => start + (end - start) * amount;
    gravityTrail = window.PortfolioGravityTrail?.create(blackHole, {
      parent: overlay,
      zIndex: 1,
    });
    const startedAt = performance.now();
    return new Promise((resolve) => {
      resolveFlight = resolve;
      const step = (now) => {
        if (finished) return;
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = progress * progress * (3 - 2 * progress);
        const arc = Math.sin(Math.PI * eased);
        // Destinations stay live, so scrolling never strands either clone.
        for (const [element, start, target, bend] of [
          [blackHole, blackHoleStart, halo, Math.min(innerWidth * 0.075, 90)],
          [face, faceStart, smile, -Math.min(innerWidth * 0.05, 60)],
        ]) {
          const end = target.getBoundingClientRect();
          const x = mix(start.left, end.left, eased) + arc * bend;
          const y = mix(start.top, end.top, eased) - arc * Math.min(innerHeight * 0.04, 34);
          const swell = element === blackHole ? 1 + 0.11 * arc : 1;
          const scaleX = mix(1, end.width / start.width, eased) * swell;
          const scaleY = mix(1, end.height / start.height, eased) * swell;
          element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`;
        }
        if (progress === 1 && resolveFlight) {
          resolveFlight = null;
          resolve();
        }
        // Keep the clones on their live targets while the last shadows dissolve.
        flightFrame = requestAnimationFrame(step);
      };
      flightFrame = requestAnimationFrame(step);
    });
  }

  root.classList.add("intro-pending");
  watchdog = setTimeout(finish, 6000);
  window.addEventListener("pagehide", finish, { passive: true, signal: listeners.signal });
  document.addEventListener("portfolio:intro-finish", finish, { signal: listeners.signal });
  document.addEventListener("pointerdown", finish, { passive: true, signal: listeners.signal });
  document.addEventListener("keydown", finish, { signal: listeners.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finish();
  }, { signal: listeners.signal });
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) finish();
  }, { signal: listeners.signal });

  async function play() {
    if (finished) return;
    clearTimeout(watchdog);
    watchdog = setTimeout(finish, 4000);
    halo = document.querySelector(".home-page .cosmic-halo");
    const smile = document.querySelector(".home-page .hero-note .smile");
    if (!halo || !smile || document.hidden) return finish();

    try {
      overlay = document.createElement("div");
      overlay.className = "portfolio-intro";
      overlay.setAttribute("aria-hidden", "true");
      const veil = document.createElement("div");
      veil.className = "portfolio-intro__veil";
      const energy = document.createElement("div");
      energy.className = "portfolio-intro__energy";
      blackHole = halo.cloneNode(true);
      blackHole.className = "portfolio-intro__black-hole black-hole";
      const face = smile.cloneNode(true);
      face.setAttribute("class", "portfolio-intro__face");
      const eyes = face.querySelector(".smile-eyes");
      if (!eyes?.lastElementChild) return finish();
      eyes.removeAttribute("class");
      eyes.lastElementChild.setAttribute("class", "portfolio-intro__eye");

      const viewportWidth = root.clientWidth || innerWidth;
      const viewportHeight = root.clientHeight || innerHeight;
      const size = Math.min(viewportWidth * 0.94, viewportHeight * 0.88, 940);
      const faceSize = size * 0.27;
      Object.assign(blackHole.style, {
        left: `${(viewportWidth - size) / 2}px`,
        top: `${(viewportHeight - size) / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
      Object.assign(face.style, {
        left: `${(viewportWidth - faceSize) / 2}px`,
        top: `${(viewportHeight - faceSize) / 2 - faceSize * 0.04}px`,
        width: `${faceSize}px`,
        height: `${faceSize}px`,
      });
      Object.assign(energy.style, {
        left: `${(viewportWidth - size) / 2}px`,
        top: `${(viewportHeight - size) / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
      overlay.append(veil, energy, blackHole, face);
      document.body.appendChild(overlay);
      syncDisk(halo, blackHole);
      window.addEventListener("resize", () => {
        if (root.clientWidth !== viewportWidth || root.clientHeight !== viewportHeight) finish();
      }, { passive: true, signal: listeners.signal });

      const ease = "cubic-bezier(.2,.75,.2,1)";
      // A single, soft wave stays behind the shadow while the disk gathers light.
      animate(energy, [
        { opacity: 0, transform: "scale(.44)" },
        { opacity: 0.92, transform: "scale(.95)", offset: 0.4 },
        { opacity: 0, transform: "scale(1.65)" },
      ], { delay: 180, duration: 1000, easing: "cubic-bezier(.18,.65,.32,1)" });
      const formation = [...blackHole.querySelectorAll(
        ".black-hole__aura, .black-hole__lensing, .black-hole__photon-ring, .black-hole__disk--back, .black-hole__foreground",
      )].map((layer, index) => {
        const opacity = Number(getComputedStyle(layer).opacity);
        return animate(layer, [
          { opacity: 0 },
          { opacity: opacity * 0.3, offset: 0.35 },
          { opacity },
        ], { delay: 110 + index * 35, duration: 650, easing: "ease-out" });
      });
      await Promise.all([
        ...formation,
        animate(blackHole, [
          { opacity: 0, transform: "scale(.5)" },
          { opacity: 0.8, transform: "scale(.9)", offset: 0.48 },
          { opacity: 1, transform: "scale(1.06)", offset: 0.82 },
          { opacity: 1, transform: "scale(1)" },
        ], { duration: 850, easing: ease }),
        animate(face, [{ opacity: 0 }, { opacity: 1 }], {
          delay: 490, duration: 270, easing: "ease-out",
        }),
        animate(eyes.lastElementChild, [
          { transform: "scaleY(1)" },
          { transform: "scaleY(.1)", offset: 0.45 },
          { transform: "scaleY(.1)", offset: 0.6 },
          { transform: "scaleY(1)" },
        ], { delay: 720, duration: 220, easing: "ease-in-out" }),
      ]);
      if (finished) return;

      const reveals = [...document.querySelectorAll(
        ".home-page .site-header, .home-page .hero-copy, .home-page .creative-stage, .home-page .home-paths, .home-page .footer",
      )].map((element, index) => animate(element, [
        { opacity: 0, transform: "translateY(16px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { delay: 160 + index * 45, duration: 650, easing: ease }));

      await Promise.all([
        ...reveals,
        animate(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: "ease-out" }),
        flyToTargets(face, smile, 1320),
      ]);
      if (!finished) await gravityTrail?.finish();
    } finally {
      finish();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => play().catch(finish), { once: true });
  } else {
    play().catch(finish);
  }
})();

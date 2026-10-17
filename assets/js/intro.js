/* The entrance starts with the black hole and smile centered, then sends each to its
   position in the page after the one-eye wink. */
(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches || !Element.prototype.animate) return;

  const root = document.documentElement;
  const listeners = new AbortController();
  const animations = new Set();
  let overlay;
  let finished = false;
  let watchdog;
  let flightFrame;
  let resolveFlight;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    cancelAnimationFrame(flightFrame);
    resolveFlight?.();
    resolveFlight = null;
    listeners.abort();
    root.classList.remove("intro-pending");
    animations.forEach((animation) => animation.cancel());
    overlay?.remove();
  }

  function animate(element, frames, options) {
    const animation = element.animate(frames, { fill: "both", ...options });
    animations.add(animation);
    // Cancellation is also used when the fixed entrance hands off to the
    // scroll-aware flight.
    return animation.finished.catch(() => {});
  }

  function wait(duration) {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }

  function flyToTargets(blackHole, face, halo, smile, duration) {
    const blackHoleStart = blackHole.getBoundingClientRect();
    const faceStart = face.getBoundingClientRect();

    // Finished Web Animations keep their last frame. Lock that visual state into
    // regular styles so this flight can be steered on every animation frame.
    blackHole.getAnimations().forEach((animation) => animation.cancel());
    face.getAnimations().forEach((animation) => animation.cancel());
    Object.assign(blackHole.style, {
      left: `${blackHoleStart.left}px`,
      top: `${blackHoleStart.top}px`,
      width: `${blackHoleStart.width}px`,
      height: `${blackHoleStart.height}px`,
      opacity: 1,
      transform: "rotate(0deg)",
    });
    Object.assign(face.style, {
      left: `${faceStart.left}px`,
      top: `${faceStart.top}px`,
      width: `${faceStart.width}px`,
      height: `${faceStart.height}px`,
      opacity: 1,
      scale: 1,
    });

    const mix = (start, end, amount) => start + (end - start) * amount;
    const startedAt = performance.now();

    return new Promise((resolve) => {
      resolveFlight = resolve;

      const step = (now) => {
        if (finished) return;
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - (1 - progress) ** 4;
        // These rectangles are intentionally read on every frame. Scrolling in
        // either direction moves the destination, and the clones follow it.
        const blackHoleEnd = halo.getBoundingClientRect();
        const faceEnd = smile.getBoundingClientRect();

        Object.assign(blackHole.style, {
          left: `${mix(blackHoleStart.left, blackHoleEnd.left, eased)}px`,
          top: `${mix(blackHoleStart.top, blackHoleEnd.top, eased)}px`,
          width: `${mix(blackHoleStart.width, blackHoleEnd.width, eased)}px`,
          height: `${mix(blackHoleStart.height, blackHoleEnd.height, eased)}px`,
          transform: `rotate(${360 * eased}deg)`,
        });
        Object.assign(face.style, {
          left: `${mix(faceStart.left, faceEnd.left, eased)}px`,
          top: `${mix(faceStart.top, faceEnd.top, eased)}px`,
          width: `${mix(faceStart.width, faceEnd.width, eased)}px`,
          height: `${mix(faceStart.height, faceEnd.height, eased)}px`,
        });

        if (progress < 1) {
          flightFrame = requestAnimationFrame(step);
          return;
        }
        flightFrame = undefined;
        resolveFlight = null;
        resolve();
      };

      flightFrame = requestAnimationFrame(step);
    });
  }

  root.classList.add("intro-pending");
  watchdog = setTimeout(finish, 20000);
  window.addEventListener("pagehide", finish, { passive: true, signal: listeners.signal });
  document.addEventListener("portfolio:intro-finish", finish, { signal: listeners.signal });
  reducedMotion.addEventListener(
    "change",
    (event) => {
      if (event.matches) finish();
    },
    { signal: listeners.signal },
  );

  async function play() {
    if (finished) return;
    clearTimeout(watchdog);
    watchdog = setTimeout(finish, 12000);
    const halo = document.querySelector(".home-page .cosmic-halo");
    const smile = document.querySelector(".home-page .hero-note .smile");
    if (!halo || !smile || document.hidden) {
      finish();
      return;
    }

    try {
      overlay = document.createElement("div");
      overlay.className = "portfolio-intro";
      overlay.setAttribute("aria-hidden", "true");
      const blackHole = halo.cloneNode(true);
      blackHole.setAttribute("class", "portfolio-intro__black-hole black-hole");
      const face = smile.cloneNode(true);
      face.setAttribute("class", "portfolio-intro__face");
      const eyes = face.querySelector(".smile-eyes");
      // Separate the existing eye strokes so only the right eye winks.
      eyes.removeAttribute("class");
      eyes.replaceChildren();
      for (const x of [12, 20]) {
        const eye = document.createElementNS("http://www.w3.org/2000/svg", "path");
        eye.setAttribute("d", `M${x} 11v2.5`);
        eye.setAttribute("class", "portfolio-intro__eye");
        eyes.appendChild(eye);
      }
      face.lastElementChild?.setAttribute("d", "M7 18c5 6 13 6 18 0");

      const viewportWidth = document.documentElement.clientWidth || innerWidth;
      const viewportHeight = document.documentElement.clientHeight || innerHeight;
      const centerX = viewportWidth / 2;
      const centerY = viewportHeight / 2;
      const blackHoleSize = Math.min(viewportWidth * 0.68, viewportHeight * 0.78, 1100);
      const faceSize = blackHoleSize * 0.46;
      const faceStartLeft = centerX - faceSize / 2;
      const faceStartTop = centerY - faceSize / 2 - faceSize * 0.05 + 3;
      Object.assign(blackHole.style, {
        left: `${centerX}px`,
        top: `${centerY}px`,
        width: `${blackHoleSize}px`,
        height: `${blackHoleSize}px`,
        transform: "translate(-50%, -50%)",
      });
      Object.assign(face.style, {
        left: `${faceStartLeft}px`,
        top: `${faceStartTop}px`,
        width: `${faceSize}px`,
        height: `${faceSize}px`,
      });
      overlay.append(blackHole, face);
      document.body.appendChild(overlay);
      window.addEventListener(
        "resize",
        () => {
          if (
            document.documentElement.clientWidth !== viewportWidth ||
            document.documentElement.clientHeight !== viewportHeight
          ) finish();
        },
        { passive: true, signal: listeners.signal },
      );
      const ease = "cubic-bezier(.18,.78,.2,1)";
      await Promise.all([
        animate(
          face,
          [
            { opacity: 0, scale: 0.86 },
            { opacity: 1, scale: 1 },
          ],
          { duration: 500, easing: ease },
        ),
        animate(
          blackHole,
          [
            { opacity: 0, transform: "translate(-50%, -50%) scale(.84)" },
            { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
          ],
          { duration: 620, easing: ease },
        ),
      ]);
      if (finished) return;
      await animate(
        eyes.lastElementChild,
        [
          { transform: "scaleY(1)" },
          { transform: "scaleY(.08)", offset: 0.45 },
          { transform: "scaleY(.08)", offset: 0.6 },
          { transform: "scaleY(1)" },
        ],
        { delay: 100, duration: 260, easing: "ease-in-out" },
      );
      if (finished) return;
      await wait(550);
      if (finished) return;

      const reveals = [
        ...document.querySelectorAll(
          ".home-page .site-header, .home-page .hero-copy, .home-page .creative-stage, .home-page .home-paths, .home-page .footer",
        ),
      ].map((element, index) =>
        animate(element, [{ opacity: 0 }, { opacity: 1 }], {
          delay: 120 + index * 65,
          duration: 680,
          easing: "ease-out",
        }),
      );
      // The face and black hole travel together; keep both visible until both arrive.
      await Promise.all([
        ...reveals,
        flyToTargets(blackHole, face, halo, smile, 2200),
      ]);
      if (!finished) await wait(180);
    } finally {
      finish();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        play().catch(finish);
      },
      { once: true },
    );
  } else {
    play().catch(finish);
  }
})();

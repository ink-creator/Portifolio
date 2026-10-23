(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  const timers = new Set();
  const transitionClasses = ["page-transition-out", "about-transition-out", "projects-transition-out"];
  let transition;
  let bodyStyles;

  function later(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  }

  function lockPage() {
    const lockedScroll = scrollY;
    const width = root.clientWidth;
    const properties = ["position", "top", "left", "right", "width"];
    bodyStyles = properties.map((property) => [property, document.body.style.getPropertyValue(property)]);
    document.body.dataset.transitionScroll = String(lockedScroll);
    Object.assign(document.body.style, {
      position: "fixed", top: `${-lockedScroll}px`, left: "0", right: "0", width: `${width}px`,
    });
    root.classList.add("route-transition-lock");
  }

  function unlockPage() {
    const storedScroll = document.body.dataset.transitionScroll;
    if (storedScroll === undefined && !root.classList.contains("route-transition-lock")) return;
    root.classList.remove("route-transition-lock");
    bodyStyles?.forEach(([property, value]) => {
      if (value) document.body.style.setProperty(property, value);
      else document.body.style.removeProperty(property);
    });
    bodyStyles = undefined;
    delete document.body.dataset.transitionScroll;
    const lockedScroll = Number(storedScroll);
    if (Number.isFinite(lockedScroll)) scrollTo({ top: lockedScroll, behavior: "instant" });
  }

  function resetTransition() {
    timers.forEach(clearTimeout);
    timers.clear();
    transition?.trail?.destroy();
    transition?.animation?.cancel();
    transition = undefined;
    unlockPage();
    document.body.classList.remove(...transitionClasses);
    document.querySelectorAll(".page-transition-cosmos").forEach((scene) => scene.remove());
    document.querySelectorAll("[data-transition-source]").forEach((source) => {
      source.style.removeProperty("visibility");
      source.removeAttribute("data-transition-source");
    });
  }

  addEventListener("pageshow", resetTransition);
  addEventListener("pagehide", resetTransition);

  function navigate() {
    if (!transition || transition.navigated) return;
    transition.navigated = true;
    transition.trail?.finish();
    location.assign(transition.destination);
    // If navigation is stopped or fails, restore a usable page.
    later(resetTransition, 1200);
  }

  function syncDisk(from, to) {
    const source = from.getAnimations({ subtree: true }).filter((item) => item.animationName);
    const target = to.getAnimations({ subtree: true }).filter((item) => item.animationName);
    target.forEach((animation, index) => {
      if (animation.animationName === source[index]?.animationName) {
        animation.currentTime = source[index].currentTime;
      }
    });
  }

  function leaveWithBlackHole(destination, direction) {
    document.dispatchEvent(new Event("portfolio:intro-finish"));
    const source = document.querySelector(direction === "down" ? ".cosmic-halo" : ".about-end-black-hole");
    if (!source || !source.getBoundingClientRect().width) {
      location.assign(destination);
      return;
    }

    const rect = source.getBoundingClientRect();
    const size = rect.width;
    const startLeft = rect.left;
    // The about-page scene may be below the fold; let it enter from that edge.
    const startTop = direction === "up" && rect.top > innerHeight
      ? innerHeight - size * 0.08
      : rect.top;
    const centerLeft = (root.clientWidth - size) / 2;
    const centerTop = (innerHeight - size) / 2;
    const endTop = direction === "down" ? innerHeight - size * 0.16 : -size * 0.85;
    const arc = Math.min(root.clientWidth * 0.055, 74) * (direction === "down" ? 1 : -1);
    const blackHole = source.cloneNode(true);
    blackHole.className = "cosmic-halo black-hole page-transition-cosmos";
    blackHole.setAttribute("aria-hidden", "true");
    Object.assign(blackHole.style, {
      left: `${startLeft}px`, top: `${startTop}px`, width: `${size}px`, height: `${size}px`,
      opacity: "1", transform: "none", transformOrigin: "center", willChange: "transform, opacity",
    });
    source.dataset.transitionSource = "true";
    source.style.visibility = "hidden";
    document.body.appendChild(blackHole);
    syncDisk(source, blackHole);
    lockPage();
    document.body.classList.add(direction === "down" ? "about-transition-out" : "projects-transition-out");
    transition = { destination, navigated: false };

    try {
      transition.trail = window.PortfolioGravityTrail?.create(blackHole, { zIndex: 99 });
      transition.animation = blackHole.animate([
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
        {
          transform: `translate3d(${centerLeft - startLeft + arc}px, ${(centerTop - startTop) * 0.5}px, 0) scale(1.14)`,
          opacity: 1, offset: 0.3,
        },
        {
          transform: `translate3d(${centerLeft - startLeft}px, ${centerTop - startTop}px, 0) scale(1.32)`,
          opacity: 1, offset: 0.63,
        },
        {
          transform: `translate3d(${centerLeft - startLeft - arc * 0.25}px, ${endTop - startTop}px, 0) scale(1.04)`,
          opacity: 0.3,
        },
      ], { duration: 780, delay: 60, easing: "cubic-bezier(.35,.03,.32,1)", fill: "forwards" });
      transition.animation.finished.then(navigate).catch(() => {});
      later(navigate, 1000);
    } catch {
      navigate();
    }
  }

  reducedMotion.addEventListener("change", (event) => {
    if (event.matches && transition) {
      transition.trail?.destroy();
      navigate();
    }
  });

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (
      !link || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      link.target || link.hasAttribute("download") || reducedMotion.matches || !Element.prototype.animate
    ) return;

    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin ||
      (destination.pathname === location.pathname && destination.search === location.search)) return;
    const destinationPath = destination.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "");
    const goesToProjects = destinationPath.endsWith("/projetos");
    const goesToAbout = destinationPath.endsWith("/sobre");
    const fromHome = document.body.classList.contains("home-page");
    const fromProjects = document.body.classList.contains("projects-page");
    const fromAbout = document.body.classList.contains("about-page");
    const fallsToAbout = goesToAbout && (fromHome || fromProjects);
    const risesToPortfolio = goesToProjects && fromAbout;
    const fadesToPortfolio = goesToProjects && fromHome;
    if (!fallsToAbout && !risesToPortfolio && !fadesToPortfolio) return;

    event.preventDefault();
    if (transition) return;
    if (fallsToAbout || risesToPortfolio) {
      leaveWithBlackHole(destination.href, fallsToAbout ? "down" : "up");
      return;
    }
    document.dispatchEvent(new Event("portfolio:intro-finish"));
    transition = { destination: destination.href, navigated: false };
    document.body.classList.add("page-transition-out");
    later(navigate, 240);
  });

  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");
  if (!toggle || !nav) return;
  const setOpen = (open) => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
  matchMedia("(min-width: 541px)").addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });
})();

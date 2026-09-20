(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;

  function lockPage() {
    const lockedScroll = scrollY;
    document.body.dataset.transitionScroll = String(lockedScroll);
    Object.assign(document.body.style, {
      position: "fixed",
      top: `${-lockedScroll}px`,
      left: "0",
      right: "0",
      width: "100%",
    });
    root.classList.add("route-transition-lock");
  }

  function unlockPage() {
    const storedScroll = document.body.dataset.transitionScroll;
    if (storedScroll === undefined && !root.classList.contains("route-transition-lock")) return;
    const lockedScroll = Number(storedScroll);
    root.classList.remove("route-transition-lock");
    document.body.style.removeProperty("position");
    document.body.style.removeProperty("top");
    document.body.style.removeProperty("left");
    document.body.style.removeProperty("right");
    document.body.style.removeProperty("width");
    delete document.body.dataset.transitionScroll;
    if (Number.isFinite(lockedScroll)) scrollTo(0, lockedScroll);
  }

  addEventListener("pageshow", () => {
    unlockPage();
    document.body.classList.remove(
      "page-transition-out",
      "about-transition-out",
      "projects-transition-out",
    );
    document.querySelector(".page-transition-star")?.remove();
    document.querySelectorAll("[data-transition-source]").forEach((source) => {
      source.style.removeProperty("visibility");
      source.removeAttribute("data-transition-source");
    });
  });

  function leaveWithStar(destination, direction) {
    document.dispatchEvent(new Event("portfolio:intro-finish"));
    const source = document.querySelector(
      direction === "down" ? ".cosmic-halo" : ".about-end-star",
    );
    if (!source) {
      location.assign(destination);
      return;
    }

    const rect = source.getBoundingClientRect();
    const size = rect.width;
    const startLeft = direction === "down" ? rect.left : (innerWidth - size) / 2;
    const startTop = direction === "down" ? rect.top : innerHeight + 50;
    const star = source.cloneNode(true);
    star.setAttribute("class", "cosmic-halo page-transition-star");
    star.setAttribute("aria-hidden", "true");
    Object.assign(star.style, {
      left: `${startLeft}px`,
      top: `${startTop}px`,
      width: `${size}px`,
      height: `${size}px`,
      transform: "none",
    });
    source.dataset.transitionSource = "true";
    source.style.visibility = "hidden";
    document.body.appendChild(star);
    lockPage();
    document.body.classList.add(
      direction === "down" ? "about-transition-out" : "projects-transition-out",
    );

    let navigated = false;
    const navigate = () => {
      if (navigated) return;
      navigated = true;
      location.assign(destination);
    };
    const frames =
      direction === "down"
        ? [
            { top: `${startTop}px`, rotate: "0deg", scale: 1, opacity: 1 },
            {
              top: `${Math.max(18, innerHeight * 0.08)}px`,
              rotate: "0deg",
              scale: 1,
              opacity: 1,
              offset: 0.38,
            },
            {
              top: `${innerHeight - size * 0.18}px`,
              rotate: "0deg",
              scale: 1,
              opacity: 0.88,
            },
          ]
        : [
            { top: `${startTop}px`, rotate: "0deg", scale: 1, opacity: 0.88 },
            {
              top: `${innerHeight * 0.18}px`,
              rotate: "0deg",
              scale: 1,
              opacity: 1,
              offset: 0.62,
            },
            { top: `${-size / 2}px`, rotate: "0deg", scale: 1, opacity: 1 },
          ];
    // Let every text block disappear before the star starts moving.
    setTimeout(() => {
      const flight = star.animate(frames, {
        duration: 920,
        easing: "cubic-bezier(.48,.04,.86,.36)",
        fill: "forwards",
      });
      flight.finished.then(navigate).catch(navigate);
    }, 360);
    setTimeout(navigate, 1500);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target ||
      link.hasAttribute("download") ||
      reducedMotion.matches
    )
      return;

    const destination = new URL(link.href, location.href);
    const destinationPath = destination.pathname.replace(/\/+$/, "");
    if (destination.origin !== location.origin) return;

    const goesToProjects = destinationPath.endsWith("/projetos");
    const goesToAbout = destinationPath.endsWith("/sobre");
    const fromHome = document.body.classList.contains("home-page");
    const fromProjects = document.body.classList.contains("projects-page");
    const fromAbout = document.body.classList.contains("about-page");
    const fallsToAbout = goesToAbout && (fromHome || fromProjects);
    const risesToProjects = goesToProjects && fromAbout;
    const fadesToProjects = goesToProjects && fromHome;
    if (!fallsToAbout && !risesToProjects && !fadesToProjects) return;

    event.preventDefault();
    if (
      document.body.classList.contains("page-transition-out") ||
      document.body.classList.contains("about-transition-out") ||
      document.body.classList.contains("projects-transition-out")
    )
      return;
    if (fallsToAbout) {
      leaveWithStar(destination.href, "down");
      return;
    }
    if (risesToProjects) {
      leaveWithStar(destination.href, "up");
      return;
    }
    document.body.classList.add("page-transition-out");
    setTimeout(() => location.assign(destination.href), 280);
  });

  document
    .querySelectorAll("[data-year]")
    .forEach((el) => (el.textContent = new Date().getFullYear()));
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

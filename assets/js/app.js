(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // Add a brief exit only when leaving the introduction for the projects page.
  // The pageshow cleanup also makes the transition safe with the back/forward cache.
  addEventListener("pageshow", () => document.body.classList.remove("page-transition-out"));
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (
      !document.body.classList.contains("home-page") ||
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
    if (destination.origin !== location.origin || !destinationPath.endsWith("/projetos")) return;

    event.preventDefault();
    if (document.body.classList.contains("page-transition-out")) return;
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

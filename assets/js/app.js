(() => {
  document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");
  if (!toggle || !nav) return;
  const setOpen = open => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", event => { if(event.target.closest("a")) setOpen(false); });
  document.addEventListener("click", event => { if(!nav.contains(event.target) && !toggle.contains(event.target)) setOpen(false); });
  document.addEventListener("keydown", event => {
    if(event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { setOpen(false); toggle.focus(); }
  });
  matchMedia("(min-width: 541px)").addEventListener("change", event => { if(event.matches) setOpen(false); });
})();

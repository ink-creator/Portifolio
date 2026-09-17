window.Portfolio = (() => {
  const typeNames = {
      web: "Web",
      desktop: "Desktop",
      mobile: "Mobile",
      backend: "Backend",
      api: "API",
      library: "Biblioteca",
      automation: "Automação",
      game: "Game",
      other: "Outro",
    },
    statusNames = {
      completed: "Concluído",
      "in-progress": "Em andamento",
      paused: "Pausado",
      archived: "Arquivado",
    };
  let cache;
  function base() {
    const p = location.pathname;
    for (const m of ["/projetos/", "/projeto/", "/admin/", "/sobre/"])
      if (p.includes(m)) return p.split(m)[0] + "/";
    return p.endsWith("/") ? p : p.substring(0, p.lastIndexOf("/") + 1);
  }
  function asset(v = "") {
    const value = String(v);
    return /^(?:data:|https?:|\/\/|\/)/i.test(value) ? value : base() + value.replace(/^\.\//, "");
  }
  async function loadProjects() {
    if (cache) return cache;
    const r = await fetch(base() + "data/projects.json", { cache: "no-store" });
    if (!r.ok) throw new Error("Não foi possível carregar os projetos.");
    const d = await r.json();
    if (!Array.isArray(d.projects)) throw new Error("Formato de projetos inválido.");
    cache = d.projects;
    return cache;
  }
  function e(v = "") {
    return String(v).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c],
    );
  }
  function card(p) {
    const cover = p.media?.cover
        ? `<img src="${e(asset(p.media.cover))}" alt="Capa de ${e(p.title)}" loading="lazy">`
        : `<div class="cover-placeholder"><small>INK × STELLA / ${e(typeNames[p.type] || "PROJETO")}</small><span>${e(p.title)}</span><b aria-hidden="true">↗</b></div>`,
      creators = (p.creators || []).join(" + ");
    return `<article class="project-card"><a class="card-cover" href="${base()}projeto/?id=${encodeURIComponent(p.id)}">${cover}</a><div class="card-body"><div class="card-meta"><span>${p.featured ? "✦ Destaque · " : ""}${typeNames[p.type] || "Outro"}</span><span>${statusNames[p.status] || ""}</span></div><h3><a href="${base()}projeto/?id=${encodeURIComponent(p.id)}">${e(p.title)}</a></h3>${creators ? `<small class="project-creators">por ${e(creators)}</small>` : ""}<p>${e(p.shortDescription || "")}</p><div class="tags">${(
      p.technologies || []
    )
      .slice(0, 4)
      .map((t) => `<span class="tag">${e(t)}</span>`)
      .join(
        "",
      )}</div><a class="card-link" href="${base()}projeto/?id=${encodeURIComponent(p.id)}">Ver projeto →</a></div></article>`;
  }
  function renderProjectGrid(c, p) {
    c.innerHTML = p.length
      ? [...p]
          .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
          .map(card)
          .join("")
      : `<div class="empty-state">Nenhum projeto encontrado.</div>`;
  }
  return {
    loadProjects,
    renderProjectGrid,
    typeNames,
    statusNames,
    escapeHTML: e,
    getBasePath: base,
    assetURL: asset,
  };
})();

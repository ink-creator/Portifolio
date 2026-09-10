document.addEventListener("DOMContentLoaded", async () => {
  const root = document.querySelector("#project-detail");
  const query = new URLSearchParams(location.search);
  const id = query.get("id");
  let project;
  try {
    // A preview must show the current form, even when this ID is already published.
    if (query.get("preview") === "1") {
      const draft = await PortfolioDrafts.get("preview");
      if (draft?.id === id) project = draft;
      if (!project) {
        const legacy = sessionStorage.getItem("portfolio-preview");
        if (legacy) { const parsed = JSON.parse(legacy); if (parsed.id === id) project = parsed; }
      }
    }
    if (!project) project = (await Portfolio.loadProjects()).find(p => p.id === id);
  } catch {
    root.innerHTML = '<div class="empty-state"><h2>Não foi possível abrir este projeto.</h2><p>Tente carregar a página novamente.</p><a class="button secondary" href="../projetos/">Voltar para projetos</a></div>';
    return;
  }
  if (!project) {
    root.innerHTML = '<div class="empty-state"><h2>Projeto não encontrado.</h2><p>Explore os outros projetos da dupla.</p><a class="button primary" href="../projetos/">Explorar projetos →</a></div>';
    return;
  }
  const p = project, e = Portfolio.escapeHTML, u = Portfolio.assetURL, media = p.media || {}, links = p.links || {};
  document.title = p.title + " — Ink × Stella";
  const description = document.querySelector('meta[name="description"]');
  if(description) description.content = p.shortDescription || p.title;
  const actions = [["github","GitHub"],["demo","Ver demo"],["download","Download"],["documentation","Documentação"]]
    .filter(([key]) => /^https?:\/\//i.test(links[key] || ""))
    .map(([key,title]) => '<a class="button secondary" target="_blank" rel="noopener" href="'+e(links[key])+'">'+title+' ↗</a>').join("");
  root.innerHTML = `<div class="detail-header"><div><span class="badge">${e(Portfolio.typeNames[p.type]||"Outro")}</span><span class="badge">${e(Portfolio.statusNames[p.status]||"")}</span></div><h1>${e(p.title)}</h1>${p.creators?.length?`<span class="project-creators">por ${e(p.creators.join(" + "))}</span>`:""}<p>${e(p.shortDescription||"")}</p><div class="hero-actions">${actions}</div></div>${media.cover?`<img class="detail-cover" src="${e(u(media.cover))}" alt="Capa de ${e(p.title)}">`:""}<section class="detail-section"><h2>Sobre o projeto</h2><p>${e(p.description||p.shortDescription||"")}</p></section><section class="detail-section"><h2>Tecnologias</h2><div class="tags">${(p.technologies||[]).map(t=>`<span class="tag">${e(t)}</span>`).join("")}</div></section>${(media.images||[]).length?`<section class="detail-section"><h2>Imagens do projeto</h2><div class="gallery">${media.images.map((src,i)=>`<img src="${e(u(src))}" alt="${e(p.title)} — imagem ${i+1}" loading="lazy">`).join("")}</div></section>`:""}${media.video?`<section class="detail-section"><h2>Vídeo</h2><video class="project-video" controls preload="metadata" src="${e(u(media.video))}"></video></section>`:""}`;
});

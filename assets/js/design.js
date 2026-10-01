(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const e = Portfolio.escapeHTML;
  const asset = Portfolio.assetURL;
  const safeImage = (value) =>
    typeof value === "string" && /^(?:data:image\/(?:png|jpeg|webp);base64,|https?:\/\/|assets\/)/i.test(value);
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
  const humanize = (value) =>
    String(value || "Outro")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const gallery = $("#design-gallery");
  const categoryRoot = $("#design-categories");
  const search = $("#design-search");
  const toolFilter = $("#tool-filter");
  const tagFilter = $("#tag-filter");
  const resultCount = $("#design-results");
  const activeFilterCount = $("#active-filter-count");
  const projectDialog = $("#design-project-dialog");
  const projectContent = $("#design-project-content");
  const lightbox = $("#design-lightbox");
  const lightboxStage = $("#lightbox-stage");
  const lightboxImage = $("#lightbox-image");
  const lightboxCaption = $("#lightbox-caption");
  const toast = $("#design-toast");

  const state = {
    projects: [],
    categories: [],
    category: "all",
    query: "",
    tool: "all",
    tag: "all",
    active: null,
    images: [],
    imageIndex: 0,
    zoom: 1,
    x: 0,
    y: 0,
    dragging: false,
    dragX: 0,
    dragY: 0,
  };

  function categoryName(id) {
    return state.categories.find((category) => category.id === id)?.label || humanize(id);
  }

  function categoryChildren(id) {
    return state.categories.filter((category) => category.parent === id);
  }

  function categoryMatches(selectedId, projectCategory) {
    if (selectedId === "all") return true;
    if (projectCategory === selectedId) return true;
    let current = state.categories.find((category) => category.id === projectCategory);
    while (current?.parent) {
      if (current.parent === selectedId) return true;
      current = state.categories.find((category) => category.id === current.parent);
    }
    return false;
  }

  function formatDate(value) {
    if (!value) return "";
    const match = String(value).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!match) return String(value);
    if (!match[2]) return match[1];
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1)));
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
      .format(date)
      .replace(". de ", " ");
  }

  function projectImages(project) {
    const candidates = [project.media?.cover, ...list(project.media?.images)].filter(safeImage);
    return [...new Set(candidates)];
  }

  function setSelectOptions(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = `<option value="all">${e(allLabel)}</option>${values
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((value) => `<option value="${e(value)}">${e(value)}</option>`)
      .join("")}`;
    select.value = values.includes(current) ? current : "all";
  }

  function renderFilterOptions() {
    const tools = [...new Set(state.projects.flatMap((project) => list(project.tools)))];
    const tags = [...new Set(state.projects.flatMap((project) => list(project.tags)))];
    setSelectOptions(toolFilter, tools, "Todas");
    setSelectOptions(tagFilter, tags, "Todas");

    const rootCategories = state.categories.filter((category) => !category.parent);
    const categoryButton = (category, className = "") => {
      const active = category.id === state.category;
      return `<button class="design-category${className}${active ? " active" : ""}" type="button" data-category="${e(category.id)}" aria-pressed="${active}">${e(category.label)}</button>`;
    };
    categoryRoot.innerHTML = `${categoryButton({ id: "all", label: "Todos" })}${rootCategories
      .map((category) => {
        const children = categoryChildren(category.id);
        if (!children.length) return categoryButton(category);
        return `<div class="design-folder">${categoryButton(category, " design-folder-button")}<div class="design-subfolders" aria-label="Subpastas de ${e(category.label)}">${children.map((child) => categoryButton(child, " design-subfolder")).join("")}</div></div>`;
      })
      .join("")}`;
  }

  function matches(project) {
    if (!categoryMatches(state.category, project.category)) return false;
    if (state.tool !== "all" && !list(project.tools).includes(state.tool)) return false;
    if (state.tag !== "all" && !list(project.tags).includes(state.tag)) return false;
    if (!state.query) return true;
    const searchable = [
      project.title,
      project.category,
      categoryName(project.category),
      project.shortDescription,
      project.description,
      project.creator,
      ...list(project.tools),
      ...list(project.tags),
    ];
    return normalize(searchable.join(" ")).includes(normalize(state.query));
  }

  function emptyState(filtered) {
    const hasFilters =
      state.query || state.category !== "all" || state.tool !== "all" || state.tag !== "all";
    if (!state.projects.length) {
      return `<div class="design-empty"><div><div class="design-empty-mark" aria-hidden="true">✦</div><h3>O primeiro trabalho vem aí.</h3><p>Esta galeria está pronta para receber designs, identidades visuais e plantas baixas da Stella.</p></div></div>`;
    }
    if (!filtered.length && hasFilters) {
      return `<div class="design-empty"><div><div class="design-empty-mark" aria-hidden="true">⌕</div><h3>Nenhum trabalho encontrado.</h3><p>Tente outra busca ou limpe os filtros para ver toda a galeria.</p><button class="button secondary" type="button" data-clear-all>Limpar filtros</button></div></div>`;
    }
    return `<div class="design-empty"><div><div class="design-empty-mark" aria-hidden="true">✦</div><h3>Nenhum trabalho publicado nesta categoria ainda.</h3></div></div>`;
  }

  function renderCard(project) {
    const cover = safeImage(project.media?.cover)
      ? `<img src="${e(asset(project.media.cover))}" alt="${e(project.coverAlt || `Capa de ${project.title}`)}" loading="lazy" decoding="async">`
      : `<div class="design-card-placeholder"><strong>Imagem ainda não publicada</strong><span>${e(project.title)}</span></div>`;
    const date = formatDate(project.date);
    const creator = project.creator || list(project.creators).join(" + ");
    return `<article class="design-card${project.featured ? " featured" : ""}"><button class="design-card-open" type="button" data-open-project="${e(project.id)}" aria-label="Abrir ${e(project.title)}"><figure class="design-card-visual">${cover}${project.featured ? '<span class="design-card-marker">✦ Destaque</span>' : ""}</figure><div class="design-card-body"><div class="design-card-meta"><span>${e(categoryName(project.category))}</span>${date ? `<time datetime="${e(project.date)}">${e(date)}</time>` : ""}</div><h3>${e(project.title)}</h3>${project.shortDescription ? `<p>${e(project.shortDescription)}</p>` : ""}<div class="design-card-foot">${creator ? `<span>por ${e(creator)}</span>` : "<span></span>"}<span>Ver trabalho →</span></div></div></button></article>`;
  }

  function render() {
    const filtered = state.projects
      .filter(matches)
      .sort(
        (a, b) =>
          Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
          String(b.date || "").localeCompare(String(a.date || "")),
      );
    gallery.innerHTML = filtered.length ? filtered.map(renderCard).join("") : emptyState(filtered);
    gallery.setAttribute("aria-busy", "false");
    const total = filtered.length;
    resultCount.textContent = `${total} ${total === 1 ? "trabalho" : "trabalhos"}`;
    $$(".design-category", categoryRoot).forEach((button) => {
      const active = button.dataset.category === state.category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const secondaryCount = Number(state.tool !== "all") + Number(state.tag !== "all");
    activeFilterCount.hidden = secondaryCount === 0;
    activeFilterCount.textContent = secondaryCount;
  }

  function clearFilters() {
    state.query = "";
    state.category = "all";
    state.tool = "all";
    state.tag = "all";
    search.value = "";
    toolFilter.value = "all";
    tagFilter.value = "all";
    render();
  }

  function infoFacts(project) {
    const facts = [
      ["Categoria", categoryName(project.category)],
      ["Data", formatDate(project.date)],
      ["Autoria", project.creator || list(project.creators).join(" + ")],
      ["Ambiente", project.floorPlan?.environment],
      ["Área aproximada", project.floorPlan?.area],
      ["Escala", project.floorPlan?.scale],
      ["Versão", project.floorPlan?.version],
    ].filter(([, value]) => value);
    return facts.length
      ? `<div class="design-facts">${facts
          .map(
            ([label, value]) =>
              `<div class="design-fact"><small>${e(label)}</small><strong>${e(value)}</strong></div>`,
          )
          .join("")}</div>`
      : "";
  }

  function galleryMarkup(project) {
    const images = projectImages(project);
    if (!images.length) return "";
    const multiple = images.length > 1;
    return `<section class="design-viewer" aria-labelledby="gallery-title"><div class="design-detail-section"><h3 id="gallery-title">Galeria</h3></div><div class="design-viewer-main">${multiple ? '<button class="viewer-step previous" type="button" data-gallery-step="-1" aria-label="Imagem anterior">←</button>' : ""}<img id="design-viewer-image" src="${e(asset(images[0]))}" alt="${e(project.title)} — imagem 1 de ${images.length}" data-open-lightbox>${multiple ? '<button class="viewer-step next" type="button" data-gallery-step="1" aria-label="Próxima imagem">→</button>' : ""}<button class="viewer-expand" type="button" data-open-lightbox>Ampliar ↗</button></div>${multiple ? `<div class="design-thumbnails" aria-label="Escolher imagem">${images.map((source, index) => `<button class="design-thumbnail${index === 0 ? " active" : ""}" type="button" data-gallery-index="${index}" aria-label="Ver imagem ${index + 1}"><img src="${e(asset(source))}" alt="" loading="lazy" decoding="async"></button>`).join("")}</div>` : ""}</section>`;
  }

  function comparisonMarkup(project) {
    const comparison = project.comparison || {};
    if (!safeImage(comparison.before) || !safeImage(comparison.after)) return "";
    const beforeLabel = comparison.beforeLabel || "Antes";
    const afterLabel = comparison.afterLabel || "Depois";
    return `<section class="design-detail-section"><h3>Comparação</h3><div class="comparison-frame" id="comparison-frame"><img src="${e(asset(comparison.before))}" alt="${e(`${project.title} — ${beforeLabel}`)}" loading="lazy"><div class="comparison-after"><img src="${e(asset(comparison.after))}" alt="${e(`${project.title} — ${afterLabel}`)}" loading="lazy"></div><span class="comparison-label before">${e(beforeLabel)}</span><span class="comparison-label after">${e(afterLabel)}</span><span class="comparison-divider" aria-hidden="true"></span><input class="comparison-range" type="range" min="0" max="100" value="50" aria-label="Comparar ${e(beforeLabel)} e ${e(afterLabel)}"></div></section>`;
  }

  function tagsMarkup(project) {
    const tools = list(project.tools);
    const tags = list(project.tags);
    if (!tools.length && !tags.length) return "";
    return `<section class="design-detail-section"><h3>Detalhes</h3>${tools.length ? `<p><strong>Ferramentas:</strong> ${e(tools.join(" · "))}</p>` : ""}${tags.length ? `<div class="design-detail-tags">${tags.map((tag) => `<span>${e(tag)}</span>`).join("")}</div>` : ""}</section>`;
  }

  function textSection(title, value) {
    return value
      ? `<section class="design-detail-section"><h3>${e(title)}</h3><p>${e(value)}</p></section>`
      : "";
  }

  function renderProject(project) {
    const cover = safeImage(project.media?.cover)
      ? `<img src="${e(asset(project.media.cover))}" alt="${e(project.coverAlt || `Capa de ${project.title}`)}">`
      : `<div class="design-card-placeholder"><strong>Imagem ainda não publicada</strong><span>${e(project.title)}</span></div>`;
    const date = formatDate(project.date);
    const creator = project.creator || list(project.creators).join(" + ");
    projectContent.innerHTML = `<article><header class="design-detail-hero"><div class="design-detail-cover">${cover}</div><div class="design-detail-heading"><div class="design-detail-kicker"><span>${e(categoryName(project.category))}</span>${project.featured ? "<span>✦ Destaque</span>" : ""}</div><h2 id="dialog-title">${e(project.title)}</h2>${project.shortDescription ? `<p>${e(project.shortDescription)}</p>` : ""}${creator || date ? `<div class="design-detail-byline">${creator ? `por ${e(creator)}` : ""}${creator && date ? " · " : ""}${date ? e(date) : ""}</div>` : ""}<div class="design-detail-actions"><button type="button" data-share-project>Copiar link ↗</button>${projectImages(project).length ? '<button type="button" data-open-lightbox>Ver em tela cheia</button>' : ""}</div></div></header><div class="design-detail-body">${infoFacts(project)}${textSection("Sobre o projeto", project.description)}${galleryMarkup(project)}${comparisonMarkup(project)}${tagsMarkup(project)}${textSection("Observações", project.notes)}${textSection("Créditos", project.credits)}</div></article>`;
    state.active = project;
    state.images = projectImages(project);
    state.imageIndex = 0;
    const range = $(".comparison-range", projectContent);
    range?.addEventListener("input", () => {
      $("#comparison-frame", projectContent).style.setProperty("--comparison", `${range.value}%`);
    });
  }

  function projectHash(id) {
    return `#design/${encodeURIComponent(id)}`;
  }

  function openProject(id, updateUrl = true) {
    const project = state.projects.find((item) => item.id === id);
    if (!project) {
      showToast("Este trabalho não foi encontrado ou ainda não está publicado.");
      return;
    }
    renderProject(project);
    if (!projectDialog.open) projectDialog.showModal();
    if (updateUrl && location.hash !== projectHash(id)) history.pushState(null, "", projectHash(id));
  }

  function closeProject(updateUrl = true) {
    if (lightbox.open) lightbox.close();
    if (projectDialog.open) projectDialog.close();
    state.active = null;
    state.images = [];
    if (updateUrl && location.hash !== "#design") history.pushState(null, "", "#design");
  }

  function updateGallery(index) {
    if (!state.images.length) return;
    state.imageIndex = (index + state.images.length) % state.images.length;
    const image = $("#design-viewer-image", projectContent);
    if (image) {
      image.src = asset(state.images[state.imageIndex]);
      image.alt = `${state.active.title} — imagem ${state.imageIndex + 1} de ${state.images.length}`;
    }
    $$("[data-gallery-index]", projectContent).forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.galleryIndex) === state.imageIndex);
    });
  }

  function resetZoom() {
    state.zoom = 1;
    state.x = 0;
    state.y = 0;
    state.dragging = false;
    applyZoom();
  }

  function applyZoom() {
    lightboxImage.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
    lightboxStage.classList.toggle("zoomed", state.zoom > 1);
    lightboxStage.classList.toggle("dragging", state.dragging);
    const reset = $("[data-zoom='reset']", lightbox);
    if (reset) reset.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function showLightbox(index = state.imageIndex) {
    if (!state.images.length || !state.active) return;
    state.imageIndex = (index + state.images.length) % state.images.length;
    resetZoom();
    lightboxImage.src = asset(state.images[state.imageIndex]);
    lightboxImage.alt = `${state.active.title} — imagem ampliada ${state.imageIndex + 1} de ${state.images.length}`;
    lightboxCaption.textContent = `${state.active.title} · ${state.imageIndex + 1} de ${state.images.length}`;
    $$("[data-lightbox-step]", lightbox).forEach(
      (button) => (button.hidden = state.images.length < 2),
    );
    if (!lightbox.open) lightbox.showModal();
  }

  function stepLightbox(step) {
    showLightbox(state.imageIndex + step);
    updateGallery(state.imageIndex);
  }

  function changeZoom(next, centerX = 0, centerY = 0) {
    const previous = state.zoom;
    state.zoom = Math.min(5, Math.max(1, next));
    if (state.zoom === 1) {
      state.x = 0;
      state.y = 0;
    } else if (previous !== state.zoom && centerX && centerY) {
      const rect = lightboxStage.getBoundingClientRect();
      const offsetX = centerX - (rect.left + rect.width / 2);
      const offsetY = centerY - (rect.top + rect.height / 2);
      const ratio = state.zoom / previous - 1;
      state.x -= offsetX * ratio;
      state.y -= offsetY * ratio;
    }
    applyZoom();
  }

  async function copyProjectLink() {
    if (!state.active) return;
    const url = new URL(location.href);
    url.hash = `design/${encodeURIComponent(state.active.id)}`;
    try {
      await navigator.clipboard.writeText(url.href);
    } catch {
      const input = document.createElement("textarea");
      input.value = url.href;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    showToast("Link do trabalho copiado.");
  }

  function showToast(message) {
    toast.hidden = false;
    toast.textContent = message;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => (toast.hidden = true), 3500);
  }

  function syncHash() {
    const match = location.hash.match(/^#design\/(.+)$/);
    if (match) {
      try {
        openProject(decodeURIComponent(match[1]), false);
      } catch {
        showToast("O endereço deste trabalho é inválido.");
      }
    } else if (projectDialog.open) {
      closeProject(false);
    }
  }

  async function load() {
    try {
      const response = await fetch(Portfolio.getBasePath() + "data/design-projects.json", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.projects) || !Array.isArray(data.categories)) throw new Error();
      state.projects = data.projects;
      state.categories = data.categories.filter(
        (category) => category && category.id && category.label,
      );
      for (const project of state.projects) {
        if (
          project.category &&
          !state.categories.some((category) => category.id === project.category)
        ) {
          state.categories.push({ id: project.category, label: humanize(project.category) });
        }
      }
      if (new URLSearchParams(location.search).get("preview") === "1") {
        const preview = await PortfolioDrafts.get("design-preview");
        if (preview?.id) {
          state.projects = [preview, ...state.projects.filter((project) => project.id !== preview.id)];
        }
      }
      renderFilterOptions();
      render();
      syncHash();
    } catch {
      gallery.innerHTML = `<div class="design-empty"><div><div class="design-empty-mark" aria-hidden="true">!</div><h3>Não foi possível carregar os trabalhos.</h3><p>Confira sua conexão e tente novamente.</p><button class="button secondary" type="button" data-retry>Recarregar</button></div></div>`;
      gallery.setAttribute("aria-busy", "false");
      resultCount.textContent = "Galeria indisponível";
    }
  }

  search.addEventListener("input", () => {
    state.query = search.value.trim();
    render();
  });
  toolFilter.addEventListener("change", () => {
    state.tool = toolFilter.value;
    render();
  });
  tagFilter.addEventListener("change", () => {
    state.tag = tagFilter.value;
    render();
  });
  categoryRoot.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    render();
  });
  $("#clear-design-filters").addEventListener("click", clearFilters);

  gallery.addEventListener("click", (event) => {
    const project = event.target.closest("[data-open-project]");
    if (project) openProject(project.dataset.openProject);
    if (event.target.closest("[data-clear-all]")) clearFilters();
    if (event.target.closest("[data-retry]")) location.reload();
  });

  projectDialog.addEventListener("click", (event) => {
    if (event.target === projectDialog || event.target.closest("[data-close-project]")) {
      closeProject();
      return;
    }
    const step = event.target.closest("[data-gallery-step]");
    if (step) updateGallery(state.imageIndex + Number(step.dataset.galleryStep));
    const thumbnail = event.target.closest("[data-gallery-index]");
    if (thumbnail) updateGallery(Number(thumbnail.dataset.galleryIndex));
    if (event.target.closest("[data-open-lightbox]")) showLightbox();
    if (event.target.closest("[data-share-project]")) copyProjectLink();
  });
  projectDialog.addEventListener("close", () => {
    if (state.active && location.hash.startsWith("#design/")) {
      state.active = null;
      state.images = [];
      history.pushState(null, "", "#design");
    }
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-lightbox]")) lightbox.close();
    const step = event.target.closest("[data-lightbox-step]");
    if (step) stepLightbox(Number(step.dataset.lightboxStep));
    const zoom = event.target.closest("[data-zoom]")?.dataset.zoom;
    if (zoom === "in") changeZoom(state.zoom + 0.5);
    if (zoom === "out") changeZoom(state.zoom - 0.5);
    if (zoom === "reset") resetZoom();
  });
  lightbox.addEventListener("close", resetZoom);
  lightboxImage.addEventListener("dblclick", (event) => {
    changeZoom(state.zoom === 1 ? 2.5 : 1, event.clientX, event.clientY);
  });
  lightboxStage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      changeZoom(state.zoom + (event.deltaY < 0 ? 0.35 : -0.35), event.clientX, event.clientY);
    },
    { passive: false },
  );
  lightboxStage.addEventListener("pointerdown", (event) => {
    if (state.zoom <= 1 || event.target.closest("button")) return;
    state.dragging = true;
    state.dragX = event.clientX - state.x;
    state.dragY = event.clientY - state.y;
    lightboxStage.setPointerCapture(event.pointerId);
    applyZoom();
  });
  lightboxStage.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    state.x = event.clientX - state.dragX;
    state.y = event.clientY - state.dragY;
    applyZoom();
  });
  for (const name of ["pointerup", "pointercancel"]) {
    lightboxStage.addEventListener(name, () => {
      state.dragging = false;
      applyZoom();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (lightbox.open && event.key === "ArrowLeft") stepLightbox(-1);
    else if (lightbox.open && event.key === "ArrowRight") stepLightbox(1);
    else if (projectDialog.open && event.key === "ArrowLeft") updateGallery(state.imageIndex - 1);
    else if (projectDialog.open && event.key === "ArrowRight") updateGallery(state.imageIndex + 1);
  });
  addEventListener("hashchange", syncHash);
  if (!location.hash) history.replaceState(null, "", "#design");
  load();
})();

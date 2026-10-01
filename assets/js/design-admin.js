(() => {
  const $ = (id) => document.getElementById(id);
  const e = Portfolio.escapeHTML;
  const draftKey = "portfolio_design_projects_draft";
  const folderMigrationKey = "portfolio_design_seed_folders_removed_v1";
  const precreatedCategoryIds = new Set([
    "design-geral",
    "planta-baixa",
    "ilustracao",
    "outros",
    "convite",
    "convite-1",
    "convite-de-casamento",
  ]);
  const MB = 1024 * 1024;
  let data = { categories: [], projects: [] };
  let editingId = null;
  let dirty = false;
  let busy = false;
  let ready = false;
  let customId = false;
  let categoryIdCustom = false;
  let media = { cover: null, images: [], before: null, after: null };
  let createKind = null;

  const value = (id) => $(id).value.trim();
  const items = (text) =>
    text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const lines = (text) =>
    text
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  const local = (source) => typeof source === "string" && source.startsWith("data:");
  const safeSource = (source) =>
    /^(?:data:image\/(?:png|jpeg|webp);base64,|https?:\/\/|assets\/)/i.test(source || "");
  const bytes = (source) =>
    local(source) ? Math.ceil((source.length - source.indexOf(",") - 1) * 0.75) : 0;
  const humanize = (text) =>
    String(text || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const slugify = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  function notice(message, type = "success") {
    const node = $("admin-notice");
    node.hidden = false;
    node.textContent = message;
    node.className = "admin-notice " + type;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => (node.hidden = true), type === "error" ? 9000 : 5000);
  }

  function markDirty() {
    dirty = true;
    $("save-state").textContent = "Não salvo";
  }

  function setBusy(next) {
    busy = next;
    $("design-editor-fields").disabled = next || !ready;
    for (const id of [
      "new-design-project",
      "design-import-json",
      "design-export-json",
      "design-restore-json",
    ]) {
      $(id).disabled = next || !ready;
    }
    $("design-admin-list")
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = next));
    document.dispatchEvent(new Event("portfolio-editor-state"));
  }

  function canLeave() {
    return !busy && (!dirty || confirm("Descartar as alterações não salvas deste trabalho?"));
  }

  function optionalObject(entries) {
    const object = Object.fromEntries(entries.map(([key, entry]) => [key, entry || null]));
    return Object.values(object).some(Boolean) ? object : null;
  }

  function form() {
    const floorPlan = optionalObject([
      ["environment", value("d-environment")],
      ["area", value("d-area")],
      ["scale", value("d-scale")],
      ["version", value("d-version")],
    ]);
    const comparison = optionalObject([
      ["before", media.before],
      ["after", media.after],
      ["beforeLabel", value("d-before-label")],
      ["afterLabel", value("d-after-label")],
    ]);
    return {
      id: value("d-id"),
      title: value("d-title"),
      creator: value("d-creator") || null,
      category: value("d-category"),
      date: value("d-date") || null,
      featured: $("d-featured").checked,
      shortDescription: value("d-short") || null,
      description: value("d-description") || null,
      tools: items(value("d-tools")),
      tags: items(value("d-tags")),
      media: { cover: media.cover || null, images: [...media.images] },
      floorPlan,
      comparison,
      notes: value("d-notes") || null,
      credits: value("d-credits") || null,
    };
  }

  function validate(project, allowUnfiled = false) {
    if (!project || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id || "")) {
      throw new Error("Preencha um ID com letras minúsculas, números e hífens.");
    }
    if (!String(project.title || "").trim()) throw new Error("Preencha o título do trabalho.");
    if (!allowUnfiled && !project.category) {
      throw new Error("Selecione uma pasta ou subpasta para o trabalho.");
    }
    if (project.category && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.category)) {
      throw new Error("A categoria deve usar letras minúsculas, números e hífens.");
    }
    for (const source of [
      project.media?.cover,
      ...(project.media?.images || []),
      project.comparison?.before,
      project.comparison?.after,
    ]) {
      if (source && !safeSource(source)) {
        throw new Error("Use links HTTP(S), caminhos assets/ ou imagens selecionadas no painel.");
      }
    }
  }

  function validateData(next) {
    if (!next || !Array.isArray(next.categories) || !Array.isArray(next.projects)) {
      throw new Error("O arquivo precisa conter as listas categories e projects.");
    }
    if (next.projects.length > 200) throw new Error("O arquivo aceita até 200 trabalhos.");
    const categories = new Map();
    for (const category of next.categories) {
      if (!category || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.id || "") || !String(category.label || "").trim()) {
        throw new Error("Cada pasta precisa de um ID válido e um nome.");
      }
      if (categories.has(category.id)) throw new Error("Há pastas com IDs repetidos.");
      categories.set(category.id, category);
    }
    for (const category of categories.values()) {
      if (!category.parent) continue;
      const parent = categories.get(category.parent);
      if (!parent || parent.parent) throw new Error("Uma subpasta precisa ficar dentro de uma pasta principal.");
    }
    const ids = new Set();
    for (const project of next.projects) {
      validate(project, true);
      if (ids.has(project.id)) throw new Error("Há IDs de trabalho repetidos.");
      if (project.category && !categories.has(project.category)) throw new Error("Escolha uma pasta ou subpasta existente para cada arquivo.");
      ids.add(project.id);
    }
  }

  async function persist(next) {
    validateData(next);
    await PortfolioDrafts.put(draftKey, next);
    data = structuredClone(next);
    renderCategoryOptions();
    render();
  }

  function focusEditor() {
    const panel = document.querySelector(".editor-panel");
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }

  function renderCategoryOptions() {
    const select = $("d-category");
    const selected = select.value;
    const categoryName = (category) => {
      const parent = data.categories.find((item) => item.id === category.parent);
      return parent ? `${parent.label} › ${category.label}` : category.label;
    };
    const placeholder = data.categories.length
      ? "Selecione uma pasta ou subpasta"
      : "Nenhuma pasta criada ainda";
    select.innerHTML = `<option value="">${placeholder}</option>${data.categories
      .map((category) => `<option value="${e(category.id)}">${e(categoryName(category))}</option>`)
      .join("")}`;
    select.value = data.categories.some((category) => category.id === selected) ? selected : "";
    $("category-picker-help").textContent = data.categories.length
      ? "Escolha a pasta principal ou uma subpasta para organizar este arquivo."
      : "Crie uma pasta para habilitar a seleção do local deste arquivo.";
  }

  function syncMediaInputs() {
    $("d-cover").value = local(media.cover) ? "" : media.cover || "";
    $("d-images").value = media.images.filter((source) => !local(source)).join("\n");
    $("d-before").value = local(media.before) ? "" : media.before || "";
    $("d-after").value = local(media.after) ? "" : media.after || "";
  }

  function fill(project, focus = true) {
    editingId = project.id;
    customId = true;
    const fields = {
      id: project.id,
      title: project.title,
      creator: project.creator,
      category: project.category,
      date: project.date,
      short: project.shortDescription,
      description: project.description,
      tools: (project.tools || []).join(", "),
      tags: (project.tags || []).join(", "),
      environment: project.floorPlan?.environment,
      area: project.floorPlan?.area,
      scale: project.floorPlan?.scale,
      version: project.floorPlan?.version,
      "before-label": project.comparison?.beforeLabel,
      "after-label": project.comparison?.afterLabel,
      notes: project.notes,
      credits: project.credits,
    };
    for (const [key, entry] of Object.entries(fields)) $("d-" + key).value = entry || "";
    $("d-id").disabled = true;
    $("d-featured").checked = Boolean(project.featured);
    media = {
      cover: project.media?.cover || null,
      images: [...(project.media?.images || [])],
      before: project.comparison?.before || null,
      after: project.comparison?.after || null,
    };
    syncMediaInputs();
    showMedia();
    dirty = false;
    $("editor-title").textContent = project.title || "Editar trabalho";
    $("save-state").textContent = "Rascunho salvo";
    render();
    if (focus) focusEditor();
  }

  function reset() {
    $("design-project-form").reset();
    editingId = null;
    customId = false;
    dirty = false;
    media = { cover: null, images: [], before: null, after: null };
    $("d-id").disabled = false;
    $("d-creator").value = "Stella";
    $("editor-title").textContent = "Novo trabalho";
    $("save-state").textContent = "Pronto para criar";
    showMedia();
    render();
  }

  function categoryPath(categoryId) {
    if (!categoryId) return "Sem pasta";
    const category = data.categories.find((item) => item.id === categoryId);
    if (!category) return humanize(categoryId);
    const parent = data.categories.find((item) => item.id === category.parent);
    return parent ? `${parent.label} › ${category.label}` : category.label;
  }

  function projectItem(project) {
    return '<article class="admin-item' +
      (editingId === project.id ? " selected" : "") +
      '"><div class="admin-item-info"><strong>▧ ' +
      e(project.title) +
      "</strong><small>" +
      e(categoryPath(project.category)) +
      (project.featured ? " · Destaque" : "") +
      '</small></div><div class="admin-actions"><button type="button" data-action="edit" data-id="' +
      e(project.id) +
      '">Editar</button><button type="button" data-action="duplicate" data-id="' +
      e(project.id) +
      '">Duplicar</button><button type="button" class="danger" data-action="delete" data-id="' +
      e(project.id) +
      '">Excluir</button></div></article>';
  }

  function folderMarkup(category, projects) {
    const children = data.categories.filter((item) => item.parent === category.id);
    const directProjects = projects.filter((project) => project.category === category.id);
    return `<section class="admin-folder"><h3>▾ ${e(category.label)}</h3>${directProjects.map(projectItem).join("")}${children.map((child) => `<section class="admin-subfolder"><h4>↳ ${e(child.label)}</h4>${projects.filter((project) => project.category === child.id).map(projectItem).join("") || '<p class="admin-folder-empty">Nenhum arquivo nesta subpasta.</p>'}</section>`).join("")}${!directProjects.length && !children.length ? '<p class="admin-folder-empty">Nenhum arquivo nesta pasta.</p>' : ""}</section>`;
  }

  function render() {
    const query = value("design-project-search").toLowerCase();
    const projects = data.projects.filter((project) =>
      [project.title, project.id, project.category, project.creator, ...(project.tools || [])]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
    $("count-title").textContent = `${data.projects.length} ${data.projects.length === 1 ? "arquivo" : "arquivos"} · ${data.categories.length} ${data.categories.length === 1 ? "pasta" : "pastas"}`;
    const rootCategories = data.categories.filter((category) => !category.parent);
    const unfiled = projects.filter((project) => !data.categories.some((category) => category.id === project.category));
    const hasVisibleItems = query ? projects.length : rootCategories.length || unfiled.length;
    $("design-admin-list").innerHTML = hasVisibleItems
      ? (query
          ? projects.map(projectItem).join("")
          : `${rootCategories.map((category) => folderMarkup(category, projects)).join("")}${unfiled.length ? `<section class="admin-folder"><h3>▾ Sem pasta</h3>${unfiled.map(projectItem).join("")}</section>` : ""}`)
      : '<p class="list-empty">' +
        (query
          ? "Nenhum resultado para essa pesquisa."
          : "Sua estrutura está vazia. Clique em Criar item para começar.") +
        "</p>";
    $("design-admin-list")
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = busy));
  }

  function mediaPreview(source, kind, index = 0) {
    if (!source || !safeSource(source)) return "";
    const label = local(source)
      ? `Pronta para enviar · ${(bytes(source) / MB).toFixed(1)} MB`
      : "Imagem vinculada";
    return `<img src="${e(Portfolio.assetURL(source))}" alt="Prévia da imagem"><div class="media-caption"><span>${label}</span><button type="button" class="remove-media" data-remove="${e(kind)}" data-index="${index}" aria-label="Remover imagem">Remover</button></div>`;
  }

  function showMedia() {
    $("design-cover-preview").innerHTML = mediaPreview(media.cover, "cover");
    $("design-before-preview").innerHTML = mediaPreview(media.before, "before");
    $("design-after-preview").innerHTML = mediaPreview(media.after, "after");
    $("design-shots-preview").innerHTML = media.images
      .map(
        (source, index) =>
          `<figure class="shot-item">${mediaPreview(source, "image", index)}</figure>`,
      )
      .join("");
    const size = [media.cover, media.before, media.after, ...media.images].reduce(
      (total, source) => total + bytes(source),
      0,
    );
    $("design-media-size").textContent = size
      ? `${(size / MB).toFixed(1)} MB de novas imagens. A publicação completa aceita até 25 MB.`
      : "Você também pode arrastar imagens para as áreas acima.";
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reader.onabort = () =>
        reject(new Error(`Não foi possível ler ${file.name}. Tente selecionar novamente.`));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFiles(kind, input) {
    if (busy || !ready) return;
    const files = Array.from(input);
    if (!files.length) return;
    setBusy(true);
    $("save-state").textContent = "Preparando imagem…";
    try {
      if (kind !== "images" && files.length > 1) {
        throw new Error("Selecione apenas uma imagem para este campo.");
      }
      const allowed = ["image/png", "image/jpeg", "image/webp"];
      for (const file of files) {
        if (!allowed.includes(file.type)) {
          throw new Error(`Formato não aceito: ${file.name}. Use PNG, JPG ou WebP.`);
        }
        if (!file.size || file.size > 4 * MB) {
          throw new Error(`${file.name}: escolha uma imagem não vazia de até 4 MB.`);
        }
      }
      const results = [];
      for (const file of files) results.push(await readFile(file));
      if (kind === "images") media.images.push(...results);
      else media[kind] = results[0];
      syncMediaInputs();
      showMedia();
      markDirty();
      notice("Imagem pronta. Salve o rascunho e publique para enviá-la ao site.");
    } catch (error) {
      $("save-state").textContent = dirty ? "Não salvo" : "Pronto";
      notice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    const project = form();
    validate(project);
    if (!editingId && data.projects.some((item) => item.id === project.id)) {
      throw new Error("Esse ID já existe. Escolha outro.");
    }
    const next = structuredClone(data);
    next.categories = structuredClone(data.categories);
    const index = next.projects.findIndex((item) => item.id === editingId);
    if (index >= 0) next.projects[index] = project;
    else next.projects.push(project);
    await persist(next);
    fill(project, false);
    notice("Rascunho salvo com as imagens. Publique para atualizar a galeria.");
  }

  async function replaceData(next) {
    validateData(next);
    const selected = editingId;
    data = structuredClone(next);
    renderCategoryOptions();
    render();
    const project = data.projects.find((item) => item.id === selected);
    if (project) fill(project, false);
    else reset();
    await PortfolioDrafts.put(draftKey, data);
  }

  async function load(forceRemote = false) {
    setBusy(true);
    try {
      let next = forceRemote ? null : await PortfolioDrafts.get(draftKey);
      if (!next) {
        const response = await fetch("../data/design-projects.json", { cache: "no-store" });
        if (!response.ok) throw new Error("Não foi possível carregar os trabalhos publicados.");
        next = await response.json();
      }
      const needsFolderMigration = !(await PortfolioDrafts.get(folderMigrationKey));
      if (needsFolderMigration) {
        next = {
          ...next,
          categories: next.categories.filter((category) => !precreatedCategoryIds.has(category.id)),
          projects: next.projects.map((project) =>
            precreatedCategoryIds.has(project.category) ? { ...project, category: null } : project,
          ),
        };
      }
      validateData(next);
      data = structuredClone(next);
      await PortfolioDrafts.put(draftKey, data);
      if (needsFolderMigration) await PortfolioDrafts.put(folderMigrationKey, true);
      ready = true;
      renderCategoryOptions();
      reset();
    } catch (error) {
      notice(error.message, "error");
      $("save-state").textContent = "Falha ao carregar";
    } finally {
      setBusy(false);
      $("design-restore-json").disabled = false;
    }
  }

  $("design-project-form").addEventListener("input", () => {
    if (!busy) markDirty();
  });
  $("d-id").addEventListener("input", () => (customId = true));
  $("d-title").addEventListener("input", () => {
    if (!editingId && !customId) {
      $("d-id").value = value("d-title")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
  });
  $("design-project-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    try {
      await saveCurrent();
    } catch (error) {
      notice(error.message, "error");
    } finally {
      setBusy(false);
    }
  });
  $("design-admin-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || busy || !ready) return;
    const project = data.projects.find((item) => item.id === button.dataset.id);
    if (!project || !canLeave()) return;
    if (button.dataset.action === "edit") return fill(project);
    if (
      button.dataset.action === "delete" &&
      !confirm(`Excluir "${project.title}"? A mudança só irá ao site quando você publicar.`)
    ) {
      return;
    }
    setBusy(true);
    try {
      if (button.dataset.action === "delete") {
        await persist({
          categories: data.categories,
          projects: data.projects.filter((item) => item.id !== project.id),
        });
        if (editingId === project.id) reset();
        notice("Trabalho removido do rascunho.");
      } else if (button.dataset.action === "duplicate") {
        const copy = structuredClone(project);
        let index = 2;
        copy.id = project.id + "-copia";
        while (data.projects.some((item) => item.id === copy.id)) {
          copy.id = project.id + "-copia-" + index++;
        }
        copy.title += " (Cópia)";
        await persist({ categories: data.categories, projects: [...data.projects, copy] });
        fill(copy);
      }
    } catch (error) {
      notice(error.message, "error");
    } finally {
      setBusy(false);
    }
  });
  $("design-project-search").addEventListener("input", render);
  function resetCreateDialog() {
    createKind = null;
    $("create-item-choices").hidden = false;
    $("create-folder-fields").hidden = true;
    $("new-category-label").value = "";
    $("new-category-id").value = "";
    $("new-category-parent").value = "";
    categoryIdCustom = false;
  }

  function showCategoryFields(kind) {
    createKind = kind;
    const subfolder = kind === "subfolder";
    $("create-item-choices").hidden = true;
    $("create-folder-fields").hidden = false;
    $("create-folder-kind").textContent = subfolder ? "SUBPASTA" : "PASTA";
    $("create-folder-title").textContent = subfolder ? "Criar subpasta" : "Criar pasta";
    $("create-folder-help").textContent = subfolder
      ? "Escolha a pasta principal na qual ela ficará organizada."
      : "Ela aparecerá como uma categoria principal no portfólio.";
    $("new-category-parent-field").hidden = !subfolder;
    $("save-category").textContent = subfolder ? "Criar subpasta" : "Criar pasta";
    const roots = data.categories.filter((category) => !category.parent);
    $("new-category-parent").innerHTML = `<option value="">Selecione a pasta principal</option>${roots.map((category) => `<option value="${e(category.id)}">${e(category.label)}</option>`).join("")}`;
    $("new-category-label").focus();
  }

  async function createCategory() {
    const createdKind = createKind;
    const label = value("new-category-label");
    const id = slugify(value("new-category-id") || label);
    const parent = createKind === "subfolder" ? value("new-category-parent") : null;
    if (!label) throw new Error("Informe o nome da pasta.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Informe um ID válido para a pasta.");
    if (data.categories.some((category) => category.id === id)) throw new Error("Já existe uma pasta com esse ID.");
    if (createKind === "subfolder" && !data.categories.some((category) => category.id === parent && !category.parent)) {
      throw new Error("Escolha a pasta principal da subpasta.");
    }
    await persist({ categories: [...data.categories, { id, label, ...(parent ? { parent } : {}) }], projects: data.projects });
    $("create-design-item-dialog").close();
    resetCreateDialog();
    notice(`${createdKind === "subfolder" ? "Subpasta" : "Pasta"} criada. Agora você pode escolher esse local para um arquivo.`);
  }

  $("new-design-project").addEventListener("click", () => {
    if (!ready || !canLeave()) return;
    resetCreateDialog();
    $("create-design-item-dialog").showModal();
  });
  $("create-category-from-form").addEventListener("click", () => {
    if (!ready || busy) return;
    resetCreateDialog();
    $("create-design-item-dialog").showModal();
  });
  $("create-design-item-dialog").addEventListener("click", async (event) => {
    if (event.target === $("create-design-item-dialog")) $("create-design-item-dialog").close();
    const kind = event.target.closest("[data-create-kind]")?.dataset.createKind;
    if (kind === "file") {
      $("create-design-item-dialog").close();
      reset();
      focusEditor();
    } else if (kind) showCategoryFields(kind);
    if (event.target.closest("[data-back-create]")) resetCreateDialog();
    if (event.target.closest("#save-category")) {
      if (busy || !ready) return;
      setBusy(true);
      try {
        await createCategory();
      } catch (error) {
        notice(error.message, "error");
      } finally {
        setBusy(false);
      }
    }
  });
  $("new-category-label").addEventListener("input", () => {
    if (!categoryIdCustom) $("new-category-id").value = slugify(value("new-category-label"));
  });
  $("new-category-id").addEventListener("input", () => (categoryIdCustom = true));
  $("clear-design-form").addEventListener("click", () => {
    if (canLeave()) reset();
  });

  for (const [field, key] of [
    ["d-cover", "cover"],
    ["d-before", "before"],
    ["d-after", "after"],
  ]) {
    $(field).addEventListener("input", () => {
      media[key] = value(field) || null;
      showMedia();
    });
  }
  $("d-images").addEventListener("input", () => {
    media.images = [...media.images.filter(local), ...lines(value("d-images"))];
    showMedia();
  });
  $("design-project-form").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button || busy) return;
    if (button.dataset.remove === "image") media.images.splice(Number(button.dataset.index), 1);
    else media[button.dataset.remove] = null;
    syncMediaInputs();
    showMedia();
    markDirty();
  });

  for (const [zone, input, kind] of [
    ["design-cover-drop", "design-cover-file", "cover"],
    ["design-shots-drop", "design-shots-file", "images"],
    ["design-before-drop", "design-before-file", "before"],
    ["design-after-drop", "design-after-file", "after"],
  ]) {
    $(zone).addEventListener("click", () => $(input).click());
    $(input).addEventListener("change", async (event) => {
      await uploadFiles(kind, event.target.files);
      event.target.value = "";
    });
    for (const name of ["dragenter", "dragover"]) {
      $(zone).addEventListener(name, (event) => {
        event.preventDefault();
        if (!busy) $(zone).classList.add("drag");
      });
    }
    for (const name of ["dragleave", "drop"]) {
      $(zone).addEventListener(name, (event) => {
        event.preventDefault();
        $(zone).classList.remove("drag");
      });
    }
    $(zone).addEventListener("drop", (event) => uploadFiles(kind, event.dataTransfer.files));
  }
  for (const name of ["dragover", "drop"]) {
    document.addEventListener(name, (event) => event.preventDefault());
  }

  $("design-export-json").addEventListener("click", () => {
    if (busy || !ready) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "design-projects.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    notice("Backup exportado com os rascunhos e as imagens.");
  });
  $("design-import-json").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || !canLeave()) return;
    setBusy(true);
    try {
      const next = JSON.parse(await file.text());
      validateData(next);
      await persist(next);
      reset();
      notice("Backup importado. Revise antes de publicar.");
    } catch (error) {
      notice(error.message || "JSON inválido.", "error");
    } finally {
      setBusy(false);
    }
  });
  $("design-restore-json").addEventListener("click", async () => {
    if (busy || !canLeave()) return;
    if (confirm("Substituir os rascunhos pela versão publicada no site?")) await load(true);
  });
  $("preview-design-project").addEventListener("click", async () => {
    if (busy || !ready) return;
    const project = form();
    if (!project.id) return notice("Preencha o ID para visualizar.", "error");
    const preview = window.open("about:blank", "_blank");
    if (!preview) return notice("Permita abrir uma nova aba para visualizar o trabalho.", "error");
    setBusy(true);
    try {
      await PortfolioDrafts.put("design-preview", project);
      preview.location.href = `../design/?preview=1#design/${encodeURIComponent(project.id)}`;
    } catch (error) {
      preview.close();
      notice(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (dirty || busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  window.DesignAdmin = {
    publishEndpoint: "/api/publish-design",
    publishBody: (designData) => ({ designData }),
    applyPublished: (response, fallback) => replaceData(response.designData || fallback),
    mediaDescription: "trabalhos e imagens",
    preparePublish: async () => {
      if (busy || !ready) throw new Error("Aguarde o painel terminar de carregar as imagens.");
      setBusy(true);
      try {
        if (dirty) await saveCurrent();
        return structuredClone(data);
      } catch (error) {
        setBusy(false);
        throw error;
      }
    },
    notice,
    isBusy: () => busy || !ready,
    setBusy,
  };
  load();
})();

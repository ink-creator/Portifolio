(() => {
  const $ = (id) => document.getElementById(id);
  const e = Portfolio.escapeHTML;
  const draftKey = "portfolio_projects_draft";
  const MB = 1024 * 1024;
  let projects = [],
    editingId = null,
    dirty = false,
    busy = false,
    ready = false,
    customId = false;
  let media = { cover: null, images: [], video: null };
  const value = (id) => $(id).value.trim();
  const lines = (text) =>
    text
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  const local = (source) => typeof source === "string" && source.startsWith("data:");
  const safeSource = (source) =>
    /^(?:data:(?:image\/(?:png|jpeg|webp)|video\/(?:mp4|webm));base64,|https?:\/\/|assets\/)/i.test(
      source || "",
    );
  const bytes = (source) =>
    local(source) ? Math.ceil((source.length - source.indexOf(",") - 1) * 0.75) : 0;

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
    $("editor-fields").disabled = next || !ready;
    for (const id of ["new-project", "import-json", "export-json", "restore-json"])
      $(id).disabled = next || !ready;
    $("admin-list")
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = next));
    document.dispatchEvent(new Event("portfolio-editor-state"));
  }
  function canLeave() {
    return !busy && (!dirty || confirm("Descartar as alterações não salvas deste formulário?"));
  }
  function form() {
    return {
      id: value("f-id"),
      title: value("f-title"),
      creators: value("f-creators")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      type: value("f-type"),
      status: value("f-status"),
      featured: $("f-featured").checked,
      shortDescription: value("f-short"),
      description: value("f-description"),
      technologies: value("f-tech")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      media: structuredClone(media),
      links: {
        github: value("f-github") || null,
        demo: value("f-demo") || null,
        download: value("f-download") || null,
        documentation: value("f-docs") || null,
      },
    };
  }
  function validate(project) {
    if (!project || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id || ""))
      throw new Error("Preencha um ID com letras minúsculas, números e hífens.");
    if (!String(project.title || "").trim() || !String(project.shortDescription || "").trim())
      throw new Error("Preencha título e descrição curta.");
    for (const link of Object.values(project.links || {})) {
      if (link && !/^https?:\/\//i.test(link))
        throw new Error("Os links devem começar com https:// ou http://.");
    }
    for (const source of [
      project.media?.cover,
      project.media?.video,
      ...(project.media?.images || []),
    ]) {
      if (source && !safeSource(source))
        throw new Error(
          "Use links HTTP(S), caminhos assets/ ou arquivos selecionados para as mídias.",
        );
    }
  }
  function validateList(next) {
    if (!Array.isArray(next) || next.length > 200)
      throw new Error("O arquivo deve conter uma lista de até 200 projetos.");
    const ids = new Set();
    for (const project of next) {
      validate(project);
      if (ids.has(project.id)) throw new Error("Há IDs de projeto repetidos.");
      ids.add(project.id);
    }
  }
  async function persist(next) {
    await PortfolioDrafts.put(draftKey, next);
    projects = structuredClone(next);
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
  function syncMediaInputs() {
    $("f-cover").value = local(media.cover) ? "" : media.cover || "";
    $("f-video").value = local(media.video) ? "" : media.video || "";
    $("f-images").value = media.images.filter((source) => !local(source)).join("\n");
  }
  function fill(project, focus = true) {
    editingId = project.id;
    customId = true;
    const fields = {
      id: project.id,
      title: project.title,
      creators: (project.creators || []).join(", "),
      type: project.type,
      status: project.status,
      short: project.shortDescription,
      description: project.description,
      tech: (project.technologies || []).join(", "),
      github: project.links?.github,
      demo: project.links?.demo,
      download: project.links?.download,
      docs: project.links?.documentation,
    };
    for (const [key, entry] of Object.entries(fields)) $("f-" + key).value = entry || "";
    $("f-id").disabled = true;
    $("f-featured").checked = !!project.featured;
    media = {
      cover: project.media?.cover || null,
      video: project.media?.video || null,
      images: [...(project.media?.images || [])],
    };
    syncMediaInputs();
    showMedia();
    dirty = false;
    $("editor-title").textContent = project.title || "Editar projeto";
    $("save-state").textContent = "Rascunho salvo";
    render();
    if (focus) focusEditor();
  }
  function reset() {
    $("project-form").reset();
    editingId = null;
    customId = false;
    dirty = false;
    media = { cover: null, images: [], video: null };
    $("f-id").disabled = false;
    $("editor-title").textContent = "Novo projeto";
    $("save-state").textContent = "Pronto para criar";
    showMedia();
    render();
  }
  function render() {
    const query = value("project-search").toLowerCase();
    const list = projects.filter((project) =>
      [project.title, project.id, ...(project.creators || []), ...(project.technologies || [])]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
    $("count-title").textContent =
      projects.length + (projects.length === 1 ? " projeto" : " projetos");
    $("admin-list").innerHTML = list.length
      ? list
          .map(
            (project) =>
              '<article class="admin-item' +
              (editingId === project.id ? " selected" : "") +
              '"><div class="admin-item-info"><strong>' +
              e(project.title) +
              "</strong><small>" +
              e(Portfolio.typeNames[project.type] || "Outro") +
              " · " +
              e(Portfolio.statusNames[project.status] || "") +
              (project.featured ? " · Destaque" : "") +
              '</small></div><div class="admin-actions"><button type="button" data-a="edit" data-id="' +
              e(project.id) +
              '">Editar</button><button type="button" data-a="duplicate" data-id="' +
              e(project.id) +
              '">Duplicar</button><button type="button" class="danger" data-a="delete" data-id="' +
              e(project.id) +
              '">Excluir</button></div></article>',
          )
          .join("")
      : '<p class="list-empty">' +
        (query
          ? "Nenhum resultado para essa pesquisa."
          : "Seu próximo projeto começa aqui. Clique em Novo projeto.") +
        "</p>";
    $("admin-list")
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = busy));
  }
  function mediaPreview(source, kind, index) {
    if (!source || !safeSource(source)) return "";
    const src = e(Portfolio.assetURL(source));
    const label = local(source)
      ? "Pronto para enviar · " + (bytes(source) / MB).toFixed(1) + " MB"
      : "Arquivo vinculado";
    const control =
      kind === "video"
        ? '<video controls preload="metadata" src="' + src + '"></video>'
        : '<img src="' +
          src +
          '" alt="' +
          (kind === "cover" ? "Prévia da capa" : "Imagem " + (index + 1)) +
          '">';
    return (
      control +
      '<div class="media-caption"><span>' +
      label +
      '</span><button type="button" class="remove-media" data-remove="' +
      kind +
      '" data-index="' +
      index +
      '" aria-label="Remover ' +
      (kind === "video" ? "vídeo" : kind === "cover" ? "capa" : "imagem " + (index + 1)) +
      '">Remover</button></div>'
    );
  }
  function showMedia() {
    $("cover-preview").innerHTML = mediaPreview(media.cover, "cover", 0);
    $("video-preview").innerHTML = mediaPreview(media.video, "video", 0);
    $("shots-preview").innerHTML = media.images
      .map(
        (source, index) =>
          '<figure class="shot-item">' + mediaPreview(source, "image", index) + "</figure>",
      )
      .join("");
    const size = [media.cover, media.video, ...media.images].reduce(
      (total, source) => total + bytes(source),
      0,
    );
    $("media-size").textContent = size
      ? (size / MB).toFixed(1) +
        " MB de novos arquivos neste projeto. A publicação completa aceita até 25 MB, incluindo a conversão dos arquivos."
      : "Você também pode arrastar arquivos para as áreas acima.";
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reader.onabort = () =>
        reject(new Error("Não foi possível ler " + file.name + ". Tente selecionar novamente."));
      reader.readAsDataURL(file);
    });
  }
  async function uploadFiles(kind, input) {
    if (busy || !ready) return;
    const files = Array.from(input);
    if (!files.length) return;
    setBusy(true);
    $("save-state").textContent = "Preparando arquivo…";
    try {
      if (kind !== "images" && files.length > 1)
        throw new Error(
          "Selecione apenas um arquivo para " + (kind === "video" ? "o vídeo." : "a capa."),
        );
      const allowed =
        kind === "video" ? ["video/mp4", "video/webm"] : ["image/png", "image/jpeg", "image/webp"];
      const limit = kind === "video" ? 15 * MB : 4 * MB;
      for (const file of files) {
        if (!allowed.includes(file.type))
          throw new Error(
            "Formato não aceito: " +
              file.name +
              ". Use " +
              (kind === "video" ? "MP4 ou WebM." : "PNG, JPG ou WebP."),
          );
        if (!file.size || file.size > limit)
          throw new Error(
            file.name + ": escolha um arquivo não vazio de até " + limit / MB + " MB.",
          );
      }
      const results = [];
      for (const file of files) results.push(await readFile(file));
      if (kind === "images") media.images.push(...results);
      else media[kind] = results[0];
      syncMediaInputs();
      showMedia();
      markDirty();
      notice(
        kind === "video"
          ? "Vídeo pronto. Salve o rascunho e publique para enviá-lo ao GitHub."
          : "Imagens prontas. Salve o rascunho para manter os arquivos.",
      );
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
    if (!editingId && projects.some((item) => item.id === project.id))
      throw new Error("Esse ID já existe. Escolha outro.");
    const next = structuredClone(projects);
    const index = next.findIndex((item) => item.id === editingId);
    if (index >= 0) next[index] = project;
    else next.push(project);
    await persist(next);
    fill(project, false);
    notice("Rascunho salvo com as mídias. Publique no GitHub para atualizar o site.");
  }
  async function replaceProjects(next) {
    validateList(next);
    const selected = editingId;
    // A publicação remota já ocorreu; mantém os caminhos publicados mesmo se faltar espaço local.
    projects = structuredClone(next);
    render();
    const project = projects.find((item) => item.id === selected);
    if (project) fill(project, false);
    else reset();
    await PortfolioDrafts.put(draftKey, projects);
  }
  async function load(forceRemote = false) {
    setBusy(true);
    try {
      let next;
      if (!forceRemote) {
        next = await PortfolioDrafts.get(draftKey);
        if (!Array.isArray(next)) {
          const legacy = JSON.parse(localStorage.getItem(draftKey) || "null");
          if (Array.isArray(legacy)) {
            await PortfolioDrafts.put(draftKey, legacy);
            localStorage.removeItem(draftKey);
            next = legacy;
          }
        }
      }
      if (!Array.isArray(next)) {
        const response = await fetch("../data/projects.json", { cache: "no-store" });
        if (!response.ok) throw new Error("Não foi possível carregar os projetos do site.");
        next = (await response.json()).projects;
      }
      validateList(next);
      await persist(next);
      ready = true;
      reset();
    } catch (error) {
      notice(error.message, "error");
      $("save-state").textContent = "Falha ao carregar";
    } finally {
      setBusy(false);
      $("restore-json").disabled = false;
    }
  }

  $("project-form").addEventListener("input", () => {
    if (!busy) markDirty();
  });
  $("f-id").addEventListener("input", () => (customId = true));
  $("f-title").addEventListener("input", () => {
    if (!editingId && !customId)
      $("f-id").value = value("f-title")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
  });
  $("project-form").addEventListener("submit", async (event) => {
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
  $("admin-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || busy || !ready) return;
    const project = projects.find((item) => item.id === button.dataset.id);
    if (!project || !canLeave()) return;
    if (button.dataset.a === "edit") return fill(project);
    if (
      button.dataset.a === "delete" &&
      !confirm('Excluir "' + project.title + '"? A mudança só irá ao site quando você publicar.')
    )
      return;
    setBusy(true);
    try {
      if (button.dataset.a === "delete") {
        await persist(projects.filter((item) => item.id !== project.id));
        if (editingId === project.id) reset();
        notice("Projeto removido do rascunho.");
      } else if (button.dataset.a === "duplicate") {
        const copy = structuredClone(project);
        let index = 2;
        copy.id = project.id + "-copia";
        while (projects.some((item) => item.id === copy.id))
          copy.id = project.id + "-copia-" + index++;
        copy.title += " (Cópia)";
        await persist([...projects, copy]);
        fill(copy);
      }
    } catch (error) {
      notice(error.message, "error");
    } finally {
      setBusy(false);
    }
  });
  $("project-search").addEventListener("input", render);
  $("new-project").addEventListener("click", () => {
    if (ready && canLeave()) {
      reset();
      focusEditor();
    }
  });
  $("clear-form").addEventListener("click", () => {
    if (canLeave()) reset();
  });
  for (const kind of ["cover", "video"])
    $("f-" + kind).addEventListener("input", () => {
      media[kind] = value("f-" + kind) || null;
      showMedia();
    });
  $("f-images").addEventListener("input", () => {
    media.images = [...media.images.filter(local), ...lines(value("f-images"))];
    showMedia();
  });
  $("project-form").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button || busy) return;
    if (button.dataset.remove === "image") media.images.splice(Number(button.dataset.index), 1);
    else media[button.dataset.remove] = null;
    syncMediaInputs();
    showMedia();
    markDirty();
  });
  for (const [zone, input, kind] of [
    ["cover-drop", "cover-file", "cover"],
    ["shots-drop", "shots-file", "images"],
    ["video-drop", "video-file", "video"],
  ]) {
    $(zone).addEventListener("click", () => $(input).click());
    $(input).addEventListener("change", async (event) => {
      await uploadFiles(kind, event.target.files);
      event.target.value = "";
    });
    for (const name of ["dragenter", "dragover"])
      $(zone).addEventListener(name, (event) => {
        event.preventDefault();
        if (!busy) $(zone).classList.add("drag");
      });
    for (const name of ["dragleave", "drop"])
      $(zone).addEventListener(name, (event) => {
        event.preventDefault();
        $(zone).classList.remove("drag");
      });
    $(zone).addEventListener("drop", (event) => uploadFiles(kind, event.dataTransfer.files));
  }
  // Impede que soltar um arquivo fora de uma área substitua a página do editor.
  for (const name of ["dragover", "drop"])
    document.addEventListener(name, (event) => event.preventDefault());
  $("export-json").addEventListener("click", () => {
    if (busy || !ready) return;
    const blob = new Blob([JSON.stringify({ projects }, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "projects.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    notice("Backup exportado com os rascunhos salvos e suas mídias.");
  });
  $("import-json").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || !canLeave()) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      validateList(data.projects);
      await persist(data.projects);
      reset();
      notice("Backup importado. Revise antes de publicar.");
    } catch (error) {
      notice(error.message || "JSON inválido.", "error");
    } finally {
      setBusy(false);
    }
  });
  $("restore-json").addEventListener("click", async () => {
    if (busy || !canLeave()) return;
    if (confirm("Substituir os rascunhos pela versão publicada no site?")) await load(true);
  });
  $("preview-project").addEventListener("click", async () => {
    if (busy || !ready) return;
    const project = form();
    if (!project.id) return notice("Preencha o ID para visualizar.", "error");
    const preview = window.open("about:blank", "_blank");
    if (!preview) return notice("Permita abrir uma nova aba para visualizar o projeto.", "error");
    setBusy(true);
    try {
      await PortfolioDrafts.put("preview", project);
      preview.location.href = "../projeto/?id=" + encodeURIComponent(project.id) + "&preview=1";
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
  window.PortfolioAdmin = {
    getProjects: () => (ready ? structuredClone(projects) : null),
    replaceProjects,
    notice,
    isBusy: () => busy || !ready,
    setBusy,
    preparePublish: async () => {
      if (busy || !ready) throw new Error("Aguarde o painel terminar de carregar os arquivos.");
      setBusy(true);
      try {
        if (dirty) await saveCurrent();
        return structuredClone(projects);
      } catch (error) {
        setBusy(false);
        throw error;
      }
    },
  };
  load();
})();

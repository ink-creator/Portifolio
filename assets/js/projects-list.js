document.addEventListener("DOMContentLoaded", async () => {
  const filters = document.querySelector("#filters"), list = document.querySelector("#projects-list");
  try {
    const projects = await Portfolio.loadProjects();
    const types = [...new Set(projects.map(p => p.type).filter(Boolean))];
    const escape = Portfolio.escapeHTML;
    filters.innerHTML = ["all", ...types].map((type,i) => '<button class="filter-button '+(i ? '' : 'active')+'" aria-pressed="'+!i+'" data-filter="'+escape(type)+'">'+escape(type === "all" ? "Todos" : Portfolio.typeNames[type] || type)+'</button>').join("");
    const render = type => Portfolio.renderProjectGrid(list, type === "all" ? projects : projects.filter(p => p.type === type));
    filters.addEventListener("click", event => {
      const button = event.target.closest("button");
      if(!button) return;
      filters.querySelectorAll("button").forEach(el => { const active = el === button; el.classList.toggle("active", active); el.setAttribute("aria-pressed",String(active)); });
      render(button.dataset.filter);
    });
    render("all");
  } catch {
    list.innerHTML = '<div class="empty-state"><h2>Não foi possível carregar os projetos.</h2><p>Tente novamente em instantes.</p><button class="button secondary" id="retry-projects">Tentar novamente</button></div>';
    document.querySelector("#retry-projects").addEventListener("click", () => location.reload());
  } finally { list.setAttribute("aria-busy","false"); }
});

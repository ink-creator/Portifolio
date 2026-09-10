// Autenticação e publicação via Cloudflare Worker.
document.addEventListener("DOMContentLoaded", () => {
  const API = String(window.PORTFOLIO_API_BASE || "").replace(/\/$/, "");
  const login = document.getElementById("github-login");
  const logout = document.getElementById("github-logout");
  const publish = document.getElementById("github-publish");
  const user = document.getElementById("cloud-user");
  const status = document.getElementById("cloud-status");
  const tokenKey = "portfolio_admin_session";
  let authenticated = false;

  if (!login || !logout || !publish || !user || !status) return;

  const hash = new URLSearchParams(location.hash.slice(1));
  const callbackToken = hash.get("session");
  const callbackError = hash.get("error");
  const loginErrors = {
    acesso_negado: "Esta conta GitHub não tem acesso ao admin. Entre com uma conta autorizada pelo responsável pelo portfólio.",
    callback_invalido: "O login foi interrompido. Clique em Entrar com GitHub e tente novamente.",
    state_invalido: "A tentativa de login expirou. Clique em Entrar com GitHub para recomeçar.",
    oauth_falhou: "Não foi possível concluir a autorização no GitHub. Tente entrar novamente."
  };
  // Uma tentativa recusada não deve reaproveitar a sessão de outra conta.
  if (callbackError) sessionStorage.removeItem(tokenKey);
  else if (callbackToken) sessionStorage.setItem(tokenKey, callbackToken);
  if (callbackToken || callbackError) history.replaceState(null, "", location.pathname + location.search);

  const getToken = () => sessionStorage.getItem(tokenKey);
  const authHeaders = (extra = {}) => {
    const token = getToken();
    return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
  };
  const setAuthenticated = (account, message) => {
    authenticated = Boolean(account);
    user.textContent = authenticated ? `@${account.login}` : "Não autenticado";
    login.hidden = authenticated;
    logout.hidden = !authenticated;
    publish.disabled = !authenticated || window.PortfolioAdmin?.isBusy();
    status.textContent = message || (authenticated
      ? "Conectado. Seus projetos, imagens e vídeos serão publicados juntos."
      : "Entre com uma das contas GitHub autorizadas para publicar.");
  };
  document.addEventListener("portfolio-editor-state", () => {
    publish.disabled = !authenticated || window.PortfolioAdmin?.isBusy();
  });

  if (!API || API.includes("SEU-WORKER")) {
    login.textContent = "Configurar GitHub + Cloudflare →";
    login.href = "#publication-help";
    login.addEventListener("click", () => {
      const help = document.getElementById("publication-help");
      if (help) {
        const section = help.closest(".admin-tools");
        if (section) section.open = true;
        help.open = true;
      }
    });
    user.textContent = "Conexão pendente";
    status.textContent = "Seu editor já está disponível. Para publicar, conclua a configuração e preencha a URL pública em admin/cloudflare.js.";
    return;
  }

  login.href = `${API}/auth/login`;
  async function checkSession() {
    if (callbackError) {
      setAuthenticated(null, loginErrors[callbackError] || "Não foi possível entrar. Tente novamente com uma conta autorizada.");
      return;
    }
    const token = getToken();
    if (!token) return setAuthenticated(null);
    try {
      const response = await fetch(`${API}/auth/me`, { headers: authHeaders() });
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem(tokenKey);
        setAuthenticated(null, "Sua sessão expirou ou a conta não está autorizada. Entre novamente com GitHub.");
        return;
      }
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.authenticated || !data.user?.login) throw new Error();
      setAuthenticated(data.user);
    } catch {
      setAuthenticated(null);
      status.textContent = "Não foi possível verificar sua sessão. Confira a conexão e tente recarregar a página.";
    }
  }

  logout.addEventListener("click", () => {
    sessionStorage.removeItem(tokenKey);
    setAuthenticated(null, "Você saiu do painel. A sessão do site GitHub continua aberta; escolha a conta desejada ao entrar novamente.");
  });

  publish.addEventListener("click", async () => {
    if (window.PortfolioAdmin?.isBusy()) return;
    publish.disabled = true;
    logout.disabled = true;
    const originalLabel = publish.textContent;
    publish.textContent = "Publicando…";
    status.textContent = "Preparando projetos, imagens e vídeos…";
    try {
      const projects = await window.PortfolioAdmin.preparePublish();
      const body = JSON.stringify({ projects });
      if (new Blob([body]).size > 25 * 1024 * 1024) {
        throw new Error("A publicação ultrapassa 25 MB com a conversão dos arquivos. Remova algumas mídias deste envio e publique-as depois. Seu rascunho continua salvo.");
      }
      status.textContent = "Enviando projetos, imagens e vídeos ao GitHub. Aguarde…";
      const response = await fetch(`${API}/api/publish`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem(tokenKey);
        setAuthenticated(null);
      }
      if (!response.ok) {
        const fallback = response.status === 401 || response.status === 403
          ? "Sua sessão expirou ou a conta não está autorizada. Entre novamente com GitHub."
          : response.status === 413
            ? "A publicação excede o limite de tamanho. Envie menos mídias por vez."
            : `A publicação falhou (HTTP ${response.status}). Verifique se o Worker foi atualizado e tente novamente.`;
        throw new Error(data.detail || data.error || fallback);
      }
      try {
        await window.PortfolioAdmin.replaceProjects(data.projects || projects);
      } catch (error) {
        status.textContent = "Publicado no GitHub, mas a cópia local não pôde ser atualizada. Recarregue do site quando a publicação estiver disponível.";
        window.PortfolioAdmin.notice(status.textContent, "error");
        return;
      }
      status.textContent = "Publicado. O GitHub Pages atualizará após concluir o deploy.";
      window.PortfolioAdmin.notice("Projetos e mídias publicados no GitHub com sucesso.");
    } catch (error) {
      const detail = error instanceof TypeError
        ? "Não foi possível comunicar com o serviço de publicação. Confira a conexão e a configuração do Worker."
        : error.message;
      status.textContent = `Não foi possível publicar: ${detail} Seu rascunho foi mantido.`;
      window.PortfolioAdmin.notice(detail, "error");
    } finally {
      window.PortfolioAdmin.setBusy(false);
      publish.disabled = !authenticated;
      logout.disabled = false;
      publish.textContent = originalLabel;
    }
  });

  checkSession();
});

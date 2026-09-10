import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import worker from "../src/index.js";

const source = readFileSync(new URL("../../../admin/admin.js", import.meta.url), "utf8");

async function panel({ hash = "", token = null, fetch = async () => Response.json({ authenticated: true, user: { login: "ink-creator" } }), preparePublish, busy = false } = {}) {
  const nodes = new Map();
  const listeners = new Map();
  const storage = new Map(token ? [["portfolio_admin_session", token]] : []);
  const notices = [];
  let replaced = false;
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: "", hidden: false, disabled: false, listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; } });
      return nodes.get(id);
    },
    addEventListener(event, fn) { listeners.set(event, fn); }
  };
  const admin = {
    isBusy: () => busy,
    setBusy: value => { busy = value; listeners.get("portfolio-editor-state")?.(); },
    preparePublish: preparePublish || (async () => { busy = true; return [{ id: "notas" }]; }),
    replaceProjects: async () => { replaced = true; },
    notice: (...args) => notices.push(args)
  };
  vm.runInNewContext(source, {
    document, URLSearchParams, Blob, TypeError, fetch,
    window: { PORTFOLIO_API_BASE: "https://worker.test", PortfolioAdmin: admin },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { hash, pathname: "/admin/", search: "" }, history: { replaceState() {} }
  });
  listeners.get("DOMContentLoaded")();
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, storage, notices, replaced: () => replaced, admin };
}

test("recusa de outra conta permanece visível e não reaproveita sessão anterior", async () => {
  const app = await panel({ hash: "#error=acesso_negado", token: "old-test-session", fetch: () => { throw Error("Não deveria consultar a sessão recusada"); } });
  assert.match(app.nodes.get("cloud-status").textContent, /não tem acesso ao admin/);
  assert.equal(app.storage.size, 0);
  assert.equal(app.nodes.get("github-login").hidden, false);
  assert.equal(app.nodes.get("github-publish").disabled, true);
});

test("callback autorizado reconhece a conta e habilita a publicação só após carregar o editor", async () => {
  const app = await panel({ hash: "#session=test-session", busy: true });
  assert.equal(app.nodes.get("cloud-user").textContent, "@ink-creator");
  assert.equal(app.nodes.get("github-publish").disabled, true);
  app.admin.setBusy(false);
  assert.equal(app.nodes.get("github-publish").disabled, false);
  assert.equal(app.nodes.get("github-login").hidden, true);
});

test("erro temporário de rede não apaga a sessão; uma sessão recusada é removida", async () => {
  const offline = await panel({ token: "test-session", fetch: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(offline.storage.get("portfolio_admin_session"), "test-session");
  assert.match(offline.nodes.get("cloud-status").textContent, /verificar sua sessão/);
  const denied = await panel({ token: "test-session", fetch: async () => Response.json({}, { status: 403 }) });
  assert.equal(denied.storage.size, 0);
  assert.match(denied.nodes.get("cloud-status").textContent, /não está autorizada/);
});

test("falha na publicação deixa o motivo visível e mantém os rascunhos", async () => {
  const app = await panel({ token: "test-session", fetch: async url => url.endsWith("/auth/me")
    ? Response.json({ authenticated: true, user: { login: "ink-creator" } })
    : Response.json({ detail: "Formato de vídeo inválido." }, { status: 500 }) });
  await app.nodes.get("github-publish").listeners.click();
  assert.match(app.nodes.get("cloud-status").textContent, /Formato de vídeo inválido/);
  assert.match(app.nodes.get("cloud-status").textContent, /rascunho foi mantido/);
  assert.equal(app.replaced(), false);
  assert.equal(app.nodes.get("github-publish").disabled, false);
});

test("recusa ao publicar pede novo login sem apagar os projetos", async () => {
  const app = await panel({ token: "test-session", fetch: async url => url.endsWith("/auth/me")
    ? Response.json({ authenticated: true, user: { login: "ink-creator" } })
    : new Response("", { status: 401 }) });
  await app.nodes.get("github-publish").listeners.click();
  assert.equal(app.storage.size, 0);
  assert.equal(app.nodes.get("github-publish").disabled, true);
  assert.equal(app.replaced(), false);
  assert.match(app.nodes.get("cloud-status").textContent, /Entre novamente/);
});

test("login oferece escolha da conta e mantém state e PKCE", async () => {
  const response = await worker.fetch(new Request("https://worker.test/auth/login"), {
    ADMIN_URL: "https://site.test/admin/", WORKER_PUBLIC_URL: "https://worker.test", GITHUB_CLIENT_ID: "test-client",
    SESSION_SECRET: "test-only-secret-long-enough-for-tests"
  });
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get("location"));
  assert.equal(redirect.searchParams.get("prompt"), "select_account");
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
  assert.ok(redirect.searchParams.get("state"));
  assert.equal(redirect.searchParams.get("code_challenge").length, 43);
});

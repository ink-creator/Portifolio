import { SignJWT, jwtVerify } from "jose";
import { importGitHubPrivateKey } from "./github-key.js";
import { prepareMedia, readPublishBody } from "./media.js";

const GITHUB_API = "https://api.github.com";
const MAX_PROJECTS = 200;

function allowedOrigins(env) {
  return String(env.PUBLIC_SITE_ORIGINS || "")
    .split(",")
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function cors(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigins(env);
  return origin && allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin"
      }
    : {};
}

function json(request, env, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...cors(request, env),
      ...extra
    }
  });
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}

function base64Url(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Base64Url(value) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function appJwt(env) {
  const key = await importGitHubPrivateKey(env.GITHUB_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iat: now - 30, exp: now + 540, iss: String(env.GITHUB_APP_ID) })
    .setProtectedHeader({ alg: "RS256" })
    .sign(key);
}

async function github(path, options = {}, token) {
  return fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ink-stella-portfolio-admin",
      ...(options.headers || {})
    }
  });
}

async function installationToken(env) {
  const appToken = await appJwt(env);
  const installation = await github(
    `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/installation`,
    {},
    appToken
  );
  if (!installation.ok) throw new Error("GitHub App não está instalada neste repositório.");
  const { id } = await installation.json();
  const response = await github(`/app/installations/${id}/access_tokens`, { method: "POST" }, appToken);
  if (!response.ok) throw new Error("Não foi possível obter o token da instalação.");
  return (await response.json()).token;
}

async function oauthState(env) {
  const nonce = crypto.randomUUID();
  const token = await new SignJWT({ nonce, adminUrl: env.ADMIN_URL })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  const verifier = await sha256Base64Url(`${nonce}:${env.SESSION_SECRET}`);
  return { token, challenge: await sha256Base64Url(verifier) };
}

async function sessionUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SESSION_SECRET), {
      issuer: "ink-stella-admin",
      audience: "portfolio-worker"
    });
    return payload;
  } catch {
    return null;
  }
}

function isAdmin(login, env) {
  const admins = String(env.ADMIN_GITHUB_USERS || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(String(login || "").toLowerCase());
}

function validateProject(project, seen) {
  if (!project || typeof project !== "object") throw new Error("Projeto inválido.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id || "")) throw new Error(`ID inválido: ${project.id || "vazio"}.`);
  if (seen.has(project.id)) throw new Error(`ID duplicado: ${project.id}.`);
  seen.add(project.id);
  if (!String(project.title || "").trim() || !String(project.shortDescription || "").trim()) {
    throw new Error(`Título e descrição curta são obrigatórios em ${project.id}.`);
  }
}

async function createBlob(env, token, content, encoding = "base64") {
  const response = await github(
    `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/git/blobs`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, encoding })
    },
    token
  );
  if (!response.ok) throw new Error(`Falha ao enviar arquivo ao GitHub: ${await response.text()}`);
  return (await response.json()).sha;
}

async function prepareProjects(env, token, input) {
  const projects = structuredClone(input);
  const seen = new Set();
  for (const project of projects) {
    validateProject(project, seen);
  }
  const files = await prepareMedia(projects, content => createBlob(env, token, content));
  return { projects, files };
}

async function publish(env, projects) {
  if (!Array.isArray(projects) || projects.length > MAX_PROJECTS) throw new Error("Lista de projetos inválida ou muito grande.");
  const token = await installationToken(env);
  const owner = encodeURIComponent(env.GITHUB_OWNER);
  const repo = encodeURIComponent(env.GITHUB_REPO);
  const branch = encodeURIComponent(env.GITHUB_BRANCH);
  const refResponse = await github(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, {}, token);
  if (!refResponse.ok) throw new Error("Branch configurada não foi encontrada.");
  const baseCommitSha = (await refResponse.json()).object.sha;
  const commitResponse = await github(`/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, {}, token);
  if (!commitResponse.ok) throw new Error("Não foi possível ler o commit atual.");
  const baseTreeSha = (await commitResponse.json()).tree.sha;
  const prepared = await prepareProjects(env, token, projects);
  const projectsContent = `${JSON.stringify({ projects: prepared.projects }, null, 2)}\n`;
  const projectsSha = await createBlob(env, token, projectsContent, "utf-8");
  const tree = [
    { path: "data/projects.json", mode: "100644", type: "blob", sha: projectsSha },
    ...prepared.files.map(file => ({ ...file, mode: "100644", type: "blob" }))
  ];
  const treeResponse = await github(
    `/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree })
    },
    token
  );
  if (!treeResponse.ok) throw new Error(`Falha ao montar publicação: ${await treeResponse.text()}`);
  const treeSha = (await treeResponse.json()).sha;
  const newCommitResponse = await github(
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "admin: atualizar projetos", tree: treeSha, parents: [baseCommitSha] })
    },
    token
  );
  if (!newCommitResponse.ok) throw new Error(`Falha ao criar commit: ${await newCommitResponse.text()}`);
  const newCommitSha = (await newCommitResponse.json()).sha;
  const updateResponse = await github(
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha: newCommitSha, force: false })
    },
    token
  );
  if (!updateResponse.ok) throw new Error("O repositório mudou durante a publicação. Recarregue e tente novamente.");
  return prepared.projects;
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    const headers = cors(request, env);
    return Object.keys(headers).length
      ? new Response(null, { status: 204, headers })
      : new Response(null, { status: 403 });
  }

  if (url.pathname === "/auth/login" && request.method === "GET") {
    const callback = `${String(env.WORKER_PUBLIC_URL).replace(/\/$/, "")}/auth/callback`;
    const state = await oauthState(env);
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    authorize.searchParams.set("redirect_uri", callback);
    authorize.searchParams.set("state", state.token);
    authorize.searchParams.set("code_challenge", state.challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("prompt", "select_account");
    return redirect(authorize.toString());
  }

  if (url.pathname === "/auth/callback" && request.method === "GET") {
    const adminUrl = String(env.ADMIN_URL).replace(/#.*$/, "");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return redirect(`${adminUrl}#error=callback_invalido`);
    let statePayload;
    try {
      const { payload } = await jwtVerify(state, new TextEncoder().encode(env.SESSION_SECRET));
      if (payload.adminUrl !== env.ADMIN_URL) throw new Error();
      statePayload = payload;
    } catch {
      return redirect(`${adminUrl}#error=state_invalido`);
    }
    const codeVerifier = await sha256Base64Url(`${statePayload.nonce}:${env.SESSION_SECRET}`);
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        code_verifier: codeVerifier
      })
    });
    const userToken = await tokenResponse.json();
    if (!userToken.access_token) return redirect(`${adminUrl}#error=oauth_falhou`);
    const meResponse = await github("/user", {}, userToken.access_token);
    const account = await meResponse.json();
    if (!meResponse.ok || !isAdmin(account.login, env)) return redirect(`${adminUrl}#error=acesso_negado`);
    const session = await new SignJWT({ login: account.login, avatar: account.avatar_url })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("ink-stella-admin")
      .setAudience("portfolio-worker")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(env.SESSION_SECRET));
    return redirect(`${adminUrl}#session=${encodeURIComponent(session)}`);
  }

  const user = await sessionUser(request, env);
  if (url.pathname === "/auth/me" && request.method === "GET") {
    return user ? json(request, env, { authenticated: true, user }) : json(request, env, { authenticated: false }, 401);
  }
  if (!user) return json(request, env, { error: "não autenticado" }, 401);

  if (url.pathname === "/api/publish" && request.method === "POST") {
    const body = await readPublishBody(request);
    const projects = await publish(env, body.projects);
    return json(request, env, { ok: true, projects });
  }

  return json(request, env, { error: "rota não encontrada" }, 404);
}

export default {
  fetch(request, env) {
    return handle(request, env).catch(error =>
      json(request, env, { error: "publish_error", detail: String(error.message || error) }, error.status || 500)
    );
  }
};

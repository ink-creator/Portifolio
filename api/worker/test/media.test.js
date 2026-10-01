import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import worker from "../src/index.js";
import {
  parseMedia,
  prepareMedia,
  readPublishBody,
  MAX_BODY_BYTES,
  MAX_VIDEO_BYTES,
} from "../src/media.js";

const data = (type, content = "test media") =>
  `data:${type};base64,${Buffer.from(content).toString("base64")}`;
const project = () => ({
  id: "notas-flutuantes",
  title: "Notas flutuantes",
  shortDescription: "Notas na tela",
  media: {
    cover: data("image/png"),
    images: ["assets/images/existente.jpg", data("image/webp")],
    video: data("video/mp4"),
  },
});

test("converte capa, galeria e vídeo em arquivos e mantém caminhos existentes", async () => {
  const projects = [project()];
  const blobs = [];
  const files = await prepareMedia(projects, async (content) => {
    blobs.push(content);
    return `sha-${blobs.length}`;
  });
  assert.equal(files.length, 3);
  assert.match(
    projects[0].media.video,
    /^assets\/videos\/projects\/notas-flutuantes\/demo-[a-f0-9]{16}\.mp4$/,
  );
  assert.match(projects[0].media.cover, /cover-[a-f0-9]{16}\.png$/);
  assert.equal(projects[0].media.images[0], "assets/images/existente.jpg");
  assert.ok(!JSON.stringify(projects).includes("data:"));
  const again = await prepareMedia(projects, () => {
    throw Error("Não deve reenviar mídia já publicada");
  });
  assert.deepEqual(again, []);
});

test("aceita WebM e rejeita formato, base64 e arquivos maiores que o limite", () => {
  assert.equal(parseMedia(data("video/webm"), "video").extension, "webm");
  assert.equal(parseMedia("https://example.com/demo.mp4", "video"), null);
  assert.throws(() => parseMedia(data("video/quicktime"), "video"), /Formato/);
  assert.throws(() => parseMedia(data("image/png"), "video"), /Formato/);
  assert.throws(() => parseMedia("data:video/mp4;base64,abc", "video"), /Formato/);
  assert.throws(() => parseMedia("blob:local-only", "video"), /Use um arquivo/);
  assert.throws(
    () => parseMedia(data("video/mp4", Buffer.alloc(MAX_VIDEO_BYTES + 1)), "video"),
    /15 MB/,
  );
});

test("valida todas as mídias antes de enviar qualquer arquivo", async () => {
  const projects = [
    project(),
    { ...project(), id: "invalido", media: { video: data("video/quicktime") } },
  ];
  let calls = 0;
  await assert.rejects(
    prepareMedia(projects, async () => {
      calls++;
    }),
    /Formato/,
  );
  assert.equal(calls, 0);
});

test("separa mídias de design e processa imagens de comparação", async () => {
  const projects = [
    {
      id: "sala-residencial",
      media: { cover: data("image/png"), images: [data("image/webp")] },
      comparison: {
        before: data("image/jpeg", "antes"),
        after: data("image/jpeg", "depois"),
      },
    },
  ];
  let index = 0;
  const files = await prepareMedia(projects, async () => `design-sha-${++index}`, "design");
  assert.equal(files.length, 4);
  assert.ok(files.every((file) => file.path.startsWith("assets/images/design/sala-residencial/")));
  assert.match(projects[0].comparison.before, /comparison-before-[a-f0-9]{16}\.jpg$/);
  assert.match(projects[0].comparison.after, /comparison-after-[a-f0-9]{16}\.jpg$/);
  assert.ok(!JSON.stringify(projects).includes("data:"));
});

test("limita o corpo real mesmo quando content-length não é enviado", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://test/api/publish", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  await assert.rejects(readPublishBody(request), (error) => error.status === 413);
  assert.equal(cancelled, true);
  await assert.rejects(
    readPublishBody(
      new Request("https://test", {
        method: "POST",
        headers: { "content-length": String(MAX_BODY_BYTES + 1) },
        body: "{}",
      }),
    ),
    (error) => error.status === 413,
  );
  await assert.rejects(
    readPublishBody(new Request("https://test", { method: "POST", body: "{broken" })),
    (error) => error.status === 400,
  );
  assert.deepEqual(
    await readPublishBody(new Request("https://test", { method: "POST", body: '{"projects":[]}' })),
    { projects: [] },
  );
});

test("publicação autenticada inclui vídeo e JSON no mesmo commit; falha de upload não altera a branch", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    SESSION_SECRET: "test-only-session-secret-at-least-32-characters",
    GITHUB_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
    GITHUB_APP_ID: "123",
    GITHUB_OWNER: "test",
    GITHUB_REPO: "portfolio",
    GITHUB_BRANCH: "main",
  };
  const token = await new SignJWT({ login: "test" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("ink-stella-admin")
    .setAudience("portfolio-worker")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  const originalFetch = globalThis.fetch;
  const calls = [];
  let failUpload = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = options.body && JSON.parse(options.body);
    calls.push({ path, method: options.method || "GET", body });
    if (path.endsWith("/installation")) return Response.json({ id: 1 });
    if (path.endsWith("/access_tokens")) return Response.json({ token: "installation-test-token" });
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "base" } });
    if (path.endsWith("/git/commits/base")) return Response.json({ tree: { sha: "base-tree" } });
    if (path.endsWith("/git/trees/base-tree")) {
      return Response.json({ tree: [{ path: "assets/images/existente.jpg", type: "blob" }] });
    }
    if (path.endsWith("/git/blobs"))
      return failUpload
        ? new Response("upload failed", { status: 502 })
        : Response.json({ sha: `blob-${calls.length}` });
    if (path.endsWith("/git/trees")) return Response.json({ sha: "tree" });
    if (path.endsWith("/git/commits")) return Response.json({ sha: "commit" });
    if (path.endsWith("/git/refs/heads/main")) return Response.json({ ok: true });
    throw Error("Unexpected request: " + path);
  };
  const request = () =>
    new Request("https://test/api/publish", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projects: [project()] }),
    });
  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.projects[0].media.video, /\.mp4$/);
    const tree = calls.find((call) => call.path.endsWith("/git/trees") && call.method === "POST").body.tree;
    assert.equal(tree.length, 4);
    assert.ok(tree.some((file) => file.path.startsWith("assets/videos/")));
    const jsonBlob = calls.find((call) => call.body?.encoding === "utf-8").body.content;
    assert.ok(!jsonBlob.includes("data:"));
    assert.equal(JSON.parse(jsonBlob).projects[0].media.video, result.projects[0].media.video);
    assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
    assert.equal(calls.find((call) => call.method === "PATCH").body.force, false);
    calls.length = 0;

    const designResponse = await worker.fetch(
      new Request("https://test/api/publish-design", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          designData: {
            categories: [{ id: "planta-baixa", label: "Plantas Baixas" }],
            projects: [
              {
                id: "sala-residencial",
                title: "Sala residencial",
                category: "planta-baixa",
                media: { cover: data("image/png"), images: [] },
                comparison: {
                  before: data("image/jpeg", "antes"),
                  after: data("image/jpeg", "depois"),
                },
              },
            ],
          },
        }),
      }),
      env,
    );
    assert.equal(designResponse.status, 200);
    const designResult = await designResponse.json();
    assert.match(designResult.designData.projects[0].comparison.after, /\.jpg$/);
    const designTree = calls.find((call) => call.path.endsWith("/git/trees") && call.method === "POST").body.tree;
    assert.ok(designTree.some((file) => file.path === "data/design-projects.json"));
    assert.ok(designTree.some((file) => file.path.startsWith("assets/images/design/")));
    const designJson = JSON.parse(
      calls.find((call) => call.body?.encoding === "utf-8").body.content,
    );
    assert.equal(designJson.categories[0].label, "Plantas Baixas");
    assert.ok(!JSON.stringify(designJson).includes("data:"));
    calls.length = 0;

    failUpload = true;
    assert.equal((await worker.fetch(request(), env)).status, 500);
    assert.equal(calls.filter((call) => call.method === "PATCH").length, 0);
    const unauthorized = await worker.fetch(
      new Request("https://test/api/publish", { method: "POST", body: "{}" }),
      env,
    );
    assert.equal(unauthorized.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("impede a publicação de uma referência assets/ que não existe no repositório", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    SESSION_SECRET: "test-only-session-secret-at-least-32-characters",
    GITHUB_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
    GITHUB_APP_ID: "123",
    GITHUB_OWNER: "test",
    GITHUB_REPO: "portfolio",
    GITHUB_BRANCH: "main",
  };
  const token = await new SignJWT({ login: "test" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("ink-stella-admin")
    .setAudience("portfolio-worker")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  const originalFetch = globalThis.fetch;
  let committed = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/installation")) return Response.json({ id: 1 });
    if (path.endsWith("/access_tokens")) return Response.json({ token: "installation-test-token" });
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "base" } });
    if (path.endsWith("/git/commits/base")) return Response.json({ tree: { sha: "base-tree" } });
    if (path.endsWith("/git/trees/base-tree")) return Response.json({ tree: [] });
    if (path.endsWith("/git/refs/heads/main") && options.method === "PATCH") committed = true;
    throw Error("A publicação não deveria criar arquivos após detectar a mídia ausente.");
  };
  try {
    const response = await worker.fetch(
      new Request("https://test/api/publish", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projects: [
            {
              id: "midia-ausente",
              title: "Mídia ausente",
              shortDescription: "Não deve publicar um caminho quebrado.",
              media: { cover: "assets/images/projects/midia-ausente/cover.png", images: [] },
            },
          ],
        }),
      }),
      env,
    );
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.match(body.detail, /não existem no repositório/);
    assert.equal(committed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

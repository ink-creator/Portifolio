import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, importPKCS8, jwtVerify } from "jose";
import { importGitHubPrivateKey } from "../src/github-key.js";
import worker from "../src/index.js";

// Disposable keys exist only in memory. Tests never read real secrets or call GitHub.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs1 = privateKey.export({ type: "pkcs1", format: "pem" });
const pkcs8 = privateKey.export({ type: "pkcs8", format: "pem" });

test("reproduces the original error with a GitHub-format PKCS#1 key", async () => {
  await assert.rejects(importPKCS8(pkcs1, "RS256"), /must be PKCS#8 formatted string/);
});

for (const [name, pem] of [
  ["GitHub PKCS#1", pkcs1],
  ["PKCS#8", pkcs8],
  ["Windows CRLF and outer whitespace", `\uFEFF \r\n${pkcs1.replace(/\n/g, "\r\n")}\r\n `],
  ["escaped newlines", pkcs1.replace(/\n/g, "\\n")],
  ["escaped Windows newlines", pkcs1.replace(/\n/g, "\\r\\n")],
  ["escaped PKCS#8", pkcs8.replace(/\n/g, "\\n")],
]) {
  test(`signs a verifiable RS256 JWT using ${name}`, async () => {
    const key = await importGitHubPrivateKey(pem);
    const token = await new SignJWT({ iss: "test-app" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });
    assert.equal(payload.iss, "test-app");
  });
}

test("rejects missing, malformed, encrypted and non-RSA keys without exposing input", async () => {
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({
    format: "pem",
    type: "pkcs8",
  });
  const encrypted = privateKey.export({
    type: "pkcs8",
    format: "pem",
    cipher: "aes-256-cbc",
    passphrase: "test-only",
  });
  for (const value of [
    undefined,
    "",
    "   ",
    "C:\\private\\secret.pem",
    "SECRET_MARKER",
    pkcs1.slice(0, 200),
    encrypted,
    ec,
  ]) {
    await assert.rejects(importGitHubPrivateKey(value), (error) => {
      assert.match(error.message, /GITHUB_PRIVATE_KEY/);
      assert.doesNotMatch(error.message, /SECRET_MARKER|BEGIN|MII|secret\.pem/);
      return true;
    });
  }
});

test("publishes through the Worker with a PKCS#1 key and verified App JWT", async (t) => {
  const env = {
    GITHUB_PRIVATE_KEY: pkcs1,
    GITHUB_APP_ID: "test-app",
    GITHUB_OWNER: "test-owner",
    GITHUB_REPO: "test-repo",
    GITHUB_BRANCH: "main",
    SESSION_SECRET: "disposable-session-secret-for-local-tests-only",
  };
  const session = await new SignJWT({ login: "test-owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("ink-stella-admin")
    .setAudience("portfolio-worker")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  const projects = [
    { id: "teste-do-painel", title: "Teste do Painel", shortDescription: "Teste", media: {} },
  ];
  const repo = "/repos/test-owner/test-repo";
  const expected = [
    ["GET", `${repo}/installation`, { id: 42 }],
    ["POST", "/app/installations/42/access_tokens", { token: "test-installation-token" }],
    ["GET", `${repo}/git/ref/heads/main`, { object: { sha: "base-commit" } }],
    ["GET", `${repo}/git/commits/base-commit`, { tree: { sha: "base-tree" } }],
    ["POST", `${repo}/git/blobs`, { sha: "projects-blob" }],
    ["POST", `${repo}/git/trees`, { sha: "next-tree" }],
    ["POST", `${repo}/git/commits`, { sha: "next-commit" }],
    ["PATCH", `${repo}/git/refs/heads/main`, {}],
  ];
  let count = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const step = expected[count++];
    assert.ok(step, "No extra GitHub request expected");
    assert.equal(new URL(url).origin, "https://api.github.com");
    assert.equal(new URL(url).pathname, step[1]);
    assert.equal(options.method || "GET", step[0]);
    const token = options.headers.authorization.replace("Bearer ", "");
    if (count <= 2) {
      const { payload } = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });
      assert.equal(payload.iss, "test-app");
      assert.ok(payload.exp - payload.iat <= 600);
    } else assert.equal(token, "test-installation-token");
    if (count === 5) {
      const body = JSON.parse(options.body);
      const saved = JSON.parse(
        body.encoding === "utf-8"
          ? body.content
          : Buffer.from(body.content, "base64").toString("utf8"),
      );
      assert.equal(saved.projects[0].id, "teste-do-painel");
    }
    if (count === 7) assert.equal(JSON.parse(options.body).message, "admin: atualizar projetos");
    if (count === 8)
      assert.deepEqual(JSON.parse(options.body), { sha: "next-commit", force: false });
    return Response.json(step[2]);
  });
  const response = await worker.fetch(
    new Request("https://worker.test/api/publish", {
      method: "POST",
      headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      body: JSON.stringify({ projects }),
    }),
    env,
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.projects[0].id, "teste-do-painel");
  assert.equal(count, expected.length);
});

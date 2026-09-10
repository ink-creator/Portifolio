export const MAX_BODY_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const types = {
  image: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
  video: { "video/mp4": "mp4", "video/webm": "webm" }
};

export function parseMedia(value, kind) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Mídia inválida.");
  if (!value.startsWith("data:")) {
    if (!/^(?:https?:\/\/|assets\/)/i.test(value)) throw new Error("Use um arquivo enviado pelo painel, caminho assets/ ou link HTTP(S) para a mídia.");
    return null;
  }
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  const extension = match && types[kind][match[1]];
  if (!extension || match[2].length % 4 !== 0) throw new Error(`Formato de ${kind === "video" ? "vídeo" : "imagem"} inválido.`);
  const content = match[2];
  const bytes = content.length / 4 * 3 - (content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0);
  const limit = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (bytes > limit) throw new Error(`${kind === "video" ? "Vídeo" : "Imagem"} excede o limite de ${limit / 1024 / 1024} MB.`);
  return { extension, content };
}

export async function prepareMedia(projects, upload) {
  // Valida todas as mídias antes de iniciar o envio dos arquivos.
  const pending = [];
  for (const project of projects) {
    project.media ||= { cover: null, images: [], video: null };
    const media = project.media;
    media.images = Array.isArray(media.images) ? media.images : [];
    const entries = [
      [media, "cover", "image", "cover"],
      ...media.images.map((_, index) => [media.images, index, "image", `screenshot-${index + 1}`]),
      [media, "video", "video", "demo"]
    ];
    for (const [target, key, kind, name] of entries) {
      const file = parseMedia(target[key], kind);
      if (!file) continue;
      // Conteúdo no nome evita substituir uma mídia ainda usada por outro projeto.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(file.content));
      const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const path = `assets/${kind === "video" ? "videos" : "images"}/projects/${project.id}/${name}-${hash}.${file.extension}`;
      pending.push({ target, key, path, content: file.content });
    }
  }
  const files = [];
  const uploaded = new Map();
  for (const file of pending) {
    if (!uploaded.has(file.path)) {
      const sha = await upload(file.content);
      uploaded.set(file.path, sha);
      files.push({ path: file.path, sha });
    }
    file.target[file.key] = file.path;
  }
  return files;
}

export async function readPublishBody(request) {
  const tooLarge = () => Object.assign(new Error("Publicação maior que 25 MB. Envie menos mídias por vez."), { status: 413 });
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw tooLarge();
  if (!request.body) throw Object.assign(new Error("Publicação vazia."), { status: 400 });
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Object.assign(new Error("JSON de publicação inválido."), { status: 400 }); }
}

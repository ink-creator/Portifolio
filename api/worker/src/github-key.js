import { createPrivateKey } from "node:crypto";
import { importPKCS8 } from "jose";

// GitHub downloads PKCS#1 PEMs; jose's Web Crypto importer expects PKCS#8.
// Convert in memory using the runtime's parser, never by editing PEM headers.
export async function importGitHubPrivateKey(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("GITHUB_PRIVATE_KEY não foi cadastrada. Envie o arquivo .pem completo como segredo do Worker.");
  }

  try {
    const pem = value.trim()
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\r\n?/g, "\n");
    const key = createPrivateKey({ key: pem, format: "pem" });
    if (key.asymmetricKeyType !== "rsa") throw new Error("RSA required");
    const pkcs8 = key.export({ type: "pkcs8", format: "pem" });
    return await importPKCS8(pkcs8, "RS256");
  } catch {
    // The API returns this message to the admin: never include the PEM or parser input.
    throw new Error("GITHUB_PRIVATE_KEY inválida. Envie o arquivo .pem completo do GitHub App, em formato RSA PKCS#1 ou PKCS#8, sem senha. Não envie somente o caminho do arquivo.");
  }
}

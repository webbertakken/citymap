// Makes a throwaway certificate for serving the viewer over HTTPS on loopback, where none exists: CI, or a machine
// without mkcert. The end-to-end suite ignores certificate errors, so a self-signed one is enough; an existing
// certificate (mkcert's, trusted by the machine) is never replaced.
// Usage: bun run cert
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const certs = join(homedir(), ".cache/citymap/certs");
const cert = join(certs, "dev.pem");
const key = join(certs, "dev-key.pem");

if (existsSync(cert) && existsSync(key)) {
  console.log(`cert/kept dir=${certs}`);
} else {
  mkdirSync(certs, { recursive: true });
  const made = Bun.spawnSync(
    [
      "openssl",
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "2",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
      "-keyout",
      key,
      "-out",
      cert,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (made.exitCode !== 0) {
    console.error(`cert/failed reason=${made.stderr.toString().trim().split("\n")[0]}`);
    process.exit(1);
  }
  console.log(`cert/made dir=${certs} days=2`);
}

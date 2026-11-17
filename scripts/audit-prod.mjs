// Production dependency audit for CI: fails on high or critical advisories,
// except the ones in IGNORED, each with a reason and a date to revisit
// (docs/04-seguranca.md). Remove an entry as soon as a fixed version exists.
import { execFileSync } from "node:child_process";

const IGNORED = {
  // picomatch ReDoS, every version, no fix published (4.0.7 is the latest).
  // Reaches us only through better-auth → vitest, never at runtime.
  // Added 17/11/2026; revisit when `npm view picomatch version` moves.
  "GHSA-fc5q-39xc-vjpf": "picomatch sem correção (via better-auth → vitest)",
};
const BLOCKING = new Set(["high", "critical"]);

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still there.
  raw = error.stdout;
  if (!raw) throw error;
}

const report = JSON.parse(raw);
const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === "object") advisories.set(via.url, via);
  }
}

const blocking = [];
for (const advisory of advisories.values()) {
  if (!BLOCKING.has(advisory.severity)) continue;
  const id = advisory.url?.split("/").pop();
  if (id && id in IGNORED) {
    console.log(`Ignorado: ${id} (${advisory.name}): ${IGNORED[id]}`);
    continue;
  }
  blocking.push(advisory);
}

for (const advisory of blocking) {
  console.error(
    `${advisory.severity}: ${advisory.name} ${advisory.range}: ${advisory.title} ${advisory.url}`,
  );
}
if (blocking.length > 0) process.exit(1);
console.log("Nenhuma vulnerabilidade alta ou crítica em produção.");

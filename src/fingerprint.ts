/**
 * Per-installation identity — TLS fingerprint + application-layer traits.
 *
 * Each installation gets a unique, stable combination of:
 *   - Chrome TLS profile  (JA3 + Akamai HTTP/2 fingerprint)
 *   - Codex CLI version   (detected from the real local install)
 *   - Installation UUID   (x-codex-installation-id)
 *   - OS / arch metadata  (for User-Agent)
 *
 * Persisted to <codexHome>/fingerprint.json on first run.
 * Subsequent runs always return the same identity.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arch as osArch, platform, release } from "node:os";
import { execSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";

export interface TlsProfile {
  ja3: string;
  akamai: string;
  label: string;
}

export interface InstallIdentity {
  tls: TlsProfile;
  codexVersion: string;
  installationId: string;
  osType: string;
  osVersion: string;
  arch: string;
}

// Only Chrome versions from ~2024 onward.
// Chrome 99/101/110 are 2–3 years old; Cloudflare's version-plausibility
// check would flag ancient fingerprints.
const CHROME_POOL: readonly TlsProfile[] = [
  { label: "chrome124", ja3: "chrome124", akamai: "chrome119" },
  { label: "chrome131", ja3: "chrome131", akamai: "chrome119" },
  { label: "chrome133", ja3: "chrome133", akamai: "chrome119" },
];

const FALLBACK_VERSION = "0.135.0";

/** Read the real Codex installation ID from <codexHome>/installation_id. */
function detectInstallationId(codexHome: string): string {
  try {
    const idPath = join(codexHome, "installation_id");
    if (existsSync(idPath)) {
      const id = readFileSync(idPath, "utf-8").trim();
      if (id) return id;
    }
  } catch { /* fallback */ }
  return randomUUID();
}

/** Detect the real Codex CLI version from the local installation. */
function detectCodexVersion(codexHome: string): string {
  // 1. version.json written by Codex's auto-update check
  try {
    const vp = join(codexHome, "version.json");
    if (existsSync(vp)) {
      const vj = JSON.parse(readFileSync(vp, "utf-8")) as Record<string, unknown>;
      const v = vj["latest_version"];
      if (typeof v === "string" && v) return v;
    }
  } catch { /* next strategy */ }

  // 2. `codex --version` → "codex-cli X.Y.Z"
  try {
    const out = execSync("codex --version", { timeout: 3000 }).toString().trim();
    const m = out.match(/(\d+\.\d+\.\d+)/);
    if (m?.[1]) return m[1];
  } catch { /* fallback */ }

  return FALLBACK_VERSION;
}

function pick<T>(pool: readonly T[]): T {
  return pool[randomInt(pool.length)]!;
}

function fingerprintPath(codexHome: string): string {
  return join(codexHome, "fingerprint.json");
}

/** Detect OS metadata matching os_info crate output used by real Codex CLI. */
export function detectPlatform(): { osType: string; osVersion: string; arch: string } {
  const a = osArch() === "arm64" ? "aarch64" : osArch() === "x64" ? "x86_64" : osArch();
  const p = platform();

  if (p === "darwin") {
    // Apple skipped macOS 16-25; Darwin-9 formula breaks on Darwin 25+.
    // Use sw_vers like the real Codex CLI's os_info crate does.
    try {
      const ver = execSync("sw_vers -productVersion", { timeout: 2000 }).toString().trim();
      if (ver) return { osType: "macOS", osVersion: ver, arch: a };
    } catch { /* fallback below */ }
    const r = release();
    const parts = r.split(".");
    const major = parseInt(parts[0] ?? "24", 10);
    const minor = parseInt(parts[1] ?? "0", 10);
    return { osType: "macOS", osVersion: `${major - 9}.${minor}`, arch: a };
  }
  if (p === "win32") {
    return { osType: "Windows", osVersion: release(), arch: a };
  }
  return { osType: "Linux", osVersion: release(), arch: a };
}

/** Sandbox tag for turn_metadata — matches real Codex per-platform values. */
export function platformSandboxTag(): string {
  const p = platform();
  if (p === "darwin") return "seatbelt";
  if (p === "linux") return "seccomp";
  if (p === "win32") return "windows_sandbox";
  return "none";
}

/** Detect terminal for User-Agent suffix (matches codex_terminal_detection). */
export function detectTerminal(): string {
  const prog = process.env["TERM_PROGRAM"];
  const ver = process.env["TERM_PROGRAM_VERSION"];
  if (!prog) return "";
  const name = prog.replace(/\.app$/i, "").toLowerCase();
  return ver ? `${name}(${ver})` : name;
}

/**
 * Load persisted identity or create + persist a new one.
 * Transparently migrates the old flat-TlsProfile format.
 */
export function loadOrCreateIdentity(codexHome: string): InstallIdentity {
  const p = fingerprintPath(codexHome);

  if (existsSync(p)) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;

      // New format: nested tls object
      if (raw["tls"] && raw["installationId"]) {
        return raw as unknown as InstallIdentity;
      }

      // Old format: flat { ja3, akamai, label }
      if (raw["ja3"] && raw["akamai"] && raw["label"]) {
        const os = detectPlatform();
        const identity: InstallIdentity = {
          tls: {
            ja3: raw["ja3"] as string,
            akamai: raw["akamai"] as string,
            label: raw["label"] as string,
          },
          codexVersion: detectCodexVersion(codexHome),
          installationId: detectInstallationId(codexHome),
          ...os,
        };
        writeFileSync(p, JSON.stringify(identity, null, 2));
        return identity;
      }
    } catch {
      // fall through to create
    }
  }

  const os = detectPlatform();
  const identity: InstallIdentity = {
    tls: pick(CHROME_POOL),
    codexVersion: detectCodexVersion(codexHome),
    installationId: detectInstallationId(codexHome),
    ...os,
  };
  writeFileSync(p, JSON.stringify(identity, null, 2));
  return identity;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateIdentity, detectPlatform, type InstallIdentity } from "../src/fingerprint.js";

function readIdentity(dir: string): InstallIdentity {
  return JSON.parse(readFileSync(join(dir, "fingerprint.json"), "utf-8")) as InstallIdentity;
}

test("loadOrCreateIdentity creates new identity with all fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-fp-"));
  try {
    const id = loadOrCreateIdentity(dir);
    assert.ok(id.tls.ja3);
    assert.ok(id.tls.akamai);
    assert.ok(id.tls.label);
    assert.ok(id.codexVersion);
    assert.ok(id.installationId);
    assert.ok(id.osType);
    assert.ok(id.osVersion);
    assert.ok(id.arch);

    const persisted = readIdentity(dir);
    assert.deepEqual(persisted, id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadOrCreateIdentity returns same identity on second load", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-fp-"));
  try {
    const first = loadOrCreateIdentity(dir);
    const second = loadOrCreateIdentity(dir);
    assert.deepEqual(second, first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadOrCreateIdentity migrates old flat TlsProfile format", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-fp-"));
  try {
    const old = { label: "chrome131", ja3: "chrome131", akamai: "chrome119" };
    writeFileSync(join(dir, "fingerprint.json"), JSON.stringify(old));

    const id = loadOrCreateIdentity(dir);

    // TLS fields preserved
    assert.equal(id.tls.ja3, "chrome131");
    assert.equal(id.tls.akamai, "chrome119");
    assert.equal(id.tls.label, "chrome131");

    // New fields added
    assert.ok(id.codexVersion);
    assert.ok(id.installationId);
    assert.ok(id.osType);

    // File updated in-place to new format
    const persisted = readIdentity(dir);
    assert.ok(persisted.tls);
    assert.ok(persisted.installationId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectPlatform returns valid os metadata", () => {
  const p = detectPlatform();
  assert.ok(["macOS", "Windows", "Linux"].includes(p.osType));
  assert.ok(p.osVersion.length > 0);
  assert.ok(["aarch64", "x86_64"].includes(p.arch) || p.arch.length > 0);
});

/**
 * Per-installation TLS fingerprint.
 *
 * All users of this open-source tool would present identical TLS handshakes
 * if we always used `ja3: "auto"` (which maps to chrome133 for everyone).
 * Instead, on first run we randomly pick one of several realistic Chrome-era
 * profiles and persist it to <codexHome>/fingerprint.json.
 *
 * Result: each installation gets a different but stable TLS identity.
 *
 * Supported by @ossiana/node-libcurl:
 *   ja3:    chrome99 | chrome101 | chrome110 | chrome124 | chrome131 | chrome133
 *   akamai: chrome99 | chrome107 | chrome119
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
/**
 * Curated pool of Chrome-version pairs that are internally consistent.
 * Each row: era-matched (ja3, akamai) so the TLS handshake looks like a
 * real Chrome version rather than a mixed chimera.
 */
// Only include Chrome versions from ~2024 onward.
// Chrome 99/101/110 are 2–3 years old; real user distribution has shifted to 124+,
// and Cloudflare's version-plausibility check would flag ancient fingerprints.
const PROFILE_POOL = [
    { label: "chrome124", ja3: "chrome124", akamai: "chrome119" },
    { label: "chrome131", ja3: "chrome131", akamai: "chrome119" },
    { label: "chrome133", ja3: "chrome133", akamai: "chrome119" },
];
function fingerprintPath(codexHome) {
    return join(codexHome, "fingerprint.json");
}
/**
 * Load the persisted TLS profile for this installation, or pick a random one
 * and save it. Subsequent runs always return the same profile.
 */
export function loadOrCreateProfile(codexHome) {
    const p = fingerprintPath(codexHome);
    if (existsSync(p)) {
        try {
            const data = JSON.parse(readFileSync(p, "utf-8"));
            if (data.ja3 && data.akamai && data.label) {
                return { ja3: data.ja3, akamai: data.akamai, label: data.label };
            }
        }
        catch {
            // fall through to create
        }
    }
    const profile = PROFILE_POOL[randomInt(PROFILE_POOL.length)];
    writeFileSync(p, JSON.stringify(profile, null, 2));
    return profile;
}

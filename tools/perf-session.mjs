// Shared plumbing for the three production measurement tools.
//
// WHAT THIS EXISTS TO PREVENT. These tools measure a GATED page, so they need a
// signed-in session, and the first versions of them got it by hard-coding one
// developer's Windows home directory, two profile folder names that did not say
// which account they held, and a player id. That is a measurement tool that
// only works on one machine and carries somebody's identity in the repository.
//
// Here the session is always SUPPLIED: --profile points at a Chromium
// user-data directory that is already signed in, and nothing is assumed about
// where it lives. Nothing about it is ever printed. Cookies are copied into a
// throwaway directory under the OS temp dir, used, and left there; they are
// never read, decoded, logged or written anywhere this repository can see.
import { mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const DEFAULT_ORIGIN = 'https://nikcade.win';
export const GAME_PATH = '/play/scramble-rush';

export function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  return fallback;
}
export const flag = (name) => process.argv.includes(`--${name}`);
export const wantsHelp = () => flag('help') || flag('h');

export function showHelp(text) { console.log(text.trim()); process.exit(0); }

export const origin = () => (arg('origin', process.env.SR_ORIGIN) || DEFAULT_ORIGIN).replace(/\/+$/, '');

// THE PROFILE IS REQUIRED AND NEVER GUESSED.
//
// An unauthenticated run of any of these measures a 403 page, and a tool that
// quietly did that and then printed a performance table would be worse than one
// that failed: the numbers look real. So a missing --profile stops the run, and
// the session is checked against the server afterwards rather than assumed.
export function requireProfile() {
  const p = arg('profile', process.env.SR_PROFILE);
  if (!p) {
    console.error('error: --profile is required.\n');
    console.error('  Pass a Chromium user-data directory that is ALREADY signed in to the site:');
    console.error('    --profile "/path/to/User Data"       (its Default/ profile is used)');
    console.error('    --profile-dir "Profile 1"            (to pick another one)');
    console.error('  or set SR_PROFILE. Nothing is written to it: cookies are copied out to a');
    console.error('  temporary directory for the run and never printed.');
    process.exit(2);
  }
  if (!existsSync(p)) { console.error(`error: --profile path does not exist: ${p}`); process.exit(2); }
  return p;
}
export const profileDirName = () => arg('profile-dir', process.env.SR_PROFILE_DIR) || 'Default';

// Copy just enough of a signed-in profile to carry the session: the user-data
// root's Local State, which holds the OS-bound key, and the profile's cookie
// database. Copies, never the originals, so a browser in use is untouched.
export function seedSession(srcRoot, srcProfile, label = 'run') {
  const dest = join(tmpdir(), `sr-perf-${label}-${process.pid}`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, 'Default/Network'), { recursive: true });
  let copied = 0;
  for (const [from, to] of [
    [join(srcRoot, 'Local State'), join(dest, 'Local State')],
    [join(srcRoot, srcProfile, 'Network/Cookies'), join(dest, 'Default/Network/Cookies')],
  ]) {
    if (!existsSync(from)) continue;
    try { copyFileSync(from, to); copied += 1; } catch { /* locked by a running browser */ }
  }
  if (!copied) {
    console.error(`error: found no session files under ${srcRoot}. Is that a Chromium user-data directory?`);
    process.exit(2);
  }
  return dest;
}
export const discardSession = (dir) => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };

// Ask the SERVER who this is. Returns the player id and nothing else from the
// payload -- no email, no nickname, no drop list.
export async function whoami(page, base) {
  await page.goto(`${base}/auth/me`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page.evaluate(() => {
    try { return JSON.parse(document.body.innerText).player?.id ?? null; } catch { return null; }
  });
}

// A player id is a UUID and not a secret, but it is still somebody's, so it is
// shown as a short prefix and only when a run needs to prove WHICH session it
// used. `--expect` turns that into an assertion instead of a decoration.
export const shortId = (id) => (id ? `${id.slice(0, 8)}…` : 'none');

export function assertSession(id, what) {
  if (!id) {
    console.error(`error: ${what} is NOT signed in — refusing to report an unauthenticated run as authenticated.`);
    process.exit(2);
  }
  const expect = arg('expect', process.env.SR_EXPECT || null);
  if (expect && !id.startsWith(expect)) {
    console.error(`error: ${what} is ${shortId(id)}, expected ${expect}…`);
    process.exit(2);
  }
  return id;
}

// Anything that could carry identity out of a captured frame. Applied to every
// socket frame before it is printed: the gathering state carries a roster, and
// a roster carries player ids and display names.
export function redact(s) {
  return String(s)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<player-id>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/("(?:name|nickname|email)"\s*:\s*)"[^"]*"/gi, '$1"<redacted>"');
}

export function stats(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  return { n: v.length, min: v[0], p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), max: v[v.length - 1] };
}
export const r1 = (x) => (x == null ? '-' : Math.round(x * 1000) / 1000);

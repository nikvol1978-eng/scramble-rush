#!/usr/bin/env node
// Merge a pull request ONLY after its checks have explicitly finished green.
//
//   node tools/ci/merge-gate.mjs --pr 27
//   node tools/ci/merge-gate.mjs --pr 27 --require "Checks" --deadline 1800
//   node tools/ci/merge-gate.mjs --pr 27 --dry-run
//
// Exit codes, because a caller has to be able to tell these apart:
//   0  merged
//   2  refused -- a check failed, the head moved, or the query did not answer
//   3  timed out waiting; nothing was merged
//
// ---- WHAT WENT WRONG, WHICH IS WHY THIS IS A FILE AND NOT A ONE-LINER ----
//
// The gate used to be typed at a shell prompt, and looked like this:
//
//   for i in $(seq 1 20); do
//     s=$(gh pr view 26 --json statusCheckRollup \
//         -q '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length' 2>/dev/null)
//     if [ "$s" = "0" ]; then break; fi
//     sleep 30
//   done
//   gh pr view 26 ... | sort | uniq -c && gh pr merge 26 --merge
//
// It had five separate ways to merge something it should not have:
//
//   THE LOOP ENDED THE SAME WAY WHETHER IT SUCCEEDED OR GAVE UP. `break` on
//   success and falling off the end after twenty turns land on the identical
//   next line, and nothing afterwards could tell which had happened. This is
//   the one that actually fired: PR #26 was merged while its checks were still
//   queued.
//
//   THE MERGE WAS SEQUENCED WITH `;`, NOT GUARDED BY ANYTHING. The `&&` in
//   that line binds to the harmless `uniq -c` before it, so the merge ran
//   unconditionally -- and even an `&&` there would only have chained off
//   whether PRINTING succeeded.
//
//   A FAILED QUERY READ AS "KEEP WAITING". `2>/dev/null` turned any gh or
//   network error into an empty string, which is not "0", so the loop spun to
//   exhaustion and then merged anyway.
//
//   IT NEVER LOOKED AT A CONCLUSION. It counted checks that were not COMPLETED.
//   A completed FAILURE is completed, so a red run satisfied it exactly as well
//   as a green one.
//
//   AN EMPTY LIST WAS A PASS. No checks at all gives a count of zero, which the
//   condition read as "everything finished".
//
// So the rule here is that the merge call sits inside one branch of an explicit
// decision, every other branch RETURNS, and there is no line after the loop for
// control to fall through to.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// A check that has not finished. None of these is ever a pass.
export const PENDING = new Set([
  'QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED', 'ACTION_REQUIRED',
]);
// The ONLY conclusion that counts as passing. Everything else -- FAILURE,
// CANCELLED, TIMED_OUT, STARTUP_FAILURE, STALE, NEUTRAL, SKIPPED, and anything
// GitHub adds later -- refuses the merge rather than being quietly tolerated.
export const PASSING = 'SUCCESS';

// GitHub reports two different shapes in one list: CheckRun, with a status and
// a conclusion, and StatusContext, with a single state. Normalising them here
// means the decision below has one kind of thing to reason about.
export function normalise(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name || raw.context || raw.__typename || 'unnamed check';
  if (raw.state !== undefined && raw.status === undefined) {
    const state = String(raw.state || '').toUpperCase();
    return {
      name,
      status: state === 'PENDING' || state === 'EXPECTED' ? 'IN_PROGRESS' : 'COMPLETED',
      conclusion: state === 'SUCCESS' ? 'SUCCESS' : state,
    };
  }
  return {
    name,
    status: String(raw.status || '').toUpperCase(),
    conclusion: raw.conclusion == null ? null : String(raw.conclusion).toUpperCase(),
  };
}

// THE WHOLE DECISION, as a pure function of one observation.
//
// Three answers and no fourth: merge, keep waiting, or refuse. A caller cannot
// accidentally get "merge" by failing to handle something, because every path
// that is not unambiguously green returns 'wait' or 'abort' by name.
export function decide(sample, opts = {}) {
  const { required = [], expectedHead = null } = opts;

  if (!sample || typeof sample !== 'object') return { action: 'abort', reason: 'no observation at all' };
  if (sample.ok === false || sample.error) {
    return { action: 'abort', reason: `could not read the checks: ${sample.error || 'query failed'}` };
  }
  if (!sample.headSha) return { action: 'abort', reason: 'the pull request reported no head commit' };
  // THE CHECKS HAVE TO BELONG TO THE COMMIT BEING MERGED. A push during the
  // wait leaves a green rollup describing a commit that is no longer what the
  // merge would take.
  if (expectedHead && sample.headSha !== expectedHead) {
    return { action: 'abort', reason: `the head moved from ${expectedHead.slice(0, 12)} to ${sample.headSha.slice(0, 12)} while waiting` };
  }
  if (!Array.isArray(sample.checks)) return { action: 'abort', reason: 'the checks field was not a list' };

  const checks = sample.checks.map(normalise).filter(Boolean);

  // Nothing has registered yet. That is not a pass and it is not a failure --
  // it is too early to tell, so it waits, and the deadline decides.
  if (checks.length === 0) return { action: 'wait', reason: 'no checks have registered yet' };

  const missing = required.filter((r) => !checks.some((c) => c.name === r));
  if (missing.length) return { action: 'wait', reason: `required check(s) not reported yet: ${missing.join(', ')}` };

  const pending = checks.filter((c) => c.status !== 'COMPLETED' || PENDING.has(c.status));
  if (pending.length) {
    return {
      action: 'wait',
      reason: `${pending.length} check(s) still running: ` +
              pending.slice(0, 4).map((c) => `${c.name} [${c.status || 'unknown'}]`).join(', '),
    };
  }

  // Completed is not passing. Every one of them has to say SUCCESS.
  const bad = checks.filter((c) => c.conclusion !== PASSING);
  if (bad.length) {
    return {
      action: 'abort',
      reason: `${bad.length} check(s) did not pass: ` +
              bad.slice(0, 6).map((c) => `${c.name} [${c.conclusion || 'no conclusion'}]`).join(', '),
    };
  }

  return { action: 'merge', reason: `${checks.length} check(s) completed successfully` };
}

// The loop, with the merge inside a branch rather than after the loop.
//
// `poll`, `merge`, `sleep` and `now` are injected so the whole gate can be
// driven deterministically by a test -- including the timeout, which is the
// case that has to be proved incapable of merging.
export async function runGate({
  poll, merge, sleep, now = Date.now,
  deadlineMs = 15 * 60_000, intervalMs = 15_000,
  required = [], expectedHead = null, log = () => {},
}) {
  const started = now();
  let merges = 0;

  for (;;) {
    let sample;
    try {
      sample = await poll();
    } catch (e) {
      // A query that threw tells us nothing about the checks, so it cannot be
      // read as permission to proceed.
      return { code: 2, action: 'abort', merges, reason: `the checks query threw: ${(e && e.message) || e}` };
    }

    const verdict = decide(sample, { required, expectedHead });
    log(verdict.action, verdict.reason);

    if (verdict.action === 'abort') return { code: 2, action: 'abort', merges, reason: verdict.reason };

    if (verdict.action === 'merge') {
      if (merges > 0) return { code: 2, action: 'abort', merges, reason: 'the gate tried to merge twice' };
      merges += 1;
      await merge();
      return { code: 0, action: 'merge', merges, reason: verdict.reason };
    }

    // Still waiting. THE DEADLINE RETURNS; it does not break to a line below
    // the loop, because there is no line below the loop.
    if (now() - started >= deadlineMs) {
      return {
        code: 3, action: 'abort', merges,
        reason: `timed out after ${Math.round((now() - started) / 1000)}s without a green result (${verdict.reason})`,
      };
    }
    await sleep(intervalMs);
  }
}

// ---------------------------------------------------------------- the CLI
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  return fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

async function gh(args) {
  const { stdout } = await exec('gh', args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

async function main() {
  const pr = arg('pr');
  if (!pr) { console.error('usage: merge-gate.mjs --pr <number> [--require "A,B"] [--deadline <seconds>] [--interval <seconds>] [--dry-run]'); process.exit(2); }
  const required = (arg('require', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const deadlineMs = Number(arg('deadline', 900)) * 1000;
  const intervalMs = Number(arg('interval', 20)) * 1000;
  const dry = flag('dry-run');

  const first = JSON.parse(await gh(['pr', 'view', pr, '--json', 'headRefOid,state,statusCheckRollup']));
  if (first.state !== 'OPEN') { console.error(`refusing: pull request #${pr} is ${first.state}`); process.exit(2); }
  const expectedHead = first.headRefOid;
  console.log(`merge gate: PR #${pr} at ${expectedHead.slice(0, 12)}`);
  if (required.length) console.log(`required: ${required.join(', ')}`);

  const result = await runGate({
    expectedHead, required, deadlineMs, intervalMs,
    log: (action, reason) => console.log(`  ${action}: ${reason}`),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    poll: async () => {
      try {
        const j = JSON.parse(await gh(['pr', 'view', pr, '--json', 'headRefOid,state,statusCheckRollup']));
        if (j.state !== 'OPEN') return { ok: false, error: `the pull request is ${j.state}` };
        return { ok: true, headSha: j.headRefOid, checks: j.statusCheckRollup || [] };
      } catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
      }
    },
    merge: async () => {
      if (dry) { console.log('  --dry-run: the gate would merge here'); return; }
      await gh(['pr', 'merge', pr, '--merge', '--delete-branch=false']);
    },
  });

  console.log(`\n${result.action === 'merge' ? 'MERGED' : 'NOT MERGED'}: ${result.reason}`);
  process.exit(result.code);
}

// Only the CLI runs on import of the entry point; the test imports the
// functions above without any of this happening.
if (process.argv[1] && process.argv[1].endsWith('merge-gate.mjs')) {
  main().catch((e) => { console.error(e); process.exit(2); });
}

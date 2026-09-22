#!/usr/bin/env node
// The merge gate, driven deterministically.
//
//   node --test tools/ci/merge-gate.test.mjs
//
// Every case runs against an injected clock, an injected poller and an injected
// merge, so the timeout is exercised in microseconds and the question "could
// this ever have merged?" is answered by counting calls rather than by reading
// the code and hoping.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decide, normalise, runGate, PASSING } from './merge-gate.mjs';

// ---- a harness that cannot lie about whether a merge happened --------------
function harness(samples, { deadlineMs = 1000, intervalMs = 100, ...rest } = {}) {
  let t = 0;
  const merges = [];
  let i = 0;
  return {
    merges,
    run: () => runGate({
      deadlineMs,
      intervalMs,
      now: () => t,
      sleep: async (ms) => { t += ms; },
      // The last sample repeats forever, which is what a stuck queue looks like.
      poll: async () => (typeof samples === 'function' ? samples(i++) : samples[Math.min(i++, samples.length - 1)]),
      merge: async () => { merges.push(t); },
      ...rest,
    }),
  };
}

const check = (name, status, conclusion) => ({ name, status, conclusion });
const green = { ok: true, headSha: 'abc123', checks: [check('Checks', 'COMPLETED', 'SUCCESS')] };

describe('the merge gate refuses everything that is not explicitly green', () => {
  test('checks QUEUED -> waits, and never merges', async () => {
    const h = harness([{ ok: true, headSha: 'abc123', checks: [check('Checks', 'QUEUED', null)] }]);
    const r = await h.run();
    assert.equal(r.action, 'abort');
    assert.equal(r.code, 3, 'a queue that never moves is a timeout, not a pass');
    assert.deepEqual(h.merges, [], 'nothing may be merged while a check is queued');
  });

  test('checks IN_PROGRESS -> waits, and never merges', async () => {
    const h = harness([{ ok: true, headSha: 'abc123', checks: [check('Checks', 'IN_PROGRESS', null)] }]);
    const r = await h.run();
    assert.equal(r.code, 3);
    assert.deepEqual(h.merges, []);
  });

  test('poll timeout exits non-zero and does NOT reach the merge', async () => {
    const h = harness([{ ok: true, headSha: 'abc123', checks: [check('Checks', 'QUEUED', null)] }],
      { deadlineMs: 500, intervalMs: 100 });
    const r = await h.run();
    assert.equal(r.code, 3);
    assert.match(r.reason, /timed out/);
    assert.deepEqual(h.merges, [], 'THE regression: exhausting the wait must not fall through to a merge');
  });

  test('one required check fails -> aborts immediately', async () => {
    const h = harness([{
      ok: true,
      headSha: 'abc123',
      checks: [check('Checks', 'COMPLETED', 'SUCCESS'), check('Budget', 'COMPLETED', 'FAILURE')],
    }]);
    const r = await h.run();
    assert.equal(r.code, 2);
    assert.match(r.reason, /Budget \[FAILURE\]/);
    assert.deepEqual(h.merges, []);
  });

  test('every non-success conclusion refuses the merge', async () => {
    for (const c of ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE',
                     'STALE', 'NEUTRAL', 'SKIPPED', 'SOMETHING_GITHUB_ADDS_LATER']) {
      const h = harness([{ ok: true, headSha: 'abc123', checks: [check('Checks', 'COMPLETED', c)] }]);
      const r = await h.run();
      assert.equal(r.code, 2, `${c} must refuse`);
      assert.deepEqual(h.merges, [], `${c} must not merge`);
    }
  });

  test('an API error is not permission to proceed', async () => {
    const h = harness([{ ok: false, error: 'gh: network unreachable' }]);
    const r = await h.run();
    assert.equal(r.code, 2);
    assert.match(r.reason, /could not read the checks/);
    assert.deepEqual(h.merges, []);
  });

  test('a poller that THROWS is not permission to proceed', async () => {
    const r = await runGate({
      deadlineMs: 1000, intervalMs: 100, now: () => 0, sleep: async () => {},
      poll: async () => { throw new Error('socket hang up'); },
      merge: async () => { assert.fail('merged after a thrown query'); },
    });
    assert.equal(r.code, 2);
    assert.match(r.reason, /threw/);
  });

  test('no checks at all never becomes a pass', async () => {
    const h = harness([{ ok: true, headSha: 'abc123', checks: [] }]);
    const r = await h.run();
    assert.equal(r.code, 3);
    assert.deepEqual(h.merges, [], 'an empty rollup is too early to tell, never "all green"');
  });

  test('a required check that never registers never merges', async () => {
    const h = harness([green], { required: ['Budget'] });
    const r = await h.run();
    assert.equal(r.code, 3);
    assert.match(r.reason, /Budget/);
    assert.deepEqual(h.merges, []);
  });

  test('a head that moves mid-wait refuses, however green it looks', async () => {
    const h = harness([
      { ok: true, headSha: 'abc123', checks: [check('Checks', 'IN_PROGRESS', null)] },
      { ok: true, headSha: 'def456', checks: [check('Checks', 'COMPLETED', 'SUCCESS')] },
    ], { expectedHead: 'abc123' });
    const r = await h.run();
    assert.equal(r.code, 2);
    assert.match(r.reason, /head moved/);
    assert.deepEqual(h.merges, []);
  });

  test('all required checks green -> merges EXACTLY once', async () => {
    const h = harness([
      { ok: true, headSha: 'abc123', checks: [check('Checks', 'QUEUED', null)] },
      { ok: true, headSha: 'abc123', checks: [check('Checks', 'IN_PROGRESS', null)] },
      { ok: true, headSha: 'abc123', checks: [check('Checks', 'COMPLETED', 'SUCCESS'), check('Budget', 'COMPLETED', 'SUCCESS')] },
    ], { expectedHead: 'abc123', required: ['Checks', 'Budget'] });
    const r = await h.run();
    assert.equal(r.code, 0);
    assert.equal(r.action, 'merge');
    assert.equal(h.merges.length, 1, 'exactly one merge');
    assert.equal(r.merges, 1);
  });

  test('normalises a StatusContext as strictly as a CheckRun', () => {
    assert.deepEqual(normalise({ context: 'legacy/ci', state: 'SUCCESS' }),
      { name: 'legacy/ci', status: 'COMPLETED', conclusion: 'SUCCESS' });
    assert.deepEqual(normalise({ context: 'legacy/ci', state: 'PENDING' }),
      { name: 'legacy/ci', status: 'IN_PROGRESS', conclusion: 'PENDING' });
    assert.equal(decide({ ok: true, headSha: 'a', checks: [{ context: 'legacy/ci', state: 'FAILURE' }] }).action, 'abort');
    assert.equal(PASSING, 'SUCCESS');
  });
});

// ---- and the proof that the OLD behaviour was really broken ---------------
//
// This is the shell gate that merged PR #26, written out in JavaScript so it
// can be executed rather than argued about:
//
//   for i in $(seq 1 20); do
//     s=$(gh pr view 26 --json statusCheckRollup \
//         -q '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length' 2>/dev/null)
//     if [ "$s" = "0" ]; then break; fi
//     sleep 30
//   done
//   gh pr view ... | uniq -c && gh pr merge 26 --merge
//
// The loop ends identically whether it broke out or ran out, and the merge is
// on the next line either way.
function legacyGate(samples, turns = 20) {
  let merged = 0;
  let i = 0;
  for (let n = 0; n < turns; n += 1) {
    const s = samples[Math.min(i++, samples.length - 1)];
    // `2>/dev/null` made any error an empty string, which is not "0".
    const count = s.ok === false ? '' : String(s.checks.filter((c) => c.status !== 'COMPLETED').length);
    if (count === '0') break;
  }
  merged += 1;        // the next line, reached from BOTH exits of the loop
  return merged;
}

describe('the old gate, kept only to show what it did', () => {
  test('it merged on timeout -- the exact PR #26 failure', () => {
    const queuedForever = [{ ok: true, headSha: 'abc123', checks: [check('Checks', 'QUEUED', null)] }];
    assert.equal(legacyGate(queuedForever), 1, 'the old gate merged a PR whose checks never finished');
  });

  test('it merged on a failed query', () => {
    assert.equal(legacyGate([{ ok: false, error: 'network' }]), 1);
  });

  test('it merged a RED run, because completed is not passing', () => {
    assert.equal(legacyGate([{ ok: true, headSha: 'abc123', checks: [check('Checks', 'COMPLETED', 'FAILURE')] }]), 1);
  });

  test('it merged with no checks at all', () => {
    assert.equal(legacyGate([{ ok: true, headSha: 'abc123', checks: [] }]), 1);
  });

  test('and the new gate refuses every one of those', async () => {
    const cases = [
      [{ ok: true, headSha: 'abc123', checks: [check('Checks', 'QUEUED', null)] }],
      [{ ok: false, error: 'network' }],
      [{ ok: true, headSha: 'abc123', checks: [check('Checks', 'COMPLETED', 'FAILURE')] }],
      [{ ok: true, headSha: 'abc123', checks: [] }],
    ];
    for (const samples of cases) {
      const h = harness(samples, { deadlineMs: 300, intervalMs: 100 });
      const r = await h.run();
      assert.notEqual(r.code, 0);
      assert.deepEqual(h.merges, []);
    }
  });
});

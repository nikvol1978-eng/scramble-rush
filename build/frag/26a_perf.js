// ---------------------------------------------------------------- v26 §1
// STARTUP INSTRUMENTATION.
//
// WHY THIS EXISTS. The startup is two different durations wearing one coat,
// and almost every wrong conclusion about it comes from adding them together:
//
//   REAL PREPARATION   the gates in 39_startup.js actually doing work --
//                      waiting on the CDN, loading the profile, building the
//                      racer, warming the skin cache, readying the lobby.
//   PRESENTATION FLOOR BOOT_MIN_MS, currently 5,000 ms from navigationStart.
//                      Deliberate. The loader is held there even when the work
//                      finished early, because a loading screen that flashes
//                      past is worse than one that reads.
//
// A visible loader of 5.5 s does NOT mean the game needs 5.5 s to get ready.
// Reporting one number for both turns a piece of deliberate presentation into
// an invented performance problem -- or, worse, lets a real regression hide
// inside the floor. report() below refuses to add them up.
//
// It stays in the release rather than living behind a debug flag: it costs a
// Map write per stage, it is the only way to tell a slow boot from a slow
// network in the field, and a measurement tool that only exists on a
// developer's machine measures a build nobody ships.
//
// ---- and one thing that is deliberately NOT here -------------------------
// An earlier version of this file exported srFirstPaint(), a yield meant to
// let the boot screen paint before the game built itself. It was removed
// because it was measured and did not work: served compressed, as production
// serves it, Chrome streams the document and paints the boot screen off the
// first few KB anyway. Observed FCP was 508 ms without it and 536 ms with it,
// and moving first paint ahead of the work pushed desktop TBT from 33 ms to
// 511 ms. See the note in build.py; the trap is worth remembering because the
// theory is very persuasive right up until the harness is fixed.

// ---- the marks ----------------------------------------------------------
// Every number is measured from navigationStart, because that is the instant
// the player's wait begins. performance.now() is already zeroed there, so a
// mark is just a timestamp and the report needs no arithmetic to be honest.
//
// This is DEBUG instrumentation and it stays in the release on purpose: it
// costs a Map write per stage, it is the only way to tell a slow boot from a
// slow network in the field, and a measurement tool that only exists on a
// developer's machine measures a build nobody ships.
//
// Deliberately a named factory rather than the usual `(function(){…})()`:
// mkdebug.py splices the debug hooks in at the game IIFE's closing `\n})();`
// and asserts that anchor appears exactly once, so a second one here would
// break the debug build rather than this file.
function srperfInit(){
  const marks = new Map();
  function mark(name){
    if(!marks.has(name)) marks.set(name, performance.now());
    return marks.get(name);
  }
  function paintEntry(name){
    try {
      const e = performance.getEntriesByType('paint').find(p => p.name === name);
      return e ? e.startTime : null;
    } catch(_){ return null; }
  }
  function nav(){
    try { return performance.getEntriesByType('navigation')[0] || null; }
    catch(_){ return null; }
  }
  // THE DISTINCTION THIS WHOLE OBJECT EXISTS FOR.
  //
  // The loader is visible for about five seconds because BOOT_MIN_MS holds it
  // there, not because the game needs five seconds to get ready. Reporting one
  // number for both would turn a deliberate piece of presentation into an
  // invented performance problem -- or, worse, let a real regression hide
  // inside the floor. So preparation and presentation are separate fields and
  // the report refuses to add them up.
  function report(){
    const n = nav();
    const prepStart = marks.get('boot:gates:start');
    const prepEnd   = marks.get('boot:gates:end');
    const out = {
      navigation: n ? {
        ttfb: Math.round(n.responseStart),
        responseEnd: Math.round(n.responseEnd),
        domInteractive: Math.round(n.domInteractive),
        domContentLoaded: Math.round(n.domContentLoadedEventEnd),
        load: Math.round(n.loadEventEnd),
        transferSize: n.transferSize,
        encodedBodySize: n.encodedBodySize,
        decodedBodySize: n.decodedBodySize,
      } : null,
      paint: { fp: paintEntry('first-paint'), fcp: paintEntry('first-contentful-paint') },
      stages: Object.fromEntries([...marks].map(([k, v]) => [k, Math.round(v)])),
      // The two numbers that must never be conflated.
      realPreparationMs: (prepStart != null && prepEnd != null)
        ? Math.round(prepEnd - prepStart) : null,
      presentationFloorMs: marks.has('boot:floor:waited')
        ? Math.round(marks.get('boot:floor:waited') - (prepEnd ?? 0)) : null,
      visibleLoaderMs: marks.has('boot:handoff:end')
        ? Math.round(marks.get('boot:handoff:end')) : null,
    };
    return out;
  }
  return { mark, report, marks };
}
const SRPERF = srperfInit();
try { window.__srperf = SRPERF; } catch(_){}
SRPERF.mark('module:eval:start');

// ---------------------------------------------------------------- v26 §2
// PEERJS, ON DEMAND.
//
// WHAT IT COST WHERE IT WAS. PeerJS was a plain <script src> in <head>, so it
// was parser-blocking: the browser stopped reading the document -- before the
// boot screen's markup, before the stylesheet that draws it -- to go and fetch
// it from unpkg. Lighthouse costed that block at 802 ms on mobile. Then a CPU
// profile costed its EVALUATION at a further 807 ms at 4x throttle. Roughly
// 1.6 seconds of the startup, for a library the first screen does not use.
//
// AND IT IS NOT USED THERE. `Peer` appears in exactly two places, hostRoom()
// and joinRoom(), both reached only by a click on the multiplayer screen. The
// boot sequence, the character preview and Mode Select never touch it.
//
// THE REDIRECT, SEPARATELY. The old URL was version-less --
// unpkg.com/peerjs/dist/peerjs.min.js -- which unpkg answers with a 302 to
// unpkg.com/peerjs@1.5.5/dist/peerjs.min.js. That showed up in the network log
// as two entries and read like a double load; it is one file behind one extra
// round trip. The version is pinned here so the round trip goes away, and so
// that a PeerJS release cannot change this game's networking without a commit.
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';

let _peerLoad = null;
// Resolves true once window.Peer exists, false if it cannot be had. Never
// rejects: every caller's failure path is the same sentence on the multiplayer
// screen, and a rejected promise would turn that into an unhandled error as
// well as a broken button.
function srLoadPeer(){
  if(typeof Peer !== 'undefined') return Promise.resolve(true);
  if(_peerLoad) return _peerLoad;
  _peerLoad = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = PEERJS_URL;
    s.async = true;
    s.onload  = ()=> resolve(typeof Peer !== 'undefined');
    // A failed load must be retryable: the player may have opened the screen
    // in a tunnel. Clearing the cached promise means the next click tries
    // again rather than replaying the failure forever.
    s.onerror = ()=>{ _peerLoad = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _peerLoad;
}

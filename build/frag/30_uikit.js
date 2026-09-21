  // ============================================================
  // UI KIT  (v25 §2)
  // ============================================================
  // The small behaviours the meta screens share. It exists because the locker,
  // the shop and the pass had each grown their own answer to the same three
  // questions -- how does a shelf scroll, what does hovering mean, what does
  // clicking mean -- and had each answered the second one "it equips the thing
  // under the pointer", which is the defect this release is mostly about.
  //
  // THE RULE THIS FILE ENFORCES:
  //   hover      may highlight. It may not change anything that persists.
  //   click/tap  selects.
  //   a button   equips, buys or claims. Nothing else does.
  //   drag       scrolls, and the release that ends a drag is not a click.

  // ---- horizontal shelves ------------------------------------------------
  // Press, drag, release. NOT "the pointer went near the edge so the rail
  // started moving", which is what the pass did: its hover handler set the
  // selection and psSync() then called scrollIntoView on it with smooth
  // behaviour, so simply moving the mouse across the track scrolled the track.
  //
  // Pointer capture is what makes the drag survive leaving the element, and
  // the threshold is what keeps a normal click from being read as a one-pixel
  // drag. After a real drag the click that the release generates is swallowed,
  // because letting go over a reward must not claim it.
  function dragShelf(el){
    if(!el || el.__shelf) return;
    el.__shelf = true;
    const THRESH = 6;                      // px of travel before it is a drag
    let id = null, x0 = 0, left0 = 0, moved = false, deadUntil = 0;

    el.addEventListener('pointerdown', (e)=>{
      if(e.button) return;                 // primary button (or touch/pen) only
      id = e.pointerId; x0 = e.clientX; left0 = el.scrollLeft; moved = false;
      try{ el.setPointerCapture(id); }catch(_){ /* capture is a nicety */ }
    });

    el.addEventListener('pointermove', (e)=>{
      if(id === null || e.pointerId !== id) return;
      const dx = e.clientX - x0;
      if(!moved){
        if(Math.abs(dx) < THRESH) return;  // still a click, as far as anyone knows
        moved = true; el.classList.add('dragging');
      }
      el.scrollLeft = left0 - dx;
      e.preventDefault();
    });

    const end = (e)=>{
      if(id === null || (e.pointerId !== undefined && e.pointerId !== id)) return;
      try{ if(el.hasPointerCapture(id)) el.releasePointerCapture(id); }catch(_){ /* gone */ }
      id = null;
      if(moved){
        // Time-boxed rather than a one-shot listener: a drag that ends off a
        // card produces no click at all, and a one-shot would then sit there
        // waiting to eat somebody's next real one.
        deadUntil = performance.now() + 140;
        el.classList.remove('dragging');
      }
      moved = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);

    // Capture phase, so it runs before the card's own handler.
    el.addEventListener('click', (e)=>{
      if(performance.now() < deadUntil){ e.stopPropagation(); e.preventDefault(); }
    }, true);

    // A wheel over a horizontal shelf should move it horizontally. A trackpad
    // sends deltaX of its own; a wheel mouse only ever sends deltaY, and
    // without this it scrolls the page behind the shelf instead.
    el.addEventListener('wheel', (e)=>{
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if(!d) return;
      el.scrollLeft += d;
      e.preventDefault();
    }, { passive:false });
  }

  // ---- "did a drag just happen here" -------------------------------------
  // For handlers that are not on a shelf child but still must not fire on the
  // tail of a drag.
  function shelfIsDragging(el){ return !!(el && el.classList.contains('dragging')); }

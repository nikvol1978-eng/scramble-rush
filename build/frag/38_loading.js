  // ============================================================
  // LOADING  (v25 §7)
  // ============================================================
  // Two loading contexts, two treatments, because they answer two different
  // questions.
  //
  //   1. THE BOOT SCREEN answers "is it coming?". It is up before the game
  //      exists, so it is plain HTML and CSS in the document head's markup --
  //      no three.js, no fonts required -- and it is taken down by the game as
  //      soon as the lobby can be drawn. It shows a real indeterminate spinner
  //      rather than a progress bar, because nothing here can honestly say what
  //      fraction of the work is done, and a bar that fakes it is worse than no
  //      bar at all.
  //
  //   2. THE ROUND BRIEFING answers "what am I about to play?". Course name,
  //      a picture of it, the mode, and the one line of advice the map carries.
  //
  // Neither adds a delay. The boot screen is removed on the frame the lobby is
  // ready; the briefing rides the 2600ms the round already waited.

  function fillMapIntro(map){
    if(!map) return;
    const nm = $('mapIntroName');
    if(nm) nm.textContent = map.name.toUpperCase();
    const tip = $('mapIntroTip');
    if(tip) tip.textContent = map.tip || '';
    const mode = $('mapIntroMode');
    if(mode){
      // A minigame is a survival round; everything else is a race. The game
      // already draws this distinction, so the pill reads it rather than
      // carrying a second copy of the answer.
      mode.textContent = map.isMinigame ? 'SURVIVAL' : 'RACE';
      mode.classList.toggle('survival', !!map.isMinigame);
    }
    const art = $('mapIntroArt');
    // cardArt is the reveal carousel's own art source: the rendered course
    // thumbnail where one exists, and the map's sky-to-ground gradient where it
    // does not. Same call, so the briefing and the carousel never disagree
    // about what a course looks like.
    if(art && typeof cardArt === 'function') art.setAttribute('style', cardArt(map));
  }

  // ---- the boot screen ---------------------------------------------------
  // Taken down once, from whichever comes first: the lobby being ready, or the
  // load event as a backstop. Removing it rather than hiding it means it cannot
  // later come back or trap a click.
  function clearBootScreen(){
    const b = document.getElementById('bootScreen');
    if(!b) return;
    b.classList.add('gone');
    // after the fade, out of the document entirely
    setTimeout(()=>{ if(b.parentNode) b.parentNode.removeChild(b); }, 420);
  }
  window.addEventListener('load', ()=>{ setTimeout(clearBootScreen, 100); });

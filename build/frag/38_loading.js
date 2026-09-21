  // ============================================================
  // LOADING  (v25 §7)
  // ============================================================
  // THE ROUND BRIEFING answers "what am I about to play?". Course name, a
  // picture of it, the mode, and the one line of advice the map carries. It
  // adds no delay -- it rides the 2600ms the round already waited.
  //
  // The startup loader used to live here too, as a boot screen taken down on
  // the load event plus a hundred milliseconds. It has moved to 39_startup.js
  // and grown into something that waits on the work rather than on an event
  // that only means "the subresources arrived". The two are deliberately kept
  // apart: this one is about the ROUND, that one is about the SESSION, and
  // when they shared a file they also shared a name and got confused for one
  // another. v26 §1 has the details.

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

  // The loader used to be taken down from here, on the load event plus a
  // hundred milliseconds. Deleted, and not merely bypassed: it was still
  // firing alongside the new sequence and won, because the load event arrives
  // long before the work is done. Measured, with both in place: the loader
  // vanished at 7.2s and MODE SELECT did not arrive until 8.9s, so for a second
  // and a half the player had a bare 3D canvas and no UI at all -- the exact
  // hole this release exists to close. 39_startup.js owns the loader. There is
  // one remover and it runs when the work is finished.

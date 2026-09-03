  // ============================================================
  // MUSIC — one bed per map, built from the map's own name
  // ============================================================
  // No audio files: a short loop of an arpeggio over a bass note, scheduled a
  // beat ahead on the same AudioContext the sound effects already use. The key,
  // tempo and waveform come from a hash of the map key, so every course sounds
  // like itself and always sounds the same.
  const MUSIC_SCALES = [
    [0, 3, 5, 7, 10],        // minor pentatonic — the moody maps
    [0, 2, 4, 7, 9],         // major pentatonic — the bright ones
    [0, 2, 3, 7, 8],         // something a bit stranger
    [0, 2, 5, 7, 9]
  ];
  const MUSIC_WAVES = ['triangle', 'square', 'sine', 'triangle'];
  const music = { playing:false, mapKey:null, key:0, tempo:0, scale:0, wave:'triangle',
                  step:0, nextAt:0, gain:null };

  function hashKey(str){
    let h = 0;
    for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) & 0x7fffffff;
    return h;
  }
  function musicState(){
    return { playing:music.playing, key:music.key, tempo:music.tempo, map:music.mapKey };
  }

  function startMusic(mapKey){
    stopMusic();
    if(!settings.sound || !mapKey) return;
    const h = hashKey(mapKey);
    music.mapKey = mapKey;
    music.key    = 44 + (h % 9);               // root, in semitones above A1-ish
    music.tempo  = 104 + ((h >> 4) % 5) * 12;  // 104..152 bpm
    music.scale  = (h >> 8) % MUSIC_SCALES.length;
    music.wave   = MUSIC_WAVES[(h >> 12) % MUSIC_WAVES.length];
    music.step   = 0;
    music.nextAt = 0;
    music.playing = true;
  }
  function stopMusic(){
    music.playing = false;
    music.nextAt = 0;
    if(music.gain){
      try{ music.gain.gain.cancelScheduledValues(actx.currentTime);
           music.gain.gain.setValueAtTime(0.0001, actx.currentTime); }catch(e){}
      music.gain = null;
    }
  }

  function noteHz(semitone){ return 27.5 * Math.pow(2, semitone/12); }

  // Called every frame. Schedules whatever notes fall in the next beat and no
  // more, so pausing or leaving the round stops it inside one beat.
  function updateMusic(){
    if(!music.playing) return;
    if(!settings.sound){ stopMusic(); return; }
    let ctx;
    try{
      ctx = actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    }catch(e){ return; }
    if(!ctx || ctx.state === 'suspended') return;

    const beat = 60 / music.tempo / 2;                 // eighth notes
    const now = ctx.currentTime;
    if(!music.nextAt) music.nextAt = now + 0.05;
    // never schedule more than a beat ahead
    while(music.nextAt < now + beat){
      const at = music.nextAt;
      const scale = MUSIC_SCALES[music.scale];
      const bar = Math.floor(music.step / 8) % 4;
      const idx = music.step % 8;

      // bass on the downbeat, and again halfway through
      if(idx === 0 || idx === 4){
        playTone(ctx, noteHz(music.key - 24 + (bar===2 ? 3 : bar===3 ? 5 : 0)),
                 at, beat*1.7, 'sine', 0.055);
      }
      // arpeggio, walking up and back down over the bar
      const shape = [0, 2, 1, 3, 2, 4, 1, 2][idx];
      const oct   = idx >= 6 ? 12 : 0;
      playTone(ctx, noteHz(music.key + scale[shape % scale.length] + oct + (bar===3 ? 5 : 0)),
               at, beat*0.85, music.wave, 0.030);

      music.step++;
      music.nextAt += beat;
    }
  }
  function playTone(ctx, hz, at, dur, wave, vol){
    try{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = wave; o.frequency.setValueAtTime(hz, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(at); o.stop(at + dur + 0.02);
    }catch(e){}
  }

  // ============================================================
  // SETTINGS  (v25 §4)
  // ============================================================
  // Every control here already existed. What changed is the arrangement: they
  // were one flat two-column grid, twenty rows deep, with three bare text
  // headings in it and a 56vh scroll box around the lot -- so "invert look" sat
  // between a sensitivity slider and a camera toggle with nothing to say which
  // group any of them belonged to.
  //
  // They are grouped into cards now, after the reference's card language. No
  // setting was invented and none was dropped; the list below is exactly what
  // DEFAULT_SETTINGS and the build's own additions already carried.
  //
  // The toggles are real <button role="switch"> elements rather than divs with
  // an onclick, so they are reachable by Tab and operable by Enter and Space.
  // That was the single biggest accessibility hole in the screen.

  function buildSettings(){
    const g = $('settingsGrid');
    g.innerHTML = '';
    let rows = null;

    function group(title, hint){
      const card = document.createElement('section');
      card.className = 'setCard';
      const h = document.createElement('h3');
      h.className = 'setTitle'; h.textContent = title;
      card.appendChild(h);
      if(hint){
        const p = document.createElement('p');
        p.className = 'setHint'; p.textContent = hint;
        card.appendChild(p);
      }
      rows = document.createElement('div');
      rows.className = 'setRows';
      card.appendChild(rows);
      g.appendChild(card);
      return card;
    }
    function row(label, ctrl){
      const r = document.createElement('div');
      r.className = 'setRow';
      const l = document.createElement('span');
      l.className = 'setLbl'; l.textContent = label;
      r.appendChild(l); r.appendChild(ctrl);
      rows.appendChild(r);
      return r;
    }
    // A real switch: focusable, in the tab order, and announced with its state.
    function toggle(key, label){
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'toggle' + (settings[key] ? ' on' : '');
      t.setAttribute('role', 'switch');
      t.setAttribute('aria-checked', String(!!settings[key]));
      t.setAttribute('aria-label', label);
      t.onclick = ()=>{ settings[key] = !settings[key]; SFX.click(); applySettings(); buildSettings(); };
      row(label, t);
    }
    function slider(key, label, min, max, step, fmt){
      const wrap = document.createElement('div'); wrap.className = 'row';
      const r = document.createElement('input');
      r.type = 'range'; r.min = min; r.max = max; if(step) r.step = step;
      r.value = settings[key];
      r.setAttribute('aria-label', label);
      const v = document.createElement('span'); v.className = 'lbl';
      const show = ()=>{ v.textContent = fmt ? fmt(settings[key]) : String(settings[key]); };
      show();
      r.oninput = ()=>{ settings[key] = +r.value; show(); };
      wrap.appendChild(r); wrap.appendChild(v);
      row(label, wrap);
    }
    function chips(key, label, opts, after){
      const seg = document.createElement('div'); seg.className = 'seg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', label);
      for(const [k, l] of opts){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (settings[key] === k ? ' sel' : '');
        b.textContent = l;
        b.setAttribute('aria-pressed', String(settings[key] === k));
        b.onclick = ()=>{ settings[key] = k; SFX.click(); if(after) after(k); buildSettings(); };
        seg.appendChild(b);
      }
      row(label, seg);
    }

    // ---- controls
    group('Controls', 'Click a key to rebind it.');
    for(const [k, l] of [['forward','Move forward'],['back','Move back'],['left','Move left'],
                         ['right','Move right'],['jump','Jump'],['dive','Dive']]){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'keybtn' + (listeningFor === k ? ' listening' : '');
      b.textContent = listeningFor === k ? 'press a key…' : keyName(settings.keys[k]);
      b.setAttribute('aria-label', l + ', currently ' + keyName(settings.keys[k]));
      b.onclick = ()=>{ listeningFor = k; SFX.click(); buildSettings(); };
      row(l, b);
    }
    toggle('invertX', 'Invert left/right');
    toggle('touch', 'On-screen touch controls');

    // ---- camera and look
    group('Camera');
    slider('camDist', 'Camera distance', 0.7, 1.6, 0.05, v=>v.toFixed(2)+'×');
    toggle('freeLook', 'Free look (trackpad / drag)');
    slider('lookSens', 'Look sensitivity', 0.4, 2.2, 0.1, v=>v.toFixed(1)+'×');
    toggle('mouseLook', 'Mouse look (click to capture)');
    slider('padSens', 'Right stick sensitivity', 0.4, 2.2, 0.1, v=>v.toFixed(1)+'×');
    toggle('invertLook', 'Invert look up/down');
    toggle('camRelative', 'Move relative to camera');
    toggle('autoCentre', 'Camera drifts back behind you');
    toggle('shake', 'Camera shake');

    // ---- gameplay
    group('Gameplay');
    chips('difficulty', 'Bot difficulty', [['easy','Easy'],['normal','Normal'],['hard','Hard']]);
    slider('botCount', 'Number of bots', 5, 23);
    toggle('hints', 'Show control hints');

    // ---- graphics
    group('Graphics');
    chips('quality', 'Detail', [['low','Low'],['medium','Medium'],['high','High']],
          k=>applyQuality(k));
    toggle('shadows', 'Shadows');

    // ---- audio
    group('Audio');
    toggle('sound', 'Sound effects');

    // ---- help and support
    const help = group('Help & support', 'Something wrong? Tell us and we will look at it.');
    const acts = document.createElement('div');
    acts.className = 'setActions';
    const sup = document.createElement('button');
    sup.type = 'button'; sup.className = 'btn small pink'; sup.textContent = 'REPORT A PROBLEM';
    sup.onclick = ()=>{ SFX.click(); openSupport(); };
    acts.appendChild(sup);
    help.appendChild(acts);
  }

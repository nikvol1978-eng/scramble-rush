  // ============================================================
  // SUPPORT  (v25 §5)
  // ============================================================
  // A problem report, sent to Nikcade. The form deliberately does NOT ask who
  // you are: the server already knows, from the session cookie that carried the
  // request, and a name typed into a form is a name anyone can type.
  //
  // Everything here is the FIRST of two checks. The server repeats all of it --
  // a client check is a courtesy to the honest and no obstacle at all to anyone
  // else -- and the server's answer is the one that counts.

  const SUPPORT_ENDPOINT = '/api/scramble-rush/support';
  // 1.1MB, and that number is NOT arbitrary: it is server/inbox.js's
  // IMAGE_MAX_BYTES, which the support route reuses. The brief asked for "about
  // 5 MB unless existing infrastructure dictates something better", and it does:
  // Nikcade already has an audited upload path -- base64 in JSON, size-bounded
  // on the ENCODED length before any decode, type decided by the file's own
  // magic bytes -- shared by the suggestions box and the hoops vote. Sending
  // 5MB multipart instead would mean a new body parser on a server that also
  // runs every live match at 60Hz, and a second implementation of the one piece
  // of this that is genuinely dangerous.
  const SUPPORT_MAX_BYTES = 1_100_000;
  const SUPPORT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const SUPPORT_CATEGORIES = [
    ['bug', 'Something is broken'],
    ['visual', 'Looks wrong'],
    ['performance', 'Slow or stuttering'],
    ['account', 'Account or progress'],
    ['other', 'Something else'],
  ];

  // What the bytes ACTUALLY are, not what the filename claims. An SVG or an
  // HTML document renamed .png passes every extension check ever written; these
  // are the real magic numbers, so it does not pass this one.
  async function sniffImage(file){
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const is = (sig, at)=>sig.every((b, i)=>head[(at||0) + i] === b);
    if(is([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])) return 'image/png';
    if(is([0xFF,0xD8,0xFF]))                          return 'image/jpeg';
    // RIFF....WEBP
    if(is([0x52,0x49,0x46,0x46]) && is([0x57,0x45,0x42,0x50], 8)) return 'image/webp';
    return null;
  }

  let supBuilt = false, supSending = false, supFile = null;

  // The file as bare base64, without the data: prefix. The server accepts
  // either, but sending the shorter one keeps the request smaller.
  function supReadBase64(file){
    return new Promise((ok, fail)=>{
      const r = new FileReader();
      r.onload = ()=>{
        const s = String(r.result || '');
        ok(s.slice(s.indexOf(',') + 1));
      };
      r.onerror = ()=>fail(new Error('read failed'));
      r.readAsDataURL(file);
    });
  }

  function supSay(msg, bad){
    const n = $('supNote');
    n.textContent = msg || '';
    n.classList.toggle('bad', !!bad);
  }

  function supReset(){
    $('supSubject').value = '';
    $('supBody').value = '';
    $('supCategory').value = 'bug';
    $('supFile').value = '';
    supFile = null;
    $('supFileName').textContent = 'No image attached';
    supSay('');
    supCount();
  }

  function supCount(){
    $('supBodyCount').textContent = $('supBody').value.length + ' / 2000';
  }

  async function supPick(){
    const f = $('supFile').files && $('supFile').files[0];
    supFile = null;
    if(!f){ $('supFileName').textContent = 'No image attached'; supSay(''); return; }
    if(f.size > SUPPORT_MAX_BYTES){
      $('supFile').value = '';
      $('supFileName').textContent = 'No image attached';
      supSay('That image is ' + (f.size/1048576).toFixed(1) + ' MB. The limit is 1 MB.', true);
      return;
    }
    const real = await sniffImage(f);
    if(!real || SUPPORT_TYPES.indexOf(real) < 0){
      $('supFile').value = '';
      $('supFileName').textContent = 'No image attached';
      supSay('Only PNG, JPEG and WebP images can be attached.', true);
      return;
    }
    supFile = f;
    $('supFileName').textContent = f.name + '  (' + (f.size/1024).toFixed(0) + ' KB)';
    supSay('');
  }

  async function supSend(){
    if(supSending) return;
    const subject = $('supSubject').value.trim();
    const body = $('supBody').value.trim();
    if(subject.length < 4){ supSay('Give it a short subject first.', true); $('supSubject').focus(); return; }
    if(body.length < 10){ supSay('Tell us a little more about what happened.', true); $('supBody').focus(); return; }

    supSending = true;
    const btn = $('supSend');
    btn.disabled = true;
    const was = btn.textContent;
    btn.textContent = 'SENDING…';
    supSay('');
    try{
      // JSON with the image as base64, which is the transport Nikcade's other
      // upload paths already use. The server bounds the ENCODED length before
      // decoding anything, so a huge payload is refused rather than turned into
      // a memory bomb first.
      const payload = {
        subject: subject.slice(0, 120),
        body: body.slice(0, 2000),
        category: $('supCategory').value,
        // Context the player should not have to describe and cannot get wrong.
        client: {
          game: 'scramble-rush',
          version: (document.title.match(/v[\d.]+/) || [''])[0],
          viewport: window.innerWidth + 'x' + window.innerHeight,
          ua: navigator.userAgent.slice(0, 200),
        },
      };
      if(supFile) payload.image = await supReadBase64(supFile);

      const res = await fetch(SUPPORT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload),
        // The session cookie is the whole point: it is what tells the server who
        // is reporting, so the form never has to ask.
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
      });

      if(res.status === 401 || res.status === 403){
        supSay('You need to be signed in to Nikcade to send a report.', true);
      } else if(res.status === 429){
        supSay('That is a lot of reports in a row. Try again in a few minutes.', true);
      } else if(res.status === 413){
        supSay('That attachment was too large for the server.', true);
      } else if(!res.ok){
        supSay('The report could not be sent (error ' + res.status + '). Try again shortly.', true);
      } else {
        const out = await res.json().catch(()=>({}));
        supSay('Thanks — report ' + (out.id ? '#' + out.id + ' ' : '') + 'received.');
        supReset();
        // Leave the panel up for a moment so the confirmation is actually read.
        setTimeout(()=>{ if(!supSending) closeSupport(); }, 2200);
      }
    } catch(e){
      supSay('Could not reach the server. Check your connection and try again.', true);
    } finally {
      supSending = false;
      btn.disabled = false;
      btn.textContent = was;
    }
  }

  function openSupport(){
    if(!supBuilt){
      supBuilt = true;
      const cat = $('supCategory');
      cat.innerHTML = '';
      for(const [v, l] of SUPPORT_CATEGORIES){
        const o = document.createElement('option');
        o.value = v; o.textContent = l;
        cat.appendChild(o);
      }
      $('supFile').setAttribute('accept', SUPPORT_TYPES.join(','));
      $('supFile').addEventListener('change', supPick);
      $('supBody').addEventListener('input', supCount);
      $('supSend').addEventListener('click', supSend);
      $('supCancel').addEventListener('click', ()=>{ SFX.click(); closeSupport(); });
      supReset();
    }
    $('support').classList.remove('hidden');
    $('supSubject').focus();
  }
  function closeSupport(){
    $('support').classList.add('hidden');
    supSay('');
  }

  // Esc closes it, like every other modal in the game.
  window.addEventListener('keydown', e=>{
    if($('support') && !$('support').classList.contains('hidden') && e.key === 'Escape'){
      closeSupport(); e.preventDefault(); e.stopPropagation();
    }
  });

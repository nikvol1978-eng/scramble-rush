  // ---------------------------------------------------------------- v21 §4.5
  // The composer. Ambient occlusion is what makes the plastic sit on the floor
  // rather than hover over it; the bloom is deliberately almost off, so only
  // the confetti and the neon accents reach it.
  //
  // OutputPass is not in the brief but is not optional: once a composer is in
  // the way, the renderer stops applying tone mapping and the output colour
  // space itself, and without that pass the whole game comes out flat and
  // pale. It is the last colour step, so SMAA runs after it.
  // v26 §3: THE TWO PASSES ONLY 'high' USES ARE ONLY BUILT BY 'high'.
  //
  // This changes WHEN they are constructed, not whether. Every quality level
  // renders exactly what it rendered before -- the pass list at high is the
  // same list in the same order, which is why these go in by index below
  // rather than on the end.
  //
  // The default quality is 'medium', and medium is { gtao:false, bloom:false }.
  // buildComposer built both anyway and then set .enabled = false on them, and
  // constructing a pass is not free: it allocates render targets and, on the
  // throwaway composer.render() at the end of this function, COMPILES ITS
  // SHADERS. GTAO compiles an occlusion program and a Poisson denoise program;
  // UnrealBloom compiles a luminosity pass, five blur programs and a
  // composite. A CPU profile of the boot put 1,184 ms of self time inside
  // three.js's onFirstUse -- the function that blocks until a program has
  // linked -- so every player at the default quality was paying for two
  // effects they were never going to see.
  //
  // A player who chooses High pays the compile then: a moment they picked,
  // looking at a settings menu, rather than one wedged into everyone's
  // loading screen.
  function aoPass(){
    if(gtaoPass) return gtaoPass;
    gtaoPass = new THREE.GTAOPass(scene, camera, W, H);
    gtaoPass.output = THREE.GTAOPass.OUTPUT.Default;
    // The occlusion pass renders the scene again for depth and normals, with
    // an override material -- which means depthWrite:false does not save the
    // sky or the clouds from it. The sky is a box 1500 units around the
    // camera, so the depth buffer ends up with a solid shell behind
    // everything, and the pass duly occludes the gap between the course and
    // that shell: a black halo around every silhouette, in the sky, whatever
    // the radius is set to. Neither of them can cast occlusion on anything, so
    // both step out while the pass measures. The beauty frame is already in
    // the read buffer by then, so nothing is lost from the picture.
    const _aoRender = gtaoPass.render.bind(gtaoPass);
    gtaoPass.render = function(r, write, read, dt, mask){
      const wasSky = skyDome ? skyDome.visible : false;
      const wasCloud = cloudGroup ? cloudGroup.visible : false;
      if(skyDome) skyDome.visible = false;
      if(cloudGroup) cloudGroup.visible = false;
      try { _aoRender(r, write, read, dt, mask); }
      finally {
        if(skyDome) skyDome.visible = wasSky;
        if(cloudGroup) cloudGroup.visible = wasCloud;
      }
    };
    // Straight after RenderPass, which is index 0 -- the order high renders in
    // has not changed, only the moment this pass joins the list.
    composer.insertPass(gtaoPass, 1);

    // One throwaway frame, then tune. A course is hundreds of units across, so
    // the default occlusion radius -- meant for a scene a metre wide -- finds
    // nothing to occlude. But the parameters only take once the pass has
    // rendered: set any earlier they leave the material half built, and every
    // frame after comes out with the sky in black patches around each
    // silhouette. The sample count is left alone on purpose -- setting it
    // rewrites a #define and the program fails to validate.
    composer.render();
    // §3: occlusion at half strength. At scale 1.0 every inside corner of a
    // chunky low-poly course goes to a hard grey smudge, which is the opposite
    // of flat saturated colour -- it wants to be a hint of contact shadow, not
    // a second lighting model.
    gtaoPass.updateGtaoMaterial({ radius: 14, distanceExponent: 1.0,
                                  thickness: 12, scale: 0.5 });
    return gtaoPass;
  }

  // §3: bloom off except on confetti. There is no per-object bloom here and
  // a second render target for one particle effect is not worth 3ms, so the
  // strength goes to nearly nothing and the threshold up above everything
  // except a white-hot particle -- confetti and sparks glow, the course does
  // not. Turning the pass off outright would also drop the sparkle that
  // makes a win read.
  function bloom(){
    if(bloomPass) return bloomPass;
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), 0.28, 0.6, 1.15);
    // After AO when AO is there, and still before OutputPass either way.
    composer.insertPass(bloomPass, gtaoPass ? 2 : 1);
    return bloomPass;
  }

  function buildComposer(){
    if(composer) return composer;
    composer = new THREE.EffectComposer(renderer);
    renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    outputPass = new THREE.OutputPass();
    composer.addPass(outputPass);
    smaaPass = new THREE.SMAAPass(W, H);
    composer.addPass(smaaPass);

    // The throwaway frame stays, and it is no longer only about GTAO. It is
    // what compiles OutputPass and SMAA while the menu is still being built,
    // so the first frame the player actually sees does not stop to link a
    // program. Dropping it would move that stutter onto the opening shot.
    composer.setSize(W, H);
    composer.render();
    return composer;
  }

  function applyQuality(q){
    // an unknown name lands on the default, not on the most expensive setting
    const k = QUALITY[q] ? q : 'medium';
    qualityNow = k;
    const s = QUALITY[k];
    renderer.shadowMap.type = s.type === 'vsm' ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
    if(dirLight.shadow.mapSize.x !== s.shadow){
      dirLight.shadow.mapSize.set(s.shadow, s.shadow);
      if(dirLight.shadow.map){ dirLight.shadow.map.dispose(); dirLight.shadow.map = null; }
    }
    scene.traverse(o=>{ if(o.material) o.material.needsUpdate = true; });
    if(s.composer){
      buildComposer();
      // Build on the way UP only. A pass that already exists -- because this
      // player has been on High this session -- keeps existing and is simply
      // disabled, so stepping high -> medium -> high does not recompile it.
      if(s.gtao)  aoPass();
      if(s.bloom) bloom();
      if(gtaoPass)  gtaoPass.enabled  = s.gtao;
      if(bloomPass) bloomPass.enabled = s.bloom;
      smaaPass.enabled  = s.smaa;
    }
    return k;
  }

  // One place the whole game renders through, so the debug build and the
  // release take exactly the same path.
  function renderFrame(){
    // A HEADLESS CHECK RUN HAS NOTHING TO LOOK AT. The simulation is stepped by
    // hand and is identical whether or not a frame is drawn, so drawing one is
    // pure cost -- and it is the expensive half: the shadow map, the composer's
    // render targets, and the GPU-side copy of every course mesh.
    //
    // This exists because the fifteen-map acceptance could not finish in one
    // page on a 16GB machine. One map per page with this on and the peak stays
    // flat. It changes what is DRAWN and nothing that is MEASURED, which is
    // what makes the per-map medians mergeable into the same table.
    if(window.__noRender) return;
    if(qualityNow === null) applyQuality(settings.quality || 'medium');
    if(composer && QUALITY[qualityNow].composer) composer.render();
    else renderer.render(scene, camera);
  }

  function resizeComposer(w, h){
    if(!composer) return;
    composer.setSize(w, h);
    if(gtaoPass)  gtaoPass.setSize(w, h);
    if(bloomPass) bloomPass.setSize(w, h);
    if(smaaPass)  smaaPass.setSize(w, h);
  }

  // Two seconds over 14 ms and High steps down to Medium. Once only: a machine
  // that cannot hold High will not suddenly be able to, and a switch that
  // flickers between two looks is worse than either of them.
  function qualityWatch(dt, ms){
    if(_autoDropped || qualityNow !== 'high' || state === 'menu') return;
    _slowFor = ms > 14 ? _slowFor + dt : 0;
    if(_slowFor > 2){
      _autoDropped = true;
      settings.quality = 'medium';
      applyQuality('medium');
      if(typeof showBanner === 'function') showBanner('GRAPHICS: MEDIUM', 1400);
    }
  }

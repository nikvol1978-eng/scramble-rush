// Scramble Rush -- shelved code.
//
// The maps this belongs to were cut in v19: Gem Grab, Carousel, Comb Collapse,
// Laser Run, Tracer, Wall Rush and Boulder Barrage. Nothing in the eight
// shipping maps generates any of it, so the default build leaves it out, and
// `python build/build.py --with-shelved` puts it back exactly where it was.
//
// Each section is spliced into the fragment that owns it, at the
// //<<shelved:...>> marker left in its place. Sections and markers correspond
// one for one: build.py fails on a marker with no section, or a section no
// marker asks for.
//
// Deliberately NOT shelved: `beam` and `pendulum`, which Neon Nightrun still
// generates; the one-line helpers (moverX, rollerX, logPos and friends), since
// moverX is still used by the floor logic and the rest are cheaper to keep than
// to thread through the splice; and the type names inside shared predicates,
// which read better as a whole list than as a list with a hole in it.

// ===== shelved:gencourse-collect =====
    // ---- GEM GRAB: not a race. Three gems and you are through. ----
    if(mode==='collect'){
      const yStart = 260, yEnd = 3100;
      const items = [];
      const count = 46;
      for(let i=0;i<count;i++){
        items.push({ x: rand(70, TRACK_W-70), y: rand(yStart, yEnd), taken:false, spin: rand(0,6.28) });
      }
      obs.push({type:'gems', y:(yStart+yEnd)/2, y0:yStart-200, y1:yEnd+200, items, need:3});
      // a bit of trouble to make the picking-up interesting
      for(let z=yStart+300; z<yEnd-200; z+=rand(520,720)){
        obs.push({type:'roller', y:z, y0:z-46-RADIUS, y1:z+46+RADIUS, r:38,
                  amp: rand(200,300), speed: rand(0.9,1.4)*spd, phase: rand(0,6.28), cx});
      }
      arenaEnd = yEnd+180; trackLength = yEnd+4200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }


// ===== shelved:gencourse-spin-hex-laser-tracer-blockdash =====
    // ---- CAROUSEL: one turning disc, and arms sweeping you toward the edge ----
    if(mode==='spin'){
      const yMid = 560, rad = 840;
      obs.push({type:'disc', cx, y:yMid, y0:yMid-rad-200, y1:yMid+rad-0+200,
                r:rad, speed: (hard?0.42:0.32)*(Math.random()<0.5?-1:1)});
      obs.push({type:'spinlaser', y:yMid, cx, arms: 3, len: rad*0.92,
                speed: rand(0.30,0.46)*(Math.random()<0.5?-1:1), phase: rand(0,6.28),
                h:16, y0:yMid-rad-100, y1:yMid+rad+100});
      arenaEnd = yMid + rad - 40; trackLength = yMid + rad + 4000;
      return obs;
    }

    // ---- HEX DROP: four tiers of hexagons, each drops shortly after you touch it ----
    if(mode==='hex'){
      // A shorter field on purpose: every hex is two meshes, and the whole point
      // is the drop, not the distance.
      const yStart=420, yEnd=yStart+3300;
      const hexR=76, colW=hexR*1.5, rowH=hexR*Math.sqrt(3);
      const cols=Math.max(3, Math.floor(TRACK_W/colW)-1);
      const rows=Math.max(6, Math.floor((yEnd-yStart)/rowH));
      const TIERS=[0,-42,-84,-126];
      const cells=[], columns=[];
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
        const x = colW*0.9 + c*colW;
        const y = yStart + r*rowH + (c%2?rowH/2:0);
        if(x<hexR || x>TRACK_W-hexR || y>yEnd) continue;
        const tiers=[];
        for(let ti=0; ti<TIERS.length; ti++){
          const missing = ti>0 && Math.random() < 0.09*ti;
          const cell={x, y, r:hexR, tier:ti, hy:TIERS[ti],
                      touched:false, fuse:-1, gone:missing, drop:missing?1:0, back:missing?3:0};
          tiers.push(cell); cells.push(cell);
        }
        columns.push({x, y, r:hexR, tiers});
      }
      // tiers rebuild, or a crowded field would strand everyone before the line
      obs.push({type:'hexfield', yStart, yEnd, y0:yStart, y1:yEnd, cells, columns, tiers:TIERS,
                fuseTime: hard?1.0:1.3, respawnTime: 4.0});
      arenaEnd = yEnd-60; trackLength = yEnd+4000;
      return obs;
    }

    // ---- LASER DODGE: sweeping beams, low ones you jump, high ones you dive under ----
    if(mode==='laser'){
      let z=560;
      const rowsOut=[];
      while(z < total-360){
        const low = Math.random()<0.55;
        rowsOut.push({type:'laserbar', y:z, low,
          h: low ? 12 : 32,                       // low = jump it, high = dive under it
          speed: rand(0.8,1.5)*spd*(Math.random()<0.5?-1:1),
          phase: rand(0,6.28), span: rand(180,300),
          y0:z-360, y1:z+360});
        z += rand(210,300);
      }
      obs.push(...rowsOut);
      // a couple of pillars so it is not a pure straight line
      for(let i=0;i<3;i++){
        const y=700+i*((total-1000)/3);
        obs.push({type:'pillars', y, y0:y-70, y1:y+70,
          items:[{x:cx+rand(-260,260), r:rand(30,40)}]});
      }
      trackLength = total+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

    // ---- LASER TRACER: hubs of rotating arms, low enough to jump ----
    if(mode==='tracer'){
      const span=Math.min(total, 6400);
      let z=640;
      while(z < span-420){
        obs.push({type:'spinlaser', y:z, cx, arms: hard?4:3, len: rand(300,380),
                  speed: rand(0.45,0.85)*spd*(Math.random()<0.5?-1:1), phase: rand(0,6.28),
                  h:14, y0:z-400, y1:z+400});
        z += rand(430,540);
      }
      // a few bumpers so there is something to be knocked into
      for(let i=0;i<4;i++){
        const y=760+i*((span-1200)/4);
        obs.push({type:'bumper', y, y0:y-90, y1:y+90,
                  items:[{x:cx+rand(-250,250), r:34}]});
      }
      trackLength = span+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

    // ---- BLOCK DASH: sliding walls of blocks, one gap each ----
    if(mode==='blockdash'){
      const span=Math.min(total, 7400);
      let z=520;
      while(z < span-420){
        const slots=6, slotW=TRACK_W/slots;
        const gap=Math.floor(Math.random()*slots);
        const gap2=hard?-1:((gap+2+Math.floor(Math.random()*2))%slots);
        const items=[];
        for(let i=0;i<slots;i++){
          if(i===gap||i===gap2) continue;
          items.push({x:i*slotW+slotW/2, w:slotW-8});
        }
        obs.push({type:'blockwall', y:z, d:54, y0:z-54/2-RADIUS, y1:z+54/2+RADIUS, items,
                  amp: rand(60,150), speed: rand(0.5,0.95)*spd, phase: rand(0,6.28)});
        z += rand(340,460);
      }
      trackLength = span+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }


// ===== shelved:gencourse-boulder =====
    // ---- BOULDER BARRAGE: mostly open, boulders roll at you from ahead ----
    if(mode==='boulder'){
      let z=520;
      while(z < total-500){
        if(Math.random()<0.55){
          const lanes=[...LANES].sort(()=>Math.random()-0.5).slice(0,2);
          obs.push({type:'pillars', y:z, y0:z-70, y1:z+70, items:lanes.map(l=>({x:cx+l+rand(-18,18), r:rand(30,40)}))});
        } else {
          const len=rand(300,420);
          obs.push({type:'narrow', yStart:z, yEnd:z+len, y0:z, y1:z+len, halfWidth: hard? rand(100,130): rand(120,155)});
          z += len;
        }
        z += rand(420,560);
      }
      trackLength = total+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }


// ===== shelved:gencourse-mover =====
      } else if(type==='mover'){
        // A gap with no floor, crossed by a platform sliding side to side. You
        // have to time getting on, and it carries you while you stand on it.
        const len = rand(300,400);
        const yStart = cursor+gap+100, yEnd = yStart+len;
        obs.push({type:'mover', y:(yStart+yEnd)/2, yStart, yEnd, y0:yStart-30, y1:yEnd+30,
                  cx, amp: rand(170,250), speed: rand(0.55,0.9)*spd, phase: rand(0,6.28),
                  w: rand(180,230), d: len-30, h: 30, dx:0, _px:null});
        cursor = yEnd+150;

// ===== shelved:gencourse-log-roller =====
      } else if(type==='log'){
        // A whole tree trunk on ropes, sweeping across the track at chest height.
        const y = cursor+gap+140;
        const arm = rand(150,190), lr = rand(30,40);
        obs.push({type:'log', y, cx, armLen: arm, r: lr, len: rand(240,320),
                  pivotH: arm + lr + 26, swing: rand(0.80,1.05),
                  speed: rand(0.9,1.35)*spd, phase: rand(0,6.28),
                  y0:y-200, y1:y+200});
        cursor = y+190;
      } else if(type==='roller'){
        // a barrel rolling across the track
        const y=cursor+gap+70;
        obs.push({type:'roller', y, y0:y-46-RADIUS, y1:y+46+RADIUS, r:38,
                  amp: rand(180,300), speed: rand(0.9,1.5)*spd, phase: rand(0,6.28), cx});
        cursor=y+90;

// ===== shelved:gencourse-spinlaser =====
      } else if(type==='spinlaser'){
        const y = cursor+gap+320;
        obs.push({type:'spinlaser', y, cx, arms: hard?4:3, len: rand(280,360),
                  speed: rand(0.45,0.85)*spd*(Math.random()<0.5?-1:1), phase: rand(0,6.28),
                  h:14, y0:y-380, y1:y+380});
        cursor = y+400;

// ===== shelved:mesh-mover =====
      } else if(o.type==='mover'){
        const g=new THREE.Group();
        const deck=new THREE.Mesh(new THREE.BoxGeometry(o.w, 14, o.d),
          new THREE.MeshPhongMaterial({color:accent.getHex(), shininess:34}));
        deck.position.y=-7; deck.castShadow=true; deck.receiveShadow=true; g.add(deck);
        // a lip so the edge reads from above, which is where you are looking
        const lip=new THREE.Mesh(new THREE.BoxGeometry(o.w+10, 5, o.d+10),
          new THREE.MeshLambertMaterial({color:0x1a1033}));
        lip.position.y=-16; g.add(lip);
        for(const sx of [-1,1]){
          const rail=new THREE.Mesh(new THREE.BoxGeometry(6, 22, o.d),
            new THREE.MeshLambertMaterial({color:0xfff1c9}));
          rail.position.set(sx*(o.w/2-3), 5, 0); g.add(rail);
        }
        placeAt(g, o.cx, o.y, o.h);
        courseGroup.add(g);
        o.mesh=g;


// ===== shelved:mesh-log-roller =====
      } else if(o.type==='log'){
        const g=new THREE.Group();
        const trunk=new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, o.len, 12),
          new THREE.MeshPhongMaterial({color:0x9a6533, shininess:14}));
        trunk.rotation.x=Math.PI/2; trunk.castShadow=true; g.add(trunk);
        for(const sz of [-1,1]){
          const cap=new THREE.Mesh(new THREE.CylinderGeometry(o.r*1.03, o.r*1.03, 10, 12),
            new THREE.MeshLambertMaterial({color:0xd8b47a}));
          cap.rotation.x=Math.PI/2; cap.position.z=sz*o.len/2; g.add(cap);
        }
        // two ropes back up to the canopy, so the swing reads before it arrives
        o.ropes=[];
        for(const sz of [-1,1]){
          const rope=new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, o.armLen, 6),
            new THREE.MeshLambertMaterial({color:0xcbb26a}));
          rope.position.set(0, o.armLen/2, sz*o.len*0.34); g.add(rope); o.ropes.push(rope);
        }
        placeAt(g, o.cx, o.y, o.pivotH);
        courseGroup.add(g);
        o.mesh=g; o.trunk=trunk;

      } else if(o.type==='roller'){
        const g=new THREE.Group();
        const barrel=new THREE.Mesh(new THREE.CylinderGeometry(o.r,o.r,86,14),
          new THREE.MeshPhongMaterial({color:accent.getHex(), shininess:26}));
        barrel.rotation.x=Math.PI/2; barrel.castShadow=true; g.add(barrel);
        const band=new THREE.Mesh(new THREE.CylinderGeometry(o.r*1.04,o.r*1.04,14,14),
          new THREE.MeshLambertMaterial({color:0x1a1033}));
        band.rotation.x=Math.PI/2; g.add(band);
        placeAt(g, o.cx, o.y, o.r);
        courseGroup.add(g);
        o.mesh=g; o.barrel=barrel;


// ===== shelved:mesh-spinlaser =====
      } else if(o.type==='spinlaser'){
        const g=new THREE.Group();
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(24,30,52,14),
          new THREE.MeshPhongMaterial({color:0x1f2937, shininess:30}));
        hub.position.y=26; hub.castShadow=true; g.add(hub);
        const lamp=new THREE.Mesh(new THREE.SphereGeometry(11,12,10),
          new THREE.MeshBasicMaterial({color:0xa3e635}));
        lamp.position.y=56; g.add(lamp);
        const arms=new THREE.Group(); arms.position.y=o.h; g.add(arms);
        for(let i=0;i<o.arms;i++){
          const arm=new THREE.Group(); arm.rotation.y = i*(Math.PI*2/o.arms); arms.add(arm);
          const beam=new THREE.Mesh(new THREE.CylinderGeometry(4,4,o.len,8),
            new THREE.MeshBasicMaterial({color:0xa3e635}));
          beam.rotation.z=Math.PI/2; beam.position.x=o.len/2; arm.add(beam);
          const halo=new THREE.Mesh(new THREE.CylinderGeometry(9,9,o.len,8),
            new THREE.MeshBasicMaterial({color:0xa3e635, transparent:true, opacity:0.20, depthWrite:false}));
          halo.rotation.z=Math.PI/2; halo.position.x=o.len/2; arm.add(halo);
          const tip=new THREE.Mesh(new THREE.SphereGeometry(8,10,8),
            new THREE.MeshBasicMaterial({color:0xd9f99d}));
          tip.position.x=o.len; arm.add(tip);
        }
        placeAt(g, o.cx, o.y, 0);
        courseGroup.add(g);
        o.mesh=g; o.arms3d=arms;


// ===== shelved:hit-roller =====
      } else if(o.type==='roller'){
        const rx=rollerX(o,t);
        if(r.h < o.r*1.4){
          const dx=r.x-rx, dy=r.y-o.y, d=Math.hypot(dx,dy);
          if(d < o.r+RADIUS-6){
            const nx=dx/(d||1), ny=dy/(d||1);
            r.vx += nx*8 + Math.cos(t*o.speed+o.phase)*o.speed*o.amp*0.02;
            r.vy += ny*4;
            r.stumbleT=430; r.invuln=600; r.vh=3; if(r.h===0) r.h=0.01;
            spawnBurst3D(r.x,r.y,0xffcb3d,8);
            if(r.isPlayer){ SFX.hit(); camShake=6; }
            return;
          }
        }


// ===== shelved:hit-log =====
      } else if(o.type==='log'){
        const lp = logPos(o,t);
        if(Math.abs(r.y-o.y) < o.len/2 + RADIUS && Math.abs(r.x-lp.x) < o.r+RADIUS-2){
          const top = r.h + (r.diveT>0?18:34);
          if(top > lp.h-o.r && r.h < lp.h+o.r){
            // a trunk this size does not nudge you sideways, it sends you back
            const away = Math.sign(r.x-lp.x) || 1;
            r.vy = Math.min(r.vy, 0) - 5.4;
            sendTumbling(r, 9, away, 0);
            r.invuln=750;
            spawnBurst3D(r.x,r.y,0xa3e635,14);
            return;
          }
        }

// ===== shelved:hit-spinlaser =====
      } else if(o.type==='spinlaser'){
        const foot = (r.floorH||0) + r.h;
        const top = foot + (r.diveT>0?18:33);
        if(top > o.h-6 && foot < o.h+6){
          const dx=r.x-o.cx, dy=r.y-o.y, dist=Math.hypot(dx,dy);
          if(dist > 14 && dist < o.len){
            const ang=Math.atan2(dy,dx), base=spinlaserAngle(o,t), step=Math.PI*2/o.arms;
            for(let i=0;i<o.arms;i++){
              let d = ang - (base + i*step);
              while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
              // perpendicular distance to the arm, and only the half it points down
              if(Math.cos(d) > 0 && Math.abs(Math.sin(d))*dist < 10+RADIUS-8){
                const away = Math.sign(Math.sin(d)) || 1;
                const px=-Math.sin(base+i*step)*away, py=Math.cos(base+i*step)*away;
                sendTumbling(r, 7, px, py);
                r.invuln=680;
                spawnBurst3D(r.x,r.y,0xa3e635,10);
                return;
              }
            }
          }
        }


// ===== shelved:sync-mover =====
      else if(o.type==='mover'){ if(o.mesh) placeAt(o.mesh, moverX(o,t), (o.yStart+o.yEnd)/2, o.h); }

// ===== shelved:sync-log =====
      else if(o.type==='log'){
        if(o.mesh){
          const a=logAngle(o,t), lp=logPos(o,t);
          placeAt(o.mesh, lp.x, o.y, lp.h);
          o.ropes.forEach((rope,i)=>{
            const sz = i===0?-1:1;
            rope.position.set(Math.sin(-a)*o.armLen/2, o.armLen/2*Math.cos(a), sz*o.len*0.34);
            rope.rotation.z = a;
          });
        }
      }

// ===== shelved:sync-spinlaser =====
      else if(o.type==='spinlaser'){ if(o.arms3d) o.arms3d.rotation.y = -spinlaserAngle(o,t); }

// ===== shelved:sync-roller =====
      else if(o.type==='roller'){
        if(o.mesh){
          const rx=rollerX(o,t);
          placeAt(o.mesh, rx, o.y, o.r);
          // roll about the track axis, in step with how far it has travelled
          if(o.barrel) o.barrel.rotation.y = rx/o.r;
        }
      }

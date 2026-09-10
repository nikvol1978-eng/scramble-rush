  function syncObstacles(t){
    for(const o of obstacles){
      if(o.type==='hammer'){
        for(const it of o.items){
          const ang=hammerAngle(it,t), pv=it.mesh.pivot;
          const hx=pv.x+Math.sin(ang)*it.armLen, hy=96-76*Math.cos(ang), hz=pv.z;
          it.mesh.mace.position.set(hx,hy,hz); it.mesh.mace.rotation.y=t*2; it.mesh.maceOut.position.set(hx,hy,hz); it.mesh.maceOut.rotation.y=t*2;
          orientBetween(it.mesh.rod,pv.x,pv.y,pv.z,hx,hy,hz);
        }
      } else if(o.type==='discField'){
        for(const c of o.cells){
          if(!c.mesh) continue;
          c.spin.rotation.y = discAng(c,t);
          c.armPivot.rotation.y = discArmAng(c,t);
        }
      }
      else if(o.type==='spinbar'){ o.mesh.rotation.y=spinAngle(o,t)+pathAngle(o.y); }
      else if(o.type==='pit'){ o.platformMeshes.forEach((m,i)=>{ placeAt(m, platX(o.platforms[i],t), (o.yStart+o.yEnd)/2, -6); }); }
      //<<shelved:sync-mover>>
      else if(o.type==='crumble'){
        if(o.meshes) o.meshes.forEach((m,i)=>{
          const sl=o.slabs[i];
          // fallen slabs sink and fade rather than blinking out
          placeAt(m, sl.x, sl.y, o.h - sl.drop*150);
          m.visible = sl.drop < 0.99;
        });
      }
      //<<shelved:sync-log>>
      else if(o.type==='logroll'){
        if(o.meshes) o.meshes.forEach((m,i)=>{
          const l = o.logs[i];
          m.rotation.z = l.ang;
          // The pegs ride the barrel: each sits at its own angle around it, and
          // the group turns with the log.
          if(l.pegMeshes) l.pegMeshes.forEach((pg,k)=>{
            const a = l.pegs[k].a + l.ang;
            pg.position.x = Math.sin(a)*(o.R + o.pegLen*0.2);
            pg.position.y = Math.cos(a)*(o.R + o.pegLen*0.2);
            pg.rotation.z = -a;
          });
        });
      }
      else if(o.type==='tiltdeck'){
        if(o.meshes) o.meshes.forEach((m,i)=>{
          const dk = o.decks[i];
          // z is the course's y, so a lean along y is a rotation about x
          m.rotation.z =  dk.tx*o.maxTilt;
          m.rotation.x = -dk.ty*o.maxTilt;
        });
      }
      else if(o.type==='pusher'){ o.meshes.forEach((m,i)=>{ placeAt(m, platX(o.items[i],t), o.y, 17); }); }
      else if(o.type==='blockwall'){
        const shift=blockShift(o,t), wy=wallY(o,t);
        if(o.meshes) o.meshes.forEach((m,i)=>{ placeAt(m, o.items[i].x+shift, wy, 0); });
      }
      else if(o.type==='laserbar'){ if(o.mesh) placeAt(o.mesh, TRACK_W/2, laserY(o,t), o.h); }
      else if(o.type==='pendulum'){
        if(o.mesh){
          const a=pendAngle(o,t), pp=pendPos(o,t);
          placeAt(o.mesh, pp.x, o.y, pp.h);
          o.ball.position.set(0,0,0);
          // the rod runs from the ball back up to the pivot
          o.rod.position.set(Math.sin(-a)*o.armLen/2, o.armLen/2*Math.cos(a), 0);
          o.rod.rotation.z = a;
        }
      }
      else if(o.type==='spinlaser'){ if(o.arms3d) o.arms3d.rotation.y = -spinlaserAngle(o,t); }
      //<<shelved:sync-spinlaser>>
      else if(o.type==='boost'){ if(o.mesh) o.mesh.position.y = Math.sin(t*5)*0.8; }
      else if(o.type==='cannon'){
        if(o.meshes) o.meshes.forEach(m=>{
          if(m.recoil>0){ m.recoil=Math.max(0,m.recoil-0.08); }
          m.barrel.scale.x = 1 - (m.recoil||0)*0.22;
        });
      }
      //<<shelved:sync-roller>>
    }
    for(const c of courseGroup.children){
      if(c.userData.deco){ c.position.y=c.userData.deco.y+Math.sin(t*1.2+c.userData.deco.ph)*6; c.rotation.y+=0.004; }
      if(c.userData.cloud){ c.position.x+=c.userData.cloud*0.03; if(c.position.x>1000) c.position.x=-1000; }
      if(c.userData.crowdSeats){
        // one instanced draw, so the bob is a matrix rewrite rather than a
        // position on each of two hundred objects
        const seats = c.userData.crowdSeats, probe = c.userData.crowdProbe;
        for(let i=0;i<seats.length;i++){
          const q = seats[i];
          c.getMatrixAt(i, probe.matrix);
          probe.matrix.decompose(probe.position, probe.quaternion, probe.scale);
          probe.position.y = q.y + Math.abs(Math.sin(t*q.rate + q.ph))*3.2;
          probe.updateMatrix();
          c.setMatrixAt(i, probe.matrix);
        }
        c.instanceMatrix.needsUpdate = true;
      }
    }
  }

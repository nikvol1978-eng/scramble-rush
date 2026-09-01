  function syncObstacles(t){
    for(const o of obstacles){
      if(o.type==='hammer'){
        for(const it of o.items){
          const ang=hammerAngle(it,t), pv=it.mesh.pivot;
          const hx=pv.x+Math.sin(ang)*it.armLen, hy=96-76*Math.cos(ang), hz=pv.z;
          it.mesh.mace.position.set(hx,hy,hz); it.mesh.mace.rotation.y=t*2; it.mesh.maceOut.position.set(hx,hy,hz); it.mesh.maceOut.rotation.y=t*2;
          orientBetween(it.mesh.rod,pv.x,pv.y,pv.z,hx,hy,hz);
        }
      } else if(o.type==='spinbar'){ o.mesh.rotation.y=spinAngle(o,t); }
      else if(o.type==='pit'){ o.platformMeshes.forEach((m,i)=>{ m.position.x=toSceneX(platX(o.platforms[i],t)); }); }
      else if(o.type==='pusher'){ o.meshes.forEach((m,i)=>{ m.position.x=toSceneX(platX(o.items[i],t)); }); }
      else if(o.type==='blockwall'){
        const shift=blockShift(o,t);
        if(o.meshes) o.meshes.forEach((m,i)=>{ m.position.x=toSceneX(o.items[i].x+shift); });
      }
      else if(o.type==='laserbar'){ if(o.mesh) o.mesh.position.z=laserY(o,t); }
      else if(o.type==='roller'){
        if(o.mesh){
          const rx=rollerX(o,t);
          o.mesh.position.x=toSceneX(rx);
          // roll about the track axis, in step with how far it has travelled
          if(o.barrel) o.barrel.rotation.y = rx/o.r;
        }
      }
    }
    for(const c of courseGroup.children){
      if(c.userData.deco){ c.position.y=c.userData.deco.y+Math.sin(t*1.2+c.userData.deco.ph)*6; c.rotation.y+=0.004; }
      if(c.userData.cloud){ c.position.x+=c.userData.cloud*0.03; if(c.position.x>1000) c.position.x=-1000; }
    }
  }

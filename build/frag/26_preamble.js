// ---------------------------------------------------------------- v21 §4
// three r160 arrives as ES modules. A module namespace object is sealed, so
// the game gets a plain copy of it -- and that copy is where the materials
// below are hung, so every `new THREE.MeshLambertMaterial(...)` in the twenty
// places that build geometry becomes a physical material without any of those
// places being touched.
// v26 §5: ONE LOCAL MODULE INSTEAD OF TWENTY FROM A CDN.
//
// This was ten bare-specifier imports resolved by an import map to jsDelivr.
// Cold, that cost twenty requests and about 326 KB over the wire -- jsDelivr
// serves three.module.js UNMINIFIED, at 1.27 MB. And it was on the critical
// path in the strongest sense: the boot sequence's first gate waits for
// `window.load`, so the loading screen could not move off "Connecting…" until
// the last of them landed. Measured: that gate was 1,776 ms of a 1,940 ms
// preparation. The waterfall WAS the startup.
//
// build/three-bundle.mjs builds exactly this set into one minified,
// content-hashed file and build.py rewrites the name below to the hashed one.
// One request, ~209 KB brotli, from this origin, cacheable forever.
//
// The names here and in build/three-entry.js must match, and cannot drift
// quietly: one missing from the entry is an esbuild resolve error at build
// time, one missing here is a ReferenceError the first time the game runs.
import {
  R160, RoomEnvironment, Sky, EffectComposer, RenderPass, GTAOPass,
  UnrealBloomPass, OutputPass, SMAAPass, RoundedBoxGeometry,
} from './three-bundle.js';

const THREE = Object.assign({}, R160);
THREE.RoomEnvironment = RoomEnvironment;
THREE.Sky = Sky;
THREE.EffectComposer = EffectComposer;
THREE.RenderPass = RenderPass;
THREE.GTAOPass = GTAOPass;
THREE.UnrealBloomPass = UnrealBloomPass;
THREE.OutputPass = OutputPass;
THREE.SMAAPass = SMAAPass;
THREE.RoundedBoxGeometry = RoundedBoxGeometry;

// §3: nothing has a hard edge. A rounded box costs a few hundred more vertices
// than a cube and no extra draw call, so the only thing worth guarding against
// is rounding a plate thinner than the radius -- which turns it into a pillow.
// The radius is a share of the smallest side, capped, and a very thin slab
// falls back to a plain box because a bevel on it would be a shape change
// rather than a softened edge.
function roundedBox(w, h, d, seg){
  const m = Math.min(w, h, d);
  if(m < 6) return new R160.BoxGeometry(w, h, d);
  return new THREE.RoundedBoxGeometry(w, h, d, seg || 2, Math.min(m*0.22, 9));
}
THREE.RoundedBox = roundedBox;

// §4.2 -- everything you can touch is glossy plastic. Parameters the old
// materials carried and this one has no use for are dropped rather than
// forwarded, because setValues warns about every unknown key it is handed.
const _dropParam = { shininess:1, specular:1, reflectivity:1, gradientMap:1,
                     refractionRatio:1, combine:1 };
function _apply(mat, params){
  if(!params) return mat;
  const ok = {};
  for(const k in params) if(!_dropParam[k] && (k in mat)) ok[k] = params[k];
  mat.setValues(ok);
  return mat;
}
// §4.2 was glossy plastic with a clearcoat on everything. v24 §3 wants the
// other thing: saturated flat colour on chunky shapes, soft simple lighting,
// no photoreal fuss. A clearcoat is photoreal fuss -- it is a second specular
// lobe whose whole job is to say "this is a lacquered surface", and on a
// hazard it reads as a highlight the player has to look past. So the default
// material loses it and becomes a plain standard material at roughness 0.75.
class PlasticMaterial extends R160.MeshStandardMaterial {
  constructor(params){
    super({ roughness:0.75, metalness:0.0, envMapIntensity:0.55 });
    _apply(this, params);
  }
}
// The two things that are genuinely wet or polished keep it. Ice without a
// clearcoat is a pale floor; the clearcoat is what says you cannot stand on it.
class GlossMaterial extends R160.MeshPhysicalMaterial {
  constructor(params){
    super({ roughness:0.22, metalness:0.0, clearcoat:0.85, clearcoatRoughness:0.10,
            envMapIntensity:0.9 });
    _apply(this, params);
  }
}
// Floors are the one thing that is not plastic. A clearcoat on a floor this
// wide throws the key straight back up the camera and washes the course out,
// and the floor is the surface the hazards have to read against.
class FloorMaterial extends R160.MeshStandardMaterial {
  constructor(params){
    super({ roughness:0.88, metalness:0.0, envMapIntensity:0.35 });
    _apply(this, params);
  }
}
THREE.MeshLambertMaterial = PlasticMaterial;
THREE.MeshPhongMaterial   = PlasticMaterial;
THREE.MeshToonMaterial    = PlasticMaterial;
THREE.MeshFloorMaterial   = FloorMaterial;
THREE.MeshGlossMaterial   = GlossMaterial;

// §4.5 -- the composer's state lives out here, at module scope, rather than
// with the functions that use it. applySettings() runs earlier in the module
// body than the composer fragment is spliced into it, so a `let` down there is
// still in its dead zone when the first applyQuality() call arrives.
let composer = null, renderPass = null, gtaoPass = null, bloomPass = null,
    outputPass = null, smaaPass = null, qualityNow = null;
let _slowFor = 0, _autoDropped = false;

const QUALITY = {
  low:    { composer:false, shadow:1024, type:'pcf', gtao:false, bloom:false, smaa:false },
  medium: { composer:true,  shadow:2048, type:'vsm', gtao:false, bloom:false, smaa:true  },
  high:   { composer:true,  shadow:2048, type:'vsm', gtao:true,  bloom:true,  smaa:true  }
};



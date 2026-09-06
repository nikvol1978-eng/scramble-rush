// ---------------------------------------------------------------- v21 §4
// three r160 arrives as ES modules. A module namespace object is sealed, so
// the game gets a plain copy of it -- and that copy is where the materials
// below are hung, so every `new THREE.MeshLambertMaterial(...)` in the twenty
// places that build geometry becomes a physical material without any of those
// places being touched.
import * as R160 from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';

const THREE = Object.assign({}, R160);
THREE.RoomEnvironment = RoomEnvironment;
THREE.Sky = Sky;

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
class PlasticMaterial extends R160.MeshPhysicalMaterial {
  constructor(params){
    super({ roughness:0.45, metalness:0.0, clearcoat:0.6, clearcoatRoughness:0.25,
            envMapIntensity:0.75 });
    _apply(this, params);
  }
}
// Floors are the one thing that is not plastic. A clearcoat on a floor this
// wide throws the key straight back up the camera and washes the course out,
// and the floor is the surface the hazards have to read against.
class FloorMaterial extends R160.MeshStandardMaterial {
  constructor(params){
    super({ roughness:0.8, metalness:0.0, envMapIntensity:0.55 });
    _apply(this, params);
  }
}
THREE.MeshLambertMaterial = PlasticMaterial;
THREE.MeshPhongMaterial   = PlasticMaterial;
THREE.MeshToonMaterial    = PlasticMaterial;
THREE.MeshFloorMaterial   = FloorMaterial;


// The bundle entry: everything the game imports from three, in one module.
//
// This file is not shipped. build/three-bundle.mjs feeds it to esbuild and the
// result is written to the repo root as three-<hash>.js, which the release
// imports instead of reaching for a CDN.
//
// It is a plain re-export list rather than anything clever on purpose: what the
// game needs is decided in frag/26_preamble.js, and this must be the same set.
// A name added there and forgotten here is a build error, not a runtime one --
// esbuild fails on an import it cannot resolve.
//
// `export * as R160` matches the preamble's `import * as R160 from 'three'`:
// the game wants three's whole namespace, because it copies it and hangs its
// own materials on the copy.
export * as R160 from 'three';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { Sky } from 'three/addons/objects/Sky.js';
export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
export { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
export { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
export { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
export { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The game ships as one file that resolves three.js through an import map
// pointing at jsdelivr. Vite's dev server rewrites bare imports itself and
// never looks at an import map, so it needs the same two names spelled out --
// against the copy of three in node_modules, pinned to the same 0.160.0 the
// import map names. Nothing here affects the released HTML.
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^three\/addons\//, replacement: 'three/examples/jsm/' },
    ],
  },
});

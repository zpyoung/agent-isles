import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

const bundle = (input, file) => ({
  input,
  output: {
    file,
    format: 'esm',
    sourcemap: true,
  },
  // commonjs/json: the reader bundle pulls in unified/remark/rehype, whose
  // dependency trees still include CommonJS and JSON modules (e.g. extend,
  // property-information). The component bundle is pure ESM but the plugins
  // are inert there.
  plugins: [resolve({ browser: true, preferBuiltins: false }), commonjs(), json(), terser()],
});

export default [
  // The Agent Isles Lit component bundle (used by `isles render` output).
  bundle('src/components/index.js', 'dist/agent-components.js'),
  // The standalone Markdown reader SPA: client-side renderer + island
  // components + reader UI, served by `isles live` and (Phase 2) a Tauri shell.
  bundle('src/reader/reader-entry.js', 'dist/isles-reader.js'),
];

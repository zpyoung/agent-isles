import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/components/index.js',
  output: {
    file: 'dist/agent-components.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [resolve(), terser()],
};

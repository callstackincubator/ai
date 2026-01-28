import { rozenitePlugin } from '@rozenite/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  root: __dirname,
  plugins: [rozenitePlugin()],
  base: './',
  build: {
    outDir: './dist',
    emptyOutDir: false,
    reportCompressedSize: false,
    minify: false,
    sourcemap: false,
  },
  server: {
    port: 3002,
    open: true,
  },
})

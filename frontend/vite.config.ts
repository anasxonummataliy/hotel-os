import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  server: {
    proxy: {
      '/auth': { target: 'http://localhost:8000', changeOrigin: true },
      '/guests': { target: 'http://localhost:8001', changeOrigin: true },
      '/bookings': { target: 'http://localhost:8001', changeOrigin: true },
      '/check-in': { target: 'http://localhost:8001', changeOrigin: true },
      '/check-out': { target: 'http://localhost:8001', changeOrigin: true },
      '/rooms': { target: 'http://localhost:8001', changeOrigin: true },
      '/clean': { target: 'http://localhost:8002', changeOrigin: true },
      '/queue': { target: 'http://localhost:8002', changeOrigin: true },
      '/orders': { target: 'http://localhost:8003', changeOrigin: true },
      '/maintenance': { target: 'http://localhost:8004', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8005', ws: true, changeOrigin: true },
    },
  },
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react({
      // Story files export CSF objects, not React components. The React
      // plugin still injects a Fast Refresh accept hook into every .tsx,
      // which absorbs the HMR update without doing anything useful — so
      // edits to a `.stories.tsx` file silently no-op instead of bubbling
      // to a full iframe reload. Exclude them so changes propagate.
      exclude: [/\.stories\.tsx?$/],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

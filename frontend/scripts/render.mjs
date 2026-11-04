// Runs scripts/renderSpecs.ts through Vite's module loader, which the app's code needs (import.meta.glob loads its languages)
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  await server.ssrLoadModule('/scripts/renderSpecs.ts')
} finally {
  await server.close()
}

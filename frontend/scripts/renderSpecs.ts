// Renders a list of JSON prompts through the running web app, exactly as Create does: the builder's code writes each text,
// and both the text and the JSON are sent, so History keeps the JSON (Reuse settings reopens it in the builder).
//   make render FILE=list.json              renders each entry, one at a time, saving the PNGs to ~/Pictures/z-image/
//   make render FILE=list.json DRY_RUN=1    prints what each entry would send, without rendering
// An entry: { "spec": {...JSON prompt...}, "name"?, "model"?, "width"?, "height"?, "steps"?, "guidance"?, "seed"?, "characterId"? }
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { generateBody } from '../src/api'
import { applyCustomClothes } from '../src/lib/customClothes'
import { parseModes } from '../src/lib/promptBuilder/modes'
import { renderRequest, type RenderRequest } from '../src/lib/renderRequest'
import { entrySettings, parseEntries, type SpecEntry } from '../src/lib/renderSpecs'
import type { Catalog, Character, HistoryItem, ModelStatusReport } from '../src/types'

const APP = process.env.APP_URL ?? 'http://127.0.0.1:7860'
const OUT = join(homedir(), 'Pictures', 'z-image')

interface AppData {
  catalog: Catalog
  characters: Character[]
  status: ModelStatusReport
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${APP}${path}`)
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${await response.text()}`)
  return (await response.json()) as T
}

function requestFor(entry: SpecEntry, app: AppData): RenderRequest {
  const modes = parseModes(app.catalog.builder_modes).modes
  const made = entrySettings(entry, app.catalog, modes)
  if (made.status !== 'ready') return made
  const { characterId } = made.settings
  const character = app.characters.find((each) => each.id === characterId) ?? null
  if (characterId !== null && !character) return { status: 'problem', reason: `No character with id ${characterId}` }
  return renderRequest(made.settings, { catalog: app.catalog, character, modes, modelStatus: { status: 'settled', value: app.status }, safeOnly: false })
}

const fileName = (entry: SpecEntry, item: HistoryItem) => `${(entry.name ?? `z-image-${item.id}`).replace(/[^\w.-]+/g, '-')}.png`

/** Renders one entry and saves its PNG. A failed render is reported, not retried: the server may have made it already. */
async function render(entry: SpecEntry, body: ReturnType<typeof generateBody>): Promise<string> {
  const started = Date.now()
  const response = await fetch(`${APP}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`the app answered ${response.status}: ${await response.text()}`)
  const item = (await response.json()) as HistoryItem
  const png = await fetch(`${APP}/api/history/${item.id}/download`)
  writeFileSync(join(OUT, fileName(entry, item)), Buffer.from(await png.arrayBuffer()))
  return `saved #${item.id} in ${Math.round((Date.now() - started) / 1000)}s as ${fileName(entry, item)}`
}

async function main(): Promise<void> {
  const [file, flag] = process.argv.slice(2)
  if (!file) throw new Error('Usage: make render FILE=<list.json> [DRY_RUN=1]')
  const dryRun = flag === '--dry-run'
  const entries = parseEntries(JSON.parse(readFileSync(file, 'utf8')))
  const [catalog, characters, status] = await Promise.all([get<Catalog>('/api/catalog'), get<Character[]>('/api/characters'), get<ModelStatusReport>('/api/models/status')])
  applyCustomClothes(catalog)
  mkdirSync(OUT, { recursive: true })
  let failed = 0
  for (const [index, entry] of entries.entries()) {
    const label = `${index + 1}/${entries.length}${entry.name ? ` ${entry.name}` : ''}`
    const made = requestFor(entry, { catalog, characters, status })
    if (made.status !== 'ready') {
      failed += 1
      console.log(`${label}: skipped, ${made.reason}`)
      continue
    }
    const body = generateBody(made.request, null)
    if (dryRun) {
      console.log(`${label}: ${body.model}, ${body.width}×${body.height}\n  ${body.prompt}`)
      continue
    }
    try {
      console.log(`${label}: ${await render(entry, body)}`)
    } catch (error) {
      failed += 1
      console.log(`${label}: FAILED, ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (failed > 0) process.exitCode = 1
}

// Awaited, so the loader (scripts/render.mjs) stays open until the last image is saved
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

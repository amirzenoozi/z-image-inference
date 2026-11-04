import { expect, it } from 'vitest'
import { builderModes, catalog } from '../../test/fixtures'
import { parseModes } from '../promptBuilder/modes'
import { parseSpec } from '../promptBuilder/spec'
import { entrySettings, parseEntries } from '.'

const { modes } = parseModes(builderModes)
const spec = { version: 1, purpose: 'general', subject: { who: 'woman', age: 'late 20s' }, camera: { angle: 'slightly low angle' } }

it('makes a JSON prompt’s Create settings, with the builder’s negative prompt and the model’s defaults where the entry leaves them out', () => {
  const made = entrySettings({ spec, model: 'wai-illustrious', seed: 7, characterId: 3 }, catalog, modes)
  if (made.status !== 'ready') throw new Error(made.reason)
  const { settings } = made
  expect(settings).toMatchObject({ modelId: 'wai-illustrious', promptFormat: 'json', seed: 7, randomSeed: false, characterId: 3, lookIncluded: 3, steps: 28 })
  expect(parseSpec(settings.prompt)).toMatchObject({ ok: true, spec: { camera: { angle: 'slightly low angle' } } })
  expect(settings.negativePrompt).not.toBe('')
  expect(entrySettings({ spec }, catalog, modes)).toMatchObject({ status: 'ready', settings: { modelId: 'z-image-turbo', randomSeed: true } })
})

it('refuses an unknown model or a JSON prompt the app would refuse, never falling back', () => {
  expect(entrySettings({ spec, model: 'nope' }, catalog, modes)).toMatchObject({ status: 'problem', reason: expect.stringMatching(/nope/) })
  expect(entrySettings({ spec: { ...spec, camera: { angle: 'upside down' } } }, catalog, modes)).toMatchObject({ status: 'problem' })
})

it('reads a render list only as an array of entries with a spec', () => {
  expect(parseEntries([{ spec }])).toHaveLength(1)
  expect(() => parseEntries({ spec })).toThrow(/array/)
  expect(() => parseEntries([{ name: 'x' }])).toThrow(/Entry 1/)
})

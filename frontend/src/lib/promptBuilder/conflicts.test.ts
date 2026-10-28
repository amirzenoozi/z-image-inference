import { describe, expect, it } from 'vitest'
import shippedModes from '../../../../prompt_modes.json'
import type { BuilderModeData } from '../../types'
import { buildPrompt, emptyBuilderState, emptyOutfit, surprise, type BuilderState } from './build'
import { CHOICE_OPTIONS, TEXT_CHOICES } from './choices'
import { RANDOM } from './constants'
import { clashesIn } from './conflicts'
import { parseModes } from './modes'
import { settleChoices } from './settle'

const { modes } = parseModes(shippedModes as unknown as BuilderModeData[])
const explicit = modes.find((mode) => mode.id === 'explicit')!
const adult = (patch: Partial<BuilderState>): BuilderState => ({ ...emptyBuilderState(), who: 'couple', age: 'late 20s', mode: 'explicit', ...patch })
const kinds = (state: BuilderState) => clashesIn(state).map((clash) => clash.kind)

describe('finds choices that contradict each other', () => {
  it.each([
    ['hands', { pose: 'standing both hands on hips', explicitAction: 'sliding hand down body' }],
    ['hands', { pose: 'holding coffee', photoStyle: 'mirror selfie', explicitAction: 'touching neck sensually' }],
    ['position', { pose: 'standing', explicitAction: 'missionary' }],
    ['mouth', { expression: 'wide laughing smile', explicitAction: 'sucking finger' }],
    ['facing', { pose: 'back to camera', shotType: 'close-up face' }],
    ['framing', { shotType: 'headshot', pose: 'legs spread lying back' }],
    ['hair', { hairLength: 'buzzed', hairstyle: 'low ponytail' }],
    ['light', { timeOfDay: 'midnight', lightingSetup: 'harsh midday sun' }],
    ['weather', { sceneType: 'bedroom', weather: 'heavy rain' }],
    ['build', { bodyType: 'slim build', muscles: 'huge bodybuilder' }],
    ['build', { bodyType: 'plus-size figure', abs: 'six-pack' }],
    ['build', { chest: 'smooth chest', bodyHair: 'hairy' }],
  ] as const)('%s: %j', (kind, patch) => {
    expect(kinds(adult(patch))).toContain(kind)
  })

  it('finds two hats, and a held bag that needs a hand', () => {
    expect(kinds(adult({ outfit: { ...emptyOutfit(), accessories: ['Baseball cap', 'Beanie', 'Watch'] } }))).toEqual(['accessories'])
    expect(kinds(adult({ pose: 'texting', outfit: { ...emptyOutfit(), accessories: ['Clutch bag', 'Watch', 'Rings'] } }))).toEqual(['hands'])
  })

  it.each([
    { pose: 'kneeling', explicitAction: 'blowjob on knees' },
    { pose: 'mirror selfie pose', photoStyle: 'mirror selfie' },
    { pose: 'back to camera', expression: 'shy glance over the shoulder' },
    { hairLength: 'long', hairstyle: 'low ponytail' },
    { timeOfDay: 'sunset', lightingSetup: 'golden hour', sceneType: 'beach', weather: 'clear skies' },
    { pose: RANDOM, explicitAction: RANDOM, expression: RANDOM },
  ])('leaves choices that go together alone: %j', (patch) => {
    expect(clashesIn(adult(patch))).toEqual([])
  })
})

const everythingRandom = (who: string, seed: number): BuilderState => ({
  ...emptyBuilderState(),
  ...Object.fromEntries(TEXT_CHOICES.map((field) => [field, RANDOM])),
  who, age: 'late 20s', mode: 'explicit', rollSeed: seed,
  outfit: { ...emptyOutfit(), accessories: [RANDOM, RANDOM, RANDOM] },
})

describe('random choices never contradict each other', () => {
  it.each(['woman', 'man', 'couple'])('every choice on Random, %s, across 400 rolls', (who) => {
    for (let seed = 1; seed <= 400; seed++) {
      expect(clashesIn(settleChoices(everythingRandom(who, seed * 104729), explicit)), `seed ${seed}`).toEqual([])
    }
  })

  // Every option of every field, with all the others left to Random: whatever you pick, Random works around it
  const pinned = (['pose', 'explicitAction', 'expression', 'shotType', 'cameraAngle', 'photoStyle', 'hairLength', 'hairstyle', 'timeOfDay', 'lightingSetup', 'sceneType', 'weather', 'bodyType', 'muscles', 'abs', 'chest', 'bodyHair'] as const)
    .flatMap((field) => CHOICE_OPTIONS[field].map((value) => [field, value] as const))
  it.each(pinned)('%s "%s" with everything else on Random', (field, value) => {
    for (const seed of [11, 222, 3333]) {
      const state = { ...everythingRandom('couple', seed), [field]: value }
      expect(clashesIn(settleChoices(state, explicit)), `seed ${seed}`).toEqual([])
    }
  })

  it.each(modes.map((mode) => [mode.id, mode] as const))('Surprise me in %s, for every subject, across 300 rolls', (_, mode) => {
    for (const who of ['woman', 'man', 'couple', 'two women', 'two men']) {
      for (let seed = 1; seed <= 300; seed++) {
        const state = surprise({ ...emptyBuilderState(), mode: mode.id, who }, seed * 7919, mode)
        expect(clashesIn(state), `${who}, seed ${seed}`).toEqual([])
      }
    }
  })
})

describe('warnings for clashes in your own choices', () => {
  const ready = (state: BuilderState, modeId = 'explicit') => {
    const result = buildPrompt(state, modes.find((mode) => mode.id === modeId)!)
    if (result.status !== 'ready') throw new Error(result.status)
    return result
  }

  it('reports what you chose that clashes, not what Random picked', () => {
    expect(ready(adult({ pose: 'standing both hands on hips', explicitAction: 'sliding hand down body' })).clashes).toEqual([
      { kind: 'hands', values: ['standing both hands on hips', 'sliding hand down body'] },
    ])
    expect(ready(adult({ pose: RANDOM, explicitAction: RANDOM, expression: RANDOM, shotType: RANDOM })).clashes).toEqual([])
  })

  it('ignores choices a step the purpose hides keeps from the prompt', () => {
    const leftOver = adult({ mode: 'portrait', who: 'woman', pose: 'legs spread lying back', shotType: 'headshot' })
    expect(ready(leftOver, 'portrait').clashes).toEqual([])
  })
})

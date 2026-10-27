import { describe, expect, it } from 'vitest'
import {
  INHERIT_SCENE,
  NOT_SET,
  RANDOM,
  REMOVE,
  buildPrompt,
  composeOutfit,
  emptyBuilderState,
  emptyOutfit,
  hasRandomChoice,
  minorTermIn,
  type BuilderState,
  type BuildResult,
  type OutfitState,
} from './build'
import { HAIR_COLORS, LENSES } from './data'
import parityCases from './parity.json'
import { loadBuilderState, saveBuilderState } from './storage'

type Args = Record<string, string | undefined>

interface ParityCase {
  name: string
  explicit: boolean
  outfitArgs: Args
  promptArgs: Args
  flags: Record<string, boolean | undefined>
  outfit: string
  prompt: string
  negativePrompt: string
}

const fromUpstream = (value: string | undefined) => (value === undefined || value === 'unset' ? NOT_SET : value)

function outfitFrom(args: Args): OutfitState {
  const v = (key: string) => fromUpstream(args[key])
  return {
    top: v('top'), topColor: v('top_color'), bottom: v('bottom'), bottomColor: v('bottom_color'),
    lingerieTop: v('lingerie_top'), lingerieTopColor: v('lingerie_top_color'),
    lingerieBottom: v('lingerie_bottom'), lingerieBottomColor: v('lingerie_bottom_color'),
    outerwear: v('outerwear'), outerwearColor: v('outerwear_color'), shoes: v('shoes'), shoesColor: v('shoes_color'),
    accessories: [v('accessory_1'), v('accessory_2'), v('accessory_3')], details: args.extra_outfit_details ?? '',
  }
}

function stateFrom(item: ParityCase): BuilderState {
  const a = item.promptArgs
  const v = (key: string) => fromUpstream(a[key])
  return {
    ...emptyBuilderState(),
    subject: a.subject ?? '', explicit: item.explicit, photoStyle: v('photo_style'), pose: v('pose'), action: a.action ?? '',
    hairColor: v('hair_color'), hairstyle: v('hairstyle'), outfit: outfitFrom(item.outfitArgs), sceneType: v('scene_type'),
    environment: a.environment ?? '', lightingSetup: v('lighting_setup'), lightingCustom: a.lighting_custom ?? '',
    shotType: v('shot_type'), cameraAngle: v('camera_angle'), lens: v('lens'), depthOfField: v('depth_of_field'),
    mood: a.mood ?? '', colorGrading: v('color_grading'), extraDetails: a.extra_details ?? '', negativePrompt: a.negative_prompt ?? '',
    exposeBreasts: item.flags.expose_breasts ?? false, removeBra: item.flags.remove_bra ?? false, removePanties: item.flags.remove_panties ?? false,
  }
}

function ready(result: BuildResult): { prompt: string; negativePrompt: string } {
  if (result.status !== 'ready') throw new Error(`expected a prompt, got ${result.status}: ${result.reason}`)
  return result
}

const SFW_ONLY_UPSTREAM_NEGATIVES =
  'saggy breasts, torpedo breasts, droopy breasts, pendulous breasts, tubular breasts, uneven breasts, deflated breasts, '

describe('matches the upstream Python builder', () => {
  it.each(parityCases as ParityCase[])('$name (explicit: $explicit)', (item) => {
    const state = stateFrom(item)
    expect(composeOutfit(state.outfit, 1)).toBe(item.outfit)
    const result = ready(buildPrompt(state))
    expect(result.prompt).toBe(item.prompt)
    // The one intended difference: body-shape negatives only apply to explicit prompts here
    const expectedNegative = item.explicit ? item.negativePrompt : item.negativePrompt.replace(SFW_ONLY_UPSTREAM_NEGATIVES, '')
    expect(result.negativePrompt).toBe(expectedNegative)
  })
})

const withSubject = (patch: Partial<BuilderState> = {}): BuilderState => ({ ...emptyBuilderState(), subject: 'adult woman', ...patch })

it('asks for a subject before building', () => {
  expect(buildPrompt(emptyBuilderState()).status).toBe('incomplete')
})

describe('random choices', () => {
  it('stay the same until re-rolled and come from the right list', () => {
    const state = withSubject({ hairColor: RANDOM, lens: RANDOM })
    const first = ready(buildPrompt(state)).prompt
    expect(ready(buildPrompt(state)).prompt).toBe(first)
    expect(HAIR_COLORS.some((color) => first.toLowerCase().includes(color))).toBe(true)
    expect(LENSES.some((lens) => first.includes(`${lens} lens`))).toBe(true)

    const rerolled = new Set(Array.from({ length: 20 }, (_, seed) => ready(buildPrompt({ ...state, rollSeed: seed })).prompt))
    expect(rerolled.size).toBeGreaterThan(1)
  })

  it('do not change when another field changes', () => {
    const state = withSubject({ hairColor: RANDOM })
    const withoutMood = ready(buildPrompt(state)).prompt
    expect(ready(buildPrompt({ ...state, mood: 'calm' })).prompt).toBe(`${withoutMood.slice(0, -1)}. Calm mood.`)
  })

  it('are reported so the re-roll button can be enabled', () => {
    expect(hasRandomChoice(withSubject())).toBe(false)
    expect(hasRandomChoice(withSubject({ outfit: { ...emptyOutfit(), accessories: [NOT_SET, RANDOM, NOT_SET] } }))).toBe(true)
  })
})

it('describes removed garments and inherits lighting from the scene', () => {
  const state = withSubject({ outfit: { ...emptyOutfit(), shoes: REMOVE }, sceneType: 'kitchen', lightingSetup: INHERIT_SCENE })
  expect(ready(buildPrompt(state)).prompt).toBe('Photo of adult woman. Without shoes. In a kitchen setting. Lighting natural to a kitchen setting.')
})

it('names the hair when only a colour is chosen', () => {
  expect(ready(buildPrompt(withSubject({ hairColor: 'auburn' }))).prompt).toBe('Photo of adult woman. Auburn hair.')
})

it('leaves explicit actions out unless explicit content is on', () => {
  const state = withSubject({ explicitAction: 'masturbating' })
  expect(ready(buildPrompt(state)).prompt).toBe('Photo of adult woman.')
})

describe('age safeguard', () => {
  it.each(['teen', 'young girl', '17 year old', 'schoolgirl', '16yo', 'kids'])('blocks “%s” with explicit content', (word) => {
    const result = buildPrompt(withSubject({ explicit: true, subject: `${word} on a bed` }))
    expect(result.status).toBe('blocked')
  })

  it('applies to lingerie and to every free-text field', () => {
    const lingerie = { ...emptyOutfit(), lingerieTop: 'Lace bralette' }
    expect(buildPrompt(withSubject({ outfit: lingerie, mood: 'like a teenager' })).status).toBe('blocked')
    expect(minorTermIn(withSubject({ explicit: true, outfit: { ...emptyOutfit(), details: 'with her daughter' } }))).toBe('daughter')
  })

  it('allows adult subjects and harmless words', () => {
    expect(buildPrompt(withSubject({ explicit: true, extraDetails: 'baby blue sheets, eighteen candles' })).status).toBe('ready')
    expect(buildPrompt(withSubject({ explicit: true, subject: '25 year old adult woman' })).status).toBe('ready')
  })

  it('does not apply to prompts without adult content', () => {
    expect(buildPrompt(withSubject({ subject: 'a boy flying a kite' })).status).toBe('ready')
  })
})

describe('storage', () => {
  it('round-trips the builder state and ignores corrupt data', () => {
    const state = withSubject({ explicit: true, rollSeed: 9 })
    saveBuilderState(state)
    expect(loadBuilderState()).toEqual(state)

    localStorage.setItem('z-image-studio.prompt-builder.v1', JSON.stringify({ ...state, outfit: { accessories: 'nope' } }))
    expect(loadBuilderState()).toEqual(emptyBuilderState())
  })
})

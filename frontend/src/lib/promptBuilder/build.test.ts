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
  surprise,
  type BuilderState,
  type BuildResult,
  type OutfitState,
} from './build'
import { HAIR_COLORS, LENSES } from './data'
import { AGE_RANGES } from './extraData'
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
  const exposed = item.flags.expose_breasts ?? false
  return {
    ...emptyBuilderState(),
    subject: a.subject ?? '', explicit: item.explicit, photoStyle: v('photo_style'), pose: v('pose'), action: a.action ?? '',
    hairColor: v('hair_color'), hairstyle: v('hairstyle'), outfit: outfitFrom(item.outfitArgs), sceneType: v('scene_type'),
    environment: a.environment ?? '', lightingSetup: v('lighting_setup'), lightingCustom: a.lighting_custom ?? '',
    shotType: v('shot_type'), cameraAngle: v('camera_angle'), lens: v('lens'), depthOfField: v('depth_of_field'),
    mood: a.mood ?? '', colorGrading: v('color_grading'), extraDetails: a.extra_details ?? '', negativePrompt: a.negative_prompt ?? '',
    nudity: exposed ? (item.flags.remove_panties ? 'nude' : 'topless') : 'clothed',
  }
}

function ready(result: BuildResult): { prompt: string; negativePrompt: string } {
  if (result.status !== 'ready') throw new Error(`expected a prompt, got ${result.status}: ${result.reason}`)
  return result
}

const SFW_ONLY_UPSTREAM_NEGATIVES =
  'saggy breasts, torpedo breasts, droopy breasts, pendulous breasts, tubular breasts, uneven breasts, deflated breasts, '

describe('matches the upstream Python builder', () => {
  const cases = parityCases as ParityCase[]

  it.each(cases.filter((item) => !item.explicit))('$name', (item) => {
    const state = stateFrom(item)
    expect(composeOutfit(state.outfit, 1)).toBe(item.outfit)
    const result = ready(buildPrompt(state))
    expect(result.prompt).toBe(item.prompt)
    // Intended difference: body-shape negatives only apply to explicit prompts here
    expect(result.negativePrompt).toBe(item.negativePrompt.replace(SFW_ONLY_UPSTREAM_NEGATIVES, ''))
  })

  it.each(cases.filter((item) => item.explicit))('$name, with the required adult subject', (item) => {
    // Explicit prompts here must name who and an age, which replaces upstream's free-text "adult woman"
    const state = { ...stateFrom(item), subject: '', who: 'woman', age: 'late 20s' }
    const result = ready(buildPrompt(state))
    expect(result.prompt).toBe(item.prompt.replace('Photo of adult woman', 'Photo of an adult woman in her late 20s'))
    expect(result.negativePrompt).toBe(item.negativePrompt)
  })
})

const withSubject = (patch: Partial<BuilderState> = {}): BuilderState => ({ ...emptyBuilderState(), subject: 'adult woman', ...patch })
const adult = (patch: Partial<BuilderState> = {}): BuilderState => ({ ...emptyBuilderState(), who: 'woman', age: 'late 20s', ...patch })

it('asks for a subject before building', () => {
  expect(buildPrompt(emptyBuilderState()).status).toBe('incomplete')
})

describe('subject', () => {
  it.each([
    [{ who: 'woman', age: 'early 30s', ethnicity: 'East Asian' }, 'Photo of an adult East Asian woman in her early 30s.'],
    [{ who: 'man', age: '40s' }, 'Photo of an adult man in his 40s.'],
    [{ who: 'couple', age: 'late 20s' }, 'Photo of an adult couple, a woman and a man in their late 20s.'],
    [{ who: 'two men' }, 'Photo of two adult men.'],
    [{ who: 'woman', subject: 'a dancer' }, 'Photo of an adult woman, a dancer.'],
  ])('describes %o', (patch, prompt) => {
    expect(ready(buildPrompt({ ...emptyBuilderState(), ...patch })).prompt).toBe(prompt)
  })
})

it('describes face, skin, hair and body in their own sentences', () => {
  const state = adult({
    eyeColor: 'hazel', expression: 'soft smile', makeup: 'natural makeup', skinTone: 'olive', skinDetails: ['freckles'],
    hairLength: 'long', hairColor: 'auburn', bodyType: 'curvy figure', bust: 'full natural breasts', hips: 'wide hips', tattoos: ['thigh tattoo'],
  })
  expect(ready(buildPrompt(state)).prompt).toBe(
    'Photo of an adult woman in her late 20s. Hazel eyes, soft smile, natural makeup, olive skin, freckles. ' +
      'Curvy figure, full natural breasts, wide hips, thigh tattoo. Long auburn hair.',
  )
})

it('leaves the bust out for men', () => {
  expect(ready(buildPrompt(adult({ who: 'man', bust: 'full natural breasts' }))).prompt).toBe('Photo of an adult man in his late 20s.')
})

it('adds time of day, weather and realism details', () => {
  const state = withSubject({ sceneType: 'balcony', timeOfDay: 'golden hour', weather: 'light rain', realism: ['subtle film grain'] })
  expect(ready(buildPrompt(state)).prompt).toBe('Photo of adult woman. In a balcony setting at golden hour, light rain. Subtle film grain.')
})

describe('explicit content', () => {
  it.each([
    ['implied', 'Implied nudity, nipples and intimate areas hidden by hands, sheets, or hair', true, true],
    ['topless', 'Clothing adjusted to expose breasts, no bra, underwear or lingerie covering intimate areas', false, true],
    ['nude', 'Clothing adjusted to expose breasts, no bra, not wearing panties', false, false],
  ] as const)('%s nudity sets the wording and coverage negatives', (nudity, wording, breastsCovered, intimateCovered) => {
    const result = ready(buildPrompt(adult({ explicit: true, nudity, intimacy: ['flushed cheeks'] })))
    expect(result.prompt).toContain(`${wording}. Flushed cheeks.`)
    expect(result.negativePrompt.includes('exposed nipples')).toBe(breastsCovered)
    expect(result.negativePrompt.includes('exposed genitals')).toBe(intimateCovered)
  })

  it('needs who and an adult age range', () => {
    expect(buildPrompt(withSubject({ explicit: true })).status).toBe('incomplete')
    expect(buildPrompt(adult({ explicit: true, age: NOT_SET })).status).toBe('incomplete')
    expect(buildPrompt(withSubject({ outfit: { ...emptyOutfit(), lingerieTop: 'Lace bralette' } })).status).toBe('incomplete')
    expect(buildPrompt(adult({ explicit: true })).status).toBe('ready')
  })

  it('ignores explicit-only choices when the switch is off', () => {
    const result = ready(buildPrompt(adult({ explicitAction: 'masturbating', nudity: 'nude', intimacy: ['flushed cheeks'] })))
    expect(result.prompt).toBe('Photo of an adult woman in her late 20s.')
  })
})

describe('age safeguard', () => {
  it.each(['teen', 'young girl', '17 year old', 'schoolgirl', '16yo', 'kids'])('blocks “%s” with explicit content', (word) => {
    expect(buildPrompt(adult({ explicit: true, subject: `${word} on a bed` })).status).toBe('blocked')
  })

  it('checks every free-text field', () => {
    expect(minorTermIn(adult({ explicit: true, bodyExtra: 'teenage figure' }))).toBe('teenage')
    expect(minorTermIn(adult({ explicit: true, outfit: { ...emptyOutfit(), details: 'with her daughter' } }))).toBe('daughter')
  })

  it('allows adult subjects and harmless words', () => {
    expect(buildPrompt(adult({ explicit: true, extraDetails: 'baby blue sheets, eighteen candles' })).status).toBe('ready')
    expect(buildPrompt(withSubject({ subject: 'a boy flying a kite' })).status).toBe('ready')
  })
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
    expect(hasRandomChoice(withSubject({ age: RANDOM }))).toBe(true)
    expect(hasRandomChoice(withSubject({ outfit: { ...emptyOutfit(), accessories: [NOT_SET, RANDOM, NOT_SET] } }))).toBe(true)
  })
})

describe('surprise', () => {
  it('fills concrete choices, keeps free text and stays adult', () => {
    const state = surprise({ ...emptyBuilderState(), mood: 'calm' }, 7)
    expect(state.mood).toBe('calm')
    expect(AGE_RANGES).toContain(state.age)
    expect(['woman', 'man']).toContain(state.who)
    expect(hasRandomChoice(state)).toBe(false)
    expect(state.outfit.lingerieTop).toBe(NOT_SET)
    expect(ready(buildPrompt(state)).prompt.length).toBeGreaterThan(100)
  })

  it('adds explicit details only when explicit content is on', () => {
    const state = surprise({ ...emptyBuilderState(), who: 'woman', explicit: true }, 3)
    expect(state.explicitAction).not.toBe(NOT_SET)
    expect(state.intimacy).toHaveLength(2)
    expect(buildPrompt(state).status).toBe('ready')
  })

  it('keeps the chosen subject', () => {
    const state = surprise({ ...emptyBuilderState(), who: 'two men', age: '50s' }, 11)
    expect([state.who, state.age, state.bust]).toEqual(['two men', '50s', NOT_SET])
  })
})

it('describes removed garments and inherits lighting from the scene', () => {
  const state = withSubject({ outfit: { ...emptyOutfit(), shoes: REMOVE }, sceneType: 'kitchen', lightingSetup: INHERIT_SCENE })
  expect(ready(buildPrompt(state)).prompt).toBe('Photo of adult woman. Without shoes. In a kitchen setting. Lighting natural to a kitchen setting.')
})

describe('storage', () => {
  it('round-trips the builder state, including chip lists', () => {
    const state = adult({ explicit: true, nudity: 'topless', tattoos: ['thigh tattoo', 'hip tattoo'], rollSeed: 9 })
    saveBuilderState(state)
    expect(loadBuilderState()).toEqual(state)
  })

  it('ignores corrupt or outdated data', () => {
    const key = 'z-image-studio.prompt-builder.v2'
    localStorage.setItem(key, JSON.stringify({ ...adult(), nudity: 'everything' }))
    expect(loadBuilderState()).toEqual(emptyBuilderState())
    localStorage.setItem(key, JSON.stringify({ ...adult(), tattoos: [1, 2] }))
    expect(loadBuilderState()).toEqual(emptyBuilderState())
  })
})

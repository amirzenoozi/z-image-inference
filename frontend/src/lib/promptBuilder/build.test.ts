import { describe, expect, it } from 'vitest'
import {
  INHERIT_SCENE,
  NOT_SET,
  RANDOM,
  REMOVE,
  buildPrompt,
  emptyBuilderState,
  emptyOutfit,
  hasRandomChoice,
  minorTermIn,
  partnerActions,
  poseOptions,
  soloActions,
  surprise,
  withoutSafeForWorkTerms,
  type BuilderState,
  type BuildResult,
  type PromptStyle,
} from './build'
import { HAIR_COLORS, LENSES } from './data'
import { AGE_RANGES } from './extraData'
import { loadBuilderState, saveBuilderState } from './storage'

function ready(result: BuildResult): { prompt: string; negativePrompt: string; explicit: boolean } {
  if (result.status !== 'ready') throw new Error(`expected a prompt, got ${result.status}: ${result.reason}`)
  return result
}

const promptOf = (state: BuilderState, style: PromptStyle = 'prose') => ready(buildPrompt(state, style)).prompt
const withSubject = (patch: Partial<BuilderState> = {}): BuilderState => ({ ...emptyBuilderState(), subject: 'adult woman', ...patch })
const adult = (patch: Partial<BuilderState> = {}): BuilderState => ({ ...emptyBuilderState(), who: 'woman', age: 'late 20s', ...patch })

it('asks for a subject before building', () => {
  expect(buildPrompt(emptyBuilderState()).status).toBe('incomplete')
})

describe('subject', () => {
  it.each([
    [{ who: 'woman', age: 'early 30s', ethnicity: 'East Asian' }, 'A photograph of an adult East Asian woman in her early 30s.'],
    [{ who: 'man', age: '40s' }, 'A photograph of an adult man in his 40s.'],
    [{ who: 'couple', age: 'late 20s' }, 'A photograph of an adult couple, a woman and a man in their late 20s.'],
    [{ who: 'two men' }, 'A photograph of two adult men.'],
    [{ who: 'woman', subject: 'a dancer' }, 'A photograph of an adult woman, a dancer.'],
    [{ subject: 'an old lighthouse' }, 'A photograph of an old lighthouse.'],
  ])('describes %o', (patch, prompt) => {
    expect(promptOf({ ...emptyBuilderState(), ...patch })).toBe(prompt)
  })
})

describe('sentences for models that read natural language', () => {
  it('ties the person, outfit, place, light and camera to the subject in connected sentences', () => {
    const state = adult({
      photoStyle: 'editorial', pose: 'standing hand on hip', eyeColor: 'hazel', expression: 'soft smile', makeup: 'natural makeup',
      skinTone: 'olive', skinDetails: ['freckles'], hairLength: 'long', hairColor: 'auburn', hairstyle: 'beach waves',
      bodyType: 'curvy figure', height: 'tall', hips: 'wide hips', tattoos: ['thigh tattoo'],
      outfit: { ...emptyOutfit(), top: 'Blouse', topColor: 'white', bottom: 'Denim shorts', accessories: ['Anklet', NOT_SET, NOT_SET] },
      sceneType: 'cafe', timeOfDay: 'golden hour', weather: 'clear skies', lightingSetup: 'candlelight',
      shotType: 'waist-up portrait', cameraAngle: 'eye level', lens: '85mm portrait', depthOfField: 'shallow f/2.0',
      mood: 'relaxed', colorGrading: 'warm golden', realism: ['subtle film grain'],
    })
    expect(promptOf(state)).toBe(
      'An editorial photograph of an adult woman in her late 20s, standing hand on hip. ' +
        'She has hazel eyes and a soft smile, wearing natural makeup. Her skin is olive, with freckles. ' +
        'She is tall with a curvy figure and wide hips. She has a thigh tattoo. Her long auburn hair is styled in beach waves. ' +
        'She is wearing a white blouse, denim shorts and an anklet. The scene is set in a cafe setting at golden hour, with clear skies. ' +
        'The scene is lit by warm flickering candlelight casting intimate orange glow and dancing soft shadows. ' +
        'Captured as a waist-up portrait at eye level with an 85mm portrait lens, shallow depth of field at f/2.0. ' +
        'The mood is relaxed, with warm golden colour grading. Subtle film grain.',
    )
  })

  it('uses the pronouns of the subject', () => {
    expect(promptOf(adult({ who: 'man', eyeColor: 'blue' }))).toContain('He has blue eyes')
    expect(promptOf(adult({ who: 'two women', eyeColor: 'blue' }))).toContain('They have blue eyes')
  })

  it('leaves the bust out for men', () => {
    expect(promptOf(adult({ who: 'man', bust: 'full natural breasts' }))).toBe('A photograph of an adult man in his late 20s.')
  })

  it('describes removed garments and inherits lighting from the scene', () => {
    const state = withSubject({ outfit: { ...emptyOutfit(), shoes: REMOVE }, sceneType: 'kitchen', lightingSetup: INHERIT_SCENE })
    expect(promptOf(state)).toBe(
      'A photograph of adult woman. They are wearing no shoes. The scene is set in a kitchen setting. ' +
        'The scene is lit by the natural light of the kitchen setting.',
    )
  })
})

describe('tags for models trained on booru tags', () => {
  it('lists quality tags, then who, then the rest, without the camera and realism wording', () => {
    const state = adult({
      eyeColor: 'green', hairColor: 'auburn', hairLength: 'long', sceneType: 'bedroom', lightingSetup: 'candlelight',
      lens: '35mm', realism: ['subtle film grain'], outfit: { ...emptyOutfit(), top: 'Blouse', topColor: 'white' },
    })
    expect(promptOf(state, 'tags')).toBe(
      'masterpiece, best quality, amazing quality, 1girl, solo, adult woman, late 20s, green eyes, long hair, auburn hair, white blouse, bedroom, candlelight',
    )
  })

  it('puts adult content right after who, with extra weight', () => {
    const state = adult({ explicit: true, nudity: 'nude', pose: 'legs spread lying back', explicitAction: 'caressing inner thigh', sceneType: 'bedroom' })
    expect(promptOf(state, 'tags')).toBe(
      'masterpiece, best quality, amazing quality, 1girl, solo, adult woman, late 20s, ' +
        '(completely nude:1.3), (nipples:1.3), (pussy:1.3), (caressing inner thigh:1.3), (legs spread lying back:1.2), bedroom',
    )
  })

  it('weighs nothing when explicit content is off', () => {
    expect(promptOf(adult({ pose: 'standing', sceneType: 'bedroom' }), 'tags')).not.toContain(':1.')
  })
})

describe('explicit content', () => {
  it.each([
    ['clothed', 'She is fully clothed, her breasts and intimate areas covered', true, true],
    ['implied', 'She is nude but nothing explicit is shown, her breasts and intimate areas hidden by hands, sheets or hair', true, true],
    ['topless', 'She is topless with nothing worn above the waist, bare breasts and nipples fully visible', false, true],
    ['nude', 'She is completely nude, fully naked with no clothing at all, bare breasts, nipples and vulva clearly visible', false, false],
  ] as const)('%s states it plainly, straight after the subject, with matching negatives', (nudity, wording, breastsCovered, intimateCovered) => {
    const result = ready(buildPrompt(adult({ explicit: true, nudity, eyeColor: 'green' })))
    expect(result.prompt).toContain(`A photograph of an adult woman in her late 20s. ${wording}. She has green eyes.`)
    expect(result.negativePrompt.includes('exposed nipples')).toBe(breastsCovered)
    expect(result.negativePrompt.includes('exposed genitals')).toBe(intimateCovered)
  })

  it('puts the explicit pose and action in the opening sentence', () => {
    const state = adult({ explicit: true, nudity: 'nude', pose: 'bent over', explicitAction: 'biting lip', sceneType: 'bedroom' })
    expect(promptOf(state)).toMatch(/^A photograph of an adult woman in her late 20s, bent over at the waist, ass presented, upper body lowered, biting lower lip seductively\. /)
  })

  it('never describes clothes the nudity level has taken off', () => {
    const outfit = { ...emptyOutfit(), top: 'Blouse', lingerieTop: 'Lace bra', bottom: 'Denim shorts', shoes: 'High heels', accessories: ['Anklet', NOT_SET, NOT_SET] as [string, string, string] }
    expect(promptOf(adult({ explicit: true, nudity: 'topless', outfit }))).toContain('She is wearing only denim shorts, high heels and an anklet.')
    expect(promptOf(adult({ explicit: true, nudity: 'nude', outfit }))).toContain('She is wearing only high heels and an anklet.')
    expect(promptOf(adult({ explicit: true, nudity: 'clothed', outfit }))).toContain('She is wearing a lace bra, a blouse, denim shorts, high heels and an anklet.')
  })

  it('describes a man and a couple with the right anatomy', () => {
    expect(promptOf(adult({ who: 'man', explicit: true, nudity: 'topless' }))).toContain('He is shirtless and bare-chested.')
    expect(promptOf(adult({ who: 'couple', explicit: true, nudity: 'nude' }))).toContain('bare breasts, nipples, vulva and penis clearly visible')
  })

  it('needs who and an adult age range', () => {
    expect(buildPrompt(withSubject({ explicit: true })).status).toBe('incomplete')
    expect(buildPrompt(adult({ explicit: true, age: NOT_SET })).status).toBe('incomplete')
    expect(buildPrompt(withSubject({ outfit: { ...emptyOutfit(), lingerieTop: 'Lace bralette' } })).status).toBe('incomplete')
    expect(buildPrompt(adult({ explicit: true })).status).toBe('ready')
  })

  it('ignores explicit-only choices when the switch is off', () => {
    const result = ready(buildPrompt(adult({ explicitAction: 'biting lip', nudity: 'nude', intimacy: ['flushed cheeks'] })))
    expect(result.prompt).toBe('A photograph of an adult woman in her late 20s.')
    expect(result.explicit).toBe(false)
  })

  it('takes "nsfw" and similar terms out of the negative prompt, which would fight the explicit content', () => {
    const negativePrompt = 'nsfw, lowres, Censored, bad hands'
    expect(ready(buildPrompt(adult({ explicit: true, negativePrompt }))).negativePrompt).toMatch(/^lowres, bad hands, /)
    expect(ready(buildPrompt(adult({ negativePrompt }))).negativePrompt).toMatch(/^nsfw, lowres, Censored, bad hands, /)
    expect(withoutSafeForWorkTerms(' nsfw , (worst quality:1.2), nude')).toBe('(worst quality:1.2)')
  })
})

describe('options that fit the subject', () => {
  it('offers partner actions only for a couple, which they are written for', () => {
    expect(partnerActions('couple', 'nude')).toContain('missionary')
    for (const who of ['woman', 'man', 'two women', 'two men', NOT_SET]) expect(partnerActions(who, 'nude')).toEqual([])
  })

  it('leaves out poses and actions about breasts or lingerie for men', () => {
    expect(soloActions('woman', 'nude')).toContain('cupping breasts')
    expect(soloActions('man', 'nude')).not.toContain('cupping breasts')
    expect(soloActions('man', 'nude')).toContain('biting lip')
    expect(poseOptions(true, 'two men')).not.toContain('topless covering with hands')
    expect(poseOptions(true, 'woman')).toContain('topless covering with hands')
  })

  it.each([
    ['clothed', true, true],
    ['topless', false, true],
    ['implied', false, false],
    ['nude', false, false],
  ] as const)('offers actions about taking clothes off only while those clothes are on (%s)', (nudity, topOn, bottomOn) => {
    expect(soloActions('woman', nudity).includes('undoing bra clasp')).toBe(topOn)
    expect(soloActions('woman', nudity).includes('pulling panties aside')).toBe(bottomOn)
    expect(partnerActions('couple', nudity).includes('undressing each other')).toBe(bottomOn)
    expect(soloActions('woman', nudity)).toContain('biting lip')
  })

  it('drops an action about clothes once the nudity level has taken them off', () => {
    const state = adult({ explicit: true, nudity: 'nude', explicitAction: 'pulling down strap' })
    expect(promptOf(state)).not.toContain('strap')
    expect(promptOf(state, 'tags')).not.toContain('strap')
    expect(promptOf({ ...state, nudity: 'clothed' })).toContain('pulling a bra or top strap down off the shoulder')
  })

  it('drops an action kept from an earlier subject that no longer fits', () => {
    const state = adult({ who: 'man', explicit: true, explicitAction: 'cupping breasts' })
    expect(promptOf(state)).not.toContain('breasts')
    expect(promptOf(state, 'tags')).not.toContain('cupping')
  })
})

describe('age safeguard', () => {
  it.each(['teen', 'young girl', '17 year old', 'schoolgirl', '16yo', 'kids'])('blocks “%s” with explicit content', (word) => {
    expect(buildPrompt(adult({ explicit: true, subject: `${word} on a bed` })).status).toBe('blocked')
    expect(buildPrompt(adult({ explicit: true, subject: `${word} on a bed` }), 'tags').status).toBe('blocked')
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
    const first = promptOf(state)
    expect(promptOf(state)).toBe(first)
    expect(HAIR_COLORS.some((color) => first.toLowerCase().includes(color))).toBe(true)
    expect(LENSES.some((lens) => first.includes(lens))).toBe(true)
    const rerolled = new Set(Array.from({ length: 20 }, (_, seed) => promptOf({ ...state, rollSeed: seed })))
    expect(rerolled.size).toBeGreaterThan(1)
  })

  it('do not change when another field changes', () => {
    const state = withSubject({ hairColor: RANDOM })
    const withoutMood = promptOf(state)
    expect(promptOf({ ...state, mood: 'calm' })).toBe(`${withoutMood.slice(0, -1)}. The mood is calm.`)
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
    expect(promptOf(state).length).toBeGreaterThan(100)
  })

  it('adds explicit details only when explicit content is on, fitting the subject', () => {
    const state = surprise({ ...emptyBuilderState(), who: 'woman', explicit: true }, 3)
    expect(state.explicitAction).not.toBe(NOT_SET)
    expect(state.intimacy).toHaveLength(2)
    expect(buildPrompt(state).status).toBe('ready')
    for (let seed = 0; seed < 30; seed++) {
      const state = surprise({ ...emptyBuilderState(), who: 'man', explicit: true }, seed)
      expect(soloActions('man', state.nudity)).toContain(state.explicitAction)
    }
  })

  it('keeps the chosen subject', () => {
    const state = surprise({ ...emptyBuilderState(), who: 'two men', age: '50s' }, 11)
    expect([state.who, state.age, state.bust]).toEqual(['two men', '50s', NOT_SET])
  })
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

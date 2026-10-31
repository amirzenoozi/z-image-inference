import { describe, expect, it } from 'vitest'
import { builderModes } from '../../test/fixtures'
import { buildPrompt, emptyBuilderState, emptyOutfit, surprise, surpriseStep, switchMode, toggleLock, type BuilderState } from './build'
import { NOT_SET } from './constants'
import { clashesIn } from './conflicts'
import { parseModes, type BuilderMode, type StepId } from './modes'
import { choicesInPrompt } from './settle'

const { modes } = parseModes(builderModes)
const modeOf = (id: string) => modes.find((mode) => mode.id === id)!

/** The builder fields each step's own Surprise me may change. */
const STEP_FIELDS: Readonly<Record<StepId, readonly (keyof BuilderState)[]>> = {
  subject: ['who', 'age', 'ethnicity'],
  appearance: ['hairLength', 'hairstyle', 'hairColor', 'eyeColor', 'makeup', 'makeupMore', 'skinTone', 'facialHair', 'facialHairMore', 'expression'],
  body: ['bodyType', 'muscles', 'abs', 'chest', 'bodyHair', 'bust', 'hips', 'height', 'penis', 'nipples', 'pubicHair', 'bulge'],
  outfit: ['outfit'],
  pose: ['pose', 'explicitAction', 'expression'],
  intimacy: ['nudity', 'intimacy', 'explicitDetails'],
  scene: ['sceneType', 'timeOfDay', 'weather', 'lightingSetup', 'lightingMore'],
  camera: ['photoStyle', 'shotType', 'cameraAngle', 'lens', 'depthOfField'],
  finish: ['colorGrading', 'realism'],
}

const changedFields = (before: BuilderState, after: BuilderState) =>
  (Object.keys(before) as (keyof BuilderState)[]).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))

const surprised = (mode: BuilderMode, seed: number): BuilderState =>
  surprise({ ...switchMode(emptyBuilderState(), mode), who: 'woman', age: 'late 20s', subject: 'a dancer' }, seed, mode)

describe('Surprise me', () => {
  const chosen = { ...emptyOutfit(), top: 'Blouse', bottom: 'Mini skirt', lingerieTop: 'Lace bra', outerwear: 'Blazer', shoes: 'Ankle boots', details: 'a gold zip' }
  // The rows each kind of purpose dresses; every other row is cleared
  const dressed = { everyday: ['top', 'topColor', 'bottom', 'shoes'], adult: ['lingerieTop', 'lingerieTopColor', 'lingerieBottom', 'lingerieBottomColor'] }

  it.each([['general', 'everyday'], ['fitness', 'everyday'], ['faceless', 'adult'], ['glamour', 'adult']] as const)(
    'dresses the subject afresh in %s, clearing every other row and keeping only the typed details',
    (id, kind) => {
      const mode = modeOf(id)
      const state = { ...switchMode(emptyBuilderState(), mode), who: 'woman', age: 'late 20s', outfit: { ...chosen, accessories: ['Anklet', NOT_SET, NOT_SET] as [string, string, string] } }
      for (let seed = 1; seed <= 20; seed++) {
        const { details, accessories, ...rows } = surprise(state, seed, mode).outfit
        const leftOver = Object.entries(rows).filter(([row, item]) => !dressed[kind].includes(row) && item !== NOT_SET)
        expect(leftOver).toEqual([])
        expect(accessories).toEqual([NOT_SET, NOT_SET, NOT_SET])
        expect(details).toBe('a gold zip')
      }
    },
  )
})

describe("each step's own Surprise me", () => {
  it.each(modes.map((mode) => mode.id))('picks again only that step, and nothing clashes, in %s', (id) => {
    const mode = modeOf(id)
    for (let seed = 1; seed <= 15; seed++) {
      const before = surprised(mode, seed)
      for (const step of mode.steps) {
        const after = surpriseStep(before, step, seed * 7919, mode)
        expect(changedFields(before, after).filter((field) => !STEP_FIELDS[step].includes(field))).toEqual([])
        expect(after.subject).toBe('a dancer')
        expect(clashesIn(choicesInPrompt(after, mode)), `${step}, seed ${seed}`).toEqual([])
      }
    }
  })

  it('keeps "Who" once chosen, and picks one when it is not', () => {
    const mode = modeOf('general')
    expect(surpriseStep({ ...emptyBuilderState(), who: 'man' }, 'subject', 3, mode).who).toBe('man')
    expect(['woman', 'man']).toContain(surpriseStep(emptyBuilderState(), 'subject', 3, mode).who)
  })

  it('dresses Faceless in a set that keeps her clothed', () => {
    const faceless = modeOf('faceless')
    for (let seed = 1; seed <= 40; seed++) {
      const state = surpriseStep(surprised(faceless, seed), 'outfit', seed, faceless)
      expect(state.outfit.lingerieTop).not.toBe(NOT_SET)
      expect(buildPrompt(state, faceless).status).toBe('ready')
    }
  })
})

// A lock holds what the step shows; the expression is on Face & hair, though a new pose may pick it again
const HELD_FIELDS: Readonly<Record<StepId, readonly (keyof BuilderState)[]>> = { ...STEP_FIELDS, pose: ['pose', 'explicitAction'] }

describe('a locked step', () => {
  it.each(modes.map((mode) => mode.id))('is left as it is by Surprise me, which fits the rest around it, in %s', (id) => {
    const mode = modeOf(id)
    for (const step of mode.steps) {
      for (let seed = 1; seed <= 10; seed++) {
        const before = toggleLock(surprised(mode, seed), step)
        const after = surprise(before, seed * 104729, mode)
        expect(changedFields(before, after).filter((field) => HELD_FIELDS[step].includes(field)), `${step}, seed ${seed}`).toEqual([])
        expect(clashesIn(choicesInPrompt(after, mode)), `${step}, seed ${seed}`).toEqual([])
      }
    }
  })

  it('is not picked again by its own Surprise me, and unlocks again', () => {
    const mode = modeOf('faceless')
    const locked = toggleLock(surprised(mode, 4), 'outfit')
    expect(surpriseStep(locked, 'outfit', 99, mode)).toBe(locked)
    expect(toggleLock(locked, 'outfit').lockedSteps).toEqual([])
  })
})

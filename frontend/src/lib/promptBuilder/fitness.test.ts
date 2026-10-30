import { describe, expect, it } from 'vitest'
import shippedModes from '../../../../prompt_modes.json'
import type { BuilderModeData } from '../../types'
import { buildPrompt, choicesFor, emptyBuilderState, emptyOutfit, surprise, type BuilderState } from './build'
import { NOT_SET } from './constants'
import { SPICY_POSES, WORKOUTS, fitnessClothing, outfitOptions } from './fitness'
import { parseModes } from './modes'

const { modes } = parseModes(shippedModes as unknown as BuilderModeData[])
const fitness = modes.find((candidate) => candidate.id === 'fitness')!
const state = (patch: Partial<BuilderState>): BuilderState => ({ ...emptyBuilderState(), who: 'woman', age: 'late 20s', mode: 'fitness', ...patch })
const promptOf = (patch: Partial<BuilderState>, style: 'prose' | 'tags' = 'prose') => {
  const result = buildPrompt(state(patch), fitness, style)
  if (result.status !== 'ready') throw new Error(result.status)
  return result.prompt
}
// "Nude lips" is a lipstick shade, not nudity
const NUDITY = /\b(nude(?! lips)|naked|topless|nipples?|bare breasts|lingerie|bra and panties|genitals?)\b/i

describe('the Fitness purpose', () => {
  it('opens on the gym and offers workouts and fitness places', () => {
    expect(fitness.defaults).toMatchObject({ sceneType: 'gym', photoStyle: 'sports editorial' })
    expect(choicesFor('pose', state({}), fitness)).toEqual(expect.arrayContaining(['barbell back squat', 'downward dog', 'pilates reformer', 'jump rope']))
    expect(choicesFor('sceneType', state({}), fitness)).toEqual(expect.arrayContaining(['yoga studio', 'boxing gym', 'running track']))
    expect(choicesFor('sceneType', state({}), fitness)).not.toContain('bedroom')
  })

  it('writes each workout, place and light out in full', () => {
    const prompt = promptOf({ pose: 'barbell back squat', sceneType: 'crossfit box', lightingSetup: 'gym overhead light' })
    expect(prompt).toMatch(/^A fitness photograph/)
    expect(prompt).toContain('the bar resting across the upper back, thighs parallel to the floor')
    expect(prompt).toContain('in a CrossFit box with pull-up rigs')
    expect(prompt).toContain('harsh overhead gym lighting')
    expect(promptOf({ pose: 'tree pose' }, 'tags')).toContain('tree pose')
  })
})

describe('spicy, but never nude', () => {
  it('offers flattering poses and cuts only once "Who" and an adult age are chosen', () => {
    const noAge = state({ age: NOT_SET })
    expect(choicesFor('pose', noAge, fitness)).not.toContain('squat seen from behind')
    expect(outfitOptions('bottom', noAge)).not.toContain('High-cut gym briefs')
    expect(choicesFor('pose', state({}), fitness)).toContain('squat seen from behind')
    expect(outfitOptions('bottom', state({}))).toContain('High-cut gym briefs')
  })

  it('dresses each subject in what suits them', () => {
    expect(fitnessClothing('top', state({ who: 'man' }))).toEqual(expect.arrayContaining(['Stringer tank', 'Deep-cut stringer vest']))
    expect(fitnessClothing('top', state({ who: 'man' }))).not.toContain('Sports bra')
    expect(fitnessClothing('top', state({}))).not.toContain('Stringer tank')
  })

  it('leaves out a spicy cut kept from before once the age is cleared', () => {
    const outfit = { ...emptyOutfit(), bottom: 'Scrunch-butt leggings' }
    expect(promptOf({ outfit })).toContain('scrunch-butt leggings')
    expect(promptOf({ outfit, age: NOT_SET })).not.toContain('scrunch-butt leggings')
  })

  it('writes no nudity or lingerie into any Fitness prompt, spicy choices included', () => {
    for (const pose of Object.keys(SPICY_POSES)) {
      expect(promptOf({ pose, outfit: { ...emptyOutfit(), top: 'Low-cut sports bra', bottom: 'High-cut gym briefs' } })).not.toMatch(NUDITY)
    }
    for (let seed = 1; seed <= 200; seed++) {
      const surprised = surprise(state({}), seed * 7919, fitness)
      const result = buildPrompt(surprised, fitness, 'prose')
      expect(result.status === 'ready' ? result.prompt : '', `seed ${seed}`).not.toMatch(NUDITY)
    }
  })
})

it('dresses a Fitness subject for the gym and picks a workout on Surprise me', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const surprised = surprise(state({}), seed * 104729, fitness)
    expect(fitnessClothing('top', surprised), `seed ${seed}`).toContain(surprised.outfit.top)
    expect([...Object.keys(WORKOUTS), ...(fitness.options.pose ?? [])], `seed ${seed}`).toContain(surprised.pose)
  }
})

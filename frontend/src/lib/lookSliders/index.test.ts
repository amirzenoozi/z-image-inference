import { describe, expect, it } from 'vitest'
import { fastModel, weightSlider } from '../../test/fixtures'
import type { Loadable, ModelInfo, ModelStatusReport } from '../../types'
import { lookOfSpec, lookPhrases, lookStrength, parseStrengths, strengthsToSend, withMoved, withStrength, type LookTraits } from '.'

const hairVolume = { ...weightSlider, id: 'hair-volume', slider: { minimum: -5, maximum: 5, step: 1 } }
const model: ModelInfo = { ...fastModel, addons: [...fastModel.addons, weightSlider, hairVolume] }
const slim: LookTraits = { bodyType: 'slim build', muscles: '', skinTone: 'light', hairLength: 'long' }

const ready = (...ids: string[]): Loadable<ModelStatusReport> => ({
  status: 'settled',
  value: { server_running: true, free_bytes: 1e9, models: Object.fromEntries(ids.map((id) => [id, { status: 'ready' as const, size_bytes: 0 }])) },
})

describe('a slider’s strength', () => {
  it('follows the matching option, mildly, or is 0 with nothing to go on', () => {
    expect(lookStrength('weight', slim)).toBe(-2)
    expect(lookStrength('skin-tone', slim)).toBe(-1)
    expect(lookStrength('hair-length', slim)).toBe(2)
    expect(lookStrength('muscle-tone', slim)).toBe(0)
    expect(lookStrength('hair-volume', slim)).toBe(0)
  })

  it('is the one set while its option still says it', () => {
    expect(lookStrength('weight', { ...slim, strengths: { weight: -3 } })).toBe(-3)
  })

  it('follows an option picked since it was set', () => {
    expect(lookStrength('weight', { ...slim, bodyType: 'curvy figure', strengths: { weight: -3 } })).toBe(2)
  })
})

describe('moving a slider', () => {
  it('sets its strength and picks the nearest option, so the prompt says what the LoRA makes', () => {
    const moved = withStrength(slim, 'weight', 6)
    expect(moved).toMatchObject({ bodyType: 'plus-size figure', strengths: { weight: 6 } })
    expect(lookStrength('weight', moved)).toBe(6)
  })

  it('without a matching option only sets its strength, which adds a phrase far from 0', () => {
    expect(withStrength(slim, 'hair-volume', 4)).toEqual({ ...slim, strengths: { 'hair-volume': 4 } })
    expect(lookPhrases(withMoved(slim, { 'hair-volume': 4 }))).toEqual(['big voluminous hair'])
    expect(lookPhrases(withMoved(slim, { 'hair-volume': -4 }))).toEqual(['sleek flat hair'])
    expect(lookPhrases(withMoved(slim, { 'hair-volume': 1 }))).toEqual([])
  })

  it('applies several moves in turn', () => {
    expect(withMoved(slim, { weight: 3, 'hair-length': -4 })).toMatchObject({ bodyType: 'voluptuous figure', hairLength: 'buzzed' })
  })
})

it('reads a JSON prompt’s look from its fields and its look section', () => {
  const look = lookOfSpec({ version: 1, purpose: 'general', body: { type: 'slim build' }, look: { weight: -3 } })
  expect(lookStrength('weight', look)).toBe(-3)
})

describe('what a render sends', () => {
  it('is every downloaded slider of the model not at 0, kept in its range', () => {
    const strengthOf = (id: string) => ({ weight: 14, 'hair-volume': 0 })[id] ?? 0
    expect(strengthsToSend(model, strengthOf, ready('weight', 'hair-volume'))).toEqual({ weight: 10 })
    expect(strengthsToSend(model, () => 3, ready('hair-volume'))).toEqual({ 'hair-volume': 3 })
  })

  it('is nothing while the download status is still loading', () => {
    expect(strengthsToSend(model, () => 4, { status: 'pending' })).toEqual({})
  })
})

it('keeps only numbers from stored strengths', () => {
  expect(parseStrengths({ weight: 2, skin: 'dark', hair: Number.NaN })).toEqual({ weight: 2 })
  expect(parseStrengths(null)).toEqual({})
})

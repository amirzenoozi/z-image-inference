import { describe, expect, it } from 'vitest'
import { animeModel, catalog, fastModel, historyItem } from '../test/fixtures'
import {
  differsFromDefaults,
  initialSettings,
  loadSettings,
  presetsFor,
  saveSettings,
  settingsFromItem,
  snapSide,
  withModel,
} from './settings'

describe('snapSide', () => {
  it('rounds to the nearest multiple of 16 within the model limit', () => {
    expect(snapSide(1000, catalog.limits, 1216)).toBe(1008)
    expect(snapSide(5000, catalog.limits, 1216)).toBe(1216)
    expect(snapSide(10, catalog.limits, 1216)).toBe(256)
    expect(snapSide(Number.NaN, catalog.limits, 1216)).toBe(256)
  })
})

describe('withModel', () => {
  it('keeps values the new model allows and replaces the ones it does not', () => {
    const settings = { ...initialSettings(catalog), width: 1280, height: 1280, steps: 40 }

    const switched = withModel(settings, fastModel)
    expect([switched.width, switched.height, switched.steps]).toEqual([1280, 1280, 20])

    const anime = withModel(settings, animeModel)
    expect([anime.width, anime.height, anime.steps]).toEqual([1024, 1024, 40])
  })
})

it('presetsFor drops sizes over the model limit', () => {
  expect(presetsFor(animeModel, catalog.resolutions).map((r) => r.width)).not.toContain(1280)
})

it('differsFromDefaults compares only the model-specific settings', () => {
  const settings = initialSettings(catalog)
  expect(differsFromDefaults({ ...settings, prompt: 'changed', seed: 7 }, fastModel)).toBe(false)
  expect(differsFromDefaults({ ...settings, steps: 3 }, fastModel)).toBe(true)
})

it('settingsFromItem restores a history image with its seed fixed', () => {
  const settings = settingsFromItem(historyItem({ model: 'wai-illustrious', guidance: null, seed: 99 }), catalog)
  expect(settings).toMatchObject({ modelId: 'wai-illustrious', seed: 99, randomSeed: false, guidance: 7 })
})

describe('loadSettings', () => {
  it('falls back to defaults when storage is empty or corrupt', () => {
    expect(loadSettings(catalog)).toEqual(initialSettings(catalog))
    localStorage.setItem('z-image-studio.settings.v1', '{not json')
    expect(loadSettings(catalog)).toEqual(initialSettings(catalog))
    localStorage.setItem('z-image-studio.settings.v1', JSON.stringify({ modelId: 'x', steps: 'nine' }))
    expect(loadSettings(catalog)).toEqual(initialSettings(catalog))
  })

  it('restores saved settings and maps an unknown model to the first one', () => {
    const saved = { ...initialSettings(catalog), prompt: 'kept', modelId: 'removed-model' }
    saveSettings(saved)
    expect(loadSettings(catalog)).toMatchObject({ prompt: 'kept', modelId: 'z-image-turbo' })
  })
})

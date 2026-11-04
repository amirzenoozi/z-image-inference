import { beforeEach, describe, expect, it } from 'vitest'
import { builderModes, catalog, fastModel, weightSlider } from '../../test/fixtures'
import type { AddonInfo, GenerationSettings, ModelInfo } from '../../types'
import { parseModes } from '../promptBuilder/modes'
import { parseSpec, specText } from '../promptBuilder/spec'
import { initialSettings } from '../settings'
import {
  currentValue, loadTest, lockedBuilderFields, saveTest, sliderLocked, startTest, testProblem, testVersions, testableChoices, valuesProblem,
  type AbTest,
} from '.'

const { modes } = parseModes(builderModes)
const skinSlider: AddonInfo = { ...weightSlider, id: 'skin-tone', label: 'Skin tone', slider: { minimum: -3, maximum: 3, step: 1 } }
const model: ModelInfo = { ...fastModel, addons: [...fastModel.addons, weightSlider, skinSlider] }
const typed: GenerationSettings = { ...initialSettings(catalog), prompt: 'a woman in a garden', seed: 42, randomSeed: false }
const built: GenerationSettings = {
  ...typed,
  promptFormat: 'json',
  prompt: specText({ version: 1, purpose: 'general', subject: { who: 'woman', age: 'late 20s' }, body: { type: 'slim build' }, camera: { angle: 'eye level' } }),
}
const weightAndSkin: AbTest = { settings: [{ kind: 'slider', addonId: 'weight' }, { kind: 'slider', addonId: 'skin-tone' }], versions: [[-4, -2], [6, 2]] }
const weightAndAngle: AbTest = {
  settings: [{ kind: 'slider', addonId: 'weight' }, { kind: 'choice', field: 'cameraAngle' }],
  versions: [[-4, 'eye level'], [6, 'slightly low angle']],
}

const specOf = (settings: GenerationSettings) => {
  const parsed = parseSpec(settings.prompt)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.spec
}

describe('the images a test makes', () => {
  it('try each version’s slider strengths together on a typed prompt, on one seed, labelled with the combination', () => {
    const versions = testVersions({ ...typed, randomSeed: true }, weightAndSkin, model, modes)
    expect(versions.map((version) => version.settings.strengths)).toEqual([{ weight: -4, 'skin-tone': -2 }, { weight: 6, 'skin-tone': 2 }])
    expect(versions.every((version) => version.settings.randomSeed === false && version.settings.seed === 42)).toBe(true)
    expect(versions.map((version) => version.label)).toEqual(['Weight -4 · Skin tone -2', 'Weight 6 · Skin tone 2'])
  })

  it('combine a slider and a choice in a JSON prompt, the slider picking its linked choice', () => {
    const [, second] = testVersions(built, weightAndAngle, model, modes)
    expect(specOf(second.settings)).toMatchObject({ look: { weight: 6 }, body: { type: 'plus-size figure' }, camera: { angle: 'slightly low angle' }, subject: { who: 'woman' } })
    expect(second.label).toBe('Weight 6 · Camera angle: Slightly low angle')
  })
})

it('fixes the seed when a test starts, picking one if each render had its own, and puts version A in the prompt', () => {
  const started = startTest({ ...built, randomSeed: true }, { ...weightAndAngle, versions: [[2, 'slightly low angle'], [6, 'eye level']] }, modes, () => 7)
  expect([started.seed, started.randomSeed]).toEqual([7, false])
  expect(specOf(started)).toMatchObject({ look: { weight: 2 }, camera: { angle: 'slightly low angle' } })
})

it('starts a newly added setting at what the prompt has for it', () => {
  expect(currentValue({ kind: 'choice', field: 'cameraAngle' }, built, modes)).toBe('eye level')
  expect(currentValue({ kind: 'slider', addonId: 'weight' }, built, modes)).toBe(-2)
  expect(currentValue({ kind: 'slider', addonId: 'weight' }, { ...typed, strengths: { weight: 3 } }, modes)).toBe(3)
})

describe('a test that can’t run', () => {
  it('needs every slider downloaded for the model', () => {
    expect(testProblem(weightAndSkin, typed, [weightSlider, skinSlider], modes)).toBeNull()
    expect(testProblem(weightAndSkin, typed, [weightSlider], modes)).toMatch(/slider/)
  })

  it('needs a prompt from the builder for a choice, in a purpose that shows it', () => {
    expect(testProblem(weightAndAngle, built, [weightSlider], modes)).toBeNull()
    expect(testProblem(weightAndAngle, typed, [weightSlider], modes)).toMatch(/prompt builder/)
    const pose: AbTest = { settings: [{ kind: 'choice', field: 'pose' }], versions: [['standing'], ['sitting']] }
    const portrait = { ...built, prompt: specText({ ...specOf(built), purpose: 'portrait', body: undefined }) }
    expect(testProblem(pose, portrait, [], modes)).toMatch(/Pose/)
  })

  it('needs each version to differ as a whole, with every choice set', () => {
    expect(valuesProblem({ ...weightAndSkin, versions: [[6, -2], [6, 2]] })).toBeNull()
    expect(valuesProblem({ ...weightAndSkin, versions: [[6, 2], [6, 2]] })).not.toBeNull()
    expect(valuesProblem({ ...weightAndAngle, versions: [[2, 'eye level'], [4, '']] })).not.toBeNull()
  })
})

it('offers the choices of the purpose’s steps', () => {
  const portrait = modes.find((mode) => mode.id === 'portrait')
  expect(portrait && testableChoices(portrait)).toEqual(expect.arrayContaining(['sceneType', 'cameraAngle', 'colorGrading']))
  expect(portrait && testableChoices(portrait)).not.toContain('pose')
})

it('locks who the subject is and every setting it compares, with the choice a slider is linked to', () => {
  const locked = lockedBuilderFields(weightAndAngle)
  expect([...locked]).toEqual(expect.arrayContaining(['who', 'age', 'cameraAngle', 'bodyType']))
  expect(sliderLocked(locked, 'weight')).toBe(true)
  expect(sliderLocked(locked, 'skin-tone')).toBe(false)
  expect(lockedBuilderFields(null).size).toBe(0)
})

describe('the saved test', () => {
  beforeEach(() => localStorage.clear())

  it('comes back after a reload, and is gone once left', () => {
    saveTest(weightAndAngle)
    expect(loadTest()).toEqual(weightAndAngle)
    saveTest(null)
    expect(loadTest()).toBeNull()
  })

  it('converts one saved before several settings could be compared', () => {
    localStorage.setItem('z-image-studio.ab-test.v1', JSON.stringify({ kind: 'slider', addonId: 'weight', values: [-4, 6] }))
    expect(loadTest()).toEqual({ settings: [{ kind: 'slider', addonId: 'weight' }], versions: [[-4], [6]] })
    expect(localStorage.getItem('z-image-studio.ab-test.v1')).toBeNull()
  })

  it('is dropped when stored in a shape it can’t use', () => {
    localStorage.setItem('z-image-studio.ab-test.v2', JSON.stringify({ settings: [{ kind: 'choice', field: 'who' }], versions: [['woman'], ['man']] }))
    expect(loadTest()).toBeNull()
    localStorage.setItem('z-image-studio.ab-test.v2', JSON.stringify({ ...weightAndSkin, versions: [[-4, 'dark'], [6, 2]] }))
    expect(loadTest()).toBeNull()
  })
})

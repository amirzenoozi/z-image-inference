import { afterEach, describe, expect, it } from 'vitest'
import { loadLanguage, optionTitle } from '../../i18n'
import { builderModes } from '../../test/fixtures'
import type { CustomGarmentData } from '../../types'
import { buildPrompt, emptyBuilderState, emptyOutfit, surprise, switchMode, type BuilderState } from '../promptBuilder/build'
import { NOT_SET } from '../promptBuilder/constants'
import { customClothesProblems } from '../promptBuilder/customClothes'
import { intimateSet } from '../promptBuilder/intimates'
import { parseModes } from '../promptBuilder/modes'
import { areaGroups, wearItem } from '../promptBuilder/outfitMenu'
import { parseSpec, specFromState, specText } from '../promptBuilder/spec'
import { applyCustomClothes } from '.'

const { modes } = parseModes(builderModes)
const modeOf = (id: string) => modes.find((mode) => mode.id === id)!
const woman = { who: 'woman', age: 'late 20s' }

const dress: CustomGarmentData = {
  value: 'Lace keyhole mini dress', title: { en: 'Lace keyhole mini dress', nl: 'Kanten minijurk met sleutelgat' },
  prompt: 'sleeveless lace mini dress with a deep keyhole cut-out', tags: 'lace mini dress, keyhole cutout', slot: 'top', covers: 'both',
  group: 'Dresses', for: 'woman', adult: false,
}
const teddy: CustomGarmentData = {
  value: 'Satin cut-out teddy', title: 'Satin cut-out teddy', prompt: 'satin teddy with cut-outs at the waist', tags: '', slot: 'top', covers: 'both',
  group: 'Lingerie', for: 'woman', adult: true,
}
const apply = (custom_clothes: CustomGarmentData[], custom_clothes_problems: string[] = []) => applyCustomClothes({ custom_clothes, custom_clothes_problems })

afterEach(async () => {
  apply([])
  await loadLanguage('en')
})

const groups = (id: string, who = woman) => areaGroups('top', who, modeOf(id)).map((group) => [group.label, group.options.filter((item) => item === dress.value || item === teddy.value)])
const state = (id: string, patch: Partial<BuilderState> = {}): BuilderState => ({ ...switchMode(emptyBuilderState(), modeOf(id)), ...woman, ...patch })

describe('custom clothes', () => {
  it('appear in their own group for who they are for, with their title in the language shown', async () => {
    apply([dress])
    expect(groups('general')).toContainEqual(['Dresses', [dress.value]])
    expect(groups('general', { who: 'man', age: 'late 20s' }).map(([label]) => label)).not.toContain('Dresses')
    await loadLanguage('nl')
    expect(optionTitle(dress.value)).toBe('Kanten minijurk met sleutelgat')
  })

  it('cover the bottom when worn as a dress, and are written in full with their colour', () => {
    apply([dress])
    const outfit = { ...emptyOutfit(), top: 'Blouse', bottom: 'Mini skirt', bottomColor: 'red' }
    const dressed = { ...outfit, ...wearItem('top', outfit, dress.value, modeOf('faceless')), topColor: 'black' }
    expect(dressed).toMatchObject({ top: dress.value, bottom: NOT_SET, bottomColor: NOT_SET })
    const faceless = buildPrompt(state('faceless', { outfit: dressed }), modeOf('faceless'))
    expect(faceless.status === 'ready' && faceless.prompt).toContain('She is wearing a black sleeveless lace mini dress with a deep keyhole cut-out.')
    const tags = buildPrompt(state('general', { outfit: dressed }), modeOf('general'), 'tags')
    expect(tags.status === 'ready' && tags.prompt).toContain('black lace mini dress, keyhole cutout')
  })

  it('keep an adult item to the 18+ purposes as lingerie, and Surprise me never adds a bottom under it', () => {
    apply([dress, teddy])
    expect(groups('faceless')).toContainEqual(['Lingerie', [teddy.value]])
    expect(groups('fitness').flatMap(([, items]) => items)).not.toContain(teddy.value)
    expect(wearItem('top', emptyOutfit(), teddy.value, modeOf('faceless'))).toMatchObject({ lingerieTop: teddy.value, top: NOT_SET })
    for (let seed = 1; seed <= 300; seed++) {
      const set = intimateSet(woman, modeOf('faceless'), seed)
      if (set.lingerieTop === teddy.value) expect(set.lingerieBottom).toBe(NOT_SET)
    }
  })

  it('are dressed by Surprise me without a bottom under a dress, and kept by the JSON prompt', () => {
    apply([dress])
    for (let seed = 1; seed <= 300; seed++) {
      const { outfit } = surprise(state('general'), seed, modeOf('general'))
      if (outfit.top === dress.value) expect(outfit.bottom).toBe(NOT_SET)
    }
    const spec = specFromState(state('general', { outfit: { ...emptyOutfit(), top: dress.value } }), modeOf('general'))
    expect(parseSpec(specText(spec))).toMatchObject({ ok: true })
  })

  it('leave out an entry named like a built-in option or suggesting a minor, and name why with the server’s problems', () => {
    apply([{ ...dress, value: 'Blouse' }, { ...dress, value: 'School dress', prompt: 'a schoolgirl dress' }], ['entry 3 was left out'])
    expect(groups('general').flatMap(([, items]) => items)).toEqual([])
    expect(customClothesProblems()).toEqual([
      'entry 3 was left out',
      'custom_clothes.json: “Blouse” is already a built-in option, so it was left out; give it a name of its own.',
      'custom_clothes.json: “School dress” was left out, since “schoolgirl” suggests a minor.',
    ])
  })
})

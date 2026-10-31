import { describe, expect, it } from 'vitest'
import { builderModes } from '../../test/fixtures'
import { buildPrompt, emptyBuilderState, emptyOutfit, switchMode, type OutfitState } from './build'
import { NOT_SET, RANDOM } from './constants'
import { parseModes } from './modes'
import { areaChoice, areaGroups, colourItem, wearItem } from './outfitMenu'

const { modes } = parseModes(builderModes)
const modeOf = (id: string) => modes.find((mode) => mode.id === id)!
const woman = { who: 'woman', age: 'late 20s' }
const labels = (id: string, who = woman) => areaGroups('top', who, modeOf(id)).map((group) => group.label)

describe('the Top and Bottom menus', () => {
  it('hold every kind of top, lingerie and swimwear only outside the safe purposes, and first in Faceless', () => {
    expect(labels('general')).toEqual(['builder.groupEveryday', 'builder.groupGym', 'builder.groupLingerie', 'builder.groupSwimwear'])
    expect(labels('fitness')).toEqual(['builder.groupEveryday', 'builder.groupGym'])
    expect(labels('faceless')).toEqual(['builder.groupLingerie', 'builder.groupSwimwear', 'builder.groupEveryday', 'builder.groupGym'])
    // A man's lingerie group holds the men's tops; the swimwear tops are cut for women
    expect(labels('faceless', { who: 'man', age: 'late 20s' })).toEqual(['builder.groupLingerie', 'builder.groupEveryday', 'builder.groupGym'])
  })

  it('wear one item at a time, keeping the colour chosen', () => {
    const faceless = modeOf('faceless')
    let outfit: OutfitState = { ...emptyOutfit(), top: 'Blouse', topColor: 'black' }
    outfit = { ...outfit, ...wearItem('top', outfit, 'Lace bra', faceless) }
    expect(outfit).toMatchObject({ top: NOT_SET, topColor: NOT_SET, lingerieTop: 'Lace bra', lingerieTopColor: 'black' })
    outfit = { ...outfit, ...colourItem('top', outfit, 'red') }
    expect(areaChoice('top', outfit)).toEqual({ item: 'Lace bra', color: 'red' })
    outfit = { ...outfit, ...wearItem('top', outfit, 'Blouse', faceless) }
    expect(outfit).toMatchObject({ top: 'Blouse', topColor: 'red', lingerieTop: NOT_SET, lingerieTopColor: NOT_SET })

    const state = { ...switchMode(emptyBuilderState(), faceless), ...woman, outfit }
    const result = buildPrompt(state, faceless)
    expect(result.status === 'ready' && result.prompt).toContain('She is wearing a red blouse.')
  })

  it('pick lingerie or swimwear at random in an 18+ purpose, and clothes elsewhere', () => {
    expect(wearItem('bottom', emptyOutfit(), RANDOM, modeOf('faceless'))).toMatchObject({ lingerieBottom: RANDOM, bottom: NOT_SET })
    expect(wearItem('bottom', emptyOutfit(), RANDOM, modeOf('general'))).toMatchObject({ bottom: RANDOM, lingerieBottom: NOT_SET })
  })

  it('show the lingerie of choices saved with both, which the prompt still writes until one is chosen', () => {
    expect(areaChoice('top', { ...emptyOutfit(), top: 'Blouse', lingerieTop: 'Lace bra' }).item).toBe('Lace bra')
  })
})

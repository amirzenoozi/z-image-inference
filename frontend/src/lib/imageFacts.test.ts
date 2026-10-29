import { expect, it } from 'vitest'
import { historyItem } from '../test/fixtures'
import { imageFacts } from './imageFacts'

it('names the add-ons an image used right after its model', () => {
  expect(imageFacts(historyItem({ addons: ['tattoo'], guidance: 3.5 }), 'Z-Image-Turbo')).toEqual(['Z-Image-Turbo', '+ Tattoo', '512×512', '9 steps', 'CFG 3.5', 'seed 42', '52s'])
  expect(imageFacts(historyItem(), 'Z-Image-Turbo')[1]).toBe('512×512')
})

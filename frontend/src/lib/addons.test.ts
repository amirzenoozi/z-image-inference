import { describe, expect, it } from 'vitest'
import { animeModel, fastModel } from '../test/fixtures'
import type { Loadable, ModelStatusReport } from '../types'
import { addonsToSend, withAddon } from './addons'

const report = (tattoo: 'ready' | 'missing'): Loadable<ModelStatusReport> => ({
  status: 'settled',
  value: { server_running: true, free_bytes: null, models: { tattoo: { status: tattoo, size_bytes: 0 } } },
})

describe('addonsToSend', () => {
  it('sends the switched-on add-ons of the chosen model that are downloaded', () => {
    expect(addonsToSend(fastModel, ['tattoo'], report('ready'))).toEqual(['tattoo'])
    expect(addonsToSend(fastModel, ['tattoo'], report('missing'))).toEqual([])
    expect(addonsToSend(fastModel, [], report('ready'))).toEqual([])
    expect(addonsToSend(animeModel, ['tattoo'], report('ready'))).toEqual([])
  })

  it('sends them while the download status is still loading, leaving the server to explain a missing one', () => {
    expect(addonsToSend(fastModel, ['tattoo'], { status: 'pending' })).toEqual(['tattoo'])
  })
})

it('switches one add-on on or off, keeping the others', () => {
  expect(withAddon(['other'], 'tattoo', true)).toEqual(['other', 'tattoo'])
  expect(withAddon(['other', 'tattoo'], 'tattoo', false)).toEqual(['other'])
})

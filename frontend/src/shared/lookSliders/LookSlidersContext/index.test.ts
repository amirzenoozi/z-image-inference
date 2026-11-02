import { expect, it } from 'vitest'
import { animeModel, catalog, fastModel, weightSlider } from '../../../test/fixtures'
import type { Catalog } from '../../../types'
import { downloadedSliders, slidersOf } from '.'

const withSlider: Catalog = { ...catalog, models: [{ ...fastModel, addons: [...fastModel.addons, weightSlider] }, animeModel] }

it('offers only downloaded sliders, and none while the download status is loading', () => {
  const ready = { status: 'settled' as const, value: { server_running: true, free_bytes: 1, models: { weight: { status: 'ready' as const, size_bytes: 0 }, tattoo: { status: 'ready' as const, size_bytes: 0 } } } }
  expect(downloadedSliders(withSlider, ready).map((addon) => addon.id)).toEqual(['weight'])
  expect(downloadedSliders(withSlider, { status: 'pending' })).toEqual([])
})

it('keeps a model’s own sliders, so the builder offers them only for that model', () => {
  expect(slidersOf([weightSlider], withSlider.models[0])).toEqual([weightSlider])
  expect(slidersOf([weightSlider], animeModel)).toEqual([])
})

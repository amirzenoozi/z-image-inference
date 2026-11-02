import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../../../../../api'
import { CharactersContext } from '../../../../../lib/characters'
import { character, fastModel, weightSlider } from '../../../../../test/fixtures'
import type { Character, Loadable, ModelInfo, ModelStatusReport, PromptFormat } from '../../../../../types'
import { LookSliders } from '.'

vi.mock('../../../../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../../../api')>()), updateCharacter: vi.fn() }))

const model: ModelInfo = { ...fastModel, addons: [...fastModel.addons, weightSlider] }
const mei = character({ id: 7, name: 'Mei', traits: { ...character().traits, bodyType: 'slim build' } })
const weightIs = (status: 'ready' | 'missing'): Loadable<ModelStatusReport> => ({
  status: 'settled',
  value: { server_running: true, free_bytes: 1e9, models: { weight: { status, size_bytes: 0 } } },
})

function renderSliders({ characters = { status: 'settled', value: [mei] } as Loadable<Character[]>, moved = {}, status = weightIs('ready'), characterId = mei.id as number | null, promptFormat = 'text' as PromptFormat } = {}) {
  const onChange = vi.fn()
  const reload = vi.fn()
  const { container } = render(
    <CharactersContext.Provider value={{ characters, reload }}>
      <LookSliders model={model} characterId={characterId} promptFormat={promptFormat} moved={moved} status={status} onChange={onChange} />
    </CharactersContext.Provider>,
  )
  return { onChange, reload, container }
}

beforeEach(() => vi.mocked(api.updateCharacter).mockReset())

it('starts each downloaded slider at the character’s default', () => {
  renderSliders()
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toHaveValue('-2')
  expect(screen.getByText(/start at Mei’s look|start at Mei's look/)).toBeInTheDocument()
})

it('changes only this render when a slider moves', () => {
  const { onChange } = renderSliders()
  fireEvent.change(screen.getByRole('slider', { name: 'Weight slider' }), { target: { value: '4' } })
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ weight: 4 })
  expect(api.updateCharacter).not.toHaveBeenCalled()
})

it('shows a placeholder, not the defaults, while the characters are loading', () => {
  renderSliders({ characters: { status: 'pending' } })
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
})

it.each([
  ['the slider is not downloaded', { status: weightIs('missing') }],
  ['the download status is still loading', { status: { status: 'pending' } as const }],
  ['the prompt comes from the prompt builder, which has its own sliders', { promptFormat: 'json' as const }],
])('shows nothing while %s', (_, overrides) => {
  const { container } = renderSliders(overrides)
  expect(container).toBeEmptyDOMElement()
})

it('saves the moved values as the character’s new defaults once, then follows them', async () => {
  vi.mocked(api.updateCharacter).mockResolvedValue(mei)
  const { onChange, reload } = renderSliders({ moved: { weight: 3 } })
  await userEvent.click(screen.getByRole('button', { name: /Mei/ }))
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({}))
  // The matching option changes with it, so the character's look says what the slider makes
  expect(api.updateCharacter).toHaveBeenCalledExactlyOnceWith(7, { traits: { ...mei.traits, bodyType: 'voluptuous figure', strengths: { weight: 3 } } })
  expect(reload).toHaveBeenCalledTimes(1)
})

it('offers a retry when saving the defaults fails', async () => {
  vi.mocked(api.updateCharacter).mockRejectedValueOnce(new Error('Could not reach the app server'))
  const { onChange } = renderSliders({ moved: { weight: 3 } })
  await userEvent.click(screen.getByRole('button', { name: /Mei/ }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
})

it('can’t save or reset before a slider moves, and has no save without a character', () => {
  renderSliders()
  expect(screen.getByRole('button', { name: /Mei/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
})

it('starts every slider at 0 with no character', () => {
  renderSliders({ characterId: null })
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toHaveValue('0')
  expect(screen.queryByRole('button', { name: /Mei/ })).not.toBeInTheDocument()
})

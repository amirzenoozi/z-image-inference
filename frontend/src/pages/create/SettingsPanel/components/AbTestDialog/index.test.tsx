import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { builderModes, catalog, fastModel, weightSlider } from '../../../../../test/fixtures'
import { chooseOption } from '../../../../../test/select'
import { parseModes } from '../../../../../lib/promptBuilder/modes'
import { specText } from '../../../../../lib/promptBuilder/spec'
import { initialSettings } from '../../../../../lib/settings'
import type { AbTest } from '../../../../../lib/abTest'
import type { AddonInfo, GenerationSettings } from '../../../../../types'
import { AbTestDialog } from '.'

const { modes } = parseModes(builderModes)
const skinSlider: AddonInfo = { ...weightSlider, id: 'skin-tone', label: 'Skin tone', slider: { minimum: -3, maximum: 3, step: 1 } }
const model = { ...fastModel, addons: [...fastModel.addons, weightSlider, skinSlider] }
const typed: GenerationSettings = { ...initialSettings(catalog), prompt: 'a woman' }
const built: GenerationSettings = {
  ...typed, promptFormat: 'json', prompt: specText({ version: 1, purpose: 'general', subject: { who: 'woman', age: 'late 20s' }, camera: { angle: 'eye level' } }),
}

function renderDialog({ settings = typed, sliders = [weightSlider, skinSlider], test = null as AbTest | null } = {}) {
  const onSave = vi.fn()
  render(<AbTestDialog settings={settings} model={model} modes={modes} sliders={sliders} test={test} onSave={onSave} onClose={vi.fn()} />)
  return onSave
}

const addSetting = (name: string) => chooseOption(screen.getByRole('button', { name: /Add a setting/ }), name)
const version = (letter: string) => screen.getByRole('region', { name: `Version ${letter}` })
const slide = (name: string, value: number) => fireEvent.change(screen.getByRole('slider', { name: `${name} slider` }), { target: { value: String(value) } })

it('compares two sliders together, one version per image', async () => {
  const onSave = renderDialog()
  await addSetting('Weight')
  await addSetting('Skin tone')
  expect(screen.getByText('Make each version different from the others, and set every choice.')).toBeInTheDocument()
  slide('Weight (B)', 6)
  slide('Skin tone (B)', 2)
  await userEvent.click(screen.getByRole('button', { name: 'Start test' }))
  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    settings: [{ kind: 'slider', addonId: 'weight' }, { kind: 'slider', addonId: 'skin-tone' }],
    versions: [[0, 0], [6, 2]],
  })
})

it('keeps the values already set when a setting is added or removed', async () => {
  renderDialog({ settings: built, sliders: [weightSlider] })
  await addSetting('Weight')
  slide('Weight (B)', 6)
  await addSetting('Camera angle')
  expect(within(version('B')).getByRole('slider', { name: 'Weight (B) slider' })).toHaveValue('6')
  await chooseOption(within(version('B')).getByRole('button', { name: /Camera angle \(B\)/ }), 'Slightly low angle')
  await userEvent.click(screen.getByRole('button', { name: 'Remove Camera angle' }))
  expect(screen.getByRole('slider', { name: 'Weight (B) slider' })).toHaveValue('6')
  expect(screen.queryByRole('button', { name: /Camera angle \(B\)/ })).not.toBeInTheDocument()
})

it('offers a builder choice without Random only for a prompt from the builder', async () => {
  renderDialog({ settings: built, sliders: [] })
  await addSetting('Camera angle')
  await userEvent.click(within(version('A')).getByRole('button', { name: /Camera angle \(A\)/ }))
  expect(screen.queryByRole('option', { name: 'Random' })).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
})

it('adds versions up to six and removes them down to two', async () => {
  renderDialog()
  await addSetting('Weight')
  for (let added = 0; added < 4; added += 1) await userEvent.click(screen.getByRole('button', { name: 'Add a version' }))
  expect(screen.queryByRole('button', { name: 'Add a version' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Version F' })).toBeInTheDocument()
  for (const letter of ['F', 'E', 'D', 'C']) await userEvent.click(screen.getByRole('button', { name: `Remove version ${letter}` }))
  expect(screen.queryByRole('button', { name: /Remove version/ })).not.toBeInTheDocument()
})

it('says there is nothing to compare without a slider or a prompt from the builder', () => {
  renderDialog({ sliders: [] })
  expect(screen.getByText(/There is nothing to compare yet/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Start test' })).toBeDisabled()
})

it('edits a running test’s settings and versions', () => {
  renderDialog({ test: { settings: [{ kind: 'slider', addonId: 'weight' }], versions: [[-4], [6]] } })
  expect(screen.getByRole('slider', { name: 'Weight (B) slider' })).toHaveValue('6')
  expect(screen.getByRole('button', { name: 'Save values' })).toBeEnabled()
})

it('groups the settings to add under Look and the builder’s steps, leaving out those already added', async () => {
  renderDialog({ settings: built, sliders: [weightSlider, skinSlider] })
  await addSetting('Weight')
  await userEvent.click(screen.getByRole('button', { name: /Add a setting/ }))
  const groups = within(screen.getByRole('listbox')).getAllByRole('group').map((group) => group.getAttribute('aria-label'))
  expect(groups).toEqual(['Look', 'Pose & action', 'Scene & light', 'Camera', 'Mood & finish'])
  expect(screen.queryByRole('option', { name: 'Weight' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Skin tone' })).toBeInTheDocument()
})

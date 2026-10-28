import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { controlHeight } from '../../lib/styles'
import { Checkbox } from './Checkbox'
import { NumberInput } from './NumberInput'
import { SearchInput } from './SearchInput'
import { Select } from './Select'
import { Switch } from './Switch'
import { TextInput } from './TextInput'

const groups = [
  { options: [{ value: '', label: 'Not set' }] },
  { label: 'Colours', options: [{ value: 'red', label: 'Red' }, { value: 'green', label: 'Green' }, { value: 'blue', label: 'Blue' }] },
]

function ControlledSelect({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <Select
      label="Colour"
      value={value}
      groups={groups}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

it('gives every single-line field the same height', () => {
  render(
    <>
      <TextInput aria-label="Name" />
      <SearchInput label="Search" value="" onChange={() => {}} />
      <NumberInput label="Steps" value={9} min={1} max={20} onChange={() => {}} />
      <Select label="Colour" value="" groups={groups} onChange={() => {}} />
    </>,
  )
  const frames = [
    screen.getByLabelText('Name').parentElement,
    screen.getByLabelText('Search').parentElement,
    screen.getByLabelText('Steps').parentElement,
    screen.getByRole('button', { name: /Colour/ }),
  ]
  for (const frame of frames) expect(frame).toHaveClass(controlHeight)
})

it('steps a number with − and +, stopping at its limits', async () => {
  const onChange = vi.fn()
  const { rerender } = render(<NumberInput label="Steps" value={19} min={1} max={20} onChange={onChange} />)

  await userEvent.click(screen.getByRole('button', { name: 'Increase Steps' }))
  expect(onChange).toHaveBeenLastCalledWith('20')

  rerender(<NumberInput label="Steps" value={20} min={1} max={20} onChange={onChange} />)
  expect(screen.getByRole('button', { name: 'Increase Steps' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Decrease Steps' })).toBeEnabled()
})

it('steps decimals without floating-point noise, and reports steps separately when asked', async () => {
  const onStep = vi.fn()
  render(<NumberInput label="Guidance" value={6.9} min={0} max={20} step={0.1} onChange={() => {}} onStep={onStep} />)

  await userEvent.click(screen.getByRole('button', { name: 'Increase Guidance' }))

  expect(onStep).toHaveBeenCalledWith(7)
})

it('disables the number field and its buttons together', () => {
  render(<NumberInput label="Seed" value={5} min={0} max={10} disabled onChange={() => {}} />)
  expect(screen.getByLabelText('Seed')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Increase Seed' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Decrease Seed' })).toBeDisabled()
})

it('picks a Select option with the mouse, showing group headings and the chosen value', async () => {
  const onChange = vi.fn()
  render(<ControlledSelect onChange={onChange} />)

  await userEvent.click(screen.getByRole('button', { name: /Colour/ }))
  expect(screen.getByRole('group', { name: 'Colours' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('option', { name: 'Green' }))

  expect(onChange).toHaveBeenCalledWith('green')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Colour/ })).toHaveTextContent('Green')
})

it('picks a Select option with the keyboard, and Escape closes it without a change', async () => {
  const onChange = vi.fn()
  render(<ControlledSelect onChange={onChange} />)
  const button = screen.getByRole('button', { name: /Colour/ })

  button.focus()
  await userEvent.keyboard(' ')
  expect(await screen.findByRole('listbox')).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  expect(onChange).not.toHaveBeenCalled()

  await userEvent.keyboard('{ArrowDown}')
  await screen.findByRole('listbox')
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
  expect(onChange).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenCalledWith('green')
})

it('clears a search with its own button', async () => {
  const onChange = vi.fn()
  const { rerender } = render(<SearchInput label="Search" value="" onChange={onChange} />)
  expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

  rerender(<SearchInput label="Search" value="fox" onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

  expect(onChange).toHaveBeenCalledWith('')
})

it('keeps the real checkbox and switch underneath for keyboards and screen readers', async () => {
  const onCheck = vi.fn()
  const onSwitch = vi.fn()
  render(
    <>
      <label>
        <Checkbox checked={false} onChange={(event) => onCheck(event.target.checked)} /> Random each time
      </label>
      <label>
        <Switch checked={false} onChange={(event) => onSwitch(event.target.checked)} /> Explicit
      </label>
    </>,
  )

  await userEvent.click(screen.getByRole('checkbox', { name: 'Random each time' }))
  screen.getByRole('switch', { name: 'Explicit' }).focus()
  await userEvent.keyboard(' ')

  expect(onCheck).toHaveBeenCalledWith(true)
  expect(onSwitch).toHaveBeenCalledWith(true)
})

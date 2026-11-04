import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { emptyBuilderState, type BuilderState } from '../../../lib/promptBuilder/build'
import { parseModes } from '../../../lib/promptBuilder/modes'
import { builderModes, character, weightSlider } from '../../../test/fixtures'
import { chooseOption } from '../../../test/select'
import { LookSlidersContext } from '../../lookSliders/LookSlidersContext'
import type { AbTest } from '../../../lib/abTest'
import { AbTestContext } from '../../abTest/AbTestContext'
import { BodyStep, CameraStep, CharacterLookSliders } from '.'

const mode = parseModes(builderModes).modes.find((each) => each.id === 'general')!

function Body({ initial, onState }: { initial: BuilderState; onState: (state: BuilderState) => void }) {
  const [state, setState] = useState(initial)
  const set = (patch: Partial<BuilderState>) => setState((current) => {
    const next = { ...current, ...patch }
    onState(next)
    return next
  })
  return <BodyStep state={state} mode={mode} set={set} setOutfit={vi.fn()} />
}

function renderBody(sliders = [weightSlider]) {
  const onState = vi.fn()
  render(
    <LookSlidersContext.Provider value={sliders}>
      <Body initial={{ ...emptyBuilderState(), who: 'woman', age: 'late 20s', bodyType: 'slim build' }} onState={onState} />
    </LookSlidersContext.Provider>,
  )
  return onState
}

it('puts a downloaded look slider beside its choice, starting at what the choice says', () => {
  renderBody()
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toHaveValue('-2')
})

it('picks the nearest option when the slider moves', () => {
  const onState = renderBody()
  fireEvent.change(screen.getByRole('slider', { name: 'Weight slider' }), { target: { value: '5' } })
  expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ bodyType: 'plus-size figure', strengths: { weight: 5 } }))
})

it('moves the slider when an option is picked', async () => {
  renderBody()
  await chooseOption(screen.getByLabelText('Body type'), 'Curvy figure')
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toHaveValue('2')
})

it('has no slider when it is not downloaded', () => {
  renderBody([])
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
})

it('with a character, moves a slider for this prompt only', () => {
  const set = vi.fn()
  const look = { ...emptyBuilderState(), bodyType: 'slim build' }
  render(
    <LookSlidersContext.Provider value={[weightSlider]}>
      <CharacterLookSliders state={look} set={set} character={character({ traits: { ...character().traits, bodyType: 'slim build' } })} />
    </LookSlidersContext.Provider>,
  )
  fireEvent.change(screen.getByRole('slider', { name: 'Weight slider' }), { target: { value: '3' } })
  expect(set).toHaveBeenCalledExactlyOnceWith({ lookMoved: { weight: 3 } })
})

it('resets a moved slider back to what its choice says', async () => {
  const onState = renderBody()
  fireEvent.change(screen.getByRole('slider', { name: 'Weight slider' }), { target: { value: '-4' } })
  await userEvent.click(screen.getByRole('button', { name: 'Reset Weight' }))
  expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ bodyType: 'slim build', strengths: {} }))
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toHaveValue('-2')
})

it('turns off, during an A/B test, the slider it compares and the choice linked to it', () => {
  const test: AbTest = { settings: [{ kind: 'slider', addonId: 'weight' }], versions: [[-4], [6]] }
  render(
    <AbTestContext.Provider value={test}>
      <LookSlidersContext.Provider value={[weightSlider]}>
        <Body initial={{ ...emptyBuilderState(), who: 'woman', age: 'late 20s', bodyType: 'slim build' }} onState={vi.fn()} />
      </LookSlidersContext.Provider>
    </AbTestContext.Provider>,
  )
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /Body type/ })).toBeDisabled()
})

it('turns off, during an A/B test, the choice it compares and Random in the others', async () => {
  const test: AbTest = { settings: [{ kind: 'choice', field: 'cameraAngle' }], versions: [['eye level'], ['slightly low angle']] }
  render(
    <AbTestContext.Provider value={test}>
      <CameraStep state={{ ...emptyBuilderState(), who: 'woman', age: 'late 20s' }} mode={mode} set={vi.fn()} setOutfit={vi.fn()} />
    </AbTestContext.Provider>,
  )
  expect(screen.getByRole('button', { name: /Camera angle/ })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /Shot type/ }))
  expect(screen.queryByRole('option', { name: 'Random' })).not.toBeInTheDocument()
})

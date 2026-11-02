import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { emptyBuilderState, type BuilderState } from '../../../lib/promptBuilder/build'
import { parseModes } from '../../../lib/promptBuilder/modes'
import { builderModes, weightSlider } from '../../../test/fixtures'
import { chooseOption } from '../../../test/select'
import { LookSlidersContext } from '../../lookSliders/LookSlidersContext'
import { BodyStep, CharacterLookSliders } from '.'

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
      <CharacterLookSliders state={look} set={set} />
    </LookSlidersContext.Provider>,
  )
  fireEvent.change(screen.getByRole('slider', { name: 'Weight slider' }), { target: { value: '3' } })
  expect(set).toHaveBeenCalledExactlyOnceWith({ lookMoved: { weight: 3 } })
})

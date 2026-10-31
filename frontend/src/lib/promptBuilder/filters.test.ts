import { describe, expect, it } from 'vitest'
import { builderModes } from '../../test/fixtures'
import { buildPrompt, emptyBuilderState, surprise, surpriseStep, toggleLock, type BuilderState } from './build'
import { NOT_SET } from './constants'
import { clashesIn } from './conflicts'
import { parseModes } from './modes'

const { modes } = parseModes(builderModes)
const general = modes.find((mode) => mode.id === 'general')!
const state = (patch: Partial<BuilderState>): BuilderState => ({ ...emptyBuilderState(), who: 'woman', age: 'late 20s', ...patch })
const prompt = (patch: Partial<BuilderState>, style: 'prose' | 'tags' = 'prose') => {
  const result = buildPrompt(state(patch), general, style)
  return result.status === 'ready' ? result.prompt : result.reason
}
const kinds = (patch: Partial<BuilderState>) => clashesIn(state(patch)).map((clash) => clash.kind)

describe('image filters', () => {
  it('write the filter in full after the camera, with the date stamp', () => {
    const text = prompt({ shotType: 'full body', imageFilter: '90s disposable camera', dateStamp: 'OCT 29 26' })
    expect(text).toContain(
      'Captured as a full body. Shot on a 90s disposable 35mm film camera, heavy coarse film grain, high ISO noise, slightly soft out-of-focus lens blur, warm faded analog colour grading, an orange-red light leak on the left edge, dark vignette, an orange digital date stamp "OCT 29 26" in the bottom right corner.',
    )
    expect(prompt({ imageFilter: 'Cinestill 800T', dateStamp: '"OCT 29 26"' }, 'tags')).toContain('cinestill 800t, halation, tungsten film, cool tones, film grain, an orange digital date stamp "OCT 29 26"')
  })

  it('clash with a colour grading or a sharp-focus detail, but not with a natural grading', () => {
    expect(kinds({ imageFilter: 'Black-and-white Tri-X', colorGrading: 'warm golden' })).toContain('filter')
    expect(kinds({ imageFilter: 'Polaroid instant', realism: ['sharp focus on the eyes'] })).toContain('filter')
    expect(kinds({ imageFilter: 'Polaroid instant', colorGrading: 'natural', realism: ['subtle film grain'] })).not.toContain('filter')
  })

  it.each(modes.map((mode) => mode.id))('come with about one Surprise me in three, never fighting the look, in %s', (id) => {
    const mode = modes.find((candidate) => candidate.id === id)!
    let filtered = 0
    for (let seed = 1; seed <= 150; seed++) {
      const surprised = surprise(state({ mode: id }), seed, mode)
      if (surprised.imageFilter !== NOT_SET) filtered++
      expect(clashesIn(surprised).map((clash) => clash.kind), `seed ${seed}`).not.toContain('filter')
    }
    const showsCamera = mode.steps.includes('camera')
    expect(filtered).toBeGreaterThanOrEqual(showsCamera ? 25 : 0)
    expect(filtered).toBeLessThanOrEqual(80)
  })

  it('leave a locked colour grading alone, and a Camera dice picks a filter only when it fits', () => {
    const graded = toggleLock(state({ colorGrading: 'warm golden' }), 'finish')
    for (let seed = 1; seed <= 60; seed++) {
      expect(surprise(graded, seed, general)).toMatchObject({ colorGrading: 'warm golden', imageFilter: NOT_SET })
      expect(surpriseStep(state({ colorGrading: 'cool blue' }), 'camera', seed, general).imageFilter).toBe(NOT_SET)
    }
  })
})

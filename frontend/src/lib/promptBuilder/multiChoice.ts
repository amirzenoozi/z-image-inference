import type { BuilderState } from './build'
import { INHERIT_SCENE, NOT_SET, RANDOM, REMOVE } from './constants'

/** The choices that take more than one option: the first pick is the choice itself, the rest its `More` list. */
export const MORE_FIELDS = { makeup: 'makeupMore', facialHair: 'facialHairMore', lightingSetup: 'lightingMore' } as const
export type MultiChoice = keyof typeof MORE_FIELDS

// Options that rule out every other, such as "no makeup"; Random and the like count too
const EXCLUSIVE: ReadonlySet<string> = new Set(['no makeup', 'clean-shaven', RANDOM, REMOVE, INHERIT_SCENE, NOT_SET])

const alone = (value: string) => EXCLUSIVE.has(value)

/** Every option picked for the choice, in the order picked; none while it is not set. */
export function picksOf(state: BuilderState, field: MultiChoice): string[] {
  const first = state[field]
  if (first === NOT_SET) return []
  return alone(first) ? [first] : [first, ...state[MORE_FIELDS[field]].filter((value) => value !== first)]
}

/**
 * The state change for a new set of picks: an exclusive option just picked replaces the others, and picking any
 * other option drops the exclusive one.
 */
export function withPicks(state: BuilderState, field: MultiChoice, next: readonly string[]): Partial<BuilderState> {
  const before = picksOf(state, field)
  const added = next.find((value) => !before.includes(value))
  const picks = added && alone(added) ? [added] : next.filter((value) => !alone(value))
  return { [field]: picks[0] ?? NOT_SET, [MORE_FIELDS[field]]: picks.slice(1) }
}

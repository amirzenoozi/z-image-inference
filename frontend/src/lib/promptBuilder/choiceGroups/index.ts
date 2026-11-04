import { t, type MessageKey } from '../../../i18n'
import { POSES } from '../data'
import { FACELESS_POSES } from '../faceless'
import { CARDIO_BOXING, GYM_WORKOUTS, PILATES_STRETCHES, SPICY_POSES, YOGA_POSES } from '../fitness'
import { choicesFor, type BuilderState } from '../build'
import type { ChoiceField } from '../choices'
import type { BuilderMode } from '../modes'

export interface ChoiceGroup {
  label?: string
  options: readonly string[]
}

const POSE_GROUPS: readonly { label: MessageKey; poses: Readonly<Record<string, string>> }[] = [
  { label: 'builder.groupGym', poses: GYM_WORKOUTS },
  { label: 'builder.groupYoga', poses: YOGA_POSES },
  { label: 'builder.groupPilates', poses: PILATES_STRETCHES },
  { label: 'builder.groupCardio', poses: CARDIO_BOXING },
  { label: 'builder.groupFlattering', poses: SPICY_POSES },
  { label: 'builder.groupFaceless', poses: FACELESS_POSES },
]

/** Everyday poses first, then each kind of workout and the faceless ones, then the explicit ones; a group with nothing to offer is left out. */
export function poseGroups(state: BuilderState, mode: BuilderMode): ChoiceGroup[] {
  const poses = choicesFor('pose', state, mode)
  const grouped = POSE_GROUPS.map((group) => ({ label: t(group.label), options: poses.filter((pose) => pose in group.poses) }))
  const inGroup = (pose: string) => POSE_GROUPS.some((group) => pose in group.poses)
  const explicit = poses.filter((pose) => !POSES.includes(pose) && !inGroup(pose))
  const groups = [{ options: poses.filter((pose) => POSES.includes(pose)) }, ...grouped, { label: t('builder.groupExplicit'), options: explicit }]
  return groups.filter((group) => group.options.length > 0)
}

/** A choice's option groups as its step shows them, so the same choice offered elsewhere (an A/B test's values) reads the same. */
export function choiceGroupsOf(field: ChoiceField, state: BuilderState, mode: BuilderMode): ChoiceGroup[] {
  return field === 'pose' ? poseGroups(state, mode) : [{ options: choicesFor(field, state, mode) }]
}

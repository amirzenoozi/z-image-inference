import type { Who } from './extraData'
import type { Facts } from './facts'

const QUALITY_TAGS = ['masterpiece', 'best quality', 'amazing quality']
/** Weight on nudity and explicit-action tags, so the model follows them over the rest of the prompt. */
export const ADULT_WEIGHT = 1.3
const EXPLICIT_POSE_WEIGHT = 1.2

const SUBJECT_TAGS: Record<Who, string[]> = {
  woman: ['1girl', 'solo', 'adult woman'],
  man: ['1boy', 'solo', 'adult man'],
  couple: ['1girl', '1boy', 'adult couple'],
  'two women': ['2girls', 'adult women'],
  'two men': ['2boys', 'adult men'],
}

const weigh = (tag: string, weight: number) => `(${tag}:${weight})`

function nudityTags(f: Facts): string[] {
  if (f.nudity === 'implied') return ['implied nudity', ...(f.hasWoman ? ['covering breasts'] : [])]
  if (f.nudity === 'topless') return f.hasWoman ? ['topless', 'bare breasts', 'nipples'] : ['topless male', 'bare chest']
  if (f.nudity !== 'nude') return []
  return ['completely nude', ...(f.hasWoman ? ['nipples', 'pussy'] : []), ...(f.hasMan ? ['penis'] : [])]
}

function adultTags(f: Facts): string[] {
  const pose = f.pose.explicit ? weigh(f.pose.label, EXPLICIT_POSE_WEIGHT) : f.pose.label
  const action = f.action.label ? weigh(f.action.label, ADULT_WEIGHT) : ''
  return [...nudityTags(f).map((tag) => weigh(tag, ADULT_WEIGHT)), action, pose, ...f.intimacy]
}

function personTags(f: Facts): string[] {
  return [
    f.eyes ? `${f.eyes} eyes` : '', f.expression, f.makeup, f.skinTone ? `${f.skinTone} skin` : '', ...f.skinDetails,
    f.hair.length ? `${f.hair.length} hair` : '', f.hair.color ? `${f.hair.color} hair` : '', f.hair.style,
    f.body.type, f.body.height, f.body.bust, f.body.hips, ...f.body.marks,
  ]
}

function settingTags(f: Facts): string[] {
  return [
    f.place ? f.sceneType || f.place : '', f.time, f.weather, f.lighting.label, f.lightingCustom, f.shot, f.angle, f.mood,
  ]
}

/**
 * A tag list for models trained on booru tags (WAI, Anime Desire): quality tags, who, then adult content with
 * extra weight, then the rest. Weights use the "(tag:1.3)" form, which the model server applies.
 */
export function tagsFrom(f: Facts): string {
  const subject = f.who ? [...SUBJECT_TAGS[f.who], f.age, f.ethnicity] : []
  const tags = [
    ...QUALITY_TAGS, ...subject, f.subjectExtra, ...adultTags(f), f.freeAction, ...personTags(f), f.appearanceExtra, f.body.extra,
    ...f.clothing, ...f.removed.map((item) => `no ${item}`), f.outfitDetails, ...settingTags(f), f.extraDetails,
  ]
  return [...new Set(tags.map((tag) => tag.trim().replace(/\.+$/, '')).filter(Boolean))].join(', ')
}

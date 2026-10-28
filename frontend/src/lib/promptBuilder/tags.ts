import type { Who } from './extraData'
import type { Facts } from './facts'
import type { BuilderMode, WeightGroup } from './modes'

const QUALITY_TAGS = ['masterpiece', 'best quality', 'amazing quality']

const SUBJECT_TAGS: Record<Who, string[]> = {
  woman: ['1girl', 'solo', 'adult woman'],
  man: ['1boy', 'solo', 'adult man'],
  couple: ['1girl', '1boy', 'adult couple'],
  'two women': ['2girls', 'adult women'],
  'two men': ['2boys', 'adult men'],
}

type Weights = Partial<Record<WeightGroup, number>>

/** "(tag:1.3)" for a weighted group; the tag as it is otherwise. */
const weighed = (weights: Weights, group: WeightGroup) => (tag: string) => {
  const weight = weights[group]
  return tag && weight !== undefined && weight !== 1 ? `(${tag}:${weight})` : tag
}

function nudityTags(f: Facts): string[] {
  if (f.nudity === 'implied') return ['implied nudity', ...(f.hasWoman ? ['covering breasts'] : [])]
  if (f.nudity === 'topless') return f.hasWoman ? ['topless', 'bare breasts', 'nipples'] : ['topless male', 'bare chest']
  if (f.nudity !== 'nude') return []
  return ['completely nude', ...(f.hasWoman ? ['nipples', 'pussy'] : []), ...(f.hasMan ? ['penis'] : [])]
}

function subjectTags(f: Facts): string[] {
  if (f.sceneOnly) return ['scenery', 'no humans', f.subject]
  return f.who ? [...SUBJECT_TAGS[f.who], f.age, f.ethnicity, f.subjectExtra] : [f.subjectExtra]
}

function adultTags(f: Facts, weights: Weights): string[] {
  const pose = weighed(weights, f.pose.explicit ? 'explicitPose' : 'pose')(f.pose.label)
  return [...nudityTags(f).map(weighed(weights, 'nudity')), weighed(weights, 'action')(f.action.label), pose, ...f.intimacy]
}

function personTags(f: Facts, weights: Weights): string[] {
  const face = [f.eyes ? `${f.eyes} eyes` : '', f.expression, f.makeup, f.skinTone ? `${f.skinTone} skin` : '', ...f.skinDetails]
  const hair = [f.hair.length ? `${f.hair.length} hair` : '', f.hair.color ? `${f.hair.color} hair` : '', f.hair.style]
  const body = [f.body.type, f.body.height, f.body.bust, f.body.hips, ...f.body.marks]
  return [...face.map(weighed(weights, 'face')), ...hair.map(weighed(weights, 'hair')), ...body.map(weighed(weights, 'body'))]
}

function settingTags(f: Facts, weights: Weights): string[] {
  const scene = [f.place ? f.sceneType || f.place : '', f.time, f.weather].map(weighed(weights, 'scene'))
  return [...scene, weighed(weights, 'light')(f.lighting.label), f.lightingCustom, f.shot, f.angle, f.mood]
}

/**
 * A tag list for models trained on booru tags (WAI, Anime Desire): quality tags, who, the mode's style tags, then adult content, then the
 * rest. The mode's weights strengthen groups in the "(tag:1.3)" form, which the model server applies.
 */
export function tagsFrom(f: Facts, mode: Pick<BuilderMode, 'weights' | 'focus'>): string {
  const { weights } = mode
  const tags = [
    ...QUALITY_TAGS, ...subjectTags(f), ...mode.focus.tags, ...adultTags(f, weights), f.freeAction, ...personTags(f, weights), f.appearanceExtra, f.body.extra,
    ...f.clothing.map(weighed(weights, 'outfit')), ...f.removed.map((item) => `no ${item}`), f.outfitDetails, ...settingTags(f, weights), f.extraDetails,
  ]
  return [...new Set(tags.map((tag) => tag.trim().replace(/\.+$/, '')).filter(Boolean))].join(', ')
}

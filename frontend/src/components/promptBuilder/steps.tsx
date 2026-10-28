import { Switch } from '../form/Switch'
import {
  ACCESSORIES,
  BOTTOMS,
  CAMERA_ANGLES,
  CLOTHING_COLORS,
  COLOR_GRADINGS,
  DEPTH_OF_FIELD,
  HAIRSTYLES,
  HAIR_COLORS,
  LENSES,
  LINGERIE_BOTTOMS,
  LINGERIE_TOPS,
  OUTERWEAR,
  PHOTO_STYLES,
  POSES,
  SCENE_TYPES,
  SHOES,
  SHOT_TYPES,
  TOPS,
} from '../../lib/promptBuilder/data'
import {
  AGE_RANGES,
  BODY_TYPES,
  BUST_SIZES,
  ETHNICITIES,
  EXPLICIT_PIERCINGS,
  EXPRESSIONS,
  EYE_COLORS,
  HAIR_LENGTHS,
  HEIGHTS,
  HIPS,
  INTIMACY_CUES,
  MAKEUP,
  NUDITY_LEVELS,
  PIERCINGS,
  REALISM_DETAILS,
  SKIN_DETAILS,
  SKIN_TONES,
  TIMES_OF_DAY,
  TATTOOS,
  WEATHER,
  WHO_OPTIONS,
} from '../../lib/promptBuilder/extraData'
import { LIGHTING_SETUPS, NOT_SET, includesWoman, partnerActions, poseOptions, soloActions, type BuilderState, type OutfitState } from '../../lib/promptBuilder/build'
import { ChipGroup, ChoiceSelect, FieldGrid, Segmented, StepIntro, TextField } from './fields'

export interface StepProps {
  state: BuilderState
  set: (patch: Partial<BuilderState>) => void
  setOutfit: (patch: Partial<OutfitState>) => void
}

const one = (options: readonly string[]) => [{ options }]

export function SubjectStep({ state, set }: StepProps) {
  return (
    <>
      <StepIntro>Who is in the photo. Everyone described is an adult.</StepIntro>
      <FieldGrid>
        <ChoiceSelect label="Who" value={state.who} groups={one(WHO_OPTIONS)} onChange={(who) => set({ who })} />
        <ChoiceSelect label="Age" value={state.age} groups={one(AGE_RANGES)} onChange={(age) => set({ age })} />
        <ChoiceSelect label="Ethnicity" value={state.ethnicity} groups={one(ETHNICITIES)} onChange={(ethnicity) => set({ ethnicity })} />
        <TextField label="Extra subject details" value={state.subject} placeholder="e.g. a dancer with a confident presence" onChange={(subject) => set({ subject })} wide />
        <ExplicitSwitch explicit={state.explicit} onChange={(explicit) => set({ explicit, ...(explicit ? {} : { explicitAction: NOT_SET }) })} />
      </FieldGrid>
    </>
  )
}

function ExplicitSwitch({ explicit, onChange }: { explicit: boolean; onChange: (explicit: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 text-xs sm:col-span-2 dark:border-zinc-800">
      <span>
        <span className="block font-semibold text-zinc-800 dark:text-zinc-100">Explicit content (18+)</span>
        <span className="text-zinc-500 dark:text-zinc-400">Adds explicit poses and actions, nudity levels and intimacy details. Needs “Who” and an age range.</span>
      </span>
      <Switch checked={explicit} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function AppearanceStep({ state, set }: StepProps) {
  return (
    <FieldGrid>
      <ChoiceSelect label="Eye colour" value={state.eyeColor} groups={one(EYE_COLORS)} onChange={(eyeColor) => set({ eyeColor })} />
      <ChoiceSelect label="Expression" value={state.expression} groups={one(EXPRESSIONS)} onChange={(expression) => set({ expression })} />
      <ChoiceSelect label="Makeup" value={state.makeup} groups={one(MAKEUP)} onChange={(makeup) => set({ makeup })} />
      <ChoiceSelect label="Skin tone" value={state.skinTone} groups={one(SKIN_TONES)} onChange={(skinTone) => set({ skinTone })} />
      <ChipGroup label="Skin details" options={SKIN_DETAILS} value={state.skinDetails} onChange={(skinDetails) => set({ skinDetails })} />
      <ChoiceSelect label="Hair length" value={state.hairLength} groups={one(HAIR_LENGTHS)} onChange={(hairLength) => set({ hairLength })} />
      <ChoiceSelect label="Hair colour" value={state.hairColor} groups={one(HAIR_COLORS)} onChange={(hairColor) => set({ hairColor })} />
      <ChoiceSelect label="Hairstyle" value={state.hairstyle} groups={one(HAIRSTYLES)} onChange={(hairstyle) => set({ hairstyle })} />
      <TextField label="More about the face" value={state.appearanceExtra} placeholder="e.g. high cheekbones, dimples" onChange={(appearanceExtra) => set({ appearanceExtra })} wide />
    </FieldGrid>
  )
}

export function BodyStep({ state, set }: StepProps) {
  const piercings = state.explicit ? [...PIERCINGS, ...EXPLICIT_PIERCINGS] : PIERCINGS
  return (
    <FieldGrid>
      <ChoiceSelect label="Body type" value={state.bodyType} groups={one(BODY_TYPES)} onChange={(bodyType) => set({ bodyType })} />
      <ChoiceSelect label="Height" value={state.height} groups={one(HEIGHTS)} onChange={(height) => set({ height })} />
      {includesWoman(state.who) && <ChoiceSelect label="Bust" value={state.bust} groups={one(BUST_SIZES)} onChange={(bust) => set({ bust })} />}
      <ChoiceSelect label="Hips & legs" value={state.hips} groups={one(HIPS)} onChange={(hips) => set({ hips })} />
      <ChipGroup label="Tattoos" options={TATTOOS} value={state.tattoos} onChange={(tattoos) => set({ tattoos })} />
      <ChipGroup label="Piercings" options={piercings} value={state.piercings} onChange={(value) => set({ piercings: value })} />
      <TextField label="More about the body" value={state.bodyExtra} placeholder="e.g. defined collarbones" onChange={(bodyExtra) => set({ bodyExtra })} wide />
    </FieldGrid>
  )
}

type OutfitChoice = Exclude<keyof OutfitState, 'accessories' | 'details'>

const OUTFIT_ROWS: { label: string; item: OutfitChoice; color: OutfitChoice; options: readonly string[] }[] = [
  { label: 'Top', item: 'top', color: 'topColor', options: TOPS },
  { label: 'Bottom', item: 'bottom', color: 'bottomColor', options: BOTTOMS },
  { label: 'Lingerie top', item: 'lingerieTop', color: 'lingerieTopColor', options: LINGERIE_TOPS },
  { label: 'Lingerie bottom', item: 'lingerieBottom', color: 'lingerieBottomColor', options: LINGERIE_BOTTOMS },
  { label: 'Outerwear', item: 'outerwear', color: 'outerwearColor', options: OUTERWEAR },
  { label: 'Shoes', item: 'shoes', color: 'shoesColor', options: SHOES },
]

export function OutfitStep({ state, setOutfit }: StepProps) {
  const { outfit } = state
  const setAccessory = (index: number, value: string) =>
    setOutfit({ accessories: outfit.accessories.map((item, i) => (i === index ? value : item)) as OutfitState['accessories'] })
  return (
    <>
      <StepIntro>“Remove” writes the piece as left off, for example “without shoes”. Lingerie needs “Who” and an age range.</StepIntro>
      <FieldGrid>
        {OUTFIT_ROWS.map((row) => (
          <div key={row.item} className="contents">
            <ChoiceSelect label={row.label} value={outfit[row.item]} groups={one(row.options)} allowRemove onChange={(value) => setOutfit({ [row.item]: value })} />
            <ChoiceSelect label={`${row.label} colour`} value={outfit[row.color]} groups={one(CLOTHING_COLORS)} onChange={(value) => setOutfit({ [row.color]: value })} />
          </div>
        ))}
        {outfit.accessories.map((value, index) => (
          <ChoiceSelect key={index} label={`Accessory ${index + 1}`} value={value} groups={one(ACCESSORIES)} onChange={(item) => setAccessory(index, item)} />
        ))}
        <TextField label="Outfit details" value={outfit.details} placeholder="e.g. sleeves rolled up, sheer fabric" onChange={(details) => setOutfit({ details })} wide />
      </FieldGrid>
    </>
  )
}

export function PoseStep({ state, set }: StepProps) {
  const explicitPoses = poseOptions(true, state.who).filter((pose) => !POSES.includes(pose))
  const poseGroups = [{ options: POSES }, ...(state.explicit ? [{ label: 'Explicit (18+)', options: explicitPoses }] : [])]
  const partner = partnerActions(state.who, state.nudity)
  return (
    <FieldGrid>
      <ChoiceSelect label="Pose" value={state.pose} groups={poseGroups} onChange={(pose) => set({ pose })} />
      {state.explicit && (
        <ChoiceSelect
          label="Explicit action"
          value={state.explicitAction}
          groups={[{ label: 'Solo', options: soloActions(state.who, state.nudity) }, ...(partner.length ? [{ label: 'With a partner', options: partner }] : [])]}
          onChange={(explicitAction) => set({ explicitAction })}
        />
      )}
      <TextField label="Action" value={state.action} placeholder="e.g. laughing while adjusting sunglasses" onChange={(action) => set({ action })} wide />
    </FieldGrid>
  )
}

export function IntimacyStep({ state, set }: StepProps) {
  return (
    <>
      <StepIntro>Covered areas also get matching negative prompt terms, so the model keeps them covered.</StepIntro>
      <FieldGrid>
        <Segmented label="Nudity" value={state.nudity} options={NUDITY_LEVELS} onChange={(nudity) => set({ nudity })} />
        <ChipGroup label="Intimacy details" options={INTIMACY_CUES} value={state.intimacy} onChange={(intimacy) => set({ intimacy })} />
      </FieldGrid>
    </>
  )
}

export function SceneStep({ state, set }: StepProps) {
  return (
    <FieldGrid>
      <ChoiceSelect label="Scene" value={state.sceneType} groups={one(SCENE_TYPES)} onChange={(sceneType) => set({ sceneType })} />
      <ChoiceSelect label="Time of day" value={state.timeOfDay} groups={one(TIMES_OF_DAY)} onChange={(timeOfDay) => set({ timeOfDay })} />
      <ChoiceSelect label="Weather" value={state.weather} groups={one(WEATHER)} onChange={(weather) => set({ weather })} />
      <ChoiceSelect label="Lighting" value={state.lightingSetup} groups={one(LIGHTING_SETUPS)} allowInherit onChange={(lightingSetup) => set({ lightingSetup })} />
      <TextField label="Environment (replaces the scene)" value={state.environment} placeholder="e.g. a rooftop bar in Tokyo" onChange={(environment) => set({ environment })} wide />
      <TextField label="Extra lighting" value={state.lightingCustom} placeholder="e.g. neon sign glow from the left" onChange={(lightingCustom) => set({ lightingCustom })} wide />
    </FieldGrid>
  )
}

export function CameraStep({ state, set }: StepProps) {
  return (
    <FieldGrid>
      <ChoiceSelect label="Photo style" value={state.photoStyle} groups={one(PHOTO_STYLES)} onChange={(photoStyle) => set({ photoStyle })} />
      <ChoiceSelect label="Shot type" value={state.shotType} groups={one(SHOT_TYPES)} onChange={(shotType) => set({ shotType })} />
      <ChoiceSelect label="Camera angle" value={state.cameraAngle} groups={one(CAMERA_ANGLES)} onChange={(cameraAngle) => set({ cameraAngle })} />
      <ChoiceSelect label="Lens" value={state.lens} groups={one(LENSES)} onChange={(lens) => set({ lens })} />
      <ChoiceSelect label="Depth of field" value={state.depthOfField} groups={one(DEPTH_OF_FIELD)} onChange={(depthOfField) => set({ depthOfField })} />
    </FieldGrid>
  )
}

export function FinishStep({ state, set }: StepProps) {
  return (
    <FieldGrid>
      <TextField label="Mood" value={state.mood} placeholder="e.g. playful" onChange={(mood) => set({ mood })} />
      <ChoiceSelect label="Colour grading" value={state.colorGrading} groups={one(COLOR_GRADINGS)} onChange={(colorGrading) => set({ colorGrading })} />
      <ChipGroup label="Realism details" options={REALISM_DETAILS} value={state.realism} onChange={(realism) => set({ realism })} />
      <TextField label="Extra details" value={state.extraDetails} placeholder="Anything else to include" onChange={(extraDetails) => set({ extraDetails })} wide />
      <TextField label="Extra negative prompt" value={state.negativePrompt} placeholder="Added before the automatic negatives" onChange={(negativePrompt) => set({ negativePrompt })} wide />
    </FieldGrid>
  )
}

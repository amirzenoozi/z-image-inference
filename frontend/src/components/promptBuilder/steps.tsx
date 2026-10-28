import { ACCESSORIES, BOTTOMS, CLOTHING_COLORS, LINGERIE_BOTTOMS, LINGERIE_TOPS, OUTERWEAR, POSES, SHOES, TOPS } from '../../lib/promptBuilder/data'
import { EXPLICIT_PIERCINGS, INTIMACY_CUES, NUDITY_LEVELS, PIERCINGS, REALISM_DETAILS, SKIN_DETAILS, TATTOOS } from '../../lib/promptBuilder/extraData'
import { choicesFor, partnerActions, type BuilderState, type OutfitState } from '../../lib/promptBuilder/build'
import type { ChoiceField } from '../../lib/promptBuilder/choices'
import { isAdultMode, type BuilderMode } from '../../lib/promptBuilder/modes'
import { ChipGroup, ChoiceSelect, FieldGrid, Segmented, StepIntro, TextField } from './fields'

export interface StepProps {
  state: BuilderState
  mode: BuilderMode
  set: (patch: Partial<BuilderState>) => void
  setOutfit: (patch: Partial<OutfitState>) => void
}

const one = (options: readonly string[]) => [{ options }]

/** The option groups of a field, as the subject and the mode allow them now. */
const optionsOf = (state: BuilderState, mode: BuilderMode) => (field: ChoiceField) => one(choicesFor(field, state, mode))

export function SubjectStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <>
      <StepIntro>Who is in the photo. Everyone described is an adult.</StepIntro>
      <FieldGrid>
        <ChoiceSelect label="Who" value={state.who} groups={options('who')} onChange={(who) => set({ who })} />
        <ChoiceSelect label="Age" value={state.age} groups={options('age')} onChange={(age) => set({ age })} />
        <ChoiceSelect label="Ethnicity" value={state.ethnicity} groups={options('ethnicity')} onChange={(ethnicity) => set({ ethnicity })} />
        <TextField label="Extra subject details" value={state.subject} placeholder="e.g. a dancer with a confident presence" onChange={(subject) => set({ subject })} wide />
      </FieldGrid>
    </>
  )
}

export function AppearanceStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <ChoiceSelect label="Eye colour" value={state.eyeColor} groups={options('eyeColor')} onChange={(eyeColor) => set({ eyeColor })} />
      <ChoiceSelect label="Expression" value={state.expression} groups={options('expression')} onChange={(expression) => set({ expression })} />
      <ChoiceSelect label="Makeup" value={state.makeup} groups={options('makeup')} onChange={(makeup) => set({ makeup })} />
      <ChoiceSelect label="Skin tone" value={state.skinTone} groups={options('skinTone')} onChange={(skinTone) => set({ skinTone })} />
      <ChipGroup label="Skin details" options={SKIN_DETAILS} value={state.skinDetails} onChange={(skinDetails) => set({ skinDetails })} />
      <ChoiceSelect label="Hair length" value={state.hairLength} groups={options('hairLength')} onChange={(hairLength) => set({ hairLength })} />
      <ChoiceSelect label="Hair colour" value={state.hairColor} groups={options('hairColor')} onChange={(hairColor) => set({ hairColor })} />
      <ChoiceSelect label="Hairstyle" value={state.hairstyle} groups={options('hairstyle')} onChange={(hairstyle) => set({ hairstyle })} />
      <TextField label="More about the face" value={state.appearanceExtra} placeholder="e.g. high cheekbones, dimples" onChange={(appearanceExtra) => set({ appearanceExtra })} wide />
    </FieldGrid>
  )
}

export function BodyStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  const piercings = isAdultMode(mode) ? [...PIERCINGS, ...EXPLICIT_PIERCINGS] : PIERCINGS
  return (
    <FieldGrid>
      <ChoiceSelect label="Body type" value={state.bodyType} groups={options('bodyType')} onChange={(bodyType) => set({ bodyType })} />
      <ChoiceSelect label="Height" value={state.height} groups={options('height')} onChange={(height) => set({ height })} />
      {choicesFor('bust', state, mode).length > 0 && <ChoiceSelect label="Bust" value={state.bust} groups={options('bust')} onChange={(bust) => set({ bust })} />}
      <ChoiceSelect label="Hips & legs" value={state.hips} groups={options('hips')} onChange={(hips) => set({ hips })} />
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

function poseGroups(state: BuilderState, mode: BuilderMode) {
  const poses = choicesFor('pose', state, mode)
  const explicit = poses.filter((pose) => !POSES.includes(pose))
  return [{ options: poses.filter((pose) => POSES.includes(pose)) }, ...(explicit.length ? [{ label: 'Explicit (18+)', options: explicit }] : [])]
}

function actionGroups(state: BuilderState, mode: BuilderMode) {
  const actions = choicesFor('explicitAction', state, mode)
  const partner = new Set(partnerActions(state.who, state.nudity))
  const withPartner = actions.filter((action) => partner.has(action))
  return [{ label: 'Solo', options: actions.filter((action) => !partner.has(action)) }, ...(withPartner.length ? [{ label: 'With a partner', options: withPartner }] : [])]
}

export function PoseStep({ state, mode, set }: StepProps) {
  return (
    <FieldGrid>
      <ChoiceSelect label="Pose" value={state.pose} groups={poseGroups(state, mode)} onChange={(pose) => set({ pose })} />
      {choicesFor('explicitAction', state, mode).length > 0 && (
        <ChoiceSelect label="Explicit action" value={state.explicitAction} groups={actionGroups(state, mode)} onChange={(explicitAction) => set({ explicitAction })} />
      )}
      <TextField label="Action" value={state.action} placeholder="e.g. laughing while adjusting sunglasses" onChange={(action) => set({ action })} wide />
    </FieldGrid>
  )
}

export function IntimacyStep({ state, mode, set }: StepProps) {
  const allowed = choicesFor('nudity', state, mode)
  const levels = NUDITY_LEVELS.filter((level) => allowed.includes(level.value))
  return (
    <>
      <StepIntro>Covered areas also get matching negative prompt terms, so the model keeps them covered.</StepIntro>
      <FieldGrid>
        <Segmented label="Nudity" value={state.nudity} options={levels} onChange={(nudity) => set({ nudity })} />
        <ChipGroup label="Intimacy details" options={INTIMACY_CUES} value={state.intimacy} onChange={(intimacy) => set({ intimacy })} />
      </FieldGrid>
    </>
  )
}

export function SceneStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <ChoiceSelect label="Scene" value={state.sceneType} groups={options('sceneType')} onChange={(sceneType) => set({ sceneType })} />
      <ChoiceSelect label="Time of day" value={state.timeOfDay} groups={options('timeOfDay')} onChange={(timeOfDay) => set({ timeOfDay })} />
      <ChoiceSelect label="Weather" value={state.weather} groups={options('weather')} onChange={(weather) => set({ weather })} />
      <ChoiceSelect label="Lighting" value={state.lightingSetup} groups={options('lightingSetup')} allowInherit onChange={(lightingSetup) => set({ lightingSetup })} />
      <TextField label="Environment (replaces the scene)" value={state.environment} placeholder="e.g. a rooftop bar in Tokyo" onChange={(environment) => set({ environment })} wide />
      <TextField label="Extra lighting" value={state.lightingCustom} placeholder="e.g. neon sign glow from the left" onChange={(lightingCustom) => set({ lightingCustom })} wide />
    </FieldGrid>
  )
}

export function CameraStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <ChoiceSelect label="Photo style" value={state.photoStyle} groups={options('photoStyle')} onChange={(photoStyle) => set({ photoStyle })} />
      <ChoiceSelect label="Shot type" value={state.shotType} groups={options('shotType')} onChange={(shotType) => set({ shotType })} />
      <ChoiceSelect label="Camera angle" value={state.cameraAngle} groups={options('cameraAngle')} onChange={(cameraAngle) => set({ cameraAngle })} />
      <ChoiceSelect label="Lens" value={state.lens} groups={options('lens')} onChange={(lens) => set({ lens })} />
      <ChoiceSelect label="Depth of field" value={state.depthOfField} groups={options('depthOfField')} onChange={(depthOfField) => set({ depthOfField })} />
    </FieldGrid>
  )
}

export function FinishStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <TextField label="Mood" value={state.mood} placeholder="e.g. playful" onChange={(mood) => set({ mood })} />
      <ChoiceSelect label="Colour grading" value={state.colorGrading} groups={options('colorGrading')} onChange={(colorGrading) => set({ colorGrading })} />
      <ChipGroup label="Realism details" options={REALISM_DETAILS} value={state.realism} onChange={(realism) => set({ realism })} />
      <TextField label="Extra details" value={state.extraDetails} placeholder="Anything else to include" onChange={(extraDetails) => set({ extraDetails })} wide />
      <TextField label="Extra negative prompt" value={state.negativePrompt} placeholder="Added before the automatic negatives" onChange={(negativePrompt) => set({ negativePrompt })} wide />
    </FieldGrid>
  )
}

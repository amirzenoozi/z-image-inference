import { ACCESSORIES, BOTTOMS, CLOTHING_COLORS, LINGERIE_BOTTOMS, LINGERIE_TOPS, OUTERWEAR, POSES, SHOES, TOPS } from '../../lib/promptBuilder/data'
import { EXPLICIT_PIERCINGS, INTIMACY_CUES, NUDITY_LEVELS, PIERCINGS, REALISM_DETAILS, SKIN_DETAILS, TATTOOS } from '../../lib/promptBuilder/extraData'
import { choicesFor, partnerActions, type BuilderState, type OutfitState } from '../../lib/promptBuilder/build'
import { explicitDetailOptions } from '../../lib/promptBuilder/rules'
import { picksOf, withPicks } from '../../lib/promptBuilder/multiChoice'
import type { ChoiceField } from '../../lib/promptBuilder/choices'
import { isAdultMode, isSafeMode, type BuilderMode } from '../../lib/promptBuilder/modes'
import { t, type MessageKey } from '../../i18n'
import { CheckboxGroup, ChoiceSelect, FieldGrid, MultiChoiceSelect, Segmented, StepIntro, TextField } from './fields'

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
      <StepIntro>{t('builder.introSubject')}</StepIntro>
      <FieldGrid>
        <ChoiceSelect label={t('builder.fieldWho')} value={state.who} groups={options('who')} onChange={(who) => set({ who })} />
        <ChoiceSelect label={t('builder.fieldAge')} value={state.age} groups={options('age')} onChange={(age) => set({ age })} />
        <ChoiceSelect label={t('builder.fieldEthnicity')} value={state.ethnicity} groups={options('ethnicity')} onChange={(ethnicity) => set({ ethnicity })} />
        <TextField label={t('builder.fieldSubjectExtra')} value={state.subject} placeholder={t('builder.placeholderSubject')} onChange={(subject) => set({ subject })} wide />
      </FieldGrid>
    </>
  )
}

export function AppearanceStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <ChoiceSelect label={t('builder.fieldEyeColour')} value={state.eyeColor} groups={options('eyeColor')} onChange={(eyeColor) => set({ eyeColor })} />
      <ChoiceSelect label={t('builder.fieldExpression')} value={state.expression} groups={options('expression')} onChange={(expression) => set({ expression })} />
      <MultiChoiceSelect label={t('builder.fieldMakeup')} values={picksOf(state, 'makeup')} groups={options('makeup')} onChange={(picks) => set(withPicks(state, 'makeup', picks))} />
      <ChoiceSelect label={t('builder.fieldSkinTone')} value={state.skinTone} groups={options('skinTone')} onChange={(skinTone) => set({ skinTone })} />
      <CheckboxGroup label={t('builder.fieldSkinDetails')} options={SKIN_DETAILS} value={state.skinDetails} onChange={(skinDetails) => set({ skinDetails })} />
      <ChoiceSelect label={t('builder.fieldHairLength')} value={state.hairLength} groups={options('hairLength')} onChange={(hairLength) => set({ hairLength })} />
      <ChoiceSelect label={t('builder.fieldHairColour')} value={state.hairColor} groups={options('hairColor')} onChange={(hairColor) => set({ hairColor })} />
      <ChoiceSelect label={t('builder.fieldHairstyle')} value={state.hairstyle} groups={options('hairstyle')} onChange={(hairstyle) => set({ hairstyle })} />
      <FacialHair state={state} mode={mode} set={set} />
      <TextField label={t('builder.fieldFaceExtra')} value={state.appearanceExtra} placeholder={t('builder.placeholderFace')} onChange={(appearanceExtra) => set({ appearanceExtra })} wide />
    </FieldGrid>
  )
}

export function BodyStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  const piercings = isAdultMode(mode) ? [...PIERCINGS, ...EXPLICIT_PIERCINGS] : PIERCINGS
  return (
    <FieldGrid>
      <ChoiceSelect label={t('builder.fieldBodyType')} value={state.bodyType} groups={options('bodyType')} onChange={(bodyType) => set({ bodyType })} />
      <ChoiceSelect label={t('builder.fieldHeight')} value={state.height} groups={options('height')} onChange={(height) => set({ height })} />
      {choicesFor('bust', state, mode).length > 0 && <ChoiceSelect label={t('builder.fieldBust')} value={state.bust} groups={options('bust')} onChange={(bust) => set({ bust })} />}
      <ChoiceSelect label={t('builder.fieldHips')} value={state.hips} groups={options('hips')} onChange={(hips) => set({ hips })} />
      <ShownChoices fields={BUILD_FIELDS} state={state} mode={mode} set={set} />
      <ShownChoices fields={ANATOMY_FIELDS} state={state} mode={mode} set={set} note={t('builder.anatomyNote')} />
      <CheckboxGroup label={t('builder.fieldTattoos')} options={TATTOOS} value={state.tattoos} onChange={(tattoos) => set({ tattoos })} />
      <CheckboxGroup label={t('builder.fieldPiercings')} options={piercings} value={state.piercings} onChange={(value) => set({ piercings: value })} />
      <TextField label={t('builder.fieldBodyExtra')} value={state.bodyExtra} placeholder={t('builder.placeholderBody')} onChange={(bodyExtra) => set({ bodyExtra })} wide />
    </FieldGrid>
  )
}

type OutfitChoice = Exclude<keyof OutfitState, 'accessories' | 'details'>

interface OutfitRow {
  label: MessageKey
  colourLabel: MessageKey
  item: OutfitChoice
  color: OutfitChoice
  options: readonly string[]
  lingerie?: boolean
}

const OUTFIT_ROWS: OutfitRow[] = [
  { label: 'builder.outfitTop', colourLabel: 'builder.outfitTopColour', item: 'top', color: 'topColor', options: TOPS },
  { label: 'builder.outfitBottom', colourLabel: 'builder.outfitBottomColour', item: 'bottom', color: 'bottomColor', options: BOTTOMS },
  { label: 'builder.outfitLingerieTop', colourLabel: 'builder.outfitLingerieTopColour', item: 'lingerieTop', color: 'lingerieTopColor', options: LINGERIE_TOPS, lingerie: true },
  { label: 'builder.outfitLingerieBottom', colourLabel: 'builder.outfitLingerieBottomColour', item: 'lingerieBottom', color: 'lingerieBottomColor', options: LINGERIE_BOTTOMS, lingerie: true },
  { label: 'builder.outfitOuterwear', colourLabel: 'builder.outfitOuterwearColour', item: 'outerwear', color: 'outerwearColor', options: OUTERWEAR },
  { label: 'builder.outfitShoes', colourLabel: 'builder.outfitShoesColour', item: 'shoes', color: 'shoesColor', options: SHOES },
]

export function OutfitStep({ state, mode, setOutfit }: StepProps) {
  const { outfit } = state
  const safe = isSafeMode(mode)
  const rows = OUTFIT_ROWS.filter((row) => !safe || !row.lingerie)
  const setAccessory = (index: number, value: string) =>
    setOutfit({ accessories: outfit.accessories.map((item, i) => (i === index ? value : item)) as OutfitState['accessories'] })
  return (
    <>
      <StepIntro>{t(safe ? 'builder.introOutfitSafe' : 'builder.introOutfit')}</StepIntro>
      <FieldGrid>
        {rows.map((row) => (
          <div key={row.item} className="contents">
            <ChoiceSelect label={t(row.label)} value={outfit[row.item]} groups={one(row.options)} allowRemove onChange={(value) => setOutfit({ [row.item]: value })} />
            <ChoiceSelect label={t(row.colourLabel)} value={outfit[row.color]} groups={one(CLOTHING_COLORS)} onChange={(value) => setOutfit({ [row.color]: value })} />
          </div>
        ))}
        {outfit.accessories.map((value, index) => (
          <ChoiceSelect key={index} label={t('builder.outfitAccessory', { number: index + 1 })} value={value} groups={one(ACCESSORIES)} onChange={(item) => setAccessory(index, item)} />
        ))}
        <TextField label={t('builder.fieldOutfitDetails')} value={outfit.details} placeholder={t('builder.placeholderOutfit')} onChange={(details) => setOutfit({ details })} wide />
      </FieldGrid>
    </>
  )
}

function poseGroups(state: BuilderState, mode: BuilderMode) {
  const poses = choicesFor('pose', state, mode)
  const explicit = poses.filter((pose) => !POSES.includes(pose))
  return [{ options: poses.filter((pose) => POSES.includes(pose)) }, ...(explicit.length ? [{ label: t('builder.groupExplicit'), options: explicit }] : [])]
}

function actionGroups(state: BuilderState, mode: BuilderMode) {
  const actions = choicesFor('explicitAction', state, mode)
  const partner = new Set(partnerActions(state.who, state.nudity))
  const withPartner = actions.filter((action) => partner.has(action))
  return [{ label: t('builder.groupSolo'), options: actions.filter((action) => !partner.has(action)) }, ...(withPartner.length ? [{ label: t('builder.groupPartner'), options: withPartner }] : [])]
}

export function PoseStep({ state, mode, set }: StepProps) {
  return (
    <FieldGrid>
      <ChoiceSelect label={t('builder.fieldPose')} value={state.pose} groups={poseGroups(state, mode)} onChange={(pose) => set({ pose })} />
      {choicesFor('explicitAction', state, mode).length > 0 && (
        <ChoiceSelect label={t('builder.fieldExplicitAction')} value={state.explicitAction} groups={actionGroups(state, mode)} onChange={(explicitAction) => set({ explicitAction })} />
      )}
      <TextField label={t('builder.fieldAction')} value={state.action} placeholder={t('builder.placeholderAction')} onChange={(action) => set({ action })} wide />
    </FieldGrid>
  )
}

type ShownField = 'muscles' | 'abs' | 'bodyHair' | 'chest' | 'bulge' | 'penis' | 'nipples' | 'pubicHair'

/** A man's beard and moustache, several at once; shown only with a man in the scene. */
function FacialHair({ state, mode, set }: Pick<StepProps, 'state' | 'mode' | 'set'>) {
  const groups = optionsOf(state, mode)('facialHair')
  if (groups.every((group) => group.options.length === 0)) return null
  return <MultiChoiceSelect label={t('builder.fieldFacialHair')} values={picksOf(state, 'facialHair')} groups={groups} onChange={(picks) => set(withPicks(state, 'facialHair', picks))} />
}

const BUILD_FIELDS: readonly { field: ShownField; label: MessageKey }[] = [
  { field: 'muscles', label: 'builder.fieldMuscles' },
  { field: 'abs', label: 'builder.fieldAbs' },
  { field: 'bodyHair', label: 'builder.fieldBodyHair' },
]

const ANATOMY_FIELDS: readonly { field: ShownField; label: MessageKey }[] = [
  { field: 'chest', label: 'builder.fieldChest' },
  { field: 'bulge', label: 'builder.fieldBulge' },
  { field: 'penis', label: 'builder.fieldPenis' },
  { field: 'nipples', label: 'builder.fieldNipples' },
  { field: 'pubicHair', label: 'builder.fieldPubicHair' },
]

// Not part of a character's look, so set for each image even when a character is chosen
const IMAGE_BODY_FIELDS: readonly { field: ShownField; label: MessageKey }[] = [
  { field: 'bodyHair', label: 'builder.fieldBodyHair' },
  { field: 'bulge', label: 'builder.fieldBulge' },
  { field: 'penis', label: 'builder.fieldPenis' },
  { field: 'nipples', label: 'builder.fieldNipples' },
  { field: 'pubicHair', label: 'builder.fieldPubicHair' },
]

/** The body choices made for each image, shown under a chosen character, whose look leaves them out; `state` has the character's look applied. */
export function ImageBodyChoices({ state, mode, set }: Pick<StepProps, 'state' | 'mode' | 'set'>) {
  if (!IMAGE_BODY_FIELDS.some(({ field }) => choicesFor(field, state, mode).length > 0)) return null
  return (
    <section aria-label={t('builder.forThisImage')} className="mt-4 space-y-2">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('builder.forThisImage')}</h3>
      <FieldGrid>
        <ShownChoices fields={IMAGE_BODY_FIELDS} state={state} mode={mode} set={set} note={t('builder.anatomyNote')} />
      </FieldGrid>
    </section>
  )
}

interface ShownChoicesProps extends Pick<StepProps, 'state' | 'mode' | 'set'> {
  fields: readonly { field: ShownField; label: MessageKey }[]
  note?: string
}

/** Choices shown only when they fit the subject, purpose and nudity, with an optional note under them. */
function ShownChoices({ fields, state, mode, set, note }: ShownChoicesProps) {
  const shown = fields.filter(({ field }) => choicesFor(field, state, mode).length > 0)
  return (
    <>
      {shown.map(({ field, label }) => (
        <ChoiceSelect key={field} label={t(label)} value={state[field]} groups={optionsOf(state, mode)(field)} onChange={(value) => set({ [field]: value })} />
      ))}
      {note && shown.length > 0 && <p className="text-[11px] text-zinc-500 sm:col-span-2 dark:text-zinc-400">{note}</p>}
    </>
  )
}

export function IntimacyStep({ state, mode, set }: StepProps) {
  const allowed = choicesFor('nudity', state, mode)
  const levels = NUDITY_LEVELS.filter((level) => allowed.includes(level.value)).map((level) => ({ value: level.value, label: t(level.label) }))
  return (
    <>
      <StepIntro>{t('builder.introIntimacy')}</StepIntro>
      <FieldGrid>
        <Segmented label={t('builder.fieldNudity')} value={state.nudity} options={levels} onChange={(nudity) => set({ nudity })} />
        <CheckboxGroup label={t('builder.fieldIntimacy')} options={INTIMACY_CUES} value={state.intimacy} onChange={(intimacy) => set({ intimacy })} />
        <ExplicitDetails state={state} mode={mode} set={set} />
      </FieldGrid>
    </>
  )
}

export function SceneStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <ChoiceSelect label={t('builder.fieldScene')} value={state.sceneType} groups={options('sceneType')} onChange={(sceneType) => set({ sceneType })} />
      <ChoiceSelect label={t('builder.fieldTimeOfDay')} value={state.timeOfDay} groups={options('timeOfDay')} onChange={(timeOfDay) => set({ timeOfDay })} />
      <ChoiceSelect label={t('builder.fieldWeather')} value={state.weather} groups={options('weather')} onChange={(weather) => set({ weather })} />
      <MultiChoiceSelect label={t('builder.fieldLighting')} values={picksOf(state, 'lightingSetup')} groups={options('lightingSetup')} allowInherit onChange={(picks) => set(withPicks(state, 'lightingSetup', picks))} />
      <TextField label={t('builder.fieldEnvironment')} value={state.environment} placeholder={t('builder.placeholderEnvironment')} onChange={(environment) => set({ environment })} wide />
      <TextField label={t('builder.fieldExtraLighting')} value={state.lightingCustom} placeholder={t('builder.placeholderLighting')} onChange={(lightingCustom) => set({ lightingCustom })} wide />
    </FieldGrid>
  )
}

export function CameraStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <ChoiceSelect label={t('builder.fieldPhotoStyle')} value={state.photoStyle} groups={options('photoStyle')} onChange={(photoStyle) => set({ photoStyle })} />
      <ChoiceSelect label={t('builder.fieldShotType')} value={state.shotType} groups={options('shotType')} onChange={(shotType) => set({ shotType })} />
      <ChoiceSelect label={t('builder.fieldCameraAngle')} value={state.cameraAngle} groups={options('cameraAngle')} onChange={(cameraAngle) => set({ cameraAngle })} />
      <ChoiceSelect label={t('builder.fieldLens')} value={state.lens} groups={options('lens')} onChange={(lens) => set({ lens })} />
      <ChoiceSelect label={t('builder.fieldDepthOfField')} value={state.depthOfField} groups={options('depthOfField')} onChange={(depthOfField) => set({ depthOfField })} />
    </FieldGrid>
  )
}

export function FinishStep({ state, mode, set }: StepProps) {
  const options = optionsOf(state, mode)
  return (
    <FieldGrid>
      <TextField label={t('builder.fieldMood')} value={state.mood} placeholder={t('builder.placeholderMood')} onChange={(mood) => set({ mood })} />
      <ChoiceSelect label={t('builder.fieldColourGrading')} value={state.colorGrading} groups={options('colorGrading')} onChange={(colorGrading) => set({ colorGrading })} />
      <CheckboxGroup label={t('builder.fieldRealism')} options={REALISM_DETAILS} value={state.realism} onChange={(realism) => set({ realism })} />
      <TextField label={t('builder.fieldExtraDetails')} value={state.extraDetails} placeholder={t('builder.placeholderExtraDetails')} onChange={(extraDetails) => set({ extraDetails })} wide />
      <TextField label={t('builder.fieldExtraNegative')} value={state.negativePrompt} placeholder={t('builder.placeholderNegative')} onChange={(negativePrompt) => set({ negativePrompt })} wide />
    </FieldGrid>
  )
}

/** Fluids, arousal and marks, in the Explicit purpose; which ones show depends on who is in the scene and the nudity. */
function ExplicitDetails({ state, mode, set }: Pick<StepProps, 'state' | 'mode' | 'set'>) {
  const options = explicitDetailOptions(state, mode)
  if (options.length === 0) return null
  return <CheckboxGroup label={t('builder.fieldExplicitDetails')} options={options} value={state.explicitDetails.filter((detail) => options.includes(detail))} onChange={(explicitDetails) => set({ explicitDetails })} />
}

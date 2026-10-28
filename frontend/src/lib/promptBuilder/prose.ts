import { EXPLICIT_DETAILS } from './extraData'
import { capitalise, joinPieces, withArticle, type Facts } from './facts'
import { PROSE_BLOCKS, type BuilderMode, type ProseBlock } from './modes'

function opening(f: Facts, focusOpening: string): string {
  const photo = focusOpening || (f.photoStyle ? `${withArticle(f.photoStyle)} photograph` : 'a photograph')
  return [`${photo} of ${f.subject}`, f.pose.text, f.action.text, f.freeAction].filter(Boolean).join(', ')
}

function nudity(f: Facts): string {
  if (f.nudity === null) return ''
  const { they, their, are } = f.pronoun
  const covered = `${their} ${f.hasWoman ? 'breasts and ' : ''}intimate areas`
  if (f.nudity === 'clothed') return `${they} ${are} fully clothed, ${covered} covered`
  if (f.nudity === 'implied') return `${they} ${are} nude but nothing explicit is shown, ${covered} hidden by hands, sheets or hair`
  if (f.nudity === 'topless') {
    return f.hasWoman
      ? `${they} ${are} topless with nothing worn above the waist, bare breasts and nipples fully visible`
      : `${they} ${are} shirtless and bare-chested`
  }
  const visible = [...(f.hasWoman ? ['bare breasts', 'nipples', 'vulva'] : []), ...(f.hasMan ? ['penis'] : [])]
  const shown = visible.length ? `, ${joinPieces(visible)} clearly visible` : ''
  return `${they} ${are} completely nude, fully naked with no clothing at all${shown}`
}

function face(f: Facts): string {
  const { they, have, are } = f.pronoun
  const look = joinPieces([f.eyes ? `${f.eyes} eyes` : '', withArticle(f.expression)])
  const makeup = joinPieces(f.makeup)
  if (!look) return makeup ? `${they} ${are} wearing ${makeup}` : ''
  return `${they} ${have} ${look}${makeup ? `, wearing ${makeup}` : ''}`
}

function skin(f: Facts): string {
  const details = joinPieces(f.skinDetails)
  if (f.skinTone) return `${f.pronoun.their} skin is ${f.skinTone}${details ? `, with ${details}` : ''}`
  return details ? `${f.pronoun.their} skin shows ${details}` : ''
}

function body(f: Facts): string {
  const { they, have, are } = f.pronoun
  const shape = joinPieces([withArticle(f.body.type), f.body.bust, f.body.hips])
  if (f.body.height) return `${they} ${are} ${f.body.height}${shape ? ` with ${shape}` : ''}`
  return shape ? `${they} ${have} ${shape}` : ''
}

const MUSCLE_TEXT: Readonly<Record<string, string>> = {
  lean: 'a lean physique', toned: 'a toned physique', muscular: 'a muscular physique', 'very muscular': 'a very muscular physique',
  'huge bodybuilder': 'a huge bodybuilder physique with massive muscles',
}
const ABS_TEXT: Readonly<Record<string, string>> = { 'flat stomach': 'a flat stomach', 'defined abs': 'defined abs', 'six-pack': 'a six-pack', 'eight-pack': 'an eight-pack' }
const BODY_HAIR_TEXT: Readonly<Record<string, string>> = { smooth: 'smooth, hairless skin', 'natural body hair': 'natural body hair', hairy: 'a hairy body' }
const MALE_TEXT: Readonly<Record<string, string>> = {
  'clean-shaven': 'a clean-shaven face', stubble: 'light stubble', 'short beard': 'a short beard', 'full beard': 'a full beard',
  'long beard': 'a long beard', goatee: 'a goatee', moustache: 'a moustache', 'smooth chest': 'a smooth chest', 'light chest hair': 'light chest hair',
  'hairy chest': 'a hairy chest', 'broad pecs': 'broad pecs', 'visible bulge': 'a visible bulge in the crotch', 'large bulge': 'a large, prominent bulge in the crotch',
}

function physique(f: Facts): string {
  const { muscles, abs, bodyHair } = f.physique
  const pieces = [MUSCLE_TEXT[muscles], ABS_TEXT[abs], BODY_HAIR_TEXT[bodyHair]].filter(Boolean)
  return pieces.length ? `${f.pronoun.they} ${f.pronoun.have} ${joinPieces(pieces)}` : ''
}

/** The man's chest and bulge, his own in a couple. */
function maleBody(f: Facts): string {
  const pieces = [MALE_TEXT[f.male.chest], MALE_TEXT[f.male.bulge]].filter(Boolean)
  return pieces.length ? `${owner(f, 'man')} ${joinPieces(pieces)}` : ''
}

function beard(f: Facts): string {
  const beards = joinPieces(f.male.facialHair.map((value) => MALE_TEXT[value] ?? value))
  return beards ? `${owner(f, 'man')} ${beards}` : ''
}

function marks(f: Facts): string {
  return f.body.marks.length ? `${f.pronoun.they} ${f.pronoun.have} ${joinPieces(f.body.marks.map(withArticle))}` : ''
}

function hair(f: Facts): string {
  const described = [f.hair.length, f.hair.color].filter(Boolean).join(' ')
  if (f.hair.style) return `${f.pronoun.their} ${described ? `${described} ` : ''}hair is styled in ${withArticle(f.hair.style)}`
  return described ? `${f.pronoun.they} ${f.pronoun.have} ${described} hair` : ''
}

function clothing(f: Facts): string {
  const { they, are } = f.pronoun
  const only = f.nudity !== null && f.nudity !== 'clothed' ? 'only ' : ''
  const worn = f.clothing.length ? `${they} ${are} wearing ${only}${joinPieces(f.clothing.map(withArticle))}` : ''
  const removed = f.removed.length ? `no ${joinPieces(f.removed)}` : ''
  if (worn && removed) return `${worn}, with ${removed}`
  return worn || (removed ? `${they} ${are} wearing ${removed}` : '')
}

const PENIS_TEXT: Readonly<Record<string, string>> = {
  'average penis': 'an average-sized penis', 'large penis': 'a large, thick penis', 'huge penis': 'a huge, thick penis',
  'giant penis': 'a giant, massively thick penis',
}
const PUBIC_TEXT: Readonly<Record<string, string>> = {
  shaved: 'a smooth, fully shaved pubic area', trimmed: 'neatly trimmed pubic hair', natural: 'natural pubic hair', hairy: 'thick, untrimmed pubic hair',
}

/** Who a detail belongs to, so in a couple the man's and the woman's are not mixed up. */
function owner(f: Facts, sex: 'man' | 'woman' | 'any'): string {
  if (f.who === 'couple' && sex !== 'any') return `the ${sex} has`
  if (f.who === 'two men' || f.who === 'two women') return `both ${f.who.slice(4)} have`
  return `${f.pronoun.they} ${f.pronoun.have}`
}

function anatomy(f: Facts): string[] {
  const { penis, nipples, pubicHair } = f.anatomy
  return [
    penis ? `${owner(f, 'man')} ${PENIS_TEXT[penis] ?? penis}` : '',
    nipples ? `${owner(f, 'woman')} ${nipples}` : '',
    pubicHair ? `${owner(f, 'any')} ${PUBIC_TEXT[pubicHair] ?? pubicHair}` : '',
  ]
}

function explicitDetails(f: Facts): string {
  const texts = f.explicitDetails.map((detail) => EXPLICIT_DETAILS[detail]?.text ?? detail)
  return texts.length ? `with ${joinPieces(texts)}` : ''
}

function intimacy(f: Facts): string {
  return f.intimacy.length ? `the moment feels intimate, with ${joinPieces(f.intimacy)}` : ''
}

function scene(f: Facts): string {
  const when = f.time ? `${f.place ? ' ' : ''}at ${f.time}` : ''
  const where = f.place || when ? `the scene is set ${f.place}${when}` : ''
  if (!f.weather) return where
  return where ? `${where}, with ${f.weather}` : `the weather shows ${f.weather}`
}

function light(f: Facts): string {
  const lights = joinPieces(f.lighting.map((setup) => setup.text))
  const lit = lights ? `the scene is lit by ${lights}` : ''
  return [lit, f.lightingCustom].filter(Boolean).join(', ')
}

function camera(f: Facts): string {
  const angle = f.angle === 'eye level' ? 'at eye level' : f.angle ? `from ${withArticle(f.angle)}` : ''
  const lens = f.lens ? `with ${withArticle(f.lens.includes('camera') ? f.lens : `${f.lens} lens`)}` : ''
  const framing = [f.shot ? `captured as ${withArticle(f.shot)}` : '', angle, lens].filter(Boolean).join(' ')
  return [framing, f.depthOfField].filter(Boolean).join(', ')
}

function mood(f: Facts): string {
  const grading = f.grading && f.grading !== 'natural' ? `${f.grading} colour grading` : ''
  if (!f.mood) return grading
  return `the mood is ${f.mood}${grading ? `, with ${grading}` : ''}`
}

const BLOCKS: Record<ProseBlock, (f: Facts) => string[]> = {
  nudity: (f) => [nudity(f), ...anatomy(f)],
  face: (f) => [face(f), skin(f), f.appearanceExtra],
  body: (f) => [body(f), physique(f), maleBody(f), marks(f), f.body.extra],
  hair: (f) => [hair(f), beard(f)],
  outfit: (f) => [clothing(f), f.outfitDetails],
  intimacy: (f) => [intimacy(f), explicitDetails(f)],
  scene: (f) => [scene(f)],
  details: (f) => [f.extraDetails],
  light: (f) => [light(f)],
  camera: (f) => [camera(f)],
  mood: (f) => [mood(f)],
  realism: (f) => [joinPieces(f.realism)],
}

/**
 * One flowing paragraph for models that read natural language (Z-Image, MOSS-Image): who and what is happening
 * first, since these models weigh what comes early most; then the mode's style cues and the blocks it stresses, then the rest in their
 * usual order: nudity, the person, the outfit, the setting, the light and the camera, each tied to the subject.
 */
export function proseFrom(f: Facts, mode: Pick<BuilderMode, 'emphasis' | 'focus'>): string {
  const order = [...new Set([...mode.emphasis, ...PROSE_BLOCKS])]
  // With its own opening the mode replaces the photo style there, so the style moves to the cues
  const style = mode.focus.opening && f.photoStyle ? `shot in ${withArticle(f.photoStyle)} style` : ''
  const cues = [mode.focus.cues, style].filter(Boolean).join(', ')
  const sentences = [opening(f, mode.focus.opening), cues, ...order.flatMap((block) => BLOCKS[block](f))]
  const text = sentences
    .map((sentence) => sentence.trim().replace(/\.+$/, ''))
    .filter(Boolean)
    .map(capitalise)
    .join('. ')
  return `${text}.`
}

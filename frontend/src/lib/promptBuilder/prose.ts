import { capitalise, joinPieces, withArticle, type Facts } from './facts'

function opening(f: Facts): string {
  const photo = f.photoStyle ? `${withArticle(f.photoStyle)} photograph` : 'a photograph'
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
  if (!look) return f.makeup ? `${they} ${are} wearing ${f.makeup}` : ''
  return `${they} ${have} ${look}${f.makeup ? `, wearing ${f.makeup}` : ''}`
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
  const lit = f.lighting.text ? `the scene is lit by ${f.lighting.text}` : ''
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

/**
 * One flowing paragraph for models that read natural language (Z-Image, MOSS-Image): who and what is happening
 * first, adult content included, since these models weigh what comes early most; then the person, the outfit,
 * the setting, the light and the camera, each tied to the subject.
 */
export function proseFrom(f: Facts): string {
  const sentences = [
    opening(f), nudity(f), face(f), skin(f), f.appearanceExtra, body(f), marks(f), f.body.extra, hair(f),
    clothing(f), f.outfitDetails, intimacy(f), scene(f), f.extraDetails, light(f), camera(f), mood(f), joinPieces(f.realism),
  ]
  const text = sentences
    .map((sentence) => sentence.trim().replace(/\.+$/, ''))
    .filter(Boolean)
    .map(capitalise)
    .join('. ')
  return `${text}.`
}

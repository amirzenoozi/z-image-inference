import { NOT_SET, RANDOM } from './constants'

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function unitRandom(seed: number, field: string): number {
  let t = (seed ^ hash(field)) + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Each field rolls independently, so changing one "Random" field never changes another's pick. */
export function pick(options: readonly string[], seed: number, field: string): string {
  return options[Math.floor(unitRandom(seed, field) * options.length)] ?? NOT_SET
}

export function pickSome(options: readonly string[], count: number, seed: number, field: string): string[] {
  const shuffled = [...options].sort((a, b) => unitRandom(seed, `${field}:${a}`) - unitRandom(seed, `${field}:${b}`))
  return shuffled.slice(0, count)
}

export function resolve(value: string, options: readonly string[], seed: number, field: string): string {
  return value === RANDOM ? pick(options, seed, field) : value
}

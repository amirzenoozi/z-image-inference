import { expect, it } from 'vitest'
import englishOptions from '../../locales/en/options.json'
import { CHOICE_OPTIONS } from './choices'
import * as data from './data'
import * as extraData from './extraData'

const isStringList = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const isStringRecord = (value: unknown): value is Readonly<Record<string, string>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string')

/** Every option the builder can show: each exported list's values, and each label → prompt-text table's labels. */
function allOptionValues(): string[] {
  const values = [...Object.values(data), ...Object.values(extraData)].flatMap((value) => {
    if (isStringList(value)) return [...value]
    return isStringRecord(value) ? Object.keys(value) : []
  })
  // The explicit details are a table of wording and tags, keyed by the option
  return [...new Set([...values, ...Object.keys(extraData.EXPLICIT_DETAILS)])].sort()
}

it('gives every prompt builder option a label in en/options.json', () => {
  const labels: Record<string, string> = englishOptions
  expect(allOptionValues().filter((value) => !(value in labels))).toEqual([])
})

it('keeps no label for an option that no longer exists', () => {
  const values = new Set(allOptionValues())
  expect(Object.keys(englishOptions).filter((value) => !values.has(value))).toEqual([])
})

const TRANSLATED = import.meta.glob<Record<string, string>>('../../locales/*/options.json', { eager: true, import: 'default' })

/** The lists shown together in one menu or chip group: each field's choices, and each exported option list. */
function menus(): [string, readonly string[]][] {
  const lists = Object.entries({ ...data, ...extraData }).filter((entry): entry is [string, readonly string[]] => isStringList(entry[1]))
  const choices = Object.entries(CHOICE_OPTIONS).filter((entry): entry is [string, readonly string[]] => isStringList(entry[1]))
  return [...lists, ...choices]
}

it.each(Object.keys(TRANSLATED).map((path) => path.split('/').at(-2) ?? path))('gives the options of one menu different labels in %s', (language) => {
  const labels = TRANSLATED[`../../locales/${language}/options.json`]
  const clashes = menus().flatMap(([menu, values]) => {
    const seen = new Map<string, string>()
    // Values labelled elsewhere (the nudity levels, in builder.json) are not option labels
    return values.filter((value) => value in labels).flatMap((value) => {
      const label = labels[value].toLocaleLowerCase(language)
      const earlier = seen.get(label)
      seen.set(label, value)
      return earlier === undefined ? [] : [`${menu}: "${earlier}" and "${value}" are both "${labels[value]}"`]
    })
  })
  expect(clashes).toEqual([])
})

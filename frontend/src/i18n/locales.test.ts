import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '.'

const FILES = import.meta.glob<Record<string, string>>('../locales/*/*.json', { eager: true, import: 'default' })

function file(language: string, namespace: string): Record<string, string> {
  return FILES[`../locales/${language}/${namespace}.json`]
}

const NAMESPACES = Object.keys(FILES)
  .filter((path) => path.startsWith('../locales/en/'))
  .map((path) => path.slice('../locales/en/'.length, -'.json'.length))

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
// Plural forms a language may add beyond one/other (Intl.PluralRules), so they are not counted as extra keys
const pluralBase = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '')

describe.each(LANGUAGES.filter((language) => language !== 'en'))('%s', (language) => {
  it.each(NAMESPACES)('has every %s text, with the same placeholders, and nothing extra', (namespace) => {
    const english = file('en', namespace)
    const translated = file(language, namespace)
    expect(translated, `src/locales/${language}/${namespace}.json is missing`).toBeDefined()

    const missing = Object.keys(english).filter((key) => !(key in translated) && !key.endsWith('_one'))
    const extra = Object.keys(translated).filter((key) => !(key in english) && !Object.keys(english).some((other) => pluralBase(other) === pluralBase(key)))
    expect(missing, 'missing keys').toEqual([])
    expect(extra, 'keys English does not have').toEqual([])
    for (const [key, text] of Object.entries(translated)) {
      const source = english[key] ?? english[`${pluralBase(key)}_other`]
      expect(placeholders(text), `${namespace}.${key}`).toEqual(placeholders(source))
      expect(text.trim(), `${namespace}.${key} is empty`).not.toBe('')
    }
  })
})

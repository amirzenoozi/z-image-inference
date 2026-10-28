// The UI's language: English is bundled and is the source; the others load once, before the app shows.
// Messages are grouped in namespaces, one JSON file each per language in src/locales/<code>/<namespace>.json.
import builder from '../locales/en/builder.json'
import characters from '../locales/en/characters.json'
import common from '../locales/en/common.json'
import create from '../locales/en/create.json'
import history from '../locales/en/history.json'
import options from '../locales/en/options.json'

export const LANGUAGES = ['en', 'nl', 'it', 'fr', 'de', 'es', 'pt'] as const
export type Language = (typeof LANGUAGES)[number]

const english = { common, create, history, characters, builder }
type Messages = typeof english
type Namespace = keyof Messages
type Catalogue = Record<Namespace, Record<string, string>> & { options: Record<string, string> }

/** "history.deleteAll": a namespace and a key in it, checked against the English files. */
export type MessageKey = { [N in Namespace]: `${N}.${keyof Messages[N] & string}` }[Namespace]
/** A key with plural forms, written in the files as key_one, key_other (and key_many etc. where a language has them). */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer Base}_other` ? Base : never) : never

type Params = Record<string, string | number>

const englishCatalogue: Catalogue = { ...english, options }
let current: Catalogue = englishCatalogue
let currentLanguage: Language = 'en'

export function isLanguage(code: string): code is Language {
  return (LANGUAGES as readonly string[]).includes(code)
}

// Each other language is a separate chunk, fetched only when it is the one chosen
const LOADERS = import.meta.glob<{ default: Record<string, string> }>(['../locales/*/*.json', '!../locales/en/*.json'])

async function loadCatalogue(code: Language): Promise<Catalogue> {
  const namespaces = [...Object.keys(english), 'options'] as (Namespace | 'options')[]
  const files = await Promise.all(namespaces.map((namespace) => LOADERS[`../locales/${code}/${namespace}.json`]()))
  return Object.fromEntries(namespaces.map((namespace, index) => [namespace, files[index].default])) as Catalogue
}

/**
 * Switches the UI to a language, before the app renders. A language that fails to load leaves the app in English,
 * which still works fully, rather than holding it up; the console says why.
 */
export async function loadLanguage(code: string): Promise<void> {
  const language = isLanguage(code) ? code : 'en'
  try {
    current = language === 'en' ? englishCatalogue : await loadCatalogue(language)
    currentLanguage = language
  } catch (error) {
    console.warn(`The ${language} translation could not be loaded; showing English.`, error)
    current = englishCatalogue
    currentLanguage = 'en'
  }
  document.documentElement.lang = currentLanguage
}

export function language(): Language {
  return currentLanguage
}

function lookup(key: string): string {
  const dot = key.indexOf('.')
  const namespace = key.slice(0, dot) as Namespace
  const name = key.slice(dot + 1)
  // A key a translation lacks falls back to English; the locale tests keep every key in every language
  return current[namespace]?.[name] ?? englishCatalogue[namespace][name] ?? key
}

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

/** The text for a key in the current language, with {placeholders} filled in. */
export function t(key: MessageKey, params: Params = {}): string {
  return fill(lookup(key), params)
}

/** The plural form that fits `count` in the current language (key_one, key_other …), with {count} filled in. */
export function tn(key: PluralKey, count: number, params: Params = {}): string {
  const form = new Intl.PluralRules(currentLanguage).select(count)
  const name = `${key}_${form}`
  const template = lookupOptional(name) ?? lookup(`${key}_other`)
  return fill(template, { count: count.toLocaleString(currentLanguage), ...params })
}

function lookupOptional(key: string): string | undefined {
  const dot = key.indexOf('.')
  return current[key.slice(0, dot) as Namespace]?.[key.slice(dot + 1)]
}

/**
 * How a prompt builder option is shown in the menus. Options are English words that go into the prompt as they
 * are, since the models understand English best; only their label is translated.
 */
export function optionLabel(value: string): string {
  return current.options[value] ?? englishCatalogue.options[value] ?? value
}

/** An option's label as a menu or checkbox shows it, starting with a capital; in a sentence use `optionLabel`. */
export function optionTitle(value: string): string {
  const label = optionLabel(value)
  return label.charAt(0).toLocaleUpperCase(currentLanguage) + label.slice(1)
}

/**
 * Text keyed by data rather than code, such as a purpose's label by its id ("builder.modeLabel.portrait"):
 * the translation when there is one, else `fallback`, the text the data itself gives.
 */
export function tOr(key: string, fallback: string, params: Params = {}): string {
  return fill(lookupOptional(key) ?? englishOptional(key) ?? fallback, params)
}

function englishOptional(key: string): string | undefined {
  const dot = key.indexOf('.')
  return englishCatalogue[key.slice(0, dot) as Namespace]?.[key.slice(dot + 1)]
}

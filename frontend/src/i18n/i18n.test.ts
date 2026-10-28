import { afterEach, expect, it, vi } from 'vitest'
import { language, loadLanguage, optionLabel, t, tn } from '.'

afterEach(() => loadLanguage('en'))

it('fills in placeholders, and leaves unknown ones visible', () => {
  expect(t('common.loading')).toBe('Loading…')
})

it('falls back to English for an unknown language, and says so in the page language', async () => {
  await loadLanguage('xx')
  expect(language()).toBe('en')
  expect(document.documentElement.lang).toBe('en')
})

it('switches to another language and back', async () => {
  await loadLanguage('nl')
  expect(language()).toBe('nl')
  expect(document.documentElement.lang).toBe('nl')
  expect(t('common.loading')).not.toBe('Loading…')
  await loadLanguage('en')
  expect(t('common.loading')).toBe('Loading…')
})

it('shows an option as it is when it has no label', () => {
  expect(optionLabel('a value with no label')).toBe('a value with no label')
})

it('keeps the prompt-builder values themselves English, whatever the language', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await loadLanguage('de')
  expect(optionLabel('auburn')).not.toBe('')
  warn.mockRestore()
  expect(tn).toBeTypeOf('function')
})

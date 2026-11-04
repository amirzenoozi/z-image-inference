import { createContext } from 'react'
import type { AbTest } from '../../../lib/abTest'

/** The A/B test running in Create, or null: while one runs, what it locks is turned off wherever it shows (lib/abTest). */
export const AbTestContext = createContext<AbTest | null>(null)

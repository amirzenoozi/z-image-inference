import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { catalog } from '../test/fixtures'
import App from '.'

// History's code never finishes loading here, so the placeholder shown meanwhile can be checked
vi.mock('../pages/history/HistoryPage', () => new Promise(() => {}))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchCatalog: vi.fn(),
  fetchModelStatus: vi.fn(),
  fetchCharacters: vi.fn(),
  fetchJobProgress: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.fetchCatalog).mockResolvedValue(catalog)
  vi.mocked(api.fetchModelStatus).mockResolvedValue({ server_running: true, models: {}, free_bytes: 1e11 })
  vi.mocked(api.fetchCharacters).mockResolvedValue([])
})

it('shows a placeholder, not an empty page, while History’s code loads the first time it is opened', async () => {
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'History' }))
  expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument()
})

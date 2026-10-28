import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { Modal } from './Modal'

function renderModal(actions?: boolean, withNote = true) {
  const onClose = vi.fn()
  render(
    <Modal
      title="Rename image"
      onClose={onClose}
      actionsNote={actions && withNote ? 'The new name shows in History.' : undefined}
      actions={
        actions && (
          <>
            <button type="button">Cancel</button>
            <button type="button">Save</button>
          </>
        )
      }
    >
      <p>Long content</p>
    </Modal>,
  )
  return onClose
}

it('has a header with the title and a close button', async () => {
  const onClose = renderModal(true)
  const dialog = screen.getByRole('dialog', { name: 'Rename image' })
  expect(within(dialog).getByRole('heading', { name: 'Rename image' })).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledOnce()
})

it('puts the actions after the content under a divider, centred on their own', () => {
  renderModal(true, false)
  const actions = screen.getByRole('group', { name: 'Dialog actions' })
  expect(actions).toHaveClass('border-t', 'justify-center')
  expect(screen.getByText('Long content').compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('puts a note on the left and the actions on the right when the footer has a note', () => {
  renderModal(true)
  const actions = screen.getByRole('group', { name: 'Dialog actions' })
  expect(actions).toHaveClass('border-t', 'justify-between')
  const note = within(actions).getByText('The new name shows in History.')
  expect(note.compareDocumentPosition(within(actions).getByRole('button', { name: 'Save' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('scrolls only the content, so the header and the actions stay in view', () => {
  renderModal(true)
  const scrolling = screen.getByText('Long content').parentElement!
  expect(scrolling).toHaveClass('overflow-y-auto')
  expect(scrolling).not.toContainElement(screen.getByRole('heading', { name: 'Rename image' }))
  expect(scrolling).not.toContainElement(screen.getByRole('group', { name: 'Dialog actions' }))
})

it('has no footer when the dialog has no actions', () => {
  renderModal(false)
  expect(screen.queryByRole('group', { name: 'Dialog actions' })).not.toBeInTheDocument()
})

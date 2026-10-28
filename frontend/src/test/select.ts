import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Picks an option from one of the app's Select fields the way a person does: open it, then click the option. */
export async function chooseOption(field: HTMLElement, option: string): Promise<void> {
  await userEvent.click(field)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

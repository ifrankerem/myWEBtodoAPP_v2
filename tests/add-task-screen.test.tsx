import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AddTaskScreen from '@/components/add-task-screen'

describe('AddTaskScreen', () => {
  it('normalizes a whitespace-only title instead of saving an invisible task name', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <AddTaskScreen
        onSave={onSave}
        onCancel={vi.fn()}
        onOpenDrawer={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Title'), '   ')
    await user.click(screen.getByRole('button', { name: /save task/i }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Untitled Task', name: 'Untitled Task' }),
      undefined,
    )
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TasksGridScreen from '@/components/tasks-grid-screen'
import type { Task } from '@/app/page'

const task: Task = {
  id: 'task-1',
  name: 'Write tests',
  title: 'Write tests',
  type: 'text',
  createdDate: new Date('2026-08-05T10:00:00Z'),
  lastEditedDate: new Date('2026-08-05T10:00:00Z'),
}

const baseProps = {
  tasks: [task],
  onTaskClick: vi.fn(),
  onAddTask: vi.fn(),
  onDeleteTask: vi.fn(),
  onOpenDrawer: vi.fn(),
}

describe('TasksGridScreen', () => {
  it('does not expose a dead reorder control when reordering is unavailable', () => {
    render(<TasksGridScreen {...baseProps} isCompletedView />)

    expect(screen.queryByRole('button', { name: /reorder write tests/i })).not.toBeInTheDocument()
  })

  it('restores and persists the grid/list preference', async () => {
    window.localStorage.setItem('task-view', 'list')
    const user = userEvent.setup()
    render(<TasksGridScreen {...baseProps} onReorderTasks={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /list/i })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /grid/i }))

    expect(window.localStorage.getItem('task-view')).toBe('grid')
  })
})

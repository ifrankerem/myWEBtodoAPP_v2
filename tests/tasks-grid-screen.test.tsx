import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TasksGridScreen from '@/components/tasks-grid-screen'
import type { Task } from '@/lib/task'

const task: Task = {
  id: 'task-1',
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
}

describe('TasksGridScreen', () => {
  it('does not expose a dead reorder control when reordering is unavailable', () => {
    render(<TasksGridScreen {...baseProps} isCompletedView />)

    expect(screen.queryByRole('button', { name: /reorder write tests/i })).not.toBeInTheDocument()
  })

  it('restores and persists the Tiles/Details preference', async () => {
    window.localStorage.setItem('task-view', 'list')
    const user = userEvent.setup()
    render(<TasksGridScreen {...baseProps} onReorderTasks={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /views/i }))
    expect(await screen.findByRole('menuitemradio', { name: 'Details' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: 'Tiles' }))

    expect(window.localStorage.getItem('task-view')).toBe('grid')
  })

  it('offers drag reordering only once groups are turned off', async () => {
    const user = userEvent.setup()
    render(<TasksGridScreen {...baseProps} onReorderTasks={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /reorder write tests/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /views/i }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /show in groups/i }))

    expect(screen.getByRole('button', { name: /reorder write tests/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('task-groups')).toBe('off')
  })

  it('waits out the undo window before deleting, and Undo keeps the task', async () => {
    const onDeleteTask = vi.fn()
    const user = userEvent.setup()
    render(<TasksGridScreen {...baseProps} onDeleteTask={onDeleteTask} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('checkbox', { name: /select write tests/i }))
    await user.click(screen.getByRole('button', { name: /delete \(1\)/i }))
    await user.click(await screen.findByRole('button', { name: 'Yes' }))

    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(onDeleteTask).not.toHaveBeenCalled()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TasksGridScreen, { LONG_PRESS_MS } from '@/components/tasks-grid-screen'
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

/* ------------------------------------------------------------------ *
 * Long-press multi-select
 * ------------------------------------------------------------------ */

/** A task in the grid, open unless a case is about the Completed view. */
function gridTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    type: 'text',
    createdDate: new Date('2026-08-05T10:00:00Z'),
    lastEditedDate: new Date('2026-08-05T10:00:00Z'),
    ...overrides,
  }
}

const A = gridTask('A')
const B = gridTask('B')
const C = gridTask('C')

function multiProps(overrides: Record<string, unknown> = {}) {
  return {
    tasks: [A, B, C],
    onTaskClick: vi.fn(),
    onAddTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onToggleComplete: vi.fn(),
    ...overrides,
  }
}

/** The button that opens a task, which is what a press lands on. */
function openButton(id: string) {
  return screen.getByRole('button', { name: new RegExp(`Task ${id}`, 'i') })
}

/** The toolbar count, present only while select mode is on. */
function selectedCount() {
  return screen.queryByText(/^\d+ selected$/)
}

/** Press and hold until the long press opens select mode, then let go. */
async function longPress(element: Element) {
  await act(async () => {
    fireEvent.pointerDown(element)
    vi.advanceTimersByTime(LONG_PRESS_MS)
  })
  await act(async () => {
    fireEvent.pointerUp(element)
  })
}

/** A quick press: down, up and the click a browser sends with it. */
async function tap(element: Element, holdMs = 0) {
  await act(async () => {
    fireEvent.pointerDown(element)
    if (holdMs > 0) vi.advanceTimersByTime(holdMs)
    fireEvent.pointerUp(element)
    fireEvent.click(element)
  })
}

describe('TasksGridScreen long press', () => {
  // Issue case 1
  it('case 1: opens select mode on the task that was held', async () => {
    const props = multiProps()
    vi.useFakeTimers()
    try {
      render(<TasksGridScreen {...props} />)

      await longPress(openButton('A'))

      expect(screen.getByText('1 selected')).toBeInTheDocument()
      // The release after a long press must not also open or complete it.
      expect(props.onTaskClick).not.toHaveBeenCalled()
      expect(props.onToggleComplete).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // Issue case 2
  it('case 2: opens the task on a short press', async () => {
    const props = multiProps()
    vi.useFakeTimers()
    try {
      render(<TasksGridScreen {...props} />)

      await tap(openButton('A'), 200)

      expect(props.onTaskClick).toHaveBeenCalledTimes(1)
      expect(props.onTaskClick.mock.calls[0][0]).toMatchObject({ id: 'A' })
      expect(selectedCount()).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('TasksGridScreen complete several tasks', () => {
  /** Select A by long press, then B and C by tapping, as a user would. */
  async function selectAllThree() {
    vi.useFakeTimers()
    try {
      await longPress(openButton('A'))
    } finally {
      vi.useRealTimers()
    }
    await tap(openButton('B'))
    await tap(openButton('C'))
  }

  // Issue case 3
  it('case 3: counts every task tapped in select mode', async () => {
    render(<TasksGridScreen {...multiProps()} />)
    await selectAllThree()

    expect(screen.getByText('3 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete (3)' })).toBeEnabled()
  })

  // Issue case 4
  it('case 4: completes each selected task once and offers one Undo', async () => {
    const props = multiProps()
    render(<TasksGridScreen {...props} />)
    await selectAllThree()

    await act(async () => {
      screen.getByRole('button', { name: 'Complete (3)' }).click()
    })

    await waitFor(() => expect(props.onToggleComplete).toHaveBeenCalledTimes(3), { timeout: 3000 })
    for (const id of ['A', 'B', 'C']) {
      expect(props.onToggleComplete).toHaveBeenCalledWith(id)
    }

    // Select mode is left behind, and the status offers a single Undo.
    expect(selectedCount()).not.toBeInTheDocument()
    expect(screen.getByText('Moved 3 tasks to Completed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  // Issue case 5
  it('case 5: completes them all again when Undo is pressed', async () => {
    const props = multiProps()
    render(<TasksGridScreen {...props} />)
    await selectAllThree()

    await act(async () => {
      screen.getByRole('button', { name: 'Complete (3)' }).click()
    })
    await waitFor(() => expect(props.onToggleComplete).toHaveBeenCalledTimes(3), { timeout: 3000 })

    await act(async () => {
      screen.getByRole('button', { name: 'Undo' }).click()
    })

    await waitFor(() => expect(props.onToggleComplete).toHaveBeenCalledTimes(6), { timeout: 3000 })
    for (const id of ['A', 'B', 'C']) {
      expect(props.onToggleComplete.mock.calls.filter((call) => call[0] === id)).toHaveLength(2)
    }
  })

  // Issue case 6
  it('case 6: enters select mode from the toolbar with nothing selected', async () => {
    const user = userEvent.setup()
    render(<TasksGridScreen {...multiProps()} />)

    await user.click(screen.getByRole('button', { name: 'Select' }))

    expect(screen.getByText('0 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  // Issue case 7
  it('case 7: completes nothing from the Completed view', async () => {
    const done = [
      gridTask('A', { completed: true }),
      gridTask('B', { completed: true }),
      gridTask('C', { completed: true }),
    ]
    const user = userEvent.setup()
    render(<TasksGridScreen {...multiProps({ tasks: done })} isCompletedView />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(openButton('A'))

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
  })
})

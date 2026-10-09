"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Task } from "@/lib/task"
import { isRepeating, toRepeatRule } from "@/lib/repeat-rule"
import { TASK_GROUPS, taskDueColumn, taskGroup, taskSummary } from "@/lib/task-display"
import { XpIcon } from "@/components/xp-icons"
import {
  animateFly,
  START_BUMP_EVENT,
  wait,
  XpDialog,
  XpMessage,
  XpStatusBar,
  XpSynced,
  XpTaskThumb,
  XpToolbar,
  XpToolButton,
  XpToolSeparator,
  XpWindow,
} from "@/components/xp-ui"

/** Stored values predate the redesign: "grid" is Tiles, "list" is Details. */
type TaskView = "grid" | "list"

interface TasksGridScreenProps {
  tasks: Task[]
  onTaskClick: (task: Task, origin?: Element) => void
  onAddTask: () => void
  onDeleteTask: (taskId: string) => void
  onToggleComplete?: (taskId: string) => void
  onReorderTasks?: (tasks: Task[]) => void
  onBack?: () => void
  isCompletedView?: boolean
}

interface Status {
  text: string
  undo?: () => void
}

const UNDO_WINDOW_MS = 6000

/**
 * How long a task has to be held before the press means "select this" instead of
 * "open this". Long enough not to fire while a finger is still travelling, short
 * enough to feel like holding something.
 */
export const LONG_PRESS_MS = 500

/** How far the pointer may travel and still count as a press rather than a drag. */
const LONG_PRESS_MOVE_PX = 8

interface ItemProps {
  task: Task
  view: TaskView
  selectMode: boolean
  selected: boolean
  animation?: "completing" | "leaving" | "crumpling"
  onOpen: (task: Task, origin: Element) => void
  onCheck: (task: Task, button: HTMLButtonElement) => void
  /** The press a long press is measured from: down, moving, up. */
  onPress?: (task: Task, phase: "start" | "move" | "end", event: PointerEvent) => void
  grip?: { attributes: HTMLAttributes<HTMLButtonElement>; listeners?: HTMLAttributes<HTMLButtonElement> }
  style?: CSSProperties
  setNodeRef?: (node: HTMLElement | null) => void
  dragging?: boolean
}

function TaskItem({ task, view, selectMode, selected, animation, onOpen, onCheck, onPress, grip, style, setNodeRef, dragging }: ItemProps) {
  const repeating = isRepeating(toRepeatRule(task))
  const checked = selectMode ? selected : Boolean(task.completed)
  const checkLabel = selectMode
    ? `Select ${task.title}`
    : task.completed
      ? `Mark ${task.title} as not completed`
      : `Mark ${task.title} as completed`

  const className = [
    "xp-item",
    view === "grid" ? "is-tile" : "is-row",
    selected && "is-selected",
    task.completed && "is-done",
    grip && "has-grip",
    dragging && "is-dragging",
    animation && `is-${animation}`,
  ].filter(Boolean).join(" ")

  const check = (
    <button
      type="button"
      className="xp-check"
      role="checkbox"
      aria-checked={checked}
      aria-label={checkLabel}
      onClick={(event) => onCheck(task, event.currentTarget)}
    >
      <i aria-hidden="true" />
    </button>
  )

  const handle = grip && (
    <button type="button" className="xp-grip" aria-label={`Reorder ${task.title}`} {...grip.attributes} {...grip.listeners} />
  )

  // Reordering starts at the grip, so a press here cannot turn into a drag: the
  // long press does not have to outrace the touch-drag delay.
  const press = onPress && {
    onPointerDown: (event: ReactPointerEvent) => onPress(task, "start", event.nativeEvent),
    onPointerMove: (event: ReactPointerEvent) => onPress(task, "move", event.nativeEvent),
    onPointerUp: (event: ReactPointerEvent) => onPress(task, "end", event.nativeEvent),
    onPointerCancel: (event: ReactPointerEvent) => onPress(task, "end", event.nativeEvent),
  }

  const open = (
    <button type="button" className="xp-item-open" onClick={(event) => onOpen(task, event.currentTarget.querySelector(".xp-thumb") ?? event.currentTarget)} {...press}>
      <XpTaskThumb task={task} size={view === "grid" ? 44 : 22} repeating={repeating} />
      {view === "grid" ? (
        <span className="xp-item-text">
          <b title={task.title}>{task.title}</b>
          <small>{taskSummary(task)}</small>
        </span>
      ) : (
        <>
          <span className="xp-item-name">{task.title}</span>
          <span className="xp-item-due">{taskDueColumn(task)}</span>
        </>
      )}
    </button>
  )

  return (
    <div ref={setNodeRef} style={style} className={className} data-task-id={task.id}>
      {view === "grid" ? <>{open}{check}{handle}</> : <>{check}{open}{handle}</>}
    </div>
  )
}

function SortableTaskItem(props: Omit<ItemProps, "grip" | "style" | "setNodeRef" | "dragging">) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id })
  return (
    <TaskItem
      {...props}
      setNodeRef={setNodeRef}
      dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      grip={{ attributes: attributes as HTMLAttributes<HTMLButtonElement>, listeners: listeners as HTMLAttributes<HTMLButtonElement> }}
    />
  )
}

export default function TasksGridScreen({
  tasks,
  onTaskClick,
  onAddTask,
  onDeleteTask,
  onToggleComplete,
  onReorderTasks,
  onBack,
  isCompletedView = false,
}: TasksGridScreenProps) {
  const [view, setView] = useState<TaskView>("grid")
  const [groups, setGroups] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [animations, setAnimations] = useState<Record<string, ItemProps["animation"]>>({})
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const pendingDelete = useRef<{ ids: string[]; timer: number } | null>(null)
  const statusTimer = useRef<number | undefined>(undefined)
  const busy = useRef(false)

  useEffect(() => {
    const storedView = window.localStorage.getItem("task-view")
    if (storedView === "grid" || storedView === "list") setView(storedView)
    if (window.localStorage.getItem("task-groups") === "off") setGroups(false)
  }, [])

  // Deletes wait out the undo window; leaving the screen commits them.
  const commitPendingDelete = () => {
    const pending = pendingDelete.current
    if (!pending) return
    window.clearTimeout(pending.timer)
    pendingDelete.current = null
    pending.ids.forEach(onDeleteTask)
  }
  const commitRef = useRef(commitPendingDelete)
  commitRef.current = commitPendingDelete
  useEffect(() => () => {
    commitRef.current()
    window.clearTimeout(statusTimer.current)
  }, [])

  // A press held as the screen goes must not fire against a task list nobody
  // sees any more.
  useEffect(() => () => {
    const press = pressRef.current
    if (press) window.clearTimeout(press.timer)
    pressRef.current = null
  }, [])

  const showStatus = (next: Status | null) => {
    window.clearTimeout(statusTimer.current)
    setStatus(next)
    if (next) statusTimer.current = window.setTimeout(() => setStatus(null), UNDO_WINDOW_MS)
  }

  const switchView = (next: TaskView) => {
    setView(next)
    setMenuOpen(false)
    window.localStorage.setItem("task-view", next)
  }

  const toggleGroups = () => {
    const next = !groups
    setGroups(next)
    setMenuOpen(false)
    window.localStorage.setItem("task-groups", next ? "on" : "off")
    if (!next && onReorderTasks) showStatus({ text: "Drag the dotted handle to reorder tasks." })
  }

  const query = search.trim().toLowerCase()
  const visible = useMemo(
    () => tasks.filter((task) =>
      !hiddenIds.includes(task.id) &&
      (!query || task.title.toLowerCase().includes(query) || (task.detail ?? "").toLowerCase().includes(query))),
    [tasks, hiddenIds, query],
  )

  const grouped = !isCompletedView && groups && !query
  const canReorder = Boolean(onReorderTasks) && !isCompletedView && !groups && !selectMode && !query

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorderTasks) return
    const oldIndex = tasks.findIndex((task) => task.id === active.id)
    const newIndex = tasks.findIndex((task) => task.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorderTasks(arrayMove(tasks, oldIndex, newIndex))
    showStatus({ text: "New order saved." })
  }

  const openTask = (task: Task, origin: Element) => {
    // The click a browser sends after a long press belongs to that press.
    if (spentPressRef.current) {
      spentPressRef.current = false
      return
    }
    if (selectMode) {
      toggleSelected(task.id)
      return
    }
    commitPendingDelete()
    onTaskClick(task, origin)
  }

  const toggleSelected = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  // Holding a task is how several of them are selected at once: the screen has a
  // Select button for anyone who would rather not hold anything, but a press is
  // the shortcut. The release that follows must not also open the task, so the
  // click a browser sends afterwards is spent here instead.
  const pressRef = useRef<{ id: string; timer: number; x: number; y: number } | null>(null)
  const spentPressRef = useRef(false)
  // The timer fires after the press began, so it asks for the mode as it is then.
  const selectModeRef = useRef(selectMode)
  selectModeRef.current = selectMode

  const clearPress = () => {
    const press = pressRef.current
    if (!press) return
    window.clearTimeout(press.timer)
    pressRef.current = null
  }

  const handlePress = (task: Task, phase: "start" | "move" | "end", event: PointerEvent) => {
    if (phase === "end") {
      clearPress()
      return
    }

    if (phase === "start") {
      clearPress()
      spentPressRef.current = false
      // Reordering is already off in select mode, and the grip is the only drag
      // handle, so a press here is never the start of a reorder.
      pressRef.current = {
        id: task.id,
        x: event.clientX,
        y: event.clientY,
        timer: window.setTimeout(() => {
          pressRef.current = null
          spentPressRef.current = true
          if (selectModeRef.current) {
            toggleSelected(task.id)
            return
          }
          setSelectMode(true)
          setSelected([task.id])
        }, LONG_PRESS_MS),
      }
      return
    }

    // A press that has become a drag is not a press any more.
    const press = pressRef.current
    if (!press) return
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (moved > LONG_PRESS_MOVE_PX) clearPress()
  }

  const setAnimation = (id: string, animation: ItemProps["animation"]) =>
    setAnimations((current) => ({ ...current, [id]: animation }))
  const clearAnimation = (id: string) =>
    setAnimations((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })

  /**
   * The row a toggle completes leaves the list and a focused checkbox goes with
   * it, which would drop a keyboard user back at the top of the page to tab
   * through everything again. Focus follows the neighbour instead.
   */
  const focusNeighbourCheck = (button: HTMLButtonElement) => {
    const row = button.closest(".xp-item")
    const neighbour = row?.nextElementSibling?.querySelector<HTMLElement>(".xp-check")
      ?? row?.previousElementSibling?.querySelector<HTMLElement>(".xp-check")
    neighbour?.focus()
  }

  const handleCheck = async (task: Task, button: HTMLButtonElement) => {
    if (selectMode) {
      toggleSelected(task.id)
      return
    }
    if (!onToggleComplete || busy.current) return
    busy.current = true
    const item = button.closest(".xp-item")

    if (task.completed) {
      setAnimation(task.id, "leaving")
      await wait(260)
      onToggleComplete(task.id)
      focusNeighbourCheck(button)
      clearAnimation(task.id)
      showStatus({ text: `Restored “${task.title}” to My Tasks.`, undo: () => { onToggleComplete(task.id); showStatus(null) } })
    } else {
      setAnimation(task.id, "completing")
      await wait(200)
      await animateFly(item?.querySelector(".xp-thumb") ?? null, document.querySelector("[data-xp-start]"))
      window.dispatchEvent(new Event(START_BUMP_EVENT))
      setAnimation(task.id, "leaving")
      await wait(240)
      onToggleComplete(task.id)
      focusNeighbourCheck(button)
      clearAnimation(task.id)
      showStatus({ text: `Moved “${task.title}” to Completed.`, undo: () => { onToggleComplete(task.id); showStatus(null) } })
    }
    busy.current = false
  }

  const confirmDelete = async () => {
    const ids = confirmIds ?? []
    setConfirmIds(null)
    ids.forEach((id) => setAnimation(id, "crumpling"))
    await wait(470)
    commitPendingDelete()
    setHiddenIds((current) => [...current, ...ids])
    ids.forEach(clearAnimation)
    setSelectMode(false)
    setSelected([])

    const timer = window.setTimeout(commitPendingDelete, UNDO_WINDOW_MS)
    pendingDelete.current = { ids, timer }
    const first = tasks.find((task) => task.id === ids[0])
    showStatus({
      text: ids.length === 1 ? `Deleted “${first?.title ?? "task"}”.` : `Deleted ${ids.length} tasks.`,
      undo: () => {
        window.clearTimeout(timer)
        pendingDelete.current = null
        setHiddenIds((current) => current.filter((id) => !ids.includes(id)))
        showStatus({ text: "Delete undone." })
      },
    })
  }

  const restoreSelected = () => {
    selected.forEach((id) => onToggleComplete?.(id))
    showStatus({ text: `Restored ${selected.length} task${selected.length === 1 ? "" : "s"} to My Tasks.` })
    setSelectMode(false)
    setSelected([])
  }

  /**
   * Completes everything selected in one go, with one Undo for the lot. The undo
   * asks for each task again: the page decides from the list as it is now, so a
   * second call is the restore.
   */
  const completeSelected = async () => {
    const ids = selected.filter((id) => !tasks.find((task) => task.id === id)?.completed)
    if (!onToggleComplete || ids.length === 0) return
    busy.current = true
    ids.forEach((id) => setAnimation(id, "leaving"))
    await wait(240)
    ids.forEach((id) => onToggleComplete(id))
    ids.forEach(clearAnimation)
    busy.current = false

    setSelectMode(false)
    setSelected([])
    const first = tasks.find((task) => task.id === ids[0])
    showStatus({
      text: ids.length === 1
        ? `Moved “${first?.title ?? "task"}” to Completed.`
        : `Moved ${ids.length} tasks to Completed.`,
      undo: () => { ids.forEach((id) => onToggleComplete(id)); showStatus(null) },
    })
  }

  const title = isCompletedView ? "Completed" : "My Tasks"
  const icon = isCompletedView ? "folderDone" : "folderTasks"

  const renderItem = (task: Task, sortable: boolean) => {
    const props = {
      task,
      view,
      selectMode,
      selected: selected.includes(task.id),
      animation: animations[task.id],
      onOpen: openTask,
      onCheck: handleCheck,
      onPress: handlePress,
    }
    return sortable ? <SortableTaskItem key={task.id} {...props} /> : <TaskItem key={task.id} {...props} />
  }

  const columns = view === "list" && (
    <div className={`xp-cols${canReorder ? " has-grip" : ""}`} aria-hidden="true">
      <span /><span className="is-sorted">Name</span><span>Due</span>{canReorder && <span />}
    </div>
  )

  let collection
  if (visible.length === 0) {
    collection = query ? (
      <div className="xp-empty">
        <XpIcon name="search" size={44} />
        <b>No tasks match “{search.trim()}”.</b>
        <p>Check the spelling, or search for a word from the details.</p>
        <button type="button" className="xp-btn" onClick={() => setSearch("")}>Clear search</button>
      </div>
    ) : isCompletedView ? (
      <div className="xp-empty">
        <XpIcon name="folderDone" size={48} />
        <b>No completed tasks yet.</b>
        <p>Tick a task in My Tasks and it moves here.</p>
      </div>
    ) : (
      <div className="xp-empty">
        <XpIcon name="newTask" size={48} />
        <b>No tasks yet.</b>
        <p>Create your first task and it appears here.</p>
        <button type="button" className="xp-btn is-default" onClick={onAddTask}>New Task</button>
      </div>
    )
  } else if (grouped) {
    collection = (
      <>
        {columns}
        {TASK_GROUPS.map((group) => {
          const items = visible.filter((task) => taskGroup(task) === group)
          if (items.length === 0) return null
          return (
            <section key={group} aria-label={group}>
              <h3 className="xp-group">{group}<span>{items.length}</span></h3>
              <div className={`xp-items ${view === "grid" ? "is-tiles" : "is-rows"}`}>{items.map((task) => renderItem(task, false))}</div>
            </section>
          )
        })}
      </>
    )
  } else {
    const list = <div className={`xp-items ${view === "grid" ? "is-tiles is-flat" : "is-rows"}`}>{visible.map((task) => renderItem(task, canReorder))}</div>
    collection = (
      <>
        {columns}
        {canReorder ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visible.map((task) => task.id)} strategy={view === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
              {list}
            </SortableContext>
          </DndContext>
        ) : list}
      </>
    )
  }

  const shownCount = tasks.filter((task) => !hiddenIds.includes(task.id)).length
  const defaultStatus = selectMode
    ? "Tap tasks to select them"
    : isCompletedView
      ? `${shownCount} completed task${shownCount === 1 ? "" : "s"}`
      : `${shownCount} task${shownCount === 1 ? "" : "s"}`

  return (
    <XpWindow title={title} icon={icon}>
      <XpToolbar label={`${title} commands`}>
        {selectMode ? (
          <>
            <XpToolButton icon="back" label="Cancel" onClick={() => { setSelectMode(false); setSelected([]) }} />
            <span className="xp-tcount">{selected.length} selected</span>
            <span className="xp-tspace" />
            {isCompletedView && <XpToolButton icon="restore" label="Restore" disabled={!selected.length} onClick={restoreSelected} />}
            {!isCompletedView && (
              <XpToolButton
                icon="check"
                label={selected.length ? `Complete (${selected.length})` : "Complete"}
                disabled={!selected.length}
                onClick={() => void completeSelected()}
              />
            )}
            <XpToolButton
              icon="del"
              label={selected.length ? `Delete (${selected.length})` : "Delete"}
              danger
              disabled={!selected.length}
              onClick={() => setConfirmIds(selected)}
            />
          </>
        ) : (
          <>
            <XpToolButton icon="back" ariaLabel="Back" disabled={!onBack} onClick={onBack} />
            <div className="xp-anchor">
              <button
                type="button"
                className="xp-tbtn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <XpIcon name="views" size={24} />
                <span>Views</span>
                <span className="xp-caret" aria-hidden="true" />
              </button>
              {menuOpen && (
                <>
                  <button type="button" className="xp-menu-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
                  <div className="xp-menu" role="menu" aria-label="View">
                    <button type="button" role="menuitemradio" aria-checked={view === "grid"} onClick={() => switchView("grid")}>
                      <span className="xp-mark is-dot" />Tiles
                    </button>
                    <button type="button" role="menuitemradio" aria-checked={view === "list"} onClick={() => switchView("list")}>
                      <span className="xp-mark is-dot" />Details
                    </button>
                    {!isCompletedView && (
                      <>
                        <div className="xp-menu-sep" />
                        <button type="button" role="menuitemcheckbox" aria-checked={groups} onClick={toggleGroups}>
                          <span className="xp-mark is-tick" />Show in groups
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <XpToolSeparator />
            {!isCompletedView && <XpToolButton icon="newTask" label="New Task" onClick={onAddTask} />}
            <XpToolButton icon="check" label="Select" disabled={tasks.length === 0} onClick={() => { setSelectMode(true); setSelected([]) }} />
            <XpToolButton icon="del" label="Delete" disabled={tasks.length === 0} onClick={() => { setSelectMode(true); setSelected([]) }} />
          </>
        )}
      </XpToolbar>

      <div className="xp-addr">
        <span className="xp-addr-label">Address</span>
        <label className="xp-addr-field">
          <XpIcon name={icon} size={18} />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${title}`} aria-label={`Search ${title}`} />
        </label>
        <span className="xp-go" aria-hidden="true"><XpIcon name="go" size={22} /></span>
      </div>

      <div className="xp-window-body">{collection}</div>

      <XpStatusBar>
        <span className="xp-sb is-grow" role="status">
          <span>{status?.text ?? defaultStatus}</span>
          {status?.undo && <button type="button" className="xp-link" onClick={status.undo}>Undo</button>}
        </span>
        <XpSynced />
      </XpStatusBar>

      {confirmIds && (
        <XpDialog
          title="Confirm Task Delete"
          icon="recycle"
          role="alertdialog"
          onClose={() => setConfirmIds(null)}
          buttons={
            <>
              <button type="button" className="xp-btn is-default" onClick={confirmDelete} autoFocus>Yes</button>
              <button type="button" className="xp-btn" onClick={() => setConfirmIds(null)}>No</button>
            </>
          }
        >
          <XpMessage icon="recycle">
            <p>
              {confirmIds.length === 1
                ? `Are you sure you want to delete “${tasks.find((task) => task.id === confirmIds[0])?.title}”?`
                : `Are you sure you want to delete these ${confirmIds.length} tasks?`}
            </p>
            <p style={{ color: "var(--xp-muted)" }}>You can undo this from the status bar for a few seconds.</p>
          </XpMessage>
        </XpDialog>
      )}
    </XpWindow>
  )
}

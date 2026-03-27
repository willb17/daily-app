'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Priority = 'must' | 'should' | 'could'

interface Task {
  id: number
  type: 'task' | 'anchor'
  text: string
  done: boolean
  priority?: Priority
  anchorH?: number | null
  anchorMin?: number | null
  carriedFrom?: string
  fromGoal?: boolean
}

interface DayData { tasks: Task[]; notes: string }

const SNOOZE_KEY = 'daily-nudge-snooze'
const SNOOZE_DURATION = 2 * 60 * 60 * 1000 // 2 hours

function getSnoozed(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}')
  } catch { return {} }
}

function snoozeTask(id: number) {
  const snoozed = getSnoozed()
  snoozed[id] = Date.now() + SNOOZE_DURATION
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozed))
}

function isCurrentlySnoozed(id: number): boolean {
  const snoozed = getSnoozed()
  const until = snoozed[id]
  if (!until) return false
  if (Date.now() > until) {
    // expired — remove
    const updated = getSnoozed()
    delete updated[id]
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(updated))
    return false
  }
  return true
}

const priDot = (p?: Priority) =>
  p === 'must' ? '●' : p === 'should' ? '◐' : '○'

const priLabel = (p?: Priority) =>
  p === 'must' ? 'Must' : p === 'should' ? 'Should' : 'Could'

export default function NudgePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Swipe state
  const cardRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      if (!uid) { setLoading(false); return }
      loadTasks(uid)
    })
  }, [])

  async function loadTasks(uid: string) {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('daily_entries')
      .select('tasks')
      .eq('user_id', uid)
      .eq('date', today)
      .single()

    const all: Task[] = (data as DayData | null)?.tasks ?? []
    const nudgeable = all.filter(t =>
      t.type === 'task' &&
      !t.done &&
      (t.priority === 'must' || t.priority === 'should' || !t.priority) &&
      !isCurrentlySnoozed(t.id)
    )
    // Sort: must first, then should
    nudgeable.sort((a, b) => {
      const order = { must: 0, should: 1, could: 2 }
      return (order[a.priority ?? 'should'] ?? 1) - (order[b.priority ?? 'should'] ?? 1)
    })
    setTasks(nudgeable)
    setLoading(false)
  }

  async function markDone(taskId: number) {
    if (!userId) return
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('daily_entries')
      .select('tasks, notes')
      .eq('user_id', userId)
      .eq('date', today)
      .single()

    if (data) {
      const updated = (data.tasks as Task[]).map(t =>
        t.id === taskId ? { ...t, done: true } : t
      )
      await supabase
        .from('daily_entries')
        .upsert(
          { user_id: userId, date: today, tasks: updated, notes: data.notes },
          { onConflict: 'user_id,date' }
        )
    }

    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  function doSnooze(taskId: number) {
    snoozeTask(taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  const advance = useCallback((action: 'done' | 'snooze') => {
    const task = tasks[0]
    if (!task) return
    if (action === 'done') markDone(task.id)
    else doSnooze(task.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, userId])

  // Pointer-based swipe
  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true
    startX.current = e.clientX
    currentX.current = 0
    cardRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !cardRef.current) return
    currentX.current = e.clientX - startX.current
    const dx = currentX.current
    cardRef.current.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`
    cardRef.current.classList.toggle('swiping-right', dx > 30)
    cardRef.current.classList.toggle('swiping-left', dx < -30)
  }

  function onPointerUp() {
    if (!dragging.current || !cardRef.current) return
    dragging.current = false
    const dx = currentX.current
    cardRef.current.style.transition = 'transform 0.25s'

    if (dx > 80) {
      // swipe right = done
      cardRef.current.style.transform = `translateX(400px) rotate(15deg)`
      setTimeout(() => {
        advance('done')
        if (cardRef.current) {
          cardRef.current.style.transition = ''
          cardRef.current.style.transform = ''
        }
      }, 250)
    } else if (dx < -80) {
      // swipe left = snooze
      cardRef.current.style.transform = `translateX(-400px) rotate(-15deg)`
      setTimeout(() => {
        advance('snooze')
        if (cardRef.current) {
          cardRef.current.style.transition = ''
          cardRef.current.style.transform = ''
        }
      }, 250)
    } else {
      // snap back
      cardRef.current.style.transform = ''
      setTimeout(() => { if (cardRef.current) cardRef.current.style.transition = '' }, 250)
    }

    cardRef.current.classList.remove('swiping-right', 'swiping-left')
  }

  if (loading) {
    return (
      <div style={{
        background: 'var(--paper)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--mono)',
        fontSize: '11px',
        color: 'var(--ink-faint)',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}>
        loading...
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="nudge-page">
        <div className="nudge-header">Daily</div>
        <div className="nudge-subheader">Sign in to see your tasks</div>
        <Link href="/" className="nudge-back-link">← Go to app</Link>
      </div>
    )
  }

  const task = tasks[0]

  if (!task) {
    return (
      <div className="nudge-page">
        <div className="nudge-header">Daily — Nudge</div>
        <div className="nudge-empty">
          <div className="nudge-empty-icon">○</div>
          <div className="nudge-empty-text">
            No urgent tasks right now.<br />
            All must &amp; should tasks are done or snoozed.
          </div>
          <Link href="/" className="nudge-back-link">← Back to today</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="nudge-page">
      <div className="nudge-header">Daily — Nudge</div>
      <div className="nudge-subheader">What needs your attention?</div>

      <div className="nudge-card-stack">
        {/* Show ghost of next card behind */}
        {tasks[1] && (
          <div className="nudge-card" style={{ transform: 'scale(0.96) translateY(8px)', zIndex: 0, pointerEvents: 'none', opacity: 0.5 }}>
            <div className="nudge-card-priority">
              <span className={`nudge-card-priority-dot ${tasks[1].priority ?? 'should'}`}>
                {priDot(tasks[1].priority)}
              </span>
              {priLabel(tasks[1].priority)}
            </div>
            <div className="nudge-card-text">{tasks[1].text}</div>
          </div>
        )}

        {/* Active card */}
        <div
          ref={cardRef}
          className="nudge-card"
          style={{ zIndex: 1 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="nudge-card-priority">
            <span className={`nudge-card-priority-dot ${task.priority ?? 'should'}`}>
              {priDot(task.priority)}
            </span>
            {priLabel(task.priority)}
          </div>
          <div className="nudge-card-text">{task.text}</div>
          <div className="nudge-card-hint">swipe → done · swipe ← snooze 2h</div>
        </div>
      </div>

      <div className="nudge-actions">
        <button className="nudge-btn" onClick={() => advance('snooze')}>
          ← Snooze 2h
        </button>
        <button className="nudge-btn primary" onClick={() => advance('done')}>
          Done →
        </button>
      </div>

      <div className="nudge-counter">
        {tasks.length} task{tasks.length !== 1 ? 's' : ''} remaining
      </div>

      <Link href="/" style={{ marginTop: '32px' }} className="nudge-back-link">
        ← Back to today
      </Link>
    </div>
  )
}

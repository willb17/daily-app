'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// ── TYPES ──
interface Task {
  id: number
  type: 'task' | 'anchor'
  text: string
  done: boolean
  anchorH?: number | null
  anchorMin?: number | null
  carriedFrom?: string
  fromGoal?: boolean
}
interface DayData { tasks: Task[]; notes: string }
interface Goal { id: number; text: string; icon: string }
interface ArchiveEntry { date: string; tasks: Task[]; notes: string }

// ── MODULE-LEVEL STATE ──
// These are module-level so all the imperative DOM functions can reference them
// without prop-drilling. They're reset in useEffect when the component mounts.
let state: DayData = { tasks: [], notes: '' }
let currentType: 'task' | 'anchor' = 'task'
let currentUserId = ''
let cachedGoals: Goal[] = []
let cachedArchiveEntries: ArchiveEntry[] = []
let cachedYesterdayData: DayData | null = null
let cachedSettingsEmail = ''

let focusDuration = 25
let focusRemaining = 25 * 60
let focusInterval: ReturnType<typeof setInterval> | null = null
let focusRunning = false
let focusTaskId: number | null = null
let gateDecisions: Record<number, 'keep' | 'drop' | null> = {}

// ── UTILS ──
const TODAY_KEY = () => new Date().toISOString().split('T')[0]

function getYesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

// ── SUPABASE PERSISTENCE ──
// Fire-and-forget upsert for today's entry. UI updates are immediate (optimistic).
function saveDay(data: DayData) {
  if (!currentUserId) return
  supabase
    .from('daily_entries')
    .upsert(
      { user_id: currentUserId, date: TODAY_KEY(), tasks: data.tasks, notes: data.notes },
      { onConflict: 'user_id,date' }
    )
    .then(({ error }) => { if (error) console.error('saveDay:', error) })
}

async function saveSettings() {
  if (!currentUserId) return
  const emailEl = document.getElementById('settingsEmail') as HTMLInputElement | null
  const phoneEl = document.getElementById('settingsPhone') as HTMLInputElement | null
  const timeEl = document.getElementById('settingsTime') as HTMLInputElement | null
  const statusEl = document.getElementById('settingsStatus')
  const email = emailEl?.value || ''
  const phone = phoneEl?.value || ''
  const wake_time = timeEl?.value || ''
  cachedSettingsEmail = email

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: currentUserId, email, phone, wake_time }, { onConflict: 'user_id' })

  if (statusEl) {
    statusEl.textContent = error ? '✗ Save failed' : '✓ Saved'
    statusEl.className = 'notify-status' + (error ? '' : ' configured')
  }
}

function applySettings(s: { email?: string; phone?: string; wake_time?: string } | null) {
  if (!s) return
  const emailEl = document.getElementById('settingsEmail') as HTMLInputElement | null
  const phoneEl = document.getElementById('settingsPhone') as HTMLInputElement | null
  const timeEl = document.getElementById('settingsTime') as HTMLInputElement | null
  const statusEl = document.getElementById('settingsStatus')
  if (s.email && emailEl) { emailEl.value = s.email; cachedSettingsEmail = s.email }
  if (s.phone && phoneEl) phoneEl.value = s.phone
  if (s.wake_time && timeEl) timeEl.value = s.wake_time
  if ((s.email || s.phone) && statusEl) {
    statusEl.textContent = '✓ Saved'
    statusEl.className = 'notify-status configured'
  }
}

// ── GOALS (Supabase rows) ──
const GOAL_ICONS = ['◎', '▷', '◇', '△', '□', '○', '⬡', '◈']

function loadGoals(): Goal[] { return cachedGoals }

async function addGoal() {
  if (!currentUserId) return
  const input = document.getElementById('goalInput') as HTMLInputElement | null
  if (!input) return
  const text = input.value.trim()
  if (!text) return
  const icon = GOAL_ICONS[cachedGoals.length % GOAL_ICONS.length]

  const { data, error } = await supabase
    .from('goals')
    .insert({ user_id: currentUserId, text, icon })
    .select()
    .single()

  if (!error && data) {
    cachedGoals.push({ id: data.id, text: data.text, icon: data.icon })
    renderGoals()
  }
  input.value = ''
  input.focus()
}

async function deleteGoal(id: number) {
  await supabase.from('goals').delete().eq('id', id).eq('user_id', currentUserId)
  cachedGoals = cachedGoals.filter(g => g.id !== id)
  renderGoals()
}

function nudgeGoal(id: number) {
  const goal = cachedGoals.find(g => g.id === id)
  if (!goal) return
  const alreadyAdded = state.tasks.some(t => t.text === goal.text && t.type === 'task')
  if (!alreadyAdded) {
    state.tasks.push({ id: Date.now(), text: goal.text, type: 'task', done: false, fromGoal: true })
    saveDay(state)
    renderTasks()
    updateStats()
  }
  const btn = document.querySelector(`[data-goal-nudge="${id}"]`) as HTMLElement | null
  if (btn) { btn.textContent = '✓ added'; btn.className = 'goal-nudge-btn added' }
}

async function seedGoal(text: string) {
  if (cachedGoals.some(g => g.text === text)) return
  if (!currentUserId) return
  const icon = GOAL_ICONS[cachedGoals.length % GOAL_ICONS.length]
  const { data, error } = await supabase
    .from('goals')
    .insert({ user_id: currentUserId, text, icon })
    .select()
    .single()
  if (!error && data) {
    cachedGoals.push({ id: data.id, text: data.text, icon: data.icon })
    renderGoals()
  }
}

// ── ARCHIVE (Supabase daily_entries, past dates) ──
async function renderArchive() {
  if (!currentUserId) return
  const { data } = await supabase
    .from('daily_entries')
    .select('date, tasks, notes')
    .eq('user_id', currentUserId)
    .neq('date', TODAY_KEY())
    .order('date', { ascending: false })

  cachedArchiveEntries = (data ?? []).map(row => ({
    date: row.date,
    tasks: (row.tasks ?? []) as Task[],
    notes: row.notes ?? '',
  }))

  const el = document.getElementById('archiveList')
  if (!el) return
  if (!cachedArchiveEntries.length) {
    el.innerHTML = '<div class="empty-state">No past days yet. Close a day to start building your archive.</div>'
    return
  }
  el.innerHTML = cachedArchiveEntries.map(row => {
    const tasks = row.tasks.filter(t => t.type === 'task')
    const done = tasks.filter(t => t.done).length
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0
    const dateDisp = new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    return `<div class="archive-item" onclick="viewArchiveDay('${row.date}')">
      <div class="archive-date">${dateDisp}</div>
      <div class="archive-stats">${tasks.length} tasks · ${row.tasks.filter(t => t.type === 'anchor').length} anchors</div>
      <div class="archive-completion">${pct}% done</div>
    </div>`
  }).join('')
}

// archiveToday: data is already persisted via saveDay; just refresh the archive list
function archiveToday() {
  renderArchive()
}

function viewArchiveDay(dateKey: string) {
  const row = cachedArchiveEntries.find(e => e.date === dateKey)
  if (!row) return
  const anchors = row.tasks.filter(t => t.type === 'anchor')
  const tasks = row.tasks.filter(t => t.type === 'task')
  const done = tasks.filter(t => t.done).length
  const dateDisp = new Date(dateKey + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const dateEl = document.getElementById('modalDate')
  const contentEl = document.getElementById('modalContent')
  const modal = document.getElementById('previewModal')
  if (dateEl) dateEl.textContent = dateDisp
  if (contentEl) contentEl.textContent =
    `ANCHORS\n${anchors.length ? anchors.map(a => `  • ${a.text}`).join('\n') : '  (none)'}\n\nTASKS\n${tasks.length ? tasks.map(t => `  ${t.done ? '✓' : '○'} ${t.text}`).join('\n') : '  (none)'}\n\nCOMPLETION: ${done} / ${tasks.length} tasks\n\nNOTES\n${row.notes || '  (none)'}`
  if (modal) modal.classList.add('open')
}

// ── UTILS ──
function escapeHTML(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

// ── HEADER ──
function updateDayHeader() {
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  const dateEl = document.getElementById('todayDate')
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', opts)
  const start = new Date(now.getFullYear(), 0, 0)
  const dayNum = Math.floor((now.getTime() - start.getTime()) / 86400000)
  const daysInYear = isLeapYear(now.getFullYear()) ? 366 : 365
  const dayEl = document.getElementById('dayOfYear')
  if (dayEl) dayEl.textContent = `Day ${dayNum} of ${daysInYear}`
  const yearEl = document.getElementById('thisYear')
  if (yearEl) yearEl.textContent = String(now.getFullYear())
}

// ── DAY PROGRESS ──
function updateDayProgress() {
  const now = new Date()
  const dayStart = new Date(now); dayStart.setHours(6, 0, 0, 0)
  const dayEnd = new Date(now); dayEnd.setHours(23, 0, 0, 0)
  const dayPct = Math.min(100, Math.max(0, ((now.getTime() - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * 100))
  const dpEl = document.getElementById('dayProgress')
  if (dpEl) dpEl.style.width = dayPct + '%'
  const workEnd = new Date(now); workEnd.setHours(18, 0, 0, 0)
  const workPct = Math.min(100, Math.max(0, ((now.getTime() - dayStart.getTime()) / (workEnd.getTime() - dayStart.getTime())) * 100))
  const p6El = document.getElementById('progress6pm')
  if (p6El) p6El.style.width = workPct + '%'
  const eveningStart = new Date(now); eveningStart.setHours(18, 0, 0, 0)
  const eveningEnd = new Date(now); eveningEnd.setHours(23, 0, 0, 0)
  const eveningPct = Math.min(100, Math.max(0, ((now.getTime() - eveningStart.getTime()) / (eveningEnd.getTime() - eveningStart.getTime())) * 100))
  const p11El = document.getElementById('progress11pm')
  if (p11El) p11El.style.width = eveningPct + '%'
}

// ── COUNTDOWNS ──
function setClockValue(id: string, ms: number) {
  if (ms < 0) ms = 0
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const sec = `:${String(s).padStart(2, '0')}`
  const el = document.getElementById(id)
  if (!el) return
  const span = el.querySelector('.cd-seconds')
  if (el.childNodes[0]) el.childNodes[0].textContent = hm
  if (span) span.textContent = sec
}

function updateCountdowns() {
  const now = new Date()
  const six = new Date(now); six.setHours(18, 0, 0, 0)
  if (now > six) six.setDate(six.getDate() + 1)
  setClockValue('cd6pm', six.getTime() - now.getTime())

  const eleven = new Date(now); eleven.setHours(23, 0, 0, 0)
  const isPastSix = now >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0)
  const eveningEl = document.getElementById('cd11pm')
  const eveningLabel = document.querySelector('.countdown-cell-big:last-child .cd-label-big')
  const eveningSub = document.querySelector('.countdown-cell-big:last-child .cd-sublabel')
  if (eveningEl) {
    if (isPastSix) {
      const rem = eleven.getTime() - now.getTime() > 0 ? eleven.getTime() - now.getTime() : 0
      setClockValue('cd11pm', rem)
      eveningEl.className = 'cd-value-big' + (rem < 3600000 ? ' red' : '')
      if (eveningLabel) eveningLabel.textContent = '→ 11 PM'
      if (eveningSub) eveningSub.textContent = 'evening ends'
      eveningEl.style.opacity = '1'
    } else {
      const face = eveningEl.querySelector('.cd-seconds')
      if (eveningEl.childNodes[0]) eveningEl.childNodes[0].textContent = '05:00'
      if (face) face.textContent = ':00'
      eveningEl.className = 'cd-value-big'
      eveningEl.style.opacity = '0.25'
      if (eveningLabel) eveningLabel.textContent = '→ 11 PM'
      if (eveningSub) eveningSub.textContent = 'starts at 6pm'
    }
  }

  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const monthDays = Math.ceil((eom.getTime() - now.getTime()) / 86400000)
  const monthName = now.toLocaleDateString('en-US', { month: 'long' })
  const cdMonthEl = document.getElementById('cdMonth')
  if (cdMonthEl) cdMonthEl.textContent = String(monthDays)
  const cdMonthSubEl = document.getElementById('cdMonthSub')
  if (cdMonthSubEl) cdMonthSubEl.textContent = monthDays === 1 ? '1 day left' : monthDays + ' days left'
  const cdMonthNameEl = document.getElementById('cdMonthName')
  if (cdMonthNameEl) cdMonthNameEl.textContent = monthName

  const eoy = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  const yearDays = Math.ceil((eoy.getTime() - now.getTime()) / 86400000)
  const cdYearEl = document.getElementById('cdYear')
  if (cdYearEl) {
    cdYearEl.textContent = String(yearDays)
    cdYearEl.className = 'cd-value ' + (yearDays < 60 ? 'red' : yearDays < 120 ? 'amber' : '')
  }
  const thisYearEl = document.getElementById('thisYear')
  if (thisYearEl) thisYearEl.textContent = String(now.getFullYear())

  const bday60 = new Date(2053, 11, 17)
  const days60 = Math.ceil((bday60.getTime() - now.getTime()) / 86400000)
  const years60 = (days60 / 365.25).toFixed(1)
  const cd60El = document.getElementById('cd60')
  if (cd60El) cd60El.textContent = days60.toLocaleString()
  const cd60YearsEl = document.getElementById('cd60Years')
  if (cd60YearsEl) cd60YearsEl.textContent = years60
}

// ── TASKS ──
function setType(t: 'task' | 'anchor') {
  currentType = t
  const taskBtn = document.getElementById('toggleTask')
  const anchorBtn = document.getElementById('toggleAnchor')
  if (taskBtn) taskBtn.className = 'toggle-btn' + (t === 'task' ? ' active' : '')
  if (anchorBtn) anchorBtn.className = 'toggle-btn' + (t === 'anchor' ? ' active' : '')
  const timeInput = document.getElementById('anchorTime') as HTMLInputElement | null
  if (timeInput) timeInput.style.display = t === 'anchor' ? 'block' : 'none'
  const taskInput = document.getElementById('taskInput') as HTMLInputElement | null
  if (taskInput) taskInput.placeholder = t === 'anchor'
    ? 'e.g. "call aunt m at 5" or "dinner with Noah"...'
    : 'add something to do...'
}

function parseTimeFromText(text: string) {
  const patterns: [RegExp, number, number | null, number | null][] = [
    [/\bat\s+(\d{1,2}):(\d{2})\s*(am|pm)\b/i,    1, 2, 3],
    [/\bat\s+(\d{1,2}):(\d{2})/i,                 1, 2, null],
    [/\bat\s+(\d{1,2})\s*(am|pm)\b/i,             1, null, 2],
    [/\bat\s+(\d{1,2})\b/i,                        1, null, null],
    [/@\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i,         1, 2, 3],
    [/@\s*(\d{1,2})\s*(am|pm)?/i,                  1, null, 2],
    [/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i,          1, 2, 3],
    [/\b(\d{1,2})\s*(am|pm)\b/i,                   1, null, 2],
  ]
  for (const [re, hg, mg, pg] of patterns) {
    const m = text.match(re)
    if (!m) continue
    let h = parseInt(m[hg], 10)
    const min = mg && m[mg] ? parseInt(m[mg], 10) : 0
    const mer = pg && m[pg] ? m[pg].toLowerCase() : null
    if (mer === 'pm' && h < 12) h += 12
    else if (mer === 'am' && h === 12) h = 0
    else if (!mer) { if (h >= 1 && h <= 7) h += 12 }
    const cleaned = text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim().replace(/^[-,\s]+|[-,\s]+$/g, '')
    return { h, min, cleaned }
  }
  return null
}

function formatTime(h: number, min: number) {
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 === 0 ? 12 : h % 12
  const displayM = min > 0 ? `:${String(min).padStart(2, '0')}` : ''
  return `${displayH}${displayM} ${period}`
}

function timeSort(a: Task, b: Task) {
  if (a.type !== 'anchor' || b.type !== 'anchor') return 0
  const aMin = a.anchorH != null ? a.anchorH * 60 + (a.anchorMin || 0) : 9999
  const bMin = b.anchorH != null ? b.anchorH * 60 + (b.anchorMin || 0) : 9999
  return aMin - bMin
}

function addItem() {
  const input = document.getElementById('taskInput') as HTMLInputElement | null
  if (!input) return
  const text = input.value.trim()
  if (!text) return
  const timePicker = document.getElementById('anchorTime') as HTMLInputElement | null
  const parsed = parseTimeFromText(text)
  const isAnchor = currentType === 'anchor' || !!parsed
  const item: Task = { id: Date.now(), type: isAnchor ? 'anchor' : 'task', text, done: false }
  if (isAnchor) {
    if (timePicker?.value) {
      const [h, min] = timePicker.value.split(':').map(Number)
      item.anchorH = h; item.anchorMin = min; item.text = text
      timePicker.value = ''
    } else if (parsed) {
      item.anchorH = parsed.h; item.anchorMin = parsed.min
      item.text = parsed.cleaned || text
    } else {
      item.anchorH = null; item.anchorMin = null
    }
    if (currentType !== 'anchor') setType('anchor')
  }
  state.tasks.push(item)
  saveDay(state)
  renderTasks()
  updateStats()
  input.value = ''
  input.focus()
}

function toggleDone(id: number) {
  const item = state.tasks.find(t => t.id === id)
  if (item) { item.done = !item.done; saveDay(state); renderTasks(); updateStats() }
}

function deleteItem(id: number) {
  state.tasks = state.tasks.filter(t => t.id !== id)
  saveDay(state)
  renderTasks()
  updateStats()
}

function renderTasks() {
  const anchors = [...state.tasks.filter(t => t.type === 'anchor')].sort(timeSort)
  const tasks = state.tasks.filter(t => t.type === 'task')

  const anchorEl = document.getElementById('anchorList')
  if (anchorEl) {
    if (!anchors.length) {
      anchorEl.innerHTML = `<div class="empty-state">No anchors yet — meetings, dinners, events</div>`
    } else {
      anchorEl.innerHTML = anchors.map(item => {
        const hasTime = item.anchorH != null
        const timeStr = hasTime ? formatTime(item.anchorH!, item.anchorMin || 0) : ''
        return `
          <div class="task-item ${item.done ? 'done' : ''}" id="item-${item.id}">
            <input type="checkbox" class="task-check" ${item.done ? 'checked' : ''} onchange="toggleDone(${item.id})">
            ${hasTime ? `<span class="anchor-time-badge">${escapeHTML(timeStr)}</span><span style="color:var(--ink-faint);font-size:12px;margin:0 4px 0 0;flex-shrink:0">—</span>` : ''}
            <span class="${hasTime ? 'anchor-desc' : 'task-text'}">${escapeHTML(item.text)}</span>
            <button class="delete-btn" onclick="deleteItem(${item.id})">×</button>
          </div>`
      }).join('')
    }
  }

  const taskEl = document.getElementById('taskList')
  if (taskEl) {
    if (!tasks.length) {
      taskEl.innerHTML = `<div class="empty-state">No tasks yet — what needs to get done today?</div>`
    } else {
      taskEl.innerHTML = tasks.map(item => `
        <div class="task-item ${item.done ? 'done' : ''}" id="item-${item.id}">
          <input type="checkbox" class="task-check" ${item.done ? 'checked' : ''} onchange="toggleDone(${item.id})">
          <span class="task-text">${escapeHTML(item.text)}</span>
          <button class="focus-btn" onclick="enterFocus(${item.id})" title="Focus on this task">▶ focus</button>
          <button class="delete-btn" onclick="deleteItem(${item.id})">×</button>
        </div>`).join('')
    }
  }
}

function updateStats() {
  const tasks = state.tasks.filter(t => t.type === 'task')
  const done = tasks.filter(t => t.done).length
  const el = document.getElementById('taskProgress')
  if (el) el.textContent = `${done} / ${tasks.length} done`
}

// ── NOTES ──
function saveNotes() {
  const el = document.getElementById('notesArea') as HTMLTextAreaElement | null
  if (el) state.notes = el.value
  saveDay(state)
}

// ── EXPORT ──
function buildSummaryText() {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const anchors = state.tasks.filter(t => t.type === 'anchor')
  const tasks = state.tasks.filter(t => t.type === 'task')
  const done = tasks.filter(t => t.done)
  return `DAILY SUMMARY\n${dateStr}\n${'─'.repeat(50)}\n\nANCHORS (Fixed Events)\n${anchors.length ? anchors.map(a => `  • ${a.text}`).join('\n') : '  (none)'}\n\nPLANNED TASKS\n${tasks.length ? tasks.map(t => `  ${t.done ? '✓' : '○'} ${t.text}`).join('\n') : '  (none)'}\n\nCOMPLETED: ${done.length} / ${tasks.length} tasks (${tasks.length ? Math.round(done.length / tasks.length * 100) : 0}%)\n\nMORNING NOTES\n${state.notes || '  (none)'}\n\n${'─'.repeat(50)}\nGenerated by Daily — ${now.toISOString()}`
}

function buildCSV() {
  const dateKey = TODAY_KEY()
  const rows = [['date', 'type', 'item', 'completed']]
  state.tasks.forEach(t => rows.push([dateKey, t.type, `"${t.text.replace(/"/g, '""')}"`, t.done ? 'yes' : 'no']))
  if (state.notes) rows.push([dateKey, 'notes', `"${state.notes.replace(/"/g, '""')}"`, '—'])
  return rows.map(r => r.join(',')).join('\n')
}

function exportCSV() {
  const csv = buildCSV()
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `daily-${TODAY_KEY()}.csv`; a.click()
  URL.revokeObjectURL(url)
  archiveToday()
}

function closeModal() {
  const modal = document.getElementById('previewModal')
  if (modal) modal.classList.remove('open')
}

function emailSummary() {
  const subject = `Daily Summary — ${TODAY_KEY()}`
  const body = buildSummaryText()
  window.open(`mailto:${cachedSettingsEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  archiveToday()
}

function closeMyDay() {
  archiveToday()
  emailSummary()
  exportCSV()
  const btn = document.getElementById('closeDayBtn')
  if (btn) { btn.textContent = '✓ Day Closed'; btn.className = 'close-day-btn done' }
  const sub = document.getElementById('eodSubtext')
  if (sub) sub.textContent = 'summary emailed · CSV downloaded · day archived'
}

// ── MORNING GATE ──
function checkMorningGate() {
  const seenKey = 'gate_seen_' + TODAY_KEY()
  if (localStorage.getItem(seenKey)) return
  if (!cachedYesterdayData) return
  const incomplete = cachedYesterdayData.tasks.filter(t => t.type === 'task' && !t.done)
  if (!incomplete.length) return
  renderGateCards(incomplete)
  const overlay = document.getElementById('gateOverlay')
  if (overlay) overlay.classList.add('open')
  document.body.style.overflow = 'hidden'
}

function renderGateCards(items: Task[]) {
  gateDecisions = {}
  items.forEach(item => { gateDecisions[item.id] = null })
  const el = document.getElementById('gateCards')
  if (!el) return
  el.innerHTML = items.map(item => `
    <div class="gate-card" id="gc-${item.id}" data-id="${item.id}">
      <div class="gate-card-reveal gate-card-reveal-keep" id="gc-keep-${item.id}">→ carry forward</div>
      <div class="gate-card-reveal gate-card-reveal-drop" id="gc-drop-${item.id}">release ×</div>
      <div class="gate-card-face" id="gc-face-${item.id}">
        <span class="gate-card-text">${escapeHTML(item.text)}</span>
        <span class="gate-card-date">yesterday</span>
      </div>
    </div>`).join('')
  items.forEach(item => {
    const card = document.getElementById('gc-' + item.id)
    if (card) attachSwipe(card, item.id)
  })
  updateGateProgress()
}

function attachSwipe(card: HTMLElement, id: number) {
  const face = document.getElementById('gc-face-' + id)
  const keepReveal = document.getElementById('gc-keep-' + id)
  const dropReveal = document.getElementById('gc-drop-' + id)
  let startX = 0, startY = 0, isDragging = false, currentX = 0
  const THRESHOLD = 80

  function onStart(x: number, y: number) {
    if (gateDecisions[id] !== null) return
    startX = x; startY = y; isDragging = true; currentX = 0
  }
  function onMove(x: number, y: number) {
    if (!isDragging) return
    const dx = x - startX, dy = y - startY
    if (Math.abs(dy) > Math.abs(dx) + 10) { isDragging = false; return }
    currentX = dx
    if (face) face.style.transform = `translateX(${dx}px)`
    if (dx > 20) {
      if (keepReveal) keepReveal.style.opacity = String(Math.min(1, (dx - 20) / 60))
      if (dropReveal) dropReveal.style.opacity = '0'
    } else if (dx < -20) {
      if (dropReveal) dropReveal.style.opacity = String(Math.min(1, (-dx - 20) / 60))
      if (keepReveal) keepReveal.style.opacity = '0'
    } else {
      if (keepReveal) keepReveal.style.opacity = '0'
      if (dropReveal) dropReveal.style.opacity = '0'
    }
  }
  function onEnd() {
    if (!isDragging) return
    isDragging = false
    if (currentX > THRESHOLD) decide(id, 'keep')
    else if (currentX < -THRESHOLD) decide(id, 'drop')
    else {
      if (face) {
        face.style.transition = 'transform 0.25s cubic-bezier(.25,.8,.25,1)'
        face.style.transform = 'translateX(0)'
        if (keepReveal) keepReveal.style.opacity = '0'
        if (dropReveal) dropReveal.style.opacity = '0'
        setTimeout(() => { if (face) face.style.transition = '' }, 250)
      }
    }
  }
  card.addEventListener('mousedown', e => onStart(e.clientX, e.clientY))
  window.addEventListener('mousemove', e => { if (isDragging) onMove(e.clientX, e.clientY) })
  window.addEventListener('mouseup', () => { if (isDragging) onEnd() })
  card.addEventListener('touchstart', e => { const t = e.touches[0]; onStart(t.clientX, t.clientY) }, { passive: true })
  card.addEventListener('touchmove', e => { const t = e.touches[0]; onMove(t.clientX, t.clientY) }, { passive: true })
  card.addEventListener('touchend', onEnd)
}

function decide(id: number, choice: 'keep' | 'drop') {
  gateDecisions[id] = choice
  const card = document.getElementById('gc-' + id)
  const face = document.getElementById('gc-face-' + id)
  const keepReveal = document.getElementById('gc-keep-' + id)
  const dropReveal = document.getElementById('gc-drop-' + id)
  if (face) {
    face.style.transition = 'transform 0.2s ease'
    face.style.transform = 'translateX(0)'
    setTimeout(() => { if (face) face.style.transition = '' }, 200)
  }
  if (keepReveal) keepReveal.style.opacity = '0'
  if (dropReveal) dropReveal.style.opacity = '0'
  if (card) card.className = 'gate-card decided-' + choice
  updateGateProgress()
}

function updateGateProgress() {
  const total = Object.keys(gateDecisions).length
  const decided = Object.values(gateDecisions).filter(v => v !== null).length
  const kept = Object.values(gateDecisions).filter(v => v === 'keep').length
  const el = document.getElementById('gateProgress')
  if (!el) return
  if (decided === 0) el.textContent = `${total} item${total !== 1 ? 's' : ''} to review`
  else if (decided < total) el.textContent = `${decided} of ${total} reviewed · ${kept} kept`
  else el.textContent = `${kept} carried forward · ${total - kept} released`
}

function gateKeepAll() {
  Object.keys(gateDecisions).forEach(id => decide(Number(id), 'keep'))
}

function gateCommit() {
  if (cachedYesterdayData) {
    const incomplete = cachedYesterdayData.tasks.filter(t => t.type === 'task' && !t.done)
    incomplete.forEach(item => {
      if (gateDecisions[item.id] === 'keep') {
        const alreadyThere = state.tasks.some(t => t.text === item.text)
        if (!alreadyThere) {
          state.tasks.push({ ...item, id: Date.now() + Math.random(), done: false, carriedFrom: getYesterdayKey() })
        }
      }
    })
    saveDay(state)
    renderTasks()
    updateStats()
  }
  localStorage.setItem('gate_seen_' + TODAY_KEY(), '1')
  const overlay = document.getElementById('gateOverlay')
  if (overlay) overlay.classList.remove('open')
  document.body.style.overflow = ''
}

function previewGate() {
  const demos: Task[] = [
    { id: 901, text: 'draft Q2 strategy doc', type: 'task', done: false },
    { id: 902, text: 'follow up with Brittany re: summit', type: 'task', done: false },
    { id: 903, text: 'review Sentinel AI deck', type: 'task', done: false },
  ]
  renderGateCards(demos)
  const overlay = document.getElementById('gateOverlay')
  if (overlay) overlay.classList.add('open')
  document.body.style.overflow = 'hidden'
}

// ── TABS ──
function switchTab(name: string) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    const tabs = ['today', 'settings']
    t.className = 'tab' + (tabs[i] === name ? ' active' : '')
  })
  document.querySelectorAll('.tab-content').forEach(c => c.className = 'tab-content')
  const tab = document.getElementById('tab-' + name)
  if (tab) tab.className = 'tab-content active'
}

// ── FOCUS MODE ──
function enterFocus(taskId: number) {
  const item = state.tasks.find(t => t.id === taskId)
  if (!item) return
  focusTaskId = taskId; focusDuration = 25; focusRemaining = 25 * 60; focusRunning = false
  if (focusInterval) clearInterval(focusInterval)
  const textEl = document.getElementById('focusTaskText')
  const timerEl = document.getElementById('focusTimer')
  const startBtn = document.getElementById('focusStartBtn')
  const noteEl = document.getElementById('focusSessionNote')
  if (textEl) textEl.textContent = item.text
  if (timerEl) { timerEl.textContent = '25:00'; timerEl.className = 'focus-timer' }
  if (startBtn) startBtn.textContent = '▶ Start'
  if (noteEl) noteEl.textContent = 'press start when ready'
  document.querySelectorAll('.duration-btn').forEach((b, i) => {
    b.className = 'duration-btn' + (i === 0 ? ' active' : '')
  })
  const overlay = document.getElementById('focusOverlay')
  if (overlay) overlay.classList.add('open')
  document.body.style.overflow = 'hidden'
}

function setDuration(mins: number) {
  if (focusRunning) return
  focusDuration = mins; focusRemaining = mins * 60
  const timerEl = document.getElementById('focusTimer')
  if (timerEl) timerEl.textContent = `${String(mins).padStart(2, '0')}:00`
  document.querySelectorAll('.duration-btn').forEach(b => {
    b.className = 'duration-btn' + (b.textContent?.startsWith(String(mins)) ? ' active' : '')
  })
}

function toggleFocusTimer() {
  if (focusRunning) {
    if (focusInterval) clearInterval(focusInterval)
    focusRunning = false
    const startBtn = document.getElementById('focusStartBtn')
    const noteEl = document.getElementById('focusSessionNote')
    if (startBtn) startBtn.textContent = '▶ Resume'
    if (noteEl) noteEl.textContent = 'paused'
  } else {
    focusRunning = true
    const startBtn = document.getElementById('focusStartBtn')
    const noteEl = document.getElementById('focusSessionNote')
    const durationRow = document.getElementById('focusDurationRow')
    if (startBtn) startBtn.textContent = '⏸ Pause'
    if (noteEl) noteEl.textContent = `${focusDuration} min session — stay with it`
    if (durationRow) durationRow.style.opacity = '0.3'
    focusInterval = setInterval(() => {
      focusRemaining--
      const m = Math.floor(focusRemaining / 60), s = focusRemaining % 60
      const timerEl = document.getElementById('focusTimer')
      if (timerEl) timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      if (focusRemaining <= 60 && timerEl) timerEl.className = 'focus-timer ending'
      if (focusRemaining <= 0) {
        if (focusInterval) clearInterval(focusInterval)
        focusRunning = false
        if (timerEl) timerEl.textContent = '00:00'
        if (startBtn) startBtn.textContent = '✓ Done'
        if (noteEl) noteEl.textContent = 'session complete — great work'
        const item = state.tasks.find(t => t.id === focusTaskId)
        if (item && !item.done) { item.done = true; saveDay(state) }
        try {
          const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain()
          o.connect(g); g.connect(ctx.destination); o.frequency.value = 440
          g.gain.setValueAtTime(0.3, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5)
          o.start(); o.stop(ctx.currentTime + 1.5)
        } catch { /* ignore */ }
      }
    }, 1000)
  }
}

function exitFocus() {
  if (focusInterval) clearInterval(focusInterval)
  focusRunning = false
  const overlay = document.getElementById('focusOverlay')
  if (overlay) overlay.classList.remove('open')
  document.body.style.overflow = ''
  const durationRow = document.getElementById('focusDurationRow')
  if (durationRow) durationRow.style.opacity = '1'
  renderTasks(); updateStats()
}

// ── GOALS RENDER ──
function renderGoals() {
  const goals = loadGoals()
  const el = document.getElementById('goalsList')
  if (!el) return
  if (!goals.length) {
    el.innerHTML = `
      <div style="grid-column:1/-1;padding:16px 0 8px;">
        <div style="font-size:11px;color:var(--ink-faint);font-style:italic;margin-bottom:16px;">
          Nothing here yet. Add habits or intentions you want to do every day — they'll live here permanently so you can decide each morning whether to put them on today's list.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${['read for an hour', 'go to the gym', 'meditate', 'no phone before 9am'].map(ex =>
            `<button onclick="seedGoal('${ex}')" style="background:var(--paper-dark);border:1px solid var(--rule-dark);font-family:var(--mono);font-size:10px;color:var(--ink-light);padding:6px 12px;cursor:pointer;letter-spacing:0.05em;transition:all 0.15s;" onmouseover="this.style.borderColor='var(--ink-faint)'" onmouseout="this.style.borderColor='var(--rule-dark)'">${ex}</button>`
          ).join('')}
        </div>
      </div>`
    return
  }
  const todayTexts = new Set(state.tasks.map(t => t.text))
  el.innerHTML = goals.map(g => {
    const added = todayTexts.has(g.text)
    return `
      <div class="goal-card">
        <span class="goal-icon">${g.icon}</span>
        <span class="goal-text">${escapeHTML(g.text)}</span>
        <button class="goal-nudge-btn ${added ? 'added' : ''}" data-goal-nudge="${g.id}" onclick="nudgeGoal(${g.id})">
          ${added ? '✓ on list' : '+ today'}
        </button>
        <button class="goal-delete-btn" onclick="deleteGoal(${g.id})">×</button>
      </div>`
  }).join('')
}

// ── REACT COMPONENT ──
interface Props {
  userId: string
  userEmail: string
  onSignOut: () => void
}

export default function DailyApp({ userId, userEmail, onSignOut }: Props) {
  useEffect(() => {
    async function init() {
      currentUserId = userId

      // Load today's entry
      const { data: entry } = await supabase
        .from('daily_entries')
        .select('tasks, notes')
        .eq('user_id', userId)
        .eq('date', TODAY_KEY())
        .maybeSingle()
      state = entry ? { tasks: (entry.tasks ?? []) as Task[], notes: entry.notes ?? '' } : { tasks: [], notes: '' }

      // Load yesterday for morning gate
      const { data: yEntry } = await supabase
        .from('daily_entries')
        .select('tasks, notes')
        .eq('user_id', userId)
        .eq('date', getYesterdayKey())
        .maybeSingle()
      cachedYesterdayData = yEntry
        ? { tasks: (yEntry.tasks ?? []) as Task[], notes: yEntry.notes ?? '' }
        : null

      // Load goals
      const { data: goalsData } = await supabase
        .from('goals')
        .select('id, text, icon')
        .eq('user_id', userId)
        .order('id', { ascending: true })
      cachedGoals = (goalsData ?? []).map(g => ({ id: g.id as number, text: g.text as string, icon: g.icon as string }))

      // Load settings
      const { data: settingsData } = await supabase
        .from('user_settings')
        .select('email, phone, wake_time')
        .eq('user_id', userId)
        .maybeSingle()

      // Render everything
      updateDayHeader()
      updateCountdowns()
      renderTasks()
      const notesArea = document.getElementById('notesArea') as HTMLTextAreaElement | null
      if (notesArea) notesArea.value = state.notes || ''
      updateStats()
      applySettings(settingsData)
      renderGoals()
      renderArchive() // async, updates when ready
      updateDayProgress()
      checkMorningGate()
    }

    init()

    const countdownInterval = setInterval(updateCountdowns, 1000)
    const progressInterval = setInterval(updateDayProgress, 60000)

    // Compact mode for countdown row
    const primaryRow = document.getElementById('primaryRow')
    let compactObserver: ResizeObserver | null = null
    if (primaryRow) {
      compactObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          primaryRow.classList.toggle('compact', entry.contentRect.width < 520)
        }
      })
      compactObserver.observe(primaryRow)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.getElementById('focusOverlay')?.classList.contains('open')) {
        exitFocus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    // Expose functions called from innerHTML event handlers
    const w = window as unknown as Record<string, unknown>
    w.toggleDone = toggleDone
    w.deleteItem = deleteItem
    w.enterFocus = enterFocus
    w.viewArchiveDay = viewArchiveDay
    w.nudgeGoal = nudgeGoal
    w.deleteGoal = deleteGoal
    w.seedGoal = seedGoal

    return () => {
      clearInterval(countdownInterval)
      clearInterval(progressInterval)
      if (focusInterval) clearInterval(focusInterval)
      compactObserver?.disconnect()
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [userId])

  return (
    <>
      {/* Day progress bar */}
      <div className="progress-bar-wrap">
        <div className="progress-bar" id="dayProgress"></div>
      </div>

      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="logo">Daily</div>
          <div className="today-date" id="todayDate"></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px' }}>
          <div className="day-number" id="dayOfYear"></div>
          <button
            onClick={onSignOut}
            title={`Signed in as ${userEmail}`}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--mono)',
              fontSize: '9px',
              letterSpacing: '0.15em',
              color: 'var(--ink-faint)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              padding: '0',
            }}
          >
            sign out
          </button>
        </div>
      </div>

      {/* Countdowns */}
      <div className="countdowns">
        <div className="countdowns-primary" id="primaryRow">
          <div className="countdown-cell-big">
            <div className="cd-progress-bar" id="progress6pm"></div>
            <div className="cd-label-big">→ 6 PM</div>
            <div className="cd-value-big red" id="cd6pm">--:--<span className="cd-seconds">:--</span></div>
            <div className="cd-sublabel">work day ends</div>
          </div>
          <div className="countdown-cell-big">
            <div className="cd-progress-bar" id="progress11pm"></div>
            <div className="cd-label-big">→ 11 PM</div>
            <div className="cd-value-big" id="cd11pm">--:--<span className="cd-seconds">:--</span></div>
            <div className="cd-sublabel">day ends</div>
          </div>
        </div>
        <div className="countdowns-secondary" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="countdown-cell">
            <div className="cd-label">End of <span id="cdMonthName">month</span></div>
            <div className="cd-value" id="cdMonth">--</div>
            <div className="cd-unit"><span id="cdMonthSub"></span></div>
          </div>
          <div className="countdown-cell">
            <div className="cd-label">End of <span id="thisYear"></span></div>
            <div className="cd-value amber" id="cdYear">--</div>
            <div className="cd-unit">days remaining</div>
          </div>
          <div className="countdown-cell age">
            <div className="cd-label">Age 60</div>
            <div className="cd-value" id="cd60">--</div>
            <div className="cd-unit"><span id="cd60Years"></span> yrs · Dec 17, 2053</div>
          </div>
        </div>
      </div>

      {/* Morning Gate */}
      <div className="gate-overlay" id="gateOverlay">
        <div className="gate-header">
          <div className="gate-eyebrow">Good morning</div>
          <div className="gate-title">Yesterday wasn&apos;t finished.</div>
          <div className="gate-subtitle">swipe right to carry forward · swipe left to release</div>
        </div>
        <div className="gate-hint">
          <span>→ keep</span>
          <span>← release</span>
        </div>
        <div className="gate-cards" id="gateCards"></div>
        <div className="gate-actions">
          <button className="gate-btn" onClick={gateKeepAll}>Keep all</button>
          <button className="gate-btn primary" onClick={gateCommit}>Open today →</button>
        </div>
        <div className="gate-progress" id="gateProgress"></div>
      </div>

      {/* Focus Mode Overlay */}
      <div className="focus-overlay" id="focusOverlay">
        <div className="focus-task-label">Focus Session</div>
        <div className="focus-task-text" id="focusTaskText"></div>
        <div className="focus-timer" id="focusTimer">25:00</div>
        <div className="focus-duration-row" id="focusDurationRow">
          <button className="duration-btn active" onClick={() => setDuration(25)}>25 min</button>
          <button className="duration-btn" onClick={() => setDuration(45)}>45 min</button>
          <button className="duration-btn" onClick={() => setDuration(60)}>60 min</button>
        </div>
        <div className="focus-controls">
          <button className="focus-start-btn" id="focusStartBtn" onClick={toggleFocusTimer}>▶ Start</button>
          <button className="focus-stop-btn" onClick={exitFocus}>✕ Exit</button>
        </div>
        <div className="focus-session-note" id="focusSessionNote">press start when ready</div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <div className="tab active" onClick={() => switchTab('today')}>Today</div>
        <div className="tab" onClick={() => switchTab('settings')}>Settings</div>
      </div>

      {/* TODAY TAB */}
      <div className="tab-content active" id="tab-today">
        <div className="main">
          {/* LEFT: Tasks & Anchors */}
          <div className="panel">
            <div className="panel-label">
              <span>Today&apos;s Plan</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  onClick={previewGate}
                  style={{ background: 'none', border: 'none', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--ink-faint)', cursor: 'pointer', textTransform: 'uppercase', padding: '0' }}
                  title="Preview morning gate"
                >
                  ↺ morning gate
                </button>
                <span id="taskProgress" style={{ color: 'var(--ink-mid)' }}>0 / 0 done</span>
              </div>
            </div>
            <div className="task-input-row">
              <div className="task-type-toggle">
                <button className="toggle-btn active" id="toggleTask" onClick={() => setType('task')}>Task</button>
                <button className="toggle-btn" id="toggleAnchor" onClick={() => setType('anchor')}>Anchor</button>
              </div>
              <input
                type="text"
                className="task-input"
                id="taskInput"
                placeholder="add something..."
                onKeyDown={e => { if (e.key === 'Enter') addItem() }}
              />
              <input type="time" className="time-input" id="anchorTime" style={{ display: 'none' }} title="Set time" />
              <button className="add-btn" onClick={addItem}>+ Add</button>
            </div>
            <div className="task-section">
              <div className="task-section-header">Tasks — things to do</div>
              <div id="taskList"><div className="empty-state">No tasks yet — what needs to get done today?</div></div>
            </div>
            <div className="task-section" id="anchorSection">
              <div className="task-section-header">Anchors — fixed events</div>
              <div id="anchorList"><div className="empty-state">No anchors yet — meetings, dinners, deadlines</div></div>
            </div>
          </div>

          {/* RIGHT: Notes */}
          <div className="panel panel-right">
            <div className="panel-label">
              <span>Morning Notes</span>
              <span style={{ color: 'var(--ink-faint)', fontSize: '10px', fontStyle: 'italic' }}>stream of consciousness</span>
            </div>
            <textarea
              className="notes-area"
              id="notesArea"
              placeholder={'what\'s on your mind this morning...\n\nthoughts, context, intentions, worries.\n\nthis space is just for you.'}
              onInput={saveNotes}
            />
          </div>
        </div>

        {/* Close My Day */}
        <div className="summary-section">
          <div className="summary-header">
            <div>
              <div className="summary-label">Close My Day</div>
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '4px', fontStyle: 'italic' }} id="eodSubtext">
                exports a summary + emails it to you
              </div>
            </div>
            <button className="close-day-btn" id="closeDayBtn" onClick={closeMyDay}>✓ Close Day + Export</button>
          </div>
        </div>
      </div>

      {/* Goals Section */}
      <div className="goals-section">
        <div className="goals-header">
          <div>
            <div className="goals-label">Daily Intentions</div>
            <div className="goals-sublabel">
              things you want to do every day — tap <strong style={{ fontWeight: 500, color: 'var(--ink-mid)' }}>+ today</strong> to add one to this morning&apos;s list
            </div>
          </div>
        </div>
        <div className="goals-grid" id="goalsList"></div>
        <div className="add-goal-row">
          <input
            type="text"
            className="goal-input"
            id="goalInput"
            placeholder="e.g. read for an hour, go to gym, meditate, no phone before 9am..."
            onKeyDown={e => { if (e.key === 'Enter') addGoal() }}
          />
          <button className="add-btn" onClick={addGoal}>+ Add</button>
        </div>
      </div>

      {/* Archive tab content */}
      <div className="tab-content" id="tab-archive">
        <div style={{ padding: '32px 40px' }}>
          <div className="panel-label"><span>Past Days</span></div>
          <div className="archive-list" id="archiveList">
            <div className="empty-state">Loading...</div>
          </div>
        </div>
      </div>

      {/* SETTINGS TAB */}
      <div className="tab-content" id="tab-settings">
        <div style={{ padding: '32px 40px', maxWidth: '560px' }}>
          <div className="panel-label"><span>Settings</span></div>
          <p style={{ fontSize: '12px', color: 'var(--ink-mid)', lineHeight: '1.7', marginBottom: '24px' }}>
            Set once, forget it. Your contact info and wake time will be used to send your 6am daily link automatically.
          </p>
          <div className="notify-section">
            <div className="notify-label">Contact Info</div>
            <div className="notify-row">
              <div className="notify-field-label">Email</div>
              <input type="email" className="notify-input" id="settingsEmail" placeholder="you@email.com" onInput={saveSettings} />
            </div>
            <div className="notify-row">
              <div className="notify-field-label">Phone</div>
              <input type="tel" className="notify-input" id="settingsPhone" placeholder="+1 (212) 555-0000" onInput={saveSettings} />
            </div>
            <div className="notify-row">
              <div className="notify-field-label">Wake time</div>
              <input type="time" className="notify-input" id="settingsTime" defaultValue="06:00" onInput={saveSettings} />
            </div>
            <div className="notify-status" id="settingsStatus">Not saved yet</div>
          </div>

          <div style={{ marginTop: '28px', padding: '20px', border: '1px dashed var(--ink-faint)' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '12px' }}>Production Roadmap</div>
            <div style={{ fontSize: '11px', color: 'var(--ink-mid)', lineHeight: '2' }}>
              ✓ &nbsp;Supabase database (daily records persist across devices)<br />
              ☐ &nbsp;Twilio SMS (6am text with day link)<br />
              ☐ &nbsp;Resend email (6am email with day link)<br />
              ☐ &nbsp;Vercel cron job (fires scheduler at 6am ET)<br />
              ☐ &nbsp;Auth (login so data is yours, not browser-bound)<br />
              ✓ &nbsp;Frontend complete
            </div>
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--rule-dark)' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '10px' }}>Preview / Test</div>
              <button className="export-btn" onClick={previewGate} style={{ fontSize: '10px' }}>Preview Morning Gate</button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <div className="modal-overlay" id="previewModal" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
        <div className="modal">
          <h3>Daily Export — <span id="modalDate"></span></h3>
          <pre id="modalContent"></pre>
          <button className="modal-close" onClick={closeModal}>Close</button>
        </div>
      </div>
    </>
  )
}

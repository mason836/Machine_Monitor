import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SHIFT_MINS = 480
const MACHINE = 'line-2-case-packer'
const PLANNED_REASONS = ['Lunch Break', 'Changeover / Sauce Switch']

const todayKey = () => new Date().toISOString().slice(0, 10)
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const minsToHHMM = m => { const h = Math.floor(m / 60), min = Math.round(m % 60); return `${h}h ${min}m` }
const availColor = v => v >= 75 ? '#34d399' : v >= 50 ? '#fbbf24' : '#f87171'

function buildSessions(events) {
  const sessions = []
  let start = null
  for (const e of events) {
    if (e.type === 'start') { start = e }
    else if (e.type === 'stop' && start) {
      sessions.push({
        id: start.id + '-' + e.id,
        start: new Date(start.created_at).getTime(),
        stop: new Date(e.created_at).getTime(),
        planned: false,
        planReason: ''
      })
      start = null
    }
  }
  return sessions
}

function dayStats(sessions, liveMs = 0) {
  const runMins = sessions.reduce((a, s) => a + (s.stop - s.start) / 60000, 0) + liveMs / 60000
  const plannedMins = sessions.filter(s => s.planned).reduce((a, s) => a + (s.stop - s.start) / 60000, 0)
  const unplannedMins = sessions.filter(s => !s.planned).reduce((a, s) => a + (s.stop - s.start) / 60000, 0)
  const avail = Math.min(100, (runMins / SHIFT_MINS) * 100)
  return { runMins, plannedMins, unplannedMins, avail }
}

export default function Dashboard() {
  const [events, setEvents] = useState([])
  const [now, setNow] = useState(Date.now())
  const [view, setView] = useState('today')
  const [operators, setOperators] = useState(['Operator 1', 'Operator 2', 'Operator 3'])
  const [dayOperators, setDayOperators] = useState({})
  const [plannedMap, setPlannedMap] = useState({})
  const [editStop, setEditStop] = useState(null)
  const [customReason, setCustomReason] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newOp, setNewOp] = useState('')
  const tickRef = useRef()

  async function fetchEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('machine', MACHINE)
      .order('created_at', { ascending: true })
    if (data) setEvents(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchEvents()
    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => fetchEvents())
      .subscribe()
    tickRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => { supabase.removeChannel(channel); clearInterval(tickRef.current) }
  }, [])

  useEffect(() => {
    try {
      const ops = localStorage.getItem('mm-operators')
      if (ops) setOperators(JSON.parse(ops))
      const dops = localStorage.getItem('mm-day-operators')
      if (dops) setDayOperators(JSON.parse(dops))
      const pm = localStorage.getItem('mm-planned-map')
      if (pm) setPlannedMap(JSON.parse(pm))
    } catch (e) {}
  }, [])

  function saveOperators(ops) {
    setOperators(ops)
    localStorage.setItem('mm-operators', JSON.stringify(ops))
  }

  function setDayOp(day, op) {
    const next = { ...dayOperators, [day]: op }
    setDayOperators(next)
    localStorage.setItem('mm-day-operators', JSON.stringify(next))
  }

  function markPlanned(sessionId, planned, reason) {
    const next = { ...plannedMap, [sessionId]: { planned, reason } }
    setPlannedMap(next)
    localStorage.setItem('mm-planned-map', JSON.stringify(next))
    setEditStop(null)
  }

  const eventsByDay = {}
  events.forEach(e => {
    const day = new Date(e.created_at).toISOString().slice(0, 10)
    if (!eventsByDay[day]) eventsByDay[day] = []
    eventsByDay[day].push(e)
  })

  const dk = todayKey()
  const todayEvents = eventsByDay[dk] || []
  const lastEvent = todayEvents[todayEvents.length - 1]
  const isRunning = lastEvent?.type === 'start'
  const liveMs = isRunning ? now - new Date(lastEvent.created_at).getTime() : 0
  const liveSeconds = Math.floor(liveMs / 1000)
  const todaySessions = buildSessions(todayEvents).map(s => ({ ...s, ...(plannedMap[s.id] || {}) }))
  const stats = dayStats(todaySessions, liveMs)
  const accent = isRunning ? '#34d399' : '#f87171'
  const allDays = Object.keys(eventsByDay).sort((a, b) => b.localeCompare(a))

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080d14', color: '#334155', fontFamily: 'monospace' }}>
      Loading…
    </div>
  )

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Source+Code+Pro:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#080d14;color:#e2e8f0;font-family:'Source Code Pro',monospace}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1e3a5f}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.8)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .nav{background:none;border:none;cursor:pointer;font-family:'Source Code Pro',monospace;font-size:11px;letter-spacing:2px;padding:8px 16px;transition:all .2s;border-bottom:2px solid transparent;color:#475569}
    .nav.active{border-bottom-color:#3b82f6;color:#93c5fd}
    .nav:hover{color:#e2e8f0}
    .btn{font-family:'Rajdhani',sans-serif;letter-spacing:1px;font-size:13px;font-weight:600;border-radius:6px;border:none;cursor:pointer;transition:all .2s;padding:9px 20px}
    .btn:disabled{opacity:.3;cursor:not-allowed}
    .btn-start{background:#064e3b;color:#34d399;border:1px solid #34d39955}
    .btn-start:not(:disabled):hover{background:#065f46}
    .btn-stop{background:#450a0a;color:#f87171;border:1px solid #f8717155}
    .btn-stop:not(:disabled):hover{background:#7f1d1d}
    .ghost{background:none;border:1px solid #1e3a5f;color:#64748b;padding:5px 12px;border-radius:5px;font-family:'Source Code Pro',monospace;font-size:11px;cursor:pointer;transition:all .2s}
    .ghost:hover{border-color:#3b82f6;color:#93c5fd}
    .row:hover{background:#0f2035!important;cursor:pointer}
    th{font-family:'Rajdhani',sans-serif;font-size:9px;letter-spacing:2px;color:#334155;padding:8px 12px;text-align:left}
    td{padding:10px 12px;font-size:12px;border-bottom:1px solid #0f1e30}
    select,input[type=text]{background:#0a1628;border:1px solid #1e3a5f;color:#e2e8f0;padding:7px 12px;border-radius:6px;font-family:'Source Code Pro',monospace;font-size:12px;outline:none}
    select:focus,input[type=text]:focus{border-color:#3b82f6}
  `

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: '100vh', background: '#080d14' }}>
        <div style={{ background: 'linear-gradient(180deg,#0d1b2e,#080d14)', borderBottom: '1px solid #1e3a5f' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 4, color: '#334155' }}>LINE 2 — CASE PACKER</div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>MACHINE​​​​​​​​​​​​​​​​

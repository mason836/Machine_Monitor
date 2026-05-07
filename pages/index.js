​​​​​​​​​​​import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SHIFT_MINS = 480
const MACHINE = 'line-2-case-packer'
const PLANNED_REASONS = ['Lunch Break', 'Changeover / Sauce Switch']

const todayKey = () => new Date().toISOString().slice(0, 10)
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const minsToHHMM = m => { const h = Math.floor(m / 60), min = Math.round(m % 60); return h + 'h ' + min + 'm' }
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

function dayStats(sessions, liveMs) {
  liveMs = liveMs || 0
  const runMins = sessions.reduce(function(a, s) { return a + (s.stop - s.start) / 60000 }, 0) + liveMs / 60000
  const plannedMins = sessions.filter(function(s) { return s.planned }).reduce(function(a, s) { return a + (s.stop - s.start) / 60000 }, 0)
  const unplannedMins = sessions.filter(function(s) { return !s.planned }).reduce(function(a, s) { return a + (s.stop - s.start) / 60000 }, 0)
  const avail = Math.min(100, (runMins / SHIFT_MINS) * 100)
  return { runMins: runMins, plannedMins: plannedMins, unplannedMins: unplannedMins, avail: avail }
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
    const result = await supabase
      .from('events')
      .select('*')
      .eq('machine', MACHINE)
      .order('created_at', { ascending: true })
    if (result.data) setEvents(result.data)
    setLoading(false)
  }

  useEffect(function() {
    fetchEvents()
    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, function() { fetchEvents() })
      .subscribe()
    tickRef.current = setInterval(function() { setNow(Date.now()) }, 1000)
    return function() { supabase.removeChannel(channel); clearInterval(tickRef.current) }
  }, [])

  useEffect(function() {
    try {
      const ops = localStorage.getItem('mm-operators')
      if (ops) setOperators(JSON.parse(ops))
      const dops = localStorage.getItem('mm-day-operators')
      if (dops) setDayOperators(JSON.parse(dops))
      const pm = localStorage.getItem('mm-planned-map')
      if (pm) setPlannedMap(JSON.parse(pm))
    } catch(e) {}
  }, [])

  function saveOperators(ops) {
    setOperators(ops)
    localStorage.setItem('mm-operators', JSON.stringify(ops))
  }

  function setDayOp(day, op) {
    const next = Object.assign({}, dayOperators)
    next[day] = op
    setDayOperators(next)
    localStorage.setItem('mm-day-operators', JSON.stringify(next))
  }

  function markPlanned(sessionId, planned, reason) {
    const next = Object.assign({}, plannedMap)
    next[sessionId] = { planned: planned, reason: reason }
    setPlannedMap(next)
    localStorage.setItem('mm-planned-map', JSON.stringify(next))
    setEditStop(null)
  }

  const eventsByDay = {}
  events.forEach(function(e) {
    const day = new Date(e.created_at).toISOString().slice(0, 10)
    if (!eventsByDay[day]) eventsByDay[day] = []
    eventsByDay[day].push(e)
  })

  const dk = todayKey()
  const todayEvents = eventsByDay[dk] || []
  const lastEvent = todayEvents[todayEvents.length - 1]
  const isRunning = lastEvent && lastEvent.type === 'start'
  const liveMs = isRunning ? now - new Date(lastEvent.created_at).getTime() : 0
  const liveSeconds = Math.floor(liveMs / 1000)
  const todaySessions = buildSessions(todayEvents).map(function(s) {
    return Object.assign({}, s, plannedMap[s.id] || {})
  })
  const stats = dayStats(todaySessions, liveMs)
  const accent = isRunning ? '#34d399' : '#f87171'
  const allDays = Object.keys(eventsByDay).sort(function(a, b) { return b.localeCompare(a) })

  if (loading) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080d14', color: '#334155', fontFamily: 'monospace' }
    }, 'Loading...')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080d14', color: '#e2e8f0', fontFamily: 'monospace' }}>
      <div style={{ background: '#0d1b2e', borderBottom: '1px solid #1e3a5f', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 4, color: '#334155' }}>LINE 2 — CASE PACKER</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>MACHINE DASHBOARD</div>
        </div>
        <div style={{ fontSize: 18, letterSpacing: 3, color: '#93c5fd' }}>
          {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f', padding: '0 20px' }}>
        {[['today','TODAY'],['history','LOGBOOK'],['settings','SETTINGS']].map(function(item) {
          return (
            <button key={item[0]} onClick={function() { setView(item[0]); setSelectedDay(null); setEditStop(null) }}
              style={{ background: 'none', border: 'none', borderBottom: view === item[0] ? '2px solid #3b82f6' : '2px solid transparent', color: view === item[0] ? '#93c5fd' : '#475569', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, padding: '8px 16px' }}>
              {item[1]}
            </button>
          )
        })}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>

        {view === 'today' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 9, letterSpacing: 3, color: '#334155' }}>OPERATOR</span>
                <select value={dayOperators[dk] || ''} onChange={function(e) { setDayOp(dk, e.target.value) }}
                  style={{ background: '#0a1628', border: '1px solid #1e3a5f', color: '#e2e8f0', padding: '7px 12px', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
                  <option value=''>select operator</option>
                  {operators.map(function(o) { return <option key={o}>{o}</option> })}
                </select>
              </div>
              <div style={{ fontSize: 10, color: '#334155', letterSpacing: 2 }}>{fmtDate(dk)}</div>
            </div>

            <div style={{ background: '#0d1b2e', border: '1px solid ' + accent + '33', borderRadius: 12, padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: accent, boxShadow: '0 0 10px ' + accent }} />
                <div>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155' }}>MACHINE STATUS</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: accent, letterSpacing: 2 }}>{isRunning ? 'RUNNING' : 'STOPPED'}</div>
                </div>
              </div>
              {isRunning && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155' }}>SESSION TIMER</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: '#34d399', letterSpacing: 3 }}>
                    {String(Math.floor(liveSeconds/3600)).padStart(2,'0')}:{String(Math.floor((liveSeconds%3600)/60)).padStart(2,'0')}:{String(liveSeconds%60).padStart(2,'0')}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 10, color: '#475569' }}>Arduino controls start/stop</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'RUN TIME', value: minsToHHMM(stats.runMins), color: '#34d399' },
                { label: 'UNPLANNED DT', value: minsToHHMM(stats.unplannedMins), color: '#f87171' },
                { label: 'PLANNED DT', value: minsToHHMM(stats.plannedMins), color: '#fbbf24' },
                { label: 'AVAILABILITY', value: stats.avail.toFixed(1) + '%', color: availColor(stats.avail) },
                { label: 'SESSIONS', value: todaySessions.length + (isRunning ? 1 : 0), color: '#93c5fd' },
              ].map(function(card) {
                return (
                  <div key={card.label} style={{ background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 8, letterSpacing: 3, color: '#334155', marginBottom: 6 }}>{card.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
                  </div>
                )
              })}
            </div>

            <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155', marginBottom: 10 }}>SESSION LOG — click a row to mark as planned</div>
            {todaySessions.length === 0 && !isRunning ? (
              <div style={{ color: '#1e3a5f', padding: '32px 0', textAlign: 'center', fontSize: 13 }}>No sessions yet. Waiting for Arduino signal.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#','START','END','DURATION','STATUS'].map(function(h) {
                      return <th key={h} style={{ fontSize: 9, letterSpacing: 2, color: '#334155', padding: '8px 12px', textAlign: 'left' }}>{h}</th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {isRunning && (
                    <tr style={{ background: '#0a1e1044' }}>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>●</td>
                      <td style={{ padding: '10px 12px', color: '#34d399' }}>{fmtTime(new Date(lastEvent.created_at).getTime())}</td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>—</td>
                      <td style={{ padding: '10px 12px', color: '#34d399' }}>{String(Math.floor(liveSeconds/60)).padStart(2,'0')}:{String(liveSeconds%60).padStart(2,'0')} ⟳</td>
                      <td style={{ padding: '10px 12px' }}>—</td>
                    </tr>
                  )}
                  {todaySessions.slice().reverse().map(function(s, i) {
                    const dur = Math.round((s.stop - s.start) / 60000)
                    const pm = plannedMap[s.id] || {}
                    return (
                      <tr key={s.id} onClick={function() { setEditStop(editStop === s.id ? null : s.id); setCustomReason('') }}
                        style={{ borderBottom: '1px solid #0f1e30', cursor: 'pointer' }}>
                        <td style={{ padding: '10px 12px', color: '#334155', fontSize: 12 }}>{todaySessions.length - i}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{fmtTime(s.start)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{fmtTime(s.stop)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{dur}m</td>
                        <td style={{ padding: '10px 12px' }}>
                          {pm.planned
                            ? <span style={{ background: '#1e3a2f', color: '#34d399', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>PLANNED {pm.reason ? '· ' + pm.reason : ''}</span>
                            : <span style={{ background: '#3b0f0f', color: '#f87171', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>DOWNTIME</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {editStop && (function() {
              const s = todaySessions.find(function(x) { return x.id === editStop })
              if (!s) return null
              const pm = plannedMap[s.id] || {}
              return (
                <div style={{ marginTop: 12, background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: '#64748b', marginBottom: 12 }}>
                    EDIT STOP · {fmtTime(s.start)} to {fmtTime(s.stop)} ({Math.round((s.stop-s.start)/60000)}m)
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <button onClick={function() { markPlanned(s.id, true, pm.reason || PLANNED_REASONS[0]) }}
                      style={{ background: '#064e3b', color: '#34d399', border: '1px solid #34d39955', borderRadius: 6, padding: '9px 20px', cursor: 'pointer', fontFamily: 'monospace' }}>
                      Mark Planned
                    </button>
                    <button onClick={function() { markPlanned(s.id, false, '') }}
                      style={{ background: '#450a0a', color: '#f87171', border: '1px solid #f8717155', borderRadius: 6, padding: '9px 20px', cursor: 'pointer', fontFamily: 'monospace' }}>
                      Mark Downtime
                    </button>
                    <button onClick={function() { setEditStop(null) }}
                      style={{ background: 'none', color: '#64748b', border: '1px solid #1e3a5f', borderRadius: 5, padding: '5px 12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>
                      Cancel
                    </button>
                  </div>
                  {pm.planned && (
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: 2, color: '#334155', marginBottom: 8 }}>REASON</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        {PLANNED_REASONS.map(function(r) {
                          return (
                            <button key={r} onClick={function() { markPlanned(s.id, true, r) }}
                              style={{ background: 'none', border: '1px solid ' + (pm.reason===r?'#3b82f6':'#1e3a5f'), color: pm.reason===r?'#93c5fd':'#64748b', borderRadius: 5, padding: '5px 12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>
                              {r}
                            </button>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type='text' placeholder='Custom reason...' value={customReason} onChange={function(e) { setCustomReason(e.target.value) }}
                          style={{ flex: 1, background: '#0a1628', border: '1px solid #1e3a5f', color: '#e2e8f0', padding: '7px 12px', borderRadius: 6, fontFamily: 'monospace', fontSize: 12, outline: 'none' }} />
                        <button onClick={function() { if(customReason.trim()) markPlanned(s.id, true, customReason.trim()) }}
                          style={{ background: 'none', color: '#64748b', border: '1px solid #1e3a5f', borderRadius: 5, padding: '5px 12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>
                          Set
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {view === 'history' && !selectedDay && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155', marginBottom: 14 }}>DAILY LOGBOOK — click a day to view details</div>
            {allDays.length === 0 ? (
              <div style={{ color: '#1e3a5f', padding: '32px 0', textAlign: 'center', fontSize: 13 }}>No data yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['DATE','OPERATOR','SESSIONS','RUN TIME','UNPLANNED DT','AVAIL %'].map(function(h) {
                      return <th key={h} style={{ fontSize: 9, letterSpacing: 2, color: '#334155', padding: '8px 12px', textAlign: 'left' }}>{h}</th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {allDays.map(function(d) {
                    const evs = eventsByDay[d] || []
                    const sess = buildSessions(evs).map(function(s) { return Object.assign({}, s, plannedMap[s.id] || {}) })
                    const st = dayStats(sess)
                    const clr = availColor(st.avail)
                    return (
                      <tr key={d} onClick={function() { setSelectedDay(d) }} style={{ borderBottom: '1px solid #0f1e30', cursor: 'pointer' }}>
                        <td style={{ padding: '10px 12px', color: '#93c5fd', fontSize: 14, fontWeight: 600 }}>{fmtDate(d)}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>{dayOperators[d] || '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 12 }}>{sess.length}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{minsToHHMM(st.runMins)}</td>
                        <td style={{ padding: '10px 12px', color: '#f87171', fontSize: 12 }}>{minsToHHMM(st.unplannedMins)}</td>
                        <td style={{ padding: '10px 12px', color: clr, fontWeight: 600, fontSize: 12 }}>{st.avail.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view === 'history' && selectedDay && (function() {
          const evs = eventsByDay[selectedDay] || []
          const sess = buildSessions(evs).map(function(s) { return Object.assign({}, s, plannedMap[s.id] || {}) })
          const st = dayStats(sess)
          return (
            <div>
              <button onClick={function() { setSelectedDay(null) }}
                style={{ background: 'none', color: '#64748b', border: '1px solid #1e3a5f', borderRadius: 5, padding: '5px 12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, marginBottom: 16 }}>
                Back
              </button>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#93c5fd', marginBottom: 16 }}>{fmtDate(selectedDay)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'RUN TIME', value: minsToHHMM(st.runMins), color: '#34d399' },
                  { label: 'UNPLANNED DT', value: minsToHHMM(st.unplannedMins), color: '#f87171' },
                  { label: 'PLANNED DT', value: minsToHHMM(st.plannedMins), color: '#fbbf24' },
                  { label: 'AVAILABILITY', value: st.avail.toFixed(1) + '%', color: availColor(st.avail) },
                ].map(function(card) {
                  return (
                    <div key={card.label} style={{ background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 8, letterSpacing: 3, color: '#334155', marginBottom: 6 }}>{card.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
                    </div>
                  )
                })}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#','START','END','DURATION','STATUS'].map(function(h) {
                      return <th key={h} style={{ fontSize: 9, letterSpacing: 2, color: '#334155', padding: '8px 12px', textAlign: 'left' }}>{h}</th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sess.slice().reverse().map(function(s, i) {
                    const pm = plannedMap[s.id] || {}
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #0f1e30', cursor: 'pointer' }}
                        onClick={function() { setEditStop(editStop===s.id?null:s.id); setCustomReason('') }}>
                        <td style={{ padding: '10px 12px', color: '#334155', fontSize: 12 }}>{sess.length - i}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{fmtTime(s.start)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{fmtTime(s.stop)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{Math.round((s.stop-s.start)/60000)}m</td>
                        <td style={{ padding: '10px 12px' }}>
                          {pm.planned
                            ? <span style={{ background: '#1e3a2f', color: '#34d399', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>PLANNED</span>
                            : <span style={{ background: '#3b0f0f', color: '#f87171', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>DOWNTIME</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {view === 'settings' && (
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155', marginBottom: 14 }}>OPERATOR LIST</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {operators.map(function(op) {
                return (
                  <div key={op} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 8, padding: '10px 14px' }}>
                    <span style={{ fontSize: 13 }}>{op}</span>
                    <button onClick={function() { saveOperators(operators.filter(function(o) { return o !== op })) }}
                      style={{ background: 'none', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 5, padding: '5px 12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
              <input type='text' placeholder='Operator name...' value={newOp} onChange={function(e) { setNewOp(e.target.value) }}
                style={{ flex: 1, background: '#0a1628', border: '1px solid #1e3a5f', color: '#e2e8f0', padding: '7px 12px', borderRadius: 6, fontFamily: 'monospace', fontSize: 12, outline: 'none' }} />
              <button onClick={function() { if(newOp.trim()){ saveOperators(operators.concat([newOp.trim()])); setNewOp('') } }}
                style={{ background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f655', borderRadius: 6, padding: '9px 20px', cursor: 'pointer', fontFamily: 'monospace' }}>
                Add
              </button>
            </div>
            <div style={{ background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: '#334155', marginBottom: 12 }}>ARDUINO ENDPOINT</div>
              <div style={{ fontSize: 12, lineHeight: 2.2, color: '#94a3b8' }}>
                POST https://your-app.vercel.app/api/event<br/>
                Content-Type: application/json<br/>
                type: start or stop<br/>
                machine: line-2-case-packer
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

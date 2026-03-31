import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getBalance, getLevel, getBalanceWhatIf } from '../api.js'
import { KillRateLine, CurrencyBar, TransportHPLine } from '../components/BalanceChart.jsx'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const TOWER_COLORS = ['#f97316','#8b5cf6','#38bdf8','#ef4444','#22c55e','#facc15','#a78bfa','#fb923c']

function StatCard({ label, value, sub, color = 'text-gray-100' }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function DifficultyBadge({ rating }) {
  const colors = {
    Easy: 'bg-green-900/60 text-green-400 border-green-700',
    Medium: 'bg-yellow-900/60 text-yellow-400 border-yellow-700',
    Hard: 'bg-orange-900/60 text-orange-400 border-orange-700',
    Impossible: 'bg-red-900/60 text-red-400 border-red-700',
  }
  return (
    <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${colors[rating] || colors.Medium}`}>
      {rating}
    </span>
  )
}

function StatusIcon({ survivable }) {
  if (survivable) return <span title="Survivable">✅</span>
  return <span title="Not survivable">❌</span>
}

const WHATIF_DEFAULTS = {
  player_dps: 30, companion_count: 4, companion_dps: 15,
}

export default function BalancePage() {
  const { id } = useParams()
  const [balance, setBalance] = useState(null)
  const [level, setLevel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // What-if state
  const [whatifOpen, setWhatifOpen] = useState(false)
  const [whatif, setWhatif] = useState(WHATIF_DEFAULTS)
  const [whatifResult, setWhatifResult] = useState(null)
  const [whatifLoading, setWhatifLoading] = useState(false)
  const debounceRef = useRef(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [bal, lvl] = await Promise.all([getBalance(id), getLevel(id)])
      setBalance(bal)
      setLevel(lvl)
      // Seed what-if defaults from squad data if available
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [id])

  const runWhatif = useCallback((params) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setWhatifLoading(true)
      try {
        const res = await getBalanceWhatIf(id, params)
        setWhatifResult(res)
      } catch (e) {
        console.error(e)
      } finally {
        setWhatifLoading(false)
      }
    }, 500)
  }, [id])

  const handleWhatifChange = (key, val) => {
    const next = { ...whatif, [key]: val }
    setWhatif(next)
    runWhatif(next)
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Running simulation...
      </div>
    )

  if (error)
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-400">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-orange-500 rounded-lg text-sm text-white">
          Retry
        </button>
      </div>
    )

  if (!balance || !level) return null

  const waveStats = balance.wave_stats || []

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link to={`/level/${id}`} className="text-gray-500 hover:text-gray-300 text-sm">
              ← {level.name}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Balance Analysis</h1>
          <p className="text-gray-500 text-sm mt-1">{level.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <DifficultyBadge rating={balance.difficulty_rating} />
          {balance.is_level_survivable ? (
            <span className="text-green-400 text-sm font-medium">Survivable ✅</span>
          ) : (
            <span className="text-red-400 text-sm font-medium">Not Survivable ❌</span>
          )}
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg text-gray-300 transition-colors"
          >
            ↻ Re-run
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Waves"
          value={balance.total_waves}
          sub="configured waves"
          color="text-blue-400"
        />
        <StatCard
          label="Avg Kill Rate"
          value={`${balance.overall_kill_rate}%`}
          sub={`${balance.total_killed}/${balance.total_enemies} enemies`}
          color={balance.overall_kill_rate >= 80 ? 'text-green-400' : balance.overall_kill_rate >= 50 ? 'text-yellow-400' : 'text-red-400'}
        />
        <StatCard
          label="Currency Flow"
          value={balance.total_currency_flow.toLocaleString()}
          sub="total earned"
          color="text-yellow-400"
        />
        <StatCard
          label="Transport HP"
          value={`${balance.transport_hp_remaining.toLocaleString()} / ${balance.transport_hp_max}`}
          sub={`${balance.cumulative_transport_damage.toFixed(0)} damage taken`}
          color={balance.transport_hp_remaining > balance.transport_hp_max * 0.5 ? 'text-green-400' : balance.transport_hp_remaining > 0 ? 'text-yellow-400' : 'text-red-400'}
        />
      </div>

      {/* What-if Panel */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <button
          onClick={() => { setWhatifOpen(o => !o); if (!whatifOpen && !whatifResult) runWhatif(whatif) }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-orange-400">⚗</span>
            <span className="font-bold text-gray-200">What-if Simulator</span>
            <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">adjust squad without saving</span>
          </div>
          <span className="text-gray-500">{whatifOpen ? '−' : '+'}</span>
        </button>
        {whatifOpen && (
          <div className="border-t border-gray-700 p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Controls */}
              <div className="space-y-4 md:col-span-1">
                {[
                  { key: 'player_dps',      label: 'Player DPS',       min: 0,  max: 200, step: 5  },
                  { key: 'companion_count',  label: 'Companions',       min: 0,  max: 5,   step: 1  },
                  { key: 'companion_dps',    label: 'Companion DPS ea.', min: 0, max: 100, step: 5  },
                ].map(({ key, label, min, max, step }) => (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs text-gray-400">{label}</label>
                      <span className="text-xs font-bold text-orange-300">{whatif[key]}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={whatif[key]}
                      onChange={e => handleWhatifChange(key, parseFloat(e.target.value))}
                      className="w-full accent-orange-500"
                    />
                  </div>
                ))}
              </div>

              {/* What-if result comparison */}
              <div className="md:col-span-2">
                {whatifLoading && <p className="text-sm text-gray-500 animate-pulse">Running simulation...</p>}
                {whatifResult && !whatifLoading && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Scenario result</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        {
                          label: 'Kill Rate',
                          orig: `${balance.overall_kill_rate}%`,
                          next: `${whatifResult.overall_kill_rate}%`,
                          better: whatifResult.overall_kill_rate >= balance.overall_kill_rate,
                        },
                        {
                          label: 'Transport HP',
                          orig: balance.transport_hp_remaining,
                          next: whatifResult.transport_hp_remaining,
                          better: whatifResult.transport_hp_remaining >= balance.transport_hp_remaining,
                        },
                        {
                          label: 'Difficulty',
                          orig: balance.difficulty_rating,
                          next: whatifResult.difficulty_rating,
                          better: ['Easy','Medium'].includes(whatifResult.difficulty_rating),
                        },
                        {
                          label: 'Survivable',
                          orig: balance.is_level_survivable ? '✅' : '❌',
                          next: whatifResult.is_level_survivable ? '✅' : '❌',
                          better: whatifResult.is_level_survivable,
                        },
                      ].map(s => (
                        <div key={s.label} className="bg-gray-900/60 rounded-lg p-3 border border-gray-700">
                          <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
                          <p className="text-xs text-gray-500 line-through">{s.orig}</p>
                          <p className={`text-sm font-bold ${s.better ? 'text-green-400' : 'text-red-400'}`}>{s.next}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {waveStats.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-500">
          <span className="text-4xl mb-3">📊</span>
          <p>No wave data. Configure waves in the Level Editor to see simulation results.</p>
          <Link to={`/level/${id}`} className="mt-3 text-orange-400 hover:text-orange-300 text-sm">
            Go to Level Editor →
          </Link>
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-gray-200 mb-4">Enemy Kill Rate by Wave</h3>
              <KillRateLine waveStats={waveStats} />
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-gray-200 mb-4">Transport HP Over Waves</h3>
              <TransportHPLine waveStats={waveStats} transportHpMax={balance.transport_hp_max} />
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h3 className="font-bold text-gray-200 mb-4">Currency Earned per Wave</h3>
            <CurrencyBar waveStats={waveStats} />
          </div>

          {/* Tower Damage Breakdown */}
          {balance.tower_contributions?.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Horizontal bars summary */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <h3 className="font-bold text-gray-200 mb-4">Tower Damage Contribution</h3>
                <div className="space-y-3">
                  {balance.tower_contributions.map((t, i) => (
                    <div key={t.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300 font-medium">{t.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{t.damage.toLocaleString()} dmg</span>
                          <span className="text-xs font-bold" style={{ color: TOWER_COLORS[i % TOWER_COLORS.length] }}>
                            {t.pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${t.pct}%`,
                            backgroundColor: TOWER_COLORS[i % TOWER_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-4">
                  Total tower damage: {balance.tower_contributions.reduce((s, t) => s + t.damage, 0).toLocaleString()}
                </p>
              </div>

              {/* Per-wave stacked damage chart */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <h3 className="font-bold text-gray-200 mb-4">Damage per Wave by Tower</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={waveStats.map(w => {
                      const row = { wave: `W${w.wave_number}` }
                      ;(w.tower_breakdown || []).forEach(t => { row[t.name] = t.damage })
                      return row
                    })}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="wave" tick={{ fill: '#6e7681', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#6e7681', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' }}
                      labelStyle={{ color: '#e6edf3', fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
                    {balance.tower_contributions.map((t, i) => (
                      <Bar key={t.name} dataKey={t.name} stackId="dmg"
                        fill={TOWER_COLORS[i % TOWER_COLORS.length]}
                        radius={i === balance.tower_contributions.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-wave table */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="font-bold text-gray-200">Wave-by-Wave Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    {['Wave', 'Total', 'Killed', 'Escaped', 'Kill %', 'Transport Dmg', 'Currency', 'Duration', 'Status'].map(
                      (h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {waveStats.map((w, i) => {
                    const killPct = w.enemies_total > 0 ? Math.round((w.enemies_killed / w.enemies_total) * 100) : 100
                    return (
                      <tr
                        key={w.wave_number}
                        className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                          !w.is_survivable ? 'bg-red-900/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-blue-400">W{w.wave_number}</td>
                        <td className="px-4 py-3 text-gray-300">{w.enemies_total}</td>
                        <td className="px-4 py-3 text-green-400">{w.enemies_killed}</td>
                        <td className="px-4 py-3 text-red-400">{w.enemies_escaped}</td>
                        <td className="px-4 py-3">
                          <span className={killPct >= 80 ? 'text-green-400' : killPct >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                            {killPct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-red-300">{w.transport_damage}</td>
                        <td className="px-4 py-3 text-yellow-400">{w.currency_earned}</td>
                        <td className="px-4 py-3 text-gray-400">{w.estimated_duration}s</td>
                        <td className="px-4 py-3">
                          <StatusIcon survivable={w.is_survivable} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

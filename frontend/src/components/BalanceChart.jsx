import React from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const DARK_TOOLTIP = {
  contentStyle: {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: '#f3f4f6',
    fontSize: '12px',
  },
  labelStyle: { color: '#9ca3af' },
}

export function KillRateLine({ waveStats }) {
  const data = waveStats.map((w) => ({
    wave: `W${w.wave_number}`,
    killed: w.enemies_killed,
    escaped: w.enemies_escaped,
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="wave" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip {...DARK_TOOLTIP} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Line type="monotone" dataKey="killed" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} name="Killed" />
        <Line type="monotone" dataKey="escaped" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} name="Escaped" />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CurrencyBar({ waveStats }) {
  const data = waveStats.map((w) => ({
    wave: `W${w.wave_number}`,
    earned: w.currency_earned,
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="wave" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip {...DARK_TOOLTIP} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar dataKey="earned" fill="#f59e0b" name="Currency Earned" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TransportHPLine({ waveStats, transportHpMax }) {
  let cumDmg = 0
  const data = waveStats.map((w) => {
    cumDmg += w.transport_damage
    return {
      wave: `W${w.wave_number}`,
      hp: Math.max(0, transportHpMax - cumDmg),
    }
  })

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="wave" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis domain={[0, transportHpMax]} tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip {...DARK_TOOLTIP} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="hp"
          stroke="#34d399"
          strokeWidth={2.5}
          dot={{ fill: '#34d399', r: 3 }}
          name="Transport HP"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

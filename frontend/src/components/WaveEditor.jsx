import React, { useState } from 'react'

const SIZE_COLORS = {
  Small: 'text-yellow-400',
  Medium: 'text-orange-400',
  Large: 'text-red-400',
}

function WaveGroup({ group, index, enemyTypes, onUpdate, onDelete }) {
  const enemyType = enemyTypes.find((e) => e.id === group.enemy_type_id)

  const totalSpawned = group.count * (group.per_spawn || 1)
  const estimatedDuration = group.count * (group.spawn_interval || 1.0)
  const totalHp = enemyType ? totalSpawned * enemyType.hp : 0
  const currencyReward = enemyType ? totalSpawned * enemyType.currency_drop : 0

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">Group {index + 1}</span>
        <button
          onClick={onDelete}
          className="text-gray-600 hover:text-red-400 transition-colors text-xs"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Enemy Type</label>
          <select
            value={group.enemy_type_id || ''}
            onChange={(e) => onUpdate({ ...group, enemy_type_id: parseInt(e.target.value) })}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          >
            <option value="">Select enemy...</option>
            {enemyTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.name} ({et.size})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Per spawn</label>
          <input
            type="number"
            value={group.per_spawn || 1}
            min={1}
            max={5}
            onChange={(e) => onUpdate({ ...group, per_spawn: parseInt(e.target.value) })}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Count: <span className="text-orange-400 font-bold">{group.count}</span>
          <span className="text-gray-600 ml-2">(total: {totalSpawned})</span>
        </label>
        <input
          type="range"
          value={group.count}
          min={1}
          max={30}
          onChange={(e) => onUpdate({ ...group, count: parseInt(e.target.value) })}
          className="w-full accent-orange-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Spawn interval: <span className="text-blue-400 font-bold">{group.spawn_interval}s</span>
        </label>
        <input
          type="range"
          value={group.spawn_interval}
          min={0.5}
          max={5.0}
          step={0.5}
          onChange={(e) => onUpdate({ ...group, spawn_interval: parseFloat(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </div>

      {/* Wave weight bar */}
      {enemyType && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Total HP: <span className="text-red-400">{totalHp.toLocaleString()}</span></span>
            <span>~{estimatedDuration.toFixed(1)}s</span>
            <span className="text-yellow-400">+{currencyReward} 💰</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-orange-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (totalHp / 5000) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Spawn Timing Diagram ────────────────────────────────────────────────────
const GROUP_COLORS = ['#f97316', '#38bdf8', '#a78bfa', '#22c55e', '#ef4444', '#facc15']

function SpawnTimeline({ groups, enemyTypes, preWaveDelay }) {
  const delay = preWaveDelay || 0

  // Build all spawn events: { t, groupIdx, enemyName }
  const events = []
  groups.forEach((g, gi) => {
    if (!g.enemy_type_id) return
    const et = enemyTypes.find(e => e.id === g.enemy_type_id)
    const name = et?.name ?? '?'
    for (let i = 0; i < g.count; i++) {
      events.push({ t: delay + i * (g.spawn_interval || 1), gi, name })
    }
  })

  if (events.length === 0) return null

  const maxT = Math.max(...events.map(e => e.t)) + 2
  const W = 500, H = 48, ROW_H = 14, PAD = 4

  const rowCount = groups.filter(g => g.enemy_type_id).length
  const totalH = PAD + rowCount * (ROW_H + 3) + 16

  let rowMap = {}
  let rowIdx = 0
  groups.forEach((g, gi) => { if (g.enemy_type_id) rowMap[gi] = rowIdx++ })

  return (
    <div className="mt-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Spawn Timeline</p>
      <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full rounded-lg bg-gray-900/60 border border-gray-800" style={{ height: totalH }}>
        {/* Time axis */}
        {Array.from({ length: Math.ceil(maxT) + 1 }, (_, i) => i).map(t => (
          <g key={t}>
            <line x1={PAD + (t / maxT) * (W - PAD * 2)} y1={PAD} x2={PAD + (t / maxT) * (W - PAD * 2)} y2={totalH - 14} stroke="#21262d" strokeWidth={0.5} />
            <text x={PAD + (t / maxT) * (W - PAD * 2)} y={totalH - 3} fill="#4b5563" fontSize={7} textAnchor="middle">{t}s</text>
          </g>
        ))}

        {/* Group lanes */}
        {groups.map((g, gi) => {
          if (!g.enemy_type_id) return null
          const et = enemyTypes.find(e => e.id === g.enemy_type_id)
          const ry = PAD + rowMap[gi] * (ROW_H + 3)
          const color = GROUP_COLORS[gi % GROUP_COLORS.length]
          return (
            <g key={gi}>
              {/* Lane label */}
              <text x={PAD} y={ry + ROW_H - 3} fill={color} fontSize={7.5} fontWeight="bold">{et?.name?.[0] ?? '?'}</text>
              {/* Spawn dots */}
              {Array.from({ length: g.count }, (_, i) => {
                const t = delay + i * (g.spawn_interval || 1)
                const x = PAD + 14 + ((t) / maxT) * (W - PAD * 2 - 14)
                return (
                  <rect key={i} x={x - 2} y={ry + 2} width={4} height={ROW_H - 4}
                    fill={color} fillOpacity={0.85} rx={1} />
                )
              })}
            </g>
          )
        })}
      </svg>
      <p className="text-[9px] text-gray-600 mt-1">Each bar = 1 spawn batch · {events.length} total spawns over {maxT.toFixed(1)}s</p>
    </div>
  )
}

function WaveRow({ wave, enemyTypes, onUpdate, isExpanded, onToggle }) {
  const groups = wave.groups || []
  const totalEnemies = groups.reduce(
    (sum, g) => sum + g.count * (g.per_spawn || 1),
    0
  )
  const totalHp = groups.reduce((sum, g) => {
    const et = enemyTypes.find((e) => e.id === g.enemy_type_id)
    return sum + (et ? g.count * (g.per_spawn || 1) * et.hp : 0)
  }, 0)
  const totalCurrency = groups.reduce((sum, g) => {
    const et = enemyTypes.find((e) => e.id === g.enemy_type_id)
    return sum + (et ? g.count * (g.per_spawn || 1) * et.currency_drop : 0)
  }, 0)

  const addGroup = () => {
    const defaultEt = enemyTypes[0]
    const newGroup = {
      enemy_type_id: defaultEt ? defaultEt.id : null,
      count: 5,
      spawn_interval: 1.0,
      per_spawn: 1,
    }
    onUpdate({ ...wave, groups: [...groups, newGroup] })
  }

  const updateGroup = (idx, updated) => {
    const newGroups = groups.map((g, i) => (i === idx ? updated : g))
    onUpdate({ ...wave, groups: newGroups })
  }

  const deleteGroup = (idx) => {
    const newGroups = groups.filter((_, i) => i !== idx)
    onUpdate({ ...wave, groups: newGroups })
  }

  const weightPercent = Math.min(100, (totalHp / 10000) * 100)

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      {/* Wave header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-750 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="w-8 h-8 rounded-lg bg-blue-900/60 border border-blue-700 flex items-center justify-center text-sm font-bold text-blue-300">
          {wave.wave_number}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-300 font-medium">Wave {wave.wave_number}</span>
            {totalEnemies > 0 && (
              <>
                <span className="text-gray-500">{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
                <span className="text-gray-500">{totalEnemies} enemies</span>
                <span className="text-yellow-400 text-xs">+{totalCurrency} 💰</span>
              </>
            )}
          </div>
          {totalHp > 0 && (
            <div className="mt-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-700 to-orange-500 rounded-full"
                style={{ width: `${weightPercent}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">delay: {wave.pre_wave_delay}s</span>
          <span className="text-gray-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Wave body */}
      {isExpanded && (
        <div className="p-4 bg-gray-850 space-y-3" style={{ background: '#161b27' }}>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 whitespace-nowrap">Pre-wave delay:</label>
            <input
              type="number"
              value={wave.pre_wave_delay}
              min={0}
              max={30}
              step={0.5}
              onChange={(e) =>
                onUpdate({ ...wave, pre_wave_delay: parseFloat(e.target.value) })
              }
              className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            />
            <span className="text-xs text-gray-600">seconds</span>
          </div>

          {groups.map((group, idx) => (
            <WaveGroup
              key={idx}
              group={group}
              index={idx}
              enemyTypes={enemyTypes}
              onUpdate={(updated) => updateGroup(idx, updated)}
              onDelete={() => deleteGroup(idx)}
            />
          ))}

          <button
            onClick={addGroup}
            className="w-full py-2 border border-dashed border-gray-600 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:border-gray-400 transition-colors"
          >
            + Add enemy group
          </button>

          {groups.length > 0 && (
            <SpawnTimeline groups={groups} enemyTypes={enemyTypes} preWaveDelay={wave.pre_wave_delay} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Wave presets ────────────────────────────────────────────────────────────
const WAVE_PRESETS = [
  { name: 'Scout Rush',    icon: '🏃', desc: '15 scouts, fast interval',   groups: [{ type:'Scout',  count:15, interval:0.8, per_spawn:1 }] },
  { name: 'Grunt March',   icon: '🧟', desc: '10 grunts, steady pace',     groups: [{ type:'Grunt',  count:10, interval:1.5, per_spawn:1 }] },
  { name: 'Brute Assault', icon: '👹', desc: '5 brutes, slow heavy hitters', groups: [{ type:'Brute', count:5,  interval:2.5, per_spawn:1 }] },
  { name: 'Mixed Raid',    icon: '⚔️', desc: 'Scouts + Grunts + 2 Brutes', groups: [
    { type:'Scout', count:6,  interval:0.8, per_spawn:1 },
    { type:'Grunt', count:5,  interval:1.5, per_spawn:1 },
    { type:'Brute', count:2,  interval:3.0, per_spawn:1 },
  ]},
  { name: 'Horde',         icon: '🌊', desc: '20 scouts, swarming fast',   groups: [{ type:'Scout',  count:20, interval:0.5, per_spawn:2 }] },
  { name: 'Brute Wall',    icon: '🛡️', desc: '8 brutes, wall formation',   groups: [{ type:'Brute',  count:8,  interval:1.5, per_spawn:1 }] },
]

export default function WaveEditor({ waves, enemyTypes, onWaveUpdate, onWaveCreate, onWaveDelete }) {
  const [expanded, setExpanded] = useState(new Set([1]))
  const [showPresets, setShowPresets] = useState(false)

  const toggleExpanded = (waveNum) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(waveNum)) next.delete(waveNum)
      else next.add(waveNum)
      return next
    })
  }

  const maxWave = waves.length > 0 ? Math.max(...waves.map((w) => w.wave_number)) : 0

  const addWave = () => {
    const nextNum = maxWave + 1
    if (nextNum > 15) return
    onWaveCreate({ wave_number: nextNum, groups: [], pre_wave_delay: 3.0 })
    setExpanded((prev) => new Set([...prev, nextNum]))
  }

  const duplicateWave = (wave) => {
    const nextNum = maxWave + 1
    if (nextNum > 15) return
    const groups = typeof wave.groups === 'string' ? JSON.parse(wave.groups) : wave.groups
    onWaveCreate({ wave_number: nextNum, groups, pre_wave_delay: wave.pre_wave_delay })
    setExpanded((prev) => new Set([...prev, nextNum]))
  }

  const applyPreset = (preset) => {
    const nextNum = maxWave + 1
    if (nextNum > 15) return
    const groups = preset.groups.map(g => {
      const et = enemyTypes.find(e => e.name === g.type)
      return { enemy_type_id: et?.id ?? null, count: g.count, spawn_interval: g.interval, per_spawn: g.per_spawn }
    }).filter(g => g.enemy_type_id)
    onWaveCreate({ wave_number: nextNum, groups, pre_wave_delay: 3.0 })
    setExpanded((prev) => new Set([...prev, nextNum]))
    setShowPresets(false)
  }

  const sortedWaves = [...waves].sort((a, b) => a.wave_number - b.wave_number)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-200">Wave Configuration</h3>
          <p className="text-xs text-gray-500 mt-0.5">{waves.length}/15 waves configured</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowPresets(p => !p)}
              disabled={maxWave >= 15}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-600"
            >
              Presets ▾
            </button>
            {showPresets && (
              <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider px-1">Add from preset</p>
                </div>
                {WAVE_PRESETS.map(p => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-800 transition-colors flex items-start gap-2.5"
                  >
                    <span className="text-base flex-shrink-0">{p.icon}</span>
                    <div>
                      <p className="text-sm text-gray-200 font-medium">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={addWave}
            disabled={maxWave >= 15}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Add Wave
          </button>
        </div>
      </div>

      {sortedWaves.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-gray-500">
          <span className="text-4xl mb-3">🌊</span>
          <p>No waves yet. Click "Add Wave" or choose a preset.</p>
        </div>
      ) : (
        sortedWaves.map((wave) => (
          <div key={wave.id} className="relative">
            <WaveRow
              wave={{ ...wave, groups: typeof wave.groups === 'string' ? JSON.parse(wave.groups) : wave.groups }}
              enemyTypes={enemyTypes}
              onUpdate={(updated) => onWaveUpdate(wave.id, updated)}
              isExpanded={expanded.has(wave.wave_number)}
              onToggle={() => toggleExpanded(wave.wave_number)}
            />
            <div className="absolute top-3 right-2 flex items-center gap-1">
              <button
                onClick={() => duplicateWave(wave)}
                disabled={maxWave >= 15}
                className="text-gray-600 hover:text-blue-400 transition-colors text-xs px-1.5 py-0.5 rounded hover:bg-blue-900/20 disabled:opacity-30"
                title="Duplicate wave"
              >
                ⧉
              </button>
              <button
                onClick={() => onWaveDelete(wave.id)}
                className="text-gray-600 hover:text-red-400 transition-colors text-xs px-1.5 py-0.5 rounded hover:bg-red-900/20"
                title="Delete wave"
              >
                ✕
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

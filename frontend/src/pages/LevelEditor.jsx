import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getLevel, updateLevel,
  getWaves, createWave, updateWave, deleteWave,
  getPlacements, savePlacements,
  getSquad, saveSquad,
  getTowerTypes, getEnemyTypes,
} from '../api.js'
import PathCanvas from '../components/PathCanvas.jsx'
import WaveEditor from '../components/WaveEditor.jsx'

const TABS = ['Map', 'Waves', 'Placements', 'Squad', 'Strategy']

function SaveIndicator({ saving, saved }) {
  if (saving) return <span className="text-xs text-yellow-400">Saving...</span>
  if (saved) return <span className="text-xs text-green-400">Saved ✓</span>
  return null
}

function PlacementsTab({ level, placements, towerTypes, onChange }) {
  const slots = level.tower_slots || []

  const getPlacement = (slotId) => placements.find((p) => p.slot_id === slotId)

  const setPlacement = (slotId, towerId, upgradeLevel) => {
    const existing = placements.filter((p) => p.slot_id !== slotId)
    if (towerId) {
      onChange([...existing, { slot_id: slotId, tower_type_id: towerId, upgrade_level: upgradeLevel || 0 }])
    } else {
      onChange(existing)
    }
  }

  const upgradeMultipliers = [1.0, 1.6, 2.5, 4.0]

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-gray-500">
        <span className="text-4xl mb-3">🏗️</span>
        <p>No tower slots defined. Add slots in the Map tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-200">Tower Placements</h3>
          <p className="text-xs text-gray-500 mt-0.5">{placements.length}/{slots.length} slots filled</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {slots.map((slot, idx) => {
          const placement = getPlacement(slot.id)
          const selectedTower = placement ? towerTypes.find((t) => t.id === placement.tower_type_id) : null
          const upgradeLevel = placement?.upgrade_level || 0

          const dpsM = selectedTower ? JSON.parse(selectedTower.upgrade_dps_mults || '[1,1.6,2.5,4]') : upgradeMultipliers
          const rangeM = selectedTower ? JSON.parse(selectedTower.upgrade_range_mults || '[1,1.15,1.3,1.5]') : [1, 1.15, 1.3, 1.5]
          const costsM = selectedTower ? JSON.parse(selectedTower.upgrade_costs || '[0,0.6,1.0,1.5]') : [0, 0.6, 1.0, 1.5]
          const actualDps = selectedTower ? (selectedTower.base_dps * dpsM[upgradeLevel]).toFixed(1) : '-'
          const actualRange = selectedTower ? (selectedTower.base_range * rangeM[upgradeLevel]).toFixed(0) : '-'
          const upgradeCost = selectedTower ? Math.round(selectedTower.base_cost * costsM[upgradeLevel]) : 0

          return (
            <div key={slot.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-orange-800/60 border border-orange-600 rounded flex items-center justify-center text-xs font-bold text-orange-300">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Slot {idx + 1}</p>
                    {slot.unlock_wave > 0 && (
                      <p className="text-xs text-yellow-500">Unlocks after wave {slot.unlock_wave}</p>
                    )}
                  </div>
                </div>
                {placement && (
                  <button
                    onClick={() => setPlacement(slot.id, null, 0)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tower Type</label>
                  <select
                    value={placement?.tower_type_id || ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null
                      setPlacement(slot.id, val, 0)
                    }}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Empty slot --</option>
                    {towerTypes.map((tt) => (
                      <option key={tt.id} value={tt.id}>
                        {tt.name} ({tt.category}) — {tt.base_cost}💰
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTower && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Upgrade Level: <span className="text-orange-400 font-bold">Lv {upgradeLevel}</span>
                        {upgradeLevel > 0 && <span className="text-gray-600 ml-2">(cost: {upgradeCost}💰)</span>}
                      </label>
                      <input
                        type="range"
                        value={upgradeLevel}
                        min={0}
                        max={3}
                        onChange={(e) => setPlacement(slot.id, selectedTower.id, parseInt(e.target.value))}
                        className="w-full accent-orange-500"
                      />
                      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                        <span>Base</span>
                        <span>Lv1</span>
                        <span>Lv2</span>
                        <span>Lv3</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gray-900/60 rounded p-2">
                        <p className="text-xs text-gray-500">DPS</p>
                        <p className="text-sm font-bold text-orange-400">{actualDps}</p>
                      </div>
                      <div className="bg-gray-900/60 rounded p-2">
                        <p className="text-xs text-gray-500">Range</p>
                        <p className="text-sm font-bold text-blue-400">{actualRange}</p>
                      </div>
                      <div className="bg-gray-900/60 rounded p-2">
                        <p className="text-xs text-gray-500">Type</p>
                        <p className="text-xs font-bold text-purple-400">{selectedTower.effect_type}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SquadTab({ squad, onSave }) {
  const [form, setForm] = useState(squad || {
    player_dps: 30,
    player_hp: 200,
    player_range: 80,
    companion_count: 4,
    companion_dps: 15,
    companion_hp: 120,
    companion_level: 1,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (squad) setForm(squad)
  }, [squad])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const totalSquadDps = form.player_dps + form.companion_count * form.companion_dps

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h3 className="font-bold text-gray-200 mb-1">Squad Configuration</h3>
        <p className="text-xs text-gray-500">Squad covers the last 15% of the path (near transport).</p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-bold text-orange-400">Player</h4>
        {[
          { key: 'player_dps', label: 'DPS', min: 0, max: 200 },
          { key: 'player_hp', label: 'HP', min: 50, max: 1000 },
          { key: 'player_range', label: 'Range', min: 30, max: 200 },
        ].map(({ key, label, min, max }) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">
              {label}: <span className="text-blue-400 font-bold">{form[key]}</span>
            </label>
            <input
              type="range"
              value={form[key]}
              min={min}
              max={max}
              step={5}
              onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>
        ))}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-bold text-purple-400">Companions</h4>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Count: <span className="text-purple-400 font-bold">{form.companion_count}</span>
          </label>
          <input
            type="range"
            value={form.companion_count}
            min={0}
            max={5}
            onChange={(e) => setForm({ ...form, companion_count: parseInt(e.target.value) })}
            className="w-full accent-purple-500"
          />
        </div>
        {[
          { key: 'companion_dps', label: 'DPS each', min: 0, max: 100 },
          { key: 'companion_hp', label: 'HP each', min: 50, max: 500 },
          { key: 'companion_level', label: 'Level', min: 1, max: 5 },
        ].map(({ key, label, min, max }) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">
              {label}: <span className="text-purple-400 font-bold">{form[key]}</span>
            </label>
            <input
              type="range"
              value={form[key]}
              min={min}
              max={max}
              step={1}
              onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) })}
              className="w-full accent-purple-500"
            />
          </div>
        ))}
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4">
        <p className="text-sm text-gray-400">Total Squad DPS: <span className="text-green-400 font-bold text-base">{totalSquadDps}</span></p>
        <p className="text-xs text-gray-600 mt-1">Applies to enemies in the squad coverage zone</p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Squad Config'}
      </button>
    </div>
  )
}

const DPS_MULTS = [1.0, 1.6, 2.5, 4.0]
const RANGE_MULTS = [1.0, 1.15, 1.3, 1.5]
const COST_MULTS = [0, 0.6, 1.0, 1.5]

function parseMults(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : (str || fallback) } catch { return fallback }
}

function towerEfficiency(tower, fromLevel) {
  const dpsM = parseMults(tower.upgrade_dps_mults, DPS_MULTS)
  const costsM = parseMults(tower.upgrade_costs, COST_MULTS)
  if (fromLevel >= 3) return null
  const currentDps = tower.base_dps * dpsM[fromLevel]
  const nextDps = tower.base_dps * dpsM[fromLevel + 1]
  const cost = Math.round(tower.base_cost * costsM[fromLevel + 1])
  const gain = nextDps - currentDps
  return { cost, dpsGain: gain, efficiency: cost > 0 ? gain / cost : 0, fromLevel, toLevel: fromLevel + 1 }
}

function StrategyTab({ level, waves, placements, towerTypes, enemyTypes }) {
  const slots = level.tower_slots || []

  // Compute currency earned per wave (100% kill assumption)
  const waveEarnings = waves.map((wave) => {
    const groups = typeof wave.groups === 'string' ? JSON.parse(wave.groups) : (wave.groups || [])
    return groups.reduce((sum, g) => {
      const enemy = enemyTypes.find((e) => e.id === g.enemy_type_id)
      return sum + (enemy?.currency_drop || 0) * (g.count || 0)
    }, 0)
  })

  const sortedWaves = [...waves].sort((a, b) => a.wave_number - b.wave_number)

  // Build decision matrix for each wave checkpoint
  const checkpoints = sortedWaves.map((wave, idx) => {
    const waveNum = wave.wave_number
    const cumulative = waveEarnings.slice(0, idx + 1).reduce((a, b) => a + b, 0)
    const available = (level.starting_currency || 0) + cumulative

    // Slots unlocked at this wave
    const unlockedSlots = slots.filter((s) => (s.unlock_wave ?? s.unlock_after_wave ?? 0) <= waveNum)
    const filledSlotIds = new Set(placements.map((p) => p.slot_id))
    const emptySlots = unlockedSlots.filter((s) => !filledSlotIds.has(s.id))

    // Build options: cheapest and best-value tower for an empty slot
    let buildOptions = []
    if (emptySlots.length > 0) {
      const affordable = towerTypes.filter((t) => t.base_cost <= available)
      const cheapest = [...towerTypes].sort((a, b) => a.base_cost - b.base_cost)[0]
      const bestValue = affordable.length > 0
        ? affordable.reduce((best, t) => (t.base_dps / t.base_cost > best.base_dps / best.base_cost ? t : best), affordable[0])
        : null

      if (cheapest) {
        buildOptions.push({
          label: cheapest.name,
          cost: cheapest.base_cost,
          dpsGain: cheapest.base_dps,
          efficiency: cheapest.base_dps / cheapest.base_cost,
          canAfford: available >= cheapest.base_cost,
          tag: 'cheapest',
        })
      }
      if (bestValue && bestValue.id !== cheapest?.id) {
        buildOptions.push({
          label: bestValue.name,
          cost: bestValue.base_cost,
          dpsGain: bestValue.base_dps,
          efficiency: bestValue.base_dps / bestValue.base_cost,
          canAfford: available >= bestValue.base_cost,
          tag: 'best value',
        })
      }
    }

    // Upgrade options: all placed towers, sorted by DPS/cost efficiency
    const upgradeOptions = placements
      .map((p) => {
        const tower = towerTypes.find((t) => t.id === p.tower_type_id)
        if (!tower) return null
        const eff = towerEfficiency(tower, p.upgrade_level)
        if (!eff) return null
        const slotIdx = slots.findIndex((s) => s.id === p.slot_id)
        return {
          label: `${tower.name} Lv${eff.fromLevel}→Lv${eff.toLevel}`,
          slotLabel: slotIdx >= 0 ? `Slot ${slotIdx + 1}` : 'Slot ?',
          cost: eff.cost,
          dpsGain: eff.dpsGain,
          efficiency: eff.efficiency,
          canAfford: available >= eff.cost,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.efficiency - a.efficiency)

    const bestBuild = buildOptions.find((o) => o.canAfford) || buildOptions[0] || null
    const bestUpgrade = upgradeOptions.find((o) => o.canAfford) || upgradeOptions[0] || null

    let recommendation = null
    if (bestBuild && bestUpgrade && bestBuild.canAfford && bestUpgrade.canAfford) {
      recommendation = bestBuild.efficiency >= bestUpgrade.efficiency * 1.1
        ? 'build'
        : bestUpgrade.efficiency >= bestBuild.efficiency * 1.1
        ? 'upgrade'
        : 'either'
    } else if (bestBuild?.canAfford && !bestUpgrade?.canAfford) {
      recommendation = 'build'
    } else if (bestUpgrade?.canAfford && !bestBuild?.canAfford) {
      recommendation = 'upgrade'
    } else if (!bestBuild && bestUpgrade) {
      recommendation = 'upgrade'
    } else if (bestBuild && !bestUpgrade) {
      recommendation = 'build'
    }

    return { wave, waveNum, available, cumulative, emptySlots, buildOptions, upgradeOptions, bestBuild, bestUpgrade, recommendation }
  })

  const recColors = {
    build: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    upgrade: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    either: 'text-green-400 bg-green-500/10 border-green-500/30',
  }
  const recLabels = {
    build: '🏗️ Build new tower',
    upgrade: '⬆️ Upgrade existing',
    either: '≈ Either works',
  }

  if (waves.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-gray-500">
        <span className="text-4xl mb-3">📈</span>
        <p>Add waves in the Waves tab to see strategy analysis.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h3 className="font-bold text-gray-200 text-base">Build vs Upgrade Decision Planner</h3>
        <p className="text-xs text-gray-500 mt-1">
          After each wave you earn currency from kills. This shows the optimal spend decision at each checkpoint.
          Assumes 100% kill rate. Current placements from the Placements tab are used as baseline.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-gray-400">Build: DPS/💰 of new tower</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-gray-400">Upgrade: extra DPS per 💰 spent</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-gray-400">Higher efficiency = better value</span>
        </div>
      </div>

      {checkpoints.map(({ wave, waveNum, available, cumulative, emptySlots, buildOptions, upgradeOptions, bestBuild, bestUpgrade, recommendation }) => (
        <div key={wave.id} className="bg-[#161b22] border border-gray-800 rounded-2xl overflow-hidden">
          {/* Wave header */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-900/60 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-xs font-bold text-orange-300">
                W{waveNum}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-200">After Wave {waveNum}</p>
                <p className="text-xs text-gray-500">
                  +{cumulative}💰 earned total &middot; {emptySlots.length} empty slot{emptySlots.length !== 1 ? 's' : ''} available
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-gray-500">Accumulated</p>
                <p className="text-base font-bold text-yellow-400 stat-num">{available}💰</p>
              </div>
              {recommendation && (
                <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${recColors[recommendation]}`}>
                  {recLabels[recommendation]}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-gray-800">
            {/* Build column */}
            <div className="p-4">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3">
                🏗️ Build New Tower
                {emptySlots.length === 0 && <span className="text-gray-600 font-normal ml-2">(no empty slots)</span>}
              </p>
              {emptySlots.length === 0 ? (
                <p className="text-xs text-gray-600 italic">All unlocked slots are filled.</p>
              ) : buildOptions.length === 0 ? (
                <p className="text-xs text-gray-600 italic">No tower data available.</p>
              ) : (
                <div className="space-y-2">
                  {buildOptions.map((opt, i) => (
                    <div
                      key={i}
                      className={`rounded-xl p-3 border ${
                        opt.canAfford
                          ? recommendation === 'build'
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-gray-800/60 border-gray-700'
                          : 'bg-gray-900/40 border-gray-800 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-200">{opt.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          opt.tag === 'best value' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'
                        }`}>
                          {opt.tag}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-500">Cost</p>
                          <p className={`text-sm font-bold stat-num ${opt.canAfford ? 'text-yellow-400' : 'text-red-400'}`}>
                            {opt.cost}💰
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">DPS gain</p>
                          <p className="text-sm font-bold text-orange-400 stat-num">+{opt.dpsGain.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">DPS/💰</p>
                          <p className="text-sm font-bold text-blue-400 stat-num">{opt.efficiency.toFixed(3)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upgrade column */}
            <div className="p-4">
              <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-3">
                ⬆️ Upgrade Existing Tower
                {placements.length === 0 && <span className="text-gray-600 font-normal ml-2">(no placed towers)</span>}
              </p>
              {upgradeOptions.length === 0 ? (
                <p className="text-xs text-gray-600 italic">
                  {placements.length === 0 ? 'No towers placed yet.' : 'All towers are maxed (Lv3).'}
                </p>
              ) : (
                <div className="space-y-2">
                  {upgradeOptions.slice(0, 3).map((opt, i) => (
                    <div
                      key={i}
                      className={`rounded-xl p-3 border ${
                        opt.canAfford
                          ? recommendation === 'upgrade' && i === 0
                            ? 'bg-yellow-500/10 border-yellow-500/30'
                            : 'bg-gray-800/60 border-gray-700'
                          : 'bg-gray-900/40 border-gray-800 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-200">{opt.label}</span>
                        <span className="text-[10px] text-gray-500">{opt.slotLabel}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-500">Cost</p>
                          <p className={`text-sm font-bold stat-num ${opt.canAfford ? 'text-yellow-400' : 'text-red-400'}`}>
                            {opt.cost}💰
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">DPS gain</p>
                          <p className="text-sm font-bold text-orange-400 stat-num">+{opt.dpsGain.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">DPS/💰</p>
                          <p className="text-sm font-bold text-yellow-400 stat-num">{opt.efficiency.toFixed(3)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {upgradeOptions.length > 3 && (
                    <p className="text-xs text-gray-600 pl-1">+{upgradeOptions.length - 3} more options…</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Summary insight */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Wave Economy Summary</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="pb-2 pr-4">Wave</th>
                <th className="pb-2 pr-4">Earned</th>
                <th className="pb-2 pr-4">Cumulative</th>
                <th className="pb-2 pr-4">Total Available</th>
                <th className="pb-2">Best Move</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {checkpoints.map(({ wave, waveNum, available, cumulative, recommendation }, i) => (
                <tr key={wave.id} className="text-gray-400">
                  <td className="py-1.5 pr-4 font-bold text-gray-300">{waveNum}</td>
                  <td className="py-1.5 pr-4 stat-num">+{waveEarnings[i]}💰</td>
                  <td className="py-1.5 pr-4 stat-num text-yellow-500">{cumulative}💰</td>
                  <td className="py-1.5 pr-4 stat-num font-bold text-yellow-400">{available}💰</td>
                  <td className="py-1.5">
                    {recommendation ? (
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${recColors[recommendation]}`}>
                        {recommendation === 'build' ? 'Build' : recommendation === 'upgrade' ? 'Upgrade' : 'Either'}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function LevelEditor() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [tab, setTab] = useState(0)
  const [level, setLevel] = useState(null)
  const [waves, setWaves] = useState([])
  const [placements, setPlacements] = useState([])
  const [squad, setSquad] = useState(null)
  const [towerTypes, setTowerTypes] = useState([])
  const [enemyTypes, setEnemyTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const saveTimer = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [lvl, wvs, plc, sqd, tts, ets] = await Promise.all([
        getLevel(id),
        getWaves(id),
        getPlacements(id),
        getSquad(id),
        getTowerTypes(),
        getEnemyTypes(),
      ])
      // Parse JSON fields
      const parsedLevel = {
        ...lvl,
        path_nodes: typeof lvl.path_nodes === 'string' ? JSON.parse(lvl.path_nodes) : lvl.path_nodes,
        tower_slots: typeof lvl.tower_slots === 'string' ? JSON.parse(lvl.tower_slots) : lvl.tower_slots,
        zone_blockers: typeof lvl.zone_blockers === 'string' ? JSON.parse(lvl.zone_blockers) : lvl.zone_blockers,
      }
      setLevel(parsedLevel)
      setWaves(wvs)
      setPlacements(plc)
      setSquad(sqd)
      setTowerTypes(tts)
      setEnemyTypes(ets)
    } catch (err) {
      console.error('Failed to load level:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const autoSaveLevel = useCallback((updated) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateLevel(id, {
          ...updated,
          path_nodes: updated.path_nodes,
          tower_slots: updated.tower_slots,
          zone_blockers: updated.zone_blockers,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        console.error('Auto-save failed:', err)
      } finally {
        setSaving(false)
      }
    }, 800)
  }, [id])

  const handleLevelChange = (updated) => {
    setLevel(updated)
    autoSaveLevel(updated)
  }

  const handlePlacementsChange = useCallback(async (newPlacements) => {
    setPlacements(newPlacements)
    try {
      await savePlacements(id, newPlacements)
    } catch (err) {
      console.error('Failed to save placements:', err)
    }
  }, [id])

  const handleWaveUpdate = useCallback(async (waveId, data) => {
    try {
      const updated = await updateWave(id, waveId, {
        ...data,
        groups: data.groups,
      })
      setWaves((prev) => prev.map((w) => (w.id === waveId ? updated : w)))
    } catch (err) {
      console.error('Failed to update wave:', err)
    }
  }, [id])

  const handleWaveCreate = useCallback(async (data) => {
    try {
      const created = await createWave(id, data)
      setWaves((prev) => [...prev, created])
    } catch (err) {
      console.error('Failed to create wave:', err)
    }
  }, [id])

  const handleWaveDelete = useCallback(async (waveId) => {
    try {
      await deleteWave(id, waveId)
      setWaves((prev) => prev.filter((w) => w.id !== waveId))
    } catch (err) {
      console.error('Failed to delete wave:', err)
    }
  }, [id])

  const handleSquadSave = useCallback(async (data) => {
    const updated = await saveSquad(id, data)
    setSquad(updated)
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading level...
      </div>
    )
  }

  if (!level) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-400">Level not found</p>
        <Link to="/" className="text-orange-400 hover:text-orange-300">← Back to levels</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm">← Levels</Link>
          <div>
            <h1 className="font-bold text-gray-100 text-lg leading-tight">{level.name}</h1>
            <p className="text-xs text-gray-500">
              Transport HP: {level.transport_hp} &middot; Start: {level.starting_currency}💰
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator saving={saving} saved={saved} />
          <Link
            to={`/balance/${id}`}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            📊 Balance
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800 px-6 bg-gray-900">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === i
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 0 && (
          <PathCanvas
            levelData={level}
            placements={placements}
            towerTypes={towerTypes}
            onChange={handleLevelChange}
          />
        )}
        {tab === 1 && (
          <WaveEditor
            waves={waves}
            enemyTypes={enemyTypes}
            onWaveUpdate={handleWaveUpdate}
            onWaveCreate={handleWaveCreate}
            onWaveDelete={handleWaveDelete}
          />
        )}
        {tab === 2 && (
          <PlacementsTab
            level={level}
            placements={placements}
            towerTypes={towerTypes}
            onChange={handlePlacementsChange}
          />
        )}
        {tab === 3 && (
          <SquadTab squad={squad} onSave={handleSquadSave} />
        )}
        {tab === 4 && (
          <StrategyTab
            level={level}
            waves={waves}
            placements={placements}
            towerTypes={towerTypes}
            enemyTypes={enemyTypes}
          />
        )}
      </div>
    </div>
  )
}

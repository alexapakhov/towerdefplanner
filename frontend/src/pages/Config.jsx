import React, { useEffect, useState } from 'react'
import { getTowerTypes, updateTowerType, getEnemyTypes, updateEnemyType, reseed } from '../api.js'

const CATEGORY_STYLE = {
  Attack: 'bg-red-500/15 text-red-400 border-red-500/25',
  Debuff: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  Support: 'bg-green-500/15 text-green-400 border-green-500/25',
}
const SIZE_STYLE = {
  Small:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  Medium: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  Large:  'bg-red-500/15 text-red-400 border-red-500/25',
}
const EFFECT_ICONS = { Shell: '💣', Electro: '⚡', Ice: '❄️', Fire: '🔥', None: '—' }

function InputField({ label, value, onChange, type = 'number', step, min, mono }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-medium">{label}</label>
      <input
        type={type}
        value={value}
        step={step || 1}
        min={min}
        onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
        className={`w-full bg-[#0d1117] border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/20 transition-all ${mono ? 'font-mono text-xs' : 'stat-num'}`}
      />
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-gray-700/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function validateJsonArray(str, len = 4) {
  try {
    const arr = JSON.parse(str)
    if (!Array.isArray(arr)) return 'Must be a JSON array'
    if (arr.length !== len) return `Must have exactly ${len} values`
    if (arr.some(v => typeof v !== 'number')) return 'All values must be numbers'
    return null
  } catch { return 'Invalid JSON' }
}

function JsonArrayField({ label, value, onChange, hint }) {
  const err = validateJsonArray(value)
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-[#0d1117] border rounded-lg px-2.5 py-2 text-xs text-gray-100 focus:outline-none font-mono transition-all ${err ? 'border-red-500/60 focus:border-red-400' : 'border-gray-700 focus:border-orange-500/60'}`}
      />
      {err ? (
        <p className="text-[10px] text-red-400 mt-1">{err}</p>
      ) : (
        hint && <p className="text-[10px] text-gray-600 mt-1">{hint}</p>
      )}
    </div>
  )
}

function TowerEditModal({ tower, onClose, onSave }) {
  const [form, setForm] = useState({ ...tower })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const jsonValid = [form.upgrade_dps_mults, form.upgrade_range_mults, form.upgrade_costs]
    .every(v => validateJsonArray(v) === null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!jsonValid) return
    setSaving(true)
    try { await onSave(form); onClose() } finally { setSaving(false) }
  }

  return (
    <Modal title={`Edit — ${tower.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Base DPS" value={form.base_dps} onChange={v => set('base_dps', v)} />
          <InputField label="Base Range" value={form.base_range} onChange={v => set('base_range', v)} />
          <InputField label="Base Cost 💰" value={form.base_cost} onChange={v => set('base_cost', v)} />
          <InputField label="Slow Factor (0–1)" value={form.slow_factor} onChange={v => set('slow_factor', v)} step={0.05} />
          <InputField label="Boost Multiplier" value={form.boost_mult} onChange={v => set('boost_mult', v)} step={0.1} />
          <div>
            <label className="block text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-medium">Color</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.color} onChange={e => set('color', e.target.value)} className="w-8 h-9 rounded cursor-pointer bg-transparent border border-gray-700" />
              <input type="text" value={form.color} onChange={e => set('color', e.target.value)} className="flex-1 bg-[#0d1117] border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500/60 font-mono" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-medium">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500/60 resize-none" />
        </div>
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Upgrade Data — JSON arrays of exactly 4 numbers</p>
          <JsonArrayField label="DPS multipliers" value={form.upgrade_dps_mults} onChange={v => set('upgrade_dps_mults', v)} hint="e.g. [1.0, 1.6, 2.5, 4.0]" />
          <JsonArrayField label="Range multipliers" value={form.upgrade_range_mults} onChange={v => set('upgrade_range_mults', v)} hint="e.g. [1.0, 1.15, 1.3, 1.5]" />
          <JsonArrayField label="Upgrade costs (× base_cost)" value={form.upgrade_costs} onChange={v => set('upgrade_costs', v)} hint="e.g. [0, 0.6, 1.0, 1.5]" />
          {!jsonValid && <p className="text-xs text-red-400">Fix JSON errors above before saving.</p>}
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !jsonValid} className="px-5 py-2 rounded-xl text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50 shadow-lg shadow-orange-500/20">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EnemyEditModal({ enemy, onClose, onSave }) {
  const [form, setForm] = useState({ ...enemy })
  const [armorStr, setArmorStr] = useState(enemy.armor_multipliers || '{}')
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  let armorParsed = {}
  try { armorParsed = JSON.parse(armorStr) } catch {}

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave({ ...form, armor_multipliers: armorStr }); onClose() } finally { setSaving(false) }
  }

  return (
    <Modal title={`Edit — ${enemy.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InputField label="HP" value={form.hp} onChange={v => set('hp', v)} />
          <InputField label="Speed (u/s)" value={form.speed} onChange={v => set('speed', v)} step={0.5} />
          <InputField label="Damage / sec" value={form.damage_per_sec} onChange={v => set('damage_per_sec', v)} />
          <InputField label="Currency Drop" value={form.currency_drop} onChange={v => set('currency_drop', v)} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-medium">Color</label>
          <div className="flex gap-2 items-center">
            <input type="color" value={form.color} onChange={e => set('color', e.target.value)} className="w-8 h-9 rounded cursor-pointer bg-transparent border border-gray-700" />
            <input type="text" value={form.color} onChange={e => set('color', e.target.value)} className="flex-1 bg-[#0d1117] border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 focus:outline-none font-mono" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-medium">Armor multipliers (JSON)</label>
          <input type="text" value={armorStr} onChange={e => setArmorStr(e.target.value)} className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-orange-500/60" />
          <div className="grid grid-cols-4 gap-1.5 mt-2">
            {['shell','electro','ice','fire'].map(k => {
              const v = armorParsed[k] ?? 1.0
              return (
                <div key={k} className={`rounded-lg p-2 text-center border ${v > 1 ? 'bg-red-500/10 border-red-500/30' : v < 1 ? 'bg-green-500/10 border-green-500/30' : 'bg-gray-800 border-gray-700'}`}>
                  <p className="text-xs text-gray-500 capitalize">{k}</p>
                  <p className={`text-sm font-bold ${v > 1 ? 'text-red-400' : v < 1 ? 'text-green-400' : 'text-gray-400'}`}>{v}×</p>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ArmorMatrix({ towerTypes, enemyTypes }) {
  const attackTowers = towerTypes.filter(tt => tt.category === 'Attack' && tt.base_dps > 0)

  // For each enemy, parse armor_multipliers
  const enemyArmor = enemyTypes.map(et => {
    let armor = {}
    try { armor = JSON.parse(et.armor_multipliers) } catch {}
    return { et, armor }
  })

  // Compute all effective DPS values for color scaling
  const allVals = []
  for (const tt of attackTowers) {
    for (const { armor } of enemyArmor) {
      const mult = armor[tt.effect_type?.toLowerCase()] ?? 1.0
      allVals.push(tt.base_dps * mult)
    }
  }
  const minVal = Math.min(...allVals)
  const maxVal = Math.max(...allVals)

  function heatColor(val) {
    if (maxVal === minVal) return 'bg-gray-700 text-gray-300'
    const t = (val - minVal) / (maxVal - minVal) // 0 = low, 1 = high
    if (t >= 0.75) return 'bg-green-500/25 text-green-300 border-green-500/30'
    if (t >= 0.5)  return 'bg-lime-500/20 text-lime-300 border-lime-500/25'
    if (t >= 0.25) return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20'
    return 'bg-red-500/15 text-red-400 border-red-500/20'
  }

  if (!attackTowers.length || !enemyTypes.length) {
    return <p className="text-gray-600 text-sm">No data to display.</p>
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Effective DPS = base_dps × armor multiplier. Green = high damage, red = resistant.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="text-left p-3 text-gray-500 font-medium border-b border-gray-800">Enemy \ Tower</th>
              {attackTowers.map(tt => (
                <th key={tt.id} className="p-3 text-center border-b border-gray-800 min-w-[90px]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
                      style={{ backgroundColor: tt.color + '25', border: `1px solid ${tt.color}50` }}>
                      {EFFECT_ICONS[tt.effect_type] || '🏰'}
                    </div>
                    <span className="text-gray-300 font-medium">{tt.name}</span>
                    <span className="text-gray-600 text-[9px] uppercase tracking-wider">{tt.effect_type}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enemyArmor.map(({ et, armor }) => (
              <tr key={et.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-3 border-b border-gray-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-base"
                      style={{ backgroundColor: et.color + '20', border: `1px solid ${et.color}40` }}>
                      {et.size === 'Small' ? '🏃' : et.size === 'Large' ? '👹' : '🧟'}
                    </div>
                    <div>
                      <p className="text-gray-200 font-medium">{et.name}</p>
                      <p className="text-gray-600 text-[9px] uppercase">{et.size} · {et.hp} HP</p>
                    </div>
                  </div>
                </td>
                {attackTowers.map(tt => {
                  const key = tt.effect_type?.toLowerCase()
                  const mult = armor[key] ?? 1.0
                  const eff = tt.base_dps * mult
                  return (
                    <td key={tt.id} className="p-2 border-b border-gray-800/40 text-center">
                      <div className={`rounded-xl p-2 border ${heatColor(eff)}`}>
                        <p className="text-sm font-bold stat-num">{eff.toFixed(1)}</p>
                        <p className="text-[9px] opacity-60 mt-0.5">{mult}× armor</p>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-800/60">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Effectiveness:</span>
        {[
          { cls: 'bg-green-500/25 text-green-300 border-green-500/30 border', label: 'High' },
          { cls: 'bg-lime-500/20 text-lime-300 border-lime-500/25 border', label: 'Good' },
          { cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20 border', label: 'Moderate' },
          { cls: 'bg-red-500/15 text-red-400 border-red-500/20 border', label: 'Resistant' },
        ].map(({ cls, label }) => (
          <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${cls}`}>
            <div className="w-2 h-2 rounded-full bg-current opacity-70" />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

function TowerCard({ tt, onEdit }) {
  const dpsM = (() => { try { return JSON.parse(tt.upgrade_dps_mults) } catch { return [1,1.6,2.5,4] } })()
  const costsM = (() => { try { return JSON.parse(tt.upgrade_costs) } catch { return [0,0.6,1,1.5] } })()
  const upgradeColors = ['text-gray-400', 'text-yellow-400', 'text-orange-400', 'text-red-400']

  return (
    <div className="bg-[#161b22] border border-gray-800/80 rounded-2xl overflow-hidden hover:border-gray-700 transition-all group">
      {/* Color accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${tt.color}80, transparent)` }} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-lg"
              style={{ backgroundColor: tt.color + '25', border: `1px solid ${tt.color}50` }}>
              {EFFECT_ICONS[tt.effect_type] || '🏰'}
            </div>
            <div>
              <h3 className="font-bold text-gray-100 text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{tt.name}</h3>
              <div className="flex gap-1.5 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${CATEGORY_STYLE[tt.category] || ''}`}>{tt.category}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-800/60 text-gray-500 border-gray-700">{tt.effect_type}</span>
              </div>
            </div>
          </div>
          <button onClick={() => onEdit(tt)} className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-100 hover:bg-gray-700 rounded-lg transition-colors">
            Edit
          </button>
        </div>

        <p className="text-xs text-gray-600 mb-4 line-clamp-2 leading-relaxed">{tt.description}</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'DPS', value: tt.base_dps, color: 'text-orange-400' },
            { label: 'Range', value: tt.base_range, color: 'text-blue-400' },
            { label: 'Cost', value: `${tt.base_cost}💰`, color: 'text-yellow-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#0d1117] rounded-xl p-2 text-center border border-gray-800/50">
              <p className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</p>
              <p className={`text-sm font-bold stat-num mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {(tt.slow_factor > 0 || tt.boost_mult > 1) && (
          <div className="flex gap-2 mb-3">
            {tt.slow_factor > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">Slow {Math.round(tt.slow_factor * 100)}%</span>}
            {tt.boost_mult > 1 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Boost ×{tt.boost_mult}</span>}
          </div>
        )}

        <div className="border-t border-gray-800/60 pt-3">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">Upgrades</p>
          <div className="space-y-1">
            {dpsM.map((m, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className={`text-xs w-10 ${upgradeColors[i]}`}>Lv {i}</span>
                <div className="flex-1 mx-2 bg-gray-800 rounded-full h-1">
                  <div className="h-full rounded-full" style={{ width: `${(m / 4) * 100}%`, backgroundColor: tt.color + 'aa' }} />
                </div>
                <span className="text-xs text-orange-400 w-16 text-right stat-num">{(tt.base_dps * m).toFixed(1)}</span>
                <span className="text-xs text-gray-600 w-12 text-right">{i === 0 ? 'free' : `${Math.round(tt.base_cost * costsM[i])}💰`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function EnemyCard({ et, onEdit }) {
  let armor = {}
  try { armor = JSON.parse(et.armor_multipliers) } catch {}

  return (
    <div className="bg-[#161b22] border border-gray-800/80 rounded-2xl overflow-hidden hover:border-gray-700 transition-all">
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${et.color}80, transparent)` }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-lg"
              style={{ backgroundColor: et.color + '20', border: `1px solid ${et.color}40` }}>
              {et.size === 'Small' ? '🏃' : et.size === 'Large' ? '👹' : '🧟'}
            </div>
            <div>
              <h3 className="font-bold text-gray-100 text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{et.name}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium mt-1 inline-block ${SIZE_STYLE[et.size] || ''}`}>{et.size}</span>
            </div>
          </div>
          <button onClick={() => onEdit(et)} className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-100 hover:bg-gray-700 rounded-lg transition-colors">
            Edit
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: 'HP', value: et.hp, color: 'text-red-400' },
            { label: 'Speed', value: `${et.speed} u/s`, color: 'text-yellow-400' },
            { label: 'Dmg/s', value: et.damage_per_sec, color: 'text-orange-400' },
            { label: 'Drop', value: `${et.currency_drop}💰`, color: 'text-green-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#0d1117] rounded-xl p-2.5 border border-gray-800/50">
              <p className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</p>
              <p className={`text-sm font-bold stat-num mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800/60 pt-3">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">Armor Multipliers</p>
          <div className="grid grid-cols-4 gap-1.5">
            {['shell','electro','ice','fire'].map(k => {
              const v = armor[k] ?? 1.0
              const icons = { shell:'💣', electro:'⚡', ice:'❄️', fire:'🔥' }
              return (
                <div key={k} className={`rounded-lg p-1.5 text-center border ${v > 1 ? 'bg-red-500/10 border-red-500/25' : v < 1 ? 'bg-green-500/10 border-green-500/25' : 'bg-gray-800/50 border-gray-800'}`}>
                  <div className="text-xs">{icons[k]}</div>
                  <div className={`text-xs font-bold ${v > 1 ? 'text-red-400' : v < 1 ? 'text-green-400' : 'text-gray-500'}`}>{v}×</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Config() {
  const [towerTypes, setTowerTypes] = useState([])
  const [enemyTypes, setEnemyTypes] = useState([])
  const [editingTower, setEditingTower] = useState(null)
  const [editingEnemy, setEditingEnemy] = useState(null)
  const [section, setSection] = useState('towers')
  const [reseeding, setReseeding] = useState(false)

  const fetchAll = async () => {
    const [tts, ets] = await Promise.all([getTowerTypes(), getEnemyTypes()])
    setTowerTypes(tts); setEnemyTypes(ets)
  }

  useEffect(() => { fetchAll() }, [])

  const handleReseed = async () => {
    if (!confirm('Reset all tower and enemy types to defaults?')) return
    setReseeding(true)
    try { await reseed(); await fetchAll() } finally { setReseeding(false) }
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Config</h1>
          <p className="text-gray-500 text-sm mt-1">Tower and enemy type definitions</p>
        </div>
        <button onClick={handleReseed} disabled={reseeding} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-xl text-gray-400 transition-colors border border-gray-700 disabled:opacity-50">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-4.65L20 4M20 15a9 9 0 01-14.65 4.65L4 20" /></svg>
          {reseeding ? 'Resetting...' : 'Reset Defaults'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#161b22] rounded-xl p-1 mb-6 w-fit border border-gray-800/80">
        {[
          { key: 'towers', label: `Towers`, count: towerTypes.length, icon: '🏰' },
          { key: 'enemies', label: `Enemies`, count: enemyTypes.length, icon: '👾' },
          { key: 'matrix', label: `Armor Matrix`, count: null, icon: '🔥' },
        ].map(({ key, label, count, icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              section === key
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span>{icon}</span>
            {label}
            {count !== null && <span className={`text-xs px-1.5 py-0.5 rounded-full ${section === key ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700 text-gray-500'}`}>{count}</span>}
          </button>
        ))}
      </div>

      {section === 'towers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {towerTypes.map(tt => <TowerCard key={tt.id} tt={tt} onEdit={setEditingTower} />)}
        </div>
      )}
      {section === 'enemies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {enemyTypes.map(et => <EnemyCard key={et.id} et={et} onEdit={setEditingEnemy} />)}
        </div>
      )}
      {section === 'matrix' && (
        <div className="bg-[#161b22] border border-gray-800/80 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center text-base">🔥</div>
            <div>
              <h2 className="text-sm font-bold text-gray-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Armor Matrix</h2>
              <p className="text-xs text-gray-500">Tower effectiveness per enemy type</p>
            </div>
          </div>
          <ArmorMatrix towerTypes={towerTypes} enemyTypes={enemyTypes} />
        </div>
      )}

      {editingTower && <TowerEditModal tower={editingTower} onClose={() => setEditingTower(null)} onSave={async d => { await updateTowerType(d.id, d); setEditingTower(null); fetchAll() }} />}
      {editingEnemy && <EnemyEditModal enemy={editingEnemy} onClose={() => setEditingEnemy(null)} onSave={async d => { await updateEnemyType(d.id, d); setEditingEnemy(null); fetchAll() }} />}
    </div>
  )
}

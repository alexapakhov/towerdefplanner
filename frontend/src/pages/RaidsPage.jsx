import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { getTowerTypes, getEnemyTypes, createLevel, createWave } from '../api.js'

// ─── default formula variables ───────────────────────────────────────────────
const DEFAULT_VARS = {
  hp_base_scout: 60,
  hp_base_grunt: 150,
  hp_base_brute: 400,
  hp_raid_scale: 1.07,
  hp_wave_scale: 1.08,

  drop_scout: 5,
  drop_grunt: 10,
  drop_brute: 25,
  drop_raid_scale: 1.04,
  starting_currency: 200,
  currency_raid_scale: 1.03,

  waves_min: 8,
  waves_max: 15,
  enemies_wave1_min: 10,
  enemies_wave1_max: 20,
  wave_enemy_scale: 1.12,

  spawn_interval_base: 3.0,
  spawn_interval_min: 1.2,
  time_per_kill: 2.5,

  transport_hp_base: 1000,
  transport_hp_scale: 1.10,

  tower_slots_start: 3,
  tower_slots_end: 8,
  avg_base_tower_dps: 45,
  boost_factor: 1.2,
  upgrade_factor: 1.8,
}

// ─── meta for slider rendering ────────────────────────────────────────────────
const VAR_META = {
  hp_base_scout:       { label: 'Base Scout HP',         min: 20,  max: 200,   step: 1,    group: 'HP Scaling' },
  hp_base_grunt:       { label: 'Base Grunt HP',         min: 50,  max: 500,   step: 5,    group: 'HP Scaling' },
  hp_base_brute:       { label: 'Base Brute HP',         min: 100, max: 1000,  step: 10,   group: 'HP Scaling' },
  hp_raid_scale:       { label: 'HP/Raid Multiplier',    min: 1.0, max: 1.2,   step: 0.01, group: 'HP Scaling' },
  hp_wave_scale:       { label: 'HP/Wave Multiplier',    min: 1.0, max: 1.2,   step: 0.01, group: 'HP Scaling' },

  drop_scout:          { label: 'Scout Drop',            min: 1,   max: 20,    step: 1,    group: 'Economy' },
  drop_grunt:          { label: 'Grunt Drop',            min: 2,   max: 50,    step: 1,    group: 'Economy' },
  drop_brute:          { label: 'Brute Drop',            min: 5,   max: 100,   step: 5,    group: 'Economy' },
  drop_raid_scale:     { label: 'Drop/Raid Multiplier',  min: 1.0, max: 1.15,  step: 0.01, group: 'Economy' },
  starting_currency:   { label: 'Starting Currency',     min: 50,  max: 500,   step: 10,   group: 'Economy' },
  currency_raid_scale: { label: 'Currency/Raid Growth',  min: 1.0, max: 1.1,   step: 0.01, group: 'Economy' },

  waves_min:           { label: 'Waves Min',             min: 3,   max: 10,    step: 1,    group: 'Waves' },
  waves_max:           { label: 'Waves Max',             min: 8,   max: 20,    step: 1,    group: 'Waves' },
  enemies_wave1_min:   { label: 'Wave1 Enemies (R1)',    min: 3,   max: 20,    step: 1,    group: 'Waves' },
  enemies_wave1_max:   { label: 'Wave1 Enemies (R45)',   min: 10,  max: 40,    step: 1,    group: 'Waves' },
  wave_enemy_scale:    { label: 'Enemy/Wave Scale',      min: 1.0, max: 1.3,   step: 0.01, group: 'Waves' },

  spawn_interval_base: { label: 'Spawn Interval Base(s)', min: 1.0, max: 6.0,  step: 0.1,  group: 'Spawn' },
  spawn_interval_min:  { label: 'Spawn Interval Min(s)', min: 0.5, max: 3.0,   step: 0.1,  group: 'Spawn' },
  time_per_kill:       { label: 'Avg Time/Kill (s)',     min: 0.5, max: 6.0,   step: 0.1,  group: 'Spawn' },

  transport_hp_base:   { label: 'Transport HP (R1)',     min: 200, max: 3000,  step: 50,   group: 'Transport' },
  transport_hp_scale:  { label: 'Transport HP/Raid',     min: 1.0, max: 1.3,   step: 0.01, group: 'Transport' },

  tower_slots_start:   { label: 'Tower Slots Start',     min: 1,   max: 6,     step: 1,    group: 'Tower' },
  tower_slots_end:     { label: 'Tower Slots End',       min: 4,   max: 12,    step: 1,    group: 'Tower' },
  avg_base_tower_dps:  { label: 'Avg Tower DPS',         min: 20,  max: 100,   step: 5,    group: 'Tower' },
  boost_factor:        { label: 'Boost Factor',          min: 1.0, max: 2.0,   step: 0.05, group: 'Tower' },
  upgrade_factor:      { label: 'Upgrade Factor',        min: 1.0, max: 3.0,   step: 0.1,  group: 'Tower' },
}

// ─── core computation ─────────────────────────────────────────────────────────
function computeRaid(r, vars) {
  const world = Math.ceil(r / 9)
  const act = r <= 15 ? 1 : r <= 30 ? 2 : 3

  const wave_count = Math.min(vars.waves_max, Math.round(
    vars.waves_min + (vars.waves_max - vars.waves_min) * Math.min(1, (r - 1) / 20)
  ))

  const tower_slots = Math.min(vars.tower_slots_end, Math.round(
    vars.tower_slots_start + (vars.tower_slots_end - vars.tower_slots_start) * (r - 1) / 44
  ))

  const scout_pct = Math.max(0.10, 0.60 - (r - 1) * 0.011)
  const brute_pct = Math.min(0.50, (r - 1) * 0.011)
  const grunt_pct = Math.max(0.10, 1 - scout_pct - brute_pct)

  const hp_mult = Math.pow(vars.hp_raid_scale, r - 1)
  const scout_hp = vars.hp_base_scout * hp_mult
  const grunt_hp = vars.hp_base_grunt * hp_mult
  const brute_hp = vars.hp_base_brute * hp_mult
  const avg_hp = scout_pct * scout_hp + grunt_pct * grunt_hp + brute_pct * brute_hp

  const wave1_count = Math.round(
    vars.enemies_wave1_min + (vars.enemies_wave1_max - vars.enemies_wave1_min) * (r - 1) / 44
  )
  const last_wave_count = Math.round(wave1_count * Math.pow(vars.wave_enemy_scale, wave_count - 1))

  const wave1_hp = wave1_count * avg_hp
  const last_wave_hp = last_wave_count * avg_hp * Math.pow(vars.hp_wave_scale, wave_count - 1)

  const spawn_interval = Math.max(vars.spawn_interval_min,
    vars.spawn_interval_base - (vars.spawn_interval_base - vars.spawn_interval_min) * (r - 1) / 44
  )

  const wave_spawn_time = last_wave_count * spawn_interval
  const wave_clear_time = last_wave_count * vars.time_per_kill
  const wave_time = Math.max(wave_spawn_time, wave_clear_time)

  const avail_dps = tower_slots * vars.avg_base_tower_dps * vars.upgrade_factor * vars.boost_factor + 170

  const required_dps = last_wave_hp / wave_time

  const dps_ratio = avail_dps / required_dps
  const balance = dps_ratio >= 1.3 ? 'winnable' : dps_ratio >= 0.9 ? 'tight' : 'brutal'

  const drop_mult = Math.pow(vars.drop_raid_scale, r - 1)
  const avg_drop = (scout_pct * vars.drop_scout + grunt_pct * vars.drop_grunt + brute_pct * vars.drop_brute) * drop_mult
  const total_enemies = Array.from({ length: wave_count }, (_, w) =>
    Math.round(wave1_count * Math.pow(vars.wave_enemy_scale, w))
  ).reduce((a, b) => a + b, 0)
  const kill_rate = Math.min(1, dps_ratio * 0.85)
  const currency_earned = Math.round(total_enemies * kill_rate * avg_drop)
  const starting_curr = Math.round(vars.starting_currency * Math.pow(vars.currency_raid_scale, r - 1))

  const transport_hp = Math.round(vars.transport_hp_base * Math.pow(vars.transport_hp_scale, r - 1))

  const avg_wave_time = wave_time * 0.7
  const prep_time = wave_count * 8
  const session_time = ((avg_wave_time * wave_count + prep_time) / 60).toFixed(1)

  const zone_blockers = r <= 9 ? 1 : r <= 27 ? 2 : 3

  const waves = Array.from({ length: wave_count }, (_, w) => {
    const wnum = w + 1
    const w_count = Math.round(wave1_count * Math.pow(vars.wave_enemy_scale, w))
    const w_hp_mult = Math.pow(vars.hp_wave_scale, w)
    const w_hp = w_count * avg_hp * w_hp_mult
    const w_drop = w_count * kill_rate * avg_drop
    const w_req_dps = w_hp / Math.max(wave_spawn_time * (w_count / last_wave_count), 10)
    return {
      wave: wnum,
      count: w_count,
      total_hp: Math.round(w_hp),
      currency: Math.round(w_drop),
      req_dps: Math.round(w_req_dps),
    }
  })

  return {
    raid: r, world, act, wave_count, tower_slots, zone_blockers,
    scout_pct, grunt_pct, brute_pct,
    scout_hp: Math.round(scout_hp), grunt_hp: Math.round(grunt_hp), brute_hp: Math.round(brute_hp),
    avg_hp: Math.round(avg_hp),
    wave1_hp: Math.round(wave1_hp), last_wave_hp: Math.round(last_wave_hp),
    avail_dps: Math.round(avail_dps), required_dps: Math.round(required_dps),
    dps_ratio: parseFloat(dps_ratio.toFixed(2)), balance,
    currency_earned, starting_curr, transport_hp,
    session_time, spawn_interval: parseFloat(spawn_interval.toFixed(1)),
    waves,
  }
}

// ─── world color themes ───────────────────────────────────────────────────────
const WORLD_THEME = {
  1: { label: 'World 1',  rowBg: 'bg-cyan-900/10',   badge: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',   dot: 'bg-cyan-400' },
  2: { label: 'World 2',  rowBg: 'bg-green-900/10',  badge: 'bg-green-900/40 text-green-300 border-green-700/50', dot: 'bg-green-400' },
  3: { label: 'World 3',  rowBg: 'bg-yellow-900/10', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50', dot: 'bg-yellow-400' },
  4: { label: 'World 4',  rowBg: 'bg-orange-900/10', badge: 'bg-orange-900/40 text-orange-300 border-orange-700/50', dot: 'bg-orange-400' },
  5: { label: 'World 5',  rowBg: 'bg-red-900/10',    badge: 'bg-red-900/40 text-red-300 border-red-700/50',       dot: 'bg-red-400' },
}

// ─── tower introduction schedule ──────────────────────────────────────────────
const TOWER_SCHEDULE = [
  { raid: 1,  name: 'Ballistic',    icon: '🔫', dps: '40 Shell DPS',  desc: 'Core damage dealer. Reliable single-target output from day one.',      synergy: 'Pairs with Freezer slow for higher effective DPS', upgrade: 'Prioritize first — highest slot efficiency early' },
  { raid: 1,  name: 'Freezer',      icon: '❄️', dps: '15 Ice + 50% slow', desc: 'Crowd control foundation. Extends enemy time-in-range for all towers.', synergy: 'Amplifies every other tower in the path',          upgrade: 'Upgrade early for slow %, raw DPS is low' },
  { raid: 4,  name: 'Energy',       icon: '⚡', dps: '70 Electro DPS', desc: 'Premium single-target at Raid 4 when HP starts scaling noticeably.',   synergy: 'Best against Grunts arriving mid-game',             upgrade: 'Second priority after Ballistic' },
  { raid: 8,  name: 'Flamethrower', icon: '🔥', dps: '65 Fire DPS',    desc: 'DoT damage ideal for Scout hordes. Scales into World 2 composition.', synergy: 'DoT stacks with Tesla chain',                       upgrade: 'Upgrade when Scouts still 30%+ of wave' },
  { raid: 12, name: 'FrostAround',  icon: '🌨️', dps: '10 Ice AoE slow', desc: 'Area slow — critical once mixed waves arrive at World 2 transition.', synergy: 'Stacks with Freezer for near-total path coverage',  upgrade: 'Level 2 unlocks full AoE radius' },
  { raid: 15, name: 'BoostData',    icon: '📡', dps: '×1.4 Boost',    desc: 'Support multiplier introduced at Act 1/2 boundary for the DPS step-up.', synergy: 'Place adjacent to Energy or Flamethrower max DPS', upgrade: 'Never needs DPS upgrade — invest elsewhere' },
  { raid: 20, name: 'Mortar',       icon: '💣', dps: '35 Shell AoE',   desc: 'AoE shell for the Brute groups entering World 3. Punishes clusters.', synergy: 'Combines with FrostAround slow for grouped damage', upgrade: 'Upgrade blast radius first (Lv2)' },
  { raid: 27, name: 'Tesla',        icon: '🌩️', dps: '45 Electro chain', desc: 'Chain lightning for the dense, mixed waves of World 4 onward.',    synergy: 'Ideal against clustered Grunts + Scouts in groups',  upgrade: 'Chain count at Lv3 covers full wave' },
]

// ─── small reusable components ────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-gray-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl ${className}`}>
      {children}
    </div>
  )
}

function BalanceBadge({ status }) {
  if (status === 'winnable') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900/50 text-green-400 border border-green-700/40">✅ Winnable</span>
  if (status === 'tight')    return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/50 text-yellow-400 border border-yellow-700/40">⚠️ Tight</span>
  return                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400 border border-red-700/40">❌ Brutal</span>
}

function EnemyMixBar({ scout, grunt, brute }) {
  return (
    <div className="flex h-3 rounded overflow-hidden w-24 bg-gray-700 gap-px">
      <div className="bg-cyan-500" style={{ width: `${(scout * 100).toFixed(0)}%` }} title={`Scout ${(scout * 100).toFixed(0)}%`} />
      <div className="bg-green-500" style={{ width: `${(grunt * 100).toFixed(0)}%` }} title={`Grunt ${(grunt * 100).toFixed(0)}%`} />
      <div className="bg-red-500"  style={{ width: `${(brute * 100).toFixed(0)}%` }} title={`Brute ${(brute * 100).toFixed(0)}%`} />
    </div>
  )
}

// ─── accordions ───────────────────────────────────────────────────────────────
function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/40 transition-colors"
      >
        <span className="font-semibold text-gray-200">{title}</span>
        <span className="text-gray-500 text-lg select-none">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-800 pt-4 text-sm text-gray-400 space-y-3">
          {children}
        </div>
      )}
    </Card>
  )
}

// ─── formula variables panel ──────────────────────────────────────────────────
const VAR_GROUPS = ['HP Scaling', 'Economy', 'Waves', 'Spawn', 'Transport', 'Tower']

function VarInput({ k, value, onChange }) {
  const meta = VAR_META[k]
  if (!meta) return null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <label className="text-xs text-gray-400">{meta.label}</label>
        <input
          type="number"
          value={value}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          onChange={e => onChange(k, parseFloat(e.target.value) || 0)}
          className="w-20 text-right bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-orange-300 focus:outline-none focus:border-orange-500"
        />
      </div>
      <input
        type="range"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={value}
        onChange={e => onChange(k, parseFloat(e.target.value))}
        className="w-full h-1 accent-orange-500 cursor-pointer"
      />
    </div>
  )
}

function FormulaPanel({ vars, onChange, open, setOpen }) {
  const grouped = useMemo(() => {
    const g = {}
    VAR_GROUPS.forEach(grp => { g[grp] = [] })
    Object.keys(VAR_META).forEach(k => {
      const grp = VAR_META[k].group
      if (g[grp]) g[grp].push(k)
    })
    return g
  }, [])

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-orange-400 text-lg">⚙️</span>
          <span className="font-bold text-gray-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Formula Variables
          </span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {Object.keys(vars).length} variables — live recalculation
          </span>
        </div>
        <span className="text-gray-500 text-lg select-none">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {VAR_GROUPS.map(grp => (
              <div key={grp}>
                <p className="text-[10px] text-orange-500/80 uppercase tracking-widest font-bold mb-3">{grp}</p>
                <div className="space-y-3">
                  {grouped[grp].map(k => (
                    <VarInput key={k} k={k} value={vars[k]} onChange={onChange} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => onChange('__reset__', null)}
            className="mt-5 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 rounded-lg border border-gray-700 transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </Card>
  )
}

// ─── core formula display ─────────────────────────────────────────────────────
function FormulaDisplay({ vars }) {
  const avail_r1 = Math.round(vars.tower_slots_start * vars.avg_base_tower_dps * vars.upgrade_factor * vars.boost_factor + 170)
  const avail_r45 = Math.round(vars.tower_slots_end * vars.avg_base_tower_dps * vars.upgrade_factor * vars.boost_factor + 170)

  return (
    <Card className="p-5">
      <h3 className="font-bold text-gray-200 mb-4 flex items-center gap-2">
        <span className="text-orange-400">∑</span> Core Formulas
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        {[
          ['Enemy HP', `HP(raid,wave) = BASE_HP × ${vars.hp_raid_scale}^(raid−1) × ${vars.hp_wave_scale}^(wave−1)`],
          ['Wave Total HP', `WaveHP = enemy_count × avg_hp_mix(raid)`],
          ['Required DPS', `Required DPS = WaveHP ÷ wave_time`],
          ['Available DPS (R1)', `${vars.tower_slots_start} slots × ${vars.avg_base_tower_dps} dps × ${vars.upgrade_factor} upg × ${vars.boost_factor} boost + 170 squad = ${avail_r1}`],
          ['Available DPS (R45)', `${vars.tower_slots_end} slots × ${vars.avg_base_tower_dps} dps × ${vars.upgrade_factor} upg × ${vars.boost_factor} boost + 170 squad = ${avail_r45}`],
          ['Currency/Wave', `C_wave = killed × avg_drop(raid)`],
          ['Kill Rate Est.', `kill_rate = min(1, dps_ratio × 0.85)`],
          ['Scout Mix', `scout% = max(10%, 60% − raid×1.1%)`],
          ['Brute Mix', `brute% = min(50%, (raid−1)×1.1%)`],
          ['Spawn Interval', `spawn_s = max(${vars.spawn_interval_min}, ${vars.spawn_interval_base} − (${vars.spawn_interval_base}−${vars.spawn_interval_min})×(raid−1)/44)`],
        ].map(([label, formula]) => (
          <div key={label} className="bg-gray-800/60 rounded-lg px-3 py-2">
            <p className="text-[10px] text-orange-400/80 mb-1">{label}</p>
            <p className="text-gray-300 break-all">{formula}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── charts ───────────────────────────────────────────────────────────────────
const CHART_TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' },
  labelStyle: { color: '#e6edf3', fontWeight: 700 },
}

function HpProgressionChart({ raids }) {
  const data = raids.map(r => ({ raid: r.raid, Scout: r.scout_hp, Grunt: r.grunt_hp, Brute: r.brute_hp }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
        <XAxis dataKey="raid" tick={{ fill: '#6e7681', fontSize: 10 }} />
        <YAxis tick={{ fill: '#6e7681', fontSize: 10 }} />
        <Tooltip {...CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
        <Line type="monotone" dataKey="Scout" stroke="#22d3ee" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Grunt" stroke="#4ade80" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Brute" stroke="#f87171" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function DpsGapChart({ raids }) {
  const data = raids.map(r => ({ raid: r.raid, Available: r.avail_dps, Required: r.required_dps }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
        <XAxis dataKey="raid" tick={{ fill: '#6e7681', fontSize: 10 }} />
        <YAxis tick={{ fill: '#6e7681', fontSize: 10 }} />
        <Tooltip {...CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
        <ReferenceLine y={0} stroke="#30363d" />
        <Line type="monotone" dataKey="Available" stroke="#f97316" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Required"  stroke="#ef4444" dot={false} strokeWidth={2} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  )
}

function CurrencyChart({ raids }) {
  const data = raids.map(r => ({ raid: r.raid, Earned: r.currency_earned, Starting: r.starting_curr }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
        <XAxis dataKey="raid" tick={{ fill: '#6e7681', fontSize: 10 }} />
        <YAxis tick={{ fill: '#6e7681', fontSize: 10 }} />
        <Tooltip {...CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
        <Bar dataKey="Earned"   fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={12} />
        <Bar dataKey="Starting" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={12} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── tower timeline ───────────────────────────────────────────────────────────
function TowerTimeline() {
  return (
    <Card className="p-5">
      <SectionHeader
        title="Tower Introduction Schedule"
        subtitle="When each tower type should be unlocked across the 45-raid campaign"
      />
      <div className="relative">
        {/* timeline rail */}
        <div className="absolute left-[72px] top-0 bottom-0 w-px bg-gray-700/60" />
        <div className="space-y-4">
          {TOWER_SCHEDULE.map(t => (
            <div key={t.name} className="flex items-start gap-4 ml-0">
              <div className="w-[68px] flex-shrink-0 text-right">
                <span className="text-[10px] text-orange-400/80 font-bold">RAID {t.raid}</span>
              </div>
              <div className="relative flex-shrink-0 mt-0.5">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-orange-500/30 z-10 relative" />
              </div>
              <div className="bg-gray-800/60 rounded-lg px-4 py-3 flex-1 border border-gray-700/40">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{t.icon}</span>
                  <span className="font-bold text-gray-100 text-sm">{t.name}</span>
                  <span className="text-xs text-orange-300/80 font-mono ml-1">{t.dps}</span>
                </div>
                <p className="text-xs text-gray-400 mb-1.5">{t.desc}</p>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <span className="text-cyan-400/80"><span className="text-gray-600">Synergy: </span>{t.synergy}</span>
                </div>
                <div className="text-[11px] text-yellow-400/80 mt-1">
                  <span className="text-gray-600">Upgrade: </span>{t.upgrade}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ─── wave breakdown (expandable) ─────────────────────────────────────────────
function WaveBreakdown({ raidData }) {
  return (
    <tr>
      <td colSpan={14} className="px-0 py-0">
        <div className="bg-gray-900/80 border-t border-b border-gray-700/60 px-6 py-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-xs font-bold text-orange-400">Raid {raidData.raid} — Wave Detail</span>
            <span className="text-xs text-gray-500">{raidData.wave_count} waves · spawn interval {raidData.spawn_interval}s · {raidData.zone_blockers} zone blocker{raidData.zone_blockers > 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-[10px] text-gray-600 uppercase tracking-wide">
                  <th className="text-left pb-2 pr-4">Wave</th>
                  <th className="text-right pb-2 pr-4">Enemies</th>
                  <th className="text-right pb-2 pr-4">Total HP</th>
                  <th className="text-right pb-2 pr-4">Req DPS</th>
                  <th className="text-right pb-2 pr-4">Currency</th>
                  <th className="text-left pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {raidData.waves.map(w => {
                  const hard = w.req_dps > raidData.avail_dps
                  return (
                    <tr key={w.wave} className="border-t border-gray-800/60">
                      <td className="py-1.5 pr-4 font-bold text-blue-400">W{w.wave}</td>
                      <td className="py-1.5 pr-4 text-right text-gray-300">{w.count}</td>
                      <td className="py-1.5 pr-4 text-right text-gray-300">{w.total_hp.toLocaleString()}</td>
                      <td className={`py-1.5 pr-4 text-right font-mono ${hard ? 'text-red-400' : 'text-green-400'}`}>{w.req_dps.toLocaleString()}</td>
                      <td className="py-1.5 pr-4 text-right text-yellow-400">{w.currency.toLocaleString()}</td>
                      <td className="py-1.5">
                        {hard
                          ? <span className="text-xs text-red-400">⚠ over avail</span>
                          : <span className="text-xs text-green-400">✓ ok</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── raids table ─────────────────────────────────────────────────────────────
function RaidsTable({ raids, onGenerate, generating }) {
  const [expanded, setExpanded] = useState(null)

  const toggle = useCallback((r) => {
    setExpanded(prev => prev === r ? null : r)
  }, [])

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-200" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            All 45 Raids — Progression Table
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Click any row to expand wave breakdown</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-900/80 border border-green-700/50 inline-block" /> Winnable</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-yellow-900/80 border border-yellow-700/50 inline-block" /> Tight</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-900/80 border border-red-700/50 inline-block" /> Brutal</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
            <tr>
              {['#', 'World', 'Act', 'Waves', 'Slots', 'Enemy Mix', 'Avg HP', 'W1 HP', 'Last W HP', 'Avail DPS', 'Req DPS', 'Balance', 'Session', 'Currency', 'Transport HP', ''].map(h => (
                <th key={h} className="px-3 py-3 text-left text-[10px] text-gray-600 font-semibold uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {raids.map(r => {
              const theme = WORLD_THEME[r.world]
              const isExpanded = expanded === r.raid
              const balanceBg = r.balance === 'winnable'
                ? 'bg-green-900/5 hover:bg-green-900/15'
                : r.balance === 'tight'
                  ? 'bg-yellow-900/5 hover:bg-yellow-900/15'
                  : 'bg-red-900/8 hover:bg-red-900/18'

              return (
                <React.Fragment key={r.raid}>
                  <tr
                    onClick={() => toggle(r.raid)}
                    className={`border-b border-gray-800/40 transition-colors cursor-pointer select-none ${balanceBg} ${theme.rowBg}`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-gray-300">{r.raid}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${theme.badge}`}>W{r.world}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">A{r.act}</td>
                    <td className="px-3 py-2.5 text-gray-300 font-mono">{r.wave_count}</td>
                    <td className="px-3 py-2.5 text-gray-300 font-mono">{r.tower_slots}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <EnemyMixBar scout={r.scout_pct} grunt={r.grunt_pct} brute={r.brute_pct} />
                        <span className="text-[9px] text-gray-600">
                          {(r.scout_pct * 100).toFixed(0)}S {(r.grunt_pct * 100).toFixed(0)}G {(r.brute_pct * 100).toFixed(0)}B
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-300">{r.avg_hp.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-400">{r.wave1_hp.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-300">{r.last_wave_hp.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-mono text-orange-400">{r.avail_dps.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 font-mono font-bold ${r.balance === 'brutal' ? 'text-red-400' : r.balance === 'tight' ? 'text-yellow-400' : 'text-green-400'}`}>
                      {r.required_dps.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5"><BalanceBadge status={r.balance} /></td>
                    <td className="px-3 py-2.5 text-gray-400 font-mono">{r.session_time}m</td>
                    <td className="px-3 py-2.5 font-mono text-yellow-400">{r.currency_earned.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-mono text-blue-400">{r.transport_hp.toLocaleString()}</td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onGenerate(r)}
                        disabled={generating === r.raid}
                        className="px-2 py-1 text-[10px] font-bold rounded border border-orange-700/60 bg-orange-900/30 text-orange-300 hover:bg-orange-800/40 disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        {generating === r.raid ? '...' : '+ Level'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && <WaveBreakdown raidData={r} />}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── design analysis sections ─────────────────────────────────────────────────
function DesignAnalysis({ raids, vars }) {
  // Find "wall" raids where DPS gap closes
  const wallRaids = raids.filter(r => r.dps_ratio < 1.1).map(r => r.raid)
  const brutalCount = raids.filter(r => r.balance === 'brutal').length
  const tightCount = raids.filter(r => r.balance === 'tight').length
  const winnableCount = raids.filter(r => r.balance === 'winnable').length

  // Currency economy: waves until first upgrade (target: cost ~150-200 for lv1)
  const upgradeCost = 150
  const act1Raids = raids.filter(r => r.act === 1)
  const act2Raids = raids.filter(r => r.act === 2)
  const act3Raids = raids.filter(r => r.act === 3)

  const wavesForUpgrade = (raidData) => {
    let cumulative = raidData.starting_curr
    for (let i = 0; i < raidData.waves.length; i++) {
      cumulative += raidData.waves[i].currency
      if (cumulative >= upgradeCost) return i + 1
    }
    return null
  }

  const badEconRaids = raids.filter(r => {
    const w = wavesForUpgrade(r)
    return w === null || w > 2
  }).map(r => r.raid)

  return (
    <div className="space-y-3">
      <Accordion title="45 Raids — The Structural Approach" defaultOpen>
        <p>
          The 45-raid campaign is divided into <strong className="text-gray-200">5 worlds of 9 raids each</strong>, spanning 3 acts (raids 1–15, 16–30, 31–45).
          This structure follows proven retention design: short-loop satisfaction (a raid = 10–20 min), medium-loop rewards (world completion), and long-loop mastery (act progression).
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong className="text-cyan-400">World 1–2 (Raids 1–18):</strong> Tutorial and early engagement. Scout-heavy waves, minimal path complexity, 3–5 tower slots. Teach the core loop without overwhelming.</li>
          <li><strong className="text-yellow-400">World 3 (Raids 19–27):</strong> Mid-core transition. Grunt-dominant composition, S-curve paths, zone blockers as pacing gates. This is the "hook" — player feels mastery building.</li>
          <li><strong className="text-orange-400">World 4 (Raids 28–36):</strong> Endgame ramp. Brute composition rises sharply, complex winding paths, the Tesla tower enters. Rewards optimized tower placement.</li>
          <li><strong className="text-red-400">World 5 (Raids 37–45):</strong> Max complexity. Full enemy mix, 8 slots, 3 zone blockers, near-max HP scaling. Only mastered builds survive comfortably.</li>
        </ul>
        <p>
          9 raids per world gives exactly <strong className="text-gray-200">3 raids per act-segment</strong> within each world, enabling a mini-arc: intro, escalation, climax. This rhythm prevents burnout by resetting the emotional beat every ~3 sessions.
        </p>
      </Accordion>

      <Accordion title="Difficulty Curve Analysis">
        <p>
          Current variable configuration produces: <strong className="text-green-400">{winnableCount} Winnable</strong>, <strong className="text-yellow-400">{tightCount} Tight</strong>, <strong className="text-red-400">{brutalCount} Brutal</strong> raids.
        </p>
        {wallRaids.length > 0 ? (
          <p>
            <strong className="text-yellow-400">Wall candidates</strong> (DPS ratio below 1.1×): Raids {wallRaids.join(', ')}.
            These raids are where available DPS barely covers required DPS — the player must play near-optimally or use upgrades.
          </p>
        ) : (
          <p className="text-green-400">No wall raids detected with current variables — the difficulty curve is smooth throughout.</p>
        )}
        <p>
          The ideal difficulty pattern follows a <strong className="text-gray-200">sawtooth curve</strong>: gradual escalation within each world, followed by a slight relief at each new world boundary (new tower unlocked, fresh mechanics).
          Avoid two consecutive "brutal" raids — this creates frustration without learning opportunity.
        </p>
        <p>
          <strong className="text-gray-200">Recommendation:</strong> If brutal raids cluster in World 4–5, consider raising <code className="text-orange-300 bg-gray-800 px-1 rounded">upgrade_factor</code> from {vars.upgrade_factor} to {(vars.upgrade_factor * 1.1).toFixed(1)},
          or increasing <code className="text-orange-300 bg-gray-800 px-1 rounded">tower_slots_end</code> by 1.
          If early raids are too easy, lower <code className="text-orange-300 bg-gray-800 px-1 rounded">boost_factor</code> or reduce <code className="text-orange-300 bg-gray-800 px-1 rounded">avg_base_tower_dps</code>.
        </p>
      </Accordion>

      <Accordion title="Enemy Composition Strategy">
        <p>
          The composition shift drives natural difficulty escalation without needing to inflate raw numbers alone:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong className="text-cyan-400">Scout-heavy (Raids 1–15):</strong> Fast, low-HP enemies reward responsive tower placement and teach spawn timing. High kill-rate reinforces positive feedback.</li>
          <li><strong className="text-green-400">Grunt-dominant (Raids 8–30, peaks ~22):</strong> The balanced middle. Grunts stress DPS without overwhelming. Teaching players that pure speed is insufficient.</li>
          <li><strong className="text-red-400">Brute-heavy (Raids 20–45):</strong> Slow tanks that survive long enough to deal damage to the Transport. Forces players into high-DPS, crowd-control tower combos.</li>
        </ul>
        <p>
          Formulas: <code className="text-orange-300 bg-gray-800 px-1 rounded">scout% = max(10%, 60%−raid×1.1%)</code>,
          <code className="text-orange-300 bg-gray-800 px-1 rounded mx-1">brute% = min(50%, (raid−1)×1.1%)</code>,
          grunt fills the remainder. This creates a smooth crossover at raid ~27 where Brutes overtake Scouts as the dominant enemy type.
        </p>
        <p>
          <strong className="text-gray-200">Design intent:</strong> The composition shift is the primary difficulty lever for mid-to-late game. HP scaling alone causes inflation; composition shifts create qualitative strategy changes.
        </p>
      </Accordion>

      <Accordion title="Currency Economy Deep Dive">
        <p>
          Target: players should be able to afford their first tower upgrade (cost ~{upgradeCost}) within 2 waves.
        </p>
        {badEconRaids.length > 0 ? (
          <div>
            <p className="text-yellow-400 font-semibold mb-1">Economy concern at raids: {badEconRaids.slice(0, 12).join(', ')}{badEconRaids.length > 12 ? `… (+${badEconRaids.length - 12} more)` : ''}</p>
            <p>At these raids, accumulated currency (starting + 2 waves earned) falls short of {upgradeCost}. Recommend increasing <code className="text-orange-300 bg-gray-800 px-1 rounded">drop_raid_scale</code> or <code className="text-orange-300 bg-gray-800 px-1 rounded">starting_currency</code>.</p>
          </div>
        ) : (
          <p className="text-green-400">Economy is healthy across all raids — first upgrade is achievable within 2 waves throughout the campaign.</p>
        )}
        <p>
          Act 1 avg starting currency: <strong className="text-yellow-400">{Math.round(act1Raids.reduce((s, r) => s + r.starting_curr, 0) / act1Raids.length)}</strong> ·
          Act 2: <strong className="text-yellow-400">{Math.round(act2Raids.reduce((s, r) => s + r.starting_curr, 0) / act2Raids.length)}</strong> ·
          Act 3: <strong className="text-yellow-400">{Math.round(act3Raids.reduce((s, r) => s + r.starting_curr, 0) / act3Raids.length)}</strong>
        </p>
        <p>
          The <code className="text-orange-300 bg-gray-800 px-1 rounded">currency_raid_scale</code> of {vars.currency_raid_scale}× ensures starting bonuses keep pace with HP inflation, preventing late-game players from being bottlenecked by upgrade costs relative to earlier raids.
        </p>
      </Accordion>

      <Accordion title="Path Complexity Recommendations">
        {[
          { raids: '1–9', path: 'Straight path, 1 split max, 3 tower slots', blocker: 'None', note: 'Teach basics. No path surprises.' },
          { raids: '10–18', path: 'One bend + 1 split, 4–5 tower slots', blocker: '1 zone blocker mid-raid (Wave 5)', note: 'First zone blocker teaches the mechanic' },
          { raids: '19–27', path: 'S-curve, 2 splits possible, 5–6 slots', blocker: '2 zone blockers at waves 3 and 8', note: 'Path geometry becomes a strategic asset' },
          { raids: '28–36', path: 'Complex winding, 2 splits, 6–7 slots', blocker: '2–3 zone blockers, one at wave 1', note: 'Illusion of longer path from start' },
          { raids: '37–45', path: 'Maximum complexity, 8 slots', blocker: '3 zone blockers + variable timing', note: 'Full mastery required' },
        ].map(row => (
          <div key={row.raids} className="bg-gray-800/50 rounded-lg px-3 py-2.5 border border-gray-700/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-orange-400 font-bold text-xs">Raids {row.raids}</span>
              <span className="text-gray-300 text-xs">{row.path}</span>
            </div>
            <div className="text-[11px] text-gray-500 flex gap-4">
              <span><span className="text-gray-600">Blockers: </span>{row.blocker}</span>
              <span className="text-gray-400">{row.note}</span>
            </div>
          </div>
        ))}
      </Accordion>

      <Accordion title="The Zone Blocker Mechanic as Pacing Tool">
        <p>
          Zone blockers unlock new path sections after specific wave counts, creating a <strong className="text-gray-200">mid-raid pacing event</strong> that serves multiple design goals:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong className="text-gray-200">Tension → Release:</strong> The first few waves funnel enemies through a constrained path (high tower coverage). The zone blocker opening releases pressure by adding path length, giving players a "breath" moment to plan their next tower.</li>
          <li><strong className="text-gray-200">Progression Signal:</strong> Players hear/see the blocker open — a clear beat that says "you survived the opener, now the real wave begins."</li>
          <li><strong className="text-gray-200">World 3+ Layering:</strong> At wave 1 (already open), a blocker creates the <em>illusion</em> that the path has always been long, front-loading the visual complexity while still giving the "unlock" feel at later gates.</li>
        </ul>
        <p>
          Recommended trigger waves: <strong className="text-orange-400">Wave 3, Wave 7, Wave 12</strong>. This places unlocks at roughly 33%, 55%, and 80% of a 15-wave raid — aligned with natural "momentum peaks" in session engagement.
        </p>
      </Accordion>

      <Accordion title="Wave Composition Timing Patterns">
        {[
          { raids: '1–9',   groups: '1 group, all spawn at once', pressure: 'None', note: 'Simple burst — teaches kill windows' },
          { raids: '10–18', groups: '2 groups, 15s apart',        pressure: 'Light', note: 'Introduces gap-management micro-decisions' },
          { raids: '19–27', groups: '3 groups, mixed enemy types', pressure: 'Moderate', note: 'Mixed groups test tower specialization vs generalism' },
          { raids: '28–45', groups: 'Variable timing, pressure waves', pressure: 'Heavy', note: 'Some waves fast-spawn at 60% normal interval for "surge" feel' },
        ].map(row => (
          <div key={row.raids} className="bg-gray-800/50 rounded-lg px-3 py-2.5 border border-gray-700/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-orange-400 font-bold text-xs">Raids {row.raids}</span>
              <span className="text-xs text-gray-300">{row.groups}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                row.pressure === 'None' ? 'text-green-400 bg-green-900/30 border-green-700/30' :
                row.pressure === 'Light' ? 'text-cyan-400 bg-cyan-900/30 border-cyan-700/30' :
                row.pressure === 'Moderate' ? 'text-yellow-400 bg-yellow-900/30 border-yellow-700/30' :
                'text-red-400 bg-red-900/30 border-red-700/30'
              }`}>{row.pressure}</span>
            </div>
            <p className="text-[11px] text-gray-500">{row.note}</p>
          </div>
        ))}
      </Accordion>
    </div>
  )
}

// ─── summary stats row ────────────────────────────────────────────────────────
function SummaryStats({ raids }) {
  const totalSession = raids.reduce((s, r) => s + parseFloat(r.session_time), 0)
  const avgDpsRatio = raids.reduce((s, r) => s + r.dps_ratio, 0) / raids.length
  const maxTransport = raids[raids.length - 1].transport_hp
  const brutalCount = raids.filter(r => r.balance === 'brutal').length

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label: 'Total Campaign Time', value: `${totalSession.toFixed(0)} min`, sub: `≈ ${(totalSession / 60).toFixed(1)} hours`, color: 'text-blue-400' },
        { label: 'Avg DPS Ratio', value: `${avgDpsRatio.toFixed(2)}×`, sub: 'avail / required', color: avgDpsRatio >= 1.3 ? 'text-green-400' : avgDpsRatio >= 0.9 ? 'text-yellow-400' : 'text-red-400' },
        { label: 'Raid 45 Transport HP', value: maxTransport.toLocaleString(), sub: 'final boss gate', color: 'text-purple-400' },
        { label: 'Brutal Raids', value: brutalCount, sub: `of 45 raids (${((brutalCount / 45) * 100).toFixed(0)}%)`, color: brutalCount > 10 ? 'text-red-400' : brutalCount > 5 ? 'text-yellow-400' : 'text-green-400' },
      ].map(s => (
        <Card key={s.label} className="p-4">
          <p className="text-xs text-gray-500 mb-1">{s.label}</p>
          <p className={`text-2xl font-bold stat-num ${s.color}`}>{s.value}</p>
          {s.sub && <p className="text-xs text-gray-600 mt-0.5">{s.sub}</p>}
        </Card>
      ))}
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function RaidsPage() {
  const navigate = useNavigate()
  const [vars, setVars] = useState(DEFAULT_VARS)
  const [panelOpen, setPanelOpen] = useState(false)
  const [apiSynced, setApiSynced] = useState(false)
  const [apiDefaults, setApiDefaults] = useState(DEFAULT_VARS)
  const [enemyTypes, setEnemyTypes] = useState([])
  const [generating, setGenerating] = useState(null) // raid number being generated

  useEffect(() => {
    Promise.all([getTowerTypes(), getEnemyTypes()])
      .then(([towers, enemies]) => {
        setEnemyTypes(enemies)
        const attackTowers = towers.filter(t => t.base_dps > 0)
        const avgDps = attackTowers.length
          ? Math.round(attackTowers.reduce((s, t) => s + t.base_dps, 0) / attackTowers.length)
          : DEFAULT_VARS.avg_base_tower_dps
        const scout = enemies.find(e => e.name === 'Scout') || {}
        const grunt = enemies.find(e => e.name === 'Grunt') || {}
        const brute = enemies.find(e => e.name === 'Brute') || {}
        const synced = {
          ...DEFAULT_VARS,
          hp_base_scout: scout.hp ?? DEFAULT_VARS.hp_base_scout,
          hp_base_grunt: grunt.hp ?? DEFAULT_VARS.hp_base_grunt,
          hp_base_brute: brute.hp ?? DEFAULT_VARS.hp_base_brute,
          drop_scout: scout.currency_drop ?? DEFAULT_VARS.drop_scout,
          drop_grunt: grunt.currency_drop ?? DEFAULT_VARS.drop_grunt,
          drop_brute: brute.currency_drop ?? DEFAULT_VARS.drop_brute,
          avg_base_tower_dps: avgDps,
        }
        setApiDefaults(synced)
        setVars(synced)
        setApiSynced(true)
      })
      .catch(() => {}) // silently use hardcoded defaults if API unavailable
  }, [])

  const handleVarChange = useCallback((key, value) => {
    if (key === '__reset__') {
      setVars(apiDefaults)
      return
    }
    setVars(prev => ({ ...prev, [key]: value }))
  }, [apiDefaults])

  const raids = useMemo(
    () => Array.from({ length: 45 }, (_, i) => computeRaid(i + 1, vars)),
    [vars]
  )

  const handleGenerateLevel = useCallback(async (raidData) => {
    setGenerating(raidData.raid)
    try {
      const scout = enemyTypes.find(e => e.name === 'Scout')
      const grunt  = enemyTypes.find(e => e.name === 'Grunt')
      const brute  = enemyTypes.find(e => e.name === 'Brute')

      const level = await createLevel({
        name: `Raid ${raidData.raid} — World ${raidData.world} / Act ${raidData.act}`,
        transport_hp: raidData.transport_hp,
        starting_currency: raidData.starting_curr,
        path_nodes: [],
        tower_slots: [],
        zone_blockers: [],
      })

      // Generate waves based on computed raid wave breakdown
      for (const w of raidData.waves) {
        const scoutCount = Math.round(w.count * raidData.scout_pct)
        const bruteCount = Math.round(w.count * raidData.brute_pct)
        const gruntCount = Math.max(0, w.count - scoutCount - bruteCount)

        const groups = []
        if (scout && scoutCount > 0) groups.push({ enemy_type_id: scout.id, count: scoutCount, spawn_interval: raidData.spawn_interval, per_spawn: 1 })
        if (grunt  && gruntCount > 0) groups.push({ enemy_type_id: grunt.id,  count: gruntCount,  spawn_interval: raidData.spawn_interval * 1.2, per_spawn: 1 })
        if (brute  && bruteCount > 0) groups.push({ enemy_type_id: brute.id,  count: bruteCount,  spawn_interval: raidData.spawn_interval * 1.5, per_spawn: 1 })

        if (groups.length > 0) {
          await createWave(level.id, {
            wave_number: w.wave,
            pre_wave_delay: 3,
            groups,
          })
        }
      }

      navigate(`/level/${level.id}`)
    } catch (err) {
      console.error('Failed to generate level:', err)
    } finally {
      setGenerating(null)
    }
  }, [enemyTypes, navigate])

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            45 Raids — Campaign Planner
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Interactive level design analysis for the full tower defense campaign. All values live-compute from formula variables.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse inline-block" />
          Live calculations
          {apiSynced && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-700/40">
              ✓ synced from backend
            </span>
          )}
        </div>
      </div>

      {/* 1. Formula Variables Panel */}
      <FormulaPanel vars={vars} onChange={handleVarChange} open={panelOpen} setOpen={setPanelOpen} />

      {/* 2. Core Formula Display */}
      <FormulaDisplay vars={vars} />

      {/* 3. Summary Stats */}
      <SummaryStats raids={raids} />

      {/* 4. Charts */}
      <div>
        <SectionHeader title="Progression Charts" subtitle="All 45 raids — live-updated from formula variables above" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Enemy HP Progression</h4>
            <HpProgressionChart raids={raids} />
            <p className="text-[10px] text-gray-600 mt-2">Scout (cyan) · Grunt (green) · Brute (red) — HP per enemy by raid</p>
          </Card>
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">DPS: Available vs Required</h4>
            <DpsGapChart raids={raids} />
            <p className="text-[10px] text-gray-600 mt-2">Orange = available tower+squad DPS · Red dashed = required to clear last wave</p>
          </Card>
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Currency Economy</h4>
            <CurrencyChart raids={raids} />
            <p className="text-[10px] text-gray-600 mt-2">Amber = earned per raid · Blue = starting currency</p>
          </Card>
        </div>
      </div>

      {/* 5. Raids Progression Table */}
      <RaidsTable raids={raids} onGenerate={handleGenerateLevel} generating={generating} />

      {/* 6. Tower Introduction Schedule */}
      <TowerTimeline />

      {/* 7. Deep Design Analysis */}
      <div>
        <SectionHeader
          title="Deep Design Analysis"
          subtitle="Structural reasoning, computed recommendations, and balance guidance — all wired to formula variables"
        />
        <DesignAnalysis raids={raids} vars={vars} />
      </div>
    </div>
  )
}

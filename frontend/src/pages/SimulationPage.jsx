import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getLevel, getWaves, getPlacements, getSquad, getTowerTypes, getEnemyTypes } from '../api.js'

const SVG_W = 900
const SVG_H = 580

// ── Path geometry ─────────────────────────────────────────────────────────────
function segLen(a, b) { return Math.hypot(b.x - a.x, b.y - a.y) }

function totalPathLen(nodes) {
  let t = 0
  for (let i = 1; i < nodes.length; i++) t += segLen(nodes[i - 1], nodes[i])
  return t
}

function pointAtDist(d, nodes) {
  if (nodes.length < 2) return nodes[0] || { x: 0, y: 0 }
  let cum = 0
  for (let i = 0; i < nodes.length - 1; i++) {
    const seg = segLen(nodes[i], nodes[i + 1])
    if (cum + seg >= d) {
      const t = (d - cum) / seg
      return {
        x: nodes[i].x + t * (nodes[i + 1].x - nodes[i].x),
        y: nodes[i].y + t * (nodes[i + 1].y - nodes[i].y),
      }
    }
    cum += seg
  }
  return nodes[nodes.length - 1]
}

// Cumulative path distance to a given node index
function pathDistAtNode(nodeIdx, nodes) {
  let dist = 0
  for (let i = 0; i < Math.min(nodeIdx, nodes.length - 1); i++) {
    dist += segLen(nodes[i], nodes[i + 1])
  }
  return dist
}

// Given zone blockers and current waveNumber, find the active spawner:
// = the locked ZB with the LOWEST unlock_after_wave (nearest to transport/player).
// Zone blockers are ordered so that the one closest to the transport unlocks first.
// As it opens, spawner moves to the next ZB further from transport.
// Returns { pathDist, blocker } or null if all open → spawn from path start.
function getActiveSpawner(zoneBlockers, waveNumber, pathNodes) {
  // Locked ZBs for this wave
  const locked = zoneBlockers.filter(b => b.unlock_after_wave >= waveNumber)
  if (!locked.length) return null  // all open — spawn from start

  // The one that unlocks first (lowest wave) is nearest to transport/player
  locked.sort((a, b) => a.unlock_after_wave - b.unlock_after_wave)
  const active = locked[0]

  const nodeIdx = active.node_index ?? 0
  const dist = pathDistAtNode(nodeIdx, pathNodes)
  return { blocker: active, pathDist: dist, pos: pathNodes[nodeIdx] || pointAtDist(dist, pathNodes) }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const EFFECT_COLORS = { Shell: '#f97316', Electro: '#a78bfa', Ice: '#38bdf8', Fire: '#ef4444', None: '#22c55e' }
const ENEMY_SIZE_R = { Small: 7, Medium: 10, Large: 14 }
const FIRE_COOLDOWN = 0.4   // seconds between shots (visual pacing)
const SQUAD_COOLDOWN = 0.5

let _eid = 0

function makeEnemy(et, startDist) {
  return {
    id: ++_eid,
    typeId: et.id,
    name: et.name,
    color: et.color || '#ef4444',
    size: et.size || 'Medium',
    r: ENEMY_SIZE_R[et.size] || 8,
    pathDist: startDist,
    hp: et.hp,
    maxHp: et.hp,
    speed: et.speed,
    slow: 1.0,
    slowTimer: 0,
    alive: true,
    dying: false,
    dyingTimer: 0,
  }
}

function buildSpawnQueue(wave, enemyMap) {
  let groups
  try { groups = typeof wave.groups === 'string' ? JSON.parse(wave.groups) : (wave.groups || []) } catch { groups = [] }
  const queue = []
  let t = wave.pre_wave_delay || 3
  for (const g of groups) {
    const et = enemyMap[g.enemy_type_id]
    if (!et) continue
    for (let i = 0; i < (g.count || 1); i++) {
      queue.push({ time: t, typeId: g.enemy_type_id })
      t += (g.spawn_interval ?? 0.5)
    }
    t += (g.group_delay ?? 0)
  }
  return queue.sort((a, b) => a.time - b.time)
}

// Normalize slot unlock field — editor saves as unlock_after_wave OR unlock_wave
function slotUnlockWave(s) {
  return s.unlock_after_wave ?? s.unlock_wave ?? 0
}

// waveNumber: the wave being simulated (1-based)
// Slots with unlock_after_wave < waveNumber are available for this wave
function buildTowers(placements, towerTypesMap, slots, waveNumber) {
  const availableSlotIds = new Set(
    slots.filter(s => slotUnlockWave(s) < waveNumber).map(s => s.id)
  )
  return placements.map(p => {
    const slot = slots.find(s => s.id === p.slot_id)
    const tt = towerTypesMap[p.tower_type_id]
    if (!slot || !tt) return null
    const upgLevel = p.upgrade_level || 0
    let dpsMults, rangeMults
    try { dpsMults = JSON.parse(tt.upgrade_dps_mults) } catch { dpsMults = [1, 1.6, 2.5, 4] }
    try { rangeMults = JSON.parse(tt.upgrade_range_mults) } catch { rangeMults = [1, 1.15, 1.3, 1.5] }
    return {
      id: String(p.id || Math.random()),
      slotId: slot.id,
      x: slot.x,
      y: slot.y,
      unlockWave: slotUnlockWave(slot),
      active: availableSlotIds.has(slot.id),  // false = locked for this wave
      name: tt.name,
      category: tt.category,
      effectType: tt.effect_type,
      dps: tt.base_dps * (dpsMults[upgLevel] ?? 1),
      range: tt.base_range * (rangeMults[upgLevel] ?? 1),
      color: tt.color || EFFECT_COLORS[tt.effect_type] || '#f97316',
      slowFactor: tt.slow_factor || 0,
      boostMult: tt.boost_mult || 1,
    }
  }).filter(Boolean)
}

// All slots including those without placements (to show locked empties)
function buildAllSlots(slots, waveNumber) {
  return slots.map(s => ({
    ...s,
    active: slotUnlockWave(s) < waveNumber,
  }))
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SimulationPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [selectedWave, setSelectedWave] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)

  // Stats synced from sim
  const [statTransportHp, setStatTransportHp] = useState(null)
  const [statKills, setStatKills] = useState(0)
  const [raidWon, setRaidWon] = useState(false)
  const [statElapsed, setStatElapsed] = useState(0)
  const [statPhase, setStatPhase] = useState('idle')

  const simRef = useRef(null)
  const rafRef = useRef(null)
  const lastTsRef = useRef(null)
  const speedRef = useRef(1)
  speedRef.current = speed

  // Load all data
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [level, waves, placements, squad, tts, ets] = await Promise.all([
        getLevel(id), getWaves(id), getPlacements(id),
        getSquad(id), getTowerTypes(), getEnemyTypes(),
      ])
      if (!cancelled) {
        setData({ level, waves, placements, squad, tts, ets })
        setStatTransportHp(level.transport_hp)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const pathNodes = useMemo(() => {
    try { return JSON.parse(data?.level?.path_nodes || '[]') } catch { return [] }
  }, [data])

  const towerSlots = useMemo(() => {
    try { return JSON.parse(data?.level?.tower_slots || '[]') } catch { return [] }
  }, [data])

  const pathLen = useMemo(() => totalPathLen(pathNodes), [pathNodes])

  const towerTypesMap = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(data.tts.map(t => [t.id, t]))
  }, [data])

  const enemyMap = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(data.ets.map(e => [e.id, e]))
  }, [data])

  const waveNumber = data?.waves[selectedWave]?.wave_number ?? 1

  const zoneBlockers = useMemo(() => {
    try { return JSON.parse(data?.level?.zone_blockers || '[]') } catch { return [] }
  }, [data])

  // All towers (active + locked) for rendering; filtered to active-only for simulation
  const towers = useMemo(() => {
    if (!data) return []
    return buildTowers(data.placements, towerTypesMap, towerSlots, waveNumber)
  }, [data, towerTypesMap, towerSlots, waveNumber])

  // Empty slots that have no placement (show as build spots)
  const allSlots = useMemo(() => {
    if (!data) return []
    return buildAllSlots(towerSlots, waveNumber)
  }, [towerSlots, waveNumber])

  const activeTowers = useMemo(() => towers.filter(t => t.active), [towers])

  // Final ZB = the one with the highest unlock_after_wave (win target)
  const finalZbWave = zoneBlockers.length > 0
    ? Math.max(...zoneBlockers.map(b => b.unlock_after_wave))
    : null

  // Active spawner: the nearest-to-transport locked ZB for this wave.
  // null → all ZBs open, enemies spawn from path start (dist 0).
  const spawnerInfo = useMemo(
    () => getActiveSpawner(zoneBlockers, waveNumber, pathNodes),
    [zoneBlockers, waveNumber, pathNodes]
  )
  // Where enemies emerge from on the path
  const spawnerDist = spawnerInfo?.pathDist ?? 0
  // Player stands on the transport side of the spawner (between ZB and transport)
  const playerAnchorDist = Math.min(pathLen - 10, spawnerDist + 40)

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetSim = useCallback(() => {
    if (!data) return
    const wave = data.waves[selectedWave]
    if (!wave) return
    const sq = data.squad
    simRef.current = {
      time: 0,
      phase: 'waiting',
      enemies: [],
      beams: [],
      damageNums: [],
      spawnQueue: buildSpawnQueue(wave, enemyMap),
      spawnIdx: 0,
      transportHp: data.level.transport_hp,
      transportMaxHp: data.level.transport_hp,
      kills: 0,
      towerCooldowns: Object.fromEntries(activeTowers.map(t => [t.id, Math.random() * FIRE_COOLDOWN])),
      spawnerDist,
      playerDist: playerAnchorDist,
      playerAnchorDist,
      playerCooldown: 0,
      companionOffsets: Array.from({ length: sq?.companion_count || 4 }, (_, i) => (i % 2 === 0 ? -1 : 1) * (15 + i * 10)),
      squad: sq,
    }
    setStatTransportHp(data.level.transport_hp)
    setStatKills(0)
    setStatElapsed(0)
    setStatPhase('waiting')
    setRaidWon(false)
  }, [data, selectedWave, enemyMap, towers, spawnerDist, playerAnchorDist])

  useEffect(() => {
    resetSim()
    setRunning(false)
  }, [resetSim])

  // ── Simulation step ────────────────────────────────────────────────────────
  const step = useCallback((rawDt) => {
    const sim = simRef.current
    if (!sim || sim.phase === 'done') return

    const dt = Math.min(rawDt * speedRef.current, 0.15)
    sim.time += dt

    // Spawn from queue
    while (sim.spawnIdx < sim.spawnQueue.length && sim.spawnQueue[sim.spawnIdx].time <= sim.time) {
      const ev = sim.spawnQueue[sim.spawnIdx++]
      const et = enemyMap[ev.typeId]
      if (et) {
        // Enemies emerge from the active zone blocker position, slightly staggered
        const e = makeEnemy(et, sim.spawnerDist - 5 - (Math.random() * 8))
        sim.enemies.push(e)
      }
    }

    // Decay visual effects
    sim.beams = sim.beams.filter(b => { b.life -= dt; return b.life > 0 })
    sim.damageNums = sim.damageNums.filter(d => {
      d.life -= dt
      d.y -= 28 * dt
      d.x += d.drift * dt
      return d.life > 0
    })

    // Move enemies
    for (const e of sim.enemies) {
      if (e.dying) {
        e.dyingTimer -= dt
        if (e.dyingTimer <= 0) { e.alive = false; e.dying = false }
        continue
      }
      if (!e.alive) continue
      const spd = e.speed * (e.slowTimer > 0 ? e.slow : 1.0)
      e.pathDist += spd * dt
      if (e.slowTimer > 0) e.slowTimer -= dt
      if (e.pathDist >= pathLen) {
        e.alive = false
        sim.transportHp = Math.max(0, sim.transportHp - e.hp * 0.08)
      }
    }

    // Only enemies that have emerged from the spawner (past the ZB position)
    const aliveEnemies = sim.enemies.filter(e => e.alive && !e.dying && e.pathDist >= sim.spawnerDist - 5)

    // Tower attacks: apply DPS + fire beams
    for (const tower of activeTowers) {
      sim.towerCooldowns[tower.id] -= dt
      if (sim.towerCooldowns[tower.id] > 0) continue

      // Attack towers shoot; debuff towers apply slow; support towers boost (skip visual for now)
      if (tower.category === 'Support') continue

      // Pick target: enemy furthest along path within range
      let target = null
      for (const e of aliveEnemies) {
        const pos = pointAtDist(Math.max(0, e.pathDist), pathNodes)
        const d = Math.hypot(pos.x - tower.x, pos.y - tower.y)
        if (d <= tower.range) {
          if (!target || e.pathDist > target.pathDist) target = e
        }
      }

      if (!target) continue

      sim.towerCooldowns[tower.id] = FIRE_COOLDOWN

      if (tower.category === 'Debuff' && tower.effectType === 'Ice') {
        // Apply slow
        target.slow = Math.max(0.1, 1 - tower.slowFactor)
        target.slowTimer = 2.0
        const pos = pointAtDist(Math.max(0, target.pathDist), pathNodes)
        sim.beams.push({ fromX: tower.x, fromY: tower.y, toX: pos.x, toY: pos.y, color: '#38bdf8', life: 0.2 })
        continue
      }

      if (tower.dps <= 0) continue

      const dmg = tower.dps * FIRE_COOLDOWN
      target.hp -= dmg

      const pos = pointAtDist(Math.max(0, target.pathDist), pathNodes)
      sim.beams.push({ fromX: tower.x, fromY: tower.y, toX: pos.x, toY: pos.y, color: tower.color, life: 0.18 })
      sim.damageNums.push({
        x: pos.x + (Math.random() - 0.5) * 14,
        y: pos.y - target.r - 2,
        val: Math.round(dmg),
        life: 0.65,
        color: tower.color,
        drift: (Math.random() - 0.5) * 20,
      })

      if (target.hp <= 0 && !target.dying) {
        target.dying = true
        target.dyingTimer = 0.35
        sim.kills++
        // Kill burst
        sim.damageNums.push({
          x: pos.x, y: pos.y - target.r - 12,
          val: '✕', life: 0.5, color: '#fbbf24', drift: 0,
        })
      }
    }

    // Player + squad — anchored just past the active spawner (transport side of ZB)
    // Player bobs slightly following the nearest enemy cluster, but stays near anchor
    const sq = sim.squad
    if (aliveEnemies.length > 0) {
      // Find enemy closest to spawner exit (just emerged from ZB)
      const nearSpawner = aliveEnemies.reduce((best, e) => {
        const d = Math.abs(e.pathDist - sim.spawnerDist)
        return d < best.d ? { e, d } : best
      }, { e: null, d: Infinity })
      // Player moves gently toward anchor but slightly forward with the nearest enemy
      const targetDist = nearSpawner.e
        ? Math.min(sim.playerAnchorDist + 20, nearSpawner.e.pathDist + 15)
        : sim.playerAnchorDist
      sim.playerDist += (targetDist - sim.playerDist) * Math.min(1, dt * 4)

      sim.playerCooldown -= dt
      if (sim.playerCooldown <= 0 && sq) {
        sim.playerCooldown = SQUAD_COOLDOWN
        const pPos = pointAtDist(Math.max(0, sim.playerDist), pathNodes)
        const pRange = sq.player_range ?? 80

        // Player attack: nearest enemy in range
        let nearestE = null, nearestD = Infinity
        for (const e of aliveEnemies) {
          const ePos = pointAtDist(Math.max(0, e.pathDist), pathNodes)
          const d = Math.hypot(ePos.x - pPos.x, ePos.y - pPos.y)
          if (d <= pRange && d < nearestD) { nearestD = d; nearestE = e }
        }
        if (nearestE) {
          const pdmg = (sq.player_dps ?? 30) * SQUAD_COOLDOWN
          nearestE.hp -= pdmg
          const ePos = pointAtDist(Math.max(0, nearestE.pathDist), pathNodes)
          sim.beams.push({ fromX: pPos.x, fromY: pPos.y, toX: ePos.x, toY: ePos.y, color: '#fbbf24', life: 0.14 })
          sim.damageNums.push({ x: ePos.x + 8, y: ePos.y - nearestE.r - 4, val: Math.round(pdmg), life: 0.6, color: '#fbbf24', drift: 8 })
          if (nearestE.hp <= 0 && !nearestE.dying) { nearestE.dying = true; nearestE.dyingTimer = 0.35; sim.kills++ }
        }

        // Companions attack
        for (let ci = 0; ci < (sq.companion_count || 0); ci++) {
          const offset = sim.companionOffsets[ci] ?? (ci * 12 - 20)
          const cPos = pointAtDist(Math.max(0, sim.playerDist + offset), pathNodes)
          const cdmg = (sq.companion_dps ?? 15) * SQUAD_COOLDOWN
          let bestE = null, bestD = Infinity
          for (const e of aliveEnemies) {
            const ePos = pointAtDist(Math.max(0, e.pathDist), pathNodes)
            const d = Math.hypot(ePos.x - cPos.x, ePos.y - cPos.y)
            if (d < 90 && d < bestD) { bestD = d; bestE = e }
          }
          if (bestE) {
            bestE.hp -= cdmg
            const ePos = pointAtDist(Math.max(0, bestE.pathDist), pathNodes)
            sim.beams.push({ fromX: cPos.x, fromY: cPos.y, toX: ePos.x, toY: ePos.y, color: '#86efac', life: 0.11 })
            if (bestE.hp <= 0 && !bestE.dying) { bestE.dying = true; bestE.dyingTimer = 0.35; sim.kills++ }
          }
        }
      }
    }

    // Phase logic
    const allSpawned = sim.spawnIdx >= sim.spawnQueue.length
    const anyAlive = aliveEnemies.length > 0 || sim.enemies.some(e => e.dying)
    sim.phase = allSpawned && !anyAlive ? 'done' : sim.time < (data.waves[selectedWave]?.pre_wave_delay || 3) ? 'waiting' : 'active'

    // WIN condition: last wave completed AND this was the final zone blocker wave
    // Final ZB = ZB with highest unlock_after_wave. After its wave clears → RAID WON.
    const finalZbWave = zoneBlockers.length > 0
      ? Math.max(...zoneBlockers.map(b => b.unlock_after_wave))
      : null
    const isLastWave = !data.waves[selectedWave + 1]
    const isWinWave = finalZbWave !== null && waveNumber === finalZbWave
    if (sim.phase === 'done' && (isWinWave || isLastWave)) {
      setRaidWon(true)
    }

    setStatTransportHp(Math.round(sim.transportHp))
    setStatKills(sim.kills)
    setStatElapsed(sim.time)
    setStatPhase(sim.phase)
    setTick(t => t + 1)
  }, [data, enemyMap, pathNodes, pathLen, activeTowers, selectedWave])

  // ── RAF loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current)
      lastTsRef.current = null
      return
    }
    const loop = (ts) => {
      if (lastTsRef.current === null) lastTsRef.current = ts
      const rawDt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      step(rawDt)
      if (simRef.current?.phase !== 'done') {
        rafRef.current = requestAnimationFrame(loop)
      } else {
        setRunning(false)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading simulation...</p>
        </div>
      </div>
    )
  }
  if (!data) return null

  const sim = simRef.current
  const transportMaxHp = data.level.transport_hp
  const tHpPct = statTransportHp !== null ? Math.max(0, statTransportHp / transportMaxHp) : 1
  const pathPts = pathNodes.map(n => `${n.x},${n.y}`).join(' ')
  const waveDelay = data.waves[selectedWave]?.pre_wave_delay || 3
  const countdownSec = Math.max(0, waveDelay - statElapsed).toFixed(1)

  const phaseConfig = {
    idle:    { label: 'Ready to simulate', color: 'text-gray-500' },
    waiting: { label: `Wave in ${countdownSec}s`, color: 'text-yellow-400' },
    active:  { label: 'Wave active!', color: 'text-green-400' },
    done:    { label: 'Wave complete!', color: 'text-orange-400' },
  }
  const { label: phaseLabel, color: phaseColor } = phaseConfig[statPhase] || phaseConfig.idle

  const spawnTotal = sim?.spawnQueue?.length || 0

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-800/80 bg-[#161b22] flex-shrink-0 flex-wrap">

        {/* Back */}
        <button onClick={() => navigate(`/level/${id}`)} className="text-gray-500 hover:text-gray-200 transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="text-sm font-bold text-gray-100 flex-shrink-0" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Simulation
        </h1>
        <span className="text-gray-700 text-xs flex-shrink-0">·</span>
        <span className="text-xs text-gray-500 flex-shrink-0 truncate max-w-[140px]">{data.level.name}</span>

        {/* Wave selector */}
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">Wave</span>
          {data.waves.map((w, i) => (
            <button key={i} onClick={() => { if (running) return; setSelectedWave(i) }}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors border ${selectedWave === i ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-gray-800/60 text-gray-500 border-gray-700 hover:text-gray-300'}`}>
              {w.wave_number}
            </button>
          ))}
          {data.waves.length === 0 && <span className="text-xs text-gray-600">No waves</span>}
        </div>

        <div className="flex-1" />

        {/* Transport HP bar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">🚌 HP</span>
          <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-100"
              style={{ width: `${tHpPct * 100}%`, background: tHpPct > 0.5 ? '#22c55e' : tHpPct > 0.25 ? '#f59e0b' : '#ef4444' }} />
          </div>
          <span className="text-[11px] text-gray-400 stat-num w-16 text-right">{statTransportHp ?? transportMaxHp}/{transportMaxHp}</span>
        </div>

        {/* Kills */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800/60 rounded-lg border border-gray-700/50 flex-shrink-0">
          <span className="text-[10px] text-gray-500">☠</span>
          <span className="text-xs font-bold text-orange-400 stat-num">{statKills}</span>
          {spawnTotal > 0 && <span className="text-[10px] text-gray-600">/{spawnTotal}</span>}
        </div>

        {/* Time */}
        <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-800/60 rounded-lg border border-gray-700/50 flex-shrink-0">
          <span className="text-[10px] text-gray-500">t</span>
          <span className="text-xs font-bold text-gray-300 stat-num">{statElapsed.toFixed(1)}s</span>
        </div>

        {/* Phase */}
        <span className={`text-xs font-medium flex-shrink-0 ${phaseColor}`}>{phaseLabel}</span>

        {/* Speed */}
        <div className="flex gap-0.5 flex-shrink-0">
          {[1, 2, 4].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors ${speed === s ? 'bg-orange-500/20 text-orange-300 border border-orange-500/25' : 'bg-gray-800/60 text-gray-500 border border-gray-700 hover:text-gray-300'}`}>
              {s}×
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => {
              if (statPhase === 'done' || statPhase === 'idle') {
                resetSim()
                setTimeout(() => setRunning(true), 30)
              } else {
                setRunning(r => !r)
              }
            }}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all flex-shrink-0 ${
              running ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20'
            }`}
          >
            {running ? '⏸ Pause' : statPhase === 'done' ? '↺ Replay' : '▶ Play'}
          </button>
          <button onClick={() => { setRunning(false); resetSim() }}
            className="px-3 py-1.5 rounded-xl text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors border border-gray-700 flex-shrink-0"
            title="Reset">
            ↺
          </button>
        </div>
      </div>

      {/* ── Canvas + sidebar ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-5 gap-4">

        {/* SVG canvas */}
        <div className="bg-[#161b22] border border-gray-800/80 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0">
          <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            style={{ display: 'block' }}>
            <defs>
              <pattern id="sg" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1c2333" strokeWidth="0.6" />
              </pattern>
              <pattern id="blocker_stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="8" fill="#ef4444" fillOpacity="0.4" />
              </pattern>
              {towers.map(t => (
                <radialGradient key={`rg_${t.id}`} id={`rg_${t.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={t.color} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={t.color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            {/* Grid */}
            <rect width={SVG_W} height={SVG_H} fill="url(#sg)" />

            {/* Path track */}
            {pathNodes.length >= 2 && (
              <>
                <polyline points={pathPts} fill="none" stroke="#0f2744" strokeWidth={34} strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={pathPts} fill="none" stroke="#1e3a8a" strokeWidth={22} strokeLinejoin="round" strokeLinecap="round" opacity={0.5} />
                <polyline points={pathPts} fill="none" stroke="#3b82f6" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" opacity={0.3} />
                <polyline points={pathPts} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.6}
                  strokeDasharray="14 7" />
              </>
            )}

            {/* Empty unlocked slots (no tower placed) */}
            {allSlots.filter(s => !towers.find(t => t.slotId === s.id)).map(s => (
              <g key={`es_${s.id}`} opacity={s.active ? 0.5 : 0.2}>
                <circle cx={s.x} cy={s.y} r={18} fill="none" stroke="#4b5563" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={s.x} y={s.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#6b7280">⬜</text>
              </g>
            ))}

            {/* Tower range halos — only active towers */}
            {towers.filter(t => t.active).map(t => (
              <circle key={`rh_${t.id}`} cx={t.x} cy={t.y} r={t.range}
                fill={`url(#rg_${t.id})`} stroke={t.color + '20'} strokeWidth={1} />
            ))}

            {/* Towers — active in full color, locked as ghost */}
            {towers.map(t => (
              <g key={`tw_${t.id}`} opacity={t.active ? 1 : 0.25}>
                {/* Lock badge for inactive towers */}
                {!t.active && (
                  <>
                    <circle cx={t.x} cy={t.y} r={22} fill="none" stroke="#7f1d1d" strokeWidth={1.5} strokeDasharray="5 3" />
                    <rect x={t.x - 18} y={t.y + 12} width={36} height={13} rx={4} fill="#1c1c2e" stroke="#7f1d1d" strokeWidth={1} />
                    <text x={t.x} y={t.y + 20} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#f87171">
                      after W{t.unlockWave}🔒
                    </text>
                  </>
                )}
                <circle cx={t.x} cy={t.y} r={20} fill={t.color + (t.active ? '18' : '08')} stroke={t.color + (t.active ? '55' : '30')} strokeWidth={1.5} />
                <circle cx={t.x} cy={t.y} r={11} fill={t.color + (t.active ? '45' : '20')} />
                <circle cx={t.x} cy={t.y} r={7} fill={t.color + (t.active ? '80' : '40')} />
                <text x={t.x} y={t.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={t.active ? 'white' : '#6b7280'} fontWeight="bold" style={{ pointerEvents: 'none' }}>
                  {t.name[0]}
                </text>
                <title>{t.name} · {t.dps.toFixed(0)} DPS · range {t.range}{!t.active ? ` · Unlocks after wave ${t.unlockWave}` : ''}</title>
              </g>
            ))}

            {/* Zone blockers — all locked ones for this wave */}
            {zoneBlockers.map((b, i) => {
              const pos = b.x !== undefined ? { x: b.x, y: b.y } : pathNodes[b.node_index]
              if (!pos) return null
              const locked = b.unlock_after_wave >= waveNumber
              if (!locked) return null
              const isActiveSpawner = spawnerInfo?.blocker?.id === b.id ||
                (spawnerInfo?.blocker === b)
              const isFinal = finalZbWave !== null && b.unlock_after_wave === finalZbWave
              // Colors: final = gold, active-spawn = red, locked = dark red
              const barFill   = isFinal ? '#78350f' : isActiveSpawner ? '#991b1b' : '#7f1d1d'
              const barStroke = isFinal ? '#fbbf24' : isActiveSpawner ? '#ef4444' : '#dc2626'
              const barSW     = isFinal ? 2.5 : isActiveSpawner ? 2 : 1.5
              const textFill  = isFinal ? '#fde68a' : '#fca5a5'
              return (
                <g key={b.id || i}>
                  {/* Glow ring */}
                  {(isActiveSpawner || isFinal) && (
                    <circle cx={pos.x} cy={pos.y} r={42}
                      fill={isFinal ? '#fbbf2410' : '#dc262618'}
                      stroke={isFinal ? '#fbbf2460' : '#dc262650'}
                      strokeWidth={isFinal ? 2.5 : 2} />
                  )}
                  {/* Outer trophy ring for final */}
                  {isFinal && (
                    <circle cx={pos.x} cy={pos.y} r={52}
                      fill="none" stroke="#fbbf2430" strokeWidth={1.5} strokeDasharray="6 4" />
                  )}
                  {/* Barrier bar */}
                  <rect x={pos.x - 32} y={pos.y - 10} width={64} height={20} rx={5}
                    fill={barFill} fillOpacity={0.92}
                    stroke={barStroke} strokeWidth={barSW} />
                  <rect x={pos.x - 32} y={pos.y - 10} width={64} height={20} rx={5}
                    fill="url(#blocker_stripes)" fillOpacity={isFinal ? 0.15 : 0.3} />
                  <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fontWeight="bold" fill={textFill}>
                    {isFinal ? '🏆 FINAL' : isActiveSpawner ? '👾 SPAWN' : `⛔ W${b.unlock_after_wave}`}
                  </text>
                  {/* Label above */}
                  {(isActiveSpawner || isFinal) && (
                    <>
                      <rect x={pos.x - 34} y={pos.y - 30} width={68} height={16} rx={3}
                        fill="#0d1117cc" stroke={isFinal ? '#fbbf2440' : '#ef444440'} strokeWidth={1} />
                      <text x={pos.x} y={pos.y - 21} textAnchor="middle" dominantBaseline="middle"
                        fontSize={8} fill={isFinal ? '#fde68a' : '#f87171'}>
                        {isFinal ? `🏆 win target · clears W${b.unlock_after_wave}` : `opens after W${b.unlock_after_wave}`}
                      </text>
                    </>
                  )}
                </g>
              )
            })}

            {/* Active spawn point indicator (when all ZBs open — spawn from path start) */}
            {!spawnerInfo && pathNodes.length >= 2 && (
              <g>
                <circle cx={pathNodes[0].x} cy={pathNodes[0].y} r={16} fill="#dc262620" stroke="#ef4444" strokeWidth={2} />
                <text x={pathNodes[0].x} y={pathNodes[0].y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#ef4444" fontWeight="bold">👾</text>
              </g>
            )}

            {/* Path end = Transport */}
            {pathNodes.length >= 2 && (() => {
              const last = pathNodes[pathNodes.length - 1]
              return (
                <g>
                  <circle cx={last.x} cy={last.y} r={18} fill="#1e3a5f80" stroke="#3b82f6" strokeWidth={2} />
                  <text x={last.x} y={last.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={11}>🚌</text>
                  <rect x={last.x - 22} y={last.y + 20} width={44} height={13} rx={3} fill="#0d1117cc" stroke="#3b82f640" strokeWidth={1} />
                  <text x={last.x} y={last.y + 27} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#60a5fa">TRANSPORT</text>
                </g>
              )
            })()}

            {/* Attack beams */}
            {sim?.beams.map((b, i) => (
              <line key={i} x1={b.fromX} y1={b.fromY} x2={b.toX} y2={b.toY}
                stroke={b.color} strokeWidth={2.5} strokeLinecap="round"
                opacity={Math.min(1, b.life * 7)} />
            ))}

            {/* Enemies */}
            {sim?.enemies.filter(e => (e.alive || e.dying) && e.pathDist >= spawnerDist - 15).map(e => {
              const dist = Math.min(Math.max(spawnerDist - 10, e.pathDist), pathLen - 0.5)
              const pos = pointAtDist(dist, pathNodes)
              const hpPct = Math.max(0, e.hp / e.maxHp)
              const alpha = e.dying ? Math.max(0, e.dyingTimer / 0.35) : 1
              const scale = e.dying ? (1 + (1 - alpha) * 0.5) : 1
              const isSlowed = e.slowTimer > 0

              return (
                <g key={e.id} opacity={alpha} transform={`translate(${pos.x},${pos.y})`}>
                  {/* Slow ring */}
                  {isSlowed && (
                    <circle r={e.r + 5} fill="none" stroke="#38bdf8" strokeWidth={1.5} opacity={0.5}
                      strokeDasharray="4 3" />
                  )}
                  {/* Death burst ring */}
                  {e.dying && (
                    <circle r={e.r * scale + 8} fill="none" stroke="#fbbf24" strokeWidth={2}
                      opacity={alpha * 0.6} />
                  )}
                  {/* Body */}
                  <circle r={e.r * scale}
                    fill={e.color + 'dd'}
                    stroke={e.color}
                    strokeWidth={1.5}
                  />
                  {/* Enemy icon */}
                  <text textAnchor="middle" dominantBaseline="middle" fontSize={e.size === 'Large' ? 12 : e.size === 'Small' ? 8 : 10}
                    fill="white" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                    {e.size === 'Small' ? '◆' : e.size === 'Large' ? '▲' : '●'}
                  </text>
                  {/* HP bar */}
                  {!e.dying && (
                    <>
                      <rect x={-e.r} y={-e.r - 8} width={e.r * 2} height={3} rx={1.5} fill="#1f2937" />
                      <rect x={-e.r} y={-e.r - 8} width={e.r * 2 * hpPct} height={3} rx={1.5}
                        fill={hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444'} />
                    </>
                  )}
                </g>
              )
            })}

            {/* Player + companions */}
            {sim && pathNodes.length >= 2 && (() => {
              const pd = Math.max(0, Math.min(sim.playerDist, pathLen - 0.5))
              const pPos = pointAtDist(pd, pathNodes)
              return (
                <g>
                  {/* Companions */}
                  {sim.companionOffsets.map((offset, ci) => {
                    const cd = Math.max(0, Math.min(pd + offset, pathLen - 0.5))
                    const cPos = pointAtDist(cd, pathNodes)
                    return (
                      <g key={ci} transform={`translate(${cPos.x},${cPos.y})`}>
                        <circle r={7} fill="#14532d60" stroke="#86efac" strokeWidth={1.5} />
                        <text textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#86efac" style={{ pointerEvents: 'none' }}>★</text>
                      </g>
                    )
                  })}
                  {/* Player */}
                  <g transform={`translate(${pPos.x},${pPos.y})`}>
                    <circle r={13} fill="#78350f40" stroke="#fbbf24" strokeWidth={2} />
                    <circle r={8} fill="#fbbf24aa" />
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="white" fontWeight="bold" style={{ pointerEvents: 'none' }}>P</text>
                  </g>
                </g>
              )
            })()}

            {/* Damage numbers */}
            {sim?.damageNums.map((d, i) => (
              <text key={i} x={d.x} y={d.y} textAnchor="middle"
                fontSize={typeof d.val === 'string' ? 14 : 12}
                fontWeight="bold"
                fill={d.color}
                opacity={Math.min(1, d.life * 1.8)}
                style={{ fontFamily: 'Space Grotesk, monospace', pointerEvents: 'none' }}>
                {typeof d.val === 'string' ? d.val : `-${d.val}`}
              </text>
            ))}

            {/* Pre-wave countdown overlay */}
            {statPhase === 'waiting' && (
              <g>
                <rect x={SVG_W / 2 - 90} y={SVG_H / 2 - 28} width={180} height={56} rx={12}
                  fill="#0d1117cc" stroke="#374151" strokeWidth={1} />
                <text x={SVG_W / 2} y={SVG_H / 2 - 6} textAnchor="middle" fontSize={12} fill="#6b7280">
                  Wave starts in
                </text>
                <text x={SVG_W / 2} y={SVG_H / 2 + 16} textAnchor="middle" fontSize={22} fontWeight="bold" fill="#fbbf24"
                  style={{ fontFamily: 'Space Grotesk, monospace' }}>
                  {countdownSec}s
                </text>
              </g>
            )}

            {/* ── RAID CLEARED win overlay ─────────────────────────────────── */}
            {raidWon && (
              <g>
                {/* Dim backdrop */}
                <rect width={SVG_W} height={SVG_H} fill="#000000aa" />
                {/* Banner card */}
                <rect x={SVG_W / 2 - 160} y={SVG_H / 2 - 70} width={320} height={140} rx={18}
                  fill="#0d1117" stroke="#fbbf24" strokeWidth={2.5} />
                {/* Gold top bar */}
                <rect x={SVG_W / 2 - 160} y={SVG_H / 2 - 70} width={320} height={8} rx={4}
                  fill="#fbbf24" />
                {/* Trophy */}
                <text x={SVG_W / 2} y={SVG_H / 2 - 28} textAnchor="middle" fontSize={40}
                  style={{ fontFamily: 'system-ui' }}>🏆</text>
                {/* RAID CLEARED */}
                <text x={SVG_W / 2} y={SVG_H / 2 + 16} textAnchor="middle" fontSize={26} fontWeight="bold"
                  fill="#fbbf24" style={{ fontFamily: 'Space Grotesk, monospace', letterSpacing: '0.08em' }}>
                  RAID CLEARED
                </text>
                {/* Sub-line */}
                <text x={SVG_W / 2} y={SVG_H / 2 + 44} textAnchor="middle" fontSize={12} fill="#d97706"
                  style={{ fontFamily: 'Space Grotesk, monospace' }}>
                  Final zone blocker reached — victory!
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 w-44 flex-shrink-0">

          {/* Legend */}
          <div className="bg-[#161b22] border border-gray-800/80 rounded-xl p-3">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2.5 font-bold">Legend</p>
            <div className="space-y-1.5 text-[11px]">
              {[
                { icon: '●', color: 'text-yellow-400', label: 'Player' },
                { icon: '★', color: 'text-green-400', label: 'Companion' },
                { icon: '◆', color: 'text-blue-300', label: 'Scout (S)' },
                { icon: '●', color: 'text-red-400', label: 'Grunt (M)' },
                { icon: '▲', color: 'text-red-600', label: 'Brute (L)' },
              ].map(({ icon, color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`${color} w-4 text-center`}>{icon}</span>
                  <span className="text-gray-500">{label}</span>
                </div>
              ))}
              <div className="border-t border-gray-800 pt-2 mt-2 space-y-1.5">
                {[
                  { color: '#f97316', label: 'Tower beam' },
                  { color: '#fbbf24', label: 'Player atk' },
                  { color: '#86efac', label: 'Squad atk' },
                  { color: '#38bdf8', label: 'Ice slow' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-5 h-0.5 rounded flex-shrink-0" style={{ background: color }} />
                    <span className="text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Towers */}
          <div className="bg-[#161b22] border border-gray-800/80 rounded-xl p-3">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2.5 font-bold">
              Towers <span className="text-gray-700 normal-case">({activeTowers.length}/{towers.length})</span>
            </p>
            {towers.length === 0
              ? <p className="text-[11px] text-gray-600">No placements</p>
              : (
                <div className="space-y-1.5">
                  {towers.map(t => (
                    <div key={t.id} className={`flex items-center gap-2 ${t.active ? '' : 'opacity-40'}`}>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="text-[11px] text-gray-400 truncate flex-1">{t.name}</span>
                      {t.active
                        ? <span className="text-[10px] text-gray-600 stat-num flex-shrink-0">{Math.round(t.dps)}</span>
                        : <span className="text-[9px] text-red-500 flex-shrink-0">after W{t.unlockWave}🔒</span>
                      }
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Squad stats */}
          {data.squad && (
            <div className="bg-[#161b22] border border-gray-800/80 rounded-xl p-3">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2.5 font-bold">Squad</p>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-600">Player DPS</span>
                  <span className="text-yellow-400 stat-num">{data.squad.player_dps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Range</span>
                  <span className="text-blue-400 stat-num">{data.squad.player_range}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Companions</span>
                  <span className="text-green-400 stat-num">{data.squad.companion_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Comp DPS</span>
                  <span className="text-green-400 stat-num">{data.squad.companion_dps}</span>
                </div>
              </div>
            </div>
          )}

          {/* Wave summary */}
          {data.waves[selectedWave] && (
            <div className="bg-[#161b22] border border-gray-800/80 rounded-xl p-3">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2 font-bold">
                Wave {data.waves[selectedWave].wave_number}
              </p>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-600">👾 Spawn from</span>
                  <span className="text-red-400 stat-num">
                    {spawnerInfo ? `ZB W${spawnerInfo.blocker.unlock_after_wave}` : 'Path start'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Spawn dist</span>
                  <span className="text-gray-500 stat-num">{Math.round(spawnerDist)}u</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active towers</span>
                  <span className="text-green-400 stat-num">{activeTowers.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Enemies</span>
                  <span className="text-gray-300 stat-num">{spawnTotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pre-delay</span>
                  <span className="text-gray-300 stat-num">{waveDelay}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Killed</span>
                  <span className="text-orange-400 stat-num">{statKills}</span>
                </div>
              </div>
              {spawnTotal > 0 && (
                <div className="mt-2">
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full transition-all duration-300"
                      style={{ width: `${(statKills / spawnTotal) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-gray-600 mt-1 text-right">{Math.round((statKills / spawnTotal) * 100)}% killed</p>
                </div>
              )}
            </div>
          )}

          {/* Zone blockers status */}
          {zoneBlockers.length > 0 && (
            <div className={`bg-[#161b22] border rounded-xl p-3 ${raidWon ? 'border-yellow-500/60' : 'border-gray-800/80'}`}>
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2 font-bold">
                Zone Blockers {raidWon && <span className="text-yellow-400">🏆</span>}
              </p>
              <div className="space-y-1.5">
                {zoneBlockers.map((b, i) => {
                  const locked = b.unlock_after_wave >= waveNumber
                  const isFinal = finalZbWave !== null && b.unlock_after_wave === finalZbWave
                  return (
                    <div key={b.id || i} className={`flex items-center gap-2 text-[11px] ${locked ? '' : 'opacity-40'}`}>
                      <span>{isFinal ? '🏆' : locked ? '⛔' : '✅'}</span>
                      <span className={
                        isFinal && locked ? 'text-yellow-400 font-bold' :
                        locked ? 'text-red-400' : 'text-green-600 line-through'
                      }>
                        {isFinal ? 'WIN · W' : 'Clears W'}{b.unlock_after_wave}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

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

function pathDistAtNode(nodeIdx, nodes) {
  let dist = 0
  for (let i = 0; i < Math.min(nodeIdx, nodes.length - 1); i++) {
    dist += segLen(nodes[i], nodes[i + 1])
  }
  return dist
}

function getActiveSpawner(zoneBlockers, waveNumber, pathNodes) {
  const locked = zoneBlockers.filter(b => b.unlock_after_wave >= waveNumber)
  if (!locked.length) return null
  locked.sort((a, b) => a.unlock_after_wave - b.unlock_after_wave)
  const active = locked[0]
  const nodeIdx = active.node_index ?? 0
  const dist = pathDistAtNode(nodeIdx, pathNodes)
  return { blocker: active, pathDist: dist, pos: pathNodes[nodeIdx] || pointAtDist(dist, pathNodes) }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const EFFECT_COLORS = { Shell: '#f97316', Electro: '#a78bfa', Ice: '#38bdf8', Fire: '#ef4444', None: '#22c55e' }
const ENEMY_SIZE_R  = { Small: 7, Medium: 10, Large: 14 }
const FIRE_COOLDOWN = 0.4
const SQUAD_COOLDOWN = 0.5
// [build, lv0→1, lv1→2, lv2→3]  cost = base_cost * mult
const UPGRADE_COST_MULTS = [1, 0.6, 1.0, 1.8]

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
    currencyDrop: et.currency_drop || 0,
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

function slotUnlockWave(s) {
  return s.unlock_after_wave ?? s.unlock_wave ?? 0
}

// Build a single tower object from slot + towerType
function buildTowerObj(slot, tt, upgradeLevel, waveNumber, availableSlotIds) {
  const upgLevel = upgradeLevel || 0
  let dpsMults, rangeMults
  try { dpsMults = JSON.parse(tt.upgrade_dps_mults) } catch { dpsMults = [1, 1.6, 2.5, 4] }
  try { rangeMults = JSON.parse(tt.upgrade_range_mults) } catch { rangeMults = [1, 1.15, 1.3, 1.5] }
  return {
    id: `${slot.id}_${tt.id}`,
    slotId: slot.id,
    x: slot.x,
    y: slot.y,
    unlockWave: slotUnlockWave(slot),
    active: availableSlotIds.has(slot.id),
    name: tt.name,
    category: tt.category,
    effectType: tt.effect_type,
    dps: tt.base_dps * (dpsMults[upgLevel] ?? 1),
    range: tt.base_range * (rangeMults[upgLevel] ?? 1),
    color: tt.color || EFFECT_COLORS[tt.effect_type] || '#f97316',
    slowFactor: tt.slow_factor || 0,
    boostMult: tt.boost_mult || 1,
    upgradeLevel: upgLevel,
  }
}

// Build all towers from playerBuilt map {slotId: {towerTypeId, upgradeLevel}}
function buildTowers(playerBuilt, towerTypesMap, slots, waveNumber) {
  const availableSlotIds = new Set(
    slots.filter(s => slotUnlockWave(s) < waveNumber).map(s => s.id)
  )
  return Object.entries(playerBuilt).map(([slotId, { towerTypeId, upgradeLevel }]) => {
    const slot = slots.find(s => s.id === slotId)
    const tt = towerTypesMap[towerTypeId]
    if (!slot || !tt) return null
    return buildTowerObj(slot, tt, upgradeLevel, waveNumber, availableSlotIds)
  }).filter(Boolean)
}

// Tower upgrade cost
function towerUpgradeCost(tt, fromLevel) {
  let mults
  try { mults = JSON.parse(tt.upgrade_costs) } catch { mults = UPGRADE_COST_MULTS }
  return Math.round(tt.base_cost * (mults[fromLevel + 1] ?? 2))
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SimulationPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading]   = useState(true)
  const [data, setData]         = useState(null)
  const [selectedWave, setSelectedWave] = useState(0)
  const [speed, setSpeed]       = useState(1)
  const [running, setRunning]   = useState(false)
  const [tick, setTick]         = useState(0)

  // ── Player game state ─────────────────────────────────────────────────────
  // { slotId: { towerTypeId, upgradeLevel } }
  const [playerBuilt, setPlayerBuilt]       = useState({})
  const [playerCurrency, setPlayerCurrency] = useState(0)
  const [selectedSlotId, setSelectedSlotId] = useState(null)

  // Stats synced from sim
  const [statTransportHp, setStatTransportHp] = useState(null)
  const [statKills, setStatKills]   = useState(0)
  const [raidWon, setRaidWon]       = useState(false)
  const [statElapsed, setStatElapsed] = useState(0)
  const [statPhase, setStatPhase]   = useState('idle')

  const simRef      = useRef(null)
  const rafRef      = useRef(null)
  const lastTsRef   = useRef(null)
  const speedRef    = useRef(1)
  speedRef.current  = speed

  // Track currency in a ref for sync access inside RAF loop
  const currencyRef = useRef(0)

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
        const startCurr = level.starting_currency || 0
        setPlayerCurrency(startCurr)
        currencyRef.current = startCurr
        setPlayerBuilt({})
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

  // Towers derived from player's choices (not from editor placements)
  const towers = useMemo(() => {
    if (!data) return []
    return buildTowers(playerBuilt, towerTypesMap, towerSlots, waveNumber)
  }, [playerBuilt, towerTypesMap, towerSlots, waveNumber])

  const allSlots = useMemo(() => {
    if (!data) return []
    return towerSlots.map(s => ({
      ...s,
      active: slotUnlockWave(s) < waveNumber,
    }))
  }, [towerSlots, waveNumber])

  const activeTowers = useMemo(() => towers.filter(t => t.active), [towers])

  const finalZbWave = zoneBlockers.length > 0
    ? Math.max(...zoneBlockers.map(b => b.unlock_after_wave))
    : null

  const spawnerInfo = useMemo(
    () => getActiveSpawner(zoneBlockers, waveNumber, pathNodes),
    [zoneBlockers, waveNumber, pathNodes]
  )
  const spawnerDist     = spawnerInfo?.pathDist ?? 0
  const playerAnchorDist = Math.min(pathLen - 10, spawnerDist + 40)

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetSim = useCallback(() => {
    if (!data) return
    const wave = data.waves[selectedWave]
    if (!wave) return
    const sq = data.squad
    const startCurr = data.level.starting_currency || 0
    currencyRef.current = startCurr
    setPlayerCurrency(startCurr)
    setPlayerBuilt({})
    setSelectedSlotId(null)

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
      currency: startCurr,
      activeTowers: [],   // starts empty — player builds
      towerCooldowns: {},
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
  }, [data, selectedWave, enemyMap, spawnerDist, playerAnchorDist])

  useEffect(() => {
    resetSim()
    setRunning(false)
  }, [resetSim])

  // ── Build / Upgrade / Sell ─────────────────────────────────────────────────
  const handleBuild = useCallback((slotId, towerTypeId) => {
    const tt = towerTypesMap[towerTypeId]
    if (!tt) return
    const cost = tt.base_cost
    if (currencyRef.current < cost) return

    currencyRef.current -= cost
    setPlayerCurrency(Math.round(currencyRef.current))

    // Update React state (triggers towers re-render)
    setPlayerBuilt(prev => ({ ...prev, [slotId]: { towerTypeId, upgradeLevel: 0 } }))

    // Also update running sim immediately
    if (simRef.current) {
      simRef.current.currency = currencyRef.current
      const slot = towerSlots.find(s => s.id === slotId)
      if (slot && slotUnlockWave(slot) < waveNumber) {
        const availIds = new Set(towerSlots.filter(s => slotUnlockWave(s) < waveNumber).map(s => s.id))
        const twObj = buildTowerObj(slot, tt, 0, waveNumber, availIds)
        if (twObj.active) {
          simRef.current.activeTowers = simRef.current.activeTowers.filter(t => t.slotId !== slotId)
          simRef.current.activeTowers.push(twObj)
          simRef.current.towerCooldowns[twObj.id] = FIRE_COOLDOWN * Math.random()
          // float currency earn notification
          simRef.current.damageNums.push({
            x: slot.x, y: slot.y - 30,
            val: `-${cost}💰`, life: 1.2, color: '#fbbf24', drift: 0,
          })
        }
      }
    }
  }, [towerTypesMap, towerSlots, waveNumber])

  const handleUpgrade = useCallback((slotId) => {
    setPlayerBuilt(prev => {
      const cur = prev[slotId]
      if (!cur) return prev
      const tt = towerTypesMap[cur.towerTypeId]
      if (!tt || cur.upgradeLevel >= 3) return prev
      const cost = towerUpgradeCost(tt, cur.upgradeLevel)
      if (currencyRef.current < cost) return prev

      currencyRef.current -= cost
      setPlayerCurrency(Math.round(currencyRef.current))

      const newLevel = cur.upgradeLevel + 1
      const updated = { ...prev, [slotId]: { ...cur, upgradeLevel: newLevel } }

      // Update running sim immediately
      if (simRef.current) {
        simRef.current.currency = currencyRef.current
        const slot = towerSlots.find(s => s.id === slotId)
        const availIds = new Set(towerSlots.filter(s => slotUnlockWave(s) < waveNumber).map(s => s.id))
        if (slot) {
          const twObj = buildTowerObj(slot, tt, newLevel, waveNumber, availIds)
          simRef.current.activeTowers = simRef.current.activeTowers.filter(t => t.slotId !== slotId)
          if (twObj.active) {
            simRef.current.activeTowers.push(twObj)
            simRef.current.towerCooldowns[twObj.id] = simRef.current.towerCooldowns[twObj.id] ?? FIRE_COOLDOWN
          }
          // float upgrade notification
          simRef.current.damageNums.push({
            x: slot.x, y: slot.y - 30,
            val: `⬆ -${cost}💰`, life: 1.2, color: '#a78bfa', drift: 0,
          })
        }
      }
      return updated
    })
  }, [towerTypesMap, towerSlots, waveNumber])

  const handleSell = useCallback((slotId) => {
    const cur = playerBuilt[slotId]
    if (!cur) return
    const tt = towerTypesMap[cur.towerTypeId]
    if (!tt) return
    // Sell = 50% of build cost + 25% of upgrade costs spent
    let sellVal = Math.round(tt.base_cost * 0.5)
    for (let lv = 0; lv < cur.upgradeLevel; lv++) {
      sellVal += Math.round(towerUpgradeCost(tt, lv) * 0.25)
    }
    currencyRef.current += sellVal
    setPlayerCurrency(Math.round(currencyRef.current))

    if (simRef.current) {
      simRef.current.currency = currencyRef.current
      simRef.current.activeTowers = simRef.current.activeTowers.filter(t => t.slotId !== slotId)
      const slot = towerSlots.find(s => s.id === slotId)
      if (slot) {
        simRef.current.damageNums.push({
          x: slot.x, y: slot.y - 30,
          val: `+${sellVal}💰`, life: 1.2, color: '#22c55e', drift: 0,
        })
      }
    }

    setPlayerBuilt(prev => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
    setSelectedSlotId(null)
  }, [playerBuilt, towerTypesMap, towerSlots])

  // ── Simulation step ────────────────────────────────────────────────────────
  const step = useCallback((rawDt) => {
    const sim = simRef.current
    if (!sim || sim.phase === 'done') return

    const dt = Math.min(rawDt * speedRef.current, 0.15)
    sim.time += dt

    // Spawn
    while (sim.spawnIdx < sim.spawnQueue.length && sim.spawnQueue[sim.spawnIdx].time <= sim.time) {
      const ev = sim.spawnQueue[sim.spawnIdx++]
      const et = enemyMap[ev.typeId]
      if (et) {
        const e = makeEnemy(et, sim.spawnerDist - 5 - (Math.random() * 8))
        sim.enemies.push(e)
      }
    }

    // Decay visuals
    sim.beams = sim.beams.filter(b => { b.life -= dt; return b.life > 0 })
    sim.damageNums = sim.damageNums.filter(d => {
      d.life -= dt
      d.y -= 28 * dt
      d.x += (d.drift || 0) * dt
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

    const aliveEnemies = sim.enemies.filter(e => e.alive && !e.dying && e.pathDist >= sim.spawnerDist - 5)

    // Tower attacks — uses sim.activeTowers (mutable, updated by build actions)
    for (const tower of sim.activeTowers) {
      sim.towerCooldowns[tower.id] = (sim.towerCooldowns[tower.id] ?? 0) - dt
      if (sim.towerCooldowns[tower.id] > 0) continue
      if (tower.category === 'Support') continue

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
        val: Math.round(dmg), life: 0.65,
        color: tower.color, drift: (Math.random() - 0.5) * 20,
      })

      if (target.hp <= 0 && !target.dying) {
        target.dying = true
        target.dyingTimer = 0.35
        sim.kills++
        sim.currency = (sim.currency || 0) + target.currencyDrop
        sim.damageNums.push({ x: pos.x, y: pos.y - target.r - 12, val: `+${target.currencyDrop}💰`, life: 0.7, color: '#fbbf24', drift: 0 })
        sim.damageNums.push({ x: pos.x, y: pos.y - target.r - 24, val: '✕', life: 0.5, color: '#fb923c', drift: 0 })
      }
    }

    // Player + squad
    const sq = sim.squad
    if (aliveEnemies.length > 0) {
      const nearSpawner = aliveEnemies.reduce((best, e) => {
        const d = Math.abs(e.pathDist - sim.spawnerDist)
        return d < best.d ? { e, d } : best
      }, { e: null, d: Infinity })
      const targetDist = nearSpawner.e
        ? Math.min(sim.playerAnchorDist + 20, nearSpawner.e.pathDist + 15)
        : sim.playerAnchorDist
      sim.playerDist += (targetDist - sim.playerDist) * Math.min(1, dt * 4)

      sim.playerCooldown -= dt
      if (sim.playerCooldown <= 0 && sq) {
        sim.playerCooldown = SQUAD_COOLDOWN
        const pPos = pointAtDist(Math.max(0, sim.playerDist), pathNodes)
        const pRange = sq.player_range ?? 80

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
          if (nearestE.hp <= 0 && !nearestE.dying) {
            nearestE.dying = true; nearestE.dyingTimer = 0.35; sim.kills++
            sim.currency = (sim.currency || 0) + nearestE.currencyDrop
          }
        }

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
            if (bestE.hp <= 0 && !bestE.dying) {
              bestE.dying = true; bestE.dyingTimer = 0.35; sim.kills++
              sim.currency = (sim.currency || 0) + bestE.currencyDrop
            }
          }
        }
      }
    }

    // Phase
    const allSpawned = sim.spawnIdx >= sim.spawnQueue.length
    const anyAlive   = aliveEnemies.length > 0 || sim.enemies.some(e => e.dying)
    sim.phase = allSpawned && !anyAlive ? 'done'
      : sim.time < (data.waves[selectedWave]?.pre_wave_delay || 3) ? 'waiting'
      : 'active'

    // Sync currency to React state + ref
    currencyRef.current = sim.currency || 0
    setPlayerCurrency(Math.round(currencyRef.current))

    // Win condition
    const fbWave  = zoneBlockers.length > 0 ? Math.max(...zoneBlockers.map(b => b.unlock_after_wave)) : null
    const isLastW = !data.waves[selectedWave + 1]
    const isWinW  = fbWave !== null && waveNumber === fbWave
    if (sim.phase === 'done' && (isWinW || isLastW)) setRaidWon(true)

    setStatTransportHp(Math.round(sim.transportHp))
    setStatKills(sim.kills)
    setStatElapsed(sim.time)
    setStatPhase(sim.phase)
    setTick(t => t + 1)
  }, [data, enemyMap, pathNodes, pathLen, selectedWave, zoneBlockers, waveNumber])

  // ── RAF loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); lastTsRef.current = null; return }
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
  const tHpPct         = statTransportHp !== null ? Math.max(0, statTransportHp / transportMaxHp) : 1
  const pathPts        = pathNodes.map(n => `${n.x},${n.y}`).join(' ')
  const waveDelay      = data.waves[selectedWave]?.pre_wave_delay || 3
  const countdownSec   = Math.max(0, waveDelay - statElapsed).toFixed(1)
  const spawnTotal     = sim?.spawnQueue?.length || 0

  const phaseConfig = {
    idle:    { label: 'Ready', color: 'text-gray-500' },
    waiting: { label: `Wave in ${countdownSec}s`, color: 'text-yellow-400' },
    active:  { label: 'Wave active!', color: 'text-green-400' },
    done:    { label: 'Wave done!', color: 'text-orange-400' },
  }
  const { label: phaseLabel, color: phaseColor } = phaseConfig[statPhase] || phaseConfig.idle

  // Selected slot info for build panel
  const selSlot   = selectedSlotId ? towerSlots.find(s => s.id === selectedSlotId) : null
  const selBuilt  = selectedSlotId ? playerBuilt[selectedSlotId] : null
  const selTT     = selBuilt ? towerTypesMap[selBuilt.towerTypeId] : null
  const slotUnlocked = selSlot ? (slotUnlockWave(selSlot) < waveNumber) : false

  // Available tower types sorted by cost (for build panel)
  const sortedTTs = data.tts ? [...data.tts].sort((a, b) => a.base_cost - b.base_cost) : []

  // DPS mults helper for display
  function ttDpsAtLevel(tt, lv) {
    let m; try { m = JSON.parse(tt.upgrade_dps_mults) } catch { m = [1,1.6,2.5,4] }
    return Math.round(tt.base_dps * (m[lv] ?? 1))
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-800/80 bg-[#161b22] flex-shrink-0 flex-wrap">

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
        </div>

        <div className="flex-1" />

        {/* 💰 Currency */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 rounded-lg border border-yellow-500/25 flex-shrink-0">
          <span className="text-sm">💰</span>
          <span className="text-sm font-bold text-yellow-300 stat-num">{playerCurrency}</span>
        </div>

        {/* Transport HP */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">🚌</span>
          <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
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
                resetSim(); setTimeout(() => setRunning(true), 30)
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
            title="Full reset">
            ↺
          </button>
        </div>
      </div>

      {/* ── Canvas + sidebar ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-5 gap-4">

        {/* SVG canvas */}
        <div className="bg-[#161b22] border border-gray-800/80 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0">
          <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
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

            {/* Path */}
            {pathNodes.length >= 2 && (
              <>
                <polyline points={pathPts} fill="none" stroke="#0f2744" strokeWidth={34} strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={pathPts} fill="none" stroke="#1e3a8a" strokeWidth={22} strokeLinejoin="round" strokeLinecap="round" opacity={0.5} />
                <polyline points={pathPts} fill="none" stroke="#3b82f6" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" opacity={0.3} />
                <polyline points={pathPts} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.6} strokeDasharray="14 7" />
              </>
            )}

            {/* Clickable tower slots */}
            {allSlots.map(s => {
              const built = playerBuilt[s.id]
              const isSelected = selectedSlotId === s.id
              if (built) return null   // tower renders separately
              return (
                <g key={`slot_${s.id}`}
                  opacity={s.active ? 1 : 0.3}
                  style={{ cursor: s.active ? 'pointer' : 'default' }}
                  onClick={() => s.active && setSelectedSlotId(isSelected ? null : s.id)}>
                  {/* Selection highlight */}
                  {isSelected && <circle cx={s.x} cy={s.y} r={28} fill="#fbbf2420" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 3" />}
                  <circle cx={s.x} cy={s.y} r={20} fill={isSelected ? '#fbbf2415' : '#4b556320'}
                    stroke={isSelected ? '#fbbf24' : s.active ? '#6b7280' : '#374151'}
                    strokeWidth={1.5} strokeDasharray={s.active ? 'none' : '4 3'} />
                  <text x={s.x} y={s.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={14} fill={s.active ? '#9ca3af' : '#4b5563'}>
                    {s.active ? '+' : '🔒'}
                  </text>
                  {s.active && (
                    <rect x={s.x - 18} y={s.y + 22} width={36} height={11} rx={3} fill="#0d1117cc" stroke="#fbbf2430" strokeWidth={1} />
                  )}
                  {s.active && (
                    <text x={s.x} y={s.y + 28} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#fbbf24">BUILD</text>
                  )}
                  {!s.active && (
                    <text x={s.x} y={s.y + 28} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#6b7280">W{slotUnlockWave(s)}</text>
                  )}
                </g>
              )
            })}

            {/* Tower range halos — active built towers */}
            {towers.filter(t => t.active).map(t => (
              <circle key={`rh_${t.id}`} cx={t.x} cy={t.y} r={t.range}
                fill={`url(#rg_${t.id})`} stroke={t.color + '20'} strokeWidth={1} />
            ))}

            {/* Built towers — clickable */}
            {towers.map(t => {
              const isSelected = selectedSlotId === t.slotId
              const upgLv = t.upgradeLevel || 0
              return (
                <g key={`tw_${t.id}`} opacity={t.active ? 1 : 0.25}
                  style={{ cursor: t.active ? 'pointer' : 'default' }}
                  onClick={() => t.active && setSelectedSlotId(isSelected ? null : t.slotId)}>
                  {/* Selection ring */}
                  {isSelected && <circle cx={t.x} cy={t.y} r={28} fill="#a78bfa20" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 3" />}
                  {/* Lock badge for wave-locked towers */}
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
                  {/* Upgrade level dots */}
                  {t.active && upgLv > 0 && (
                    <g>
                      {Array.from({length: upgLv}).map((_, di) => (
                        <circle key={di} cx={t.x - 6 + di * 6} cy={t.y + 16} r={2.5} fill="#fbbf24" />
                      ))}
                    </g>
                  )}
                  <title>{t.name} Lv{upgLv} · {t.dps.toFixed(0)} DPS · range {t.range}</title>
                </g>
              )
            })}

            {/* Zone blockers */}
            {zoneBlockers.map((b, i) => {
              const pos = b.x !== undefined ? { x: b.x, y: b.y } : pathNodes[b.node_index]
              if (!pos) return null
              const locked = b.unlock_after_wave >= waveNumber
              if (!locked) return null
              const isActiveSpawner = spawnerInfo?.blocker?.id === b.id || spawnerInfo?.blocker === b
              const isFinal = finalZbWave !== null && b.unlock_after_wave === finalZbWave
              const barFill   = isFinal ? '#78350f' : isActiveSpawner ? '#991b1b' : '#7f1d1d'
              const barStroke = isFinal ? '#fbbf24' : isActiveSpawner ? '#ef4444' : '#dc2626'
              const barSW     = isFinal ? 2.5 : isActiveSpawner ? 2 : 1.5
              const textFill  = isFinal ? '#fde68a' : '#fca5a5'
              return (
                <g key={b.id || i}>
                  {(isActiveSpawner || isFinal) && (
                    <circle cx={pos.x} cy={pos.y} r={42}
                      fill={isFinal ? '#fbbf2410' : '#dc262618'}
                      stroke={isFinal ? '#fbbf2460' : '#dc262650'}
                      strokeWidth={isFinal ? 2.5 : 2} />
                  )}
                  {isFinal && (
                    <circle cx={pos.x} cy={pos.y} r={52}
                      fill="none" stroke="#fbbf2430" strokeWidth={1.5} strokeDasharray="6 4" />
                  )}
                  <rect x={pos.x - 32} y={pos.y - 10} width={64} height={20} rx={5}
                    fill={barFill} fillOpacity={0.92} stroke={barStroke} strokeWidth={barSW} />
                  <rect x={pos.x - 32} y={pos.y - 10} width={64} height={20} rx={5}
                    fill="url(#blocker_stripes)" fillOpacity={isFinal ? 0.15 : 0.3} />
                  <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fontWeight="bold" fill={textFill}>
                    {isFinal ? '🏆 FINAL' : isActiveSpawner ? '👾 SPAWN' : `⛔ W${b.unlock_after_wave}`}
                  </text>
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

            {/* Spawn point when all ZBs open */}
            {!spawnerInfo && pathNodes.length >= 2 && (
              <g>
                <circle cx={pathNodes[0].x} cy={pathNodes[0].y} r={16} fill="#dc262620" stroke="#ef4444" strokeWidth={2} />
                <text x={pathNodes[0].x} y={pathNodes[0].y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#ef4444" fontWeight="bold">👾</text>
              </g>
            )}

            {/* Transport */}
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
              return (
                <g key={e.id} opacity={alpha} transform={`translate(${pos.x},${pos.y})`}>
                  {e.slowTimer > 0 && <circle r={e.r + 5} fill="none" stroke="#38bdf8" strokeWidth={1.5} opacity={0.5} strokeDasharray="4 3" />}
                  {e.dying && <circle r={e.r * scale + 8} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={alpha * 0.6} />}
                  <circle r={e.r * scale} fill={e.color + 'dd'} stroke={e.color} strokeWidth={1.5} />
                  <text textAnchor="middle" dominantBaseline="middle"
                    fontSize={e.size === 'Large' ? 12 : e.size === 'Small' ? 8 : 10}
                    fill="white" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                    {e.size === 'Small' ? '◆' : e.size === 'Large' ? '▲' : '●'}
                  </text>
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
              const pd   = Math.max(0, Math.min(sim.playerDist, pathLen - 0.5))
              const pPos = pointAtDist(pd, pathNodes)
              return (
                <g>
                  {sim.companionOffsets.map((offset, ci) => {
                    const cd   = Math.max(0, Math.min(pd + offset, pathLen - 0.5))
                    const cPos = pointAtDist(cd, pathNodes)
                    return (
                      <g key={ci} transform={`translate(${cPos.x},${cPos.y})`}>
                        <circle r={7} fill="#14532d60" stroke="#86efac" strokeWidth={1.5} />
                        <text textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#86efac" style={{ pointerEvents: 'none' }}>★</text>
                      </g>
                    )
                  })}
                  <g transform={`translate(${pPos.x},${pPos.y})`}>
                    <circle r={13} fill="#78350f40" stroke="#fbbf24" strokeWidth={2} />
                    <circle r={8} fill="#fbbf24aa" />
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="white" fontWeight="bold" style={{ pointerEvents: 'none' }}>P</text>
                  </g>
                </g>
              )
            })()}

            {/* Damage / currency floats */}
            {sim?.damageNums.map((d, i) => (
              <text key={i} x={d.x} y={d.y} textAnchor="middle"
                fontSize={typeof d.val === 'string' ? (d.val.includes('💰') ? 11 : 14) : 12}
                fontWeight="bold" fill={d.color}
                opacity={Math.min(1, d.life * 1.8)}
                style={{ fontFamily: 'Space Grotesk, monospace', pointerEvents: 'none' }}>
                {typeof d.val === 'string' ? d.val : `-${d.val}`}
              </text>
            ))}

            {/* Countdown overlay */}
            {statPhase === 'waiting' && (
              <g>
                <rect x={SVG_W / 2 - 90} y={SVG_H / 2 - 28} width={180} height={56} rx={12}
                  fill="#0d1117cc" stroke="#374151" strokeWidth={1} />
                <text x={SVG_W / 2} y={SVG_H / 2 - 6} textAnchor="middle" fontSize={12} fill="#6b7280">Wave starts in</text>
                <text x={SVG_W / 2} y={SVG_H / 2 + 16} textAnchor="middle" fontSize={22} fontWeight="bold" fill="#fbbf24"
                  style={{ fontFamily: 'Space Grotesk, monospace' }}>{countdownSec}s</text>
              </g>
            )}

            {/* Win overlay */}
            {raidWon && (
              <g>
                <rect width={SVG_W} height={SVG_H} fill="#000000aa" />
                <rect x={SVG_W / 2 - 160} y={SVG_H / 2 - 70} width={320} height={140} rx={18} fill="#0d1117" stroke="#fbbf24" strokeWidth={2.5} />
                <rect x={SVG_W / 2 - 160} y={SVG_H / 2 - 70} width={320} height={8} rx={4} fill="#fbbf24" />
                <text x={SVG_W / 2} y={SVG_H / 2 - 28} textAnchor="middle" fontSize={40} style={{ fontFamily: 'system-ui' }}>🏆</text>
                <text x={SVG_W / 2} y={SVG_H / 2 + 16} textAnchor="middle" fontSize={26} fontWeight="bold" fill="#fbbf24"
                  style={{ fontFamily: 'Space Grotesk, monospace', letterSpacing: '0.08em' }}>RAID CLEARED</text>
                <text x={SVG_W / 2} y={SVG_H / 2 + 44} textAnchor="middle" fontSize={12} fill="#d97706"
                  style={{ fontFamily: 'Space Grotesk, monospace' }}>Final zone blocker reached — victory!</text>
              </g>
            )}
          </svg>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 w-56 flex-shrink-0">

          {/* ── Build / Upgrade panel ──────────────────────────────────────── */}
          {selectedSlotId && (
            <div className="bg-[#161b22] border border-gray-700/80 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-800">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                  {selBuilt ? `Slot · ${selTT?.name || '?'} Lv${selBuilt.upgradeLevel}` : `Slot · Build Tower`}
                </p>
                <button onClick={() => setSelectedSlotId(null)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
              </div>

              {!slotUnlocked ? (
                <div className="px-3 py-3 text-center">
                  <p className="text-xs text-gray-600">🔒 Unlocks after wave {selSlot ? slotUnlockWave(selSlot) : '?'}</p>
                </div>
              ) : selBuilt && selTT ? (
                /* ── UPGRADE / SELL panel ─────────────────────────────────── */
                <div className="px-3 py-3 space-y-3">
                  {/* Current stats */}
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="bg-gray-900/60 rounded-lg p-2 text-center">
                      <p className="text-gray-600 text-[9px]">DPS</p>
                      <p className="text-orange-400 font-bold stat-num">{ttDpsAtLevel(selTT, selBuilt.upgradeLevel)}</p>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-2 text-center">
                      <p className="text-gray-600 text-[9px]">TYPE</p>
                      <p className="font-bold" style={{ color: EFFECT_COLORS[selTT.effect_type] || '#9ca3af' }}>{selTT.effect_type}</p>
                    </div>
                  </div>
                  {/* Level bar */}
                  <div className="flex items-center gap-1.5">
                    {[0,1,2,3].map(lv => (
                      <div key={lv} className={`flex-1 h-1.5 rounded-full ${lv <= selBuilt.upgradeLevel ? 'bg-yellow-400' : 'bg-gray-700'}`} />
                    ))}
                    <span className="text-[10px] text-gray-500 ml-1">Lv{selBuilt.upgradeLevel}</span>
                  </div>
                  {/* Upgrade button */}
                  {selBuilt.upgradeLevel < 3 ? (() => {
                    const uCost = towerUpgradeCost(selTT, selBuilt.upgradeLevel)
                    const canAff = playerCurrency >= uCost
                    const nextDps = ttDpsAtLevel(selTT, selBuilt.upgradeLevel + 1)
                    return (
                      <button
                        onClick={() => handleUpgrade(selectedSlotId)}
                        disabled={!canAff}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all border ${
                          canAff
                            ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30'
                            : 'bg-gray-800/40 border-gray-700 text-gray-600 cursor-not-allowed'
                        }`}>
                        <span>⬆ Upgrade to Lv{selBuilt.upgradeLevel + 1}</span>
                        <span className="ml-2 font-normal">{uCost}💰</span>
                        <span className={`ml-2 text-[10px] ${canAff ? 'text-orange-400' : 'text-gray-600'}`}>→{nextDps} DPS</span>
                      </button>
                    )
                  })() : (
                    <div className="text-center text-[11px] text-yellow-400 font-bold py-1">✓ MAX LEVEL</div>
                  )}
                  {/* Sell button */}
                  {(() => {
                    let sv = Math.round(selTT.base_cost * 0.5)
                    for (let lv = 0; lv < selBuilt.upgradeLevel; lv++) sv += Math.round(towerUpgradeCost(selTT, lv) * 0.25)
                    return (
                      <button onClick={() => handleSell(selectedSlotId)}
                        className="w-full py-1.5 rounded-xl text-xs text-gray-500 border border-gray-800 hover:bg-red-900/20 hover:text-red-400 hover:border-red-800 transition-all">
                        Sell +{sv}💰
                      </button>
                    )
                  })()}
                </div>
              ) : (
                /* ── BUILD panel — pick tower type ───────────────────────── */
                <div className="py-1 max-h-72 overflow-y-auto">
                  {sortedTTs.map(tt => {
                    const canAff = playerCurrency >= tt.base_cost
                    const isBuilt = Object.values(playerBuilt).some(b => b.towerTypeId === tt.id)
                    return (
                      <button key={tt.id}
                        onClick={() => canAff && handleBuild(selectedSlotId, tt.id)}
                        disabled={!canAff}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all border-b border-gray-800/60 last:border-0 ${
                          canAff ? 'hover:bg-gray-800/60 cursor-pointer' : 'opacity-40 cursor-not-allowed'
                        }`}>
                        {/* Color dot */}
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tt.color || '#f97316' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-200 truncate">{tt.name}</span>
                            <span className={`text-[10px] font-bold ml-1 flex-shrink-0 ${canAff ? 'text-yellow-400' : 'text-gray-600'}`}>{tt.base_cost}💰</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-gray-600">{tt.base_dps} DPS</span>
                            <span className="text-[9px] text-gray-700">·</span>
                            <span className="text-[9px]" style={{ color: EFFECT_COLORS[tt.effect_type] || '#9ca3af' }}>{tt.effect_type}</span>
                            {isBuilt && <span className="text-[9px] text-blue-500">• in use</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Built towers summary */}
          <div className="bg-[#161b22] border border-gray-800/80 rounded-xl p-3">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2.5 font-bold">
              Towers <span className="text-gray-700 normal-case">({Object.keys(playerBuilt).length}/{towerSlots.length})</span>
            </p>
            {Object.keys(playerBuilt).length === 0 ? (
              <p className="text-[11px] text-gray-600">Click a slot on the map to build</p>
            ) : (
              <div className="space-y-1.5">
                {towers.map(t => (
                  <button key={t.id} onClick={() => setSelectedSlotId(t.slotId === selectedSlotId ? null : t.slotId)}
                    className={`w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 transition-all ${
                      selectedSlotId === t.slotId ? 'bg-purple-500/15 border border-purple-500/25' : 'hover:bg-gray-800/40 border border-transparent'
                    } ${!t.active ? 'opacity-40' : ''}`}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-[11px] text-gray-300 truncate flex-1">{t.name}</span>
                    {t.upgradeLevel > 0 && (
                      <span className="text-[9px] text-yellow-500 flex-shrink-0">Lv{t.upgradeLevel}</span>
                    )}
                    <span className="text-[10px] text-gray-600 stat-num flex-shrink-0">{Math.round(t.dps)}</span>
                  </button>
                ))}
              </div>
            )}
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

          {/* Wave info */}
          {data.waves[selectedWave] && (
            <div className="bg-[#161b22] border border-gray-800/80 rounded-xl p-3">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2 font-bold">
                Wave {data.waves[selectedWave].wave_number}
              </p>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-600">Enemies</span>
                  <span className="text-gray-300 stat-num">{spawnTotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Killed</span>
                  <span className="text-orange-400 stat-num">{statKills}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Spawn</span>
                  <span className="text-red-400 stat-num text-[10px]">
                    {spawnerInfo ? `ZB W${spawnerInfo.blocker.unlock_after_wave}` : 'Start'}
                  </span>
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

          {/* Zone blockers */}
          {zoneBlockers.length > 0 && (
            <div className={`bg-[#161b22] border rounded-xl p-3 ${raidWon ? 'border-yellow-500/60' : 'border-gray-800/80'}`}>
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2 font-bold">
                Zone Blockers {raidWon && <span className="text-yellow-400">🏆</span>}
              </p>
              <div className="space-y-1.5">
                {zoneBlockers.map((b, i) => {
                  const locked  = b.unlock_after_wave >= waveNumber
                  const isFinal = finalZbWave !== null && b.unlock_after_wave === finalZbWave
                  return (
                    <div key={b.id || i} className={`flex items-center gap-2 text-[11px] ${locked ? '' : 'opacity-40'}`}>
                      <span>{isFinal ? '🏆' : locked ? '⛔' : '✅'}</span>
                      <span className={isFinal && locked ? 'text-yellow-400 font-bold' : locked ? 'text-red-400' : 'text-green-600 line-through'}>
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

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react'

const SVG_W = 900
const SVG_H = 620

const MODES = { SELECT: 'SELECT', PATH: 'PATH', SLOT: 'SLOT', BLOCKER: 'BLOCKER', DELETE: 'DELETE' }
const MODE_META = {
  SELECT:  { icon: '↖', label: 'Select / Drag', color: 'text-blue-400',   key: '1' },
  PATH:    { icon: '●', label: 'Path Node',      color: 'text-cyan-400',   key: '2' },
  SLOT:    { icon: '⬛', label: 'Tower Slot',     color: 'text-orange-400', key: '3' },
  BLOCKER: { icon: '⛔', label: 'Zone Blocker',   color: 'text-red-400',    key: '4' },
  DELETE:  { icon: '✕',  label: 'Delete',         color: 'text-gray-400',   key: '5' },
}

const SNAP_GRID = 10   // snap unit in SVG pixels
function snapPt(pt, snap) {
  if (!snap) return pt
  return { x: Math.round(pt.x / SNAP_GRID) * SNAP_GRID, y: Math.round(pt.y / SNAP_GRID) * SNAP_GRID }
}

const EFFECT_COLORS = { Shell:'#f97316', Electro:'#a78bfa', Ice:'#38bdf8', Fire:'#ef4444', None:'#22c55e', default:'#f97316' }
const CATEGORY_FILL  = { Attack:'rgba(249,115,22,', Debuff:'rgba(56,189,248,', Support:'rgba(34,197,94,' }

function uid() { return `s_${Math.random().toString(36).substr(2,8)}` }

// ── Path geometry helpers ───────────────────────────────────────────────────
function segLen(a, b) { return Math.hypot(b.x - a.x, b.y - a.y) }

function totalPathLen(nodes) {
  let t = 0
  for (let i = 1; i < nodes.length; i++) t += segLen(nodes[i-1], nodes[i])
  return t
}

// Point on segment closest to (px,py); returns {x,y,t,segDist,pathDist}
function closestOnPath(px, py, nodes) {
  if (nodes.length < 2) return null
  let best = null, bestD = Infinity, cumDist = 0
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i+1]
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx*dx + dy*dy
    let t = len2 > 0 ? Math.max(0, Math.min(1, ((px-a.x)*dx + (py-a.y)*dy) / len2)) : 0
    const cx = a.x + t*dx, cy = a.y + t*dy
    const d = Math.hypot(cx - px, cy - py)
    if (d < bestD) {
      bestD = d
      const segD = segLen(a, b)
      best = { x: cx, y: cy, t, segDist: bestD, pathDist: cumDist + t * segD }
    }
    cumDist += segLen(a, b)
  }
  return best
}

// Coverage interval on path for a tower at (tx,ty) with range r
function coverageInterval(tx, ty, range, nodes) {
  if (nodes.length < 2) return null
  let enter = null, exit = null, cumDist = 0
  const pathLen = totalPathLen(nodes)
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i+1]
    const seg = segLen(a, b)
    // Parameterise segment [0,1], find where dist to tower = range
    const dx = b.x - a.x, dy = b.y - a.y
    const fx = a.x - tx, fy = a.y - ty
    const A = dx*dx + dy*dy
    const B = 2*(fx*dx + fy*dy)
    const C = fx*fx + fy*fy - range*range
    const disc = B*B - 4*A*C
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      const t1 = (-B - sq) / (2*A)
      const t2 = (-B + sq) / (2*A)
      if (t1 <= 1 && t2 >= 0) {
        const d1 = cumDist + Math.max(0, t1) * seg
        const d2 = cumDist + Math.min(1, t2) * seg
        if (enter === null) enter = d1
        exit = d2
      }
    }
    cumDist += seg
  }
  if (enter === null) return null
  return { enter, exit, pct: Math.round(((exit - enter) / Math.max(1, pathLen)) * 100) }
}

// Sample a point at distance d along path
function pointAtDist(d, nodes) {
  let cum = 0
  for (let i = 0; i < nodes.length - 1; i++) {
    const seg = segLen(nodes[i], nodes[i+1])
    if (cum + seg >= d) {
      const t = (d - cum) / seg
      return { x: nodes[i].x + t*(nodes[i+1].x - nodes[i].x), y: nodes[i].y + t*(nodes[i+1].y - nodes[i].y) }
    }
    cum += seg
  }
  return nodes[nodes.length-1]
}

// ── Main component ──────────────────────────────────────────────────────────
export default function PathCanvas({ levelData, placements, towerTypes, onChange }) {
  const svgRef = useRef(null)
  const [mode, setMode] = useState(MODES.SELECT)
  const [selected, setSelected] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)  // { type, index }
  const [shiftHeld, setShiftHeld] = useState(false)

  // ── Undo/Redo history ──────────────────────────────────────────────────────
  const historyRef = useRef([])
  const histIdxRef = useRef(-1)

  const snapshot = useCallback(() => ({
    path_nodes:   levelData.path_nodes   || [],
    tower_slots:  levelData.tower_slots  || [],
    zone_blockers: levelData.zone_blockers || [],
  }), [levelData])

  const pushHistory = useCallback(() => {
    const snap = snapshot()
    const hist = historyRef.current
    hist.splice(histIdxRef.current + 1)   // discard redo states
    hist.push(snap)
    if (hist.length > 60) hist.shift()    // cap at 60 steps
    histIdxRef.current = hist.length - 1
  }, [snapshot])

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    const snap = historyRef.current[histIdxRef.current]
    onChange({ ...levelData, ...snap })
  }, [levelData, onChange])

  const redo = useCallback(() => {
    if (histIdxRef.current >= historyRef.current.length - 1) return
    histIdxRef.current++
    const snap = historyRef.current[histIdxRef.current]
    onChange({ ...levelData, ...snap })
  }, [levelData, onChange])

  // Push initial snapshot on mount
  useEffect(() => {
    if (historyRef.current.length === 0) {
      historyRef.current.push(snapshot())
      histIdxRef.current = 0
    }
  }, []) // eslint-disable-line

  // Derive data arrays early — needed by keyboard handler below
  const nodes   = levelData.path_nodes   || []
  const slots   = levelData.tower_slots  || []
  const blockers = levelData.zone_blockers || []

  // Keyboard shortcuts
  useEffect(() => {
    const modeKeys = { '1': MODES.SELECT, '2': MODES.PATH, '3': MODES.SLOT, '4': MODES.BLOCKER, '5': MODES.DELETE }

    const onDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      setShiftHeld(e.shiftKey)

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }

      // Mode shortcuts: 1-5
      if (modeKeys[e.key] && !e.metaKey && !e.ctrlKey) { setMode(modeKeys[e.key]); return }

      // Escape: deselect + back to SELECT
      if (e.key === 'Escape') { setSelected(null); setMode(MODES.SELECT); return }

      // Delete / Backspace: delete selected object
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
        setSelected(cur => {
          if (!cur) return cur
          pushHistory()
          if (cur.type === 'node') {
            onChange({ ...levelData, path_nodes: nodes.filter((_, i) => i !== cur.index) })
          } else if (cur.type === 'slot') {
            onChange({ ...levelData, tower_slots: slots.filter((_, i) => i !== cur.index) })
          } else if (cur.type === 'blocker') {
            onChange({ ...levelData, zone_blockers: blockers.filter((_, i) => i !== cur.index) })
          }
          return null
        })
        return
      }
    }
    const onUp = (e) => setShiftHeld(e.shiftKey)

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [undo, redo, levelData, nodes, slots, blockers, onChange, pushHistory])

  // ── Zoom / Pan ─────────────────────────────────────────────────────────────
  const [vb, setVb] = useState({ x: 0, y: 0, scale: 1 })
  const [panning, setPanning] = useState(false)
  const panStart = useRef(null)

  const viewBox = `${vb.x} ${vb.y} ${SVG_W / vb.scale} ${SVG_H / vb.scale}`

  const [settings, setSettings] = useState({
    roadWidth: 28,       // px in SVG units — represents actual road width
    showRanges: true,
    showCoverage: true,
    showDeadZones: true,
    showArrows: true,
    showGrid: true,
  })
  const [hoveredSlot, setHoveredSlot] = useState(null)

  // Tower lookup by slot
  const placementBySlot = useMemo(() => {
    const m = {}
    if (!placements || !towerTypes) return m
    for (const p of placements) {
      const tt = towerTypes.find(t => t.id === p.tower_type_id)
      if (tt) m[p.slot_id] = { ...p, tower: tt }
    }
    return m
  }, [placements, towerTypes])

  // Coverage intervals per slot
  const coverageBySlot = useMemo(() => {
    const m = {}
    for (const slot of slots) {
      const pl = placementBySlot[slot.id]
      if (!pl) continue
      const tt = pl.tower
      const rangeM = JSON.parse(tt.upgrade_range_mults || '[1,1.15,1.3,1.5]')
      const lv = Math.min(pl.upgrade_level || 0, 3)
      const range = tt.base_range * rangeM[lv]
      const cov = coverageInterval(slot.x, slot.y, range, nodes)
      if (cov) m[slot.id] = cov
    }
    return m
  }, [slots, placementBySlot, nodes])

  const pathLen = useMemo(() => totalPathLen(nodes), [nodes])

  // Dead zone: uncovered path segments (no tower covers them)
  const deadZoneData = useMemo(() => {
    if (pathLen === 0 || nodes.length < 2) return { segs: [], pct: 0 }
    // Collect all coverage intervals, sort, merge
    const intervals = Object.values(coverageBySlot)
      .filter(Boolean)
      .map(c => [c.enter, c.exit])
      .sort((a, b) => a[0] - b[0])
    const merged = []
    for (const [s, e] of intervals) {
      if (!merged.length || s > merged[merged.length-1][1]) merged.push([s, e])
      else merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], e)
    }
    // Find gaps
    const gaps = []
    let prev = 0
    for (const [s, e] of merged) {
      if (s > prev + 2) gaps.push([prev, s])
      prev = e
    }
    if (prev < pathLen - 2) gaps.push([prev, pathLen])
    // Build polylines for each gap
    const STEPS = 6
    const segs = gaps.map(([start, end]) => {
      const pts = []
      const steps = Math.max(2, Math.round((end - start) / STEPS))
      for (let i = 0; i <= steps; i++) pts.push(pointAtDist(start + (end - start) * i / steps, nodes))
      return pts
    })
    const deadLen = gaps.reduce((s, [a, b]) => s + (b - a), 0)
    return { segs, pct: Math.round((deadLen / pathLen) * 100) }
  }, [coverageBySlot, nodes, pathLen])

  const getSVGPt = useCallback(e => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    // Account for current viewBox (pan + zoom)
    const svgW = SVG_W / vb.scale
    const svgH = SVG_H / vb.scale
    return {
      x: Math.round(vb.x + (e.clientX - r.left) * svgW / r.width),
      y: Math.round(vb.y + (e.clientY - r.top)  * svgH / r.height),
    }
  }, [vb])

  const handleWheel = useCallback(e => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const cursorX = vb.x + (e.clientX - r.left) * (SVG_W / vb.scale) / r.width
    const cursorY = vb.y + (e.clientY - r.top)  * (SVG_H / vb.scale) / r.height
    const factor = e.deltaY < 0 ? 1.18 : 0.85
    const newScale = Math.max(0.25, Math.min(6, vb.scale * factor))
    setVb({
      scale: newScale,
      x: cursorX - (cursorX - vb.x) * (vb.scale / newScale),
      y: cursorY - (cursorY - vb.y) * (vb.scale / newScale),
    })
  }, [vb])

  // Attach wheel with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMiddleDown = useCallback(e => {
    if (e.button === 1) { e.preventDefault(); setPanning(true); panStart.current = { cx: e.clientX, cy: e.clientY, vbx: vb.x, vby: vb.y } }
  }, [vb])

  const handleMiddleMove = useCallback(e => {
    if (!panning || !panStart.current) return
    const svg = svgRef.current; if (!svg) return
    const r = svg.getBoundingClientRect()
    const svgW = SVG_W / vb.scale
    const svgH = SVG_H / vb.scale
    setVb(prev => ({
      ...prev,
      x: panStart.current.vbx - (e.clientX - panStart.current.cx) * svgW / r.width,
      y: panStart.current.vby - (e.clientY - panStart.current.cy) * svgH / r.height,
    }))
  }, [panning, vb.scale])

  const handleMiddleUp = useCallback(e => {
    if (e.button === 1) setPanning(false)
  }, [])

  const handleClick = useCallback(e => {
    if (dragging) return
    const pt = getSVGPt(e)

    if (mode === MODES.PATH) {
      pushHistory()
      const spt = snapPt(pt, shiftHeld)
      onChange({ ...levelData, path_nodes: [...nodes, { x: spt.x, y: spt.y }] })
      return
    }
    if (mode === MODES.SLOT) {
      pushHistory()
      const spt = snapPt(pt, shiftHeld)
      onChange({ ...levelData, tower_slots: [...slots, { id: uid(), x: spt.x, y: spt.y, unlock_after_wave: 0, label: `Slot ${slots.length + 1}` }] })
      return
    }
    if (mode === MODES.BLOCKER) {
      if (nodes.length < 2) return
      pushHistory()
      let minD = Infinity, idx = 0
      nodes.forEach((n, i) => { const d = Math.hypot(n.x-pt.x, n.y-pt.y); if (d < minD) { minD = d; idx = i } })
      onChange({ ...levelData, zone_blockers: [...blockers, { id: uid(), node_index: idx, unlock_after_wave: 1, x: nodes[idx].x, y: nodes[idx].y }] })
      return
    }
    if (mode === MODES.DELETE) {
      for (let i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x-pt.x, nodes[i].y-pt.y) < 14) {
          pushHistory()
          onChange({ ...levelData, path_nodes: nodes.filter((_,j) => j!==i) }); return
        }
      }
      for (let i = 0; i < slots.length; i++) {
        if (Math.hypot(slots[i].x-pt.x, slots[i].y-pt.y) < 16) {
          pushHistory()
          onChange({ ...levelData, tower_slots: slots.filter((_,j) => j!==i) }); return
        }
      }
      return
    }
    if (mode === MODES.SELECT) {
      for (let i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x-pt.x, nodes[i].y-pt.y) < 14) { setSelected({ type:'node', index:i }); return }
      }
      for (let i = 0; i < slots.length; i++) {
        if (Math.hypot(slots[i].x-pt.x, slots[i].y-pt.y) < 16) { setSelected({ type:'slot', index:i }); return }
      }
      setSelected(null)
    }
  }, [mode, nodes, slots, blockers, levelData, onChange, dragging, getSVGPt])

  const handleMouseDown = useCallback((e, type, index) => {
    if (mode !== MODES.SELECT) return
    e.stopPropagation()
    setDragging({ type, index })
    setSelected({ type, index })
  }, [mode])

  const handleMouseMove = useCallback(e => {
    if (!dragging) return
    const rawPt = getSVGPt(e)
    const pt = snapPt(rawPt, e.shiftKey)
    if (dragging.type === 'node') {
      onChange({ ...levelData, path_nodes: nodes.map((n,i) => i===dragging.index ? { x:pt.x, y:pt.y } : n) })
    } else if (dragging.type === 'slot') {
      onChange({ ...levelData, tower_slots: slots.map((s,i) => i===dragging.index ? { ...s, x:pt.x, y:pt.y } : s) })
    } else if (dragging.type === 'blocker') {
      onChange({ ...levelData, zone_blockers: blockers.map((b,i) => i===dragging.index ? { ...b, x:pt.x, y:pt.y } : b) })
    }
  }, [dragging, nodes, slots, blockers, levelData, onChange, getSVGPt])

  const handleMouseUp = useCallback(() => {
    if (dragging) pushHistory()  // commit drag as history entry
    setDragging(null)
  }, [dragging, pushHistory])

  const updateSelected = (key, val) => {
    if (!selected) return
    if (selected.type === 'node') {
      onChange({ ...levelData, path_nodes: nodes.map((n,i) => i===selected.index ? { ...n, [key]: val } : n) })
    } else if (selected.type === 'slot') {
      onChange({ ...levelData, tower_slots: slots.map((s,i) => i===selected.index ? { ...s, [key]: val } : s) })
    } else if (selected.type === 'blocker') {
      onChange({ ...levelData, zone_blockers: blockers.map((b,i) => i===selected.index ? { ...b, [key]: val } : b) })
    }
  }

  const selData = selected?.type === 'node' ? nodes[selected.index]
    : selected?.type === 'slot' ? slots[selected.index]
    : selected?.type === 'blocker' ? blockers[selected.index]
    : null

  // ── Path SVG geometry ─────────────────────────────────────────────────────
  const pathD = nodes.length > 1
    ? `M ${nodes.map(n => `${n.x},${n.y}`).join(' L ')}`
    : ''

  // Direction arrow positions (every ~80px along path)
  const arrows = useMemo(() => {
    if (!settings.showArrows || nodes.length < 2 || pathLen < 60) return []
    const result = []
    for (let d = 60; d < pathLen - 30; d += 90) {
      const p1 = pointAtDist(d - 8, nodes)
      const p2 = pointAtDist(d + 8, nodes)
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI
      const mid = pointAtDist(d, nodes)
      result.push({ ...mid, angle })
    }
    return result
  }, [nodes, pathLen, settings.showArrows])

  // Coverage segments on path (coloured stripes)
  const coverageSegs = useMemo(() => {
    if (!settings.showCoverage) return []
    return Object.entries(coverageBySlot).map(([slotId, cov]) => {
      const slot = slots.find(s => s.id === slotId)
      const pl = slot && placementBySlot[slot.id]
      const tt = pl?.tower
      const cat = tt?.category || 'Attack'
      const fillBase = CATEGORY_FILL[cat] || 'rgba(249,115,22,'
      // Sample points along covered segment
      const pts = []
      const steps = Math.max(4, Math.round((cov.exit - cov.enter) / 6))
      for (let s = 0; s <= steps; s++) {
        pts.push(pointAtDist(cov.enter + (cov.exit - cov.enter) * s / steps, nodes))
      }
      return { slotId, pts, fillBase, cov, tt }
    })
  }, [coverageBySlot, slots, placementBySlot, nodes, settings.showCoverage])

  // Grid dots
  const gridDots = useMemo(() => {
    if (!settings.showGrid) return []
    const dots = []
    for (let x = 40; x < SVG_W; x += 40) {
      for (let y = 40; y < SVG_H; y += 40) {
        dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={0.8} fill="#1f2937" />)
      }
    }
    return dots
  }, [settings.showGrid])

  // Spawn / Transport indicator
  const spawnNode = nodes[0]
  const transportNode = nodes[nodes.length - 1]

  return (
    <div className="flex gap-3 h-full min-h-0 select-none">

      {/* ── Left toolbar ─────────────────────────────────────── */}
      <div className="flex flex-col gap-1 flex-shrink-0 w-32">
        <p className="text-[9px] text-gray-600 uppercase tracking-widest font-bold px-1 mb-0.5">Tools</p>
        {Object.entries(MODES).map(([key, val]) => {
          const meta = MODE_META[val]
          return (
            <button key={key} onClick={() => setMode(val)} title={`${meta.label} [${meta.key}]`}
              className={`h-8 rounded-lg text-xs font-medium transition-all border flex items-center gap-2 px-2.5 ${
                mode === val
                  ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                  : 'bg-[#161b22] border-gray-700/60 text-gray-500 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              <span className="w-4 text-center text-sm leading-none flex-shrink-0">{meta.icon}</span>
              <span className="truncate">{meta.label}</span>
              <span className={`ml-auto text-[9px] ${mode === val ? 'text-orange-500' : 'text-gray-700'} flex-shrink-0`}>{meta.key}</span>
            </button>
          )
        })}

        <div className="mt-2 border-t border-gray-800 pt-2 space-y-1">
          <p className="text-[9px] text-gray-600 uppercase tracking-widest font-bold px-1 mb-0.5">Show</p>
          {[
            { key:'showRanges',    icon:'◎', title:'Tower Ranges' },
            { key:'showCoverage',  icon:'▬', title:'Coverage' },
            { key:'showDeadZones', icon:'⚠', title:'Dead Zones' },
            { key:'showArrows',    icon:'→', title:'Direction' },
            { key:'showGrid',      icon:'⠿', title:'Grid' },
          ].map(({ key, icon, title }) => (
            <button key={key} onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
              className={`h-7 w-full rounded-lg text-xs transition-all border flex items-center gap-2 px-2.5 ${
                settings[key]
                  ? 'bg-gray-700/60 border-gray-500/60 text-gray-200'
                  : 'bg-[#161b22] border-gray-800 text-gray-600'
              }`}
            >
              <span className="w-4 text-center text-sm leading-none flex-shrink-0">{icon}</span>
              <span className="text-[11px]">{title}</span>
              <span className={`ml-auto text-[9px] ${settings[key] ? 'text-gray-400' : 'text-gray-700'}`}>{settings[key] ? 'on' : 'off'}</span>
            </button>
          ))}
        </div>

        {/* Undo / Redo / Snap / Zoom */}
        <div className="mt-2 border-t border-gray-800 pt-2 space-y-1">
          <p className="text-[9px] text-gray-600 uppercase tracking-widest font-bold px-1 mb-0.5">Edit</p>
          {[
            { fn: undo, icon: '↩', label: 'Undo', hint: '⌘Z' },
            { fn: redo, icon: '↪', label: 'Redo', hint: '⌘Y' },
          ].map(({ fn, icon, label, hint }) => (
            <button key={icon} onClick={fn}
              className="h-7 w-full rounded-lg text-xs border bg-[#161b22] border-gray-700/60 text-gray-400 hover:border-gray-500 hover:text-gray-200 flex items-center gap-2 px-2.5 transition-all"
            >
              <span className="w-4 text-center flex-shrink-0">{icon}</span>
              <span className="text-[11px]">{label}</span>
              <span className="ml-auto text-[9px] text-gray-700">{hint}</span>
            </button>
          ))}
          <button
            onClick={() => setVb({ x: 0, y: 0, scale: 1 })}
            className="h-7 w-full rounded-lg text-xs border bg-[#161b22] border-gray-700/60 text-gray-400 hover:border-gray-500 hover:text-gray-200 flex items-center gap-2 px-2.5 transition-all"
          >
            <span className="w-4 text-center flex-shrink-0">⊡</span>
            <span className="text-[11px]">Reset Zoom</span>
          </button>
          <div className={`h-7 w-full rounded-lg text-xs border flex items-center gap-2 px-2.5 transition-all ${
            shiftHeld ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : 'bg-[#161b22] border-gray-700/60 text-gray-600'
          }`}>
            <span className="w-4 text-center flex-shrink-0">⊞</span>
            <span className="text-[11px]">Snap</span>
            <span className="ml-auto text-[9px] text-gray-600">⇧hold</span>
          </div>
        </div>

        {/* Road width */}
        <div className="mt-2 border-t border-gray-800 pt-2">
          <p className="text-[9px] text-gray-600 text-center mb-1">Road W</p>
          <input type="range" min={10} max={60} value={settings.roadWidth}
            onChange={e => setSettings(s => ({ ...s, roadWidth: +e.target.value }))}
            className="w-9 accent-orange-500" style={{ writingMode:'vertical-lr', direction:'rtl', height:60 }}
          />
          <p className="text-[9px] text-gray-500 text-center">{settings.roadWidth}</p>
        </div>
      </div>

      {/* ── SVG Canvas ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <svg ref={svgRef}
          viewBox={viewBox}
          className="w-full border border-gray-800 rounded-xl bg-[#0a0e14] select-none"
          style={{ aspectRatio:`${SVG_W}/${SVG_H}`, maxHeight:'100%', cursor: panning ? 'grabbing' : mode === MODES.SELECT ? 'default' : 'crosshair' }}
          onClick={handleClick}
          onMouseMove={e => { handleMouseMove(e); handleMiddleMove(e) }}
          onMouseDown={handleMiddleDown}
          onMouseUp={e => { handleMouseUp(e); handleMiddleUp(e) }}
          onMouseLeave={e => { handleMouseUp(e); setPanning(false) }}
        >
          {/* ─ Grid ─ */}
          {gridDots}

          {/* ─ Road (outer glow + fill) ─ */}
          {pathD && (
            <>
              {/* Road glow */}
              <path d={pathD} fill="none" stroke="#c2a25330" strokeWidth={settings.roadWidth + 12} strokeLinecap="round" strokeLinejoin="round" />
              {/* Road fill */}
              <path d={pathD} fill="none" stroke="#b8975a" strokeWidth={settings.roadWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />
              {/* Road center line */}
              <path d={pathD} fill="none" stroke="#c2a253" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10,8" opacity={0.5} />
            </>
          )}

          {/* ─ Coverage overlays on road ─ */}
          {coverageSegs.map(({ slotId, pts, fillBase }) => {
            if (pts.length < 2) return null
            const d = `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`
            const isHovered = hoveredSlot === slotId
            return (
              <path key={`cov-${slotId}`} d={d} fill="none"
                stroke={fillBase + (isHovered ? '0.9)' : '0.55)')}
                strokeWidth={settings.roadWidth * 0.85}
                strokeLinecap="round" strokeLinejoin="round"
              />
            )
          })}

          {/* ─ Dead zone highlights ─ */}
          {settings.showDeadZones && deadZoneData.segs.map((pts, i) => {
            if (pts.length < 2) return null
            const d = `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`
            return (
              <path key={`dead-${i}`} d={d} fill="none"
                stroke="#ef444455" strokeWidth={settings.roadWidth * 0.9}
                strokeLinecap="round" strokeLinejoin="round"
              />
            )
          })}
          {settings.showDeadZones && deadZoneData.segs.map((pts, i) => {
            if (pts.length < 2) return null
            const d = `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`
            return (
              <path key={`dead-border-${i}`} d={d} fill="none"
                stroke="#ef4444" strokeWidth={1.5}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="6,4" opacity={0.7}
              />
            )
          })}

          {/* ─ Direction arrows ─ */}
          {arrows.map((a, i) => (
            <g key={i} transform={`translate(${a.x},${a.y}) rotate(${a.angle})`} opacity={0.5}>
              <polygon points="-6,-4 6,0 -6,4" fill="#c2a253" />
            </g>
          ))}

          {/* ─ Zone Blockers ─ */}
          {blockers.map((b, i) => {
            const n = b.x !== undefined ? b : nodes[b.node_index]
            if (!n) return null
            const isSel = selected?.type === 'blocker' && selected.index === i
            // Draw perpendicular to path
            return (
              <g key={b.id || i}
                style={{ cursor: mode===MODES.SELECT ? 'grab' : mode===MODES.DELETE ? 'pointer' : 'default' }}
                onMouseDown={e => {
                  e.stopPropagation()
                  if (mode === MODES.SELECT) { setDragging({ type:'blocker', index:i }); setSelected({ type:'blocker', index:i }) }
                  if (mode === MODES.DELETE) { e.stopPropagation(); pushHistory(); onChange({ ...levelData, zone_blockers: blockers.filter((_,j) => j!==i) }); setSelected(null) }
                }}>
                {/* Larger invisible hit target */}
                <rect x={n.x - 30} y={n.y - 20} width={60} height={40} fill="transparent" />
                <rect x={n.x - 22} y={n.y - 6} width={44} height={12}
                  fill={isSel ? '#dc2626' : '#7f1d1d'} fillOpacity={isSel ? 0.9 : 0.7}
                  stroke={isSel ? '#ef4444' : '#dc2626'} strokeWidth={isSel ? 2 : 1} rx={2} />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fill="#fca5a5" fontSize={7.5} fontWeight="bold"
                  style={{ pointerEvents:'none' }}>
                  ⛔ W{b.unlock_after_wave}
                </text>
              </g>
            )
          })}

          {/* ─ Tower range circles ─ */}
          {settings.showRanges && slots.map(slot => {
            const pl = placementBySlot[slot.id]
            if (!pl) return null
            const tt = pl.tower
            const rangeM = JSON.parse(tt.upgrade_range_mults || '[1,1.15,1.3,1.5]')
            const lv = Math.min(pl.upgrade_level || 0, 3)
            const range = tt.base_range * rangeM[lv]
            const color = EFFECT_COLORS[tt.effect_type] || EFFECT_COLORS.default
            const isHov = hoveredSlot === slot.id
            return (
              <circle key={`rng-${slot.id}`}
                cx={slot.x} cy={slot.y} r={range}
                fill={color} fillOpacity={isHov ? 0.15 : 0.06}
                stroke={color} strokeWidth={isHov ? 1.5 : 0.8} strokeOpacity={isHov ? 0.9 : 0.4}
                strokeDasharray={pl.upgrade_level > 0 ? 'none' : '4,3'}
              />
            )
          })}

          {/* ─ Spawn indicator ─ */}
          {spawnNode && (
            <g>
              <circle cx={spawnNode.x} cy={spawnNode.y} r={18} fill="#7f1d1d" fillOpacity={0.35} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="5,3" />
              <text x={spawnNode.x} y={spawnNode.y - 22} textAnchor="middle" fill="#ef4444" fontSize={9} fontWeight="bold">SPAWN</text>
            </g>
          )}

          {/* ─ Transport indicator ─ */}
          {transportNode && nodes.length > 1 && (
            <g>
              <circle cx={transportNode.x} cy={transportNode.y} r={22} fill="#064e3b" fillOpacity={0.4} stroke="#10b981" strokeWidth={2} />
              <text x={transportNode.x} y={transportNode.y + 4} textAnchor="middle" fill="#34d399" fontSize={8} fontWeight="bold">TRANSPORT</text>
              <text x={transportNode.x} y={transportNode.y + 14} textAnchor="middle" fill="#6ee7b7" fontSize={7}>▲ defend</text>
            </g>
          )}

          {/* ─ Path waypoints ─ */}
          {nodes.map((node, i) => {
            if (i === 0 || i === nodes.length - 1) return null // drawn separately
            const isSel = selected?.type === 'node' && selected.index === i
            const isHov = hoveredNode?.type === 'node' && hoveredNode.index === i
            const r = isSel ? 10 : isHov ? 8 : 6
            return (
              <g key={i}
                style={{ cursor: mode===MODES.SELECT ? (dragging ? 'grabbing' : 'grab') : mode===MODES.DELETE ? 'pointer' : 'crosshair' }}
                onMouseDown={e => {
                  if (mode === MODES.DELETE) { e.stopPropagation(); pushHistory(); onChange({ ...levelData, path_nodes: nodes.filter((_,j)=>j!==i) }); setSelected(null) }
                  else handleMouseDown(e, 'node', i)
                }}
                onMouseEnter={() => setHoveredNode({ type:'node', index:i })}
                onMouseLeave={() => setHoveredNode(null)}>
                {/* Enlarged invisible hit target */}
                <circle cx={node.x} cy={node.y} r={18} fill="transparent" />
                <circle cx={node.x} cy={node.y} r={r} fill={isSel ? '#fff' : isHov ? '#60a5fa' : '#3b82f6'}
                  stroke={isSel ? '#3b82f6' : '#1e40af'} strokeWidth={isSel ? 2.5 : 1.5} />
                <text x={node.x} y={node.y+3} textAnchor="middle" fill="white" fontSize={6}
                  style={{ pointerEvents:'none' }}>{i}</text>
              </g>
            )
          })}
          {/* Spawn node drag handle */}
          {spawnNode && (() => {
            const isSel = selected?.type === 'node' && selected.index === 0
            const isHov = hoveredNode?.type === 'node' && hoveredNode.index === 0
            return (
              <g style={{ cursor: mode===MODES.SELECT ? 'grab' : 'crosshair' }}
                onMouseDown={e => handleMouseDown(e, 'node', 0)}
                onMouseEnter={() => setHoveredNode({ type:'node', index:0 })}
                onMouseLeave={() => setHoveredNode(null)}>
                <circle cx={spawnNode.x} cy={spawnNode.y} r={18} fill="transparent" />
                <circle cx={spawnNode.x} cy={spawnNode.y} r={isSel ? 9 : isHov ? 8 : 6}
                  fill="#ef4444" stroke="#7f1d1d" strokeWidth={isSel ? 2.5 : 1.5} />
              </g>
            )
          })()}
          {/* Transport node drag handle */}
          {transportNode && nodes.length > 1 && (() => {
            const isSel = selected?.type === 'node' && selected.index === nodes.length-1
            const isHov = hoveredNode?.type === 'node' && hoveredNode.index === nodes.length-1
            return (
              <g style={{ cursor: mode===MODES.SELECT ? 'grab' : 'crosshair' }}
                onMouseDown={e => handleMouseDown(e, 'node', nodes.length-1)}
                onMouseEnter={() => setHoveredNode({ type:'node', index:nodes.length-1 })}
                onMouseLeave={() => setHoveredNode(null)}>
                <circle cx={transportNode.x} cy={transportNode.y} r={18} fill="transparent" />
                <circle cx={transportNode.x} cy={transportNode.y} r={isSel ? 9 : isHov ? 8 : 6}
                  fill="#10b981" stroke="#064e3b" strokeWidth={isSel ? 2.5 : 1.5} />
              </g>
            )
          })()}

          {/* ─ Tower slots ─ */}
          {slots.map((slot, i) => {
            const isSel = selected?.type === 'slot' && selected.index === i
            const pl = placementBySlot[slot.id]
            const tt = pl?.tower
            const color = tt ? (EFFECT_COLORS[tt.effect_type] || EFFECT_COLORS.default) : '#78350f'
            const cov = coverageBySlot[slot.id]
            return (
              <g key={slot.id || i}
                style={{ cursor: mode===MODES.SELECT ? (dragging ? 'grabbing' : 'grab') : mode===MODES.DELETE ? 'pointer' : 'crosshair' }}
                onMouseDown={e => {
                  if (mode === MODES.DELETE) { e.stopPropagation(); pushHistory(); onChange({ ...levelData, tower_slots: slots.filter((_,j)=>j!==i) }); setSelected(null) }
                  else handleMouseDown(e, 'slot', i)
                }}
                onMouseEnter={() => { setHoveredSlot(slot.id); setHoveredNode({ type:'slot', index:i }) }}
                onMouseLeave={() => { setHoveredSlot(null); setHoveredNode(null) }}>
                {/* Enlarged invisible hit target */}
                <rect x={slot.x-20} y={slot.y-20} width={40} height={40} fill="transparent" />
                {/* Glow ring */}
                {tt && <circle cx={slot.x} cy={slot.y} r={14} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />}
                {/* Main square */}
                <rect x={slot.x-11} y={slot.y-11} width={22} height={22}
                  fill={tt ? color : '#1c0a00'}
                  fillOpacity={tt ? 0.9 : 0.7}
                  stroke={isSel ? '#ffffff' : (tt ? color : '#d97706')}
                  strokeWidth={isSel ? 2.5 : 1.5} rx={4} />
                {/* Tower initial or slot number */}
                <text x={slot.x} y={slot.y+4} textAnchor="middle" fill="white"
                  fontSize={tt ? 9 : 8} fontWeight="bold" style={{ pointerEvents:'none' }}>
                  {tt ? tt.name[0] : i+1}
                </text>
                {/* Upgrade level pip */}
                {tt && (pl.upgrade_level || 0) > 0 && (
                  <text x={slot.x+9} y={slot.y-9} fill="#fbbf24" fontSize={7} fontWeight="bold"
                    style={{ pointerEvents:'none' }}>
                    {pl.upgrade_level}
                  </text>
                )}
                {/* Unlock wave label */}
                {(slot.unlock_after_wave > 0) && (
                  <text x={slot.x} y={slot.y-16} textAnchor="middle" fill="#fbbf24" fontSize={7.5}
                    style={{ pointerEvents:'none' }}>
                    W{slot.unlock_after_wave}+
                  </text>
                )}
                {/* Coverage % badge */}
                {cov && (
                  <g>
                    <rect x={slot.x-10} y={slot.y+13} width={20} height={9} fill="#000" fillOpacity={0.6} rx={2} />
                    <text x={slot.x} y={slot.y+20} textAnchor="middle" fill="#86efac" fontSize={6.5} fontWeight="bold"
                      style={{ pointerEvents:'none' }}>
                      {cov.pct}%
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* ─ Scale bar ─ */}
          <g transform={`translate(${SVG_W-100},${SVG_H-22})`}>
            <rect x={0} y={0} width={90} height={14} fill="#000" fillOpacity={0.5} rx={3} />
            <line x1={5} y1={7} x2={5+settings.roadWidth} y2={7} stroke="#c2a253" strokeWidth={2} />
            <line x1={5} y1={4} x2={5} y2={10} stroke="#c2a253" strokeWidth={1} />
            <line x1={5+settings.roadWidth} y1={4} x2={5+settings.roadWidth} y2={10} stroke="#c2a253" strokeWidth={1} />
            <text x={12+settings.roadWidth} y={10} fill="#c2a253" fontSize={7}>1 road width</text>
          </g>

          {/* ─ Path length readout ─ */}
          {pathLen > 0 && (
            <g transform={`translate(8, ${SVG_H-22})`}>
              <rect x={0} y={0} width={130} height={14} fill="#000" fillOpacity={0.5} rx={3} />
              <text x={5} y={10} fill="#6b7280" fontSize={7}>
                Path: {pathLen.toFixed(0)}px · {(pathLen/settings.roadWidth).toFixed(1)} road-widths
                {nodes.length > 0 && ` · ${nodes.length} nodes`}
              </text>
            </g>
          )}

          {/* ─ Mode + zoom hint ─ */}
          <g transform={`translate(${vb.x + 8 * (SVG_W / vb.scale) / SVG_W}, ${vb.y + 8 * (SVG_H / vb.scale) / SVG_H})`}
             style={{ transform: `translate(${vb.x}px, ${vb.y}px) scale(${1/vb.scale})` }}>
          </g>
          <text x={vb.x + 6} y={vb.y + 10} fill="#9ca3af" fontSize={8 / vb.scale}>
            Mode: {MODE_META[mode].label} · {Math.round(vb.scale * 100)}%
            {' '}· scroll=zoom · mid-drag=pan
          </text>
        </svg>
      </div>

      {/* ── Right panel ──────────────────────────────────────── */}
      <div className="w-48 flex-shrink-0 overflow-y-auto space-y-3">

        {/* Context-sensitive properties */}
        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-3">
          <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Properties</h3>

          {!selData && (
            <div className="text-xs text-gray-600 space-y-2">
              <div className="bg-[#0d1117] rounded-lg p-2 space-y-1 text-[10px] text-gray-500">
                <p className="text-gray-400 font-medium mb-1.5">Keyboard shortcuts</p>
                <p className="flex justify-between"><span>1–5</span><span className="text-gray-600">Switch tool</span></p>
                <p className="flex justify-between"><span>⌘Z / ⌘Y</span><span className="text-gray-600">Undo / Redo</span></p>
                <p className="flex justify-between"><span>Del / ⌫</span><span className="text-gray-600">Delete selected</span></p>
                <p className="flex justify-between"><span>Esc</span><span className="text-gray-600">Deselect</span></p>
                <p className="flex justify-between"><span>⇧ + drag</span><span className="text-gray-600">Snap to grid</span></p>
                <p className="flex justify-between"><span>Scroll</span><span className="text-gray-600">Zoom</span></p>
                <p className="flex justify-between"><span>Mid-drag</span><span className="text-gray-600">Pan</span></p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" /><span>Spawn (node 0)</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" /><span>Transport (last)</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" /><span>Waypoint</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-orange-700 flex-shrink-0" /><span>Tower Slot</span></div>
                <div className="flex items-center gap-1.5"><div className="w-8 h-2 rounded bg-red-800 flex-shrink-0" /><span>Zone Blocker</span></div>
              </div>
              <div className="border-t border-gray-800 pt-2 space-y-0.5">
                <p className="flex justify-between"><span>Nodes</span><span className="text-gray-400">{nodes.length}</span></p>
                <p className="flex justify-between"><span>Slots</span><span className="text-gray-400">{slots.length}</span></p>
                <p className="flex justify-between"><span>Blockers</span><span className="text-gray-400">{blockers.length}</span></p>
                <p className="flex justify-between"><span>Placed</span><span className="text-orange-400">{Object.keys(placementBySlot).length}/{slots.length}</span></p>
                <p className="flex justify-between">
                  <span>Dead zone</span>
                  <span className={deadZoneData.pct > 30 ? 'text-red-400' : deadZoneData.pct > 10 ? 'text-yellow-400' : 'text-green-400'}>
                    {deadZoneData.pct}%
                  </span>
                </p>
              </div>
            </div>
          )}

          {selData && selected.type === 'node' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-blue-400 font-medium">
                  {selected.index === 0 ? '🔴 Spawn' : selected.index === nodes.length-1 ? '🟢 Transport' : `Waypoint #${selected.index}`}
                </p>
                {selected.index !== 0 && selected.index !== nodes.length-1 && (
                  <button onClick={() => { pushHistory(); onChange({ ...levelData, path_nodes: nodes.filter((_,i)=>i!==selected.index) }); setSelected(null) }}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 transition-colors">
                    ✕ Delete
                  </button>
                )}
              </div>
              {[['x','X'], ['y','Y']].map(([k,l]) => (
                <div key={k}>
                  <label className="block text-[10px] text-gray-600 mb-1">{l}</label>
                  <input type="number" value={selData[k]}
                    onChange={e => updateSelected(k, parseInt(e.target.value))}
                    className="w-full bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
              <p className="text-[9px] text-gray-700">Press ⌫ to delete · ⇧+drag to snap</p>
            </div>
          )}

          {selData && selected.type === 'slot' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-orange-400 font-medium">Tower Slot {selected.index + 1}</p>
                <button onClick={() => { pushHistory(); onChange({ ...levelData, tower_slots: slots.filter((_,i)=>i!==selected.index) }); setSelected(null) }}
                  className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 transition-colors">
                  ✕ Delete
                </button>
              </div>
              {[['x','X'], ['y','Y']].map(([k,l]) => (
                <div key={k}>
                  <label className="block text-[10px] text-gray-600 mb-1">{l}</label>
                  <input type="number" value={selData[k]}
                    onChange={e => updateSelected(k, parseInt(e.target.value))}
                    className="w-full bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Unlock after wave</label>
                <input type="number" value={selData.unlock_after_wave ?? 0} min={0} max={15}
                  onChange={e => updateSelected('unlock_after_wave', parseInt(e.target.value))}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Label</label>
                <input type="text" value={selData.label || ''}
                  onChange={e => updateSelected('label', e.target.value)}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>
              {coverageBySlot[selData.id] && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
                  <p className="text-[10px] text-emerald-400 font-bold">Coverage</p>
                  <p className="text-xs text-gray-300">{coverageBySlot[selData.id].pct}% of path</p>
                  <p className="text-[10px] text-gray-500">{coverageBySlot[selData.id].enter.toFixed(0)}–{coverageBySlot[selData.id].exit.toFixed(0)}px</p>
                </div>
              )}
              {placementBySlot[selData.id] && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded p-2">
                  <p className="text-[10px] text-orange-400 font-bold">Placed Tower</p>
                  <p className="text-xs text-gray-200">{placementBySlot[selData.id].tower.name}</p>
                  <p className="text-[10px] text-gray-500">Lv {placementBySlot[selData.id].upgrade_level}</p>
                </div>
              )}
            </div>
          )}

          {selData && selected.type === 'blocker' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-red-400 font-medium">Zone Blocker</p>
                <button onClick={() => { pushHistory(); onChange({ ...levelData, zone_blockers: blockers.filter((_,i)=>i!==selected.index) }); setSelected(null) }}
                  className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 transition-colors">
                  ✕ Delete
                </button>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Unlock after wave</label>
                <input type="number" value={selData.unlock_after_wave ?? 1} min={1} max={15}
                  onChange={e => updateSelected('unlock_after_wave', parseInt(e.target.value))}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-red-500"
                />
              </div>
              <p className="text-[10px] text-gray-600">At node #{selData.node_index} · drag to reposition</p>
              <p className="text-[9px] text-gray-700">Press ⌫ to delete</p>
            </div>
          )}
        </div>

        {/* Coverage summary */}
        {Object.keys(coverageBySlot).length > 0 && (
          <div className="bg-[#161b22] border border-gray-800 rounded-xl p-3">
            <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Coverage</h3>
            <div className="space-y-1.5">
              {slots.map((slot, i) => {
                const pl = placementBySlot[slot.id]
                const cov = coverageBySlot[slot.id]
                if (!pl || !cov) return null
                const color = EFFECT_COLORS[pl.tower.effect_type] || EFFECT_COLORS.default
                return (
                  <div key={slot.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredSlot(slot.id)}
                    onMouseLeave={() => setHoveredSlot(null)}>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-gray-400">{pl.tower.name[0]} S{i+1}</span>
                      <span style={{ color }}>{cov.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width:`${Math.min(100,cov.pct)}%`, backgroundColor: color, opacity: 0.7 }} />
                    </div>
                  </div>
                )
              })}
              <div className="border-t border-gray-800 pt-1.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">Uncovered</span>
                  <span className="text-red-400 font-bold">
                    {Math.max(0, 100 - Math.min(100, Object.values(coverageBySlot).reduce((a,c) => a + c.pct, 0)))}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

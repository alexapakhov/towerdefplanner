import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLevels, createLevel, deleteLevel, getBalance } from '../api.js'

function DifficultyBadge({ rating, loading }) {
  if (loading) return <span className="px-2 py-0.5 rounded-md text-xs bg-gray-800 text-gray-600 border border-gray-700 animate-pulse">sim...</span>
  if (!rating) return <span className="px-2 py-0.5 rounded-md text-xs bg-gray-800 text-gray-500 border border-gray-700">–</span>
  const map = {
    Easy:       'bg-green-500/15 text-green-400 border-green-500/25',
    Medium:     'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    Hard:       'bg-orange-500/15 text-orange-400 border-orange-500/25',
    Impossible: 'bg-red-500/15 text-red-400 border-red-500/25',
  }
  return <span className={`px-2 py-0.5 rounded-md text-xs border ${map[rating] || map.Medium}`}>{rating}</span>
}

function NewLevelModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', description: '', transport_hp: 1000, starting_currency: 200 })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    try { await onCreate(form); onClose() }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-gray-700/80 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-base font-bold text-gray-100 mb-5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Create New Level
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Level Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Asteroid Belt 1"
              className="w-full bg-[#0d1117] border border-gray-700 rounded-xl px-3 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 transition-all"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="w-full bg-[#0d1117] border border-gray-700 rounded-xl px-3 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 transition-all resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'transport_hp', label: 'Transport HP', step: 100, min: 100 },
              { key: 'starting_currency', label: 'Starting 💰', step: 50, min: 0 },
            ].map(({ key, label, step, min }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
                <input
                  type="number"
                  value={form[key]}
                  onChange={e => set(key, parseFloat(e.target.value))}
                  min={min}
                  step={step}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-xl px-3 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 transition-all stat-num"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50 shadow-lg shadow-orange-500/20"
            >
              {loading ? 'Creating...' : 'Create Level'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LevelCard({ level, onOpen, onDelete, balanceData, balanceLoading }) {
  return (
    <div
      className="bg-[#161b22] border border-gray-800/80 rounded-2xl p-5 hover:border-orange-500/30 transition-all cursor-pointer group relative overflow-hidden"
      onClick={() => onOpen(level.id)}
    >
      {/* Subtle gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-200 truncate group-hover:text-orange-300 transition-colors text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            {level.name}
          </h3>
          {level.description && (
            <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{level.description}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(level.id) }}
          className="ml-2 text-gray-700 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
          title="Delete"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Waves', value: level.wave_count || 0, color: 'text-blue-400' },
          { label: 'Transport HP', value: level.transport_hp, color: 'text-green-400' },
          { label: 'Currency', value: level.starting_currency, color: 'text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0d1117] rounded-xl p-2.5 text-center border border-gray-800/50">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{label}</p>
            <p className={`text-sm font-bold stat-num ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DifficultyBadge rating={balanceData?.difficulty_rating} loading={balanceLoading} />
          {balanceData && (
            <span className={`text-[10px] font-medium ${balanceData.is_level_survivable ? 'text-green-500' : 'text-red-500'}`}>
              {balanceData.overall_kill_rate}% kill
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-700">
          {new Date(level.updated_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [balanceMap, setBalanceMap] = useState({})   // { levelId: balance data }
  const [balanceLoading, setBalanceLoading] = useState({}) // { levelId: bool }

  const fetchLevels = async () => {
    try {
      const data = await getLevels()
      setLevels(data)
      // Fetch balance for all levels with waves, in parallel
      const withWaves = data.filter(l => (l.wave_count || 0) > 0)
      if (withWaves.length === 0) return
      setBalanceLoading(Object.fromEntries(withWaves.map(l => [l.id, true])))
      const results = await Promise.allSettled(withWaves.map(l => getBalance(l.id)))
      const newMap = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') newMap[withWaves[i].id] = r.value
      })
      setBalanceMap(newMap)
      setBalanceLoading({})
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLevels() }, [])

  const handleCreate = async (form) => {
    const level = await createLevel(form)
    await fetchLevels()
    navigate(`/level/${level.id}`)
  }

  const handleDelete = async (id) => {
    try { await deleteLevel(id); setLevels(l => l.filter(x => x.id !== id)) }
    catch (err) { console.error(err) }
    setDeleteConfirm(null)
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Levels</h1>
          <p className="text-gray-500 text-sm mt-1">Design and manage your tower defense raids</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-orange-500/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Level
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32 text-gray-600">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            Loading levels...
          </div>
        </div>
      ) : levels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-gray-600">
          <div className="w-16 h-16 rounded-2xl bg-gray-800/60 flex items-center justify-center text-3xl mb-4">🗺️</div>
          <p className="text-base font-semibold text-gray-400">No levels yet</p>
          <p className="text-sm mt-1">Click "New Level" to get started</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-orange-500/20"
          >
            Create your first level
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {levels.map((level) => (
            <LevelCard
              key={level.id}
              level={level}
              onOpen={(id) => navigate(`/level/${id}`)}
              onDelete={(id) => setDeleteConfirm(id)}
              balanceData={balanceMap[level.id]}
              balanceLoading={balanceLoading[level.id]}
            />
          ))}
        </div>
      )}

      {showModal && <NewLevelModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-gray-700/80 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-100 mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Delete this level?</h3>
            <p className="text-sm text-gray-500 mb-5">All waves, placements, and configuration will be permanently removed.</p>
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

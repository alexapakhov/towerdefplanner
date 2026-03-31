const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

// Levels
export const getLevels = () => request('/levels')
export const createLevel = (data) => request('/levels', { method: 'POST', body: JSON.stringify(data) })
export const getLevel = (id) => request(`/levels/${id}`)
export const updateLevel = (id, data) => request(`/levels/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteLevel = (id) => request(`/levels/${id}`, { method: 'DELETE' })

// Waves
export const getWaves = (levelId) => request(`/levels/${levelId}/waves`)
export const createWave = (levelId, data) => request(`/levels/${levelId}/waves`, { method: 'POST', body: JSON.stringify(data) })
export const updateWave = (levelId, waveId, data) => request(`/levels/${levelId}/waves/${waveId}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteWave = (levelId, waveId) => request(`/levels/${levelId}/waves/${waveId}`, { method: 'DELETE' })

// Placements
export const getPlacements = (levelId) => request(`/levels/${levelId}/placements`)
export const savePlacements = (levelId, data) => request(`/levels/${levelId}/placements`, { method: 'POST', body: JSON.stringify(data) })

// Squad
export const getSquad = (levelId) => request(`/levels/${levelId}/squad`)
export const saveSquad = (levelId, data) => request(`/levels/${levelId}/squad`, { method: 'PUT', body: JSON.stringify(data) })

// Balance
export const getBalance = (levelId) => request(`/levels/${levelId}/balance`)
export const getBalanceWhatIf = (levelId, override) => request(`/levels/${levelId}/balance-whatif`, { method: 'POST', body: JSON.stringify(override) })

// Tower Types
export const getTowerTypes = () => request('/tower-types')
export const createTowerType = (data) => request('/tower-types', { method: 'POST', body: JSON.stringify(data) })
export const updateTowerType = (id, data) => request(`/tower-types/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTowerType = (id) => request(`/tower-types/${id}`, { method: 'DELETE' })

// Enemy Types
export const getEnemyTypes = () => request('/enemy-types')
export const createEnemyType = (data) => request('/enemy-types', { method: 'POST', body: JSON.stringify(data) })
export const updateEnemyType = (id, data) => request(`/enemy-types/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteEnemyType = (id) => request(`/enemy-types/${id}`, { method: 'DELETE' })

// Seed
export const reseed = () => request('/seed', { method: 'POST' })

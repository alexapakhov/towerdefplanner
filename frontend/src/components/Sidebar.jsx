import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

function NavItem({ to, label, icon, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-sm font-medium group ${
          isActive
            ? 'bg-orange-500/15 text-orange-300 border border-orange-500/25'
            : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
        }`
      }
    >
      <span className="w-5 text-center flex-shrink-0 text-base leading-none">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function NavGroup({ label, children }) {
  return (
    <div className="mb-2">
      <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold px-3 mb-1 mt-3">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export default function Sidebar() {
  const location = useLocation()
  const levelMatch = location.pathname.match(/\/level\/(\d+)/)
  const balanceMatch = location.pathname.match(/\/balance\/(\d+)/)
  const levelId = levelMatch?.[1] || balanceMatch?.[1]

  return (
    <aside className="w-52 flex-shrink-0 bg-[#0d1117] border-r border-gray-800/80 flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-sm shadow-lg">
            🗼
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-100 leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              TD Planner
            </h1>
            <p className="text-[10px] text-gray-600 mt-0.5">Tower Defense Studio</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2.5 overflow-y-auto">
        <NavGroup label="workspace">
          <NavItem to="/" label="Levels" icon="📋" end />
          <NavItem to="/design" label="Game Design" icon="📖" />
          <NavItem to="/raids" label="45 Raids" icon="🌊" />
          <NavItem to="/config" label="Config" icon="⚙️" />
        </NavGroup>

        {levelId && (
          <NavGroup label={`Level #${levelId}`}>
            <NavItem to={`/level/${levelId}`} label="Editor" icon="✏️" />
            <NavItem to={`/balance/${levelId}`} label="Balance" icon="📊" />
            <NavItem to={`/sim/${levelId}`} label="Simulate" icon="🎮" />
          </NavGroup>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800/80">
        <div className="flex items-center gap-2 px-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-gray-600">backend :8002</span>
        </div>
      </div>
    </aside>
  )
}

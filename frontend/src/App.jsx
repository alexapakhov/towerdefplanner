import React from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Home from './pages/Home.jsx'
import LevelEditor from './pages/LevelEditor.jsx'
import Config from './pages/Config.jsx'
import BalancePage from './pages/BalancePage.jsx'
import DesignDocs from './pages/DesignDocs.jsx'
import RaidsPage from './pages/RaidsPage.jsx'
import SimulationPage from './pages/SimulationPage.jsx'

function Layout() {
  const location = useLocation()
  return (
    <div className="flex h-screen bg-[#0d1117] text-gray-100 overflow-hidden">
      <Sidebar />
      <main key={location.pathname} className="flex-1 overflow-auto fade-in">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/level/:id" element={<LevelEditor />} />
          <Route path="/config" element={<Config />} />
          <Route path="/balance/:id" element={<BalancePage />} />
          <Route path="/design" element={<DesignDocs />} />
          <Route path="/raids" element={<RaidsPage />} />
          <Route path="/sim/:id" element={<SimulationPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}

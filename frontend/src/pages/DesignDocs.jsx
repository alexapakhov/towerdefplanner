import React, { useState, useEffect, createContext, useContext } from 'react'
import { getTowerTypes, getEnemyTypes } from '../api.js'

// Live data context — filled from API, consumed in TowersSection / EnemiesSection
const LiveDataCtx = createContext(null)

// ─── Static game design data ───────────────────────────────────────────────

const SECTIONS = [
  'Overview', 'Core Loop', 'Level Anatomy', 'Game Objects',
  'Towers', 'Enemies', 'Squad', 'Synergies', 'Balance Guide', 'Level Flow',
]

const TOWERS = [
  {
    name: 'Ballistic',
    category: 'Attack',
    effect: 'Shell',
    pattern: 'Single Target',
    dps: 'Medium', range: 'Medium', cost: 'Low',
    color: '#f97316',
    icon: '💣',
    description: 'Fires heavy ballistic shells at a single target. Long effective range with a close blind spot. Reliable all-rounder.',
    mechanics: [
      'Projectile-based — shell travels to target, can miss fast enemies',
      'Large blind spot near the base — avoid placing next to tight corners',
      'Scales well with upgrades, one of the best cost-efficient towers',
    ],
    synergies: ['Pair with Freezer to eliminate the blind spot issue', 'BoostData multiplies Shell DPS significantly'],
    designNote: 'Use as your workhorse mid-path tower. Best on long straight segments.',
    upgradeHighlight: 'Lv3: ×4 DPS — strongest late-game single-target output',
  },
  {
    name: 'Energy',
    category: 'Attack',
    effect: 'Electro',
    pattern: 'Chain Laser',
    dps: 'High', range: 'Low',
    cost: 'Medium',
    color: '#8b5cf6',
    icon: '⚡',
    description: 'Continuous laser that locks onto one enemy until it dies, then chains to the next without stopping. Pierces through clusters.',
    mechanics: [
      'No downtime between targets — laser is always on',
      'Piercing mode: damages all enemies in a line simultaneously',
      'Electro effect primes enemies for Fire damage bonus from Flamethrower',
    ],
    synergies: ['Deadly combo with Freezer — slowed enemies stay in beam longer', 'Flamethrower deals +50% to Electro-affected targets'],
    designNote: 'Best placed on curved path sections where multiple enemies overlap. Terrible on wide open areas.',
    upgradeHighlight: 'Lv2: beam pierces through all enemies in range',
  },
  {
    name: 'Freezer',
    category: 'Debuff',
    effect: 'Ice',
    pattern: 'Slow Beam + AoE',
    dps: 'Low', range: 'Medium', cost: 'Medium',
    color: '#38bdf8',
    icon: '❄️',
    description: 'Emits an ice beam that slows a single target heavily, while pulsing AoE frost that slows nearby enemies. Slow persists briefly after leaving range.',
    mechanics: [
      'Primary target: 50% movement speed reduction',
      'AoE frost pulse: 20% slow to all nearby enemies in radius',
      'Fire damage bonus: ×1.5 DPS to burning targets (great with Flamethrower)',
      'Slow lingers for 2 seconds after exiting range',
    ],
    synergies: ['Core combo with Energy tower — more beam time = more damage', 'Freezer → Ballistic: shells hit guaranteed as target barely moves'],
    designNote: 'Never skip Freezer in a serious build. It multiplies the value of every other attack tower.',
    upgradeHighlight: 'Lv1 already transforms nearby tower DPS — upgrade ASAP',
  },
  {
    name: 'FrostAround',
    category: 'Debuff',
    effect: 'Ice',
    pattern: 'Area Aura',
    dps: 'Low', range: 'High', cost: 'Low',
    color: '#7dd3fc',
    icon: '🌀',
    description: 'Creates a persistent frost aura around itself. All enemies inside the radius move slower and take minor continuous ice damage.',
    mechanics: [
      'Passive aura — no targeting, always active',
      'Very high range, covers large path sections',
      'Debuff persists for a few seconds after enemies leave the zone',
      'Stacks partially with Freezer for a stronger slow',
    ],
    synergies: ['Best placed at path entry to pre-slow enemies before Ballistic/Energy', 'Layer with Freezer at a chokepoint for maximum slowdown'],
    designNote: 'Best near spawn or zone transition points. Cheap and effective for early waves.',
    upgradeHighlight: 'Lv2: slow radius expands significantly + mini-freeze on kill',
  },
  {
    name: 'BoostData',
    category: 'Support',
    effect: 'None',
    pattern: 'Buff Aura',
    dps: '—', range: 'High', cost: 'Low',
    color: '#22c55e',
    icon: '📡',
    description: 'Emits a data uplink signal boosting allied towers, player, and companions within its radius. Increases damage output, restores player HP over time.',
    mechanics: [
      'Boosts all towers in range: ×1.4 DPS',
      'Player and companions in range: ×1.2 damage + HP regen',
      'Does not deal damage — purely utility',
      'Stacks with multiple BoostData towers (diminishing returns after 2)',
    ],
    synergies: ['Best placed at the center of your tower cluster', 'Pairs with every damage tower — critical in late waves'],
    designNote: 'One BoostData + two attack towers often outperforms three raw attack towers. Always include at least one.',
    upgradeHighlight: 'Lv3: range nearly doubles — covers the entire combat zone',
  },
  {
    name: 'Flamethrower',
    category: 'Attack',
    effect: 'Fire',
    pattern: 'Forward Cone',
    dps: 'High', range: 'Low', cost: 'Medium',
    color: '#ef4444',
    icon: '🔥',
    description: 'Releases a sustained fire cone in the direction it faces. Leaves a burning DoT on hit enemies. Deals bonus damage to Electro-affected targets.',
    mechanics: [
      'Cone attack — hits all enemies in front simultaneously',
      'Burning DoT: 15 DPS for 3 seconds after leaving range',
      '+50% damage bonus against Electro-affected enemies',
      'Cannot rotate — placement direction matters',
    ],
    synergies: ['Energy (Electro) → Flamethrower: +50% bonus is significant at high upgrade levels', 'Freezer slows targets into the cone for longer exposure'],
    designNote: 'Place facing the longest straight approach to the transport. Rotation is fixed on placement.',
    upgradeHighlight: 'Lv2: burning DoT duration doubles to 6 seconds',
  },
  {
    name: 'Mortar',
    category: 'Attack',
    effect: 'Shell',
    pattern: 'AoE Splash',
    dps: 'Medium', range: 'High', cost: 'Medium',
    color: '#a78bfa',
    icon: '💥',
    description: 'Lobs explosive shells that deal splash damage in an area. Excellent against groups. Large blind spot directly around the base.',
    mechanics: [
      'AoE splash on impact — optimal against dense enemy groups',
      'Very high range — can cover multiple path sections',
      'Dead zone: cannot target enemies within melee range',
      'Shell effect: synergizes with Shell armor vulnerabilities',
    ],
    synergies: ['FrostAround clusters enemies together for maximum Mortar splash value', 'Use Mortar at chokepoints — high density = maximum value'],
    designNote: 'Mortar shines against tanky group waves. Less effective against fast spread-out scouts.',
    upgradeHighlight: 'Lv3: splash radius +60% — devastating against Brute waves',
  },
  {
    name: 'Tesla',
    category: 'Attack',
    effect: 'Electro',
    pattern: 'Chain Lightning',
    dps: 'Medium', range: 'Medium', cost: 'Medium',
    color: '#facc15',
    icon: '🌩️',
    description: 'Fires chain lightning that jumps between nearby enemies. Applies Electro effect to all targets hit, setting them up for Fire bonus.',
    mechanics: [
      'Chain jumps up to 4 targets per shot',
      'Each jump reduces damage by 15%',
      'Electro primes all hit enemies for Flamethrower bonus',
      'Higher fire rate than other attack towers',
    ],
    synergies: ['Tesla → Flamethrower: prime an entire group for +50% fire bonus', 'Tesla + Mortar: Tesla groups and primes, Mortar cleans up'],
    designNote: 'Best value against medium-sized groups. Loses efficiency against single large targets.',
    upgradeHighlight: 'Lv2: chain length increases to 6 targets',
  },
]

const ENEMIES = [
  {
    name: 'Scout',
    size: 'Small',
    speed: 'Fast',
    hp: 60, speed_val: 5.5, dmg: 8, drop: 5,
    color: '#fbbf24',
    icon: '🏃',
    armor: { shell: 1.5, electro: 1.0, ice: 0.8, fire: 1.0 },
    threat: 'Low',
    description: 'Fast and fragile. Arrives in large numbers early. Shell towers struggle due to their speed — they often outrun projectiles.',
    tactics: [
      'Weak to Ice effects — Freezer/FrostAround makes them trivial',
      'Shell towers miss frequently at high speed — use Energy (laser always hits)',
      'Their low HP makes them currency pinatas if towers are positioned early on the path',
    ],
    designNote: 'Scouts pressure players who lack early path coverage. Place towers near spawn for scouts.',
  },
  {
    name: 'Grunt',
    size: 'Medium',
    speed: 'Normal',
    hp: 150, speed_val: 3.0, dmg: 15, drop: 10,
    color: '#94a3b8',
    icon: '🧟',
    armor: { shell: 1.0, electro: 1.0, ice: 1.0, fire: 1.0 },
    threat: 'Medium',
    description: 'Balanced in every stat. No armor weaknesses or resistances. The most common enemy — forms the backbone of mid-game waves.',
    tactics: [
      'No special weaknesses — all tower types perform equally',
      'In groups, Tesla and Mortar AoE is most efficient',
      'They deal meaningful damage if they reach Transport',
    ],
    designNote: 'Use Grunts as the filler in waves. Pure HP pools without tricks.',
  },
  {
    name: 'Brute',
    size: 'Large',
    speed: 'Slow',
    hp: 400, speed_val: 1.5, dmg: 35, drop: 25,
    color: '#ef4444',
    icon: '👹',
    armor: { shell: 0.8, electro: 1.2, ice: 1.0, fire: 1.5 },
    threat: 'High',
    description: 'Massive HP pool, slow movement. High damage if it reaches Transport. Resistant to Shell, highly vulnerable to Electro and Fire combo.',
    tactics: [
      'Energy laser is ideal — high DPS and pierces armor',
      'Electro → Fire combo deals effectively 1.2 × 1.5 = ×1.8 damage multiplier',
      'Slow speed makes them easy targets for Ballistic and Mortar',
      'Despite low speed, their DPS at Transport is lethal — do not let them through',
    ],
    designNote: 'Brutes are the boss-adjacent threat. One Brute reaching Transport is worth 5+ seconds of HP loss.',
  },
]

const ARMOR_EFFECT_LABELS = {
  shell: { icon: '💣', label: 'Shell' },
  electro: { icon: '⚡', label: 'Electro' },
  ice: { icon: '❄️', label: 'Ice' },
  fire: { icon: '🔥', label: 'Fire' },
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatBadge({ label, value, color = 'gray' }) {
  const colors = {
    orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    green: 'bg-green-500/15 text-green-300 border-green-500/30',
    red: 'bg-red-500/15 text-red-300 border-red-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    gray: 'bg-gray-700/60 text-gray-300 border-gray-600',
  }
  return (
    <div className={`inline-flex flex-col items-center px-3 py-1.5 rounded-lg border text-center ${colors[color]}`}>
      <span className="text-xs opacity-70 leading-none mb-0.5">{label}</span>
      <span className="text-sm font-bold leading-none">{value}</span>
    </div>
  )
}

function ArmorTable({ armor }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Object.entries(armor).map(([k, v]) => {
        const { icon, label } = ARMOR_EFFECT_LABELS[k] || {}
        const isWeak = v > 1
        const isResist = v < 1
        return (
          <div
            key={k}
            className={`rounded-lg p-2 text-center border ${
              isWeak ? 'bg-red-500/10 border-red-500/30' :
              isResist ? 'bg-green-500/10 border-green-500/30' :
              'bg-gray-800 border-gray-700'
            }`}
          >
            <div className="text-base leading-none mb-0.5">{icon}</div>
            <div className="text-xs text-gray-400 leading-none">{label}</div>
            <div className={`text-sm font-bold mt-0.5 ${isWeak ? 'text-red-400' : isResist ? 'text-green-400' : 'text-gray-400'}`}>
              {v}×
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SectionHeader({ title, subtitle, gradient }) {
  return (
    <div className={`rounded-xl p-5 mb-6 ${gradient}`}>
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {subtitle && <p className="text-sm mt-1 text-white/70">{subtitle}</p>}
    </div>
  )
}

function InfoCard({ title, children, accent = 'orange' }) {
  const border = {
    orange: 'border-orange-500/30',
    blue: 'border-blue-500/30',
    green: 'border-green-500/30',
    red: 'border-red-500/30',
    purple: 'border-purple-500/30',
  }[accent] || 'border-gray-700'
  return (
    <div className={`bg-gray-800/60 border ${border} rounded-xl p-5`}>
      {title && <h3 className="font-semibold text-gray-100 mb-3 text-sm uppercase tracking-wider">{title}</h3>}
      {children}
    </div>
  )
}

// ─── Section components ────────────────────────────────────────────────────

function Overview() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Game Overview"
        subtitle="Top-down tower defense raid with a free-roaming player and strategic base building"
        gradient="bg-gradient-to-r from-orange-600/40 to-amber-700/40 border border-orange-500/20"
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard title="Genre" accent="orange">
          <p className="text-gray-300 text-sm leading-relaxed">
            Tower Defense + Action RPG hybrid. Player moves freely during waves, placing
            and upgrading towers while also fighting directly alongside AI squad members.
          </p>
        </InfoCard>
        <InfoCard title="View & Movement" accent="blue">
          <p className="text-gray-300 text-sm leading-relaxed">
            Top-down isometric view. Player controls via joystick — full free movement
            at all times. No pause during waves. All decisions happen in real time.
          </p>
        </InfoCard>
        <InfoCard title="Session Length" accent="green">
          <p className="text-gray-300 text-sm leading-relaxed">
            10–20 minutes per raid. Designed as a rogue-lite: in-session currency and
            towers reset each run. Meta progression carries between sessions.
          </p>
        </InfoCard>
      </div>
      <InfoCard title="Core Pillars" accent="purple">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: '🏗️', title: 'Build & Upgrade', desc: 'Place towers in designated slots using currency dropped by enemies. Upgrade existing towers up to Lv3.' },
            { icon: '⚔️', title: 'Active Combat', desc: 'Player and squad members fight directly. Your movement and positioning affects squad effectiveness.' },
            { icon: '🌊', title: 'Wave Escalation', desc: 'Up to 15 waves per raid. Each wave grows in size and composition. Zone Blockers unlock new strategic depth mid-raid.' },
            { icon: '🔓', title: 'Zone Expansion', desc: 'Clearing waves opens Zone Blockers — extending the enemy path and unlocking new tower slot clusters.' },
          ].map(p => (
            <div key={p.title} className="flex gap-3">
              <span className="text-2xl">{p.icon}</span>
              <div>
                <h4 className="font-semibold text-gray-200 text-sm">{p.title}</h4>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </InfoCard>
    </div>
  )
}

function CoreLoop() {
  const steps = [
    { wave: 'Wave Start', color: 'bg-blue-500', icon: '▶', desc: 'Enemy group spawns at designated spawn point. Player has a short prep window (5 sec) before enemies begin moving.' },
    { wave: 'Combat Phase', color: 'bg-red-500', icon: '⚔️', desc: 'Enemies march the path toward Transport. Towers fire automatically. Player and squad engage freely.' },
    { wave: 'Kill & Collect', color: 'bg-yellow-500', icon: '💰', desc: 'Each killed enemy drops raid currency. Currency is used immediately — no saves between waves.' },
    { wave: 'Build Window', color: 'bg-green-500', icon: '🏗️', desc: 'Between waves: build new towers or upgrade existing ones. Zone Blockers may open, revealing new slots.' },
    { wave: 'Next Wave', color: 'bg-purple-500', icon: '🔄', desc: 'Repeat with larger/more varied enemy groups. Raid ends at Wave 15, or if Transport HP reaches 0.' },
  ]
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Core Gameplay Loop"
        subtitle="5-step cycle that repeats for up to 15 waves per raid"
        gradient="bg-gradient-to-r from-blue-600/40 to-cyan-700/40 border border-blue-500/20"
      />
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-4 bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
            <div className={`w-10 h-10 rounded-full ${s.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
              {i + 1}
            </div>
            <div>
              <h3 className="font-semibold text-gray-100 text-sm">{s.wave}</h3>
              <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="Wave Scaling Formula" accent="orange">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-300"><span>Wave 1</span><span className="text-gray-500">10 enemies · ~30 sec · 1 tower slot</span></div>
            <div className="flex justify-between text-gray-300"><span>Wave 5</span><span className="text-gray-500">~15 enemies · ~45 sec · 2 slots</span></div>
            <div className="flex justify-between text-gray-300"><span>Wave 10</span><span className="text-gray-500">~18 enemies · ~60 sec · 3 slots</span></div>
            <div className="flex justify-between text-gray-300"><span>Wave 15</span><span className="text-gray-500">~20 enemies · ~75 sec · 3+ slots</span></div>
          </div>
        </InfoCard>
        <InfoCard title="Economy Flow" accent="green">
          <div className="space-y-2 text-sm text-gray-300">
            <p>• <span className="text-yellow-400">Scout</span> drops 5 💰 · <span className="text-gray-400">Grunt</span> 10 💰 · <span className="text-red-400">Brute</span> 25 💰</p>
            <p>• Average wave: ~100–300 💰 earned</p>
            <p>• Target: player can afford 1 new tower OR 1 upgrade per wave</p>
            <p>• Starting currency: 200 💰 (configurable)</p>
          </div>
        </InfoCard>
      </div>
    </div>
  )
}

function LevelAnatomy() {
  const zones = [
    { name: 'Combat Zone', color: 'bg-red-500/20 border-red-500/40', icon: '⚔️', desc: 'The main tower defense area. Contains the enemy path, all tower slots, Zone Blockers, and the Transport landing zone.' },
    { name: 'Explore Zone', color: 'bg-orange-500/20 border-orange-500/40', icon: '🗺️', desc: 'Open exploration area between raids. Player can gather resources, find upgrades, and prepare for the next raid. No active enemies.' },
    { name: 'Tutorial Zone', color: 'bg-green-500/20 border-green-500/40', icon: '📖', desc: 'Isolated onboarding area. Introduces core mechanics — movement, building, waves — in a safe environment.' },
  ]
  const mapElements = [
    { icon: '🏔️', name: 'Mountains', desc: 'Impassable terrain — blocks both enemies and players' },
    { icon: '🕳️', name: 'Abyss', desc: 'Cliff/gap — falls are fatal, cannot be crossed' },
    { icon: '🏢', name: 'Building (Eternal)', desc: 'Permanent structure, indestructible' },
    { icon: '🔧', name: 'Building (Tool 12+)', desc: 'Accessible once player has Tool Level 12 or higher' },
    { icon: '⚙️', name: 'Building (Tool 30+)', desc: 'Accessible once player has Tool Level 30 or higher' },
    { icon: '🛣️', name: 'Road', desc: 'Enemy patrol path and player movement corridor' },
    { icon: '🪜', name: 'Stairs', desc: 'Connects ground floor to second floor area' },
    { icon: '🟧', name: 'Wave Fence', desc: 'Boundary that activates when a wave begins — traps enemies inside zone' },
  ]
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Level Anatomy"
        subtitle="How a raid level is structured — zones, terrain, and map elements"
        gradient="bg-gradient-to-r from-teal-600/40 to-emerald-700/40 border border-teal-500/20"
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {zones.map(z => (
          <div key={z.name} className={`border rounded-xl p-5 ${z.color}`}>
            <div className="text-3xl mb-2">{z.icon}</div>
            <h3 className="font-bold text-gray-100 mb-2">{z.name}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{z.desc}</p>
          </div>
        ))}
      </div>
      <InfoCard title="Path Design" accent="blue">
        <div className="space-y-2 text-sm text-gray-300">
          <p>• Enemies follow a <span className="text-blue-300 font-medium">single defined path</span> from spawn point to Transport</p>
          <p>• Path can include <span className="text-blue-300 font-medium">1–2 splits</span> that rejoin — creates multiple tower coverage opportunities</p>
          <p>• Path gets longer as Zone Blockers open — more path = more tower coverage = more DPS opportunity</p>
          <p>• Curves and S-shapes allow towers near the bend to cover both approach and exit</p>
        </div>
      </InfoCard>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {mapElements.map(e => (
          <div key={e.name} className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
            <div className="text-2xl mb-1">{e.icon}</div>
            <div className="text-xs font-semibold text-gray-200 mb-0.5">{e.name}</div>
            <div className="text-xs text-gray-500 leading-tight">{e.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GameObjects() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Game Objects"
        subtitle="Interactive elements placed on the level map"
        gradient="bg-gradient-to-r from-violet-600/40 to-purple-700/40 border border-violet-500/20"
      />

      {/* Turret Placement Point */}
      <InfoCard title="Turret Placement Point" accent="orange">
        <p className="text-sm text-gray-400 mb-4">Slots placed along or near the enemy path. Players interact to build or upgrade towers here.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { state: 'Corrupted', icon: '🔴', color: 'border-red-500/40 bg-red-500/10', desc: 'Locked. Player must clear X waves before this slot becomes available. Shows "Clear X waves" pop-up on approach.' },
            { state: 'Empty', icon: '🟡', color: 'border-yellow-500/40 bg-yellow-500/10', desc: 'Available to build. Shows tower cost pop-up always. During active waves, all tower UI is hidden to reduce clutter.' },
            { state: 'Built', icon: '🟢', color: 'border-green-500/40 bg-green-500/10', desc: 'Tower is installed and active. Shows upgrade options. Can be sold or upgraded during the build window.' },
          ].map(s => (
            <div key={s.state} className={`border rounded-lg p-3 ${s.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{s.icon}</span>
                <span className="font-semibold text-gray-200 text-sm">{s.state}</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Transport */}
      <InfoCard title="Transport (Player's Ship)" accent="blue">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              The player's spacecraft that always lands at the designated Transport Landing Zone at the start of each raid.
              All squad members arrive with it.
            </p>
            <ul className="space-y-1 text-sm text-gray-400">
              <li>• Has its own HP pool — the raid's "life" bar</li>
              <li>• Enemies that reach Transport attack it continuously until killed</li>
              <li>• First tower slot should always cover the Transport zone</li>
              <li>• Transport HP carries across waves — damage is permanent within a raid</li>
            </ul>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Default HP</span><span className="text-blue-300 font-bold">1000</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">HP resets</span><span className="text-gray-300">Each new raid session</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Lose condition</span><span className="text-red-400">Transport HP = 0</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Win condition</span><span className="text-green-400">Survive all waves</span></div>
          </div>
        </div>
      </InfoCard>

      {/* Zone Blocker */}
      <InfoCard title="Zone Blocker (Gate / Fog)" accent="purple">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              Barriers placed across the enemy path that block progression. Visually represented as gates, force fields, or fog walls.
              When cleared, they open permanently for the rest of the raid.
            </p>
            <ul className="space-y-1 text-sm text-gray-400">
              <li>• Opens after player clears N waves (configurable)</li>
              <li>• Reveals new path segment — enemies travel further</li>
              <li>• Unlocks new tower slot cluster in the revealed area</li>
              <li>• Player must physically move past the blocker to access new slots</li>
              <li>• Recommended unlock gates: waves 3, 7, 12</li>
            </ul>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Strategic Impact</p>
            <div className="space-y-2 text-sm">
              <div className="bg-gray-900/60 rounded p-2">
                <span className="text-purple-300 font-medium">Longer path</span>
                <span className="text-gray-400"> = enemies spend more time getting to Transport</span>
              </div>
              <div className="bg-gray-900/60 rounded p-2">
                <span className="text-purple-300 font-medium">More tower slots</span>
                <span className="text-gray-400"> = higher total DPS ceiling</span>
              </div>
              <div className="bg-gray-900/60 rounded p-2">
                <span className="text-purple-300 font-medium">Forces movement</span>
                <span className="text-gray-400"> = player explores the map, not just sits at Transport</span>
              </div>
            </div>
          </div>
        </div>
      </InfoCard>
    </div>
  )
}

function TowersSection() {
  const [selected, setSelected] = useState(0)
  const liveData = useContext(LiveDataCtx)
  const tower = TOWERS[selected]
  // Merge live API stats by tower name
  const liveTower = liveData?.towers?.find(t => t.name === tower.name)
  const categoryColor = {
    Attack: 'bg-red-500/15 text-red-400 border-red-500/30',
    Debuff: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Support: 'bg-green-500/15 text-green-400 border-green-500/30',
  }
  const dpsColor = { High: 'orange', Medium: 'yellow', Low: 'blue', '—': 'gray' }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tower Reference"
        subtitle="8 tower types across Attack, Debuff, and Support categories"
        gradient="bg-gradient-to-r from-orange-600/40 to-red-700/40 border border-orange-500/20"
      />
      <div className="flex gap-2 flex-wrap">
        {TOWERS.map((t, i) => (
          <button
            key={t.name}
            onClick={() => setSelected(i)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              selected === i
                ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            <span>{t.icon}</span>
            {t.name}
          </button>
        ))}
      </div>

      <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
        {/* Tower header */}
        <div className="p-5 border-b border-gray-700" style={{ borderLeftColor: tower.color, borderLeftWidth: 4 }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: tower.color + '30', border: `1px solid ${tower.color}60` }}>
                {tower.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-100">{tower.name}</h2>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${categoryColor[tower.category]}`}>{tower.category}</span>
                  <span className="text-xs px-2 py-0.5 rounded border bg-gray-700/60 text-gray-300 border-gray-600">{tower.effect} Effect</span>
                  <span className="text-xs px-2 py-0.5 rounded border bg-gray-700/60 text-gray-300 border-gray-600">{tower.pattern}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {liveTower ? (
                <>
                  <StatBadge label="DPS" value={liveTower.base_dps} color="orange" />
                  <StatBadge label="Range" value={liveTower.base_range} color="blue" />
                  <StatBadge label="Cost" value={`${liveTower.base_cost}💰`} color="yellow" />
                  {liveTower.slow_factor > 0 && <StatBadge label="Slow" value={`${(liveTower.slow_factor*100).toFixed(0)}%`} color="blue" />}
                  {liveTower.boost_mult > 1 && <StatBadge label="Boost" value={`×${liveTower.boost_mult}`} color="green" />}
                </>
              ) : (
                <>
                  <StatBadge label="DPS" value={tower.dps} color={dpsColor[tower.dps] || 'gray'} />
                  <StatBadge label="Range" value={tower.range} color="blue" />
                  <StatBadge label="Cost" value={tower.cost} color="yellow" />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Description</h4>
              <p className="text-sm text-gray-300 leading-relaxed">{tower.description}</p>
            </div>
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Mechanics</h4>
              <ul className="space-y-1">
                {tower.mechanics.map((m, i) => (
                  <li key={i} className="text-sm text-gray-400 flex gap-2">
                    <span className="text-orange-400 flex-shrink-0">›</span>
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Synergies</h4>
              {tower.synergies.map((s, i) => (
                <div key={i} className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 mb-1.5">
                  <p className="text-sm text-green-300">{s}</p>
                </div>
              ))}
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
              <h4 className="text-xs text-orange-400 uppercase tracking-wider mb-1">Designer Note</h4>
              <p className="text-sm text-gray-300">{tower.designNote}</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <h4 className="text-xs text-yellow-400 uppercase tracking-wider mb-1">Upgrade Highlight</h4>
              <p className="text-sm text-gray-300">{tower.upgradeHighlight}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade table */}
      <InfoCard title="Upgrade Cost Reference (All Towers)" accent="orange">
        {liveData?.towers?.length > 0 && (
          <p className="text-[10px] text-green-400/70 mb-2">✓ Live data from backend</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-500 pb-2 pr-4">Tower</th>
                <th className="text-center text-gray-500 pb-2 px-3">Lv0 DPS</th>
                <th className="text-center text-gray-500 pb-2 px-3">Lv1</th>
                <th className="text-center text-gray-500 pb-2 px-3">Lv2</th>
                <th className="text-center text-gray-500 pb-2 px-3">Lv3</th>
                <th className="text-center text-gray-500 pb-2 px-3">Base Cost</th>
                <th className="text-center text-gray-500 pb-2 px-3">Upg Costs</th>
              </tr>
            </thead>
            <tbody>
              {TOWERS.filter(t => t.dps !== '—').map(t => {
                const live = liveData?.towers?.find(lt => lt.name === t.name)
                const baseDPS = live?.base_dps ?? ({ High: 70, Medium: 40, Low: 15 }[t.dps] || 0)
                const baseCost = live?.base_cost ?? ({ High: 120, Medium: 90, Low: 70 }[t.dps] || 80)
                const dpsMults = live ? JSON.parse(live.upgrade_dps_mults || '[1,1.6,2.5,4]') : [1, 1.6, 2.5, 4.0]
                const costMults = live ? JSON.parse(live.upgrade_costs || '[0,0.6,1.0,1.5]') : [0, 0.6, 1.0, 1.5]
                return (
                  <tr key={t.name} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className="py-2 pr-4 font-medium text-gray-200">
                      <span className="mr-2">{t.icon}</span>{t.name}
                    </td>
                    {dpsMults.map((m, i) => (
                      <td key={i} className="text-center py-2 px-3 text-orange-400">
                        {(baseDPS * m).toFixed(0)}
                        <span className="text-[10px] text-gray-600 ml-0.5">×{m}</span>
                      </td>
                    ))}
                    <td className="text-center py-2 px-3 text-yellow-400">{baseCost} 💰</td>
                    <td className="text-center py-2 px-3 text-gray-500 text-xs">
                      {costMults.slice(1).map((m, i) => (
                        <span key={i} className="mr-1">{Math.round(baseCost * m)}💰</span>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </InfoCard>
    </div>
  )
}

function EnemiesSection() {
  const [selected, setSelected] = useState(0)
  const liveData = useContext(LiveDataCtx)
  const enemy = ENEMIES[selected]
  // Merge live API stats by enemy name
  const liveEnemy = liveData?.enemies?.find(e => e.name === enemy.name)
  const armorMults = liveEnemy ? (() => { try { return JSON.parse(liveEnemy.armor_multipliers) } catch { return enemy.armor } })() : enemy.armor
  const threatColor = { Low: 'text-green-400', Medium: 'text-yellow-400', High: 'text-red-400' }
  const sizeColor = { Small: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', Medium: 'bg-blue-500/15 text-blue-300 border-blue-500/30', Large: 'bg-red-500/15 text-red-300 border-red-500/30' }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Enemy Reference"
        subtitle="3 enemy archetypes with distinct threat profiles"
        gradient="bg-gradient-to-r from-red-600/40 to-rose-700/40 border border-red-500/20"
      />
      <div className="flex gap-3">
        {ENEMIES.map((e, i) => (
          <button
            key={e.name}
            onClick={() => setSelected(i)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all flex-1 justify-center ${
              selected === i
                ? 'border-red-500 bg-red-500/20 text-red-300'
                : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500'
            }`}
          >
            <span className="text-xl">{e.icon}</span>
            {e.name}
          </button>
        ))}
      </div>

      <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-gray-700" style={{ borderLeftColor: enemy.color, borderLeftWidth: 4 }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-3xl" style={{ backgroundColor: enemy.color + '25' }}>
                {enemy.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-100">{enemy.name}</h2>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${sizeColor[enemy.size]}`}>{enemy.size}</span>
                  <span className="text-xs px-2 py-0.5 rounded border bg-gray-700/60 text-gray-300 border-gray-600">{enemy.speed} Speed</span>
                  <span className={`text-xs font-semibold ${threatColor[enemy.threat]}`}>⚠ {enemy.threat} Threat</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatBadge label="HP" value={liveEnemy?.hp ?? enemy.hp} color="red" />
              <StatBadge label="Speed" value={`${liveEnemy?.speed ?? enemy.speed_val} u/s`} color="yellow" />
              <StatBadge label="Dmg/s" value={liveEnemy?.damage_per_sec ?? enemy.dmg} color="orange" />
              <StatBadge label="Drop" value={`${liveEnemy?.currency_drop ?? enemy.drop} 💰`} color="green" />
              {liveData?.enemies && <span className="col-span-2 text-[10px] text-green-400/60 text-right">✓ live stats</span>}
            </div>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Profile</h4>
              <p className="text-sm text-gray-300 leading-relaxed">{enemy.description}</p>
            </div>
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Tactics</h4>
              <ul className="space-y-1.5">
                {enemy.tactics.map((t, i) => (
                  <li key={i} className="text-sm text-gray-400 flex gap-2">
                    <span className="text-red-400 flex-shrink-0">›</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <h4 className="text-xs text-red-400 uppercase tracking-wider mb-1">Designer Note</h4>
              <p className="text-sm text-gray-300">{enemy.designNote}</p>
            </div>
          </div>
          <div>
            <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Armor Multipliers</h4>
            <ArmorTable armor={armorMults} />
            <p className="text-xs text-gray-500 mt-3">
              Values below 1× = resistant (less damage taken). Above 1× = vulnerable (more damage taken).
            </p>
            <div className="mt-4 bg-gray-900/60 rounded-lg p-3">
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Best Against</h4>
              {Object.entries(armorMults)
                .filter(([, v]) => v >= 1.2)
                .map(([k]) => (
                  <span key={k} className="inline-flex items-center gap-1 bg-red-500/15 border border-red-500/30 text-red-300 text-xs px-2 py-1 rounded mr-1 mb-1">
                    {ARMOR_EFFECT_LABELS[k]?.icon} {ARMOR_EFFECT_LABELS[k]?.label} towers
                  </span>
                ))}
              {Object.entries(armorMults).every(([, v]) => v === 1.0) && (
                <span className="text-xs text-gray-500">No particular weakness — all damage types equal</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SquadSection() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Squad System"
        subtitle="Player + up to 4 AI companions — mobile mini-towers that follow your lead"
        gradient="bg-gradient-to-r from-cyan-600/40 to-blue-700/40 border border-cyan-500/20"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="Player Character" accent="blue">
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex gap-2"><span className="text-blue-400">›</span> Controlled via joystick — free roam at all times</li>
            <li className="flex gap-2"><span className="text-blue-400">›</span> Equips ranged weapons (pistol → SMG → rifle etc.)</li>
            <li className="flex gap-2"><span className="text-blue-400">›</span> Weapon loadout is part of meta-progression</li>
            <li className="flex gap-2"><span className="text-blue-400">›</span> DPS depends on weapon tier and player level</li>
            <li className="flex gap-2"><span className="text-blue-400">›</span> Can be boosted by BoostData tower aura</li>
            <li className="flex gap-2"><span className="text-blue-400">›</span> Positioning matters — player near Transport = squads defend it</li>
          </ul>
        </InfoCard>
        <InfoCard title="AI Companions" accent="cyan">
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex gap-2"><span className="text-cyan-400">›</span> Up to 4–5 humanoid NPCs following the player</li>
            <li className="flex gap-2"><span className="text-cyan-400">›</span> Act as mobile towers that move with you</li>
            <li className="flex gap-2"><span className="text-cyan-400">›</span> Auto-attack enemies within their range</li>
            <li className="flex gap-2"><span className="text-cyan-400">›</span> Companion level upgrades in meta (outside raids)</li>
            <li className="flex gap-2"><span className="text-cyan-400">›</span> Each companion has own HP pool — can die mid-raid</li>
            <li className="flex gap-2"><span className="text-cyan-400">›</span> Revive at wave start if killed</li>
          </ul>
        </InfoCard>
      </div>
      <InfoCard title="Squad as a Balance Factor" accent="green">
        <p className="text-sm text-gray-300 mb-4 leading-relaxed">
          The squad's combined DPS is an important balance lever. On early waves it may carry the load while towers are still being built.
          On late waves, towers dominate and squad becomes supplementary.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-900/60 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Player DPS (default)</p>
            <p className="text-lg font-bold text-blue-400">50</p>
            <p className="text-xs text-gray-600">configurable</p>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Companion DPS each</p>
            <p className="text-lg font-bold text-cyan-400">30</p>
            <p className="text-xs text-gray-600">× 4 companions = 120</p>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Total Squad DPS</p>
            <p className="text-lg font-bold text-green-400">170</p>
            <p className="text-xs text-gray-600">before boosts</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Squad covers the transport zone (last ~15% of path) — enemies that break through towers face the squad as a last line of defense.
        </p>
      </InfoCard>
    </div>
  )
}

function SynergiesSection() {
  const combos = [
    {
      name: 'The Ice + Laser',
      towers: ['Freezer', 'Energy'],
      rating: 'S',
      color: 'border-sky-500/40 bg-sky-500/5',
      desc: 'Freezer halves enemy speed → Energy laser deals full DPS for twice as long per enemy. Effectively doubles Energy DPS output.',
      wave: 'All waves',
    },
    {
      name: 'Electro Igniter',
      towers: ['Tesla / Energy', 'Flamethrower'],
      rating: 'S',
      color: 'border-orange-500/40 bg-orange-500/5',
      desc: 'Tesla or Energy applies Electro debuff. Flamethrower deals +50% damage to Electro targets. Chain-prime large groups for devastating burns.',
      wave: 'Mid–Late waves (Brutes)',
    },
    {
      name: 'The Clustered Death',
      towers: ['FrostAround', 'Mortar'],
      rating: 'A',
      color: 'border-purple-500/40 bg-purple-500/5',
      desc: 'FrostAround clusters and slows enemies. Mortar\'s AoE splash hits a dense slow-moving pack for maximum per-shot damage.',
      wave: 'Dense group waves',
    },
    {
      name: 'The Boost Stack',
      towers: ['BoostData', 'Ballistic × 2'],
      rating: 'A',
      color: 'border-green-500/40 bg-green-500/5',
      desc: 'BoostData ×1.4 multiplier on two upgraded Ballistic towers can outperform 3 unbooked towers. Best cost-per-DPS ratio.',
      wave: 'Resource-limited early game',
    },
    {
      name: 'Triple Ice Lock',
      towers: ['Freezer', 'FrostAround', 'Ballistic'],
      rating: 'B',
      color: 'border-blue-500/40 bg-blue-500/5',
      desc: 'Double ice slow (Freezer + FrostAround) reduces target speed to near zero. Ballistic shells can\'t miss. Strong against Scout waves.',
      wave: 'Scout-heavy waves',
    },
    {
      name: 'Zone Denial',
      towers: ['FrostAround', 'Tesla', 'Flamethrower'],
      rating: 'A',
      color: 'border-red-500/40 bg-red-500/5',
      desc: 'FrostAround keeps enemies in the zone. Tesla primes with Electro. Flamethrower burns for full bonus damage. Great chokepoint setup.',
      wave: 'Brute + Grunt mixed waves',
    },
  ]
  const ratingColor = { S: 'bg-yellow-500 text-black', A: 'bg-orange-500 text-white', B: 'bg-blue-500 text-white' }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tower Synergies"
        subtitle="Effective tower combinations and when to use them"
        gradient="bg-gradient-to-r from-green-600/40 to-emerald-700/40 border border-green-500/20"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {combos.map(c => (
          <div key={c.name} className={`border rounded-xl p-5 ${c.color}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-100">{c.name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {c.towers.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-gray-700/80 text-gray-300 border border-gray-600">{t}</span>
                  ))}
                </div>
              </div>
              <span className={`text-sm font-black w-8 h-8 rounded-lg flex items-center justify-center ${ratingColor[c.rating]}`}>
                {c.rating}
              </span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed mb-2">{c.desc}</p>
            <p className="text-xs text-gray-500">Best for: <span className="text-gray-400">{c.wave}</span></p>
          </div>
        ))}
      </div>
    </div>
  )
}

function BalanceGuide() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Balance Design Guide"
        subtitle="Practical guidelines for designing fair, engaging levels"
        gradient="bg-gradient-to-r from-amber-600/40 to-yellow-700/40 border border-amber-500/20"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="The 3-Tower Rule" accent="orange">
          <p className="text-sm text-gray-300 mb-3">For any level to feel winnable by a new player:</p>
          <ul className="space-y-1.5 text-sm text-gray-400">
            <li className="flex gap-2"><span className="text-orange-400">1.</span> Tower near spawn (catches fast enemies early)</li>
            <li className="flex gap-2"><span className="text-orange-400">2.</span> Tower mid-path (main DPS coverage)</li>
            <li className="flex gap-2"><span className="text-orange-400">3.</span> Tower near Transport (last-line defense)</li>
          </ul>
          <p className="text-xs text-gray-500 mt-3">All 3 should be fundable within the first 3 waves of currency earnings.</p>
        </InfoCard>

        <InfoCard title="Currency Balance Check" accent="green">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Wave earnings should cover</span>
              <span className="text-green-400">1 tower or 1 upgrade</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>By wave 5 player should afford</span>
              <span className="text-green-400">2 base towers</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>By wave 10 player should have</span>
              <span className="text-green-400">3+ towers, 1 upgraded</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Full build (wave 15 target)</span>
              <span className="text-green-400">5–6 towers, some Lv2+</span>
            </div>
          </div>
        </InfoCard>

        <InfoCard title="DPS vs HP Ratio" accent="blue">
          <p className="text-sm text-gray-300 mb-3">
            For each wave to feel <span className="text-blue-300">comfortable</span> (most enemies killed before Transport):
          </p>
          <div className="bg-gray-900/60 rounded-lg p-3 font-mono text-sm text-center">
            <p className="text-gray-500 text-xs mb-1">target formula</p>
            <p className="text-blue-300">Total DPS × Path Time ≥ Wave Total HP × 0.8</p>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Leaving 20% leakage makes it feel tense but survivable. Over 30% leakage = player loses Transport HP fast.
          </p>
        </InfoCard>

        <InfoCard title="Zone Blocker Timing" accent="purple">
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex items-center gap-3 bg-gray-900/60 rounded-lg p-2">
              <span className="text-purple-400 font-bold w-16 flex-shrink-0">Wave 3</span>
              <span className="text-gray-400">Open first Zone Blocker — reward early progress</span>
            </div>
            <div className="flex items-center gap-3 bg-gray-900/60 rounded-lg p-2">
              <span className="text-purple-400 font-bold w-16 flex-shrink-0">Wave 7</span>
              <span className="text-gray-400">Open second zone — just before difficulty spike</span>
            </div>
            <div className="flex items-center gap-3 bg-gray-900/60 rounded-lg p-2">
              <span className="text-purple-400 font-bold w-16 flex-shrink-0">Wave 12</span>
              <span className="text-gray-400">Final zone — endgame stretch, maximum path length</span>
            </div>
          </div>
        </InfoCard>
      </div>

      <InfoCard title="Common Balance Pitfalls" accent="red">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { problem: 'Starting currency too low', fix: 'Player can\'t afford first tower → set ≥150 starting currency' },
            { problem: 'First zone blocker too late', fix: 'Wave 7+ first unlock feels punishing → open at wave 3' },
            { problem: 'Transport dies to scouts', fix: 'No coverage near spawn — always place a tower slot near start' },
            { problem: 'Brute wave before Electro/Fire available', fix: 'Brutes before wave 6 with no high-DPS tower = unwinnable' },
            { problem: 'Too many slots, not enough currency', fix: 'Empty slots = wasted potential, reduce slots or increase drops' },
            { problem: 'All slots mid-path, none at Transport', fix: 'Always include at least 2 slots covering the Transport zone' },
          ].map(p => (
            <div key={p.problem} className="bg-gray-900/60 rounded-lg p-3">
              <p className="text-sm font-medium text-red-400 mb-1">⚠ {p.problem}</p>
              <p className="text-xs text-gray-400">{p.fix}</p>
            </div>
          ))}
        </div>
      </InfoCard>
    </div>
  )
}

function LevelFlow() {
  const steps = [
    {
      phase: 'Intro Cinematic',
      icon: '🎬',
      color: 'bg-purple-500/20 border-purple-500/40',
      details: [
        'Camera flies across the entire raid map — from Transport landing zone to the final path section',
        'Enemies and corrupted porta are pre-placed so the environment looks alive during the flyover',
        'These can be removed post-cinematic for performance optimization',
        'Duration: ~5–8 seconds. Cannot be skipped on first play.',
      ],
    },
    {
      phase: 'Transport Landing',
      icon: '🚀',
      color: 'bg-blue-500/20 border-blue-500/40',
      details: [
        'Ship descends to the Transport Landing Zone with landing animation',
        'Player character and all squad members appear near the ship (Fade In / teleport effect)',
        'Player gains control immediately after the landing sequence',
        'Pre-wave prep window begins — player can explore and plan tower placement',
      ],
    },
    {
      phase: 'Quest 1 — Clear and Collect',
      icon: '⚔️',
      color: 'bg-red-500/20 border-red-500/40',
      details: [
        'Objective: Kill enemies and destroy 1 heart (corrupted node) to earn starting currency',
        'This first mini-wave is light — designed to teach combat without pressure',
        'Currency drop from this quest funds the first tower',
        'Wave ends when all enemies and the heart are destroyed',
      ],
    },
    {
      phase: 'Quest 2 — Build First Tower',
      icon: '🏗️',
      color: 'bg-orange-500/20 border-orange-500/40',
      details: [
        'Objective: Spend earned currency to build a tower at a nearby slot',
        'The nearest slot to Transport should be highlighted as suggested placement',
        'This teaches the building mechanic in context',
        'Completing this quest unlocks the main wave sequence',
      ],
    },
    {
      phase: 'Main Raid (Waves 1–15)',
      icon: '🌊',
      color: 'bg-green-500/20 border-green-500/40',
      details: [
        'Remote parameter sets starting currency (override for testing/balancing)',
        'Waves escalate in size, type diversity, and frequency',
        'Zone Blockers open based on wave milestones (3, 7, 12 recommended)',
        'Raid ends at Wave 15 completion (victory) or Transport HP = 0 (defeat)',
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Level Flow"
        subtitle="Sequence of events from raid start to first combat wave"
        gradient="bg-gradient-to-r from-indigo-600/40 to-purple-700/40 border border-indigo-500/20"
      />
      <div className="relative">
        <div className="absolute left-8 top-0 bottom-0 w-px bg-gray-700" />
        <div className="space-y-4">
          {steps.map((s, i) => (
            <div key={s.phase} className="flex gap-4">
              <div className={`w-16 h-16 rounded-xl border flex flex-col items-center justify-center flex-shrink-0 z-10 ${s.color}`}>
                <span className="text-2xl">{s.icon}</span>
                <span className="text-xs font-bold text-gray-400">{i + 1}</span>
              </div>
              <div className="flex-1 bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h3 className="font-semibold text-gray-100 mb-2">{s.phase}</h3>
                <ul className="space-y-1">
                  {s.details.map((d, j) => (
                    <li key={j} className="text-sm text-gray-400 flex gap-2">
                      <span className="text-gray-600 flex-shrink-0">•</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

const SECTION_COMPONENTS = {
  'Overview': Overview,
  'Core Loop': CoreLoop,
  'Level Anatomy': LevelAnatomy,
  'Game Objects': GameObjects,
  'Towers': TowersSection,
  'Enemies': EnemiesSection,
  'Squad': SquadSection,
  'Synergies': SynergiesSection,
  'Balance Guide': BalanceGuide,
  'Level Flow': LevelFlow,
}

export default function DesignDocs() {
  const [active, setActive] = useState('Overview')
  const [liveData, setLiveData] = useState(null)
  const SectionComp = SECTION_COMPONENTS[active]

  useEffect(() => {
    Promise.all([getTowerTypes(), getEnemyTypes()])
      .then(([towers, enemies]) => setLiveData({ towers, enemies }))
      .catch(() => {})
  }, [])

  return (
    <LiveDataCtx.Provider value={liveData}>
      <div className="flex h-full">
        {/* Docs sidebar */}
        <aside className="w-52 flex-shrink-0 border-r border-gray-800 bg-gray-950/50 overflow-y-auto">
          <div className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Game Design</p>
            <nav className="space-y-0.5">
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setActive(s)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    active === s
                      ? 'bg-orange-500/20 text-orange-300 font-medium'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </nav>
            {liveData && (
              <p className="text-[10px] text-green-400/50 mt-4 px-1">✓ Live stats from backend</p>
            )}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <SectionComp />
        </div>
      </div>
    </LiveDataCtx.Provider>
  )
}

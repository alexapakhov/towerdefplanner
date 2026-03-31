import json
from sqlmodel import Session, select
from models import EnemyType, TowerType, Level, Wave, LevelTowerPlacement, SquadConfig
from database import engine


def seed_if_empty():
    with Session(engine) as session:
        existing_towers = session.exec(select(TowerType)).first()
        if existing_towers:
            return  # already seeded

        # --- Enemy Types ---
        enemies = [
            EnemyType(
                name="Scout",
                size="Small",
                hp=60,
                speed=5.5,
                damage_per_sec=8,
                currency_drop=5,
                armor_multipliers=json.dumps({"shell": 1.5, "electro": 1.0, "ice": 0.8, "fire": 1.0}),
                color="#f59e0b",
            ),
            EnemyType(
                name="Grunt",
                size="Medium",
                hp=150,
                speed=3.0,
                damage_per_sec=15,
                currency_drop=10,
                armor_multipliers=json.dumps({"shell": 1.0, "electro": 1.0, "ice": 1.0, "fire": 1.0}),
                color="#ef4444",
            ),
            EnemyType(
                name="Brute",
                size="Large",
                hp=400,
                speed=1.5,
                damage_per_sec=35,
                currency_drop=25,
                armor_multipliers=json.dumps({"shell": 0.8, "electro": 1.2, "ice": 1.0, "fire": 1.5}),
                color="#dc2626",
            ),
        ]
        for e in enemies:
            session.add(e)

        # --- Tower Types ---
        towers = [
            TowerType(
                name="Ballistic",
                category="Attack",
                effect_type="Shell",
                attack_pattern="Fires projectiles at single target",
                base_dps=40,
                base_range=120,
                base_cost=80,
                description="Standard projectile tower. Good all-rounder with medium DPS and range.",
                color="#f97316",
            ),
            TowerType(
                name="Energy",
                category="Attack",
                effect_type="Electro",
                attack_pattern="Laser single target then chains to nearby",
                base_dps=70,
                base_range=80,
                base_cost=120,
                description="High DPS laser that chains to nearby enemies. Low range.",
                color="#8b5cf6",
            ),
            TowerType(
                name="Freezer",
                category="Debuff",
                effect_type="Ice",
                attack_pattern="Slow beam and AoE freeze",
                base_dps=15,
                base_range=100,
                base_cost=90,
                slow_factor=0.5,
                description="Slows enemies significantly. Low DPS but high utility.",
                color="#38bdf8",
            ),
            TowerType(
                name="FrostAround",
                category="Debuff",
                effect_type="Ice",
                attack_pattern="Freezes all enemies in radius around tower",
                base_dps=10,
                base_range=150,
                base_cost=85,
                slow_factor=0.6,
                description="Wide-area freeze. Low DPS, high range slow.",
                color="#7dd3fc",
            ),
            TowerType(
                name="BoostData",
                category="Support",
                effect_type="None",
                attack_pattern="Boosts damage of towers and player in radius",
                base_dps=0,
                base_range=160,
                base_cost=70,
                boost_mult=1.4,
                description="No damage but boosts nearby tower and squad DPS by 40%.",
                color="#22c55e",
            ),
            TowerType(
                name="Flamethrower",
                category="Attack",
                effect_type="Fire",
                attack_pattern="Cone of flame in front",
                base_dps=65,
                base_range=75,
                base_cost=110,
                description="High DPS fire cone. Short range but very effective.",
                color="#f43f5e",
            ),
            TowerType(
                name="Mortar",
                category="Attack",
                effect_type="Shell",
                attack_pattern="AoE splash, blind spot near self",
                base_dps=35,
                base_range=180,
                base_cost=100,
                description="Lobs shells for AoE damage. High range, blind near self.",
                color="#a3a3a3",
            ),
            TowerType(
                name="Tesla",
                category="Attack",
                effect_type="Electro",
                attack_pattern="Chain lightning to multiple enemies",
                base_dps=45,
                base_range=110,
                base_cost=95,
                description="Electro chains damage across multiple enemies simultaneously.",
                color="#a78bfa",
            ),
        ]
        for t in towers:
            session.add(t)

        session.commit()
        print("Database seeded with default tower and enemy types.")

    # Always seed demo level if none exist
    _seed_demo_level()


def _seed_demo_level():
    with Session(engine) as session:
        if session.exec(select(Level)).first():
            return  # levels already exist

        # Serpentine path: left → right with two turns
        # S(70,300) → (220,300) → (220,150) → (430,150) → (430,430) → (660,430) → (660,180) → E(830,180)
        path_nodes = [
            {"x": 70,  "y": 300},
            {"x": 220, "y": 300},
            {"x": 220, "y": 150},
            {"x": 430, "y": 150},   # ← blocker 1 here
            {"x": 430, "y": 430},
            {"x": 660, "y": 430},   # ← blocker 2 here
            {"x": 660, "y": 180},
            {"x": 830, "y": 180},
        ]

        # Tower slots with progressive unlock_wave:
        #   unlock_wave=0 → available before wave 1 (starting currency)
        #   unlock_wave=1 → available after completing wave 1
        #   unlock_wave=2 → available after completing wave 2
        tower_slots = [
            {"id": "slot_A", "x": 150, "y": 230, "unlock_wave": 0},   # near start — always open
            {"id": "slot_B", "x": 320, "y": 220, "unlock_wave": 1},   # opens after wave 1
            {"id": "slot_C", "x": 520, "y": 370, "unlock_wave": 1},   # opens after wave 1
            {"id": "slot_D", "x": 560, "y": 200, "unlock_wave": 2},   # opens after wave 2
            {"id": "slot_E", "x": 750, "y": 280, "unlock_wave": 2},   # opens after wave 2
        ]

        # Zone blockers — visual barriers on path nodes
        zone_blockers = [
            {"id": "zb_1", "node_index": 3, "x": 430, "y": 150, "unlock_after_wave": 1},
            {"id": "zb_2", "node_index": 5, "x": 660, "y": 430, "unlock_after_wave": 2},
        ]

        level = Level(
            name="Demo — The Serpentine",
            description="Tutorial level. One starting slot, zone blockers open new positions each wave.",
            transport_hp=1200.0,
            starting_currency=100.0,
            path_nodes=json.dumps(path_nodes),
            tower_slots=json.dumps(tower_slots),
            zone_blockers=json.dumps(zone_blockers),
        )
        session.add(level)
        session.commit()
        session.refresh(level)

        # Tower type IDs by name
        tt_by_name = {t.name: t.id for t in session.exec(select(TowerType)).all()}
        et_by_name = {e.name: e.id for e in session.exec(select(EnemyType)).all()}

        # Placements — one tower per slot (pre-configured for demo)
        placements = [
            LevelTowerPlacement(level_id=level.id, slot_id="slot_A", tower_type_id=tt_by_name.get("Ballistic", 1),  upgrade_level=0),
            LevelTowerPlacement(level_id=level.id, slot_id="slot_B", tower_type_id=tt_by_name.get("Freezer", 3),    upgrade_level=0),
            LevelTowerPlacement(level_id=level.id, slot_id="slot_C", tower_type_id=tt_by_name.get("Energy", 2),     upgrade_level=0),
            LevelTowerPlacement(level_id=level.id, slot_id="slot_D", tower_type_id=tt_by_name.get("Tesla", 8),      upgrade_level=0),
            LevelTowerPlacement(level_id=level.id, slot_id="slot_E", tower_type_id=tt_by_name.get("Mortar", 7),     upgrade_level=1),
        ]
        for p in placements:
            session.add(p)

        # Squad
        session.add(SquadConfig(level_id=level.id, player_dps=35, player_hp=250, player_range=85,
                                companion_count=4, companion_dps=18, companion_hp=130, companion_level=1))

        # Wave 1 — scouts only, gentle
        scout_id = et_by_name.get("Scout", 1)
        grunt_id  = et_by_name.get("Grunt",  2)
        brute_id  = et_by_name.get("Brute",  3)

        w1 = Wave(level_id=level.id, wave_number=1, pre_wave_delay=3.0, groups=json.dumps([
            {"enemy_type_id": scout_id, "count": 8, "spawn_interval": 0.8, "group_delay": 0},
        ]))
        # Wave 2 — scouts + grunts, two zone slots open
        w2 = Wave(level_id=level.id, wave_number=2, pre_wave_delay=3.0, groups=json.dumps([
            {"enemy_type_id": scout_id, "count": 5, "spawn_interval": 0.7, "group_delay": 1.0},
            {"enemy_type_id": grunt_id,  "count": 4, "spawn_interval": 1.2, "group_delay": 0},
        ]))
        # Wave 3 — grunts + brutes, last two slots open
        w3 = Wave(level_id=level.id, wave_number=3, pre_wave_delay=3.0, groups=json.dumps([
            {"enemy_type_id": scout_id, "count": 4, "spawn_interval": 0.5, "group_delay": 0.5},
            {"enemy_type_id": grunt_id,  "count": 5, "spawn_interval": 1.0, "group_delay": 1.0},
            {"enemy_type_id": brute_id,  "count": 2, "spawn_interval": 3.0, "group_delay": 0},
        ]))
        for w in [w1, w2, w3]:
            session.add(w)

        session.commit()
        print(f"Demo level '{level.name}' seeded (id={level.id}).")

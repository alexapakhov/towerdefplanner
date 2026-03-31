from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class EnemyType(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    size: str  # Small, Medium, Large
    hp: float
    speed: float  # units/sec
    damage_per_sec: float
    currency_drop: float
    armor_multipliers: str  # JSON: {shell, electro, ice, fire}
    color: str = "#ff4444"


class TowerType(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    category: str  # Attack, Debuff, Support
    effect_type: str  # Shell, Electro, Ice, Fire, None
    attack_pattern: str  # description
    base_dps: float
    base_range: float
    base_cost: float
    slow_factor: float = 0.0
    boost_mult: float = 1.0
    description: str = ""
    upgrade_dps_mults: str = "[1.0, 1.6, 2.5, 4.0]"
    upgrade_range_mults: str = "[1.0, 1.15, 1.3, 1.5]"
    upgrade_costs: str = "[0, 0.6, 1.0, 1.5]"  # multipliers of base_cost
    color: str = "#f97316"


class Level(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    transport_hp: float = 1000.0
    starting_currency: float = 200.0
    path_nodes: str = "[]"  # JSON: [{x, y}]
    tower_slots: str = "[]"  # JSON: [{id, x, y, unlock_wave}]
    zone_blockers: str = "[]"  # JSON: [{id, node_index, unlock_wave}]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Wave(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    level_id: int = Field(foreign_key="level.id")
    wave_number: int
    groups: str = "[]"  # JSON: [{enemy_type_id, count, spawn_interval, per_spawn}]
    pre_wave_delay: float = 3.0  # seconds before wave starts


class LevelTowerPlacement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    level_id: int = Field(foreign_key="level.id")
    slot_id: str
    tower_type_id: int = Field(foreign_key="towertype.id")
    upgrade_level: int = 0  # 0-3


class SquadConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    level_id: int = Field(foreign_key="level.id")
    player_dps: float = 30.0
    player_hp: float = 200.0
    player_range: float = 80.0
    companion_count: int = 4
    companion_dps: float = 15.0
    companion_hp: float = 120.0
    companion_level: int = 1

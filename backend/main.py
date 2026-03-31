import json
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from database import create_db_and_tables, get_session, engine
from models import (
    EnemyType, TowerType, Level, Wave,
    LevelTowerPlacement, SquadConfig
)
from balance import simulate_balance
from seed_data import seed_if_empty

app = FastAPI(title="Tower Defense Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    seed_if_empty()


# ─── Utility ────────────────────────────────────────────────────────────────

def level_to_dict(level: Level) -> Dict:
    d = level.dict()
    d["created_at"] = level.created_at.isoformat() if level.created_at else None
    d["updated_at"] = level.updated_at.isoformat() if level.updated_at else None
    return d


# ─── Levels ──────────────────────────────────────────────────────────────────

@app.get("/levels")
def get_levels(session: Session = Depends(get_session)):
    levels = session.exec(select(Level)).all()
    result = []
    for lvl in levels:
        d = level_to_dict(lvl)
        waves = session.exec(select(Wave).where(Wave.level_id == lvl.id)).all()
        d["wave_count"] = len(waves)
        result.append(d)
    return result


@app.post("/levels")
def create_level(data: Dict[str, Any], session: Session = Depends(get_session)):
    level = Level(
        name=data.get("name", "New Level"),
        description=data.get("description", ""),
        transport_hp=data.get("transport_hp", 1000.0),
        starting_currency=data.get("starting_currency", 200.0),
        path_nodes=json.dumps(data.get("path_nodes", [])),
        tower_slots=json.dumps(data.get("tower_slots", [])),
        zone_blockers=json.dumps(data.get("zone_blockers", [])),
    )
    session.add(level)
    session.commit()
    session.refresh(level)
    return level_to_dict(level)


@app.get("/levels/{level_id}")
def get_level(level_id: int, session: Session = Depends(get_session)):
    level = session.get(Level, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    return level_to_dict(level)


@app.put("/levels/{level_id}")
def update_level(level_id: int, data: Dict[str, Any], session: Session = Depends(get_session)):
    level = session.get(Level, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    if "name" in data:
        level.name = data["name"]
    if "description" in data:
        level.description = data["description"]
    if "transport_hp" in data:
        level.transport_hp = data["transport_hp"]
    if "starting_currency" in data:
        level.starting_currency = data["starting_currency"]
    if "path_nodes" in data:
        level.path_nodes = json.dumps(data["path_nodes"])
    if "tower_slots" in data:
        level.tower_slots = json.dumps(data["tower_slots"])
    if "zone_blockers" in data:
        level.zone_blockers = json.dumps(data["zone_blockers"])
    level.updated_at = datetime.utcnow()
    session.add(level)
    session.commit()
    session.refresh(level)
    return level_to_dict(level)


@app.delete("/levels/{level_id}")
def delete_level(level_id: int, session: Session = Depends(get_session)):
    level = session.get(Level, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    # Cascade delete related data
    for wave in session.exec(select(Wave).where(Wave.level_id == level_id)).all():
        session.delete(wave)
    for p in session.exec(select(LevelTowerPlacement).where(LevelTowerPlacement.level_id == level_id)).all():
        session.delete(p)
    for sq in session.exec(select(SquadConfig).where(SquadConfig.level_id == level_id)).all():
        session.delete(sq)
    session.delete(level)
    session.commit()
    return {"ok": True}


# ─── Waves ───────────────────────────────────────────────────────────────────

@app.get("/levels/{level_id}/waves")
def get_waves(level_id: int, session: Session = Depends(get_session)):
    waves = session.exec(select(Wave).where(Wave.level_id == level_id).order_by(Wave.wave_number)).all()
    return [w.dict() for w in waves]


@app.post("/levels/{level_id}/waves")
def create_wave(level_id: int, data: Dict[str, Any], session: Session = Depends(get_session)):
    wave = Wave(
        level_id=level_id,
        wave_number=data.get("wave_number", 1),
        groups=json.dumps(data.get("groups", [])),
        pre_wave_delay=data.get("pre_wave_delay", 3.0),
    )
    session.add(wave)
    session.commit()
    session.refresh(wave)
    return wave.dict()


@app.get("/levels/{level_id}/waves/{wave_id}")
def get_wave(level_id: int, wave_id: int, session: Session = Depends(get_session)):
    wave = session.get(Wave, wave_id)
    if not wave or wave.level_id != level_id:
        raise HTTPException(status_code=404, detail="Wave not found")
    return wave.dict()


@app.put("/levels/{level_id}/waves/{wave_id}")
def update_wave(level_id: int, wave_id: int, data: Dict[str, Any], session: Session = Depends(get_session)):
    wave = session.get(Wave, wave_id)
    if not wave or wave.level_id != level_id:
        raise HTTPException(status_code=404, detail="Wave not found")
    if "wave_number" in data:
        wave.wave_number = data["wave_number"]
    if "groups" in data:
        wave.groups = json.dumps(data["groups"])
    if "pre_wave_delay" in data:
        wave.pre_wave_delay = data["pre_wave_delay"]
    session.add(wave)
    session.commit()
    session.refresh(wave)
    return wave.dict()


@app.delete("/levels/{level_id}/waves/{wave_id}")
def delete_wave(level_id: int, wave_id: int, session: Session = Depends(get_session)):
    wave = session.get(Wave, wave_id)
    if not wave or wave.level_id != level_id:
        raise HTTPException(status_code=404, detail="Wave not found")
    session.delete(wave)
    session.commit()
    return {"ok": True}


# ─── Tower Placements ─────────────────────────────────────────────────────────

@app.get("/levels/{level_id}/placements")
def get_placements(level_id: int, session: Session = Depends(get_session)):
    placements = session.exec(
        select(LevelTowerPlacement).where(LevelTowerPlacement.level_id == level_id)
    ).all()
    return [p.dict() for p in placements]


@app.post("/levels/{level_id}/placements")
def save_placements(level_id: int, data: List[Dict[str, Any]], session: Session = Depends(get_session)):
    # Replace all placements for this level
    existing = session.exec(
        select(LevelTowerPlacement).where(LevelTowerPlacement.level_id == level_id)
    ).all()
    for p in existing:
        session.delete(p)

    new_placements = []
    for item in data:
        placement = LevelTowerPlacement(
            level_id=level_id,
            slot_id=item["slot_id"],
            tower_type_id=item["tower_type_id"],
            upgrade_level=item.get("upgrade_level", 0),
        )
        session.add(placement)
        new_placements.append(placement)

    session.commit()
    return [p.dict() for p in session.exec(
        select(LevelTowerPlacement).where(LevelTowerPlacement.level_id == level_id)
    ).all()]


# ─── Squad Config ─────────────────────────────────────────────────────────────

@app.get("/levels/{level_id}/squad")
def get_squad(level_id: int, session: Session = Depends(get_session)):
    squad = session.exec(select(SquadConfig).where(SquadConfig.level_id == level_id)).first()
    if not squad:
        # Return default
        return SquadConfig(level_id=level_id).dict()
    return squad.dict()


@app.put("/levels/{level_id}/squad")
def save_squad(level_id: int, data: Dict[str, Any], session: Session = Depends(get_session)):
    squad = session.exec(select(SquadConfig).where(SquadConfig.level_id == level_id)).first()
    if not squad:
        squad = SquadConfig(level_id=level_id)
    for field in ["player_dps", "player_hp", "player_range", "companion_count",
                  "companion_dps", "companion_hp", "companion_level"]:
        if field in data:
            setattr(squad, field, data[field])
    session.add(squad)
    session.commit()
    session.refresh(squad)
    return squad.dict()


# ─── Balance Simulation ───────────────────────────────────────────────────────

@app.get("/levels/{level_id}/balance")
def get_balance(level_id: int, session: Session = Depends(get_session)):
    level = session.get(Level, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")

    waves = session.exec(select(Wave).where(Wave.level_id == level_id).order_by(Wave.wave_number)).all()
    placements = session.exec(
        select(LevelTowerPlacement).where(LevelTowerPlacement.level_id == level_id)
    ).all()
    squad = session.exec(select(SquadConfig).where(SquadConfig.level_id == level_id)).first()

    tower_types = {tt.id: tt for tt in session.exec(select(TowerType)).all()}
    enemy_types = {et.id: et for et in session.exec(select(EnemyType)).all()}

    result = simulate_balance(level, waves, placements, squad, tower_types, enemy_types)
    return result


@app.post("/levels/{level_id}/balance-whatif")
def balance_whatif(level_id: int, override: Dict[str, Any], session: Session = Depends(get_session)):
    """Run balance simulation with overridden squad/transport_hp — no persistence."""
    level = session.get(Level, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")

    waves = session.exec(select(Wave).where(Wave.level_id == level_id).order_by(Wave.wave_number)).all()
    placements = session.exec(
        select(LevelTowerPlacement).where(LevelTowerPlacement.level_id == level_id)
    ).all()
    squad = session.exec(select(SquadConfig).where(SquadConfig.level_id == level_id)).first()
    tower_types = {tt.id: tt for tt in session.exec(select(TowerType)).all()}
    enemy_types = {et.id: et for et in session.exec(select(EnemyType)).all()}

    # In-memory squad override
    class SquadProxy:
        pass
    sp = SquadProxy()
    b = squad
    sp.player_dps      = override.get('player_dps',      b.player_dps      if b else 30)
    sp.player_hp       = override.get('player_hp',       b.player_hp       if b else 200)
    sp.player_range    = override.get('player_range',    b.player_range    if b else 80)
    sp.companion_count = override.get('companion_count', b.companion_count if b else 4)
    sp.companion_dps   = override.get('companion_dps',   b.companion_dps   if b else 15)
    sp.companion_hp    = override.get('companion_hp',    b.companion_hp    if b else 120)
    sp.companion_level = override.get('companion_level', b.companion_level if b else 1)

    result = simulate_balance(level, waves, placements, sp, tower_types, enemy_types)
    return result


# ─── Tower Types ──────────────────────────────────────────────────────────────

@app.get("/tower-types")
def get_tower_types(session: Session = Depends(get_session)):
    return session.exec(select(TowerType)).all()


@app.post("/tower-types")
def create_tower_type(data: Dict[str, Any], session: Session = Depends(get_session)):
    tt = TowerType(**{k: v for k, v in data.items() if k != "id"})
    session.add(tt)
    session.commit()
    session.refresh(tt)
    return tt


@app.put("/tower-types/{tower_id}")
def update_tower_type(tower_id: int, data: Dict[str, Any], session: Session = Depends(get_session)):
    tt = session.get(TowerType, tower_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Tower type not found")
    for field, value in data.items():
        if field != "id" and hasattr(tt, field):
            setattr(tt, field, value)
    session.add(tt)
    session.commit()
    session.refresh(tt)
    return tt


@app.delete("/tower-types/{tower_id}")
def delete_tower_type(tower_id: int, session: Session = Depends(get_session)):
    tt = session.get(TowerType, tower_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Tower type not found")
    session.delete(tt)
    session.commit()
    return {"ok": True}


# ─── Enemy Types ──────────────────────────────────────────────────────────────

@app.get("/enemy-types")
def get_enemy_types(session: Session = Depends(get_session)):
    return session.exec(select(EnemyType)).all()


@app.post("/enemy-types")
def create_enemy_type(data: Dict[str, Any], session: Session = Depends(get_session)):
    et = EnemyType(**{k: v for k, v in data.items() if k != "id"})
    session.add(et)
    session.commit()
    session.refresh(et)
    return et


@app.put("/enemy-types/{enemy_id}")
def update_enemy_type(enemy_id: int, data: Dict[str, Any], session: Session = Depends(get_session)):
    et = session.get(EnemyType, enemy_id)
    if not et:
        raise HTTPException(status_code=404, detail="Enemy type not found")
    for field, value in data.items():
        if field != "id" and hasattr(et, field):
            setattr(et, field, value)
    session.add(et)
    session.commit()
    session.refresh(et)
    return et


@app.delete("/enemy-types/{enemy_id}")
def delete_enemy_type(enemy_id: int, session: Session = Depends(get_session)):
    et = session.get(EnemyType, enemy_id)
    if not et:
        raise HTTPException(status_code=404, detail="Enemy type not found")
    session.delete(et)
    session.commit()
    return {"ok": True}


# ─── Seed ─────────────────────────────────────────────────────────────────────

@app.post("/seed")
def reseed(session: Session = Depends(get_session)):
    # Clear existing
    for tt in session.exec(select(TowerType)).all():
        session.delete(tt)
    for et in session.exec(select(EnemyType)).all():
        session.delete(et)
    session.commit()
    seed_if_empty()
    return {"ok": True, "message": "Database re-seeded"}

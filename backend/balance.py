import json
import math
from typing import List, Dict, Any, Optional


def euclidean(p1: Dict, p2: Dict) -> float:
    return math.sqrt((p2["x"] - p1["x"]) ** 2 + (p2["y"] - p1["y"]) ** 2)


def path_length(nodes: List[Dict]) -> float:
    if len(nodes) < 2:
        return 0.0
    return sum(euclidean(nodes[i], nodes[i + 1]) for i in range(len(nodes) - 1))


def closest_point_on_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float):
    """Return (closest_x, closest_y, t) where t is parameter along segment [0,1]."""
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-10:
        return ax, ay, 0.0
    t = ((px - ax) * dx + (py - ay) * dy) / seg_len_sq
    t = max(0.0, min(1.0, t))
    return ax + t * dx, ay + t * dy, t


def get_tower_coverage_intervals(
    tower_x: float,
    tower_y: float,
    tower_range: float,
    nodes: List[Dict],
) -> List[tuple]:
    """
    Return list of (start_dist, end_dist) path-distance intervals covered by this tower.
    """
    if len(nodes) < 2:
        return []

    intervals = []
    cumulative = 0.0

    for i in range(len(nodes) - 1):
        ax, ay = nodes[i]["x"], nodes[i]["y"]
        bx, by = nodes[i + 1]["x"], nodes[i + 1]["y"]
        seg_len = euclidean(nodes[i], nodes[i + 1])
        if seg_len < 1e-10:
            cumulative += seg_len
            continue

        cx, cy, t_closest = closest_point_on_segment(tower_x, tower_y, ax, ay, bx, by)
        dist_to_seg = math.sqrt((tower_x - cx) ** 2 + (tower_y - cy) ** 2)

        if dist_to_seg >= tower_range:
            cumulative += seg_len
            continue

        # Half-chord: how far along segment the tower's circle extends
        half_chord = math.sqrt(max(0.0, tower_range ** 2 - dist_to_seg ** 2))

        t_closest_dist = t_closest * seg_len
        t_enter = max(0.0, t_closest_dist - half_chord)
        t_exit = min(seg_len, t_closest_dist + half_chord)

        if t_exit > t_enter:
            intervals.append((cumulative + t_enter, cumulative + t_exit))

        cumulative += seg_len

    # Merge overlapping intervals
    if not intervals:
        return []
    intervals.sort()
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def simulate_balance(
    level: Any,
    waves: List[Any],
    placements: List[Any],
    squad: Optional[Any],
    tower_types: Dict[int, Any],
    enemy_types: Dict[int, Any],
) -> Dict:
    nodes = json.loads(level.path_nodes)
    tower_slots = json.loads(level.tower_slots)
    total_path_len = path_length(nodes)
    squad_zone_start = total_path_len * 0.85  # last 15% of path

    # Build slot position lookup
    slot_positions = {s["id"]: {"x": s["x"], "y": s["y"]} for s in tower_slots}

    # Build placement info with computed values
    placement_info = []
    for idx, p in enumerate(placements):
        tt = tower_types.get(p.tower_type_id)
        if not tt or p.slot_id not in slot_positions:
            continue
        dps_mults = json.loads(tt.upgrade_dps_mults)
        range_mults = json.loads(tt.upgrade_range_mults)
        lvl = min(p.upgrade_level, 3)
        actual_dps = tt.base_dps * dps_mults[lvl]
        actual_range = tt.base_range * range_mults[lvl]
        pos = slot_positions[p.slot_id]

        intervals = get_tower_coverage_intervals(pos["x"], pos["y"], actual_range, nodes)
        tower_key = f"{tt.name}_{idx}"
        placement_info.append({
            "tower_key": tower_key,
            "tower_name": tt.name,
            "tower_type": tt,
            "dps": actual_dps,
            "range": actual_range,
            "slow_factor": tt.slow_factor,
            "boost_mult": tt.boost_mult,
            "category": tt.category,
            "effect_type": tt.effect_type,
            "intervals": intervals,
        })

    # Global boost multiplier from BoostData towers (simplified: apply to all)
    global_boost = 1.0
    for pi in placement_info:
        if pi["category"] == "Support":
            global_boost *= pi["boost_mult"]
    global_boost = max(1.0, global_boost)

    # Squad stats
    squad_dps = 0.0
    if squad:
        squad_dps = (squad.player_dps + squad.companion_count * squad.companion_dps) * global_boost
    else:
        squad_dps = 50.0  # default

    wave_stats = []
    cumulative_transport_damage = 0.0
    total_currency_earned = 0.0
    total_enemies = 0
    total_killed = 0
    # Per-tower damage tracking across all waves
    tower_damage_totals: Dict[str, Dict] = {}

    sorted_waves = sorted(waves, key=lambda w: w.wave_number)

    for wave in sorted_waves:
        groups = json.loads(wave.groups)
        wave_enemies_total = 0
        wave_enemies_killed = 0
        wave_enemies_escaped = 0
        wave_transport_damage = 0.0
        wave_currency = 0.0
        wave_tower_dps_total = 0.0
        wave_squad_dps_total = squad_dps
        wave_duration_est = 0.0
        wave_tower_damage: Dict[str, float] = {}  # per-tower damage this wave

        if not groups:
            wave_stats.append({
                "wave_number": wave.wave_number,
                "enemies_total": 0,
                "enemies_killed": 0,
                "enemies_escaped": 0,
                "transport_damage": 0.0,
                "currency_earned": 0.0,
                "estimated_duration": wave.pre_wave_delay,
                "tower_dps_total": 0.0,
                "squad_dps_total": squad_dps,
                "is_survivable": True,
            })
            continue

        for group in groups:
            et = enemy_types.get(group.get("enemy_type_id"))
            if not et:
                continue
            count = group.get("count", 1)
            spawn_interval = group.get("spawn_interval", 1.0)
            per_spawn = group.get("per_spawn", 1)
            armor = json.loads(et.armor_multipliers)

            wave_enemies_total += count * per_spawn
            group_duration = count * spawn_interval
            wave_duration_est = max(wave_duration_est, group_duration)

            for spawn_batch in range(count):
                for _ in range(per_spawn):
                    # Simulate single enemy traversal
                    hp_remaining = et.hp
                    pos_dist = 0.0  # distance along path
                    speed = et.speed  # units/sec
                    time_spent = 0.0
                    killed = False

                    # Collect all active intervals and their DPS (with tower tracking)
                    active_dps_segments = []
                    for pi in placement_info:
                        if pi["category"] == "Support":
                            continue
                        effect = pi["effect_type"].lower()
                        arm_mult = armor.get(effect, 1.0)
                        effective_dps = pi["dps"] * arm_mult * global_boost
                        slow = pi["slow_factor"] if pi["slow_factor"] > 0 else 0.0
                        for (seg_start, seg_end) in pi["intervals"]:
                            active_dps_segments.append({
                                "start": seg_start,
                                "end": seg_end,
                                "dps": effective_dps,
                                "slow": slow,
                                "tower_key": pi["tower_key"],
                                "tower_name": pi["tower_name"],
                            })

                    # Walk the enemy along the path in small steps
                    dt = 0.1  # simulation time step in seconds
                    max_time = 300.0  # max 5 min per enemy
                    t = 0.0

                    enemy_tower_damage: Dict[str, float] = {}  # track damage per tower for this enemy
                    while t < max_time and hp_remaining > 0 and pos_dist < total_path_len:
                        # Calculate current slow factor (take max slow from any applicable tower)
                        current_slow = 0.0
                        active_this_step = []
                        for seg in active_dps_segments:
                            if seg["start"] <= pos_dist <= seg["end"]:
                                active_this_step.append(seg)
                                current_slow = max(current_slow, seg["slow"])

                        effective_speed = speed * (1.0 - current_slow)
                        effective_speed = max(effective_speed, 0.1)

                        # Apply DPS and track per-tower contribution
                        damage_this_step = 0.0
                        for seg in active_this_step:
                            dmg = seg["dps"] * dt
                            damage_this_step += dmg
                            tk = seg["tower_key"]
                            enemy_tower_damage[tk] = enemy_tower_damage.get(tk, 0.0) + dmg

                        # Cap damage to remaining HP so we don't over-attribute
                        if damage_this_step > 0 and hp_remaining < damage_this_step:
                            scale = hp_remaining / damage_this_step
                            for tk in enemy_tower_damage:
                                if tk in [s["tower_key"] for s in active_this_step]:
                                    enemy_tower_damage[tk] *= scale

                        current_dps = sum(seg["dps"] for seg in active_this_step)
                        hp_remaining -= current_dps * dt

                        # Move along path
                        pos_dist += effective_speed * dt
                        t += dt

                    # Accumulate per-tower damage into wave totals
                    for tk, dmg in enemy_tower_damage.items():
                        wave_tower_damage[tk] = wave_tower_damage.get(tk, 0.0) + dmg

                    # Wave DPS total = sum of all tower DPS that actually covered path
                    unique_tower_dps = {seg["tower_key"]: seg["dps"] for seg in active_dps_segments}
                    wave_tower_dps_total = sum(unique_tower_dps.values())

                    if hp_remaining <= 0:
                        killed = True
                        wave_enemies_killed += 1
                        wave_currency += et.currency_drop
                    else:
                        # Enemy reached transport
                        # Squad deals additional damage in squad zone
                        squad_time_in_zone = (total_path_len - max(pos_dist - total_path_len * 0.15, squad_zone_start)) / max(et.speed * 0.5, 0.1)
                        squad_time_in_zone = max(0.0, min(squad_time_in_zone, 30.0))
                        hp_remaining = max(0, hp_remaining - squad_dps * squad_time_in_zone)

                        if hp_remaining <= 0:
                            wave_enemies_killed += 1
                            wave_currency += et.currency_drop
                        else:
                            wave_enemies_escaped += 1
                            # Enemy deals damage to transport
                            # Assume enemy stays 10 seconds before being killed
                            time_at_transport = 10.0
                            wave_transport_damage += et.damage_per_sec * time_at_transport

        wave_transport_damage = min(wave_transport_damage, level.transport_hp)
        cumulative_transport_damage += wave_transport_damage
        wave_currency_actual = wave_currency
        total_currency_earned += wave_currency_actual
        total_enemies += wave_enemies_total
        total_killed += wave_enemies_killed

        # Accumulate per-tower damage into global totals
        for tk, dmg in wave_tower_damage.items():
            if tk not in tower_damage_totals:
                # Find the tower name
                name = next((pi["tower_name"] for pi in placement_info if pi["tower_key"] == tk), tk)
                tower_damage_totals[tk] = {"name": name, "damage": 0.0, "wave_damage": {}}
            tower_damage_totals[tk]["damage"] += dmg
            tower_damage_totals[tk]["wave_damage"][wave.wave_number] = round(dmg, 1)

        kill_rate = wave_enemies_killed / max(wave_enemies_total, 1)
        is_survivable = wave_enemies_escaped == 0 or (
            cumulative_transport_damage < level.transport_hp
        )

        # Per-wave tower breakdown (sorted by damage desc)
        wave_tower_breakdown = sorted(
            [{"name": tower_damage_totals.get(tk, {}).get("name", tk), "damage": round(dmg, 1)}
             for tk, dmg in wave_tower_damage.items()],
            key=lambda x: -x["damage"]
        )

        wave_stats.append({
            "wave_number": wave.wave_number,
            "enemies_total": wave_enemies_total,
            "enemies_killed": wave_enemies_killed,
            "enemies_escaped": wave_enemies_escaped,
            "transport_damage": round(wave_transport_damage, 1),
            "currency_earned": round(wave_currency_actual, 1),
            "estimated_duration": round(wave.pre_wave_delay + wave_duration_est, 1),
            "tower_dps_total": round(wave_tower_dps_total, 1),
            "squad_dps_total": round(wave_squad_dps_total, 1),
            "is_survivable": is_survivable,
            "tower_breakdown": wave_tower_breakdown,
        })

    transport_hp_remaining = max(0.0, level.transport_hp - cumulative_transport_damage)
    overall_kill_rate = total_killed / max(total_enemies, 1)

    if overall_kill_rate > 0.9 and transport_hp_remaining > level.transport_hp * 0.5:
        difficulty = "Easy"
    elif overall_kill_rate > 0.7 and transport_hp_remaining > 0:
        difficulty = "Medium"
    elif transport_hp_remaining > 0:
        difficulty = "Hard"
    else:
        difficulty = "Impossible"

    # Build tower contributions summary sorted by damage desc
    total_tower_damage = sum(v["damage"] for v in tower_damage_totals.values())
    tower_contributions = sorted(
        [
            {
                "name": v["name"],
                "damage": round(v["damage"], 1),
                "pct": round(v["damage"] / max(total_tower_damage, 1) * 100, 1),
                "wave_damage": v["wave_damage"],
            }
            for v in tower_damage_totals.values()
        ],
        key=lambda x: -x["damage"]
    )

    return {
        "wave_stats": wave_stats,
        "total_waves": len(waves),
        "total_enemies": total_enemies,
        "total_killed": total_killed,
        "total_escaped": total_enemies - total_killed,
        "overall_kill_rate": round(overall_kill_rate * 100, 1),
        "total_currency_flow": round(total_currency_earned, 1),
        "transport_hp_remaining": round(transport_hp_remaining, 1),
        "transport_hp_max": level.transport_hp,
        "cumulative_transport_damage": round(cumulative_transport_damage, 1),
        "difficulty_rating": difficulty,
        "is_level_survivable": transport_hp_remaining > 0,
        "tower_contributions": tower_contributions,
    }

"""Bounded loop search on the directed eligible road graph."""

import hashlib
import json
import random
from math import atan2, cos, pi
from .routing import km


def fingerprint(coords):
    # Reversing the same roads is not a new route. Preserve edge multiplicity.
    segments = sorted(
        tuple(sorted((tuple(round(x, 7) for x in a), tuple(round(x, 7) for x in b))))
        for a, b in zip(coords, coords[1:])
    )
    return hashlib.sha256(json.dumps(segments, separators=(",", ":")).encode()).hexdigest()


def path_length(path):
    return sum(edge.length for edge, _ in path)


def path_start(part):
    edge, reverse = part
    return edge.b if reverse else edge.a


def path_end(part):
    edge, reverse = part
    return edge.a if reverse else edge.b


def repeated_share(path):
    length = path_length(path)
    return (length - sum({e.id: e.length for e, _ in path}.values())) / length if length else 1


def search_paths(graph, network, start, plan):
    """Offer short and extended loops; callers enforce requested distance/laps."""
    rng = random.Random(plan.variation)
    reachable = graph.reachable(start, network)
    origin = network.nodes[start]
    buckets = {}
    target = plan.distance if plan.best_fit else plan.distance / plan.laps
    for node in sorted(reachable):
        if node == start:
            continue
        point = network.nodes[node]
        distance = km(origin, point)
        if distance < 0.2 or distance > target * 0.48:
            continue
        bearing = (
            int(
                (
                    atan2(point[1] - origin[1], (point[0] - origin[0]) * cos(origin[1] * pi / 180))
                    + pi
                )
                / (2 * pi)
                * 16
            )
            % 16
        )
        ring = next(
            (i for i, limit in enumerate((0.5, 1, 2, 3, 5, 8, 12, 20)) if distance <= limit), 8
        )
        buckets.setdefault((bearing, ring), []).append((distance, node))
    pivots = []
    for choices in buckets.values():
        choices.sort(reverse=True)
        # Variation changes sampled roads without weakening any access rule.
        index = 0 if plan.variation == 0 else rng.randrange(min(5, len(choices)))
        pivots.append(choices[index])
    pivots.sort(reverse=True)
    ordered = []
    while pivots and len(ordered) < 64:
        ordered.append(pivots.pop(0)[1])
        if pivots and len(ordered) < 64:
            ordered.append(pivots.pop()[1])
    paths = []
    seen = set()

    def add(path):
        if not path or path_start(path[0]) != start or path_end(path[-1]) != start:
            return False
        if any(
            path_end(part) != path_start(nxt) or not graph.follows(part, nxt)
            for part, nxt in zip(path, path[1:] + path[:1])
        ):
            return False
        length = path_length(path)
        if length < 2 or length > target * 1.1 or repeated_share(path) > 0.18:
            return False
        signature = tuple(sorted(e.id for e, _ in path))
        if signature in seen:
            return False
        seen.add(signature)
        paths.append(path)
        return True

    outbound = {}
    for pivot in ordered:
        found = graph.shortest(start, pivot, network)
        if not found or not found[0]:
            continue
        path = found[0]
        outbound[pivot] = path
        back = graph.shortest(
            pivot,
            start,
            network,
            {e.id for e, _ in path},
            initial_part=path[-1],
            final_part=path[0],
        )
        if back:
            add(path + back[0])
    # Cross-connect branches rather than offering only out-and-return loops.
    far = [n for n in ordered if n in outbound]
    for i, a in enumerate(far[:24]):
        for b in far[i + 1 : i + 5]:
            if km(network.nodes[a], network.nodes[b]) < 0.6:
                continue
            first = outbound[a]
            middle = graph.shortest(a, b, network, {e.id for e, _ in first}, initial_part=first[-1])
            if not middle or not middle[0]:
                continue
            path = first + middle[0]
            if path_length(path) > target * 1.1:
                continue
            back = graph.shortest(
                b,
                start,
                network,
                {e.id for e, _ in path},
                initial_part=path[-1],
                final_part=path[0],
            )
            if back:
                add(path + back[0])

    # Extend existing closed loops along unused branches. Every replacement
    # carries incoming/outgoing turn state and is checked for repeated distance.
    # No artificial connector or hidden lap is inserted.
    lap_counts = [1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 30, 40, 60, 100] if plan.best_fit else [1]
    goals = [target / n for n in lap_counts if n <= plan.max_laps and target / n >= 2]
    nodes = sorted(reachable)
    for goal in goals:
        seeds = sorted(
            (path for path in paths if path_length(path) < goal), key=path_length, reverse=True
        )[:2]
        for seed in seeds:
            current = seed
            for attempt in range(56 if target >= 40 else 28):
                length = path_length(current)
                if length >= goal:
                    break
                a = rng.randrange(len(current))
                b = min(len(current), a + rng.randint(1, min(8, len(current) - a)))
                left, right = path_start(current[a]), path_end(current[b - 1])
                available = [
                    n
                    for n in nodes
                    if 0.1
                    < km(network.nodes[left], network.nodes[n])
                    < min(4, (goal - length) / 2 + 0.4)
                ]
                if not available:
                    continue
                pivot = rng.choice(available)
                used = {e.id for e, _ in current}
                first = graph.shortest(left, pivot, network, used, initial_part=current[a - 1])
                if not first or not first[0]:
                    continue
                second = graph.shortest(
                    pivot,
                    right,
                    network,
                    used | {e.id for e, _ in first[0]},
                    initial_part=first[0][-1],
                    final_part=current[b % len(current)],
                )
                if not second or not second[0]:
                    continue
                extended = current[:a] + first[0] + second[0] + current[b:]
                extended_length = path_length(extended)
                if (
                    extended_length <= goal * (1 + plan.distance_tolerance)
                    and extended_length > length + 0.01
                    and add(extended)
                ):
                    current = extended
    return paths, len(reachable)

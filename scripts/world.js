export function createPlanetLayout(planets) {
    let seed = 782915;
    function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
    // Stable, reproducible 3D positions. Extra room and a minimum separation
    // avoid overlapping planets while keeping the layout naturally irregular.
    const FIELD = { x: 300, y: 150, z: 300 };
    const MIN_GAP = 20; // minimum clearance between planet surfaces in world units
    const occupied = [];
    planets.forEach((p, i) => {
        p.radius = 3.2 + random() * 4.2;
        let position = null;
        let largestSpacing = -Infinity;
        // Rejection sampling: reject positions that sit too close to an existing planet.
        // Keep the best fallback, so placement is always deterministic and finite.
        for (let attempt = 0; attempt < 1200; attempt++) {
            const candidate = {
                x: (random() - .5) * FIELD.x,
                y: (random() - .5) * FIELD.y,
                z: (random() - .5) * FIELD.z
            };
            let nearest = Infinity;
            for (const existing of occupied) {
                const d = Math.hypot(candidate.x - existing.x, candidate.y - existing.y, candidate.z - existing.z);
                nearest = Math.min(nearest, d - existing.radius - p.radius);
            }
            if (nearest > largestSpacing) {
                position = candidate;
                largestSpacing = nearest;
            }
            if (nearest >= MIN_GAP)
                break;
        }
        p.world = position;
        occupied.push({ ...position, radius: p.radius });
        p.spin = random() * Math.PI * 2;
        p.speed = .07 + random() * .12;
        p.phase = random() * Math.PI * 2;
    });
    return random;
}


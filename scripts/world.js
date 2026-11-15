/**
 * World placement: previously assigned coordinates never change.
 *
 * Each saved planet has 'world' and 'radius' in data/planets.json.
 * For newly added planets without coordinates, assign a deterministic
 * candidate. Persist those generated coordinates to data before publishing.
 */
export const WORLD_BOUNDS = { x: 300, y: 150, z: 300 };
export const MIN_SURFACE_GAP = 20;

function seedForPlanet(id) {
    const key = String(id);
    let seed = 2166136261;
    for (let i = 0; i < key.length; i++) {
        seed = Math.imul(seed ^ key.charCodeAt(i), 16777619);
    }
    return seed >>> 0;
}

function randomGenerator(seed) {
    return () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

export function createPlanetLayout(planets) {
    const occupied = [];

    // Reserve pre-existing positions first, independently of input order.
    for (const planet of planets) {
        if (!planet.world || !Number.isFinite(planet.radius)) continue;

        occupied.push({
            x: planet.world.x,
            y: planet.world.y,
            z: planet.world.z,
            radius: planet.radius
        });
    }

    for (const planet of planets) {
        const random = randomGenerator(seedForPlanet(planet.id ?? planet.username));

        if (!planet.world) {
            planet.radius ??= 3.2 + random() * 4.2;

            let best = null;
            let largestClearance = -Infinity;

            for (let attempt = 0; attempt < 1200; attempt++) {
                const candidate = {
                    x: (random() - 0.5) * WORLD_BOUNDS.x,
                    y: (random() - 0.5) * WORLD_BOUNDS.y,
                    z: (random() - 0.5) * WORLD_BOUNDS.z
                };

                let clearance = Infinity;
                for (const existing of occupied) {
                    const distance = Math.hypot(
                        candidate.x - existing.x,
                        candidate.y - existing.y,
                        candidate.z - existing.z
                    );
                    clearance = Math.min(
                        clearance,
                        distance - existing.radius - planet.radius
                    );
                }

                if (clearance > largestClearance) {
                    best = candidate;
                    largestClearance = clearance;
                }
                if (clearance >= MIN_SURFACE_GAP) break;
            }

            // A full world requires a larger field or another galaxy.
            if (largestClearance < MIN_SURFACE_GAP) {
                throw new Error('Not enough room for a new planet. Expand the world.');
            }

            planet.world = best;
            occupied.push({ ...best, radius: planet.radius });
        }

        planet.spin = random() * Math.PI * 2;
        planet.speed = 0.07 + random() * 0.12;
        planet.phase = random() * Math.PI * 2;
    }
}

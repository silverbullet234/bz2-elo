
// Glicko-2 Math implementation
// Based on http://www.glicko.net/glicko/glicko2.pdf

export const TAU = 0.5; // System constant, can be tuned (0.3 to 1.2)
export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOL = 0.06;
export const SCALE_FACTOR = 173.7178;

export interface GlickoRating {
    rating: number;
    rd: number;
    vol: number;
}

export interface Glicko2ScaleRating {
    mu: number;
    phi: number;
    sigma: number;
}

// Step 1: Convert to Glicko-2 scale
export function toGlicko2Scale(r: GlickoRating): Glicko2ScaleRating {
    return {
        mu: (r.rating - DEFAULT_RATING) / SCALE_FACTOR,
        phi: r.rd / SCALE_FACTOR,
        sigma: r.vol
    };
}

// Step 8: Convert back to original scale
export function toOriginalScale(g: Glicko2ScaleRating): GlickoRating {
    return {
        rating: g.mu * SCALE_FACTOR + DEFAULT_RATING,
        rd: g.phi * SCALE_FACTOR,
        vol: g.sigma
    };
}

// g(phi) helper function
function g(phi: number): number {
    return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

// E(mu, mu_j, phi_j) helper function
export function computeE(mu: number, mu_j: number, phi_j: number): number {
    return 1 / (1 + Math.exp(-g(phi_j) * (mu - mu_j)));
}

// Step 3, 4, 5, 6, 7: Update rating based on game outcomes
// Note: This implementation assumes a single rating period containing the provided games.
export function updateRating(
    player: Glicko2ScaleRating, 
    matches: { opponentMu: number, opponentPhi: number, score: number }[]
): Glicko2ScaleRating {
    const { mu, phi, sigma } = player;
    
    // Step 3: Compute v (estimated variance)
    let v_inv = 0;
    for (const match of matches) {
        const g_phi_j = g(match.opponentPhi);
        const E = computeE(mu, match.opponentMu, match.opponentPhi);
        v_inv += (g_phi_j * g_phi_j) * E * (1 - E);
    }
    const v = 1 / v_inv;

    // Step 4: Compute Delta
    let delta_sum = 0;
    for (const match of matches) {
        const g_phi_j = g(match.opponentPhi);
        const E = computeE(mu, match.opponentMu, match.opponentPhi);
        delta_sum += g_phi_j * (match.score - E);
    }
    const delta = v * delta_sum;

    // Step 5: Determine new volatility sigma'
    const a = Math.log(sigma * sigma);
    const epsilon = 0.000001;
    let A = a;
    let B: number;
    
    if (delta * delta > phi * phi + v) {
        B = Math.log(delta * delta - phi * phi - v);
    } else {
        let k = 1;
        while (f(a - k * TAU, delta, phi, v, a, TAU) < 0) {
            k++;
        }
        B = a - k * TAU;
    }

    let fA = f(A, delta, phi, v, a, TAU);
    let fB = f(B, delta, phi, v, a, TAU);

    while (Math.abs(B - A) > epsilon) {
        const C = A + (A - B) * fA / (fB - fA);
        const fC = f(C, delta, phi, v, a, TAU);
        if (fC * fB < 0) {
            A = B;
            fA = fB;
        } else {
            fA = fA / 2;
        }
        B = C;
        fB = fC;
    }
    
    const newSigma = Math.exp(A / 2);

    // Step 6: Update phi to phi_star
    const phi_star = Math.sqrt(phi * phi + newSigma * newSigma);

    // Step 7: Update phi and mu
    const newPhi = 1 / Math.sqrt(1 / (phi_star * phi_star) + 1 / v);
    
    // Note: Reusing delta_sum logic here but weighted by newPhi^2
    // newMu = mu + newPhi^2 * (sum of g(phi_j)(score - E))
    // The sum term is exactly delta / v. 
    // So newMu = mu + newPhi^2 * (delta / v)
    // Wait, let's look at the formula carefully.
    // mu' = mu + phi'^2 * sum( g(phi_j) * (s_j - E) )
    // sum(...) = delta / v
    // so mu' = mu + (phi'^2 / v) * delta
    
    let sum_score_diff = 0;
    for (const match of matches) {
         const g_phi_j = g(match.opponentPhi);
         const E = computeE(mu, match.opponentMu, match.opponentPhi);
         sum_score_diff += g_phi_j * (match.score - E);
    }
    
    const newMu = mu + (newPhi * newPhi) * sum_score_diff;

    return {
        mu: newMu,
        phi: newPhi,
        sigma: newSigma
    };
}

// Helper for Step 5
function f(x: number, delta: number, phi: number, v: number, a: number, tau: number): number {
    const expX = Math.exp(x);
    const term1 = (expX * (delta * delta - phi * phi - v - expX)) / (2 * Math.pow(phi * phi + v + expX, 2));
    const term2 = (x - a) / (tau * tau);
    return term1 - term2;
}

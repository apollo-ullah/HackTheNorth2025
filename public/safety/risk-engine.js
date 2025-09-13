export class RiskEngine {
    constructor(config = {}) {
        this.cfg = Object.assign({
            weights: { transcript: 0.45, prosody: 0.25, motion: 0.15, location: 0.15 },
            ewmaAlpha: 0.35,
            leakPerSec: 8,
            clamp: [0, 100]
        }, config);
        this.state = {
            lastTick: performance.now(),
            ewma: 0,
            integral: 0,
            components: { transcript: 0, prosody: 0, motion: 0, location: 0 }
        };
    }

    updateComponents(components) {
        this.state.components = { ...this.state.components, ...components };
    }

    tick() {
        const now = performance.now();
        const dt = Math.max(0.016, (now - this.state.lastTick) / 1000);
        this.state.lastTick = now;

        const { transcript, prosody, motion, location } = this.state.components;
        const w = this.cfg.weights;
        const instant = (w.transcript * transcript + w.prosody * prosody + w.motion * motion + w.location * location);

        // EWMA smoothing
        this.state.ewma = this.state.ewma + this.cfg.ewmaAlpha * (instant - this.state.ewma);

        // Leaky integrator toward ewma
        const target = this.state.ewma;
        const k = 0.9;
        this.state.integral += k * (target - this.state.integral) * dt;

        // Apply leakage toward 0
        const leak = this.cfg.leakPerSec * dt;
        if (this.state.integral > 0) this.state.integral = Math.max(0, this.state.integral - leak);

        // Clamp
        this.state.ewma = clamp(this.state.ewma, ...this.cfg.clamp);
        this.state.integral = clamp(this.state.integral, ...this.cfg.clamp);

        return { instant, ewma: this.state.ewma, risk: this.state.integral };
    }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }



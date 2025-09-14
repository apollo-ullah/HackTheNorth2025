export const SafetyState = { SAFE: 'SAFE', ELEVATED: 'ELEVATED', CRITICAL: 'CRITICAL', RESOLVED: 'RESOLVED' };

export class SafetyMachine {
    constructor({ onEnter, onExit, onAction, onStateChange, clock } = {}) {
        this.s = SafetyState.SAFE;
        this.clock = clock || (() => performance.now());
        this.timers = {};
        this.onEnter = onEnter || (() => { });
        this.onExit = onExit || (() => { });
        this.onAction = onAction || (() => { });
        this.onStateChange = onStateChange || (() => {}); // For driving model context
        this._userSaysSafe = false;
        this._lastRisk = 0;
        this._lastEwma = 0;
    }

    state() { return this.s; }

    startTimer(key, ms, cb) {
        this.clearTimer(key);
        this.timers[key] = setTimeout(cb, ms);
    }
    clearTimer(key) {
        if (this.timers[key]) { clearTimeout(this.timers[key]); delete this.timers[key]; }
    }

    transition(next) {
        if (next === this.s) return;
        const prev = this.s;
        this.onExit(prev);
        this.s = next;
        this.onEnter(next, prev);
        this.onStateChange(next, prev); // Notify about state changes
    }

    onRiskSample({ risk, ewma }) {
        this._lastRisk = risk;
        this._lastEwma = ewma;
    }

    onTrigger(evt) {
        const t = evt.type;
        if (t === 'SAFE_PHRASE' || t === 'CANNOT_SPEAK' || t === 'NOTIFY_NOW' || (t === 'CONNECTIVITY_LOST' && this.s !== SafetyState.SAFE)) {
            return this.transition(SafetyState.CRITICAL);
        }
        if (t === 'USER_SAFE') {
            if (this.s === SafetyState.CRITICAL || this.s === SafetyState.ELEVATED) {
                this._userSaysSafe = true;
            }
        }
    }

    evaluate() {
        const r = this._lastRisk ?? 0;

        if (this.s === SafetyState.SAFE) {
            if (r >= 40) {
                this.startTimer('toElev', 3000, () => {
                    if ((this._lastRisk ?? 0) >= 40 && this.s === SafetyState.SAFE) this.transition(SafetyState.ELEVATED);
                });
            } else {
                this.clearTimer('toElev');
            }
        }

        if (this.s === SafetyState.ELEVATED) {
            this.onAction('ensureIncidentStarted');
            this.onAction('suggestNotifyOrRoute');

            if (r >= 70) {
                this.startTimer('toCrit', 1000, () => {
                    if ((this._lastRisk ?? 0) >= 70 && this.s === SafetyState.ELEVATED) this.transition(SafetyState.CRITICAL);
                });
            } else {
                this.clearTimer('toCrit');
            }

            if (r < 25 && this._userSaysSafe) {
                this.startTimer('toSafeFromElev', 30000, () => {
                    if ((this._lastRisk ?? 0) < 25 && this._userSaysSafe && this.s === SafetyState.ELEVATED) {
                        this.transition(SafetyState.RESOLVED);
                    }
                });
            } else {
                this.clearTimer('toSafeFromElev');
            }
        }

        if (this.s === SafetyState.CRITICAL) {
            this.onAction('notifyContacts');
            this.onAction('startRecording');
            this.onAction('startSafeRouting');

            if (r < 60 && this._userSaysSafe) {
                this.startTimer('toElevFromCrit', 20000, () => {
                    if ((this._lastRisk ?? 0) < 60 && this._userSaysSafe && this.s === SafetyState.CRITICAL) {
                        this.transition(SafetyState.ELEVATED);
                    }
                });
            } else {
                this.clearTimer('toElevFromCrit');
            }
        }

        if (this.s === SafetyState.RESOLVED) {
            this.onAction('finalizeIncident');
        }
    }
}



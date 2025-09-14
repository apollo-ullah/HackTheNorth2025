import { RiskEngine } from './risk-engine.js';
import { SafetyMachine, SafetyState } from './safety-machine.js';

export const bus = new EventTarget();

export function createSafetySystem(ui, effects) {
    const engine = new RiskEngine();
    const machine = new SafetyMachine({
        onEnter: (next) => {
            if (next === SafetyState.ELEVATED) {
                ui.setBanner && ui.setBanner('Elevated risk. I am logging and ready to notify.');
                bus.dispatchEvent(new CustomEvent('incident:start'));
            }
            if (next === SafetyState.CRITICAL) {
                ui.setBanner && ui.setBanner('Critical risk. Notifying contacts and routing you to safety.');
            }
            if (next === SafetyState.RESOLVED) {
                ui.setBanner && ui.setBanner('Resolved. Incident saved.');
                bus.dispatchEvent(new CustomEvent('incident:finalize'));
            }
        },
        onExit: () => { },
        onAction: (action) => {
            switch (action) {
                case 'ensureIncidentStarted': bus.dispatchEvent(new CustomEvent('incident:start')); break;
                case 'suggestNotifyOrRoute': ui.showQuickReplies && ui.showQuickReplies(['Notify contact', 'Route me to safety']); break;
                case 'notifyContacts': effects.notifyContactsIfNotYet && effects.notifyContactsIfNotYet(); break;
                case 'startRecording': effects.startRollingAudioIfNotYet && effects.startRollingAudioIfNotYet(); break;
                case 'startSafeRouting': effects.startRoutingIfNotYet && effects.startRoutingIfNotYet(); break;
                case 'finalizeIncident': effects.finalizeIncidentOnce && effects.finalizeIncidentOnce(); break;
            }
        },
        onStateChange: ui.onStateChange || (() => {}) // Pass state changes to UI
    });

    // Drive risk calculation and inject state context
    let lastStateInjection = 0;
    setInterval(() => {
        const { risk, ewma } = engine.tick();
        machine.onRiskSample({ risk, ewma });
        machine.evaluate();
        ui.renderRiskBar && ui.renderRiskBar(risk);
        
        // Inject state context to the model every 10 seconds
        const now = Date.now();
        if (now - lastStateInjection > 10000 && ui.injectStateContext) {
            ui.injectStateContext(machine.s, Math.round(risk));
            lastStateInjection = now;
        }
    }, 200);

    // Transcript updates
    bus.addEventListener('transcript', e => {
        const text = (e.detail?.text || '').toLowerCase();
        let score = 0;
        const bag = [
            { k: 'following', s: 40 }, { k: 'unsafe', s: 35 }, { k: 'help', s: 50 },
            { k: 'afraid', s: 30 }, { k: 'stalking', s: 45 }, { k: "can't speak", s: 70 }
        ];
        for (const { k, s } of bag) if (text.includes(k)) score += s;
        if (/\bnot\b.*\b(afraid|unsafe)\b/.test(text)) score *= 0.4;
        score = Math.min(100, score);

        const llm = e.detail?.llmDistressScore ?? 0;
        const transcriptScore = clamp(score + 0.6 * llm, 0, 100);
        engine.updateComponents({ transcript: transcriptScore });

        if (matchesSafePhrase(text)) machine.onTrigger({ type: 'SAFE_PHRASE' });
        if (text.includes("can't speak") || text.includes('cannot speak')) machine.onTrigger({ type: 'CANNOT_SPEAK' });
    });

    // Prosody updates
    bus.addEventListener('prosody', e => {
        const { rms = 0, zcr = 0, speechRate = 0 } = e.detail || {};
        const s = 40 * (zcr) + 0.5 * (rms * 100) + 0.2 * (speechRate);
        const stress = Math.max(0, Math.min(100, s));
        engine.updateComponents({ prosody: stress });
    });

    // Location updates
    bus.addEventListener('location', e => {
        const location = e.detail || {};
        const { precision_m = 1000 } = location;
        
        // Location confidence affects risk (poor GPS = higher risk in emergencies)
        let locationRisk = 0;
        if (precision_m > 100) locationRisk = 20; // Poor GPS
        if (precision_m > 500) locationRisk = 40; // Very poor GPS
        
        engine.updateComponents({ location: locationRisk });
        console.log(`📍 Location risk updated: ${locationRisk} (precision: ±${precision_m}m)`);
    });

    // Connectivity
    window.addEventListener('offline', () => machine.onTrigger({ type: 'CONNECTIVITY_LOST' }));

    return { engine, machine, bus };
}

function matchesSafePhrase(t) {
    return /\bhow('?s| is) the weather\b/.test(t) || /\bblue banana\b/.test(t);
}
function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }



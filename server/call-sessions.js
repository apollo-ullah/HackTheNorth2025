// Call session management for live location tracking during calls

export const callSessions = new Map(); // CallSid -> { lat, lng, sessionId, startedAt, lastUpdate }

export function setCallSession(callSid, data) {
    callSessions.set(callSid, { 
        ...data, 
        lastUpdate: Date.now(),
        startedAt: data.startedAt || Date.now()
    });
    console.log(`📞 Call session stored: ${callSid}`);
}

export function getCallSession(callSid) { 
    return callSessions.get(callSid); 
}

export function updateCallLocation(callSid, lat, lng) {
    const session = callSessions.get(callSid);
    if (!session) return false;
    
    setCallSession(callSid, { ...session, lat, lng });
    console.log(`📍 Call location updated: ${callSid} -> ${lat}, ${lng}`);
    return true;
}

export function clearCallSession(callSid) { 
    callSessions.delete(callSid);
    console.log(`📞 Call session cleared: ${callSid}`);
}

export function cleanupExpiredSessions(maxAgeMs = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [callSid, session] of callSessions.entries()) {
        if (now - session.startedAt > maxAgeMs) {
            clearCallSession(callSid);
        }
    }
}

// Auto-cleanup every 5 minutes
setInterval(() => cleanupExpiredSessions(), 300000);

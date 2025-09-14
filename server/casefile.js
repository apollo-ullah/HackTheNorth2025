// Authoritative case file management with normalization

import { redactCaseFile } from './redact.js';

const files = new Map(); // sessionId -> caseFile

const baseCaseFile = () => ({
    session_id: null,
    danger_level: "safe",
    can_speak: null,
    location: null,
    emergency_contact: null,
    consent: { share_location: null, notify_contact: null },
    threat_info: null,
    timeline: [],
    actions_taken: [],
    notes: [],
    session_start: new Date().toISOString(),
    last_updated: new Date().toISOString()
});

export function getCaseFile(sessionId) {
    return files.get(sessionId) || null;
}

export function updateCaseFile(sessionId, patch) {
    let caseFile = files.get(sessionId);
    if (!caseFile) {
        caseFile = { ...baseCaseFile(), session_id: sessionId };
        files.set(sessionId, caseFile);
    }
    
    // Normalize and validate the patch
    const normalized = normalize(patch);
    
    // Deep merge the normalized patch
    const updated = deepMerge(caseFile, normalized);
    updated.last_updated = new Date().toISOString();
    
    files.set(sessionId, updated);
    
    console.log(`📋 Case file updated: ${sessionId}`, Object.keys(normalized));
    return updated;
}

export function deleteCaseFile(sessionId) {
    const existed = files.has(sessionId);
    files.delete(sessionId);
    console.log(`🗑️ Case file deleted: ${sessionId}`);
    return existed;
}

export function getAllCaseFiles() {
    return Array.from(files.entries()).map(([id, file]) => ({
        id,
        ...redactCaseFile(file)
    }));
}

function normalize(patch) {
    const normalized = { ...patch };
    
    // Normalize phone numbers to E.164
    if (normalized.emergency_contact?.phone) {
        normalized.emergency_contact.phone = normalizePhone(normalized.emergency_contact.phone);
    }
    
    // Clamp and validate location
    if (normalized.location) {
        if (normalized.location.lat !== null && normalized.location.lat !== undefined) {
            normalized.location.lat = Math.max(-90, Math.min(90, normalized.location.lat));
        }
        if (normalized.location.lng !== null && normalized.location.lng !== undefined) {
            normalized.location.lng = Math.max(-180, Math.min(180, normalized.location.lng));
        }
        if (normalized.location.precision_m !== null && normalized.location.precision_m !== undefined) {
            normalized.location.precision_m = Math.max(0, normalized.location.precision_m);
        }
    }
    
    // Validate enums
    if (normalized.danger_level && !['safe', 'elevated', 'critical'].includes(normalized.danger_level)) {
        console.warn(`Invalid danger_level: ${normalized.danger_level}, defaulting to 'safe'`);
        normalized.danger_level = 'safe';
    }
    
    return normalized;
}

function normalizePhone(phone) {
    if (!phone) return phone;
    // Simple E.164 normalization
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 10) return `+1${cleaned}`; // North American number
    if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
    return `+1${cleaned}`; // Default to +1
}

function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else if (Array.isArray(source[key])) {
            // For arrays, replace completely
            result[key] = [...source[key]];
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

// Export for authorities (redacted)
export function exportCaseFile(sessionId) {
    const caseFile = files.get(sessionId);
    if (!caseFile) return null;
    
    return {
        incident_id: sessionId,
        export_timestamp: new Date().toISOString(),
        ...redactCaseFile(caseFile)
    };
}

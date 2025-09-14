// PII redaction utilities for safe logging

export function redactPhone(phone) {
    if (!phone) return "";
    // Show last 4 digits: +1514•••5707
    return phone.length > 4 ? 
        phone.slice(0, -4).replace(/./g, '•') + phone.slice(-4) :
        phone.replace(/./g, '•');
}

export function roundCoord(coord) {
    if (typeof coord !== 'number') return null;
    // Round to ~11m precision for privacy
    return Math.round(coord * 10000) / 10000;
}

export function redactLocation(lat, lng) {
    return {
        lat: roundCoord(lat),
        lng: roundCoord(lng)
    };
}

export function redactCaseFile(caseFile) {
    if (!caseFile) return null;
    
    const redacted = { ...caseFile };
    
    // Redact phone numbers
    if (redacted.emergency_contact?.phone) {
        redacted.emergency_contact.phone = redactPhone(redacted.emergency_contact.phone);
    }
    
    // Round location coordinates
    if (redacted.location) {
        redacted.location = {
            ...redacted.location,
            lat: roundCoord(redacted.location.lat),
            lng: roundCoord(redacted.location.lng)
        };
    }
    
    return redacted;
}

export function createSafeLogEntry(type, data) {
    const safeData = { ...data };
    
    // Redact sensitive fields
    if (safeData.phone) safeData.phone = redactPhone(safeData.phone);
    if (safeData.to) safeData.to = redactPhone(safeData.to);
    if (safeData.lat) safeData.lat = roundCoord(safeData.lat);
    if (safeData.lng) safeData.lng = roundCoord(safeData.lng);
    if (safeData.location) {
        safeData.location = redactLocation(safeData.location.lat, safeData.location.lng);
    }
    
    return {
        type,
        timestamp: new Date().toISOString(),
        ...safeData
    };
}

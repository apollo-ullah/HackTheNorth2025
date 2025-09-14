// Idempotency and throttling for emergency actions

const actionCache = new Map(); // idemKey -> { until, result }
const lastAction = new Map(); // actionKey -> timestamp

export async function callToolOnce(name, args, { timeoutMs = 6000, idemKey }) {
    const now = Date.now();
    const cached = actionCache.get(idemKey);
    
    // Return cached result if within window
    if (cached && cached.until > now) {
        console.log(`🔄 Returning cached result for ${idemKey}`);
        return cached.result;
    }
    
    // Make the actual call with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(`http://localhost:3000/api/action/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
            signal: controller.signal
        });
        
        const result = await response.json();
        clearTimeout(timeout);
        
        // Cache result for 12 seconds
        actionCache.set(idemKey, { 
            until: now + 12000, 
            result 
        });
        
        console.log(`✅ Tool call completed: ${name} (${idemKey})`);
        return result;
        
    } catch (error) {
        clearTimeout(timeout);
        const errorResult = { success: false, error: String(error) };
        
        // Cache error for shorter time (3 seconds)
        actionCache.set(idemKey, { 
            until: now + 3000, 
            result: errorResult 
        });
        
        console.error(`❌ Tool call failed: ${name} (${idemKey})`, error);
        return errorResult;
    }
}

export function throttle(actionKey, intervalMs) {
    const now = Date.now();
    const lastTime = lastAction.get(actionKey) || 0;
    
    if (now - lastTime < intervalMs) {
        console.log(`🚫 Action throttled: ${actionKey} (${intervalMs - (now - lastTime)}ms remaining)`);
        return false;
    }
    
    lastAction.set(actionKey, now);
    console.log(`✅ Action allowed: ${actionKey}`);
    return true;
}

export function generateIdemKey(action, phone, timeWindow = 10000) {
    // Generate idempotency key based on action, phone, and time window
    const timeSlot = Math.floor(Date.now() / timeWindow);
    return `${action}:${phone}:${timeSlot}`;
}

// Cleanup expired cache entries
export function cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of actionCache.entries()) {
        if (entry.until <= now) {
            actionCache.delete(key);
        }
    }
    for (const [key, timestamp] of lastAction.entries()) {
        if (now - timestamp > 300000) { // 5 minutes
            lastAction.delete(key);
        }
    }
}

// Auto-cleanup every minute
setInterval(cleanupCache, 60000);

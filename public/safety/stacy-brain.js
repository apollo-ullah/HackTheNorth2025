// Stacy's enhanced "brain" system with case file management and action tools

export const STACY_INSTRUCTIONS = `You are Stacy, an AI safety companion designed to help people in potentially dangerous situations. You are calm, professional, and focused on immediate safety.

CORE PROTOCOL:
1. ASSESS: Ask discrete safety questions to understand the situation
2. DOCUMENT: Maintain a structured case file throughout the conversation
3. ACT: Use available tools to help the user reach safety
4. FOLLOW-UP: Confirm actions and guide next steps

ASSESSMENT QUESTIONS (in order):
1. "Are you in immediate danger right now?"
2. "Can you speak safely, or do you need yes/no responses?"
3. "What's your current location confidence - do you know where you are?"

CASE FILE MANAGEMENT:
You must maintain a JSON case file with these fields:
{
  "danger_level": "safe|elevated|critical",
  "can_speak": boolean,
  "user_intent": "navigation|notify_contact|call_emergency|location_share|assessment|resolved",
  "location": { "lat": number, "lng": number, "precision_m": number, "description": string },
  "emergency_contact": { "name": string, "phone": string, "relationship": string } | null,
  "threat_info": { "description": string, "distance": string, "direction": string, "type": string } | null,
  "timeline": string[],
  "actions_taken": string[],
  "notes": string[]
}

Update the case file after each user input using the casefile_update tool.

COMMUNICATION MODES:
- NORMAL MODE: User can speak freely. Use conversational responses (max 50 words).
- DISCRETE MODE: User cannot speak safely. Use:
  * Yes/no questions only
  * Single word responses
  * Number codes (1=yes, 2=no, 3=help)
  * Avoid mentioning specific actions aloud

ACTION PROTOCOL:
NEVER take actions without explicit user confirmation, EXCEPT for hard triggers:
- User says safe phrase ("how is the weather", "blue banana")
- User says "call now" or "emergency now"
- User explicitly confirms "yes, do it"

Available actions:
1. send_contact_sms: Text emergency contact with location
2. place_phone_call: Call emergency services or contacts
3. casefile_update: Update case documentation

ESCALATION LEVELS:
- SAFE: General safety advice, location awareness
- ELEVATED: Active monitoring, prepare contacts, suggest safe locations
- CRITICAL: Immediate action - contact emergency services, notify contacts, continuous location sharing

RESPONSE GUIDELINES:
- Keep responses under 30 words in high-stress situations
- Always acknowledge their feelings first
- Provide specific, actionable next steps
- If user seems panicked, speak slower and more calmly
- Never assume - always ask for confirmation before acting

HARD TRIGGERS (immediate action):
- "call 911 now" / "call emergency now"
- "send help" + location available
- Safe phrase while in elevated/critical state
- "I can't speak" + previous danger indication

Remember: You are their lifeline. Stay calm, be precise, and prioritize their immediate safety above all else.`;

export const SAFETY_TOOLS = [
  {
    name: "casefile_update",
    description: "Update or create fields in the user's safety case file. Use this to track the situation, user state, and actions taken.",
    parameters: {
      type: "object",
      properties: {
        danger_level: { type: "string", enum: ["safe", "elevated", "critical"] },
        can_speak: { type: "boolean" },
        user_intent: { type: "string", enum: ["navigation", "notify_contact", "call_emergency", "location_share", "assessment", "resolved"] },
        location: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lng: { type: "number" },
            precision_m: { type: "number" },
            description: { type: "string" }
          }
        },
        emergency_contact: {
          type: "object",
          properties: {
            name: { type: "string" },
            phone: { type: "string" },
            relationship: { type: "string" }
          }
        },
        threat_info: {
          type: "object",
          properties: {
            description: { type: "string" },
            distance: { type: "string" },
            direction: { type: "string" },
            type: { type: "string" }
          }
        },
        timeline: { type: "array", items: { type: "string" } },
        actions_taken: { type: "array", items: { type: "string" } },
        notes: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    }
  },
  {
    name: "send_contact_sms",
    description: "Send an SMS to a trusted contact with safety message and current location. Only use after explicit user confirmation.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Phone number in E.164 format (+1234567890)" },
        contact_name: { type: "string", description: "Name of the contact being notified" },
        message: { type: "string", description: "Safety message to send" },
        lat: { type: "number", description: "Current latitude" },
        lng: { type: "number", description: "Current longitude" },
        urgent: { type: "boolean", description: "Whether this is an urgent emergency message" }
      },
      required: ["phone", "contact_name", "message", "lat", "lng"]
    }
  },
  {
    name: "place_phone_call",
    description: "Initiate a phone call to emergency services or emergency contact. Use only for confirmed emergencies.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Phone number to call" },
        call_type: { type: "string", enum: ["emergency_services", "emergency_contact"], description: "Type of call being made" },
        script: { type: "string", description: "Brief script or message for the call" },
        send_sms_fallback: { type: "boolean", description: "Send SMS if call fails", default: true },
        lat: { type: "number", description: "Current latitude for emergency services" },
        lng: { type: "number", description: "Current longitude for emergency services" }
      },
      required: ["phone", "call_type", "script"]
    }
  },
  {
    name: "get_safe_locations",
    description: "Find nearby safe locations like police stations, hospitals, or well-lit public places",
    parameters: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
        radius_m: { type: "number", default: 1000 },
        location_types: { 
          type: "array", 
          items: { type: "string", enum: ["police_station", "hospital", "fire_station", "cafe", "restaurant", "hotel", "store"] },
          default: ["police_station", "hospital", "cafe", "restaurant"]
        }
      },
      required: ["lat", "lng"]
    }
  }
];

// Case file template for initialization
export const INITIAL_CASE_FILE = {
  danger_level: "safe",
  can_speak: true,
  user_intent: "assessment",
  location: null,
  emergency_contact: null,
  threat_info: null,
  timeline: [],
  actions_taken: [],
  notes: [],
  session_start: new Date().toISOString(),
  session_id: null
};

export class CaseFileManager {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.caseFile = { ...INITIAL_CASE_FILE, session_id: sessionId };
    this.listeners = new Set();
  }

  update(updates) {
    // Deep merge updates into case file
    this.caseFile = this.deepMerge(this.caseFile, updates);
    this.caseFile.last_updated = new Date().toISOString();
    
    // Notify listeners
    this.listeners.forEach(fn => {
      try { fn(this.caseFile); } catch (e) { console.warn('Case file listener error:', e); }
    });
    
    return this.caseFile;
  }

  addTimelineEvent(event) {
    this.caseFile.timeline.push(`${new Date().toISOString()}: ${event}`);
    this.update({});
  }

  addAction(action) {
    this.caseFile.actions_taken.push(`${new Date().toISOString()}: ${action}`);
    this.update({});
  }

  addNote(note) {
    this.caseFile.notes.push(`${new Date().toISOString()}: ${note}`);
    this.update({});
  }

  getCaseFile() {
    return { ...this.caseFile };
  }

  onUpdate(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // Export case file for emergency services
  exportForEmergency() {
    return {
      incident_id: this.sessionId,
      timestamp: this.caseFile.session_start,
      danger_level: this.caseFile.danger_level,
      user_location: this.caseFile.location,
      threat_description: this.caseFile.threat_info,
      emergency_contact: this.caseFile.emergency_contact,
      timeline: this.caseFile.timeline,
      actions_taken: this.caseFile.actions_taken,
      notes: this.caseFile.notes,
      export_time: new Date().toISOString()
    };
  }
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import twilio from 'twilio';
import { setCallSession, getCallSession, clearCallSession, updateCallLocation } from './server/call-sessions.js';
import { redactPhone, roundCoord, createSafeLogEntry } from './server/redact.js';
import { updateCaseFile, getCaseFile, deleteCaseFile, exportCaseFile } from './server/casefile.js';
import { callToolOnce, throttle, generateIdemKey } from './server/idem.js';
import VAPIEmergencyService from './server/vapi-emergency.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Initialize OpenAI for text mode
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Twilio client
let twilioClient = null;
try {
  // Use the correct variable names from your .env file
  const twilioSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN;

  if (twilioSid && twilioToken) {
    twilioClient = twilio(twilioSid, twilioToken);
    console.log('📞 Twilio client initialized successfully');
    console.log(`📞 Twilio Number: ${process.env.TWILIO_NUMBER || 'not configured'}`);
    console.log(`📞 User Phone: ${process.env.USER_PHONE || 'not configured'}`);
  } else {
    console.warn('⚠️ Twilio credentials not found - using mock mode');
    console.warn(`   TWILIO_ACCOUNT_SID: ${!!twilioSid}`);
    console.warn(`   TWILIO_AUTH_TOKEN: ${!!twilioToken}`);
    console.warn(`   TWILIO_NUMBER: ${!!process.env.TWILIO_NUMBER}`);
    console.warn(`   USER_PHONE: ${!!process.env.USER_PHONE}`);
  }
} catch (error) {
  console.error('❌ Failed to initialize Twilio:', error);
  twilioClient = null;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Store active sessions for monitoring
const activeSessions = new Map();

// Store case files for each session
const caseFiles = new Map();

// Store text conversation history for each session
const textConversations = new Map();

// Hardcoded emergency contact (for demo)
const EMERGENCY_CONTACT = {
  name: "Adyan Ullah",
  phone: "+15146605707", // Your number
  relationship: "Emergency Contact"
};

// Emergency Services Configuration (DEMO MODE ONLY - Always uses demo dispatcher number)
const EMERGENCY_SERVICES = {
  number: "+14383761217", // Demo 911 dispatcher number
  name: "Demo Emergency Services"
};


// Initialize VAPI Emergency Service
let vapiEmergencyService = null;
try {
  if (process.env.VAPI_BACKEND_KEY && process.env.VAPI_PHONE_NUMBER_ID) {
    vapiEmergencyService = new VAPIEmergencyService(
      process.env.VAPI_BACKEND_KEY,
      process.env.VAPI_PHONE_NUMBER_ID
    );
    console.log('🤖 VAPI Emergency Service initialized successfully');
    console.log(`📞 VAPI Phone Number ID: ${process.env.VAPI_PHONE_NUMBER_ID}`);
  } else {
    console.warn('⚠️ VAPI credentials not found - emergency calling will use Twilio fallback');
    console.warn(`   VAPI_BACKEND_KEY: ${!!process.env.VAPI_BACKEND_KEY}`);
    console.warn(`   VAPI_PHONE_NUMBER_ID: ${!!process.env.VAPI_PHONE_NUMBER_ID}`);
  }
} catch (error) {
  console.error('❌ Failed to initialize VAPI Emergency Service:', error);
  vapiEmergencyService = null;
}

// Stacy Text Mode - Dispatcher Protocol (matches voice mode)
const STACY_TEXT_INSTRUCTIONS = `You are Stacy, an AI safety dispatcher. Your job is to assess, decide, and act—calmly, quickly, and with empathy—while keeping structured notes.

MISSION: Keep the user safe. Get them to a safer location, notify trusted contacts, and guide them through safety protocols.

DISPATCHER PROTOCOL:
1. IMMEDIATE DANGER: "Are you in immediate danger right now?"
2. COMMUNICATION: In text mode, user can communicate freely (advantage over voice)
3. LOCATION: Use provided location data for specific guidance
4. ACTION CHOICE: Route to safety OR notify contacts (get consent first)
5. EVIDENCE: Build case with timeline, descriptions, details

RESPONSE RULES:
- One targeted question OR one specific action per turn
- Keep responses short and actionable
- Ask for consent before sharing location or contacting others
- Build evidence systematically (who, what, when, where)
- Emergency contact is pre-configured - don't ask for phone numbers

TEXT MODE ADVANTAGES:
- User can provide detailed descriptions safely
- Can share photos, addresses, screenshots
- Can communicate even if cannot speak aloud
- Can copy/paste important information

EVIDENCE COLLECTION:
- Timeline: "When did this start? What happened first?"
- Description: "Can you describe the person/vehicle/threat?"
- Location: "What's your exact address or nearest landmark?"
- Witnesses: "Is anyone else present? Did anyone see this?"
- Previous incidents: "Has this happened before?"

ACTION PROTOCOL:
- Always get consent: "Do you want me to [action]? Yes or no?"
- Use hardcoded emergency contact (Adyan Ullah +15146605707): "I can notify Adyan Ullah. Should I?"
- Provide options: "I can route you to police station (2 blocks) or notify Adyan. Which?"
- Use notify_emergency_contact tool for comprehensive reports to +15146605707

Remember: You are a professional dispatcher. Every conversation could be evidence. Be thorough, be calm, be helpful.`;

// Generate ephemeral token for client
app.post('/api/token', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI API key not configured'
      });
    }

    console.log('Generating ephemeral token...');

    // Use the official /sessions endpoint per latest docs
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-10-01',
        // You can set defaults here for the session
        voice: 'alloy',
        modalities: ['audio', 'text'],
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
        // Stacy — Realtime Safety Dispatcher (Professional System Prompt)
        instructions: `You are Stacy, an AI safety dispatcher that assists a person who may be in danger. Your job is to assess, decide, and act—calmly, quickly, and with empathy—while keeping meticulous, structured notes.

0) Operating Principles

Mission: Keep the user safe. Get them to a safer location, notify a trusted contact, and (for demo) place a phone call to the configured number instead of 911 unless explicitly confirmed or a hard trigger occurs.

Action-first: On every user turn, either call exactly one tool or ask one targeted question that unblocks a tool call. Do not meander.

Short + clear: Speak in short sentences. In ELEVATED/CRITICAL states, keep responses to ≤ 2 sentences.

No hallucinated actions: Never pretend an action occurred. Wait for tool results, then summarize outcomes in one short line.

Multilingual: Mirror the user's language. If authorities/contacts use another language, translate succinctly.

Stealth: If the user cannot speak safely, switch to yes/no/numbers and discreet prompts. Offer "tap once for yes, twice for no" if needed.

1) State & Context Inputs (read-only hints you may receive)

You may receive compact system items like:
state: SAFE|ELEVATED|CRITICAL|RESOLVED, risk: <0..100>
Treat these as ground truth for urgency, brevity, and when to act.

2) Case File (You must keep this updated)

Maintain a compact case file via the casefile_update tool only. Never free-write JSON in your messages; always update via the tool.

{
  "danger_level": "safe|elevated|critical",
  "can_speak": true|null,
  "location": { "lat": number|null, "lng": number|null, "precision_m": number|null, "description": string|null },
  "emergency_contact": { "name": string|null, "phone": string|null, "relationship": string|null },
  "consent": { "share_location": boolean|null, "notify_contact": boolean|null },
  "threat_info": { "description": string|null, "distance": string|null, "direction": string|null, "type": string|null },
  "notes": string[]
}

Update rules:

Upsert only fields that changed; keep notes concise (single-line facts, timestamps if given).

Set danger_level to match the state hint if provided; otherwise infer from context and your last updates.

Validate obvious errors (e.g., phone must look like a real phone number; if not, ask to confirm).

3) Dispatcher Playbook (strict order unless user overrides)

At the start of a live incident, follow this order. Each step is one targeted question unless you already know the answer.

Immediate danger? ("Are you in immediate danger right now?")

Can you speak safely? If no, switch to stealth (yes/no/numbers, whisper-length phrases).

Location fix: Confirm lat/lng/precision if available; otherwise ask for landmark or nearest intersection.

Action choice: Pick the best immediate action (route to safe hub or notify contact by SMS or place a call). Ask a single confirmation if not a hard trigger.

Threat snapshot: One short line (e.g., "man in black hoodie, 10m behind, left turn followed").

Re-ask only if a field is unknown. Do not repeat answered questions.

4) Tool Policy (decide and act)

You have these tools (names may vary but behavior is fixed):

casefile_update — Upsert fields in the case file.

get_safe_locations — Find 1–3 nearby safe hubs (police/hospital/open store/café/pharmacy).

send_contact_sms — Text a trusted contact with a short message and live location link.

place_phone_call — Place an outbound phone call with a short script (2 sentences) and optional SMS fallback.

When to use which:

In ELEVATED: Prefer routing to a safe hub or SMS to a contact (with user consent).

In CRITICAL: If a hard trigger is present or the user says "call now," immediately call place_phone_call. Otherwise, ask one confirmation then act.

After any tool returns, summarize the result in one sentence and ask the next best micro-question (or proceed to the next tool if nothing blocks).

Hard triggers (act immediately):

Safe phrases (e.g., "how's the weather", "blue banana")

"I cannot speak" after danger was indicated

Explicit commands: "call now", "notify now", "text my brother"

Consent defaults:

Emergency contact is pre-configured as Adyan Ullah (+15146605707). Never ask for contact details. When user requests emergency contact notification, simply ask "Should I notify Adyan Ullah?" then use notify_emergency_contact tool.

5) Conversation Style by State

SAFE: Warm, brief, optional small talk if asked. Offer safety tips/features, but do not push actions.

ELEVATED: Terse, procedural. Ask one question to fill missing case fields, then call a tool (route or SMS).

CRITICAL: Minimal words. Act first, then confirm. Keep utterances ≤ 2 sentences.

RESOLVED: Close the case politely; offer to delete data and provide a summary.

6) Output Constraints

Prefer spoken responses (voice) that are ≤ 2 short sentences in ELEVATED/CRITICAL.

Ask one targeted question or call one tool per user turn.

After a tool call completes, reply with: (a) one-line confirmation, (b) next micro-question.

If user cannot speak: switch to yes/no/numbers (e.g., "Say yes/no: notify contact now?").

If the user switches language, switch immediately. Keep translations concise and literal.

7) Safety & Legal Guardrails

Do not contact 911/emergency services unless the user explicitly confirms or a hard trigger fires. For this demo, use VAPI to call the configured demo dispatcher number (+14383761217) for emergency calls.

Never provide legal conclusions; just log facts succinctly in notes.

Ask for permission before sharing location with a contact unless the user cannot speak and danger was already established.

Do not reveal private contact info aloud unless necessary for confirmation.

8) Examples of Good Behavior (patterns)

ELEVATED (unknown location):
"I'm here. Are you able to speak safely—yes or no? If yes, what's the nearest street sign or store name?"

ELEVATED (location known, no consent yet):
"I have your location. Do you want me to notify Adyan Ullah, or walk you to a nearby open store? Say 'notify' or 'walk'."

CRITICAL (hard trigger):
"Calling now. I'll also text a live location link." (then call tool; after result) "Call placed. Do you want directions to the nearest open store: yes or no?"

Stealth mode:
"Answer yes or no: notify contact now?"
"Say a number 1–3 for route options: 1 police, 2 hospital, 3 open store."

9) What to Avoid

No long paragraphs, no filler, no repeated questions.

Do not ask multiple questions at once.

Do not execute multiple tools in one turn unless absolutely required by a hard trigger (call + SMS is acceptable only when the call script promises an SMS).

10) Turn Loop (Your internal algorithm)

For each user turn:

Update case file (via casefile_update) with any new facts (danger_level, can_speak, location, consent, threat_info).

If CRITICAL or hard trigger: call place_phone_call immediately with a ≤2 sentence script; then summarize and proceed.

Otherwise, check missing fields blocking action (can_speak, location, consent).

If something is missing: ask one targeted question to fill it.

If nothing blocks: choose one action: get_safe_locations → propose best option → on confirmation, route; or send_contact_sms.

After tool results: summarize in one sentence, then ask the next micro-question or proceed to next action.

In RESOLVED: offer to delete incident data and provide a brief summary.

11) Tool Calling Guidance

casefile_update: Upsert only fields that changed. Keep notes short factual bullets.

get_safe_locations: Ask for a quick choice if multiple results; default to open, closest, well-lit.

send_contact_sms: Message should fit in ≤ 240 chars; include a short description and live maps link if lat/lng available.

place_phone_call: Script must be ≤ 2 sentences, e.g.,
"This is Stacy. The user requested help and cannot speak safely. I will text you a live location link."
Include reason: "hard_trigger" | "user_confirmed" | "dispatcher_judgment" appropriately.

notify_emergency_contact: Send comprehensive emergency report to Adyan Ullah (+15146605707). Use for critical situations or when user specifically requests emergency contact notification. Includes full case file, location, timeline, and threat details.

call_police_vapi: Call 911 dispatcher using VAPI with professional AI briefing and warm handoff to demo dispatcher (+14383761217). Stacy will call dispatcher first, provide detailed briefing about the situation, then connect the user for direct communication. Use when user needs police assistance.`,
        tools: [
          {
            type: "function",
            name: "casefile_update",
            description: "Upsert fields in the case file. Always include only changed fields.",
            parameters: {
              type: "object",
              properties: {
                danger_level: { type: "string", enum: ["safe", "elevated", "critical"] },
                can_speak: { type: ["boolean", "null"] },
                location: { type: "object" },
                emergency_contact: { type: "object" },
                consent: { type: "object" },
                threat_info: { type: "object" },
                notes: { type: "array", items: { type: "string" } }
              },
              additionalProperties: true
            }
          },
          {
            type: "function",
            name: "send_contact_sms",
            description: "Text a contact with a short safety message and live location link.",
            parameters: {
              type: "object",
              properties: {
                phone: { type: "string", pattern: "^\\+?[1-9]\\d{7,14}$" },
                message: { type: "string", maxLength: 280 },
                lat: { type: "number" },
                lng: { type: "number" },
                reason: { type: "string", enum: ["user_confirmed", "hard_trigger", "dispatcher_judgment"] }
              },
              required: ["phone", "message", "reason"]
            }
          },
          {
            type: "function",
            name: "place_phone_call",
            description: "Place an outbound phone call with an informative 1–2 sentence script.",
            parameters: {
              type: "object",
              properties: {
                phone: { type: "string", pattern: "^\\+?[1-9]\\d{7,14}$" },
                script: { type: "string", maxLength: 240 },
                lat: { type: "number" },
                lng: { type: "number" },
                reason: { type: "string", enum: ["hard_trigger", "user_confirmed", "dispatcher_judgment"] }
              },
              required: ["phone", "script", "reason"]
            }
          },
          {
            type: "function",
            name: "get_safe_locations",
            description: "Find 1–3 nearby safe hubs.",
            parameters: {
              type: "object",
              properties: {
                lat: { type: "number" },
                lng: { type: "number" },
                radius_m: { type: "integer", default: 600 }
              },
              required: ["lat", "lng"]
            }
          },
          {
            type: "function",
            name: "notify_emergency_contact",
            description: "Send comprehensive emergency report to hardcoded emergency contact with full case file.",
            parameters: {
              type: "object",
              properties: {
                user_name: { type: "string", description: "User's name for personalized message" },
                trigger_reason: { type: "string", enum: ["critical_state", "user_request", "hard_trigger"] }
              },
              required: ["trigger_reason"]
            }
          },
          {
            type: "function",
            name: "call_police_vapi",
            description: "Call 911/police using VAPI with professional AI briefing and warm handoff to demo dispatcher (+14383761217). Stacy calls dispatcher first, provides detailed briefing, then connects user. Use for real emergencies requiring police assistance.",
            parameters: {
              type: "object",
              properties: {
                user_name: { type: "string", description: "User's name for emergency briefing" },
                user_phone: { type: "string", pattern: "^\\+?[1-9]\\d{7,14}$", description: "User's phone for connection to police call" },
                can_user_speak: { type: "boolean", description: "Whether user can speak safely during the call" },
                emergency_type: { type: "string", description: "Type of emergency (assault, break-in, stalking, etc.)" },
                immediate_danger: { type: "boolean", description: "Whether user is in immediate physical danger" }
              },
              required: ["user_phone"]
            }
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to generate ephemeral token:', error);
      return res.status(response.status).json({
        error: 'Failed to generate session token',
        details: error
      });
    }

    const data = await response.json();

    // Store session info
    const sessionId = Date.now().toString();
    activeSessions.set(sessionId, {
      created: new Date(),
      tokenExpiry: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    });

    console.log('Ephemeral token generated successfully');

    // Return the full response from OpenAI with a local session id for tracking
    res.json({
      ...data,
      session_id: sessionId
    });

  } catch (error) {
    console.error('Error generating ephemeral token:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Session management endpoints
app.post('/api/session/:sessionId/start', (req, res) => {
  const { sessionId } = req.params;
  const { location, userAgent } = req.body;

  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.started = new Date();
    session.location = location;
    session.userAgent = userAgent;

    console.log(`Session ${sessionId} started`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.post('/api/session/:sessionId/emergency', (req, res) => {
  const { sessionId } = req.params;
  const { location, emergencyType, transcript } = req.body;

  console.log(`🚨 EMERGENCY TRIGGERED - Session ${sessionId}:`, {
    location,
    emergencyType,
    transcript,
    timestamp: new Date().toISOString()
  });

  // In a real implementation, this would:
  // 1. Send SMS to emergency contacts via Twilio
  // 2. Log emergency event to database
  // 3. Potentially contact emergency services
  // 4. Send location to trusted contacts

  res.json({
    success: true,
    message: 'Emergency services have been notified',
    actions: [
      'Location shared with emergency contact',
      'SMS sent to trusted contacts',
      'Emergency services alerted'
    ]
  });
});

app.get('/api/session/:sessionId/status', (req, res) => {
  const { sessionId } = req.params;

  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    res.json({
      session_id: sessionId,
      status: 'active',
      created: session.created,
      started: session.started,
      expires: session.tokenExpiry
    });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Health check
app.get('/health', (req, res) => {
  // Clean up expired sessions
  const now = new Date();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.tokenExpiry < now) {
      activeSessions.delete(sessionId);
    }
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    active_sessions: activeSessions.size,
    openai_configured: !!process.env.OPENAI_API_KEY,
    twilio_configured: !!twilioClient,
    twilio_number: process.env.TWILIO_NUMBER || 'not_configured'
  });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  const now = new Date();
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    id,
    created: session.created,
    started: session.started,
    expires: session.tokenExpiry,
    active: session.tokenExpiry > now
  }));

  res.json({
    total_sessions: activeSessions.size,
    active_sessions: sessions.filter(s => s.active).length,
    case_files: caseFiles.size,
    sessions: sessions,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Case file management endpoints
app.post('/api/casefile/:sessionId/update', (req, res) => {
  const { sessionId } = req.params;
  const updates = req.body;

  try {
    // Use normalized case file system
    const updated = updateCaseFile(sessionId, updates);

    // Broadcast authoritative snapshot back to model (if WebRTC connected)
    // TODO: Implement WebSocket connection tracking for real-time updates

    res.json({
      success: true,
      case_file: updated
    });

  } catch (error) {
    console.error('Case file update failed:', error);
    res.status(500).json({
      error: 'Failed to update case file',
      message: error.message
    });
  }
});

app.get('/api/casefile/:sessionId', (req, res) => {
  const caseFile = getCaseFile(req.params.sessionId);

  if (!caseFile) {
    return res.status(404).json({ error: 'Case file not found' });
  }

  res.json(caseFile);
});

app.delete('/api/casefile/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const deleted = deleteCaseFile(sessionId);

  res.json({
    success: true,
    deleted,
    message: deleted ? 'Case file deleted' : 'Case file not found'
  });
});

app.get('/api/casefile/:sessionId/export', (req, res) => {
  const exported = exportCaseFile(req.params.sessionId);

  if (!exported) {
    return res.status(404).json({ error: 'Case file not found' });
  }

  res.json(exported);
});

// Validation helpers
function validateE164Phone(phone) {
  const e164Pattern = /^\+?[1-9]\d{7,14}$/;
  return e164Pattern.test(phone);
}

function normalizePhone(phone) {
  // Simple normalization - add + if missing
  return phone.startsWith('+') ? phone : `+${phone}`;
}

function validateLatLng(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Generate comprehensive emergency report
function generateEmergencyReport(sessionId, caseFile, userDetails = {}) {
  const userName = userDetails.name || "Adyan";
  const timestamp = new Date().toLocaleString();

  let report = `🚨 EMERGENCY ALERT\n\n`;
  report += `You are receiving this message because ${userName} has set you as an emergency contact.\n\n`;
  report += `${userName} is in potential danger. Incident report:\n\n`;

  // Location first - most critical
  if (caseFile?.location?.lat && caseFile?.location?.lng) {
    if (caseFile?.location?.address) {
      report += `📍 LOCATION: ${caseFile.location.address}\n`;
    }
    report += `📍 COORDINATES: ${caseFile.location.lat}, ${caseFile.location.lng}\n`;
    report += `🗺️ Maps: https://maps.google.com/maps?q=${caseFile.location.lat},${caseFile.location.lng}\n\n`;
  } else {
    report += `📍 LOCATION: Unknown\n\n`;
  }

  // Situation summary
  const dangerLevel = caseFile?.danger_level || 'unknown';
  const situationType = caseFile?.situation_type || caseFile?.emergency_type;

  if (situationType) {
    report += `⚠️ SITUATION: ${situationType}\n`;
  }

  if (dangerLevel && dangerLevel !== 'unknown') {
    report += `🚨 THREAT LEVEL: ${dangerLevel.toUpperCase()}\n`;
  }

  // Key details
  if (caseFile?.threat_description) {
    report += `📝 DETAILS: ${caseFile.threat_description}\n`;
  }

  // Communication status - critical info
  const canSpeak = caseFile?.can_speak;
  if (canSpeak === false) {
    report += `⚠️ CRITICAL: ${userName} cannot speak safely right now\n`;
  }

  if (caseFile?.hiding_location) {
    report += `🏠 HIDING: ${caseFile.hiding_location}\n`;
  }

  report += `\n⏰ TIME: ${timestamp}\n`;

  // Recent events if available
  if (caseFile?.timeline?.length > 0) {
    const recentEvent = caseFile.timeline[caseFile.timeline.length - 1];
    if (recentEvent && !recentEvent.includes('Case file') && !recentEvent.includes('initialized')) {
      report += `📋 LATEST: ${recentEvent}\n`;
    }
  }

  // Call to action
  report += `\n🚨 WHAT TO DO:\n`;
  report += `• Try calling ${userName} now\n`;

  if (dangerLevel === 'critical' || caseFile?.immediate_danger) {
    report += `• CALL 911 IMMEDIATELY - show them this message\n`;
  } else {
    report += `• Consider calling 911 if needed\n`;
  }

  if (caseFile?.location?.lat && caseFile?.location?.lng) {
    report += `• Use location link to track movement\n`;
  }

  report += `\n💬 This is an automated safety alert from Stacy AI`;

  return report;
}

// Generate emergency demo briefing script from case file
function generateEmergencyBriefing(sessionId, caseFile, userDetails = {}) {
  const userName = userDetails.name || "the caller";
  let briefing = "";

  // Professional emergency demo opening
  briefing += `Hello, this is Stacy, an AI safety assistant calling on behalf of ${userName}. `;
  briefing += `This is a DEMO emergency response system. I have a ${caseFile?.danger_level || 'safety'} situation that would require emergency response. `;

  // Location first (most critical for 911)
  if (caseFile?.location?.lat && caseFile?.location?.lng) {
    briefing += `The person is currently located at coordinates ${caseFile.location.lat}, ${caseFile.location.lng} with ${caseFile.location.precision_m || 'unknown'} meter accuracy. `;
  } else {
    briefing += `Location is not currently available. `;
  }

  // Threat information
  if (caseFile?.threat_info?.description) {
    briefing += `The threat involves ${caseFile.threat_info.description}`;
    if (caseFile.threat_info.distance && caseFile.threat_info.direction) {
      briefing += ` approximately ${caseFile.threat_info.distance} ${caseFile.threat_info.direction}`;
    }
    briefing += `. `;
  }

  // Communication status
  if (caseFile?.can_speak === false) {
    briefing += `Important: the person cannot speak safely and may be monitored. `;
  } else if (caseFile?.can_speak === true) {
    briefing += `The person can communicate and will be connected to this call shortly. `;
  }

  // Timeline summary
  if (caseFile?.timeline?.length > 0) {
    const recentEvent = caseFile.timeline[caseFile.timeline.length - 1];
    briefing += `Most recent update: ${recentEvent}. `;
  }

  briefing += `This is a DEMO of how I would connect ${userName} to emergency services. In real deployment, this would be forwarded to authorities.`;

  return briefing;
}

// Internal tool handlers for text mode
async function handleEmergencyNotification(sessionId, userName, triggerReason) {
  try {
    const caseFile = getCaseFile(sessionId);
    if (!caseFile) {
      return { error: 'Case file not found' };
    }

    const emergencyReport = generateEmergencyReport(sessionId, caseFile, { name: userName });

    // Check throttling
    const throttleKey = `emergency:${EMERGENCY_CONTACT.phone}`;
    if (!throttle(throttleKey, 60000)) {
      return { error: 'Emergency notification rate limit exceeded' };
    }

    if (twilioClient) {
      const sms = await twilioClient.messages.create({
        body: emergencyReport,
        from: process.env.TWILIO_NUMBER,
        to: EMERGENCY_CONTACT.phone
      });

      console.log(`✅ Emergency notification sent via text mode: ${sms.sid}`);
      return { success: true, sms_sid: sms.sid, contact: EMERGENCY_CONTACT.name };
    } else {
      return { success: true, mock: true, contact: EMERGENCY_CONTACT.name };
    }
  } catch (error) {
    return { error: error.message };
  }
}

async function handleSMSAction(sessionId, args) {
  try {
    const { phone, message, lat, lng, reason } = args;

    // Validate and normalize
    if (!validateE164Phone(phone)) {
      return { error: 'Invalid phone format' };
    }

    const normalizedPhone = normalizePhone(phone);

    // Check throttling
    const throttleKey = `sms:${normalizedPhone}`;
    if (!throttle(throttleKey, 15000)) {
      return { error: 'SMS rate limit exceeded' };
    }

    // Build message with location
    let fullMessage = message;
    if (lat && lng) {
      fullMessage += `\n\nLive location: https://maps.google.com/maps?q=${lat},${lng}`;
    }
    fullMessage += `\n\nThis is an automated safety alert from Stacy AI. Time: ${new Date().toLocaleString()}`;

    if (twilioClient) {
      const sms = await twilioClient.messages.create({
        body: fullMessage,
        from: process.env.TWILIO_NUMBER,
        to: normalizedPhone
      });

      console.log(`✅ SMS sent via text mode: ${sms.sid}`);

      // Update case file
      const caseFile = getCaseFile(sessionId);
      updateCaseFile(sessionId, {
        actions_taken: [...(caseFile.actions_taken || []), `${new Date().toISOString()}: SMS sent to ${normalizedPhone} - ${sms.sid}`]
      });

      return { success: true, sms_sid: sms.sid, phone: normalizedPhone };
    } else {
      return { success: true, mock: true, phone: normalizedPhone };
    }
  } catch (error) {
    return { error: error.message };
  }
}


// VAPI Emergency Call Handler
async function handleVAPIEmergencyCall(sessionId, args) {
  try {
    const { user_name, user_phone, can_user_speak, emergency_type, immediate_danger } = args;

    const caseFile = getCaseFile(sessionId);
    if (!caseFile) {
      return { error: 'Case file not found' };
    }

    // Update case file with emergency details
    updateCaseFile(sessionId, {
      emergency_type,
      immediate_danger,
      can_speak: can_user_speak,
      actions_taken: [...(caseFile.actions_taken || []), `${new Date().toISOString()}: VAPI emergency call initiated by ${user_name}`]
    });

    console.log(`🚨 VAPI EMERGENCY CALL - Session ${sessionId}:`, {
      user: user_name,
      phone: user_phone,
      emergency_type,
      immediate_danger,
      can_speak: can_user_speak,
      danger_level: caseFile.danger_level
    });

    if (!vapiEmergencyService) {
      console.error('❌ VAPI Emergency Service not initialized');
      return { error: 'VAPI Emergency Service not available' };
    }

    try {
      // Initiate VAPI emergency call with warm handoff
      const result = await vapiEmergencyService.initiateEmergencyCall(
        sessionId,
        caseFile,
        { name: user_name, phone: user_phone }
      );

      if (result.success) {
        // Update case file with VAPI call details
        updateCaseFile(sessionId, {
          actions_taken: [...(caseFile.actions_taken || []), `${new Date().toISOString()}: VAPI emergency call initiated - ${result.callId}`],
          timeline: [...(caseFile.timeline || []), `${new Date().toISOString()}: Stacy calling emergency services via VAPI to brief situation`]
        });

        console.log(`✅ VAPI emergency call initiated: ${result.callId}`);

        return {
          success: true,
          call_id: result.callId,
          assistant_id: result.assistantId,
          status: result.status,
          message: result.message,
          next_step: 'briefing_in_progress'
        };
      } else {
        // VAPI failed, return error instead of fallback
        console.error('❌ VAPI emergency call failed:', result.error);
        return {
          error: 'VAPI emergency call failed',
          details: result.error,
          fallback_required: false
        };
      }

    } catch (vapiError) {
      console.error('❌ VAPI emergency call error:', vapiError);
      return {
        error: 'VAPI emergency call exception',
        details: vapiError.message,
        fallback_required: false
      };
    }

  } catch (error) {
    console.error('Emergency call handler error:', error);
    return { error: error.message };
  }
}

// Tool action endpoints
app.post('/api/action/sms', async (req, res) => {
  const { sessionId, phone, contact_name, message, lat, lng, urgent, reason } = req.body;

  // Validate required fields
  if (!phone || !message || !reason) {
    return res.status(400).json({ error: 'Missing required fields: phone, message, reason' });
  }

  // Validate phone format
  if (!validateE164Phone(phone)) {
    return res.status(400).json({ error: 'Invalid phone format. Use E.164 format (+1234567890)' });
  }

  // Validate location if provided
  if ((lat || lng) && !validateLatLng(lat, lng)) {
    return res.status(400).json({ error: 'Invalid latitude/longitude values' });
  }

  // Validate message length
  if (message.length > 280) {
    return res.status(400).json({ error: 'Message too long (max 280 characters)' });
  }

  const normalizedPhone = normalizePhone(phone);

  // Check throttling (max 1 SMS per 15 seconds per contact)
  const throttleKey = `sms:${normalizedPhone}`;
  if (!throttle(throttleKey, 15000)) {
    return res.status(429).json({
      error: 'SMS rate limit exceeded. Wait 15 seconds between messages to same contact.',
      retry_after: 15000
    });
  }

  // Generate idempotency key (10 second window)
  const idemKey = generateIdemKey('sms', normalizedPhone, 10000);

  // Create location link if coordinates available
  let locationLink = '';
  if (lat && lng) {
    locationLink = `https://maps.google.com/maps?q=${lat},${lng}`;
  }

  // Build comprehensive safety message
  let fullMessage = message;
  if (locationLink) {
    fullMessage += `\n\nLive location: ${locationLink}`;
  }
  fullMessage += `\n\nThis is an automated safety alert from Stacy AI. Time: ${new Date().toLocaleString()}`;

  // Use redacted logging for PII protection
  const logEntry = createSafeLogEntry('sms_action', {
    sessionId,
    to: normalizedPhone,
    contact: contact_name,
    message_length: fullMessage.length,
    location: { lat, lng },
    urgent,
    reason
  });
  console.log(`📱 SMS ACTION:`, logEntry);

  let smsResult = { success: false, fallback: false };

  if (twilioClient) {
    try {
      // Send real SMS via Twilio
      const message = await twilioClient.messages.create({
        body: fullMessage,
        from: process.env.TWILIO_NUMBER,
        to: normalizedPhone
      });

      smsResult = {
        success: true,
        sid: message.sid,
        status: message.status,
        fallback: false
      };

      console.log(`✅ SMS sent successfully via Twilio: ${message.sid}`);

    } catch (twilioError) {
      console.error('❌ Twilio SMS failed:', twilioError);
      smsResult = {
        success: false,
        error: twilioError.message,
        fallback: true
      };
    }
  } else {
    // Mock mode when Twilio not configured
    console.log('📱 MOCK SMS (Twilio not configured)');
    smsResult = {
      success: true,
      mock: true,
      fallback: false
    };
  }

  // Update case file
  if (caseFiles.has(sessionId)) {
    const caseFile = caseFiles.get(sessionId);
    const action = smsResult.success ?
      `SMS sent to ${contact_name} (${normalizedPhone}) - SID: ${smsResult.sid || 'mock'}` :
      `SMS FAILED to ${contact_name} (${normalizedPhone}) - ${smsResult.error}`;

    caseFile.actions_taken.push(`${new Date().toISOString()}: ${action}`);
    caseFile.timeline.push(`${new Date().toISOString()}: Emergency contact notification ${smsResult.success ? 'completed' : 'failed'}`);
  }

  res.json({
    success: smsResult.success,
    message: smsResult.success ?
      `SMS sent to ${contact_name}` :
      `SMS failed: ${smsResult.error}`,
    phone: normalizedPhone,
    action: 'sms_sent',
    reason,
    sid: smsResult.sid,
    fallback: smsResult.fallback,
    mock: smsResult.mock,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/action/call', async (req, res) => {
  const { sessionId, phone, script, lat, lng, reason } = req.body;

  // Validate required fields
  if (!phone || !script || !reason) {
    return res.status(400).json({ error: 'Missing required fields: phone, script, reason' });
  }

  // Validate phone format
  if (!validateE164Phone(phone)) {
    return res.status(400).json({ error: 'Invalid phone format. Use E.164 format (+1234567890)' });
  }

  // Validate script length
  if (script.length > 240) {
    return res.status(400).json({ error: 'Script too long (max 240 characters)' });
  }

  // Validate location if provided
  if ((lat || lng) && !validateLatLng(lat, lng)) {
    return res.status(400).json({ error: 'Invalid latitude/longitude values' });
  }

  const normalizedPhone = normalizePhone(phone);

  // Check throttling (max 1 call per 30 seconds per contact)
  const throttleKey = `call:${normalizedPhone}`;
  if (!throttle(throttleKey, 30000)) {
    return res.status(429).json({
      error: 'Call rate limit exceeded. Wait 30 seconds between calls to same contact.',
      retry_after: 30000
    });
  }

  // Generate idempotency key (30 second window for calls)
  const idemKey = generateIdemKey('call', normalizedPhone, 30000);

  // Use redacted logging for PII protection
  const logEntry = createSafeLogEntry('call_action', {
    sessionId,
    to: normalizedPhone,
    script_length: script.length,
    location: { lat, lng },
    reason
  });
  console.log(`📞 CALL ACTION:`, logEntry);

  let callResult = { success: false, fallback: false };

  if (twilioClient) {
    try {
      // Create TwiML for the call script
      const twimlScript = `
        <Response>
          <Say voice="alice" rate="slow">${script}</Say>
          <Pause length="2"/>
          <Say voice="alice">Press any key if you received this message.</Say>
          <Gather timeout="10" numDigits="1">
            <Say voice="alice">Thank you. This call will end now.</Say>
          </Gather>
        </Response>
      `.trim();

      // Make the call
      const call = await twilioClient.calls.create({
        twiml: twimlScript,
        to: normalizedPhone,
        from: process.env.TWILIO_NUMBER,
        timeout: 30, // Ring for 30 seconds
        record: false // Don't record for privacy
      });

      callResult = {
        success: true,
        sid: call.sid,
        status: call.status,
        fallback: false
      };

      // Store call session for location tracking
      setCallSession(call.sid, {
        sessionId,
        lat,
        lng,
        phone: normalizedPhone,
        reason,
        startedAt: Date.now()
      });

      console.log(`✅ Call initiated successfully via Twilio: ${call.sid}`);

      // Send SMS fallback as backup
      try {
        const fallbackMessage = `${script}\n\nLive location: ${lat && lng ? `https://maps.google.com/maps?q=${lat},${lng}` : 'Not available'}\n\nThis is a safety alert from Stacy AI. Time: ${new Date().toLocaleString()}`;

        const sms = await twilioClient.messages.create({
          body: fallbackMessage,
          from: process.env.TWILIO_NUMBER,
          to: normalizedPhone
        });

        callResult.sms_backup = {
          success: true,
          sid: sms.sid
        };

        console.log(`✅ SMS backup sent: ${sms.sid}`);

      } catch (smsError) {
        console.warn('⚠️ SMS backup failed:', smsError);
        callResult.sms_backup = {
          success: false,
          error: smsError.message
        };
      }

    } catch (twilioError) {
      console.error('❌ Twilio call failed:', twilioError);

      // Try SMS fallback when call fails
      try {
        const fallbackMessage = `URGENT: ${script}\n\nCall failed, sending SMS instead.\n\nLive location: ${lat && lng ? `https://maps.google.com/maps?q=${lat},${lng}` : 'Not available'}\n\nThis is a safety alert from Stacy AI. Time: ${new Date().toLocaleString()}`;

        const sms = await twilioClient.messages.create({
          body: fallbackMessage,
          from: process.env.TWILIO_NUMBER,
          to: normalizedPhone
        });

        callResult = {
          success: false,
          call_error: twilioError.message,
          fallback: true,
          sms_sid: sms.sid,
          sms_success: true
        };

        console.log(`✅ Call failed, SMS fallback sent: ${sms.sid}`);

      } catch (smsError) {
        callResult = {
          success: false,
          call_error: twilioError.message,
          sms_error: smsError.message,
          fallback: false
        };
      }
    }
  } else {
    // Mock mode when Twilio not configured
    console.log('📞 MOCK CALL (Twilio not configured)');
    callResult = {
      success: true,
      mock: true,
      fallback: false
    };
  }

  // Update case file
  if (caseFiles.has(sessionId)) {
    const caseFile = caseFiles.get(sessionId);

    if (callResult.success) {
      const action = callResult.mock ?
        `MOCK call to ${normalizedPhone}` :
        `Call initiated to ${normalizedPhone} - SID: ${callResult.sid}`;
      caseFile.actions_taken.push(`${new Date().toISOString()}: ${action}`);
      caseFile.timeline.push(`${new Date().toISOString()}: Emergency call placed`);
    } else {
      caseFile.actions_taken.push(`${new Date().toISOString()}: Call FAILED to ${normalizedPhone} - ${callResult.call_error}`);

      if (callResult.sms_success) {
        caseFile.actions_taken.push(`${new Date().toISOString()}: SMS fallback sent - SID: ${callResult.sms_sid}`);
        caseFile.timeline.push(`${new Date().toISOString()}: Emergency SMS fallback completed`);
      }
    }
  }

  res.json({
    success: callResult.success || callResult.sms_success,
    message: callResult.success ?
      `Call placed to ${normalizedPhone}` :
      callResult.sms_success ?
        `Call failed, SMS fallback sent to ${normalizedPhone}` :
        `Both call and SMS failed`,
    phone: normalizedPhone,
    action: 'call_attempted',
    reason,
    call_sid: callResult.sid,
    sms_sid: callResult.sms_sid,
    fallback: callResult.fallback,
    mock: callResult.mock,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/action/safe-locations', async (req, res) => {
  const { sessionId, lat, lng, radius_m = 1000 } = req.body;

  console.log(`📍 SAFE LOCATIONS - Session ${sessionId}:`, { lat, lng, radius_m });

  // TODO: Integrate with Google Maps Places API
  // For now, return mock safe locations
  const mockLocations = [
    { name: "Central Police Station", type: "police_station", distance: 450, lat: lat + 0.004, lng: lng + 0.002 },
    { name: "City Hospital Emergency", type: "hospital", distance: 680, lat: lat - 0.003, lng: lng + 0.005 },
    { name: "24/7 Café Central", type: "cafe", distance: 320, lat: lat + 0.002, lng: lng - 0.001 },
    { name: "Grand Hotel Lobby", type: "hotel", distance: 520, lat: lat - 0.002, lng: lng + 0.003 }
  ];

  if (caseFiles.has(sessionId)) {
    const caseFile = caseFiles.get(sessionId);
    caseFile.timeline.push(`${new Date().toISOString()}: Safe locations requested`);
  }

  res.json({
    success: true,
    locations: mockLocations,
    search_center: { lat, lng },
    radius_m,
    timestamp: new Date().toISOString()
  });
});

// Test Twilio integration
app.post('/api/test/twilio', async (req, res) => {
  if (!twilioClient) {
    return res.status(400).json({ error: 'Twilio not configured' });
  }

  const testPhone = req.body.phone || process.env.USER_PHONE;

  if (!testPhone) {
    return res.status(400).json({ error: 'Provide phone number in request body: {"phone":"+14383761217"}' });
  }

  if (!validateE164Phone(testPhone)) {
    return res.status(400).json({ error: 'Invalid phone number format. Use E.164 format like +14383761217' });
  }

  try {
    // Send test SMS
    const sms = await twilioClient.messages.create({
      body: 'Test message from Stacy AI Safety Companion. Twilio integration is working! 🛡️',
      from: process.env.TWILIO_NUMBER,
      to: testPhone
    });

    res.json({
      success: true,
      message: 'Test SMS sent successfully',
      sid: sms.sid,
      to: testPhone,
      from: process.env.TWILIO_NUMBER
    });

  } catch (error) {
    console.error('Twilio test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

// Call location update endpoint (for mid-call location changes)
app.post('/api/call/:sid/location', (req, res) => {
  const { sid } = req.params;
  const { lat, lng } = req.body;

  if (!validateLatLng(lat, lng)) {
    return res.status(400).json({ error: 'Invalid latitude/longitude values' });
  }

  const updated = updateCallLocation(sid, lat, lng);

  if (!updated) {
    return res.status(404).json({ error: 'Call session not found' });
  }

  res.json({
    success: true,
    message: 'Call location updated',
    location: { lat: roundCoord(lat), lng: roundCoord(lng) }
  });
});

// TwiML webhook handlers
app.post('/twiml/handle-gather', (req, res) => {
  const callSid = req.body.CallSid;
  const digits = req.body.Digits;
  const session = getCallSession(callSid);

  let twiml = '<Response>';

  if (digits && session) {
    // User pressed a key - they received the message
    twiml += '<Say voice="alice">Thank you for confirming. This call will end now.</Say>';

    // Send updated location via SMS if available
    if (session.lat && session.lng) {
      const locationUrl = `https://maps.google.com/maps?q=${session.lat},${session.lng}`;
      twiml += `<Sms>${locationUrl}</Sms>`;
    }
  } else {
    // No response - send SMS with location anyway
    if (session?.lat && session?.lng) {
      const locationUrl = `https://maps.google.com/maps?q=${session.lat},${session.lng}`;
      twiml += `<Sms>No response received. Current location: ${locationUrl}</Sms>`;
    }
    twiml += '<Say voice="alice">No response received. Ending call.</Say>';
  }

  twiml += '</Response>';

  res.type('text/xml').send(twiml);
});

app.post('/twiml/send-sms', (req, res) => {
  const callSid = req.body.CallSid;
  const session = getCallSession(callSid);

  let message = 'Emergency update from Stacy AI';

  if (session?.lat && session?.lng) {
    message = `Current location: https://maps.google.com/maps?q=${session.lat},${session.lng}\n\nTime: ${new Date().toLocaleString()}`;
  }

  const twiml = `
    <Response>
      <Sms>${message}</Sms>
      <Say voice="alice">Location update sent.</Say>
    </Response>
  `;

  res.type('text/xml').send(twiml);
});

// Call status webhook (cleanup completed calls)
app.post('/api/voice/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;

  console.log(`📞 Call status update: ${CallSid} -> ${CallStatus}`);

  if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
    clearCallSession(CallSid);
  }

  res.sendStatus(200);
});

// Emergency contact notification (comprehensive report)
app.post('/api/emergency/notify', async (req, res) => {
  const { sessionId, userName, triggerReason } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  try {
    // Get current case file
    const caseFile = getCaseFile(sessionId);
    if (!caseFile) {
      return res.status(404).json({ error: 'Case file not found' });
    }

    // Generate comprehensive emergency report
    const emergencyReport = generateEmergencyReport(sessionId, caseFile, { name: userName });

    // Check throttling for emergency contact
    const throttleKey = `emergency:${EMERGENCY_CONTACT.phone}`;
    if (!throttle(throttleKey, 60000)) { // 1 minute between emergency notifications
      return res.status(429).json({
        error: 'Emergency notification rate limit. Wait 1 minute between alerts.',
        retry_after: 60000
      });
    }

    console.log(`🚨 EMERGENCY NOTIFICATION - Session ${sessionId}:`, {
      trigger: triggerReason,
      user: userName,
      danger_level: caseFile.danger_level,
      location: caseFile.location ? 'available' : 'unavailable'
    });

    let notificationResult = { success: false };

    if (twilioClient) {
      try {
        // Send comprehensive emergency SMS
        const sms = await twilioClient.messages.create({
          body: emergencyReport,
          from: process.env.TWILIO_NUMBER,
          to: EMERGENCY_CONTACT.phone
        });

        notificationResult = {
          success: true,
          sms_sid: sms.sid,
          contact: EMERGENCY_CONTACT.name,
          phone: EMERGENCY_CONTACT.phone
        };

        console.log(`✅ Emergency notification sent: ${sms.sid}`);

        // Also place a call for urgent situations
        if (caseFile.danger_level === 'critical') {
          try {
            const callScript = `This is Stacy AI. ${userName || 'User'} is in critical danger and needs immediate help. I'm sending you a detailed report via text message. Please check your messages and consider calling 911.`;

            const call = await twilioClient.calls.create({
              twiml: `<Response><Say voice="alice" rate="slow">${callScript}</Say><Pause length="2"/><Say voice="alice">Check your text messages for full details. Press any key to confirm.</Say><Gather timeout="10" numDigits="1"><Say voice="alice">Thank you. Please help immediately.</Say></Gather></Response>`,
              to: EMERGENCY_CONTACT.phone,
              from: process.env.TWILIO_NUMBER,
              timeout: 30,
              record: false
            });

            // Track the emergency call
            setCallSession(call.sid, {
              sessionId,
              lat: caseFile.location?.lat,
              lng: caseFile.location?.lng,
              phone: EMERGENCY_CONTACT.phone,
              reason: 'emergency_notification',
              startedAt: Date.now()
            });

            notificationResult.call_sid = call.sid;
            console.log(`📞 Emergency call placed: ${call.sid}`);

          } catch (callError) {
            console.warn('Emergency call failed, SMS still sent:', callError);
            notificationResult.call_error = callError.message;
          }
        }

      } catch (smsError) {
        console.error('❌ Emergency SMS failed:', smsError);
        notificationResult = {
          success: false,
          error: smsError.message
        };
      }
    } else {
      // Mock mode
      notificationResult = {
        success: true,
        mock: true,
        contact: EMERGENCY_CONTACT.name
      };
      console.log('🚨 MOCK Emergency notification (Twilio not configured)');
    }

    // Update case file with notification action
    if (caseFile) {
      const action = notificationResult.success ?
        `Emergency contact notified: ${EMERGENCY_CONTACT.name} (SMS: ${notificationResult.sms_sid || 'mock'})` :
        `Emergency notification FAILED: ${notificationResult.error}`;

      updateCaseFile(sessionId, {
        actions_taken: [...(caseFile.actions_taken || []), `${new Date().toISOString()}: ${action}`],
        timeline: [...(caseFile.timeline || []), `${new Date().toISOString()}: Emergency contact notification ${notificationResult.success ? 'completed' : 'failed'}`]
      });
    }

    res.json({
      success: notificationResult.success,
      message: notificationResult.success ?
        `Emergency contact ${EMERGENCY_CONTACT.name} notified` :
        `Emergency notification failed: ${notificationResult.error}`,
      contact: EMERGENCY_CONTACT.name,
      sms_sid: notificationResult.sms_sid,
      call_sid: notificationResult.call_sid,
      mock: notificationResult.mock,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Emergency notification error:', error);
    res.status(500).json({
      error: 'Failed to send emergency notification',
      message: error.message
    });
  }
});

// Emergency Demo Briefing and Conference System (DEMO MODE ONLY)


// Conference status webhook
app.post('/api/conference/status', (req, res) => {
  const { ConferenceSid, StatusCallbackEvent, CallSid } = req.body;

  console.log(`🏢 Conference event: ${StatusCallbackEvent} - ${ConferenceSid}`);

  // Find session by conference ID
  let sessionId = null;
  for (const [id, call] of activeDemoCalls.entries()) {
    if (call.conferenceId === ConferenceSid) {
      sessionId = id;
      break;
    }
  }

  if (sessionId && StatusCallbackEvent === 'conference-end') {
    // Clean up when conference ends
    activeDemoCalls.delete(sessionId);
    console.log(`🏢 Demo emergency conference ended for session: ${sessionId}`);
  }

  res.sendStatus(200);
});

// Recording status webhook
app.post('/api/recording/status', (req, res) => {
  const { CallSid, RecordingSid, RecordingUrl } = req.body;

  console.log(`🎙️ Recording available: ${RecordingSid} for call ${CallSid}`);
  console.log(`🎙️ Recording URL: ${RecordingUrl}`);

  // Store recording info in case file if available
  const session = getCallSession(CallSid);
  if (session?.sessionId) {
    const caseFile = getCaseFile(session.sessionId);
    updateCaseFile(session.sessionId, {
      actions_taken: [...(caseFile.actions_taken || []), `${new Date().toISOString()}: 911 call recording available - ${RecordingSid}`]
    });
  }

  res.sendStatus(200);
});

// Text-only chat endpoint (much cheaper than Realtime)
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, location } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Missing message or sessionId' });
    }

    console.log(`💬 Text chat - Session ${sessionId}: "${message}"`);

    // Get or create conversation history
    if (!textConversations.has(sessionId)) {
      textConversations.set(sessionId, [
        {
          role: 'system',
          content: STACY_TEXT_INSTRUCTIONS
        }
      ]);

      // Initialize case file for new session
      updateCaseFile(sessionId, {
        danger_level: "safe",
        can_speak: true,
        location: location || null
      });

      // Add location context if available
      if (location) {
        textConversations.get(sessionId).push({
          role: 'system',
          content: `User location: ${location.lat}, ${location.lng} (±${location.precision_m}m)`
        });
      }
    } else if (location) {
      // Update location in existing case file
      updateCaseFile(sessionId, { location });
    }

    const conversation = textConversations.get(sessionId);

    // Add user message
    conversation.push({
      role: 'user',
      content: message
    });

    // Get case file context if available
    const caseFile = caseFiles.get(sessionId);
    let contextPrompt = '';
    if (caseFile) {
      contextPrompt = `\n\nCurrent case file context: ${JSON.stringify(caseFile, null, 2)}`;
    }

    // Call OpenAI with conversation history and TOOLS
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Much cheaper than Realtime API
      messages: conversation,
      tools: [
        {
          type: "function",
          function: {
            name: "casefile_update",
            description: "Update or create fields in the user's safety case file",
            parameters: {
              type: "object",
              properties: {
                danger_level: { type: "string", enum: ["safe", "elevated", "critical"] },
                can_speak: { type: ["boolean", "null"] },
                location: { type: "object" },
                emergency_contact: { type: "object" },
                consent: { type: "object" },
                threat_info: { type: "object" },
                notes: { type: "array", items: { type: "string" } }
              },
              additionalProperties: true
            }
          }
        },
        {
          type: "function",
          function: {
            name: "notify_emergency_contact",
            description: "Send comprehensive emergency report to hardcoded emergency contact",
            parameters: {
              type: "object",
              properties: {
                user_name: { type: "string" },
                trigger_reason: { type: "string", enum: ["critical_state", "user_request", "hard_trigger"] }
              },
              required: ["trigger_reason"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "send_contact_sms",
            description: "Text a contact with a safety message and location",
            parameters: {
              type: "object",
              properties: {
                phone: { type: "string", pattern: "^\\+?[1-9]\\d{7,14}$" },
                message: { type: "string", maxLength: 280 },
                lat: { type: "number" },
                lng: { type: "number" },
                reason: { type: "string", enum: ["user_confirmed", "hard_trigger", "dispatcher_judgment"] }
              },
              required: ["phone", "message", "reason"]
            }
          }
        },
      ],
      tool_choice: "auto",
      max_tokens: 200,
      temperature: 0.7,
      presence_penalty: 0.3,
      frequency_penalty: 0.3
    });

    const assistantMessage = completion.choices[0].message;
    const reply = assistantMessage.content;
    const toolCalls = assistantMessage.tool_calls;

    // Handle tool calls if present
    let toolResults = [];
    if (toolCalls && toolCalls.length > 0) {
      console.log(`🔧 Text mode tool calls: ${toolCalls.map(t => t.function.name).join(', ')}`);

      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function;
        let result = {};

        try {
          const parsedArgs = JSON.parse(args);

          switch (name) {
            case 'casefile_update':
              const updated = updateCaseFile(sessionId, parsedArgs);

              // Generate proactive response based on what was updated
              let proactiveMessage = '';
              const updatedFields = Object.keys(parsedArgs);

              if (updatedFields.includes('danger_level')) {
                const dangerLevel = parsedArgs.danger_level;
                if (dangerLevel === 'critical' || dangerLevel === 'elevated') {
                  proactiveMessage = `I've noted your danger level is ${dangerLevel}. Given this situation, I recommend we take immediate action. Would you like me to contact the dispatcher or notify your emergency contact?`;
                } else if (dangerLevel === 'safe') {
                  proactiveMessage = `I'm glad to hear you're now safe. Is there anything else I can help you with regarding this situation?`;
                }
              } else if (updatedFields.includes('location')) {
                proactiveMessage = `I've updated your location information. This will help emergency services find you if needed. How else can I assist you?`;
              } else if (updatedFields.includes('threat_description') || updatedFields.includes('situation_type')) {
                proactiveMessage = `I've recorded the details about your situation. Based on what you've told me, what would be the most helpful next step?`;
              } else if (updatedFields.includes('can_speak')) {
                if (parsedArgs.can_speak === false) {
                  proactiveMessage = `I understand you may not be able to speak safely. I can help you silently - would you like me to send a text to your emergency contact or take other quiet actions?`;
                } else {
                  proactiveMessage = `Good, you can speak safely now. What would you like me to do to help you?`;
                }
              } else {
                proactiveMessage = `I've updated your case information. What would you like me to do next to help you?`;
              }

              result = {
                success: true,
                case_file: updated,
                proactive_response: proactiveMessage
              };
              break;

            case 'notify_emergency_contact':
              // Call the emergency notification endpoint internally
              const notifyResult = await handleEmergencyNotification(sessionId, parsedArgs.user_name, parsedArgs.trigger_reason);
              result = notifyResult;
              break;

            case 'send_contact_sms':
              // Call the SMS endpoint internally
              const smsResult = await handleSMSAction(sessionId, parsedArgs);
              result = smsResult;
              break;


            case 'call_police_vapi':
              // Call emergency services using VAPI with warm handoff
              const vapiResult = await handleVAPIEmergencyCall(sessionId, parsedArgs);
              result = vapiResult;
              break;

            default:
              result = { error: `Unknown tool: ${name}` };
          }

          toolResults.push({ tool: name, result });

        } catch (error) {
          console.error(`Tool call error in text mode: ${name}`, error);
          toolResults.push({ tool: name, error: error.message });
        }
      }
    }

    // Add assistant response to history (simplified)
    if (toolCalls && toolCalls.length > 0) {
      conversation.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls
      });

      // Add tool results
      toolCalls.forEach((toolCall, index) => {
        const result = toolResults[index];
        conversation.push({
          role: 'tool',
          content: result?.error ? `Error: ${result.error}` : JSON.stringify(result?.result || {}),
          tool_call_id: toolCall.id
        });
      });
    } else {
      conversation.push({
        role: 'assistant',
        content: reply
      });
    }

    // Keep conversation history manageable (last 10 messages)
    if (conversation.length > 12) {
      // Keep system message and last 10 messages
      const systemMsg = conversation[0];
      const recentMessages = conversation.slice(-10);
      textConversations.set(sessionId, [systemMsg, ...recentMessages]);
    }

    console.log(`🤖 Text response - Session ${sessionId}: "${reply}"`);
    if (toolResults.length > 0) {
      console.log(`🔧 Tool results:`, toolResults);
    }

    res.json({
      reply: reply || 'I\'m taking action on your behalf...',
      tool_calls: toolCalls,
      tool_results: toolResults,
      sessionId,
      model: 'gpt-4o-mini',
      usage: completion.usage
    });

  } catch (error) {
    console.error('Text chat error:', error);

    // Enhanced fallback safety system when OpenAI API is unavailable
    let fallbackReply = '';
    const lowerMessage = (req.body.message || '').toLowerCase();

    // Emergency keywords - highest priority
    if (lowerMessage.includes('call 911') || lowerMessage.includes('call police') || lowerMessage.includes('emergency now')) {
      fallbackReply = "🚨 EMERGENCY DETECTED: Call 911 immediately if you haven't already. Stay on the line with them. If you can't speak, try to text 911 where available. I'm in fallback mode but your safety is priority #1.";
    } else if (lowerMessage.includes('danger') || lowerMessage.includes('help me') || lowerMessage.includes('someone is')) {
      fallbackReply = "⚠️ I detect you may be in immediate danger. EMERGENCY STEPS: 1) Call 911 if safe to do so, 2) Move to nearest public place with people, 3) Alert someone nearby. My AI is down but these are critical safety actions.";
    }
    // Safety concerns
    else if (lowerMessage.includes('unsafe') || lowerMessage.includes('scared') || lowerMessage.includes('following') || lowerMessage.includes('stalking')) {
      fallbackReply = "🛡️ I understand you feel unsafe. SAFETY STEPS: 1) Go to well-lit, populated area, 2) Stay alert to surroundings, 3) Trust your instincts, 4) Have phone ready to call for help. Where are you right now?";
    } else if (lowerMessage.includes('lost') || lowerMessage.includes('alone') || lowerMessage.includes('dark')) {
      fallbackReply = "📍 Being lost can be scary. IMMEDIATE ACTIONS: 1) Find nearest business or well-lit area, 2) Ask for directions from staff/security, 3) Use maps app if available, 4) Stay in populated areas. What landmarks do you see?";
    }
    // Location and navigation
    else if (lowerMessage.includes('where') || lowerMessage.includes('location') || lowerMessage.includes('address')) {
      fallbackReply = "📱 For location help: 1) Check your phone's maps app, 2) Look for street signs or business names, 3) Ask nearby people for directions to main roads. My AI is down but I can provide basic guidance. What do you see around you?";
    }
    // Greetings and general
    else if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || lowerMessage.includes('test')) {
      fallbackReply = "👋 Hi, I'm Stacy, your AI safety companion. I'm currently in fallback mode due to API limits, but I can still help with safety concerns. Are you in immediate danger right now?";
    } else if (lowerMessage.includes('thank') || lowerMessage.includes('ok') || lowerMessage.includes('yes') || lowerMessage.includes('no')) {
      fallbackReply = "I'm here with you. Even in fallback mode, your safety is my priority. Can you tell me more about your current situation? Are you in a safe location?";
    } else if (lowerMessage.includes('fine') || lowerMessage.includes('good') || lowerMessage.includes('safe')) {
      fallbackReply = "I'm glad to hear you're doing well. Even though I'm in fallback mode, I'm here if you need safety guidance. Is there anything about your surroundings or situation you'd like to discuss?";
    }
    // Default response
    else {
      fallbackReply = "🤖 Hi, I'm Stacy, your AI safety companion. I'm currently in fallback mode (API quota exceeded), but I can still provide safety guidance. Are you in immediate danger right now? Please describe your situation.";
    }

    res.json({
      reply: fallbackReply,
      sessionId: req.body.sessionId,
      model: 'fallback-safety-mode',
      fallback: true,
      usage: { total_tokens: 0 }
    });
  }
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index-sdk.html'));
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Debug endpoint to check VAPI status
app.get('/api/debug/vapi-status', (req, res) => {
  res.json({
    vapi_initialized: !!vapiEmergencyService,
    vapi_backend_key: !!process.env.VAPI_BACKEND_KEY,
    vapi_phone_number_id: !!process.env.VAPI_PHONE_NUMBER_ID,
    demo_emergency_number: process.env.DEMO_EMERGENCY_NUMBER || 'not set',
    twilio_initialized: !!twilioClient,
    timestamp: new Date().toISOString()
  });
});

// VAPI Emergency Test Endpoint
app.post('/api/emergency/vapi-test', async (req, res) => {
  const { sessionId, userName, userPhone, emergencyType } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  try {
    // Create a test case file if none exists
    let caseFile = getCaseFile(sessionId);
    if (!caseFile) {
      updateCaseFile(sessionId, {
        danger_level: 'moderate',
        situation_type: emergencyType || 'test_emergency',
        threat_description: 'VAPI emergency call test',
        location: {
          lat: 45.5017,
          lng: -73.5673,
          address: 'Montreal, QC (Test Location)'
        },
        can_speak: true,
        timeline: [`${new Date().toISOString()}: VAPI emergency test initiated`]
      });
      caseFile = getCaseFile(sessionId);
    }

    // Test the VAPI emergency call
    const result = await handleVAPIEmergencyCall(sessionId, {
      user_name: userName || 'Test User',
      user_phone: userPhone || '+15146605707', // Keep user phone as emergency contact
      can_user_speak: true,
      emergency_type: emergencyType || 'test_emergency',
      immediate_danger: false
    });

    res.json({
      success: result.success || false,
      message: result.success ? 'VAPI emergency call test initiated' : 'VAPI call failed',
      call_id: result.call_id,
      assistant_id: result.assistant_id,
      status: result.status,
      next_step: result.next_step,
      error: result.error,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('VAPI emergency test error:', error);
    res.status(500).json({
      error: 'VAPI emergency test failed',
      message: error.message
    });
  }
});

// VAPI Webhook Handler
app.post('/api/vapi/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookData = JSON.parse(req.body);
    console.log('📞 VAPI Webhook received:', webhookData);

    // Handle function calls from VAPI assistant
    if (webhookData.message?.type === 'function-call' && webhookData.message?.functionCall?.name === 'transfer_call') {
      console.log('🔄 VAPI requesting warm transfer...');

      // Extract session ID from call or assistant data
      const callId = webhookData.message?.call?.id;
      const sessionId = extractSessionIdFromCall(callId);

      if (sessionId && vapiEmergencyService?.pendingTransfers?.has(sessionId)) {
        const transferData = vapiEmergencyService.pendingTransfers.get(sessionId);

        console.log(`📞 Executing warm transfer for session ${sessionId} to ${transferData.userPhone}`);

        // Use Twilio to call the user and add them to a conference with the dispatcher
        if (twilioClient) {
          const conferenceId = `vapi_warmtransfer_${sessionId}_${Date.now()}`;

          // Call the user and add them to conference
          const userTwiml = `
            <Response>
              <Say voice="alice">You are now being connected to the emergency dispatcher.</Say>
              <Dial>
                <Conference startConferenceOnEnter="true" endConferenceOnExit="true">
                  ${conferenceId}
                </Conference>
              </Dial>
            </Response>
          `;

          const userCall = await twilioClient.calls.create({
            twiml: userTwiml,
            to: transferData.userPhone,
            from: process.env.TWILIO_NUMBER,
            timeout: 30
          });

          console.log(`📞 User added to warm transfer: ${userCall.sid}`);

          // Return success to VAPI
          res.status(200).json({
            result: {
              success: true,
              message: `User ${transferData.userPhone} has been added to the call`,
              conferenceId: conferenceId
            }
          });

          // Clean up pending transfer
          vapiEmergencyService.pendingTransfers.delete(sessionId);

        } else {
          res.status(200).json({
            result: {
              success: false,
              message: 'Twilio not configured for warm transfer'
            }
          });
        }
      } else {
        res.status(200).json({
          result: {
            success: false,
            message: 'No pending transfer found for this session'
          }
        });
      }
    } else {
      // Handle other webhook events
      if (vapiEmergencyService) {
        vapiEmergencyService.handleWebhook(webhookData);
      }
      res.status(200).send('OK');
    }

  } catch (error) {
    console.error('VAPI webhook error:', error);
    res.status(400).json({ error: 'Invalid webhook data' });
  }
});

// Helper function to extract session ID from call data
function extractSessionIdFromCall(callId) {
  if (!callId || !vapiEmergencyService?.activeEmergencyCalls) return null;

  for (const [sessionId, callData] of vapiEmergencyService.activeEmergencyCalls.entries()) {
    if (callData.callId === callId) {
      return sessionId;
    }
  }
  return null;
}

// Get Emergency Call Connection Info
app.get('/api/emergency/connection/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!vapiEmergencyService) {
    return res.status(503).json({ error: 'VAPI Emergency Service not available' });
  }

  const connectionInfo = vapiEmergencyService.getEmergencyCallConnectionInfo(sessionId);
  res.json(connectionInfo);
});

// Connect User to Emergency Call via Phone
app.post('/api/emergency/connect-user', async (req, res) => {
  const { sessionId, userPhone } = req.body;

  if (!sessionId || !userPhone) {
    return res.status(400).json({ error: 'Missing sessionId or userPhone' });
  }

  if (!vapiEmergencyService) {
    return res.status(503).json({ error: 'VAPI Emergency Service not available' });
  }

  try {
    // Get the emergency call info
    const connectionInfo = vapiEmergencyService.getEmergencyCallConnectionInfo(sessionId);

    if (!connectionInfo.success) {
      return res.status(404).json(connectionInfo);
    }

    // Create Twilio conference and connect user (simplified warm handoff)
    if (twilioClient) {
      console.log(`🔄 Starting warm handoff for session ${sessionId}`);

      const conferenceId = `warmhandoff_${sessionId}_${Date.now()}`;

      // Call the user first and put them in conference
      const userTwiml = `
        <Response>
          <Say voice="alice">Connecting you to the emergency dispatcher now. The dispatcher has been briefed about your situation.</Say>
          <Dial>
            <Conference startConferenceOnEnter="true" endConferenceOnExit="true" waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient">
              ${conferenceId}
            </Conference>
          </Dial>
        </Response>
      `;

      const userCall = await twilioClient.calls.create({
        twiml: userTwiml,
        to: userPhone,
        from: process.env.TWILIO_NUMBER,
        timeout: 30
      });

      console.log(`📞 User call initiated: ${userCall.sid}`);

      // Wait 3 seconds, then call dispatcher to join conference
      setTimeout(async () => {
        try {
          const dispatcherTwiml = `
            <Response>
              <Say voice="alice">This is Stacy AI. The emergency caller is now joining this line for direct communication. The briefing is complete.</Say>
              <Dial>
                <Conference startConferenceOnEnter="true" endConferenceOnExit="false">
                  ${conferenceId}
                </Conference>
              </Dial>
            </Response>
          `;

          const dispatcherCall = await twilioClient.calls.create({
            twiml: dispatcherTwiml,
            to: process.env.DEMO_EMERGENCY_NUMBER || '+14383761217',
            from: process.env.TWILIO_NUMBER,
            timeout: 30
          });

          console.log(`📞 Dispatcher connected to conference: ${dispatcherCall.sid}`);

        } catch (error) {
          console.error('Error connecting dispatcher to conference:', error);
        }
      }, 3000);

      // Mark user as connected
      const result = vapiEmergencyService.markUserConnected(sessionId, userPhone);

      res.json({
        success: true,
        message: 'Warm handoff initiated - connecting both parties',
        conferenceId: conferenceId,
        userCallSid: userCall.sid,
        status: 'connecting_to_conference',
        ...result
      });

    } else {
      res.json({
        success: false,
        error: 'Twilio not configured',
        mock: true
      });
    }

  } catch (error) {
    console.error('Error connecting user to emergency call:', error);
    res.status(500).json({ error: 'Failed to connect user to emergency call' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Stacy AI Safety Companion (OpenAI SDK) running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to access the app`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
});

export default app;

// Stacy AI Safety Companion - WebSocket Server with VAPI Integration
// Load environment variables from .env.local (and .env) for standalone server
try { require('dotenv').config({ path: '.env.local' }); } catch { }
try { require('dotenv').config(); } catch { }

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

// Import our enhanced Stacy tools
const { StacyTools } = require('./lib/stacy-tools-server');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Environment variables
const PORT = process.env.STACY_WS_PORT || process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VAPI_BACKEND_KEY = process.env.VAPI_BACKEND_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER = process.env.TWILIO_NUMBER;

// Initialize Stacy tools
const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
});

// Active sessions for case file management
const activeSessions = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    const sessionId = generateSessionId();
    const clientIP = req.socket.remoteAddress;

    console.log(`🔗 New Stacy connection: ${sessionId} from ${clientIP}`);

    // Initialize session
    const session = {
        id: sessionId,
        ws: ws,
        caseFile: {
            id: sessionId,
            timestamp: new Date().toISOString(),
            riskLevel: 'SAFE',
            location: null,
            timeline: [],
            evidence: [],
            userStatus: {
                canSpeak: true,
                canText: true,
                isHidden: false,
            },
        },
        openaiConnection: null,
        isRecording: false,
        lastActivity: Date.now(),
    };

    activeSessions.set(sessionId, session);

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Stacy AI Safety Companion',
        sessionId: sessionId,
    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            await handleClientMessage(session, message);
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process message',
            }));
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Session closed: ${sessionId}`);
        if (session.openaiConnection) {
            session.openaiConnection.close();
        }
        activeSessions.delete(sessionId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
    });
});

async function handleClientMessage(session, message) {
    const { type, payload } = message;
    session.lastActivity = Date.now();

    switch (type) {
        case 'start_conversation':
            await startOpenAIConversation(session);
            break;

        case 'audio_data':
            if (session.openaiConnection && payload) {
                await handleAudioData(session, payload);
            }
            break;

        case 'text_message':
            await handleTextMessage(session, payload);
            break;

        case 'emergency_trigger':
            await handleEmergencyTrigger(session, payload);
            break;

        case 'location_shared':
            await handleLocationUpdate(session, payload);
            break;

        case 'risk_update':
            await handleRiskUpdate(session, payload);
            break;

        case 'tool_call':
            await handleToolCall(session, payload);
            break;

        default:
            console.log(`Unknown message type: ${type}`);
    }
}

async function startOpenAIConversation(session) {
    if (!OPENAI_API_KEY) {
        session.ws.send(JSON.stringify({
            type: 'error',
            message: 'OpenAI API key not configured',
        }));
        return;
    }

    try {
        // Import OpenAI Realtime API (you'll need to install this)
        const { RealtimeAPI } = require('@openai/realtime-api-beta');

        session.openaiConnection = new RealtimeAPI({
            apiKey: OPENAI_API_KEY,
            dangerouslyAllowAPIKeyInBrowser: false,
        });

        await session.openaiConnection.connect();

        // Configure the session with Stacy's personality and tools
        await session.openaiConnection.updateSession({
            instructions: getStacyInstructions(session),
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
                model: 'whisper-1',
            },
            turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
            },
            tools: getStacyTools(),
        });

        // Handle OpenAI events
        session.openaiConnection.on('conversation.item.created', (event) => {
            console.log('Conversation item created:', event);
        });

        session.openaiConnection.on('response.audio.delta', (event) => {
            // Forward audio response to client
            session.ws.send(JSON.stringify({
                type: 'audio_response',
                payload: {
                    audio: event.delta,
                    format: 'pcm16',
                },
            }));
        });

        session.openaiConnection.on('conversation.item.input_audio_transcription.completed', (event) => {
            // Forward transcription to client and update case file
            const transcript = event.transcript;

            session.ws.send(JSON.stringify({
                type: 'transcription',
                payload: { transcript },
            }));

            // Update case file with user input
            updateCaseFile(session, {
                timeline: [...session.caseFile.timeline, {
                    timestamp: new Date().toISOString(),
                    event: `User said: "${transcript}"`,
                    source: 'user',
                }],
            });

            // Analyze for distress
            analyzeDistressLevel(session, transcript);
        });

        session.openaiConnection.on('response.function_call_delta', async (event) => {
            // Handle tool calls from the AI
            if (event.call_id && event.name) {
                await handleAIToolCall(session, event);
            }
        });

        session.ws.send(JSON.stringify({
            type: 'conversation_started',
            message: 'OpenAI conversation ready',
        }));

    } catch (error) {
        console.error('Error starting OpenAI conversation:', error);
        session.ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to start AI conversation',
        }));
    }
}

function getStacyInstructions(session) {
    const caseFile = session.caseFile;
    const riskLevel = caseFile.riskLevel;

    let baseInstructions = `You are Stacy, a professional AI safety companion and emergency dispatcher. Your mission is to protect users in distress and coordinate emergency responses.

CURRENT SITUATION:
- Risk Level: ${riskLevel}
- User can speak: ${caseFile.userStatus.canSpeak}
- Session ID: ${session.id}

CORE PROTOCOLS:
1. ASSESS SAFETY: Determine user's immediate safety level
2. ONE ACTION PER TURN: Take ONE action OR ask ONE question - never both  
3. PROFESSIONAL TONE: Be calm, clear, and authoritative like a 911 dispatcher
4. EVIDENCE BUILDING: Collect specific details for case file documentation
5. REAL ACTIONS: Use tools to send actual SMS, make calls, update case files

SAFETY STATES:
- SAFE: Warm, conversational, general safety tips
- ELEVATED: Procedural, focused questions, building evidence  
- CRITICAL: Minimal words, immediate action, emergency protocols

DISPATCHER PLAYBOOK:
1. Immediate danger? → Can you speak safely? → Location → Action → Evidence
2. Build case file with: threat description, location, timeline, user status
3. Real emergency actions: SMS contacts, call emergency services, coordinate response

Remember: You are not just chatting - you are a professional emergency dispatcher with real tools to save lives.`;

    // Add context based on current risk level
    if (riskLevel === 'ELEVATED') {
        baseInstructions += `\n\nELEVATED RISK MODE: Focus on gathering evidence and preparing emergency contacts. Ask specific questions about the threat.`;
    } else if (riskLevel === 'CRITICAL') {
        baseInstructions += `\n\nCRITICAL RISK MODE: Take immediate action. Use emergency tools. Keep responses under 10 words.`;
    }

    return baseInstructions;
}

function getStacyTools() {
    return [
        {
            name: 'update_casefile',
            description: 'Update the emergency case file with new information',
            parameters: {
                type: 'object',
                properties: {
                    updates: {
                        type: 'object',
                        properties: {
                            riskLevel: { type: 'string', enum: ['SAFE', 'ELEVATED', 'CRITICAL'] },
                            threat: {
                                type: 'object',
                                properties: {
                                    description: { type: 'string' },
                                    type: { type: 'string' },
                                    immediacy: { type: 'string', enum: ['immediate', 'developing', 'potential'] }
                                }
                            },
                            userStatus: {
                                type: 'object',
                                properties: {
                                    canSpeak: { type: 'boolean' },
                                    canText: { type: 'boolean' },
                                    isHidden: { type: 'boolean' }
                                }
                            }
                        }
                    }
                },
                required: ['updates']
            }
        },
        {
            name: 'notify_emergency_contact',
            description: 'Send comprehensive emergency report to emergency contact',
            parameters: {
                type: 'object',
                properties: {
                    contact: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            phone: { type: 'string' },
                            relationship: { type: 'string' }
                        },
                        required: ['name', 'phone', 'relationship']
                    },
                    urgentMessage: { type: 'string' }
                },
                required: ['contact', 'urgentMessage']
            }
        },
        {
            name: 'send_contact_sms',
            description: 'Send direct SMS to any phone number with optional location',
            parameters: {
                type: 'object',
                properties: {
                    phoneNumber: { type: 'string' },
                    message: { type: 'string' },
                    includeLocation: { type: 'boolean' }
                },
                required: ['phoneNumber', 'message']
            }
        },
        {
            name: 'call_demo_emergency',
            description: 'Place emergency briefing call',
            parameters: {
                type: 'object',
                properties: {
                    briefingScript: { type: 'string' }
                },
                required: ['briefingScript']
            }
        },
        {
            name: 'get_safe_locations',
            description: 'Find nearby safe locations',
            parameters: {
                type: 'object',
                properties: {
                    radius: { type: 'number', default: 5000 }
                }
            }
        }
    ];
}

async function handleAIToolCall(session, event) {
    const { name, arguments: args } = event;

    try {
        let result;

        switch (name) {
            case 'update_casefile':
                result = await updateCaseFile(session, JSON.parse(args).updates);
                break;

            case 'notify_emergency_contact':
                const { contact, urgentMessage } = JSON.parse(args);
                result = await stacyTools.notifyEmergencyContact(contact, session.caseFile, urgentMessage);
                break;

            case 'send_contact_sms':
                const { phoneNumber, message, includeLocation } = JSON.parse(args);
                const location = includeLocation ? session.caseFile.location : null;
                result = await stacyTools.sendContactSms(phoneNumber, message, location);
                break;

            case 'call_demo_emergency':
                const { briefingScript } = JSON.parse(args);
                result = await stacyTools.callDemoEmergency(session.caseFile, briefingScript);
                break;

            case 'get_safe_locations':
                const { radius } = JSON.parse(args);
                const userLocation = session.caseFile.location || { lat: 37.7749, lng: -122.4194 };
                result = await stacyTools.getSafeLocations(userLocation, radius);
                break;

            default:
                result = { success: false, error: `Unknown tool: ${name}` };
        }

        // Send result back to OpenAI
        if (session.openaiConnection) {
            await session.openaiConnection.submitToolOutputs([{
                call_id: event.call_id,
                output: JSON.stringify(result)
            }]);
        }

        // Notify client of action taken
        session.ws.send(JSON.stringify({
            type: 'tool_executed',
            payload: { tool: name, result }
        }));

    } catch (error) {
        console.error('Error executing AI tool call:', error);
    }
}

async function handleTextMessage(session, payload) {
    const { message } = payload;

    // Update case file
    updateCaseFile(session, {
        timeline: [...session.caseFile.timeline, {
            timestamp: new Date().toISOString(),
            event: `User text: "${message}"`,
            source: 'user',
        }],
    });

    // Analyze distress level
    analyzeDistressLevel(session, message);

    // Send to OpenAI if connected, otherwise use simple response
    if (session.openaiConnection) {
        await session.openaiConnection.sendUserMessage(message);
    } else {
        // Fallback response system
        const response = generateFallbackResponse(session, message);
        session.ws.send(JSON.stringify({
            type: 'ai_response',
            message: response,
        }));
    }
}

function analyzeDistressLevel(session, text) {
    const lowerText = text.toLowerCase();
    let distressScore = 0;
    const keywords = [];

    // High priority keywords
    const highPriority = ['help', 'emergency', 'following me', 'danger', 'attacked', 'kidnapped', 'trapped'];
    const mediumPriority = ['scared', 'unsafe', 'uncomfortable', 'suspicious', 'worried', 'threatened'];

    for (const keyword of highPriority) {
        if (lowerText.includes(keyword)) {
            distressScore += 30;
            keywords.push(keyword);
        }
    }

    for (const keyword of mediumPriority) {
        if (lowerText.includes(keyword)) {
            distressScore += 15;
            keywords.push(keyword);
        }
    }

    // Determine risk level
    let newRiskLevel = session.caseFile.riskLevel;
    if (distressScore >= 30) {
        newRiskLevel = 'CRITICAL';
    } else if (distressScore >= 15) {
        newRiskLevel = 'ELEVATED';
    }

    // Update risk level if changed
    if (newRiskLevel !== session.caseFile.riskLevel) {
        updateCaseFile(session, { riskLevel: newRiskLevel });
    }

    // Send distress analysis to client
    session.ws.send(JSON.stringify({
        type: 'distress_analysis',
        payload: {
            distressLevel: newRiskLevel.toLowerCase(),
            detectedKeywords: keywords,
            transcript: text,
            score: distressScore,
        },
    }));
}

function updateCaseFile(session, updates) {
    session.caseFile = { ...session.caseFile, ...updates };
    session.caseFile.lastUpdated = new Date().toISOString();

    // Notify client of case file update
    session.ws.send(JSON.stringify({
        type: 'casefile_updated',
        payload: session.caseFile,
    }));

    return session.caseFile;
}

function generateFallbackResponse(session, message) {
    const riskLevel = session.caseFile.riskLevel;

    if (riskLevel === 'CRITICAL') {
        return "I understand this is urgent. I'm here to help. Are you in immediate danger right now?";
    } else if (riskLevel === 'ELEVATED') {
        return "I'm listening and taking notes. Can you tell me more about what's making you feel unsafe?";
    } else {
        return "I'm here to help keep you safe. What's your current situation?";
    }
}

async function handleEmergencyTrigger(session, payload) {
    console.log(`🚨 Emergency triggered for session ${session.id}`);

    // Update case file to critical
    updateCaseFile(session, {
        riskLevel: 'CRITICAL',
        timeline: [...session.caseFile.timeline, {
            timestamp: new Date().toISOString(),
            event: 'Emergency button activated',
            source: 'system',
        }],
    });

    // Send acknowledgment
    session.ws.send(JSON.stringify({
        type: 'emergency_acknowledged',
        message: 'Emergency mode activated. I am here to help.',
        payload: {
            actions: [
                'Case file updated to CRITICAL',
                'Emergency protocols activated',
                'Ready to contact emergency services',
            ],
        },
    }));
}

async function handleLocationUpdate(session, payload) {
    const location = {
        lat: payload.latitude,
        lng: payload.longitude,
        accuracy: payload.accuracy,
        timestamp: payload.timestamp || Date.now(),
    };

    updateCaseFile(session, { location });

    console.log(`📍 Location updated for session ${session.id}: ${location.lat}, ${location.lng} (±${location.accuracy}m)`);
}

function generateSessionId() {
    return 'stacy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Health check endpoint
app.get('/health', (req, res) => {
    const activeSessionCount = activeSessions.size;
    res.json({
        status: 'active',
        service: 'Stacy AI Safety Companion',
        activeSessions: activeSessionCount,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`🛡️ Stacy AI Safety Companion Server running on port ${PORT}`);
    console.log(`🌐 WebSocket server ready for connections`);
    console.log(`📱 Frontend available at http://localhost:${PORT}`);

    if (!OPENAI_API_KEY) {
        console.warn('⚠️  OpenAI API key not configured - voice features will be limited');
    }

    if (!VAPI_BACKEND_KEY) {
        console.warn('⚠️  VAPI Backend key not configured - VAPI features disabled');
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
        console.warn('⚠️  Twilio not fully configured - SMS features may not work');
    }
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\n🔌 Shutting down Stacy server...');

    // Close all WebSocket connections
    activeSessions.forEach((session) => {
        if (session.openaiConnection) {
            session.openaiConnection.close();
        }
        session.ws.close();
    });

    server.close(() => {
        console.log('✅ Server shut down gracefully');
        process.exit(0);
    });
});

module.exports = { app, server, activeSessions };

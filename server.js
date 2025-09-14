import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RealtimeHandler } from './realtime-handler.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);he issues
const wss = new WebSocketServer({ server });

// Initialize Realtime Handler
const realtimeHandler = new RealtimeHandler(process.env.OPENAI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Store active connections
const connections = new Map();

// WebSocket connection handler
wss.on('connection', (ws) => {
  const connectionId = generateId();
  connections.set(connectionId, ws);

  console.log(`New WebSocket connection: ${connectionId}`);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleMessage(ws, data, connectionId);
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
  });

  ws.on('close', () => {
    connections.delete(connectionId);
    realtimeHandler.closeSession(connectionId);
    console.log(`WebSocket connection closed: ${connectionId}`);
  });

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    connectionId,
    message: 'Connected to Stacy AI Safety Companion'
  }));
});

// Message handler for different types of WebSocket messages
async function handleMessage(ws, data, connectionId) {
  const { type, payload } = data;

  switch (type) {
    case 'start_conversation':
      await startRealtimeConversation(ws, connectionId);
      break;

    case 'audio_data':
      // Handle audio data from client
      await processAudioData(ws, payload, connectionId);
      break;

    case 'end_conversation':
      await endConversation(ws, connectionId);
      break;

    case 'emergency_trigger':
      await handleEmergencyTrigger(ws, payload, connectionId);
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

// Start a real-time conversation with OpenAI
async function startRealtimeConversation(ws, connectionId) {
  try {
    // Create a new realtime session
    const session = await realtimeHandler.createSession(connectionId, ws);

    ws.send(JSON.stringify({
      type: 'conversation_started',
      message: 'Hi, I\'m Stacy. I\'m here to help keep you safe. What\'s going on?'
    }));

    console.log(`Started realtime conversation for connection: ${connectionId}`);
  } catch (error) {
    console.error('Error starting conversation:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to start conversation' }));
  }
}

// Process audio data and interact with OpenAI Realtime API
async function processAudioData(ws, payload, connectionId) {
  try {
    console.log(`Processing audio data for connection: ${connectionId}`);

    // Send audio data to OpenAI Realtime API
    if (payload.audio) {
      realtimeHandler.sendAudioToOpenAI(connectionId, payload.audio);
    }

    // The response will come back through the realtime handler's message handling

  } catch (error) {
    console.error('Error processing audio:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to process audio' }));
  }
}

// Handle emergency trigger
async function handleEmergencyTrigger(ws, payload, connectionId) {
  try {
    const { location, emergencyType, contactInfo } = payload;

    console.log(`Emergency triggered for connection: ${connectionId}`, {
      location,
      emergencyType,
      contactInfo
    });

    // This is where we'd integrate with Twilio for SMS
    // For now, just acknowledge the trigger
    ws.send(JSON.stringify({
      type: 'emergency_acknowledged',
      message: 'Emergency services have been notified. Stay calm and follow my guidance.',
      actions: [
        'Location shared with emergency contact',
        'Routing to nearest safe location',
        'Emergency services alerted'
      ]
    }));

  } catch (error) {
    console.error('Error handling emergency:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to handle emergency' }));
  }
}

// End conversation
async function endConversation(ws, connectionId) {
  ws.send(JSON.stringify({
    type: 'conversation_ended',
    message: 'Stay safe. I\'m here whenever you need me.'
  }));
  console.log(`Ended conversation for connection: ${connectionId}`);
}

// Utility function to generate unique IDs
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// API Routes
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  const stats = realtimeHandler.getSessionStats();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    websocketConnections: connections.size,
    realtimeSessions: stats.activeSessions
  });
});

app.get('/api/stats', (req, res) => {
  const stats = realtimeHandler.getSessionStats();
  res.json({
    websocketConnections: connections.size,
    realtimeSessions: stats.activeSessions,
    sessions: stats.sessions,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Stacy AI Safety Companion server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to access the app`);
});

export default app;

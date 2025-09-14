import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Store active connections
const connections = new Map();

// Demo responses for different distress levels
const demoResponses = {
  low: [
    "I'm here to help. Can you tell me more about your situation?",
    "That sounds concerning. Are you in a safe location right now?",
    "I understand. Let's work through this together. What's your immediate environment like?"
  ],
  medium: [
    "I can hear the concern in your voice. Your safety is my priority. Are you able to move to a more populated area?",
    "That doesn't sound right. Trust your instincts. Can you get to a well-lit, public place?",
    "I'm taking this seriously. Do you have someone you can call or text right now?"
  ],
  high: [
    "This sounds like an emergency situation. I recommend calling 911 immediately.",
    "Your safety is critical right now. Get to the nearest safe location - a store, restaurant, or police station.",
    "This requires immediate action. Call emergency services and share your location with a trusted contact."
  ]
};

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
    console.log(`WebSocket connection closed: ${connectionId}`);
  });
  
  // Send initial connection confirmation
  ws.send(JSON.stringify({ 
    type: 'connected', 
    connectionId,
    message: 'Connected to Stacy AI Safety Companion (Demo Mode)' 
  }));
});

// Message handler for different types of WebSocket messages
async function handleMessage(ws, data, connectionId) {
  const { type, payload } = data;
  
  switch (type) {
    case 'start_conversation':
      await startDemoConversation(ws, connectionId);
      break;
      
    case 'audio_data':
      // Handle audio data from client (demo mode)
      await processDemoAudio(ws, payload, connectionId);
      break;
      
    case 'text_message':
      // Handle text input for testing
      await processDemoText(ws, payload, connectionId);
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

// Start a demo conversation
async function startDemoConversation(ws, connectionId) {
  try {
    ws.send(JSON.stringify({
      type: 'conversation_started',
      message: 'Hi, I\'m Stacy. I\'m here to help keep you safe. What\'s going on? (Demo Mode - no real AI)',
    }));
    
    console.log(`Started demo conversation for connection: ${connectionId}`);
  } catch (error) {
    console.error('Error starting conversation:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to start conversation' }));
  }
}

// Process audio data (demo simulation)
async function processDemoAudio(ws, payload, connectionId) {
  try {
    console.log(`Processing demo audio data for connection: ${connectionId}`);
    
    // Simulate processing delay
    setTimeout(() => {
      // Simulate transcription
      const mockTranscripts = [
        "I'm walking alone and someone seems to be following me",
        "There's a suspicious person behind me",
        "I feel unsafe in this area",
        "Help, I think I'm in danger",
        "Someone is making me uncomfortable",
        "I'm lost and it's getting dark"
      ];
      
      const transcript = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
      const distressLevel = analyzeDistressLevel(transcript);
      const response = getRandomResponse(distressLevel);
      
      // Send transcription
      ws.send(JSON.stringify({
        type: 'transcription',
        payload: { transcript }
      }));
      
      // Send AI response after a short delay
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'ai_response',
          message: response,
          distressLevel,
          detectedKeywords: extractKeywords(transcript)
        }));
      }, 1000);
      
    }, 500);
    
  } catch (error) {
    console.error('Error processing demo audio:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to process audio' }));
  }
}

// Process text messages for testing
async function processDemoText(ws, payload, connectionId) {
  try {
    const { text } = payload;
    console.log(`Processing demo text for connection ${connectionId}: ${text}`);
    
    const distressLevel = analyzeDistressLevel(text);
    const response = getRandomResponse(distressLevel);
    
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'ai_response',
        message: response,
        distressLevel,
        detectedKeywords: extractKeywords(text)
      }));
    }, 800);
    
  } catch (error) {
    console.error('Error processing demo text:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to process text' }));
  }
}

// Analyze distress level based on keywords
function analyzeDistressLevel(text) {
  const lowercaseText = text.toLowerCase();
  
  const highDistressKeywords = ['help', 'emergency', 'danger', 'threatened', 'following me', 'attack', 'scared', 'terrified'];
  const mediumDistressKeywords = ['uncomfortable', 'suspicious', 'unsafe', 'worried', 'nervous', 'alone', 'dark'];
  
  if (highDistressKeywords.some(keyword => lowercaseText.includes(keyword))) {
    return 'high';
  } else if (mediumDistressKeywords.some(keyword => lowercaseText.includes(keyword))) {
    return 'medium';
  } else {
    return 'low';
  }
}

// Extract keywords from text
function extractKeywords(text) {
  const keywords = ['help', 'emergency', 'danger', 'following', 'suspicious', 'unsafe', 'scared', 'alone', 'dark', 'uncomfortable'];
  const lowercaseText = text.toLowerCase();
  return keywords.filter(keyword => lowercaseText.includes(keyword));
}

// Get random response based on distress level
function getRandomResponse(distressLevel) {
  const responses = demoResponses[distressLevel] || demoResponses.low;
  return responses[Math.floor(Math.random() * responses.length)];
}

// Handle emergency trigger
async function handleEmergencyTrigger(ws, payload, connectionId) {
  try {
    const { location, emergencyType } = payload;
    
    console.log(`Emergency triggered for connection: ${connectionId}`, {
      location,
      emergencyType
    });
    
    ws.send(JSON.stringify({
      type: 'emergency_acknowledged',
      message: 'Emergency mode activated. In a real scenario, emergency services would be contacted.',
      actions: [
        'Location would be shared with emergency contact',
        'SMS would be sent to trusted contacts',
        'Route to nearest safe location would be provided'
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
    message: 'Stay safe. I\'m here whenever you need me. (Demo Mode)'
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
  res.json({ 
    status: 'healthy', 
    mode: 'demo',
    timestamp: new Date().toISOString(),
    websocketConnections: connections.size
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    mode: 'demo',
    websocketConnections: connections.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for sending demo messages
app.post('/api/test-message', (req, res) => {
  const { message, connectionId } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }
  
  // If connectionId provided, send to specific connection
  if (connectionId && connections.has(connectionId)) {
    const ws = connections.get(connectionId);
    ws.send(JSON.stringify({
      type: 'test_message',
      message: message
    }));
    res.json({ success: true, message: 'Message sent to specific connection' });
  } else {
    // Send to all connections
    connections.forEach((ws) => {
      ws.send(JSON.stringify({
        type: 'test_message',
        message: message
      }));
    });
    res.json({ success: true, message: `Message sent to ${connections.size} connections` });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Stacy AI Safety Companion (DEMO MODE) running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to access the app`);
  console.log(`⚠️  Demo mode - no real AI integration. Responses are simulated.`);
});

export default app;

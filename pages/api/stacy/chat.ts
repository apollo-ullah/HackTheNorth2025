import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools, assessRiskLevel } from '../../../lib/stacy-tools';

// Simple conversation state management
const conversations = new Map();

interface ConversationState {
  sessionId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
  riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL';
  escalated: boolean;
  location?: { lat: number; lng: number; accuracy: number };
  incident: {
    severity?: 'low' | 'medium' | 'high';
    situation?: string;
    location_text?: string;
    location_gps?: boolean;
    people?: string;
    suspect_desc?: string;
    caller_contact?: string;
    consent_contact_ec?: 'yes' | 'no';
    consent_connect_dispatch?: 'yes' | 'no';
    notes: string[];
  };
  isFirstMessage: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  try {
    const { message, location, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Message and sessionId required' });
    }

    console.log(`💬 Chat request - Session: ${sessionId}, Message: "${message}"`);

    // Get or create conversation state
    let conversation: ConversationState = conversations.get(sessionId) || {
      sessionId,
      messages: [],
      riskLevel: 'SAFE',
      escalated: false,
      location,
      incident: {
        notes: []
      },
      isFirstMessage: true
    };

    // Update location if provided
    if (location) {
      conversation.location = location;
    }

    // Add user message to conversation
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    });

    // Assess risk level based on user message
    const newRiskLevel = assessRiskLevel(message);
    const previousRiskLevel = conversation.riskLevel;
    conversation.riskLevel = newRiskLevel;

    console.log(`🔍 Risk assessment: ${previousRiskLevel} → ${newRiskLevel}`);

    // Generate Stacy's response and execute any necessary tools
    const response = await generateStacyResponseWithTools(message, conversation, stacyTools);

    // Add assistant response to conversation
    conversation.messages.push({
      role: 'assistant',
      content: response.reply,
      timestamp: Date.now()
    });

    // Save conversation state
    conversations.set(sessionId, conversation);

    // Clean up old conversations (keep only last 100)
    if (conversations.size > 100) {
      const oldestKey = conversations.keys().next().value;
      conversations.delete(oldestKey);
    }

    console.log(`🤖 Stacy response: "${response.reply}" (Action: ${response.action || 'none'})`);

    res.json(response);

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      reply: "I'm having trouble right now, but I'm here to help. Are you safe?"
    });
  }
}

async function generateStacyResponseWithTools(userMessage: string, conversation: ConversationState, stacyTools: StacyTools) {
  const { riskLevel, messages, escalated, location } = conversation;
  const lowerMessage = userMessage.toLowerCase();
  
  // Critical risk - immediate escalation
  if (riskLevel === 'CRITICAL' && !escalated) {
    conversation.escalated = true;
    
    if (lowerMessage.includes('call police') || lowerMessage.includes('call 911') || 
        lowerMessage.includes('emergency') || lowerMessage.includes('help me now')) {
      return {
        reply: "I'm calling emergency services right now. Stay on the line with me.",
        action: 'escalate_to_police',
        riskLevel
      };
    }
    
    return {
      reply: "This sounds very serious. I need to connect you with emergency services immediately. Should I call them now?",
      action: null,
      riskLevel
    };
  }

  // Elevated risk - gather more information and offer help
  if (riskLevel === 'ELEVATED') {
    if (lowerMessage.includes('following')) {
      return {
        reply: "Someone is following you? Are you in immediate danger? Can you get to a safe, public place?",
        action: null,
        riskLevel
      };
    }
    
    if (lowerMessage.includes('scared') || lowerMessage.includes('unsafe')) {
      if (!location) {
        return {
          reply: "I understand you're scared. Can you tell me where you are right now? Are you somewhere safe?",
          action: null,
          riskLevel
        };
      } else {
        return {
          reply: "I have your location. Can you get to a well-lit, public area? Should I help you find the nearest safe place?",
          action: null,
          riskLevel
        };
      }
    }

    if (lowerMessage.includes('yes') && messages.length > 2) {
      const lastAssistantMessage = messages[messages.length - 2]?.content || '';
      if (lastAssistantMessage.includes('call them now')) {
        return {
          reply: "Calling emergency services now. Stay with me.",
          action: 'escalate_to_police',
          riskLevel
        };
      }
    }

    return {
      reply: "I'm here with you. Can you tell me more about what's happening? Are you able to move to a safer location?",
      action: null,
      riskLevel
    };
  }

  // Safe level - general safety conversation
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return {
      reply: "Hi, I'm Stacy, your AI safety companion. I'm here to help keep you safe. How are you feeling right now?",
      action: null,
      riskLevel
    };
  }

  if (lowerMessage.includes('test') || lowerMessage.includes('testing')) {
    return {
      reply: "I'm working perfectly! I'm here to help you with any safety concerns. Is everything okay?",
      action: null,
      riskLevel
    };
  }

  if (lowerMessage.includes('thank') || lowerMessage.includes('thanks')) {
    return {
      reply: "You're welcome! I'm always here when you need me. Stay safe out there.",
      action: null,
      riskLevel
    };
  }

  // Check for location-related queries
  if (lowerMessage.includes('where') && lowerMessage.includes('safe')) {
    if (location) {
      try {
        const safeLocations = await stacyTools.getSafeLocations(location, 2000);
        const locationsList = safeLocations.slice(0, 3).map(loc => 
          `${loc.name} (${loc.distance}km away)`
        ).join(', ');
        
        return {
          reply: `I found safe places nearby: ${locationsList}. Should I send you directions to the closest one?`,
          action: 'safe_locations_found',
          riskLevel,
          toolResult: { locations: safeLocations }
        };
      } catch (error) {
        console.error('Error finding safe locations:', error);
        return {
          reply: "I'm having trouble finding safe locations right now. Can you get to a well-lit, public area?",
          action: null,
          riskLevel
        };
      }
    } else {
      return {
        reply: "I can help you find safe places, but I'll need to know your location first. Can you share your location with me?",
        action: null,
        riskLevel
      };
    }
  }

  // Check for SMS/contact requests
  if (lowerMessage.includes('text') || lowerMessage.includes('contact') || lowerMessage.includes('notify')) {
    if (location && (riskLevel === 'ELEVATED' || riskLevel === 'CRITICAL')) {
      try {
        const emergencyContact = { name: 'Emergency Contact', phone: '+15146605707', relationship: 'Primary' };
        const mockCaseFile = {
          id: `chat_${Date.now()}`,
          timestamp: new Date().toISOString(),
          riskLevel,
          location,
          timeline: [],
          evidence: [],
          userStatus: { canSpeak: true, canText: true, isHidden: false },
        };

        const result = await stacyTools.notifyEmergencyContact(emergencyContact, mockCaseFile, `User reported: ${userMessage}`);
        
        if (result.success) {
          return {
            reply: `I've sent an emergency alert to your contact with your location. Message ID: ${result.messageId}. What else can I do to help?`,
            action: 'contact_notified',
            riskLevel,
            toolResult: result
          };
        } else {
          return {
            reply: "I had trouble sending the alert. Let me try a different approach. Are you able to call someone directly?",
            action: null,
            riskLevel
          };
        }
      } catch (error) {
        console.error('Error notifying emergency contact:', error);
        return {
          reply: "I'm having trouble with emergency notifications. Can you call someone directly?",
          action: null,
          riskLevel
        };
      }
    }
  }

  // Default responses based on conversation length
  if (messages.length <= 2) {
    return {
      reply: "I'm listening. What's your current situation? Are you feeling safe right now?",
      action: null,
      riskLevel
    };
  } else {
    return {
      reply: "I understand. Can you tell me more about what's happening? I'm here to help you stay safe.",
      action: null,
      riskLevel
    };
  }
}

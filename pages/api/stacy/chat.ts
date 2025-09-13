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

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER, OPENAI_API_KEY } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  try {
    const { message, location, sessionId, mode = 'voice' } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Message and sessionId required' });
    }

    console.log(`💬 Chat request - Session: ${sessionId}, Mode: ${mode}, Message: "${message}"`);

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

    // Check for explicit police requests first (rule-based catch)
    const lowerMessage = message.toLowerCase();
    const policeKeywords = [
      'call police', 'call cops', 'connect dispatcher', 'call 911', 
      'lets do it', "let's do it", 'time to call', 'call the police',
      'call the cops', 'connect me', 'i think it\'s time', 'why are you stuck',
      'help me why', 'stuck explain', 'repeating yourself'
    ];
    const isPoliceRequest = policeKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Also check if this is a "yes" response to a dispatcher question
    const isDispatcherConfirmation = lowerMessage.includes('yes') && conversation.messages.length >= 2 &&
      conversation.messages[conversation.messages.length - 2]?.content?.toLowerCase().includes('dispatcher');

    let response;

    if (isPoliceRequest || isDispatcherConfirmation) {
      console.log(`🚨 POLICE REQUEST DETECTED: "${message}" - Triggering immediate escalation`);
      console.log(`🚨 Matched keywords: ${policeKeywords.filter(k => lowerMessage.includes(k))}`);
      console.log(`🚨 Is dispatcher confirmation: ${isDispatcherConfirmation}`);
      
      // Update conversation state to escalated
      conversation.escalated = true;
      conversation.incident.consent_connect_dispatch = 'yes';
      
      // Force escalation regardless of mode
      response = {
        reply: "Connecting you to emergency services now. Stay on the line.",
        action: 'escalate_to_police',
        riskLevel: 'CRITICAL',
        mode,
        conversation_context: conversation
      };
    } else {
      // Generate Stacy's response using appropriate method based on mode
      if (mode === 'text' || mode === 'stealth') {
        // Use GPT-4o for text-based conversations (cheaper and better for stealth)
        response = await generateStacyResponseWithGPT(message, conversation, stacyTools, mode);
      } else {
        // Use the existing tool-based logic for voice
        response = await generateStacyResponseWithTools(message, conversation, stacyTools);
      }
    }

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
    console.log(`📊 Conversation state: ${JSON.stringify({
      sessionId: conversation.sessionId,
      messageCount: conversation.messages.length,
      riskLevel: conversation.riskLevel,
      escalated: conversation.escalated,
      incident: conversation.incident
    }, null, 2)}`);

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
  const { incident, messages, escalated, location, isFirstMessage } = conversation;
  const lowerMessage = userMessage.toLowerCase();
  
  // First message - always start with immediate danger assessment
  if (isFirstMessage || messages.length <= 1) {
    conversation.isFirstMessage = false;
    await updateIncidentField(conversation, 'notes', `Initial contact: ${userMessage}`);
    
    return {
      reply: "Are you in immediate danger right now?",
      action: 'assess_immediate_danger',
      riskLevel: 'SAFE'
    };
  }

  // Parse user responses and update incident fields
  await analyzeAndUpdateIncident(userMessage, conversation);
  
  // Handle immediate danger responses
  if (lowerMessage.includes('yes') && messages.length >= 2) {
    const lastMessage = messages[messages.length - 2]?.content || '';
    if (lastMessage.includes('immediate danger')) {
      await updateIncidentField(conversation, 'severity', 'high');
      await updateIncidentField(conversation, 'situation', 'Caller reports immediate danger');
      
    return {
        reply: "Can you tell me what's happening? Are you able to get to a safe place right now?",
        action: 'gather_situation_details',
        riskLevel: 'CRITICAL'
      };
    }
  }

  if (lowerMessage.includes('no') && messages.length >= 2) {
    const lastMessage = messages[messages.length - 2]?.content || '';
    if (lastMessage.includes('immediate danger')) {
      await updateIncidentField(conversation, 'severity', 'medium');
      
      return {
        reply: "Good. Can you describe what's making you feel unsafe?",
        action: 'gather_details',
        riskLevel: 'ELEVATED'
      };
    }
  }

  // Handle following/stalking scenarios with proper questioning
  if (lowerMessage.includes('following') || lowerMessage.includes('stalking')) {
    await updateIncidentField(conversation, 'situation', 'Caller reports being followed');
    await updateIncidentField(conversation, 'severity', 'high');
    
    if (!incident.suspect_desc) {
      return {
        reply: "Can you describe who is following you? What do they look like?",
        action: 'gather_suspect_description',
        riskLevel: 'CRITICAL'
      };
    } else if (!incident.location_text) {
      return {
        reply: "Where are you right now? Can you tell me your location?",
        action: 'gather_location',
        riskLevel: 'CRITICAL'
      };
    } else {
      return {
        reply: "I understand someone is following you. Can you get to a busy, well-lit area? Should I contact your emergency contact?",
        action: 'offer_help',
        riskLevel: 'CRITICAL'
      };
    }
  }

  // Handle suspect descriptions
  if (incident.situation?.includes('followed') && !incident.suspect_desc) {
    await updateIncidentField(conversation, 'suspect_desc', userMessage);
    return {
      reply: "Got it. Where are you right now? What's your location?",
      action: 'gather_location',
      riskLevel: 'CRITICAL'
    };
  }

  // Handle location gathering
  if (!incident.location_text && (lowerMessage.includes('at ') || lowerMessage.includes('near ') || lowerMessage.includes('street') || lowerMessage.includes('avenue'))) {
    await updateIncidentField(conversation, 'location_text', userMessage);
    
    if (incident.severity === 'high') {
      return {
        reply: "I have your location. Can you get to a safe place? Should I notify your emergency contact and connect you to a dispatcher?",
        action: 'offer_escalation',
        riskLevel: 'CRITICAL'
      };
    } else {
    return {
        reply: "I have your location. Are you able to move to a safer area?",
        action: 'safety_guidance',
        riskLevel: 'ELEVATED'
      };
    }
  }

  // Handle consent for emergency contact
  if (lowerMessage.includes('yes') && messages.length >= 2) {
    const lastMessage = messages[messages.length - 2]?.content || '';
    if (lastMessage.includes('emergency contact')) {
      await updateIncidentField(conversation, 'consent_contact_ec', 'yes');
      
      try {
        const emergencyContact = { name: 'Emergency Contact', phone: '+15146605707', relationship: 'Primary' };
        const caseFile = createCaseFileFromIncident(conversation);
        const reason = `${incident.severity} severity: ${incident.situation}. Location: ${incident.location_text || 'GPS coordinates'}`;
        
        const result = await stacyTools.notifyEmergencyContact(emergencyContact, caseFile, reason);
        
        if (result.success) {
    return {
            reply: "Emergency contact notified. Should I connect you to a human dispatcher now?",
            action: 'offer_dispatcher',
            riskLevel: 'CRITICAL',
            toolResult: result
          };
        }
      } catch (error) {
        console.error('Error notifying emergency contact:', error);
      }
    }
    
    if (lastMessage.includes('dispatcher') || lastMessage.includes('connect')) {
      await updateIncidentField(conversation, 'consent_connect_dispatch', 'yes');
      return {
        reply: "Connecting you to a human dispatcher now. Stay on the line.",
        action: 'escalate_to_police',
        riskLevel: 'CRITICAL'
      };
    }
  }

  // Handle requests for safe places
  if (lowerMessage.includes('safe place') || lowerMessage.includes('where can i go')) {
    if (location) {
      try {
        const safeLocations = await stacyTools.getSafeLocations(location, 2000);
        const locationsList = safeLocations.slice(0, 2).map(loc => 
          `${loc.name} (${loc.distance}km away)`
        ).join(' or ');
        
        return {
          reply: `Nearest safe places: ${locationsList}. Should I text you directions?`,
          action: 'safe_locations_found',
          riskLevel: conversation.riskLevel,
          toolResult: { locations: safeLocations }
        };
      } catch (error) {
    return {
          reply: "Can you get to any nearby store, restaurant, or police station?",
          action: null,
          riskLevel: conversation.riskLevel
        };
      }
    } else {
      return {
        reply: "I can help find safe places. Where are you right now?",
        action: 'gather_location',
        riskLevel: conversation.riskLevel
      };
    }
  }

  // Handle explicit police/911 requests
  if (lowerMessage.includes('call police') || lowerMessage.includes('call 911') || lowerMessage.includes('connect me')) {
    await updateIncidentField(conversation, 'consent_connect_dispatch', 'yes');
  return {
      reply: "Connecting you to a human dispatcher now.",
      action: 'escalate_to_police',
      riskLevel: 'CRITICAL'
    };
  }

  // Default responses based on context and missing information
  if (!incident.situation) {
    return {
      reply: "Can you tell me what's happening? What's making you feel unsafe?",
      action: 'gather_situation',
      riskLevel: conversation.riskLevel
    };
  }

  if (!incident.location_text && !location) {
    return {
      reply: "Where are you right now? Can you describe your location?",
      action: 'gather_location',
      riskLevel: conversation.riskLevel
    };
  }

  // Safety coaching based on severity
  if (incident.severity === 'high' && !incident.consent_contact_ec) {
    return {
      reply: "This sounds serious. Should I notify your emergency contact with your location?",
      action: 'request_consent',
      riskLevel: 'CRITICAL'
    };
  }

  if (incident.severity === 'medium') {
    return {
      reply: "I understand. Can you move to a brighter or busier area? Stay on the line with me.",
      action: 'safety_coaching',
      riskLevel: 'ELEVATED'
    };
  }

  // General supportive response
  return {
    reply: "I'm here with you. What would help you feel safer right now?",
    action: 'provide_support',
    riskLevel: conversation.riskLevel
  };
}

async function updateIncidentField(conversation: ConversationState, key: string, value: any) {
  if (key === 'notes') {
    conversation.incident.notes.push(`${new Date().toISOString()}: ${value}`);
  } else {
    (conversation.incident as any)[key] = value;
  }
  console.log(`📋 Updated incident field ${key}: ${value}`);
}

async function analyzeAndUpdateIncident(userMessage: string, conversation: ConversationState) {
  const lowerMessage = userMessage.toLowerCase();
  const { incident } = conversation;
  
  // Extract situation details
  if (!incident.situation) {
    if (lowerMessage.includes('following') || lowerMessage.includes('stalking')) {
      await updateIncidentField(conversation, 'situation', 'Being followed/stalked');
    } else if (lowerMessage.includes('unsafe') || lowerMessage.includes('scared')) {
      await updateIncidentField(conversation, 'situation', 'Feeling unsafe');
    } else if (lowerMessage.includes('lost') || lowerMessage.includes('alone')) {
      await updateIncidentField(conversation, 'situation', 'Lost or alone in unsafe area');
    }
  }

  // Extract people information
  if (lowerMessage.includes('man') || lowerMessage.includes('woman') || lowerMessage.includes('person')) {
    if (!incident.people) {
      await updateIncidentField(conversation, 'people', userMessage);
    }
  }

  // Extract suspect description
  if (incident.situation?.includes('followed') && (lowerMessage.includes('tall') || lowerMessage.includes('wearing') || lowerMessage.includes('looks'))) {
    if (!incident.suspect_desc) {
      await updateIncidentField(conversation, 'suspect_desc', userMessage);
    }
  }

  // Update severity based on keywords
  const highRiskKeywords = ['weapon', 'gun', 'knife', 'attacked', 'grabbed', 'chasing', 'emergency'];
  const mediumRiskKeywords = ['following', 'stalking', 'suspicious', 'uncomfortable', 'scared'];
  
  if (highRiskKeywords.some(keyword => lowerMessage.includes(keyword))) {
    await updateIncidentField(conversation, 'severity', 'high');
  } else if (mediumRiskKeywords.some(keyword => lowerMessage.includes(keyword)) && !incident.severity) {
    await updateIncidentField(conversation, 'severity', 'medium');
  }

  // Add to notes
  await updateIncidentField(conversation, 'notes', userMessage);
}

async function generateStacyResponseWithGPT(userMessage: string, conversation: ConversationState, stacyTools: StacyTools, mode: string) {
  const { incident, messages, location } = conversation;
  const isStealthMode = mode === 'stealth';
  
  // Build context for GPT-4o
  const systemPrompt = `You are Stacy, a professional safety triage assistant. You help people who feel unsafe.

CURRENT MODE: ${mode.toUpperCase()}
${isStealthMode ? 'STEALTH MODE: User cannot speak safely. Keep responses very short and discrete.' : 'TEXT MODE: User prefers typing over voice.'}

CORE PROTOCOL:
1. Start new sessions with: "Are you in immediate danger?"
2. Keep replies under ${isStealthMode ? '10 words' : '20 words'}. One question at a time.
3. Gather key details: situation, location, suspect description, people present
4. AUTOMATICALLY use tools when conditions are met:
   - High severity + location available → CALL notifyEmergencyContact
   - User asks for safe places + location available → CALL getSafeLocations  
   - User explicitly asks for police → CALL transferToDispatcher
5. Escalate with tools, not just words

CURRENT INCIDENT STATUS:
- Severity: ${incident.severity || 'unknown'}
- Situation: ${incident.situation || 'not specified'}
- Location: ${incident.location_text || (location ? 'GPS available' : 'unknown')}
- Suspect: ${incident.suspect_desc || 'not described'}
- Emergency contact consent: ${incident.consent_contact_ec || 'not asked'}
- Dispatcher consent: ${incident.consent_connect_dispatch || 'not asked'}

AVAILABLE TOOLS - USE THESE ACTIVELY:
- notifyEmergencyContact: REQUIRED when severity=high AND location available
- getSafeLocations: REQUIRED when user asks "where can I go" or "safe place"  
- transferToDispatcher: REQUIRED when user says "call police" or "emergency"

CRITICAL TOOL USAGE RULES:
- If user says "call police", "call cops", "connect dispatcher", "let's do it" (after dispatcher question) → IMMEDIATELY CALL transferToDispatcher
- If someone is following AND you have location → CALL notifyEmergencyContact immediately  
- If user asks "where can I go", "safe place" AND you have location → CALL getSafeLocations immediately
- If user confirms "yes" to "connect you to dispatcher" → CALL transferToDispatcher immediately

CURRENT CONVERSATION CONTEXT:
Last few messages: ${messages.slice(-3).map(m => `${m.role}: ${m.content}`).join(' | ')}

${isStealthMode ? 'STEALTH RULES: Use yes/no questions. Suggest number codes (1=yes, 2=no, 3=help). Avoid mentioning specific actions.' : ''}

STOP REPEATING - If user asks for police/dispatcher, USE transferToDispatcher tool NOW.`;

  // Build conversation history for context
  const conversationHistory = messages.slice(-6).map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: userMessage }
        ],
        max_tokens: isStealthMode ? 30 : 60,
        temperature: 0.3,
        tools: [
          {
            type: 'function',
            function: {
              name: 'notifyEmergencyContact',
              description: 'Send emergency SMS to contact with location - USE when severity is high',
              parameters: {
                type: 'object',
                properties: {
                  reason: { type: 'string', description: 'Brief reason for notification' }
                },
                required: ['reason']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'getSafeLocations',
              description: 'Find nearby safe places - USE when user asks where to go',
              parameters: {
                type: 'object',
                properties: {
                  radius: { type: 'number', description: 'Search radius in meters', default: 2000 }
                }
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'transferToDispatcher',
              description: 'Connect to human dispatcher - USE when user wants police',
              parameters: {
                type: 'object',
                properties: {
                  reason: { type: 'string', description: 'Reason for transfer' }
                },
                required: ['reason']
              }
            }
          }
        ],
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const choice = result.choices[0];
    
    // Handle tool calls (new format)
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      
      console.log(`🔧 GPT-4o wants to call: ${functionName}`, functionArgs);
      
      let toolResult;
      let action = functionName;
      
      switch (functionName) {
        case 'notifyEmergencyContact':
          const emergencyContact = { name: 'Emergency Contact', phone: '+15146605707', relationship: 'Primary' };
          const caseFile = createCaseFileFromIncident(conversation);
          toolResult = await stacyTools.notifyEmergencyContact(emergencyContact, caseFile, functionArgs.reason);
          break;
          
        case 'getSafeLocations':
          if (location) {
            toolResult = await stacyTools.getSafeLocations(location, functionArgs.radius || 2000);
            toolResult = { success: true, locations: toolResult };
          } else {
            toolResult = { success: false, error: 'Location not available' };
          }
          break;
          
        case 'transferToDispatcher':
          action = 'escalate_to_police';
          toolResult = { success: true, reason: functionArgs.reason, conversation_context: conversation };
          break;
      }
      
      // Generate follow-up response after tool execution
      const followUpPrompt = `Tool ${functionName} executed with result: ${JSON.stringify(toolResult)}. 
      Acknowledge the action briefly and ask what to do next. Keep it under ${isStealthMode ? '10' : '20'} words.`;
      
      const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: followUpPrompt }
          ],
          max_tokens: isStealthMode ? 20 : 40,
          temperature: 0.3
        })
      });
      
      const followUpResult = await followUpResponse.json();
      const followUpText = followUpResult.choices[0]?.message?.content || "Done. What's next?";
      
    return {
        reply: followUpText,
        action,
        riskLevel: conversation.riskLevel,
        toolResult,
        mode
      };
    }
    
    // Regular response without function call
    const reply = choice.message.content || "I'm here to help. What's happening?";
    
    return {
      reply,
      action: null,
      riskLevel: conversation.riskLevel,
      mode
    };
    
  } catch (error) {
    console.error('GPT-4o chat error:', error);
    
    // Fallback to simple rule-based response
    return generateSimpleFallbackResponse(userMessage, conversation, isStealthMode);
  }
}

function generateSimpleFallbackResponse(userMessage: string, conversation: ConversationState, isStealthMode: boolean) {
  const lowerMessage = userMessage.toLowerCase();
  
  if (isStealthMode) {
    if (lowerMessage.includes('yes')) return { reply: "Can't speak? Type 1=yes 2=no", action: null, riskLevel: 'ELEVATED' };
    if (lowerMessage.includes('help') || lowerMessage.includes('emergency')) return { reply: "Need help? 1=call police 2=text contact", action: null, riskLevel: 'CRITICAL' };
    return { reply: "Safe? 1=yes 2=no 3=help", action: null, riskLevel: 'SAFE' };
  } else {
    if (lowerMessage.includes('following')) return { reply: "Someone following you? Can you describe them?", action: null, riskLevel: 'CRITICAL' };
    if (lowerMessage.includes('help')) return { reply: "I'm here to help. What's happening right now?", action: null, riskLevel: 'ELEVATED' };
    return { reply: "Are you in immediate danger?", action: null, riskLevel: 'SAFE' };
  }
}

function createCaseFileFromIncident(conversation: ConversationState) {
  const { incident, location, sessionId } = conversation;
  
  return {
    id: sessionId,
    timestamp: new Date().toISOString(),
    riskLevel: incident.severity === 'high' ? 'CRITICAL' : incident.severity === 'medium' ? 'ELEVATED' : 'SAFE',
    location: location,
    timeline: incident.notes.map(note => ({
      timestamp: note.split(': ')[0],
      event: note.split(': ').slice(1).join(': '),
      source: 'user' as const
    })),
    evidence: [],
    userStatus: { canSpeak: true, canText: true, isHidden: false },
    threat: incident.situation ? {
      description: incident.situation,
      type: 'unknown',
      immediacy: incident.severity === 'high' ? 'immediate' : 'developing'
    } : undefined
  };
}

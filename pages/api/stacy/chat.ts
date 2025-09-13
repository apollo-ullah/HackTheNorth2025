import { NextApiRequest, NextApiResponse } from 'next';

// Professional 911 Operator AI for Text Chat
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { message, caseFile, location, mode } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Analyze risk level
    const riskAnalysis = analyzeRiskLevel(message);
    const currentRisk = caseFile?.riskLevel || 'SAFE';
    
    // Determine new risk level
    let newRiskLevel = currentRisk;
    if (riskAnalysis.level === 'CRITICAL' || (riskAnalysis.level === 'ELEVATED' && currentRisk === 'SAFE')) {
      newRiskLevel = riskAnalysis.level;
    }

    // Generate professional dispatcher response
    const response = generateDispatcherResponse(message, newRiskLevel, caseFile, location);

    // Update case file
    const updatedCaseFile = {
      ...caseFile,
      riskLevel: newRiskLevel,
      timeline: [
        ...(caseFile?.timeline || []),
        {
          timestamp: new Date().toISOString(),
          event: `User: "${message}"`,
          source: 'user'
        },
        {
          timestamp: new Date().toISOString(),
          event: `Stacy: "${response.reply}"`,
          source: 'ai'
        }
      ],
      threat: riskAnalysis.threat || caseFile?.threat,
      location: location || caseFile?.location,
    };

    res.json({
      reply: response.reply,
      newCaseFile: updatedCaseFile,
      actions: response.actions,
      quickReplies: response.quickReplies,
      riskAnalysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

function analyzeRiskLevel(message: string): { level: 'SAFE' | 'ELEVATED' | 'CRITICAL'; keywords: string[]; threat?: any } {
  const lowerMessage = message.toLowerCase();
  
  // Critical keywords - immediate danger
  const criticalKeywords = ['help', 'emergency', 'following me', 'danger', 'attacked', 'kidnapped', 'trapped', 'can\'t speak', 'call police', 'call 911'];
  
  // Elevated keywords - concerning situation
  const elevatedKeywords = ['scared', 'unsafe', 'uncomfortable', 'suspicious', 'worried', 'threatened', 'following', 'alone', 'dark', 'lost'];
  
  const detectedCritical = criticalKeywords.filter(keyword => lowerMessage.includes(keyword));
  const detectedElevated = elevatedKeywords.filter(keyword => lowerMessage.includes(keyword));
  
  if (detectedCritical.length > 0) {
    return {
      level: 'CRITICAL',
      keywords: detectedCritical,
      threat: {
        description: `Critical keywords detected: ${detectedCritical.join(', ')}`,
        type: 'immediate_danger',
        immediacy: 'immediate'
      }
    };
  }
  
  if (detectedElevated.length > 0) {
    return {
      level: 'ELEVATED',
      keywords: detectedElevated,
      threat: {
        description: `Concerning keywords detected: ${detectedElevated.join(', ')}`,
        type: 'developing_threat',
        immediacy: 'developing'
      }
    };
  }
  
  return { level: 'SAFE', keywords: [] };
}

function generateDispatcherResponse(message: string, riskLevel: string, caseFile: any, location: any): {
  reply: string;
  actions: any[];
  quickReplies: string[];
} {
  const lowerMessage = message.toLowerCase();
  
  // Professional 911 operator responses based on risk level
  switch (riskLevel) {
    case 'CRITICAL':
      return generateCriticalResponse(message, caseFile, location);
    case 'ELEVATED':
      return generateElevatedResponse(message, caseFile, location);
    default:
      return generateSafeResponse(message, caseFile, location);
  }
}

function generateCriticalResponse(message: string, caseFile: any, location: any) {
  const lowerMessage = message.toLowerCase();
  
  // Immediate danger protocols
  if (lowerMessage.includes('following') || lowerMessage.includes('danger')) {
    return {
      reply: "I understand you're in immediate danger. Are you in a safe place where you can speak freely right now?",
      actions: [
        {
          type: 'update_case_file',
          updates: { riskLevel: 'CRITICAL', userStatus: { canSpeak: true, canText: true, isHidden: false } }
        }
      ],
      quickReplies: ['Yes, I can speak', 'No, cannot speak safely', 'Need help now']
    };
  }
  
  if (lowerMessage.includes('yes') && lowerMessage.includes('speak')) {
    return {
      reply: "Good. I'm documenting everything. Can you tell me your exact location and describe who is following you?",
      actions: [],
      quickReplies: ['Send my location', 'One person following', 'Multiple people', 'In a vehicle']
    };
  }
  
  if (lowerMessage.includes('help now') || lowerMessage.includes('send help')) {
    return {
      reply: "I'm sending an emergency alert to your contacts with your location right now. Do you want me to contact police?",
      actions: [
        {
          type: 'send_emergency_sms',
          contact: { name: 'Emergency Contact', phone: '+15146605707', relationship: 'Primary' },
          message: 'EMERGENCY: User reports being followed and in immediate danger. Location attached.'
        }
      ],
      quickReplies: ['Yes, call police', 'Not yet', 'Just alert contacts']
    };
  }
  
  if (lowerMessage.includes('call police') || lowerMessage.includes('yes') && caseFile?.timeline?.some((t: any) => t.event.includes('contact police'))) {
    return {
      reply: "I'm contacting emergency services now and briefing them on your situation. Stay on the line with me.",
      actions: [
        {
          type: 'call_police',
          briefing: `User reports being followed, immediate danger, location: ${location?.lat}, ${location?.lng}`
        }
      ],
      quickReplies: ['I\'m ready to talk to police', 'Still in danger', 'Getting to safety']
    };
  }
  
  return {
    reply: "I understand this is urgent. I need to know: Are you in immediate physical danger right now?",
    actions: [],
    quickReplies: ['Yes, immediate danger', 'Scared but not hurt', 'Cannot speak safely']
  };
}

function generateElevatedResponse(message: string, caseFile: any, location: any) {
  const lowerMessage = message.toLowerCase();
  
  // Escalation assessment
  if (lowerMessage.includes('following') && !caseFile?.threat?.description?.includes('following')) {
    return {
      reply: "I'm taking notes on this situation. Can you describe the person following you? How long has this been happening?",
      actions: [
        {
          type: 'update_case_file',
          updates: {
            threat: {
              description: 'User reports being followed',
              type: 'stalking',
              immediacy: 'developing'
            }
          }
        }
      ],
      quickReplies: ['Started 5 minutes ago', 'Been following for blocks', 'Don\'t know how long', 'Multiple people']
    };
  }
  
  if (lowerMessage.includes('scared') || lowerMessage.includes('unsafe')) {
    return {
      reply: "I understand you're feeling scared. That's important information. Are you in a public area with other people around?",
      actions: [],
      quickReplies: ['Yes, people around', 'No, alone', 'In a building', 'On the street']
    };
  }
  
  if (lowerMessage.includes('alone') || lowerMessage.includes('dark')) {
    return {
      reply: "I want to help you get to safety. Let me find the nearest safe location with people and lights. Should I guide you there?",
      actions: [
        {
          type: 'navigate_to_safety'
        }
      ],
      quickReplies: ['Yes, guide me', 'Find police station', 'Find hospital', 'Call someone first']
    };
  }
  
  if (lowerMessage.includes('call someone') || lowerMessage.includes('contact')) {
    return {
      reply: "Good thinking. I can alert your emergency contacts with your location. Should I send them a message now?",
      actions: [],
      quickReplies: ['Yes, alert them', 'Not yet', 'Just family', 'Send location only']
    };
  }
  
  return {
    reply: "I'm here to help you stay safe. Can you tell me more about what's making you feel uncomfortable?",
    actions: [],
    quickReplies: ['Someone following me', 'Lost and alone', 'Unsafe area', 'Suspicious person']
  };
}

function generateSafeResponse(message: string, caseFile: any, location: any) {
  const lowerMessage = message.toLowerCase();
  
  // General safety conversation
  if (lowerMessage.includes('walking') || lowerMessage.includes('going')) {
    return {
      reply: "I'm glad you're staying aware. Are you in a familiar area? I can help you stay safe while you travel.",
      actions: [],
      quickReplies: ['Familiar area', 'New area', 'Walking alone', 'With others']
    };
  }
  
  if (lowerMessage.includes('alone') || lowerMessage.includes('night')) {
    return {
      reply: "Walking alone can feel concerning. Are you feeling safe right now, or is something making you worried?",
      actions: [],
      quickReplies: ['Feeling safe', 'A bit worried', 'Something seems off', 'Want company']
    };
  }
  
  if (lowerMessage.includes('fine') || lowerMessage.includes('good') || lowerMessage.includes('safe')) {
    return {
      reply: "That's great to hear! I'm here if anything changes. Remember to stay aware of your surroundings and trust your instincts.",
      actions: [],
      quickReplies: ['Thanks Stacy', 'Any safety tips?', 'How to stay alert?']
    };
  }
  
  return {
    reply: "I'm here to help keep you safe. How are you feeling about your current situation?",
    actions: [],
    quickReplies: ['Feeling safe', 'A bit concerned', 'Something\'s wrong', 'Need advice']
  };
}

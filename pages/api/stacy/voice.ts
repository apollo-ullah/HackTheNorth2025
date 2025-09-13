import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

// Configure formidable for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

// Professional 911 Operator AI for Voice Messages
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Parse form data
    const form = formidable({});
    const [fields, files] = await form.parse(req);
    
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    const caseFileStr = Array.isArray(fields.caseFile) ? fields.caseFile[0] : fields.caseFile;
    const locationStr = Array.isArray(fields.location) ? fields.location[0] : fields.location;
    
    if (!audioFile) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    // For now, we'll simulate voice processing
    // In production, you'd use OpenAI Whisper or similar for transcription
    const mockTranscript = await simulateVoiceTranscription(audioFile);
    
    const caseFile = caseFileStr ? JSON.parse(caseFileStr) : null;
    const location = locationStr ? JSON.parse(locationStr) : null;

    // Process the transcript like a text message
    const chatResponse = await processDispatcherChat(mockTranscript, caseFile, location);

    res.json({
      transcript: mockTranscript,
      ...chatResponse
    });

  } catch (error) {
    console.error('Voice API error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

async function simulateVoiceTranscription(audioFile: any): Promise<string> {
  // Simulate voice transcription for demo
  // In production, integrate with OpenAI Whisper API
  const mockTranscripts = [
    "Someone is following me and I'm really scared",
    "I think I'm being followed, what should I do?",
    "There's a person behind me and I feel unsafe",
    "I'm walking alone and someone is making me uncomfortable",
    "Help, I think I'm in danger",
    "I'm lost and there's someone suspicious nearby"
  ];
  
  // Return a random mock transcript for demo
  return mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
}

async function processDispatcherChat(message: string, caseFile: any, location: any) {
  const lowerMessage = message.toLowerCase();
  
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
        event: `User (voice): "${message}"`,
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

  return {
    reply: response.reply,
    newCaseFile: updatedCaseFile,
    actions: response.actions,
    quickReplies: response.quickReplies,
    riskAnalysis,
    timestamp: new Date().toISOString()
  };
}

function analyzeRiskLevel(message: string): { level: 'SAFE' | 'ELEVATED' | 'CRITICAL'; keywords: string[]; threat?: any } {
  const lowerMessage = message.toLowerCase();
  
  const criticalKeywords = ['help', 'emergency', 'following me', 'danger', 'attacked', 'kidnapped', 'trapped', 'can\'t speak', 'call police'];
  const elevatedKeywords = ['scared', 'unsafe', 'uncomfortable', 'suspicious', 'worried', 'threatened', 'following', 'alone', 'dark'];
  
  const detectedCritical = criticalKeywords.filter(keyword => lowerMessage.includes(keyword));
  const detectedElevated = elevatedKeywords.filter(keyword => lowerMessage.includes(keyword));
  
  if (detectedCritical.length > 0) {
    return {
      level: 'CRITICAL',
      keywords: detectedCritical,
      threat: {
        description: `Critical situation: ${detectedCritical.join(', ')}`,
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
        description: `Concerning situation: ${detectedElevated.join(', ')}`,
        type: 'developing_threat',
        immediacy: 'developing'
      }
    };
  }
  
  return { level: 'SAFE', keywords: [] };
}

function generateDispatcherResponse(message: string, riskLevel: string, caseFile: any, location: any) {
  const lowerMessage = message.toLowerCase();
  
  switch (riskLevel) {
    case 'CRITICAL':
      if (lowerMessage.includes('following')) {
        return {
          reply: "I understand someone is following you. This is serious. Are you able to get to a public place with people around? I'm preparing to guide you to the nearest police station.",
          actions: [
            {
              type: 'navigate_to_safety'
            }
          ],
          quickReplies: ['Yes, can move', 'Trapped/cornered', 'In public now', 'Need police now']
        };
      }
      
      if (lowerMessage.includes('need police') || lowerMessage.includes('call police')) {
        return {
          reply: "I'm contacting police immediately with your case details. Stay with me while I brief them on your situation.",
          actions: [
            {
              type: 'call_police'
            }
          ],
          quickReplies: ['Ready to talk to police', 'Still unsafe', 'Getting to safety']
        };
      }
      
      return {
        reply: "I hear the urgency in your voice. I need to assess: Are you in immediate physical danger right now?",
        actions: [],
        quickReplies: ['Yes, immediate danger', 'Scared but safe', 'Cannot speak safely']
      };
      
    case 'ELEVATED':
      if (lowerMessage.includes('following') || lowerMessage.includes('suspicious')) {
        return {
          reply: "I'm documenting this. Can you describe what you're seeing? How many people, and are they on foot or in a vehicle?",
          actions: [],
          quickReplies: ['One person, on foot', 'In a car', 'Multiple people', 'Can\'t tell']
        };
      }
      
      return {
        reply: "I can hear the concern in your voice. Tell me more about what's happening around you right now.",
        actions: [],
        quickReplies: ['Someone behind me', 'Unsafe area', 'Lost', 'Feel threatened']
      };
      
    default:
      return {
        reply: "I'm listening. How are you feeling about your current situation?",
        actions: [],
        quickReplies: ['Feeling okay', 'A bit worried', 'Something seems off']
      };
  }
}

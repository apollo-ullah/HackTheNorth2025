import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools, CaseFile } from '../../../lib/stacy-tools';

// CRITICAL: In-memory case file storage - replace with database in production
const activeCaseFiles = new Map<string, CaseFile>();

// Enhanced VAPI Webhook handler with proper emergency protocols
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER, VAPI_BACKEND_KEY } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }
  
  if (!VAPI_BACKEND_KEY) {
    return res.status(500).json({ error: 'VAPI Backend key not configured' });
  }

  const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  try {
    const { message } = req.body;
    
    console.log('🔄 VAPI Webhook received:', message.type, message);
    
    // Only handle function calls - ignore other message types
    if (message.type !== 'function-call') {
      return res.json({ received: true });
    }

    const { functionCall, call } = message;
    const { name, parameters } = functionCall;
    const callId = call?.id || `call_${Date.now()}`;

    console.log(`🛠️ Executing Stacy tool: ${name}`, parameters);

    // Get or create case file for this call
    let caseFile = activeCaseFiles.get(callId);
    if (!caseFile) {
      caseFile = {
        id: `case_${Date.now()}`,
        timestamp: new Date().toISOString(),
        riskLevel: 'SAFE',
        timeline: [{
          timestamp: new Date().toISOString(),
          event: 'Emergency call initiated',
          source: 'system'
        }],
        evidence: [],
        userStatus: { canSpeak: true, canText: true, isHidden: false },
      };
      activeCaseFiles.set(callId, caseFile);
    }

    let result;

    switch (name) {
      case 'update_casefile': {
        console.log('📁 Updating case file:', parameters);
        
        // Update risk level if provided
        if (parameters.riskLevel) {
          caseFile.riskLevel = parameters.riskLevel;
        }
        
        // Add threat information
        if (parameters.threat) {
          caseFile.threat = parameters.threat;
        }
        
        // Update user status
        if (parameters.userStatus) {
          caseFile.userStatus = { ...caseFile.userStatus, ...parameters.userStatus };
        }
        
        // Add location if provided
        if (parameters.location) {
          caseFile.location = parameters.location;
        }
        
        // Add timeline entry
        caseFile.timeline.push({
          timestamp: new Date().toISOString(),
          event: `Case file updated - Risk: ${caseFile.riskLevel}`,
          source: 'ai'
        });
        
        // Save updated case file
        activeCaseFiles.set(callId, caseFile);
        
        result = { success: true, caseFile: caseFile };
        
        // AUTO-ESCALATION: If risk level is CRITICAL, prepare for warm handoff
        if (caseFile.riskLevel === 'CRITICAL') {
          console.log('🚨 CRITICAL RISK DETECTED - Preparing for escalation');
          // Note: Warm handoff would be triggered by separate tool call
        }
        
        break;
      }
      
      case 'transfer_to_emergency_services': {
        console.log('🚨 TRANSFERRING TO EMERGENCY SERVICES');
        
        const destination = parameters.destination;
        const reason = parameters.reason;
        
        // Log the transfer request
        console.log(`📞 Transfer requested to: ${destination}`);
        console.log(`📜 Transfer reason: ${reason}`);
        
        // Update case file
        caseFile.timeline.push({
          timestamp: new Date().toISOString(),
          event: `Emergency transfer initiated to ${destination} - ${reason}`,
          source: 'ai'
        });
        
        // Add transfer evidence
        caseFile.evidence.push({
          type: 'text',
          content: `EMERGENCY TRANSFER: ${reason}`,
          timestamp: new Date().toISOString()
        });
        
        activeCaseFiles.set(callId, caseFile);
        
        // VAPI handles the actual transfer - we just log and update case file
        result = {
          success: true,
          destination: destination,
          reason: reason,
          message: 'Emergency transfer initiated - VAPI is handling the warm handoff'
        };
        
        break;
      }
      
      case 'notify_emergency_contact': {
        const contact = {
          name: parameters.contactName,
          phone: parameters.contactPhone,
          relationship: parameters.relationship || 'Emergency Contact',
          priority: 1
        };
        
        result = await stacyTools.notifyEmergencyContact(contact, caseFile, parameters.urgentMessage);
        
        if (result.success) {
          caseFile.timeline.push({
            timestamp: new Date().toISOString(),
            event: `Emergency contact notified: ${contact.name}`,
            source: 'ai'
          });
          activeCaseFiles.set(callId, caseFile);
        }
        
        break;
      }
      
      case 'send_location_sms': {
        const location = caseFile.location || { lat: 37.7749, lng: -122.4194 }; // Default SF coords
        
        result = await stacyTools.sendContactSms(
          parameters.phoneNumber,
          parameters.message,
          parameters.urgent ? location : undefined
        );
        
        if (result.success) {
          caseFile.timeline.push({
            timestamp: new Date().toISOString(),
            event: `Location SMS sent to ${parameters.phoneNumber}`,
            source: 'ai'
          });
          activeCaseFiles.set(callId, caseFile);
        }
        
        break;
      }
      
      case 'analyze_context': {
        console.log('🧠 INTELLIGENT CONTEXT ANALYSIS:', parameters);
        
        // Advanced threat detection based on AI reasoning
        const { toneAnalysis, contextClues, inferredThreat, confidenceLevel, userMessage } = parameters;
        
        // Auto-escalate based on AI confidence and tone analysis
        let autoEscalateRisk = caseFile.riskLevel;
        
        if (confidenceLevel >= 80 && (toneAnalysis === 'panicked' || toneAnalysis === 'crying' || toneAnalysis === 'whispering')) {
          autoEscalateRisk = 'CRITICAL';
        } else if (confidenceLevel >= 60 && toneAnalysis === 'nervous' && contextClues.length > 0) {
          autoEscalateRisk = 'ELEVATED';
        }
        
        // Update case file with AI reasoning
        if (autoEscalateRisk !== caseFile.riskLevel) {
          caseFile.riskLevel = autoEscalateRisk;
          caseFile.timeline.push({
            timestamp: new Date().toISOString(),
            event: `AI auto-escalated to ${autoEscalateRisk} based on context analysis`,
            source: 'ai'
          });
        }
        
        // Add AI reasoning to evidence
        caseFile.evidence.push({
          type: 'text',
          content: `AI Analysis: ${inferredThreat} (${confidenceLevel}% confidence, ${toneAnalysis} tone)`,
          timestamp: new Date().toISOString()
        });
        
        if (contextClues.length > 0) {
          caseFile.evidence.push({
            type: 'text',
            content: `Context Clues: ${contextClues.join(', ')}`,
            timestamp: new Date().toISOString()
          });
        }
        
        activeCaseFiles.set(callId, caseFile);
        
        result = {
          success: true,
          analysis: {
            originalRisk: caseFile.riskLevel,
            newRisk: autoEscalateRisk,
            autoEscalated: autoEscalateRisk !== caseFile.riskLevel,
            reasoning: inferredThreat,
            confidence: confidenceLevel,
            tone: toneAnalysis,
            clues: contextClues
          },
          suggestedActions: autoEscalateRisk === 'CRITICAL' && caseFile.riskLevel !== 'CRITICAL' 
            ? ['initiate_warm_handoff', 'notify_emergency_contact', 'get_safe_locations']
            : undefined
        };
        
        // If critical escalation, log it
        if (autoEscalateRisk === 'CRITICAL' && caseFile.riskLevel !== 'CRITICAL') {
          console.log('🚨 AI DETECTED CRITICAL SITUATION - Preparing immediate response');
        }
        
        break;
      }
      
      case 'get_safe_locations': {
        const userLocation = caseFile.location || { lat: 37.7749, lng: -122.4194 };
        const safeLocations = await stacyTools.getSafeLocations(userLocation, parameters.radius || 5000);
        
        result = { success: true, locations: safeLocations };
        
        caseFile.timeline.push({
          timestamp: new Date().toISOString(),
          event: `Safe locations searched - ${safeLocations.length} found`,
          source: 'ai'
        });
        activeCaseFiles.set(callId, caseFile);
        
        break;
      }
      
      default:
        console.error(`❌ Unknown function: ${name}`);
        result = { success: false, error: `Unknown function: ${name}` };
    }

    console.log(`✅ Tool execution result:`, result);
    return res.json({ result });

  } catch (error) {
    console.error('VAPI webhook error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

// Stacy AI Safety Companion - Emergency Tools Integration
export interface CaseFile {
  id: string;
  timestamp: string;
  riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL';
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
    address?: string;
  };
  timeline: Array<{
    timestamp: string;
    event: string;
    source: 'user' | 'system' | 'ai';
  }>;
  threat?: {
    description: string;
    type: string;
    immediacy: 'immediate' | 'developing' | 'potential';
  };
  evidence: Array<{
    type: 'text' | 'location' | 'audio' | 'photo';
    content: string;
    timestamp: string;
  }>;
  userStatus: {
    canSpeak: boolean;
    canText: boolean;
    isHidden: boolean;
    batteryLevel?: number;
  };
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
  priority: number;
}

export interface SafeLocation {
  name: string;
  type: 'police' | 'hospital' | 'fire_station' | 'public_place';
  address: string;
  phone?: string;
  distance: number;
  isOpen: boolean;
}

export class StacyTools {
  private twilioAccountSid: string;
  private twilioAuthToken: string;
  private twilioNumber: string;

  constructor(twilioConfig: { accountSid: string; authToken: string; phoneNumber: string }) {
    this.twilioAccountSid = twilioConfig.accountSid;
    this.twilioAuthToken = twilioConfig.authToken;
    this.twilioNumber = twilioConfig.phoneNumber;
  }

  // Professional dispatcher-style case file management
  async updateCaseFile(caseId: string, updates: Partial<CaseFile>): Promise<CaseFile> {
    // This would integrate with your existing case file system
    console.log('Updating case file:', caseId, updates);
    
    // For now, return a mock case file structure
    return {
      id: caseId,
      timestamp: new Date().toISOString(),
      riskLevel: updates.riskLevel || 'ELEVATED',
      timeline: updates.timeline || [],
      evidence: updates.evidence || [],
      userStatus: updates.userStatus || {
        canSpeak: true,
        canText: true,
        isHidden: false,
      },
      ...updates,
    };
  }

  // Send comprehensive emergency report via SMS
  async notifyEmergencyContact(
    contact: EmergencyContact,
    caseFile: CaseFile,
    urgentMessage: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const emergencyReport = this.formatEmergencyReport(caseFile, urgentMessage);
      
      // Use Twilio to send SMS
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.twilioAccountSid}:${this.twilioAuthToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: this.twilioNumber,
          To: contact.phone,
          Body: emergencyReport,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, messageId: data.sid };
      } else {
        const error = await response.text();
        return { success: false, error };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Simple method to validate emergency transfer request
  validateEmergencyTransfer(destination: string, reason: string): { valid: boolean; message: string } {
    if (!destination || destination !== '+15146605707') {
      return { valid: false, message: 'Invalid emergency services destination' };
    }
    
    if (!reason || reason.trim().length === 0) {
      return { valid: false, message: 'Transfer reason is required' };
    }
    
    console.log(`🚨 Emergency transfer validated: ${destination} - ${reason}`);
    return { valid: true, message: 'Emergency transfer request is valid' };
  }

  // Find nearby safe locations
  async getSafeLocations(
    userLocation: { lat: number; lng: number },
    radius: number = 5000
  ): Promise<SafeLocation[]> {
    // This would integrate with Google Maps API or similar
    // For now, return mock data
    return [
      {
        name: 'Police Station - Downtown',
        type: 'police',
        address: '123 Main St',
        phone: '+1234567890',
        distance: 0.5,
        isOpen: true,
      },
      {
        name: 'General Hospital',
        type: 'hospital',
        address: '456 Health Ave',
        phone: '+1234567891',
        distance: 1.2,
        isOpen: true,
      },
      {
        name: '24/7 Gas Station',
        type: 'public_place',
        address: '789 Safe Blvd',
        distance: 0.3,
        isOpen: true,
      },
    ];
  }

  // Direct SMS to any number with location
  async sendContactSms(
    phoneNumber: string,
    message: string,
    location?: { lat: number; lng: number }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      let fullMessage = message;
      
      if (location) {
        fullMessage += `\n\nLocation: https://maps.google.com/?q=${location.lat},${location.lng}`;
      }

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.twilioAccountSid}:${this.twilioAuthToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: this.twilioNumber,
          To: phoneNumber,
          Body: fullMessage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, messageId: data.sid };
      } else {
        const error = await response.text();
        return { success: false, error };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private formatEmergencyReport(caseFile: CaseFile, urgentMessage: string): string {
    const location = caseFile.location 
      ? `Location: ${caseFile.location.address || `${caseFile.location.lat}, ${caseFile.location.lng}`}`
      : 'Location: Unknown';

    const threat = caseFile.threat 
      ? `Threat: ${caseFile.threat.description} (${caseFile.threat.immediacy})`
      : 'Threat: Not specified';

    return `🚨 EMERGENCY ALERT 🚨
${urgentMessage}

Case ID: ${caseFile.id}
Risk Level: ${caseFile.riskLevel}
Time: ${new Date(caseFile.timestamp).toLocaleString()}

${threat}
${location}

User Status:
- Can speak: ${caseFile.userStatus.canSpeak ? 'Yes' : 'No'}
- Can text: ${caseFile.userStatus.canText ? 'Yes' : 'No'}
- Hidden: ${caseFile.userStatus.isHidden ? 'Yes' : 'No'}

This is an automated emergency alert from Stacy AI Safety Companion.`;
  }
}

// Distress detection keywords and patterns
export const DISTRESS_KEYWORDS = {
  HIGH_PRIORITY: ['help', 'emergency', 'following me', 'danger', 'attacked', 'kidnapped', 'trapped'],
  MEDIUM_PRIORITY: ['scared', 'unsafe', 'uncomfortable', 'suspicious', 'worried', 'threatened'],
  LOCATION_KEYWORDS: ['lost', 'alone', 'dark area', 'isolated', 'unknown location'],
};

export function assessRiskLevel(message: string): 'SAFE' | 'ELEVATED' | 'CRITICAL' {
  const lowerMessage = message.toLowerCase();
  
  const highPriorityFound = DISTRESS_KEYWORDS.HIGH_PRIORITY.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  if (highPriorityFound) {
    return 'CRITICAL';
  }
  
  const mediumPriorityFound = DISTRESS_KEYWORDS.MEDIUM_PRIORITY.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  if (mediumPriorityFound) {
    return 'ELEVATED';
  }
  
  return 'SAFE';
}

// Server-side version of Stacy tools for Node.js
const fetch = require('node-fetch');

class StacyTools {
    constructor(twilioConfig) {
        this.twilioAccountSid = twilioConfig.accountSid;
        this.twilioAuthToken = twilioConfig.authToken;
        this.twilioNumber = twilioConfig.phoneNumber;
    }

    async updateCaseFile(caseId, updates) {
        console.log('Updating case file:', caseId, updates);

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

    async notifyEmergencyContact(contact, caseFile, urgentMessage) {
        try {
            const emergencyReport = this.formatEmergencyReport(caseFile, urgentMessage);

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
                console.log(`📱 Emergency SMS sent to ${contact.name}: ${data.sid}`);
                return { success: true, messageId: data.sid };
            } else {
                const error = await response.text();
                console.error('SMS send failed:', error);
                return { success: false, error };
            }
        } catch (error) {
            console.error('Error sending emergency SMS:', error);
            return { success: false, error: error.message };
        }
    }

    async callDemoEmergency(caseFile, briefingScript) {
        try {
            const twimlScript = `
        <Response>
          <Say voice="alice">Emergency briefing for case ${caseFile.id}. ${briefingScript}</Say>
          <Pause length="2"/>
          <Say voice="alice">Connecting user to conference now.</Say>
          <Dial>
            <Conference>emergency-${caseFile.id}</Conference>
          </Dial>
        </Response>
      `;

            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Calls.json`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${this.twilioAccountSid}:${this.twilioAuthToken}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    From: this.twilioNumber,
                    To: this.twilioNumber, // Demo call to your own number
                    Twiml: twimlScript,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`📞 Demo emergency call placed: ${data.sid}`);
                return { success: true, callId: data.sid };
            } else {
                const error = await response.text();
                console.error('Emergency call failed:', error);
                return { success: false, error };
            }
        } catch (error) {
            console.error('Error placing emergency call:', error);
            return { success: false, error: error.message };
        }
    }

    async getSafeLocations(userLocation, radius = 5000) {
        // Mock implementation - in production, integrate with Google Maps API
        const mockLocations = [
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

        console.log(`🏥 Found ${mockLocations.length} safe locations near ${userLocation.lat}, ${userLocation.lng}`);
        return mockLocations;
    }

    async sendContactSms(phoneNumber, message, location) {
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
                console.log(`📱 SMS sent to ${phoneNumber}: ${data.sid}`);
                return { success: true, messageId: data.sid };
            } else {
                const error = await response.text();
                console.error('SMS send failed:', error);
                return { success: false, error };
            }
        } catch (error) {
            console.error('Error sending SMS:', error);
            return { success: false, error: error.message };
        }
    }

    formatEmergencyReport(caseFile, urgentMessage) {
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

module.exports = { StacyTools };

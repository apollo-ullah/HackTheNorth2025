// VAPI Emergency Call Integration
// Handles warm handoff calls to emergency services with AI briefing

import fetch from 'node-fetch';
import { VapiClient } from '@vapi-ai/server-sdk';

class VAPIEmergencyService {
    constructor(apiKey, phoneNumber) {
        this.apiKey = apiKey;
        this.phoneNumber = phoneNumber;
        this.baseUrl = 'https://api.vapi.ai';
        this.activeEmergencyCalls = new Map(); // sessionId -> call details
        this.vapi = new VapiClient({ token: apiKey });
    }

    /**
     * Generate emergency briefing script for 911 dispatcher
     */
    generatePoliceScript(caseFile, userDetails = {}) {
        const userName = userDetails.name || 'the caller';
        const location = caseFile.location;
        const dangerLevel = caseFile.danger_level || 'moderate';

        let script = `911 Emergency Dispatch, this is Stacy AI Emergency Response System reporting an active situation requiring immediate police response. `;

        // Location first (most critical for 911)
        if (location?.lat && location?.lng) {
            script += `LOCATION COORDINATES: Latitude ${location.lat}, Longitude ${location.lng}. `;
            if (location.address) {
                script += `STREET ADDRESS: ${location.address}. `;
            }
        } else {
            script += `LOCATION: Unknown at this time - caller location services unavailable. `;
        }

        // Nature of emergency
        if (caseFile.situation_type) {
            script += `NATURE OF EMERGENCY: ${caseFile.situation_type}. `;
        }

        // Threat level for officer safety
        script += `THREAT ASSESSMENT: ${dangerLevel} danger level. `;

        if (caseFile.threat_description) {
            script += `DETAILS: ${caseFile.threat_description}. `;
        }

        // Caller information
        script += `CALLER INFORMATION: Name is ${userName}. `;

        // Critical caller status
        if (caseFile.can_speak === false) {
            script += `CRITICAL: Caller cannot speak safely and may need to communicate via text or signals only. `;
        }

        if (caseFile.hiding_location) {
            script += `CALLER LOCATION: Currently hiding in ${caseFile.hiding_location}. `;
        }

        if (caseFile.immediate_danger) {
            script += `URGENT: Caller reports immediate physical danger. `;
        }

        // Recent events
        if (caseFile.timeline && caseFile.timeline.length > 0) {
            const recentEvents = caseFile.timeline.slice(-2).join('. ');
            script += `RECENT EVENTS: ${recentEvents}. `;
        }

        // Professional handoff
        script += `Dispatch, I have the caller ready to connect to this line. The caller has been briefed that police are being contacted. Please advise when you are ready for caller connection.`;

        return script;
    }

    /**
     * Create VAPI assistant for emergency briefing with conference handoff
     */
    async createConferenceAssistant(sessionId, caseFile, userDetails, conferenceId, briefingScript) {
        const assistant = {
            name: `Emergency-Conference-${sessionId}`,
            model: {
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.1,
                messages: [
                    {
                        role: 'system',
                        content: `You are Stacy AI Emergency Response System calling 911 dispatch. You will:

1. Deliver this emergency briefing: "${briefingScript}"

2. After briefing, say: "I'm now connecting the caller to this line. Please hold while I add them to the call."

3. Once you've delivered the briefing and announced the handoff, you should stay on the line but let the caller and dispatcher communicate directly.

4. Only speak again if the dispatcher specifically asks you a question or needs clarification about the emergency details.

CASE CONTEXT for questions:
- Session: ${sessionId}
- Caller: ${userDetails.name || 'Unknown'}
- Location: ${caseFile.location ? `${caseFile.location.lat}, ${caseFile.location.lng}` : 'Unknown'}
- Situation: ${caseFile.situation_type || caseFile.emergency_type || 'Unknown'}
- Danger Level: ${caseFile.danger_level || 'Unknown'}

Be professional, clear, and facilitate the handoff smoothly.`
                    }
                ]
            },
            voice: {
                provider: '11labs',
                voiceId: 'ErXwobaYiN019PkySvjV'
            },
            firstMessage: briefingScript,
            functions: [
                {
                    name: 'transfer_call',
                    description: 'Add the emergency caller to this existing call for direct communication',
                    parameters: {
                        type: 'object',
                        properties: {
                            caller_phone: {
                                type: 'string',
                                description: 'Phone number of the emergency caller to add to the call'
                            }
                        },
                        required: ['caller_phone']
                    }
                }
            ]
        };

        try {
            console.log('🔧 Creating VAPI conference assistant...');
            const createdAssistant = await this.vapi.assistants.create(assistant);
            console.log('✅ VAPI Conference Assistant created:', createdAssistant.id);
            return createdAssistant;
        } catch (error) {
            console.error('❌ Failed to create VAPI conference assistant:', error);
            throw error;
        }
    }

    /**
     * Create VAPI assistant for emergency briefing (legacy method)
     */
    async createEmergencyAssistant(sessionId, caseFile, userDetails) {
        const briefingScript = this.generatePoliceScript(caseFile, userDetails);

        const assistant = {
            name: `Emergency-${sessionId}`,
            model: {
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.1,
                messages: [
                    {
                        role: 'system',
                        content: `You are Stacy AI Emergency Response System calling 911 dispatch. You are a professional AI safety system providing critical emergency information.

CASE CONTEXT:
- Session ID: ${sessionId}
- Caller Name: ${userDetails.name || 'Unknown'}
- Danger Level: ${caseFile.danger_level || 'Unknown'}
- Situation Type: ${caseFile.situation_type || caseFile.emergency_type || 'Unknown'}
- Location: ${caseFile.location ? `${caseFile.location.lat}, ${caseFile.location.lng}` : 'Unknown'}
- Address: ${caseFile.location?.address || 'Not available'}
- Can Speak Safely: ${caseFile.can_speak !== false ? 'Yes' : 'No - may be monitored'}
- Hiding Location: ${caseFile.hiding_location || 'Not specified'}
- Threat Description: ${caseFile.threat_description || 'Not specified'}
- Immediate Danger: ${caseFile.immediate_danger ? 'Yes' : 'No'}

PROTOCOL:
1. Deliver the emergency briefing clearly and professionally
2. Answer any clarifying questions from dispatch using the case context above
3. If asked for details not in your briefing, refer to the case context
4. Facilitate the handoff to connect the caller
5. Remain available if dispatch needs additional information

EMERGENCY BRIEFING TO DELIVER:
"${briefingScript}"

AFTER BRIEFING:
- Ask: "Do you need any additional information about this emergency?"
- When ready for transfer, say: "I'm now connecting the emergency caller to this line. Please hold while I add them to the call."
- Use the transfer_call function to add the caller to this existing call
- Stay on the line briefly to facilitate the introduction, then gracefully exit

IMPORTANT:
- Speak clearly and at appropriate pace for emergency dispatch
- Provide exact location coordinates if asked to repeat
- If dispatch asks questions, answer from the case context above
- After announcing the transfer, end the call promptly
- The caller will be connected via a separate system after this call ends
- Treat this as a real 911 emergency call - be professional and thorough`
                    }
                ]
            },
            voice: {
                provider: '11labs',
                voiceId: 'ErXwobaYiN019PkySvjV'
            },
            firstMessage: briefingScript
        };

        try {
            console.log('🔧 Creating VAPI assistant with SDK:', JSON.stringify(assistant, null, 2));

            const createdAssistant = await this.vapi.assistants.create(assistant);
            console.log('✅ VAPI Assistant created:', createdAssistant.id);

            return createdAssistant;
        } catch (error) {
            console.error('❌ Failed to create VAPI emergency assistant:', error);
            console.error('Error details:', error.message);
            throw error;
        }
    }

    /**
     * Initiate emergency call with warm handoff using Twilio conference
     */
    async initiateEmergencyCall(sessionId, caseFile, userDetails = {}) {
        try {
            console.log(`🚨 INITIATING VAPI EMERGENCY CALL WITH HANDOFF - Session ${sessionId}`);

            // Create a unique conference room for this emergency
            const conferenceId = `emergency_${sessionId}_${Date.now()}`;
            const briefingScript = this.generatePoliceScript(caseFile, userDetails);
            const emergencyNumber = process.env.DEMO_EMERGENCY_NUMBER || '+14383761217';

            // Step 1: Create VAPI assistant for emergency briefing
            const assistant = await this.createEmergencyAssistant(sessionId, caseFile, userDetails);

            // Step 2: Use VAPI to call the dispatcher and connect them to conference
            const callData = {
                assistantId: assistant.id,
                phoneNumberId: this.phoneNumber,
                customer: {
                    number: emergencyNumber
                }
            };

            console.log('📞 Initiating VAPI call to dispatcher:', callData);
            const call = await this.vapi.calls.create(callData);

            // Store active emergency call with conference info
            this.activeEmergencyCalls.set(sessionId, {
                callId: call.id,
                assistantId: assistant.id,
                conferenceId: conferenceId,
                status: 'briefing_dispatcher',
                briefingComplete: false,
                userConnected: false,
                dispatcherConnected: true,
                startedAt: Date.now(),
                caseFile,
                userDetails,
                emergencyNumber
            });

            console.log(`📞 VAPI Emergency call initiated: ${call.id}`);
            console.log(`🏢 Conference room created: ${conferenceId}`);

            return {
                success: true,
                callId: call.id,
                assistantId: assistant.id,
                conferenceId: conferenceId,
                status: 'briefing_dispatcher',
                message: 'Emergency call initiated. Briefing dispatcher and preparing handoff.'
            };

        } catch (error) {
            console.error('❌ VAPI Emergency call failed:', error);
            return {
                success: false,
                error: error.message,
                fallback_required: true
            };
        }
    }

    /**
     * Get connection info for user to join emergency call
     */
    getEmergencyCallConnectionInfo(sessionId) {
        const emergencyCall = this.activeEmergencyCalls.get(sessionId);

        if (!emergencyCall) {
            return { error: 'No active emergency call found' };
        }

        return {
            success: true,
            conferenceId: emergencyCall.conferenceId,
            callId: emergencyCall.callId,
            status: emergencyCall.status,
            dispatcherConnected: emergencyCall.dispatcherConnected,
            userConnected: emergencyCall.userConnected,
            message: 'Emergency call connection info retrieved'
        };
    }

    /**
     * Mark user as connected to emergency call
     */
    markUserConnected(sessionId, userPhone) {
        const emergencyCall = this.activeEmergencyCalls.get(sessionId);

        if (!emergencyCall) {
            return { error: 'No active emergency call found' };
        }

        emergencyCall.userConnected = true;
        emergencyCall.userPhone = userPhone;
        emergencyCall.status = 'user_connected';
        this.activeEmergencyCalls.set(sessionId, emergencyCall);

        console.log(`👤 User marked as connected to emergency call: ${emergencyCall.callId}`);

        return {
            success: true,
            callId: emergencyCall.callId,
            status: 'user_connected',
            message: 'User successfully connected to emergency call'
        };
    }

    /**
     * Get emergency call status
     */
    async getEmergencyCallStatus(sessionId) {
        const emergencyCall = this.activeEmergencyCalls.get(sessionId);

        if (!emergencyCall) {
            return { status: 'no_active_call' };
        }

        try {
            const response = await fetch(`${this.baseUrl}/call/${emergencyCall.callId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get call status: ${response.statusText}`);
            }

            const callData = await response.json();

            return {
                status: callData.status,
                duration: callData.duration,
                briefingComplete: emergencyCall.briefingComplete,
                userConnected: emergencyCall.userConnected,
                callId: emergencyCall.callId
            };

        } catch (error) {
            console.error('❌ Failed to get emergency call status:', error);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Handle VAPI webhooks for call status updates
     */
    handleWebhook(webhookData) {
        const { callId, status, metadata } = webhookData;
        const sessionId = metadata?.sessionId;

        if (!sessionId) return;

        const emergencyCall = this.activeEmergencyCalls.get(sessionId);
        if (!emergencyCall) return;

        console.log(`📞 VAPI Webhook - Call ${callId}: ${status}`);

        switch (status) {
            case 'in-progress':
                emergencyCall.status = 'briefing_active';
                break;
            case 'forwarded':
                emergencyCall.briefingComplete = true;
                emergencyCall.status = 'ready_for_user';
                break;
            case 'ended':
                emergencyCall.status = 'call_ended';
                this.activeEmergencyCalls.delete(sessionId);
                break;
        }

        if (emergencyCall.status !== 'call_ended') {
            this.activeEmergencyCalls.set(sessionId, emergencyCall);
        }
    }

    /**
     * End emergency call
     */
    async endEmergencyCall(sessionId) {
        const emergencyCall = this.activeEmergencyCalls.get(sessionId);

        if (!emergencyCall) {
            return { success: false, error: 'No active emergency call' };
        }

        try {
            await fetch(`${this.baseUrl}/call/${emergencyCall.callId}/end`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            this.activeEmergencyCalls.delete(sessionId);

            return { success: true, message: 'Emergency call ended' };
        } catch (error) {
            console.error('❌ Failed to end emergency call:', error);
            return { success: false, error: error.message };
        }
    }
}

export default VAPIEmergencyService;

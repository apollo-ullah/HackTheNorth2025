import OpenAI from 'openai';
import { WebSocket } from 'ws';

export class RealtimeHandler {
    constructor(apiKey) {
        this.openai = new OpenAI({ apiKey });
        this.sessions = new Map();
    }

    async createSession(connectionId, clientWs) {
        try {
            // Create a WebSocket connection to OpenAI Realtime API
            const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                headers: {
                    'Authorization': `Bearer ${this.openai.apiKey}`,
                    'OpenAI-Beta': 'realtime=v1'
                }
            });

            const session = {
                connectionId,
                clientWs,
                openaiWs,
                isConnected: false,
                conversationHistory: []
            };

            this.sessions.set(connectionId, session);

            openaiWs.on('open', () => {
                console.log(`OpenAI Realtime connected for session: ${connectionId}`);
                session.isConnected = true;
                
                // Configure the session with safety-focused instructions
                this.configureSession(openaiWs);
            });

            openaiWs.on('message', (data) => {
                this.handleOpenAIMessage(session, data);
            });

            openaiWs.on('error', (error) => {
                console.error(`OpenAI WebSocket error for session ${connectionId}:`, error);
                this.sendToClient(clientWs, {
                    type: 'error',
                    message: 'AI service temporarily unavailable'
                });
            });

            openaiWs.on('close', () => {
                console.log(`OpenAI WebSocket closed for session: ${connectionId}`);
                session.isConnected = false;
            });

            return session;

        } catch (error) {
            console.error('Error creating OpenAI session:', error);
            throw error;
        }
    }

    configureSession(openaiWs) {
        // Send session configuration
        const config = {
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                instructions: `You are Stacy, an AI safety companion designed to help people in potentially unsafe situations. 

Your primary goals are to:
1. Listen carefully and empathetically to the user's situation
2. Detect signs of distress, danger, or emergency situations
3. Provide calm, supportive, and actionable guidance
4. Help escalate to appropriate help when needed
5. Suggest practical safety measures

CRITICAL SAFETY KEYWORDS TO WATCH FOR:
- "following me", "being followed"
- "unsafe", "scared", "frightened", "terrified"
- "help", "emergency", "danger", "threatened"
- "lost", "alone", "trapped"
- "suspicious person", "stranger"
- "dark area", "isolated"

RESPONSE GUIDELINES:
- Keep responses concise and clear, especially in high-stress situations
- Always acknowledge their feelings and validate their concerns
- Provide specific, actionable advice
- If you detect high distress, immediately suggest emergency actions
- Encourage them to move to safe, well-lit, populated areas
- Remind them of emergency contacts and services

DISTRESS LEVELS:
- LOW: General safety questions, preventive advice
- MEDIUM: Uncomfortable situations, mild anxiety
- HIGH: Clear danger indicators, panic, immediate threat

Always prioritize the user's immediate safety over everything else.`,
                voice: 'alloy',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 200
                },
                tools: [],
                tool_choice: 'none',
                temperature: 0.7,
                max_response_output_tokens: 150
            }
        };

        openaiWs.send(JSON.stringify(config));
    }

    handleOpenAIMessage(session, data) {
        try {
            const message = JSON.parse(data);
            const { type } = message;

            switch (type) {
                case 'session.created':
                case 'session.updated':
                    console.log(`Session ${type} for ${session.connectionId}`);
                    break;

                case 'conversation.item.created':
                    // Track conversation items
                    session.conversationHistory.push(message.item);
                    break;

                case 'input_audio_buffer.committed':
                    console.log(`Audio buffer committed for session: ${session.connectionId}`);
                    break;

                case 'response.created':
                    console.log(`Response created for session: ${session.connectionId}`);
                    break;

                case 'response.output_item.added':
                case 'response.content_part.added':
                    // Response structure created
                    break;

                case 'response.audio_transcript.delta':
                    // Accumulate transcript deltas
                    if (!session.currentTranscript) {
                        session.currentTranscript = '';
                    }
                    session.currentTranscript += message.delta || '';
                    break;

                case 'response.audio_transcript.done':
                    // Send complete transcript as AI response
                    if (session.currentTranscript) {
                        this.sendToClient(session.clientWs, {
                            type: 'ai_response',
                            message: session.currentTranscript,
                            distressLevel: this.analyzeResponseDistress(session.currentTranscript)
                        });
                        session.currentTranscript = '';
                    }
                    break;

                case 'response.audio.delta':
                    // Forward audio response to client
                    this.sendToClient(session.clientWs, {
                        type: 'audio_response',
                        payload: {
                            audio_delta: message.delta,
                            format: 'pcm16'
                        }
                    });
                    break;

                case 'response.audio.done':
                    console.log(`Audio response completed for session: ${session.connectionId}`);
                    break;

                case 'response.text.delta':
                    // Forward text response to client
                    this.sendToClient(session.clientWs, {
                        type: 'text_response_delta',
                        payload: {
                            text_delta: message.delta
                        }
                    });
                    break;

                case 'response.content_part.done':
                case 'response.output_item.done':
                    // Response parts completed
                    break;

                case 'rate_limits.updated':
                    // Rate limit information
                    console.log(`Rate limits updated for session: ${session.connectionId}`);
                    break;

                case 'response.done':
                    // Analyze the response for distress indicators
                    this.analyzeResponse(session, message);
                    break;

                case 'input_audio_buffer.speech_started':
                    this.sendToClient(session.clientWs, {
                        type: 'speech_detected',
                        message: 'Listening...'
                    });
                    break;

                case 'input_audio_buffer.speech_stopped':
                    this.sendToClient(session.clientWs, {
                        type: 'speech_ended',
                        message: 'Processing...'
                    });
                    break;

                case 'conversation.item.input_audio_transcription.completed':
                    // Analyze user's transcribed speech for distress keywords
                    this.analyzeUserInput(session, message.transcript);
                    break;

                case 'error':
                    console.error(`OpenAI API error for session ${session.connectionId}:`, message);
                    this.sendToClient(session.clientWs, {
                        type: 'error',
                        message: 'AI processing error occurred'
                    });
                    break;

                default:
                    console.log(`Unhandled OpenAI message type: ${type}`);
            }

        } catch (error) {
            console.error('Error handling OpenAI message:', error);
        }
    }

    analyzeUserInput(session, transcript) {
        if (!transcript) return;

        const text = transcript.toLowerCase();
        let distressLevel = 'low';
        const distressKeywords = [
            'help', 'emergency', 'scared', 'frightened', 'terrified', 'unsafe',
            'following me', 'being followed', 'stranger', 'suspicious', 'threatened',
            'danger', 'trapped', 'lost', 'alone', 'dark', 'isolated'
        ];

        const highDistressKeywords = [
            'help', 'emergency', 'terrified', 'following me', 'being followed',
            'threatened', 'danger', 'trapped'
        ];

        // Check for distress indicators
        const foundKeywords = distressKeywords.filter(keyword => text.includes(keyword));
        const foundHighDistress = highDistressKeywords.filter(keyword => text.includes(keyword));

        if (foundHighDistress.length > 0) {
            distressLevel = 'high';
        } else if (foundKeywords.length > 0) {
            distressLevel = 'medium';
        }

        // Send distress analysis to client
        this.sendToClient(session.clientWs, {
            type: 'distress_analysis',
            payload: {
                distressLevel,
                detectedKeywords: foundKeywords,
                transcript
            }
        });

        console.log(`Distress analysis for ${session.connectionId}: ${distressLevel}, keywords: ${foundKeywords.join(', ')}`);
    }

    analyzeResponseDistress(responseText) {
        // Analyze AI response to determine if it indicates high urgency
        const lowercaseResponse = responseText.toLowerCase();
        
        if (lowercaseResponse.includes('emergency') || lowercaseResponse.includes('911') || 
            lowercaseResponse.includes('police') || lowercaseResponse.includes('immediate')) {
            return 'high';
        } else if (lowercaseResponse.includes('caution') || lowercaseResponse.includes('careful') || 
                   lowercaseResponse.includes('safe place')) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    analyzeResponse(session, responseMessage) {
        // Additional analysis of AI response can be done here
        // For example, checking if the AI suggested emergency actions
        
        this.sendToClient(session.clientWs, {
            type: 'response_complete',
            message: 'Response completed'
        });
    }

    sendAudioToOpenAI(connectionId, audioData) {
        const session = this.sessions.get(connectionId);
        if (!session || !session.isConnected) {
            console.error(`Session not found or not connected: ${connectionId}`);
            return;
        }

        try {
            console.log(`Sending audio to OpenAI for session: ${connectionId}, audio length: ${audioData.length}`);
            
            // The audio data is already in base64 PCM16 format from the client
            // Send audio input to OpenAI Realtime API
            const message = {
                type: 'input_audio_buffer.append',
                audio: audioData
            };

            session.openaiWs.send(JSON.stringify(message));

            // Commit the audio buffer to process it
            session.openaiWs.send(JSON.stringify({
                type: 'input_audio_buffer.commit'
            }));

            console.log(`Audio sent and committed for session: ${connectionId}`);

        } catch (error) {
            console.error('Error sending audio to OpenAI:', error);
            this.sendToClient(session.clientWs, {
                type: 'error',
                message: 'Failed to process audio'
            });
        }
    }

    sendTextToOpenAI(connectionId, text) {
        const session = this.sessions.get(connectionId);
        if (!session || !session.isConnected) {
            console.error(`Session not found or not connected: ${connectionId}`);
            return;
        }

        try {
            const message = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: text
                        }
                    ]
                }
            };

            session.openaiWs.send(JSON.stringify(message));

            // Trigger response generation
            session.openaiWs.send(JSON.stringify({
                type: 'response.create'
            }));

        } catch (error) {
            console.error('Error sending text to OpenAI:', error);
        }
    }

    sendToClient(clientWs, message) {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(message));
        }
    }

    closeSession(connectionId) {
        const session = this.sessions.get(connectionId);
        if (session) {
            if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
                session.openaiWs.close();
            }
            this.sessions.delete(connectionId);
            console.log(`Closed session: ${connectionId}`);
        }
    }

    getSessionStats() {
        return {
            activeSessions: this.sessions.size,
            sessions: Array.from(this.sessions.keys())
        };
    }
}

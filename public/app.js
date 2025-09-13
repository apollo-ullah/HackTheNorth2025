class StacyClient {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.isRecording = false;
        this.isConnected = false;
        this.currentLocation = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.connectWebSocket();
        this.requestLocationPermission();
    }

    initializeElements() {
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            messagesContainer: document.getElementById('messagesContainer'),
            micButton: document.getElementById('micButton'),
            audioVisualizer: document.getElementById('audioVisualizer'),
            emergencyButton: document.getElementById('emergencyButton'),
            locationButton: document.getElementById('locationButton'),
            emergencyModal: document.getElementById('emergencyModal'),
            closeEmergencyModal: document.getElementById('closeEmergencyModal'),
            locationInfo: document.getElementById('locationInfo'),
            callEmergencyServices: document.getElementById('callEmergencyServices'),
            textEmergencyContact: document.getElementById('textEmergencyContact'),
            findSafeLocation: document.getElementById('findSafeLocation')
        };
    }

    setupEventListeners() {
        // Microphone button - press and hold
        this.elements.micButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startRecording();
        });

        this.elements.micButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        // Touch events for mobile
        this.elements.micButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });

        this.elements.micButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        // Emergency button
        this.elements.emergencyButton.addEventListener('click', () => {
            this.triggerEmergency();
        });

        // Location button
        this.elements.locationButton.addEventListener('click', () => {
            this.shareLocation();
        });

        // Modal controls
        this.elements.closeEmergencyModal.addEventListener('click', () => {
            this.closeEmergencyModal();
        });

        // Emergency action buttons
        this.elements.callEmergencyServices.addEventListener('click', () => {
            this.callEmergencyServices();
        });

        this.elements.textEmergencyContact.addEventListener('click', () => {
            this.textEmergencyContact();
        });

        this.elements.findSafeLocation.addEventListener('click', () => {
            this.findSafeLocation();
        });

        // Prevent context menu on long press
        this.elements.micButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.STACY_WS_PORT || 3001;
        const wsUrl = `${protocol}//${host}:${port}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('Connected to Stacy server');
            this.isConnected = true;
            this.updateConnectionStatus('connected', 'Connected');
            this.elements.micButton.disabled = false;
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing server message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from Stacy server');
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.elements.micButton.disabled = true;
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connectWebSocket();
                }
            }, 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('disconnected', 'Connection Error');
        };
    }

    updateConnectionStatus(status, text) {
        const statusDot = this.elements.connectionStatus.querySelector('.status-dot');
        const statusText = this.elements.connectionStatus.querySelector('span');
        
        statusDot.className = `status-dot ${status}`;
        statusText.textContent = text;
    }

    async startRecording() {
        if (!this.isConnected || this.isRecording) return;

        try {
            // Request microphone access with specific constraints for OpenAI Realtime API
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1, // Mono
                    sampleRate: 24000, // 24kHz as required by OpenAI
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });

            // Set up audio processing for PCM16 format
            await this.setupAudioProcessing();
            this.isRecording = true;

            // Update UI
            this.elements.micButton.classList.add('recording');
            this.elements.micButton.querySelector('.mic-status').textContent = 'Recording...';
            this.elements.audioVisualizer.classList.add('active');

            // Send start conversation message
            this.sendMessage({
                type: 'start_conversation'
            });

            console.log('Started recording');

        } catch (error) {
            console.error('Error starting recording:', error);
            this.addMessage('system', 'Unable to access microphone. Please check permissions.');
        }
    }

    async setupAudioProcessing() {
        try {
            // Create audio context with 24kHz sample rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });

            // Create source from stream
            this.sourceNode = this.audioContext.createMediaStreamSource(this.audioStream);
            
            // Create script processor for raw audio data
            this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            this.audioBuffer = [];
            
            this.processorNode.onaudioprocess = (event) => {
                if (this.isRecording) {
                    const inputBuffer = event.inputBuffer;
                    const inputData = inputBuffer.getChannelData(0);
                    
                    // Convert float32 to int16 (PCM16)
                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const sample = Math.max(-1, Math.min(1, inputData[i]));
                        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                    }
                    
                    this.audioBuffer.push(pcm16);
                }
            };

            // Connect nodes
            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);

            // Send start conversation message
            this.sendMessage({
                type: 'start_conversation'
            });

        } catch (error) {
            console.error('Error setting up audio processing:', error);
            throw error;
        }
    }

    stopRecording() {
        if (!this.isRecording) return;

        try {
            this.isRecording = false;

            // Process accumulated audio buffer
            if (this.audioBuffer.length > 0) {
                this.sendAudioBuffer();
            }

            // Clean up audio processing
            if (this.processorNode) {
                this.processorNode.disconnect();
                this.processorNode = null;
            }
            
            if (this.sourceNode) {
                this.sourceNode.disconnect();
                this.sourceNode = null;
            }
            
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close();
                this.audioContext = null;
            }

            // Stop audio stream
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }

            // Update UI
            this.elements.micButton.classList.remove('recording');
            this.elements.micButton.querySelector('.mic-status').textContent = 'Press & Hold to Talk';
            this.elements.audioVisualizer.classList.remove('active');

            console.log('Stopped recording');

        } catch (error) {
            console.error('Error stopping recording:', error);
        }
    }

    sendAudioBuffer() {
        if (!this.isConnected || this.audioBuffer.length === 0) return;

        try {
            // Combine all audio chunks into a single buffer
            const totalLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Int16Array(totalLength);
            
            let offset = 0;
            for (const chunk of this.audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            // Convert Int16Array to base64
            const bytes = new Uint8Array(combinedBuffer.buffer);
            const base64Audio = btoa(String.fromCharCode(...bytes));

            // Send to server
            this.sendMessage({
                type: 'audio_data',
                payload: {
                    audio: base64Audio,
                    format: 'pcm16',
                    sampleRate: 24000,
                    channels: 1,
                    timestamp: Date.now()
                }
            });

            // Clear buffer
            this.audioBuffer = [];
            
            console.log(`Sent ${totalLength} audio samples to server`);

        } catch (error) {
            console.error('Error sending audio buffer:', error);
        }
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    handleServerMessage(data) {
        const { type, message, payload } = data;

        switch (type) {
            case 'connected':
                console.log('Server connection confirmed:', message);
                break;

            case 'conversation_started':
                console.log('Conversation started');
                break;

            case 'ai_response':
                this.addMessage('ai', message);
                this.handleDistressLevel(payload?.distressLevel);
                break;

            case 'audio_response':
                // Handle audio response from OpenAI
                this.handleAudioResponse(payload);
                break;

            case 'text_response_delta':
                // Handle streaming text response
                this.handleTextDelta(payload);
                break;

            case 'speech_detected':
                console.log('Speech detected:', message);
                break;

            case 'speech_ended':
                console.log('Speech ended:', message);
                break;

            case 'distress_analysis':
                this.handleDistressAnalysis(payload);
                break;

            case 'transcription':
                this.addMessage('user', `"${payload.transcript}"`);
                break;

            case 'response_complete':
                console.log('AI response complete');
                break;

            case 'emergency_acknowledged':
                this.addMessage('ai', message);
                this.showEmergencyActions(payload?.actions);
                break;

            case 'error':
                console.error('Server error:', message);
                this.addMessage('system', `Error: ${message}`);
                break;

            default:
                console.log('Unknown message type:', type);
        }
    }

    addMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `${sender}-message`;

        const avatar = document.createElement('div');
        avatar.className = `${sender}-avatar`;
        
        if (sender === 'ai') {
            avatar.textContent = '🤖';
        } else if (sender === 'user') {
            avatar.textContent = '👤';
        } else {
            avatar.textContent = '⚠️';
        }

        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `<p>${text}</p>`;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        this.elements.messagesContainer.appendChild(messageDiv);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }

    handleAudioResponse(payload) {
        // Handle audio response from OpenAI
        // In a full implementation, this would play the audio
        console.log('Received audio response from AI');
    }

    handleTextDelta(payload) {
        // Handle streaming text response
        if (payload.text_delta) {
            // In a full implementation, this would update a streaming message
            console.log('Text delta:', payload.text_delta);
        }
    }

    handleDistressAnalysis(payload) {
        if (payload) {
            const { distressLevel, detectedKeywords, transcript } = payload;
            
            console.log(`Distress Analysis: ${distressLevel}, Keywords: ${detectedKeywords?.join(', ') || 'none'}`);
            
            // Show transcription
            if (transcript) {
                this.addMessage('user', `"${transcript}"`);
            }
            
            // Handle distress level
            this.handleDistressLevel(distressLevel);
        }
    }

    handleDistressLevel(level) {
        if (level === 'high') {
            // Automatically show emergency options for high distress
            this.showEmergencyModal();
        } else if (level === 'medium') {
            // Highlight emergency button
            this.elements.emergencyButton.style.animation = 'pulse 2s infinite';
        }
    }

    triggerEmergency() {
        this.showEmergencyModal();
        
        // Send emergency trigger to server
        this.sendMessage({
            type: 'emergency_trigger',
            payload: {
                location: this.currentLocation,
                emergencyType: 'manual_trigger',
                timestamp: Date.now()
            }
        });
    }

    showEmergencyModal() {
        this.elements.emergencyModal.style.display = 'flex';
        this.updateLocationInModal();
    }

    closeEmergencyModal() {
        this.elements.emergencyModal.style.display = 'none';
    }

    async requestLocationPermission() {
        if ('geolocation' in navigator) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 60000
                    });
                });

                this.currentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: Date.now()
                };

                console.log('Location permission granted');

                // Start watching position for continuous updates
                navigator.geolocation.watchPosition(
                    (position) => {
                        this.currentLocation = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            timestamp: Date.now()
                        };
                    },
                    (error) => {
                        console.error('Location tracking error:', error);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 30000
                    }
                );

            } catch (error) {
                console.error('Location permission denied:', error);
                this.addMessage('system', 'Location access denied. Some safety features may be limited.');
            }
        } else {
            console.error('Geolocation not supported');
            this.addMessage('system', 'Location services not available on this device.');
        }
    }

    shareLocation() {
        if (!this.currentLocation) {
            this.addMessage('system', 'Location not available. Please enable location services.');
            return;
        }

        const locationText = `📍 Current location: ${this.currentLocation.latitude.toFixed(6)}, ${this.currentLocation.longitude.toFixed(6)}`;
        this.addMessage('user', 'Sharing my location');
        this.addMessage('ai', locationText);

        // Send location to server
        this.sendMessage({
            type: 'location_shared',
            payload: this.currentLocation
        });
    }

    updateLocationInModal() {
        if (this.currentLocation) {
            const locationText = `📍 Lat: ${this.currentLocation.latitude.toFixed(6)}, Lng: ${this.currentLocation.longitude.toFixed(6)}`;
            this.elements.locationInfo.innerHTML = `<p>${locationText}</p><p>Accuracy: ±${Math.round(this.currentLocation.accuracy)}m</p>`;
        } else {
            this.elements.locationInfo.innerHTML = '<p>📍 Location not available</p>';
        }
    }

    showEmergencyActions(actions) {
        if (actions && actions.length > 0) {
            const actionsText = actions.map(action => `✓ ${action}`).join('<br>');
            this.addMessage('ai', actionsText);
        }
    }

    callEmergencyServices() {
        // In a real app, this would integrate with the device's phone functionality
        window.location.href = 'tel:911';
        this.addMessage('system', 'Initiating call to emergency services...');
    }

    textEmergencyContact() {
        // This would integrate with SMS functionality
        const message = `Emergency alert from Stacy. I need help. My location: ${this.currentLocation?.latitude}, ${this.currentLocation?.longitude}`;
        this.addMessage('system', 'Sending emergency text message...');
        // In a real implementation, this would use the backend to send SMS
    }

    findSafeLocation() {
        if (!this.currentLocation) {
            this.addMessage('system', 'Location required to find safe places nearby.');
            return;
        }

        // This would integrate with Google Maps API to find nearby safe places
        const mapsUrl = `https://www.google.com/maps/search/police+station+hospital+cafe/@${this.currentLocation.latitude},${this.currentLocation.longitude},15z`;
        window.open(mapsUrl, '_blank');
        this.addMessage('ai', 'Opening map to show nearby safe locations...');
    }
}

// Initialize the Stacy client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.stacyClient = new StacyClient();
});

// Handle page visibility changes to manage connections
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.stacyClient) {
        // App is backgrounded - keep connection alive but stop recording
        if (window.stacyClient.isRecording) {
            window.stacyClient.stopRecording();
        }
    }
});

// Handle beforeunload to cleanup
window.addEventListener('beforeunload', () => {
    if (window.stacyClient) {
        if (window.stacyClient.isRecording) {
            window.stacyClient.stopRecording();
        }
        if (window.stacyClient.ws) {
            window.stacyClient.ws.close();
        }
    }
});

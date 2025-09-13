// Enhanced Stacy Client with VAPI Integration
import { createSafetySystem, bus } from './safety/signals-wireup.js';
import { STACY_INSTRUCTIONS, CaseFileManager } from './safety/stacy-brain.js';

class EnhancedStacyClient {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.isRecording = false;
        this.isConnected = false;
        this.currentLocation = null;
        this.caseFileManager = null;
        this.safetySystem = null;
        this.mode = 'webrtc'; // 'webrtc' or 'vapi'

        this.initializeElements();
        this.setupEventListeners();
        this.initializeSafetySystem();
        this.connectWebSocket();
        this.requestLocationPermission();
    }

    initializeElements() {
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            locationStatus: document.getElementById('locationStatus'),
            messagesContainer: document.getElementById('messagesContainer'),
            micButton: document.getElementById('micButton'),
            audioVisualizer: document.getElementById('audioVisualizer'),
            textInput: document.getElementById('textInput'),
            sendTextBtn: document.getElementById('sendTextBtn'),
            quickReplies: document.getElementById('quickReplies'),
            emergencyButton: document.getElementById('emergencyButton'),
            locationButton: document.getElementById('locationButton'),
            deleteDataButton: document.getElementById('deleteDataButton'),
            emergencyModal: document.getElementById('emergencyModal'),
            closeEmergencyModal: document.getElementById('closeEmergencyModal'),
            locationInfo: document.getElementById('locationInfo'),
            callEmergencyServices: document.getElementById('callEmergencyServices'),
            textEmergencyContact: document.getElementById('textEmergencyContact'),
            findSafeLocation: document.getElementById('findSafeLocation'),
            modeToggle: document.getElementById('modeToggle'),
            safetyBanner: document.getElementById('safetyBanner'),
            safetyBannerText: document.getElementById('safetyBannerText'),
            riskFill: document.getElementById('riskFill'),
        };

        // Add VAPI call button
        this.addVapiCallButton();
    }

    addVapiCallButton() {
        const vapiButton = document.createElement('button');
        vapiButton.id = 'vapiCallButton';
        vapiButton.className = 'emergency-button';
        vapiButton.innerHTML = '<span class="emergency-icon">📞</span><span>Call Stacy (VAPI)</span>';
        vapiButton.style.marginTop = '10px';

        vapiButton.addEventListener('click', () => {
            this.initiateVapiCall();
        });

        // Insert after emergency controls
        const emergencyControls = document.querySelector('.emergency-controls');
        emergencyControls.appendChild(vapiButton);

        this.elements.vapiCallButton = vapiButton;
    }

    initializeSafetySystem() {
        // Create case file manager
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.caseFileManager = new CaseFileManager(sessionId);

        // Initialize safety system with UI callbacks
        this.safetySystem = createSafetySystem(
            {
                setBanner: (text) => this.setBanner(text),
                showQuickReplies: (replies) => this.showQuickReplies(replies),
                renderRiskBar: (risk) => this.renderRiskBar(risk),
                onStateChange: (newState, prevState) => this.onSafetyStateChange(newState, prevState),
                injectStateContext: (state, risk) => this.injectStateContext(state, risk),
            },
            {
                notifyContactsIfNotYet: () => this.notifyEmergencyContacts(),
                startRollingAudioIfNotYet: () => this.startEmergencyRecording(),
                startRoutingIfNotYet: () => this.startSafeRouting(),
                finalizeIncidentOnce: () => this.finalizeIncident(),
            }
        );

        // Listen to case file updates
        this.caseFileManager.onUpdate((caseFile) => {
            console.log('Case file updated:', caseFile);
            this.updateUIFromCaseFile(caseFile);
        });
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

        // Text input
        this.elements.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendTextMessage();
            }
        });

        this.elements.sendTextBtn.addEventListener('click', () => {
            this.sendTextMessage();
        });

        // Quick replies
        this.elements.quickReplies.addEventListener('click', (e) => {
            if (e.target.classList.contains('qr-button')) {
                const text = e.target.getAttribute('data-text');
                this.sendTextMessage(text);
            }
        });

        // Emergency controls
        this.elements.emergencyButton.addEventListener('click', () => {
            this.triggerEmergency();
        });

        this.elements.locationButton.addEventListener('click', () => {
            this.shareLocation();
        });

        this.elements.deleteDataButton.addEventListener('click', () => {
            this.deleteData();
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

        // Mode toggle
        this.elements.modeToggle.addEventListener('click', () => {
            this.toggleMode();
        });

        // Prevent context menu on long press
        this.elements.micButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

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

    handleServerMessage(data) {
        const { type, message, payload } = data;

        switch (type) {
            case 'connected':
                console.log('Server connection confirmed:', message);
                if (payload?.sessionId) {
                    this.sessionId = payload.sessionId;
                }
                break;

            case 'conversation_started':
                console.log('Conversation started');
                break;

            case 'ai_response':
                this.addMessage('ai', message);
                break;

            case 'audio_response':
                this.handleAudioResponse(payload);
                break;

            case 'transcription':
                this.addMessage('user', `"${payload.transcript}"`);
                // Feed transcript to risk engine
                bus.dispatchEvent(new CustomEvent('transcript', {
                    detail: { text: payload.transcript }
                }));
                break;

            case 'distress_analysis':
                this.handleDistressAnalysis(payload);
                break;

            case 'casefile_updated':
                this.handleCaseFileUpdate(payload);
                break;

            case 'tool_executed':
                this.handleToolExecution(payload);
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

    async initiateVapiCall() {
        try {
            this.addMessage('system', 'Initiating VAPI call to Stacy...');

            const response = await fetch('/api/stacy/voice-call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phone_number: prompt('Enter your phone number (e.g., +1234567890):'),
                    user_location: this.currentLocation,
                    emergency_contacts: [
                        {
                            name: 'Emergency Contact',
                            phone: '+15146605707',
                            relationship: 'Primary'
                        }
                    ],
                }),
            });

            const result = await response.json();

            if (result.success) {
                this.addMessage('ai', `VAPI call initiated! You should receive a call from ${result.stacyNumber} shortly. Call ID: ${result.callId}`);
            } else {
                this.addMessage('system', `Error initiating VAPI call: ${result.error}`);
            }
        } catch (error) {
            console.error('Error initiating VAPI call:', error);
            this.addMessage('system', 'Failed to initiate VAPI call');
        }
    }

    sendTextMessage(text = null) {
        const message = text || this.elements.textInput.value.trim();
        if (!message) return;

        this.addMessage('user', message);

        if (!text) {
            this.elements.textInput.value = '';
        }

        // Send to server
        this.sendMessage({
            type: 'text_message',
            payload: { message }
        });

        // Feed to risk engine
        bus.dispatchEvent(new CustomEvent('transcript', {
            detail: { text: message }
        }));

        // Update case file
        this.caseFileManager.addTimelineEvent(`User text: "${message}"`);
    }

    handleDistressAnalysis(payload) {
        if (payload) {
            const { distressLevel, detectedKeywords, transcript, score } = payload;

            console.log(`Distress Analysis: ${distressLevel}, Keywords: ${detectedKeywords?.join(', ') || 'none'}, Score: ${score}`);

            // Update safety system
            if (distressLevel === 'critical') {
                this.safetySystem.machine.onTrigger({ type: 'NOTIFY_NOW' });
            }

            // Update case file
            this.caseFileManager.update({
                danger_level: distressLevel,
                threat_info: detectedKeywords?.length > 0 ? {
                    description: `Keywords detected: ${detectedKeywords.join(', ')}`,
                    type: 'verbal_distress',
                    immediacy: distressLevel === 'critical' ? 'immediate' : 'developing'
                } : null
            });
        }
    }

    handleCaseFileUpdate(caseFile) {
        // Sync with local case file manager
        this.caseFileManager.update(caseFile);
    }

    handleToolExecution(payload) {
        const { tool, result } = payload;

        if (result.success) {
            this.addMessage('ai', `✅ ${tool} executed successfully`);
            if (result.messageId) {
                this.addMessage('system', `Message ID: ${result.messageId}`);
            }
        } else {
            this.addMessage('system', `❌ ${tool} failed: ${result.error}`);
        }
    }

    onSafetyStateChange(newState, prevState) {
        console.log(`Safety state changed: ${prevState} → ${newState}`);

        // Update case file
        this.caseFileManager.update({
            danger_level: newState.toLowerCase(),
        });

        // Update UI based on state
        this.updateUIForSafetyState(newState);
    }

    updateUIForSafetyState(state) {
        const body = document.body;
        body.className = body.className.replace(/safety-\w+/g, '');
        body.classList.add(`safety-${state.toLowerCase()}`);

        if (state === 'CRITICAL') {
            this.elements.emergencyButton.style.animation = 'pulse-urgent 1s infinite';
        } else {
            this.elements.emergencyButton.style.animation = '';
        }
    }

    setBanner(text) {
        this.elements.safetyBannerText.textContent = text;
        this.elements.safetyBanner.style.display = 'block';
    }

    showQuickReplies(replies) {
        this.elements.quickReplies.innerHTML = '';
        replies.forEach(reply => {
            const button = document.createElement('button');
            button.className = 'qr-button';
            button.setAttribute('data-text', reply);
            button.textContent = reply;
            this.elements.quickReplies.appendChild(button);
        });
        this.elements.quickReplies.style.display = 'flex';
    }

    renderRiskBar(risk) {
        this.elements.riskFill.style.width = `${risk}%`;

        // Update location risk component
        bus.dispatchEvent(new CustomEvent('location', {
            detail: this.currentLocation
        }));
    }

    injectStateContext(state, risk) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendMessage({
                type: 'state_context',
                payload: { state, risk, timestamp: Date.now() }
            });
        }
    }

    async notifyEmergencyContacts() {
        const contact = {
            name: 'Emergency Contact',
            phone: '+15146605707',
            relationship: 'Primary'
        };

        this.sendMessage({
            type: 'tool_call',
            payload: {
                tool: 'notify_emergency_contact',
                args: {
                    contact,
                    urgentMessage: 'Emergency situation detected by Stacy AI. Immediate assistance may be needed.'
                }
            }
        });
    }

    startEmergencyRecording() {
        if (!this.isRecording) {
            this.addMessage('system', '🎙️ Emergency recording started');
            // Auto-start recording in emergency
            this.startRecording();
        }
    }

    startSafeRouting() {
        if (this.currentLocation) {
            this.sendMessage({
                type: 'tool_call',
                payload: {
                    tool: 'get_safe_locations',
                    args: { radius: 1000 }
                }
            });
        }
    }

    finalizeIncident() {
        const caseFile = this.caseFileManager.exportForEmergency();
        console.log('Incident finalized:', caseFile);
        this.addMessage('system', `Incident ${caseFile.incident_id} has been documented and saved.`);
    }

    deleteData() {
        if (confirm('Are you sure you want to delete all session data? This cannot be undone.')) {
            // Reset case file
            this.caseFileManager = new CaseFileManager('new_session_' + Date.now());

            // Clear messages
            this.elements.messagesContainer.innerHTML = '<div class="welcome-message"><div class="ai-avatar">🤖</div><div class="message-content"><p>Hi, I\'m Stacy, your AI safety companion. I\'m here to help keep you safe.</p><p>Press and hold the microphone to talk to me about any situation where you feel unsafe.</p></div></div>';

            // Reset UI
            this.elements.safetyBanner.style.display = 'none';
            this.elements.riskFill.style.width = '0%';

            this.addMessage('system', 'All data has been deleted. Starting fresh session.');
        }
    }

    toggleMode() {
        this.mode = this.mode === 'webrtc' ? 'vapi' : 'webrtc';
        this.elements.modeToggle.textContent = this.mode === 'webrtc' ? '🎤 WebRTC Mode' : '📞 VAPI Mode';
        this.elements.modeToggle.className = `mode-button ${this.mode === 'webrtc' ? '' : 'text-mode'}`;

        this.addMessage('system', `Switched to ${this.mode.toUpperCase()} mode`);
    }

    // Enhanced location tracking
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

                this.updateLocationStatus('active', `Location: ±${Math.round(position.coords.accuracy)}m`);

                // Send location to server
                this.sendMessage({
                    type: 'location_shared',
                    payload: this.currentLocation
                });

                // Update case file
                this.caseFileManager.update({
                    location: {
                        lat: this.currentLocation.latitude,
                        lng: this.currentLocation.longitude,
                        precision_m: this.currentLocation.accuracy,
                        description: `GPS location (±${Math.round(this.currentLocation.accuracy)}m)`
                    }
                });

                // Start watching position
                navigator.geolocation.watchPosition(
                    (position) => {
                        this.currentLocation = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            timestamp: Date.now()
                        };

                        this.updateLocationStatus('active', `Location: ±${Math.round(position.coords.accuracy)}m`);

                        // Feed to risk engine
                        bus.dispatchEvent(new CustomEvent('location', {
                            detail: { precision_m: position.coords.accuracy }
                        }));
                    },
                    (error) => {
                        console.error('Location tracking error:', error);
                        this.updateLocationStatus('error', 'Location Error');
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 30000
                    }
                );

            } catch (error) {
                console.error('Location permission denied:', error);
                this.updateLocationStatus('error', 'Location Denied');
                this.addMessage('system', 'Location access denied. Some safety features may be limited.');
            }
        } else {
            console.error('Geolocation not supported');
            this.updateLocationStatus('error', 'No GPS');
            this.addMessage('system', 'Location services not available on this device.');
        }
    }

    updateLocationStatus(status, text) {
        const locationDot = this.elements.locationStatus.querySelector('.location-dot');
        const locationText = this.elements.locationStatus.querySelector('span');

        locationDot.className = `location-dot ${status}`;
        locationText.textContent = text;
    }

    // Inherit other methods from original StacyClient
    updateConnectionStatus(status, text) {
        const statusDot = this.elements.connectionStatus.querySelector('.status-dot');
        const statusText = this.elements.connectionStatus.querySelector('span');

        statusDot.className = `status-dot ${status}`;
        statusText.textContent = text;
    }

    async startRecording() {
        if (!this.isConnected || this.isRecording) return;

        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 24000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            await this.setupAudioProcessing();
            this.isRecording = true;

            this.elements.micButton.classList.add('recording');
            this.elements.micButton.querySelector('.mic-status').textContent = 'Recording...';
            this.elements.audioVisualizer.classList.add('active');

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
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });

            this.sourceNode = this.audioContext.createMediaStreamSource(this.audioStream);
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

                    // Calculate RMS for prosody analysis
                    const rms = Math.sqrt(inputData.reduce((sum, sample) => sum + sample * sample, 0) / inputData.length);
                    bus.dispatchEvent(new CustomEvent('prosody', {
                        detail: { rms, zcr: 0.5, speechRate: 1.0 }
                    }));
                }
            };

            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);

        } catch (error) {
            console.error('Error setting up audio processing:', error);
            throw error;
        }
    }

    stopRecording() {
        if (!this.isRecording) return;

        try {
            this.isRecording = false;

            if (this.audioBuffer.length > 0) {
                this.sendAudioBuffer();
            }

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

            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }

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
            const totalLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Int16Array(totalLength);

            let offset = 0;
            for (const chunk of this.audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            const bytes = new Uint8Array(combinedBuffer.buffer);
            const base64Audio = btoa(String.fromCharCode(...bytes));

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
        console.log('Received audio response from AI');
    }

    triggerEmergency() {
        this.showEmergencyModal();

        this.sendMessage({
            type: 'emergency_trigger',
            payload: {
                location: this.currentLocation,
                emergencyType: 'manual_trigger',
                timestamp: Date.now()
            }
        });

        // Trigger safety system
        this.safetySystem.machine.onTrigger({ type: 'NOTIFY_NOW' });
    }

    showEmergencyModal() {
        this.elements.emergencyModal.style.display = 'flex';
        this.updateLocationInModal();
    }

    closeEmergencyModal() {
        this.elements.emergencyModal.style.display = 'none';
    }

    shareLocation() {
        if (!this.currentLocation) {
            this.addMessage('system', 'Location not available. Please enable location services.');
            return;
        }

        const locationText = `📍 Current location: ${this.currentLocation.latitude.toFixed(6)}, ${this.currentLocation.longitude.toFixed(6)}`;
        this.addMessage('user', 'Sharing my location');
        this.addMessage('ai', locationText);

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
        window.location.href = 'tel:911';
        this.addMessage('system', 'Initiating call to emergency services...');
    }

    async textEmergencyContact() {
        try {
            const response = await fetch('/api/stacy/mobile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'quick_alert',
                    location: this.currentLocation,
                    message: 'Emergency alert from Stacy. I need help.',
                    emergency_contact: {
                        name: 'Emergency Contact',
                        phone: '+15146605707',
                        relationship: 'Primary'
                    }
                }),
            });

            const result = await response.json();

            if (result.success) {
                this.addMessage('system', `Emergency text sent! Message ID: ${result.messageId}`);
            } else {
                this.addMessage('system', `Failed to send emergency text: ${result.error}`);
            }
        } catch (error) {
            console.error('Error sending emergency text:', error);
            this.addMessage('system', 'Failed to send emergency text');
        }
    }

    findSafeLocation() {
        if (!this.currentLocation) {
            this.addMessage('system', 'Location required to find safe places nearby.');
            return;
        }

        const mapsUrl = `https://www.google.com/maps/search/police+station+hospital+cafe/@${this.currentLocation.latitude},${this.currentLocation.longitude},15z`;
        window.open(mapsUrl, '_blank');
        this.addMessage('ai', 'Opening map to show nearby safe locations...');
    }

    updateUIFromCaseFile(caseFile) {
        // Update UI elements based on case file changes
        if (caseFile.danger_level) {
            this.updateUIForSafetyState(caseFile.danger_level.toUpperCase());
        }
    }
}

// Initialize the enhanced Stacy client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.stacyClient = new EnhancedStacyClient();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.stacyClient) {
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

export { EnhancedStacyClient };

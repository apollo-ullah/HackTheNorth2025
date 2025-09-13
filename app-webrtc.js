class StacyWebRTCClient {
    constructor() {
        this.pc = null;
        this.dc = null;
        this.micStream = null;
        this.isConnected = false;
        this.isListening = false;
        this.remoteAudio = null;
        this.statusDot = null;
        this.statusText = null;
        this.micButton = null;
        this.audioVisualizer = null;
        this.messagesContainer = null;
    }

    async init() {
        this.statusDot = document.querySelector('#connectionStatus .status-dot');
        this.statusText = document.querySelector('#connectionStatus span');
        this.micButton = document.getElementById('micButton');
        this.audioVisualizer = document.getElementById('audioVisualizer');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.textInput = document.getElementById('textInput');
        this.sendTextBtn = document.getElementById('sendTextBtn');
        this.quickReplies = document.getElementById('quickReplies');
        this.locationStatus = document.getElementById('locationStatus');
        this.locationDot = document.querySelector('#locationStatus .location-dot');
        this.locationText = document.querySelector('#locationStatus span');
        this.modeToggle = document.getElementById('modeToggle');
        this.deleteDataButton = document.getElementById('deleteDataButton');
        this.levelState = { ctx: null, analyser: null, src: null, data: null, raf: 0, prev: 0, zcrBuf: [] };
        this.assistantSpeaking = false;
        this.voiceActive = false;
        this.voiceOnFrames = 0;
        this.voiceOffFrames = 0;
        this.noiseFloor = 0.04; // adaptive baseline
        this.safety = null; // safety system handle
        this.sessionId = null; // for case file tracking
        this.currentLocation = null; // live location data
        this.locationWatchId = null; // geolocation watch ID
        this.lastUserActivity = Date.now(); // track user engagement
        this.conversationTimeout = null; // proactive check-in timer
        this.silenceCheckInterval = null; // regular silence monitoring
        this.lastLocationUpdate = 0; // throttle location updates
        this.lastSentLocation = null; // track location changes
        this.hasSharedLocationWithStacy = false; // track if location shared with AI
        this.textMode = false; // toggle between voice and text modes
        this.modeToggle = null; // mode toggle button
        this.realtimeConnectionPaused = false; // track if WebRTC is paused
        this.originalMicStream = null; // store original stream for restoration
        this.lastTurn = { toolCalled: false, questionAsked: false }; // compliance monitoring
        this.lastAssistantText = ''; // track assistant responses
        this.turnCount = 0; // for periodic reminders

        // Create a hidden audio element for remote playback
        this.remoteAudio = document.createElement('audio');
        this.remoteAudio.autoplay = true;
        document.body.appendChild(this.remoteAudio);

        this.updateStatus('connecting', 'Connecting...');

        // Request location access
        await this.requestLocationAccess();

        try {
            // Prepare mic
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
            });
            this.originalMicStream = this.micStream; // Store original stream

            // Create peer connection
            this.pc = new RTCPeerConnection();
            this.pc.onconnectionstatechange = () => {
                if (this.pc.connectionState === 'connected') {
                    this.updateStatus('connected', 'Connected');
                }
            };
            this.pc.ontrack = (e) => {
                this.remoteAudio.srcObject = e.streams[0];
            };

            // Add mic track
            this.micStream.getTracks().forEach(t => this.pc.addTrack(t, this.micStream));
            // Setup audio level meter
            this.setupLevelMeter();

            // Data channel for events (optional but useful)
            this.dc = this.pc.createDataChannel('oai-events');
            this.dc.onmessage = (ev) => this.handleDataMessage(ev);
            this.dc.onopen = () => {
                // Configure session for dispatcher mode
                const update = {
                    type: 'session.update',
                    session: {
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.7,           // higher = less sensitive
                            prefix_padding_ms: 250,
                            silence_duration_ms: 350
                        },
                        max_response_output_tokens: 120  // Keep responses terse
                    }
                };
                try { this.dc.send(JSON.stringify(update)); } catch { }
            };

            // Create local offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            // Get ephemeral session
            const sessionResp = await fetch('/api/token', { method: 'POST' });
            const session = await sessionResp.json();
            const ephemeral = session?.client_secret?.value || session?.client_secret || session?.value;
            const model = encodeURIComponent(session.model || 'gpt-realtime');
            this.sessionId = session.session_id; // Store for case file tracking
            if (!ephemeral) throw new Error('Missing ephemeral client token');

            // Exchange SDP with the correct WebRTC endpoint
            const sdpResp = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ephemeral}`,
                    'Content-Type': 'application/sdp',
                    'OpenAI-Beta': 'realtime=v1'
                },
                body: offer.sdp
            });

            const answerSdp = await sdpResp.text();
            if (!answerSdp.startsWith('v=')) {
                throw new Error('Expected SDP answer, got: ' + answerSdp.slice(0, 80));
            }

            await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

            this.isConnected = true;
            this.micButton.disabled = false;
            this.micButton.querySelector('.mic-status').textContent = 'Click to Talk';
            this.updateStatus('connected', 'Connected');

            // Start proactive conversation monitoring
            this.startConversationMonitoring();

            // Setup mode toggle
            this.setupModeToggle();

            // Setup delete data button
            this.setupDeleteButton();

            // Wire mic button: toggle listening (mute/unmute sending track)
            this.micButton.onclick = () => this.toggleListening();
            if (this.sendTextBtn) this.sendTextBtn.onclick = () => this.sendTypedMessage();
            if (this.textInput) this.textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.sendTypedMessage();
            });
            if (this.quickReplies) {
                this.quickReplies.addEventListener('click', (e) => {
                    const btn = e.target.closest('.qr-button');
                    if (btn) {
                        this.textInput.value = btn.dataset.text || btn.textContent;
                        this.markUserActivity(); // Track quick reply as activity
                        this.sendTypedMessage();
                    }
                });
            }
            // Start in text mode to save costs
            this.isListening = false;
            this.textMode = true;
            this.setMicEnabled();
            this.micButton.classList.remove('recording');
            this.micButton.querySelector('.mic-status').textContent = 'Click for Voice Mode';
            this.audioVisualizer.classList.remove('active');

            // Show initial message about text mode
            this.addMessage('system', '💬 Starting in text mode to save costs. Click the mic or mode button for voice.');

            // Initialize safety system (lazy import)
            await this.initSafetySystem();

        } catch (err) {
            console.error('Failed to init WebRTC:', err);
            this.updateStatus('disconnected', 'Connection Failed');
            this.addMessage('system', 'Failed to connect. Check console for details.');
        }
    }

    async initSafetySystem() {
        try {
            const safetyMod = await import('./safety/signals-wireup.js');
            const ui = {
                setBanner: (text) => {
                    const b = document.getElementById('safetyBanner');
                    const t = document.getElementById('safetyBannerText');
                    if (!b || !t) return;
                    t.textContent = text;
                    b.style.display = 'block';
                },
                showQuickReplies: () => {
                    if (this.quickReplies) this.quickReplies.style.display = 'flex';
                },
                renderRiskBar: (risk) => {
                    const fill = document.getElementById('riskFill');
                    if (fill) fill.style.width = `${Math.round(risk)}%`;
                },
                injectStateContext: (state, risk) => this.injectStateContext(state, risk),
                onStateChange: (next, prev) => this.handleStateChange(next, prev)
            };
            const effects = {
                notifyContactsIfNotYet: () => { },
                startRollingAudioIfNotYet: () => { },
                startRoutingIfNotYet: () => { },
                finalizeIncidentOnce: () => { }
            };
            this.safety = safetyMod.createSafetySystem(ui, effects);
            this.safetyBus = safetyMod.bus;
        } catch (e) {
            console.warn('Safety system failed to init:', e);
        }
    }

    setupLevelMeter() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.levelState.ctx = new AudioCtx();
            this.levelState.src = this.levelState.ctx.createMediaStreamSource(this.micStream);
            this.levelState.analyser = this.levelState.ctx.createAnalyser();
            this.levelState.analyser.fftSize = 1024;
            this.levelState.data = new Uint8Array(this.levelState.analyser.frequencyBinCount);
            this.levelState.src.connect(this.levelState.analyser);

            const animate = () => {
                this.levelState.analyser.getByteTimeDomainData(this.levelState.data);
                // Compute RMS
                let sum = 0;
                const N = this.levelState.data.length;
                let prevSign = 0; let zc = 0;
                for (let i = 0; i < N; i++) {
                    const v = (this.levelState.data[i] - 128) / 128; // -1..1
                    sum += v * v;
                    const sign = v >= 0 ? 1 : -1;
                    if (i > 0 && sign !== prevSign) zc++;
                    prevSign = sign;
                }
                const rms = Math.sqrt(sum / N); // 0..1
                const zcr = zc / N; // 0..1, whispers have higher ZCR than hums/breaths

                // Adaptive noise floor (track slowly when below gate)
                const floorAlpha = 0.01;
                if (!this.voiceActive && !this.assistantSpeaking) {
                    this.noiseFloor = (1 - floorAlpha) * this.noiseFloor + floorAlpha * rms;
                }

                // Smooth with attack/release
                const attack = 0.35;   // faster rise
                const release = 0.1;   // slower fall
                const prev = this.levelState.prev || 0;
                const smooth = rms > prev ? (attack * rms + (1 - attack) * prev)
                    : (release * rms + (1 - release) * prev);
                this.levelState.prev = smooth;

                // Noise gate with hysteresis
                // On/Off thresholds are relative to noise floor to preserve whispers
                const onThresh = Math.max(0.06, this.noiseFloor + 0.04);
                const offThresh = Math.max(0.045, this.noiseFloor + 0.02);

                if (smooth >= onThresh) {
                    this.voiceOnFrames++;
                    this.voiceOffFrames = 0;
                } else if (smooth <= offThresh) {
                    this.voiceOffFrames++;
                    this.voiceOnFrames = 0;
                }

                // Whisper-aware duration: require slightly longer sustained energy unless ZCR is high
                const isWhisper = zcr > 0.13 && rms > this.noiseFloor + 0.015;
                const onFramesNeeded = isWhisper ? 4 : 3;
                const offFramesNeeded = 6; // tolerate brief gaps
                if (!this.voiceActive && this.voiceOnFrames >= onFramesNeeded) this.voiceActive = true;
                if (this.voiceActive && this.voiceOffFrames >= offFramesNeeded) this.voiceActive = false;

                // Map to UI scale
                const min = Math.max(0.04, this.noiseFloor + 0.005);
                const max = 0.35;
                const clamped = Math.max(min, Math.min(max, smooth));
                const t = (clamped - min) / (max - min);
                const scale = this.voiceActive ? (1 + t * 0.18) : 1.02;

                if (this.isListening) {
                    this.micButton.style.transform = `scale(${scale.toFixed(3)})`;
                    if (this.voiceActive) this.micButton.classList.add('speaking');
                    else this.micButton.classList.remove('speaking');
                    this.audioVisualizer.style.transform = `scaleY(${1 + (this.voiceActive ? t * 0.4 : 0)})`;
                    // Prosody to safety
                    if (this.safetyBus) {
                        const speechRate = t * 100;
                        this.safetyBus.dispatchEvent(new CustomEvent('prosody', { detail: { rms: smooth, zcr, speechRate } }));
                    }
                } else {
                    this.micButton.style.transform = 'scale(1)';
                    this.micButton.classList.remove('speaking');
                    this.audioVisualizer.style.transform = 'scaleY(1)';
                }

                this.levelState.raf = requestAnimationFrame(animate);
            };
            this.levelState.raf = requestAnimationFrame(animate);
        } catch (e) {
            console.warn('Audio level meter unavailable:', e);
        }
    }

    handleDataMessage(ev) {
        // Try parse JSON, log deltas, show final text
        try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'response.created') {
                // Start of assistant turn – proactively gate mic
                if (!this.assistantSpeaking) {
                    this.assistantSpeaking = true;
                    this.setMicEnabled();
                }
            } else if (msg.type === 'response.output_text.delta') {
                // streaming text
                this.ensurePartialBubble();
                const delta = msg.delta || msg.text_delta || '';
                if (delta) {
                    this.partialContent.textContent = (this.partialContent.textContent || '') + delta;
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                }
            } else if (msg.type === 'response.output_text.done') {
                const text = msg.text || msg.output_text || '';
                if (text) this.addMessage('ai', text);
                if (this.partialDiv) {
                    this.partialDiv.remove();
                    this.partialDiv = null;
                    this.partialContent = null;
                }
            } else if (msg.type === 'response.audio_transcript.delta') {
                // streaming transcript while audio plays
                this.ensurePartialBubble();
                const delta = msg.delta || msg.text_delta || '';
                if (delta) {
                    this.partialContent.textContent = (this.partialContent.textContent || '') + delta;
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                }
            } else if (msg.type === 'response.audio_transcript.done') {
                const text = msg.transcript || '';
                if (text) this.addMessage('ai', text);
                if (this.partialDiv) {
                    this.partialDiv.remove();
                    this.partialDiv = null;
                    this.partialContent = null;
                }
                // After Stacy speaks, reveal quick replies if a safety question is likely
                this.maybeShowQuickReplies(text);
            } else if (msg.type === 'response.audio.delta') {
                // Assistant started/continuing speaking
                if (!this.assistantSpeaking) {
                    this.assistantSpeaking = true;
                    this.setMicEnabled();
                }
            } else if (msg.type === 'response.audio.done' || msg.type === 'response.done') {
                // Assistant finished speaking
                if (this.assistantSpeaking) {
                    this.assistantSpeaking = false;
                    this.setMicEnabled();
                }

                // Check compliance after response completes
                this.checkComplianceAndNudge();
            } else if (msg.type === 'input_audio_buffer.speech_started') {
                // If a cough occurs, keep gating if assistant is speaking
                if (this.assistantSpeaking) {
                    this.setMicEnabled();
                }
            } else if (msg.type?.includes('transcription')) {
                const text = msg.transcript || msg.item?.content?.[0]?.transcript || '';
                if (text) {
                    this.addMessage('user', `"${text}"`);
                    this.markUserActivity(); // Reset conversation timers
                }
                if (this.safetyBus && text) {
                    this.safetyBus.dispatchEvent(new CustomEvent('transcript', { detail: { text } }));
                }
            } else if (msg.type === 'response.function_call_delta' || msg.type === 'response.function_call_arguments.delta') {
                // Handle tool call streaming
                console.log('Tool call delta:', msg);
            } else if (msg.type === 'response.function_call_done' || msg.type === 'response.function_call_arguments.done') {
                // Handle completed tool call - Realtime API uses function_call_arguments.done
                console.log('🔧 Function call completed:', msg);
                this.handleRealtimeToolCall(msg);
                this.lastTurn.toolCalled = true;
            } else if (msg.type?.includes('function') || msg.type?.includes('tool')) {
                // Debug: Log any function/tool related events
                console.log('🔍 Function/tool event:', msg.type, msg);
            } else {
                // Debug: Log all unknown events to find tool calls
                console.log('🔍 Unknown event type:', msg.type);
            }
        } catch {
            // Non-JSON events
        }
    }

    ensurePartialBubble() {
        if (this.partialDiv) return;
        this.partialDiv = document.createElement('div');
        this.partialDiv.className = 'ai-message';
        const avatar = document.createElement('div');
        avatar.className = 'ai-avatar';
        avatar.textContent = '🤖';
        const content = document.createElement('div');
        content.className = 'message-content';
        this.partialContent = document.createElement('p');
        content.appendChild(this.partialContent);
        this.partialDiv.appendChild(avatar);
        this.partialDiv.appendChild(content);
        this.messagesContainer.appendChild(this.partialDiv);
    }

    async sendTypedMessage() {
        const text = (this.textInput?.value || '').trim();
        if (!text) return;

        // show user bubble
        this.addMessage('user', text);
        this.textInput.value = '';
        this.markUserActivity(); // Reset conversation timers

        // Check for missing fields after user input
        this.injectMissingFieldsCue();

        if (this.textMode) {
            // Use cheaper text API when in text mode
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        message: text,
                        location: this.currentLocation
                    })
                });

                const data = await response.json();
                if (data.reply) {
                    if (data.fallback) {
                        this.addMessage('ai', `🛡️ ${data.reply}`);
                        this.addMessage('system', '⚠️ Running in safety fallback mode (API quota exceeded)');
                        console.log('🛡️ Fallback safety response provided');
                    } else {
                        this.addMessage('ai', data.reply);
                        console.log('💬 Text API response received (cost-effective)');

                        // Show tool results if any
                        if (data.tool_results && data.tool_results.length > 0) {
                            data.tool_results.forEach(({ tool, result, error }) => {
                                if (error) {
                                    this.addMessage('system', `❌ ${tool} failed: ${error}`);
                                } else {
                                    switch (tool) {
                                        case 'casefile_update':
                                            this.addMessage('system', '📋 Case file updated');
                                            break;
                                        case 'notify_emergency_contact':
                                            this.addMessage('system', `🚨 Emergency contact notified: ${result.contact}`);
                                            break;
                                        case 'send_contact_sms':
                                            this.addMessage('system', `📱 SMS sent: ${result.sms_sid}`);
                                            break;
                                        case 'call_demo_emergency':
                                            this.addMessage('system', `📞 Demo emergency call: ${result.call_sid}`);
                                            break;
                                    }
                                }
                            });
                        }
                    }
                } else {
                    this.addMessage('system', '❌ Failed to get response');
                }
            } catch (e) {
                console.warn('Text API failed:', e);
                this.addMessage('system', '❌ Connection error - try voice mode');
            }
        } else {
            // Use Realtime API when in voice mode
            if (!this.dc || this.dc.readyState !== 'open') {
                this.addMessage('system', '❌ Voice connection not ready - try text mode');
                return;
            }

            try {
                this.dc.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [{ type: 'input_text', text }]
                    }
                }));
                this.dc.send(JSON.stringify({ type: 'response.create' }));
            } catch (e) {
                console.error('Failed to send to Realtime API:', e);
            }
        }

        this.hideQuickReplies();
    }

    maybeShowQuickReplies(lastAssistantText) {
        if (!this.quickReplies) return;
        const t = (lastAssistantText || '').toLowerCase();
        const triggers = ['immediate danger', 'speak safely', 'able to speak', 'are you safe'];
        const shouldShow = triggers.some(k => t.includes(k));
        this.quickReplies.style.display = shouldShow ? 'flex' : 'none';
    }

    hideQuickReplies() {
        if (this.quickReplies) this.quickReplies.style.display = 'none';
    }

    async handleToolCall(msg) {
        const { name, call_id, arguments: args } = msg;
        console.log(`🔧 Tool call: ${name}`, args);

        try {
            let result;

            switch (name) {
                case 'casefile_update':
                    result = await this.updateCaseFile(args);
                    break;
                case 'send_contact_sms':
                    result = await this.sendContactSMS(args);
                    break;
                case 'place_phone_call':
                    result = await this.placePhoneCall(args);
                    break;
                case 'get_safe_locations':
                    result = await this.getSafeLocations(args);
                    break;
                case 'notify_emergency_contact':
                    result = await this.notifyEmergencyContact(args);
                    break;
                case 'call_demo_emergency':
                    result = await this.callDemoEmergency(args);
                    break;
                default:
                    result = { error: `Unknown tool: ${name}` };
            }

            // Send tool result back to the model
            if (this.dc && this.dc.readyState === 'open') {
                this.dc.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id,
                        output: JSON.stringify(result)
                    }
                }));
            }

        } catch (error) {
            console.error(`Tool call error for ${name}:`, error);

            // Send error back to model
            if (this.dc && this.dc.readyState === 'open') {
                this.dc.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id,
                        output: JSON.stringify({ error: error.message })
                    }
                }));
            }
        }
    }

    async handleRealtimeToolCall(msg) {
        // Handle Realtime API tool call format
        const toolName = msg.name;
        const callId = msg.call_id;
        let args = {};

        try {
            // Parse arguments from the message
            args = JSON.parse(msg.arguments || '{}');
        } catch (e) {
            console.error('Failed to parse tool arguments:', msg.arguments);
            args = {};
        }

        console.log(`🔧 Realtime tool call: ${toolName}`, args);

        try {
            let result;

            switch (toolName) {
                case 'casefile_update':
                    result = await this.updateCaseFile(args);
                    break;
                case 'notify_emergency_contact':
                    result = await this.notifyEmergencyContact(args);
                    break;
                case 'send_contact_sms':
                    result = await this.sendContactSMS(args);
                    break;
                case 'place_phone_call':
                    result = await this.placePhoneCall(args);
                    break;
                case 'get_safe_locations':
                    result = await this.getSafeLocations(args);
                    break;
                case 'call_demo_emergency':
                    result = await this.callDemoEmergency(args);
                    break;
                default:
                    result = { error: `Unknown tool: ${toolName}` };
            }

            // Send tool result back to the Realtime model
            if (this.dc && this.dc.readyState === 'open') {
                this.dc.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify(result)
                    }
                }));
                console.log(`✅ Tool result sent back to Realtime API: ${toolName}`);
            }

        } catch (error) {
            console.error(`Tool call error for ${toolName}:`, error);

            // Send error back to model
            if (this.dc && this.dc.readyState === 'open') {
                this.dc.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ error: error.message })
                    }
                }));
            }
        }
    }

    async updateCaseFile(updates) {
        try {
            const response = await fetch(`/api/casefile/${this.sessionId}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            const data = await response.json();

            // Show case file update in UI
            this.addMessage('system', `📋 Case file updated: ${Object.keys(updates).join(', ')}`);

            return data;
        } catch (error) {
            console.error('Case file update failed:', error);
            return { error: error.message };
        }
    }

    async sendContactSMS(args) {
        try {
            // Auto-include current location if not provided
            const smsData = {
                ...args,
                lat: args.lat || this.currentLocation?.lat,
                lng: args.lng || this.currentLocation?.lng,
                sessionId: this.sessionId
            };

            if (!smsData.lat || !smsData.lng) {
                console.warn('No location available for SMS');
                return { error: 'Location not available' };
            }

            const response = await fetch('/api/action/sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(smsData)
            });
            const data = await response.json();

            // Show action in UI with location info
            this.addMessage('system', `📱 ${data.message} (Location: ${smsData.lat.toFixed(4)}, ${smsData.lng.toFixed(4)})`);

            return data;
        } catch (error) {
            console.error('SMS action failed:', error);
            return { error: error.message };
        }
    }

    async placePhoneCall(args) {
        try {
            const response = await fetch('/api/action/call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...args, sessionId: this.sessionId })
            });
            const data = await response.json();

            // Show action in UI
            this.addMessage('system', `📞 ${data.message}`);

            return data;
        } catch (error) {
            console.error('Call action failed:', error);
            return { error: error.message };
        }
    }

    async getSafeLocations(args) {
        try {
            // Auto-include current location if not provided
            const locationData = {
                ...args,
                lat: args.lat || this.currentLocation?.lat,
                lng: args.lng || this.currentLocation?.lng,
                sessionId: this.sessionId
            };

            if (!locationData.lat || !locationData.lng) {
                console.warn('No location available for safe location search');
                return { error: 'Location not available' };
            }

            const response = await fetch('/api/action/safe-locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(locationData)
            });
            const data = await response.json();

            // Show locations in UI
            if (data.locations && data.locations.length > 0) {
                const locationsList = data.locations.map(loc =>
                    `${loc.name} (${loc.distance}m)`
                ).join(', ');
                this.addMessage('system', `📍 Safe locations nearby: ${locationsList}`);
            }

            return data;
        } catch (error) {
            console.error('Safe locations failed:', error);
            return { error: error.message };
        }
    }

    async notifyEmergencyContact(args) {
        try {
            const response = await fetch('/api/emergency/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    userName: args.user_name || 'User',
                    triggerReason: args.trigger_reason
                })
            });
            const data = await response.json();

            // Show comprehensive action in UI
            if (data.success) {
                this.addMessage('system', `🚨 Emergency contact notified: ${data.contact}`);
                if (data.call_sid) {
                    this.addMessage('system', `📞 Emergency call placed: ${data.call_sid}`);
                }
                this.addMessage('system', `📋 Full incident report sent with case file`);
            } else {
                this.addMessage('system', `❌ Emergency notification failed: ${data.message}`);
            }

            return data;
        } catch (error) {
            console.error('Emergency notification failed:', error);
            return { error: error.message };
        }
    }

    async callDemoEmergency(args) {
        try {
            // Use user's actual phone number if not provided
            const userPhone = args.user_phone || '+15146605707'; // Fallback to your number

            const response = await fetch('/api/emergency/call-demo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    userName: args.user_name || 'User',
                    userPhone: userPhone,
                    canUserSpeak: args.can_user_speak !== false
                })
            });
            const data = await response.json();

            // Show demo emergency briefing status
            if (data.success) {
                this.addMessage('system', `🚨 Demo emergency briefing call initiated: ${data.call_sid}`);
                this.addMessage('system', `📞 Conference room: ${data.conference_id}`);
                this.addMessage('ai', 'I\'ve called demo emergency services and briefed them on your situation. They\'re standing by.');

                // Show connect button if user can speak
                if (args.can_user_speak !== false && !args.immediate_connect) {
                    this.showConnectToDemoEmergencyButton(userPhone);
                } else if (args.immediate_connect) {
                    // Auto-connect user
                    setTimeout(() => this.connectUserToDemoEmergency(userPhone), 3000);
                }
            } else {
                this.addMessage('system', `❌ Demo emergency call failed: ${data.message}`);
                if (data.fallback) {
                    this.addMessage('system', `📱 Emergency contact notified as fallback`);
                }
            }

            return data;
        } catch (error) {
            console.error('Demo emergency briefing failed:', error);
            return { error: error.message };
        }
    }

    showConnectToDemoEmergencyButton(userPhone) {
        // Add a special "Connect to Demo Emergency" button
        const connectButton = document.createElement('button');
        connectButton.className = 'connect-911-btn';
        connectButton.innerHTML = '📞 Connect Me to Demo Emergency Now';
        connectButton.onclick = () => {
            this.connectUserToDemoEmergency(userPhone);
            connectButton.remove();
        };

        // Add to quick replies area
        if (this.quickReplies) {
            this.quickReplies.innerHTML = '';
            this.quickReplies.appendChild(connectButton);
            this.quickReplies.style.display = 'flex';
        }

        this.addMessage('system', '📞 Click "Connect Me to Demo Emergency Now" when you\'re ready to speak');
    }

    async connectUserToDemoEmergency(userPhone) {
        try {
            const response = await fetch('/api/emergency/join-demo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    userPhone: userPhone
                })
            });

            const data = await response.json();

            if (data.success) {
                this.addMessage('system', `📞 Connecting you to demo emergency: ${data.user_call_sid}`);
                this.addMessage('ai', 'You\'re now connected to demo emergency services. They\'ve been briefed on your situation.');
            } else {
                this.addMessage('system', `❌ Failed to connect to demo emergency: ${data.message}`);
            }

            return data;
        } catch (error) {
            console.error('Failed to connect to demo emergency:', error);
            this.addMessage('system', '❌ Connection to demo emergency failed');
            return { error: error.message };
        }
    }

    updateStatus(state, text) {
        if (!this.statusDot || !this.statusText) return;
        this.statusDot.className = `status-dot ${state}`;
        this.statusText.textContent = text;
    }

    updateLocationStatus(state, text) {
        if (!this.locationDot || !this.locationText) return;
        this.locationDot.className = `location-dot ${state}`;
        this.locationText.textContent = text;
    }

    async toggleListening() {
        if (!this.micStream) return;

        this.isListening = !this.isListening;
        this.textMode = !this.isListening; // Switch to text mode when not listening

        // Mark activity when user starts talking
        if (this.isListening) {
            this.markUserActivity();
        }

        if (this.isListening) {
            // Voice mode: resume realtime API connection
            this.micButton.classList.add('recording');
            this.micButton.querySelector('.mic-status').textContent = 'Resuming...';
            this.audioVisualizer.classList.add('active');

            // Resume Realtime connection
            this.resumeRealtimeConnection().then(() => {
                this.micButton.querySelector('.mic-status').textContent = 'Listening...';
                this.setMicEnabled();
            });

            // Update mode toggle
            this.modeToggle.textContent = '🎤 Voice Mode';
            this.modeToggle.classList.remove('text-mode');

            console.log('🎤 Voice mode activated - Realtime API resuming');
        } else {
            // Text mode: completely disconnect from Realtime API to stop costs
            this.micButton.classList.remove('recording');
            this.micButton.querySelector('.mic-status').textContent = 'Text Mode - Type Below';
            this.audioVisualizer.classList.remove('active');

            // Update mode toggle
            this.modeToggle.textContent = '💬 Text Mode';
            this.modeToggle.classList.add('text-mode');

            // Completely close WebRTC connection to stop API usage
            this.pauseRealtimeConnection();

            // Show text input area
            this.addMessage('system', '💬 Switched to text mode. WebRTC connection paused to save API costs.');

            console.log('💬 Text mode activated - Realtime connection paused');
        }
    }

    setMicEnabled() {
        if (!this.micStream || this.realtimeConnectionPaused) return;

        const enabled = this.isListening && !this.assistantSpeaking;

        // Enable/disable tracks normally when connection is active
        this.micStream.getAudioTracks().forEach(t => {
            t.enabled = enabled;
        });
    }

    addMessage(sender, text) {
        const div = document.createElement('div');
        div.className = `${sender}-message`;
        const avatar = document.createElement('div');
        avatar.className = `${sender}-avatar`;
        avatar.textContent = sender === 'ai' ? '🤖' : sender === 'user' ? '👤' : '⚠️';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `<p>${text}</p>`;
        div.appendChild(avatar);
        div.appendChild(content);
        this.messagesContainer.appendChild(div);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async requestLocationAccess() {
        try {
            console.log('📍 Requesting location access...');

            if (!navigator.geolocation) {
                console.warn('Geolocation is not supported by this browser');
                return;
            }

            // Get initial position
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                });
            });

            this.updateLocation(position);
            this.updateLocationStatus('active', `Location: ±${Math.round(position.coords.accuracy)}m`);
            console.log('📍 Initial location obtained');

            // Start watching for location changes
            this.locationWatchId = navigator.geolocation.watchPosition(
                (position) => this.updateLocation(position),
                (error) => console.warn('Location watch error:', error),
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 30000
                }
            );

            console.log('📍 Location tracking started');

        } catch (error) {
            console.warn('Location access denied or failed:', error);
            this.updateLocationStatus('error', 'Location: Access denied');
            // Show a user-friendly message
            this.addMessage('system', '📍 Location access is helpful for safety features. You can enable it in browser settings.');
        }
    }

    updateLocation(position) {
        const { latitude, longitude, accuracy } = position.coords;

        this.currentLocation = {
            lat: latitude,
            lng: longitude,
            precision_m: Math.round(accuracy),
            timestamp: new Date().toISOString(),
            description: null // Will be filled by reverse geocoding if needed
        };

        console.log(`📍 Location updated: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`);

        // Update UI
        this.updateLocationStatus('active', `Location: ±${Math.round(accuracy)}m`);

        // Update case file with new location if we have a session (but throttle to avoid spam)
        if (this.sessionId && this.currentLocation) {
            // Only update if location changed significantly (>10m) or it's been >60 seconds
            const shouldUpdate = !this.lastLocationUpdate ||
                Date.now() - this.lastLocationUpdate > 60000 ||
                this.getLocationDistance(this.lastSentLocation, this.currentLocation) > 10;

            if (shouldUpdate) {
                this.updateCaseFile({
                    location: this.currentLocation
                }).catch(e => console.warn('Failed to update location in case file:', e));
                this.lastLocationUpdate = Date.now();
                this.lastSentLocation = { ...this.currentLocation };

                // Also send location context to Stacy if this is the first location update
                if (!this.hasSharedLocationWithStacy && this.dc && this.dc.readyState === 'open') {
                    this.sendLocationContextToStacy();
                    this.hasSharedLocationWithStacy = true;
                }
            }
        }

        // Emit location event for safety system
        if (this.safetyBus) {
            this.safetyBus.dispatchEvent(new CustomEvent('location', {
                detail: this.currentLocation
            }));
        }
    }

    getCurrentLocation() {
        return this.currentLocation;
    }

    // Calculate distance between two locations in meters
    getLocationDistance(loc1, loc2) {
        if (!loc1 || !loc2) return Infinity;

        const R = 6371e3; // Earth's radius in meters
        const φ1 = loc1.lat * Math.PI / 180;
        const φ2 = loc2.lat * Math.PI / 180;
        const Δφ = (loc2.lat - loc1.lat) * Math.PI / 180;
        const Δλ = (loc2.lng - loc1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    sendLocationContextToStacy() {
        if (!this.currentLocation || !this.dc || this.dc.readyState !== 'open') return;

        const { lat, lng, precision_m } = this.currentLocation;
        const contextMessage = `User location context: I have the user's current location at coordinates ${lat.toFixed(6)}, ${lng.toFixed(6)} with ±${precision_m}m accuracy. Use this information to provide location-aware assistance.`;

        try {
            this.dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{ type: 'input_text', text: contextMessage }]
                }
            }));
            console.log('📍 Location context shared with Stacy');
        } catch (e) {
            console.warn('Failed to send location context:', e);
        }
    }

    // Cleanup method
    disconnect() {
        if (this.locationWatchId) {
            navigator.geolocation.clearWatch(this.locationWatchId);
            this.locationWatchId = null;
        }

        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }

        console.log('📍 Location tracking stopped');
    }

    // Proactive conversation management (911 operator style)
    startConversationMonitoring() {
        // Check for user silence every 10 seconds (reduced frequency to save API costs)
        this.silenceCheckInterval = setInterval(() => {
            const silenceDuration = Date.now() - this.lastUserActivity;

            // Proactive check-ins based on silence duration (increased thresholds)
            if (silenceDuration > 30000 && !this.conversationTimeout) { // 30 seconds
                this.triggerProactiveResponse('check_in');
                this.conversationTimeout = setTimeout(() => {
                    this.triggerProactiveResponse('reassurance');
                    this.conversationTimeout = null;
                }, 20000); // Another 20 seconds later
            } else if (silenceDuration > 90000) { // 90 seconds total
                this.triggerProactiveResponse('stay_connected');
            }
        }, 10000); // Check every 10 seconds instead of 5

        console.log('🗣️ Proactive conversation monitoring started');
    }

    pauseRealtimeConnection() {
        if (this.realtimeConnectionPaused) return;

        console.log('⏸️ Pausing Realtime connection to stop API usage');

        // Stop all audio tracks to prevent API usage
        if (this.micStream) {
            this.micStream.getAudioTracks().forEach(track => {
                track.enabled = false;
                console.log('🔇 Audio track disabled');
            });
        }

        // Close data channel to stop Realtime API communication
        if (this.dc && this.dc.readyState === 'open') {
            this.dc.close();
            console.log('📡 Data channel closed');
        }

        this.realtimeConnectionPaused = true;
        this.updateStatus('paused', 'Connection Paused');
    }

    async resumeRealtimeConnection() {
        if (!this.realtimeConnectionPaused) return;

        console.log('▶️ Resuming Realtime connection');

        try {
            // Re-enable audio tracks
            if (this.micStream) {
                this.micStream.getAudioTracks().forEach(track => {
                    track.enabled = true;
                    console.log('🎤 Audio track re-enabled');
                });
            } else {
                // Recreate mic stream if needed
                this.micStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
                });

                // Re-add tracks to peer connection
                this.micStream.getTracks().forEach(t => this.pc.addTrack(t, this.micStream));
            }

            // Recreate data channel if needed
            if (!this.dc || this.dc.readyState !== 'open') {
                this.dc = this.pc.createDataChannel('oai-events');
                this.dc.onmessage = (ev) => this.handleDataMessage(ev);
                this.dc.onopen = () => {
                    const update = {
                        type: 'session.update',
                        session: {
                            turn_detection: {
                                type: 'server_vad',
                                threshold: 0.7,
                                prefix_padding_ms: 250,
                                silence_duration_ms: 350
                            }
                        }
                    };
                    try { this.dc.send(JSON.stringify(update)); } catch { }
                };
            }

            this.realtimeConnectionPaused = false;
            this.updateStatus('connected', 'Connected');

        } catch (error) {
            console.error('Failed to resume Realtime connection:', error);
            this.addMessage('system', '❌ Failed to resume voice connection');
        }
    }

    setupModeToggle() {
        if (!this.modeToggle) return;

        this.modeToggle.onclick = () => {
            this.toggleListening();
        };

        // Start in text mode to save costs
        this.modeToggle.textContent = '💬 Text Mode';
        this.modeToggle.classList.add('text-mode');
    }

    setupDeleteButton() {
        if (!this.deleteDataButton) return;

        this.deleteDataButton.onclick = async () => {
            const confirmed = confirm('Delete all incident data for this session? This cannot be undone.');
            if (!confirmed) return;

            try {
                const response = await fetch(`/api/casefile/${this.sessionId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (data.success) {
                    this.addMessage('system', '🗑️ All incident data deleted successfully');

                    // Clear local state
                    this.currentLocation = null;
                    this.hasSharedLocationWithStacy = false;

                    // Update UI
                    this.updateLocationStatus('', 'Location: Cleared');

                    console.log('🗑️ Session data deleted');
                } else {
                    this.addMessage('system', '❌ Failed to delete data');
                }
            } catch (error) {
                console.error('Delete failed:', error);
                this.addMessage('system', '❌ Error deleting data');
            }
        };
    }

    markUserActivity() {
        this.lastUserActivity = Date.now();

        // Clear any pending proactive responses
        if (this.conversationTimeout) {
            clearTimeout(this.conversationTimeout);
            this.conversationTimeout = null;
        }
    }

    triggerProactiveResponse(type) {
        // In text mode, show proactive prompts instead of API calls
        if (this.textMode) {
            console.log('💬 Showing proactive text prompt instead of API call');
            this.showTextModeProactivePrompt(type);
            return;
        }

        if (!this.dc || this.dc.readyState !== 'open') return;

        let prompt = '';
        switch (type) {
            case 'check_in':
                prompt = "The user hasn't responded for a while. Check in naturally: 'Are you still there?' or 'I'm here with you' or ask about their current situation.";
                break;
            case 'reassurance':
                prompt = "The user is still silent. Provide reassurance and ask follow-up: 'I'm staying connected with you. Has your situation changed?' or 'Can you tell me what's happening around you now?'";
                break;
            case 'stay_connected':
                prompt = "Extended silence detected. Check if situation has changed: 'I'm still here. Did something change in your situation?' or 'Are you able to respond? I'm monitoring your location.'";
                break;
        }

        console.log(`🗣️ Triggering proactive response: ${type}`);

        try {
            // Send context to Stacy about the silence
            this.dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{ type: 'input_text', text: prompt }]
                }
            }));
            this.dc.send(JSON.stringify({ type: 'response.create' }));
        } catch (e) {
            console.warn('Failed to send proactive response:', e);
        }
    }

    // Enhanced disconnect with cleanup
    disconnect() {
        // Clear conversation monitoring
        if (this.silenceCheckInterval) {
            clearInterval(this.silenceCheckInterval);
            this.silenceCheckInterval = null;
        }
        if (this.conversationTimeout) {
            clearTimeout(this.conversationTimeout);
            this.conversationTimeout = null;
        }

        // Clear location tracking
        if (this.locationWatchId) {
            navigator.geolocation.clearWatch(this.locationWatchId);
            this.locationWatchId = null;
        }

        // Close connections
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }

        console.log('🗣️ Conversation monitoring stopped');
        console.log('📍 Location tracking stopped');
    }

    showTextModeProactivePrompt(type) {
        let promptMessage = '';
        let quickReplies = [];

        switch (type) {
            case 'check_in':
                promptMessage = "💬 Are you still there? I'm here to help with your safety.";
                quickReplies = ['Yes, I\'m here', 'I need help', 'I\'m safe now'];
                break;
            case 'reassurance':
                promptMessage = "💬 I'm staying connected with you. Has your situation changed?";
                quickReplies = ['Same situation', 'Getting worse', 'Getting better', 'Need police'];
                break;
            case 'stay_connected':
                promptMessage = "💬 I'm still monitoring your safety. What's your current status?";
                quickReplies = ['Still unsafe', 'Found safety', 'Call 911', 'Contact someone'];
                break;
        }

        // Show proactive message
        this.addMessage('system', promptMessage);

        // Show contextual quick replies
        if (quickReplies.length > 0) {
            this.showCustomQuickReplies(quickReplies);
        }
    }

    showCustomQuickReplies(replies) {
        if (!this.quickReplies) return;

        // Clear existing replies
        this.quickReplies.innerHTML = '';

        // Add new replies
        replies.forEach(reply => {
            const button = document.createElement('button');
            button.className = 'qr-button';
            button.textContent = reply;
            button.onclick = () => {
                this.textInput.value = reply;
                this.sendTypedMessage();
                this.hideQuickReplies();
            };
            this.quickReplies.appendChild(button);
        });

        this.quickReplies.style.display = 'flex';

        // Auto-hide after 30 seconds
        setTimeout(() => {
            this.hideQuickReplies();
        }, 30000);
    }

    injectStateContext(state, risk) {
        // Only inject state context in voice mode to save API costs
        if (this.textMode || !this.dc || this.dc.readyState !== 'open') return;

        const stateNames = {
            0: 'SAFE',
            1: 'ELEVATED',
            2: 'CRITICAL',
            3: 'RESOLVED'
        };

        const stateName = stateNames[state] || 'UNKNOWN';

        try {
            this.dc.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    role: "system",
                    content: [{
                        type: "input_text",
                        text: `state: ${stateName}, risk: ${risk}`
                    }]
                }
            }));
            console.log(`📊 State context injected: ${stateName}, risk: ${risk}`);
        } catch (e) {
            console.warn('Failed to inject state context:', e);
        }
    }

    checkComplianceAndNudge() {
        // Only enforce in voice mode and elevated/critical states
        if (this.textMode || !this.dc || this.dc.readyState !== 'open') return;

        // Check if assistant asked a question
        this.lastTurn.questionAsked = /\?/.test(this.lastAssistantText);

        this.turnCount++;

        // If no tool called and no question asked in elevated/critical, nudge
        if (!this.lastTurn.toolCalled && !this.lastTurn.questionAsked && this.isElevatedOrHigher()) {
            console.log('⚠️ Compliance violation: No tool or question in elevated state');
            this.forceNudge();
        }

        // Periodic policy reminders every 3 turns
        if (this.turnCount % 3 === 0) {
            this.injectPolicyReminder();
        }

        // Reset turn tracking
        this.lastTurn = { toolCalled: false, questionAsked: false };
    }

    isElevatedOrHigher() {
        // Check if current state is elevated or critical
        return this.safety && (this.safety.machine.s === 1 || this.safety.machine.s === 2);
    }

    forceNudge() {
        if (!this.dc || this.dc.readyState !== 'open') return;

        try {
            // Inject a policy reminder that tightens the loop
            this.dc.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    role: "system",
                    content: [{
                        type: "input_text",
                        text: "Policy reminder: In ELEVATED or CRITICAL, you must either call a tool now or ask a single targeted question that unblocks a tool call."
                    }]
                }
            }));
            this.dc.send(JSON.stringify({ type: "response.create" }));
            console.log('🔔 Compliance nudge sent');
        } catch (e) {
            console.warn('Failed to send compliance nudge:', e);
        }
    }

    injectPolicyReminder() {
        if (!this.dc || this.dc.readyState !== 'open' || this.textMode) return;

        try {
            this.dc.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    role: "system",
                    content: [{
                        type: "input_text",
                        text: "Action-first policy is active."
                    }]
                }
            }));
            console.log('📋 Policy reminder injected');
        } catch (e) {
            console.warn('Failed to inject policy reminder:', e);
        }
    }

    async injectMissingFieldsCue() {
        // Only check in voice mode and elevated/critical states
        if (this.textMode || !this.dc || this.dc.readyState !== 'open' || !this.isElevatedOrHigher()) return;

        try {
            // Get current case file
            const response = await fetch(`/api/casefile/${this.sessionId}`);
            if (!response.ok) return;

            const cf = await response.json();
            const missing = [];

            // Check required fields
            if (cf.can_speak === null || cf.can_speak === undefined) missing.push("can_speak");
            if (!cf.location?.lat || !cf.location?.lng) missing.push("location");
            if (!cf.consent?.notify_contact && !this.isHardTrigger()) missing.push("consent.notify_contact");

            if (missing.length > 0) {
                this.dc.send(JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                        role: "system",
                        content: [{
                            type: "input_text",
                            text: `Missing fields: ${missing.join(", ")}. Ask ONE question to fill a missing field, then call the appropriate tool.`
                        }]
                    }
                }));
                console.log(`🔍 Missing fields cue sent: ${missing.join(", ")}`);
            }
        } catch (e) {
            console.warn('Failed to check missing fields:', e);
        }
    }

    isHardTrigger() {
        // Check if current context includes hard trigger phrases
        return this.lastAssistantText.toLowerCase().includes('hard trigger') ||
            this.lastAssistantText.toLowerCase().includes('cannot speak') ||
            this.lastAssistantText.toLowerCase().includes('call now');
    }

    handleStateChange(next, prev) {
        // Only handle state changes in voice mode
        if (this.textMode || !this.dc || this.dc.readyState !== 'open') return;

        console.log(`🚨 State change: ${prev} → ${next}`);

        try {
            // Inject state change context
            this.dc.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    role: "system",
                    content: [{
                        type: "input_text",
                        text: `state: ${next}`
                    }]
                }
            }));

            // State-specific default actions
            if (next === 'ELEVATED') {
                // Prompt for micro-consent
                setTimeout(() => {
                    if (this.dc && this.dc.readyState === 'open') {
                        this.dc.send(JSON.stringify({
                            type: "conversation.item.create",
                            item: {
                                role: "assistant",
                                content: [{
                                    type: "output_text",
                                    text: "I'm with you. Do you want me to text your contact with your location, or walk you to a safe place first?"
                                }]
                            }
                        }));
                    }
                }, 1000);
            }

            if (next === 'CRITICAL') {
                // Instruct model to act immediately
                setTimeout(() => {
                    if (this.dc && this.dc.readyState === 'open') {
                        this.dc.send(JSON.stringify({
                            type: "response.create",
                            response: {
                                instructions: "State is CRITICAL. Call now using place_phone_call with reason='hard_trigger'. Keep the script under 2 sentences."
                            }
                        }));
                    }
                }, 500);
            }

        } catch (e) {
            console.warn('Failed to handle state change:', e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const client = new StacyWebRTCClient();
    client.init();
});


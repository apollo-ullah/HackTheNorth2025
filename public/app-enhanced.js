// Simplified Stacy Client - Clean and Simple with Debug
class StacyClient {
    constructor() {
        this.currentLocation = null;
        this.riskLevel = 'SAFE';
        this.debugMode = true;

        this.debug('🚀 Stacy Client initializing...', 'info');

        this.initializeElements();
        this.setupEventListeners();
        this.checkAPIStatus();
        this.requestLocationPermission();
        this.updateConnectionStatus('connected', 'Ready');

        this.debug('✅ Stacy Client initialized successfully', 'success');
    }

    initializeElements() {
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            locationStatus: document.getElementById('locationStatus'),
            messagesContainer: document.getElementById('messagesContainer'),
            textInput: document.getElementById('textInput'),
            sendTextBtn: document.getElementById('sendTextBtn'),
            emergencyButton: document.getElementById('emergencyButton'),
            locationButton: document.getElementById('locationButton'),
            deleteDataButton: document.getElementById('deleteDataButton'),
            emergencyModal: document.getElementById('emergencyModal'),
            closeEmergencyModal: document.getElementById('closeEmergencyModal'),
            locationInfo: document.getElementById('locationInfo'),
            callEmergencyServices: document.getElementById('callEmergencyServices'),
            textEmergencyContact: document.getElementById('textEmergencyContact'),
            findSafeLocation: document.getElementById('findSafeLocation'),
            safetyBanner: document.getElementById('safetyBanner'),
            safetyBannerText: document.getElementById('safetyBannerText'),
        };

        // Add VAPI call button
        this.addVapiCallButton();
    }

    addVapiCallButton() {
        const vapiButton = document.createElement('button');
        vapiButton.className = 'emergency-button';
        vapiButton.innerHTML = '<span class="emergency-icon">📞</span><span>Call Stacy</span>';
        vapiButton.style.marginTop = '10px';
        vapiButton.addEventListener('click', () => this.initiateVapiCall());

        const emergencyControls = document.querySelector('.emergency-controls');
        if (emergencyControls) {
            emergencyControls.appendChild(vapiButton);
            this.elements.vapiCallButton = vapiButton;
            this.debug('📞 VAPI call button added', 'info');
        } else {
            this.debug('❌ Could not find emergency controls container', 'error');
        }
    }

    debug(message, type = 'info') {
        if (!this.debugMode) return;

        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            'info': '💬',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        }[type] || '💬';

        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async checkAPIStatus() {
        try {
            this.debug('🔍 Checking API status...', 'info');

            const response = await fetch('/api/status');
            const status = await response.json();

            this.debug(`📊 API Status: ${JSON.stringify(status, null, 2)}`, 'info');

            if (!status.vapi_backend_key_configured) {
                this.debug('❌ VAPI Backend key not configured', 'error');
            }
            if (!status.twilio_configured) {
                this.debug('❌ Twilio not configured', 'error');
            }
            if (status.vapi_backend_key_configured && status.twilio_configured) {
                this.debug('✅ All APIs configured correctly', 'success');
            }

        } catch (error) {
            this.debug(`🔍 API status check failed: ${error.message}`, 'error');
        }
    }

    setupEventListeners() {
        // Text input
        this.elements.sendTextBtn.addEventListener('click', () => this.sendTextMessage());
        this.elements.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendTextMessage();
        });

        // Emergency button
        this.elements.emergencyButton.addEventListener('click', () => this.triggerEmergency());

        // Location button
        this.elements.locationButton.addEventListener('click', () => this.shareLocation());

        // Delete data button
        this.elements.deleteDataButton.addEventListener('click', () => this.deleteData());

        // Emergency modal
        this.elements.closeEmergencyModal.addEventListener('click', () => this.closeEmergencyModal());
        this.elements.callEmergencyServices.addEventListener('click', () => this.callEmergencyServices());
        this.elements.textEmergencyContact.addEventListener('click', () => this.textEmergencyContact());
        this.elements.findSafeLocation.addEventListener('click', () => this.findSafeLocation());
    }

    async sendTextMessage() {
        const message = this.elements.textInput.value.trim();
        if (!message) return;

        this.addMessage('user', message);
        this.elements.textInput.value = '';

        // Assess risk level
        this.assessRisk(message);

        // Simple AI response (in a real app, this would go through your AI service)
        setTimeout(() => {
            const response = this.generateResponse(message);
            this.addMessage('ai', response);
        }, 1000);
    }

    assessRisk(message) {
        const lowerMessage = message.toLowerCase();
        const highRiskKeywords = ['help', 'emergency', 'following', 'danger', 'attacked'];
        const mediumRiskKeywords = ['scared', 'unsafe', 'uncomfortable', 'worried'];

        if (highRiskKeywords.some(keyword => lowerMessage.includes(keyword))) {
            this.setRiskLevel('CRITICAL');
        } else if (mediumRiskKeywords.some(keyword => lowerMessage.includes(keyword))) {
            this.setRiskLevel('ELEVATED');
        } else {
            this.setRiskLevel('SAFE');
        }
    }

    setRiskLevel(level) {
        this.riskLevel = level;
        this.updateSafetyBanner(level);
    }

    updateSafetyBanner(level) {
        const banner = this.elements.safetyBanner;
        const text = this.elements.safetyBannerText;

        banner.style.display = level !== 'SAFE' ? 'block' : 'none';

        if (level === 'CRITICAL') {
            text.textContent = '🚨 CRITICAL: Emergency protocols activated';
            banner.style.background = '#ff4444';
        } else if (level === 'ELEVATED') {
            text.textContent = '⚠️ ELEVATED: Monitoring situation closely';
            banner.style.background = '#ff8800';
        }
    }

    generateResponse(message) {
        const lowerMessage = message.toLowerCase();

        if (this.riskLevel === 'CRITICAL') {
            return "I understand this is urgent. Are you in immediate danger right now?";
        } else if (this.riskLevel === 'ELEVATED') {
            return "I'm here to help. Can you tell me more about what's making you feel unsafe?";
        } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
            return "Hi! I'm Stacy, your AI safety companion. How are you feeling right now?";
        } else {
            return "I'm listening. What's your current situation?";
        }
    }

    async initiateVapiCall() {
        const phoneNumber = prompt('Enter your phone number to receive a call from Stacy:');
        if (!phoneNumber) {
            this.debug('📞 No phone number provided by user', 'warning');
            return;
        }

        try {
            this.debug(`📞 Initiating VAPI call to ${phoneNumber}...`, 'info');
            this.addMessage('system', '📞 Initiating call to Stacy...');

            const requestData = {
                phone_number: phoneNumber,
                user_location: this.currentLocation,
                emergency_contacts: [{
                    name: 'Emergency Contact',
                    phone: '+15146605707',
                    relationship: 'Primary'
                }]
            };

            this.debug(`📞 Request data: ${JSON.stringify(requestData, null, 2)}`, 'info');

            const response = await fetch('/api/stacy/voice-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            this.debug(`📞 Response status: ${response.status} ${response.statusText}`, 'info');

            const result = await response.json();
            this.debug(`📞 Response data: ${JSON.stringify(result, null, 2)}`, 'info');

            if (result.success) {
                this.addMessage('system', `✅ Call initiated! You should receive a call from ${result.stacyNumber} shortly. Call ID: ${result.callId}`);
                this.debug(`📞 VAPI call successful! Call ID: ${result.callId}`, 'success');
            } else {
                this.addMessage('system', `❌ Error: ${result.error}`);
                this.debug(`📞 VAPI call failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.addMessage('system', `❌ Error initiating call: ${error.message}`);
            this.debug(`📞 VAPI call exception: ${error.message}`, 'error');
            console.error('Full VAPI call error:', error);
        }
    }

    triggerEmergency() {
        this.setRiskLevel('CRITICAL');
        this.elements.emergencyModal.style.display = 'flex';

        if (this.currentLocation) {
            this.elements.locationInfo.innerHTML = `
                <p>📍 Location: ${this.currentLocation.lat.toFixed(6)}, ${this.currentLocation.lng.toFixed(6)}</p>
                <p>Accuracy: ±${Math.round(this.currentLocation.accuracy)}m</p>
            `;
        }
    }

    closeEmergencyModal() {
        this.elements.emergencyModal.style.display = 'none';
    }

    async textEmergencyContact() {
        if (!this.currentLocation) {
            alert('Location not available');
            return;
        }

        try {
            const response = await fetch('/api/stacy/mobile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'quick_alert',
                    location: this.currentLocation,
                    message: 'EMERGENCY: Alert activated from Stacy web interface',
                    emergency_contact: {
                        name: 'Emergency Contact',
                        phone: '+15146605707',
                        relationship: 'Primary'
                    }
                })
            });

            const result = await response.json();

            if (result.success) {
                this.addMessage('system', `✅ Emergency alert sent! Message ID: ${result.messageId}`);
            } else {
                this.addMessage('system', `❌ Failed to send alert: ${result.error}`);
            }
        } catch (error) {
            this.addMessage('system', `❌ Error: ${error.message}`);
        }

        this.closeEmergencyModal();
    }

    async findSafeLocation() {
        if (!this.currentLocation) {
            alert('Location not available');
            return;
        }

        try {
            const response = await fetch('/api/stacy/mobile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'find_help',
                    location: this.currentLocation
                })
            });

            const result = await response.json();

            if (result.success) {
                const locations = result.locations.slice(0, 3); // Show top 3
                const locationText = locations.map(loc =>
                    `${loc.name} (${loc.type}) - ${loc.distance}km away`
                ).join('\n');

                this.addMessage('system', `🏥 Found safe locations:\n${locationText}`);
            } else {
                this.addMessage('system', '❌ Could not find safe locations');
            }
        } catch (error) {
            this.addMessage('system', `❌ Error: ${error.message}`);
        }

        this.closeEmergencyModal();
    }

    callEmergencyServices() {
        this.addMessage('system', '📞 For demo purposes, emergency services would be contacted at +1 438 376 1217');
        this.closeEmergencyModal();
    }

    shareLocation() {
        if (this.currentLocation) {
            const { lat, lng, accuracy } = this.currentLocation;
            const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
            this.addMessage('system', `📍 Current location: ${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)}m)\n🗺️ View on maps: ${mapsUrl}`);
        } else {
            this.addMessage('system', '❌ Location not available. Please allow location access.');
            this.requestLocationPermission();
        }
    }

    deleteData() {
        if (confirm('Delete all conversation data?')) {
            this.elements.messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="ai-avatar">🤖</div>
                    <div class="message-content">
                        <p>Hi, I'm Stacy, your AI safety companion. I'm here to help keep you safe.</p>
                        <p>Type a message or call me using the buttons below.</p>
                    </div>
                </div>
            `;
            this.setRiskLevel('SAFE');
            this.addMessage('system', '🗑️ All data deleted');
        }
    }

    requestLocationPermission() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    this.updateLocationStatus(`${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`);
                },
                (error) => {
                    console.error('Location error:', error);
                    this.updateLocationStatus('Location denied');
                }
            );
        } else {
            this.updateLocationStatus('Location not supported');
        }
    }

    addMessage(sender, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const avatar = sender === 'ai' ? '🤖' : sender === 'user' ? '👤' : '⚙️';
        const timestamp = new Date().toLocaleTimeString();

        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-text">${content}</div>
                <div class="message-time">${timestamp}</div>
            </div>
        `;

        this.elements.messagesContainer.appendChild(messageDiv);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }

    updateConnectionStatus(status, text) {
        const statusEl = this.elements.connectionStatus;
        const dot = statusEl.querySelector('.status-dot');
        const span = statusEl.querySelector('span');

        dot.className = `status-dot ${status}`;
        span.textContent = text;
    }

    updateLocationStatus(text) {
        const statusEl = this.elements.locationStatus;
        const span = statusEl.querySelector('span');
        span.textContent = `Location: ${text}`;
    }
}

// Initialize the client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.stacyClient = new StacyClient();
});
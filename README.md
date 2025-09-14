# Stacy - AI Safety Companion

Stacy is a voice-enabled AI safety companion designed to provide immediate support during moments of distress. This is the Pre-MVP web application that demonstrates the core conversation flow using OpenAI's Realtime API.

## 🚀 Features

### Current (Pre-MVP)
- **Voice Interaction**: Real-time voice conversation with AI using WebRTC
- **Distress Detection**: Keyword and sentiment analysis to detect emergency situations
- **Location Tracking**: GPS integration for location sharing
- **Emergency Triggers**: Quick access to emergency functions
- **Safety-Focused AI**: Specialized AI responses for safety situations

### Planned
- SMS integration via Twilio
- Google Maps API for safe navigation
- Emergency contact management
- iOS/Android mobile apps

## 🛠️ Setup

### Prerequisites
- Node.js 18+ 
- OpenAI API key with Realtime API access

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd djiosmopocket3
npm install
```

2. **Configure environment variables:**
```bash
cp env.example .env
```

Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
NODE_ENV=development
```

3. **Start the server:**
```bash
npm start
# or for development with auto-reload:
npm run dev
```

4. **Open the application:**
Navigate to `http://localhost:3000` in your web browser.

## 🎯 Usage

### Basic Voice Interaction
1. Click and hold the microphone button
2. Speak naturally about your situation
3. Release to send audio to Stacy
4. Listen to Stacy's response and guidance

### Emergency Features
- **Emergency Button**: Triggers immediate emergency mode
- **Location Sharing**: Shares current GPS coordinates
- **Distress Detection**: Automatically detects keywords like "help", "scared", "following me"

### Example Interactions

**Normal Safety Check:**
- "I'm walking home alone at night"
- Stacy provides general safety tips

**Medium Distress:**
- "I feel uncomfortable, there's someone behind me"
- Stacy suggests moving to a safe location and staying alert

**High Distress:**
- "Help! Someone is following me!"
- Stacy immediately suggests emergency actions and location sharing

## 🔧 API Endpoints

- `GET /` - Main application interface
- `GET /health` - Health check with connection stats
- `GET /api/stats` - Detailed server statistics
- `WebSocket /` - Real-time communication endpoint

## 🏗️ Architecture

### Backend Components
- **server.js**: Main Express server with WebSocket handling
- **realtime-handler.js**: OpenAI Realtime API integration
- **WebSocket Server**: Manages client connections

### Frontend Components
- **index.html**: Main UI with safety-focused design
- **app.js**: WebRTC client and WebSocket communication
- **styles.css**: Modern, accessible styling

### Data Flow
1. Client captures audio via WebRTC
2. Audio sent to server via WebSocket
3. Server forwards to OpenAI Realtime API
4. AI response analyzed for distress indicators
5. Response sent back to client with safety recommendations

## 🔒 Safety Features

### Distress Detection Keywords
- **High Priority**: "help", "emergency", "following me", "danger"
- **Medium Priority**: "scared", "unsafe", "uncomfortable", "suspicious"
- **Location Keywords**: "lost", "alone", "dark area", "isolated"

### Response Levels
- **Low Distress**: General safety advice and tips
- **Medium Distress**: Specific guidance and heightened awareness
- **High Distress**: Immediate emergency actions and escalation

## 🧪 Testing

### Manual Testing
1. Test voice recording functionality
2. Try various distress scenarios
3. Verify emergency button triggers
4. Test location sharing permissions

### Test Scenarios
```javascript
// Test phrases for different distress levels
const testPhrases = [
  "I'm walking home", // Low
  "Someone seems to be following me", // Medium  
  "Help! I'm in danger!", // High
  "I'm lost and scared", // Medium-High
];
```

### Browser Compatibility
- Chrome/Edge: Full WebRTC support
- Firefox: Full support
- Safari: WebRTC support with some limitations
- Mobile browsers: Touch-optimized interface

## 🔮 Future Enhancements

### Phase 2: Mobile Integration
- React Native or Swift/Kotlin native apps
- Background location tracking
- Push notifications for safety alerts

### Phase 3: Advanced Features
- Integration with local emergency services
- AI-powered safe route planning
- Community safety features
- Wearable device support

### Phase 4: Scale & Security
- End-to-end encryption
- Multi-language support
- Enterprise safety solutions
- Integration with existing security systems

## 🐛 Troubleshooting

### Common Issues

**Microphone not working:**
- Check browser permissions for microphone access
- Ensure HTTPS for production (required for WebRTC)
- Try different browsers

**WebSocket connection fails:**
- Check if server is running on correct port
- Verify firewall settings
- Check browser console for errors

**OpenAI API errors:**
- Verify API key is correct and has Realtime API access
- Check API usage limits
- Monitor server logs for detailed error messages

**Location not available:**
- Enable location services in browser
- Grant location permissions when prompted
- Check if HTTPS is enabled (required for geolocation)

### Debug Mode
Set `NODE_ENV=development` to enable detailed logging:
```bash
NODE_ENV=development npm start
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with various safety scenarios
5. Submit a pull request

### Development Guidelines
- Prioritize user safety in all features
- Test with real-world safety scenarios
- Maintain accessibility standards
- Follow security best practices

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Emergency Disclaimer

**This is a prototype application for demonstration purposes. In real emergencies, always contact local emergency services directly (911 in the US, 999 in the UK, etc.).**

Stacy is designed to supplement, not replace, traditional emergency services and personal safety practices.

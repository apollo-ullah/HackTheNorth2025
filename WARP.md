# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**Stacy AI Safety Companion** is an AI-powered emergency response system that provides professional dispatcher-style safety assistance through voice calls, SMS alerts, and mobile app integration. The system combines Next.js web APIs with VAPI voice AI and a native Swift iOS app to create a comprehensive safety platform.

## Development Commands

### Core Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

### Testing & Debugging
```bash
# Test API health check
curl http://localhost:3000/api/status

# Test emergency call endpoint
curl -X POST http://localhost:3000/api/call \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+1234567890", "system_prompt": "Emergency test"}'

# Test Swift API endpoint
curl -X POST http://localhost:3000/api/stacy/mobile \
  -H "Content-Type: application/json" \
  -d '{"action": "panic_alert", "data": {"location": {"lat": 37.7749, "lng": -122.4194}}}'

# 🚨 NEW: Test warm handoff functionality
curl -X POST http://localhost:3000/api/test-handoff \
  -H "Content-Type: application/json" \
  -d '{"userNumber": "+1234567890", "policeNumber": "+15146605707"}'

# Test VAPI webhook (simulate tool call)
curl -X POST http://localhost:3000/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": {"type": "function-call", "functionCall": {"name": "update_casefile", "parameters": {"caseId": "test123", "riskLevel": "CRITICAL"}}}}'
```

### iOS Development
```bash
# Open Swift project
open Stacy/Stacy.xcodeproj

# Build and run iOS app (requires Xcode)
cd Stacy && xcodebuild -scheme Stacy -configuration Debug
```

### Deployment
```bash
# Deploy to Vercel
vercel --prod

# Update VAPI webhook URL after deployment
# https://your-domain.vercel.app/api/vapi/webhook
```

## Architecture Overview

### Core Components Architecture

**Multi-Modal Safety Platform**: The system operates across three integrated layers:

1. **Web API Layer (Next.js)**: Central coordination hub
2. **Voice AI Layer (VAPI)**: Professional dispatcher conversation engine
3. **Mobile Layer (Swift)**: Native iOS emergency interface

### Key Architectural Patterns

**Emergency Response Pipeline**:
- Risk assessment using keyword detection (`assessRiskLevel()` in `lib/stacy-tools.ts`)
- Professional case file management with structured evidence collection
- Real-world action execution (SMS via Twilio, emergency calls, location services)
- Cross-platform state synchronization between voice, web, and mobile

**Dispatcher Protocol Implementation**:
- State-driven conversation flow: SAFE → ELEVATED → CRITICAL
- One action per turn rule (never both question + action)
- Professional terminology and emergency service protocols
- Real-time evidence building and case file documentation

### Service Integration Points

**VAPI Voice AI Integration**:
- Custom tool definitions for emergency actions in `lib/vapi-client.ts`
- Webhook handling for real-time tool execution in `pages/api/vapi/webhook`
- Professional voice prompts configured in `vapi-assistant-config.json`

**Twilio Communication Layer**:
- SMS emergency alerts with location integration
- Demo emergency call system with TwiML scripting
- Professional emergency report formatting in `StacyTools.formatEmergencyReport()`

**Cross-Platform Data Flow**:
- Swift app → `/api/swift/stacy-mobile` → Emergency tools → VAPI voice call
- Location services integration with Google Maps API formatting
- Real-time case file updates across all platforms

## Environment Configuration

### Required Environment Variables
```bash
# VAPI Configuration (primary voice AI service)
VAPI_BACKEND_KEY=your_vapi_backend_key
VAPI_PHONE_NUMBER_ID=your_phone_number_id

# Twilio Configuration (SMS and emergency calls)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_NUMBER=+16693292501

# OpenAI Configuration (for Swift WebRTC mode)
OPENAI_API_KEY=your_openai_key
```

### Configuration Files
- `vapi-assistant-config.json`: Complete VAPI assistant definition with emergency tools
- `vapi-assistant-setup.json`: Production deployment configuration
- `.env.local`: Local development environment variables (not committed)

## Key File Structure

### Emergency Response Core
- `lib/stacy-tools.ts`: Emergency toolkit with 5 real-world action tools (SMS, calls, case files, safe locations)
- `lib/vapi-client.ts`: VAPI integration with emergency-specific tool definitions

### API Endpoints (Cleaned & Simplified)
- `pages/api/call.ts`: VAPI outbound call initiation
- `pages/api/stacy/mobile.ts`: Mobile emergency API (panic alerts only)
- `pages/api/vapi/webhook.ts`: Intelligent tool execution handler
- `pages/api/test-handoff.ts`: Warm handoff testing endpoint
- `pages/api/status.ts`: Configuration health check

### Swift Mobile Integration
- `Stacy/Stacy/Views/ContentView.swift`: Main iOS emergency interface
- `Stacy/Stacy/VM/VoiceVM.swift`: Voice recognition and OpenAI Realtime integration
- `Stacy/Stacy/LocationManager.swift`: GPS and location services

### Frontend Interface
- `components/StacyInterface.tsx`: Web-based emergency interface component
- `pages/index.tsx`: Main application entry point

## Development Patterns

### Emergency Tool Development
When adding new emergency tools:
1. Add tool definition to `lib/vapi-client.ts` assistant configuration
2. Implement tool logic in `lib/stacy-tools.ts` StacyTools class
3. Add webhook handler in `pages/api/vapi/webhook.ts`
4. Update case file structure if new evidence types needed

### Swift Integration Pattern
For new mobile features:
1. Add API endpoint to `pages/api/swift/stacy-mobile.ts`
2. Implement Swift model in `Stacy/Stacy/Models/`
3. Update `StacyAPI.swift` client methods
4. Add UI components in `Stacy/Stacy/Views/`

### Voice AI Conversation Flow
Follow dispatcher protocols:
- Immediate risk assessment on first interaction
- Single action OR question per turn (never both)
- Evidence collection for case file building
- Real action execution (not simulated responses)
- Professional emergency service terminology

## Production Considerations

### Security Requirements
- All API keys server-side only (never in Swift app or frontend)
- Webhook URL must be HTTPS for VAPI integration
- Rate limiting recommended for emergency endpoints
- Location data handling follows emergency service protocols

### Performance Optimization
- VAPI calls typically connect within 30-60 seconds
- SMS delivery optimized for < 3 second emergency alerts
- Location accuracy prioritized over speed for safety
- Case file updates are async to prevent blocking emergency actions

### Deployment Dependencies
- Vercel for Next.js API hosting
- VAPI account with phone number provisioning
- Twilio account for SMS and voice services
- Apple Developer account for iOS app distribution

### Monitoring & Reliability
- `/api/status` endpoint for configuration health checks
- Error handling prioritizes user safety over system stability
- Emergency actions have fallback mechanisms
- All critical actions logged for case file evidence

## Important Notes

**This is a working emergency response system**: All SMS messages, phone calls, and emergency alerts are real. Test carefully and use appropriate test phone numbers.

**Professional dispatcher protocols**: The AI follows actual 911 operator procedures. Maintain this professional standard when modifying conversation flows.

**Cross-platform state management**: Voice calls, web interface, and Swift app all share case file state. Consider synchronization when adding features.

**Real-world action execution**: Tools perform actual emergency actions (Twilio SMS, phone calls). Never mock or simulate these in production code.
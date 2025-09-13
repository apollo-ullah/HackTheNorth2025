# 📱 Swift App Integration Guide for Stacy AI

## 🚀 **API Endpoints for Your Swift App**

### **Base URL**: `https://your-domain.vercel.app` or `http://localhost:3000`

---

## 📞 **Emergency Call API**

### **Initiate Emergency VAPI Call**

```swift
POST /api/swift/stacy-mobile
{
  "action": "emergency_call",
  "data": {
    "userPhone": "+15146605707",
    "location": {
      "lat": 37.7749,
      "lng": -122.4194,
      "accuracy": 10
    },
    "emergencyContacts": [
      {
        "name": "John Doe",
        "phone": "+1234567890",
        "relationship": "Emergency Contact"
      }
    ]
  }
}
```

**Response:**

```json
{
  "success": true,
  "callId": "call_abc123",
  "message": "Emergency call initiated",
  "stacyNumber": "+16693292501",
  "estimatedCallTime": "30-60 seconds"
}
```

---

## 🚨 **Panic Button API**

### **Immediate Panic Alert**

```swift
POST /api/swift/stacy-mobile
{
  "action": "panic_alert",
  "data": {
    "location": {
      "lat": 37.7749,
      "lng": -122.4194,
      "accuracy": 10
    },
    "emergencyContact": {
      "name": "Emergency Contact",
      "phone": "+1234567890"
    },
    "context": "Panic button pressed - immediate assistance needed"
  }
}
```

**Response:**

```json
{
  "success": true,
  "messageId": "SM1234567890abcdef",
  "message": "Panic alert sent successfully"
}
```

---

## 📍 **Location Services API**

### **Share Location**

```swift
POST /api/swift/stacy-mobile
{
  "action": "location_share",
  "data": {
    "location": {
      "lat": 37.7749,
      "lng": -122.4194,
      "accuracy": 10
    },
    "recipient": {
      "phone": "+1234567890",
      "name": "Mom"
    },
    "message": "Sharing my current location for safety"
  }
}
```

### **Find Safe Locations**

```swift
POST /api/swift/stacy-mobile
{
  "action": "find_safe_locations",
  "data": {
    "location": {
      "lat": 37.7749,
      "lng": -122.4194
    },
    "radius": 2000,
    "types": ["police_station", "hospital", "cafe"]
  }
}
```

**Response:**

```json
{
  "success": true,
  "locations": [
    {
      "name": "Police Station - Downtown",
      "type": "police_station",
      "address": "123 Main St",
      "phone": "+1234567890",
      "distance": 0.5,
      "isOpen": true
    }
  ],
  "count": 3
}
```

---

## 🧠 **Risk Assessment API**

### **Assess Risk Level**

```swift
POST /api/swift/stacy-mobile
{
  "action": "risk_assessment",
  "data": {
    "message": "Someone is following me and I feel scared",
    "context": "Walking home at night"
  }
}
```

**Response:**

```json
{
  "success": true,
  "riskLevel": "ELEVATED",
  "recommendations": [
    "Move to a well-lit, populated area",
    "Contact someone you trust",
    "Stay alert and avoid distractions"
  ],
  "keywords": ["following", "scared"]
}
```

---

## 📋 **Swift Integration Example**

### **StacyAPI.swift**

```swift
import Foundation

class StacyAPI {
    private let baseURL = "https://your-domain.vercel.app"
    // For development: "http://localhost:3000"

    func emergencyCall(userPhone: String, location: CLLocation) async throws -> EmergencyCallResponse {
        let url = URL(string: "\(baseURL)/api/swift/stacy-mobile")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload = EmergencyCallRequest(
            action: "emergency_call",
            data: EmergencyCallData(
                userPhone: userPhone,
                location: LocationData(
                    lat: location.coordinate.latitude,
                    lng: location.coordinate.longitude,
                    accuracy: location.horizontalAccuracy
                )
            )
        )

        request.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw StacyError.networkError
        }

        return try JSONDecoder().decode(EmergencyCallResponse.self, from: data)
    }

    func panicAlert(location: CLLocation, emergencyContact: EmergencyContact) async throws -> PanicAlertResponse {
        let url = URL(string: "\(baseURL)/api/swift/stacy-mobile")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload = PanicAlertRequest(
            action: "panic_alert",
            data: PanicAlertData(
                location: LocationData(
                    lat: location.coordinate.latitude,
                    lng: location.coordinate.longitude,
                    accuracy: location.horizontalAccuracy
                ),
                emergencyContact: emergencyContact,
                context: "Panic button activated from iOS app"
            )
        )

        request.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(PanicAlertResponse.self, from: data)
    }
}

// Data Models
struct EmergencyCallRequest: Codable {
    let action: String
    let data: EmergencyCallData
}

struct EmergencyCallData: Codable {
    let userPhone: String
    let location: LocationData
}

struct LocationData: Codable {
    let lat: Double
    let lng: Double
    let accuracy: Double
}

struct EmergencyContact: Codable {
    let name: String
    let phone: String
    let relationship: String
}

struct EmergencyCallResponse: Codable {
    let success: Bool
    let callId: String?
    let message: String
    let stacyNumber: String?
}

enum StacyError: Error {
    case networkError
    case invalidResponse
}
```

---

## 🎯 **Demo Script for Judges**

### **5-Step Demo Path:**

1. **📱 Swift App Demo** (30 seconds)

   - Show emergency button in Swift app
   - Press panic button
   - Show immediate SMS sent to emergency contact

2. **📞 VAPI Call Demo** (60 seconds)

   - Enter phone number in web interface
   - Click "Call Stacy (VAPI)"
   - Answer call from +16693292501
   - Say "Someone is following me, I'm scared"
   - Stacy assesses risk and offers help

3. **🚨 Emergency Tools Demo** (45 seconds)

   - Say "Yes, send help" during call
   - Stacy sends emergency SMS with location
   - Show SMS received on phone
   - Stacy offers to call emergency services

4. **🏥 Safe Location Demo** (30 seconds)

   - Ask "Where can I go that's safe?"
   - Stacy finds nearby police station/hospital
   - Shows location and provides directions

5. **📋 Case File Demo** (15 seconds)
   - Show professional case file generated
   - Timeline, evidence, location tracking
   - Ready for law enforcement

**Total Demo Time: 3 minutes**

---

## 🔧 **Production Checklist**

### **Environment Variables:**

```bash
VAPI_BACKEND_KEY=your_key
VAPI_PHONE_NUMBER_ID=53120c11-9b18-...
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_NUMBER=+16693292501
OPENAI_API_KEY=your_key (for WebRTC mode)
```

### **Deployment:**

```bash
# Deploy to Vercel
vercel --prod

# Update VAPI webhook URL to:
# https://your-domain.vercel.app/api/vapi/webhook-production
```

### **Swift App Configuration:**

```swift
// Update base URL in StacyAPI.swift
private let baseURL = "https://your-domain.vercel.app"
```

Your **complete Stacy AI Safety Companion** is now ready for production with full Swift integration! 🛡️📱✨

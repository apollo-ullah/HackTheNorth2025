import Foundation
import CoreLocation

// MARK: - Data Models
struct CaseFile: Codable {
    let id: String
    let timestamp: String
    let riskLevel: RiskLevel
    let location: LocationData?
    let timeline: [TimelineEvent]
    let evidence: [Evidence]
    let userStatus: UserStatus
    let threat: Threat?
}

struct LocationData: Codable {
    let lat: Double
    let lng: Double
    let accuracy: Double
    let address: String?
}

struct TimelineEvent: Codable {
    let timestamp: String
    let event: String
    let source: String
}

struct Evidence: Codable {
    let type: String
    let content: String
    let timestamp: String
}

struct UserStatus: Codable {
    let canSpeak: Bool
    let canText: Bool
    let isHidden: Bool
    let batteryLevel: Int?
}

struct Threat: Codable {
    let description: String
    let type: String
    let immediacy: String
}

struct EmergencyContact: Codable {
    let name: String
    let phone: String
    let relationship: String
    let priority: Int
}

struct SafeLocation: Codable {
    let name: String
    let type: String
    let address: String
    let phone: String?
    let distance: Double
    let isOpen: Bool
}

enum RiskLevel: String, Codable {
    case safe = "SAFE"
    case elevated = "ELEVATED"
    case critical = "CRITICAL"
}

// MARK: - API Response Models
struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let error: String?
}

struct EmergencyAPIResponse: Codable {
    let success: Bool
    let caseFile: CaseFile?
    let error: String?
}

struct SafeLocationsResponse: Codable {
    let success: Bool
    let safeLocations: [SafeLocation]
    let error: String?
}

struct SMSResponse: Codable {
    let success: Bool
    let messageId: String?
    let error: String?
}

struct VoiceCallResponse: Codable {
    let success: Bool
    let callId: String?
    let caseId: String?
    let message: String?
    let stacyNumber: String?
    let briefing: String?
    let error: String?
}

struct ChatResponse: Codable {
    let reply: String
    let action: String?
    let riskLevel: String?
    let mode: String?
    let toolResult: [String: String]?
    let conversation_context: ConversationContext?
    let error: String?
}

struct ConversationContext: Codable {
    let sessionId: String
    let messages: [ChatMessage]
    let riskLevel: String
    let escalated: Bool
    let location: LocationData?
    let incident: IncidentData
    let isFirstMessage: Bool
}

struct ChatMessage: Codable {
    let role: String
    let content: String
    let timestamp: Int
}

struct IncidentData: Codable {
    let severity: String?
    let situation: String?
    let location_text: String?
    let location_gps: Bool?
    let people: String?
    let suspect_desc: String?
    let caller_contact: String?
    let consent_contact_ec: String?
    let consent_connect_dispatch: String?
    let notes: [String]
}

struct MobileAPIResponse: Codable {
    let success: Bool
    let riskLevel: String?
    let recommendations: [String]?
    let locations: [SafeLocation]?
    let timestamp: String?
    let error: String?
}

struct RiskAssessmentResponse: Codable {
    let success: Bool
    let riskLevel: String
    let error: String?
}

struct VoiceResponse: Codable {
    let success: Bool
    let audio: String
    let format: String
    let voice: String
    let error: String?
}

// MARK: - Stacy API Service
class StacyAPIService: ObservableObject {
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let baseURL = "http://10.37.100.192:3000/api/stacy" // Your machine's IP address
    private let session = URLSession.shared
    
    // MARK: - Emergency API Calls
    
    func updateCaseFile(caseId: String, updates: [String: Any]) async -> Result<CaseFile, Error> {
        return await makeRequest(
            endpoint: "/emergency",
            method: "POST",
            body: [
                "action": "update_casefile",
                "data": [
                    "caseId": caseId,
                    "updates": updates
                ]
            ]
        )
    }
    
    func notifyEmergencyContact(contact: EmergencyContact, caseFile: CaseFile, message: String) async -> Result<SMSResponse, Error> {
        return await makeRequest(
            endpoint: "/emergency",
            method: "POST",
            body: [
                "action": "notify_emergency_contact",
                "data": [
                    "contact": contact,
                    "caseFile": caseFile,
                    "message": message
                ]
            ]
        )
    }
    
    func callDemoEmergency(caseFile: CaseFile, briefingScript: String) async -> Result<VoiceCallResponse, Error> {
        return await makeRequest(
            endpoint: "/emergency",
            method: "POST",
            body: [
                "action": "call_demo_emergency",
                "data": [
                    "caseFile": caseFile,
                    "briefingScript": briefingScript
                ]
            ]
        )
    }
    
    func getSafeLocations(location: CLLocation, radius: Double = 5000) async -> Result<[SafeLocation], Error> {
        let result: Result<SafeLocationsResponse, Error> = await makeRequest(
            endpoint: "/emergency",
            method: "POST",
            body: [
                "action": "get_safe_locations",
                "data": [
                    "location": [
                        "lat": location.coordinate.latitude,
                        "lng": location.coordinate.longitude
                    ],
                    "radius": radius
                ]
            ]
        )
        
        switch result {
        case .success(let response):
            return .success(response.safeLocations)
        case .failure(let error):
            return .failure(error)
        }
    }
    
    func sendContactSMS(phoneNumber: String, message: String, location: CLLocation?) async -> Result<SMSResponse, Error> {
        var data: [String: Any] = [
            "phoneNumber": phoneNumber,
            "message": message
        ]
        
        if let location = location {
            data["location"] = [
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude
            ]
        }
        
        return await makeRequest(
            endpoint: "/emergency",
            method: "POST",
            body: [
                "action": "send_contact_sms",
                "data": data
            ]
        )
    }
    
    func assessRisk(message: String) async -> Result<String, Error> {
        let result: Result<RiskAssessmentResponse, Error> = await makeRequest(
            endpoint: "/emergency",
            method: "POST",
            body: [
                "action": "assess_risk",
                "data": [
                    "message": message
                ]
            ]
        )
        
        switch result {
        case .success(let response):
            return .success(response.riskLevel)
        case .failure(let error):
            return .failure(error)
        }
    }
    
    // MARK: - Voice API Calls
    
    func generateVoice(text: String, voice: String = "nova") async -> Result<Data, Error> {
        let result: Result<VoiceResponse, Error> = await makeRequest(
            endpoint: "/voice",
            method: "POST",
            body: [
                "text": text,
                "voice": voice
            ]
        )
        
        switch result {
        case .success(let response):
            if let audioData = Data(base64Encoded: response.audio) {
                return .success(audioData)
            } else {
                return .failure(APIError.serverError("Failed to decode audio data"))
            }
        case .failure(let error):
            return .failure(error)
        }
    }
    
    // MARK: - Voice Call API
    
    func callEmergencyDispatch(phoneNumber: String, userLocation: CLLocation?, emergencyContacts: [EmergencyContact], conversationContext: ConversationContext?) async -> Result<VoiceCallResponse, Error> {
        var body: [String: Any] = [
            "phone_number": phoneNumber
        ]
        
        if let location = userLocation {
            body["user_location"] = [
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy
            ]
        }
        
        if let contacts = emergencyContacts as [Any]? {
            body["emergency_contacts"] = contacts
        }
        
        if let context = conversationContext {
            body["conversation_context"] = context
        }
        
        return await makeRequest(
            endpoint: "/voice-call",
            method: "POST",
            body: body
        )
    }
    
    // MARK: - Mobile API Calls
    
    func quickAlert(location: CLLocation, message: String, emergencyContact: EmergencyContact) async -> Result<SMSResponse, Error> {
        return await makeRequest(
            endpoint: "/mobile",
            method: "POST",
            body: [
                "action": "quick_alert",
                "location": [
                    "lat": location.coordinate.latitude,
                    "lng": location.coordinate.longitude
                ],
                "message": message,
                "emergency_contact": emergencyContact
            ]
        )
    }
    
    func checkIn(message: String, location: CLLocation?) async -> Result<MobileAPIResponse, Error> {
        var body: [String: Any] = [
            "action": "check_in",
            "message": message
        ]
        
        if let location = location {
            body["location"] = [
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude
            ]
        }
        
        return await makeRequest(
            endpoint: "/mobile",
            method: "POST",
            body: body
        )
    }
    
    func findHelp(location: CLLocation, type: String? = nil) async -> Result<MobileAPIResponse, Error> {
        var body: [String: Any] = [
            "action": "find_help",
            "location": [
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude
            ]
        ]
        
        if let type = type {
            body["type"] = type
        }
        
        return await makeRequest(
            endpoint: "/mobile",
            method: "POST",
            body: body
        )
    }
    
    func stealthMode(contactPhone: String, codeWord: String, location: CLLocation) async -> Result<SMSResponse, Error> {
        return await makeRequest(
            endpoint: "/mobile",
            method: "POST",
            body: [
                "action": "stealth_mode",
                "contact_phone": contactPhone,
                "code_word": codeWord,
                "location": [
                    "lat": location.coordinate.latitude,
                    "lng": location.coordinate.longitude
                ]
            ]
        )
    }
    
    // MARK: - Chat API
    
    func sendChatMessage(message: String, location: CLLocation?, sessionId: String, mode: String = "voice") async -> Result<ChatResponse, Error> {
        var body: [String: Any] = [
            "message": message,
            "sessionId": sessionId,
            "mode": mode
        ]
        
        if let location = location {
            body["location"] = [
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy
            ]
        }
        
        return await makeRequest(
            endpoint: "/chat",
            method: "POST",
            body: body
        )
    }
    
    // MARK: - Generic Request Method
    
    private func makeRequest<T: Codable>(endpoint: String, method: String, body: [String: Any]) async -> Result<T, Error> {
        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }
        
        guard let url = URL(string: baseURL + endpoint) else {
            await MainActor.run {
                isLoading = false
                errorMessage = "Invalid URL"
            }
            return .failure(APIError.invalidURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            await MainActor.run {
                isLoading = false
                errorMessage = "Failed to encode request body"
            }
            return .failure(error)
        }
        
        do {
            let (data, response) = try await session.data(for: request)
            
            await MainActor.run {
                isLoading = false
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                await MainActor.run {
                    errorMessage = "Invalid response"
                }
                return .failure(APIError.invalidResponse)
            }
            
            if httpResponse.statusCode == 200 {
                let decodedResponse = try JSONDecoder().decode(T.self, from: data)
                return .success(decodedResponse)
            } else {
                let errorData = try JSONDecoder().decode([String: String].self, from: data)
                let errorMessage = errorData["error"] ?? "Unknown error"
                await MainActor.run {
                    self.errorMessage = errorMessage
                }
                return .failure(APIError.serverError(errorMessage))
            }
        } catch {
            await MainActor.run {
                isLoading = false
                errorMessage = error.localizedDescription
            }
            return .failure(error)
        }
    }
}

// MARK: - API Errors
enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .serverError(let message):
            return message
        }
    }
}

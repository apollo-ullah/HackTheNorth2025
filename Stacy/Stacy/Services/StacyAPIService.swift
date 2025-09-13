import Foundation
import CoreLocation

// MARK: - Request Models
struct CaseFileUpdateRequest: Codable {
    let caseId: String
    let updates: [String: String]
}

struct EmergencyContactRequest: Codable {
    let contact: EmergencyContact
    let message: String
}

struct SafeLocationsRequest: Codable {
    let location: LocationData
    let radius: Int
}

struct SMSRequest: Codable {
    let phoneNumber: String
    let message: String
}

struct RiskAssessmentRequest: Codable {
    let message: String
    let location: LocationData?
}

struct VoiceRequest: Codable {
    let text: String
    let voice: String
}

struct EmergencyCallRequest: Codable {
    let contacts: [EmergencyContact]
    let message: String
}

struct MobileActionRequest: Codable {
    let action: String
    let data: [String: String]
}

struct ChatRequest: Codable {
    let message: String
    let location: LocationData?
    let sessionId: String
    let mode: String
}

struct EmergencyRequest: Codable {
    let action: String
    let data: EmergencyData
}

struct EmergencyData: Codable {
    let caseId: String?
    let updates: [String: String]?
    let contact: EmergencyContact?
    let caseFile: CaseFile?
    let message: String?
    let location: LocationData?
    let radius: Int?
    let phoneNumber: String?
    let contacts: [EmergencyContact]?
    let briefingScript: String?
}

struct VoiceCallRequest: Codable {
    let phone_number: String
    let user_location: LocationData?
    let emergency_contacts: [EmergencyContact]
    let conversation_context: ConversationContext?
}

struct MobileRequest: Codable {
    let action: String
    let message: String?
    let location: LocationData?
    let type: String?
    let emergency_contact: EmergencyContact?
    let contact_phone: String?
    let code_word: String?
}

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
    
    func updateCaseFile(caseId: String, updates: [String: String]) async -> Result<CaseFile, Error> {
        let data = EmergencyData(
            caseId: caseId,
            updates: updates,
            contact: nil,
            caseFile: nil,
            message: nil,
            location: nil,
            radius: nil,
            phoneNumber: nil,
            contacts: nil,
            briefingScript: nil
        )
        let request = EmergencyRequest(action: "update_casefile", data: data)
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<CaseFile>(endpoint: "/emergency", method: "POST", body: requestData)
        } catch {
            return .failure(error)
        }
    }
    
    func notifyEmergencyContact(contact: EmergencyContact, caseFile: CaseFile, message: String) async -> Result<SMSResponse, Error> {
        let data = EmergencyData(
            caseId: nil,
            updates: nil,
            contact: contact,
            caseFile: caseFile,
            message: message,
            location: nil,
            radius: nil,
            phoneNumber: nil,
            contacts: nil,
            briefingScript: nil
        )
        let request = EmergencyRequest(action: "notify_emergency_contact", data: data)
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<SMSResponse>(endpoint: "/emergency", method: "POST", body: requestData)
        } catch {
            return .failure(error)
        }
    }
    
    func callDemoEmergency(caseFile: CaseFile, briefingScript: String) async -> Result<VoiceCallResponse, Error> {
        let data = EmergencyData(
            caseId: nil,
            updates: nil,
            contact: nil,
            caseFile: caseFile,
            message: nil,
            location: nil,
            radius: nil,
            phoneNumber: nil,
            contacts: nil,
            briefingScript: briefingScript
        )
        let request = EmergencyRequest(action: "call_demo_emergency", data: data)
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<VoiceCallResponse>(endpoint: "/emergency", method: "POST", body: requestData)
        } catch {
            return .failure(error)
        }
    }
    
    func getSafeLocations(location: CLLocation, radius: Double = 5000) async -> Result<[SafeLocation], Error> {
        let locationData = LocationData(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy,
            address: nil
        )
        
        let data = EmergencyData(
            caseId: nil,
            updates: nil,
            contact: nil,
            caseFile: nil,
            message: nil,
            location: locationData,
            radius: Int(radius),
            phoneNumber: nil,
            contacts: nil,
            briefingScript: nil
        )
        let request = EmergencyRequest(action: "get_safe_locations", data: data)
        do {
            let requestData = try JSONEncoder().encode(request)
            let result: Result<SafeLocationsResponse, Error> = await makeRequest(
                endpoint: "/emergency",
                method: "POST",
                body: requestData
            )
        
            switch result {
            case .success(let response):
                return .success(response.safeLocations)
            case .failure(let error):
                return .failure(error)
            }
        } catch {
            return .failure(error)
        }
    }
    
    func sendContactSMS(phoneNumber: String, message: String, location: CLLocation?) async -> Result<SMSResponse, Error> {
        let locationData: LocationData?
        if let location = location {
            locationData = LocationData(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy,
                address: nil
            )
        } else {
            locationData = nil
        }
        
        let data = EmergencyData(
            caseId: nil,
            updates: nil,
            contact: nil,
            caseFile: nil,
            message: message,
            location: locationData,
            radius: nil,
            phoneNumber: phoneNumber,
            contacts: nil,
            briefingScript: nil
        )
        let request = EmergencyRequest(action: "send_contact_sms", data: data)
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<SMSResponse>(endpoint: "/emergency", method: "POST", body: requestData)
        } catch {
            return .failure(error)
        }
    }
    
    func assessRisk(message: String) async -> Result<String, Error> {
        let data = EmergencyData(
            caseId: nil,
            updates: nil,
            contact: nil,
            caseFile: nil,
            message: message,
            location: nil,
            radius: nil,
            phoneNumber: nil,
            contacts: nil,
            briefingScript: nil
        )
        let request = EmergencyRequest(action: "assess_risk", data: data)
        do {
            let requestData = try JSONEncoder().encode(request)
            let result: Result<RiskAssessmentResponse, Error> = await makeRequest(
                endpoint: "/emergency",
                method: "POST",
                body: requestData
            )
        
            switch result {
            case .success(let response):
                return .success(response.riskLevel)
            case .failure(let error):
                return .failure(error)
            }
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - Voice API Calls
    
    func generateVoice(text: String, voice: String = "nova") async -> Result<Data, Error> {
        let request = VoiceRequest(text: text, voice: voice)
        do {
            let requestData = try JSONEncoder().encode(request)
            let result: Result<VoiceResponse, Error> = await makeRequest(
                endpoint: "/voice",
                method: "POST",
                body: requestData
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
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - Voice Call API
    
    func callEmergencyDispatch(phoneNumber: String, userLocation: CLLocation?, emergencyContacts: [EmergencyContact], conversationContext: ConversationContext?) async -> Result<VoiceCallResponse, Error> {
        let locationData: LocationData?
        if let location = userLocation {
            locationData = LocationData(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy,
                address: nil
            )
        } else {
            locationData = nil
        }
        
        let request = VoiceCallRequest(
            phone_number: phoneNumber,
            user_location: locationData,
            emergency_contacts: emergencyContacts,
            conversation_context: conversationContext
        )
        
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<VoiceCallResponse>(
                endpoint: "/voice-call",
                method: "POST",
                body: requestData
            )
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - Mobile API Calls
    
    func quickAlert(location: CLLocation, message: String, emergencyContact: EmergencyContact) async -> Result<SMSResponse, Error> {
        let locationData = LocationData(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy,
            address: nil
        )
        
        let request = MobileRequest(
            action: "quick_alert",
            message: message,
            location: locationData,
            type: nil,
            emergency_contact: emergencyContact,
            contact_phone: nil,
            code_word: nil
        )
        
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<SMSResponse>(
                endpoint: "/mobile",
                method: "POST",
                body: requestData
            )
        } catch {
            return .failure(error)
        }
    }
    
    func checkIn(message: String, location: CLLocation?) async -> Result<MobileAPIResponse, Error> {
        let locationData: LocationData?
        if let location = location {
            locationData = LocationData(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy,
                address: nil
            )
        } else {
            locationData = nil
        }
        
        let request = MobileRequest(
            action: "check_in",
            message: message,
            location: locationData,
            type: nil,
            emergency_contact: nil,
            contact_phone: nil,
            code_word: nil
        )
        
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<MobileAPIResponse>(
                endpoint: "/mobile",
                method: "POST",
                body: requestData
            )
        } catch {
            return .failure(error)
        }
    }
    
    func findHelp(location: CLLocation, type: String? = nil) async -> Result<MobileAPIResponse, Error> {
        let locationData = LocationData(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy,
            address: nil
        )
        
        let request = MobileRequest(
            action: "find_help",
            message: nil,
            location: locationData,
            type: type,
            emergency_contact: nil,
            contact_phone: nil,
            code_word: nil
        )
        
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<MobileAPIResponse>(
                endpoint: "/mobile",
                method: "POST",
                body: requestData
            )
        } catch {
            return .failure(error)
        }
    }
    
    func stealthMode(contactPhone: String, codeWord: String, location: CLLocation) async -> Result<SMSResponse, Error> {
        let locationData = LocationData(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy,
            address: nil
        )
        
        let request = MobileRequest(
            action: "stealth_mode",
            message: nil,
            location: locationData,
            type: nil,
            emergency_contact: nil,
            contact_phone: contactPhone,
            code_word: codeWord
        )
        
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<SMSResponse>(
                endpoint: "/mobile",
                method: "POST",
                body: requestData
            )
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - Chat API
    
    func sendChatMessage(message: String, location: CLLocation?, sessionId: String, mode: String = "voice") async -> Result<ChatResponse, Error> {
        let locationData: LocationData?
        if let location = location {
            locationData = LocationData(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy,
                address: nil
            )
        } else {
            locationData = nil
        }
        
        let request = ChatRequest(
            message: message,
            location: locationData,
            sessionId: sessionId,
            mode: mode
        )
        
        do {
            let requestData = try JSONEncoder().encode(request)
            return await makeRequest<ChatResponse>(
                endpoint: "/chat",
                method: "POST",
                body: requestData
            )
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - Generic Request Method
    
    private func makeRequest<T: Codable>(endpoint: String, method: String, body: Data?) async -> Result<T, Error> {
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
        
        if let body = body {
            request.httpBody = body
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

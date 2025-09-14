import Foundation
import CoreLocation

// MARK: - Request/Response Models
struct ChatRequest: Codable {
    let message: String
    let messages: [Message]
    let location: LocationData?
    let sessionId: String
    let riskLevel: String
    let mode: String
}

struct Message: Codable {
    let role: String
    let content: String
    let timestamp: Int
}

struct LocationData: Codable {
    let lat: Double
    let lng: Double
    let accuracy: Double
}

struct ChatResponse: Codable {
    let reply: String
    let mode: String
    let riskLevel: String
    let riskChanged: Bool
    let confidence: Double
    let actions: [String]
    let reasoning: String
    let timestamp: String
    let caseFile: CaseFile?
}

struct CaseFile: Codable {
    let id: String
    let sessionId: String
    let riskLevel: String
    let location: LocationData?
    let timeline: [TimelineEvent]
}

struct TimelineEvent: Codable {
    let timestamp: String
    let event: String
    let riskLevel: String
    let aiResponse: String
}

struct EmergencyContact: Codable {
    let name: String
    let phone: String
    let relationship: String
}

struct EmergencyData: Codable {
    let emergencyContacts: [EmergencyContact]
    let location: LocationData
    let message: String
    let briefingScript: String?
}

struct SMSResponse: Codable {
    let success: Bool?
    let messageId: String?
    let error: String?
    let message: String?
}

struct VoiceCallResponse: Codable {
    let success: Bool
    let callId: String
    let error: String?
}

struct PlacesRequest: Codable {
    let location: LocationData
    let radius: Int
    let types: [String]
}

struct PlacesResponse: Codable {
    let places: [PlaceData]
    let success: Bool
    let error: String?
}

struct PlaceData: Codable {
    let name: String
    let address: String
    let latitude: Double
    let longitude: Double
    let type: String
    let distance: Double
}

// MARK: - AnyCodable for flexible JSON handling
struct AnyCodable: Codable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.typeMismatch(AnyCodable.self, DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported type"))
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        if let string = value as? String {
            try container.encode(string)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else if let array = value as? [Any] {
            try container.encode(array.map { AnyCodable($0) })
        } else if let dict = value as? [String: Any] {
            try container.encode(dict.mapValues { AnyCodable($0) })
        } else {
            throw EncodingError.invalidValue(value, EncodingError.Context(codingPath: encoder.codingPath, debugDescription: "Unsupported type"))
        }
    }
}

// MARK: - StacyAPIService
class StacyAPIService: ObservableObject {
    private let baseURL = "http://10.37.116.84:8080/api/stacy" // Using port 8080 for physical iPhone
    
    private var urlSession: URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10.0
        config.timeoutIntervalForResource = 30.0
        return URLSession(configuration: config)
    }
    
    // MARK: - Generic Request Method
    private func makeRequest<T: Codable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        responseType: T.Type
    ) async -> Result<T, Error> {
        
        print("🌐 MAKE REQUEST - Starting request to \(baseURL)\(endpoint)")
        print("🌐 MAKE REQUEST - Method: \(method)")
        print("🌐 MAKE REQUEST - Body size: \(body?.count ?? 0) bytes")
        
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            print("❌ MAKE REQUEST - Invalid URL: \(baseURL)\(endpoint)")
            return .failure(URLError(.badURL))
        }
        
        print("🌐 MAKE REQUEST - Full URL: \(url.absoluteString)")
        print("🌐 MAKE REQUEST - URL is valid: \(url.absoluteString)")
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 10.0
        
        if let body = body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        
        print("🌐 MAKE REQUEST - Making network request...")
        print("🌐 MAKE REQUEST - Request URL: \(request.url?.absoluteString ?? "nil")")
        print("🌐 MAKE REQUEST - Request method: \(request.httpMethod ?? "nil")")
        print("🌐 MAKE REQUEST - Request headers: \(request.allHTTPHeaderFields ?? [:])")
        
        do {
            let (data, response) = try await urlSession.data(for: request)
            
            if let httpResponse = response as? HTTPURLResponse {
                print("🌐 MAKE REQUEST - Response status: \(httpResponse.statusCode)")
                print("🌐 MAKE REQUEST - Response headers: \(httpResponse.allHeaderFields)")
            }
            
            print("🌐 MAKE REQUEST - Response data size: \(data.count) bytes")
            if let responseString = String(data: data, encoding: .utf8) {
                print("🌐 MAKE REQUEST - Response content: \(responseString)")
            }
            
            let decoder = JSONDecoder()
            let result = try decoder.decode(T.self, from: data)
            print("✅ MAKE REQUEST - Successfully decoded response")
            return .success(result)
            
        } catch {
            print("❌ MAKE REQUEST - Network error: \(error)")
            return .failure(error)
        }
    }
    
    // MARK: - Chat API
    func sendChatMessage(
        message: String,
        sessionId: String,
        mode: String = "text",
        location: CLLocationCoordinate2D? = nil
    ) async -> Result<ChatResponse, Error> {
        
        print("📡 STACY API SERVICE - sendChatMessage called")
        print("📡 STACY API SERVICE - Message: '\(message)'")
        print("📡 STACY API SERVICE - Session ID: '\(sessionId)'")
        print("📡 STACY API SERVICE - Mode: '\(mode)'")
        print("📡 STACY API SERVICE - Location: \(location?.latitude ?? 0), \(location?.longitude ?? 0)")
        
        let request = ChatRequest(
            message: message,
            messages: [], // Empty for now
            location: location.map { LocationData(lat: $0.latitude, lng: $0.longitude, accuracy: 10.0) },
            sessionId: sessionId,
            riskLevel: "SAFE",
            mode: mode
        )
        
        print("📡 STACY API SERVICE - Making request to /chat")
        
        do {
            let body = try JSONEncoder().encode(request)
            let result: Result<ChatResponse, Error> = await makeRequest(
                endpoint: "/chat",
                method: "POST",
                body: body,
                responseType: ChatResponse.self
            )
            
            print("📡 STACY API SERVICE - Request completed, result: \(result)")
            return result
            
        } catch {
            print("📡 STACY API SERVICE - Encoding error: \(error)")
            return .failure(error)
        }
    }
    
    // MARK: - Emergency Contact Alert
    func alertEmergencyContacts(
        emergencyContacts: [EmergencyContact],
        location: CLLocationCoordinate2D,
        message: String
    ) async -> Result<SMSResponse, Error> {
        
        print("📱 EMERGENCY CONTACT ALERT - Starting")
        print("📱 EMERGENCY CONTACT ALERT - Contacts count: \(emergencyContacts.count)")
        print("📱 EMERGENCY CONTACT ALERT - Location: \(location.latitude), \(location.longitude)")
        print("📱 EMERGENCY CONTACT ALERT - Message: '\(message)'")
        
        // Use the same format as callEmergencyDispatch for consistency
        guard let firstContact = emergencyContacts.first else {
            print("❌ EMERGENCY CONTACT ALERT - No emergency contacts provided")
            return .failure(NSError(domain: "EmergencyAlert", code: 400, userInfo: [NSLocalizedDescriptionKey: "No emergency contacts provided"]))
        }
        
        let requestData: [String: Any] = [
            "action": "panic_alert",
            "location": [
                "lat": location.latitude,
                "lng": location.longitude,
                "accuracy": 10.0
            ],
            "emergency_contact": [
                "name": firstContact.name,
                "phone": firstContact.phone,
                "relationship": firstContact.relationship
            ]
        ]
        
        do {
            let body = try JSONSerialization.data(withJSONObject: requestData)
            let result: Result<SMSResponse, Error> = await makeRequest(
                endpoint: "/mobile",
                method: "POST",
                body: body,
                responseType: SMSResponse.self
            )
            
            print("📱 EMERGENCY CONTACT ALERT - Request completed, result: \(result)")
            return result
            
        } catch {
            print("📱 EMERGENCY CONTACT ALERT - Encoding error: \(error)")
            return .failure(error)
        }
    }
    
    // MARK: - Emergency Dispatch Call
    func callEmergencyDispatch(
        phone: String,
        location: CLLocationCoordinate2D,
        emergencyContacts: [EmergencyContact]
    ) async -> Result<SMSResponse, Error> {
        
        print("📞 EMERGENCY DISPATCH CALL - Starting")
        print("📞 EMERGENCY DISPATCH CALL - Phone: \(phone)")
        print("📞 EMERGENCY DISPATCH CALL - Location: \(location.latitude), \(location.longitude)")
        print("📞 EMERGENCY DISPATCH CALL - Emergency contacts count: \(emergencyContacts.count)")
        
        let requestData: [String: Any] = [
            "action": "panic_alert",
            "phone": phone,
            "location": [
                "lat": location.latitude,
                "lng": location.longitude,
                "accuracy": 10.0
            ],
            "emergencyContacts": emergencyContacts.map { contact in
                [
                    "name": contact.name,
                    "phone": contact.phone,
                    "relationship": contact.relationship
                ]
            }
        ]
        
        print("📞 EMERGENCY DISPATCH CALL - Request data size: \(requestData.description.count) bytes")
        print("📞 EMERGENCY DISPATCH CALL - Making request to /mobile")
        
        do {
            let body = try JSONSerialization.data(withJSONObject: requestData)
            let result: Result<SMSResponse, Error> = await makeRequest(
                endpoint: "/mobile",
                method: "POST",
                body: body,
                responseType: SMSResponse.self
            )
            
            print("📞 EMERGENCY DISPATCH CALL - Request completed, result: \(result)")
            return result
            
        } catch {
            print("📞 EMERGENCY DISPATCH CALL - Encoding error: \(error)")
            return .failure(error)
        }
    }
    
    // MARK: - Places Search
    func searchPlaces(
        location: CLLocationCoordinate2D,
        radius: Int = 1000,
        types: [String] = ["police", "hospital", "fire_station"]
    ) async -> Result<PlacesResponse, Error> {
        
        print("🔍 PLACES SEARCH - Starting")
        print("🔍 PLACES SEARCH - Location: \(location.latitude), \(location.longitude)")
        print("🔍 PLACES SEARCH - Radius: \(radius)")
        print("🔍 PLACES SEARCH - Types: \(types)")
        
        let request = PlacesRequest(
            location: LocationData(lat: location.latitude, lng: location.longitude, accuracy: 10.0),
            radius: radius,
            types: types
        )
        
        do {
            let body = try JSONEncoder().encode(request)
            let result: Result<PlacesResponse, Error> = await makeRequest(
                endpoint: "/places",
                method: "POST",
                body: body,
                responseType: PlacesResponse.self
            )
            
            print("🔍 PLACES SEARCH - Request completed, result: \(result)")
            return result
            
        } catch {
            print("🔍 PLACES SEARCH - Encoding error: \(error)")
            return .failure(error)
        }
    }
}

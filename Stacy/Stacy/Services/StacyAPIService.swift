import Foundation
import CoreLocation
import MapKit

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
    let mode: String?
    let riskLevel: String?
    let riskChanged: Bool?
    let confidence: Double?
    let actions: [String]?
    let reasoning: String?
    let timestamp: String?
    let caseFile: CaseFile?
    let fallback: Bool?  // Backend returns 'fallback' instead of 'mode' sometimes
    let sessionId: String?
    let model: String?
    
    // Computed property to get the actual mode
    var actualMode: String {
        if let fallback = fallback, fallback {
            return "fallback"
        }
        return mode ?? "unknown"
    }
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
    let locations: [PlaceData]  // Backend returns 'locations', not 'places'
    let success: Bool
    let error: String?
    
    // Computed property for backward compatibility
    var places: [PlaceData] {
        return locations
    }
}

struct PlaceData: Codable {
    let name: String
    let address: String?
    let latitude: Double
    let longitude: Double
    let type: String
    let distance: Double
    
    // Coding keys to map backend field names
    private enum CodingKeys: String, CodingKey {
        case name, type, distance
        case latitude = "lat"
        case longitude = "lng"
        case address
    }
    
    // Computed properties for backward compatibility
    var lat: Double { return latitude }
    var lng: Double { return longitude }
}

struct CaseFileResponse: Codable {
    let success: Bool
    let case_file: [String: AnyCodable]
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
    private let baseURL = "http://10.37.116.84:3000/api" // Updated to match new Express.js backend
    
    private var urlSession: URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10.0
        config.timeoutIntervalForResource = 30.0
        return URLSession(configuration: config)
    }
    
    // MARK: - New Backend API Methods
    
    func sendSMSAction(sessionId: String, phone: String, message: String, location: CLLocation?, reason: String = "user_confirmed") async -> Result<SMSResponse, Error> {
        let locationData: LocationData?
        if let location = location {
            locationData = LocationData(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy
            )
        } else {
            locationData = nil
        }
        
        let requestData: [String: Any] = [
            "sessionId": sessionId,
            "phone": phone,
            "message": message,
            "lat": locationData?.lat as Any,
            "lng": locationData?.lng as Any,
            "reason": reason
        ]
        
        do {
            let body = try JSONSerialization.data(withJSONObject: requestData)
            return await makeRequest<SMSResponse>(
                endpoint: "/action/sms",
                method: "POST",
                body: body,
                responseType: SMSResponse.self
            )
        } catch {
            return .failure(error)
        }
    }
    
    func makePhoneCall(sessionId: String, phone: String, script: String, location: CLLocation?, reason: String = "user_confirmed") async -> Result<VoiceCallResponse, Error> {
        let locationData: LocationData?
        if let location = location {
            locationData = LocationData(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy
            )
        } else {
            locationData = nil
        }
        
        let requestData: [String: Any] = [
            "sessionId": sessionId,
            "phone": phone,
            "script": script,
            "lat": locationData?.lat as Any,
            "lng": locationData?.lng as Any,
            "reason": reason
        ]
        
        do {
            let body = try JSONSerialization.data(withJSONObject: requestData)
            return await makeRequest<VoiceCallResponse>(
                endpoint: "/action/call",
                method: "POST",
                body: body,
                responseType: VoiceCallResponse.self
            )
        } catch {
            return .failure(error)
        }
    }
    
    func getSafeLocations(sessionId: String, location: CLLocation, radius: Int = 1000) async -> Result<PlacesResponse, Error> {
        let locationData = LocationData(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy
        )
        
        let requestData: [String: Any] = [
            "sessionId": sessionId,
            "lat": locationData.lat,
            "lng": locationData.lng,
            "radius_m": radius
        ]
        
        do {
            let body = try JSONSerialization.data(withJSONObject: requestData)
            return await makeRequest<PlacesResponse>(
                endpoint: "/action/safe-locations",
                method: "POST",
                body: body,
                responseType: PlacesResponse.self
            )
        } catch {
            return .failure(error)
        }
    }
    
    func notifyEmergencyContact(sessionId: String, userName: String, triggerReason: String = "user_request") async -> Result<SMSResponse, Error> {
        let requestData: [String: Any] = [
            "sessionId": sessionId,
            "userName": userName,
            "triggerReason": triggerReason
        ]
        
        do {
            let body = try JSONSerialization.data(withJSONObject: requestData)
            return await makeRequest<SMSResponse>(
                endpoint: "/emergency/notify",
                method: "POST",
                body: body,
                responseType: SMSResponse.self
            )
        } catch {
            return .failure(error)
        }
    }
    
    func updateCaseFile(sessionId: String, updates: [String: Any]) async -> Result<CaseFileResponse, Error> {
        do {
            let body = try JSONSerialization.data(withJSONObject: updates)
            return await makeRequest<CaseFileResponse>(
                endpoint: "/casefile/\(sessionId)/update",
                method: "POST",
                body: body,
                responseType: CaseFileResponse.self
            )
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - MapKit Safe Places Search
    func searchSafePlacesNearby(location: CLLocation, radius: Int = 1000) async -> Result<[PlaceData], Error> {
        print("🗺️ MAPKIT SEARCH - Starting search for safe places")
        print("   Location: \(location.coordinate)")
        print("   Radius: \(radius)m")
        
        // Use specific search terms that MapKit will understand better
        let safePlaceSearches = [
            ("police station", "police_station"),
            ("police department", "police_station"), 
            ("hospital", "hospital"),
            ("emergency room", "hospital"),
            ("fire station", "fire_station"),
            ("fire department", "fire_station"),
            ("pharmacy", "pharmacy"),
            ("drugstore", "pharmacy"),
            ("gas station", "gas_station"),
            ("24 hour restaurant", "restaurant"),
            ("24 hour cafe", "cafe"),
            ("hotel", "hotel"),
            ("bank", "bank"),
            ("library", "library"),
            ("community center", "community_center")
        ]
        
        var allPlaces: [PlaceData] = []
        
        for (searchTerm, category) in safePlaceSearches {
            do {
                let places = try await searchPlacesByType(searchTerm, location: location, radius: radius)
                // Update the category for each place
                let categorizedPlaces = places.map { place in
                    PlaceData(
                        name: place.name,
                        address: place.address,
                        latitude: place.latitude,
                        longitude: place.longitude,
                        type: category,
                        distance: place.distance
                    )
                }
                allPlaces.append(contentsOf: categorizedPlaces)
                print("🗺️ MAPKIT SEARCH - Found \(places.count) \(searchTerm) places")
            } catch {
                print("❌ MAPKIT SEARCH - Failed to search \(searchTerm): \(error)")
            }
        }
        
        // Remove duplicates based on name and location
        let uniquePlaces = removeDuplicatePlaces(allPlaces)
        
        // Sort by distance and prioritize police stations and hospitals
        let sortedPlaces = uniquePlaces.sorted { place1, place2 in
            // Prioritize police stations and hospitals
            let priority1 = getPriority(place1.type)
            let priority2 = getPriority(place2.type)
            
            if priority1 != priority2 {
                return priority1 > priority2
            }
            
            // If same priority, sort by distance
            return place1.distance < place2.distance
        }
        
        let topPlaces = Array(sortedPlaces.prefix(10))
        
        print("✅ MAPKIT SEARCH - Found \(topPlaces.count) total safe places")
        for place in topPlaces {
            print("   - \(place.name) (\(place.type)) - \(Int(place.distance))m")
        }
        
        return .success(topPlaces)
    }
    
    private func searchPlacesByType(_ type: String, location: CLLocation, radius: Int) async throws -> [PlaceData] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = type
        request.region = MKCoordinateRegion(
            center: location.coordinate,
            latitudinalMeters: Double(radius * 2),
            longitudinalMeters: Double(radius * 2)
        )
        // Limit results to reduce search time
        request.resultTypes = [.pointOfInterest]
        
        let search = MKLocalSearch(request: request)
        let response = try await search.start()
        
        return response.mapItems.compactMap { mapItem in
            let placemark = mapItem.placemark
            guard let name = placemark.name ?? mapItem.name else {
                return nil
            }
            
            let placeLocation = CLLocation(
                latitude: placemark.coordinate.latitude,
                longitude: placemark.coordinate.longitude
            )
            let distance = location.distance(from: placeLocation)
            
            return PlaceData(
                name: name,
                address: formatAddress(placemark),
                latitude: placemark.coordinate.latitude,
                longitude: placemark.coordinate.longitude,
                type: type,
                distance: distance
            )
        }
    }
    
    private func formatAddress(_ placemark: CLPlacemark) -> String {
        var addressComponents: [String] = []
        
        if let streetNumber = placemark.subThoroughfare {
            addressComponents.append(streetNumber)
        }
        if let streetName = placemark.thoroughfare {
            addressComponents.append(streetName)
        }
        if let city = placemark.locality {
            addressComponents.append(city)
        }
        if let state = placemark.administrativeArea {
            addressComponents.append(state)
        }
        
        return addressComponents.joined(separator: " ")
    }
    
    private func removeDuplicatePlaces(_ places: [PlaceData]) -> [PlaceData] {
        var seenPlaces: Set<String> = []
        var uniquePlaces: [PlaceData] = []
        
        for place in places {
            // Create a unique identifier based on name and location
            let identifier = "\(place.name.lowercased())_\(Int(place.latitude * 1000))_\(Int(place.longitude * 1000))"
            
            if !seenPlaces.contains(identifier) {
                seenPlaces.insert(identifier)
                uniquePlaces.append(place)
            }
        }
        
        return uniquePlaces
    }
    
    private func getPriority(_ type: String) -> Int {
        switch type {
        case "police_station":
            return 10  // Highest priority
        case "hospital":
            return 9
        case "fire_station":
            return 8
        case "pharmacy":
            return 7
        case "gas_station":
            return 6
        case "bank":
            return 5
        case "library":
            return 4
        case "community_center":
            return 3
        case "hotel":
            return 2
        case "restaurant", "cafe":
            return 1  // Lowest priority
        default:
            return 0
        }
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

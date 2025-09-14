import SwiftUI
import CoreLocation

struct TestButtonsView: View {
    @StateObject private var apiService = StacyAPIService()
    @StateObject private var locationManager = LocationManager()
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var alertTitle = ""
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.02, green: 0.06, blue: 0.23)
                    .ignoresSafeArea()
                
                VStack(spacing: 30) {
                    // Header
                    VStack(spacing: 10) {
                        Text("Test Features")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        
                        Text("Test backend integration features")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .padding(.top)
                    
                    // Test Buttons
                    VStack(spacing: 20) {
                        // Test Safe Places Button
                        TestButton(
                            title: "Test Safe Places",
                            subtitle: "Find nearby safe locations",
                            icon: "location.fill",
                            color: .blue,
                            isLoading: apiService.isLoading,
                            action: testSafePlaces
                        )
                        
                        // Test Emergency Alert Button
                        TestButton(
                            title: "Test Emergency Alert",
                            subtitle: "Send SMS to emergency contact",
                            icon: "exclamationmark.triangle.fill",
                            color: .orange,
                            isLoading: apiService.isLoading,
                            action: testEmergencyAlert
                        )
                        
                        // Test Emergency Call Button
                        TestButton(
                            title: "Test Emergency Call",
                            subtitle: "Call emergency dispatch",
                            icon: "phone.fill",
                            color: .red,
                            isLoading: apiService.isLoading,
                            action: testEmergencyCall
                        )
                        
                        // Test Risk Assessment Button
                        TestButton(
                            title: "Test Risk Assessment",
                            subtitle: "Assess message risk level",
                            icon: "brain.head.profile",
                            color: .purple,
                            isLoading: apiService.isLoading,
                            action: testRiskAssessment
                        )
                        
                        // Test Chat API Button
                        TestButton(
                            title: "Test Chat API",
                            subtitle: "Send message to Stacy AI",
                            icon: "message.fill",
                            color: .green,
                            isLoading: apiService.isLoading,
                            action: testChatAPI
                        )
                    }
                    .padding(.horizontal)
                    
                    // Status Messages
                    if let errorMessage = apiService.errorMessage {
                        VStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 30))
                                .foregroundColor(.red)
                            
                            Text(errorMessage)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.white)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        .padding(.vertical, 20)
                        .background(Color.red.opacity(0.2))
                        .cornerRadius(15)
                        .padding(.horizontal)
                    }
                    
                    Spacer()
                }
            }
        }
        .navigationBarHidden(true)
        .alert(alertTitle, isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
        .onAppear {
            if locationManager.authorizationStatus == .notDetermined {
                locationManager.requestLocationPermission()
            }
        }
    }
    
    // MARK: - Test Functions
    
    private func testSafePlaces() {
        guard let location = locationManager.location else {
            showAlert(title: "Error", message: "Location not available. Please enable location services.")
            return
        }
        
        Task {
            let result = await apiService.getSafeLocations(location: location)
            
            await MainActor.run {
                switch result {
                case .success(let safeLocations):
                    let locationsText = safeLocations.map { "• \($0.name) (\($0.type)) - \(Int($0.distance))m away" }.joined(separator: "\n")
                    showAlert(title: "Safe Places Found", message: "Found \(safeLocations.count) nearby safe locations:\n\n\(locationsText)")
                case .failure(let error):
                    showAlert(title: "Error", message: "Failed to find safe places: \(error.localizedDescription)")
                }
            }
        }
    }
    
    private func testEmergencyAlert() {
        guard let location = locationManager.location else {
            showAlert(title: "Error", message: "Location not available. Please enable location services.")
            return
        }
        
        let emergencyContact = EmergencyContact(
            name: "Test Contact",
            phone: "+15146605707", // Using the number from your backend
            relationship: "Emergency Contact",
            priority: 1
        )
        
        let message = "🚨 TEST EMERGENCY ALERT 🚨\nThis is a test message from Stacy AI Safety Companion.\nTime: \(Date().formatted())\nLocation: Test Location"
        
        Task {
            let result = await apiService.sendContactSMS(
                phoneNumber: emergencyContact.phone,
                message: message,
                location: location
            )
            
            await MainActor.run {
                switch result {
                case .success(let response):
                    if response.success {
                        showAlert(title: "SMS Sent", message: "Emergency alert sent successfully!\nMessage ID: \(response.messageId ?? "Unknown")")
                    } else {
                        showAlert(title: "SMS Failed", message: "Failed to send SMS: \(response.error ?? "Unknown error")")
                    }
                case .failure(let error):
                    showAlert(title: "Error", message: "Failed to send emergency alert: \(error.localizedDescription)")
                }
            }
        }
    }
    
    private func testEmergencyCall() {
        guard let location = locationManager.location else {
            showAlert(title: "Error", message: "Location not available. Please enable location services.")
            return
        }
        
            let emergencyContacts = [
                EmergencyContact(
                    name: "Test Contact",
                    phone: "+15146605707", // Using the number from your backend
                    relationship: "Emergency Contact",
                    priority: 1
                )
            ]
        
        let conversationContext = ConversationContext(
            sessionId: "test_session_\(Date().timeIntervalSince1970)",
            messages: [
                ChatMessage(role: "user", content: "I need help", timestamp: Int(Date().timeIntervalSince1970))
            ],
            riskLevel: "CRITICAL",
            escalated: true,
            location: LocationData(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy,
                address: "Test Location"
            ),
            incident: IncidentData(
                severity: "high",
                situation: "Test emergency situation",
                location_text: "Test location",
                location_gps: true,
                people: nil,
                suspect_desc: nil,
                caller_contact: nil,
                consent_contact_ec: "yes",
                consent_connect_dispatch: "yes",
                notes: ["Test emergency call initiated"]
            ),
            isFirstMessage: false
        )
        
        Task {
            let result = await apiService.callEmergencyDispatch(
                phoneNumber: "+15146605707", // Using the number from your backend
                userLocation: location,
                emergencyContacts: emergencyContacts,
                conversationContext: conversationContext
            )
            
            await MainActor.run {
                switch result {
                case .success(let response):
                    if response.success {
                        showAlert(title: "Emergency Call Initiated", message: "Emergency dispatch call started successfully!\nCall ID: \(response.callId ?? "Unknown")\nCase ID: \(response.caseId ?? "Unknown")")
                    } else {
                        showAlert(title: "Call Failed", message: "Failed to initiate emergency call: \(response.error ?? "Unknown error")")
                    }
                case .failure(let error):
                    showAlert(title: "Error", message: "Failed to call emergency dispatch: \(error.localizedDescription)")
                }
            }
        }
    }
    
    private func testRiskAssessment() {
        let testMessage = "I'm being followed by someone suspicious"
        
        Task {
            let result = await apiService.assessRisk(message: testMessage)
            
            await MainActor.run {
                switch result {
                case .success(let riskLevel):
                    showAlert(title: "Risk Assessment", message: "Message: \"\(testMessage)\"\n\nRisk Level: \(riskLevel)")
                case .failure(let error):
                    showAlert(title: "Error", message: "Failed to assess risk: \(error.localizedDescription)")
                }
            }
        }
    }
    
    private func testChatAPI() {
        guard let location = locationManager.location else {
            showAlert(title: "Error", message: "Location not available. Please enable location services.")
            return
        }
        
        let testMessage = "I need help finding a safe place"
        let sessionId = "test_chat_session_\(Date().timeIntervalSince1970)"
        
        Task {
            let result = await apiService.sendChatMessage(
                message: testMessage,
                location: location,
                sessionId: sessionId,
                mode: "voice"
            )
            
            await MainActor.run {
                switch result {
                case .success(let response):
                    showAlert(title: "Chat Response", message: "Message: \"\(testMessage)\"\n\nStacy's Reply: \"\(response.reply)\"\n\nAction: \(response.action ?? "None")\nRisk Level: \(response.riskLevel ?? "Unknown")")
                case .failure(let error):
                    showAlert(title: "Error", message: "Failed to send chat message: \(error.localizedDescription)")
                }
            }
        }
    }
    
    private func showAlert(title: String, message: String) {
        alertTitle = title
        alertMessage = message
        showingAlert = true
    }
}

struct TestButton: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let isLoading: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                // Icon
                ZStack {
                    Circle()
                        .fill(color.opacity(0.2))
                        .frame(width: 50, height: 50)
                    
                    Image(systemName: icon)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundColor(color)
                }
                
                // Text
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                    
                    Text(subtitle)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                }
                
                Spacer()
                
                // Loading indicator or arrow
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
            .padding(20)
            .background(Color.white.opacity(0.1))
            .cornerRadius(15)
            .overlay(
                RoundedRectangle(cornerRadius: 15)
                    .stroke(color.opacity(0.3), lineWidth: 1)
            )
        }
        .disabled(isLoading)
    }
}

#Preview {
    TestButtonsView()
}

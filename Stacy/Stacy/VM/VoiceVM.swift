//
//  VoiceVM.swift
//  Stacy
//
//  Created by Kevin He on 2025-09-10.
//

import SwiftUI
import Speech
import AVFoundation
import OpenAIRealtime
import CoreLocation
import MapKit

class VoiceVM: ObservableObject {
    @Published var isListening = false
    @Published var statusText = "Ready to help"
    @Published var transcript = ""
    @Published var lastLLMResponse = ""
    @Published var foundPlaces: [Place] = []
    @Published var isSearchingPlaces = false
    @Published var waitingForNavigationConfirmation = false
    @Published var suggestedPlace: Place?
    
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private let speechRecognizer = SFSpeechRecognizer()
    
    private var conversation: Conversation
    private var locationManager: LocationManager?
    private var placesService: PlacesService?
    private var directionsService: DirectionsService?
    private var stacyAPIService: StacyAPIService?
    
    // Flag to control when we override LLM responses
    private var isProvidingPlacesResponse = false
    private var isProcessingEmergency = false
    
    // Debouncing for help requests
    private var lastHelpRequestTime: Date = Date.distantPast
    
    // Session management for backend integration
    private var currentSessionId: String = ""
    
    init() {
        self.conversation = Conversation(authToken: "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")
        self.stacyAPIService = StacyAPIService()
        self.currentSessionId = "session_\(Date().timeIntervalSince1970)"
        
        // Set up the conversation with system prompt
        setupConversation()
    }
    
    private func setupConversation() {
        Task {
            do {
                try await conversation.whenConnected {
                    try await self.conversation.updateSession { session in
                        // Set up system prompt for safety assistant
                        session.instructions = """
                        You are Stacy, a personal safety assistant. Speak in first person and be direct.
                        
                        RESPONSE STYLE:
                        - Always use "I" statements: "I'm here to help", "I can find safe places", "I'll guide you"
                        - Be clear and concise: "I'm calling your emergency contact now"
                        - Avoid vague phrases like "the system will help" or "assistance is available"
                        
                        WHEN USERS SAY "I NEED HELP":
                        - Say: "I'm here. Are you in immediate danger right now?"
                        - Wait for their response before taking action
                        - Don't automatically start navigation unless they ask for directions
                        
                        WHEN USERS ASK FOR DIRECTIONS OR NAVIGATION:
                        - Say: "I'll find the nearest safe place and guide you there"
                        - Then activate navigation to the closest safe location
                        
                        WHEN USERS ASK FOR SAFE PLACES:
                        - Say: "I'm searching for nearby safe places now"
                        - Find locations and offer navigation
                        
                        EMERGENCY RESPONSES:
                        - "I'm calling your emergency contact now"
                        - "I'm connecting you to emergency services"
                        - "I'm sending your location to emergency contacts"
                        
                        NAVIGATION INSTRUCTIONS: Speak clearly and reassuringly:
                        - "I'm starting navigation. Turn left in 200 meters"
                        - "Next: Turn right in 150 meters"
                        - "I'm recalculating the route"
                        
                        Keep responses under 15 words. Be supportive and action-oriented.
                        """
                        
                        // Enable transcription of user's voice messages
                        session.inputAudioTranscription = Session.InputAudioTranscription()
                    }
                }
            } catch {
                print("Failed to setup conversation: \(error)")
            }
        }
    }
    
    func setServices(locationManager: LocationManager, placesService: PlacesService, directionsService: DirectionsService) {
        self.locationManager = locationManager
        self.placesService = placesService
        self.directionsService = directionsService
        
        directionsService.onNavigationInstruction = { [weak self] instruction in
            self?.sendNavigationInstructionToLLM(instruction)
        }
    }
    
    @MainActor
    func startListening() {
        startLocalSpeechRecognition()
        
        // Only start OpenAI conversation if we're not in places search mode
        if !isSearchingPlaces && !waitingForNavigationConfirmation {
            do {
                try conversation.startListening()
                self.isListening = true
                self.statusText = "Listening..."
            } catch {
                print("Failed to start OpenAI listening: \(error)")
                self.statusText = "Error starting conversation"
                stopLocalSpeechRecognition()
            }
        } else {
            self.isListening = true
            self.statusText = "Listening..."
        }
    }
    
    private func checkForHelpRequest(_ transcript: String) {
        let lowercasedTranscript = transcript.lowercased()
        let helpKeywords = [
            "help", "danger", "emergency", "police", "safe place",
            "where can i go", "find place", "shelter", "alert",
            "emergency contact", "notify", "contact"
        ]
        
        let needsHelp = helpKeywords.contains { keyword in
            lowercasedTranscript.contains(keyword)
        }
        
        if needsHelp && !isSearchingPlaces && !waitingForNavigationConfirmation {
            // Debounce help requests - only process if 3 seconds have passed since last request
            let now = Date()
            let timeSinceLastRequest = now.timeIntervalSince(lastHelpRequestTime)
            
            if timeSinceLastRequest > 3.0 {
                print("🆘 HELP REQUEST DETECTED - Processing immediately")
                lastHelpRequestTime = now
                
                // Process immediately for real-time response
                processHelpRequestImmediately(transcript)
                
                // Also send to backend for intelligent processing (but don't wait for it)
                Task {
                    await processUserMessageWithBackend(transcript)
                }
            } else {
                print("⏸️ HELP REQUEST DEBOUNCED - Too soon since last request (\(String(format: "%.1f", timeSinceLastRequest))s)")
            }
        }
    }
    
    private func processHelpRequestImmediately(_ transcript: String) {
        print("⚡ IMMEDIATE HELP PROCESSING - Starting local processing")
        print("⚡ TRANSCRIPT: '\(transcript)'")
        let lowercasedTranscript = transcript.lowercased()
        
        // Check for specific keywords to trigger immediate actions
        let safePlaceKeywords = ["safe place", "find place", "where can i go", "shelter", "police", "safe", "places"]
        let emergencyKeywords = ["emergency", "danger", "help", "alert", "contact", "notify", "call", "text"]
        
        let needsSafePlaces = safePlaceKeywords.contains { keyword in
            lowercasedTranscript.contains(keyword)
        }
        
        let needsEmergency = emergencyKeywords.contains { keyword in
            lowercasedTranscript.contains(keyword)
        }
        
        print("⚡ SAFE PLACES DETECTED: \(needsSafePlaces)")
        print("⚡ EMERGENCY DETECTED: \(needsEmergency)")
        
        if needsSafePlaces {
            print("🏃‍♂️ IMMEDIATE SAFE PLACES SEARCH - Triggering now")
            DispatchQueue.main.async {
                self.searchNearbyPlacesAutomatically()
            }
        }
        
        if needsEmergency {
            print("🚨 IMMEDIATE EMERGENCY PROCESSING - Checking for emergency contacts")
            // Check if user wants to alert emergency contacts
            let emergencyContactKeywords = ["emergency contact", "alert", "notify", "contact", "call", "text", "emergency"]
            let wantsEmergencyContact = emergencyContactKeywords.contains { keyword in
                lowercasedTranscript.contains(keyword)
            }
            
            print("⚡ EMERGENCY CONTACT REQUESTED: \(wantsEmergencyContact)")
            
            if wantsEmergencyContact && !isProcessingEmergency {
                print("📞 IMMEDIATE EMERGENCY CONTACT ALERT - Triggering now")
                isProcessingEmergency = true
                DispatchQueue.main.async {
                    self.handleEmergencyContactAlertImmediately()
                }
            } else if wantsEmergencyContact && isProcessingEmergency {
                print("⏸️ EMERGENCY PROCESSING ALREADY IN PROGRESS - Skipping duplicate")
            }
        }
        
        // Send message to LLM for conversation
        sendMessageToLLM("The user is asking for help. You should respond reassuringly and let them know you're finding safe places and checking on emergency contacts.")
    }
    
    func handleEmergencyContactAlertImmediately() {
        print("🚨 IMMEDIATE EMERGENCY CONTACT ALERT - Function called")
        print("🚨 IMMEDIATE EMERGENCY CONTACT ALERT - Starting execution")
        
        // Set flag to prevent duplicates
        isProcessingEmergency = true
        
        guard let locationManager = locationManager,
              let location = locationManager.location else {
            print("❌ IMMEDIATE EMERGENCY CONTACT ALERT - Location not available")
            print("❌ LocationManager: \(locationManager != nil)")
            print("❌ Location: \(locationManager?.location != nil)")
            isProcessingEmergency = false
            return
        }
        
        guard let stacyAPIService = stacyAPIService else {
            print("❌ IMMEDIATE EMERGENCY CONTACT ALERT - API service not available")
            isProcessingEmergency = false
            return
        }
        
        print("✅ IMMEDIATE EMERGENCY CONTACT ALERT - All services available")
        
        print("✅ IMMEDIATE EMERGENCY CONTACT ALERT - Starting simultaneous call and SMS")
        print("   Location: \(location.coordinate.latitude), \(location.coordinate.longitude)")
        
        let emergencyContact = EmergencyContact(
            name: "Emergency Contact",
            phone: "+14383761217", // Using the same number as other functions
            relationship: "Emergency Contact"
        )
        
        print("📱 IMMEDIATE EMERGENCY CONTACT ALERT - Contact created: \(emergencyContact.phone)")
        
        // Send emergency notification using new API
        Task {
            print("📱 IMMEDIATE EMERGENCY CONTACT ALERT - Sending emergency notification...")
            let result = await stacyAPIService.notifyEmergencyContact(
                sessionId: currentSessionId,
                userName: "User",
                triggerReason: "hard_trigger"
            )
            
            switch result {
            case .success(let response):
                print("✅ IMMEDIATE EMERGENCY CONTACT ALERT - Notification sent: \(response.messageId ?? "unknown")")
                await MainActor.run {
                    self.statusText = "Emergency contact alerted"
                }
            case .failure(let error):
                print("❌ IMMEDIATE EMERGENCY CONTACT ALERT - Notification failed: \(error)")
                await MainActor.run {
                    self.statusText = "Failed to alert emergency contact"
                }
            }
        }
        
        // Make call to emergency contact
        Task {
            print("📞 IMMEDIATE EMERGENCY CONTACT ALERT - Making call...")
            let callResult = await stacyAPIService.callEmergencyDispatch(
                phone: emergencyContact.phone,
                location: location.coordinate,
                emergencyContacts: [emergencyContact]
            )
            
            switch callResult {
            case .success(_):
                print("✅ IMMEDIATE EMERGENCY CONTACT ALERT - Call initiated successfully")
            case .failure(let error):
                print("❌ IMMEDIATE EMERGENCY CONTACT ALERT - Call failed: \(error)")
            }
        }
        
        // Update status to show what we're doing
        statusText = "Alerting emergency contacts..."
        
        // Send confirmation message to LLM
        sendMessageToLLM("Emergency contacts have been alerted immediately. Both SMS and phone call have been initiated. Please reassure the user that help is on the way.")
        
        // Reset the flag after processing is complete
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.isProcessingEmergency = false
            print("🔄 EMERGENCY PROCESSING FLAG RESET - Ready for new requests")
        }
    }
    
    // MARK: - VAPI Integration
    
    func initiateVAPIEmergencyCall(phoneNumber: String = "+15146605707") {
        print("📞 INITIATING VAPI EMERGENCY CALL")
        print("📞 Phone number: \(phoneNumber)")
        
        guard let locationManager = locationManager,
              let location = locationManager.location else {
            print("❌ VAPI CALL - Location not available")
            statusText = "Location required for emergency call"
            return
        }
        
        guard let stacyAPIService = stacyAPIService else {
            print("❌ VAPI CALL - API service not available")
            statusText = "Service unavailable"
            return
        }
        
        print("✅ VAPI CALL - Starting emergency call with location")
        statusText = "Initiating emergency call..."
        
        // Determine emergency level based on current state
        let emergencyLevel = isProcessingEmergency ? "CRITICAL" : "ELEVATED"
        
        Task {
            let result = await stacyAPIService.initiateVAPICall(
                phoneNumber: phoneNumber,
                location: location,
                sessionId: currentSessionId,
                emergencyLevel: emergencyLevel
            )
            
            await MainActor.run {
                switch result {
                case .success(let response):
                    print("✅ VAPI CALL - Success: \(response.id)")
                    self.statusText = "Emergency call initiated - Answer call from +16693292501"
                    
                    // Send confirmation to LLM
                    self.sendMessageToLLM("Emergency VAPI call has been initiated. The user will receive a call shortly from Stacy AI. Call ID: \(response.id)")
                    
                case .failure(let error):
                    print("❌ VAPI CALL - Failed: \(error)")
                    self.statusText = "Failed to initiate emergency call"
                    
                    // Send error to LLM
                    self.sendMessageToLLM("Emergency VAPI call failed. Please provide alternative assistance to the user.")
                }
            }
        }
    }
    
    
    // MARK: - Test Functions
    
    func testEmergencyDispatch() {
        print("🧪 TESTING EMERGENCY DISPATCH")
        
        guard let locationManager = locationManager,
              let location = locationManager.location else {
            print("❌ TEST EMERGENCY DISPATCH - Location not available")
            return
        }
        
        guard let stacyAPIService = stacyAPIService else {
            print("❌ TEST EMERGENCY DISPATCH - API service not available")
            return
        }
        
        let testContact = EmergencyContact(
            name: "Test Contact",
            phone: "+14383761217",
            relationship: "Test Contact"
        )
        
        print("🧪 TEST EMERGENCY DISPATCH - Testing with contact: \(testContact.phone)")
        print("🧪 TEST EMERGENCY DISPATCH - Location: \(location.coordinate.latitude), \(location.coordinate.longitude)")
        
        Task {
            let result = await stacyAPIService.callEmergencyDispatch(
                phone: testContact.phone,
                location: location.coordinate,
                emergencyContacts: [testContact]
            )
            
            switch result {
            case .success(let response):
                print("✅ TEST EMERGENCY DISPATCH - Success: \(response)")
                statusText = "Test emergency dispatch successful!"
            case .failure(let error):
                print("❌ TEST EMERGENCY DISPATCH - Failed: \(error)")
                statusText = "Test emergency dispatch failed: \(error.localizedDescription)"
            }
        }
    }
    
    private func processUserMessageWithBackend(_ message: String) async {
        print("📤 SENDING MESSAGE TO BACKEND:")
        print("   Message: '\(message)'")
        print("   Session ID: '\(currentSessionId)'")
        
        guard let locationManager = locationManager,
              let location = locationManager.location else {
            print("❌ BACKEND PROCESSING - Location not available")
            return
        }
        
        guard let stacyAPIService = stacyAPIService else {
            print("❌ BACKEND PROCESSING - Stacy API service not available")
            return
        }
        
        print("✅ BACKEND PROCESSING - Sending to backend...")
        let result = await stacyAPIService.sendChatMessage(
            message: message,
            sessionId: currentSessionId,
            mode: "voice",
            location: location.coordinate
        )
        
        await MainActor.run {
            switch result {
            case .success(let response):
                print("✅ BACKEND PROCESSING - Success, handling response")
                handleBackendResponse(response)
            case .failure(let error):
                print("❌ BACKEND PROCESSING - Failed: \(error.localizedDescription)")
                // Fallback to local processing
                fallbackToLocalProcessing(message)
            }
        }
    }
    
    private func handleBackendResponse(_ response: ChatResponse) {
        print("🤖 HANDLING BACKEND RESPONSE:")
        print("   Reply: '\(response.reply)'")
        print("   Actions: '\(response.actions)'")
        print("   Risk Level: '\(response.riskLevel)'")
        
        // Update UI with Stacy's response
        self.lastLLMResponse = response.reply
        
        // Response processed successfully
        print("✅ BACKEND RESPONSE PROCESSED - User can make new requests")
        
        // Handle specific actions from backend
        if let actions = response.actions {
            for action in actions {
                print("🎯 BACKEND ACTION: \(action)")
                switch action {
                case "escalate_to_police":
                    print("🚨 ESCALATING TO POLICE")
                    handlePoliceEscalation(response)
                case "safe_locations_found":
                    print("📍 SAFE LOCATIONS FOUND")
                    handleSafeLocationsFound(response)
                case "offer_escalation", "offer_dispatcher":
                    print("📞 OFFERING ESCALATION")
                    // Backend is handling the escalation, just show the response
                    break
                case "assess_immediate_danger":
                    print("⚠️ ASSESSING IMMEDIATE DANGER")
                    // Backend is asking for more information, just show the response
                    // Don't trigger additional actions, let user respond
                    break
                case "emergency_handoff", "send_sms", "alert_emergency_contacts", "notify_emergency_contact":
                    print("🚨 EMERGENCY CONTACT ALERT - Backend triggered")
                    // Only trigger once per response, not per action
                    if !isProcessingEmergency {
                        handleEmergencyContactAlertImmediately()
                    } else {
                        print("⏸️ EMERGENCY ALREADY PROCESSING - Skipping duplicate action")
                    }
                default:
                    print("❓ UNKNOWN ACTION: \(action)")
                }
            }
        }
        
        // Check if we should trigger navigation based on user intent
        print("🧭 CHECKING IF SHOULD TRIGGER NAVIGATION...")
        if shouldTriggerNavigation(response) {
            print("✅ TRIGGERING NAVIGATION - Calling searchNearbyPlacesAutomatically()")
            searchNearbyPlacesAutomatically()
        } else {
            print("❌ NOT TRIGGERING NAVIGATION")
        }
    }
    
    private func shouldTriggerNavigation(_ response: ChatResponse) -> Bool {
        let reply = response.reply.lowercased()
        let transcript = self.transcript.lowercased()
        
        print("🧭 NAVIGATION CHECK:")
        print("   User transcript: '\(transcript)'")
        print("   Stacy reply: '\(reply)'")
        
        // Only trigger navigation if user explicitly asks for directions/navigation
        let navigationKeywords = [
            "directions", "navigate", "navigation", "how to get there",
            "show me the way", "guide me", "take me to", "get me to",
            "walk to", "go to", "lead me", "help me get to"
        ]
        
        let userWantsNavigation = navigationKeywords.contains { keyword in
            transcript.contains(keyword)
        }
        
        let stacyOffersNavigation = reply.contains("navigate") || reply.contains("directions") || reply.contains("guide you")
        
        print("   User wants navigation: \(userWantsNavigation)")
        print("   Stacy offers navigation: \(stacyOffersNavigation)")
        print("   Navigation keywords found: \(navigationKeywords.filter { transcript.contains($0) })")
        
        let shouldNavigate = userWantsNavigation || stacyOffersNavigation
        print("   🧭 FINAL DECISION: \(shouldNavigate ? "STARTING NAVIGATION" : "NOT STARTING NAVIGATION")")
        
        return shouldNavigate
    }
    
    private func handlePoliceEscalation(_ response: ChatResponse) {
        guard let locationManager = locationManager,
              let location = locationManager.location else {
            print("Location not available for police escalation")
            return
        }
        
        // Call emergency dispatch
        Task {
            let emergencyContacts = [
                EmergencyContact(
                    name: "Emergency Contact",
                    phone: "+14383761217", // Using the number from your backend
                    relationship: "Emergency Contact"
                )
            ]
            
            let result = await stacyAPIService?.callEmergencyDispatch(
                phone: "+14383761217", // Using the number from your backend
                location: location.coordinate,
                emergencyContacts: emergencyContacts
            )
            
            await MainActor.run {
                if let result = result {
                    switch result {
                    case .success(let callResponse):
                        if callResponse.success == true {
                            self.statusText = "Emergency call initiated"
                            self.lastLLMResponse = "Emergency services have been contacted. Stay on the line."
                        } else {
                            self.statusText = "Failed to contact emergency services"
                            self.lastLLMResponse = "I couldn't connect you to emergency services. Please call 911 directly."
                        }
                    case .failure(let error):
                        self.statusText = "Emergency call failed"
                        self.lastLLMResponse = "I couldn't connect you to emergency services. Please call 911 directly."
                        print("Emergency call error: \(error.localizedDescription)")
                    }
                }
            }
        }
    }
    
    private func handleSafeLocationsFound(_ response: ChatResponse) {
        // Backend found safe locations, trigger local search to get actual places
        searchNearbyPlacesAutomatically()
    }
    
    private func fallbackToLocalProcessing(_ message: String) {
        print("🔄 FALLBACK TO LOCAL PROCESSING - Backend failed, using local processing")
        // Don't duplicate emergency processing since immediate processing already handled it
        // Just send a message to LLM for conversation
        sendMessageToLLM("The user is asking for help. You should respond reassuringly and let them know you're finding safe places and checking on emergency contacts.")
    }
    
    private func sendMessageToLLM(_ message: String) {
        Task {
            do {
                try await conversation.send(from: .system, text: message)
            } catch {
                print("Failed to send message to LLM: \(error)")
            }
        }
    }
    
    private func sendNavigationInstructionToLLM(_ instruction: String) {
        let navigationContext = """
        Navigation instruction: \(instruction)
        
        Please speak this navigation instruction clearly and helpfully to guide the user. Keep it conversational and reassuring.
        """
        
        Task {
            do {
                try await conversation.send(from: .system, text: navigationContext)
            } catch {
                print("Failed to send navigation instruction to LLM: \(error)")
            }
        }
    }
    
    @MainActor
    func stopListening() {
        stopLocalSpeechRecognition()
        
        // Always stop OpenAI conversation completely
            conversation.stopHandlingVoice()
        
        self.isListening = false
        self.statusText = "Ready to help"
        // Don't clear transcript when stopping - keep it visible
        // self.transcript = ""
        // Clear LLM response when stopping
        self.lastLLMResponse = ""
        
        // Reset all flags to ensure clean state
        self.isSearchingPlaces = false
        self.waitingForNavigationConfirmation = false
        self.suggestedPlace = nil
        self.isProvidingPlacesResponse = false
    }
    
    @MainActor
    func toggleListening() {
        if isListening {
            stopListening()
        } else {
            startListening()
        }
    }
    
    private func startLocalSpeechRecognition() {
        print("🎤 STARTING LOCAL SPEECH RECOGNITION")
        print("🎤 SPEECH RECOGNIZER AVAILABLE: \(speechRecognizer?.isAvailable ?? false)")
        print("🎤 SPEECH RECOGNIZER LOCALE: \(speechRecognizer?.locale.identifier ?? "unknown")")
        
        let request = SFSpeechAudioBufferRecognitionRequest()
        let inputNode = audioEngine.inputNode
        
        recognitionTask = speechRecognizer?.recognitionTask(with: request) { [weak self] result, error in
            if let result = result {
                DispatchQueue.main.async {
                    print("🎤 SPEECH RECOGNITION RESULT: '\(result.bestTranscription.formattedString)'")
                    self?.transcript = result.bestTranscription.formattedString
                    print("📝 TRANSCRIPT UPDATED: '\(self?.transcript ?? "nil")'")
                    
                    // Handle user responses to navigation confirmation
                    if self?.waitingForNavigationConfirmation == true {
                        self?.handleUserResponse(result.bestTranscription.formattedString)
                    } else {
                        // Check if user is asking for help/places and trigger search
                        self?.checkForHelpRequest(result.bestTranscription.formattedString)
                    }
                }
            }
            
            if let error = error {
                print("Speech recognition error: \(error)")
                // Don't stop listening on error, just log it
                if let errorCode = (error as NSError?)?.code {
                    print("Error code: \(errorCode)")
                }
            }
        }
        
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputNode.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
        
        do {
            try audioEngine.start()
            print("✅ AUDIO ENGINE STARTED SUCCESSFULLY")
        } catch {
            print("❌ FAILED TO START AUDIO ENGINE: \(error)")
        }
    }
    
    private func stopLocalSpeechRecognition() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionTask?.cancel()
        recognitionTask = nil
    }
    
    // MARK: - Places Search Integration
    
    func searchNearbyPlacesAutomatically() {
        print("🔍 SEARCHING FOR PLACES - Function called")
        
        guard let locationManager = locationManager,
              let stacyAPIService = stacyAPIService,
              let location = locationManager.location else {
            print("❌ SEARCHING FOR PLACES - Missing required services:")
            print("   LocationManager: \(locationManager != nil)")
            print("   StacyAPIService: \(stacyAPIService != nil)")
            print("   Location: \(locationManager?.location != nil)")
            return
        }
        
        print("✅ SEARCHING FOR PLACES - All services available")
        print("   Current location: \(location.coordinate)")
        
        isSearchingPlaces = true
        isProvidingPlacesResponse = true
        statusText = "Searching for nearby safe places..."
        
        print("🔍 SEARCHING FOR PLACES - Starting search with new API...")
        
        Task {
            let result = await stacyAPIService.getSafeLocations(
                sessionId: currentSessionId,
                location: location,
                radius: 1000
            )
            
            await MainActor.run {
                switch result {
                case .success(let response):
                    print("✅ SEARCHING FOR PLACES - Found \(response.locations.count) places")
                    if response.locations.isEmpty {
                        print("❌ SEARCHING FOR PLACES - No locations in response")
                        self.statusText = "No safe places found nearby"
                        self.isSearchingPlaces = false
                        self.isProvidingPlacesResponse = false
                    } else {
                        self.handlePlacesSearchResults(response.locations)
                    }
                case .failure(let error):
                    print("❌ SEARCHING FOR PLACES - API failed: \(error)")
                    self.statusText = "Failed to find safe places"
                    self.isSearchingPlaces = false
                    self.isProvidingPlacesResponse = false
                }
            }
        }
    }
    
    private func processPlacesResults(_ places: [PlaceData]) {
        print("🔍 PROCESSING PLACES RESULTS - \(places.count) places found")
        
        isSearchingPlaces = false
        isProvidingPlacesResponse = false
        
        if places.isEmpty {
            print("❌ PROCESSING PLACES RESULTS - No places found")
            statusText = "No safe places found nearby"
            return
        }
        
        // Sort by distance
        let sortedPlaces = places.sorted { $0.distance < $1.distance }
        let nearestPlace = sortedPlaces.first!
        
        print("✅ PROCESSING PLACES RESULTS - Nearest place: \(nearestPlace.name)")
        print("   Distance: \(nearestPlace.distance)m")
        print("   Type: \(nearestPlace.type)")
        
        // Convert PlaceData to Place objects for UI display
        let convertedPlaces = sortedPlaces.map { placeData -> Place in
            let coordinate = CLLocationCoordinate2D(latitude: placeData.latitude, longitude: placeData.longitude)
            let category = mapPlaceTypeToCategory(placeData.type)
            
            return Place(
                name: placeData.name,
                address: placeData.address ?? "Address not available",
                coordinate: coordinate,
                category: category,
                distance: placeData.distance
            )
        }
        
        // Update the foundPlaces array so UI can display them
        foundPlaces = convertedPlaces
        print("✅ PROCESSING PLACES RESULTS - Updated foundPlaces array with \(foundPlaces.count) places")
        for place in foundPlaces {
            print("   - \(place.name) (\(place.category.rawValue)) - \(Int(place.distance))m")
        }
        
        statusText = "Found \(places.count) safe places nearby"
        
        // Generate navigation instruction
        let instruction = generateNavigationInstruction(to: nearestPlace)
        print("🧭 PROCESSING PLACES RESULTS - Navigation instruction: \(instruction)")
        
        // Send navigation instruction to LLM
        sendNavigationInstructionToLLM(instruction)
    }
    
    // Helper function to map PlaceData type to PlaceCategory
    private func mapPlaceTypeToCategory(_ type: String) -> PlaceCategory {
        switch type.lowercased() {
        case "police_station", "police":
            return .police
        case "hospital", "medical":
            return .hospital
        case "fire_station", "fire":
            return .fire
        case "pharmacy", "drugstore":
            return .pharmacy
        case "gas_station", "fuel":
            return .gasStation
        case "restaurant", "food", "cafe", "coffee":
            return .fastFood
        default:
            // Default to hospital for safety-related places
            return .hospital
        }
    }
    
    private func generateNavigationInstruction(to place: PlaceData) -> String {
        let distance = Int(place.distance)
        let direction = getDirectionToPlace(place)
        
        return "I found \(place.name) \(distance) meters \(direction). It's a \(place.type.replacingOccurrences(of: "_", with: " ")). Would you like me to guide you there?"
    }
    
    private func getDirectionToPlace(_ place: PlaceData) -> String {
        // Simple direction calculation based on coordinates
        // This is a basic implementation - in a real app you'd use more sophisticated navigation
        return "away"
    }
    
    private func handlePlacesSearchResults(_ places: [PlaceData]? = nil) {
        print("🔍 HANDLING PLACES SEARCH RESULTS")
        
        if let places = places {
            // Use places from API response
            print("✅ HANDLING PLACES SEARCH RESULTS - Using API results: \(places.count) places")
            processPlacesResults(places)
            return
        }
        
        guard let placesService = placesService else { 
            print("❌ HANDLING PLACES SEARCH RESULTS - No places service")
            return 
        }
        
        isSearchingPlaces = false
        
        print("🔍 HANDLING PLACES SEARCH RESULTS - Found \(placesService.places.count) places")
        
        if placesService.places.isEmpty {
            print("❌ HANDLING PLACES SEARCH RESULTS - No places found")
            let errorMessage = "I couldn't find any nearby safe places. Please try again or check your location services."
            sendMessageToLLM("No nearby safe places were found. Please inform the user and suggest they try again or check their location services.")
            return
        }
        
        foundPlaces = placesService.places
        let nearestPlace = placesService.places.first!
        suggestedPlace = nearestPlace
        
        print("✅ HANDLING PLACES SEARCH RESULTS - Nearest place: \(nearestPlace.name)")
        print("   Distance: \(nearestPlace.distance)m")
        print("   Address: \(nearestPlace.address)")
        
        let distanceText = formatDistance(nearestPlace.distance)
        
        // Create a message for the LLM with the places search results
        let placesInfo = """
        Places search completed successfully. Found \(placesService.places.count) nearby safe places:
        - \(nearestPlace.name) (\(nearestPlace.category.rawValue)) - \(distanceText) away
        - Address: \(nearestPlace.address)
        
        Please inform the user about these results and ask if they want navigation to the closest place.
        """
        
        // Send the results to the LLM
        sendMessageToLLM(placesInfo)
        
        waitingForNavigationConfirmation = true
        
        print("🧭 HANDLING PLACES SEARCH RESULTS - Waiting for navigation confirmation")
        
        // Also update the status text to show what we found
        statusText = "Found \(placesService.places.count) nearby places"
        
        // Clear LLM response to avoid confusion
        lastLLMResponse = ""
        
        // Reset the flags after providing our response
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.isProvidingPlacesResponse = false
        }
    }
    
    // Handle user responses to navigation suggestions
    func handleUserResponse(_ response: String) {
        let lowercasedResponse = response.lowercased()
        print("User response: '\(response)' (lowercased: '\(lowercasedResponse)')")
        print("Waiting for navigation confirmation: \(waitingForNavigationConfirmation)")
        
        if waitingForNavigationConfirmation {
            // Check for positive responses (yes, go, show, itinerary, etc.)
            let positiveKeywords = ["yes", "yeah", "sure", "ok", "okay", "go", "show", "itinerary", "directions", "navigate", "start", "foot", "walk"]
            let hasPositiveResponse = positiveKeywords.contains { keyword in
                lowercasedResponse.contains(keyword)
            }
            
            // Check for negative responses
            let negativeKeywords = ["no", "nope", "cancel", "stop", "don't", "dont"]
            let hasNegativeResponse = negativeKeywords.contains { keyword in
                lowercasedResponse.contains(keyword)
            }
            
            if hasPositiveResponse {
                print("User confirmed navigation, starting...")
                startNavigationToSuggestedPlace()
            } else if hasNegativeResponse {
                print("User declined navigation")
                waitingForNavigationConfirmation = false
                suggestedPlace = nil
                isProvidingPlacesResponse = false
            } else {
                print("User response not recognized for navigation confirmation")
            }
        }
    }
    
    private func startNavigationToSuggestedPlace() {
        guard let suggestedPlace = suggestedPlace,
              let locationManager = locationManager,
              let directionsService = directionsService,
              let currentLocation = locationManager.location else {
            print("Navigation failed: Missing required data")
            return
        }
        
        print("Starting navigation to: \(suggestedPlace.name)")
        print("From location: \(currentLocation.coordinate)")
        print("To location: \(suggestedPlace.coordinate)")
        print("DirectionsService isNavigating before: \(directionsService.isNavigating)")
        print("DirectionsService steps count before: \(directionsService.steps.count)")
        
        waitingForNavigationConfirmation = false
        isProvidingPlacesResponse = false
        
        directionsService.startNavigation(to: suggestedPlace, from: currentLocation)
        
        print("DirectionsService isNavigating after: \(directionsService.isNavigating)")
        print("DirectionsService steps count after: \(directionsService.steps.count)")
        
        self.suggestedPlace = nil
    }
    
    
    private func formatDistance(_ distance: Double) -> String {
        if distance < 1000 {
            return "\(Int(distance)) meters"
        } else {
            return String(format: "%.1f kilometers", distance / 1000)
        }
    }
}

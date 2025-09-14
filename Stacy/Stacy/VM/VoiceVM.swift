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
    private var hasTriggeredHelpSearch = false
    
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
            "where can i go", "find place", "shelter"
        ]
        
        let needsHelp = helpKeywords.contains { keyword in
            lowercasedTranscript.contains(keyword)
        }
        
        if needsHelp && !isSearchingPlaces && !waitingForNavigationConfirmation && !hasTriggeredHelpSearch {
            print("🆘 HELP REQUEST DETECTED - Sending to backend for processing")
            hasTriggeredHelpSearch = true
            print("🔒 HELP SEARCH FLAG SET - Preventing duplicate requests")
            
            // Send to backend for intelligent processing
            Task {
                await processUserMessageWithBackend(transcript)
            }
        } else if needsHelp && hasTriggeredHelpSearch {
            print("⏸️ HELP ALREADY TRIGGERED - Ignoring additional help requests")
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
            location: location,
            sessionId: currentSessionId,
            mode: "voice"
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
        print("   Action: '\(response.action ?? "none")'")
        print("   Risk Level: '\(response.riskLevel ?? "none")'")
        
        // Update UI with Stacy's response
        self.lastLLMResponse = response.reply
        
        // Reset help search flag since we've processed the response
        print("🔄 RESETTING HELP SEARCH FLAG - User can now make new help requests")
        self.hasTriggeredHelpSearch = false
        
        // Handle specific actions from backend
        if let action = response.action {
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
            default:
                print("❓ UNKNOWN ACTION: \(action)")
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
                    phone: "+15146605707", // Using the number from your backend
                    relationship: "Emergency Contact",
                    priority: 1
                )
            ]
            
            let result = await stacyAPIService?.callEmergencyDispatch(
                phoneNumber: "+15146605707", // Using the number from your backend
                userLocation: location,
                emergencyContacts: emergencyContacts,
                conversationContext: response.conversation_context
            )
            
            await MainActor.run {
                if let result = result {
                    switch result {
                    case .success(let callResponse):
                        if callResponse.success {
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
        // Fallback to original local processing
        sendMessageToLLM("The user is asking for help finding safe places. You already have their location access, so you can immediately offer to search for nearby places without asking for their location.")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.searchNearbyPlacesAutomatically()
        }
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
        // Clear transcript when stopping
        self.transcript = ""
        // Clear LLM response when stopping
        self.lastLLMResponse = ""
        
        // Reset all flags to ensure clean state
        self.isSearchingPlaces = false
        self.waitingForNavigationConfirmation = false
        self.suggestedPlace = nil
        self.isProvidingPlacesResponse = false
        self.hasTriggeredHelpSearch = false
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
        let request = SFSpeechAudioBufferRecognitionRequest()
        let inputNode = audioEngine.inputNode
        
        recognitionTask = speechRecognizer?.recognitionTask(with: request) { [weak self] result, error in
            if let result = result {
                DispatchQueue.main.async {
                    self?.transcript = result.bestTranscription.formattedString
                    
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
        } catch {
            print("Failed to start audio engine: \(error)")
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
              let placesService = placesService,
              let location = locationManager.location else {
            print("❌ SEARCHING FOR PLACES - Missing required services:")
            print("   LocationManager: \(locationManager != nil)")
            print("   PlacesService: \(placesService != nil)")
            print("   Location: \(locationManager?.location != nil)")
            return
        }
        
        print("✅ SEARCHING FOR PLACES - All services available")
        print("   Current location: \(location.coordinate)")
        
        // Don't stop the LLM - let it continue the conversation
        
        isSearchingPlaces = true
        isProvidingPlacesResponse = true
        statusText = "Searching for nearby safe places..."
        
        print("🔍 SEARCHING FOR PLACES - Starting search...")
        placesService.searchNearbyPlaces(at: location)
        
        // Monitor the places service for results
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            print("🔍 SEARCHING FOR PLACES - Checking results after 2 seconds...")
            self.handlePlacesSearchResults()
        }
    }
    
    private func handlePlacesSearchResults() {
        print("🔍 HANDLING PLACES SEARCH RESULTS")
        
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
            self.hasTriggeredHelpSearch = false
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
                hasTriggeredHelpSearch = false
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

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
    
    // Flag to control when we override LLM responses
    private var isProvidingPlacesResponse = false
    private var hasTriggeredHelpSearch = false
    
    init() {
        self.conversation = Conversation(authToken: "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")
        
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
                        You are Stacy, a voice-activated safety assistant. You help users find nearby safe places and provide navigation assistance.
                        
                        IMPORTANT: You already have access to the user's current location and can automatically search for nearby places. You do NOT need to ask for their location or address.
                        
                        When users ask for help finding places, emergency services, or safe locations, you should:
                        1. Acknowledge their request
                        2. Immediately offer to search for nearby safe places (you already have their location)
                        3. When places are found, suggest the closest one with distance
                        4. Ask if they want navigation to that place
                        
                        You have access to search for nearby places including:
                        - Police stations
                        - Fire stations  
                        - Hospitals
                        - Hotels
                        - Gas stations
                        - Fast food restaurants
                        - Pharmacies
                        
                        IMPORTANT: The app handles the technical aspects (searching, navigation, voice instructions). Your role is to be conversational and supportive. When the app is providing functional responses (like "I found a police station..."), let the app handle it and don't provide conflicting information.
                        
                        NAVIGATION INSTRUCTIONS: When you receive navigation instructions from the app, speak them clearly and helpfully to guide the user. Make them conversational and reassuring. For example:
                        - "Starting navigation. Turn left onto Main Street in 200 meters."
                        - "Next: Turn right onto Oak Avenue in 150 meters."
                        - "Route recalculated. Continue straight for 300 meters."
                        
                        Be helpful, empathetic, and focused on safety. Keep responses brief and conversational. Let the app handle the technical navigation while you provide emotional support and guidance.
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
            print("User asked for help, triggering places search")
            hasTriggeredHelpSearch = true
            
            sendMessageToLLM("The user is asking for help finding safe places. You already have their location access, so you can immediately offer to search for nearby places without asking for their location.")
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                self.searchNearbyPlacesAutomatically()
            }
        } else if needsHelp && hasTriggeredHelpSearch {
            print("Help already triggered, ignoring additional help requests")
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
        
        // Only stop OpenAI conversation if it was started
        if !isSearchingPlaces && !waitingForNavigationConfirmation {
            conversation.stopHandlingVoice()
        }
        
        self.isListening = false
        self.statusText = "Ready to help"
        // Clear transcript when stopping
        self.transcript = ""
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
        guard let locationManager = locationManager,
              let placesService = placesService,
              let location = locationManager.location else {
            return
        }
        
        // Don't stop the LLM - let it continue the conversation
        
        isSearchingPlaces = true
        isProvidingPlacesResponse = true
        statusText = "Searching for nearby safe places..."
        
        placesService.searchNearbyPlaces(at: location)
        
        // Monitor the places service for results
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.handlePlacesSearchResults()
        }
    }
    
    private func handlePlacesSearchResults() {
        guard let placesService = placesService else { return }
        
        isSearchingPlaces = false
        
        if placesService.places.isEmpty {
            let errorMessage = "I couldn't find any nearby safe places. Please try again or check your location services."
            sendMessageToLLM("No nearby safe places were found. Please inform the user and suggest they try again or check their location services.")
            return
        }
        
        foundPlaces = placesService.places
        let nearestPlace = placesService.places.first!
        suggestedPlace = nearestPlace
        
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

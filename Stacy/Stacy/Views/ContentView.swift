import SwiftUI
import Speech
import AVFoundation
import OpenAIRealtime
import CoreLocation
import MapKit

struct ContentView: View {
    @StateObject private var voiceManager = VoiceVM()
    @StateObject private var locationManager = LocationManager()
    @StateObject private var placesService = PlacesService()
    @StateObject private var directionsService = DirectionsService()
    @State private var pulseAnimation = false
    @State private var showingNearbyPlaces = false
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.02, green: 0.06, blue: 0.23)
                    .ignoresSafeArea()
                
                ScrollView {
                VStack(spacing: 30) {
                    // Navigation Banner - Big UI notification like Google Maps
                    if directionsService.isNavigating && !directionsService.steps.isEmpty && directionsService.currentStepIndex < directionsService.steps.count {
                        NavigationBannerView(
                            currentStep: directionsService.steps[directionsService.currentStepIndex],
                            stepNumber: directionsService.currentStepIndex + 1,
                            totalSteps: directionsService.steps.count
                        )
                    }
                    
                    // Header with navigation button
                    HStack {
                        Spacer()
                        Button(action: {
                            showingNearbyPlaces = true
                        }) {
                            HStack {
                                Image(systemName: "location.fill")
                                Text("Find Places")
                            }
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color.blue.opacity(0.3))
                            .cornerRadius(20)
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(Color.blue, lineWidth: 1)
                            )
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 10)
                    
                    Spacer()
                    
                    Button(action: {
                        Task { @MainActor in
                            voiceManager.toggleListening()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                pulseAnimation = voiceManager.isListening
                            }
                        }
                    }) {
                        ZStack {
                            Circle()
                                .fill(circleColor.opacity(0.2))
                                .frame(width: 220, height: 220)
                                .scaleEffect(pulseAnimation ? 1.1 : 1.0)
                                .opacity(pulseAnimation ? 0.5 : 1.0)
                                .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: pulseAnimation)
                            
                            Circle()
                                .fill(circleColor)
                                .frame(width: 180, height: 180)
                                .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 5)
                            
                            VStack(spacing: 8) {
                                Image(systemName: voiceManager.isListening ? "waveform" : "mic.fill")
                                    .font(.system(size: 40, weight: .medium))
                                    .foregroundColor(.white)
                                
                                Text(voiceManager.isListening ? "LISTENING" : "TAP TO SPEAK")
                                    .font(.system(size: 16, weight: .bold, design: .rounded))
                                    .foregroundColor(.white)
                            }
                        }
                    }
                    
                    Text(voiceManager.statusText)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal)
                    
                    if !voiceManager.transcript.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("You're saying:")
                                .font(.headline)
                                .foregroundColor(.white)
                            
                            Text(voiceManager.transcript)
                                .foregroundColor(.white.opacity(0.9))
                                .padding()
                                .background(Color.white.opacity(0.1))
                                .cornerRadius(10)
                                .animation(.easeInOut(duration: 0.2), value: voiceManager.transcript)
                        }
                        .padding(.horizontal)
                    }
                    
                    // Show LLM Response
                    if !voiceManager.lastLLMResponse.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Stacy:")
                                .font(.headline)
                                .foregroundColor(.green)
                            
                            Text(voiceManager.lastLLMResponse)
                                .foregroundColor(.white.opacity(0.9))
                                .padding()
                                .background(Color.green.opacity(0.2))
                                .cornerRadius(10)
                        }
                        .padding(.horizontal)
                    }
                
                    // Voice-triggered places search status
                    if voiceManager.isSearchingPlaces {
                        VStack(spacing: 15) {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(1.2)
                            
                            Text("Searching for nearby safe places...")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.white.opacity(0.8))
                        }
                        .padding(.vertical, 20)
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(15)
                        .padding(.horizontal)
                    }
                    
                    // Navigation confirmation prompt
                    if voiceManager.waitingForNavigationConfirmation, let suggestedPlace = voiceManager.suggestedPlace {
                        VStack(spacing: 15) {
                            HStack {
                                Image(systemName: suggestedPlace.category.icon)
                                    .font(.system(size: 24))
                                    .foregroundColor(.green)
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Found: \(suggestedPlace.name)")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundColor(.white)
                                    
                                    Text("\(formatDistance(suggestedPlace.distance)) away")
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(.white.opacity(0.8))
                                }
                                
                                Spacer()
                            }
                            
                            Text("Say 'yes' to navigate or 'no' to cancel")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))
                                .multilineTextAlignment(.center)
                        }
                        .padding(16)
                        .background(Color.green.opacity(0.2))
                        .cornerRadius(15)
                        .overlay(
                            RoundedRectangle(cornerRadius: 15)
                                .stroke(Color.green, lineWidth: 1)
                        )
                        .padding(.horizontal)
                    }
                    
                    // Show navigation itinerary if navigating
                    if directionsService.isNavigating && !directionsService.steps.isEmpty {
                        NavigationItineraryView(steps: directionsService.steps, currentStepIndex: directionsService.currentStepIndex)
                    } else if directionsService.isNavigating {
                        Text("Navigation started but no steps available")
                            .foregroundColor(.white)
                            .padding()
                    }
                    
                    // Add bottom padding to ensure content doesn't get cut off
                    Spacer()
                        .frame(height: 50)
                }
                }
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showingNearbyPlaces) {
            NearbyPlacesView()
        }
        .onAppear {
            voiceManager.setServices(
                locationManager: locationManager,
                placesService: placesService,
                directionsService: directionsService
            )
        }
    }
    
    private var circleColor: Color {
        voiceManager.isListening ? Color.red : Color.blue
    }
    
    private func formatDistance(_ distance: Double) -> String {
        if distance < 1000 {
            return "\(Int(distance))m"
        } else {
            return String(format: "%.1fkm", distance / 1000)
        }
    }
}

struct PlaceCardCompact: View {
    let place: Place
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: place.category.icon)
                    .font(.system(size: 16))
                    .foregroundColor(.blue)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(place.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    Text(formatDistance(place.distance))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.1))
        .cornerRadius(10)
        .frame(width: 140)
    }
    
    private func formatDistance(_ distance: Double) -> String {
        if distance < 1000 {
            return "\(Int(distance))m"
        } else {
            return String(format: "%.1fkm", distance / 1000)
        }
    }
}



#Preview {
    ContentView()
}

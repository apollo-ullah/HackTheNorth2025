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
    @State private var showingTestButtons = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Beautiful gradient wallpaper
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.1, green: 0.2, blue: 0.5),  // Deep blue
                        Color(red: 0.2, green: 0.1, blue: 0.4),  // Purple
                        Color(red: 0.05, green: 0.15, blue: 0.3), // Dark blue
                        Color.black.opacity(0.8)                  // Black
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Navigation Banner - Big UI notification like Google Maps
                    if directionsService.isNavigating && !directionsService.steps.isEmpty && directionsService.currentStepIndex < directionsService.steps.count {
                        NavigationBannerView(
                            currentStep: directionsService.steps[directionsService.currentStepIndex],
                            stepNumber: directionsService.currentStepIndex + 1,
                            totalSteps: directionsService.steps.count
                        )
                        .padding(.bottom, 20)
                    }
                    
                    // Top content area - Status and messages
                    ScrollView {
                        VStack(spacing: 20) {
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
                            
                            // Show found places - Enhanced display
                            if !voiceManager.foundPlaces.isEmpty {
                                VStack(alignment: .leading, spacing: 15) {
                                    HStack {
                                        Image(systemName: "location.circle.fill")
                                            .font(.system(size: 20))
                                            .foregroundColor(.green)
                                        
                                        Text("Found Safe Places:")
                                            .font(.system(size: 20, weight: .bold))
                                            .foregroundColor(.green)
                                    }
                                    
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 12) {
                                            ForEach(voiceManager.foundPlaces.prefix(5), id: \.name) { place in
                                                PlaceCardCompact(place: place)
                                            }
                                        }
                                        .padding(.horizontal)
                                    }
                                }
                                .padding(.horizontal)
                                .padding(.vertical, 10)
                                .background(Color.green.opacity(0.1))
                                .cornerRadius(15)
                                .padding(.horizontal)
                            }
                        }
                    }
                    .frame(maxHeight: 300) // Limit height to leave space for buttons
                    
                    // Centered buttons area
                    Spacer()
                    
                    VStack(spacing: 40) {
                        // Big STACY title
                        Text("STACY")
                            .font(.system(size: 72, weight: .black, design: .rounded))
                            .foregroundStyle(
                                LinearGradient(
                                    gradient: Gradient(colors: [
                                        Color.white,
                                        Color.green.opacity(0.9),
                                        Color.blue.opacity(0.8)
                                    ]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .shadow(color: .black.opacity(0.3), radius: 8, x: 2, y: 4)
                            .scaleEffect(pulseAnimation ? 1.02 : 1.0)
                            .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: pulseAnimation)
                        
                        Text("Your AI Safety Companion")
                            .font(.system(size: 18, weight: .medium, design: .rounded))
                            .foregroundColor(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.top, -20)
                        // VAPI Call Button with Emergency Colors
                        Button(action: {
                            Task { @MainActor in
                                voiceManager.initiateVAPIEmergencyCall()
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    pulseAnimation = true
                                }
                            }
                        }) {
                            ZStack {
                                // Outer glow ring
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            gradient: Gradient(colors: [
                                                Color.red.opacity(0.3),
                                                Color.orange.opacity(0.2)
                                            ]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 180, height: 180)
                                    .scaleEffect(pulseAnimation ? 1.1 : 1.0)
                                    .opacity(pulseAnimation ? 0.5 : 1.0)
                                    .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: pulseAnimation)
                                
                                // Main button with gradient
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            gradient: Gradient(colors: [
                                                Color.red.opacity(0.9),
                                                Color.orange.opacity(0.8),
                                                Color.red.opacity(0.7)
                                            ]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 150, height: 150)
                                    .shadow(color: .red.opacity(0.4), radius: 15, x: 0, y: 8)
                                
                                // Inner glow effect
                                Circle()
                                    .stroke(
                                        LinearGradient(
                                            gradient: Gradient(colors: [Color.white.opacity(0.4), Color.clear]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ),
                                        lineWidth: 2
                                    )
                                    .frame(width: 150, height: 150)
                                
                                VStack(spacing: 6) {
                                    Image(systemName: "phone.fill")
                                        .font(.system(size: 32, weight: .medium))
                                        .foregroundColor(.white)
                                    
                                    Text("CALL STACY")
                                        .font(.system(size: 14, weight: .bold, design: .rounded))
                                        .foregroundColor(.white)
                                }
                            }
                        }
                        
                        // Safe Places Button with Purple-Blue Gradient
                        Button(action: {
                            Task { @MainActor in
                                voiceManager.searchNearbyPlacesAutomatically()
                            }
                        }) {
                            ZStack {
                                // Gradient background
                                LinearGradient(
                                    gradient: Gradient(colors: [
                                        Color.purple.opacity(0.8),
                                        Color.blue.opacity(0.8),
                                        Color.purple.opacity(0.6)
                                    ]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                                .frame(width: 160, height: 160)
                                .clipShape(Circle())
                                .shadow(color: .purple.opacity(0.3), radius: 15, x: 0, y: 8)
                                
                                // Inner glow effect
                                Circle()
                                    .stroke(
                                        LinearGradient(
                                            gradient: Gradient(colors: [Color.white.opacity(0.3), Color.clear]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ),
                                        lineWidth: 2
                                    )
                                    .frame(width: 160, height: 160)
                                
                                VStack(spacing: 8) {
                                    Image(systemName: "location.magnifyingglass")
                                        .font(.system(size: 32, weight: .medium))
                                        .foregroundColor(.white)
                                    
                                    Text("FIND SAFE")
                                        .font(.system(size: 12, weight: .bold, design: .rounded))
                                        .foregroundColor(.white)
                                    
                                    Text("PLACES")
                                        .font(.system(size: 12, weight: .bold, design: .rounded))
                                        .foregroundColor(.white)
                                }
                            }
                        }
                        .scaleEffect(voiceManager.isSearchingPlaces ? 0.95 : 1.0)
                        .animation(.easeInOut(duration: 0.1), value: voiceManager.isSearchingPlaces)
                    }
                    
                    Spacer()
                    
                    // Bottom content area - Navigation and additional info
                    VStack(spacing: 15) {
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
                    }
                    .padding(.bottom, 20)
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
        Color.green
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


import SwiftUI
import Speech
import AVFoundation
import OpenAIRealtime
import CoreLocation
import MapKit

struct VoiceTabView: View {
    @ObservedObject var voiceManager: VoiceVM
    @ObservedObject var locationManager: LocationManager
    @ObservedObject var placesService: PlacesService
    @ObservedObject var directionsService: DirectionsService
    @Binding var pulseAnimation: Bool
    @Binding var showingNearbyPlaces: Bool
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Premium gradient background
                backgroundGradient
                
                // Subtle animated background pattern
                AnimatedBackgroundView()
                    .ignoresSafeArea()
                
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        // Premium header section
                        VStack(spacing: 20) {
                            // Status indicator
                            HStack {
                                Circle()
                                    .fill(statusColor)
                                    .frame(width: 12, height: 12)
                                    .shadow(color: statusColor.opacity(0.5), radius: 4)
                                
                                Text(statusText)
                                    .font(.system(size: 16, weight: .medium, design: .rounded))
                                    .foregroundColor(.white.opacity(0.9))
                                
                                Spacer()
                                
                                // Quick action button
                                Button(action: {
                                    showingNearbyPlaces = true
                                }) {
                                    HStack(spacing: 8) {
                                        Image(systemName: "location.fill")
                                            .font(.system(size: 14, weight: .semibold))
                                        Text("Places")
                                            .font(.system(size: 14, weight: .semibold))
                                    }
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                    .background(
                                        RoundedRectangle(cornerRadius: 20)
                                            .fill(Color.white.opacity(0.15))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 20)
                                                    .stroke(Color.white.opacity(0.3), lineWidth: 1)
                                            )
                                    )
                                }
                            }
                            .padding(.horizontal, 24)
                            .padding(.top, 20)
                        }
                        
                        // Main content area with perfect spacing
                        VStack(spacing: 40) {
                            // Microphone section - hero element
                            VStack(spacing: 24) {
                                Spacer()
                                    .frame(height: 60)
                                
                                // Premium microphone button with advanced animations
                                microphoneButton
                                
                                Spacer()
                                    .frame(height: 40)
                            }
                            
                            // Content cards section
                            VStack(spacing: 24) {
                                // Transcript card
                                if !voiceManager.transcript.isEmpty {
                                    PremiumCard(
                                        title: "You said",
                                        icon: "waveform",
                                        iconColor: .blue
                                    ) {
                                        Text(voiceManager.transcript)
                                            .font(.system(size: 16, weight: .medium))
                                            .foregroundColor(.white.opacity(0.9))
                                            .multilineTextAlignment(.leading)
                                    }
                                    .transition(.asymmetric(
                                        insertion: .scale.combined(with: .opacity),
                                        removal: .scale.combined(with: .opacity)
                                    ))
                                }
                                
                                // Stacy response card
                                if !voiceManager.lastLLMResponse.isEmpty {
                                    PremiumCard(
                                        title: "Stacy",
                                        icon: "sparkles",
                                        iconColor: .green
                                    ) {
                                        Text(voiceManager.lastLLMResponse)
                                            .font(.system(size: 16, weight: .medium))
                                            .foregroundColor(.white.opacity(0.9))
                                            .multilineTextAlignment(.leading)
                                    }
                                    .transition(.asymmetric(
                                        insertion: .scale.combined(with: .opacity),
                                        removal: .scale.combined(with: .opacity)
                                    ))
                                }
                                
                                // Search status card
                                if voiceManager.isSearchingPlaces {
                                    PremiumCard(
                                        title: "Searching",
                                        icon: "magnifyingglass",
                                        iconColor: .orange
                                    ) {
                                        HStack(spacing: 16) {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                                .scaleEffect(1.2)
                                            
                                            Text("Finding nearby safe places...")
                                                .font(.system(size: 16, weight: .medium))
                                                .foregroundColor(.white.opacity(0.9))
                                        }
                                    }
                                    .transition(.asymmetric(
                                        insertion: .scale.combined(with: .opacity),
                                        removal: .scale.combined(with: .opacity)
                                    ))
                                }
                                
                                // Found places section
                                if !voiceManager.foundPlaces.isEmpty {
                                    VStack(alignment: .leading, spacing: 16) {
                                        HStack {
                                            Image(systemName: "location.fill")
                                                .font(.system(size: 18, weight: .semibold))
                                                .foregroundColor(.green)
                                            
                                            Text("Safe Places Found")
                                                .font(.system(size: 20, weight: .bold, design: .rounded))
                                                .foregroundColor(.white)
                                            
                                            Spacer()
                                        }
                                        
                                        ScrollView(.horizontal, showsIndicators: false) {
                                            HStack(spacing: 16) {
                                                ForEach(voiceManager.foundPlaces.prefix(5), id: \.name) { place in
                                                    PremiumPlaceCard(place: place)
                                                }
                                            }
                                            .padding(.horizontal, 24)
                                        }
                                        .padding(.horizontal, -24)
                                    }
                                    .transition(.asymmetric(
                                        insertion: .scale.combined(with: .opacity),
                                        removal: .scale.combined(with: .opacity)
                                    ))
                                }
                                
                                // Navigation confirmation card
                                if voiceManager.waitingForNavigationConfirmation, let suggestedPlace = voiceManager.suggestedPlace {
                                    PremiumCard(
                                        title: "Navigation Ready",
                                        icon: "arrow.triangle.turn.up.right.diamond",
                                        iconColor: .green
                                    ) {
                                        VStack(spacing: 16) {
                                            HStack(spacing: 12) {
                                                Image(systemName: suggestedPlace.category.icon)
                                                    .font(.system(size: 24))
                                                    .foregroundColor(.green)
                                                
                                                VStack(alignment: .leading, spacing: 4) {
                                                    Text(suggestedPlace.name)
                                                        .font(.system(size: 18, weight: .semibold))
                                                        .foregroundColor(.white)
                                                    
                                                    Text("\(formatDistance(suggestedPlace.distance)) away")
                                                        .font(.system(size: 14, weight: .medium))
                                                        .foregroundColor(.white.opacity(0.7))
                                                }
                                                
                                                Spacer()
                                            }
                                            
                                            Text("Say 'yes' to navigate or 'no' to cancel")
                                                .font(.system(size: 14, weight: .medium))
                                                .foregroundColor(.white.opacity(0.7))
                                                .multilineTextAlignment(.center)
                                                .padding(.top, 8)
                                        }
                                    }
                                    .transition(.asymmetric(
                                        insertion: .scale.combined(with: .opacity),
                                        removal: .scale.combined(with: .opacity)
                                    ))
                                }
                                
                                // Navigation itinerary
                                if directionsService.isNavigating && !directionsService.steps.isEmpty {
                                    NavigationItineraryView(steps: directionsService.steps, currentStepIndex: directionsService.currentStepIndex)
                                } else if directionsService.isNavigating {
                                    PremiumCard(
                                        title: "Navigation",
                                        icon: "location.fill",
                                        iconColor: .blue
                                    ) {
                                        Text("Navigation started but no steps available")
                                            .font(.system(size: 16, weight: .medium))
                                            .foregroundColor(.white.opacity(0.9))
                                    }
                                }
                            }
                            .padding(.horizontal, 24)
                            
                            // Bottom spacing
                            Spacer()
                                .frame(height: 100)
                        }
                    }
                }
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showingNearbyPlaces) {
            NearbyPlacesView()
        }
    }
    
    private var backgroundGradient: some View {
        LinearGradient(
            gradient: Gradient(colors: [
                Color(red: 0.05, green: 0.1, blue: 0.25),
                Color(red: 0.02, green: 0.06, blue: 0.23),
                Color(red: 0.01, green: 0.03, blue: 0.15)
            ]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
    
    private var microphoneButton: some View {
        Button(action: {
            Task { @MainActor in
                voiceManager.toggleListening()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                    pulseAnimation = voiceManager.isListening
                }
            }
        }) {
            ZStack {
                // Outer glow rings
                ForEach(0..<3, id: \.self) { index in
                    glowRing(index: index)
                }
                
                // Main button circle
                mainButtonCircle
                
                // Inner content
                buttonContent
            }
        }
        .scaleEffect(pulseAnimation ? 1.05 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: pulseAnimation)
    }
    
    private func glowRing(index: Int) -> some View {
        Circle()
            .stroke(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.4, green: 0.1, blue: 0.8).opacity(0.4),  // Deep royal purple
                        Color(red: 0.6, green: 0.2, blue: 0.9).opacity(0.2),   // Rich purple
                        Color(red: 0.3, green: 0.05, blue: 0.7).opacity(0.3)  // Very deep purple
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: 2
            )
            .frame(width: 280 + CGFloat(index * 20), height: 280 + CGFloat(index * 20))
            .scaleEffect(pulseAnimation ? 1.0 + CGFloat(Double(index) * 0.1) : 0.8)
            .opacity(pulseAnimation ? 0.7 : 0.3)
            .animation(
                .easeInOut(duration: 1.5 + Double(index) * 0.3)
                .repeatForever(autoreverses: true),
                value: pulseAnimation
            )
    }
    
    private var mainButtonCircle: some View {
        Circle()
            .fill(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.4, green: 0.1, blue: 0.8),  // Deep royal purple
                        Color(red: 0.6, green: 0.2, blue: 0.9),  // Rich purple
                        Color(red: 0.3, green: 0.05, blue: 0.7), // Very deep purple
                        Color(red: 0.5, green: 0.15, blue: 0.85)  // Medium deep purple
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 200, height: 200)
            .shadow(color: Color.purple.opacity(0.6), radius: 20, x: 0, y: 10)
            .shadow(color: .black.opacity(0.3), radius: 30, x: 0, y: 15)
    }
    
    private var buttonContent: some View {
        VStack(spacing: 12) {
            Image(systemName: voiceManager.isListening ? "waveform" : "mic.fill")
                .font(.system(size: 44, weight: .medium))
                .foregroundColor(.white)
                .scaleEffect(pulseAnimation ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: pulseAnimation)
            
            Text(voiceManager.isListening ? "LISTENING" : "TAP TO SPEAK")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .tracking(1.2)
        }
    }
    
    private var circleColor: Color {
        voiceManager.isListening ? Color.red : Color.purple
    }
    
    private var statusColor: Color {
        if voiceManager.isListening {
            return .red
        } else if voiceManager.isSearchingPlaces {
            return .orange
        } else {
            return .purple
        }
    }
    
    private var statusText: String {
        if voiceManager.isListening {
            return "Listening..."
        } else if voiceManager.isSearchingPlaces {
            return "Searching..."
        } else {
            return "Ready"
        }
    }
    
    private func formatDistance(_ distance: Double) -> String {
        if distance < 1000 {
            return "\(Int(distance))m"
        } else {
            return String(format: "%.1fkm", distance / 1000)
        }
    }
}

// MARK: - Premium UI Components

struct AnimatedBackgroundView: View {
    @State private var animate = false
    
    var body: some View {
        ZStack {
            // Floating circles
            ForEach(0..<5, id: \.self) { index in
                Circle()
                    .fill(
                        LinearGradient(
                            gradient: Gradient(colors: [
                                Color.white.opacity(0.03),
                                Color.white.opacity(0.01)
                            ]),
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: CGFloat.random(in: 100...300))
                    .position(
                        x: CGFloat.random(in: 0...UIScreen.main.bounds.width),
                        y: CGFloat.random(in: 0...UIScreen.main.bounds.height)
                    )
                    .scaleEffect(animate ? 1.2 : 0.8)
                    .opacity(animate ? 0.3 : 0.1)
                    .animation(
                        .easeInOut(duration: Double.random(in: 3...6))
                        .repeatForever(autoreverses: true)
                        .delay(Double(index) * 0.5),
                        value: animate
                    )
            }
        }
        .onAppear {
            animate = true
        }
    }
}

struct PremiumCard<Content: View>: View {
    let title: String
    let icon: String
    let iconColor: Color
    let content: Content
    
    init(title: String, icon: String, iconColor: Color, @ViewBuilder content: () -> Content) {
        self.title = title
        self.icon = icon
        self.iconColor = iconColor
        self.content = content()
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(iconColor)
                    .frame(width: 24, height: 24)
                
                Text(title)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                
                Spacer()
            }
            
            content
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.white.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color.white.opacity(0.15), lineWidth: 1)
                )
        )
        .shadow(color: .black.opacity(0.1), radius: 10, x: 0, y: 5)
    }
}

struct PremiumPlaceCard: View {
    let place: Place
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: place.category.icon)
                    .font(.system(size: 20))
                    .foregroundColor(.blue)
                    .frame(width: 24, height: 24)
                
                Spacer()
                
                Text(formatDistance(place.distance))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.15))
                    .cornerRadius(8)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                
                Text(place.address)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(2)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.15), lineWidth: 1)
                )
        )
        .frame(width: 160)
        .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
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
    VoiceTabView(
        voiceManager: VoiceVM(),
        locationManager: LocationManager(),
        placesService: PlacesService(),
        directionsService: DirectionsService(),
        pulseAnimation: .constant(false),
        showingNearbyPlaces: .constant(false)
    )
}

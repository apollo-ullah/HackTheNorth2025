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
    @State private var selectedTab = 0
    
    var body: some View {
        TabView(selection: $selectedTab) {
            // Voice Tab
            VoiceTabView(
                voiceManager: voiceManager,
                locationManager: locationManager,
                placesService: placesService,
                directionsService: directionsService,
                pulseAnimation: $pulseAnimation,
                showingNearbyPlaces: $showingNearbyPlaces
            )
            .tabItem {
                Image(systemName: "mic.fill")
                Text("Voice")
            }
            .tag(0)
            
            // Chat Tab
            ChatBotView()
                .tabItem {
                    Image(systemName: "message.fill")
                    Text("Chat")
                }
                .tag(1)
        }
        .accentColor(.blue)
        .onAppear {
            voiceManager.setServices(
                locationManager: locationManager,
                placesService: placesService,
                directionsService: directionsService
            )
        }
    }
}

#Preview {
    ContentView()
}
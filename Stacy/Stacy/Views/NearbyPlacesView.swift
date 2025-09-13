import SwiftUI
import MapKit

struct NearbyPlacesView: View {
    @StateObject private var locationManager = LocationManager()
    @StateObject private var placesService = PlacesService()
    @StateObject private var directionsService = DirectionsService()
    @State private var selectedPlace: Place?
    @State private var showingMap = false
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.02, green: 0.06, blue: 0.23)
                    .ignoresSafeArea()
                
                VStack(spacing: 20) {
                    // Header
                    VStack(spacing: 10) {
                        Text("Nearby Safe Places")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        
                        Text("Find emergency services and public spaces")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .padding(.top)
                    
                    // Search Button
                    Button(action: searchNearbyPlaces) {
                        HStack {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 18, weight: .medium))
                            Text("Find Nearby Places")
                                .font(.system(size: 18, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 30)
                        .padding(.vertical, 15)
                        .background(
                            LinearGradient(
                                gradient: Gradient(colors: [Color.blue, Color.blue.opacity(0.8)]),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(25)
                        .shadow(color: .black.opacity(0.2), radius: 5, x: 0, y: 2)
                    }
                    .disabled(placesService.isLoading || locationManager.authorizationStatus != .authorizedWhenInUse)
                    
                    // Loading State
                    if placesService.isLoading {
                        VStack(spacing: 15) {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(1.2)
                            
                            Text("Searching for nearby places...")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.white.opacity(0.8))
                        }
                        .padding(.vertical, 30)
                    }
                    
                    // Error Message
                    if let errorMessage = placesService.errorMessage {
                        VStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 30))
                                .foregroundColor(.orange)
                            
                            Text(errorMessage)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.white)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        .padding(.vertical, 20)
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(15)
                        .padding(.horizontal)
                    }
                    
                    // Directions Error Message
                    if let errorMessage = directionsService.errorMessage {
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
                    
                    // Places List
                    if !placesService.places.isEmpty {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(placesService.places) { place in
                                    PlaceCard(
                                        place: place,
                                        onNavigate: {
                                            selectedPlace = place
                                            placesService.errorMessage = nil // Clear any previous error
                                            if let currentLocation = locationManager.location {
                                                directionsService.startNavigation(to: place, from: currentLocation)
                                            } else {
                                                // Show error message
                                                placesService.errorMessage = "Current location not available. Please ensure location services are enabled."
                                            }
                                        },
                                        onShowMap: {
                                            selectedPlace = place
                                            showingMap = true
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    
                    // Navigation Status
                    if directionsService.isNavigating {
                        NavigationStatusView(directionsService: directionsService)
                        
                        // Show navigation itinerary
                        if !directionsService.steps.isEmpty {
                            NavigationItineraryView(steps: directionsService.steps, currentStepIndex: directionsService.currentStepIndex)
                        }
                    }
                    
                    Spacer()
                }
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showingMap) {
            if let place = selectedPlace {
                MapView(place: place, locationManager: locationManager)
            }
        }
        .onAppear {
            if locationManager.authorizationStatus == .notDetermined {
                locationManager.requestLocationPermission()
            }
        }
    }
    
    private func searchNearbyPlaces() {
        guard let location = locationManager.location else {
            placesService.errorMessage = "Location not available. Please enable location services."
            return
        }
        
        placesService.searchNearbyPlaces(at: location)
    }
}

struct PlaceCard: View {
    let place: Place
    let onNavigate: () -> Void
    let onShowMap: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: place.category.icon)
                    .font(.system(size: 24))
                    .foregroundColor(.blue)
                    .frame(width: 30)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(place.name)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                    
                    Text(place.category.rawValue)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.blue)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    Text(formatDistance(place.distance))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    
                    Text("away")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            
            Text(place.address)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.8))
                .lineLimit(2)
            
            HStack(spacing: 15) {
                Button(action: onNavigate) {
                    HStack {
                        Image(systemName: "location.fill")
                        Text("Navigate")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(Color.green)
                    .cornerRadius(20)
                }
                
                Button(action: onShowMap) {
                    HStack {
                        Image(systemName: "map.fill")
                        Text("View Map")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(Color.blue)
                    .cornerRadius(20)
                }
                
                Spacer()
            }
        }
        .padding(16)
        .background(Color.white.opacity(0.1))
        .cornerRadius(15)
        .overlay(
            RoundedRectangle(cornerRadius: 15)
                .stroke(Color.white.opacity(0.2), lineWidth: 1)
        )
    }
    
    private func formatDistance(_ distance: Double) -> String {
        if distance < 1000 {
            return "\(Int(distance))m"
        } else {
            return String(format: "%.1fkm", distance / 1000)
        }
    }
}

struct NavigationStatusView: View {
    @ObservedObject var directionsService: DirectionsService
    
    var body: some View {
        VStack(spacing: 15) {
            HStack {
                Image(systemName: "location.fill")
                    .foregroundColor(.green)
                Text("Navigating")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                Button("Stop") {
                    directionsService.stopNavigation()
                }
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.red)
            }
            
            if directionsService.currentStepIndex < directionsService.steps.count {
                let currentStep = directionsService.steps[directionsService.currentStepIndex]
                VStack(alignment: .leading, spacing: 8) {
                    Text("Next: \(currentStep.instruction)")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white)
                    
                    HStack {
                        Text("Distance: \(currentStep.distance)")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white.opacity(0.8))
                        
                        Spacer()
                        
                        if let eta = directionsService.estimatedArrivalTime {
                            Text("ETA: \(formatTime(eta))")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.white.opacity(0.8))
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.3))
        .cornerRadius(15)
        .padding(.horizontal)
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

struct MapView: View {
    let place: Place
    @ObservedObject var locationManager: LocationManager
    @Environment(\.presentationMode) var presentationMode
    
    var body: some View {
        NavigationView {
            ZStack {
                Map(coordinateRegion: .constant(MKCoordinateRegion(
                    center: place.coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                )), annotationItems: [place]) { place in
                    MapAnnotation(coordinate: place.coordinate) {
                        VStack {
                            Image(systemName: place.category.icon)
                                .font(.system(size: 20))
                                .foregroundColor(.white)
                                .padding(8)
                                .background(Color.blue)
                                .clipShape(Circle())
                            
                            Text(place.name)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.black)
                                .padding(4)
                                .background(Color.white)
                                .cornerRadius(4)
                        }
                    }
                }
                .ignoresSafeArea()
                
                VStack {
                    HStack {
                        Button("Close") {
                            presentationMode.wrappedValue.dismiss()
                        }
                        .padding()
                        .background(Color.white.opacity(0.9))
                        .cornerRadius(10)
                        
                        Spacer()
                    }
                    .padding()
                    
                    Spacer()
                }
            }
        }
        .navigationBarHidden(true)
    }
}

struct NavigationItineraryView: View {
    let steps: [DirectionStep]
    let currentStepIndex: Int
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Navigation Route")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
            
            // Map view showing the route
            NavigationMapView(steps: steps, currentStepIndex: currentStepIndex)
                .frame(height: 200)
                .cornerRadius(12)
        }
        .padding(16)
        .background(Color.black.opacity(0.3))
        .cornerRadius(15)
        .padding(.horizontal)
    }
}

struct NavigationMapView: View {
    let steps: [DirectionStep]
    let currentStepIndex: Int
    
    var body: some View {
        Map {
            // Draw route line connecting all steps
            if steps.count > 1 {
                MapPolyline(coordinates: steps.map { $0.coordinate })
                    .stroke(.blue, lineWidth: 4)
            }
            
            // Show start point
            if let firstStep = steps.first {
                Annotation("Start", coordinate: firstStep.coordinate) {
                    ZStack {
                        Circle()
                            .fill(.green)
                            .frame(width: 20, height: 20)
                        Image(systemName: "play.fill")
                            .foregroundColor(.white)
                            .font(.system(size: 10))
                    }
                }
            }
            
            // Show current step
            if currentStepIndex < steps.count {
                let currentStep = steps[currentStepIndex]
                Annotation("Current", coordinate: currentStep.coordinate) {
                    ZStack {
                        Circle()
                            .fill(.red)
                            .frame(width: 24, height: 24)
                        Text("\(currentStepIndex + 1)")
                            .foregroundColor(.white)
                            .font(.system(size: 12, weight: .bold))
                    }
                }
            }
            
            // Show destination
            if let lastStep = steps.last {
                Annotation("Destination", coordinate: lastStep.coordinate) {
                    ZStack {
                        Circle()
                            .fill(.orange)
                            .frame(width: 20, height: 20)
                        Image(systemName: "flag.fill")
                            .foregroundColor(.white)
                            .font(.system(size: 10))
                    }
                }
            }
        }
        .mapStyle(.standard)
    }
}

#Preview {
    NearbyPlacesView()
}

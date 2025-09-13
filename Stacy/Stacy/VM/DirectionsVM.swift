import Foundation
import CoreLocation
import MapKit
import AVFoundation

struct DirectionStep: Identifiable {
    let id = UUID()
    let instruction: String
    let distance: String
    let coordinate: CLLocationCoordinate2D
}

class DirectionsService: NSObject, ObservableObject {
    @Published var route: MKRoute?
    @Published var steps: [DirectionStep] = []
    @Published var isNavigating = false
    @Published var currentStepIndex = 0
    @Published var distanceToDestination: Double = 0
    @Published var estimatedArrivalTime: Date?
    @Published var errorMessage: String?
    
    private var locationManager = CLLocationManager()
    private var currentLocation: CLLocation?
    private var destination: CLLocation?
    
    // Callback to send navigation instructions to LLM
    var onNavigationInstruction: ((String) -> Void)?
    
    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 10 // Update every 10 meters
        locationManager.requestWhenInUseAuthorization()
    }
    
    func startNavigation(to destination: Place, from currentLocation: CLLocation) {
        print("DirectionsService: Starting navigation to \(destination.name)")
        self.destination = CLLocation(latitude: destination.coordinate.latitude, longitude: destination.coordinate.longitude)
        self.currentLocation = currentLocation
        self.errorMessage = nil
        
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: currentLocation.coordinate))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination.coordinate))
        request.transportType = .automobile
        request.requestsAlternateRoutes = false
        
        print("DirectionsService: Requesting directions from \(currentLocation.coordinate) to \(destination.coordinate)")
        
        let directions = MKDirections(request: request)
        directions.calculate { [weak self] response, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("DirectionsService: Error getting directions: \(error.localizedDescription)")
                    self?.errorMessage = "Failed to get directions: \(error.localizedDescription)"
                    return
                }
                
                guard let route = response?.routes.first else {
                    print("DirectionsService: No route found")
                    self?.errorMessage = "No route found to destination"
                    return
                }
                
                print("DirectionsService: Route found with \(route.steps.count) steps")
                self?.errorMessage = nil
                self?.route = route
                self?.processRouteSteps(route)
                self?.startLocationUpdates()
                self?.isNavigating = true
            }
        }
    }
    
    func stopNavigation() {
        isNavigating = false
        locationManager.stopUpdatingLocation()
        route = nil
        steps.removeAll()
        currentStepIndex = 0
        errorMessage = nil
    }
    
    private func processRouteSteps(_ route: MKRoute) {
        steps = route.steps.map { step in
            let instruction = step.instructions.isEmpty ? "Continue straight" : step.instructions
            return DirectionStep(
                instruction: instruction,
                distance: formatDistance(step.distance),
                coordinate: step.polyline.coordinate
            )
        }
        
        print("DirectionsService: Processed \(steps.count) steps")
        for (index, step) in steps.enumerated() {
            print("Step \(index): \(step.instruction) (\(step.distance))")
        }
        
        if let firstStep = steps.first {
            print("DirectionsService: First instruction: \(firstStep.instruction)")
            // Send first instruction to LLM
            onNavigationInstruction?("Starting navigation. \(firstStep.instruction) in \(firstStep.distance).")
        }
    }
    
    private func startLocationUpdates() {
        locationManager.startUpdatingLocation()
    }
    
    
    private func formatDistance(_ distance: CLLocationDistance) -> String {
        if distance < 1000 {
            return "\(Int(distance))m"
        } else {
            return String(format: "%.1fkm", distance / 1000)
        }
    }
    
    private func updateNavigationProgress() {
        guard let currentLocation = currentLocation,
              let destination = destination,
              let route = route else { return }
        
        // Calculate distance to destination
        distanceToDestination = currentLocation.distance(from: destination)
        
        // Calculate estimated arrival time
        let remainingDistance = distanceToDestination
        let averageSpeed: CLLocationSpeed = 50 * 1000 / 3600 // 50 km/h in m/s
        let remainingTime = remainingDistance / averageSpeed
        estimatedArrivalTime = Date().addingTimeInterval(remainingTime)
        
        // Check if we need to provide next instruction
        checkForNextInstruction()
    }
    
    private func checkForNextInstruction() {
        guard currentStepIndex < steps.count - 1 else { return }
        
        let currentStep = steps[currentStepIndex]
        let currentStepLocation = CLLocation(latitude: currentStep.coordinate.latitude, longitude: currentStep.coordinate.longitude)
        
        if let currentLocation = currentLocation {
            let distanceToCurrentStep = currentLocation.distance(from: currentStepLocation)
            
            // Check if we're close to the current step (within 50 meters)
            if distanceToCurrentStep < 50 {
                currentStepIndex += 1
                if currentStepIndex < steps.count {
                    let nextStep = steps[currentStepIndex]
                    print("DirectionsService: Advanced to step \(currentStepIndex + 1): \(nextStep.instruction)")
                    // Send next instruction to LLM
                    onNavigationInstruction?("Next: \(nextStep.instruction) in \(nextStep.distance).")
                }
            }
            // Check if we're significantly off course (more than 200 meters from current step)
            else if distanceToCurrentStep > 200 {
                print("DirectionsService: Off course detected, recalculating route...")
                recalculateRoute()
            }
        }
    }
    
    private func recalculateRoute() {
        guard let currentLocation = currentLocation,
              let destination = destination else { return }
        
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: currentLocation.coordinate))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination.coordinate))
        request.transportType = .automobile
        request.requestsAlternateRoutes = false
        
        let directions = MKDirections(request: request)
        directions.calculate { [weak self] response, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("DirectionsService: Error recalculating route: \(error.localizedDescription)")
                    return
                }
                
                guard let route = response?.routes.first else {
                    print("DirectionsService: No new route found")
                    return
                }
                
                print("DirectionsService: Route recalculated with \(route.steps.count) steps")
                self?.route = route
                self?.processRouteSteps(route)
                self?.currentStepIndex = 0
                
                if let firstStep = self?.steps.first {
                    print("DirectionsService: Route updated. First instruction: \(firstStep.instruction)")
                    // Send route update to LLM
                    self?.onNavigationInstruction?("Route recalculated. \(firstStep.instruction) in \(firstStep.distance).")
                }
            }
        }
    }
}

extension DirectionsService: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        currentLocation = location
        
        if isNavigating {
            updateNavigationProgress()
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error.localizedDescription)")
    }
}

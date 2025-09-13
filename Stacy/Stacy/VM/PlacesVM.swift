import Foundation
import CoreLocation
import MapKit

struct Place: Identifiable, Codable {
    let id = UUID()
    let name: String
    let address: String
    let coordinate: CLLocationCoordinate2D
    let category: PlaceCategory
    let distance: Double // in meters
    
    enum CodingKeys: String, CodingKey {
        case name, address, category, distance
        case latitude, longitude
    }
    
    init(name: String, address: String, coordinate: CLLocationCoordinate2D, category: PlaceCategory, distance: Double) {
        self.name = name
        self.address = address
        self.coordinate = coordinate
        self.category = category
        self.distance = distance
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        address = try container.decode(String.self, forKey: .address)
        category = try container.decode(PlaceCategory.self, forKey: .category)
        distance = try container.decode(Double.self, forKey: .distance)
        
        let latitude = try container.decode(Double.self, forKey: .latitude)
        let longitude = try container.decode(Double.self, forKey: .longitude)
        coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(address, forKey: .address)
        try container.encode(category, forKey: .category)
        try container.encode(distance, forKey: .distance)
        try container.encode(coordinate.latitude, forKey: .latitude)
        try container.encode(coordinate.longitude, forKey: .longitude)
    }
}

enum PlaceCategory: String, CaseIterable, Codable {
    case police = "Police Station"
    case fire = "Fire Station"
    case hospital = "Hospital"
    case hotel = "Hotel"
    case gasStation = "Gas Station"
    case fastFood = "Fast Food"
    case pharmacy = "Pharmacy"
    
    var mapKitCategory: MKPointOfInterestCategory {
        switch self {
        case .police:
            return .police
        case .fire:
            return .fireStation
        case .hospital:
            return .hospital
        case .hotel:
            return .hotel
        case .gasStation:
            return .gasStation
        case .fastFood:
            return .restaurant
        case .pharmacy:
            return .pharmacy
        }
    }
    
    var icon: String {
        switch self {
        case .police:
            return "shield.fill"
        case .fire:
            return "flame.fill"
        case .hospital:
            return "cross.fill"
        case .hotel:
            return "bed.double.fill"
        case .gasStation:
            return "fuelpump.fill"
        case .fastFood:
            return "fork.knife"
        case .pharmacy:
            return "pills.fill"
        }
    }
}

class PlacesService: ObservableObject {
    @Published var places: [Place] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let searchRadius: Double = 5000 // 5km radius
    
    func searchNearbyPlaces(at location: CLLocation) {
        isLoading = true
        errorMessage = nil
        places.removeAll()
        
        print("Searching for places at location: \(location.coordinate)")
        
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = "police station"
        request.region = MKCoordinateRegion(
            center: location.coordinate,
            latitudinalMeters: searchRadius,
            longitudinalMeters: searchRadius
        )
        
        // Also try searching for point of interest categories
        request.pointOfInterestFilter = MKPointOfInterestFilter(including: [
            .police,
            .fireStation,
            .hospital,
            .hotel,
            .gasStation,
            .pharmacy,
            .restaurant
        ])
        
        let search = MKLocalSearch(request: request)
        search.start { [weak self] response, error in
            DispatchQueue.main.async {
                self?.isLoading = false
                
                if let error = error {
                    print("Search error: \(error.localizedDescription)")
                    self?.errorMessage = "Failed to search places: \(error.localizedDescription)"
                    return
                }
                
                guard let response = response else {
                    print("No response from search")
                    self?.errorMessage = "No places found"
                    return
                }
                
                print("Found \(response.mapItems.count) map items")
                for (index, item) in response.mapItems.enumerated() {
                    print("Item \(index): \(item.name ?? "No name") - \(item.pointOfInterestCategory?.rawValue ?? "No category")")
                }
                self?.processSearchResults(response.mapItems, userLocation: location)
            }
        }
    }
    
    private func processSearchResults(_ mapItems: [MKMapItem], userLocation: CLLocation) {
        var categorizedPlaces: [Place] = []
        
        for item in mapItems {
            guard let name = item.name,
                  let address = item.placemark.title else { continue }
            
            let coordinate = item.placemark.coordinate
            let distance = userLocation.distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
            
            // Categorize based on point of interest category
            let category = categorizePlace(item)
            
            let place = Place(
                name: name,
                address: address,
                coordinate: coordinate,
                category: category,
                distance: distance
            )
            
            categorizedPlaces.append(place)
        }
        
        // Sort by distance and filter to only include our target categories
        let targetCategories = Set(PlaceCategory.allCases)
        places = categorizedPlaces
            .filter { targetCategories.contains($0.category) }
            .filter { place in
                // Additional filtering to ensure we only get relevant places
                let name = place.name.lowercased()
                return !name.contains("postproduction") && 
                       !name.contains("club") && 
                       !name.contains("association") &&
                       !name.contains("chambre") &&
                       !name.contains("liaison")
            }
            .sorted { $0.distance < $1.distance }
            .prefix(10) // Limit to 10 results
            .map { $0 }
        
        print("Processed \(places.count) places:")
        for place in places {
            print("- \(place.name) (\(place.category.rawValue)) - \(place.distance)m away")
        }
    }
    
    private func categorizePlace(_ mapItem: MKMapItem) -> PlaceCategory {
        let categories = mapItem.pointOfInterestCategory
        
        switch categories {
        case .police:
            return .police
        case .fireStation:
            return .fire
        case .hospital:
            return .hospital
        case .hotel:
            return .hotel
        case .gasStation:
            return .gasStation
        case .restaurant:
            return .fastFood
        case .pharmacy:
            return .pharmacy
        default:
            // Try to categorize based on name
            let name = mapItem.name?.lowercased() ?? ""
            if name.contains("police") || name.contains("sheriff") {
                return .police
            } else if name.contains("fire") {
                return .fire
            } else if name.contains("hospital") || name.contains("medical") {
                return .hospital
            } else if name.contains("hotel") || name.contains("inn") {
                return .hotel
            } else if name.contains("gas") || name.contains("fuel") {
                return .gasStation
            } else if name.contains("pharmacy") || name.contains("drug") {
                return .pharmacy
            } else {
                // Skip places that don't match our categories
                return .police // Temporary fallback, but we'll filter these out
            }
        }
    }
}

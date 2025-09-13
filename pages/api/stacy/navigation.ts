import { NextApiRequest, NextApiResponse } from 'next';

interface SafeLocation {
  name: string;
  type: 'police' | 'hospital' | 'fire_station' | 'public_place' | 'cafe' | 'store';
  address: string;
  phone?: string;
  lat: number;
  lng: number;
  distance: number;
  isOpen: boolean;
  safetyScore: number; // 1-10, 10 being safest
}

// Real-time navigation and safe location services
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { action, userLocation, destination, riskLevel } = req.body;

  if (!userLocation) {
    return res.status(400).json({ error: 'User location is required' });
  }

  try {
    switch (action) {
      case 'find_safe_locations': {
        const safeLocations = await findNearestSafeLocations(userLocation, riskLevel);
        
        return res.json({
          success: true,
          locations: safeLocations,
          recommendations: generateLocationRecommendations(safeLocations, riskLevel),
          timestamp: new Date().toISOString()
        });
      }

      case 'get_navigation': {
        if (!destination) {
          return res.status(400).json({ error: 'Destination is required' });
        }
        
        const navigationData = await generateNavigation(userLocation, destination, riskLevel);
        
        return res.json({
          success: true,
          navigation: navigationData,
          timestamp: new Date().toISOString()
        });
      }

      case 'emergency_route': {
        // Find the absolute safest and fastest route to help
        const emergencyLocations = await findEmergencyLocations(userLocation);
        const fastestRoute = await generateEmergencyRoute(userLocation, emergencyLocations[0]);
        
        return res.json({
          success: true,
          emergencyLocation: emergencyLocations[0],
          route: fastestRoute,
          estimatedTime: fastestRoute.duration,
          instructions: fastestRoute.steps,
          timestamp: new Date().toISOString()
        });
      }

      case 'real_time_guidance': {
        // Provide step-by-step navigation guidance
        const guidance = await generateRealTimeGuidance(userLocation, destination, riskLevel);
        
        return res.json({
          success: true,
          guidance,
          timestamp: new Date().toISOString()
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Navigation API error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

async function findNearestSafeLocations(userLocation: { lat: number; lng: number }, riskLevel?: string): Promise<SafeLocation[]> {
  // In production, this would use Google Maps API or similar
  // For now, return realistic mock data based on San Francisco area
  
  const mockLocations: SafeLocation[] = [
    {
      name: 'SFPD Mission Station',
      type: 'police',
      address: '630 Valencia St, San Francisco, CA',
      phone: '+1415558-5400',
      lat: 37.7599,
      lng: -122.4205,
      distance: calculateDistance(userLocation, { lat: 37.7599, lng: -122.4205 }),
      isOpen: true,
      safetyScore: 10
    },
    {
      name: 'UCSF Medical Center',
      type: 'hospital',
      address: '505 Parnassus Ave, San Francisco, CA',
      phone: '+14154764321',
      lat: 37.7629,
      lng: -122.4584,
      distance: calculateDistance(userLocation, { lat: 37.7629, lng: -122.4584 }),
      isOpen: true,
      safetyScore: 9
    },
    {
      name: 'Starbucks (24/7)',
      type: 'cafe',
      address: '2675 Geary Blvd, San Francisco, CA',
      phone: '+14155551234',
      lat: 37.7806,
      lng: -122.4420,
      distance: calculateDistance(userLocation, { lat: 37.7806, lng: -122.4420 }),
      isOpen: true,
      safetyScore: 7
    },
    {
      name: 'Safeway (24/7)',
      type: 'store',
      address: '2020 Market St, San Francisco, CA',
      phone: '+14155556789',
      lat: 37.7670,
      lng: -122.4274,
      distance: calculateDistance(userLocation, { lat: 37.7670, lng: -122.4274 }),
      isOpen: true,
      safetyScore: 8
    },
    {
      name: 'Fire Station 1',
      type: 'fire_station',
      address: '676 Howard St, San Francisco, CA',
      phone: '+14155550911',
      lat: 37.7847,
      lng: -122.3974,
      distance: calculateDistance(userLocation, { lat: 37.7847, lng: -122.3974 }),
      isOpen: true,
      safetyScore: 10
    }
  ];

  // Sort by safety priority based on risk level
  let sortedLocations = [...mockLocations];
  
  if (riskLevel === 'CRITICAL') {
    // Prioritize police and emergency services
    sortedLocations.sort((a, b) => {
      const aPriority = a.type === 'police' ? 3 : a.type === 'fire_station' ? 2 : a.type === 'hospital' ? 1 : 0;
      const bPriority = b.type === 'police' ? 3 : b.type === 'fire_station' ? 2 : b.type === 'hospital' ? 1 : 0;
      
      if (aPriority !== bPriority) return bPriority - aPriority;
      return a.distance - b.distance;
    });
  } else {
    // Sort by distance for non-critical situations
    sortedLocations.sort((a, b) => a.distance - b.distance);
  }

  return sortedLocations.slice(0, 5); // Return top 5
}

async function findEmergencyLocations(userLocation: { lat: number; lng: number }): Promise<SafeLocation[]> {
  const allLocations = await findNearestSafeLocations(userLocation, 'CRITICAL');
  return allLocations.filter(loc => loc.type === 'police' || loc.type === 'fire_station' || loc.type === 'hospital');
}

async function generateNavigation(userLocation: { lat: number; lng: number }, destination: SafeLocation, riskLevel?: string) {
  // Generate turn-by-turn navigation
  // In production, use Google Maps Directions API
  
  const estimatedTime = Math.round(destination.distance * 12); // ~12 minutes per km walking
  const isUrgent = riskLevel === 'CRITICAL';
  
  return {
    destination: destination,
    mode: isUrgent ? 'fastest' : 'safest',
    estimatedTime: `${estimatedTime} minutes`,
    distance: `${destination.distance.toFixed(1)} km`,
    steps: [
      `Head ${getDirection(userLocation, destination)} on your current street`,
      `Continue for ${Math.round(destination.distance * 500)}m`,
      `Turn towards ${destination.address}`,
      `Arrive at ${destination.name}`
    ],
    safetyNotes: isUrgent ? [
      'Stay in well-lit areas',
      'Avoid alleys and shortcuts', 
      'Stay on main streets with people',
      'Call 911 if situation worsens'
    ] : [
      'Stay aware of surroundings',
      'Trust your instincts',
      'Keep phone charged'
    ],
    googleMapsUrl: `https://www.google.com/maps/dir/${userLocation.lat},${userLocation.lng}/${destination.lat},${destination.lng}`,
    estimatedArrival: new Date(Date.now() + estimatedTime * 60000).toISOString()
  };
}

async function generateEmergencyRoute(userLocation: { lat: number; lng: number }, emergencyLocation: SafeLocation) {
  const estimatedTime = Math.round(emergencyLocation.distance * 8); // Faster pace for emergency
  
  return {
    destination: emergencyLocation,
    duration: `${estimatedTime} minutes`,
    distance: `${emergencyLocation.distance.toFixed(1)} km`,
    steps: [
      `🚨 EMERGENCY ROUTE to ${emergencyLocation.name}`,
      `Head directly ${getDirection(userLocation, emergencyLocation)}`,
      `Stay on main streets - avoid shortcuts`,
      `Call 911 while walking if safe to do so`,
      `Arrive at ${emergencyLocation.address}`
    ],
    urgentInstructions: [
      'Move quickly but safely',
      'Stay in populated areas',
      'Keep Stacy informed of your progress',
      'Call 911 if situation escalates'
    ]
  };
}

async function generateRealTimeGuidance(userLocation: { lat: number; lng: number }, destination: SafeLocation, riskLevel?: string) {
  const distanceToDestination = calculateDistance(userLocation, destination);
  const isClose = distanceToDestination < 0.1; // Within 100m
  
  if (isClose) {
    return {
      message: `You're almost there! ${destination.name} should be visible now. Look for the building at ${destination.address}.`,
      action: 'arriving',
      nextStep: 'Enter the building and speak to staff about your situation.'
    };
  }
  
  const direction = getDirection(userLocation, destination);
  const estimatedTime = Math.round(distanceToDestination * (riskLevel === 'CRITICAL' ? 8 : 12));
  
  return {
    message: `Continue ${direction} for ${(distanceToDestination * 1000).toFixed(0)}m. You're ${estimatedTime} minutes away from ${destination.name}.`,
    action: 'navigating',
    nextStep: `Keep heading ${direction} and stay on main streets.`,
    progress: Math.max(0, 100 - (distanceToDestination / 2) * 100) // Assume 2km max distance
  };
}

function calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
  // Haversine formula for distance calculation
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(point2.lat - point1.lat);
  const dLng = toRadians(point2.lng - point1.lng);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.lat)) * Math.cos(toRadians(point2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function getDirection(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  
  const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
  
  if (angle >= -22.5 && angle < 22.5) return 'north';
  if (angle >= 22.5 && angle < 67.5) return 'northeast';
  if (angle >= 67.5 && angle < 112.5) return 'east';
  if (angle >= 112.5 && angle < 157.5) return 'southeast';
  if (angle >= 157.5 || angle < -157.5) return 'south';
  if (angle >= -157.5 && angle < -112.5) return 'southwest';
  if (angle >= -112.5 && angle < -67.5) return 'west';
  return 'northwest';
}

function generateLocationRecommendations(locations: SafeLocation[], riskLevel?: string): string[] {
  if (riskLevel === 'CRITICAL') {
    return [
      `Nearest police station: ${locations.find(l => l.type === 'police')?.name || 'Not found'} - ${locations.find(l => l.type === 'police')?.distance.toFixed(1)}km`,
      'Head there immediately while staying on main streets',
      'Call 911 while walking if safe to do so',
      'Avoid shortcuts and stay in populated areas'
    ];
  }
  
  return [
    `Nearest safe place: ${locations[0]?.name} - ${locations[0]?.distance.toFixed(1)}km away`,
    'Consider heading there if you continue to feel unsafe',
    'Stay in well-lit, populated areas',
    'Trust your instincts'
  ];
}

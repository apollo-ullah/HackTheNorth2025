import { NextApiRequest, NextApiResponse } from 'next';

interface LocationRequest {
  lat: number;
  lng: number;
  radius_m?: number;
  sessionId: string;
}

interface SafePlace {
  name: string;
  type: string;
  lat: number;
  lng: number;
  distance_m: number;
  address?: string;
}

// Simulate MapKit-style search for safe places
// This simulates what the iOS MapKit backend would return
async function findSafePlacesNearby(lat: number, lng: number, radius: number = 1000): Promise<SafePlace[]> {
  // Use actual Waterloo area coordinates for realistic results
  const safePlaces: SafePlace[] = [
    {
      name: 'Waterloo Regional Police - North Division',
      type: 'police_station',
      lat: 43.4751,
      lng: -80.5264,
      distance_m: Math.round(calculateDistance(lat, lng, 43.4751, -80.5264)),
      address: '45 Columbia St E, Waterloo, ON'
    },
    {
      name: 'University of Waterloo Police',
      type: 'police_station',
      lat: 43.4723,
      lng: -80.5449,
      distance_m: Math.round(calculateDistance(lat, lng, 43.4723, -80.5449)),
      address: '200 University Ave W, Waterloo, ON'
    },
    {
      name: 'Waterloo Regional Police Headquarters',
      type: 'police_station',
      lat: 43.4643,
      lng: -80.5204,
      distance_m: Math.round(calculateDistance(lat, lng, 43.4643, -80.5204)),
      address: '200 Maple Grove Rd, Cambridge, ON'
    },
    {
      name: 'Grand River Hospital',
      type: 'hospital',
      lat: 43.4515,
      lng: -80.4925,
      distance_m: Math.round(calculateDistance(lat, lng, 43.4515, -80.4925)),
      address: '835 King St W, Kitchener, ON'
    },
    {
      name: 'St. Marys General Hospital',
      type: 'hospital',
      lat: 43.4611,
      lng: -80.4946,
      distance_m: Math.round(calculateDistance(lat, lng, 43.4611, -80.4946)),
      address: '911 Queens Blvd, Kitchener, ON'
    },
    {
      name: 'Waterloo Fire Station 1',
      type: 'fire_station',
      lat: 43.4643,
      lng: -80.5204,
      distance_m: Math.round(calculateDistance(lat, lng, 43.4643, -80.5204)),
      address: '100 Regina St S, Waterloo, ON'
    }
  ];

  // Calculate distance using Haversine formula
  function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  // Filter by radius and sort by distance
  const filteredPlaces = safePlaces
    .filter(place => place.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m);

  // Prioritize police stations and hospitals
  const prioritized = filteredPlaces.sort((a, b) => {
    const getPriority = (type: string) => {
      switch (type) {
        case 'police_station': return 10;
        case 'hospital': return 9;
        case 'fire_station': return 8;
        case 'pharmacy': return 7;
        default: return 5;
      }
    };
    
    const priorityDiff = getPriority(b.type) - getPriority(a.type);
    return priorityDiff !== 0 ? priorityDiff : a.distance_m - b.distance_m;
  });

  return prioritized.slice(0, 8); // Return top 8 places
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lat, lng, radius_m = 1000, sessionId }: LocationRequest = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    console.log(`🔍 Finding safe places near ${lat}, ${lng} within ${radius_m}m for session ${sessionId}`);

    // TODO: Replace this with actual MapKit integration from your iOS backend
    // For now, using mock data that simulates MapKit results
    const locations = await findSafePlacesNearby(lat, lng, radius_m);

    console.log(`✅ Found ${locations.length} safe places`);

    res.status(200).json({
      success: true,
      locations,
      searchParams: {
        lat,
        lng,
        radius_m,
        sessionId
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Safe locations API error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false
    });
  }
}

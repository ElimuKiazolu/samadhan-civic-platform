const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encodes latitude and longitude into a geohash of specified precision.
 */
export function encodeGeohash(lat: number, lng: number, precision: number = 7): string {
  let minLat = -90.0, maxLat = 90.0;
  let minLng = -180.0, maxLng = 180.0;
  let geohash = "";
  let bit = 0;
  let ch = 0;
  let isEven = true;

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (minLng + maxLng) / 2;
      if (lng > mid) {
        ch |= (1 << (4 - bit));
        minLng = mid;
      } else {
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat > mid) {
        ch |= (1 << (4 - bit));
        minLat = mid;
      } else {
        maxLat = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

/**
 * Resolves location to ward and zone.
 * Rajkot has 18 wards and 3 zones (East, West, Central).
 * Simple predictable deterministic mapping.
 */
export function resolveWardAndZone(lat: number, lng: number): { ward: number; zone: string } {
  // Rajkot is roughly centered around lat 22.3, lng 70.8
  // Let's create a stable mapping based on coordinates.
  const latOffset = Math.abs(lat - 22.3) * 1000;
  const lngOffset = Math.abs(lng - 70.8) * 1000;
  
  // Ward must be 1-18
  const ward = (Math.floor(latOffset + lngOffset) % 18) + 1;
  
  // Zone E, W, or Central based on longitude
  let zone = "Central";
  if (lng > 70.82) {
    zone = "East";
  } else if (lng < 70.78) {
    zone = "West";
  }
  
  return { ward, zone };
}

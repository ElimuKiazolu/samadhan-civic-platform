import { resolveCity } from "./cities";

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
 * Resolves a coordinate to its CITY, then a ward + zone within that city.
 *
 * City-agnostic (data-driven from cities.ts) but ZERO-REGRESSION for Rajkot: when
 * the point resolves to Rajkot, the ward/zone are computed by the ORIGINAL Rajkot
 * algorithm below, byte-for-byte. Other cities use the same style of deterministic
 * approximation over their own centre/zone list (ward/zone were already an
 * approximation, not real boundaries — see cities.ts ledger).
 *
 * Returns the legacy { ward, zone } PLUS the resolved city fields; existing callers
 * that only read ward/zone are unaffected (additive).
 */
export function resolveWardAndZone(
  lat: number,
  lng: number
): {
  ward: number;
  zone: string;
  cityId: string;
  cityName: string;
  corporationName: string;
  corporationShort: string;
  outsideCoverage: boolean;
} {
  const { city, outsideCoverage } = resolveCity(lat, lng);
  const cityFields = {
    cityId: city.id,
    cityName: city.cityName,
    corporationName: city.corporationName,
    corporationShort: city.corporationShort,
    outsideCoverage,
  };

  if (city.id === "rajkot") {
    // ── ORIGINAL Rajkot mapping — unchanged (zero regression). ──
    const latOffset = Math.abs(lat - 22.3) * 1000;
    const lngOffset = Math.abs(lng - 70.8) * 1000;
    const ward = (Math.floor(latOffset + lngOffset) % 18) + 1;
    let zone = "Central";
    if (lng > 70.82) {
      zone = "East";
    } else if (lng < 70.78) {
      zone = "West";
    }
    return { ward, zone, ...cityFields };
  }

  // ── Generic per-city approximation (Ahmedabad, Surat, …). ──
  const latOffset = Math.abs(lat - city.centre.lat) * 1000;
  const lngOffset = Math.abs(lng - city.centre.lng) * 1000;
  const magnitude = Math.floor(latOffset + lngOffset);
  const ward = (magnitude % city.wardCount) + 1;
  const zone = city.zones[magnitude % city.zones.length] || city.zones[0] || "Central";
  return { ward, zone, ...cityFields };
}

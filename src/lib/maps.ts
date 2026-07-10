import type { CivicIssue } from '../types';

// PUBLIC Maps JavaScript API key — a client identifier, not a secret (it is
// referrer-restricted in the Google Cloud console). Baked at BUILD time by Vite
// from VITE_GOOGLE_MAPS_API_KEY (see Dockerfile build args / Cloud Run), exactly
// like the VITE_FIREBASE_* web config. If a build forgets it, the map degrades
// to the text + "Open in Google Maps" fallback rather than crashing.
export const mapsApiKey: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

// True only when a key is present. Callers use this as the first degradation gate
// (no key -> never mount the embedded map, go straight to the text fallback).
export const mapsConfigured: boolean = Boolean(mapsApiKey);

export interface IssuePoint {
  lat: number;
  lng: number;
  /** True when the coordinate is a coarse (ward-level) approximation, not a real
   *  GPS/EXIF/typed fix. Drives the honest "approximate location" chip. */
  approximate: boolean;
}

/**
 * Resolve a plottable point from an issue's stored coordinates ONLY.
 *
 * Deliberately does NOT reconstruct a point from ward/geohash: `resolveWardAndZone`
 * is lossy and ward centroids are near-degenerate (all share lng 70.8, ~100 m
 * apart), so faking a pin from them would imply a precision we don't have. When
 * there are no real coordinates we return null and the caller shows the text-only
 * fallback — honest over pretty.
 */
export function resolveIssuePoint(issue: Pick<CivicIssue, 'lat' | 'lng'> & { approxLocation?: boolean } | null | undefined): IssuePoint | null {
  const lat = Number(issue?.lat);
  const lng = Number(issue?.lng);
  // Reject missing/NaN and the 0,0 "null island" sentinel.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng, approximate: (issue as any)?.approxLocation === true };
}

/**
 * A universal, quota-free, key-free deep link to Google Maps for navigation.
 * Coordinates first (works for any city); when we have none, fall back to a text
 * query of the human location string + ", Rajkot". Always resolves to something
 * openable in a new tab / the native Maps app — this is the resilience backbone
 * that works even when the embedded JS map cannot load.
 */
export function googleMapsLink(issue: Pick<CivicIssue, 'lat' | 'lng' | 'location' | 'ward'> | null | undefined): string {
  const point = resolveIssuePoint(issue as any);
  if (point) {
    return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  }
  const text = [issue?.location, issue?.ward].filter(Boolean).join(' ') || 'Rajkot';
  return `https://www.google.com/maps?q=${encodeURIComponent(`${text}, Rajkot`)}`;
}

/**
 * "Paper dossier" map styling — a muted off-white base with civic-teal water and
 * highway accents, matching the app palette (src/index.css). Applied inline via
 * the <Map styles> prop; because we pass no `mapId`, classic inline styling is
 * honoured (a cloud-styled mapId would override it).
 */
export const DOSSIER_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#F4F6F5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4A505B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F4F6F5' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E2E6E3' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E2E6E3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ECF4F3' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0E6F6B' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E6F6B' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#0A4F4C' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#E2E6E3' }] },
];

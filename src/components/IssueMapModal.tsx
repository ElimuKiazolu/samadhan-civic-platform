import React, { useEffect, useState } from 'react';
import { X, MapPin, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { CivicIssue } from '../types';
import {
  mapsApiKey,
  mapsConfigured,
  resolveIssuePoint,
  googleMapsLink,
  DOSSIER_MAP_STYLE,
} from '../lib/maps';

interface IssueMapModalProps {
  issue: CivicIssue;
  onClose: () => void;
}

/**
 * Catches any render-time explosion from the embedded map (SDK internals, bad
 * state) and swaps in the text fallback instead of white-screening the modal.
 */
interface MapErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}
interface MapErrorBoundaryState {
  hasError: boolean;
}
class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  // This project ships no @types/react, so `React` (and React.Component) resolve
  // as `any` and inherited members aren't typed. Declare them explicitly; the base
  // React.Component constructor still assigns them at runtime.
  declare props: MapErrorBoundaryProps;
  state: MapErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('IssueMapModal: embedded map render failed, showing fallback.', err);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export const IssueMapModal: React.FC<IssueMapModalProps> = ({ issue, onClose }) => {
  const point = resolveIssuePoint(issue as any);
  const mapsHref = googleMapsLink(issue);
  // Runtime load/auth failures (invalid key, blocked referrer, offline) flip this
  // so we drop to the text fallback instead of a grey/broken map box.
  const [loadFailed, setLoadFailed] = useState(false);

  // Google calls window.gm_authFailure on an invalid/unauthorized key AFTER the
  // script loads (APIProvider onError won't catch that case), so hook it too.
  useEffect(() => {
    if (!mapsConfigured || !point) return;
    const prev = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      console.warn('IssueMapModal: Google Maps auth failed (key/referrer) — falling back.');
      setLoadFailed(true);
    };
    return () => {
      (window as any).gm_authFailure = prev;
    };
  }, [point]);

  // Close on Escape — mobile-friendly and keyboard-accessible.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canRenderMap = mapsConfigured && !!point && !loadFailed;

  // Shared text fallback — used for no-key, no-coords, AND runtime map failure so
  // every degradation path lands on the same non-broken surface.
  const fallbackReason = !mapsConfigured
    ? 'Live map unavailable — add a Maps API key to enable it.'
    : !point
      ? 'No precise coordinates were recorded for this report.'
      : 'The map could not load right now.';

  const Fallback = (
    <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-10 bg-paper h-full">
      <div className="w-12 h-12 rounded-full bg-civic-tint flex items-center justify-center">
        <MapPin className="w-6 h-6 text-civic" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-ink">{issue.location || 'Location on file'}</p>
        {issue.ward && (
          <p className="text-xs font-mono text-ink-soft">{issue.ward}</p>
        )}
      </div>
      <p className="text-[11px] text-ink-soft leading-relaxed max-w-[260px] flex items-center gap-1.5 justify-center">
        <AlertTriangle className="w-3.5 h-3.5 text-st-escalate flex-shrink-0" />
        {fallbackReason}
      </p>
    </div>
  );

  // Rendered as a child of the phone-frame column (position: relative), so an
  // `absolute inset-0` overlay + a bottom sheet that slides up stays INSIDE the
  // ~430px app frame — matching IssueDetailModal. No portal to document.body,
  // which would escape the frame and cover the whole desktop viewport.
  return (
    <div
      className="absolute inset-0 z-[60] bg-ink/50 flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Issue location map"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white rounded-t-[24px] border-t border-hairline overflow-hidden shadow-2xl flex flex-col max-h-[88%]"
      >
        {/* Handle bar + header (mirrors the detail sheet's grab handle) */}
        <div className="flex-shrink-0">
          <div className="h-6 w-full flex items-center justify-center cursor-pointer" onClick={onClose}>
            <div className="w-12 h-1 bg-zinc-300 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-civic flex-shrink-0" />
              <span className="text-xs font-bold uppercase tracking-widest font-mono text-ink truncate">
                Location
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close map"
              className="p-1 rounded-full bg-zinc-100 border border-hairline text-ink-soft hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Map surface (fixed height so the map has room to render) */}
        <div className="relative h-60 sm:h-64 bg-paper mx-4 rounded-[12px] overflow-hidden border border-hairline">
          {canRenderMap ? (
            <MapErrorBoundary fallback={Fallback}>
              <APIProvider
                apiKey={mapsApiKey}
                onError={(err) => {
                  console.warn('IssueMapModal: Maps JS API failed to load — falling back.', err);
                  setLoadFailed(true);
                }}
              >
                <Map
                  defaultCenter={{ lat: point!.lat, lng: point!.lng }}
                  defaultZoom={16}
                  styles={DOSSIER_MAP_STYLE}
                  gestureHandling="greedy"
                  disableDefaultUI
                  zoomControl
                  clickableIcons={false}
                  className="w-full h-full"
                >
                  {/* Classic Marker (not AdvancedMarkerElement) on purpose: Advanced
                      markers require a cloud `mapId`, and a mapId disables the inline
                      DOSSIER_MAP_STYLE. Custom dossier styling wins here; the console
                      deprecation notice is cosmetic and Marker keeps working. */}
                  <Marker position={{ lat: point!.lat, lng: point!.lng }} />
                </Map>
              </APIProvider>
            </MapErrorBoundary>
          ) : (
            Fallback
          )}

          {/* Honest approximate-location chip (only for coarse ward-level fixes). */}
          {canRenderMap && point!.approximate && (
            <div className="absolute top-2 left-2 right-2 flex justify-center pointer-events-none">
              <span className="bg-ink/90 text-white text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Approximate location
              </span>
            </div>
          )}
        </div>

        {/* Footer — the quota-free, key-free deep link is ALWAYS present, in every
            state, so navigation works even when the embedded map does not. */}
        <div className="px-4 pt-3 pb-5 space-y-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="text-civic font-bold font-mono">⬡</span>
            <span className="truncate">
              {issue.location}
              {issue.ward ? <span className="font-mono"> · {issue.ward}</span> : null}
            </span>
          </div>
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-civic hover:bg-civic-deep text-white font-bold text-sm py-2.5 rounded-[10px] border-2 border-civic-deep shadow-[3px_3px_0px_0px_rgba(10,79,76,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Open in Google Maps
          </a>
        </div>
      </motion.div>
    </div>
  );
};

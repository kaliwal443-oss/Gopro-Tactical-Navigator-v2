
import React, { useState, useEffect, useRef } from 'react';
// FIX: Added ChevronLeftIcon for the sidebar header.
import { NavigationArrowIcon, ExternalLinkIcon, GpsIcon, SettingsIcon, UploadIcon, EllipsisVerticalIcon, QuestionMarkCircleIcon, XIcon, TargetIcon, ChevronLeftIcon, PencilIcon, PathIcon, StopIcon } from './icons';
import type { Coordinates, ImageOverlay, Route } from '../types';

declare var L: any;

const CACHED_ZONES_KEY = 'gopro_cached_map_zones';
const IMAGE_OVERLAYS_KEY = 'gopro_image_overlays';

// --- Geodetic Constants and Transformation Functions ---

// Ellipsoid Parameters for WGS 1984
const WGS84 = {
  a: 6378137.0, // semi-major axis
  f: 1 / 298.257223563, // flattening
  b: 6356752.314245, // semi-minor axis, calculated
  e2: 0.00669437999014, // eccentricity squared, calculated
};

// Ellipsoid Parameters for Everest 1956
const EVEREST_1956 = {
  a: 6377301.243, // semi-major axis
  f: 1 / 300.8017, // flattening
  b: 6356100.228, // semi-minor axis
  e2: 0.006637847, // eccentricity squared, calculated
};

// Datum transformation parameters from Everest 1956 to WGS84
const dX = 295; // meters
const dY = 736;
const dZ = 257;

/**
 * Converts WGS84 geodetic coordinates to Everest 1956 geodetic coordinates.
 * @param coords - The WGS84 coordinates.
 * @returns Coordinates on the Everest 1956 datum.
 */
const wgs84ToEverest1956 = (coords: Coordinates): Coordinates => {
  const { lat, lng } = coords;
  const h = 0; // Assume height is 0

  // 1. WGS84 Geodetic to Cartesian
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;
  
  const N_wgs84 = WGS84.a / Math.sqrt(1 - WGS84.e2 * Math.sin(latRad) * Math.sin(latRad));
  const X_wgs84 = (N_wgs84 + h) * Math.cos(latRad) * Math.cos(lngRad);
  const Y_wgs84 = (N_wgs84 + h) * Math.cos(latRad) * Math.sin(lngRad);
  const Z_wgs84 = ((1 - WGS84.e2) * N_wgs84 + h) * Math.sin(latRad);
  
  // 2. Datum Transformation (WGS84 -> Everest)
  // We are given Everest -> WGS84 parameters, so we subtract to go the other way.
  const X_everest = X_wgs84 - dX;
  const Y_everest = Y_wgs84 - dY;
  const Z_everest = Z_wgs84 - dZ;
  
  // 3. Everest Cartesian to Geodetic (using iterative method)
  const a = EVEREST_1956.a;
  const e2 = EVEREST_1956.e2;

  const newLngRad = Math.atan2(Y_everest, X_everest);
  const p = Math.sqrt(X_everest * X_everest + Y_everest * Y_everest);
  
  // Handle polar case to prevent division by zero
  if (p < 1e-6) {
      const newLatRad = Z_everest > 0 ? Math.PI / 2 : -Math.PI / 2;
      return {
          lat: newLatRad * 180 / Math.PI,
          lng: 0,
      };
  }

  let newLatRad = Math.atan(Z_everest / (p * (1 - e2)));

  for (let i = 0; i < 5; i++) { // 5 iterations is sufficient for convergence
      const cosLat = Math.cos(newLatRad);
      if (Math.abs(cosLat) < 1e-12) { // At or very near a pole, prevent division by zero
          newLatRad = (Z_everest >= 0 ? 1 : -1) * Math.PI / 2;
          break;
      }
      const N_everest = a / Math.sqrt(1 - e2 * Math.sin(newLatRad) * Math.sin(newLatRad));
      const newH = (p / cosLat) - N_everest;
      newLatRad = Math.atan(Z_everest / (p * (1 - e2 * N_everest / (N_everest + newH))));
  }

  return {
      lat: newLatRad * 180 / Math.PI,
      lng: newLngRad * 180 / Math.PI
  };
};

/**
 * Converts Everest 1956 geodetic coordinates to WGS84 geodetic coordinates.
 * @param coords - The Everest 1956 coordinates.
 * @returns Coordinates on the WGS84 datum.
 */
const everest1956ToWgs84 = (coords: Coordinates): Coordinates => {
  const { lat, lng } = coords;
  const h = 0;

  // 1. Everest Geodetic to Cartesian
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;

  const N_everest = EVEREST_1956.a / Math.sqrt(1 - EVEREST_1956.e2 * Math.sin(latRad) * Math.sin(latRad));
  const X_everest = (N_everest + h) * Math.cos(latRad) * Math.cos(lngRad);
  const Y_everest = (N_everest + h) * Math.cos(latRad) * Math.sin(lngRad);
  const Z_everest = ((1 - EVEREST_1956.e2) * N_everest + h) * Math.sin(latRad);
  
  // 2. Datum Transformation (Everest -> WGS84)
  const X_wgs84 = X_everest + dX;
  const Y_wgs84 = Y_everest + dY;
  const Z_wgs84 = Z_everest + dZ;

  // 3. WGS84 Cartesian to Geodetic
  const a = WGS84.a;
  const e2 = WGS84.e2;

  const newLngRad = Math.atan2(Y_wgs84, X_wgs84);
  const p = Math.sqrt(X_wgs84 * X_wgs84 + Y_wgs84 * Y_wgs84);
  
  // Handle polar case to prevent division by zero
  if (p < 1e-6) {
      const newLatRad = Z_wgs84 > 0 ? Math.PI / 2 : -Math.PI / 2;
      return {
          lat: newLatRad * 180 / Math.PI,
          lng: 0,
      };
  }
  
  let newLatRad = Math.atan(Z_wgs84 / (p * (1 - e2)));

  for (let i = 0; i < 5; i++) {
      const cosLat = Math.cos(newLatRad);
      if (Math.abs(cosLat) < 1e-12) { // At or very near a pole, prevent division by zero
          newLatRad = (Z_wgs84 >= 0 ? 1 : -1) * Math.PI / 2;
          break;
      }
      const N_wgs84 = a / Math.sqrt(1 - e2 * Math.sin(newLatRad) * Math.sin(newLatRad));
      const newH = (p / cosLat) - N_wgs84;
      newLatRad = Math.atan(Z_wgs84 / (p * (1 - e2 * N_wgs84 / (N_wgs84 + newH))));
  }
  
  return {
      lat: newLatRad * 180 / Math.PI,
      lng: newLngRad * 180 / Math.PI,
  };
};

// --- End Datum Functions ---

// --- UTM Projection Functions (based on Everest 1956 Datum) ---
const k0 = 0.9996; // UTM scale factor on central meridian

/**
 * Determines the UTM zone based on longitude.
 * @param lng - The longitude.
 * @returns An object with the zone number and its central meridian longitude.
 */
const getIndianGridZoneInfo = (lng: number) => {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const centralMeridian = (zone - 1) * 6 - 180 + 3;
  return { zone, centralMeridian };
};

/**
 * Gets the central meridian longitude for a given UTM zone.
 * @param zone - The zone number.
 * @returns The central meridian longitude.
 */
const getCentralMeridianForZone = (zone: number) => {
    return (zone - 1) * 6 - 180 + 3;
};

/**
 * Converts geographic coordinates (on Everest 1956 datum) to UTM coordinates.
 * Uses the Transverse Mercator projection formulas.
 * @param coords - Everest 1956 coordinates.
 * @returns An object containing the UTM zone, easting, and northing.
 */
const everest1956ToUtm = (coords: Coordinates) => {
    const { lat, lng } = coords;
    const { zone, centralMeridian } = getIndianGridZoneInfo(lng);

    const latRad = lat * Math.PI / 180;
    const lngRad = lng * Math.PI / 180;
    const lng0Rad = centralMeridian * Math.PI / 180;

    const { a, e2 } = EVEREST_1956;
    const e_prime_sq = e2 / (1 - e2);

    const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
    const T = Math.tan(latRad) ** 2;
    const C = e_prime_sq * Math.cos(latRad) ** 2;
    const A = (lngRad - lng0Rad) * Math.cos(latRad);

    const M = a * (
        (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256) * latRad -
        (3 * e2 / 8 + 3 * e2**2 / 32 + 45 * e2**3 / 1024) * Math.sin(2 * latRad) +
        (15 * e2**2 / 256 + 45 * e2**3 / 1024) * Math.sin(4 * latRad) -
        (35 * e2**3 / 3072) * Math.sin(6 * latRad)
    );

    const easting = k0 * N * (
        A + (1 - T + C) * A**3 / 6 +
        (5 - 18 * T + T**2 + 72 * C - 58 * e_prime_sq) * A**5 / 120
    ) + 500000;

    const northing = k0 * (M + N * Math.tan(latRad) * (
        A**2 / 2 +
        (5 - T + 9 * C + 4 * C**2) * A**4 / 24 +
        (61 - 58 * T + T**2 + 600 * C - 330 * e_prime_sq) * A**6 / 720
    ));

    return { zone, easting, northing };
};

/**
 * Converts UTM coordinates (on Everest 1956 datum) to geographic coordinates.
 * Uses the inverse Transverse Mercator projection formulas.
 * @param zone - UTM zone number.
 * @param easting - Easting value in meters.
 * @param northing - Northing value in meters.
 * @returns Geographic coordinates (lat, lng) on Everest 1956 datum.
 */
const utmToEverest1956 = (zone: number, easting: number, northing: number): Coordinates => {
    const centralMeridian = getCentralMeridianForZone(zone);
    const lng0Rad = centralMeridian * Math.PI / 180;

    const { a, e2 } = EVEREST_1956;
    const e_prime_sq = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

    const x = easting - 500000;
    const y = northing;
    
    const M = y / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256));

    const lat1Rad = mu +
        (3 * e1 / 2 - 27 * e1**3 / 32) * Math.sin(2 * mu) +
        (21 * e1**2 / 16 - 55 * e1**4 / 32) * Math.sin(4 * mu) +
        (151 * e1**3 / 96) * Math.sin(6 * mu);

    const C1 = e_prime_sq * Math.cos(lat1Rad)**2;
    const T1 = Math.tan(lat1Rad)**2;
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(lat1Rad)**2);
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(lat1Rad)**2, 1.5);
    const D = x / (N1 * k0);

    const latRad = lat1Rad - (N1 * Math.tan(lat1Rad) / R1) * (
        D**2 / 2 -
        (5 + 3 * T1 + 10 * C1 - 4 * C1**2 - 9 * e_prime_sq) * D**4 / 24 +
        (61 + 90 * T1 + 298 * C1 + 45 * T1**2 - 252 * e_prime_sq - 3 * C1**2) * D**6 / 720
    );

    const lngRad = lng0Rad + (
        D -
        (1 + 2 * T1 + C1) * D**3 / 6 +
        (5 - 2 * C1 + 28 * T1 - 3 * C1**2 + 8 * e_prime_sq + 24 * T1**2) * D**5 / 120
    ) / Math.cos(lat1Rad);

    return {
        lat: latRad * 180 / Math.PI,
        lng: lngRad * 180 / Math.PI,
    };
};
// --- End UTM Projection Functions ---

interface IndianGridReference {
  zone: number;
  easting: string;
  northing: string;
}

const getCachedZones = (): string[] => {
    try {
        const cached = localStorage.getItem(CACHED_ZONES_KEY);
        return cached ? JSON.parse(cached) : [];
    } catch (e) {
        console.error("Could not read cached zones from localStorage", e);
        return [];
    }
};

const setZoneAsCached = (zoneKey: string) => {
    try {
        const zones = getCachedZones();
        if (!zones.includes(zoneKey)) {
            zones.push(zoneKey);
            localStorage.setItem(CACHED_ZONES_KEY, JSON.stringify(zones));
        }
    } catch (e) {
        console.error("Could not save cached zones to localStorage", e);
    }
};


const lon2tile = (lon: number, zoom: number) => {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
};

const lat2tile = (lat: number, zoom: number) => {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
};

const MAP_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  }
};

interface Zone {
    name: string;
    coords: { lat: number; lng: number; };
    zoom: number;
    bounds?: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
    minZoom: number;
    maxZoom: number;
}

const ZONES: Record<string, Zone> = {
  'default': { name: 'Select a Zone to Navigate', coords: { lat: 28.7, lng: 77.1 }, zoom: 5, minZoom: 0, maxZoom: 0 },
  'zone_0': { name: "Zone 0: North of 35°35'N", coords: { lat: 35.88, lng: 76.51 }, zoom: 8, bounds: [35.58, 74.5, 37.0, 78.5], minZoom: 9, maxZoom: 13 },
  'zone_ia': { name: "Zone IA: 28°N-35°35'N", coords: { lat: 34.0, lng: 74.5 }, zoom: 7, bounds: [28.0, 72.0, 35.58, 77.0], minZoom: 9, maxZoom: 13 },
  'zone_ib': { name: "Zone IB: Tibet", coords: { lat: 31.0, lng: 88.0 }, zoom: 6, bounds: [28.0, 84.0, 33.0, 92.0], minZoom: 8, maxZoom: 12 },
  'zone_iia': { name: "Zone IIA: 21°N-28°N (West)", coords: { lat: 26.0, lng: 72.0 }, zoom: 6, bounds: [21.0, 68.0, 28.0, 76.0], minZoom: 8, maxZoom: 12 },
  'zone_iib': { name: "Zone IIB: 21°N-28°N (East)", coords: { lat: 23.5, lng: 90.0 }, zoom: 7, bounds: [21.0, 88.0, 28.0, 92.0], minZoom: 9, maxZoom: 13 },
  'zone_iiia': { name: "Zone IIIA: 15°N-21°N (India)", coords: { lat: 18.0, lng: 79.0 }, zoom: 6, bounds: [15.0, 74.0, 21.0, 84.0], minZoom: 8, maxZoom: 12 },
  'zone_iiib': { name: "Zone IIIB: 15°N-21°N (Myanmar)", coords: { lat: 19.7, lng: 96.1 }, zoom: 7, bounds: [15.0, 92.0, 21.0, 98.0], minZoom: 9, maxZoom: 13 },
  'zone_iva': { name: "Zone IVA: South of 15°N (India)", coords: { lat: 12.9, lng: 77.5 }, zoom: 6, bounds: [8.0, 74.0, 15.0, 81.0], minZoom: 8, maxZoom: 12 },
  'zone_ivb': { name: "Zone IVB: South of 15°N (Myanmar)", coords: { lat: 16.8, lng: 96.1 }, zoom: 7, bounds: [10.0, 95.0, 15.0, 99.0], minZoom: 9, maxZoom: 13 },
};

/**
 * Validates a coordinates object to ensure it's not null and its lat/lng are valid numbers.
 */
const isValidCoords = (coords: Coordinates | null): coords is Coordinates => {
    if (!coords) return false;
    return typeof coords.lat === 'number' && !isNaN(coords.lat) &&
           typeof coords.lng === 'number' && !isNaN(coords.lng);
};

/**
 * Parses a string in the Indian Grid System format (UTM) to WGS84 geographic coordinates.
 * @param gridStr - The grid string, e.g., "43722460 3167150".
 * @returns A WGS84 Coordinates object or null if parsing fails.
 */
const parseIndianGridToCoords = (zoneStr: string, eastingStr: string, northingStr: string): Coordinates | null => {
  try {
    const zone = parseInt(zoneStr, 10);
    const easting = parseInt(eastingStr, 10);
    const northing = parseInt(northingStr, 10);

    if (isNaN(zone) || isNaN(easting) || isNaN(northing) || zone < 1 || zone > 60) return null;

    // Convert from UTM (on Everest) to Everest Geodetic
    const everestCoords = utmToEverest1956(zone, easting, northing);

    if (!isValidCoords(everestCoords) || Math.abs(everestCoords.lat) > 90) {
        return null;
    }

    // Convert from Everest 1956 to WGS84 for map display
    const wgs84Coords = everest1956ToWgs84(everestCoords);

    if (!isValidCoords(wgs84Coords) || wgs84Coords.lat < -90 || wgs84Coords.lat > 90 || wgs84Coords.lng < -180 || wgs84Coords.lng > 180) {
        return null;
    }

    return wgs84Coords;
  } catch (e) {
    console.error("Error parsing grid coordinates:", e);
    return null;
  }
};


/**
 * Formats WGS84 geographic coordinates into a standard Indian Grid System string (UTM).
 * @param coords - The WGS84 geographic coordinates.
 * @returns A string representing the coordinates in the Indian Grid System.
 */
const formatToIndianGrid = (coords: Coordinates | null): IndianGridReference | null => {
  if (!isValidCoords(coords)) return null;
  
  // Convert from WGS84 to Everest 1956 datum before projection
  const everestCoords = wgs84ToEverest1956(coords);

  // The UTM formulas are not stable at the poles.
  if (Math.abs(everestCoords.lat) >= 90) {
      return null;
  }
  
  const { zone, easting, northing } = everest1956ToUtm(everestCoords);
  
  return {
      zone,
      easting: String(Math.round(easting)).padStart(7, '0'),
      northing: String(Math.round(northing)).padStart(7, '0'),
  };
};

const formatCoordsToDegrees = (coords: Coordinates | null): string => {
    if (!isValidCoords(coords)) return '';
    return `Lat: ${coords.lat.toFixed(5)}° Lng: ${coords.lng.toFixed(5)}°`;
};

/**
* Calculates the Haversine distance between two points on the earth.
* @param coords1 - The first coordinate.
* @param coords2 - The second coordinate.
* @returns The distance in meters.
*/
const haversineDistance = (coords1: Coordinates, coords2: Coordinates): number => {
    const R = 6371e3; // metres
    const φ1 = coords1.lat * Math.PI / 180;
    const φ2 = coords2.lat * Math.PI / 180;
    const Δφ = (coords2.lat - coords1.lat) * Math.PI / 180;
    const Δλ = (coords2.lng - coords1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

const calculateBearing = (start: Coordinates, end: Coordinates) => {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;
    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    let brng = Math.atan2(y, x);
    brng = brng * 180 / Math.PI;
    return (brng + 360) % 360;
};


const CoordinateDisplay: React.FC<{
    label: string;
    coords: Coordinates | null;
    color: string;
    distance?: number | null;
    bearing?: number | null;
    align?: 'default' | 'left';
    subtitle?: string;
}> = ({ label, coords, color, distance, bearing, align = 'default', subtitle }) => {
    const gridRef = formatToIndianGrid(coords);
    const alignmentClass = align === 'left' ? 'text-left' : 'text-center';

    const formatDistance = (d: number | null) => {
        if (d === null) return '---';
        if (d >= 1000) return `${(d / 1000).toFixed(2)} km`;
        return `${d.toFixed(0)} m`;
    };

    const renderContent = () => {
        if (!gridRef) {
            return (
                <>
                    <p className={`${color} text-sm sm:text-base font-bold`}>{!coords ? 'STANDBY' : 'POLAR'}</p>
                    <p className="text-xs sm:text-sm text-gray-400 opacity-50 font-bold">Lat: --- Lng: ---</p>
                </>
            );
        }
        
        return (
            <>
                 <div className={`text-sm sm:text-base ${color} truncate font-bold`}>
                    <span className="text-xs text-gray-500 mr-1">ZONE:</span>{gridRef.zone}
                </div>
                <div className={`text-sm sm:text-base ${color} truncate font-bold`}>
                    <span className="text-xs text-gray-500 mr-1">E:</span>{gridRef.easting}
                </div>
                <div className={`text-sm sm:text-base ${color} truncate font-bold`}>
                    <span className="text-xs text-gray-500 mr-1">N:</span>{gridRef.northing}
                </div>
                 {isValidCoords(coords) && (
                    <div className="text-xs sm:text-sm text-gray-400 truncate mt-0.5 font-bold">
                        {`Lat: ${coords.lat.toFixed(5)}° Lng: ${coords.lng.toFixed(5)}°`}
                    </div>
                )}
                {coords?.accuracy != null && (
                    <div className="text-xs sm:text-sm text-gray-400 mt-1 truncate font-bold">
                        <span>H.Acc: {coords.accuracy.toFixed(1)}m</span>
                        {coords.altitudeAccuracy != null && (
                            <span className="ml-2">V.Acc: {coords.altitudeAccuracy.toFixed(1)}m</span>
                        )}
                    </div>
                )}
                {distance != null && bearing != null && (
                    <div className={`text-xs sm:text-sm ${color} mt-1 truncate opacity-90 font-bold`}>
                        <span>DST: {formatDistance(distance)}</span>
                        <span className="ml-2">BRG: {Math.round(bearing)}°</span>
                    </div>
                )}
            </>
        );
    };
    
    return (
        <div className={alignmentClass}>
            <div className="flex justify-between items-center">
                <p className="text-xs sm:text-sm text-gray-400 font-bold">{label}</p>
                {subtitle && <p className="text-xs sm:text-sm font-bold text-cyan-400">{subtitle}</p>}
            </div>
            {renderContent()}
        </div>
    );
};

const CompassIndicator: React.FC<{ heading: number }> = ({ heading }) => {
  const roundedHeading = Math.round(heading);
  return (
    <div 
      className="relative w-16 h-16 sm:w-20 sm:h-20 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-gray-700 select-none font-sans"
      role="img" 
      aria-label={`Compass indicating a heading of ${roundedHeading} degrees.`}
    >
      {/* Static Cardinal directions - N is prominent */}
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-lg sm:text-xl font-bold text-red-500" aria-hidden="true">N</span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-sm sm:text-base text-gray-400 font-bold" aria-hidden="true">S</span>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm sm:text-base text-gray-400 font-bold" aria-hidden="true">W</span>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm sm:text-base text-gray-400 font-bold" aria-hidden="true">E</span>

      {/* Rotating Heading Arrow */}
      <div
        className="absolute w-full h-full transition-transform duration-500"
        style={{ transform: `rotate(${heading}deg)` }}
        title={`Current Heading: ${roundedHeading}°`}
      >
        <div 
          className="absolute left-1/2 -translate-x-1/2 top-4 sm:top-5 w-0 h-0 
                     border-l-[6px] border-l-transparent 
                     border-r-[6px] border-r-transparent 
                     border-b-[12px] border-b-cyan-400
                     drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
        ></div>
      </div>

       <div className="w-2 h-2 bg-gray-900 border-2 border-cyan-400 rounded-full z-10"></div>
    </div>
  );
};

const calculateRouteRemainingDistance = (route: Route, legIndex: number, currentPosition: Coordinates): number => {
    if (!route || legIndex >= route.points.length || !isValidCoords(currentPosition)) return 0;
    
    // Distance from current position to the next waypoint
    let total = haversineDistance(currentPosition, route.points[legIndex].coords);
    
    // Add distances for all subsequent legs
    for (let i = legIndex; i < route.points.length - 1; i++) {
        total += haversineDistance(route.points[i].coords, route.points[i+1].coords);
    }
    
    return total;
};

const TripComputer: React.FC<{
    speed: number;
    currentPosition: Coordinates;
    activeRoute: Route;
    legIndex: number;
}> = ({ speed, currentPosition, activeRoute, legIndex }) => {
    const nextWaypoint = activeRoute.points[legIndex];
    if (!nextWaypoint || !isValidCoords(currentPosition)) return null;

    const distanceToNext = haversineDistance(currentPosition, nextWaypoint.coords);
    const bearingToNext = calculateBearing(currentPosition, nextWaypoint.coords);
    const totalRemainingDistance = calculateRouteRemainingDistance(activeRoute, legIndex, currentPosition);
    
    const formatSpeed = (s: number) => `${(s * 3.6).toFixed(1)} km/h`;
    const formatDistance = (d: number | null) => {
        if (d === null) return '---';
        if (d >= 1000) return `${(d / 1000).toFixed(2)} km`;
        return `${d.toFixed(0)} m`;
    };
    const formatETE = (dist: number, spd: number) => {
        if (spd <= 0.1) return '--:--:--';
        const seconds = Math.round(dist / spd);
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    return (
        <div className="bg-black/60 backdrop-blur-sm p-2 rounded-lg font-mono text-xs w-full">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="col-span-2 text-center">
                    <p className="text-gray-400 truncate">NEXT WPT: <span className="text-cyan-400 font-bold text-sm">{nextWaypoint.name}</span></p>
                </div>
                <div>
                    <p className="text-gray-400">BRG TO NEXT</p>
                    <p className="text-white font-bold text-base">{bearingToNext !== null ? `${Math.round(bearingToNext)}°` : '---'}</p>
                </div>
                <div>
                    <p className="text-gray-400">DIST TO NEXT</p>
                    <p className="text-white font-bold text-base">{formatDistance(distanceToNext)}</p>
                </div>
                <div>
                    <p className="text-gray-400">SPEED</p>
                    <p className="text-white font-bold text-base">{formatSpeed(speed)}</p>
                </div>
                <div>
                    <p className="text-gray-400">ETE (NEXT)</p>
                    <p className="text-white font-bold text-base">{formatETE(distanceToNext, speed)}</p>
                </div>
                 <div className="col-span-2 text-center border-t border-gray-700 pt-2 mt-1 grid grid-cols-2 gap-x-4">
                     <div>
                        <p className="text-gray-400">ROUTE REM</p>
                        <p className="text-cyan-400 font-bold text-sm">{formatDistance(totalRemainingDistance)}</p>
                    </div>
                    <div>
                        <p className="text-gray-400">ETE (FINAL)</p>
                        <p className="text-cyan-400 font-bold text-sm">{formatETE(totalRemainingDistance, speed)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const generateMapLinksHtml = (coords: Coordinates) => {
    if (!isValidCoords(coords)) return '';
    const { lat, lng } = coords;
    const links = [
        { name: 'Google Maps', url: `https://www.google.com/maps?q=${lat},${lng}` },
        { name: 'OpenStreetMap', url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}` },
        { name: 'Bing Maps', url: `https://www.bing.com/maps?cp=${lat}~${lng}&lvl=16` },
        { name: 'Wikimapia', url: `http://wikimapia.org/#lat=${lat}&lon=${lng}&z=16` },
        { name: 'HERE WeGo', url: `https://wego.here.com/?map=${lat},${lng},16,normal` },
        { name: 'Geo URI', url: `geo:${lat},${lng}` },
    ];

    const linkHtml = links.map(link => 
        `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="block text-cyan-400 hover:text-cyan-300 text-xs py-0.5 font-bold">${link.name}</a>`
    ).join('');

    return `
      <hr class="border-t border-gray-600 my-1.5">
      <h4 class="font-bold text-xs text-gray-400 mb-1">Open In:</h4>
      ${linkHtml}
    `;
};

const createPopupContent = (title: string, coords: Coordinates) => {
    const gridRef = formatToIndianGrid(coords);
    const gridHtml = gridRef
        ? `
            <p class="font-bold"><span class="text-gray-400 font-normal">Zone:</span> ${gridRef.zone}</p>
            <p class="font-bold"><span class="text-gray-400 font-normal">E:</span> ${gridRef.easting}</p>
            <p class="font-bold"><span class="text-gray-400 font-normal">N:</span> ${gridRef.northing}</p>
        `
        : '<p>Invalid Coordinates</p>';

    return `
      <div class="font-mono text-xs text-white">
        <h3 class="font-bold text-sm text-cyan-400 mb-1">${title}</h3>
        ${gridHtml}
        <p class="font-bold"><span class="text-gray-400 font-normal">Lat:</span> ${coords.lat.toFixed(5)}°</p>
        <p class="font-bold"><span class="text-gray-400 font-normal">Lng:</span> ${coords.lng.toFixed(5)}°</p>
        ${generateMapLinksHtml(coords)}
      </div>
    `;
};


const ExternalMapLinks: React.FC<{ coords: Coordinates | null }> = ({ coords }) => {
  if (!isValidCoords(coords)) return null;
  const { lat, lng } = coords;

  const links = [
    { name: 'Google Maps', url: `https://www.google.com/maps?q=${lat},${lng}` },
    { name: 'OpenStreetMap', url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}` },
    { name: 'Bing Maps', url: `https://www.bing.com/maps?cp=${lat}~${lng}&lvl=16` },
    { name: 'Wikimapia', url: `http://wikimapia.org/#lat=${lat}&lon=${lng}&z=16` },
    { name: 'HERE WeGo', url: `https://wego.here.com/?map=${lat},${lng},16,normal` },
    { name: 'Geo URI', url: `geo:${lat},${lng}` },
  ];

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-md shadow-lg p-2 space-y-1 font-sans text-sm">
      <p className="text-xs text-gray-400 font-bold mb-1">Open In:</p>
      {links.map(link => (
        <a 
          href={link.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          key={link.name} 
          className="block w-full text-left text-cyan-400 hover:bg-gray-700 p-1 rounded-md transition-colors font-bold"
        >
          {link.name}
        </a>
      ))}
    </div>
  );
};

const GridGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
    <div 
        className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
    >
        <div
            className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md p-5 text-gray-300"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-cyan-400">Indian Grid System Guide</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="space-y-3 text-sm">
                <p>A location is identified by a Grid Reference (GR), which consists of a Zone, an Easting, and a Northing.</p>
                
                <div className="p-3 bg-gray-900/50 rounded-md">
                    <p className="font-bold text-cyan-400">1. ZONE</p>
                    <p className="mt-1 text-gray-400">A number representing a large geographical area. This is essential for a correct position, as the same Easting/Northing can exist in multiple zones.</p>
                </div>

                <div className="p-3 bg-gray-900/50 rounded-md">
                    <p className="font-bold text-cyan-400">2. EASTING (X)</p>
                    <p className="mt-1 text-gray-400">A 7-digit number in meters representing the West-to-East position within the zone. Read from left to right on the map.</p>
                </div>

                <div className="p-3 bg-gray-900/50 rounded-md">
                    <p className="font-bold text-cyan-400">3. NORTHING (Y)</p>
                    <p className="mt-1 text-gray-400">A 7-digit number in meters representing the South-to-North position within the zone. Read from bottom to top on the map.</p>
                </div>
                
                <p className="font-bold pt-2">Remember: "Read Right Up" - first find your Easting, then your Northing.</p>
            </div>
        </div>
    </div>
);


export const MapView: React.FC<{
  currentPosition: Coordinates | null;
  isOffline: boolean;
  // FIX: Added props to control the sidebar from App.tsx
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
}> = ({ currentPosition, isOffline, isSidebarOpen, setIsSidebarOpen }) => {
  // Default target is now correct UTM for India Gate, Delhi
  const [targetZone, setTargetZone] = useState('43');
  const [targetEasting, setTargetEasting] = useState('772460');
  const [targetNorthing, setTargetNorthing] = useState('3167150');
  const [isInputValid, setIsInputValid] = useState(true);
  const [targetPosition, setTargetPosition] = useState<Coordinates | null>(null);
  const [cursorPosition, setCursorPosition] = useState<Coordinates | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [waypoints, setWaypoints] = useState<{ name: string; coords: Coordinates }[]>([]);
  const [heading, setHeading] = useState(0);
  const [namingWaypointInfo, setNamingWaypointInfo] = useState<{ coords: Coordinates } | null>(null);
  const [newWaypointName, setNewWaypointName] = useState('');
  const [speed, setSpeed] = useState(0);
  const [bearingToTarget, setBearingToTarget] = useState<number | null>(null);
  const [distanceToCursor, setDistanceToCursor] = useState<number | null>(null);
  const [bearingToCursor, setBearingToCursor] = useState<number | null>(null);
  const [showCursorMenu, setShowCursorMenu] = useState(false);
  // FIX: Removed isActionMenuOpen as the sidebar replaces the action modal.
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gridColor, setGridColor] = useState('rgba(239, 68, 68, 0.8)');
  const [gridWeight, setGridWeight] = useState(2);
  const [mapLayer, setMapLayer] = useState('street');
  
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [activeRouteLegIndex, setActiveRouteLegIndex] = useState(0);
  
  const [selectedZoneKey, setSelectedZoneKey] = useState('default');
  const [downloadState, setDownloadState] = useState({ active: false, message: '', progress: 0 });
  const [imageOverlays, setImageOverlays] = useState<ImageOverlay[]>([]);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [showGridGuide, setShowGridGuide] = useState(false);

  // New state for extended grid settings
  const [gridInterval, setGridInterval] = useState<'auto' | 1000 | 10000>('auto');
  const [showGridLabels, setShowGridLabels] = useState(true);
  const [gridLineStyle, setGridLineStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');

  // State for interactive map modes
  const [isInspectModeActive, setIsInspectModeActive] = useState(false);
  const [isRoutePlanningMode, setIsRoutePlanningMode] = useState(false);
  const [currentRoutePoints, setCurrentRoutePoints] = useState<{ coords: Coordinates; name: string }[]>([]);
  const [isRouteStartFromGps, setIsRouteStartFromGps] = useState(false);

  // State for point tracking
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [trackedPath, setTrackedPath] = useState<Coordinates[]>([]);
  const [trackedDistance, setTrackedDistance] = useState(0);


  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const targetMarkerRef = useRef<any>(null);
  const waypointsLayerRef = useRef<any>(null);
  const navLineRef = useRef<any>(null);
  const gridLayerRef = useRef<any>(null);
  const gridLabelsLayerRef = useRef<any>(null);
  const imageOverlaysLayerRef = useRef<any>(null);
  const routePlanningLayerRef = useRef<any>(null);
  const trackedPathLayerRef = useRef<any>(null);
  const cursorMenuRef = useRef<HTMLDivElement>(null);
  const cursorButtonRef = useRef<HTMLButtonElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const downloadControllerRef = useRef<AbortController | null>(null);
  const initialZoneDetectedRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);

  const GRID_COLORS = {
    'Tactical Red': 'rgba(239, 68, 68, 0.8)',
    'NVG Green': 'rgba(34, 197, 94, 0.8)',
    'Subdued White': 'rgba(249, 250, 251, 0.7)',
    'Warning Yellow': 'rgba(234, 179, 8, 0.8)',
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
        isMounted.current = false;
    };
  }, []);

  // Load overlays on mount
  useEffect(() => {
    try {
      const savedOverlays = localStorage.getItem(IMAGE_OVERLAYS_KEY);
      if (savedOverlays) setImageOverlays(JSON.parse(savedOverlays));
    } catch (e) {
      console.error("Failed to load data from localStorage", e);
    }
  }, []);

  // Save overlays on change
  useEffect(() => {
    try {
      localStorage.setItem(IMAGE_OVERLAYS_KEY, JSON.stringify(imageOverlays));
    } catch (e) {
      console.error("Failed to save data to localStorage", e);
    }
  }, [imageOverlays]);
  
  const startBackgroundDownload = async (zoneKey: string) => {
    if (downloadControllerRef.current) {
        downloadControllerRef.current.abort();
    }

    const zoneCacheKey = `${zoneKey}_${mapLayer}`;
    if (getCachedZones().includes(zoneCacheKey)) {
        if (!isMounted.current) return;
        setDownloadState({ active: true, message: `${ZONES[zoneKey].name} (${mapLayer}) is ready offline.`, progress: 100 });
        setTimeout(() => { if (isMounted.current) setDownloadState(s => ({ ...s, active: false })); }, 3000);
        return;
    }

    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        if (!isMounted.current) return;
        setDownloadState({ active: true, message: 'Offline caching not available.', progress: 100 });
        setTimeout(() => { if (isMounted.current) setDownloadState(s => ({ ...s, active: false })); }, 5000);
        return;
    }

    const newController = new AbortController();
    downloadControllerRef.current = newController;
    const { signal } = newController;

    const zone = ZONES[zoneKey];
    if (!zone || !zone.bounds) return;

    if (!isMounted.current) return;
    setDownloadState({ active: true, message: `Preparing ${zone.name}...`, progress: 0 });

    const tilesToFetch = [];
    const TILE_URL_TEMPLATE = MAP_LAYERS[mapLayer as keyof typeof MAP_LAYERS].url;
    
    let subdomains: string[] = [];
    if (TILE_URL_TEMPLATE.includes('{s}')) {
        if(TILE_URL_TEMPLATE.includes('cartocdn')) {
            subdomains = ['a', 'b', 'c', 'd'];
        } else {
            subdomains = ['a', 'b', 'c'];
        }
    }

    const [minLat, minLng, maxLat, maxLng] = zone.bounds;

    for (let z = zone.minZoom; z <= zone.maxZoom; z++) {
      const minX = lon2tile(minLng, z);
      const maxX = lon2tile(maxLng, z);
      const minY = lat2tile(maxLat, z);
      const maxY = lat2tile(minLat, z);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          let url = TILE_URL_TEMPLATE
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));
          if (subdomains.length > 0) {
            const subdomain = subdomains[(x + y) % subdomains.length];
            url = url.replace('{s}', subdomain);
          }
          tilesToFetch.push(url);
        }
      }
    }

    const totalTiles = tilesToFetch.length;
    let completedTiles = 0;
    let failedTiles = 0;
    if (isMounted.current) {
        setDownloadState({ active: true, message: `Caching ${totalTiles} tiles for ${zone.name}...`, progress: 0 });
    }

    const chunkSize = 50;
    for (let i = 0; i < totalTiles; i += chunkSize) {
        if (signal.aborted) {
            if (isMounted.current) setDownloadState({ active: false, message: 'Download cancelled.', progress: 0 });
            return;
        }

        const chunk = tilesToFetch.slice(i, i + chunkSize);
        const promises = chunk.map(url =>
            fetch(url, { mode: 'no-cors', signal }).catch(err => {
                if (err.name !== 'AbortError') {
                    failedTiles++;
                }
            })
        );
        
        await Promise.all(promises);
        
        completedTiles += chunk.length;
        if (isMounted.current) {
            setDownloadState({
                active: true,
                message: `Caching ${zone.name}... ${failedTiles > 0 ? `(${failedTiles} failed)`: ''}`,
                progress: (completedTiles / totalTiles) * 100
            });
        }

        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    if (!isMounted.current) return;

    if (failedTiles > totalTiles * 0.1) { // If >10% of tiles fail, consider it an error
        setDownloadState({ active: true, message: `Failed to cache ${zone.name}.`, progress: 100 });
    } else {
        setDownloadState({ active: true, message: `${zone.name} is ready offline.`, progress: 100 });
        setZoneAsCached(zoneCacheKey);
    }
    
    setTimeout(() => { if (isMounted.current) setDownloadState(s => ({ ...s, active: false })); }, 5000);
    downloadControllerRef.current = null;
  };

  useEffect(() => {
    if (isValidCoords(currentPosition) && !initialZoneDetectedRef.current) {
        const foundZoneKey = Object.keys(ZONES).find(key => {
            const zone = ZONES[key];
            if (!zone.bounds) return false;
            const [minLat, minLng, maxLat, maxLng] = zone.bounds;
            return currentPosition.lat >= minLat && currentPosition.lat <= maxLat &&
                   currentPosition.lng >= minLng && currentPosition.lng <= maxLng;
        });

        if (foundZoneKey) {
            initialZoneDetectedRef.current = true;
            setSelectedZoneKey(foundZoneKey);
            const zone = ZONES[foundZoneKey];
            if (mapRef.current) {
                mapRef.current.flyTo([zone.coords.lat, zone.coords.lng], zone.zoom, { animate: true, duration: 1.5 });
            }
            startBackgroundDownload(foundZoneKey);
        }
    }
  }, [currentPosition]);


  useEffect(() => {
    const isValid = parseIndianGridToCoords(targetZone, targetEasting, targetNorthing) !== null;
    setIsInputValid(isValid);
  }, [targetZone, targetEasting, targetNorthing]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHeading(prev => (prev + (Math.random() - 0.45) * 5) % 360);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const speedInterval = setInterval(() => {
      setSpeed(isNavigating ? (1.2 + Math.random() * 2.5) : 0);
    }, 2500);
    return () => clearInterval(speedInterval);
  }, [isNavigating]);
  
  useEffect(() => {
    if (isValidCoords(currentPosition) && isValidCoords(cursorPosition)) {
        setDistanceToCursor(haversineDistance(currentPosition, cursorPosition));
        setBearingToCursor(calculateBearing(currentPosition, cursorPosition));
    } else {
        setDistanceToCursor(null);
        setBearingToCursor(null);
    }
  }, [currentPosition, cursorPosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (
            cursorMenuRef.current &&
            !cursorMenuRef.current.contains(event.target as Node) &&
            cursorButtonRef.current &&
            !cursorButtonRef.current.contains(event.target as Node)
        ) {
            setShowCursorMenu(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Map Initialization Effect
  useEffect(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      const initialCenter = isValidCoords(currentPosition) ? [currentPosition.lat, currentPosition.lng] : [28.7041, 77.1025];
      const map = L.map(mapContainerRef.current, {
          center: initialCenter,
          zoom: 13,
          zoomControl: false,
          attributionControl: false,
      });
      mapRef.current = map;

      tileLayerRef.current = L.tileLayer(MAP_LAYERS.street.url, {
          attribution: MAP_LAYERS.street.attribution
      }).addTo(map);

      gridLayerRef.current = L.layerGroup().addTo(map);
      gridLabelsLayerRef.current = L.layerGroup().addTo(map);
      waypointsLayerRef.current = L.layerGroup().addTo(map);
      imageOverlaysLayerRef.current = L.layerGroup().addTo(map);
      routePlanningLayerRef.current = L.layerGroup().addTo(map);
      trackedPathLayerRef.current = L.layerGroup().addTo(map);

      const updateCursorPosition = () => {
        const center = map.getCenter();
        setCursorPosition({ lat: center.lat, lng: center.lng });
      };

      map.on('move', updateCursorPosition);
      updateCursorPosition(); // Set initial cursor position

      return () => {
          map.off('move', updateCursorPosition);
          map.remove();
          mapRef.current = null;
      };
  }, []); // Run only once on mount

  // Map Layer Effect
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(MAP_LAYERS[mapLayer as keyof typeof MAP_LAYERS].url);
    }
  }, [mapLayer]);

  // Grid Drawing Effect
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateGrid = () => {
        if (!gridLayerRef.current || !gridLabelsLayerRef.current) return;
        gridLayerRef.current.clearLayers();
        gridLabelsLayerRef.current.clearLayers();

        const zoom = map.getZoom();

        // Determine grid spacing first to decide on visibility
        let gridStep; // in meters
        if (gridInterval !== 'auto') {
            gridStep = gridInterval;
        } else {
            if (zoom > 14) gridStep = 1000;      // 1km
            else if (zoom > 11) gridStep = 5000; // 5km
            else gridStep = 10000;               // 10km
        }

        // Dynamically set minimum zoom for grid visibility based on grid density
        let minZoomForGrid;
        switch(gridStep) {
            case 1000: minZoomForGrid = 12; break; // 1km grid only on high zoom
            case 5000: minZoomForGrid = 10; break; // 5km grid on medium zoom
            default: minZoomForGrid = 8;           // 10km grid visible on lower zoom
        }
        
        if (zoom < minZoomForGrid) return; // Exit if zoomed out too far for the current grid density

        const bounds = map.getBounds();
        // FIX: Clamp latitude to prevent projection errors at the poles, which can produce NaN.
        const safeNorth = Math.min(bounds.getNorth(), 89.999);
        const safeSouth = Math.max(bounds.getSouth(), -89.999);
        const center = L.latLngBounds(L.latLng(safeSouth, bounds.getWest()), L.latLng(safeNorth, bounds.getEast())).getCenter();

        const everestCenter = wgs84ToEverest1956({ lat: center.lat, lng: center.lng });
        // FIX: Add validity check after datum transformation.
        if (!isValidCoords(everestCenter) || Math.abs(everestCenter.lat) >= 90) {
            return;
        }
        const { zone } = getIndianGridZoneInfo(everestCenter.lng);

        let dashArray;
        switch (gridLineStyle) {
            case 'dashed': dashArray = '5, 10'; break;
            case 'dotted': dashArray = '1, 5'; break;
            default: dashArray = undefined;
        }

        const gridLineStyleOptions = { color: gridColor, weight: gridWeight, interactive: false, opacity: 0.5, dashArray };
        const majorGridLineStyleOptions = { color: gridColor.replace(/,\s*\d\.\d\)/, ', 0.8)'), weight: gridWeight, interactive: false, dashArray };
        const labelColor = gridColor.replace(/rgba\((\d+,\s*\d+,\s*\d+),.*/, 'rgb($1)');

        const styleId = 'grid-label-style';
        let styleElement = document.getElementById(styleId);
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }
        styleElement.innerHTML = `.grid-label { color: ${labelColor}; text-shadow: 0 0 2px black, 0 0 2px black, 0 0 2px black; }`;

        const majorLineFactor = 10;

        // Get UTM bounds of the visible map area using the safe, clamped bounds
        const everestSW = wgs84ToEverest1956({ lat: safeSouth, lng: bounds.getWest() });
        const everestNE = wgs84ToEverest1956({ lat: safeNorth, lng: bounds.getEast() });

        // FIX: Add another validity check for the corners before projecting to UTM.
        if (!isValidCoords(everestSW) || !isValidCoords(everestNE) || Math.abs(everestSW.lat) >= 90 || Math.abs(everestNE.lat) >= 90) {
            return;
        }
        
        const utmSW = everest1956ToUtm(everestSW);
        const utmNE = everest1956ToUtm(everestNE);
        
        const minEasting = Math.floor(utmSW.easting / gridStep) * gridStep;
        const maxEasting = Math.ceil(utmNE.easting / gridStep) * gridStep;
        const minNorthing = Math.floor(utmSW.northing / gridStep) * gridStep;
        const maxNorthing = Math.ceil(utmNE.northing / gridStep) * gridStep;
        
        // Draw Easting lines (vertical)
        for (let e = minEasting; e <= maxEasting; e += gridStep) {
            const startWGS = everest1956ToWgs84(utmToEverest1956(zone, e, minNorthing));
            const endWGS = everest1956ToWgs84(utmToEverest1956(zone, e, maxNorthing));

            if (!isValidCoords(startWGS) || !isValidCoords(endWGS)) continue;
            
            const isMajor = e % (gridStep * majorLineFactor) === 0;
            L.polyline([[startWGS.lat, startWGS.lng], [endWGS.lat, endWGS.lng]], isMajor ? majorGridLineStyleOptions : gridLineStyleOptions).addTo(gridLayerRef.current);

            if (showGridLabels && zoom > 10) {
                const eastingLabel = String(Math.floor(e / 1000) % 100).padStart(2, '0');
                const topWGS = everest1956ToWgs84(utmToEverest1956(zone, e, utmNE.northing));
                const bottomWGS = everest1956ToWgs84(utmToEverest1956(zone, e, utmSW.northing));
                 if (!isValidCoords(topWGS) || !isValidCoords(bottomWGS)) continue;

                L.marker([bounds.getNorth(), topWGS.lng], { icon: L.divIcon({ className: 'grid-label', html: `<span style="transform: rotate(-90deg) translate(-10px, -15px); display: inline-block; transform-origin: center;">${eastingLabel}</span>` }) }).addTo(gridLabelsLayerRef.current);
                L.marker([bounds.getSouth(), bottomWGS.lng], { icon: L.divIcon({ className: 'grid-label', html: `<span style="transform: rotate(-90deg) translate(10px, -15px); display: inline-block; transform-origin: center;">${eastingLabel}</span>` }) }).addTo(gridLabelsLayerRef.current);
            }
        }
        
        // Draw Northing lines (horizontal)
        for (let n = minNorthing; n <= maxNorthing; n += gridStep) {
            const startWGS = everest1956ToWgs84(utmToEverest1956(zone, minEasting, n));
            const endWGS = everest1956ToWgs84(utmToEverest1956(zone, maxEasting, n));
            
            if (!isValidCoords(startWGS) || !isValidCoords(endWGS)) continue;

            const isMajor = n % (gridStep * majorLineFactor) === 0;
            L.polyline([[startWGS.lat, startWGS.lng], [endWGS.lat, endWGS.lng]], isMajor ? majorGridLineStyleOptions : gridLineStyleOptions).addTo(gridLayerRef.current);
            
            if (showGridLabels && zoom > 10) {
                const northingLabel = String(Math.floor(n / 1000) % 100).padStart(2, '0');
                const leftWGS = everest1956ToWgs84(utmToEverest1956(zone, utmSW.easting, n));
                const rightWGS = everest1956ToWgs84(utmToEverest1956(zone, utmNE.easting, n));
                if (!isValidCoords(leftWGS) || !isValidCoords(rightWGS)) continue;

                L.marker([leftWGS.lat, bounds.getWest()], { icon: L.divIcon({ className: 'grid-label', html: `<span style="padding-left: 5px;">${northingLabel}</span>` }) }).addTo(gridLabelsLayerRef.current);
                L.marker([rightWGS.lat, bounds.getEast()], { icon: L.divIcon({ className: 'grid-label', html: `<span style="text-align: right; display: block; transform: translateX(-100%); padding-right: 5px;">${northingLabel}</span>` }) }).addTo(gridLabelsLayerRef.current);
            }
        }
    };

    map.on('moveend', updateGrid);
    updateGrid(); // Initial draw for current settings

    return () => {
        map.off('moveend', updateGrid);
    };
}, [gridColor, gridWeight, gridInterval, showGridLabels, gridLineStyle]); // Rerun effect if grid settings change


  // Image Overlays Effect
  useEffect(() => {
    const layer = imageOverlaysLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    imageOverlays.forEach(overlay => {
      const leafletOverlay = L.imageOverlay(overlay.imageUrl, overlay.bounds, {
        opacity: 0.8,
        interactive: true,
      }).addTo(layer);

      leafletOverlay.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e); // Prevent map click event

        const popupContainer = L.DomUtil.create('div', 'p-1 space-y-2 font-sans');
        
        const deleteButton = L.DomUtil.create('button', 'w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-red-700 rounded font-bold', popupContainer);
        deleteButton.innerHTML = 'Remove Image';
        
        L.DomEvent.on(deleteButton, 'click', () => {
          setImageOverlays(prev => prev.filter(item => item.id !== overlay.id));
          map.closePopup();
        });

        L.popup({
            closeButton: false,
            className: 'image-overlay-popup'
          })
          .setLatLng(e.latlng)
          .setContent(popupContainer)
          .openOn(map);
      });
    });
  }, [imageOverlays]);


  // User Position Effect
  useEffect(() => {
    if (!mapRef.current || !isValidCoords(currentPosition)) return;
    
    const map = mapRef.current;
    const userLatLng: [number, number] = [currentPosition.lat, currentPosition.lng];

    if (!userMarkerRef.current) {
        // First time we have a position: create marker and center view.
        const userIconHtml = `
            <div class="user-marker-container" style="transform-origin: center center;">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-cyan-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] transition-transform duration-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" /></svg>
            </div>
        `;
        const userIcon = L.divIcon({
            html: userIconHtml,
            className: 'bg-transparent border-none',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
        });
        userMarkerRef.current = L.marker(userLatLng, { icon: userIcon }).addTo(map);
        
        // Center the map on the user's first known location.
        map.flyTo(userLatLng, 15);

    } else {
        // Marker already exists, just update its position without moving the map.
        userMarkerRef.current.setLatLng(userLatLng);
    }
}, [currentPosition]);

// User Marker Rotation Effect
useEffect(() => {
    if (userMarkerRef.current) {
        const markerElement = userMarkerRef.current.getElement();
        if (markerElement) {
            const container = markerElement.querySelector('.user-marker-container');
            if (container) {
                const rotation = isNavigating && bearingToTarget !== null ? bearingToTarget : heading;
                container.style.transform = `rotate(${rotation}deg)`;
            }
        }
    }
}, [heading, isNavigating, bearingToTarget]);


  // Navigation Effect
  useEffect(() => {
      if (!mapRef.current) return;
      const map = mapRef.current;

      if (isNavigating && isValidCoords(targetPosition) && isValidCoords(currentPosition)) {
          const targetLatLng = [targetPosition.lat, targetPosition.lng];
          const userLatLng = [currentPosition.lat, currentPosition.lng];
          
          const nextWptName = activeRoute?.points[activeRouteLegIndex]?.name || 'Target';
          const popupContent = createPopupContent(nextWptName, targetPosition);

          if (!targetMarkerRef.current) {
              const targetIcon = L.divIcon({
                  html: `<div class="text-3xl font-bold text-red-500">X</div>`,
                  className: 'bg-transparent border-none',
                  iconSize: [30, 30],
                  iconAnchor: [15, 15]
              });
              targetMarkerRef.current = L.marker(targetLatLng, { icon: targetIcon }).addTo(map)
               .bindTooltip(nextWptName, { permanent: true, direction: 'bottom', className: 'leaflet-tooltip-tgt', offset: [0, 8] })
               .bindPopup(popupContent);
          } else {
              targetMarkerRef.current.setLatLng(targetLatLng)
               .setPopupContent(popupContent)
               .setTooltipContent(nextWptName);
          }

          if (!navLineRef.current) {
              navLineRef.current = L.polyline([userLatLng, targetLatLng], { color: '#f56565', dashArray: '4, 8', weight: 3 }).addTo(map);
          } else {
              navLineRef.current.setLatLngs([userLatLng, targetLatLng]);
          }
          
          const bearing = calculateBearing(currentPosition, targetPosition);
          setBearingToTarget(bearing);

          map.fitBounds([userLatLng, targetLatLng], { padding: [50, 50], maxZoom: 16 });

      } else {
          if (targetMarkerRef.current) {
              map.removeLayer(targetMarkerRef.current);
              targetMarkerRef.current = null;
          }
          if (navLineRef.current) {
              map.removeLayer(navLineRef.current);
              navLineRef.current = null;
          }
          setBearingToTarget(null);
      }

  }, [isNavigating, targetPosition, currentPosition, activeRoute, activeRouteLegIndex]);

  // Map Click Handler for Different Modes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: any) => {
      // Route Planning Mode
      if (isRoutePlanningMode) {
        const newPoint = {
          coords: { lat: e.latlng.lat, lng: e.latlng.lng },
          name: currentRoutePoints.length === 0 ? 'S' : `P${currentRoutePoints.length}`
        };
        setCurrentRoutePoints(prev => [...prev, newPoint]);
        return; // Prioritize route planning over other modes
      }

      // Inspect Mode
      if (isInspectModeActive) {
        const clickedCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
        const gridRef = formatToIndianGrid(clickedCoords);
        
        let bearingDistanceHtml = '<p class="text-gray-500 text-xs">Current position unavailable.</p>';
        if (isValidCoords(currentPosition)) {
            const distance = haversineDistance(currentPosition, clickedCoords);
            const bearing = calculateBearing(currentPosition, clickedCoords);
            const formatDistance = (d: number) => d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d.toFixed(0)} m`;
            bearingDistanceHtml = `
                <p><span class="text-gray-400">Bearing:</span> ${Math.round(bearing)}°</p>
                <p><span class="text-gray-400">Distance:</span> ${formatDistance(distance)}</p>
            `;
        }
        
        if (gridRef) {
          const popupContent = `
            <div class="font-mono text-xs text-white">
              <h3 class="font-bold text-sm text-cyan-400 mb-1">Inspect Point</h3>
              <p><span class="text-gray-400">Zone:</span> ${gridRef.zone}</p>
              <p><span class="text-gray-400">Easting:</span> ${gridRef.easting}</p>
              <p><span class="text-gray-400">Northing:</span> ${gridRef.northing}</p>
              <hr class="border-t border-gray-600 my-1.5">
              <h4 class="font-bold text-xs text-gray-400 mb-0.5">From Your Position</h4>
              ${bearingDistanceHtml}
              <hr class="border-t border-gray-600 my-1.5">
              <p class="text-gray-400 text-[10px] mt-1">6-Fig: ${gridRef.easting.substring(2, 5)} ${gridRef.northing.substring(2, 5)}</p>
              <p class="text-gray-400 text-[10px]">8-Fig: ${gridRef.easting.substring(2, 6)} ${gridRef.northing.substring(2, 6)}</p>
            </div>
          `;
          L.popup({ closeButton: true, className: 'leaflet-popup-content-wrapper' })
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(map);
        }
        return;
      }
    };

    map.on('click', handleMapClick);

    // Update cursor style based on active mode
    if (mapContainerRef.current) {
        if (isRoutePlanningMode) {
            mapContainerRef.current.style.cursor = 'crosshair';
        } else if (isInspectModeActive) {
            mapContainerRef.current.style.cursor = 'help';
        } else {
            mapContainerRef.current.style.cursor = '';
        }
    }
    
    return () => {
      map.off('click', handleMapClick);
      if (mapContainerRef.current) mapContainerRef.current.style.cursor = '';
    };
  }, [isRoutePlanningMode, isInspectModeActive, currentPosition, currentRoutePoints]);

    // Route Planning Drawing Effect
    useEffect(() => {
        const layer = routePlanningLayerRef.current;
        if (!layer || !mapRef.current) return;

        layer.clearLayers();

        if (isRoutePlanningMode && currentRoutePoints.length > 0) {
            // Draw markers for each point
            currentRoutePoints.forEach((point) => {
                const isStart = point.name === 'S';
                const pointIcon = L.divIcon({
                    html: `<div class="w-6 h-6 ${isStart ? 'bg-green-500' : 'bg-yellow-400'} border-2 border-black rounded-full flex items-center justify-center text-black text-xs font-bold shadow-lg">${point.name}</div>`,
                    className: 'bg-transparent border-none',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                L.marker([point.coords.lat, point.coords.lng], { icon: pointIcon, zIndexOffset: 1000 }).addTo(layer);
            });

            // Draw lines and tooltips for segments
            if (currentRoutePoints.length > 1) {
                for (let i = 1; i < currentRoutePoints.length; i++) {
                    const prevPoint = currentRoutePoints[i - 1];
                    const currentPoint = currentRoutePoints[i];

                    const segment = L.polyline(
                        [[prevPoint.coords.lat, prevPoint.coords.lng], [currentPoint.coords.lat, currentPoint.coords.lng]],
                        { color: '#facc15', weight: 3, dashArray: '5, 5' }
                    ).addTo(layer);

                    const distance = haversineDistance(prevPoint.coords, currentPoint.coords);
                    const bearing = calculateBearing(prevPoint.coords, currentPoint.coords);
                    const formatDistance = (d: number) => d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d.toFixed(0)} m`;
                    
                    const tooltipContent = `
                        <div class="font-mono text-xs bg-black/70 text-white p-1 rounded-md border border-yellow-400 shadow-lg">
                           <div><span class="font-bold text-yellow-400">BRG:</span> ${Math.round(bearing)}°</div>
                           <div><span class="font-bold text-yellow-400">DST:</span> ${formatDistance(distance)}</div>
                        </div>
                    `;

                    segment.bindTooltip(tooltipContent, {
                        permanent: true,
                        direction: 'center',
                        className: 'segment-tooltip',
                    });
                }
            }
        }
    }, [isRoutePlanningMode, currentRoutePoints]);

    // Waypoint Advancement Logic
    useEffect(() => {
        if (!activeRoute || !isValidCoords(currentPosition)) return;

        const WAYPOINT_RADIUS_METERS = 30; // 30 meters proximity to trigger next waypoint
        const nextWaypoint = activeRoute.points[activeRouteLegIndex];
        if (!nextWaypoint) {
            // End of route
            setIsNavigating(false);
            setActiveRoute(null);
            return;
        }

        const distance = haversineDistance(currentPosition, nextWaypoint.coords);
        if (distance < WAYPOINT_RADIUS_METERS) {
            const nextIndex = activeRouteLegIndex + 1;
            if (nextIndex >= activeRoute.points.length) {
                // Reached final destination
                setIsNavigating(false);
                setActiveRoute(null);
                // TODO: show toast "Route completed"
            } else {
                setActiveRouteLegIndex(nextIndex);
            }
        }
    }, [currentPosition, activeRoute, activeRouteLegIndex]);

    // Update targetPosition based on active route
    useEffect(() => {
        if (isNavigating && activeRoute) {
            const nextWaypoint = activeRoute.points[activeRouteLegIndex];
            if (nextWaypoint) {
                setTargetPosition(nextWaypoint.coords);
            }
        } else if (!isNavigating) {
            setTargetPosition(null);
        }
    }, [isNavigating, activeRoute, activeRouteLegIndex]);

    const TRACKING_DISTANCE_THRESHOLD = 5; // meters

    // Path Tracking Logic
    useEffect(() => {
        if (!isTrackingActive || !isValidCoords(currentPosition)) return;

        setTrackedPath(prevPath => {
            if (prevPath.length === 0) {
                return [currentPosition];
            }
            const lastPoint = prevPath[prevPath.length - 1];
            const distance = haversineDistance(lastPoint, currentPosition);

            if (distance > TRACKING_DISTANCE_THRESHOLD) {
                return [...prevPath, currentPosition];
            }
            return prevPath;
        });
    }, [currentPosition, isTrackingActive]);

    // Calculate tracked distance and draw path on map
    useEffect(() => {
        const layer = trackedPathLayerRef.current;
        if (!layer) return;

        if (trackedPath.length < 2) {
            layer.clearLayers();
            setTrackedDistance(0);
            return;
        }

        let totalDistance = 0;
        for (let i = 1; i < trackedPath.length; i++) {
            totalDistance += haversineDistance(trackedPath[i - 1], trackedPath[i]);
        }
        setTrackedDistance(totalDistance);

        const latLngs = trackedPath.map(p => [p.lat, p.lng]);
        layer.clearLayers();
        L.polyline(latLngs, {
            color: '#22D3EE', // cyan
            weight: 3,
            opacity: 0.8,
            dashArray: '5, 10'
        }).addTo(layer);

    }, [trackedPath]);
  
  const handleGoTo = () => {
    if (!isInputValid) return;
    const newTarget = parseIndianGridToCoords(targetZone, targetEasting, targetNorthing);
    if (newTarget) {
      const tempRoute: Route = {
        name: "GOTO Target",
        points: [{ name: "TGT", coords: newTarget }]
      };
      setActiveRoute(tempRoute);
      setActiveRouteLegIndex(0);
      setIsNavigating(true);
    } else {
      alert('Invalid Indian Grid format.');
    }
  };

  const handleGoToWaypoint = (waypointCoords: Coordinates) => {
    const gridRef = formatToIndianGrid(waypointCoords);
    if (gridRef) {
      setTargetZone(String(gridRef.zone));
      setTargetEasting(gridRef.easting);
      setTargetNorthing(gridRef.northing);
    }
    const tempRoute: Route = {
      name: "Waypoint Nav",
      points: [{ name: "WPT", coords: waypointCoords }]
    };
    setActiveRoute(tempRoute);
    setActiveRouteLegIndex(0);
    setIsNavigating(true);
  };

  const handleMarkCurrentPosition = () => {
    if (isValidCoords(currentPosition)) {
      setNewWaypointName(`WP-${String(waypoints.length + 1).padStart(3, '0')}`);
      setNamingWaypointInfo({ coords: currentPosition });
    }
  };

  const handleMarkCursorPosition = () => {
    if (isValidCoords(cursorPosition)) {
      setNewWaypointName(`MK-${String(waypoints.length + 1).padStart(3, '0')}`);
      setNamingWaypointInfo({ coords: cursorPosition });
    }
  };

  const handleSaveWaypoint = () => {
    if (namingWaypointInfo && newWaypointName.trim()) {
      setWaypoints([...waypoints, { name: newWaypointName.trim(), coords: namingWaypointInfo.coords }]);
      setNamingWaypointInfo(null);
      setNewWaypointName('');
    }
  };

  const handleCancelWaypoint = () => {
    setNamingWaypointInfo(null);
    setNewWaypointName('');
  };

  const handleDeleteWaypoint = (indexToRemove: number) => {
    setWaypoints(waypoints.filter((_, index) => index !== indexToRemove));
  };

  const handleCenterOnUser = () => {
    if (mapRef.current && isValidCoords(currentPosition)) {
      mapRef.current.flyTo([currentPosition.lat, currentPosition.lng], 15, {
        animate: true,
        duration: 1,
      });
    }
  };
  
  const handleZoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const zoneKey = e.target.value;
    setSelectedZoneKey(zoneKey);
    const zone = ZONES[zoneKey];
    if (mapRef.current && zone && zone.coords) {
      mapRef.current.flyTo([zone.coords.lat, zone.coords.lng], zone.zoom, {
        animate: true,
        duration: 1.5,
      });
    }
    if (zone.bounds) {
        startBackgroundDownload(zoneKey);
    }
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidCoords(cursorPosition)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        const size = 0.005; // Define a default size for the overlay, e.g., ~500m
        const newOverlay: ImageOverlay = {
          id: Date.now(),
          imageUrl,
          bounds: [
            [cursorPosition.lat - size, cursorPosition.lng - size],
            [cursorPosition.lat + size, cursorPosition.lng + size]
          ]
        };
        setImageOverlays(prev => [...prev, newOverlay]);
      };
      reader.readAsDataURL(file);
    }
    event.target.value = ''; // Reset input to allow selecting the same file again
  };

    const handleToggleInspectMode = () => {
        setIsRoutePlanningMode(false);
        setCurrentRoutePoints([]);
        setIsInspectModeActive(prev => !prev);
    };

    const handleStartRoutePlanning = () => {
        setIsInspectModeActive(false);
        if (isValidCoords(currentPosition)) {
            setCurrentRoutePoints([{ coords: currentPosition, name: 'S' }]);
            setIsRouteStartFromGps(true);
        } else {
            setCurrentRoutePoints([]);
            setIsRouteStartFromGps(false);
        }
        setIsRoutePlanningMode(true);
        setIsFabMenuOpen(false);
    };

    const calculateTotalRouteDistance = (points: { coords: Coordinates }[]): string => {
        if (points.length < 2) return '0 m';
        let totalDistance = 0;
        for (let i = 1; i < points.length; i++) {
            totalDistance += haversineDistance(points[i - 1].coords, points[i].coords);
        }
        if (totalDistance >= 1000) return `${(totalDistance / 1000).toFixed(2)} km`;
        return `${totalDistance.toFixed(0)} m`;
    };

    const handleToggleTracking = () => {
        setIsTrackingActive(prev => {
            const isNowActive = !prev;
            if (isNowActive) {
                // Starting tracking
                setTrackedPath(isValidCoords(currentPosition) ? [currentPosition] : []);
                setTrackedDistance(0);
                trackedPathLayerRef.current?.clearLayers();
            }
            return isNowActive;
        });
    };

    const formatTrackedDistance = (d: number) => {
        if (d >= 1000) return `${(d / 1000).toFixed(2)} km`;
        return `${d.toFixed(0)} m`;
    };


  return (
    <div className="flex-grow h-full relative bg-gray-900 text-white">
        <style>{`
            .leaflet-tooltip-tgt {
                background-color: rgba(0,0,0,0.5) !important;
                border: none !important;
                color: #ef4444 !important;
                font-family: monospace;
                font-size: 0.75rem;
                padding: 2px 4px !important;
                border-radius: 4px;
                box-shadow: none !important;
                font-weight: bold;
            }
            .leaflet-popup-content-wrapper {
                background: #1f2937 !important; /* bg-gray-800 */
                color: #d1d5db !important; /* text-gray-300 */
                border-radius: 8px !important;
                border: 1px solid #374151; /* border-gray-700 */
                box-shadow: 0 4px 6px rgba(0,0,0,0.5) !important;
            }
            .leaflet-popup-content {
                margin: 10px !important;
                line-height: 1.5;
                min-width: 150px;
            }
            .leaflet-popup-tip {
                background: #1f2937 !important;
            }
            .leaflet-container a.leaflet-popup-close-button {
                color: #9ca3af !important; /* text-gray-400 */
                padding: 8px 8px 0 0 !important;
            }
            .image-overlay-popup .leaflet-popup-content-wrapper {
                padding: 0 !important;
            }
            .image-overlay-popup .leaflet-popup-content {
                margin: 0 !important;
                min-width: 180px;
            }
            .grid-label {
                font-family: monospace;
                font-size: 12px;
                font-weight: bold;
                background: none !important;
                border: none !important;
                box-shadow: none !important;
                white-space: nowrap;
                -webkit-text-stroke: 1px black;
            }
            .crosshair {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 30px;
                height: 30px;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 1000;
            }
            .crosshair::before, .crosshair::after {
                content: '';
                position: absolute;
                background-color: #facc15; /* yellow-400 */
                box-shadow: 0 0 5px rgba(0,0,0,0.8);
            }
            .crosshair::before {
                left: 50%;
                width: 3px;
                height: 100%;
                transform: translateX(-50%);
            }
            .crosshair::after {
                top: 50%;
                height: 3px;
                width: 100%;
                transform: translateY(-50%);
            }
            .segment-tooltip {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
            }
        `}</style>

        <input
            type="file"
            accept="image/*"
            ref={uploadInputRef}
            onChange={handleFileSelected}
            className="hidden"
            aria-hidden="true"
        />
      
        {/* Map Container - fills parent */}
        <div className="absolute inset-0 z-0">
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
            <div className="crosshair"></div>
        </div>

        {showGridGuide && <GridGuideModal onClose={() => setShowGridGuide(false)} />}

        {isSettingsOpen && (
            <div 
                className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setIsSettingsOpen(false)}
            >
                <div
                    className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-xs p-4"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-bold text-cyan-400">Map Settings</h4>
                        <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-white">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 font-mono mb-2 font-bold">GRID COLOR</label>
                            <div className="grid grid-cols-4 gap-2">
                                {Object.entries(GRID_COLORS).map(([name, colorValue]) => (
                                    <button 
                                        key={name}
                                        onClick={() => setGridColor(colorValue)}
                                        className={`h-10 rounded-md border-2 transition-all ${gridColor === colorValue ? 'border-cyan-400 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: colorValue.replace(/,\s*\d\.\d\)/, ', 1)') }}
                                        title={name}
                                        aria-label={`Set grid color to ${name}`}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="grid-weight-slider" className="block text-sm text-gray-400 font-mono mb-2 font-bold">GRID LINE WEIGHT ({gridWeight.toFixed(1)}px)</label>
                            <input
                                id="grid-weight-slider"
                                type="range"
                                min="1"
                                max="4"
                                step="0.1"
                                value={gridWeight}
                                onChange={(e) => setGridWeight(parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 font-mono mb-2 font-bold">GRID INTERVAL</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => setGridInterval('auto')} className={`py-1.5 px-2 rounded-md font-bold text-xs transition-colors ${gridInterval === 'auto' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Auto</button>
                                <button onClick={() => setGridInterval(1000)} className={`py-1.5 px-2 rounded-md font-bold text-xs transition-colors ${gridInterval === 1000 ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>1km</button>
                                <button onClick={() => setGridInterval(10000)} className={`py-1.5 px-2 rounded-md font-bold text-xs transition-colors ${gridInterval === 10000 ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>10km</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 font-mono mb-2 font-bold">GRID LINE STYLE</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => setGridLineStyle('solid')} className={`py-1.5 px-2 rounded-md font-bold text-xs transition-colors ${gridLineStyle === 'solid' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Solid</button>
                                <button onClick={() => setGridLineStyle('dashed')} className={`py-1.5 px-2 rounded-md font-bold text-xs transition-colors ${gridLineStyle === 'dashed' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Dashed</button>
                                <button onClick={() => setGridLineStyle('dotted')} className={`py-1.5 px-2 rounded-md font-bold text-xs transition-colors ${gridLineStyle === 'dotted' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Dotted</button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="label-toggle" className="flex justify-between items-center cursor-pointer">
                                <span className="text-sm text-gray-400 font-mono font-bold">SHOW GRID LABELS</span>
                                <div className="relative">
                                    <input id="label-toggle" type="checkbox" className="sr-only" checked={showGridLabels} onChange={() => setShowGridLabels(!showGridLabels)} />
                                    <div className={`block w-12 h-6 rounded-full transition-colors ${showGridLabels ? 'bg-cyan-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${showGridLabels ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* FIX: Sidebar Panel for Map Controls, moved from App.tsx */}
        <aside className={`absolute top-0 right-0 h-full w-full max-w-sm bg-gray-900/80 backdrop-blur-md border-l border-gray-700 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <header className="flex-shrink-0 h-16 flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
                <h2 className="text-lg font-bold text-cyan-400 uppercase tracking-wider">Controls</h2>
                <button 
                    onClick={() => setIsSidebarOpen(false)} 
                    className="p-2 rounded-md hover:bg-gray-700"
                    aria-label="Close Controls Panel"
                >
                    <ChevronLeftIcon className="w-6 h-6" />
                </button>
            </header>
            <div className="flex-grow overflow-y-auto">
                 <div className="space-y-4 p-4">
                        {/* GOTO Section */}
                        <div>
                             <h4 className="text-lg sm:text-xl font-bold text-cyan-400 mb-3 flex items-center">
                                Go To Coordinates
                                <button onClick={() => setShowGridGuide(true)} className="ml-2 text-gray-400 hover:text-white" title="Open Grid Guide">
                                    <QuestionMarkCircleIcon className="w-5 h-5" />
                                </button>
                            </h4>
                            <div className="space-y-2">
                                <div>
                                    <label htmlFor="zone-input" className="block text-xs sm:text-sm text-gray-400 font-mono mb-1 font-bold">ZONE</label>
                                    <input
                                        id="zone-input"
                                        type="text"
                                        value={targetZone}
                                        onChange={(e) => setTargetZone(e.target.value)}
                                        className={`w-full bg-gray-900 border rounded-md p-2 sm:p-2.5 text-white focus:outline-none focus:ring-2 font-mono font-bold transition-colors ${
                                        isInputValid 
                                            ? 'border-gray-600 focus:ring-cyan-500' 
                                            : 'border-red-500 focus:ring-red-500'
                                        }`}
                                        aria-label="Target Zone"
                                        aria-invalid={!isInputValid}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="easting-input" className="block text-xs sm:text-sm text-gray-400 font-mono mb-1 font-bold">EASTING</label>
                                    <input
                                        id="easting-input"
                                        type="text"
                                        value={targetEasting}
                                        onChange={(e) => setTargetEasting(e.target.value)}
                                        className={`w-full bg-gray-900 border rounded-md p-2 sm:p-2.5 text-white focus:outline-none focus:ring-2 font-mono font-bold transition-colors ${
                                        isInputValid 
                                            ? 'border-gray-600 focus:ring-cyan-500' 
                                            : 'border-red-500 focus:ring-red-500'
                                        }`}
                                        aria-label="Target Easting Coordinate"
                                        aria-invalid={!isInputValid}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="northing-input" className="block text-xs sm:text-sm text-gray-400 font-mono mb-1 font-bold">NORTHING</label>
                                    <input 
                                        id="northing-input"
                                        type="text"
                                        value={targetNorthing}
                                        onChange={(e) => setTargetNorthing(e.target.value)}
                                        className={`w-full bg-gray-900 border rounded-md p-2 sm:p-2.5 text-white focus:outline-none focus:ring-2 font-mono font-bold transition-colors ${
                                        isInputValid 
                                            ? 'border-gray-600 focus:ring-cyan-500' 
                                            : 'border-red-500 focus:ring-red-500'
                                        }`}
                                        aria-label="Target Northing Coordinate"
                                        aria-invalid={!isInputValid}
                                    />
                                </div>
                                <button 
                                    onClick={() => { handleGoTo(); setIsSidebarOpen(false); }}
                                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 sm:py-2.5 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!isInputValid}
                                >
                                    GOTO
                                </button>
                            </div>
                        </div>

                        <hr className="border-gray-600" />

                        <div>
                            <h4 className="text-lg sm:text-xl font-bold text-cyan-400 mb-3">Map & Zone Selection</h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs sm:text-sm text-gray-400 font-mono mb-1 font-bold">MAP LAYER</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => setMapLayer('street')} className={`py-2 px-3 rounded-md font-bold text-sm transition-colors ${mapLayer === 'street' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Light</button>
                                        <button onClick={() => setMapLayer('dark')} className={`py-2 px-3 rounded-md font-bold text-sm transition-colors ${mapLayer === 'dark' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Night</button>
                                        <button onClick={() => setMapLayer('satellite')} className={`py-2 px-3 rounded-md font-bold text-sm transition-colors ${mapLayer === 'satellite' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Satellite</button>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="zone-select" className="block text-xs sm:text-sm text-gray-400 font-mono mb-1 font-bold">ZONE JUMP</label>
                                    <select
                                        id="zone-select"
                                        onChange={handleZoneChange}
                                        className="w-full bg-gray-900 border rounded-md p-2 sm:p-2.5 text-white focus:outline-none focus:ring-2 font-mono font-bold transition-colors border-gray-600 focus:ring-cyan-500"
                                        value={selectedZoneKey}
                                    >
                                        {Object.entries(ZONES).map(([key, zone]) => (
                                            <option key={key} value={key}>{zone.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <hr className="border-gray-600" />
                        
                        <div>
                            <h4 className="text-lg sm:text-xl font-bold text-green-400 mb-2">Mark Current Position</h4>
                            <button 
                                onClick={() => { handleMarkCurrentPosition(); setIsSidebarOpen(false); }}
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 sm:py-2.5 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!isValidCoords(currentPosition)}
                            >
                                MARK
                            </button>
                        </div>
                    </div>
            </div>
        </aside>

        {isSidebarOpen && (
            <div 
                onClick={() => setIsSidebarOpen(false)}
                className="absolute inset-0 bg-black/50 z-30 md:hidden" 
                aria-hidden="true"
            />
        )}

        {/* Top Info Bar */}
        <div className="absolute top-0 left-0 right-0 z-10 p-2 sm:p-4 pointer-events-none bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex justify-between items-start w-full">
                {/* Left Side Info */}
                <div className="space-y-2 pointer-events-auto">
                    {isOffline && (
                        <div className="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-md animate-pulse">
                            OFFLINE MODE
                        </div>
                    )}
                    <div className="bg-black/50 backdrop-blur-sm p-2 rounded-lg font-mono w-48 sm:w-56">
                        <CoordinateDisplay label="CURRENT POS (IGS)" subtitle="YOU" coords={currentPosition} color="text-green-400" align="left" />
                    </div>
                    {isTrackingActive && (
                        <div className="bg-black/50 backdrop-blur-sm p-2 rounded-lg font-mono w-48 sm:w-56">
                            <p className="text-xs sm:text-sm text-gray-400 font-bold">TRACK DIST</p>
                            <p className="text-cyan-400 text-lg sm:text-xl font-bold">{formatTrackedDistance(trackedDistance)}</p>
                        </div>
                    )}
                    {isNavigating && activeRoute && isValidCoords(currentPosition) && (
                        <div className="w-48 sm:w-56">
                            <TripComputer
                                speed={speed}
                                currentPosition={currentPosition}
                                activeRoute={activeRoute}
                                legIndex={activeRouteLegIndex}
                            />
                        </div>
                    )}
                </div>

                {/* Right Side Info */}
                <div className="pointer-events-auto bg-black/50 backdrop-blur-sm p-2 rounded-lg font-mono w-48 sm:w-56 relative">
                    <CoordinateDisplay
                        label="CURSOR POS (IGS)"
                        subtitle="CURSOR"
                        coords={cursorPosition}
                        color="text-yellow-400"
                        distance={distanceToCursor}
                        bearing={bearingToCursor}
                        align="left"
                    />
                    <button
                        ref={cursorButtonRef}
                        onClick={() => setShowCursorMenu(!showCursorMenu)}
                        className="absolute top-1 right-1 p-1 text-gray-500 hover:text-cyan-400 transition-colors"
                        aria-label="Open cursor location in external maps"
                        title="Open In..."
                    >
                        <ExternalLinkIcon className="w-4 h-4" />
                    </button>
                    {showCursorMenu && (
                        <div
                            ref={cursorMenuRef}
                            className="absolute z-30 top-full mt-2 right-0 w-40 text-left"
                        >
                            <ExternalMapLinks coords={cursorPosition} />
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        {/* Floating Map Controls - Right Side */}
        <div className="absolute top-28 right-4 z-20 flex flex-col space-y-3 items-center">
            <CompassIndicator heading={heading} />

            <button
                onClick={handleToggleTracking}
                className={`w-14 h-14 flex items-center justify-center text-white shadow-lg transition-colors rounded-full border-2 border-gray-700 ${
                    isTrackingActive 
                        ? 'bg-red-600/80 hover:bg-red-500/80'
                        : 'bg-black/50 backdrop-blur-sm hover:bg-cyan-600/80'
                }`}
                aria-label={isTrackingActive ? "Stop Tracking" : "Start Tracking"}
                title={isTrackingActive ? "Stop Tracking" : "Start Tracking"}
            >
                {isTrackingActive ? <StopIcon className="w-7 h-7" /> : <PathIcon className="w-7 h-7" />}
            </button>
            
            <div className="bg-black/50 backdrop-blur-sm rounded-full flex flex-col shadow-lg border border-gray-700">
                <button
                    onClick={handleCenterOnUser}
                    disabled={!isValidCoords(currentPosition)}
                    className="w-14 h-14 flex items-center justify-center text-gray-300 hover:text-cyan-400 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors rounded-t-full"
                    aria-label="Center on my location"
                    title="Center on my location"
                >
                    <GpsIcon className="w-7 h-7" />
                </button>
                <div className="h-px bg-gray-600 w-10 mx-auto"></div>
                <button
                    onClick={handleToggleInspectMode}
                    className={`w-14 h-14 flex items-center justify-center text-white shadow-lg transition-colors rounded-b-full ${
                        isInspectModeActive 
                            ? 'bg-red-600/80 hover:bg-red-500/80'
                            : 'hover:text-cyan-400'
                    }`}
                    aria-label={isInspectModeActive ? "Exit Inspect Mode" : "Enter Inspect Mode"}
                    title={isInspectModeActive ? "Exit Inspect Mode" : "Inspect Point"}
                >
                    {isInspectModeActive ? <XIcon className="w-8 h-8" /> : <TargetIcon className="w-8 h-8" />}
                </button>
            </div>

            {/* FAB Menu for secondary actions */}
            <div className="relative flex flex-col items-center">
                {/* Menu items that appear when open */}
                <div className={`flex flex-col-reverse items-center space-y-2 space-y-reverse mb-2 transition-all duration-300 ease-in-out ${
                    isFabMenuOpen
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-4 pointer-events-none'
                    }`}
                >
                    <button
                        onClick={handleStartRoutePlanning}
                        className="w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-300 hover:text-cyan-400 transition-colors border-2 border-gray-700"
                        aria-label="Plan Route"
                        title="Plan Route"
                    >
                        <PencilIcon className="w-7 h-7" />
                    </button>
                     <button
                        onClick={() => { setIsSettingsOpen(true); setIsFabMenuOpen(false); }}
                        className="w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-300 hover:text-cyan-400 transition-colors border-2 border-gray-700"
                        aria-label="Map Settings"
                        title="Map Settings"
                    >
                        <SettingsIcon className="w-7 h-7" />
                    </button>
                    <button
                        onClick={() => { handleUploadClick(); setIsFabMenuOpen(false); }}
                        className="w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-300 hover:text-cyan-400 transition-colors border-2 border-gray-700"
                        aria-label="Upload overlay"
                        title="Upload Overlay"
                    >
                        <UploadIcon className="w-7 h-7" />
                    </button>
                </div>

                {/* Main FAB Toggle Button */}
                <button
                    onClick={() => setIsFabMenuOpen(prev => !prev)}
                    className="w-14 h-14 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-300 hover:text-cyan-400 transition-colors border-2 border-gray-700"
                    aria-haspopup="true"
                    aria-expanded={isFabMenuOpen}
                    aria-label="Open more map actions"
                >
                    <EllipsisVerticalIcon className={`w-7 h-7 transition-transform duration-300 ${isFabMenuOpen ? 'rotate-90' : ''}`} />
                </button>
            </div>
        </div>


        {/* Download Indicator */}
        {downloadState.active && (
            <div className="absolute bottom-4 right-4 z-20 bg-black/70 backdrop-blur-sm p-2 rounded-lg text-xs font-mono w-48 shadow-lg">
                <p className="text-cyan-400 truncate text-center">{downloadState.message}</p>
                <div className="w-full bg-gray-600 rounded-full h-1 mt-1.5">
                    <div className="bg-cyan-500 h-1 rounded-full transition-all duration-300" style={{ width: `${downloadState.progress}%` }}></div>
                </div>
            </div>
        )}

        {/* Controls Container - floats at bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-2 sm:p-4 pointer-events-none bg-gradient-to-t from-black/80 via-black/50 to-transparent">
            <div className="max-h-[60vh] overflow-y-auto space-y-3 pointer-events-auto">
                {waypoints.length > 0 && (
                  <div className="bg-black/50 backdrop-blur-sm p-2 rounded-lg">
                    <h3 className="text-sm font-bold text-cyan-400 mb-2">Waypoints</h3>
                    <div className="space-y-2 max-h-24 sm:max-h-48 overflow-y-auto">
                      {waypoints.map((wp, index) => {
                        const gridRef = formatToIndianGrid(wp.coords);
                        const gridString = gridRef ? `Z:${gridRef.zone} ${gridRef.easting} ${gridRef.northing}` : 'N/A';
                        return (
                            <div key={index} className="flex justify-between items-center bg-gray-800/50 p-1.5 rounded text-sm">
                            <div>
                                <span className="font-bold sm:text-base truncate" title={wp.name}>{wp.name}</span>
                                <div className="font-mono text-gray-400 text-xs sm:text-sm font-bold">
                                    <span>{gridString}</span>
                                </div>
                            </div>
                            <div className="flex space-x-1 flex-shrink-0">
                                <button onClick={() => handleGoToWaypoint(wp.coords)} className="bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-1 px-2 sm:py-1.5 sm:px-3 rounded text-xs sm:text-sm transition-colors" aria-label={`Navigate to ${wp.name}`}>GOTO</button>
                                <button onClick={() => handleDeleteWaypoint(index)} className="bg-red-700 hover:bg-red-600 text-white font-bold py-1 px-2 sm:py-1.5 sm:px-3 rounded text-xs sm:text-sm transition-colors" aria-label={`Delete ${wp.name}`}>DEL</button>
                            </div>
                            </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {namingWaypointInfo ? (
                    <div className="bg-black/50 backdrop-blur-sm p-3 rounded-lg">
                         <h3 className="text-sm font-bold text-cyan-400 mb-1">Marking New Waypoint</h3>
                        <div className="text-xs text-gray-400 font-mono mb-2 font-bold">
                            <p>{`Z:${formatToIndianGrid(namingWaypointInfo.coords)?.zone} E:${formatToIndianGrid(namingWaypointInfo.coords)?.easting} N:${formatToIndianGrid(namingWaypointInfo.coords)?.northing}`}</p>
                            <p>{formatCoordsToDegrees(namingWaypointInfo.coords)}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input 
                                type="text"
                                value={newWaypointName}
                                onChange={(e) => setNewWaypointName(e.target.value)}
                                placeholder="Enter Waypoint Name"
                                className="flex-grow bg-gray-800 border rounded-md p-2 text-white focus:outline-none focus:ring-2 font-mono font-bold transition-colors border-gray-600 focus:ring-cyan-500"
                                aria-label="New Waypoint Name"
                                autoFocus
                            />
                            <button 
                                onClick={handleSaveWaypoint}
                                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
                            >
                                SAVE
                            </button>
                            <button 
                                onClick={handleCancelWaypoint}
                                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                ) : isNavigating ? (
                    <div className="bg-black/50 backdrop-blur-sm p-2 rounded-lg">
                        <button 
                            onClick={() => setIsNavigating(false)}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
                            aria-label="End Navigation"
                        >
                            END
                        </button>
                    </div>
                ) : isRoutePlanningMode ? (
                     <div className="bg-black/50 backdrop-blur-sm p-3 rounded-lg">
                        <h3 className="text-sm font-bold text-yellow-400 mb-2">Route Planner Active</h3>
                        <div className="flex justify-between items-center text-sm mb-2">
                            <div>
                                <span className="text-gray-400">Points: </span>
                                <span className="font-bold text-white">{currentRoutePoints.length}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Total Distance: </span>
                                <span className="font-bold text-white">{calculateTotalRouteDistance(currentRoutePoints)}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <button 
                                onClick={() => {
                                    setIsRoutePlanningMode(false);
                                    setCurrentRoutePoints([]);
                                    setIsRouteStartFromGps(false);
                                }}
                                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
                            >
                                Done
                            </button>
                            <button
                                onClick={() => setCurrentRoutePoints(prev => prev.slice(0, -1))}
                                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
                                disabled={currentRoutePoints.length <= (isRouteStartFromGps ? 1 : 0)}
                            >
                                Undo
                            </button>
                            <button 
                                onClick={() => {
                                    if (isRouteStartFromGps) {
                                        setCurrentRoutePoints(prev => prev.slice(0, 1));
                                    } else {
                                        setCurrentRoutePoints([]);
                                    }
                                }}
                                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
                                disabled={currentRoutePoints.length <= (isRouteStartFromGps ? 1 : 0)}
                            >
                                Clear
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 text-center">Click on the map to add points.</p>
                    </div>
                ) : null}
            </div>
        </div>
    </div>
  );
};

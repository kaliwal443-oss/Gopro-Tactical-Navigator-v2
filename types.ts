
export enum AppView {
  Map = 'MAP',
  Satellites = 'SATELLITES',
  Compass = 'COMPASS',
}

export interface Coordinates {
  lat: number;
  lng: number;
  accuracy?: number;
  altitudeAccuracy?: number | null;
}

export enum GnssConstellation {
  GPS = 'GPS',
  GLONASS = 'GLONASS',
  BeiDou = 'BeiDou',
  Galileo = 'Galileo',
  GAGAN = 'GAGAN',
  MSAS = 'MSAS',
  WAAS = 'WAAS',
  QZSS = 'QZSS',
  EGNOS = 'EGNOS',
  SDCM = 'SDCM',
  IRNSS = 'IRNSS',
}

export interface Satellite {
  id: number; // PRN Number
  constellation: GnssConstellation;
  country: string;
  snr: number | null; // Signal to Noise Ratio in dB
  azimuth: number; // 0-360 degrees
  elevation: number; // 0-90 degrees
  inUse: boolean;
  hasAlmanac: boolean;
  hasEphemeris: boolean;
}

export interface ImageOverlay {
  id: number;
  imageUrl: string;
  bounds: [[number, number], [number, number]];
}

export interface Route {
  name: string;
  points: { coords: Coordinates; name: string }[];
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Satellite } from '../types';
import { GnssConstellation } from '../types';

// --- Helper Functions for Satellite Data Simulation ---

const getSatelliteDetails = (prn: number): { constellation: GnssConstellation; country: string } => {
  if (prn >= 1 && prn <= 32) return { constellation: GnssConstellation.GPS, country: 'USA' };
  if (prn >= 65 && prn <= 96) return { constellation: GnssConstellation.GLONASS, country: 'Russia' };
  if (prn >= 201 && prn <= 237) return { constellation: GnssConstellation.BeiDou, country: 'China' };
  if (prn >= 301 && prn <= 336) return { constellation: GnssConstellation.Galileo, country: 'EU' };
  if ([120, 124, 126, 131].includes(prn)) return { constellation: GnssConstellation.EGNOS, country: 'EU (SBAS)' };
  if ([127, 128, 139].includes(prn)) return { constellation: GnssConstellation.GAGAN, country: 'India (SBAS)' };
  if ([129, 137].includes(prn)) return { constellation: GnssConstellation.MSAS, country: 'Japan (SBAS)' };
  if (prn >= 193 && prn <= 197) return { constellation: GnssConstellation.QZSS, country: 'Japan (SBAS)' };
  if ([125, 140, 141].includes(prn)) return { constellation: GnssConstellation.SDCM, country: 'Russia (SBAS)' };
  if ([122, 133, 134, 135, 138].includes(prn)) return { constellation: GnssConstellation.WAAS, country: 'USA (SBAS)' };
  if (prn >= 33 && prn <= 42) return { constellation: GnssConstellation.IRNSS, country: 'India' }; // Simulated IRNSS range
  return { constellation: GnssConstellation.GPS, country: 'USA' }; // Default
};

const generateInitialSatellites = (): Satellite[] => {
  const prns = new Set<number>();
  while (prns.size < 20 + Math.floor(Math.random() * 10)) {
    const possiblePrns = [
        ...Array.from({length: 32}, (_, i) => i + 1), // GPS
        ...Array.from({length: 10}, (_, i) => i + 65), // GLONASS
        127, 128, // GAGAN
        ...Array.from({length: 5}, (_, i) => i + 33), // IRNSS
    ];
    prns.add(possiblePrns[Math.floor(Math.random() * possiblePrns.length)]);
  }
  
  return Array.from(prns).map(prn => {
    const snr = Math.random() > 0.1 ? 10 + Math.random() * 40 : null;
    const inUse = snr !== null && snr > 20 && Math.random() > 0.2;
    return {
      id: prn,
      ...getSatelliteDetails(prn),
      snr,
      azimuth: Math.floor(Math.random() * 360),
      elevation: Math.floor(Math.random() * 91),
      inUse,
      hasAlmanac: Math.random() > 0.1,
      hasEphemeris: inUse && Math.random() > 0.2,
    };
  });
};

// --- Sub-components ---

const SkyPlot: React.FC<{ satellites: Satellite[], isNorthUp: boolean }> = ({ satellites, isNorthUp }) => {
    const viewBoxSize = 300;
    const center = viewBoxSize / 2;
    const radius = viewBoxSize / 2 - 15;

    return (
        <div className="w-full max-w-sm mx-auto aspect-square p-2 relative">
             <style>{`
                @keyframes sweep {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .radar-sweep {
                    animation: sweep 4s linear infinite;
                }
            `}</style>
            <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
                <defs>
                    <radialGradient id="skyGradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#1f2937" />
                        <stop offset="100%" stopColor="#111827" />
                    </radialGradient>
                     <radialGradient id="sweepGradient">
                        <stop offset="0%" stopColor="rgba(56, 189, 248, 0)" />
                        <stop offset="80%" stopColor="rgba(56, 189, 248, 0.2)" />
                        <stop offset="100%" stopColor="rgba(56, 189, 248, 0.3)" />
                    </radialGradient>
                </defs>

                {/* Background and grid */}
                <circle cx={center} cy={center} r={radius} fill="url(#skyGradient)" stroke="#374151" strokeWidth="1"/>
                <circle cx={center} cy={center} r={radius * 0.66} fill="none" stroke="#374151" strokeDasharray="2 4" strokeWidth="0.5"/>
                <circle cx={center} cy={center} r={radius * 0.33} fill="none" stroke="#374151" strokeDasharray="2 4" strokeWidth="0.5"/>
                <line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="#374151" strokeWidth="0.5" />
                <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="#374151" strokeWidth="0.5" />
                
                {/* Sweep Animation */}
                <path d={`M${center},${center} L${center},${center-radius} A${radius},${radius} 0 0,1 ${center+radius*Math.sin(Math.PI/3)},${center-radius*Math.cos(Math.PI/3)} Z`} fill="url(#sweepGradient)" transform-origin="center" className="radar-sweep" />

                {/* Cardinal directions */}
                <text x={center} y={12} textAnchor="middle" fill="#9ca3af" fontSize="12" className="font-bold">N</text>
                <text x={center} y={viewBoxSize - 5} textAnchor="middle" fill="#6b7280" fontSize="10">S</text>
                <text x={7} y={center + 4} textAnchor="start" fill="#6b7280" fontSize="10">W</text>
                <text x={viewBoxSize - 7} y={center + 4} textAnchor="end" fill="#6b7280" fontSize="10">E</text>
                
                {/* Satellites */}
                <g transform={isNorthUp ? "" : `rotate(${satellites[0]?.azimuth || 0} ${center} ${center})`}>
                    {satellites.map(sat => {
                        if (sat.elevation < 0) return null;
                        const r = ( (90 - sat.elevation) / 90) * radius;
                        const angle = (sat.azimuth - 90) * (Math.PI / 180); // -90 to align 0 deg with North (top)
                        const x = center + r * Math.cos(angle);
                        const y = center + r * Math.sin(angle);
                        const color = sat.inUse ? '#4ade80' : '#facc15';
                        
                        return (
                            <g key={sat.id} className="transition-transform duration-1000">
                                <circle cx={x} cy={y} r="6" fill={color} stroke="#111827" strokeWidth="1.5" opacity="0.9" />
                                <text x={x} y={y} dy="3.5" textAnchor="middle" fontSize="8" fill="#000" fontWeight="bold">{sat.id}</text>
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
};


const SignalBar: React.FC<{ snr: number | null }> = ({ snr }) => {
    const strength = snr || 0;
    const barCount = 10;
    const activeBars = Math.ceil((strength / 50) * barCount);
    
    let colorClass = 'bg-yellow-500';
    if (strength > 35) colorClass = 'bg-green-500';
    else if (strength < 20) colorClass = 'bg-red-500';

    return (
        <div className="flex items-center space-x-0.5 w-full">
            {Array.from({ length: barCount }).map((_, i) => (
                <div
                    key={i}
                    className={`h-4 flex-grow rounded-sm ${i < activeBars ? colorClass : 'bg-gray-700/50'}`}
                />
            ))}
        </div>
    );
};

export const SatellitesView: React.FC = () => {
  const [satellites, setSatellites] = useState<Satellite[]>(generateInitialSatellites);
  const isNorthUp = true;

  useEffect(() => {
    const interval = setInterval(() => {
      setSatellites(sats =>
        sats.map(sat => {
            const snrChange = (Math.random() - 0.5) * 4;
            const newSnr = sat.snr ? Math.max(5, Math.min(50, sat.snr + snrChange)) : (Math.random() > 0.95 ? 10 : null);
            const inUse = newSnr !== null && newSnr > 20;

            return {
                ...sat,
                snr: newSnr,
                inUse,
                azimuth: (sat.azimuth + (Math.random() - 0.4) * 2 + 360) % 360,
                elevation: Math.max(0, Math.min(90, sat.elevation + (Math.random() - 0.5) * 1)),
                hasEphemeris: sat.hasEphemeris || (inUse && Math.random() > 0.9),
            };
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);
  
  const sortedSatellites = useMemo(() => 
    [...satellites].sort((a,b) => (b.snr || 0) - (a.snr || 0))
  , [satellites]);

  return (
    <div className="flex-grow flex flex-col md:flex-row h-full bg-gray-900 text-white p-2 sm:p-4 gap-4 overflow-hidden">
      
      {/* Left Panel: Sky Plot */}
      <div className="w-full md:w-1/3 flex flex-col items-center justify-center bg-black/30 p-2 rounded-lg">
          <h3 className="text-sm font-bold text-gray-400">SATELLITE CONSTELLATION</h3>
          <SkyPlot satellites={satellites} isNorthUp={isNorthUp} />
      </div>

      {/* Right Panel: Satellite List */}
      <div className="w-full md:w-2/3 flex flex-col bg-black/30 rounded-lg overflow-hidden">
        <div className="flex-shrink-0 p-3 bg-gray-900/50 z-10 border-b border-gray-700">
            <div className="grid grid-cols-[1fr,2fr,3fr,1.5fr,1.5fr] gap-2 text-xs sm:text-sm text-gray-400 font-bold text-left">
                <div className="truncate">PRN</div>
                <div className="truncate">CONSTELLATION</div>
                <div>SNR (dB)</div>
                <div className="text-center">AZ/EL</div>
                <div className="text-center">STATUS</div>
            </div>
        </div>
        <div className="flex-grow overflow-y-auto">
            <div className="space-y-0.5 p-2">
                {sortedSatellites.map(sat => (
                  <div 
                    key={sat.id}
                    className={`grid grid-cols-[1fr,2fr,3fr,1.5fr,1.5fr] gap-2 p-2.5 rounded-md text-sm transition-opacity duration-500 ${
                        sat.snr ? 'bg-gray-800/50' : 'bg-gray-800/20 opacity-50'
                    }`}
                  >
                      <div className="font-bold text-white flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-2 ${sat.inUse ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                        {String(sat.id).padStart(3, '0')}
                      </div>
                      <div className="truncate self-center text-gray-300 text-xs sm:text-sm">{sat.constellation} <span className="text-gray-500 hidden sm:inline">({sat.country})</span></div>
                      <div className="flex items-center space-x-2">
                        <SignalBar snr={sat.snr} />
                        <span className="w-6 text-right font-mono text-gray-300">{sat.snr ? Math.round(sat.snr) : '--'}</span>
                      </div>
                      <div className="self-center font-mono text-center text-gray-400 text-xs sm:text-sm">{String(Math.round(sat.azimuth)).padStart(3, '0')}°/{String(Math.round(sat.elevation)).padStart(2, '0')}°</div>
                      <div className="self-center font-mono font-bold text-center text-xs text-cyan-400">
                        {sat.hasAlmanac ? 'A' : '-'}
                        {sat.hasEphemeris ? 'E' : '-'}
                      </div>
                  </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import type { Coordinates } from '../types';

export const CompassView: React.FC<{ currentPosition: Coordinates | null }> = ({ currentPosition }) => {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate smoother, more realistic heading changes
      setHeading(prev => {
          const change = (Math.random() - 0.48) * 6; // smaller, more frequent changes
          const newHeading = prev + change;
          return newHeading < 0 ? newHeading + 360 : newHeading % 360;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);
  
  const getCardinalDirection = (h: number) => {
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      return dirs[Math.round(h / 45) % 8];
  };

  const roundedHeading = Math.round(heading);

  return (
    <div className="flex-grow flex flex-col items-center justify-center h-full bg-gray-900 text-white p-4 overflow-hidden">
      
      {/* Compass Rose */}
      <div className="w-64 h-64 sm:w-80 sm:h-80 relative flex-shrink-0 mb-6">
        {/* Outer Bezel and Background */}
        <div className="absolute inset-0 rounded-full bg-gray-800 border-4 border-gray-700 shadow-inner"></div>
        <div className="absolute inset-2 sm:inset-3 rounded-full bg-gray-900 shadow-lg"></div>

        {/* Rotating Compass Card */}
        <div 
            className="absolute inset-0 transition-transform duration-200"
            style={{ transform: `rotate(${-heading}deg)` }}
        >
          {/* Main Cardinal Directions */}
          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-2xl font-bold text-red-500">N</span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xl font-bold">S</span>
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xl font-bold">W</span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xl font-bold">E</span>
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-gray-500" style={{ transform: `translate(-50%, -50%) rotate(45deg) translateY(-80px) rotate(-45deg)`}}>NE</span>
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-gray-500" style={{ transform: `translate(-50%, -50%) rotate(135deg) translateY(-80px) rotate(-135deg)`}}>SE</span>
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-gray-500" style={{ transform: `translate(-50%, -50%) rotate(225deg) translateY(-80px) rotate(-225deg)`}}>SW</span>
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-gray-500" style={{ transform: `translate(-50%, -50%) rotate(315deg) translateY(-80px) rotate(-315deg)`}}>NW</span>

          {/* Degree Ticks */}
          <div className="absolute inset-0">
            {Array.from({ length: 72 }).map((_, i) => (
              <div 
                key={i} 
                className="absolute top-0 left-1/2 w-px h-full" 
                style={{ transform: `translateX(-50%) rotate(${i * 5}deg)` }}
              >
                <div className={`mx-auto bg-gray-500 ${
                    i % 18 === 0 ? 'w-0.5 h-6' : // Cardinal
                    i % 9 === 0 ? 'w-0.5 h-5' : // Intercardinal
                    i % 3 === 0 ? 'h-4' : // 15 degrees
                    'h-2.5' // 5 degrees
                }`}></div>
              </div>
            ))}
          </div>
        </div>

        {/* Static Lubber Line / Needle */}
        <div className="absolute inset-0 flex flex-col items-center">
            <div className="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-cyan-400 mt-1"></div>
        </div>
        
        {/* Center Pivot */}
        <div className="absolute top-1/2 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border-2 border-cyan-400 rounded-full z-10"></div>
      </div>
      
      {/* Digital Readout */}
      <div className="bg-black/40 p-4 rounded-lg text-center font-mono border border-gray-700 w-full max-w-xs">
        <p className="text-gray-400 text-sm">HEADING</p>
        <p className="text-cyan-400 text-5xl sm:text-6xl font-bold tracking-wider">{String(roundedHeading).padStart(3, '0')}°
          <span className="text-2xl text-gray-300 ml-2">{getCardinalDirection(roundedHeading)}</span>
        </p>
      </div>
      
      {/* Additional Data Panel */}
      <div className="grid grid-cols-2 gap-4 mt-6 w-full max-w-xs text-center font-mono">
          <div className="bg-black/30 p-3 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400">ALTITUDE</p>
              <p className="text-white text-xl font-bold">
                {currentPosition?.altitudeAccuracy != null ? `${currentPosition.altitudeAccuracy.toFixed(0)}m` : '---'}
              </p>
          </div>
          <div className="bg-black/30 p-3 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400">ACCURACY</p>
              <p className="text-white text-xl font-bold">
                {currentPosition?.accuracy != null ? `±${currentPosition.accuracy.toFixed(0)}m` : '---'}
              </p>
          </div>
      </div>
    </div>
  );
};

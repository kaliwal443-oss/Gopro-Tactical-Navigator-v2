
import React, { useState, useEffect, useMemo } from 'react';
import { AppView } from './types';
import type { Coordinates } from './types';
import { MapIcon, SatelliteIcon, CompassIcon, MenuIcon, SignalIcon } from './components/icons';
// FIX: Removed MapSidebarContent import as sidebar logic is now encapsulated within MapView.
import { MapView } from './components/MapView';
import { SatellitesView } from './components/SatellitesView';
import { CompassView } from './components/CompassView';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>(AppView.Map);
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Memoize signal strength for performance
  const signalStrength = useMemo(() => {
    if (!currentPosition?.accuracy) return 0;
    if (currentPosition.accuracy < 10) return 4;
    if (currentPosition.accuracy < 25) return 3;
    if (currentPosition.accuracy < 50) return 2;
    if (currentPosition.accuracy < 100) return 1;
    return 0;
  }, [currentPosition?.accuracy]);


  useEffect(() => {
    // Register Service Worker for offline functionality
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, err => {
          console.log('ServiceWorker registration failed: ', err);
        });
      });
    }

    // Listen for online/offline status changes
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Time ticker
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Cleanup listeners
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline',handleOffline);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitudeAccuracy } = position.coords;
        // Validate coordinates to prevent passing NaN to Leaflet
        if (typeof latitude === 'number' && typeof longitude === 'number' && !isNaN(latitude) && !isNaN(longitude)) {
          setCurrentPosition({
            lat: latitude,
            lng: longitude,
            accuracy: accuracy,
            altitudeAccuracy: altitudeAccuracy,
          });
        } else {
          console.warn("Received invalid coordinates from Geolocation API:", position.coords);
        }
      },
      (error) => {
        console.warn("Could not get geolocation, using default.", error);
        // Use functional update to get the latest state without adding it to dependencies
        setCurrentPosition(prevPosition => {
            // Only set default if there's no position yet
            if (!prevPosition) {
                return { lat: 28.7041, lng: 77.1025, accuracy: 10000 };
            }
            return prevPosition;
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []); // Empty dependency array ensures this runs only once on mount


  const renderView = () => {
    switch (activeView) {
      case AppView.Map:
        // FIX: Pass sidebar state down to MapView.
        return <MapView currentPosition={currentPosition} isOffline={isOffline} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />;
      case AppView.Satellites:
        return <SatellitesView />;
      case AppView.Compass:
        return <CompassView currentPosition={currentPosition} />;
      default:
        return <MapView currentPosition={currentPosition} isOffline={isOffline} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />;
    }
  };

  const NavButton: React.FC<{
    view: AppView;
    label: string;
    icon: React.ReactNode;
  }> = ({ view, label, icon }) => {
    const isActive = activeView === view;
    return (
      <button
        onClick={() => setActiveView(view)}
        className={`flex flex-col items-center justify-center pt-2 pb-1 transition-colors rounded-md h-full w-16 ${
          isActive ? 'text-cyan-400 bg-black/30' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
        }`}
        aria-current={isActive ? 'page' : undefined}
        title={label}
      >
        {icon}
        <span className="text-[10px] font-bold mt-1">{label}</span>
      </button>
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col font-mono bg-gray-900 text-gray-200">
      <header className="flex-shrink-0 bg-gray-900/70 backdrop-blur-sm border-b border-gray-700 h-16 flex items-center justify-between px-2 sm:px-4 z-30">
        <div className="flex items-center space-x-2">
            <img src="/icon.svg" alt="Gopro Nav" className="w-8 h-8"/>
            <h1 className="text-lg font-bold text-white hidden sm:block">GOPRO NAV</h1>
        </div>
        <div className="flex-grow flex items-center justify-center space-x-2">
            <NavButton view={AppView.Map} label="Map" icon={<MapIcon className="w-5 h-5" />} />
            <NavButton view={AppView.Satellites} label="Satellites" icon={<SatelliteIcon className="w-5 h-5" />} />
            <NavButton view={AppView.Compass} label="Compass" icon={<CompassIcon className="w-5 h-5" />} />
        </div>
        <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="flex items-center space-x-2 text-sm">
                <SignalIcon className="w-5 h-5 text-cyan-400" strength={signalStrength} />
                <span className="font-bold hidden sm:block">{currentTime.toUTCString().substring(17,25)} Z</span>
            </div>
            <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-md hover:bg-gray-700 transition-colors"
                aria-label="Open Controls Panel"
            >
                <MenuIcon className="w-6 h-6"/>
            </button>
        </div>
      </header>

      <div className="flex-grow flex relative overflow-hidden">
        <main className="flex-grow h-full">
            {renderView()}
        </main>
        
        {/* FIX: Removed sidebar from App.tsx. It is now managed within MapView.tsx to have access to map state. */}
      </div>
    </div>
  );
};

export default App;

'use client';

import type { Brand } from '@/lib/types';

interface OfficeToggleProps {
  locations: Brand['existing_locations'];
  activeLocations: Set<string>;
  onToggle: (cityKey: string) => void;
}

export default function OfficeToggle({ locations, activeLocations, onToggle }: OfficeToggleProps) {
  if (locations.length === 0) return null;

  return (
    <div className="text-sm">
      <span className="text-gray-500 mr-2">Offices:</span>
      <div className="inline-flex flex-wrap gap-1.5 mt-1">
        {locations.map((loc) => {
          const isActive = activeLocations.has(loc.city_key);
          return (
            <button
              key={loc.city_key}
              type="button"
              onClick={() => onToggle(loc.city_key)}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200 line-through'
              }`}
              title={isActive ? `Click to deactivate ${loc.city}, ${loc.state}` : `Click to reactivate ${loc.city}, ${loc.state}`}
            >
              {loc.city}, {loc.state}
              <span className="ml-1.5 text-[10px]">{isActive ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

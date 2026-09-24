import { useMemo, useState } from 'react';
import { stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { networkLayout } from '../geo/networkLayout';
import { MapCanvas } from '../render/MapCanvas';
import { MobileDrawer } from './MobileDrawer';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { StationSearch } from './StationSearch';
import { useTypingInputControls } from './TypingInputProvider';
import './mobile.css';

export interface MobileAdventureSetupProps {
  net: NetworkIndex;
  onStart: (stationId: string) => void;
  phoneLandscape?: boolean;
}

export function MobileAdventureSetup({ net, onStart, phoneLandscape = false }: MobileAdventureSetupProps) {
  const profile = useMemo(() => loadProfile(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { focusInput } = useTypingInputControls();
  const { geo, backdrop, districts, pxPerKm } = networkLayout();
  const unlocked = useMemo(() => new Set(profile.visited), [profile.visited]);
  const resumeStation = profile.adventure
    ? stationAt(net, profile.adventure.at)
    : undefined;
  const selectedStation = selectedId ? stationAt(net, selectedId) : undefined;

  const startAt = (stationId: string) => {
    if (phoneLandscape) return;
    focusInput();
    onStart(stationId);
  };

  return (
    <div className="mobile-map-screen">
      <div className="mobile-map-region">
        <MapCanvas
          net={net}
          layout={geo}
          visited={unlocked}
          activeStation={selectedStation?.id ?? null}
          fitKey="mobile-adventure"
          backdrop={backdrop}
          districts={districts}
          pxPerKm={pxPerKm}
        />
      </div>

      <MobileDrawer title="Adventure" subtitle="Choose a starting Station">
        <div className="mobile-adventure-content">
          {phoneLandscape && <PhoneLandscapeBlock />}
          {resumeStation && (
            <button type="button" disabled={phoneLandscape} onClick={() => startAt(resumeStation.id)}>
              Resume from {resumeStation.name}
            </button>
          )}

          <StationSearch net={net} onPick={setSelectedId} />

          {selectedStation && (
            <button type="button" disabled={phoneLandscape} onClick={() => startAt(selectedStation.id)}>
              Start Adventure
            </button>
          )}
        </div>
      </MobileDrawer>
    </div>
  );
}

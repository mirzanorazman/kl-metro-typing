import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { terminiOf } from '../engine/lineRun';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile, saveProfile, saveSelectedLine } from '../engine/progress';
import { eligibleQuickLegs } from '../engine/quickRun';
import { networkLayout } from '../geo/networkLayout';
import { MapCanvas } from '../render/MapCanvas';
import { LineBadge } from './LineBadge';
import { MobileDrawer } from './MobileDrawer';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { useTypingInputControls } from './TypingInputProvider';
import './mobile.css';

interface MobileTransitProps {
  net: NetworkIndex;
  onStartQuick: (line: LineCode, toward: string) => void;
  onStartLine: (line: LineCode, from: string) => void;
  phoneLandscape?: boolean;
}

function initialLine(net: NetworkIndex, savedLine: LineCode | undefined): LineCode | null {
  if (savedLine && lineAt(net, savedLine)) return savedLine;
  if (lineAt(net, 'KJ')) return 'KJ';
  return LINE_CODES.find((code) => lineAt(net, code)) ?? null;
}

export function MobileTransit({ net, onStartQuick, onStartLine, phoneLandscape = false }: MobileTransitProps) {
  const profile = useMemo(() => loadProfile(), []);
  const availableCodes = useMemo(
    () => LINE_CODES.filter((code) => lineAt(net, code) !== undefined),
    [net],
  );
  const [selected, setSelected] = useState<LineCode | null>(() =>
    initialLine(net, profile.lastSelectedLine),
  );
  const [toward, setToward] = useState(() =>
    selected ? terminiOf(net, selected)[0] : '',
  );
  const pillRefs = useRef(new Map<LineCode, HTMLButtonElement>());
  const { focusInput } = useTypingInputControls();
  const { geo, backdrop, districts, pxPerKm } = networkLayout();
  const unlocked = useMemo(() => new Set(profile.visited), [profile]);

  const selectedLine = selected ? lineAt(net, selected) : undefined;
  const [firstTerminus, secondTerminus] = selected
    ? terminiOf(net, selected)
    : ['', ''];
  const validTermini = Boolean(
    selectedLine &&
    firstTerminus &&
    secondTerminus &&
    firstTerminus !== secondTerminus &&
    stationAt(net, firstTerminus) &&
    stationAt(net, secondTerminus),
  );
  const quickAvailable = Boolean(selected && eligibleQuickLegs(net, selected, toward).length > 0);

  const fitTo = useMemo(
    () => selectedLine?.stations
      .map((stationId) => geo.get(stationId))
      .filter((point): point is NonNullable<typeof point> => point !== undefined),
    [selectedLine, geo],
  );

  useEffect(() => {
    if (!selected) return;
    pillRefs.current.get(selected)?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
  }, [selected]);

  const selectLine = (code: LineCode) => {
    if (!lineAt(net, code)) return;
    setSelected(code);
    setToward(terminiOf(net, code)[0]);
    saveProfile(saveSelectedLine(loadProfile(), code));
  };

  const startQuick = () => {
    if (phoneLandscape || !selected || !validTermini || !quickAvailable) return;
    focusInput();
    onStartQuick(selected, toward);
  };

  const startLine = () => {
    if (phoneLandscape || !selected || !validTermini) return;
    focusInput();
    onStartLine(selected, toward === firstTerminus ? secondTerminus : firstTerminus);
  };

  const stationCount = selectedLine?.stations.length ?? 0;
  const unlockedCount = selectedLine?.stations.filter((id) => unlocked.has(id)).length ?? 0;

  return (
    <div className="mobile-map-screen">
      <div className="mobile-map-region">
        <MapCanvas
          net={net}
          layout={geo}
          visited={unlocked}
          activeStation={null}
          fitTo={fitTo}
          fitKey={`mobile-transit:${selected ?? 'none'}`}
          emphasis={selected}
          backdrop={backdrop}
          districts={districts}
          pxPerKm={pxPerKm}
        />
      </div>

      <div className="mobile-line-pills">
        {availableCodes.map((code) => {
          const line = lineAt(net, code)!;
          return (
            <button
              key={code}
              ref={(element) => {
                if (element) pillRefs.current.set(code, element);
                else pillRefs.current.delete(code);
              }}
              type="button"
              className="mobile-line-pill"
              aria-label={line.name}
              aria-pressed={selected === code}
              style={{ '--line-colour': line.colour } as CSSProperties}
              onClick={() => selectLine(code)}
            >
              <LineBadge code={code} colour={line.colour} />
            </button>
          );
        })}
      </div>

      <MobileDrawer
        title={selectedLine?.name ?? 'Transit unavailable'}
        subtitle={`${stationCount} Stations · ${unlockedCount} unlocked`}
      >
        {validTermini && selectedLine ? (
          <div className="mobile-direction-options">
            <button
              type="button"
              aria-pressed={toward === firstTerminus}
              aria-label={`Toward ${selectedLine.termini[0]}`}
              style={{ '--line-colour': selectedLine.colour } as CSSProperties}
              onClick={() => setToward(firstTerminus)}
            >
              Toward {selectedLine.termini[0]}
            </button>
            <button
              type="button"
              aria-pressed={toward === secondTerminus}
              aria-label={`Toward ${selectedLine.termini[1]}`}
              style={{ '--line-colour': selectedLine.colour } as CSSProperties}
              onClick={() => setToward(secondTerminus)}
            >
              Toward {selectedLine.termini[1]}
            </button>
          </div>
        ) : (
          <p role="status">This Line is unavailable.</p>
        )}

        {phoneLandscape && <PhoneLandscapeBlock />}
        {validTermini && !quickAvailable && (
          <p role="status">Quick Run needs at least five Stations in this Direction.</p>
        )}
        <div className="mobile-run-actions">
          <button
            type="button"
            className="mobile-run-primary"
            disabled={phoneLandscape || !validTermini || !quickAvailable}
            onClick={startQuick}
          >
            Start 30s Quick Run
          </button>
          <button type="button" disabled={phoneLandscape || !validTermini} onClick={startLine}>
            Full Line Run
          </button>
        </div>
      </MobileDrawer>
    </div>
  );
}

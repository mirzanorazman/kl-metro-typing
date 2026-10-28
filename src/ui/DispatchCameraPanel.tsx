import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react';
import {
  CROWDING_DELAY_RANGE,
  CROWDING_DELAY_STEP,
  type CrowdingHintMode,
  type CrowdingHintSettings,
} from '../render/crowdingHint';
import { CLOSE_RANGES, type CloseCameraSettings } from './dispatchCamera';

interface DispatchCameraPanelProps {
  settings: CloseCameraSettings;
  onChange: (next: CloseCameraSettings) => void;
  /** Served Stations now, for the readout. */
  stations: number;
  /** The closeness the camera uses now, for the readout. */
  closenessNow: number;
  /** The crowding hint's settings; its controls show only when these are given. */
  crowding?: CrowdingHintSettings;
  onCrowdingChange?: (next: CrowdingHintSettings) => void;
}

// A used control lets go of focus, so the next key is the game's again.
const letGo = (e: PointerEvent<HTMLInputElement>) => e.currentTarget.blur();
/** The keys a slider or the toggle uses. */
const PANEL_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter', 'Tab',
]);
// Keys meant for a focused control never reach the game's window listener.
// Any other key (a letter of a Station name) lets go of the control and goes on
// to the game: a click on a label focuses its control with no pointer-up on it.
const keepKeys = (e: KeyboardEvent<HTMLElement>) => {
  if (PANEL_KEYS.has(e.key)) e.stopPropagation();
  else if (e.target instanceof HTMLElement) e.target.blur();
};

const CROWDING_MODES: readonly [CrowdingHintMode, string][] = [['off', 'Off'], ['a', 'A: amber chips'], ['b', 'B: chips and ring']];

/** Dev only: tunes the close camera and the crowding hint while playing. */
export function DispatchCameraPanel({ settings, onChange, stations, closenessNow, crowding, onCrowdingChange }: DispatchCameraPanelProps) {
  const slider = (key: 'early' | 'late', label: string, step: number, shown: string) => (
    <label className="dispatch-camera-row">
      <span>{label}</span>
      <input type="range" aria-label={label} min={CLOSE_RANGES[key][0]} max={CLOSE_RANGES[key][1]} step={step} value={settings[key]}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...settings, [key]: Number(e.target.value) })}
        onPointerUp={letGo} />
      <output>{shown}</output>
    </label>
  );
  return (
    <aside className="dispatch-camera-panel" aria-label="Camera (dev)" onKeyDown={keepKeys}>
      <label className="dispatch-camera-row">
        <input type="checkbox" checked={settings.on}
          onChange={(e) => {
            onChange({ ...settings, on: e.target.checked });
            e.target.blur();
          }} />
        <span>Close camera</span>
      </label>
      {slider('early', 'Early closeness', 0.1, `${settings.early.toFixed(1)}×`)}
      {slider('late', 'Late closeness', 0.1, `${settings.late.toFixed(1)}×`)}
      <p className="dispatch-camera-now">{`Now ${closenessNow.toFixed(1)}× at ${stations} Stations`}</p>
      {crowding && onCrowdingChange && (
        <fieldset className="dispatch-camera-group">
          <legend>Crowding</legend>
          <label className="dispatch-camera-row">
            <span>Crowding hint</span>
            <select aria-label="Crowding hint" value={crowding.mode}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                onCrowdingChange({ ...crowding, mode: e.target.value as CrowdingHintMode });
                e.target.blur();
              }}>
              {CROWDING_MODES.map(([mode, text]) => <option key={mode} value={mode}>{text}</option>)}
            </select>
          </label>
          <label className="dispatch-camera-row">
            <span>Hint delay</span>
            <input type="range" aria-label="Hint delay" min={CROWDING_DELAY_RANGE[0] / 1_000} max={CROWDING_DELAY_RANGE[1] / 1_000}
              step={CROWDING_DELAY_STEP / 1_000} value={crowding.delayMs / 1_000}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onCrowdingChange({ ...crowding, delayMs: Number(e.target.value) * 1_000 })}
              onPointerUp={letGo} />
            <output>{`${crowding.delayMs / 1_000} s`}</output>
          </label>
          <label className="dispatch-camera-row">
            <input type="checkbox" checked={crowding.declutter}
              onChange={(e) => {
                onCrowdingChange({ ...crowding, declutter: e.target.checked });
                e.target.blur();
              }} />
            <span>Declutter labels</span>
          </label>
        </fieldset>
      )}
    </aside>
  );
}

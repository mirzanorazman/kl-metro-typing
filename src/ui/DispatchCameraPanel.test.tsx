import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DispatchCameraPanel } from './DispatchCameraPanel';
import { CLOSE_CAMERA_DEFAULTS } from './dispatchCamera';
import { CROWDING_HINT_DEFAULTS } from '../render/crowdingHint';

describe('DispatchCameraPanel', () => {
  it('shows the settings and the readout', () => {
    render(<DispatchCameraPanel settings={CLOSE_CAMERA_DEFAULTS} onChange={() => {}} stations={27} closenessNow={2.1} />);
    expect((screen.getByRole('checkbox', { name: 'Close camera' }) as HTMLInputElement).checked).toBe(true);
    for (const text of ['3.0×', '1.2×', 'Now 2.1× at 27 Stations']) expect(screen.getByText(text)).toBeTruthy();
  });

  it('changing a control reports the new settings and lets go of focus', () => {
    const onChange = vi.fn();
    render(<DispatchCameraPanel settings={CLOSE_CAMERA_DEFAULTS} onChange={onChange} stations={14} closenessNow={3} />);
    const toggle = screen.getByRole('checkbox', { name: 'Close camera' });
    toggle.focus();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ ...CLOSE_CAMERA_DEFAULTS, on: false });
    expect(document.activeElement).not.toBe(toggle);
  });

  it('a slider reports its new value', () => {
    const onChange = vi.fn();
    render(<DispatchCameraPanel settings={CLOSE_CAMERA_DEFAULTS} onChange={onChange} stations={14} closenessNow={3} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Early closeness' }), { target: { value: '4.5' } });
    expect(onChange).toHaveBeenCalledWith({ ...CLOSE_CAMERA_DEFAULTS, early: 4.5 });
  });
});

describe('DispatchCameraPanel controls', () => {
  it('has no hold slider: a cleared fix zooms straight out', () => {
    render(<DispatchCameraPanel settings={CLOSE_CAMERA_DEFAULTS} onChange={() => {}} stations={14} closenessNow={3} />);
    expect(screen.queryByRole('slider', { name: 'Hold after a fix' })).toBeNull();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });
});

describe('DispatchCameraPanel crowding controls', () => {
  const renderWithCrowding = (onCrowdingChange = () => {}, crowding = CROWDING_HINT_DEFAULTS) => render(
    <DispatchCameraPanel settings={CLOSE_CAMERA_DEFAULTS} onChange={() => {}} stations={14} closenessNow={3}
      crowding={crowding} onCrowdingChange={onCrowdingChange} />,
  );
  const summary = () => screen.getByText(/^Crowding:/);
  /** The group starts closed; its summary opens it. */
  const open = () => fireEvent.click(summary());

  it('starts closed, one row showing the current settings', () => {
    renderWithCrowding();
    expect(summary().tagName).toBe('SUMMARY');
    expect(summary().closest('details')!.open).toBe(false);
    expect(summary().textContent).toBe('Crowding: B · 5 s · in time');
    open();
    expect(summary().closest('details')!.open).toBe(true);
  });

  it.each([
    [{ mode: 'off', declutter: false }, 'Crowding: Off'],
    [{ mode: 'off', declutter: true }, 'Crowding: Off · Declutter'],
    [{ mode: 'a', delayMs: 0, declutter: true }, 'Crowding: A · 0 s · in time · Declutter'],
    [{ mode: 'b', amber: 'blocks' }, 'Crowding: B · 5 s · 3 blocks'],
  ] as const)('its summary reads %o as %s', (over, text) => {
    renderWithCrowding(() => {}, { ...CROWDING_HINT_DEFAULTS, ...over });
    expect(summary().textContent).toBe(text);
  });

  it('a clicked summary lets go of focus; a letter key on it goes on to the game', () => {
    const onKey = vi.fn();
    window.addEventListener('keydown', onKey);
    renderWithCrowding();
    const row = summary();
    row.focus();
    fireEvent.pointerUp(row);
    expect(document.activeElement).not.toBe(row);
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.keyDown(row, { key: 'k' });
    expect(document.activeElement).not.toBe(row);
    expect(onKey).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', onKey);
  });

  it('shows the crowding controls when given settings', () => {
    renderWithCrowding();
    open();
    expect((screen.getByRole('combobox', { name: 'Crowding hint' }) as HTMLSelectElement).value).toBe('b');
    expect(screen.getByText('5 s', { selector: 'output' })).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Declutter labels' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('combobox', { name: 'Amber rule' }) as HTMLSelectElement).value).toBe('time');
  });

  it('each crowding control reports the new settings', () => {
    const onCrowdingChange = vi.fn();
    renderWithCrowding(onCrowdingChange);
    open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Crowding hint' }), { target: { value: 'a' } });
    expect(onCrowdingChange).toHaveBeenLastCalledWith({ ...CROWDING_HINT_DEFAULTS, mode: 'a' });
    fireEvent.change(screen.getByRole('slider', { name: 'Hint delay' }), { target: { value: '8' } });
    expect(onCrowdingChange).toHaveBeenLastCalledWith({ ...CROWDING_HINT_DEFAULTS, delayMs: 8_000 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Declutter labels' }));
    expect(onCrowdingChange).toHaveBeenLastCalledWith({ ...CROWDING_HINT_DEFAULTS, declutter: true });
    fireEvent.change(screen.getByRole('combobox', { name: 'Amber rule' }), { target: { value: 'blocks' } });
    expect(onCrowdingChange).toHaveBeenLastCalledWith({ ...CROWDING_HINT_DEFAULTS, amber: 'blocks' });
  });

  it('a used crowding control lets go of focus', () => {
    renderWithCrowding();
    open();
    const select = screen.getByRole('combobox', { name: 'Crowding hint' });
    select.focus();
    fireEvent.change(select, { target: { value: 'off' } });
    expect(document.activeElement).not.toBe(select);
  });
});

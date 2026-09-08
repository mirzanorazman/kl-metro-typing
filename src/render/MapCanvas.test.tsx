import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { buildSchematic } from '../geo/schematic';
import { MapCanvas } from './MapCanvas';

const data = loadNetworkData();
const net = buildNetwork(data);
const layout = buildSchematic(data.lines).points;

describe('MapCanvas', () => {
  it('draws one polyline per line', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('draws a mark for every station', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelectorAll('circle[data-station]')).toHaveLength(data.stations.length);
  });

  it('marks the active station', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation="imbi" />,
    );
    expect(container.querySelector('circle[data-station="imbi"]')?.getAttribute('data-active'))
      .toBe('true');
  });

  it('labels stations for screen readers rather than relying on colour', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const title = container.querySelector('circle[data-station="imbi"] title');
    expect(title?.textContent).toContain('Imbi');
  });
});

describe('MapCanvas framing', () => {
  it('frames the layout it is given rather than a fixed box', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const vb = container.querySelector('svg')!.getAttribute('viewBox')!;
    const [x, y, w, h] = vb.split(' ').map(Number) as [number, number, number, number];

    for (const p of layout.values()) {
      expect(p.x).toBeGreaterThanOrEqual(x);
      expect(p.x).toBeLessThanOrEqual(x + w);
      expect(p.y).toBeGreaterThanOrEqual(y);
      expect(p.y).toBeLessThanOrEqual(y + h);
    }
  });

  it('reframes when the fit key changes', async () => {
    const subset = [...layout.values()].slice(0, 5);
    const { container, rerender } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} fitKey="all" />,
    );
    const before = container.querySelector('svg')!.getAttribute('viewBox');
    rerender(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitKey="subset" fitTo={subset} />,
    );
    // The reframe eases over 500ms, so wait for the tween rather than
    // asserting on the frame the rerender happened to land on.
    await waitFor(() =>
      expect(container.querySelector('svg')!.getAttribute('viewBox')).not.toBe(before),
    );
  });
});

describe('MapCanvas cartography', () => {
  it('lays a drafting grid beneath the network', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelector('pattern#drafting-grid')).not.toBeNull();
    expect(container.querySelector('rect[data-grid]')).not.toBeNull();
  });

  it('colours each station mark by its line', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const mark = container.querySelector('circle[data-station="imbi"]') as SVGCircleElement;
    // Imbi is on the Monorail alone, so the mark takes the Monorail's colour.
    expect(mark.style.getPropertyValue('--station-colour').toUpperCase()).toBe('#80CC28');
  });

  it('gives interchanges a distinct core', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    // KL Sentral serves several lines.
    expect(container.querySelector('circle[data-core="kl-sentral"]')).not.toBeNull();
    expect(container.querySelector('circle[data-core="imbi"]')).toBeNull();
  });
});

describe('MapCanvas track states', () => {
  it('lays a glow beneath the emphasised line only', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} emphasis="KJ" />,
    );
    expect(container.querySelectorAll('polyline.track-glow')).toHaveLength(1);
  });

  it('draws no glow when no line is emphasised', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelectorAll('polyline.track-glow')).toHaveLength(0);
  });

  it('inks the stretch already travelled', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation="kl-sentral"
        travelled={['gombak', 'taman-melati', 'wangsa-maju']}
      />,
    );
    const done = container.querySelector('polyline.track-done');
    expect(done).not.toBeNull();
    expect(done!.getAttribute('points')!.split(' ')).toHaveLength(3);
  });

  it('draws nothing for a stretch too short to be a line', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation="gombak"
        travelled={['gombak']}
      />,
    );
    expect(container.querySelector('polyline.track-done')).toBeNull();
  });

  it('pins the glow to screen space, like the rail beneath it', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} emphasis="KJ" />,
    );
    // Without this the glow's width is in user units and balloons as a line
    // run zooms in, floating a wide blurred slab under a thin rail.
    expect(container.querySelector('polyline.track-glow')!.getAttribute('vector-effect'))
      .toBe('non-scaling-stroke');
  });
});

describe('MapCanvas labels', () => {
  it('labels the significant stations, not all 154', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    const labels = container.querySelectorAll('text[data-label]');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(data.stations.length / 2);
  });

  it('always labels the station being typed', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation="imbi" />,
    );
    expect(container.querySelector('text[data-label="imbi"]')).not.toBeNull();
  });

  it('labels an interchange that no terminus rule would catch, once the view is not too crowded', () => {
    const mj = layout.get('masjid-jamek')!;
    // At default (full-network) framing the interchange tier is off — too
    // many stations are in view. A tight cluster around Masjid Jamek's own
    // position brings the in-view count low enough to turn it on, without
    // zooming in so far that every station shows.
    const cluster = [...layout.values()].filter(
      (p) => Math.hypot(p.x - mj.x, p.y - mj.y) <= 100,
    );
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation={null}
        fitTo={cluster}
        fitKey="mj-cluster"
      />,
    );
    // Masjid Jamek is not a terminus and is not the active station, so it is
    // labelled here only because it serves three lines and the view is not
    // too crowded. This pins both the interchange tier and the mid-zoom tier
    // that gates it — if either breaks, the count test above still passes
    // and this does not.
    expect(container.querySelector('text[data-label="masjid-jamek"]')).not.toBeNull();
  });

  it('does not label every station merely because a line is framed', () => {
    const kj = net.lines.get('KJ')!.stations
      .map((id) => layout.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitTo={kj} fitKey="kj" />,
    );
    // Framing one line still leaves most of the network on screen; labelling
    // all 154 there is what view.w < 450 used to do.
    expect(container.querySelectorAll('text[data-label]').length).toBeLessThan(40);
  });

  it('watermarks the districts it is given', () => {
    const districts = [{ name: 'Kuala Lumpur', at: { x: 500, y: 400 } }];
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation={null}
        districts={districts}
      />,
    );
    expect(container.querySelector('text[data-watermark]')?.textContent).toBe('Kuala Lumpur');
  });
});

describe('MapCanvas cartographic furniture', () => {
  it('draws a compass and a scale bar when given a scale', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation={null}
        pxPerKm={12}
      />,
    );
    expect(container.querySelector('g[data-compass]')).not.toBeNull();
    expect(container.querySelector('[data-scale-bar]')?.textContent).toMatch(/\d+ km/);
  });

  it('omits them when there is no scale to draw', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelector('g[data-compass]')).toBeNull();
  });
});

describe('MapCanvas beacon', () => {
  it('marks the active station with a beacon', () => {
    const { container } = render(
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation="kl-sentral"
        emphasis="KJ"
      />,
    );
    expect(container.querySelector('g[data-beacon]')).not.toBeNull();
  });

  it('shows no beacon when nothing is active', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} emphasis="KJ" />,
    );
    expect(container.querySelector('g[data-beacon]')).toBeNull();
  });
});

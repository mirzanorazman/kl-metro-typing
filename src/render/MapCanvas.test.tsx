import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { buildSchematic } from '../geo/schematic';
import { networkLayout } from '../geo/networkLayout';
import { MapCanvas } from './MapCanvas';
import { DRAW_EASE, entranceTiming } from './entrance';
import { REVEAL_EASE, trackRevealTiming, type TrackReveal } from './trackReveal';

const data = loadNetworkData();
const net = buildNetwork(data);
const layout = buildSchematic(data.lines).points;

// Fits ease over 500ms of requestAnimationFrame, which under a loaded suite
// does not finish inside waitFor's window. Reduced motion makes them land
// immediately, so these assertions read the settled view rather than a frame
// the tween happened to be on.
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

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

  it('draws shared track on top by default, and side by side with laneOffsetPx', () => {
    const shared = (lanes?: number) => {
      const { container } = render(
        <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} laneOffsetPx={lanes} />,
      );
      const at = (code: 'AG' | 'SP') => container.querySelector(`polyline[data-line="${code}"]`)!
        .getAttribute('points')!.split(' ')[net.lines.get(code)!.stations.indexOf('masjid-jamek')];
      return [at('AG'), at('SP')];
    };
    const [ag, sp] = shared();
    expect(ag).toBe(sp);
    const [agLane, spLane] = shared(7);
    expect(agLane).not.toBe(spLane);
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

describe('MapCanvas follow camera', () => {
  const kj = net.lines.get('KJ')!.stations
    .map((id) => layout.get(id)!)
    .filter(Boolean);

  const widthOf = (container: HTMLElement) =>
    Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);

  it('zooms to the focus window instead of the full fitted extent', () => {
    const window = kj.slice(10, 16);
    const wide = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitTo={kj} fitKey="kj" focus={kj[12]} focusKey="a" />,
    );
    const close = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitTo={kj} fitKey="kj" focus={kj[12]} focusKey="a" focusTo={window} />,
    );
    expect(widthOf(close.container)).toBeLessThan(widthOf(wide.container) / 2);
  });

  it('never zooms past the close-up floor on tightly packed stations', () => {
    const pair = [kj[12]!, { x: kj[12]!.x + 4, y: kj[12]!.y + 4 }];
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitTo={kj} fitKey="kj" focus={kj[12]} focusKey="a" focusTo={pair} />,
    );
    expect(widthOf(container)).toBeGreaterThanOrEqual(150);
    expect(widthOf(container)).toBeLessThanOrEqual(300);
  });

  it('leaves framing alone when no focus window is given', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitTo={kj} fitKey="kj" focus={kj[12]} focusKey="a" />,
    );
    const framed = Number(
      container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2],
    );
    const extent = Math.max(...kj.map((p) => p.x)) - Math.min(...kj.map((p) => p.x));
    expect(framed).toBeGreaterThanOrEqual(extent);
  });
});

describe('MapCanvas follow camera aspect', () => {
  const kj = net.lines.get('KJ')!.stations
    .map((id) => layout.get(id)!)
    .filter(Boolean);

  const stub = (w: number, h: number) => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h,
        toJSON: () => ({}) } as DOMRect;
    };
    return () => { Element.prototype.getBoundingClientRect = original; };
  };

  // A tall, narrow box on a wide screen is letterboxed by preserveAspectRatio,
  // which quietly reveals about three times the width that was asked for.
  it('shapes the followed box to the viewport, so the shot is what was framed', async () => {
    const restore = stub(1000, 500);
    try {
      const { container } = render(
        <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
          fitTo={kj} fitKey="kj" focus={kj[12]} focusKey="a" focusTo={kj.slice(10, 16)}
          fitPadding={{ top: 0.06, right: 0.06, bottom: 0.38, left: 0.06 }} />,
      );
      await waitFor(() => {
        const [, , w, h] = container.querySelector('svg')!
          .getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
        expect(w / h).toBeCloseTo(2, 1);
      });
    } finally {
      restore();
    }
  });

});

describe('MapCanvas follow camera on long hops', () => {
  // The real geography, because this is about the Putrajaya line's longest
  // hops specifically — 99 layout units against a 28-unit median.
  const geo = networkLayout().geo;
  const py = net.lines.get('PY')!.stations;

  const stub = (w: number, h: number) => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h,
        toJSON: () => ({}) } as DOMRect;
    };
    return () => { Element.prototype.getBoundingClientRect = original; };
  };

  it.each([1, 22, 23, 25])(
    'keeps the segment being typed in shot at station %i',
    async (i) => {
      const restore = stub(1512, 690);
      try {
        const from = geo.get(py[i - 1]!)!;
        const to = geo.get(py[i]!)!;
        const window = py.slice(Math.max(0, i - 2), i + 4).map((id) => geo.get(id)!);
        const { container } = render(
          <MapCanvas net={net} layout={geo} visited={new Set()}
            activeStation={py[i] ?? null} previousStation={py[i - 1] ?? null}
            fitTo={py.map((id) => geo.get(id)!)} fitKey="py"
            focus={{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }} focusKey={`s${i}`}
            focusTo={window}
            fitPadding={{ top: 0.06, right: 0.06, bottom: 0.38, left: 0.06 }} />,
        );
        await waitFor(() => {
          const [x, y, w, h] = container.querySelector('svg')!
            .getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
          expect(w / h).toBeCloseTo(1512 / 690, 1);
          for (const p of [from, to]) {
            expect(p.x).toBeGreaterThanOrEqual(x);
            expect(p.x).toBeLessThanOrEqual(x + w);
            expect(p.y).toBeGreaterThanOrEqual(y);
            expect(p.y).toBeLessThanOrEqual(y + h);
          }
        });
      } finally {
        restore();
      }
    },
  );
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
    expect(mark.style.getPropertyValue('--station-colour').toUpperCase()).toBe('#84BD00');
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

describe('MapCanvas served ranges', () => {
  const kj = net.lines.get('KJ')!.stations;

  it('paints only the inclusive served stretch above faded full tracks', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        emphasis="KJ" emphasisSet={new Set(['SP'])}
        emphasisRanges={[{ line: 'KJ', from: 4, to: 17 }]} />,
    );
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
    for (const track of container.querySelectorAll('polyline[data-line]')) {
      expect(track.getAttribute('data-dim')).toBe('true');
    }
    const base = container.querySelector('polyline[data-line="KJ"]')!;
    const served = container.querySelector('polyline[data-served-line="KJ"]')!;
    expect(served).not.toBeNull();
    expect(base.getAttribute('points')!.split(' ')).toHaveLength(kj.length);
    expect(served.getAttribute('points')).toBe(kj.slice(4, 18)
      .map((id) => `${layout.get(id)!.x},${layout.get(id)!.y}`).join(' '));
    expect(served.getAttribute('stroke')).toBe(net.lines.get('KJ')!.colour);
    expect(served.getAttribute('stroke-width')).toBe('6');
    expect(served.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(container.querySelector('.track-glow')).toBeNull();
    for (const [index, dim] of [[3, 'true'], [4, null], [17, null], [18, 'true']] as const) {
      expect(container.querySelector(`circle[data-station="${kj[index]}"]`)!.getAttribute('data-dim')).toBe(dim);
    }
  });

  it.each(['masjid-jamek', 'putra-heights'])('dims the label and interchange core by membership at %s', (id) => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={id}
        emphasisRanges={[{ line: 'KJ', from: 4, to: 17 }]} />,
    );
    const dim = kj.slice(4, 18).includes(id) ? null : 'true';
    for (const selector of [`circle[data-station="${id}"]`, `circle[data-core="${id}"]`, `text[data-label="${id}"]`]) {
      const element = container.querySelector(selector);
      expect(element, selector).not.toBeNull();
      expect(element!.getAttribute('data-dim')).toBe(dim);
    }
  });

  it('preserves full shared-track lanes while painting only the served AG subset', () => {
    const ag = net.lines.get('AG')!.stations;
    const index = ag.indexOf('masjid-jamek');
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation="masjid-jamek"
        laneOffsetPx={7} emphasisRanges={[{ line: 'AG', from: index - 1, to: index + 1 }]} />,
    );
    const agPoints = container.querySelector('polyline[data-line="AG"]')!.getAttribute('points')!.split(' ');
    const sp = container.querySelector('polyline[data-line="SP"]')!;
    const spIndex = net.lines.get('SP')!.stations.indexOf('masjid-jamek');
    expect(agPoints[index]).not.toBe(sp.getAttribute('points')!.split(' ')[spIndex]);
    expect(sp.getAttribute('data-dim')).toBe('true');
    expect(container.querySelector('circle[data-station="masjid-jamek"]')!.getAttribute('data-dim')).toBeNull();
    expect(container.querySelector('polyline[data-served-line="AG"]')!.getAttribute('points'))
      .toBe(agPoints.slice(index - 1, index + 2).join(' '));
    expect(container.querySelector('polyline[data-served-line="SP"]')).toBeNull();
  });

  it('treats empty ranges as an entirely faded network', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set(['masjid-jamek'])} activeStation="masjid-jamek"
        emphasis="KJ" emphasisSet={new Set(['KJ'])} emphasisRanges={[]} />,
    );
    expect(container.querySelectorAll('polyline[data-served-line]')).toHaveLength(0);
    for (const mark of container.querySelectorAll('polyline[data-line], circle[data-station], circle[data-core], text[data-label]')) {
      expect(mark.getAttribute('data-dim')).toBe('true');
    }
    expect(container.querySelector('.track-glow')).toBeNull();
  });

  it('keeps a one-Station range bright without drawing a rail', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        emphasisRanges={[{ line: 'KJ', from: 4, to: 4 }]} />,
    );
    expect(container.querySelector('polyline[data-served-line]')).toBeNull();
    expect(container.querySelector(`circle[data-station="${kj[4]}"]`)!.getAttribute('data-dim')).toBeNull();
    expect(container.querySelector(`circle[data-station="${kj[5]}"]`)!.getAttribute('data-dim')).toBe('true');
  });

  it.each([undefined, null])('keeps whole-Line emphasis when ranges are %s', (emphasisRanges) => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        emphasisSet={new Set(['KJ'])} emphasisRanges={emphasisRanges} />,
    );
    expect(container.querySelector('polyline[data-line="KJ"]')!.getAttribute('data-dim')).toBeNull();
    expect(container.querySelector('polyline[data-line="SP"]')!.getAttribute('data-dim')).toBe('true');
    expect(container.querySelector(`circle[data-station="${kj[3]}"]`)!.getAttribute('data-dim')).toBeNull();
    expect(container.querySelector('polyline[data-served-line]')).toBeNull();
  });
});


describe('MapCanvas partial track reveal', () => {
  const kj = net.lines.get('KJ')!.stations;
  const targetRanges = [{ line: 'KJ' as const, from: 4, to: 20 }];
  const reveal: TrackReveal = {
    id: 41,
    before: [{ line: 'KJ', from: 4, to: 17 }],
    segments: [{ line: 'KJ', from: 17, to: 20, reverse: false }],
    stations: new Set(kj.slice(18, 21)),
    duration: 800,
  };
  const points = (from: number, to: number) => kj.slice(from, to + 1)
    .map((id) => `${layout.get(id)!.x},${layout.get(id)!.y}`).join(' ');
  const props = {
    net, layout, visited: new Set<string>(), activeStation: kj[18]!,
    emphasisRanges: targetRanges, trackReveal: reveal,
  };

  it('keeps only the old served rail bright beneath the animated extension', () => {
    const { container } = render(<MapCanvas {...props} />);
    expect(container.querySelectorAll('polyline[data-served-line]')).toHaveLength(1);
    expect(container.querySelector('polyline[data-served-line="KJ"]')!.getAttribute('points'))
      .toBe(points(4, 17));
    const extension = container.querySelector<SVGPolylineElement>('polyline[data-reveal-line="KJ"]')!;
    expect(extension).not.toBeNull();
    expect(extension.getAttribute('points')).toBe(points(17, 20));
    expect(extension.getAttribute('pathLength')).toBe('1');
    expect(extension.getAttribute('data-draw')).toBe('true');
    expect(extension.style.getPropertyValue('--draw-delay')).toBe('0ms');
    expect(extension.style.getPropertyValue('--draw-dur')).toBe('480ms');
    expect(extension.style.getPropertyValue('--draw-ease')).toBe(REVEAL_EASE.css);
    expect(extension.getAttribute('stroke')).toBe(net.lines.get('KJ')!.colour);
    expect(extension.getAttribute('stroke-width')).toBe('6');
    expect(extension.getAttribute('stroke-linecap')).toBe('round');
    expect(extension.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    for (const base of container.querySelectorAll('polyline[data-line]')) {
      expect(base.getAttribute('data-dim')).toBe('true');
      expect(base.getAttribute('data-draw')).toBeNull();
    }
  });

  it('pops only newly served marks and labels as the advancing track reaches them', () => {
    const { container } = render(<MapCanvas {...props} pxPerKm={4}
      districts={[{ name: 'Kuala Lumpur', at: { x: 500, y: 400 } }]} />);
    const timing = trackRevealTiming(net, layout, null, reveal);
    for (const id of reveal.stations) {
      const mark = container.querySelector<SVGCircleElement>(`circle[data-station="${id}"]`)!;
      expect(mark.getAttribute('data-dim')).toBeNull();
      expect(mark.getAttribute('data-pop')).toBe('true');
      expect(mark.style.getPropertyValue('--pop-delay')).toBe(`${Math.round(timing.station.get(id)!)}ms`);
    }
    const label = container.querySelector<SVGTextElement>(`text[data-label="${kj[18]}"]`)!;
    expect(label.getAttribute('data-pop')).toBe('true');
    expect(label.style.getPropertyValue('--pop-delay')).toBe(`${Math.round(timing.station.get(kj[18]!)!)}ms`);
    for (const element of container.querySelectorAll('circle[data-station="kl-sentral"], circle[data-core="kl-sentral"], g[data-labels], g[data-compass], [data-watermark]')) {
      expect(element.getAttribute('data-pop')).toBeNull();
    }
    for (const existingLabel of container.querySelectorAll('text[data-label]')) {
      if (!reveal.stations.has(existingLabel.getAttribute('data-label')!)) {
        expect(existingLabel.getAttribute('data-pop')).toBeNull();
      }
    }
  });

  it('uses only partial reveal station timings when a home entrance is also supplied', () => {
    const { container } = render(<MapCanvas {...props} entrance={entranceTiming(net)} />);
    const timing = trackRevealTiming(net, layout, null, reveal);
    for (const element of container.querySelectorAll<SVGCircleElement>('circle[data-station], circle[data-core]')) {
      const id = element.getAttribute('data-station') ?? element.getAttribute('data-core')!;
      if (reveal.stations.has(id)) {
        expect(element.getAttribute('data-pop')).toBe('true');
        expect(element.style.getPropertyValue('--pop-delay')).toBe(`${Math.round(timing.station.get(id)!)}ms`);
      } else {
        expect(element.getAttribute('data-pop'), id).toBeNull();
        expect(element.style.getPropertyValue('--pop-delay'), id).toBe('');
      }
    }
  });

  it('retains the animated node while layout and camera geometry change', () => {
    const { container, rerender } = render(<MapCanvas {...props} laneOffsetPx={7} />);
    const extension = container.querySelector('polyline[data-reveal-line="KJ"]')!;
    expect(extension).not.toBeNull();
    const moved = new Map([...layout].map(([id, p]) => [id, { x: p.x + 2, y: p.y + 3 }]));
    rerender(<MapCanvas {...props} layout={moved} laneOffsetPx={9}
      fitTo={kj.slice(16, 22).map((id) => moved.get(id)!)} fitKey="close" />);
    expect(container.querySelector('polyline[data-reveal-line="KJ"]')).toBe(extension);
    expect(extension.getAttribute('points')).not.toBe(points(17, 20));
  });

  it('settles to the complete served rail when the reveal is removed', () => {
    const { container, rerender } = render(<MapCanvas {...props} />);
    expect(container.querySelector('[data-draw]')).not.toBeNull();
    rerender(<MapCanvas {...props} trackReveal={null} />);
    expect(container.querySelectorAll('polyline[data-served-line]')).toHaveLength(1);
    expect(container.querySelector('polyline[data-served-line="KJ"]')!.getAttribute('points')).toBe(points(4, 20));
    expect(container.querySelectorAll('[data-draw], [data-pop], [data-reveal-line]')).toHaveLength(0);
  });

  it('draws a lower extension backwards and pops its new interchange core', () => {
    const lower: TrackReveal = {
      id: 42, before: [{ line: 'KJ', from: 17, to: 20 }],
      segments: [{ line: 'KJ', from: 12, to: 17, reverse: true }],
      stations: new Set(kj.slice(12, 17)), duration: 800,
    };
    const { container } = render(<MapCanvas {...props} activeStation="masjid-jamek"
      emphasisRanges={[{ line: 'KJ', from: 12, to: 20 }]} trackReveal={lower} />);
    const extension = container.querySelector('polyline[data-reveal-line="KJ"]');
    expect(extension).not.toBeNull();
    expect(extension!.getAttribute('points')).toBe(points(12, 17).split(' ').reverse().join(' '));
    const timing = trackRevealTiming(net, layout, null, lower);
    for (const selector of ['circle[data-station="masjid-jamek"]', 'circle[data-core="masjid-jamek"]', 'text[data-label="masjid-jamek"]']) {
      const element = container.querySelector<SVGElement>(selector)!;
      expect(element.getAttribute('data-pop')).toBe('true');
      expect(element.style.getPropertyValue('--pop-delay')).toBe(`${Math.round(timing.station.get('masjid-jamek')!)}ms`);
    }
    expect(container.querySelector(`circle[data-station="${kj[17]}"]`)!.getAttribute('data-pop')).toBeNull();
  });

  it('has no already bright rail behind a newly entered line', () => {
    const entry: TrackReveal = {
      id: 43, before: [], segments: [{ line: 'KJ', from: 4, to: 20, reverse: false }],
      stations: new Set(kj.slice(4, 21)), duration: 800,
    };
    const { container } = render(<MapCanvas {...props} trackReveal={entry} />);
    expect(container.querySelectorAll('polyline[data-served-line]')).toHaveLength(0);
    expect(container.querySelectorAll('polyline[data-reveal-line]')).toHaveLength(1);
    expect(container.querySelector('polyline[data-reveal-line]')!.getAttribute('points')).toBe(points(4, 20));
  });

  it('skips reveal segments without two drawn points', () => {
    const single: TrackReveal = {
      id: 44, before: [], segments: [{ line: 'KJ', from: 4, to: 4, reverse: false }],
      stations: new Set([kj[4]!]), duration: 800,
    };
    const { container } = render(<MapCanvas {...props} trackReveal={single}
      emphasisRanges={[{ line: 'KJ', from: 4, to: 4 }]} />);
    expect(container.querySelector('[data-reveal-line]')).toBeNull();
    expect(container.querySelector(`circle[data-station="${kj[4]}"]`)!.getAttribute('data-pop')).toBe('true');
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

  it('does not write two labels over each other at close zoom', () => {
    const geo = networkLayout().geo;
    const py = net.lines.get('PY')!.stations;
    // Sri Damansara Barat and Sri Damansara Sentral are adjacent, and their
    // names are long enough that both cannot sit up and to the right.
    const window = py.slice(3, 9).map((id) => geo.get(id)!);
    const { container } = render(
      <MapCanvas net={net} layout={geo} visited={new Set()} activeStation={py[5]!}
        fitTo={window} fitKey="close" />,
    );

    // The face's own metrics: a 0.6em advance plus the stylesheet's 0.08em of
    // letter-spacing, and a 0.72em cap height above the baseline. The labels
    // are uppercase, so nothing descends below it.
    const ADVANCE = 0.68;
    const CAP = 0.72;
    const boxes = [...container.querySelectorAll('text[data-label]')].map((t) => {
      const size = Number(t.getAttribute('font-size'));
      const width = (t.textContent ?? '').length * size * ADVANCE;
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      const x0 = t.getAttribute('text-anchor') === 'end' ? x - width : x;
      return { id: t.getAttribute('data-label'), x0, x1: x0 + width, y0: y - size * CAP, y1: y };
    });
    expect(boxes.length).toBeGreaterThan(3);

    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('labelOnly limits Station labels to its set', () => {
    const kj = net.lines.get('KJ')!.stations;
    const at = kj.indexOf('klcc');
    // A tight window of a few neighbours: few enough in view that every
    // Station would be named.
    const window = kj.slice(at - 1, at + 2).map((id) => layout.get(id)!);
    const view = (labelOnly?: ReadonlySet<string>) => render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null}
        fitTo={window} fitKey="klcc" labelOnly={labelOnly} />,
    ).container;

    expect(view().querySelectorAll('text[data-label]').length).toBeGreaterThan(1);
    const only = view(new Set(['klcc']));
    expect([...only.querySelectorAll('text[data-label]')].map((t) => t.getAttribute('data-label')))
      .toEqual(['klcc']);
  });

  it('does not label stations the player cannot see', () => {
    const geo = networkLayout().geo;
    const py = net.lines.get('PY')!.stations;
    const window = py.slice(3, 9).map((id) => geo.get(id)!);
    const { container } = render(
      <MapCanvas net={net} layout={geo} visited={new Set()} activeStation={py[5]!}
        fitTo={window} fitKey="close" />,
    );

    const [x, y, w, h] = container.querySelector('svg')!
      .getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
    // Generous, because a label sits beside its station rather than on it.
    for (const label of container.querySelectorAll('text[data-label]')) {
      const p = geo.get(label.getAttribute('data-label')!)!;
      expect(p.x).toBeGreaterThan(x - w);
      expect(p.x).toBeLessThan(x + w * 2);
      expect(p.y).toBeGreaterThan(y - h);
      expect(p.y).toBeLessThan(y + h * 2);
    }
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

describe('MapCanvas entrance', () => {
  const timing = entranceTiming(net);

  it('leaves the map fully drawn when no entrance is given', () => {
    const { container } = render(
      <MapCanvas net={net} layout={layout} visited={new Set()} activeStation={null} />,
    );
    expect(container.querySelectorAll('[data-draw]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-pop]')).toHaveLength(0);
  });

  it('draws each line on at its own moment', () => {
    const { container } = render(
      <MapCanvas
        net={net} layout={layout} visited={new Set()} activeStation={null}
        entrance={timing}
      />,
    );
    const kj = container.querySelector<SVGPolylineElement>('polyline[data-line="KJ"]')!;
    expect(kj.getAttribute('data-draw')).toBe('true');
    expect(kj.getAttribute('pathLength')).toBe('1');
    expect(kj.style.getPropertyValue('--draw-delay')).toBe(`${timing.line.get('KJ')!.delay}ms`);
    expect(kj.style.getPropertyValue('--draw-dur')).toBe(`${timing.line.get('KJ')!.duration}ms`);
    // The stylesheet animates the stroke with the same curve the station
    // delays were computed against, rather than a copy of it.
    expect(kj.style.getPropertyValue('--draw-ease')).toBe(DRAW_EASE.css);
  });

  it('pops each station as its line reaches it', () => {
    const { container } = render(
      <MapCanvas
        net={net} layout={layout} visited={new Set()} activeStation={null}
        entrance={timing}
      />,
    );
    const dot = container.querySelector<SVGCircleElement>('circle[data-station="imbi"]')!;
    expect(dot.getAttribute('data-pop')).toBe('true');
    expect(dot.style.getPropertyValue('--pop-delay'))
      .toBe(`${Math.round(timing.station.get('imbi')!)}ms`);
  });

  it('holds the labels and furniture back until the network has drawn', () => {
    const { container } = render(
      <MapCanvas
        net={net} layout={layout} visited={new Set()} activeStation={null}
        entrance={timing} pxPerKm={4}
      />,
    );
    const labels = container.querySelector<SVGGElement>('g[data-labels]')!;
    expect(labels.getAttribute('data-pop')).toBe('true');
    expect(labels.style.getPropertyValue('--pop-delay')).toBe(`${Math.round(timing.total)}ms`);
  });
});

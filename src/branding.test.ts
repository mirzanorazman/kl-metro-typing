// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEADERBOARD_STORAGE_KEY } from './data/leaderboardStore';
import { STORAGE_KEY } from './engine/progress';

const projectRoot = new URL('../', import.meta.url);
const readProjectFile = (path: string) => readFileSync(new URL(path, projectRoot), 'utf8');
const pngDimensions = (path: string) => {
  const png = readFileSync(new URL(path, projectRoot));
  expect(png.subarray(1, 4).toString('utf8')).toBe('PNG');

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
};

describe('active product branding', () => {
  it('uses KL-Metro Typing in active product and package files', () => {
    const activeFiles = [
      'index.html',
      'src/ui/HomeMap.tsx',
      'README.md',
      'CONTEXT.md',
      'docs/STATUS.md',
    ];

    for (const path of activeFiles) {
      expect(readProjectFile(path)).not.toContain('MyRapid Typing');
    }

    expect(readProjectFile('index.html')).toContain('<title>KL-Metro Typing</title>');
    expect(readProjectFile('src/ui/HomeMap.tsx')).toContain('<h1>KL-Metro Typing</h1>');

    const packageJson = JSON.parse(readProjectFile('package.json'));
    const packageLock = JSON.parse(readProjectFile('package-lock.json'));
    expect(packageJson.name).toBe('kl-metro-typing');
    expect(packageLock.name).toBe('kl-metro-typing');
    expect(packageLock.packages[''].name).toBe('kl-metro-typing');
  });

  it('uses KL-Metro persistence namespaces', () => {
    expect(STORAGE_KEY).toBe('klmetro.v1');
    expect(LEADERBOARD_STORAGE_KEY).toBe('klmetro.leaderboard.v1');
  });

  it('declares the browser and install identity', () => {
    const indexHtml = readProjectFile('index.html');
    expect(indexHtml).toContain('<meta name="theme-color" content="#0b0f17" />');
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(indexHtml).toContain('href="/favicon-32x32.png"');
    expect(indexHtml).toContain('href="/apple-touch-icon.png"');
    expect(indexHtml).toContain('href="/site.webmanifest"');

    const manifest = JSON.parse(readProjectFile('public/site.webmanifest'));
    expect(manifest.name).toBe('KL-Metro Typing');
    expect(manifest.short_name).toBe('KL-Metro');
    expect(manifest.theme_color).toBe('#0b0f17');
    expect(manifest.background_color).toBe('#0b0f17');
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]);
  });

  it('ships correctly sized station-roundel raster icons', () => {
    expect(existsSync(new URL('public/favicon.svg', projectRoot))).toBe(true);
    expect(pngDimensions('public/favicon-32x32.png')).toEqual({ width: 32, height: 32 });
    expect(pngDimensions('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngDimensions('public/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngDimensions('public/icon-512.png')).toEqual({ width: 512, height: 512 });
  });

  it('declares a complete social-sharing preview', () => {
    const indexHtml = readProjectFile('index.html');
    expect(indexHtml).toContain('<link rel="canonical" href="https://kl-metro-typing.vercel.app/" />');
    expect(indexHtml).toContain('<meta property="og:type" content="website" />');
    expect(indexHtml).toContain('<meta property="og:title" content="KL-Metro Typing" />');
    expect(indexHtml).toContain('<meta property="og:url" content="https://kl-metro-typing.vercel.app/" />');
    expect(indexHtml).toContain('<meta property="og:image" content="https://kl-metro-typing.vercel.app/og-image.png" />');
    expect(indexHtml).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(indexHtml).toContain('<meta name="twitter:title" content="KL-Metro Typing" />');
    expect(indexHtml).toContain('<meta name="twitter:image" content="https://kl-metro-typing.vercel.app/og-image.png" />');
    expect(pngDimensions('public/og-image.png')).toEqual({ width: 1200, height: 630 });
  });
});

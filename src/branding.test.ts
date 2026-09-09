import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL(import.meta.url).pathname
  .replace(/^\/@fs/, '')
  .replace(/\/src\/[^/]+$/, '');
const readProjectFile = (path: string) => readFileSync(`${projectRoot}/${path}`, 'utf8');

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
    expect(readProjectFile('src/engine/progress.ts')).toContain(
      "export const STORAGE_KEY = 'klmetro.v1';",
    );
    expect(readProjectFile('src/data/leaderboardStore.ts')).toContain(
      "export const LEADERBOARD_STORAGE_KEY = 'klmetro.leaderboard.v1';",
    );
  });
});

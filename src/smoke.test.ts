import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const indexCss = readFileSync('src/index.css', 'utf8');
const mobileCss = readFileSync('src/ui/mobile.css', 'utf8');
const leaderboardCss = readFileSync('src/ui/leaderboard.css', 'utf8');

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('locks the document and shared mobile gameplay surfaces to the phone viewport', () => {
    expect(indexCss).toMatch(/html,\s*body,\s*#root\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/);
    expect(indexCss).toMatch(/body\s*\{[^}]*overscroll-behavior:\s*none;/);
    expect(indexCss).toMatch(
      /@media\s*\(max-width:\s*700px\),\s*\(pointer:\s*coarse\)\s*and\s*\(max-height:\s*700px\)[\s\S]*?body\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*width:\s*100%;/,
    );
    expect(indexCss).not.toMatch(/@media\s*\(max-width:\s*700px\)\s*\{/);

    expect(mobileCss).toMatch(
      /@media\s*\(max-width:\s*700px\),\s*\(pointer:\s*coarse\)\s*and\s*\(max-height:\s*700px\)[\s\S]*?\.play-panel\s*\{[^}]*left:\s*0;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*width:\s*100%;[^}]*transform:\s*none;[^}]*max-height:\s*min\(42dvh,\s*22rem\);[^}]*overflow-y:\s*auto;[^}]*border-radius:\s*10px\s+10px\s+0\s+0;[^}]*padding:\s*var\(--s2\);[^}]*padding-bottom:\s*max\(var\(--s2\),\s*env\(safe-area-inset-bottom\)\);/,
    );
    expect(mobileCss).toMatch(/\.mobile-turn-around\s*,\s*\.junction\s+button\s*\{[^}]*min-height:\s*44px;/);

    expect(mobileCss).toMatch(
      /@media\s*\(max-width:\s*700px\),\s*\(pointer:\s*coarse\)\s*and\s*\(max-height:\s*700px\)\s*\{\s*\.quick-run \.play-panel\s*\{[^}]*max-height:\s*min\(42dvh,\s*22rem\);[^}]*padding:\s*var\(--s2\);[^}]*padding-bottom:\s*max\(var\(--s2\),\s*env\(safe-area-inset-bottom\)\);[^}]*\}\s*\}/,
    );
  });

  it("rings direction buttons in their Line's colour", () => {
    expect(indexCss).toMatch(/\.junction button\s*\{[^}]*border:\s*1px solid var\(--line-colour, var\(--panel-edge\)\);/);
    expect(indexCss).not.toMatch(/\.junction button\s*\{[^}]*border-left:/);
    expect(indexCss).toMatch(
      /\[data-theme='midnight'\] \.junction button\s*\{[^}]*box-shadow:[^}]*0 0 24px -6px var\(--line-colour, transparent\);/,
    );
  });

  it('draws every printed key as the same chip, wherever it appears', () => {
    expect(indexCss).toMatch(/(^|\n)kbd\s*\{[^}]*border:\s*1px solid var\(--panel-edge\);[^}]*font:\s*var\(--t-xs\) var\(--font-mono\);/);
    // One rule, not per-surface copies that leave new surfaces (Dispatcher) bare.
    expect(indexCss).not.toMatch(/\.junction kbd\s*\{/);
    expect(indexCss).not.toMatch(/\.line-picker kbd, \.hint kbd\s*\{/);
  });

  it('lights a home card on hover, as the old menu rows did', () => {
    expect(indexCss).toMatch(/\.mode-card:has\(button:hover\)\s*\{[^}]*border-color:\s*var\(--focus-ring\);/);
  });

  it('keeps standalone terminal surfaces scrollable inside the locked document', () => {
    expect(indexCss).toMatch(
      /\.summary\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/,
    );
    expect(leaderboardCss).toMatch(
      /\.leaderboard-screen\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/,
    );
    expect(mobileCss).toMatch(
      /\.leaderboard-screen--embedded\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*auto;/,
    );
  });
});

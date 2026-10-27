import React from 'react';
import { Composition, staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { Reel } from './Reel';
import { DURATION, FPS, HEIGHT, WIDTH } from './timeline';

// The game's own typefaces, from the same @fontsource packages it ships.
loadFont({ family: 'JetBrains Mono Variable', url: staticFile('fonts/jetbrains-mono-latin-wght-normal.woff2'), weight: '100 800' });
loadFont({ family: 'Plus Jakarta Sans Variable', url: staticFile('fonts/plus-jakarta-sans-latin-wght-normal.woff2'), weight: '200 800' });

export const RemotionRoot: React.FC = () => (
  <Composition id="Reel" component={Reel} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
);

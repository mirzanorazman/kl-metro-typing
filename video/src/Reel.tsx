import React from 'react';
import { AbsoluteFill, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import { MapLayer } from './MapLayer';
import { EndCard, EraBar, Headline, Hook, IncidentCard, Junction, NetworkTotal, Panel } from './Overlay';

/**
 * The 40-second reel: one continuous map underneath, with the interface for
 * each scene laid over it. The map never cuts, so the network the viewer
 * watches being typed is the same one Dispatcher runs at the end.
 */
export const Reel: React.FC = () => (
  <AbsoluteFill>
    <MapLayer />
    <EraBar />
    <Headline />
    <NetworkTotal />
    <IncidentCard />
    <Panel />
    <Junction />
    <Hook />
    <EndCard />
    <Audio src={staticFile('soundtrack.wav')} />
  </AbsoluteFill>
);

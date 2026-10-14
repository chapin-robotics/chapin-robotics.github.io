/// <reference lib="webworker" />
// Hosts the hero scene off the main thread. The page sends size, device facts
// and pointer state; the worker renders into the transferred OffscreenCanvas
// and reports where each piece sits so the page can place its hit areas.
import { createHero, type HeroInput, type PieceName, type ScreenRect } from './hero';
import type { Tier } from './studio';

type Message =
  | { type: 'init'; canvas: OffscreenCanvas; tier: Tier; deviceDpr: number; width: number; height: number; input: HeroInput }
  | { type: 'input'; input: Partial<HeroInput> }
  | { type: 'resize'; width: number; height: number }
  | { type: 'dispose' };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let input: HeroInput = { pointer: null, active: null, reduced: false, visible: true };
let hero: Awaited<ReturnType<typeof createHero>> | null = null;
let lastRects = '';
let disposed = false;

scope.onmessage = async (event: MessageEvent<Message>) => {
  const message = event.data;
  if (message.type === 'init') {
    input = message.input;
    try {
      hero = await createHero({
        canvas: message.canvas,
        tier: message.tier,
        deviceDpr: message.deviceDpr,
        size: { width: message.width, height: message.height },
        readInput: () => input,
        onRects: (rects: Record<PieceName, ScreenRect>) => {
          const key = JSON.stringify(rects, (_, value) => (typeof value === 'number' ? Math.round(value) : value));
          if (key !== lastRects) { lastRects = key; scope.postMessage({ type: 'rects', rects }); }
        },
        onReady: () => scope.postMessage({ type: 'ready' }),
      });
      // Disposed while loading: tear down what was just built, then close.
      if (disposed) { hero.dispose(); hero = null; scope.close(); }
    } catch (error) {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  } else if (message.type === 'input') {
    input = { ...input, ...message.input };
    hero?.request();
  } else if (message.type === 'resize') {
    hero?.resize(message.width, message.height);
  } else if (message.type === 'dispose') {
    disposed = true;
    if (hero) { hero.dispose(); hero = null; scope.close(); }
  }
};

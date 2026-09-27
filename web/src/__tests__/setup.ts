import '@testing-library/jest-dom/vitest';

/**
 * jsdom does not implement canvas, so PlotView's getContext call logs a
 * not-implemented notice on every render. The component already handles a missing
 * context, and the notice is noise that hides real failures, so it is stubbed out.
 *
 * Anything that depends on what was actually painted needs a real browser; those
 * checks belong in the offline verification pass, not here.
 */
HTMLCanvasElement.prototype.getContext = () => null;

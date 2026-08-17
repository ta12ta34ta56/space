import { useEffect, useState, useCallback } from 'react';
import { CanvasHost } from '../../render/canvas';
import { createAutosave } from '../../state/autosave';
import { storage } from '../../state/storage';
import { store } from '../../state/store';
import './AppShell.css';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.73, 0.85, 1, 1.25, 1.37, 1.5, 1.73, 2, 2.5, 3];

export function AppShell() {
  const [zoom, setZoom] = useState(1);
  const [pageIndex] = useState(0);

  // Unit 04 autosave wiring: starts with the app, stops on unload (tracker Q7)
  useEffect(() => {
    const autosave = createAutosave({
      store,
      storage,
      delayMs: 1500,
      now: Date.now,
    });
    return () => {
      void autosave.stop();
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = ZOOM_STEPS.find((s) => s > prev + 0.01);
      return next ?? Math.min(4, Math.round((prev + 0.25) * 100) / 100);
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const reversed = [...ZOOM_STEPS].reverse();
      const next = reversed.find((s) => s < prev - 0.01);
      return next ?? Math.max(0.1, Math.round((prev - 0.25) * 100) / 100);
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  const handleZoomFit = useCallback(() => {
    // Fits a standard page in typical desktop viewport
    setZoom(0.85);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleZoomReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut, handleZoomReset]);

  return (
    <div className="novelka-shell">
      <header className="novelka-header">
        <span className="novelka-brand">Novelka</span>
      </header>

      <main className="novelka-workspace">
        <div className="novelka-canvas-container">
          <CanvasHost pageIndex={pageIndex} zoom={zoom} />
        </div>
      </main>

      <footer className="novelka-footer">
        <div className="novelka-zoom-controls" role="toolbar" aria-label="Zoom controls">
          <button
            type="button"
            className="novelka-btn"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            className="novelka-btn novelka-zoom-readout"
            onClick={handleZoomReset}
            aria-label="Reset zoom to 100%"
            title="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="novelka-btn"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="novelka-btn"
            onClick={handleZoomFit}
            aria-label="Fit to window"
            title="Fit to window"
          >
            Fit
          </button>
        </div>
      </footer>
    </div>
  );
}

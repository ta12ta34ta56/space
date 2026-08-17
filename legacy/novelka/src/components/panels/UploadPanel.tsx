import { useEffect, useState } from 'react';
import { engine } from '../../engine/canvas-engine';
import { useToastStore } from '../../stores/toast-store';
import { fileToDataURL } from '../../utils/file-utils';
import { isSvgDataUrl, sanitizeSvgDataUrl } from '../../utils/svg-sanitize';
import { ClosePanelButton } from '../ClosePanelButton';

const KEY = 'novelka.uploads.v1';
/** Pre-rename keys — read once so previously uploaded art is not lost. */
const KEY_LEGACY = 'minipdf.uploads.v1';
const KEY_GRIDPRESS = 'gridpress.uploads.v1';

interface Upload {
  id: string;
  name: string;
  url: string;
  type: string;
}

export function UploadPanel() {
  const setStatus = useToastStore((s) => s.setStatus);
  const [items, setItems] = useState<Upload[]>([]);

  useEffect(() => {
    try {
      // fall back to the pre-rename key so earlier uploads still appear
      const raw =
        localStorage.getItem(KEY) ??
        localStorage.getItem(KEY_LEGACY) ??
        localStorage.getItem(KEY_GRIDPRESS) ??
        '[]';
      setItems(JSON.parse(raw));
    } catch {
      setItems([]);
    }
  }, []);

  const persist = (next: Upload[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      setStatus('error', 'Local storage full — upload kept for this session only');
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...items];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) {
        setStatus('error', `${f.name} is not an image`);
        continue;
      }
      setStatus('busy', `Reading ${f.name}…`);
      let url = await fileToDataURL(f);

      // An uploaded SVG is an untrusted XML document, not a picture: it can
      // carry <script> and event handlers. Clean it once, here, so the stored
      // copy is already safe and every later use inherits that.
      if (isSvgDataUrl(url)) {
        const { url: safe, report } = sanitizeSvgDataUrl(url);
        if (!safe) {
          setStatus('error', `${f.name} could not be read as a safe SVG`);
          continue;
        }
        if (report?.modified) {
          const n = (report.removedTags.length + report.removedAttrs.length);
          setStatus('success', `${f.name}: removed ${n} unsafe item${n === 1 ? '' : 's'}`);
        }
        url = safe;
      }

      next.unshift({ id: `${Date.now()}-${f.name}`, name: f.name, url, type: f.type });
    }
    persist(next.slice(0, 40));
    setStatus('success', 'Upload ready — click or drag it onto the page');
  };

  const place = async (u: Upload) => {
    try {
      setStatus('busy', 'Placing image…');
      if (u.type === 'image/svg+xml') await engine.addSVGFromURL(u.url);
      else await engine.addImageFromURL(u.url);
      setStatus('success', 'Image added');
    } catch {
      setStatus('error', 'Could not place image');
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Uploads</span>
        <span className="badge">{items.length}</span>
        <ClosePanelButton />
      </div>
      <div className="panel-body">
        <label
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
        >
          Upload images
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        <p className="hint" style={{ marginBottom: 14 }}>
          PNG, JPG, SVG and WebP. Transparency is preserved end-to-end — canvas, PNG
          export and PDF.
        </p>

        {items.length === 0 ? (
          <div className="empty">
            Nothing uploaded yet.
            <br />
            You can also drag files straight from your desktop onto the page.
          </div>
        ) : (
          <div className="grid-3">
            {items.map((u) => (
              <div key={u.id} className="asset-cell">
                <div
                  className="tile"
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData('application/x-novelka-asset', u.url)
                  }
                  onClick={() => place(u)}
                  title={u.name}
                >
                  <img src={u.url} alt={u.name} />
                </div>
                <div className="tile-label">{u.name}</div>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <button
            className="btn danger sm"
            style={{ marginTop: 12 }}
            onClick={() => persist([])}
          >
            Clear uploads
          </button>
        )}
      </div>
    </div>
  );
}

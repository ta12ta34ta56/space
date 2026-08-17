import { Suspense, lazy, useEffect, useRef, useState, type ReactElement } from 'react';
import { CanvasStage } from './components/canvas/CanvasStage';
import { EditorFooter } from './components/editor/EditorFooter';
import { RightDock } from './components/editor/RightDock';
import { TextPanel } from './components/panels/TextPanel';
import { UploadPanel } from './components/panels/UploadPanel';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { ElementsPanel } from './components/panels/ElementsPanel';
import { SettingsPanel } from './components/panels/SettingsPanel';
import { GeneratorHubPanel } from './components/panels/GeneratorHubPanel';
import { TemplateLibraryModal } from './components/modals/TemplateLibraryModal';
import { NewBookModal } from './components/modals/NewBookModal';
import { ProjectsModal } from './components/modals/ProjectsModal';
import { ImportPdfModal } from './components/modals/ImportPdfModal';
import { PageNumbersModal } from './components/modals/PageNumbersModal';
import { AddPagesModal } from './components/modals/AddPagesModal';
import { CoverWizard } from './components/modals/CoverWizard';
import { AuthModal } from './components/modals/AuthModal';
import { RatingModal } from './components/modals/RatingModal';
import { QuickWordSearchWizard } from './components/modals/QuickWordSearchWizard';
import { isSupabaseConfigured } from './services/auth';
import { shouldPromptRating, markRatingPrompted } from './services/ratings';
import {
  ADMIN_BUILT_IN,
  isUnlocked,
  lock as lockAdminAccess,
  markUnlocked,
  watchForUnlock,
} from './services/admin-access';

/**
 * The control panel is a separate chunk, fetched only after the owner has
 * unlocked it. A user reading the main bundle finds a filename, not the panel.
 */
const AdminPanel = lazy(() =>
  import('./components/modals/AdminPanel').then((m) => ({ default: m.AdminPanel })),
);

/** The owner gate is lazy too — otherwise "Claim ownership" ships to everyone. */
const OwnerGate = lazy(() =>
  import('./components/modals/OwnerGate').then((m) => ({ default: m.OwnerGate })),
);

/**
 * Export (PDF rendering, pdf-lib, fontkit) and Preview (offscreen Fabric
 * rasterisation) are the heaviest modal surfaces. They ship as their own
 * chunks and load only when the user opens them.
 */
const ExportModal = lazy(() =>
  import('./components/modals/ExportModal').then((m) => ({ default: m.ExportModal })),
);
const PreviewMode = lazy(() =>
  import('./components/modals/PreviewMode').then((m) => ({ default: m.PreviewMode })),
);
import { HomeScreen } from './components/HomeScreen';
import { CustomerNav } from './components/navigation/CustomerNav';
import { CreateView } from './components/home/CreateView';
import { ProjectsView } from './components/home/ProjectsView';
import { TemplatesView } from './components/home/TemplatesView';
import { HelpModal } from './components/modals/HelpModal';
import { FloatingCanvasBar } from './components/editor/FloatingCanvasBar';
import { InspectorPanel, type InspectorView } from './components/editor/InspectorPanel';

import { TEMPLATES, applyTemplate } from './services/templates';
import { useTextStyleStore } from './stores/text-style-store';
import type { StoredProject } from './services/storage';
import { Icon, type IconName } from './components/Icon';
import { useCanvasStore } from './stores/canvas-store';
import { useEditorUiStore } from './stores/editor-ui-store';
import { useShortcuts } from './hooks/useShortcuts';
import { preloadDefaultFonts } from './engine/font-manager';
import { storage, StorageFullError } from './services/storage';
import { engine } from './engine/canvas-engine';
import { useFlagStore } from './stores/flag-store';
import { useAuthStore } from './stores/auth-store';
import { useThemeStore } from './stores/theme-store';
import { useToastStore } from './stores/toast-store';
import { ClosePanelButton } from './components/ClosePanelButton';

type Tool =
  | 'text'
  | 'uploads'
  | 'elements'
  | 'generators'
  | 'settings'
  | 'history'
  | null;

type PreviewView = 'single' | 'spread' | 'grid';

type AppView = 'home' | 'create' | 'projects' | 'templates' | 'editor';

type AppModal =
  | { kind: 'export' }
  | { kind: 'projects' }
  | { kind: 'importPdf' }
  | { kind: 'pageNumbers' }
  | { kind: 'addPages' }
  | { kind: 'coverWizard' }
  | { kind: 'templateLibrary' }
  | { kind: 'newBook'; initialName?: string; initialSize?: { width: number; height: number } }
  | { kind: 'quickWordSearch'; initialTemplateId?: string }
  | { kind: 'admin' }
  | { kind: 'auth' }
  | { kind: 'rating' }
  | { kind: 'ownerGate' }
  | { kind: 'preview'; initialView: PreviewView }
  | null;

/**
 * Narrow icon rail. Templates opens the big library window; generators keep
 * their own existing panel (templates and generators are deliberately
 * separate). Elements merges shapes + stickers + icons + patterns + borders
 * + dividers into one panel.
 */
// The left rail is for CREATION tools. Settings is configuration, not a tool,
// so it lives in the ⋯ (More) menu in the top bar instead of the rail.
const RAIL: { id: 'templates' | Exclude<Tool, null>; label: string; icon: IconName }[] = [
  { id: 'templates', label: 'Templates', icon: 'layoutTemplate' },
  { id: 'generators', label: 'Generators', icon: 'puzzlePiece' },
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'elements', label: 'Elements', icon: 'sparkles' },
  { id: 'uploads', label: 'Uploads', icon: 'imagePlus' },
];

const TEMPLATES_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

const TOOL_PANEL: Partial<Record<Exclude<Tool, null>, () => ReactElement>> = {
  text: () => <TextPanel />,
  uploads: () => <UploadPanel />,
  elements: () => <ElementsPanel />,
  generators: () => <GeneratorHubPanel />,
  settings: () => <SettingsPanel />,
  history: () => (
    <div className="panel">
      <div className="panel-head">
        <span>History</span>
        <span className="badge">timeline</span>
        <ClosePanelButton />
      </div>
      <HistoryPanel />
    </div>
  ),
};

function ActivePanel({
  inspector,
  tool,
  onCloseInspector,
}: {
  inspector: InspectorView | null;
  tool: Tool;
  onCloseInspector: () => void;
}) {
  if (inspector) return <InspectorPanel view={inspector} onClose={onCloseInspector} />;
  if (!tool) return <div style={{ width: 0 }} />;

  const Panel = TOOL_PANEL[tool];
  return Panel ? <Panel /> : <div style={{ width: 0 }} />;
}

export default function App() {
  const [tool, setTool] = useState<Tool>(null);
  const [modal, setModal] = useState<AppModal>(null);
  const openModal = (next: Exclude<AppModal, null>) => setModal(next);
  const closeModal = () => setModal(null);
  const themeChoice = useThemeStore((s) => s.choice);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [moreOpen, setMoreOpen] = useState(false);
  const [view, setView] = useState<AppView>('home');
  const [helpOpen, setHelpOpen] = useState(false);
  const [inspector, setInspector] = useState<InspectorView | null>(null);
  const rightDock = useEditorUiStore((s) => s.rightDock);
  const pendingTemplate = useRef<string | null>(null);
  const pendingTool = useRef<Tool>(null);
  /** True while a New Book setup is open that should land on a generator once
   *  the book is actually created (not if the user cancels). */
  const pendingGeneratorAfterBook = useRef(false);
  const projectId = useRef<string>(crypto.randomUUID());

  const {
    projectName,
    setProjectName,
    past,
    future,
    undo,
    redo,
    serialize,
    loadProject,
    newProject,
    setProjectName: renameProject,
    pages,
    book,
    syncCover,
  } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const font = useTextStyleStore((s) => s.fontFamily);

  useShortcuts(() => openModal({ kind: 'export' }));

  // Close the current side panel (Settings, Text, Elements, Uploads, etc.)
  // from the × button in any panel, or with Escape.
  useEffect(() => {
    const closeTool = () => {
      setInspector(null);
      setTool(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        closeTool();
      }
    };
    window.addEventListener('novelka:close-tool', closeTool);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('novelka:close-tool', closeTool);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Load the flag table and this browser's entitlement once, at boot.
  const initFlags = useFlagStore((s2) => s2.init);
  const initAuth = useAuthStore((s2) => s2.init);
  useEffect(() => {
    // Flags first: auth pushes the account's tier into the entitlement, so the
    // flag table has to exist before that happens.
    void initFlags().then(() => initAuth());
  }, [initFlags, initAuth]);

  const authReady = useAuthStore((s2) => s2.ready);
  const authUser = useAuthStore((s2) => s2.session?.user ?? null);
  const isOwner = useAuthStore((s2) => s2.isOwner);

  const requireEditorAuth = async (action: () => void | Promise<void>) => {
    if (isSupabaseConfigured() && !authReady) return;

    if (isSupabaseConfigured() && !authUser) {
      openModal({ kind: 'auth' });
      return;
    }

    await action();
  };

  // No button reveals the control panel. It answers only to the hidden unlock
  // (key sequence, bookmark hash, or console call) and then to the passphrase.
  useEffect(() => {
    if (!ADMIN_BUILT_IN) return;
    return watchForUnlock(() => {
      // An unclaimed install must go to setup, not straight into the panel —
      // otherwise the very first person to find the sequence owns it. After
      // that, entry needs either an unlocked session (recovery code) or a
      // signed-in owner account.
      const claimed = !!useAuthStore.getState().owner?.configured;
      if (claimed && (isUnlocked() || isOwner())) {
        if (!isUnlocked()) markUnlocked();
        openModal({ kind: 'admin' });
      } else {
        openModal({ kind: 'ownerGate' });
      }
    });
  }, [isOwner]);

  useEffect(() => {
    preloadDefaultFonts();
  }, []);

  // The cover ADAPTS: whenever the interior page count (or book settings)
  // changes, recompute the flat-cover geometry via calculateCover and resize
  // ONLY the cover. Interiors are never touched by this. Debounced so bulk
  // page operations settle first; a no-op when nothing changed.
  const interiorCount = pages.filter((p) => p.role !== 'cover').length;
  const hasCover = pages.some((p) => p.role === 'cover');
  useEffect(() => {
    if (view !== 'editor' || !hasCover) return;
    const t = setTimeout(() => {
      void syncCover();
    }, 350);
    return () => clearTimeout(t);
  }, [view, interiorCount, hasCover, book, syncCover]);

  useEffect(() => {
    const onOpenTool = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail === 'generators') {
        setInspector(null);
        setTool('generators');
        setView('editor');
      } else if (detail === 'templates') {
        // Templates live in the big library window now, not a side panel.
        setInspector(null);
        setView('editor');
        setModal({ kind: 'templateLibrary' });
      }
    };
    window.addEventListener('novelka:open-tool', onOpenTool);
    return () => window.removeEventListener('novelka:open-tool', onOpenTool);
  }, []);

  // ------------------------------------------------------------- autosave
  // A failed autosave used to be swallowed, so a user could build a whole book,
  // refresh, and find it gone. Warn once instead of pretending it worked.
  const autosaveWarned = useRef(false);
  useEffect(() => {
    const t = setInterval(async () => {
      if (!engine.canvas) return;
      const ok = await storage.autosave(serialize());
      if (ok) {
        autosaveWarned.current = false;
      } else if (!autosaveWarned.current) {
        autosaveWarned.current = true;
        setStatus(
          'error',
          'Autosave failed — this browser is out of space. Use Export or Save a copy now.',
        );
      }
    }, 12000);
    return () => clearInterval(t);
  }, [serialize, setStatus]);

  // -------------------------------------------------- offer autosave restore
  useEffect(() => {
    if (view !== 'editor') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const saved = await storage.readAutosave();
      if (cancelled || !saved) return;
      const age = Date.now() - saved.at;
      if (age > 1000 * 60 * 60 * 24 * 14) return;
      const hasContent = saved.file.pages.some((p) => {
        const d = p.data as { objects?: unknown[] } | null;
        return !!d?.objects?.length;
      });
      if (!hasContent) return;
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (window.confirm('Restore your unsaved work from the last session?')) {
          await loadProject(saved.file);
        } else {
          await storage.clearAutosave();
        }
      }, 800);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // A home-screen module card asks for a specific tool panel; open it once the
  // editor has mounted so the user lands directly on the generator.
  useEffect(() => {
    if (view !== 'editor' || !pendingTool.current) return;
    const t = pendingTool.current;
    pendingTool.current = null;
    const id = setTimeout(() => setTool(t), 260);
    return () => clearTimeout(id);
  }, [view]);

  useEffect(() => {
    if (view !== 'editor' || !pendingTemplate.current) return;
    const id = pendingTemplate.current;
    pendingTemplate.current = null;
    const t = setTimeout(async () => {
      const tpl = TEMPLATES_BY_ID[id];
      if (!tpl) return;
      try {
        setStatus('busy', `Applying ${tpl.name}…`);
        await applyTemplate(tpl, font, true);
        setStatus('success', `${tpl.name} applied`);
      } catch {
        setStatus('error', 'Template failed to apply');
      }
    }, 420);
    return () => clearTimeout(t);
  }, [view, font, setStatus]);

  const toggleInspector = (next: InspectorView) => {
    setInspector((current) => {
      if (!current) return next;
      if (current.kind !== next.kind) return next;
      if (current.kind === 'color' && next.kind === 'color' && current.target !== next.target) return next;
      return null;
    });
  };

  const openStored = async (p: StoredProject) => {
    await loadProject(p.file);
    projectId.current = p.id;
    setInspector(null);
    setView('editor');
  };

  const modalLayer = (
    <>
      {modal?.kind === 'export' && (
        <Suspense fallback={null}>
          <ExportModal
            onClose={closeModal}
            onExported={() => {
              if (shouldPromptRating()) {
                markRatingPrompted();
                openModal({ kind: 'rating' });
              }
            }}
          />
        </Suspense>
      )}
      {modal?.kind === 'importPdf' && <ImportPdfModal onClose={closeModal} />}
      {modal?.kind === 'pageNumbers' && <PageNumbersModal onClose={closeModal} />}
      {modal?.kind === 'addPages' && <AddPagesModal onClose={closeModal} />}
      {modal?.kind === 'coverWizard' && <CoverWizard onClose={closeModal} />}
      {modal?.kind === 'templateLibrary' && (
        <TemplateLibraryModal
          onClose={closeModal}
          onOpenCover={() => openModal({ kind: 'coverWizard' })}
        />
      )}
      {modal?.kind === 'newBook' && (
        <NewBookModal
          initialName={modal.initialName}
          onClose={() => {
            // Cancelled — do not land on a generator later.
            pendingGeneratorAfterBook.current = false;
            closeModal();
          }}
          onCreated={() => {
            if (pendingGeneratorAfterBook.current) {
              pendingGeneratorAfterBook.current = false;
              pendingTool.current = 'generators';
            }
            closeModal();
            projectId.current = crypto.randomUUID();
            setInspector(null);
            setView('editor');
          }}
        />
      )}
      {modal?.kind === 'quickWordSearch' && (
        <QuickWordSearchWizard
          initialTemplateId={modal.initialTemplateId}
          onClose={closeModal}
          onOpenEditor={() => {
            closeModal();
            setView('editor');
          }}
          onExportBook={() => openModal({ kind: 'export' })}
          onOpenPreview={(v) => openModal({ kind: 'preview', initialView: v ?? 'spread' })}
        />
      )}
      {modal?.kind === 'admin' && ADMIN_BUILT_IN && (
        <Suspense fallback={null}>
          <AdminPanel
            onClose={() => {
              closeModal();
              lockAdminAccess();
            }}
          />
        </Suspense>
      )}
      {modal?.kind === 'auth' && <AuthModal onClose={closeModal} />}
      {modal?.kind === 'rating' && <RatingModal onClose={closeModal} />}
      {modal?.kind === 'ownerGate' && ADMIN_BUILT_IN && (
        <Suspense fallback={null}>
          <OwnerGate
            onClose={() => {
              closeModal();
              // `isUnlocked()` is the authority here. The gate only sets it after
              // the owner has claimed ownership or entered the recovery code, so
              // it already proves the passphrase step passed. Re-checking
              // `isOwner()` would wrongly refuse the owner who has just claimed
              // but is not signed in to an account yet.
              if (isUnlocked()) openModal({ kind: 'admin' });
            }}
          />
        </Suspense>
      )}
      {modal?.kind === 'preview' && (
        <Suspense fallback={null}>
          <PreviewMode
            initialView={modal.initialView}
            onClose={closeModal}
            onOpenExport={() => openModal({ kind: 'export' })}
          />
        </Suspense>
      )}
      {modal?.kind === 'projects' && (
        <ProjectsModal
          onClose={closeModal}
          projectId={projectId.current}
          setProjectId={(id) => (projectId.current = id)}
        />
      )}
    </>
  );

  if (view !== 'editor') {
    return (
      <div className="app-customer-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
        <CustomerNav
          activeTab={view}
          onSelectTab={(tab) => setView(tab)}
          onOpenEditor={() => void requireEditorAuth(() => setView('editor'))}
          onOpenHelp={() => setHelpOpen(true)}
        />

        {view === 'home' && (
          <HomeScreen
            onOpenQuickWordSearch={() => openModal({ kind: 'quickWordSearch' })}
            onOpenProject={(p) => void requireEditorAuth(() => openStored(p))}
            onExportProject={(p) => void requireEditorAuth(async () => {
              await loadProject(p.file);
              projectId.current = p.id;
              openModal({ kind: 'export' });
            })}
            onGoToTab={(tab) => setView(tab)}
            onUseTemplate={(id) => openModal({ kind: 'quickWordSearch', initialTemplateId: id })}
            onOpenModuleInEditor={(_moduleId) => {
              // A generator needs a BOOK to fill. Ask for the full setup first
              // (size, cover, paper, page count) so the generated pages match
              // the chosen trim — never silently start a hardcoded size.
              void requireEditorAuth(() => {
                pendingGeneratorAfterBook.current = true;
                openModal({ kind: 'newBook' });
              });
            }}
            onOpenEditor={() => void requireEditorAuth(() => setView('editor'))}
          />
        )}

        {view === 'create' && (
          <CreateView
            onOpenQuickWordSearch={() => openModal({ kind: 'quickWordSearch' })}
            onOpenModuleInEditor={(_moduleId) => {
              // Same as home: a generator needs a properly-sized book, so open
              // the New Book setup (size/cover/paper/pages) and open the
              // generator once the book is created.
              void requireEditorAuth(() => {
                pendingGeneratorAfterBook.current = true;
                openModal({ kind: 'newBook' });
              });
            }}
            onNewDocument={(_size, name) => {
              // New books go through the setup window first — never straight
              // into an empty canvas.
              void requireEditorAuth(() => openModal({ kind: 'newBook', initialName: name }));
            }}
            onCreateCover={() => {
              void requireEditorAuth(async () => {
                await newProject();
                renameProject('Book cover');
                projectId.current = crypto.randomUUID();
                setView('editor');
                setTimeout(() => openModal({ kind: 'coverWizard' }), 340);
              });
            }}
            onImportPdf={() => {
              void requireEditorAuth(() => {
                setView('editor');
                setTimeout(() => openModal({ kind: 'importPdf' }), 320);
              });
            }}
          />
        )}

        {view === 'projects' && (
          <ProjectsView
            onOpenProject={(p) => void requireEditorAuth(() => openStored(p))}
            onPreviewProject={(p) => void requireEditorAuth(async () => {
              await loadProject(p.file);
              projectId.current = p.id;
              openModal({ kind: 'preview', initialView: 'spread' });
            })}
            onExportProject={(p) => void requireEditorAuth(async () => {
              await loadProject(p.file);
              projectId.current = p.id;
              openModal({ kind: 'export' });
            })}
            onOpenQuickWordSearch={() => openModal({ kind: 'quickWordSearch' })}
          />
        )}

        {view === 'templates' && (
          <TemplatesView
            onUseTemplate={(id) => openModal({ kind: 'quickWordSearch', initialTemplateId: id })}
            onOpenQuickWordSearch={() => openModal({ kind: 'quickWordSearch' })}
          />
        )}

        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        {modalLayer}
      </div>
    );
  }

  const panelOpen = inspector !== null || tool !== null;
  const panelW = 312;
  const stripLeft = 66 + (panelOpen ? panelW : 0);
  const stripRight = rightDock ? panelW : 0;

  return (
    <div
      className="app"
      style={{ ['--strip-left' as string]: `${stripLeft}px`, ['--strip-right' as string]: `${stripRight}px` }}
    >
      {/* -------------------------------------------------------- top bar */}
      <div className="topbar">
        <button
          className="brand"
          onClick={() => {
            setInspector(null);
            setView('home');
            // Finished working? If they have not rated yet, ask once on the
            // way out — never after they already voted.
            if (shouldPromptRating()) {
              markRatingPrompted();
              openModal({ kind: 'rating' });
            }
          }}
          title="Back to home" aria-label="Back to home"
          style={{ cursor: 'pointer' }}
        >
          <span className="brand-mark">N</span>
          <span>Novelka</span>
        </button>
        <input
          className="project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          title="Project name" aria-label="Project name"
        />
        <div className="divider" />
        <button className="btn icon" title="Undo (Ctrl+Z)" aria-label="Undo (Ctrl+Z)" disabled={past.length < 2} onClick={undo}>
          <Icon name="undo" />
        </button>
        <button className="btn icon" title="Redo (Ctrl+Y)" aria-label="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}>
          <Icon name="redo" />
        </button>

        <div className="spacer" />

        <button
          className="btn"
          onClick={() => {
            openModal({ kind: 'preview', initialView: 'spread' });
          }}
          title="Full-screen book preview"
          aria-label="Full-screen book preview"
        >
          <Icon name="eye" size={14} /> Preview
        </button>

        <div className="topbar-more">
          <button
            className={`btn icon ${moreOpen ? 'active' : ''}`}
            onClick={() => setMoreOpen((v) => !v)}
            title="More actions" aria-label="More actions" aria-expanded={moreOpen}
          >
            <Icon name="moreHorizontal" size={15} />
          </button>
          {moreOpen && (
            <>
              <div className="topbar-more-backdrop" onClick={() => setMoreOpen(false)} />
              <div className="topbar-more-menu" role="menu">
                <button role="menuitem" onClick={() => { setMoreOpen(false); setInspector(null); setTool('settings'); }}>
                  <Icon name="settings" size={14} /> Settings
                </button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); toggleTheme(); }}>
                  <Icon name={themeChoice === 'light' ? 'sun' : 'moon'} size={14} /> Theme: {themeChoice === 'light' ? 'Light' : 'Dark'}
                </button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); setHelpOpen(true); }}>
                  <Icon name="keyboard" size={14} /> Keyboard shortcuts
                </button>
                <div className="topbar-more-sep" />
                <button role="menuitem" onClick={() => { setMoreOpen(false); void (async () => {
                  try {
                    await storage.save(projectId.current, serialize());
                    setStatus('success', 'Saved locally');
                  } catch (e) {
                    setStatus(
                      'error',
                      e instanceof StorageFullError
                        ? 'Not enough space to save — export the book or delete an old project.'
                        : 'Save failed. Export a copy so you do not lose this work.',
                    );
                  }
                })(); }}>
                  <Icon name="save" size={14} /> Save
                </button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); openModal({ kind: 'projects' }); }}>
                  <Icon name="folder" size={14} /> Projects
                </button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); openModal({ kind: 'importPdf' }); }}>
                  <Icon name="upload" size={14} /> Import PDF
                </button>
                <div className="topbar-more-sep" />
                <button role="menuitem" onClick={() => { setMoreOpen(false); openModal({ kind: 'coverWizard' }); }}>
                  <Icon name="book" size={14} /> KDP cover creator
                </button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); openModal({ kind: 'pageNumbers' }); }}>
                  <Icon name="bookOpen" size={14} /> Page numbers
                </button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); setInspector(null); setTool('history'); }}>
                  <Icon name="history" size={14} /> History
                </button>
                <div className="topbar-more-sep" />
                <button role="menuitem" onClick={() => { setMoreOpen(false); markRatingPrompted(); openModal({ kind: 'rating' }); }}>
                  <Icon name="star" size={14} /> Rate Novelka
                </button>
              </div>
            </>
          )}
        </div>

        <button
          className="btn"
          onClick={() => openModal({ kind: 'auth' })}
          title={authUser ? `Signed in as ${authUser.email} — click for account` : 'Sign in'}
        >
          <Icon name="user" size={14} />{' '}
          {authUser ? authUser.displayName : 'Sign in'}
        </button>
        <button className="btn primary" onClick={() => openModal({ kind: 'export' })}>
          <Icon name="download" size={14} /> Export
        </button>
      </div>

      {/* ---------------------------------------------------------- body */}
      <div className="body-row">
        <nav className={`rail ${panelOpen ? 'panel-open' : ''}`} aria-label="Tools">
          {RAIL.map((r) => (
            <button
              key={r.id}
              className={`rail-btn ${r.id !== 'templates' && tool === r.id && !inspector ? 'active' : ''}`}
              onClick={() => {
                if (r.id === 'templates') {
                  setInspector(null);
                  openModal({ kind: 'templateLibrary' });
                  return;
                }
                setInspector(null);
                setTool(tool === r.id ? null : r.id);
              }}
              title={r.label}
              aria-label={r.label}
              aria-pressed={r.id !== 'templates' && tool === r.id && !inspector}
            >
              <Icon name={r.icon} size={19} />
            </button>
          ))}
          <div style={{ flex: 1 }} />
        </nav>

        <ActivePanel
          inspector={inspector}
          tool={tool}
          onCloseInspector={() => setInspector(null)}
        />

        <CanvasStage
          overlay={<FloatingCanvasBar onToggleInspector={toggleInspector} />}
          onOpenInspector={toggleInspector}
        />

        {/* Right dock: Pages / Layers / KDP Check with edge toggle tabs. */}
        <RightDock onBulkAdd={() => openModal({ kind: 'addPages' })} />
      </div>

      <EditorFooter />

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {modalLayer}
    </div>
  );
}

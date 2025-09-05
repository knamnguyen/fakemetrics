import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildUniqueSelector } from "../../lib/selector";
import {
  clearEdits,
  deleteEdit,
  loadEdits,
  saveEdit,
  type FakemetricsEdit,
  getPageKey,
} from "../../lib/storage";

type EditOverlayProps = {
  readonly target: Element | null;
  readonly initialText: string;
  readonly onSave: (newText: string) => void;
  readonly onCancel: () => void;
};

const EditOverlay: React.FC<EditOverlayProps> = ({
  target,
  initialText,
  onSave,
  onCancel,
}) => {
  const [value, setValue] = useState<string>(initialText);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const position = useMemo(() => {
    if (!target) return { top: 10, left: 10 };
    const rect = (target as Element).getBoundingClientRect();
    const padding = 8;
    let top = Math.max(10, rect.top + window.scrollY - 10);
    let left = Math.max(10, rect.left + window.scrollX + rect.width + padding);
    const maxLeft = window.scrollX + window.innerWidth - 260;
    const maxTop = window.scrollY + window.innerHeight - 140;
    left = Math.min(left, maxLeft);
    top = Math.min(top, maxTop);
    return { top, left };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(value);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel, onSave, value]);

  return createPortal(
    <div
      className="fakemetrics-overlay"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      onClick={(e) => e.stopPropagation()}
      ref={panelRef}
    >
      <textarea
        className="fakemetrics-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="fakemetrics-actions">
        <button className="fakemetrics-btn" onClick={() => onSave(value)}>
          Save
        </button>
        <button className="fakemetrics-btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
};

export const createEditController = () => {
  let isEnabled = false;
  let currentTarget: Element | null = null;
  let pageKey = getPageKey(location.href);
  let overlayUnmount: (() => void) | null = null;
  let overlayContainer: HTMLDivElement | null = null;
  let maskInjected = false;
  let maskStyleEl: HTMLStyleElement | null = null;

  const writeMask = (selectors: string[]) => {
    if (!maskStyleEl) return;
    if (!selectors.length) {
      maskStyleEl.parentNode?.removeChild(maskStyleEl);
      maskStyleEl = null;
      maskInjected = false;
      return;
    }
    const css = selectors
      .map((s) => `${s}, ${s} * { color: transparent !important; }`)
      .join("\n");
    maskStyleEl.textContent = css;
  };

  const applyEdits = async (): Promise<{
    applied: number;
    skipped: number;
  }> => {
    const edits = await loadEdits(pageKey);
    if (!edits.length) return { applied: 0, skipped: 0 };
    let applied = 0;
    let skipped = 0;
    const presentSelectors = new Set<string>();
    for (const e of edits) {
      try {
        const el = document.querySelector(e.selector);
        if (el) {
          if (el.textContent !== e.text) {
            el.textContent = e.text;
          }
          if (el instanceof HTMLElement) {
            el.style.setProperty("color", "inherit", "important");
          }
          applied++;
          presentSelectors.add(e.selector);
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }
    try {
      const remaining = edits
        .map((e) => e.selector)
        .filter((s) => !presentSelectors.has(s));
      writeMask(remaining);
    } catch {}
    return { applied, skipped };
  };

  const ensurePersistentMask = async () => {
    if (maskInjected) return;
    const STYLE_ID = "fakemetrics-mask-style";
    const existing = document.getElementById(
      STYLE_ID
    ) as HTMLStyleElement | null;
    if (existing) {
      maskStyleEl = existing;
      maskInjected = true;
      return;
    }
    const edits = await loadEdits(pageKey);
    const selectors = edits.map((e) => e.selector).filter(Boolean);
    if (!selectors.length) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
    maskStyleEl = style;
    writeMask(selectors);
    maskInjected = true;
  };

  const onDocumentMouseDown = (ev: MouseEvent) => {
    if (!overlayContainer) return;
    const el = ev.target as Element | null;
    if (!el) return;
    if (!el.closest(".fakemetrics-overlay")) {
      // click outside overlay closes it
      overlayUnmount?.();
      overlayUnmount = null;
      overlayContainer?.remove();
      overlayContainer = null;
      currentTarget = null;
    }
  };

  const onClick = async (ev: MouseEvent) => {
    if (!isEnabled) return;
    const target = ev.target as Element | null;
    if (!target) return;
    const isOurOverlay = (target as Element).closest(".fakemetrics-overlay");
    if (isOurOverlay) return;
    ev.preventDefault();
    ev.stopPropagation();
    currentTarget = target;
    const initialText = (target.textContent ?? "").trim();
    if (overlayContainer) {
      // prevent duplicate overlays
      return;
    }
    const container = document.createElement("div");
    overlayContainer = container;
    document.body.appendChild(container);

    const onCancel = () => {
      overlayUnmount?.();
      overlayUnmount = null;
      container.remove();
      overlayContainer = null;
      currentTarget = null;
    };

    const onSave = async (newText: string) => {
      try {
        const selector = buildUniqueSelector(target);
        await saveEdit({ pageKey, selector, text: newText });
        const el = document.querySelector(selector);
        if (el) el.textContent = newText;
      } finally {
        onCancel();
      }
    };

    const node = (
      <EditOverlay
        target={target}
        initialText={initialText}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(container);
    root.render(node);
    overlayUnmount = () => root.unmount();
    document.addEventListener("mousedown", onDocumentMouseDown, true);
  };

  const observer = new MutationObserver(() => {
    throttledApply();
  });

  let throttledTimer: number | null = null;
  const throttledApply = () => {
    if (throttledTimer !== null) return;
    throttledTimer = window.setTimeout(async () => {
      throttledTimer = null;
      await applyEdits();
    }, 150);
  };

  const enable = () => {
    if (isEnabled) return;
    isEnabled = true;
    document.addEventListener("click", onClick, true);
  };

  const disable = () => {
    if (!isEnabled) return;
    isEnabled = false;
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("mousedown", onDocumentMouseDown, true);
  };

  const startObserve = async () => {
    const edits = await loadEdits(pageKey);
    if (!edits.length) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  const stopObserve = () => observer.disconnect();

  const handleReapply = async () => {
    await applyEdits();
  };

  const getState = () => ({ enabled: isEnabled });

  const init = async () => {
    try {
      await ensurePersistentMask();
      await applyEdits();
    } finally {
      try {
        document.documentElement.classList.add("fm-unhide");
      } catch {}
    }
    await startObserve();
  };

  return {
    enable,
    disable,
    init,
    handleReapply,
    getState,
    applyEdits,
    startObserve,
    stopObserve,
  };
};

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPageKey,
  loadEdits,
  clearEdits,
  deleteEdit,
  type FakemetricsEdit,
} from "../../lib/storage";

type TabInfo = { id: number; url: string } | null;

const queryActiveTab = async (): Promise<TabInfo> => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const t = tabs[0];
  if (!t || !t.id || !t.url) return null;
  return { id: t.id, url: t.url };
};

export default function Popup() {
  const [tab, setTab] = useState<TabInfo>(null);
  const [pageKey, setPageKey] = useState<string>("");
  const [edits, setEdits] = useState<FakemetricsEdit[]>([]);
  const [enabled, setEnabled] = useState<boolean>(false);

  const refresh = useCallback(async (key: string) => {
    const list = await loadEdits(key);
    setEdits(list);
  }, []);

  useEffect(() => {
    (async () => {
      const t = await queryActiveTab();
      setTab(t);
      const key = t?.url ? getPageKey(t.url) : "";
      setPageKey(key);
      if (key) await refresh(key);
      if (t?.id) {
        try {
          const resp = await chrome.tabs.sendMessage(t.id, {
            type: "FAKEMETRICS_GET_STATE",
          });
          if (resp && typeof resp.enabled === "boolean")
            setEnabled(resp.enabled);
        } catch {
          // content may not be ready; ignore
        }
      }
    })();
  }, [refresh]);

  const toggle = async () => {
    if (!tab?.id) return;
    const next = !enabled;
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: "FAKEMETRICS_TOGGLE",
      enable: next,
    });
    if (resp && typeof resp.enabled === "boolean") setEnabled(resp.enabled);
  };

  const handleDelete = async (selector: string) => {
    if (!pageKey || !tab?.id) return;
    await deleteEdit({ pageKey, selector });
    await refresh(pageKey);
    await chrome.tabs.sendMessage(tab.id, { type: "FAKEMETRICS_REAPPLY" });
  };

  const handleClear = async () => {
    if (!pageKey || !tab?.id) return;
    await clearEdits(pageKey);
    await refresh(pageKey);
    await chrome.tabs.sendMessage(tab.id, { type: "FAKEMETRICS_REAPPLY" });
  };

  const urlDisplay = useMemo(() => tab?.url ?? "", [tab]);

  return (
    <div className="p-3 bg-gray-900 text-white min-w-96">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Fakemetrics</div>
        <button
          onClick={toggle}
          className={`px-3 py-1 rounded ${
            enabled ? "bg-green-600" : "bg-gray-700"
          }`}
        >
          {enabled ? "Edit mode: ON" : "Edit mode: OFF"}
        </button>
      </div>
      <div className="text-xs text-gray-400 mt-1 truncate">{urlDisplay}</div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm">Edits on this page</div>
        <button
          className="text-xs text-red-300 hover:text-red-200"
          onClick={handleClear}
        >
          Clear all
        </button>
      </div>
      <div className="mt-2 max-h-64 overflow-auto">
        {edits.length === 0 ? (
          <div className="text-gray-400 text-sm">No edits yet.</div>
        ) : (
          <ul className="space-y-2">
            {edits
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((e) => (
                <li key={e.selector} className="bg-gray-800 rounded p-2">
                  <div className="text-xs text-gray-300 break-all">
                    {e.selector}
                  </div>
                  <div className="text-sm mt-1 line-clamp-3 break-all">
                    {e.text}
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      className="text-xs text-red-300 hover:text-red-200"
                      onClick={() => handleDelete(e.selector)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

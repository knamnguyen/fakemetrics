export type FakemetricsEdit = {
  readonly selector: string;
  readonly text: string;
  readonly timestamp: number;
};

export const getPageKey = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
};

const readKey = async (pageKey: string): Promise<FakemetricsEdit[]> => {
  if (!pageKey) return [];
  const res = await chrome.storage.local.get(pageKey);
  const value = res[pageKey] as FakemetricsEdit[] | undefined;
  if (!Array.isArray(value)) return [];
  return value;
};

const writeKey = async (
  pageKey: string,
  edits: FakemetricsEdit[]
): Promise<void> => {
  await chrome.storage.local.set({ [pageKey]: edits });
};

export const loadEdits = async (
  pageKey: string
): Promise<FakemetricsEdit[]> => {
  return readKey(pageKey);
};

export const saveEdit = async (args: {
  pageKey: string;
  selector: string;
  text: string;
}): Promise<void> => {
  const { pageKey, selector, text } = args;
  const existing = await readKey(pageKey);
  const now = Date.now();
  const filtered = existing.filter((e) => e.selector !== selector);
  filtered.push({ selector, text, timestamp: now });
  await writeKey(pageKey, filtered);
};

export const deleteEdit = async (args: {
  pageKey: string;
  selector: string;
}): Promise<void> => {
  const { pageKey, selector } = args;
  const existing = await readKey(pageKey);
  const next = existing.filter((e) => e.selector !== selector);
  await writeKey(pageKey, next);
};

export const clearEdits = async (pageKey: string): Promise<void> => {
  await writeKey(pageKey, []);
};

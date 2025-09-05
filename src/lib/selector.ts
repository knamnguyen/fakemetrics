const getStableAttributeSelector = (el: Element): string | null => {
  const attrNames = Array.from(el.getAttributeNames());
  for (const name of attrNames) {
    if (name === "id") continue;
    if (name.startsWith("data-") || name.startsWith("aria-")) {
      const val = el.getAttribute(name);
      if (val && val.length <= 100) {
        return `[${CSS.escape(name)}="${CSS.escape(val)}"]`;
      }
    }
  }
  return null;
};

const buildSegment = (el: Element): string => {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute("id");
  if (id) return `#${CSS.escape(id)}`;
  const stable = getStableAttributeSelector(el);
  if (stable) return `${tag}${stable}`;
  const classList = Array.from(el.classList)
    .filter((cls) => /[a-zA-Z0-9_-]/.test(cls))
    .slice(0, 2);
  let base =
    tag +
    (classList.length
      ? "." + classList.map((c) => CSS.escape(c)).join(".")
      : "");
  const parent = el.parentElement;
  if (!parent) return base;
  const siblings = Array.from(parent.children).filter(
    (ch) => ch.tagName === el.tagName
  );
  if (siblings.length > 1) {
    const index = siblings.indexOf(el) + 1;
    base += `:nth-of-type(${index})`;
  }
  return base;
};

export const buildUniqueSelector = (target: Element): string => {
  if (target.id) return `#${CSS.escape(target.id)}`;
  const stable = getStableAttributeSelector(target);
  if (stable) return `${target.tagName.toLowerCase()}${stable}`;
  const segments: string[] = [];
  let el: Element | null = target;
  let depth = 0;
  const MAX_DEPTH = 5;
  const MAX_LENGTH = 512;
  while (el && el !== document.body && depth < MAX_DEPTH) {
    segments.unshift(buildSegment(el));
    const selector = segments.join(" > ");
    try {
      if (document.querySelectorAll(selector).length === 1) return selector;
    } catch {
      // continue
    }
    if (selector.length > MAX_LENGTH) break;
    depth++;
    el = el.parentElement;
  }
  const fallback = segments.join(" > ") || target.tagName.toLowerCase();
  return fallback;
};

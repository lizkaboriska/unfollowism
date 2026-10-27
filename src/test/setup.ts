import "@testing-library/jest-dom/vitest";

// jsdom has no layout. The dropdowns only need these to exist: ResizeObserver for positioning,
// element scrolling to keep the highlighted option in view. Node-only test files have no DOM at all.
if (typeof window !== "undefined") {
  if (!("ResizeObserver" in window)) {
    Object.defineProperty(window, "ResizeObserver", {
      value: class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    });
  }
  for (const method of ["scrollTo", "scrollIntoView"] as const) {
    if (!(method in Element.prototype)) Object.defineProperty(Element.prototype, method, { value: () => undefined });
  }
}

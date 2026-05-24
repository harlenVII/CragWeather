import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

describe("ServiceWorkerRegistration", () => {
  let originalServiceWorker: typeof navigator.serviceWorker;

  beforeEach(() => {
    originalServiceWorker = navigator.serviceWorker;
  });

  afterEach(() => {
    // Restore navigator.serviceWorker to its original value after each test
    Object.defineProperty(navigator, "serviceWorker", {
      value: originalServiceWorker,
      configurable: true,
      writable: true,
    });
  });

  it("registers /sw.js when serviceWorker is supported", () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);

    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing when serviceWorker is not supported", () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });

    // Should not throw
    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
  });
});

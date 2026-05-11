import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

Object.defineProperty(global.URL, "createObjectURL", {
  writable: true,
  value: vi.fn(() => "blob:mock-preview-url")
});

Object.defineProperty(global.URL, "revokeObjectURL", {
  writable: true,
  value: vi.fn()
});

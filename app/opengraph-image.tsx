import { ImageResponse } from "next/og";
export const alt = "Receipt-to-Form: receipts in, expenses ready. Designed and built by Zulsyahmi Zulkefli.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "64px 72px", background: "#f4f6ff", color: "#0f172a", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 700 }}><span style={{ width: 18, height: 18, borderRadius: 4, background: "#2563eb" }} />Receipt-to-Form</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.1 }}>Receipts in. Expenses ready.</div>
        <div style={{ fontSize: 28, color: "#475569" }}>Extract. Correct. Export CSV or JSON.</div>
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#475569" }}>Designed &amp; built by Zulsyahmi Zulkefli</div>
    </div>, size
  );
}

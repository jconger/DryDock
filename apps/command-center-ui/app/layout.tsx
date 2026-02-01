import React from "react";

export const metadata = {
  title: "Command Center UI",
  description: "Local cockpit for PR comment orchestration"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", margin: 0 }}>
        <div style={{ padding: 16, borderBottom: "1px solid #ddd" }}>
          <strong>Command Center</strong> <span style={{ color: "#666" }}>— PR Comment Orchestrator</span>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </body>
    </html>
  );
}

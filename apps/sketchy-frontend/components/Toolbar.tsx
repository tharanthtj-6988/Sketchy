// apps/sketchy-frontend/components/Toolbar.tsx
import React from 'react';

export default function ToolBar() {
  return <div />; // small placeholder - main toolbar lives in page.tsx for now
}

export function ToolButton({ children, active, onClick, title }: { children: React.ReactNode, active?: boolean, onClick?: () => void, title?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        border: 'none',
        background: active ? '#e6f0ff' : 'transparent',
        padding: 6,
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      }}
    >
      <div style={{ width: 22, height: 22, color: '#111' }}>{children}</div>
    </button>
  );
}


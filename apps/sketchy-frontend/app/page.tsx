// apps/sketchy-frontend/app/page.tsx
'use client';

import React, { useEffect, useRef, useState } from "react";
import ToolBar, { ToolButton } from "../components/Toolbar";

type ShapeKind = 'rect' | 'ellipse' | 'diamond' | 'line' | 'free' | 'text' | 'image';

type Shape = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  points?: number[]; // for free strokes
  stroke?: string;
  fill?: string | null;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  imageDataUrl?: string;
  frame?: 'none' | 'circle' | 'ellipse' | 'square';
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const getDPR = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const shapesRef = useRef<Shape[]>([]);
  const [, setTick] = useState(0);

  const selectedIdRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const creatingRef = useRef<string | null>(null);
  const createStartRef = useRef<{ x: number; y: number } | null>(null);
  const resizingRef = useRef<{ id: string; corner: number } | null>(null);

  const currentFreeRef = useRef<Shape | null>(null);

  const [tool, setTool] = useState<'select' | 'free' | 'rect' | 'ellipse' | 'diamond' | 'line' | 'text' | 'image'>('select');
  const [color, setColor] = useState('#000000');
  const [fill, setFill] = useState<string | null>(null);
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [fontSize, setFontSize] = useState<number>(18);

  const wsRef = useRef<WebSocket | null>(null);
  const boardId = 'default';

  // init canvas size + websocket
  useEffect(() => {
    const canvas = canvasRef.current!;
    const DPR = getDPR();
    const W = Math.max(600, Math.min(1400, window.innerWidth - 40));
    const H = Math.max(400, Math.min(900, window.innerHeight - 160));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(DPR, DPR);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctxRef.current = ctx;

    // white board
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // websocket
    const url = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? 'ws://127.0.0.1:8081' : `ws://${window.location.hostname}:8081`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', boardId }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (!msg || !msg.type) return;
        if (msg.type === 'init' && Array.isArray(msg.state)) {
          // replay state into shapes array
          const arr: Shape[] = [];
          for (const e of msg.state) {
            if (e.type === 'shape' && e.payload) {
              const p = e.payload;
              if (p.action === 'add' && p.shape) arr.push(p.shape);
              if (p.action === 'clear') arr.length = 0;
              if (p.action === 'delete' && p.shape) {
                const idx = arr.findIndex(s => s.id === p.shape.id);
                if (idx >= 0) arr.splice(idx, 1);
              }
              if (p.action === 'update' && p.shape) {
                const idx = arr.findIndex(s => s.id === p.shape.id);
                if (idx >= 0) arr[idx] = p.shape;
              }
            }
          }
          shapesRef.current = arr;
          redraw();
        } else if (msg.type === 'shape' && msg.payload) {
          const p = msg.payload;
          if (p.action === 'add' && p.shape) {
            shapesRef.current.push(p.shape);
            redraw();
          } else if (p.action === 'update' && p.shape) {
            const i = shapesRef.current.findIndex(s => s.id === p.shape.id);
            if (i >= 0) shapesRef.current[i] = p.shape;
            redraw();
          } else if (p.action === 'delete' && p.shape) {
            shapesRef.current = shapesRef.current.filter(s => s.id !== p.shape.id);
            redraw();
          } else if (p.action === 'clear') {
            shapesRef.current = [];
            redraw();
          }
        }
      } catch (err) {
        console.warn('WS parse err', err);
      }
    };

    ws.onerror = (e) => console.warn('WS error', e);
    ws.onclose = () => console.log('WS closed');

    return () => {
      try { ws.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const DPR = getDPR();
    const cssW = canvas.width / DPR;
    const cssH = canvas.height / DPR;

    // paper background
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.restore();

    // draw shapes
    for (const s of shapesRef.current) drawShape(ctx, s);

    // draw selection
    const sel = selectedIdRef.current ? shapesRef.current.find(s => s.id === selectedIdRef.current) ?? null : null;
    if (sel) drawSelection(ctx, sel);

    setTick(t => t + 1);
  }

  function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.save();
    ctx.lineWidth = Number(s.strokeWidth ?? 2);
    ctx.strokeStyle = s.stroke ?? '#000';
    if (s.fill) ctx.fillStyle = s.fill;

    const x = Number(s.x ?? 0);
    const y = Number(s.y ?? 0);
    const w = Number(s.w ?? 0);
    const h = Number(s.h ?? 0);

    if (s.kind === 'rect' || s.kind === 'diamond') {
      if (s.kind === 'diamond') {
        const cx = x + w / 2, cy = y + h / 2;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(x, cy);
        ctx.closePath();
        if (s.fill) ctx.fill();
        ctx.stroke();
      } else {
        if (s.fill) ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    } else if (s.kind === 'ellipse') {
      const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
      const cx = x + w / 2, cy = y + h / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (s.fill) ctx.fill();
      ctx.stroke();
    } else if (s.kind === 'line') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
    } else if (s.kind === 'free') {
      const pts = s.points ?? [];
      if (pts.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(Number(pts[0]), Number(pts[1]));
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(Number(pts[i]), Number(pts[i + 1]));
        ctx.stroke();
      }
    } else if (s.kind === 'text') {
      ctx.fillStyle = s.fill ?? '#000';
      const fSize = Number(s.fontSize ?? 18);
      ctx.font = `${fSize}px sans-serif`;
      ctx.textBaseline = 'top';
      if (s.text) ctx.fillText(s.text, x, y);
    } else if (s.kind === 'image') {
      if (!s.imageDataUrl) { ctx.restore(); return; }
      const sx = x, sy = y, sw = w, sh = h;
      const img = new Image();
      img.src = s.imageDataUrl;
      img.onload = () => {
        ctx.save();
        if (s.frame === 'circle') {
          const cx = sx + sw / 2, cy = sy + sh / 2, r = Math.min(Math.abs(sw), Math.abs(sh)) / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
        } else if (s.frame === 'ellipse') {
          const rx = Math.abs(sw) / 2, ry = Math.abs(sh) / 2, cx = sx + sw / 2, cy = sy + sh / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
        } else if (s.frame === 'square') {
          ctx.beginPath();
          ctx.rect(sx, sy, sw, sh);
          ctx.closePath();
          ctx.clip();
        }
        ctx.drawImage(img, sx, sy, sw, sh);
        ctx.restore();
      };
    }

    ctx.restore();
  }

  function drawSelection(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.save();
    const x = Number(s.x ?? 0), y = Number(s.y ?? 0), w = Number(s.w ?? 0), h = Number(s.h ?? 0);
    ctx.strokeStyle = '#2b6ef6';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
    ctx.setLineDash([]);
    const hs = 10;
    const corners = [
      { x: x, y: y },
      { x: x + w, y: y },
      { x: x + w, y: y + h },
      { x: x, y: y + h },
    ];
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2b6ef6';
    for (const c of corners) {
      ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
      ctx.strokeRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
    }
    ctx.restore();
  }

  function hitTest(x: number, y: number): Shape | null {
    for (let i = shapesRef.current.length - 1; i >= 0; i--) {
      const s = shapesRef.current[i];
      if (!s) continue;
      const sx = Number(s.x ?? 0), sy = Number(s.y ?? 0), sw = Number(s.w ?? 0), sh = Number(s.h ?? 0);
      if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) return s;
    }
    return null;
  }

  function hitHandleIndex(shape: Shape, px: number, py: number): number {
    const hs = 10;
    const pts = [
      { x: Number(shape.x ?? 0), y: Number(shape.y ?? 0) },
      { x: Number(shape.x ?? 0) + Number(shape.w ?? 0), y: Number(shape.y ?? 0) },
      { x: Number(shape.x ?? 0) + Number(shape.w ?? 0), y: Number(shape.y ?? 0) + Number(shape.h ?? 0) },
      { x: Number(shape.x ?? 0), y: Number(shape.y ?? 0) + Number(shape.h ?? 0) },
    ];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      if (px >= p.x - hs / 2 && px <= p.x + hs / 2 && py >= p.y - hs / 2 && py <= p.y + hs / 2) return i;
    }
    return -1;
  }

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = getPos(e);
    lastPointerRef.current = { x, y };

    // freehand
    if (tool === 'free') {
      const sh: Shape = { id: makeId(), kind: 'free', x, y, w: 0, h: 0, points: [x, y], stroke: color, strokeWidth, fill: null };
      currentFreeRef.current = sh;
      shapesRef.current.push(sh);
      sendShapeAdd(sh);
      redraw();
      return;
    }

    // text
    if (tool === 'text') {
      const text = prompt('Enter text') ?? '';
      const computedW = (text.length * 10) || 20;
      const computedH = (fontSize ?? 18) + 4;
      const sh: Shape = { id: makeId(), kind: 'text', x, y, w: computedW, h: computedH, text, fill: color, fontSize, strokeWidth: 0 };
      shapesRef.current.push(sh);
      selectedIdRef.current = sh.id;
      sendShapeAdd(sh);
      redraw();
      return;
    }

    // image: force file input flow instead (tool mode 'image' uses file input)
    if (tool === 'image') {
      // instruct user to use file input in the toolbar (we don't auto-open file dialog here)
      return;
    }

    // shape creation
    if (['rect', 'ellipse', 'diamond', 'line'].includes(tool)) {
      const id = makeId();
      const sh: Shape = {
        id,
        kind: tool as ShapeKind,
        x, y, w: 0, h: 0,
        stroke: color,
        fill: fill ?? null,
        strokeWidth
      };
      shapesRef.current.push(sh);
      creatingRef.current = id;
      createStartRef.current = { x, y };
      selectedIdRef.current = id;
      draggingRef.current = true;
      sendShapeAdd(sh);
      redraw();
      return;
    }

    // select/hit
    const hit = hitTest(x, y);
    if (hit) {
      const corner = hitHandleIndex(hit, x, y);
      if (corner !== -1) {
        resizingRef.current = { id: hit.id, corner };
        selectedIdRef.current = hit.id;
        return;
      }
      selectedIdRef.current = hit.id;
      draggingRef.current = true;
      lastPointerRef.current = { x, y };
      setTick(t => t + 1);
    } else {
      selectedIdRef.current = null;
      setTick(t => t + 1);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = getPos(e);

    // freehand ongoing
    if (tool === 'free') {
      const cur = currentFreeRef.current;
      if (!cur) return;
      cur.points!.push(x, y);
      // update bbox
      const pts = cur.points!;
      const xs: number[] = [], ys: number[] = [];
      for (let i = 0; i < pts.length; i += 2) { xs.push(Number(pts[i])); ys.push(Number(pts[i + 1])); }
      const minx = Math.min(...xs), miny = Math.min(...ys), maxx = Math.max(...xs), maxy = Math.max(...ys);
      cur.x = minx; cur.y = miny; cur.w = maxx - minx; cur.h = maxy - miny;
      sendShapeUpdate(cur);
      redraw();
      return;
    }

    // creating shape with drag
    if (creatingRef.current) {
      const id = creatingRef.current;
      const shape = shapesRef.current.find(s => s.id === id);
      if (!shape) return;
      const start = createStartRef.current ?? { x: shape.x, y: shape.y };
      const newX = Math.min(start.x, x);
      const newY = Math.min(start.y, y);
      const newW = Math.abs(x - start.x);
      const newH = Math.abs(y - start.y);
      shape.x = newX; shape.y = newY; shape.w = newW; shape.h = newH;
      sendShapeUpdate(shape);
      redraw();
      return;
    }

    // resizing
    if (resizingRef.current) {
      const { id, corner } = resizingRef.current;
      const shape = shapesRef.current.find(s => s.id === id);
      if (!shape) return;
      const old = { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
      let x1 = Number(old.x), y1 = Number(old.y), x2 = Number(old.x) + Number(old.w), y2 = Number(old.y) + Number(old.h);
      if (corner === 0) { x1 = x; y1 = y; }
      if (corner === 1) { x2 = x; y1 = y; }
      if (corner === 2) { x2 = x; y2 = y; }
      if (corner === 3) { x1 = x; y2 = y; }
      const newX = Math.min(x1, x2), newY = Math.min(y1, y2);
      const newW = Math.abs(x2 - x1), newH = Math.abs(y2 - y1);
      shape.x = newX; shape.y = newY; shape.w = newW; shape.h = newH;
      sendShapeUpdate(shape);
      redraw();
      return;
    }

    // dragging selected
    if (draggingRef.current && selectedIdRef.current) {
      const sel = shapesRef.current.find(s => s.id === selectedIdRef.current);
      if (!sel) return;
      const last = lastPointerRef.current ?? { x, y };
      const dx = x - last.x, dy = y - last.y;
      sel.x += dx; sel.y += dy;
      lastPointerRef.current = { x, y };
      sendShapeUpdate(sel);
      redraw();
      return;
    }
  }

  function onPointerUp() {
    if (tool === 'free') {
      if (currentFreeRef.current) {
        sendShapeUpdate(currentFreeRef.current);
        currentFreeRef.current = null;
      }
      return;
    }

    if (creatingRef.current) {
      const id = creatingRef.current;
      const sh = shapesRef.current.find(s => s.id === id);
      if (sh) {
        if (Math.abs(Number(sh.w ?? 0)) < 4 && Math.abs(Number(sh.h ?? 0)) < 4) {
          shapesRef.current = shapesRef.current.filter(s => s.id !== id);
          sendShapeDelete(sh);
        } else {
          sendShapeUpdate(sh);
        }
      }
      creatingRef.current = null;
      createStartRef.current = null;
      draggingRef.current = false;
      return;
    }

    if (resizingRef.current) {
      resizingRef.current = null;
      draggingRef.current = false;
      return;
    }

    draggingRef.current = false;
    lastPointerRef.current = null;
  }

  function onDoubleClick(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = getPos(e);
    const hit = hitTest(p.x, p.y);
    if (hit && hit.kind === 'text') {
      const newText = prompt('Edit text', hit.text ?? '');
      if (newText !== null) {
        hit.text = newText;
        hit.w = Math.max(20, (newText.length * (hit.fontSize ?? 18)) * 0.6);
        sendShapeUpdate(hit);
        redraw();
      }
    }
  }

  // websocket helpers
  function sendShapeAdd(shape: Shape) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'shape', payload: { action: 'add', shape }, boardId }));
  }
  function sendShapeUpdate(shape: Shape) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'shape', payload: { action: 'update', shape }, boardId }));
  }
  function sendShapeDelete(shape: Shape) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'shape', payload: { action: 'delete', shape }, boardId }));
  }
  function sendClear() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'shape', payload: { action: 'clear' }, boardId }));
  }

  // toolbar actions
  function onClearClicked() {
    shapesRef.current = [];
    sendClear();
    redraw();
  }

  function onDeleteSelected() {
    const id = selectedIdRef.current;
    if (!id) return;
    const sh = shapesRef.current.find(s => s.id === id);
    if (!sh) return;
    shapesRef.current = shapesRef.current.filter(s => s.id !== id);
    selectedIdRef.current = null;
    sendShapeDelete(sh);
    redraw();
  }

  async function onImagePicked(file: File, frame: 'none' | 'circle' | 'ellipse' | 'square' = 'none') {
    const dataUrl = await toDataUrl(file);
    const canvas = canvasRef.current!;
    const DPR = getDPR();
    const w = Math.min(400, canvas.width / DPR - 40);
    const h = Math.min(300, canvas.height / DPR - 40);
    const sh: Shape = { id: makeId(), kind: 'image', x: 20, y: 20, w, h, imageDataUrl: dataUrl, frame, strokeWidth: 1, stroke: '#000', fill: null };
    shapesRef.current.push(sh);
    sendShapeAdd(sh);
    redraw();
  }

  function toDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  // small helper to attach image input
  function openImagePicker() {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = 'image/*';
    el.onchange = (ev: any) => {
      const f = ev.target.files?.[0];
      if (f) onImagePicked(f, 'none');
    };
    el.click();
  }

  // UI
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: 8, display: 'flex', gap: 8, alignItems: 'center',
        background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ToolButton title="Select" active={tool === 'select'} onClick={() => setTool('select')}>
            {/* cursor icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M3 3l7 17 3-7 7 7" stroke="currentColor" fill="none" strokeWidth="1.4"/></svg>
          </ToolButton>
          <ToolButton title="Pencil" active={tool === 'free'} onClick={() => setTool('free')}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M3 21l3-1 11-11 1-3-3 1-11 11-1 3z" stroke="currentColor" fill="none" strokeWidth="1.4"/></svg>
          </ToolButton>
          <ToolButton title="Rectangle" active={tool === 'rect'} onClick={() => setTool('rect')}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><rect x="4" y="5" width="16" height="14" stroke="currentColor" fill="none" strokeWidth="1.4"/></svg>
          </ToolButton>
          <ToolButton title="Ellipse" active={tool === 'ellipse'} onClick={() => setTool('ellipse')}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><ellipse cx="12" cy="12" rx="8" ry="6" stroke="currentColor" fill="none" strokeWidth="1.4"/></svg>
          </ToolButton>
          <ToolButton title="Diamond" active={tool === 'diamond'} onClick={() => setTool('diamond')}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><polygon points="12,4 20,12 12,20 4,12" stroke="currentColor" fill="none" strokeWidth="1.4"/></svg>
          </ToolButton>
          <ToolButton title="Line" active={tool === 'line'} onClick={() => setTool('line')}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M4 20L20 4" stroke="currentColor" fill="none" strokeWidth="1.6"/></svg>
          </ToolButton>
          <ToolButton title="Text" active={tool === 'text'} onClick={() => setTool('text')}>
            <svg width="18" height="18" viewBox="0 0 24 24"><text x="3" y="17" fontSize="14" fill="currentColor">T</text></svg>
          </ToolButton>
          <ToolButton title="Image" active={tool === 'image'} onClick={() => { setTool('image'); openImagePicker(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><rect x="3" y="3" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.4"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><path d="M21 21l-6-7-5 6" stroke="currentColor" fill="none" strokeWidth="1.4"/></svg>
          </ToolButton>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12 }}>
          <label>Color: <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
          <label>Fill: <input type="color" value={fill ?? '#ffffff'} onChange={(e) => setFill(e.target.value)} /></label>
          <label>Stroke: <input type="range" min={1} max={10} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} /></label>
          <label>Font: <input type="number" min={8} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} /></label>

          <button onClick={onClearClicked}>Clear</button>
          <button onClick={onDeleteSelected}>Delete</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: 'var(--bg, transparent)' }}>
        <div style={{ background: '#ffffff', padding: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.06)' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
            style={{ background: '#ffffff', display: 'block', cursor: tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}

// function ToolButton({ children, active, onClick, title }: { children: React.ReactNode, active?: boolean, onClick?: () => void, title?: string }) {
//   return (
//     <button
//       title={title}
//       onClick={onClick}
//       style={{
//         border: 'none',
//         background: active ? '#e6f0ff' : 'transparent',
//         padding: 6,
//         borderRadius: 6,
//         display: 'inline-flex',
//         alignItems: 'center',
//         justifyContent: 'center',
//         cursor: 'pointer'
//       }}
//     >
//       <div style={{ width: 22, height: 22, color: '#111' }}>{children}</div>
//     </button>
//   );
// }

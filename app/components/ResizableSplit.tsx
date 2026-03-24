"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ResizableSplitProps = {
  storageKey: string;
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function ResizableSplit({
  storageKey,
  left,
  right,
  defaultLeftWidth = 288,
  minLeftWidth = 220,
  maxLeftWidth = 520,
  className = "",
  leftClassName = "",
  rightClassName = "",
}: ResizableSplitProps) {
  const constraints = useMemo(
    () => ({
      min: minLeftWidth,
      max: maxLeftWidth,
      def: defaultLeftWidth,
    }),
    [minLeftWidth, maxLeftWidth, defaultLeftWidth]
  );

  const [leftWidth, setLeftWidth] = useState<number>(constraints.def);

  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startWidth: number;
    raf: number | null;
    min: number;
    max: number;
  }>({
    dragging: false,
    startX: 0,
    startWidth: constraints.def,
    raf: null,
    min: constraints.min,
    max: constraints.max,
  });

  useEffect(() => {
    dragState.current.min = constraints.min;
    dragState.current.max = constraints.max;
  }, [constraints.min, constraints.max]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = parseInt(saved, 10);
      if (!Number.isFinite(parsed)) return;
      setLeftWidth(clamp(parsed, constraints.min, constraints.max));
    } catch {
      // ignore localStorage failures (private mode, SSR hydration edge cases)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(leftWidth));
    } catch {
      // ignore
    }
  }, [storageKey, leftWidth]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st.dragging) return;
      const next = clamp(st.startWidth + (e.clientX - st.startX), st.min, st.max);
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = requestAnimationFrame(() => setLeftWidth(next));
    };

    const stopDragging = () => {
      const st = dragState.current;
      if (!st.dragging) return;
      st.dragging = false;
      if (st.raf) {
        cancelAnimationFrame(st.raf);
        st.raf = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const startDragging = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const st = dragState.current;
    st.dragging = true;
    st.startX = e.clientX;
    st.startWidth = leftWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const reset = () => {
    setLeftWidth(clamp(constraints.def, constraints.min, constraints.max));
  };

  return (
    <div className={`flex h-full w-full overflow-hidden ${className}`}>
      <div
        className={`shrink-0 h-full overflow-hidden ${leftClassName}`}
        style={{ width: leftWidth }}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onPointerDown={startDragging}
        onDoubleClick={reset}
        className={[
          "relative shrink-0 w-2 cursor-col-resize select-none",
          "bg-transparent",
          "before:absolute before:inset-y-0 before:left-1/2 before:-translate-x-1/2 before:w-px before:bg-slate-200",
          "hover:before:bg-blue-400",
          "active:before:bg-blue-500",
        ].join(" ")}
      />

      <div className={`flex-1 h-full overflow-hidden ${rightClassName}`}>{right}</div>
    </div>
  );
}

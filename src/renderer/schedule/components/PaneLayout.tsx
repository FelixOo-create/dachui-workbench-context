import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function usePersistentPaneSize(
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): [number, Dispatch<SetStateAction<number>>] {
  const [value, setValue] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistentValue = useCallback<Dispatch<SetStateAction<number>>>((next) => {
    setValue((current) => {
      const resolved = clamp(typeof next === "function" ? next(current) : next, min, max);
      try {
        window.localStorage.setItem(key, String(resolved));
      } catch {
        // The layout still works when storage is unavailable.
      }
      return resolved;
    });
  }, [key, min, max]);

  return [value, setPersistentValue];
}

export function usePersistentBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? defaultValue : stored === "true";
    } catch {
      return defaultValue;
    }
  });

  const setPersistentValue = useCallback<Dispatch<SetStateAction<boolean>>>((next) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      try {
        window.localStorage.setItem(key, String(resolved));
      } catch {
        // The layout still works when storage is unavailable.
      }
      return resolved;
    });
  }, [key]);

  return [value, setPersistentValue];
}

interface PaneResizerProps {
  value: number;
  min: number;
  max: number;
  direction?: 1 | -1;
  defaultValue: number;
  label: string;
  onChange: (value: number) => void;
}

export function PaneResizer({
  value,
  min,
  max,
  direction = 1,
  defaultValue,
  label,
  onChange,
}: PaneResizerProps) {
  const [dragging, setDragging] = useState(false);

  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const originX = event.clientX;
    const originValue = value;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setDragging(true);
    document.body.classList.add("is-resizing-pane");

    const move = (moveEvent: PointerEvent) => {
      onChange(clamp(originValue + (moveEvent.clientX - originX) * direction, min, max));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("is-resizing-pane");
      setDragging(false);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  return (
    <div
      className={`pane-resizer ${dragging ? "is-dragging" : ""}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title="拖动调整宽度，双击恢复默认"
      onPointerDown={beginResize}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 12 : -12;
          onChange(clamp(value + delta * direction, min, max));
        }
      }}
    >
      <span />
    </div>
  );
}

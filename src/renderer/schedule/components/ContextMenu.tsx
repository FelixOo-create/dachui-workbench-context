import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import "./ContextMenu.css";

export interface MenuItem {
  id: string;
  /** 分隔线项可不填 label */
  label?: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  shortcut?: string;
  onClick?: () => void;
  testId?: string;
  /** 子菜单；存在时点击后展开，不会触发 onClick */
  items?: MenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  title?: string;
  onClose: () => void;
  testId?: string;
}

/**
 * 通用右键菜单
 * - 固定定位，自动避让视口右下边缘
 * - 支持分组标题、分隔线、危险项、快捷键提示、子菜单
 * - 点击外部或按 Escape 关闭
 */
export default function ContextMenu({ x, y, items, title, onClose, testId }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const [subPos, setSubPos] = useState<{ x: number; y: number } | null>(null);

  // 测量并调整位置，防止溢出视口
  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - pad) {
      nx = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (ny + rect.height > window.innerHeight - pad) {
      ny = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (nx < pad) nx = pad;
    if (ny < pad) ny = pad;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // 计算子菜单位置
  useLayoutEffect(() => {
    if (!activeId || !activeItemRef.current || !ref.current) {
      setSubPos(null);
      return;
    }
    const itemRect = activeItemRef.current.getBoundingClientRect();
    const subWidth = 160;
    const pad = 8;
    // sx, sy 是子菜单应在的屏幕坐标
    let sx = itemRect.right + 5;
    let sy = itemRect.top - 2;
    if (sx + subWidth > window.innerWidth - pad) {
      sx = Math.max(pad, itemRect.left - subWidth - 4);
    }
    if (sy + 140 > window.innerHeight - pad) {
      sy = Math.max(pad, window.innerHeight - 140 - pad);
    }
    // subPos 存储相对于 .ctx-item 按钮（position:relative）的偏移
    // 按钮的 padding box 左/上边缘 = itemRect.left / itemRect.top
    setSubPos({ x: sx - itemRect.left, y: sy - itemRect.top });
  }, [activeId]);

  // 外部点击 / Escape 关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 使用捕获阶段，避免被下层阻止冒泡漏掉
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled) return;
    if (item.items && item.items.length > 0) {
      setActiveId((id) => (id === item.id ? null : item.id));
      return;
    }
    if (item.onClick) {
      item.onClick();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={ref}
      data-testid={testId}
      className="ctx-menu"
      style={{ top: pos.y, left: pos.x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && (
        <>
          <div className="ctx-header">{title}</div>
          <div className="ctx-separator" />
        </>
      )}
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="ctx-separator" />
        ) : (
          <button
            key={item.id}
            ref={activeId === item.id ? activeItemRef : undefined}
            data-testid={item.testId}
            className={`ctx-item ${item.danger ? "is-danger" : ""} ${item.disabled ? "is-disabled" : ""} ${activeId === item.id ? "is-active" : ""}`}
            disabled={item.disabled}
            onClick={() => handleItemClick(item)}
          >
            {item.icon && <span className="ctx-icon">{item.icon}</span>}
            <span className="ctx-label">{item.label}</span>
            {item.shortcut && <span className="ctx-shortcut">{item.shortcut}</span>}
            {item.items && item.items.length > 0 && (
              <span className="ctx-arrow">
                <ChevronRight size={12} />
              </span>
            )}
            {activeId === item.id && item.items && subPos && (
              <div
                className="ctx-submenu"
                style={{ top: subPos.y, left: subPos.x }}
              >
                {item.items.map((sub) =>
                  sub.separator ? (
                    <div key={sub.id} className="ctx-separator" />
                  ) : (
                    <button
                      key={sub.id}
                      data-testid={sub.testId}
                      className={`ctx-item ${sub.danger ? "is-danger" : ""} ${sub.disabled ? "is-disabled" : ""}`}
                      disabled={sub.disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!sub.disabled && sub.onClick) {
                          sub.onClick();
                          onClose();
                        }
                      }}
                    >
                      {sub.icon && <span className="ctx-icon">{sub.icon}</span>}
                      <span className="ctx-label">{sub.label}</span>
                    </button>
                  )
                )}
              </div>
            )}
          </button>
        )
      )}
    </div>,
    document.body,
  );
}

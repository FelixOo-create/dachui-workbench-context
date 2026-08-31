import { useEffect, useRef, useState } from "react";
import { X, Zap } from "lucide-react";
import { useAppStore } from "../store";
import "./QuickCapture.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function QuickCapture({ open, onClose }: Props) {
  const [value, setValue] = useState("");
  const [listId, setListId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const quickAdd = useAppStore((s) => s.quickAdd);
  const lists = useAppStore((s) => s.lists);

  useEffect(() => {
    if (open) {
      setValue("");
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!value.trim()) return;
    await quickAdd(value, listId);
    setValue("");
    onClose();
  };

  return (
    <div className="qc-overlay" onClick={onClose}>
      <div className="qc-box" onClick={(e) => e.stopPropagation()}>
        <div className="qc-head">
          <span className="qc-title">
            <Zap size={14} /> 快速记录
          </span>
          <button className="qc-close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <input
          ref={inputRef}
          className="qc-input"
          value={value}
          placeholder="写点什么… 支持“明天下午3点 交报告”"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="qc-foot">
          <select
            className="qc-list"
            value={listId ?? ""}
            onChange={(e) => setListId(e.target.value || null)}
          >
            <option value="">收件箱</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="qc-submit" disabled={!value.trim()} onClick={() => void submit()}>
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

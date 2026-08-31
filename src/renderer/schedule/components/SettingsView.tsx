import { useRef, useState } from "react";
import {
  Download, Upload, FileJson, CalendarClock, Database, AlertTriangle,
  CheckCircle2, Palette,
} from "lucide-react";
import { api, isTauri, isDesktop } from "../api";
import { useAppStore } from "../store";
import { type ThemeSettings, type FontScale } from "../theme";
import "./Settings.css";

async function invokeBridge<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const bridge = (window as unknown as {
    workbench?: { schedule?: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> } };
  }).workbench?.schedule;
  if (!bridge) throw new Error("桌面宿主未连接");
  return bridge.invoke(cmd, args) as Promise<T>;
}

interface Props {
  theme: ThemeSettings;
  onThemeChange: (s: ThemeSettings) => void;
}

export default function SettingsView({ theme, onThemeChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const downloadFile = (name: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackup = async () => {
    setBusy(true);
    try {
      const data = await invokeBridge<string>("backup_json");
      const name = `待办日程备份-${new Date().toISOString().slice(0, 10)}.json`;
      downloadFile(name, data, "application/json");
      setMsg({ type: "ok", text: "备份已导出 ✓" });
    } catch (e) {
      setMsg({ type: "err", text: `备份失败：${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = async () => {
    setBusy(true);
    try {
      const csv = await invokeBridge<string>("export_tasks_csv");
      downloadFile(`待办清单-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
      setMsg({ type: "ok", text: "CSV 已导出 ✓" });
    } catch (e) {
      setMsg({ type: "err", text: `导出失败：${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const handleExportIcal = async () => {
    setBusy(true);
    try {
      const ical = await invokeBridge<string>("export_ical");
      downloadFile(`待办日程-${new Date().toISOString().slice(0, 10)}.ics`, ical, "text/calendar");
      setMsg({ type: "ok", text: "iCal 已导出 ✓（可导入手机日历）" });
    } catch (e) {
      setMsg({ type: "err", text: `导出失败：${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file, "utf-8");
    });

  const handleRestore = async (file: File) => {
    setBusy(true);
    try {
      const content = await readFile(file);
      const res = await invokeBridge<{ importedTasks: number; importedAnniversaries: number }>("restore_backup", { fileContent: content });
      setMsg({ type: "ok", text: `恢复完成：导入 ${res.importedTasks} 条任务 ✓` });
      // 刷新数据
      await useAppStore.getState().loadAll();
    } catch (e) {
      setMsg({ type: "err", text: `恢复失败：${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const handleImportWubian = async (file: File) => {
    setBusy(true);
    try {
      const content = await readFile(file);
      const res = await api.importWubian(content);
      setMsg({
        type: "ok",
        text: `导入完成：${res.importedTasks} 条待办、${res.importedAnniversaries} 条纪念日 ✓`,
      });
      await useAppStore.getState().loadAll();
    } catch (e) {
      setMsg({ type: "err", text: `导入失败：${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-view">
      <h1 className="settings-title">数据管理</h1>

      {!isTauri() && !isDesktop() && (
        <div className="settings-note">
          <AlertTriangle size={15} /> 当前为浏览器预览模式，数据仅保存在内存中；安装版将使用本地数据库。
        </div>
      )}

      {msg && (
        <div className={`settings-msg ${msg.type === "ok" ? "is-ok" : "is-err"}`}>
          {msg.type === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {msg.text}
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-title">
          <Palette size={15} /> 主题设置
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>字号</strong>
            <span>界面文字大小</span>
          </div>
          <div className="settings-seg">
            {(["small", "normal", "large"] as FontScale[]).map((s) => (
              <button
                key={s}
                className={`settings-seg-btn ${theme.fontScale === s ? "is-active" : ""}`}
                onClick={() => onThemeChange({ ...theme, fontScale: s })}
              >
                {s === "small" ? "小" : s === "normal" ? "中" : "大"}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>紧凑模式</strong>
            <span>减少列表行距，一屏显示更多</span>
          </div>
          <button
            className={`settings-switch ${theme.compact ? "is-on" : ""}`}
            onClick={() => onThemeChange({ ...theme, compact: !theme.compact })}
          >
            <span className="settings-switch-knob" />
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <Database size={15} /> 备份与恢复
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>导出备份</strong>
            <span>保存全部任务、日程、习惯为 JSON 文件</span>
          </div>
          <button className="settings-btn" disabled={busy} onClick={() => void handleBackup()}>
            <Download size={14} /> 导出备份
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>恢复备份</strong>
            <span>从 JSON 备份恢复（将覆盖当前数据）</span>
          </div>
          <button className="settings-btn" disabled={busy} onClick={() => restoreRef.current?.click()}>
            <Upload size={14} /> 选择文件
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleRestore(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <CalendarClock size={15} /> 导出
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>CSV 清单</strong>
            <span>导出全部任务为表格文件（Excel 可打开）</span>
          </div>
          <button className="settings-btn" disabled={busy} onClick={() => void handleExportCsv()}>
            <Download size={14} /> 导出 CSV
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>iCal 日历</strong>
            <span>导出日历订阅文件，可导入手机/Outlook 日历</span>
          </div>
          <button className="settings-btn" disabled={busy} onClick={() => void handleExportIcal()}>
            <Download size={14} /> 导出 iCal
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <FileJson size={15} /> 从「无边组件库」迁移
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>导入画布备份</strong>
            <span>读取无边组件库导出的备份 JSON，迁移待办与纪念日</span>
          </div>
          <button className="settings-btn" disabled={busy} onClick={() => importRef.current?.click()}>
            <Upload size={14} /> 选择备份文件
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportWubian(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

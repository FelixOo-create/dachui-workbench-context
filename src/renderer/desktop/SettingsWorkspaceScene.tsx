import { useEffect, useMemo, useState } from "react";
import { Blocks, Check, EyeOff, LayoutGrid, Monitor, RotateCcw, Save, Settings, Wrench } from "lucide-react";
import packageMetadata from "../../../package.json";
import type { WorkbenchSettings } from "../../shared/types";
import { api } from "../api";
import { useDesktopStore } from "./store";
import "./SettingsWorkspaceScene.css";

type SettingsWorkspaceSceneProps = {
  onOpenLibrary: () => void;
  onOpenLayout: () => void;
  onOpenTools: () => void;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function SettingsWorkspaceScene({ onOpenLibrary, onOpenLayout, onOpenTools }: SettingsWorkspaceSceneProps) {
  const host = useDesktopStore((state) => state.host);
  const layout = useDesktopStore((state) => state.layout);
  const toggleEditMode = useDesktopStore((state) => state.toggleEditMode);
  const toggleHidden = useDesktopStore((state) => state.toggleHidden);
  const resetLayout = useDesktopStore((state) => state.resetLayout);
  const [saved, setSaved] = useState<WorkbenchSettings | null>(null);
  const [draft, setDraft] = useState<WorkbenchSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void api.getSettings().then((value) => {
      if (!active) return;
      setSaved(value);
      setDraft(value);
    }).catch((error) => {
      if (active) setNotice({ kind: "error", text: `读取设置失败：${messageOf(error)}` });
    });
    return () => { active = false; };
  }, []);

  const dirty = useMemo(() => draft !== null && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await api.saveSettings(draft);
      setSaved(next);
      setDraft(next);
      document.documentElement.dataset.compact = String(next.compactMode);
      document.documentElement.dataset.fontSize = next.fontSizeMode ?? "medium";
      setNotice({ kind: "success", text: "设置已保存" });
    } catch (error) {
      setNotice({ kind: "error", text: `保存失败：${messageOf(error)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-workspace-scene">
      <aside className="settings-workspace-nav" aria-label="设置分类">
        <div className="settings-workspace-brand"><Settings size={18} /><div><strong>工作台设置</strong><span>v{packageMetadata.version}</span></div></div>
        <a href="#settings-general">通用与外观</a>
        <a href="#settings-desktop">桌面与首页</a>
        <a href="#settings-workspace">工作区扫描</a>
        <a href="#settings-tools">工具与运行</a>
      </aside>

      <div className="settings-workspace-content">
        <header className="settings-workspace-header"><div><h1>工作台设置</h1><p>所有设置均保存到现有配置，不建立第二套数据。</p></div><button className="primary-button" disabled={!dirty || busy} onClick={() => void save()}><Save size={15} />{busy ? "保存中" : "保存更改"}</button></header>
        {notice ? <div className={`settings-notice ${notice.kind}`} role="status">{notice.kind === "success" ? <Check size={15} /> : null}{notice.text}</div> : null}

        <section id="settings-general" className="settings-workspace-panel">
          <div className="settings-panel-heading"><div><strong>通用与外观</strong><span>保持黑灰雾面玻璃视觉，只调整信息密度。</span></div></div>
          <div className="settings-control-row"><div><strong>界面字号</strong><span>适配常见 Windows 缩放比例。</span></div><div className="settings-segmented">{([['small','小'],['medium','中'],['large','大']] as const).map(([value,label]) => <button key={value} className={(draft?.fontSizeMode ?? "medium") === value ? "is-active" : ""} onClick={() => draft && setDraft({ ...draft, fontSizeMode: value })}>{label}</button>)}</div></div>
          <div className="settings-control-row"><div><strong>紧凑布局</strong><span>减少列表与卡片留白，不改变功能位置。</span></div><button type="button" className={`settings-switch${draft?.compactMode ? " is-on" : ""}`} role="switch" aria-checked={Boolean(draft?.compactMode)} onClick={() => draft && setDraft({ ...draft, compactMode: !draft.compactMode })}><span /></button></div>
        </section>

        <section id="settings-desktop" className="settings-workspace-panel">
          <div className="settings-panel-heading"><div><strong>桌面与首页</strong><span>控制模拟桌面的目标显示器和首页组件布局。</span></div><Monitor size={17} /></div>
          <label className="settings-field"><span>目标显示器</span><select value={host.boundDisplayId ?? ""} onChange={(event) => void api.desktop.setTargetDisplay(event.target.value || null)}><option value="">主显示器</option>{host.displays.map((display) => <option key={display.id} value={display.id}>{display.label}{display.primary ? " · 主" : ""}</option>)}</select></label>
          <div className="settings-action-grid">
            <button onClick={onOpenLibrary}><Blocks size={16} /><span><strong>首页组件库</strong><small>添加、恢复或隐藏摘要组件</small></span></button>
            <button onClick={onOpenLayout}><LayoutGrid size={16} /><span><strong>布局预设</strong><small>智能填充、分栏或自由布局</small></span></button>
            <button className={host.editMode ? "is-active" : ""} onClick={() => void toggleEditMode()}><LayoutGrid size={16} /><span><strong>{host.editMode ? "完成首页编辑" : "编辑首页布局"}</strong><small>拖动、缩放与调整组件顺序</small></span></button>
            <button onClick={() => void toggleHidden()}><EyeOff size={16} /><span><strong>{layout.hidden ? "恢复首页组件" : "隐藏全部组件"}</strong><small>保留布局配置，可随时恢复</small></span></button>
            <button onClick={() => void resetLayout()}><RotateCcw size={16} /><span><strong>恢复默认布局</strong><small>仅重置布局，不影响业务数据</small></span></button>
          </div>
        </section>

        <section id="settings-workspace" className="settings-workspace-panel">
          <div className="settings-panel-heading"><div><strong>工作区扫描</strong><span>只影响“扫描工作区”的第一层目录。</span></div></div>
          <label className="settings-field"><span>Workspace Root</span><input value={draft?.workspaceRoot ?? ""} onChange={(event) => draft && setDraft({ ...draft, workspaceRoot: event.target.value })} /></label>
          <label className="settings-field"><span>扫描忽略目录</span><textarea rows={4} value={(draft?.ignoredWorkspaceDirectories ?? []).join("\n")} onChange={(event) => draft && setDraft({ ...draft, ignoredWorkspaceDirectories: event.target.value.split(/[,，、\n]+/) })} /><small>逗号或换行分隔；显式扫描文件夹不受此列表阻断。</small></label>
        </section>

        <section id="settings-tools" className="settings-workspace-panel">
          <div className="settings-panel-heading"><div><strong>工具与运行</strong><span>复杂配置统一进入现有工具中心。</span></div><Wrench size={17} /></div>
          <button className="settings-wide-action" onClick={onOpenTools}><Wrench size={16} /><span><strong>打开工具中心</strong><small>管理 Registry、启动方式、状态、扫描与自动启动</small></span></button>
        </section>
      </div>
    </section>
  );
}

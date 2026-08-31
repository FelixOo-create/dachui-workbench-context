import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Check,
  Droplets,
  Dumbbell,
  Ellipsis,
  Moon,
  ShieldCheck,
  Sparkles,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import "./HabitsSceneV2.css";
import "../../../../docs/视觉参考/habits-v2-react-preview/icon-options-preview.css";

type IconOption = "soft" | "line" | "badge";

interface PreviewHabit {
  name: string;
  detail: string;
  streak: number;
  color: string;
  icon: LucideIcon;
  count: number;
  targetCount: number;
}

const habits: PreviewHabit[] = [
  { name: "早起", detail: "每天 · 1 次", streak: 18, color: "#d3ad67", icon: Sunrise, count: 1, targetCount: 1 },
  { name: "洗漱", detail: "每天 · 2 次 · 今日 1/2", streak: 12, color: "#7ba5bd", icon: Droplets, count: 1, targetCount: 2 },
  { name: "锻炼身体", detail: "每天 · 1 次", streak: 9, color: "#82b69a", icon: Dumbbell, count: 1, targetCount: 1 },
  { name: "避免坏习惯", detail: "每天 · 1 次", streak: 6, color: "#9aa9b4", icon: ShieldCheck, count: 0, targetCount: 1 },
  { name: "早睡", detail: "每天 · 1 次", streak: 4, color: "#899ec1", icon: Moon, count: 0, targetCount: 1 },
  { name: "模板 / 学习", detail: "每天 · 1 次", streak: 3, color: "#b79dca", icon: BookOpen, count: 0, targetCount: 1 },
];

const options: Array<{ id: IconOption; label: string; subtitle: string }> = [
  { id: "soft", label: "A · 柔和色块图标", subtitle: "轻色块承载语义，层级清楚且不抢打卡状态" },
  { id: "line", label: "B · 纯线性图标", subtitle: "最克制、密度最低，靠局部光晕维持识别" },
  { id: "badge", label: "C · 中性描边徽章", subtitle: "石墨徽章配细色标，工具感更强、更稳定" },
];

function HabitRow({ habit }: { habit: PreviewHabit }) {
  const Icon = habit.icon;
  const done = habit.count >= habit.targetCount;
  return (
    <article
      className={`h2v2-habit-row${done ? " is-done" : ""}`}
      style={{ "--habit-accent": habit.color } as CSSProperties}
    >
      <button className="h2v2-check" type="button" tabIndex={-1} aria-label={`${habit.name} 打卡状态`}>
        {done ? <Check aria-hidden="true" /> : habit.count > 0 ? <span>{habit.count}</span> : null}
      </button>
      <span className="h2v2-habit-symbol"><Icon size={18} aria-hidden="true" /></span>
      <div className="h2v2-habit-copy"><strong>{habit.name}</strong><small>{habit.detail}</small></div>
      <span className="h2v2-streak"><Sparkles size={13} aria-hidden="true" /> {habit.streak} 天</span>
      <button className="h2v2-row-action" type="button" tabIndex={-1} aria-label={`${habit.name} 更多操作`}><Ellipsis size={16} aria-hidden="true" /></button>
    </article>
  );
}

function IconOptionsPreview() {
  return (
    <main className="h2v2-icon-preview">
      <header>
        <span>HABIT ICON STUDY · REAL REACT / LUCIDE</span>
        <h1>习惯语义图标 · 三方案落地比较</h1>
        <p>相同行尺寸、相同数据与完成状态；仅改变语义图标的承载方式。</p>
      </header>
      <section className="h2v2-icon-options">
        {options.map((option) => (
          <article className="h2v2-icon-option habits-v2-root" data-icon-style={option.id} key={option.id}>
            <header><b>{option.label}</b><small>{option.subtitle}</small></header>
            <div className="h2v2-habit-list">{habits.map((habit) => <HabitRow habit={habit} key={habit.name} />)}</div>
            <footer>{option.id === "soft" ? "推荐 · 与现有 V2 材质最一致" : option.id === "line" ? "克制 · 适合高密度列表" : "专业 · 状态边界最稳"}</footer>
          </article>
        ))}
      </section>
      <aside><Check size={14} aria-hidden="true" /> 左侧为完成状态；右侧图标只表达习惯语义，两者不再共用同一个勾。</aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<IconOptionsPreview />);

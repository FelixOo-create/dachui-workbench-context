import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { COLOR_PALETTE } from "../constants";
import { cn } from "../ui/cn";
import type { Activity, Category } from "../types";

/* ---------------------------------- 分类 ---------------------------------- */

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  onSubmit: (data: { name: string; color: string }) => Promise<void>;
}

export function CategoryDialog({ open, onOpenChange, category, onSubmit }: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setColor(category?.color ?? COLOR_PALETTE[0]);
    }
  }, [open, category]);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), color });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? "编辑分类" : "新增分类"}</DialogTitle>
          <DialogDescription>分类是一级结构，活动继承分类颜色。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">名称</Label>
            <Input
              id="cat-name"
              data-testid="category-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：工作"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>颜色</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`选择颜色 ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full transition-transform hover:scale-110",
                    color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                  )}
                  style={{ background: c }}
                />
              ))}
              <label
                className="flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/60 text-[10px] text-muted-foreground hover:border-foreground"
                title="自定义颜色"
              >
                +
                <input
                  type="color"
                  className="h-0 w-0 opacity-0"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || saving}>
            {category ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- 活动 ---------------------------------- */

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  activity?: Activity | null;
  defaultCategoryId?: string;
  onSubmit: (data: { name: string; categoryId: string }) => Promise<void>;
}

export function ActivityDialog({
  open,
  onOpenChange,
  categories,
  activity,
  defaultCategoryId,
  onSubmit,
}: ActivityDialogProps) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(activity?.name ?? "");
      setCategoryId(activity?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
    }
  }, [open, activity, defaultCategoryId, categories]);

  async function handleSubmit() {
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), categoryId });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{activity ? "编辑活动" : "新增活动"}</DialogTitle>
          <DialogDescription>活动属于某个分类，颜色继承自分类。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="act-name">名称</Label>
            <Input
              id="act-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：深度工作"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>所属分类</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: c.color }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !categoryId || saving}>
            {activity ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- 删除确认 ------------------------------- */

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  allowDelete: boolean;
  onConfirm: () => Promise<void>;
}

export function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  allowDelete,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={!allowDelete}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {allowDelete ? "删除" : "不可删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

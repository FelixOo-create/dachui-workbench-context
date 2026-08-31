import { Pencil, Trash2 } from "lucide-react";
import SharedContextMenu, { type MenuItem } from "../../../components/ContextMenu";

export interface ContextMenuState {
  x: number;
  y: number;
  entryId: string;
  title: string;
}

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onDelete: (entryId: string) => void;
  onEdit: (entryId: string) => void;
}

/** 时间块右键上下文菜单：删除 / 编辑选中记录。 */
export default function ContextMenu({ menu, onClose, onDelete, onEdit }: ContextMenuProps) {
  if (!menu) return null;

  const items: MenuItem[] = [
    {
      id: "edit",
      label: "编辑",
      icon: <Pencil size={15} />,
      testId: "ctx-edit",
      onClick: () => onEdit(menu.entryId),
    },
    { id: "separator", separator: true },
    {
      id: "delete",
      label: "删除",
      icon: <Trash2 size={15} />,
      danger: true,
      testId: "ctx-delete",
      onClick: () => onDelete(menu.entryId),
    },
  ];

  return (
    <SharedContextMenu
      x={menu.x}
      y={menu.y}
      title={menu.title}
      items={items}
      testId="time-block-context-menu"
      onClose={onClose}
    />
  );
}

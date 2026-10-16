import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  FileText,
  Folder,
  Grid2X2,
  Image,
  Info,
  ListChecks,
  MoreHorizontal,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

const icons = {
  back: ArrowLeft,
  refresh: RefreshCw,
  info: Info,
  warning: TriangleAlert,
  panel: PanelRight,
  arrow: ArrowRight,
  check: Check,
  down: ChevronDown,
  chevron: ChevronRight,
  columns: Columns3,
  download: Download,
  file: FileText,
  folder: Folder,
  projects: Grid2X2,
  image: Image,
  qa: ListChecks,
  more: MoreHorizontal,
  plus: Plus,
  search: Search,
  settings: Settings2,
  share: Share2,
  generate: Sparkles,
  trash: Trash2,
  close: X,
};
export type WorkspaceIconName = keyof typeof icons;
export function WorkspaceIcon({
  name,
  className,
}: {
  name: WorkspaceIconName;
  className?: string;
}) {
  const Icon = icons[name];
  return (
    <Icon
      aria-hidden="true"
      className={className ?? "workspace-icon"}
      strokeWidth={1.6}
    />
  );
}

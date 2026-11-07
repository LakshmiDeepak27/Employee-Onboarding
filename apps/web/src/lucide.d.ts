declare module 'lucide-react' {
  import type { ComponentType, SVGProps } from 'react';
  export interface LucideProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    className?: string;
  }
  export type LucideIcon = ComponentType<LucideProps>;
  export const Sparkles: LucideIcon;
  export const X: LucideIcon;
  export const Minus: LucideIcon;
  export const Send: LucideIcon;
  export const Bot: LucideIcon;
  export const Search: LucideIcon;
  export const Menu: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ArrowUpRight: LucideIcon;
  export const Bell: LucideIcon;
  export const CircleHelp: LucideIcon;
  export const LogOut: LucideIcon;
  export const PanelLeftClose: LucideIcon;
  export const PanelLeftOpen: LucideIcon;
  export const FileText: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const Clock: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Download: LucideIcon;
  export const Upload: LucideIcon;
  export const Check: LucideIcon;
  export const User: LucideIcon;
  export const Users: LucideIcon;
  export const Laptop: LucideIcon;
  export const Shield: LucideIcon;
  export const BookOpen: LucideIcon;
  export const Briefcase: LucideIcon;
  export const Calendar: LucideIcon;
  export const Building: LucideIcon;
  export const Settings: LucideIcon;
  export const [key: string]: any;
}

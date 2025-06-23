"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import logoImg from '@/assets/Annie\'s-Way-LOGO-new.png';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarGroupLabel,
  SidebarGroup,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  Users,
  BarChart3,
  Lightbulb,
  UserCog,
  LogOut,
  PackageSearch,
  Settings,
  FolderTree,
  Trash2,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserRole } from '@/models/User';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  group?: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: '儀表板', icon: LayoutDashboard, roles: ['admin', 'employee'], group: '概覽' },
  { href: '/products', label: '產品', icon: Package, roles: ['admin', 'employee'], group: '管理' },
  { href: '/categories', label: '類別', icon: FolderTree, roles: ['admin', 'employee'], group: '管理' },
  { href: '/inventory', label: '庫存', icon: Warehouse, roles: ['admin', 'employee'], group: '管理' },
  { href: '/orders', label: '訂單', icon: ShoppingCart, roles: ['admin', 'employee'], group: '管理' },
  { href: '/customers', label: '客戶', icon: Users, roles: ['admin', 'employee'], group: '管理' },
  { href: '/reports', label: '報告', icon: BarChart3, roles: ['admin', 'employee'], group: '分析' },
  { href: '/ai-reorder', label: 'AI 再訂購', icon: Lightbulb, roles: ['admin', 'employee'], group: '分析' },
  { href: '/admin/users', label: '使用者管理', icon: UserCog, roles: ['admin'], group: '管理' },
  { href: '/admin/deleted-orders', label: '已刪除訂單', icon: Trash2, roles: ['admin'], group: '管理' },
];

export function SidebarNavigation() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;

  const getInitials = (name: string) => {
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  const groupedNavItems: Record<string, NavItem[]> = navItems.reduce((acc, item) => {
    const group = item.group || 'General';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);


  return (
    <Sidebar collapsible="icon" variant="sidebar" defaultOpen={true} side="left">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex flex-col items-center">
          <Image 
            src={logoImg}
            alt="Annie's Way Logo" 
            width={128}
            height={128}
            className="w-full h-full object-contain flex-shrink-0" 
          />
          <span className="text-2xl -mt-6 font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden text-center">
            Annie's Way
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="flex-grow">
        <SidebarMenu>
          {Object.entries(groupedNavItems).map(([groupName, items]) => (
            <SidebarGroup key={groupName}>
              <SidebarGroupLabel asChild>
                <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                  {groupName}
                </span>
              </SidebarGroupLabel>
              {items
                .filter(item => item.roles.includes(user.role))
                .map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <Link href={item.href} passHref legacyBehavior>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                        className={cn(
                          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
                        )}
                        tooltip={{ children: item.label, className: "bg-accent text-accent-foreground border-accent" }}
                      >
                        <a>
                          <item.icon className="h-5 w-5" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                ))}
            </SidebarGroup>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border mt-auto">
        <div className="flex items-center gap-3 p-3 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-10 w-10 border-2 border-sidebar-accent">
            <AvatarImage src={`https://placehold.co/100x100.png?text=${getInitials(user.name)}`} alt={user.name} data-ai-hint="avatar profile" />
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium text-sidebar-foreground">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/70">{user.email}</p>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              tooltip={{ children: "登出", className: "bg-accent text-accent-foreground border-accent" }}
            >
              <LogOut className="h-5 w-5" />
              <span className="group-data-[collapsible=icon]:hidden">登出</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

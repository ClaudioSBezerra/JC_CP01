import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  History,
  Settings,
  LogOut,
  ShoppingCart,
  AlertTriangle,
  Sparkles,
  Search,
  Warehouse,
  Waves,
  SlidersHorizontal,
  Truck,
  BarChart3,
  Users,
  Route,
  UserCog,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type MenuItem = { title: string; icon: React.ElementType; href: string };
type MenuGroup = { group: string; icon: React.ElementType; items: MenuItem[] };

const ALL_GROUPS: MenuGroup[] = [
  {
    group: 'Compras',
    icon: ShoppingCart,
    items: [
      { title: 'Dashboard', icon: LayoutDashboard, href: '/' },
      { title: 'Pedidos Pendentes', icon: ClipboardCheck, href: '/pedidos-pendentes' },
      { title: 'Importar Produtos', icon: Package, href: '/importar-produtos' },
      { title: 'Importar Pedidos', icon: ShoppingCart, href: '/importar-pedidos' },
      { title: 'Consulta Inteligente', icon: Sparkles, href: '/consulta-inteligente' },
      { title: 'Consulta de Produtos', icon: Search, href: '/consulta-produtos' },
      { title: 'Giro Baixo', icon: AlertTriangle, href: '/produtos-giro-baixo' },
      { title: 'Histórico Aprovações', icon: History, href: '/historico' },
      { title: 'Parâmetros de Giro', icon: Settings, href: '/configuracoes' },
    ],
  },
  {
    group: 'Logística',
    icon: Warehouse,
    items: [
      { title: 'Dashboard Picking', icon: Warehouse, href: '/picking' },
      { title: 'Endereços', icon: Truck, href: '/picking/enderecos' },
      { title: 'Ondas de Reabastecimento', icon: Waves, href: '/picking/ondas' },
      { title: 'Config. Picking', icon: SlidersHorizontal, href: '/picking/configuracoes' },
    ],
  },
  {
    group: 'Comercial',
    icon: BarChart3,
    items: [
      { title: 'Dashboard Comercial', icon: BarChart3, href: '/rca' },
      { title: 'Representantes', icon: Users, href: '/rca/representantes' },
      { title: 'Rotas de Visita', icon: Route, href: '/rca/rotas' },
    ],
  },
  {
    group: 'Sistema',
    icon: UserCog,
    items: [
      { title: 'Gestão de Usuários', icon: UserCog, href: '/usuarios' },
    ],
  },
];

export function AppSidebar() {
  const { user, company, logout } = useAuth();
  const location = useLocation();

  const visibleGroups = ALL_GROUPS.filter(g =>
    g.group !== 'Comercial' || user?.role !== 'rca'
  );

  // Which group is active (contains current route)?
  const activeGroup = visibleGroups.find(g =>
    g.items.some(i => i.href === location.pathname || location.pathname.startsWith(i.href + '/'))
  )?.group ?? '';

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visibleGroups.map(g => [g.group, g.group === activeGroup]))
  );

  const toggle = (group: string) =>
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            JC
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">JCInteligenc</span>
            <span className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">{company || 'Empresa'}</span>
          </div>
        </div>
      </SidebarHeader>

      <Separator className="bg-sidebar-border" />

      <SidebarContent className="py-2">
        {visibleGroups.map(group => {
          const isOpen = openGroups[group.group] ?? false;
          const GroupIcon = group.icon;
          const hasActive = group.items.some(
            i => i.href === location.pathname || location.pathname.startsWith(i.href + '/')
          );

          return (
            <div key={group.group} className="mb-1">
              {/* Group header — clickable to toggle */}
              <button
                onClick={() => toggle(group.group)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  hasActive
                    ? 'text-sidebar-foreground'
                    : 'text-sidebar-foreground/60'
                )}
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{group.group}</span>
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                    isOpen && 'rotate-90'
                  )}
                />
              </button>

              {/* Group items */}
              {isOpen && (
                <SidebarMenu className="ml-3 mt-0.5 border-l border-sidebar-border pl-2">
                  {group.items.map(item => {
                    const isActive =
                      item.href === location.pathname ||
                      (item.href !== '/' && location.pathname.startsWith(item.href + '/'));
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link to={item.href} className="text-sm">
                            <item.icon className="h-3.5 w-3.5" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </div>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          <div className="text-xs text-sidebar-foreground/60 truncate">
            {user?.full_name} · {user?.role}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function AppSidebar() {
  const { user, company, logout } = useAuth();
  const location = useLocation();

  const menuItems = [
    {
      group: 'Compras',
      items: [
        { title: 'Dashboard', icon: LayoutDashboard, href: '/' },
        { title: 'Pedidos Pendentes', icon: ClipboardCheck, href: '/pedidos-pendentes' },
        { title: 'Importar Produtos', icon: Package, href: '/importar-produtos' },
        { title: 'Importar Pedidos', icon: ShoppingCart, href: '/importar-pedidos' },
        { title: 'Consulta Inteligente', icon: Sparkles, href: '/consulta-inteligente' },
        { title: 'Consulta de Produtos', icon: Search, href: '/consulta-produtos' },
        { title: 'Produtos Giro Baixo', icon: AlertTriangle, href: '/produtos-giro-baixo' },
        { title: 'Historico Aprovacoes', icon: History, href: '/historico' },
        { title: 'Parametros de Giro', icon: Settings, href: '/configuracoes' },
      ],
    },
    {
      group: 'Logística',
      items: [
        { title: 'Dashboard Picking', icon: Warehouse, href: '/picking' },
        { title: 'Enderecos', icon: Truck, href: '/picking/enderecos' },
        { title: 'Ondas de Reabastecimento', icon: Waves, href: '/picking/ondas' },
        { title: 'Config. Picking', icon: SlidersHorizontal, href: '/picking/configuracoes' },
      ],
    },
    {
      group: 'Comercial',
      items: [
        { title: 'Dashboard Comercial', icon: BarChart3, href: '/rca' },
        { title: 'Representantes', icon: Users, href: '/rca/representantes' },
        { title: 'Rotas de Visita', icon: Route, href: '/rca/rotas' },
      ],
    },
  ];

  // RCA users use the mobile layout — hide admin sidebar groups from them
  const visibleMenuItems = menuItems.filter(
    group => group.group !== 'Comercial' || user?.role !== 'rca'
  );

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            JC
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">JCInteligenc</span>
            <span className="text-xs text-sidebar-foreground/60">{company || 'Empresa'}</span>
          </div>
        </div>
      </SidebarHeader>
      <Separator className="bg-sidebar-border" />
      <SidebarContent>
        {visibleMenuItems.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.href}>
                      <Link to={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          <div className="text-xs text-sidebar-foreground/60">
            {user?.full_name} ({user?.role})
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

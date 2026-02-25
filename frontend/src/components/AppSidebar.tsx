import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard, Package, ClipboardCheck, History, Settings,
  LogOut, ShoppingCart, AlertTriangle, Sparkles, Search,
  Warehouse, Waves, SlidersHorizontal, Truck, BarChart3,
  Users, Route, UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type MenuItem = { title: string; icon: React.ElementType; href: string };

const GROUPS = [
  {
    label: 'Compras',
    icon: ShoppingCart,
    prefixes: ['/', '/pedidos', '/importar', '/consulta', '/produtos', '/historico', '/configuracoes'],
    items: [
      { title: 'Dashboard',           icon: LayoutDashboard, href: '/' },
      { title: 'Pedidos Pendentes',   icon: ClipboardCheck,  href: '/pedidos-pendentes' },
      { title: 'Importar Produtos',   icon: Package,         href: '/importar-produtos' },
      { title: 'Importar Pedidos',    icon: ShoppingCart,    href: '/importar-pedidos' },
      { title: 'Consulta Inteligente',icon: Sparkles,        href: '/consulta-inteligente' },
      { title: 'Consulta de Produtos',icon: Search,          href: '/consulta-produtos' },
      { title: 'Giro Baixo',          icon: AlertTriangle,   href: '/produtos-giro-baixo' },
      { title: 'Histórico Aprovações',icon: History,         href: '/historico' },
      { title: 'Parâmetros de Giro',  icon: Settings,        href: '/configuracoes' },
    ],
  },
  {
    label: 'Logística',
    icon: Warehouse,
    prefixes: ['/picking'],
    items: [
      { title: 'Dashboard Picking',        icon: Warehouse,       href: '/picking' },
      { title: 'Endereços',                icon: Truck,           href: '/picking/enderecos' },
      { title: 'Ondas de Reabastecimento', icon: Waves,           href: '/picking/ondas' },
      { title: 'Config. Picking',          icon: SlidersHorizontal,href: '/picking/configuracoes' },
    ],
  },
  {
    label: 'Comercial',
    icon: BarChart3,
    prefixes: ['/rca'],
    items: [
      { title: 'Dashboard Comercial', icon: BarChart3, href: '/rca' },
      { title: 'Representantes',      icon: Users,     href: '/rca/representantes' },
      { title: 'Rotas de Visita',     icon: Route,     href: '/rca/rotas' },
    ],
  },
  {
    label: 'Sistema',
    icon: UserCog,
    prefixes: ['/usuarios'],
    items: [
      { title: 'Gestão de Usuários', icon: UserCog, href: '/usuarios' },
    ],
  },
];

function NavItem({ item, currentPath }: { item: MenuItem; currentPath: string }) {
  const isActive =
    item.href === '/'
      ? currentPath === '/'
      : currentPath === item.href || currentPath.startsWith(item.href + '/');

  return (
    <Link
      to={item.href}
      className={[
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      ].join(' ')}
    >
      <item.icon className="h-3.5 w-3.5 shrink-0" />
      <span>{item.title}</span>
    </Link>
  );
}

export function AppSidebar() {
  const { user, company, logout } = useAuth();
  const location = useLocation();

  const visibleGroups = GROUPS.filter(g =>
    g.label !== 'Comercial' || user?.role !== 'rca'
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
            <span className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">
              {company || 'Empresa'}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <Separator className="bg-sidebar-border" />

      <SidebarContent className="py-2 px-2">
        {visibleGroups.map(g => {
          const GroupIcon = g.icon;
          const isActive = g.prefixes.some(p =>
            p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
          );

          return (
            <details key={g.label} open={isActive} className="group/details mb-1">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors select-none">
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{g.label}</span>
                {/* Chevron via CSS — roda quando <details> está aberto */}
                <svg
                  className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open/details:rotate-180"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>

              <div className="ml-3 mt-0.5 border-l border-sidebar-border pl-2 pb-1 flex flex-col gap-0.5">
                {g.items.map(item => (
                  <NavItem key={item.href} item={item} currentPath={location.pathname} />
                ))}
              </div>
            </details>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          <div className="text-xs text-sidebar-foreground/60 truncate">
            {user?.full_name} · {user?.role}
          </div>
          <Button
            variant="ghost" size="sm" onClick={logout}
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

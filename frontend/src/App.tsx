import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Separator } from '@/components/ui/separator';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import ImportarProdutos from './pages/ImportarProdutos';
import ImportarPedidos from './pages/ImportarPedidos';
import PedidosPendentes from './pages/PedidosPendentes';
import DetalhesPedido from './pages/DetalhesPedido';
import ProdutosGiroBaixo from './pages/ProdutosGiroBaixo';
import HistoricoAprovacoes from './pages/HistoricoAprovacoes';
import Configuracoes from './pages/Configuracoes';
import ConsultaInteligente from './pages/ConsultaInteligente';
import ConsultaProdutos from './pages/ConsultaProdutos';
import DashboardPicking from './pages/picking/DashboardPicking';
import EnderecosPicking from './pages/picking/EnderecosPicking';
import OndasReabastecimento from './pages/picking/OndasReabastecimento';
import ConfiguracoesPicking from './pages/picking/ConfiguracoesPicking';
import Usuarios from './pages/Usuarios';
import DashboardComercial from './pages/rca/DashboardComercial';
import Representantes from './pages/rca/Representantes';
import Rotas from './pages/rca/Rotas';
import DetalhesRCA from './pages/rca/DetalhesRCA';
import MinhaRota from './pages/rca/mobile/MinhaRota';
import VisitaAtiva from './pages/rca/mobile/VisitaAtiva';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();

  // RCA users belong in the mobile layout — redirect if they land here
  if (user?.role === 'rca' && !location.pathname.startsWith('/rca/minha-rota') && !location.pathname.startsWith('/rca/visita')) {
    return <Navigate to="/rca/minha-rota" replace />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2 text-sm font-medium">
            JCInteligenc
          </div>
        </header>
        <div className="flex-1 space-y-4 p-4 pt-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/importar-produtos" element={<ImportarProdutos />} />
            <Route path="/importar-pedidos" element={<ImportarPedidos />} />
            <Route path="/pedidos-pendentes" element={<PedidosPendentes />} />
            <Route path="/pedidos/:id" element={<DetalhesPedido />} />
            <Route path="/produtos-giro-baixo" element={<ProdutosGiroBaixo />} />
            <Route path="/historico" element={<HistoricoAprovacoes />} />
            <Route path="/consulta-produtos" element={<ConsultaProdutos />} />
            <Route path="/consulta-inteligente" element={<ConsultaInteligente />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/picking" element={<DashboardPicking />} />
            <Route path="/picking/enderecos" element={<EnderecosPicking />} />
            <Route path="/picking/ondas" element={<OndasReabastecimento />} />
            <Route path="/picking/configuracoes" element={<ConfiguracoesPicking />} />
            <Route path="/rca" element={<DashboardComercial />} />
            <Route path="/rca/representantes" element={<Representantes />} />
            <Route path="/rca/rotas" element={<Rotas />} />
            <Route path="/rca/:id" element={<DetalhesRCA />} />
          </Routes>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function App() {
  console.log("JCInteligenc v2.0.0");
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          {/* Toaster at root level so mobile pages can use toast() */}
          <Toaster />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* Mobile RCA routes — no sidebar, registered before /* catch-all */}
            <Route path="/rca/minha-rota" element={
              <ProtectedRoute><MinhaRota /></ProtectedRoute>
            } />
            <Route path="/rca/visita/:visitId" element={
              <ProtectedRoute><VisitaAtiva /></ProtectedRoute>
            } />
            {/* All admin routes with sidebar */}
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

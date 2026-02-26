import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, ShieldAlert, ShoppingCart, Warehouse, BarChart2, CheckCircle, AlertCircle } from 'lucide-react';

type ClearResult = { ok: boolean; msg: string; counts?: Record<string, number> };

const MODULE_LABELS: Record<string, string> = {
  approval_history: 'histórico de aprovações',
  purchase_order_items: 'itens de pedidos',
  purchase_orders: 'pedidos',
  products: 'produtos',
  replenishment_tasks: 'tarefas de reabastecimento',
  replenishment_waves: 'ondas de reabastecimento',
  fragmentation_history: 'histórico de fragmentação',
  winthor_sync_log: 'log de sincronização',
  picking_stock: 'estoque picking',
  picking_locations: 'endereços picking',
  rca_visits: 'visitas',
  rca_customers: 'clientes de rota',
  rca_routes: 'rotas',
};

function ResultBox({ result }: { result: ClearResult }) {
  return (
    <div className={`p-3 rounded-md border flex items-start gap-2 ${result.ok ? 'bg-green-50 border-green-200' : 'bg-red-100 border-red-300'}`}>
      {result.ok
        ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        : <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
      <div className="text-sm">
        <p className={result.ok ? 'text-green-700 font-medium' : 'text-red-700'}>{result.msg}</p>
        {result.ok && result.counts && (
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-muted-foreground">
            {Object.entries(result.counts)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <span key={k}>{MODULE_LABELS[k] || k}: <strong>{v}</strong> removidos</span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleCard({
  title, description, icon: Icon, iconColor, borderColor, module, token,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  borderColor: string;
  module: string;
  token: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClearResult | null>(null);

  const handleClear = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/clear-module', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ module }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: data.message, counts: data.cleared });
      } else {
        setResult({ ok: false, msg: data.error || 'Erro ao executar limpeza.' });
      }
    } catch {
      setResult({ ok: false, msg: 'Erro de conexão.' });
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  };

  return (
    <Card className={`border-${borderColor}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-${iconColor}`}>
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result && <ResultBox result={result} />}

        {!confirm && !result?.ok && (
          <Button variant="destructive" onClick={() => { setConfirm(true); setResult(null); }}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar {title}
          </Button>
        )}

        {confirm && (
          <div className="p-4 rounded-md border border-red-300 bg-red-50 space-y-3">
            <p className="text-sm font-medium text-red-700">
              Tem certeza? Esta ação irá remover todos os dados de <strong>{title}</strong>. Não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleClear} disabled={loading}>
                {loading ? 'Limpando...' : 'Sim, limpar'}
              </Button>
              <Button variant="outline" onClick={() => setConfirm(false)} disabled={loading}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {result?.ok && (
          <Button variant="outline" size="sm" onClick={() => setResult(null)}>
            Limpar novamente
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function Limpeza() {
  const { token } = useAuth();

  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [clearAllConfirm2, setClearAllConfirm2] = useState(false);
  const [clearAllLoading, setClearAllLoading] = useState(false);
  const [clearAllResult, setClearAllResult] = useState<ClearResult | null>(null);

  const handleClearAll = async () => {
    setClearAllLoading(true);
    setClearAllResult(null);
    try {
      const res = await fetch('/api/clear-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setClearAllResult({ ok: true, msg: data.message, counts: data.cleared });
      } else {
        setClearAllResult({ ok: false, msg: data.error || 'Erro ao executar limpeza geral.' });
      }
    } catch {
      setClearAllResult({ ok: false, msg: 'Erro de conexão.' });
    } finally {
      setClearAllLoading(false);
      setClearAllConfirm(false);
      setClearAllConfirm2(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Limpeza de Dados</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Remove dados operacionais por módulo. Usuários, empresa e configurações são sempre preservados.
        </p>
      </div>

      {/* Módulos individuais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ModuleCard
          title="Compras"
          description="Remove produtos, pedidos e histórico de aprovações."
          icon={ShoppingCart}
          iconColor="orange-700"
          borderColor="orange-200"
          module="compras"
          token={token!}
        />
        <ModuleCard
          title="Logística"
          description="Remove endereços de picking, estoque, ondas e tarefas de reabastecimento."
          icon={Warehouse}
          iconColor="blue-700"
          borderColor="blue-200"
          module="logistica"
          token={token!}
        />
        <ModuleCard
          title="Comercial (RCA)"
          description="Remove rotas, clientes de rota e visitas. Representantes são preservados."
          icon={BarChart2}
          iconColor="purple-700"
          borderColor="purple-200"
          module="comercial"
          token={token!}
        />
      </div>

      {/* Limpeza Geral */}
      <Card className="border-red-400 bg-red-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-800">
            <ShieldAlert className="h-5 w-5" />
            Limpeza Geral
          </CardTitle>
          <CardDescription className="text-red-700">
            Remove <strong>todos</strong> os dados transacionais de todos os módulos.
            Configurações, usuários, empresa e representantes RCA são preservados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {clearAllResult && <ResultBox result={clearAllResult} />}

          {!clearAllConfirm && !clearAllResult?.ok && (
            <Button
              variant="destructive"
              className="bg-red-700 hover:bg-red-800"
              onClick={() => { setClearAllConfirm(true); setClearAllResult(null); }}
            >
              <ShieldAlert className="h-4 w-4 mr-2" />
              Executar Limpeza Geral
            </Button>
          )}

          {clearAllConfirm && !clearAllConfirm2 && (
            <div className="p-4 rounded-md border border-red-400 bg-red-100 space-y-3">
              <p className="text-sm font-semibold text-red-800">
                ⚠ Atenção: esta ação irá apagar TODOS os dados transacionais (produtos, pedidos, picking, ondas, rotas, visitas). Não pode ser desfeita.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" className="bg-red-700 hover:bg-red-800" onClick={() => setClearAllConfirm2(true)}>
                  Sim, tenho certeza
                </Button>
                <Button variant="outline" onClick={() => setClearAllConfirm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {clearAllConfirm2 && (
            <div className="p-4 rounded-md border-2 border-red-600 bg-red-200 space-y-3">
              <p className="text-sm font-bold text-red-900">
                ÚLTIMA CONFIRMAÇÃO — Todos os dados serão apagados permanentemente.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="bg-red-800 hover:bg-red-900"
                  onClick={handleClearAll}
                  disabled={clearAllLoading}
                >
                  {clearAllLoading ? 'Executando limpeza...' : 'CONFIRMAR LIMPEZA TOTAL'}
                </Button>
                <Button variant="outline" onClick={() => { setClearAllConfirm(false); setClearAllConfirm2(false); }} disabled={clearAllLoading}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {clearAllResult?.ok && (
            <Button variant="outline" size="sm" onClick={() => setClearAllResult(null)}>
              Nova limpeza
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

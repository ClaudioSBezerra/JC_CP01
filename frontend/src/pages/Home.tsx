import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { ClipboardCheck, CheckCircle, XCircle, TrendingDown, Package, AlertTriangle } from 'lucide-react';

interface Summary {
  pending_orders: number;
  approved_today: number;
  rejected_today: number;
  saved_value: number;
  total_products: number;
  low_turnover_products: number;
}

interface Charts {
  top_products: { code: string; description: string; stock_days: number; stock_value: number }[];
  status_counts: { status: string; count: number }[];
  savings: { month: string; value: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  pendente: '#f59e0b',
  aprovado: '#22c55e',
  reprovado: '#ef4444',
  aprovado_parcial: '#3b82f6',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  aprovado_parcial: 'Parcial',
};

export default function Home() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);

  const fetchData = useCallback(() => {
    const headers = { Authorization: `Bearer ${token}` };

    fetch('/api/dashboard/summary', { headers })
      .then(r => r.json())
      .then(setSummary)
      .catch(console.error);

    fetch('/api/dashboard/charts', { headers })
      .then(r => r.json())
      .then(setCharts)
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    fetchData();

    // Auto-refresh a cada 30s
    const interval = setInterval(fetchData, 30000);

    // Refresh ao recuperar foco ou visibilidade da aba (cobre aprovar e voltar pela sidebar)
    window.addEventListener('focus', fetchData);
    document.addEventListener('visibilitychange', fetchData);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchData);
      document.removeEventListener('visibilitychange', fetchData);
    };
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.pending_orders ?? '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aprovados Hoje</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.approved_today ?? '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reprovados Hoje</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary?.rejected_today ?? '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Economizado</CardTitle>
            <TrendingDown className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{summary ? formatCurrency(summary.saved_value) : '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_products ?? '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Giro Baixo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary?.low_turnover_products ?? '-'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Products by Stock Days */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 - Maior Dias de Estoque</CardTitle>
          </CardHeader>
          <CardContent>
            {charts?.top_products && charts.top_products.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={charts.top_products} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="code" type="category" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number) => [`${Math.round(value)} dias`, 'Dias de Estoque']}
                    labelFormatter={(label) => {
                      const product = charts.top_products.find(p => p.code === label);
                      return product?.description || label;
                    }}
                  />
                  <Bar dataKey="stock_days" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Importe produtos para visualizar</p>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pedidos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {charts?.status_counts && charts.status_counts.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={charts.status_counts}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="count"
                    nameKey="status"
                    label={({ status, count }) => `${STATUS_LABELS[status] || status}: ${count}`}
                  >
                    {charts.status_counts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [value, STATUS_LABELS[name] || name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Importe pedidos para visualizar</p>
            )}
          </CardContent>
        </Card>

        {/* Savings Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Economia por Reprovacao (Mensal)</CardTitle>
          </CardHeader>
          <CardContent>
            {charts?.savings && charts.savings.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={[...charts.savings].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'Economia']} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Dados de economia aparecerao apos reprovacoes</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

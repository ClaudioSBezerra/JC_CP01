import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import { Warehouse, RefreshCw, Clock, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface FilialSummary {
  filial: string;
  total_locations: number;
  below_min: number;
  health_pct: number;
  frag_score: number;
  last_wave_at: string | null;
}

interface WaveSummary {
  id: number;
  filial: string;
  wave_number: string;
  status: string;
  total_tasks: number;
  generated_at: string;
}

interface Dashboard {
  filiais: FilialSummary[];
  recent_waves: WaveSummary[];
  last_sync_at: string | null;
  next_sync_in_minutes: number;
  picking_enabled: boolean;
  use_mock_winthor: boolean;
}

interface FragPoint { recorded_at: string; score: number; below_min: number; }
interface FragData { filial: string; current_score: number; trend_per_day: number; days_to_alert: number; history: FragPoint[]; }

const STATUS_COLORS: Record<string, string> = {
  gerada: 'bg-blue-100 text-blue-700 border-blue-200',
  enviada: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  concluida: 'bg-green-100 text-green-700 border-green-200',
  erro: 'bg-red-100 text-red-700 border-red-200',
};

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score < 30 ? 'text-green-600' : score < 60 ? 'text-amber-600' : 'text-red-600';
  const bg = score < 30 ? 'bg-green-100' : score < 60 ? 'bg-amber-100' : 'bg-red-100';
  return (
    <div className={`flex flex-col items-center p-3 rounded-lg ${bg}`}>
      <span className={`text-3xl font-bold ${color}`}>{score.toFixed(0)}</span>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
      <span className={`text-[10px] font-medium mt-0.5 ${color}`}>
        {score < 30 ? 'Saudavel' : score < 60 ? 'Atencao' : 'Critico'}
      </span>
    </div>
  );
}

export default function DashboardPicking() {
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [fragData, setFragData] = useState<FragData[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, fragRes] = await Promise.all([
        fetch('/api/picking/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/picking/fragmentation?days=7', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (fragRes.ok) setFragData((await fragRes.json()) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/picking/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Sincronizacao iniciada! Aguarde alguns segundos e atualize.');
        setTimeout(fetchData, 3000);
      }
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <p className="text-center py-8">Carregando...</p>;

  if (!dashboard?.picking_enabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard Picking</h1>
            <p className="text-sm text-muted-foreground">Modulo de gestao de picking e reabastecimento</p>
          </div>
        </div>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 pb-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Modulo de Picking desativado</p>
              <p className="text-sm text-amber-700 mt-1">
                Va em <strong>Logistica → Config. Picking</strong> para ativar o modulo e configurar a integracao com o Winthor.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build chart data from fragmentation history
  const chartData: Record<string, Record<string, number | string>> = {};
  for (const fd of fragData) {
    for (const pt of fd.history || []) {
      const day = pt.recorded_at.substring(0, 10);
      if (!chartData[day]) chartData[day] = { day };
      chartData[day][`Filial ${fd.filial}`] = pt.score;
    }
  }
  const chartArray = Object.values(chartData).sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const COLORS = ['#6366f1', '#f59e0b', '#10b981'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard Picking</h1>
            <p className="text-sm text-muted-foreground">Saude do picking por filial · reabastecimento automatico</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dashboard.use_mock_winthor && (
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              Mock Winthor
            </Badge>
          )}
          <div className="text-xs text-muted-foreground text-right">
            {dashboard.last_sync_at ? (
              <>
                <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> Ultimo sync: {new Date(dashboard.last_sync_at).toLocaleTimeString('pt-BR')}</div>
                {dashboard.next_sync_in_minutes > 0 && <div>Proximo em: ~{dashboard.next_sync_in_minutes} min</div>}
              </>
            ) : <div>Nenhum sync realizado</div>}
          </div>
          <Button onClick={handleSyncNow} disabled={syncing} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
          </Button>
        </div>
      </div>

      {/* Filial cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(dashboard.filiais || []).map((f) => (
          <Card key={f.filial} className={f.below_min > 0 ? 'border-amber-300' : 'border-green-200'}>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Filial {f.filial}</span>
                <Badge variant="outline" className={f.below_min > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'}>
                  {f.below_min > 0 ? `${f.below_min} abaixo min` : 'OK'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex items-center gap-3">
                <ScoreGauge score={f.frag_score} label="Score" />
                <div className="flex-1 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total locais:</span>
                    <span className="font-medium">{f.total_locations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saude:</span>
                    <span className={`font-medium ${f.health_pct > 80 ? 'text-green-600' : f.health_pct > 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {f.health_pct.toFixed(0)}%
                    </span>
                  </div>
                  {f.last_wave_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ultima onda:</span>
                      <span className="font-medium">{new Date(f.last_wave_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(dashboard.filiais || []).length === 0 && (
          <Card className="col-span-3 border-dashed">
            <CardContent className="pt-6 text-center text-muted-foreground text-sm">
              Nenhum endereco de picking cadastrado. Va em <strong>Enderecos</strong> e importe o CSV.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fragmentation trend chart */}
      {chartArray.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Score de Fragmentacao — Ultimos 7 dias
              <span className="text-xs font-normal text-muted-foreground">(0=otimo, 100=critico)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartArray}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {fragData.map((fd, i) => (
                  <Line
                    key={fd.filial}
                    type="monotone"
                    dataKey={`Filial ${fd.filial}`}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Fragmentation alerts */}
      {fragData.some(f => f.days_to_alert > 0 && f.days_to_alert < 10) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <TrendingUp className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-800 text-sm">Alerta de Fragmentacao</p>
                {fragData.filter(f => f.days_to_alert > 0 && f.days_to_alert < 10).map(f => (
                  <p key={f.filial} className="text-xs text-amber-700">
                    Filial {f.filial}: score atual {f.current_score.toFixed(0)} — estimativa de nivel critico em <strong>{f.days_to_alert} dias</strong>
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent waves */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ondas Recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(dashboard.recent_waves || []).length === 0 ? (
            <p className="text-center py-6 text-sm text-muted-foreground">
              Nenhuma onda gerada ainda. Clique em "Sincronizar Agora" para iniciar.
            </p>
          ) : (
            <div className="divide-y">
              {dashboard.recent_waves.map((w) => (
                <div key={w.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-medium">{w.wave_number}</span>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[w.status] || ''}`}>
                      {w.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{w.total_tasks} tarefas</span>
                    <span>{new Date(w.generated_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

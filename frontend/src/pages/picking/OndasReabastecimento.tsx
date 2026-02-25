import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Waves, RefreshCw, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface ReplenishmentTask {
  id: number;
  product_code: string;
  product_desc: string;
  location_code: string;
  current_qty: number;
  min_qty: number;
  qty_to_replenish: number;
  abc_class: string;
  priority: number;
  status: string;
  winthor_task_id: string;
}

interface Wave {
  id: number;
  filial: string;
  wave_number: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  triggered_by: string;
  generated_at: string;
  sent_to_winthor_at: string | null;
  completed_at: string | null;
  tasks?: ReplenishmentTask[];
}

interface WaveStats {
  filial: string;
  total_waves: number;
  waves_today: number;
  pending_tasks: number;
  completed_tasks: number;
}

const STATUS_COLORS: Record<string, string> = {
  gerada: 'bg-blue-100 text-blue-700 border-blue-200',
  enviada: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  concluida: 'bg-green-100 text-green-700 border-green-200',
  erro: 'bg-red-100 text-red-700 border-red-200',
};

const ABC_COLORS: Record<string, string> = {
  A: 'bg-purple-100 text-purple-700 border-purple-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-gray-100 text-gray-600 border-gray-200',
};

const TRIGGER_LABELS: Record<string, string> = {
  scheduler: 'Agendador',
  manual: 'Manual',
};

export default function OndasReabastecimento() {
  const { token } = useAuth();
  const [waves, setWaves] = useState<Wave[]>([]);
  const [stats, setStats] = useState<WaveStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filialFilter, setFilialFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateFilial, setGenerateFilial] = useState('01');

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filialFilter !== 'all') params.set('filial', filialFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [wavesRes, statsRes] = await Promise.all([
        fetch(`/api/waves?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/waves/stats', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (wavesRes.ok) setWaves((await wavesRes.json())?.waves || []);
      if (statsRes.ok) setStats((await statsRes.json())?.stats || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, filialFilter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchWaveDetail = async (waveId: number) => {
    if (expanded.has(waveId)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(waveId); return s; });
      return;
    }
    try {
      const res = await fetch(`/api/waves/${waveId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWaves(prev => prev.map(w => w.id === waveId ? { ...w, tasks: data.tasks || [] } : w));
        setExpanded(prev => new Set(prev).add(waveId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateWave = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/waves/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filial: generateFilial }),
      });
      if (res.ok) {
        toast.success(`Onda de reabastecimento gerada para filial ${generateFilial}`);
        setTimeout(fetchData, 1500);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erro ao gerar onda');
      }
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <p className="text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Waves className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Ondas de Reabastecimento</h1>
            <p className="text-sm text-muted-foreground">Historico de ondas geradas automaticamente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Select value={generateFilial} onValueChange={setGenerateFilial}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="01">Filial 01</SelectItem>
              <SelectItem value="02">Filial 02</SelectItem>
              <SelectItem value="03">Filial 03</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleGenerateWave} disabled={generating}>
            <Zap className="h-4 w-4 mr-2" />
            {generating ? 'Gerando...' : 'Gerar Onda'}
          </Button>
        </div>
      </div>

      {/* Stats by filial */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stats.map(s => (
            <Card key={s.filial}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Filial {s.filial}</span>
                  <Badge variant="outline" className="text-xs">{s.total_waves} ondas</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="font-bold text-blue-600">{s.pending_tasks}</div>
                    <div className="text-muted-foreground">Tarefas Pend.</div>
                  </div>
                  <div>
                    <div className="font-bold text-green-600">{s.completed_tasks}</div>
                    <div className="text-muted-foreground">Concluidas</div>
                  </div>
                  <div>
                    <div className="font-bold">{s.waves_today}</div>
                    <div className="text-muted-foreground">Hoje</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filialFilter} onValueChange={setFilialFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Filiais</SelectItem>
            <SelectItem value="01">Filial 01</SelectItem>
            <SelectItem value="02">Filial 02</SelectItem>
            <SelectItem value="03">Filial 03</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="gerada">Gerada</SelectItem>
            <SelectItem value="enviada">Enviada</SelectItem>
            <SelectItem value="concluida">Concluida</SelectItem>
            <SelectItem value="erro">Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Waves list */}
      {waves.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Nenhuma onda gerada ainda. Ative o picking e clique em "Gerar Onda" ou aguarde o agendador.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {waves.map(wave => (
                <div key={wave.id}>
                  {/* Wave header row */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => fetchWaveDetail(wave.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expanded.has(wave.id)
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                      <span className="font-mono text-xs font-medium">{wave.wave_number}</span>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[wave.status] || ''}`}>
                        {wave.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {TRIGGER_LABELS[wave.triggered_by] || wave.triggered_by}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-muted-foreground">
                      <span>{wave.total_tasks} tarefas</span>
                      {wave.completed_tasks > 0 && (
                        <span className="text-green-600">{wave.completed_tasks} concluidas</span>
                      )}
                      <span>{new Date(wave.generated_at).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>

                  {/* Expanded tasks */}
                  {expanded.has(wave.id) && wave.tasks && (
                    <div className="bg-muted/30 border-t px-4 py-3">
                      {/* ABC summary */}
                      <div className="flex items-center gap-3 mb-3 text-xs">
                        <span className="text-muted-foreground font-medium">Tarefas por classe:</span>
                        {['A', 'B', 'C'].map(cls => {
                          const count = wave.tasks!.filter(t => t.abc_class === cls).length;
                          return count > 0 ? (
                            <Badge key={cls} variant="outline" className={`text-[10px] ${ABC_COLORS[cls]}`}>
                              {count} × {cls}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                      {wave.tasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma tarefa nesta onda.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Produto</TableHead>
                              <TableHead className="text-xs">Endereco</TableHead>
                              <TableHead className="text-xs text-right">Atual</TableHead>
                              <TableHead className="text-xs text-right">Minimo</TableHead>
                              <TableHead className="text-xs text-right">Repor</TableHead>
                              <TableHead className="text-xs text-center">ABC</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {wave.tasks.map(task => (
                              <TableRow key={task.id} className="text-xs">
                                <TableCell>
                                  <div className="font-medium">{task.product_code}</div>
                                  <div className="text-muted-foreground truncate max-w-[180px]">{task.product_desc}</div>
                                </TableCell>
                                <TableCell className="font-mono">{task.location_code}</TableCell>
                                <TableCell className="text-right text-red-600">{task.current_qty.toFixed(0)}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{task.min_qty.toFixed(0)}</TableCell>
                                <TableCell className="text-right font-medium text-blue-600">{task.qty_to_replenish.toFixed(0)}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline" className={`text-[10px] ${ABC_COLORS[task.abc_class] || ''}`}>
                                    {task.abc_class}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[task.status] || ''}`}>
                                    {task.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

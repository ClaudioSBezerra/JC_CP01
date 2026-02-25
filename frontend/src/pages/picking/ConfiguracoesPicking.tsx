import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SlidersHorizontal, Eye, EyeOff, Plus, X, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface PickingSettings {
  picking_enabled: boolean;
  use_mock_winthor: boolean;
  winthor_api_url: string;
  winthor_api_key: string;
  sync_interval_minutes: number;
  sync_schedule: string;
  active_filiais: string;
}

interface SyncLog {
  id: number;
  filial: string;
  sync_type: string;
  status: string;
  records_processed: number;
  error_message: string;
  duration_ms: number;
  synced_at: string;
}

export default function ConfiguracoesPicking() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<PickingSettings>({
    picking_enabled: false,
    use_mock_winthor: true,
    winthor_api_url: '',
    winthor_api_key: '',
    sync_interval_minutes: 30,
    sync_schedule: '["06:00","12:00","18:00"]',
    active_filiais: '["01","02","03"]',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [newSchedule, setNewSchedule] = useState('');

  const scheduleArr: string[] = (() => {
    try { return JSON.parse(settings.sync_schedule); } catch { return []; }
  })();

  const filiaisArr: string[] = (() => {
    try { return JSON.parse(settings.active_filiais); } catch { return []; }
  })();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(prev => ({
            ...prev,
            picking_enabled: data.picking_enabled ?? false,
            use_mock_winthor: data.use_mock_winthor ?? true,
            winthor_api_url: data.winthor_api_url ?? '',
            winthor_api_key: data.winthor_api_key ?? '',
            sync_interval_minutes: data.sync_interval_minutes ?? 30,
            sync_schedule: data.sync_schedule ?? '["06:00","12:00","18:00"]',
            active_filiais: data.active_filiais ?? '["01","02","03"]',
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const fetchSyncLogs = async () => {
    try {
      const res = await fetch('/api/picking/sync-log', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSyncLogs((await res.json()) || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success('Configuracoes de picking salvas com sucesso');
      } else {
        toast.error('Erro ao salvar configuracoes');
      }
    } finally {
      setSaving(false);
    }
  };

  const addScheduleTime = () => {
    const val = newSchedule.trim();
    if (!val.match(/^\d{2}:\d{2}$/)) {
      toast.error('Formato invalido. Use HH:MM (ex: 14:30)');
      return;
    }
    if (scheduleArr.includes(val)) {
      toast.error('Horario ja cadastrado');
      return;
    }
    const updated = [...scheduleArr, val].sort();
    setSettings(s => ({ ...s, sync_schedule: JSON.stringify(updated) }));
    setNewSchedule('');
  };

  const removeScheduleTime = (t: string) => {
    const updated = scheduleArr.filter(x => x !== t);
    setSettings(s => ({ ...s, sync_schedule: JSON.stringify(updated) }));
  };

  const toggleFilial = (f: string) => {
    const updated = filiaisArr.includes(f)
      ? filiaisArr.filter(x => x !== f)
      : [...filiaisArr, f].sort();
    setSettings(s => ({ ...s, active_filiais: JSON.stringify(updated) }));
  };

  if (loading) return <p className="text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Configuracoes de Picking</h1>
            <p className="text-sm text-muted-foreground">Integracao Winthor · agendamento · filiais ativas</p>
          </div>
        </div>
      </div>

      {/* Module toggle */}
      <Card className={settings.picking_enabled ? 'border-green-200' : 'border-dashed'}>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Modulo de Picking</p>
              <p className="text-sm text-muted-foreground">
                {settings.picking_enabled
                  ? 'Ativo — agendador monitorando locais de picking'
                  : 'Inativo — ative para iniciar o monitoramento automatico'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={settings.picking_enabled
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'}
              >
                {settings.picking_enabled ? 'ATIVO' : 'INATIVO'}
              </Badge>
              <Switch
                checked={settings.picking_enabled}
                onCheckedChange={v => setSettings(s => ({ ...s, picking_enabled: v }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Winthor Integration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Integracao Winthor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Usar Mock (simulacao)</p>
              <p className="text-xs text-muted-foreground">
                Simula depleção de estoque para demonstração. Desative para usar a API real do Winthor.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={settings.use_mock_winthor
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'}
              >
                {settings.use_mock_winthor ? 'Mock' : 'Real'}
              </Badge>
              <Switch
                checked={settings.use_mock_winthor}
                onCheckedChange={v => setSettings(s => ({ ...s, use_mock_winthor: v }))}
              />
            </div>
          </div>

          {!settings.use_mock_winthor && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>URL da API Winthor</Label>
                  <Input
                    placeholder="https://api.winthor.com.br/v1"
                    value={settings.winthor_api_url}
                    onChange={e => setSettings(s => ({ ...s, winthor_api_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Chave de API</Label>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder="Chave de autenticacao da API"
                      value={settings.winthor_api_key}
                      onChange={e => setSettings(s => ({ ...s, winthor_api_key: e.target.value }))}
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowKey(!showKey)}
                      type="button"
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchSyncLogs}
                  className="w-full"
                >
                  Testar Conexao / Ver Log de Sync
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Agendamento de Sincronizacao
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Intervalo minimo (minutos)</Label>
            <Select
              value={String(settings.sync_interval_minutes)}
              onValueChange={v => setSettings(s => ({ ...s, sync_interval_minutes: Number(v) }))}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutos (teste)</SelectItem>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
                <SelectItem value="120">2 horas</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Frequencia maxima de sincronizacao automatica.</p>
          </div>

          <div className="space-y-2">
            <Label>Horarios fixos de sincronizacao</Label>
            <div className="flex flex-wrap gap-2">
              {scheduleArr.map(t => (
                <Badge key={t} variant="outline" className="flex items-center gap-1 text-sm py-1 px-2">
                  {t}
                  <button
                    onClick={() => removeScheduleTime(t)}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="HH:MM"
                className="w-28"
                value={newSchedule}
                onChange={e => setNewSchedule(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addScheduleTime()}
                maxLength={5}
              />
              <Button variant="outline" size="sm" onClick={addScheduleTime}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filiais */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filiais Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {['01', '02', '03'].map(f => (
              <div key={f} className="flex items-center gap-2">
                <Switch
                  id={`filial-${f}`}
                  checked={filiaisArr.includes(f)}
                  onCheckedChange={() => toggleFilial(f)}
                />
                <Label htmlFor={`filial-${f}`} className="cursor-pointer">Filial {f}</Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Apenas filiais ativas sao monitoradas pelo agendador.
          </p>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configuracoes'}
        </Button>
      </div>

      {/* Sync Log */}
      {syncLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Log de Sincronizacao</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {syncLogs.slice(0, 10).map(log => (
                <div key={log.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-3">
                    {log.status === 'success'
                      ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      : <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                    <span className="font-medium">{log.sync_type}</span>
                    {log.filial && <Badge variant="outline" className="text-[10px]">Filial {log.filial}</Badge>}
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    {log.records_processed > 0 && <span>{log.records_processed} registros</span>}
                    {log.duration_ms > 0 && <span>{log.duration_ms}ms</span>}
                    <span>{new Date(log.synced_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

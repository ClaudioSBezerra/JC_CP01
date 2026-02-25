import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GiroIndicator } from '@/components/GiroIndicator';
import { Settings, Save, CheckCircle } from 'lucide-react';

export default function Configuracoes() {
  const { token } = useAuth();
  const [lowDays, setLowDays] = useState(90);
  const [warnDays, setWarnDays] = useState(60);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setLowDays(data.low_turnover_days || 90);
        setWarnDays(data.warning_turnover_days || 60);
      })
      .catch(console.error);
  }, [token]);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          low_turnover_days: lowDays,
          warning_turnover_days: warnDays,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      console.error('Error saving settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" />
        Configuracoes
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Parametros de Giro de Estoque</CardTitle>
          <CardDescription>
            Configure os limites de dias de estoque para classificacao de giro dos produtos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="lowDays">Dias de estoque - Giro Baixo (vermelho)</Label>
              <Input
                id="lowDays"
                type="number"
                min={1}
                value={lowDays}
                onChange={(e) => setLowDays(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Produtos com estoque acima de {lowDays} dias serao sinalizados como giro baixo
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="warnDays">Dias de estoque - Atencao (amarelo)</Label>
              <Input
                id="warnDays"
                type="number"
                min={1}
                value={warnDays}
                onChange={(e) => setWarnDays(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Produtos entre {warnDays} e {lowDays} dias serao sinalizados como atencao
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-muted p-4 rounded-md space-y-3">
            <p className="text-sm font-medium">Pre-visualizacao dos semaforos:</p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <GiroIndicator stockDays={30} warningDays={warnDays} lowTurnoverDays={lowDays} />
                <span className="text-xs text-muted-foreground">Menos de {warnDays} dias</span>
              </div>
              <div className="flex items-center gap-2">
                <GiroIndicator stockDays={warnDays + 5} warningDays={warnDays} lowTurnoverDays={lowDays} />
                <span className="text-xs text-muted-foreground">Entre {warnDays} e {lowDays} dias</span>
              </div>
              <div className="flex items-center gap-2">
                <GiroIndicator stockDays={lowDays + 10} warningDays={warnDays} lowTurnoverDays={lowDays} />
                <span className="text-xs text-muted-foreground">Acima de {lowDays} dias</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={handleSave} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Salvando...' : 'Salvar Configuracoes'}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle className="h-4 w-4" />
                Configuracoes salvas!
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

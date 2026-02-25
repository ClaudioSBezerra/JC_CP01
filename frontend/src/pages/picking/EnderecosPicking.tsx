import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Truck, Upload, RefreshCw, Search, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface PickingLocation {
  id: number;
  filial: string;
  location_code: string;
  product_code: string;
  product_description: string;
  current_qty: number;
  min_qty: number;
  max_qty: number;
  abc_class: string;
  occupancy_pct: number;
  last_sync_at: string | null;
}

const ABC_COLORS: Record<string, string> = {
  A: 'bg-purple-100 text-purple-700 border-purple-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-gray-100 text-gray-600 border-gray-200',
};

function rowColorClass(loc: PickingLocation): string {
  if (loc.current_qty <= loc.min_qty) return 'bg-red-50 hover:bg-red-100';
  if (loc.occupancy_pct < 30) return 'bg-amber-50 hover:bg-amber-100';
  return 'hover:bg-muted/50';
}

export default function EnderecosPicking() {
  const { token } = useAuth();
  const [locations, setLocations] = useState<PickingLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filialFilter, setFilialFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchLocations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filialFilter !== 'all') params.set('filial', filialFilter);
      const res = await fetch(`/api/picking/locations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLocations(data?.items || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, filialFilter]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Selecione um arquivo CSV');
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/picking/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.imported || 0} enderecos importados com sucesso`);
        setShowImport(false);
        fetchLocations();
      } else {
        toast.error(data.error || 'Erro na importacao');
      }
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/picking/locations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Endereco removido');
        setLocations(prev => prev.filter(l => l.id !== id));
      }
    } finally {
      setDeleteId(null);
    }
  };

  const filtered = locations.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.location_code.toLowerCase().includes(q) ||
      l.product_code.toLowerCase().includes(q) ||
      l.product_description.toLowerCase().includes(q)
    );
  });

  const belowMin = locations.filter(l => l.current_qty <= l.min_qty).length;
  const lowOcc = locations.filter(l => l.current_qty > l.min_qty && l.occupancy_pct < 30).length;

  if (loading) return <p className="text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Enderecos de Picking</h1>
            <p className="text-sm text-muted-foreground">Gestao de locais · saldo atual vs minimo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLocations}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{locations.length}</div>
            <div className="text-xs text-muted-foreground">Total Enderecos</div>
          </CardContent>
        </Card>
        <Card className={belowMin > 0 ? 'border-red-200' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${belowMin > 0 ? 'text-red-600' : 'text-green-600'}`}>{belowMin}</div>
            <div className="text-xs text-muted-foreground">Abaixo do Minimo</div>
          </CardContent>
        </Card>
        <Card className={lowOcc > 0 ? 'border-amber-200' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${lowOcc > 0 ? 'text-amber-600' : ''}`}>{lowOcc}</div>
            <div className="text-xs text-muted-foreground">Ocupacao Baixa (&lt;30%)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-600">
              {locations.filter(l => l.current_qty > l.min_qty && l.occupancy_pct >= 30).length}
            </div>
            <div className="text-xs text-muted-foreground">Enderecos OK</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar endereco ou produto..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block" /> Abaixo min</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" /> Ocup &lt;30%</span>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {locations.length === 0
                ? 'Nenhum endereco cadastrado. Importe um CSV para comecar.'
                : 'Nenhum endereco encontrado para os filtros selecionados.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Filial</TableHead>
                  <TableHead>Endereco</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Atual</TableHead>
                  <TableHead className="text-right">Minimo</TableHead>
                  <TableHead className="text-right">Maximo</TableHead>
                  <TableHead className="text-right">Ocup.</TableHead>
                  <TableHead className="text-center">ABC</TableHead>
                  <TableHead>Ultimo Sync</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(loc => (
                  <TableRow key={loc.id} className={rowColorClass(loc)}>
                    <TableCell className="font-medium">{loc.filial}</TableCell>
                    <TableCell className="font-mono text-xs">{loc.location_code}</TableCell>
                    <TableCell>
                      <div className="font-medium text-xs">{loc.product_code}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{loc.product_description}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={loc.current_qty <= loc.min_qty ? 'text-red-600' : ''}>
                        {loc.current_qty.toFixed(0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{loc.min_qty.toFixed(0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{loc.max_qty.toFixed(0)}</TableCell>
                    <TableCell className="text-right">
                      <span className={loc.occupancy_pct < 30 ? 'text-amber-600 font-medium' : ''}>
                        {loc.occupancy_pct.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-[10px] ${ABC_COLORS[loc.abc_class] || ''}`}>
                        {loc.abc_class}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {loc.last_sync_at
                        ? new Date(loc.last_sync_at).toLocaleString('pt-BR')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        onClick={() => setDeleteId(loc.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Import Modal */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Enderecos de Picking (CSV)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">Formato esperado (separador: ponto-e-virgula):</p>
              <code className="block text-muted-foreground">FILIAL;ENDERECO;PRODUTO_COD;PRODUTO_DESC;MIN_QTD;MAX_QTD;ABC</code>
              <p className="text-muted-foreground mt-2">Exemplo:</p>
              <code className="block text-muted-foreground">01;A-01-02-1;001;ARROZ TIPO 1 5KG;50;200;A</code>
              <code className="block text-muted-foreground">02;B-03-01-2;007;MOLHO DE TOMATE 340G;20;80;B</code>
            </div>
            <div className="space-y-1">
              <Label htmlFor="csv-file">Arquivo CSV</Label>
              <Input id="csv-file" type="file" accept=".csv,.txt" ref={fileRef} />
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-amber-700">
                O CSV de exemplo esta disponivel em <strong>C:\TEMP\picking_enderecos_exemplo.csv</strong>
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importando...' : 'Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusao</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Deseja remover este endereco de picking? Esta acao nao pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';

interface HistoryEntry {
  id: number;
  order_id: number;
  order_number: string;
  item_id: number | null;
  product_code: string | null;
  action: string;
  user_name: string;
  reason: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  aprovado_parcial: 'Parcial',
};

export default function HistoricoAprovacoes() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/approvals/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEntries(data.history || []);
      setTotal(data.total || 0);
    } catch {
      console.error('Error fetching history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page, dateFrom, dateTo, statusFilter, token]);

  const exportToExcel = async () => {
    try {
      const xlsx = await import('xlsx');
      const data = entries.map(e => ({
        'Pedido': e.order_number,
        'Produto': e.product_code || 'Pedido completo',
        'Acao': ACTION_LABELS[e.action] || e.action,
        'Aprovador': e.user_name,
        'Motivo': e.reason || '',
        'Data': new Date(e.created_at).toLocaleString('pt-BR'),
      }));
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Historico');
      xlsx.writeFile(wb, `historico_aprovacoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      console.error('Error exporting');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historico de Aprovacoes</h1>
        <Button variant="outline" size="sm" onClick={exportToExcel}>
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Data inicio</label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Data fim</label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Acao</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Todas</option>
              <option value="aprovado">Aprovado</option>
              <option value="reprovado">Reprovado</option>
              <option value="aprovado_parcial">Parcial</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{total} registro{total !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : entries.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Acao</TableHead>
                    <TableHead>Aprovador</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">{new Date(entry.created_at).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="font-medium">{entry.order_number}</TableCell>
                      <TableCell>{entry.product_code || <span className="text-muted-foreground italic">Pedido completo</span>}</TableCell>
                      <TableCell>
                        <Badge variant={entry.action === 'aprovado' ? 'default' : entry.action === 'reprovado' ? 'destructive' : 'secondary'}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.user_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{entry.reason || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">Pagina {page} de {Math.ceil(total / 50)}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

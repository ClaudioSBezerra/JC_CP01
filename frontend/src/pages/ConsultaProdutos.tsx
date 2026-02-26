import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GiroIndicator } from '@/components/GiroIndicator';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { Search, Package, ChevronLeft, ChevronRight } from 'lucide-react';

interface Product {
  id: number;
  code: string;
  ean: string;
  description: string;
  category: string;
  unit: string;
  current_stock: number;
  avg_daily_sales: number;
  stock_days: number;
  cost_price: number;
  stock_filial_01: number;
  stock_filial_02: number;
  stock_filial_03: number;
  avg_daily_sales_filial_01: number;
  avg_daily_sales_filial_02: number;
  avg_daily_sales_filial_03: number;
  stock_days_filial_01: number;
  stock_days_filial_02: number;
  stock_days_filial_03: number;
  seasonality_type: string;
  peak_months: string;
  supplier_lead_time_days: number;
  min_stock_days: number;
  max_stock_days: number;
  last_purchase_date: string | null;
  last_sale_date: string | null;
}

type Filial = 'geral' | '01' | '02' | '03';

const FILIAL_LABELS: Record<Filial, string> = {
  geral: 'Geral',
  '01': 'Filial 01',
  '02': 'Filial 02',
  '03': 'Filial 03',
};


const MONTH_ABBR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function formatPeakMonths(peakMonths: string): string {
  if (!peakMonths) return '';
  const months = peakMonths.split(',')
    .map(m => MONTH_ABBR[parseInt(m.trim(), 10) - 1])
    .filter(Boolean);
  if (months.length === 0) return '';
  // Group consecutive months with '/' and separate groups with ' · '
  const result: string[] = [];
  let group: string[] = [months[0]];
  for (let i = 1; i < months.length; i++) {
    const prevIdx = MONTH_ABBR.indexOf(months[i - 1]);
    const currIdx = MONTH_ABBR.indexOf(months[i]);
    if (currIdx === prevIdx + 1 || (prevIdx === 11 && currIdx === 0)) {
      group.push(months[i]);
    } else {
      result.push(group.join('/'));
      group = [months[i]];
    }
  }
  result.push(group.join('/'));
  return result.join(' · ');
}

const CATEGORIES = ['ALIMENTOS', 'LATICINIOS', 'HIGIENE', 'LIMPEZA', 'BEBIDAS'];

function getFilialData(p: Product, filial: Filial) {
  switch (filial) {
    case '01': return { stock: p.stock_filial_01, vmd: p.avg_daily_sales_filial_01, days: p.stock_days_filial_01 };
    case '02': return { stock: p.stock_filial_02, vmd: p.avg_daily_sales_filial_02, days: p.stock_days_filial_02 };
    case '03': return { stock: p.stock_filial_03, vmd: p.avg_daily_sales_filial_03, days: p.stock_days_filial_03 };
    default:   return { stock: p.current_stock, vmd: p.avg_daily_sales, days: p.stock_days };
  }
}

export default function ConsultaProdutos() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [filial, setFilial] = useState<Filial>('geral');
  const [lowDays, setLowDays] = useState(90);
  const [warnDays, setWarnDays] = useState(60);

  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        ...(search && { search }),
        ...(category && { category }),
        ...(filial !== 'geral' && { filial }),
      });

      const [prodRes, settingsRes] = await Promise.all([
        fetch(`/api/products?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const prodData = await prodRes.json();
      setProducts(prodData.products || []);
      setTotal(prodData.total || 0);

      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setLowDays(s.low_turnover_days || 90);
        setWarnDays(s.warning_turnover_days || 60);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, page, search, category, filial]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat === category ? '' : cat);
    setPage(1);
  };

  const handleFilialChange = (f: Filial) => {
    setFilial(f);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Consulta de Produtos</h1>
          <p className="text-sm text-muted-foreground">Estoque, giro e DDV por filial</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <Input
              placeholder="Buscar por codigo ou descricao..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-sm"
            />
            <Button variant="secondary" onClick={handleSearch}>
              <Search className="h-4 w-4 mr-1" />
              Buscar
            </Button>
            {search && (
              <Button variant="ghost" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>
                Limpar
              </Button>
            )}
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Categoria:</span>
            <button
              onClick={() => { setCategory(''); setPage(1); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${category === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}
            >
              Todas
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Filial filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Exibir dados da:</span>
            {(['geral', '01', '02', '03'] as Filial[]).map(f => (
              <button
                key={f}
                onClick={() => handleFilialChange(f)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  filial === f
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                {FILIAL_LABELS[f]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>
              {loading ? 'Carregando...' : `${total} produto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
              {filial !== 'geral' && (
                <span className="ml-2 text-indigo-600">· dados de {FILIAL_LABELS[filial]}</span>
              )}
            </span>
            {total > 0 && (
              <span className="text-muted-foreground text-xs font-normal">
                Pagina {page} de {totalPages}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-[10px]">
                  <TableHead className="w-16 text-[10px] py-2">Codigo</TableHead>
                  <TableHead className="text-[10px] py-2">Descricao</TableHead>
                  <TableHead className="text-[10px] py-2">Categ.</TableHead>
                  <TableHead className="text-right text-[10px] py-2">Estoque</TableHead>
                  <TableHead className="text-right text-[10px] py-2">VMD</TableHead>
                  <TableHead className="text-center text-[10px] py-2">DDV</TableHead>
                  <TableHead className="text-center text-[10px] py-2">Giro</TableHead>
                  <TableHead className="text-right text-[10px] py-2">Custo</TableHead>
                  <TableHead className="text-center text-[10px] py-2">Sazonalidade</TableHead>
                  <TableHead className="text-right text-[10px] py-2">Prazo</TableHead>
                  <TableHead className="text-center text-[10px] py-2">Min/Max</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      {search || category ? 'Nenhum produto encontrado com os filtros aplicados.' : 'Nenhum produto cadastrado. Importe o CSV de produtos primeiro.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map(p => {
                    const fd = getFilialData(p, filial);
                    const effectiveDays = fd.days;

                    return (
                      <TableRow key={p.id} className={effectiveDays >= lowDays ? 'bg-red-50/40' : effectiveDays >= warnDays ? 'bg-amber-50/40' : ''}>
                        <TableCell className="font-mono text-[10px] font-medium py-1.5">{p.code}</TableCell>
                        <TableCell className="text-xs max-w-[200px] py-1.5">
                          <div className="truncate" title={p.description}>{p.description}</div>
                          {p.ean && <div className="text-[9px] text-muted-foreground">{p.ean}</div>}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-medium">{p.category}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium py-1.5">
                          {formatNumber(fd.stock, 0)}
                          <span className="text-[9px] text-muted-foreground ml-0.5">{p.unit}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs py-1.5">
                          {formatNumber(fd.vmd, 1)}
                        </TableCell>
                        <TableCell className="text-center py-1.5">
                          <span className={`text-xs font-bold ${effectiveDays >= lowDays ? 'text-red-600' : effectiveDays >= warnDays ? 'text-amber-600' : 'text-green-600'}`}>
                            {effectiveDays >= 9999 ? '---' : formatNumber(effectiveDays, 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center py-1.5">
                          <GiroIndicator
                            stockDays={effectiveDays}
                            warningDays={warnDays}
                            lowTurnoverDays={lowDays}
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs py-1.5">
                          {formatCurrency(p.cost_price)}
                        </TableCell>
                        <TableCell className="text-center py-1.5 text-xs">
                          {p.peak_months ? formatPeakMonths(p.peak_months) : 'ano todo'}
                        </TableCell>
                        <TableCell className="text-right text-xs py-1.5">
                          {p.supplier_lead_time_days > 0 ? `${p.supplier_lead_time_days}d` : '—'}
                        </TableCell>
                        <TableCell className="text-center text-[10px] text-muted-foreground py-1.5">
                          {p.min_stock_days > 0 || p.max_stock_days > 0
                            ? `${p.min_stock_days} / ${p.max_stock_days}`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-xs text-muted-foreground">
                Mostrando {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

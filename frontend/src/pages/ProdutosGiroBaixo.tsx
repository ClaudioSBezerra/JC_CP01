import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GiroIndicator } from '@/components/GiroIndicator';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

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
}

export default function ProdutosGiroBaixo() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/products/low-turnover', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setProducts(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const totalStockValue = products.reduce((sum, p) => sum + p.current_stock * p.cost_price, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <h1 className="text-2xl font-bold">Produtos com Giro Baixo</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{products.length} produto{products.length !== 1 ? 's' : ''} com giro baixo</span>
            <span className="text-red-600">Valor em estoque: {formatCurrency(totalStockValue)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : products.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhum produto com giro baixo encontrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Venda/Dia</TableHead>
                  <TableHead className="text-center">Dias Estoque</TableHead>
                  <TableHead className="text-right">Valor Estoque</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.code}</TableCell>
                    <TableCell className="max-w-[250px] truncate">{p.description}</TableCell>
                    <TableCell>{p.category || '-'}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.current_stock, 0)} {p.unit}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.avg_daily_sales, 1)}</TableCell>
                    <TableCell className="text-center">
                      <GiroIndicator stockDays={p.stock_days} warningDays={60} lowTurnoverDays={90} />
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600">
                      {formatCurrency(p.current_stock * p.cost_price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

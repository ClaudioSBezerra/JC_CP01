import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GiroIndicator } from '@/components/GiroIndicator';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, TrendingDown, TrendingUp, Truck, ChevronDown, ChevronUp, Warehouse, BarChart3, Sun } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface OrderItem {
  id: number;
  product_code: string;
  product_description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  stock_days: number;
  current_stock: number;
  avg_daily_sales: number;
  is_low_turnover: boolean;
  item_status: string;
  rejection_reason: string | null;
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
  coverage_post_purchase: number;
  risk_excess: boolean;
}

interface Order {
  id: number;
  order_number: string;
  supplier_name: string;
  supplier_cnpj: string;
  buyer_name: string;
  status: string;
  total_value: number;
  total_items: number;
  flagged_items: number;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  aprovado_parcial: 'Parcial',
};

const SEASONALITY_LABELS: Record<string, { label: string; color: string }> = {
  alta: { label: 'Alta', color: 'text-red-600 bg-red-50 border-red-200' },
  media: { label: 'Normal', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  baixa: { label: 'Baixa', color: 'text-green-600 bg-green-50 border-green-200' },
  sazonal: { label: 'Sazonal', color: 'text-orange-600 bg-orange-50 border-orange-200' },
};

function isInPeakMonth(peakMonths: string): boolean {
  if (!peakMonths) return false;
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  return peakMonths.split(',').map(m => m.trim().padStart(2, '0')).includes(currentMonth);
}

function getRiskLevel(item: OrderItem): { label: string; color: string; bg: string } {
  if (item.risk_excess) {
    return { label: 'EXCESSO', color: 'text-red-700', bg: 'bg-red-100 border-red-300' };
  }
  if (item.coverage_post_purchase > 0 && item.coverage_post_purchase > item.max_stock_days * 0.8) {
    return { label: 'ATENCAO', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300' };
  }
  if (item.avg_daily_sales > 0 && item.current_stock / item.avg_daily_sales < item.min_stock_days) {
    return { label: 'NECESSARIO', color: 'text-green-700', bg: 'bg-green-100 border-green-300' };
  }
  return { label: 'OK', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300' };
}

export default function DetalhesPedido() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const canApprove = user?.role === 'aprovador' || user?.role === 'admin';
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [lowDays, setLowDays] = useState(90);
  const [warnDays, setWarnDays] = useState(60);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState<'order' | number | null>(null);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrder(data.order);
      setItems(data.items || []);
      setLowDays(data.low_turnover_days || 90);
      setWarnDays(data.warning_turnover_days || 60);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id, token]);

  const handleApproveOrder = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/orders/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchOrder();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await fetch(`/api/orders/${id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      setShowRejectDialog(null);
      setRejectReason('');
      fetchOrder();
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveItem = async (itemId: number) => {
    setActionLoading(true);
    try {
      await fetch(`/api/orders/${id}/items/${itemId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchOrder();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectItem = async (itemId: number) => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await fetch(`/api/orders/${id}/items/${itemId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      setShowRejectDialog(null);
      setRejectReason('');
      fetchOrder();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <p className="text-center py-8">Carregando...</p>;
  if (!order) return <p className="text-center py-8">Pedido nao encontrado</p>;

  const isPending = order.status === 'pendente';
  const riskItems = items.filter(i => i.risk_excess);
  const lowTurnoverItems = items.filter(i => i.is_low_turnover);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold">Pedido #{order.order_number}</h1>
        <Badge variant={order.status === 'aprovado' ? 'default' : order.status === 'reprovado' ? 'destructive' : 'secondary'}>
          {STATUS_LABELS[order.status] || order.status}
        </Badge>
      </div>

      {/* Order Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Fornecedor</p>
            <p className="font-medium text-sm">{order.supplier_name}</p>
            {order.supplier_cnpj && <p className="text-xs text-muted-foreground">{order.supplier_cnpj}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Comprador</p>
            <p className="font-medium text-sm">{order.buyer_name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Valor Total</p>
            <p className="font-medium text-lg">{formatCurrency(order.total_value)}</p>
          </CardContent>
        </Card>
        <Card className={lowTurnoverItems.length > 0 ? 'border-amber-300 bg-amber-50/50' : ''}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Giro Baixo
            </p>
            <p className={`font-medium text-lg ${lowTurnoverItems.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {lowTurnoverItems.length} de {order.total_items}
            </p>
          </CardContent>
        </Card>
        <Card className={riskItems.length > 0 ? 'border-red-300 bg-red-50/50' : ''}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Risco Excesso
            </p>
            <p className={`font-medium text-lg ${riskItems.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {riskItems.length} {riskItems.length === 1 ? 'item' : 'itens'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Alert */}
      {riskItems.length > 0 && (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700 text-sm">Alerta de Excesso de Estoque</p>
                <p className="text-xs text-red-600 mt-1">
                  {riskItems.length} {riskItems.length === 1 ? 'item ultrapassa' : 'itens ultrapassam'} o estoque maximo em DDV apos a compra.
                  Valor total em risco: <strong>{formatCurrency(riskItems.reduce((s, i) => s + i.total_price, 0))}</strong>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {isPending && canApprove && (
        <Card>
          <CardContent className="pt-4 flex items-center gap-4">
            <Button onClick={handleApproveOrder} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Aprovar Pedido Completo
            </Button>
            <Button variant="destructive" onClick={() => setShowRejectDialog('order')} disabled={actionLoading}>
              <XCircle className="h-4 w-4 mr-2" />
              Reprovar Pedido Completo
            </Button>
          </CardContent>
        </Card>
      )}
      {isPending && !canApprove && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="pt-4 pb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700">
              Voce esta visualizando este pedido como <strong>comprador</strong>. Apenas aprovadores podem aprovar ou reprovar pedidos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      {showRejectDialog !== null && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-base text-red-700">
              Motivo da Reprovacao {typeof showRejectDialog === 'number' ? `(Item)` : '(Pedido)'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Informe o motivo da reprovacao..."
              className="min-h-[80px]"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  if (showRejectDialog === 'order') handleRejectOrder();
                  else handleRejectItem(showRejectDialog as number);
                }}
                disabled={!rejectReason.trim() || actionLoading}
              >
                Confirmar Reprovacao
              </Button>
              <Button variant="outline" onClick={() => { setShowRejectDialog(null); setRejectReason(''); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items Table - Intelligent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analise Inteligente dos Itens ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8"></TableHead>
                <TableHead>Codigo</TableHead>
                <TableHead>Descricao</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Giro</TableHead>
                <TableHead className="text-center">Risco</TableHead>
                <TableHead className="text-right">DDV Atual</TableHead>
                <TableHead className="text-right">DDV Pos-Compra</TableHead>
                <TableHead>Status</TableHead>
                {isPending && canApprove && <TableHead className="text-center">Acoes</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const risk = getRiskLevel(item);
                const inPeak = isInPeakMonth(item.peak_months);
                const isExpanded = expandedItem === item.id;

                return (
                  <>
                    <TableRow
                      key={item.id}
                      className={`cursor-pointer hover:bg-muted/30 ${item.risk_excess ? 'bg-red-50/50' : item.is_low_turnover ? 'bg-amber-50/30' : ''}`}
                      onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                    >
                      <TableCell className="px-2">
                        {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.product_code}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{item.product_description}</TableCell>
                      <TableCell className="text-right text-sm">{formatNumber(item.quantity, 0)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(item.total_price)}</TableCell>
                      <TableCell className="text-center">
                        <GiroIndicator stockDays={item.stock_days} warningDays={warnDays} lowTurnoverDays={lowDays} />
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${risk.bg} ${risk.color}`}>
                          {risk.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {item.stock_days < 9999 ? formatNumber(item.stock_days, 0) : '---'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={item.risk_excess ? 'text-red-600 font-bold' : ''}>
                          {item.coverage_post_purchase < 9999 ? formatNumber(item.coverage_post_purchase, 0) : '---'}
                        </span>
                        {item.max_stock_days > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-1">/{item.max_stock_days}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.item_status === 'aprovado' && <Badge variant="default" className="text-[10px]">Aprovado</Badge>}
                        {item.item_status === 'reprovado' && (
                          <div>
                            <Badge variant="destructive" className="text-[10px]">Reprovado</Badge>
                            {item.rejection_reason && (
                              <p className="text-[10px] text-red-600 mt-0.5">{item.rejection_reason}</p>
                            )}
                          </div>
                        )}
                        {item.item_status === 'pendente' && <Badge variant="secondary" className="text-[10px]">Pendente</Badge>}
                      </TableCell>
                      {isPending && canApprove && (
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {item.item_status === 'pendente' && (
                            <div className="flex gap-1 justify-center">
                              <Button variant="ghost" size="sm" onClick={() => handleApproveItem(item.id)} disabled={actionLoading} className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 w-7 p-0">
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setShowRejectDialog(item.id)} disabled={actionLoading} className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expanded Detail Row */}
                    {isExpanded && (
                      <TableRow key={`${item.id}-detail`} className="bg-slate-50/80">
                        <TableCell colSpan={isPending && canApprove ? 11 : 10} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                            {/* Branch Stock */}
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold flex items-center gap-1 text-slate-600">
                                <Warehouse className="h-3 w-3" /> Estoque por Filial
                              </h4>
                              <div className="space-y-1">
                                {[
                                  { name: 'Filial 01', stock: item.stock_filial_01, vmd: item.avg_daily_sales_filial_01, ddv: item.stock_days_filial_01 },
                                  { name: 'Filial 02', stock: item.stock_filial_02, vmd: item.avg_daily_sales_filial_02, ddv: item.stock_days_filial_02 },
                                  { name: 'Filial 03', stock: item.stock_filial_03, vmd: item.avg_daily_sales_filial_03, ddv: item.stock_days_filial_03 },
                                ].map(f => (
                                  <div key={f.name} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border">
                                    <span className="font-medium">{f.name}</span>
                                    <div className="flex gap-3">
                                      <span>Est: <strong>{formatNumber(f.stock, 0)}</strong></span>
                                      <span>VMD: <strong>{formatNumber(f.vmd, 1)}</strong></span>
                                      <span className={f.ddv >= lowDays ? 'text-red-600 font-bold' : f.ddv >= warnDays ? 'text-amber-600' : 'text-green-600'}>
                                        DDV: <strong>{f.ddv < 9999 ? formatNumber(f.ddv, 0) : '---'}</strong>
                                      </span>
                                    </div>
                                  </div>
                                ))}
                                <div className="flex items-center justify-between text-xs bg-slate-100 rounded px-2 py-1.5 border font-medium">
                                  <span>GERAL</span>
                                  <div className="flex gap-3">
                                    <span>Est: <strong>{formatNumber(item.current_stock, 0)}</strong></span>
                                    <span>VMD: <strong>{formatNumber(item.avg_daily_sales, 1)}</strong></span>
                                    <span>DDV: <strong>{item.stock_days < 9999 ? formatNumber(item.stock_days, 0) : '---'}</strong></span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Seasonality & Lead Time */}
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold flex items-center gap-1 text-slate-600">
                                <Sun className="h-3 w-3" /> Sazonalidade & Reposicao
                              </h4>
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">Sazonalidade:</span>
                                  <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${SEASONALITY_LABELS[item.seasonality_type]?.color || 'text-gray-600 bg-gray-50'}`}>
                                    {SEASONALITY_LABELS[item.seasonality_type]?.label || item.seasonality_type}
                                  </span>
                                  {inPeak && (
                                    <span className="px-2 py-0.5 rounded border text-[10px] font-bold text-orange-700 bg-orange-100 border-orange-300">
                                      MES DE PICO
                                    </span>
                                  )}
                                </div>
                                {item.peak_months && (
                                  <div className="text-xs text-muted-foreground">
                                    Meses pico: <span className="font-medium">{item.peak_months}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-xs">
                                  <Truck className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Prazo entrega:</span>
                                  <span className="font-medium">{item.supplier_lead_time_days} dias</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">Estoque Min/Max DDV:</span>
                                  <span className="font-medium">{item.min_stock_days} / {item.max_stock_days} dias</span>
                                </div>
                              </div>
                            </div>

                            {/* Analysis Summary */}
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold flex items-center gap-1 text-slate-600">
                                <BarChart3 className="h-3 w-3" /> Analise da Compra
                              </h4>
                              <div className="space-y-1.5 text-xs">
                                <div className="bg-white rounded px-2 py-1.5 border space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Estoque atual:</span>
                                    <span className="font-medium">{formatNumber(item.current_stock, 0)} un</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">+ Quantidade pedida:</span>
                                    <span className="font-medium">{formatNumber(item.quantity, 0)} un</span>
                                  </div>
                                  <div className="flex justify-between border-t pt-1">
                                    <span className="text-muted-foreground">= Estoque pos-compra:</span>
                                    <span className="font-bold">{formatNumber(item.current_stock + item.quantity, 0)} un</span>
                                  </div>
                                </div>
                                <div className={`rounded px-2 py-1.5 border ${item.risk_excess ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Cobertura pos-compra:</span>
                                    <span className={`font-bold ${item.risk_excess ? 'text-red-600' : 'text-green-600'}`}>
                                      {item.coverage_post_purchase < 9999 ? `${formatNumber(item.coverage_post_purchase, 0)} DDV` : 'Sem venda'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between mt-0.5">
                                    <span className="text-muted-foreground">Limite maximo:</span>
                                    <span className="font-medium">{item.max_stock_days} DDV</span>
                                  </div>
                                </div>
                                {item.avg_daily_sales > 0 && item.current_stock / item.avg_daily_sales + item.supplier_lead_time_days < item.min_stock_days && (
                                  <div className="bg-green-50 border-green-200 border rounded px-2 py-1.5 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                    <span className="text-green-700 font-medium">Compra justificada: estoque pode zerar antes da proxima reposicao</span>
                                  </div>
                                )}
                                {item.risk_excess && (
                                  <div className="bg-red-50 border-red-200 border rounded px-2 py-1.5 flex items-center gap-1">
                                    <TrendingDown className="h-3 w-3 text-red-600" />
                                    <span className="text-red-700 font-medium">Risco: estoque pos-compra excede o maximo em DDV</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>

          {/* Summary */}
          <div className="p-4 border-t flex flex-wrap items-center gap-6 text-sm">
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Itens giro baixo: <strong className="text-amber-600">{lowTurnoverItems.length}</strong>
              ({formatCurrency(lowTurnoverItems.reduce((s, i) => s + i.total_price, 0))})
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Itens risco excesso: <strong className="text-red-600">{riskItems.length}</strong>
              ({formatCurrency(riskItems.reduce((s, i) => s + i.total_price, 0))})
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

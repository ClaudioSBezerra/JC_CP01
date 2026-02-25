import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Route, Users, ChevronDown, ChevronUp } from 'lucide-react';

interface RCARepresentative {
  id: number;
  full_name: string;
  territory: string;
}

interface RCARoute {
  id: number;
  representative_id: number;
  name: string;
  description: string;
  is_active: boolean;
  customer_count: number;
}

interface RCACustomer {
  id: number;
  company_name: string;
  contact_name: string;
  phone: string;
  city: string;
  neighborhood: string;
  address: string;
  address_number: string;
  priority: number;
  notes: string;
}

export default function Rotas() {
  const { token } = useAuth();
  const [reps, setReps] = useState<RCARepresentative[]>([]);
  const [selectedRepId, setSelectedRepId] = useState('');
  const [routes, setRoutes] = useState<RCARoute[]>([]);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Record<number, RCACustomer[]>>({});
  const [showRouteDialog, setShowRouteDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [routeForm, setRouteForm] = useState({ name: '', description: '' });
  const [customerForm, setCustomerForm] = useState({
    company_name: '', contact_name: '', phone: '',
    city: '', neighborhood: '', address: '', address_number: '',
    priority: '1', notes: '',
  });

  const headers = { Authorization: `Bearer ${token}` };

  const fetchReps = useCallback(() => {
    fetch('/api/rca/representatives', { headers })
      .then(r => r.json())
      .then(data => setReps(data?.items || []));
  }, [token]);

  const fetchRoutes = useCallback(() => {
    if (!selectedRepId) return;
    fetch(`/api/rca/routes?rca_id=${selectedRepId}`, { headers })
      .then(r => r.json())
      .then(data => setRoutes(data?.items || []));
  }, [selectedRepId, token]);

  useEffect(() => { fetchReps(); }, [fetchReps]);
  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const fetchCustomers = (routeId: number) => {
    fetch(`/api/rca/routes/${routeId}/customers`, { headers })
      .then(r => r.json())
      .then(data => setCustomers(prev => ({ ...prev, [routeId]: data?.items || [] })));
  };

  const toggleRoute = (routeId: number) => {
    if (expandedRoute === routeId) {
      setExpandedRoute(null);
    } else {
      setExpandedRoute(routeId);
      if (!customers[routeId]) {
        fetchCustomers(routeId);
      }
    }
  };

  const handleCreateRoute = async () => {
    if (!routeForm.name || !selectedRepId) {
      toast.error('Selecione um representante e informe o nome da rota');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rca/routes', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ representative_id: parseInt(selectedRepId), name: routeForm.name, description: routeForm.description }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Rota criada com sucesso');
        setShowRouteDialog(false);
        setRouteForm({ name: '', description: '' });
        fetchRoutes();
      } else {
        toast.error(data || 'Erro ao criar rota');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomer = async (routeId: number) => {
    if (!customerForm.company_name) {
      toast.error('Informe o nome do cliente');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/rca/routes/${routeId}/customers`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...customerForm, priority: parseInt(customerForm.priority) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Cliente adicionado com sucesso');
        setShowCustomerDialog(null);
        setCustomerForm({ company_name: '', contact_name: '', phone: '', city: '', neighborhood: '', address: '', address_number: '', priority: '1', notes: '' });
        fetchCustomers(routeId);
        fetchRoutes();
      } else {
        toast.error(data || 'Erro ao adicionar cliente');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (custId: number, routeId: number) => {
    if (!confirm('Remover este cliente da rota?')) return;
    const res = await fetch(`/api/rca/customers/${custId}`, { method: 'DELETE', headers });
    if (res.ok) {
      toast.success('Cliente removido');
      fetchCustomers(routeId);
      fetchRoutes();
    } else {
      toast.error('Erro ao remover cliente');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rotas de Visita</h1>
        <Button onClick={() => setShowRouteDialog(true)} disabled={!selectedRepId}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Rota
        </Button>
      </div>

      {/* Select representative */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Label className="shrink-0">Representante:</Label>
            <Select value={selectedRepId} onValueChange={setSelectedRepId}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Selecione um RCA..." />
              </SelectTrigger>
              <SelectContent>
                {reps.map(rep => (
                  <SelectItem key={rep.id} value={String(rep.id)}>
                    {rep.full_name} {rep.territory ? `— ${rep.territory}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Routes list */}
      {selectedRepId && routes.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          Nenhuma rota cadastrada para este RCA. Clique em "Nova Rota" para começar.
        </p>
      )}

      {routes.map(route => (
        <Card key={route.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Route className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">{route.name}</CardTitle>
                  {route.description && (
                    <p className="text-xs text-muted-foreground">{route.description}</p>
                  )}
                </div>
                <Badge variant="outline">{route.customer_count} clientes</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowCustomerDialog(route.id); }}>
                  <Plus className="h-3 w-3 mr-1" />
                  Cliente
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleRoute(route.id)}>
                  {expandedRoute === route.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>

          {expandedRoute === route.id && (
            <CardContent>
              {(customers[route.id] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum cliente nesta rota. Clique em "Cliente" para adicionar.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Prio.</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Cidade / Bairro</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(customers[route.id] || []).map(c => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Badge variant="outline" className="w-8 justify-center">{c.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{c.company_name}</div>
                          {c.contact_name && <div className="text-xs text-muted-foreground">{c.contact_name}</div>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {[c.city, c.neighborhood].filter(Boolean).join(' / ') || '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {[c.address, c.address_number].filter(Boolean).join(', ') || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCustomer(c.id, route.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {/* Create Route Dialog */}
      <Dialog open={showRouteDialog} onOpenChange={setShowRouteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Rota</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Nome da Rota *</Label>
              <Input placeholder="Ex: Rota Norte — Setor Industrial" value={routeForm.name}
                onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input placeholder="Observações opcionais" value={routeForm.description}
                onChange={e => setRouteForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreateRoute} disabled={saving} className="flex-1">
                {saving ? 'Criando...' : 'Criar Rota'}
              </Button>
              <Button variant="outline" onClick={() => setShowRouteDialog(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={showCustomerDialog !== null} onOpenChange={open => !open && setShowCustomerDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Cliente à Rota</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nome da Empresa / Cliente *</Label>
                <Input value={customerForm.company_name}
                  onChange={e => setCustomerForm(f => ({ ...f, company_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Nome do Contato</Label>
                <Input value={customerForm.contact_name}
                  onChange={e => setCustomerForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={customerForm.phone}
                  onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Cidade</Label>
                <Input value={customerForm.city}
                  onChange={e => setCustomerForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={customerForm.neighborhood}
                  onChange={e => setCustomerForm(f => ({ ...f, neighborhood: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Endereço</Label>
                <Input value={customerForm.address}
                  onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input value={customerForm.address_number}
                  onChange={e => setCustomerForm(f => ({ ...f, address_number: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Prioridade (1 = primeiro a visitar)</Label>
                <Input type="number" min="1" value={customerForm.priority}
                  onChange={e => setCustomerForm(f => ({ ...f, priority: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Observações</Label>
                <Input value={customerForm.notes}
                  onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => showCustomerDialog && handleAddCustomer(showCustomerDialog)}
                disabled={saving}
                className="flex-1"
              >
                {saving ? 'Adicionando...' : 'Adicionar Cliente'}
              </Button>
              <Button variant="outline" onClick={() => setShowCustomerDialog(null)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

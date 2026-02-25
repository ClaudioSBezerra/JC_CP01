import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Users } from 'lucide-react';

interface RCARepresentative {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  vehicle_type: string;
  vehicle_plate: string;
  territory: string;
  is_active: boolean;
  today_visits: number;
  today_completed: number;
  created_at: string;
}

interface SystemUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
}

export default function Representantes() {
  const { token } = useAuth();
  const [reps, setReps] = useState<RCARepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>([]);

  const [form, setForm] = useState({
    user_id: '',
    vehicle_type: '',
    vehicle_plate: '',
    territory: '',
    phone: '',
  });

  const fetchReps = useCallback(() => {
    fetch('/api/rca/representatives', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setReps(data?.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const fetchUsers = useCallback(() => {
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(() => {
        // We'll use a simple query to list users — /api/auth/me returns current user
        // For now we list company users via representatives endpoint
      });
  }, [token]);

  useEffect(() => {
    fetchReps();
    fetchUsers();
  }, [fetchReps, fetchUsers]);

  const handleSave = async () => {
    if (!form.user_id) {
      toast.error('Informe o ID do usuário');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rca/representatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: parseInt(form.user_id),
          vehicle_type: form.vehicle_type,
          vehicle_plate: form.vehicle_plate,
          territory: form.territory,
          phone: form.phone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Representante criado com sucesso');
        setShowDialog(false);
        setForm({ user_id: '', vehicle_type: '', vehicle_plate: '', territory: '', phone: '' });
        fetchReps();
      } else {
        toast.error(data.error || data || 'Erro ao criar representante');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Representantes RCA</h1>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Representante
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Lista de Representantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : reps.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum representante cadastrado. Clique em "Novo Representante" para começar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Território</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map(rep => (
                  <TableRow key={rep.id}>
                    <TableCell className="font-medium">{rep.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{rep.email}</TableCell>
                    <TableCell className="text-sm">{rep.phone || '—'}</TableCell>
                    <TableCell className="text-sm">{rep.territory || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {rep.vehicle_type ? `${rep.vehicle_type} ${rep.vehicle_plate}`.trim() : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rep.is_active ? 'default' : 'secondary'}>
                        {rep.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Representative Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Representante RCA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-700">
              O usuário informado terá seu perfil alterado para o papel <strong>rca</strong>,
              permitindo acesso à rota mobile.
            </div>
            <div className="space-y-1">
              <Label>ID do Usuário *</Label>
              <Input
                type="number"
                placeholder="ID do usuário existente no sistema"
                value={form.user_id}
                onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                O usuário deve já estar registrado. Role será alterada para "rca".
              </p>
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                placeholder="(XX) XXXXX-XXXX"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Território / Região</Label>
              <Input
                placeholder="Ex: Zona Norte — Goiânia"
                value={form.territory}
                onChange={e => setForm(f => ({ ...f, territory: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Veículo</Label>
                <Input
                  placeholder="Ex: Carro, Moto"
                  value={form.vehicle_type}
                  onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Placa</Label>
                <Input
                  placeholder="ABC-1234"
                  value={form.vehicle_plate}
                  onChange={e => setForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? 'Salvando...' : 'Criar Representante'}
              </Button>
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

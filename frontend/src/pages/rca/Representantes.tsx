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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const EMPTY_PROFILE = { vehicle_type: '', vehicle_plate: '', territory: '', phone: '' };

export default function Representantes() {
  const { token } = useAuth();
  const [reps, setReps] = useState<RCARepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>([]);

  // New user form
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', ...EMPTY_PROFILE });
  // Link existing user form
  const [linkUser, setLinkUser] = useState({ user_id: '', ...EMPTY_PROFILE });

  const fetchReps = useCallback(() => {
    fetch('/api/rca/representatives', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setReps(data?.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const fetchUsers = useCallback(() => {
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setUsers(data?.items || []));
  }, [token]);

  useEffect(() => {
    fetchReps();
    fetchUsers();
  }, [fetchReps, fetchUsers]);

  const handleSaveNew = async () => {
    if (!newUser.full_name || !newUser.email || !newUser.password) {
      toast.error('Nome, e-mail e senha são obrigatórios');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rca/representatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newUser.full_name,
          email: newUser.email,
          password: newUser.password,
          vehicle_type: newUser.vehicle_type,
          vehicle_plate: newUser.vehicle_plate,
          territory: newUser.territory,
          phone: newUser.phone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Representante criado com sucesso');
        setShowDialog(false);
        setNewUser({ full_name: '', email: '', password: '', ...EMPTY_PROFILE });
        fetchReps();
        fetchUsers();
      } else {
        toast.error(data.error || data || 'Erro ao criar representante');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLink = async () => {
    if (!linkUser.user_id) {
      toast.error('Selecione um usuário');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rca/representatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: parseInt(linkUser.user_id),
          vehicle_type: linkUser.vehicle_type,
          vehicle_plate: linkUser.vehicle_plate,
          territory: linkUser.territory,
          phone: linkUser.phone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Representante vinculado com sucesso');
        setShowDialog(false);
        setLinkUser({ user_id: '', ...EMPTY_PROFILE });
        fetchReps();
        fetchUsers();
      } else {
        toast.error(data.error || data || 'Erro ao vincular representante');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const profileFields = (
    vals: typeof EMPTY_PROFILE,
    set: (fn: (v: typeof EMPTY_PROFILE) => typeof EMPTY_PROFILE) => void
  ) => (
    <>
      <div className="space-y-1">
        <Label>Telefone</Label>
        <Input
          placeholder="(XX) XXXXX-XXXX"
          value={vals.phone}
          onChange={e => set(v => ({ ...v, phone: e.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <Label>Território / Região</Label>
        <Input
          placeholder="Ex: Zona Norte — Goiânia"
          value={vals.territory}
          onChange={e => set(v => ({ ...v, territory: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Tipo de Veículo</Label>
          <Input
            placeholder="Carro, Moto..."
            value={vals.vehicle_type}
            onChange={e => set(v => ({ ...v, vehicle_type: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Placa</Label>
          <Input
            placeholder="ABC-1234"
            value={vals.vehicle_plate}
            onChange={e => set(v => ({ ...v, vehicle_plate: e.target.value }))}
          />
        </div>
      </div>
    </>
  );

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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Representante RCA</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="new" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="new" className="flex-1">Criar usuário</TabsTrigger>
              <TabsTrigger value="link" className="flex-1">Vincular existente</TabsTrigger>
            </TabsList>

            {/* Tab: criar novo usuário + perfil RCA */}
            <TabsContent value="new" className="space-y-4 mt-4">
              <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-700">
                Cria o login e o perfil RCA em uma única operação.
              </div>
              <div className="space-y-1">
                <Label>Nome completo *</Label>
                <Input
                  placeholder="João Silva"
                  value={newUser.full_name}
                  onChange={e => setNewUser(v => ({ ...v, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  placeholder="joao.rca@jc.com.br"
                  value={newUser.email}
                  onChange={e => setNewUser(v => ({ ...v, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Senha *</Label>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newUser.password}
                  onChange={e => setNewUser(v => ({ ...v, password: e.target.value }))}
                />
              </div>
              {profileFields(newUser, setNewUser as any)}
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveNew} disabled={saving} className="flex-1">
                  {saving ? 'Salvando...' : 'Criar Representante'}
                </Button>
                <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
                  Cancelar
                </Button>
              </div>
            </TabsContent>

            {/* Tab: vincular usuário já existente */}
            <TabsContent value="link" className="space-y-4 mt-4">
              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-700">
                O usuário selecionado terá o perfil promovido para <strong>rca</strong>.
              </div>
              <div className="space-y-1">
                <Label>Usuário *</Label>
                <Select
                  value={linkUser.user_id}
                  onValueChange={v => setLinkUser(u => ({ ...u, user_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um usuário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.full_name} — {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {profileFields(linkUser, setLinkUser as any)}
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveLink} disabled={saving} className="flex-1">
                  {saving ? 'Salvando...' : 'Vincular Representante'}
                </Button>
                <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
                  Cancelar
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

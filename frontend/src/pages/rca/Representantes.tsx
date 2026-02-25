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

// ── Formulário: criar novo usuário RCA ───────────────────────────────────────
function CreateForm({ token, onSaved, onCancel }: {
  token: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [territory, setTerritory] = useState('');
  const [vehicle_type, setVehicleType] = useState('');
  const [vehicle_plate, setVehiclePlate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!full_name || !email || !password) {
      toast.error('Nome, e-mail e senha são obrigatórios');
      return;
    }
    if (password.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rca/representatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, email, password, phone, territory, vehicle_type, vehicle_plate }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Representante criado com sucesso');
        onSaved();
      } else {
        toast.error(data.error || 'Erro ao criar representante');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="px-2 py-1.5 rounded bg-blue-50 border border-blue-200 text-xs text-blue-700">
        Cria o login e o perfil RCA em uma única operação.
      </div>
      <div className="space-y-0.5">
        <Label className="text-xs text-muted-foreground">Nome completo *</Label>
        <Input className="h-8 text-sm" placeholder="João Silva"
          value={full_name} onChange={e => setFullName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">E-mail *</Label>
          <Input className="h-8 text-sm" placeholder="joao@jc.com.br"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Senha *</Label>
          <Input className="h-8 text-sm" type="password" placeholder="Mín. 6 chars"
            value={password} onChange={e => setPassword(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Telefone</Label>
          <Input className="h-8 text-sm" placeholder="(XX) XXXXX-XXXX"
            value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Território</Label>
          <Input className="h-8 text-sm" placeholder="Zona Norte"
            value={territory} onChange={e => setTerritory(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Tipo de Veículo</Label>
          <Input className="h-8 text-sm" placeholder="Carro, Moto..."
            value={vehicle_type} onChange={e => setVehicleType(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Placa</Label>
          <Input className="h-8 text-sm" placeholder="ABC-1234"
            value={vehicle_plate} onChange={e => setVehiclePlate(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Salvando...' : 'Criar Representante'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── Formulário: vincular usuário existente ───────────────────────────────────
function LinkForm({ token, users, onSaved, onCancel }: {
  token: string;
  users: SystemUser[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [user_id, setUserId] = useState('');
  const [phone, setPhone] = useState('');
  const [territory, setTerritory] = useState('');
  const [vehicle_type, setVehicleType] = useState('');
  const [vehicle_plate, setVehiclePlate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user_id) {
      toast.error('Selecione um usuário');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rca/representatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: parseInt(user_id), phone, territory, vehicle_type, vehicle_plate }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Representante vinculado com sucesso');
        onSaved();
      } else {
        toast.error(data.error || 'Erro ao vincular representante');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
        O usuário selecionado será promovido para <strong>rca</strong>.
      </div>
      <div className="space-y-0.5">
        <Label className="text-xs text-muted-foreground">Usuário *</Label>
        <Select value={user_id} onValueChange={setUserId}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {users.map(u => (
              <SelectItem key={u.id} value={String(u.id)} className="text-sm">
                {u.full_name} — {u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Telefone</Label>
          <Input className="h-8 text-sm" placeholder="(XX) XXXXX-XXXX"
            value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Território</Label>
          <Input className="h-8 text-sm" placeholder="Zona Norte"
            value={territory} onChange={e => setTerritory(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Tipo de Veículo</Label>
          <Input className="h-8 text-sm" placeholder="Carro, Moto..."
            value={vehicle_type} onChange={e => setVehicleType(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">Placa</Label>
          <Input className="h-8 text-sm" placeholder="ABC-1234"
            value={vehicle_plate} onChange={e => setVehiclePlate(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Salvando...' : 'Vincular Representante'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Representantes() {
  const { token } = useAuth();
  const [reps, setReps] = useState<RCARepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>([]);

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

  const handleSaved = () => {
    setShowDialog(false);
    fetchReps();
    fetchUsers();
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-base">Novo Representante RCA</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="new">
            <TabsList className="w-full h-8">
              <TabsTrigger value="new" className="flex-1 text-xs">Criar usuário</TabsTrigger>
              <TabsTrigger value="link" className="flex-1 text-xs">Vincular existente</TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="mt-2">
              <CreateForm token={token!} onSaved={handleSaved} onCancel={() => setShowDialog(false)} />
            </TabsContent>
            <TabsContent value="link" className="mt-2">
              <LinkForm token={token!} users={users} onSaved={handleSaved} onCancel={() => setShowDialog(false)} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

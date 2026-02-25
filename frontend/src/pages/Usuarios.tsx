import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Users, ShieldCheck } from 'lucide-react';

interface UserItem {
  id: number;
  full_name: string;
  email: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  rca: 'RCA',
  viewer: 'Visualizador',
};

const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  rca: 'secondary',
  viewer: 'outline',
};

// ── Formulário isolado para não perder foco ──────────────────────────────────
function NovoUsuarioForm({ token, onSaved, onCancel }: {
  token: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
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
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, email, password, role }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Usuário criado com sucesso');
        onSaved();
      } else {
        toast.error(data.error || data || 'Erro ao criar usuário');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
      <div className="space-y-1">
        <Label>Nome completo *</Label>
        <Input placeholder="Luana Costa" value={full_name} onChange={e => setFullName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>E-mail *</Label>
        <Input placeholder="luana@jc.com.br" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Senha *</Label>
        <Input type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Perfil</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin — acesso completo</SelectItem>
            <SelectItem value="viewer">Visualizador — somente leitura</SelectItem>
            <SelectItem value="rca">RCA — acesso mobile à rota</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Criando...' : 'Criar Usuário'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Usuarios() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<{ id: number; role: string } | null>(null);

  const fetchUsers = useCallback(() => {
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setUsers(data?.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      toast.success('Perfil atualizado');
      setEditingRole(null);
      fetchUsers();
    } else {
      toast.error('Erro ao atualizar perfil');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestão de Usuários</h1>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Usuários da Empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {editingRole?.id === u.id ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={editingRole.role}
                            onValueChange={v => setEditingRole({ id: u.id, role: v })}
                          >
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="viewer">Visualizador</SelectItem>
                              <SelectItem value="rca">RCA</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-7 text-xs px-2"
                            onClick={() => handleRoleChange(u.id, editingRole.role)}>
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                            onClick={() => setEditingRole(null)}>
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <Badge variant={ROLE_VARIANT[u.role] ?? 'outline'}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setEditingRole({ id: u.id, role: u.role })}
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Alterar perfil
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <NovoUsuarioForm
            token={token!}
            onSaved={() => { setShowDialog(false); fetchUsers(); }}
            onCancel={() => setShowDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

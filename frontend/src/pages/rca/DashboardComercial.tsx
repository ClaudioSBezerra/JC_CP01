import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, MapPin, CheckCircle, Clock, ChevronRight, ExternalLink, AlertTriangle, Bell } from 'lucide-react';

const ALERT_THRESHOLD_M = 5;

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
import { Button } from '@/components/ui/button';

// Fix Leaflet icon in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const activeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

interface RCARepresentative {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  vehicle_type: string;
  vehicle_plate: string;
  territory: string;
  is_active: boolean;
  last_checkin_at: string | null;
  today_visits: number;
  today_completed: number;
}

interface RCADashboard {
  total_active: number;
  total_visits_today: number;
  total_pending: number;
  total_completed: number;
  representatives: RCARepresentative[];
}

// Last known positions per rep (from today's visits)
interface RepPosition {
  rep: RCARepresentative;
  lat: number;
  lng: number;
  customer_name: string;
  checkin_at: string;
}

function formatDateTime(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('pt-BR', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  });
}

export default function DashboardComercial() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<RCADashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<RepPosition[]>([]);
  const [alertCounts, setAlertCounts] = useState<Record<number, number>>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [selectedRep, setSelectedRep] = useState<RCARepresentative | null>(null);

  const fetchDashboard = useCallback(() => {
    fetch('/api/rca/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setDashboard(data);
        setLoading(false);
        // Fetch last positions for reps that have check-ins today
        const reps: RCARepresentative[] = data?.representatives || [];
        const today = new Date().toISOString().slice(0, 10);
        reps.forEach(rep => {
          if (rep.today_visits > 0) {
            fetch(`/api/rca/${rep.id}/visits?date=${today}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(r => r.json())
              .then(vdata => {
                const visits = vdata?.visits || [];
                // Get the last visit with GPS
                const withGPS = [...visits].reverse().find(
                  (v: any) => v.checkin_lat && v.checkin_lng
                );
                if (withGPS) {
                  setPositions(prev => {
                    const filtered = prev.filter(p => p.rep.id !== rep.id);
                    return [...filtered, {
                      rep,
                      lat: withGPS.checkin_lat,
                      lng: withGPS.checkin_lng,
                      customer_name: withGPS.customer_name,
                      checkin_at: withGPS.checkin_at,
                    }];
                  });
                }
                // Count alert visits (GPS > ALERT_THRESHOLD_M from customer address)
                const count = visits.filter((v: any) =>
                  v.checkin_lat && v.checkin_lng && v.customer_lat && v.customer_lng &&
                  haversineDistance(v.checkin_lat, v.checkin_lng, v.customer_lat, v.customer_lng) > ALERT_THRESHOLD_M
                ).length;
                setAlertCounts(prev => ({ ...prev, [rep.id]: count }));
              });
          }
        });
      })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    window.addEventListener('focus', fetchDashboard);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchDashboard);
    };
  }, [fetchDashboard]);

  const reps = dashboard?.representatives || [];
  const totalAlerts = Object.values(alertCounts).reduce((sum, c) => sum + c, 0);

  const handleOpenMap = (rep: RCARepresentative) => {
    setSelectedRep(rep);
    setMapOpen(true);
  };

  const selectedPos = selectedRep ? positions.find(p => p.rep.id === selectedRep.id) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard Comercial</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">RCAs Ativos</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.total_active ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Visitas Hoje</CardTitle>
            <MapPin className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.total_visits_today ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{dashboard?.total_completed ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{dashboard?.total_pending ?? '—'}</div>
          </CardContent>
        </Card>
        <Card className={totalAlerts > 0 ? 'border-red-400 bg-red-50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className={`text-sm font-medium ${totalAlerts > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
              Alertas GPS
            </CardTitle>
            <Bell className={`h-4 w-4 ${totalAlerts > 0 ? 'text-red-600' : 'text-gray-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalAlerts > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {totalAlerts}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">&gt;{ALERT_THRESHOLD_M}m do cliente</div>
          </CardContent>
        </Card>
      </div>

      {/* Alert banner */}
      {totalAlerts > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
          <div>
            <p className="font-semibold">
              {totalAlerts} check-in{totalAlerts > 1 ? 's' : ''} com localização suspeita hoje
            </p>
            <p className="text-sm mt-0.5">
              GPS registrado a mais de {ALERT_THRESHOLD_M}m do endereço cadastrado.
              Acesse os detalhes de cada RCA para verificar no mapa.
            </p>
          </div>
        </div>
      )}

      {/* Overview map — all active reps */}
      {positions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600" />
              Localização dos RCAs — Hoje
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Última posição de check-in registrada. Atualiza a cada 30 segundos.
            </p>
          </CardHeader>
          <CardContent className="p-0 rounded-b-lg overflow-hidden">
            <MapContainer
              center={[positions[0].lat, positions[0].lng]}
              zoom={12}
              style={{ height: '320px', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {positions.map(pos => (
                <Marker key={pos.rep.id} position={[pos.lat, pos.lng]} icon={activeIcon}>
                  <Popup>
                    <div className="text-sm min-w-[180px]">
                      <div className="font-semibold">{pos.rep.full_name}</div>
                      <div className="text-gray-500 text-xs">{pos.rep.territory}</div>
                      <div className="mt-1 text-green-700">📍 {pos.customer_name}</div>
                      <div className="text-xs text-gray-500">
                        {pos.checkin_at ? new Date(pos.checkin_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </CardContent>
        </Card>
      )}

      {/* Representatives table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Representantes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : reps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum representante cadastrado. Acesse <strong>Representantes</strong> para adicionar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Território</TableHead>
                  <TableHead className="text-center">Visitas Hoje</TableHead>
                  <TableHead className="text-center">Concluídas</TableHead>
                  <TableHead>Último Check-in</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Alertas</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map(rep => {
                  const hasPos = positions.some(p => p.rep.id === rep.id);
                  const progressPct = rep.today_visits > 0
                    ? Math.round((rep.today_completed / rep.today_visits) * 100)
                    : 0;
                  const repAlerts = alertCounts[rep.id] ?? 0;
                  return (
                    <TableRow key={rep.id} className={repAlerts > 0 ? 'bg-red-50/50' : ''}>
                      <TableCell>
                        <div className="font-medium">{rep.full_name}</div>
                        <div className="text-xs text-muted-foreground">{rep.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">{rep.territory || '—'}</TableCell>
                      <TableCell className="text-center">
                        <div className="font-medium">{rep.today_visits}</div>
                        {rep.today_visits > 0 && (
                          <div className="text-xs text-muted-foreground">{progressPct}%</div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600 font-medium">{rep.today_completed}</span>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateTime(rep.last_checkin_at)}</TableCell>
                      <TableCell>
                        <Badge variant={rep.is_active ? 'default' : 'secondary'}>
                          {rep.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {repAlerts > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded-full px-2 py-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            {repAlerts}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {hasPos && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenMap(rep)}
                              title="Ver localização"
                            >
                              <MapPin className="h-3 w-3 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/rca/${rep.id}`)}
                            title="Ver detalhes"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mini-map modal for individual RCA */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600" />
              {selectedRep?.full_name} — Última localização
            </DialogTitle>
            {selectedPos && (
              <p className="text-sm text-muted-foreground">
                📍 {selectedPos.customer_name} &nbsp;·&nbsp;
                {new Date(selectedPos.checkin_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </DialogHeader>

          {selectedPos ? (
            <MapContainer
              key={selectedPos.rep.id}
              center={[selectedPos.lat, selectedPos.lng]}
              zoom={15}
              style={{ height: '380px', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[selectedPos.lat, selectedPos.lng]} icon={activeIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">{selectedPos.rep.full_name}</div>
                    <div className="text-green-700">📍 {selectedPos.customer_name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {selectedPos.lat.toFixed(6)}, {selectedPos.lng.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="h-64 flex items-center justify-center bg-muted">
              <p className="text-muted-foreground">Nenhuma localização disponível</p>
            </div>
          )}

          <div className="px-6 py-3 flex justify-between items-center border-t bg-card">
            <span className="text-xs text-muted-foreground">
              {selectedPos ? `${selectedPos.lat.toFixed(6)}, ${selectedPos.lng.toFixed(6)}` : ''}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate(`/rca/${selectedRep?.id}`)}>
              Ver histórico completo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

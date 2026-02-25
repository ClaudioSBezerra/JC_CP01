import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, Clock, XCircle, MapPin, List, Map, Building2, AlertTriangle, Bell } from 'lucide-react';

const ALERT_THRESHOLD_M = 5; // meters — check-ins beyond this are flagged

// Fix Leaflet icon paths broken by Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const gpsIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const checkoutIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const addressIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

interface RCAVisit {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_city: string;
  customer_neighborhood: string;
  customer_address: string;
  customer_address_number: string;
  customer_lat: number | null;
  customer_lng: number | null;
  visit_date: string;
  status: string;
  checkin_at: string | null;
  checkin_lat: number | null;
  checkin_lng: number | null;
  checkout_at: string | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  duration_minutes: number | null;
  notes: string;
}

interface GeocodedAddress {
  lat: number;
  lng: number;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  concluida:    { label: 'Concluída',    variant: 'default' },
  em_visita:    { label: 'Em Visita',    variant: 'outline' },
  agendada:     { label: 'Agendada',     variant: 'secondary' },
  nao_visitado: { label: 'Não Visitado', variant: 'destructive' },
};

function formatTime(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Calculate distance in meters between two GPS points
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

// Synchronous distance for visits that have stored customer lat/lng
function visitDistance(visit: RCAVisit): number | null {
  if (!visit.checkin_lat || !visit.checkin_lng || !visit.customer_lat || !visit.customer_lng) return null;
  return haversineDistance(visit.checkin_lat, visit.checkin_lng, visit.customer_lat, visit.customer_lng);
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [50, 50], maxZoom: 17 });
    }
  }, [map, positions]);
  return null;
}

// Geocode an address using Nominatim (OpenStreetMap — free, no key)
async function geocodeAddress(address: string, city: string): Promise<GeocodedAddress | null> {
  const query = encodeURIComponent(`${address}, ${city}, Brasil`);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch { /* silently fail */ }
  return null;
}

// Individual visit map modal
function VisitMapModal({
  visit,
  open,
  onClose,
}: {
  visit: RCAVisit | null;
  open: boolean;
  onClose: () => void;
}) {
  const [geocoded, setGeocoded] = useState<GeocodedAddress | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const prevVisitId = useRef<number | null>(null);

  useEffect(() => {
    if (!visit || !open) return;
    if (prevVisitId.current === visit.id) return;
    prevVisitId.current = visit.id;

    // If customer already has lat/lng stored, use it
    if (visit.customer_lat && visit.customer_lng) {
      setGeocoded({ lat: visit.customer_lat, lng: visit.customer_lng });
      return;
    }

    // Otherwise geocode the address
    if (visit.customer_address && visit.customer_city) {
      setGeocoding(true);
      const fullAddress = `${visit.customer_address} ${visit.customer_address_number}, ${visit.customer_neighborhood}, ${visit.customer_city}`;
      geocodeAddress(fullAddress, visit.customer_city).then(result => {
        setGeocoded(result);
        setGeocoding(false);
      });
    }
  }, [visit, open]);

  if (!visit || !open) return null;

  const hasCheckinGPS = visit.checkin_lat && visit.checkin_lng;
  const hasAddressGPS = geocoded || (visit.customer_lat && visit.customer_lng);
  const addressPos: [number, number] | null =
    geocoded ? [geocoded.lat, geocoded.lng]
    : visit.customer_lat && visit.customer_lng ? [visit.customer_lat, visit.customer_lng]
    : null;

  // Calculate distance between check-in GPS and address
  let distanceMeters: number | null = null;
  if (hasCheckinGPS && addressPos) {
    distanceMeters = haversineDistance(
      visit.checkin_lat!, visit.checkin_lng!,
      addressPos[0], addressPos[1]
    );
  }

  const distanceOk = distanceMeters !== null && distanceMeters <= ALERT_THRESHOLD_M;
  const distanceAlert = distanceMeters !== null && distanceMeters > ALERT_THRESHOLD_M;

  // Check distance for checkout too
  let checkoutDistanceMeters: number | null = null;
  if (visit.checkout_lat && visit.checkout_lng && addressPos) {
    checkoutDistanceMeters = haversineDistance(
      visit.checkout_lat, visit.checkout_lng,
      addressPos[0], addressPos[1]
    );
  }
  const checkoutAlert = checkoutDistanceMeters !== null && checkoutDistanceMeters > ALERT_THRESHOLD_M;

  const allPoints: [number, number][] = [];
  if (hasCheckinGPS) allPoints.push([visit.checkin_lat!, visit.checkin_lng!]);
  if (addressPos) allPoints.push(addressPos);
  if (visit.checkout_lat && visit.checkout_lng) allPoints.push([visit.checkout_lat, visit.checkout_lng]);

  const addressLabel = [
    visit.customer_address,
    visit.customer_address_number,
    visit.customer_neighborhood,
    visit.customer_city,
  ].filter(Boolean).join(', ');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {visit.customer_name}
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes da visita e localização do cliente</DialogDescription>
          <div className="flex flex-wrap gap-3 mt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
              GPS do RCA
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
              Endereço cadastrado
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
              Check-out
            </span>
          </div>
        </DialogHeader>

        {/* Distance indicator — check-in */}
        {distanceMeters !== null && (
          <div className={`mx-5 mb-1 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium ${
            distanceOk ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {distanceOk ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span>
              {distanceOk
                ? `✅ Check-in dentro do previsto — ${Math.round(distanceMeters)}m do cliente cadastrado`
                : `🚨 ALERTA CHECK-IN — ${Math.round(distanceMeters)}m fora do endereço cadastrado`}
            </span>
          </div>
        )}

        {/* Distance indicator — checkout */}
        {checkoutDistanceMeters !== null && (
          <div className={`mx-5 mb-2 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium ${
            !checkoutAlert ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {!checkoutAlert ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span>
              {!checkoutAlert
                ? `✅ Check-out dentro do previsto — ${Math.round(checkoutDistanceMeters)}m do cliente cadastrado`
                : `🚨 ALERTA CHECK-OUT — ${Math.round(checkoutDistanceMeters)}m fora do endereço cadastrado`}
            </span>
          </div>
        )}

        {/* Address reference */}
        {addressLabel && (
          <div className="mx-5 mb-2 flex items-start gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
            <span><strong>Endereço cadastrado:</strong> {addressLabel}</span>
            {geocoding && <span className="text-blue-500">(geocodificando...)</span>}
          </div>
        )}

        {/* Map */}
        {allPoints.length > 0 ? (
          <MapContainer
            key={visit.id}
            center={allPoints[0]}
            zoom={15}
            style={{ height: '380px', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitBounds positions={allPoints} />

            {/* 5m tolerance radius around check-in */}
            {hasCheckinGPS && (
              <Circle
                center={[visit.checkin_lat!, visit.checkin_lng!]}
                radius={5}
                pathOptions={{ color: distanceOk ? '#22c55e' : '#ef4444', fillColor: distanceOk ? '#22c55e' : '#ef4444', fillOpacity: 0.15, weight: 2 }}
              />
            )}

            {/* Line between GPS and address */}
            {hasCheckinGPS && addressPos && (
              <Polyline
                positions={[[visit.checkin_lat!, visit.checkin_lng!], addressPos]}
                pathOptions={{ color: distanceOk ? '#22c55e' : '#ef4444', weight: 2.5, dashArray: '6 4' }}
              />
            )}

            {/* Check-in marker (green) */}
            {hasCheckinGPS && (
              <Marker position={[visit.checkin_lat!, visit.checkin_lng!]} icon={gpsIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold text-green-700">📍 GPS do RCA — Check-in</div>
                    <div>{formatTime(visit.checkin_at)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {visit.checkin_lat?.toFixed(6)}, {visit.checkin_lng?.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Registered address marker (blue) */}
            {addressPos && (
              <Marker position={addressPos} icon={addressIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold text-blue-700">🏢 Endereço cadastrado</div>
                    <div>{visit.customer_name}</div>
                    <div className="text-xs text-gray-500 mt-1">{addressLabel}</div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Check-out marker (red) */}
            {visit.checkout_lat && visit.checkout_lng && (
              <Marker position={[visit.checkout_lat, visit.checkout_lng]} icon={checkoutIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold text-red-700">🚪 Check-out</div>
                    <div>{formatTime(visit.checkout_at)}</div>
                    {visit.duration_minutes != null && (
                      <div className="text-blue-700 font-medium">⏱ {visit.duration_minutes} min</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center bg-muted gap-2 mx-5 mb-5 rounded-lg">
            <MapPin className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">Sem dados de GPS para esta visita.</p>
          </div>
        )}

        <div className="px-5 py-3 border-t bg-card flex justify-between items-center">
          <div className="text-xs text-muted-foreground space-y-0.5">
            {hasCheckinGPS && (
              <div>🟢 Check-in: {visit.checkin_lat?.toFixed(6)}, {visit.checkin_lng?.toFixed(6)}</div>
            )}
            {visit.checkout_lat && (
              <div>🔴 Check-out: {visit.checkout_lat?.toFixed(6)}, {visit.checkout_lng?.toFixed(6)}</div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DetalhesRCA() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [visits, setVisits] = useState<RCAVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [mapVisit, setMapVisit] = useState<RCAVisit | null>(null);

  const fetchVisits = useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/rca/${id}/visits?date=${selectedDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setVisits(data?.visits || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, token, selectedDate]);

  useEffect(() => { fetchVisits(); }, [fetchVisits]);

  const concluded = visits.filter(v => v.status === 'concluida').length;
  const inProgress = visits.filter(v => v.status === 'em_visita').length;
  const pending = visits.filter(v => v.status === 'agendada').length;
  const totalDuration = visits.reduce((sum, v) => sum + (v.duration_minutes || 0), 0);

  // Alert calculation — visits where GPS is more than ALERT_THRESHOLD_M from registered address
  const alertVisits = visits.filter(v => {
    const d = visitDistance(v);
    return d !== null && d > ALERT_THRESHOLD_M;
  });

  const checkinPoints: [number, number][] = visits
    .filter(v => v.checkin_lat && v.checkin_lng)
    .map(v => [v.checkin_lat!, v.checkin_lng!]);
  const hasGPS = checkinPoints.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Histórico de Visitas — RCA #{id}</h1>
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Data:</Label>
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{concluded}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em Visita</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{inProgress}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agendadas</CardTitle>
            <XCircle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{pending}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Total</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {totalDuration >= 60
                ? `${Math.floor(totalDuration / 60)}h${totalDuration % 60 > 0 ? `${totalDuration % 60}m` : ''}`
                : `${totalDuration}m`}
            </div>
          </CardContent>
        </Card>
        <Card className={alertVisits.length > 0 ? 'border-red-400 bg-red-50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className={`text-sm font-medium ${alertVisits.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
              Alertas GPS
            </CardTitle>
            <Bell className={`h-4 w-4 ${alertVisits.length > 0 ? 'text-red-600' : 'text-gray-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${alertVisits.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {alertVisits.length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">&gt;{ALERT_THRESHOLD_M}m do cliente</div>
          </CardContent>
        </Card>
      </div>

      {/* Alert banner */}
      {alertVisits.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
          <div>
            <p className="font-semibold">
              {alertVisits.length} check-in{alertVisits.length > 1 ? 's' : ''} com localização suspeita
            </p>
            <p className="text-sm mt-0.5">
              GPS registrado a mais de {ALERT_THRESHOLD_M}m do endereço cadastrado do cliente:{' '}
              <span className="font-medium">{alertVisits.map(v => v.customer_name).join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue={hasGPS ? 'mapa' : 'lista'}>
        <TabsList>
          <TabsTrigger value="mapa" className="flex items-center gap-1">
            <Map className="h-4 w-4" /> Mapa do Dia
          </TabsTrigger>
          <TabsTrigger value="lista" className="flex items-center gap-1">
            <List className="h-4 w-4" /> Timeline
          </TabsTrigger>
        </TabsList>

        {/* MAP TAB — overview of the full day */}
        <TabsContent value="mapa">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                Rota percorrida — {selectedDate}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1"></span> Check-in &nbsp;
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1 ml-2"></span> Check-out
              </p>
            </CardHeader>
            <CardContent className="p-0 rounded-b-lg overflow-hidden">
              {loading ? (
                <div className="h-96 flex items-center justify-center bg-muted">
                  <p className="text-muted-foreground">Carregando...</p>
                </div>
              ) : !hasGPS ? (
                <div className="h-96 flex flex-col items-center justify-center bg-muted gap-2">
                  <MapPin className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-muted-foreground">Nenhuma localização GPS registrada nesta data.</p>
                </div>
              ) : (
                <MapContainer
                  center={checkinPoints[0]}
                  zoom={13}
                  style={{ height: '420px', width: '100%' }}
                  scrollWheelZoom
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitBounds positions={checkinPoints} />
                  {checkinPoints.length > 1 && (
                    <Polyline positions={checkinPoints} color="#3b82f6" weight={3} opacity={0.7} dashArray="6 4" />
                  )}
                  {visits.map((visit, idx) => (
                    <div key={visit.id}>
                      {visit.checkin_lat && visit.checkin_lng && (
                        <Marker position={[visit.checkin_lat, visit.checkin_lng]} icon={gpsIcon}>
                          <Popup>
                            <div className="text-sm min-w-[160px]">
                              <div className="font-semibold">#{idx + 1} {visit.customer_name}</div>
                              <div className="text-green-700">✅ Check-in: {formatTime(visit.checkin_at)}</div>
                              <button
                                className="mt-1 text-xs text-blue-600 underline"
                                onClick={() => setMapVisit(visit)}
                              >
                                Ver verificação de endereço →
                              </button>
                            </div>
                          </Popup>
                        </Marker>
                      )}
                      {visit.checkout_lat && visit.checkout_lng &&
                        (visit.checkout_lat !== visit.checkin_lat || visit.checkout_lng !== visit.checkin_lng) && (
                        <Marker position={[visit.checkout_lat, visit.checkout_lng]} icon={checkoutIcon}>
                          <Popup>
                            <div className="text-sm">
                              <div className="font-semibold">#{idx + 1} {visit.customer_name}</div>
                              <div className="text-red-700">🚪 Check-out: {formatTime(visit.checkout_at)}</div>
                              {visit.duration_minutes != null && (
                                <div className="text-blue-700">⏱ {visit.duration_minutes} min</div>
                              )}
                            </div>
                          </Popup>
                        </Marker>
                      )}
                    </div>
                  ))}
                </MapContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TIMELINE TAB — with per-visit map button */}
        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline de Visitas</CardTitle>
              <p className="text-xs text-muted-foreground">
                Clique em <strong>Ver no mapa</strong> para verificar se o RCA estava no endereço correto do cliente.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : visits.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma visita registrada nesta data.
                </p>
              ) : (
                <div className="space-y-3">
                  {visits.map(visit => {
                    const badgeInfo = STATUS_BADGE[visit.status] || { label: visit.status, variant: 'secondary' as const };
                    const hasGPSData = visit.checkin_lat && visit.checkin_lng;
                    const addressLine = [
                      visit.customer_address,
                      visit.customer_address_number,
                      visit.customer_neighborhood,
                      visit.customer_city,
                    ].filter(Boolean).join(', ');
                    const distM = visitDistance(visit);
                    const isAlerted = distM !== null && distM > ALERT_THRESHOLD_M;

                    return (
                      <div key={visit.id} className={`flex gap-4 p-4 rounded-lg border bg-card ${isAlerted ? 'border-red-400 bg-red-50/60' : ''}`}>
                        {/* Time column */}
                        <div className="flex flex-col items-center gap-1 shrink-0 w-14 text-center">
                          <div className="text-xs font-mono text-muted-foreground">{formatTime(visit.checkin_at)}</div>
                          <div className="w-px flex-1 bg-border min-h-[24px]"></div>
                          <div className="text-xs font-mono text-muted-foreground">{formatTime(visit.checkout_at)}</div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{visit.customer_name}</span>
                            <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
                            {visit.duration_minutes != null && (
                              <span className="text-xs text-muted-foreground">⏱ {visit.duration_minutes} min</span>
                            )}
                            {isAlerted && (
                              <span className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded-full px-2 py-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                {Math.round(distM!)}m fora
                              </span>
                            )}
                          </div>

                          {/* Registered address */}
                          {addressLine && (
                            <div className="flex items-start gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3 shrink-0 mt-0.5 text-blue-500" />
                              <span>{addressLine}</span>
                            </div>
                          )}

                          {/* GPS coordinates summary */}
                          {hasGPSData && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0"></span>
                              <span className="font-mono">{visit.checkin_lat?.toFixed(5)}, {visit.checkin_lng?.toFixed(5)}</span>
                            </div>
                          )}

                          {/* Notes */}
                          {visit.notes && (
                            <p className="text-sm text-muted-foreground italic">"{visit.notes}"</p>
                          )}
                        </div>

                        {/* Map button */}
                        <div className="shrink-0 flex items-center">
                          <Button
                            variant={hasGPSData ? 'outline' : 'ghost'}
                            size="sm"
                            disabled={!hasGPSData}
                            onClick={() => setMapVisit(visit)}
                            className="flex items-center gap-1 whitespace-nowrap"
                            title={hasGPSData ? 'Verificar localização no mapa' : 'Sem GPS para esta visita'}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Ver no mapa</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Per-visit verification map */}
      <VisitMapModal
        visit={mapVisit}
        open={mapVisit !== null}
        onClose={() => setMapVisit(null)}
      />
    </div>
  );
}

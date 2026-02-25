import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MapPin, CheckCircle, Clock, LogOut, Navigation } from 'lucide-react';

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
  today_visit_id: number | null;
  today_visit_status: string | null;
}

interface RCARoute {
  id: number;
  name: string;
  description: string;
  customers: RCACustomer[];
}

interface MyRouteResponse {
  representative_id: number;
  routes: RCARoute[];
}

const STATUS_COLOR: Record<string, string> = {
  concluida: 'border-green-400 bg-green-50',
  em_visita: 'border-yellow-400 bg-yellow-50',
  agendada: 'border-gray-200 bg-white',
  nao_visitado: 'border-red-300 bg-red-50',
};

const STATUS_LABEL: Record<string, string> = {
  concluida: 'Concluída',
  em_visita: 'Em Visita',
  agendada: 'Pendente',
  nao_visitado: 'Não Visitado',
};

export default function MinhaRota() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [routeData, setRouteData] = useState<MyRouteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);

  const fetchRoute = useCallback(() => {
    fetch('/api/rca/my-route', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('Perfil de RCA não encontrado');
        return r.json();
      })
      .then(data => {
        setRouteData(data);
        if (data.routes?.length > 0 && selectedRoute === null) {
          setSelectedRoute(data.routes[0].id);
        }
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message || 'Erro ao carregar rota');
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    fetchRoute();
    const interval = setInterval(fetchRoute, 60000);
    return () => clearInterval(interval);
  }, [fetchRoute]);

  const handleCheckin = (customerId: number) => {
    if (checkingIn !== null) return;

    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada neste dispositivo');
      return;
    }

    setCheckingIn(customerId);
    toast.info('Obtendo localização GPS...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/rca/visits/checkin', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: customerId,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            toast.success('Check-in registrado!');
            navigate(`/rca/visita/${data.visit_id}`);
          } else {
            toast.error(data || 'Erro ao registrar check-in');
          }
        } catch {
          toast.error('Erro de conexão');
        } finally {
          setCheckingIn(null);
        }
      },
      (err) => {
        toast.error('Não foi possível obter o GPS: ' + err.message);
        setCheckingIn(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-500">Carregando rota...</p>
        </div>
      </div>
    );
  }

  const routes = routeData?.routes || [];
  const activeRoute = routes.find(r => r.id === selectedRoute);
  const customers = activeRoute?.customers || [];
  const concluded = customers.filter(c => c.today_visit_status === 'concluida').length;
  const total = customers.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-700 text-white px-4 pt-8 pb-4 safe-top">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs opacity-75 capitalize">{today}</div>
          <button onClick={logout} className="flex items-center gap-1 text-xs opacity-75 hover:opacity-100">
            <LogOut className="h-3 w-3" />
            Sair
          </button>
        </div>
        <h1 className="text-xl font-bold">Minha Rota</h1>
        {total > 0 && (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 bg-blue-600 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all"
                style={{ width: `${(concluded / total) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium">{concluded}/{total}</span>
          </div>
        )}
      </div>

      {/* Route selector (if multiple routes) */}
      {routes.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b">
          {routes.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRoute(r.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedRoute === r.id
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* Customer list */}
      <div className="px-4 py-3 space-y-3">
        {routes.length === 0 ? (
          <div className="text-center py-16">
            <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Nenhuma rota atribuída</p>
            <p className="text-sm text-gray-400 mt-1">
              Contate seu administrador para configurar sua rota de visitas.
            </p>
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">Nenhum cliente nesta rota.</p>
          </div>
        ) : (
          customers.map((customer, idx) => {
            const status = customer.today_visit_status || 'agendada';
            const colorClass = STATUS_COLOR[status] || STATUS_COLOR.agendada;
            const isCheckedIn = checkingIn === customer.id;
            const isActive = status === 'em_visita';
            const isDone = status === 'concluida';

            return (
              <div
                key={customer.id}
                className={`rounded-xl border-2 ${colorClass} p-4 transition-all`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Priority badge */}
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isDone ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {isDone ? <CheckCircle className="h-4 w-4" /> : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{customer.company_name}</p>
                      {customer.contact_name && (
                        <p className="text-sm text-gray-500">{customer.contact_name}</p>
                      )}
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                        <Navigation className="h-3 w-3" />
                        <span>{[customer.city, customer.neighborhood].filter(Boolean).join(' · ')}</span>
                      </div>
                      {customer.address && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {customer.address}{customer.address_number ? `, ${customer.address_number}` : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status / Action */}
                  <div className="shrink-0">
                    {isDone ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Concluída
                      </span>
                    ) : isActive ? (
                      <button
                        onClick={() => customer.today_visit_id && navigate(`/rca/visita/${customer.today_visit_id}`)}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-yellow-500 text-white text-sm font-semibold active:scale-95 transition-transform"
                      >
                        <Clock className="h-4 w-4" />
                        Em visita
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCheckin(customer.id)}
                        disabled={isCheckedIn || checkingIn !== null}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform min-h-[44px]"
                      >
                        {isCheckedIn ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            GPS...
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4" />
                            Check-in
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="block mt-2 text-xs text-blue-600 underline"
                  >
                    📞 {customer.phone}
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom padding for safe area */}
      <div className="h-8" />
    </div>
  );
}

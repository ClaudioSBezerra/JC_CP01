import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MapPin, Clock, ArrowLeft, CheckCircle } from 'lucide-react';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface VisitInfo {
  customer_name: string;
  checkin_at: string | null;
}

export default function VisitaAtiva() {
  const { visitId } = useParams<{ visitId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [visitInfo, setVisitInfo] = useState<VisitInfo | null>(null);

  // Load visit info from today's visits
  useEffect(() => {
    fetch('/api/rca/visits/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const visit = (data?.visits || []).find((v: { id: number; customer_name: string; checkin_at: string | null }) => String(v.id) === visitId);
        if (visit) {
          setVisitInfo({ customer_name: visit.customer_name, checkin_at: visit.checkin_at });
          // Calculate elapsed from checkin_at
          if (visit.checkin_at) {
            const diff = Math.floor((Date.now() - new Date(visit.checkin_at).getTime()) / 1000);
            setElapsed(Math.max(0, diff));
          }
        }
      });
  }, [visitId, token]);

  // Tick every second
  useEffect(() => {
    const interval = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCheckout = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada neste dispositivo');
      return;
    }
    setCheckingOut(true);
    toast.info('Obtendo localização GPS...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/rca/visits/checkout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              visit_id: parseInt(visitId!),
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              notes,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            toast.success(`Visita concluída! Duração: ${data.duration_minutes ?? 0} minutos`);
            navigate('/rca/minha-rota');
          } else {
            toast.error(data || 'Erro ao registrar check-out');
            setCheckingOut(false);
          }
        } catch {
          toast.error('Erro de conexão');
          setCheckingOut(false);
        }
      },
      (err) => {
        toast.error('Não foi possível obter o GPS: ' + err.message);
        setCheckingOut(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-yellow-500 text-white px-4 pt-8 pb-6 safe-top">
        <button
          onClick={() => navigate('/rca/minha-rota')}
          className="flex items-center gap-1 text-xs opacity-80 hover:opacity-100 mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar à rota
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-5 w-5" />
          <span className="text-sm font-medium">Visita em andamento</span>
        </div>
        <h1 className="text-xl font-bold">{visitInfo?.customer_name || 'Carregando...'}</h1>
      </div>

      {/* Timer */}
      <div className="flex flex-col items-center justify-center py-10 bg-white mx-4 mt-4 rounded-2xl shadow-sm">
        <p className="text-sm text-gray-500 mb-2">Tempo de visita</p>
        <div className="text-6xl font-mono font-bold text-gray-800 tracking-widest">
          {formatElapsed(elapsed)}
        </div>
        <p className="text-xs text-gray-400 mt-2">hh:mm:ss</p>
      </div>

      {/* Notes */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Observações da visita
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ex: Cliente interessado em produto X. Retornar na semana que vem..."
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
      </div>

      {/* GPS info */}
      <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-gray-400">
        <MapPin className="h-3 w-3" />
        <span>O GPS será capturado automaticamente ao encerrar a visita</span>
      </div>

      {/* Checkout button */}
      <div className="flex-1" />
      <div className="px-4 pb-8 pt-4">
        <button
          onClick={handleCheckout}
          disabled={checkingOut}
          className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-green-600 text-white text-lg font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform min-h-[72px]"
        >
          {checkingOut ? (
            <>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              Registrando...
            </>
          ) : (
            <>
              <CheckCircle className="h-6 w-6" />
              Encerrar Visita
            </>
          )}
        </button>
      </div>
    </div>
  );
}

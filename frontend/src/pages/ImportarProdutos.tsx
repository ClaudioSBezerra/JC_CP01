import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, ShieldAlert } from 'lucide-react';

interface ImportResult {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: string[];
  message: string;
}

export default function ImportarProdutos() {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [clearAllConfirm2, setClearAllConfirm2] = useState(false);
  const [clearAllLoading, setClearAllLoading] = useState(false);
  const [clearAllResult, setClearAllResult] = useState<{ ok: boolean; msg: string; counts?: Record<string, number> } | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ total_rows: 0, imported: 0, skipped: 0, errors: ['Erro de conexao'], message: 'Erro de conexao' });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setClearLoading(true);
    setClearResult(null);
    try {
      const res = await fetch('/api/products/clear', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setClearResult(data.message || 'Base limpa com sucesso.');
      setClearConfirm(false);
    } catch {
      setClearResult('Erro ao limpar base.');
    } finally {
      setClearLoading(false);
    }
  };

  const handleClearAll = async () => {
    setClearAllLoading(true);
    setClearAllResult(null);
    try {
      const res = await fetch('/api/clear-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setClearAllResult({ ok: true, msg: data.message, counts: data.cleared });
      } else {
        setClearAllResult({ ok: false, msg: data.error || 'Erro ao executar limpeza geral.' });
      }
    } catch {
      setClearAllResult({ ok: false, msg: 'Erro de conexao.' });
    } finally {
      setClearAllLoading(false);
      setClearAllConfirm(false);
      setClearAllConfirm2(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Importar Produtos</h1>

      {/* Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload CSV de Produtos
          </CardTitle>
          <CardDescription>
            Formato esperado (separador: ponto-e-virgula):
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-3 rounded-md space-y-2">
            <p className="text-xs font-semibold">Formato v2 (com filiais - recomendado):</p>
            <code className="text-[10px] break-all">
              CODIGO;EAN;DESCRICAO;CATEGORIA;UNIDADE;EST_FIL01;EST_FIL02;EST_FIL03;EST_GERAL;VMD_FIL01;VMD_FIL02;VMD_FIL03;VMD_GERAL;PRECO_CUSTO;PRAZO_ENTREGA;EST_MIN_DDV;EST_MAX_DDV;SAZONALIDADE;MESES_PICO;DT_ULT_COMPRA;DT_ULT_VENDA
            </code>
            <p className="text-xs font-semibold mt-2">Formato v1 (legado - tambem aceito):</p>
            <code className="text-[10px] break-all">
              CODIGO;EAN;DESCRICAO;CATEGORIA;UNIDADE;ESTOQUE_ATUAL;VENDA_MEDIA_DIARIA;PRECO_CUSTO;DT_ULTIMA_COMPRA;DT_ULTIMA_VENDA
            </code>
          </div>

          <div className="flex items-center gap-4">
            <Input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="max-w-md"
            />
            <Button onClick={handleUpload} disabled={!file || loading}>
              {loading ? 'Importando...' : 'Importar'}
            </Button>
          </div>

          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}

          {result && (
            <div className={`p-4 rounded-md border ${result.imported > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.imported > 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">{result.message}</span>
              </div>
              <div className="text-sm space-y-1">
                <p>Total de linhas: {result.total_rows}</p>
                <p>Importados: {result.imported}</p>
                <p>Ignorados: {result.skipped}</p>
              </div>
              {result.errors && result.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-sm text-red-600 cursor-pointer">Ver erros ({result.errors.length})</summary>
                  <ul className="mt-1 text-xs text-red-600 space-y-0.5">
                    {result.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Notas:</strong></p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>O sistema detecta automaticamente se e formato v1 ou v2 pelo cabecalho</li>
              <li>No formato v2: EST_FIL01/02/03 = estoque por filial, VMD = venda media diaria, PRAZO_ENTREGA = dias</li>
              <li>SAZONALIDADE: alta, media, baixa, sazonal. MESES_PICO: ex "11,12,01"</li>
              <li>EST_MIN_DDV / EST_MAX_DDV = estoque minimo/maximo em dias de venda</li>
              <li>Produtos existentes serao atualizados (upsert por codigo)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Clear Card */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="h-5 w-5" />
            Limpar Base de Produtos
          </CardTitle>
          <CardDescription>
            Remove todos os produtos cadastrados para sua empresa. Use antes de reimportar uma nova versao da base.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {clearResult && (
            <div className="p-3 rounded-md border bg-green-50 border-green-200 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-sm text-green-700">{clearResult}</span>
            </div>
          )}

          {!clearConfirm ? (
            <Button
              variant="destructive"
              onClick={() => { setClearConfirm(true); setClearResult(null); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar Todos os Produtos
            </Button>
          ) : (
            <div className="p-4 rounded-md border border-red-300 bg-red-50 space-y-3">
              <p className="text-sm font-medium text-red-700">
                Tem certeza? Esta acao ira remover TODOS os produtos da base. Esta acao nao pode ser desfeita.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleClear} disabled={clearLoading}>
                  {clearLoading ? 'Limpando...' : 'Sim, limpar tudo'}
                </Button>
                <Button variant="outline" onClick={() => setClearConfirm(false)} disabled={clearLoading}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Limpeza Geral */}
      <Card className="border-red-400 bg-red-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-800">
            <ShieldAlert className="h-5 w-5" />
            Limpeza Geral
          </CardTitle>
          <CardDescription className="text-red-700">
            Remove <strong>todos</strong> os dados transacionais da empresa: produtos, pedidos, historico de aprovacoes,
            enderecos de picking, ondas de reabastecimento, score de fragmentacao e logs de sync.
            <br />
            <strong>Configuracoes, usuarios e empresa sao preservados.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">

          {clearAllResult && (
            <div className={`p-3 rounded-md border flex items-start gap-2 ${clearAllResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-100 border-red-300'}`}>
              {clearAllResult.ok
                ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
              <div className="text-sm">
                <p className={clearAllResult.ok ? 'text-green-700 font-medium' : 'text-red-700'}>{clearAllResult.msg}</p>
                {clearAllResult.ok && clearAllResult.counts && (
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-muted-foreground">
                    {Object.entries(clearAllResult.counts)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <span key={k}>{k}: <strong>{v}</strong> removidos</span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 1 */}
          {!clearAllConfirm && !clearAllResult?.ok && (
            <Button
              variant="destructive"
              onClick={() => { setClearAllConfirm(true); setClearAllResult(null); }}
              className="bg-red-700 hover:bg-red-800"
            >
              <ShieldAlert className="h-4 w-4 mr-2" />
              Executar Limpeza Geral
            </Button>
          )}

          {/* Step 2 — primeira confirmacao */}
          {clearAllConfirm && !clearAllConfirm2 && (
            <div className="p-4 rounded-md border border-red-400 bg-red-100 space-y-3">
              <p className="text-sm font-semibold text-red-800">
                ⚠ Atencao: esta acao ira apagar TODOS os dados transacionais (produtos, pedidos, picking, ondas, historico).
                Esta acao nao pode ser desfeita.
              </p>
              <p className="text-sm text-red-700">Deseja continuar?</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="bg-red-700 hover:bg-red-800"
                  onClick={() => setClearAllConfirm2(true)}
                >
                  Sim, tenho certeza
                </Button>
                <Button variant="outline" onClick={() => setClearAllConfirm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — segunda confirmacao final */}
          {clearAllConfirm2 && (
            <div className="p-4 rounded-md border-2 border-red-600 bg-red-200 space-y-3">
              <p className="text-sm font-bold text-red-900">
                ULTIMA CONFIRMACAO — Todos os dados serao apagados permanentemente.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="bg-red-800 hover:bg-red-900"
                  onClick={handleClearAll}
                  disabled={clearAllLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {clearAllLoading ? 'Limpando...' : 'Confirmar e Apagar Tudo'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setClearAllConfirm(false); setClearAllConfirm2(false); }}
                  disabled={clearAllLoading}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportResult {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: string[];
  message: string;
}

export default function ImportarPedidos() {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/orders/import', {
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Importar Pedidos de Compra</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload CSV de Pedidos
          </CardTitle>
          <CardDescription>
            Formato esperado (separador: ponto-e-virgula):
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-3 rounded-md">
            <code className="text-xs">
              NUM_PEDIDO;FORNECEDOR;CNPJ_FORNECEDOR;COMPRADOR;COD_PRODUTO;DESCRICAO;QTD;PRECO_UNIT
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
            </div>
          )}

          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Importante:</strong></p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Importe os produtos ANTES dos pedidos para que o cruzamento de dados de giro funcione</li>
              <li>Itens do mesmo NUM_PEDIDO serao agrupados em um unico pedido</li>
              <li>Produtos com giro baixo serao automaticamente sinalizados</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

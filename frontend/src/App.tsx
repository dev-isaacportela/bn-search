import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { clearSession, initMitra } from '@/lib/mitra-auth';
import { linha } from '@/lib/mitra-api';
import type { Usuario } from '@/lib/sessao';
import AdminLayout from '@/components/AdminLayout';
import { MonogramLoader } from '@/components/Logo';
import { Alert, Button, Card } from '@/components/page';
import LoginPage from '@/pages/LoginPage';
import EstoquePage from '@/pages/estoque/EstoquePage';
import ProdutoPage from '@/pages/estoque/ProdutoPage';

/** Sessão pelo cwSessao: autenticado na Mitra e com perfil no projeto. */
function Autenticado() {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    let vivo = true;
    linha('sessao')
      .then((u) => {
        if (!vivo) return;
        if (!u?.ID) return setEstado('erro');
        setUsuario({ ID: Number(u.ID), NOME: String(u.NOME ?? u.EMAIL ?? ''), EMAIL: String(u.EMAIL ?? '') });
        setEstado('ok');
      })
      .catch(() => vivo && setEstado('erro'));
    return () => {
      vivo = false;
    };
  }, []);

  function sair() {
    clearSession();
    window.location.replace('.');
  }

  if (estado === 'carregando') return <MonogramLoader rotulo="Verificando acesso" />;

  if (estado !== 'ok' || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground p-4">
        <Card className="w-full max-w-md p-8">
          <h1 className="font-title mb-3 text-xl font-bold text-ink">Acesso não liberado</h1>
          <Alert tone="error">
            Não foi possível verificar seu acesso ao BN Search. Tente de novo em instantes ou fale com a TI.
          </Alert>
          <div className="mt-4 flex justify-end">
            <Button onClick={sair}>Sair e entrar com outra conta</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AdminLayout usuario={usuario} />}>
        <Route index element={<Navigate to="/estoque" replace />} />
        <Route path="estoque" element={<EstoquePage />} />
        <Route path="estoque/:codprod" element={<ProdutoPage />} />
        <Route path="*" element={<Navigate to="/estoque" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  const [configured, setConfigured] = useState(initMitra);

  return (
    <Routes>
      {/* initMitra de novo: é ele quem configura o SDK com a sessão salva. */}
      <Route path="/login" element={<LoginPage onLogin={() => setConfigured(initMitra())} />} />
      <Route path="/*" element={configured ? <Autenticado /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;

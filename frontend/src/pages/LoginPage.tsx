import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loginWithGoogleMitra,
  loginWithMicrosoftMitra,
  emailLoginMitra,
  emailSignupMitra,
  emailVerifyCodeMitra,
  emailResendCodeMitra,
  sendPasswordResetCodeMitra,
  validatePasswordResetCodeMitra,
  resetPasswordMitra,
} from 'mitra-interactions-sdk';
import type { LoginResponse } from 'mitra-interactions-sdk';
import { loginLocally, MODO_LOCAL, saveSession } from '@/lib/mitra-auth';
import { MonogramTile, Wordmark } from '@/components/Logo';
import { Alert, Button, Card, Input, LabelledField, TextLink } from '@/components/page';

const AUTH_URL = import.meta.env.VITE_MITRA_AUTH_URL;
const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
const loginOpts = { authUrl: AUTH_URL, projectId: PROJECT_ID, create: true };

// Sem VITE_MITRA_AUTH_URL o app está em desenvolvimento local: quem autentica é
// o simulador (backend/simulator/README.md). A tela é a MESMA nos dois casos
// (design.md §10.1): os passos que só a conta Mitra real cumpre continuam
// navegáveis e recusam no envio, dizendo o que fazer no lugar. Tela que não
// abre em desenvolvimento não é revisada, e quatro botões desabilitados
// escondem metade do acesso de quem trabalha local.
const SO_COM_CONTA_MITRA =
  'Este passo precisa da conta Mitra real. No ambiente local, entre com e-mail e senha (mitra123).';

type Passo = 'principal' | 'confirmar' | 'recuperar-email' | 'recuperar-codigo' | 'recuperar-senha';

/**
 * Tela de login — design.md §10.1. Duas metades em `lg`: à esquerda a
 * assinatura, a manchete e o bloco de contexto; à direita o cartão de acesso.
 * No mobile a coluna da esquerda sai e a marca sobe para cima do cartão.
 *
 * O cartão guarda o acesso inteiro numa máquina de cinco passos — entrar,
 * criar conta, confirmar o e-mail, recuperar senha, nova senha — e não em
 * cinco telas: o e-mail digitado uma vez atravessa os passos seguintes.
 */
export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();

  const [passo, setPasso] = useState<Passo>('principal');
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');

  function concluir(resposta: LoginResponse) {
    saveSession(resposta as unknown as Record<string, unknown>);
    onLogin();
    navigate('/', { replace: true });
  }

  /** Recusa de um passo que só a conta Mitra cumpre. Devolve true se recusou. */
  function recusaLocal() {
    if (!MODO_LOCAL) return false;
    setAviso('');
    setErro(SO_COM_CONTA_MITRA);
    return true;
  }

  // ── SSO ──

  async function entrarPorSso(provedor: 'google' | 'microsoft') {
    if (recusaLocal()) return;
    setOcupado(provedor);
    setErro('');
    try {
      const fn = provedor === 'google' ? loginWithGoogleMitra : loginWithMicrosoftMitra;
      concluir(await fn({ ...loginOpts, mode: 'popup' }));
    } catch (e) {
      setErro((e instanceof Error && e.message) || 'Não foi possível entrar. Tente novamente.');
    } finally {
      setOcupado(null);
    }
  }

  // ── Entrar / criar conta ──

  async function enviarPrincipal() {
    if (criando && !nome.trim()) {
      setErro('Preencha o nome.');
      return;
    }
    if (!email.trim()) {
      setErro('Preencha o e-mail.');
      return;
    }

    if (MODO_LOCAL) {
      // Criar conta é da conta Mitra; entrar com e-mail é o que o simulador faz.
      if (criando) {
        recusaLocal();
        return;
      }
      setOcupado('email');
      setErro('');
      try {
        await loginLocally(email.trim(), senha);
        onLogin();
        navigate('/', { replace: true });
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha no login local.');
      } finally {
        setOcupado(null);
      }
      return;
    }

    if (!senha.trim()) {
      setErro('Preencha a senha.');
      return;
    }

    setOcupado('email');
    setErro('');
    try {
      if (criando) {
        await emailSignupMitra({ ...loginOpts, name: nome.trim(), email: email.trim(), password: senha.trim() });
        setCodigo('');
        setPasso('confirmar');
      } else {
        concluir(await emailLoginMitra({ ...loginOpts, email: email.trim(), password: senha.trim() }));
      }
    } catch (e) {
      setErro((e instanceof Error && e.message) || 'E-mail ou senha inválidos.');
    } finally {
      setOcupado(null);
    }
  }

  // ── Código de 6 dígitos ──

  /**
   * Filtra para dígitos no onChange, sem `maxLength` (design.md §10.1): o
   * atributo conta o que está no DOM, sujeira inclusa, e ao chegar em seis
   * caracteres passaria a engolir dígitos bons. Reescreve `e.target.value`
   * porque quando o filtro devolve o mesmo estado o React não re-renderiza, e
   * a letra digitada ficaria visível no campo.
   */
  function mudaCodigo(e: React.ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = digitos;
    setCodigo(digitos);
  }

  async function confirmarEmail() {
    if (recusaLocal()) return;
    if (codigo.length < 6) {
      setErro('Digite o código de 6 dígitos.');
      return;
    }
    setOcupado('confirmar');
    setErro('');
    try {
      concluir(await emailVerifyCodeMitra({ ...loginOpts, email: email.trim(), code: codigo, password: senha.trim() }));
    } catch (e) {
      setErro((e instanceof Error && e.message) || 'Código inválido ou expirado.');
    } finally {
      setOcupado(null);
    }
  }

  async function reenviarCodigo() {
    if (recusaLocal()) return;
    setOcupado('reenviar');
    setErro('');
    try {
      await emailResendCodeMitra({ ...loginOpts, email: email.trim() });
      setAviso(`Enviamos um novo código para ${email.trim()}.`);
    } catch (e) {
      setErro((e instanceof Error && e.message) || 'Não foi possível reenviar o código.');
    } finally {
      setOcupado(null);
    }
  }

  // ── Recuperar senha ──

  function irParaRecuperar() {
    setPasso('recuperar-email');
    setErro('');
    setAviso('');
    setCodigo('');
    setNovaSenha('');
    setConfirmaSenha('');
  }

  function voltarParaEntrar() {
    setPasso('principal');
    setErro('');
    setCodigo('');
    setNovaSenha('');
    setConfirmaSenha('');
  }

  async function enviarCodigoRecuperacao() {
    if (!email.trim()) {
      setErro('Preencha o e-mail.');
      return;
    }
    if (recusaLocal()) return;
    setOcupado('recuperar-envio');
    setErro('');
    try {
      await sendPasswordResetCodeMitra({ authUrl: AUTH_URL, email: email.trim() });
      setCodigo('');
      setPasso('recuperar-codigo');
    } catch (e) {
      setErro((e instanceof Error && e.message) || 'Não foi possível enviar o código.');
    } finally {
      setOcupado(null);
    }
  }

  async function validarCodigoRecuperacao() {
    if (recusaLocal()) return;
    if (codigo.length < 6) {
      setErro('Digite o código de 6 dígitos.');
      return;
    }
    setOcupado('recuperar-validacao');
    setErro('');
    try {
      await validatePasswordResetCodeMitra({ authUrl: AUTH_URL, email: email.trim(), code: codigo });
      setPasso('recuperar-senha');
    } catch (e) {
      setErro((e instanceof Error && e.message) || 'Código inválido ou expirado.');
    } finally {
      setOcupado(null);
    }
  }

  async function redefinirSenha() {
    if (!novaSenha.trim()) {
      setErro('Preencha a nova senha.');
      return;
    }
    if (novaSenha !== confirmaSenha) {
      setErro('As senhas não coincidem.');
      return;
    }
    if (recusaLocal()) return;
    setOcupado('recuperar-troca');
    setErro('');
    try {
      await resetPasswordMitra({ authUrl: AUTH_URL, email: email.trim(), code: codigo, newPassword: novaSenha.trim() });
      setSenha('');
      setNovaSenha('');
      setConfirmaSenha('');
      setCodigo('');
      setPasso('principal');
      setAviso('Senha redefinida. Entre com a nova senha.');
    } catch (e) {
      setErro((e instanceof Error && e.message) || 'Não foi possível redefinir a senha.');
    } finally {
      setOcupado(null);
    }
  }

  /**
   * Cada passo é um <form> de verdade (design.md §10.1): é o que dá Enter para
   * enviar e o que o gerenciador de senhas lê.
   */
  function envia(acao: () => void) {
    return (e: React.FormEvent) => {
      e.preventDefault();
      acao();
    };
  }

  const travado = ocupado !== null;

  const titulo =
    passo === 'confirmar' || passo === 'recuperar-codigo'
      ? 'Confirme seu e-mail'
      : passo === 'recuperar-email'
        ? 'Recuperar senha'
        : passo === 'recuperar-senha'
          ? 'Nova senha'
          : criando
            ? 'Criar conta'
            : 'Entrar';

  const subtitulo =
    passo === 'confirmar' || passo === 'recuperar-codigo'
      ? `Enviamos um código para ${email}`
      : passo === 'recuperar-email'
        ? 'Digite seu e-mail para receber um código.'
        : passo === 'recuperar-senha'
          ? 'Escolha uma nova senha para sua conta.'
          : criando
            ? 'Preencha os dados para criar sua conta.'
            : MODO_LOCAL
              ? 'Ambiente de desenvolvimento. Senha única: mitra123.'
              : 'Escolha como deseja acessar.';

  return (
    <div className="min-h-screen bg-ground">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_minmax(0,27rem)] lg:gap-20 lg:px-8">
        {/* ── Metade esquerda: assinatura, manchete e contexto ── */}
        <div className="hidden flex-col gap-7 lg:flex">
          <Wordmark className="h-9" />

          <h2 className="font-title text-4xl leading-[1.12] font-bold tracking-tight text-balance text-ink sm:text-5xl">
            O WinThor <span className="text-primary">neste momento</span>
          </h2>

          <div className="max-w-md rounded-3xl bg-brand-50 p-6">
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              Estoque por filial, lote e validade, com o que está reservado, o que está bloqueado e por
              quê. Sem abrir o ERP.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="h-px w-10 bg-brand-300" aria-hidden />
              <span className="text-[11px] font-semibold tracking-[0.16em] text-ink-secondary uppercase">
                BN Search
              </span>
            </div>
          </div>
        </div>

        {/* ── Metade direita: o cartão de acesso ── */}
        <div className="mx-auto flex w-full max-w-md flex-col">
          {/* No mobile a coluna da esquerda não existe: a marca sobe para cá. */}
          <div className="mb-7 flex flex-col items-center gap-3 lg:hidden">
            <Wordmark className="h-7" />
            <p className="text-center text-[13px] leading-relaxed text-ink-secondary">
              O WinThor neste momento
            </p>
          </div>

          <Card className="w-full p-8">
            <div className="mb-6 flex flex-col gap-3">
              {/* No escuro o verde da marca não lê sobre o accent; o MonogramTile resolve (§2.1, §11). */}
              <MonogramTile />
              <div>
                <h1 className="font-title text-2xl font-bold text-ink">{titulo}</h1>
                <p className="mt-1 text-[13px] text-ink-secondary">{subtitulo}</p>
              </div>
            </div>

            {passo === 'confirmar' ? (
              /* ── Confirmar o e-mail ── */
              <form className="flex flex-col gap-4" onSubmit={envia(confirmarEmail)}>
                <LabelledField label="Código de verificação">
                  <Input
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={codigo}
                    onChange={mudaCodigo}
                    className="h-12 text-center text-2xl font-bold tracking-[0.5em]"
                    autoFocus
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={travado}>
                  {ocupado === 'confirmar' ? 'Confirmando...' : 'Confirmar'}
                </Button>

                <div className="flex items-center justify-center gap-4">
                  <TextLink onClick={reenviarCodigo} disabled={travado}>
                    {ocupado === 'reenviar' ? 'Enviando...' : 'Reenviar código'}
                  </TextLink>
                  <TextLink onClick={voltarParaEntrar} disabled={travado}>
                    Voltar para entrar
                  </TextLink>
                </div>
              </form>
            ) : passo === 'recuperar-email' ? (
              /* ── Recuperar senha: pedir o e-mail ── */
              <form className="flex flex-col gap-4" onSubmit={envia(enviarCodigoRecuperacao)}>
                <LabelledField label="E-mail">
                  <Input
                    type="email"
                    placeholder="consulta@benenutri.local"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={travado}
                    autoFocus
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={travado}>
                  {ocupado === 'recuperar-envio' ? 'Enviando...' : 'Enviar código'}
                </Button>

                <TextLink className="self-center" onClick={voltarParaEntrar} disabled={travado}>
                  Voltar para entrar
                </TextLink>
              </form>
            ) : passo === 'recuperar-codigo' ? (
              /* ── Recuperar senha: validar o código ── */
              <form className="flex flex-col gap-4" onSubmit={envia(validarCodigoRecuperacao)}>
                <LabelledField label="Código de verificação">
                  <Input
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={codigo}
                    onChange={mudaCodigo}
                    className="h-12 text-center text-2xl font-bold tracking-[0.5em]"
                    autoFocus
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={travado}>
                  {ocupado === 'recuperar-validacao' ? 'Validando...' : 'Validar código'}
                </Button>

                <div className="flex items-center justify-center gap-4">
                  <TextLink onClick={enviarCodigoRecuperacao} disabled={travado}>
                    {ocupado === 'recuperar-envio' ? 'Enviando...' : 'Reenviar código'}
                  </TextLink>
                  <TextLink onClick={voltarParaEntrar} disabled={travado}>
                    Voltar para entrar
                  </TextLink>
                </div>
              </form>
            ) : passo === 'recuperar-senha' ? (
              /* ── Recuperar senha: a nova senha ── */
              <form className="flex flex-col gap-4" onSubmit={envia(redefinirSenha)}>
                <LabelledField label="Nova senha">
                  <Input
                    type="password"
                    placeholder="Sua nova senha"
                    autoComplete="new-password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    disabled={travado}
                    autoFocus
                  />
                </LabelledField>

                <LabelledField label="Confirmar senha">
                  <Input
                    type="password"
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    value={confirmaSenha}
                    onChange={(e) => setConfirmaSenha(e.target.value)}
                    disabled={travado}
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={travado}>
                  {ocupado === 'recuperar-troca' ? 'Salvando...' : 'Redefinir senha'}
                </Button>

                <TextLink className="self-center" onClick={voltarParaEntrar} disabled={travado}>
                  Voltar para entrar
                </TextLink>
              </form>
            ) : (
              /* ── Entrar / criar conta: Google, Microsoft, régua, e-mail e senha ── */
              <form className="flex flex-col gap-3" onSubmit={envia(enviarPrincipal)}>
                {/* Marca alheia: a cor vem cravada no SVG e fica no arquivo da
                    tela, fora de Logo.tsx e do vocabulário (§10.1, §11). */}
                <Button className="w-full" onClick={() => entrarPorSso('google')} disabled={travado}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {ocupado === 'google' ? 'Aguarde...' : 'Continuar com Google'}
                </Button>

                <Button className="w-full" onClick={() => entrarPorSso('microsoft')} disabled={travado}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                    <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                    <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                    <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                  </svg>
                  {ocupado === 'microsoft' ? 'Aguarde...' : 'Continuar com Microsoft'}
                </Button>

                <div className="my-2 flex items-center gap-3">
                  <span className="h-px flex-1 bg-rule-row" />
                  <span className="text-[12px] whitespace-nowrap text-ink-secondary">
                    {criando ? 'Ou crie com e-mail' : 'Ou entre com e-mail'}
                  </span>
                  <span className="h-px flex-1 bg-rule-row" />
                </div>

                {criando ? (
                  <LabelledField label="Nome">
                    <Input
                      placeholder="Seu nome completo"
                      autoComplete="name"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      disabled={travado}
                    />
                  </LabelledField>
                ) : null}

                <LabelledField label="E-mail">
                  <Input
                    type="email"
                    placeholder="consulta@benenutri.local"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={travado}
                  />
                </LabelledField>

                <LabelledField label="Senha">
                  <Input
                    type="password"
                    placeholder={MODO_LOCAL ? 'mitra123' : 'Sua senha'}
                    autoComplete={criando ? 'new-password' : 'current-password'}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    disabled={travado}
                  />
                </LabelledField>

                <Button type="submit" variant="primary" className="w-full" disabled={travado}>
                  {ocupado === 'email' ? (criando ? 'Cadastrando...' : 'Entrando...') : criando ? 'Cadastrar' : 'Entrar'}
                </Button>

                {/* Terciária é TextLink: um terceiro botão contornado apaga qual
                    é a ação principal (§10.1). */}
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  {criando ? (
                    <span />
                  ) : (
                    <TextLink onClick={irParaRecuperar} disabled={travado}>
                      Esqueci minha senha
                    </TextLink>
                  )}
                  <TextLink
                    onClick={() => {
                      setCriando(!criando);
                      setErro('');
                      setAviso('');
                    }}
                    disabled={travado}
                  >
                    {criando ? 'Já tem conta? Entre aqui' : 'Criar conta'}
                  </TextLink>
                </div>
              </form>
            )}

            {/* Aviso no fluxo da tela, onde a ação aconteceu — não some sozinho. */}
            {erro ? (
              <div className="mt-4">
                <Alert tone="error">{erro}</Alert>
              </div>
            ) : aviso ? (
              <div className="mt-4">
                <Alert tone="success">{aviso}</Alert>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

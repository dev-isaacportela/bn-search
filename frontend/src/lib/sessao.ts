// Sessão do BN Search: usuário resolvido por cwSessao. Vive fora do
// AdminLayout para o fast refresh funcionar.
import { createContext, useContext } from 'react';

export interface Usuario {
  ID: number;
  NOME: string;
  EMAIL: string;
}

export const SessaoContext = createContext<Usuario | null>(null);

export function useSessao() {
  const usuario = useContext(SessaoContext);
  if (!usuario) throw new Error('useSessao fora do AdminLayout.');
  return usuario;
}

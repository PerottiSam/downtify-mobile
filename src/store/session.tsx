import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthResult,
  DowntifyApi,
  ServerInfo,
  UserInfo,
  fetchServerInfo,
  pairWithCode,
  signInWithPassword,
} from '../api/client';

const STORE_KEY = 'downtify.session.v2';

interface Stored {
  baseUrl: string;
  token: string;
  user?: UserInfo;
}

interface SessionCtx {
  status: 'loading' | 'signedOut' | 'signedIn';
  baseUrl: string;
  user?: UserInfo;
  serverInfo: ServerInfo | null;
  api: DowntifyApi | null;
  signIn(baseUrl: string, username: string, password: string): Promise<void>;
  pair(baseUrl: string, code: string): Promise<void>;
  continueWithoutAccount(baseUrl: string): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [stored, setStored] = useState<Stored | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const signOutRef = useRef<() => Promise<void>>(async () => {});

  const persist = useCallback(async (s: Stored | null) => {
    setStored(s);
    try {
      if (s) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(s));
      else await SecureStore.deleteItemAsync(STORE_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        if (raw) setStored(JSON.parse(raw));
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Info del server (in background; se offline si va avanti lo stesso)
  useEffect(() => {
    setServerInfo(null);
    if (!stored) return;
    fetchServerInfo(stored.baseUrl).then(setServerInfo).catch(() => {});
  }, [stored?.baseUrl]);

  const signOut = useCallback(() => persist(null), [persist]);
  signOutRef.current = signOut;

  const api = useMemo(
    () => (stored ? new DowntifyApi(stored.baseUrl, stored.token, () => signOutRef.current()) : null),
    [stored],
  );

  const saveAuth = useCallback(
    (baseUrl: string, res: AuthResult) => persist({ baseUrl, token: res.token, user: res.user }),
    [persist],
  );

  const value: SessionCtx = {
    status: loading ? 'loading' : stored ? 'signedIn' : 'signedOut',
    baseUrl: stored?.baseUrl ?? '',
    user: stored?.user,
    serverInfo,
    api,
    signIn: async (baseUrl, username, password) => saveAuth(baseUrl, await signInWithPassword(baseUrl, username, password)),
    pair: async (baseUrl, code) => saveAuth(baseUrl, await pairWithCode(baseUrl, code)),
    continueWithoutAccount: async (baseUrl) => persist({ baseUrl, token: '' }),
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fuori da SessionProvider');
  return v;
}

/** API già autenticata: da usare solo nelle schermate protette. */
export function useApi(): DowntifyApi {
  const { api } = useSession();
  if (!api) throw new Error('Sessione non attiva');
  return api;
}

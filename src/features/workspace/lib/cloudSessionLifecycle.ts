type AuthRefresh = { startAutoRefresh: () => Promise<void>; stopAutoRefresh: () => Promise<void> };
type AppLifecycle = {
  currentState: string | null;
  addEventListener: (event: 'change', listener: (state: string) => void) => { remove: () => void };
};

// Feature: manage native token refresh independently of sync pause/account state, including the initial foreground state.
export function manageCloudSessionLifecycle(auth: AuthRefresh, appState: AppLifecycle): () => void {
  const refresh = (state: string | null) => {
    void (state === 'active' ? auth.startAutoRefresh() : auth.stopAutoRefresh()).catch(() => undefined);
  };
  const subscription = appState.addEventListener('change', refresh);
  refresh(appState.currentState);
  return () => { subscription.remove(); void auth.stopAutoRefresh().catch(() => undefined); };
}

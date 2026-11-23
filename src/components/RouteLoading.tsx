/** Shown instantly by loading.tsx while a dynamic page renders on the server. */
export function RouteLoading({ label = "Loading" }: { label?: string }) {
  return (
    <main className="page">
      <p className="route-loading" role="status">
        <span className="spinner" aria-hidden />
        {label}…
      </p>
    </main>
  );
}

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold">Etiquetador</h1>
        <p className="mt-4 text-lg">
          Multi-project data labeling platform with centralized administration.
        </p>
        <p className="mt-8 text-sm text-neutral-500">
          MVP in progress · Sprint 1 · see <code>docs/ROADMAP.md</code>
        </p>
      </div>
    </main>
  );
}

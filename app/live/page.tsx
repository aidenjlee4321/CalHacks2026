import SpacetimeProvider from '../../components/SpacetimeProvider';
import LiveOrgChart from '../../components/LiveOrgChart';

export default function LivePage() {
  return (
    <main className="min-h-screen bg-white p-8">
      <h1 className="mb-6 text-2xl font-bold">Live Org Chart (SpacetimeDB)</h1>
      <SpacetimeProvider>
        <LiveOrgChart />
      </SpacetimeProvider>
    </main>
  );
}
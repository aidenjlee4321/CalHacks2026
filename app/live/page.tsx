import SpacetimeProvider from '../../components/LiveSpacetimeProvider';
import LiveOrgChart from '../../components/LiveOrgChart';
import HumanInbox from '../../components/HumanInbox';
import DemoControls from '../../components/DemoControls';
import LiveActivityFeed from '../../components/LiveActivityFeed';

export default function LivePage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <h1 className="mb-6 text-2xl font-bold">Hybrid Org-Chart (live on SpacetimeDB)</h1>
      <SpacetimeProvider>
        <DemoControls />
        <div className="flex gap-6">
          <div className="flex-1 overflow-x-auto">
            <LiveOrgChart />
            <div className="mt-8">
              <LiveActivityFeed />
            </div>
          </div>
          <div className="w-96 shrink-0">
            <HumanInbox />
          </div>
        </div>
      </SpacetimeProvider>
    </main>
  );
}
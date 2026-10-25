import SpacetimeProvider from '../../components/LiveSpacetimeProvider';
import LiveOrgChart from '../../components/LiveOrgChart';
import HumanInbox from '../../components/HumanInbox';
import DemoControls from '../../components/DemoControls';
import LiveActivityFeed from '../../components/LiveActivityFeed';
import ResearchPanel from '../../components/ResearchPanel';
import Link from 'next/link';

export default function LivePage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <Link href="/" className="mb-3 inline-block text-sm font-medium text-indigo-600 hover:underline">
        ← Back to org dashboard
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Hybrid Org-Chart (live on SpacetimeDB)</h1>
      <SpacetimeProvider>
        <DemoControls />
        <ResearchPanel />
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
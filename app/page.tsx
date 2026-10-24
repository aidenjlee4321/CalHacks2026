import TopologyMap from '../components/TopologyMap';
import { initialOrgData } from '../lib/store';
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      // Inside your Home component return:
      <header className="w-full bg-white border-b border-gray-200 p-6 shadow-sm z-10 flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <h1 className="font-bold text-xl tracking-tight">Hybrid Org-Chart</h1>
          <div className="text-sm font-medium bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
            Status: Live Demo
          </div>
        </div>

        {/* The Org Chart Visualization */}
        <div className="w-full overflow-x-auto pb-4">
          <TopologyMap nodes={initialOrgData} rootId="node-1" />
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Column: AI/Human Activity Feed (70%) */}
        <section className="w-2/3 h-full p-6 flex flex-col">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Unified Activity Feed</h2>
          <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-inner p-4 overflow-y-auto">
            {/* We will drop the ActivityFeed component here later */}
            <p className="text-gray-400 italic text-sm">System initialized. Waiting for AI execution logs...</p>
          </div>
        </section>

        {/* Right Column: Human Intervention Inbox (30%) */}
        <section className="w-1/3 h-full bg-gray-100 border-l border-gray-200 p-6 flex flex-col shadow-inner">
          <h2 className="text-lg font-semibold mb-4 text-red-600 flex items-center">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
            Action Required
          </h2>
          <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            {/* We will drop the HumanInbox component here later */}
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-gray-400 italic text-sm">No active tasks require human intervention.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
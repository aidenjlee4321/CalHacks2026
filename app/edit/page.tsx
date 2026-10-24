"use client";

import { useState } from 'react';
import Link from 'next/link';
import { initialOrgData, OrgNode, NodeType } from '../../lib/store';

export default function EditOrganization() {
    // Load the initial data into local state
    const [nodes, setNodes] = useState<Record<string, OrgNode>>(initialOrgData);

    const handleUpdate = (id: string, field: keyof OrgNode, value: any) => {
        setNodes((prev) => ({
            ...prev,
            [id]: { ...prev[id], [field]: value }
        }));
    };

    const handleAddNode = () => {
        const newId = `node-${Object.keys(nodes).length + 1}`;
        setNodes((prev) => ({
            ...prev,
            [newId]: {
                id: newId,
                name: 'New Node',
                type: 'AGENT',
                status: 'IDLE',
                tasks: [],
                reportsTo: [],
                subordinates: []
            }
        }));
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 border-b pb-4">
                    <h1 className="text-3xl font-bold tracking-tight">Organization Editor</h1>
                    <Link href="/" className="bg-gray-800 text-white px-4 py-2 rounded-md shadow-sm hover:bg-gray-700 transition">
                        &larr; Back to Dashboard
                    </Link>
                </div>

                {/* Toolbar */}
                <button
                    onClick={handleAddNode}
                    className="mb-6 bg-blue-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-blue-700 transition"
                >
                    + Add New Node
                </button>

                {/* Node Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Object.values(nodes).map(node => (
                        <div key={node.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col gap-4">

                            <div className="flex justify-between items-center">
                                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-500">{node.id}</span>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={node.name}
                                    onChange={(e) => handleUpdate(node.id, 'name', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
                                <select
                                    value={node.type}
                                    onChange={(e) => handleUpdate(node.id, 'type', e.target.value as NodeType)}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                >
                                    <option value="AGENT">AGENT</option>
                                    <option value="HUMAN">HUMAN</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Reports To (IDs, comma-separated)</label>
                                <input
                                    type="text"
                                    value={node.reportsTo.join(', ')}
                                    onChange={(e) => handleUpdate(node.id, 'reportsTo', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder="e.g. node-1"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Subordinates (IDs, comma-separated)</label>
                                <input
                                    type="text"
                                    value={node.subordinates.join(', ')}
                                    onChange={(e) => handleUpdate(node.id, 'subordinates', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder="e.g. node-2, node-3"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
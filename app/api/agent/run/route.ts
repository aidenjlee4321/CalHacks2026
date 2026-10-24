import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { recordTelemetry } from '@/lib/telemetryStore';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
    try {
        const { agentId, agentName, prompt, delaySeconds = 0 } = await req.json();

        const startTime = Date.now();

        // 1. Simulate API delay if requested
        if (delaySeconds > 0) {
            await sleep(delaySeconds * 1000);
        }

        // 2. Discover an active model dynamically for this ANTHROPIC_API_KEY
        let modelId: string | null = null;
        try {
            const modelsPage = await anthropic.models.list();
            if (modelsPage.data && modelsPage.data.length > 0) {
                // Pick the first available model authorized for this key
                modelId = modelsPage.data[0].id;
            }
        } catch (listErr) {
            console.warn('Could not query Anthropic models API dynamically:', listErr);
        }

        // Fallback candidates if model list query returns empty or fails
        if (!modelId) {
            modelId = 'claude-3-5-sonnet-latest';
        }

        // 3. Execute prompt against resolved model
        const response = await anthropic.messages.create({
            model: modelId,
            max_tokens: 1024,
            messages: [
                { role: 'user', content: prompt || 'Execute the assigned task efficiently.' },
            ],
        });

        const latencyMs = Date.now() - startTime;
        const textBlock = response.content.find((block) => block.type === 'text');
        const resultText = textBlock ? textBlock.text : 'No response generated.';
        const tokens =
            (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

        // 4. Record run telemetry
        recordTelemetry({
            id: crypto.randomUUID(),
            agentId: agentId || 'unknown-agent',
            agentName: agentName || 'Agent',
            latencyMs,
            tokens,
            resultText,
            timestamp: Date.now(),
        });

        return NextResponse.json({
            success: true,
            resultText,
            tokens,
            latencyMs,
            modelUsed: modelId,
        });
    } catch (error) {
        console.error('Claude API Error:', error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
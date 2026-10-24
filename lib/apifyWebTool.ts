// Gives every org-chart agent "eyes on the web" through Apify.
// The agent decides on its own when it needs real-world info; we then hire
// the Apify RAG Web Browser Actor to search Google / read the page and hand
// the agent clean markdown. No SpacetimeDB involvement.
import { ApifyClient } from 'apify-client';
import { anthropic } from '@/lib/claude';

const ACTOR_ID = 'apify/rag-web-browser';
const MAX_TOOL_TURNS = 4;
const MAX_CHARS_PER_PAGE = 4000;

export const WEB_TOOL = {
    name: 'browse_web',
    description:
        'Search the web or read a specific web page (powered by an Apify Actor). Use this whenever the task needs current, real-world facts you do not already have: companies, people, products, prices, news, docs, competitors. Input either a search query or a full URL. Returns the text of the top pages with their URLs. Cite the URLs you used.',
    input_schema: {
        type: 'object' as const,
        properties: {
            query: { type: 'string', description: 'A Google search query, or a full https:// URL to read' },
        },
        required: ['query'],
    },
};

export interface WebSource {
    url: string;
    title: string;
}

export async function browseWeb(query: string): Promise<{ pages: { url: string; title: string; text: string }[] }> {
    const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
    const run = await client.actor(ACTOR_ID).call(
        { query, maxResults: 3, outputFormats: ['markdown'] },
        { waitSecs: 90 }
    );
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const pages = (items as any[]).map((item) => ({
        url: item?.metadata?.url || item?.searchResult?.url || '',
        title: item?.metadata?.title || item?.searchResult?.title || '',
        text: String(item?.markdown || item?.text || '').slice(0, MAX_CHARS_PER_PAGE),
    }));
    return { pages: pages.filter((p) => p.url) };
}

/**
 * Drop-in replacement for anthropic.beta.messages.create(...).
 * Adds the browse_web tool, runs the tool loop, and returns the final
 * response with token usage summed across every turn.
 * Without an APIFY_TOKEN it behaves exactly like the plain call.
 */
export async function createWithWebTools(params: any): Promise<any> {
    if (!process.env.APIFY_TOKEN) {
        return anthropic.beta.messages.create(params);
    }

    const messages = [...params.messages];
    const sources: WebSource[] = [];
    const total = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const addUsage = (u: any) => {
        total.input_tokens += u?.input_tokens || 0;
        total.output_tokens += u?.output_tokens || 0;
        total.cache_read_input_tokens += u?.cache_read_input_tokens || 0;
        total.cache_creation_input_tokens += u?.cache_creation_input_tokens || 0;
    };

    for (let turn = 0; ; turn++) {
        const response: any = await anthropic.beta.messages.create({
            ...params,
            messages,
            tools: [...(params.tools || []), WEB_TOOL],
            // On the last turn, force a final answer
            ...(turn >= MAX_TOOL_TURNS && { tool_choice: { type: 'none' } }),
        });
        addUsage(response.usage);

        if (response.stop_reason !== 'tool_use') {
            response.usage = { ...response.usage, ...total };
            if (sources.length > 0) {
                const textBlock = response.content.find((b: any) => b.type === 'text');
                const list = sources.map((s) => `- ${s.title || s.url} (${s.url})`).join('\n');
                const note = `\n\n🌐 Web research via Apify (${sources.length} page${sources.length > 1 ? 's' : ''} read):\n${list}`;
                if (textBlock) textBlock.text += note;
                else response.content.push({ type: 'text', text: note.trim() });
            }
            return response;
        }

        messages.push({ role: 'assistant', content: response.content });
        const results: any[] = [];
        for (const block of response.content) {
            if (block.type !== 'tool_use') continue;
            if (block.name !== WEB_TOOL.name) {
                results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Unknown tool', is_error: true });
                continue;
            }
            try {
                const { pages } = await browseWeb(String(block.input?.query || ''));
                pages.forEach((p) => {
                    if (!sources.some((s) => s.url === p.url)) sources.push({ url: p.url, title: p.title });
                });
                results.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: pages.length ? JSON.stringify(pages) : 'No pages found for that query.',
                });
            } catch (err) {
                console.error('Apify browse_web failed:', err);
                results.push({ type: 'tool_result', tool_use_id: block.id, content: `Web browsing failed: ${String(err)}`, is_error: true });
            }
        }
        messages.push({ role: 'user', content: results });
    }
}

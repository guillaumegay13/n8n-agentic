import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useUIStore } from './ui.store';

export type McpAgentMessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface McpAgentMessage {
	id: string;
	role: McpAgentMessageRole;
	content: string;
	timestamp: string;
}

type McpAgentEventType =
	| 'assistant_message'
	| 'tool_call'
	| 'tool_result'
	| 'thought'
	| 'system_notice';

interface McpAgentEvent {
	type: McpAgentEventType;
	content?: unknown;
	metadata?: Record<string, unknown> | null;
}

interface McpAgentTraceEntry {
	id: string;
	type: McpAgentEventType;
	summary: string;
	timestamp: string;
}

const DEFAULT_CHAT_WIDTH = 360;
const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 520;
export const TRACE_PLACEHOLDER_SUMMARY = 'Waiting for response…';

function sanitizeBaseUrl(raw: string | undefined): string {
	if (!raw) return 'http://localhost:8000';
	return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export const useMcpAgentStore = defineStore('mcpAgent', () => {
	const uiStore = useUIStore();

	const chatWidth = ref<number>(DEFAULT_CHAT_WIDTH);
	const isOpen = ref(false);
	const isSending = ref(false);
	const hasError = ref<string | null>(null);
	const sessionId = ref<string | null>(null);
	const messages = ref<McpAgentMessage[]>([]);
	const draft = ref('');
	const trace = ref<McpAgentTraceEntry[]>([]);
	const isTraceExpanded = ref(false);

	const baseUrl = computed(() =>
		sanitizeBaseUrl(import.meta.env.VITE_MCP_AGENT_API_URL as string | undefined),
	);

	const chatEndpoint = computed(() => `${baseUrl.value}/chat`);
	const apiToken = import.meta.env.VITE_MCP_AGENT_API_TOKEN as string | undefined;
	const eventStream = ref<EventSource | null>(null);
	const hasReceivedStreamEvent = ref(false);
	const isBrowser = typeof window !== 'undefined';
	const eventStreamUrl = computed(() => {
		if (!sessionId.value) return null;
		const base = `${baseUrl.value}/sessions/${sessionId.value}/events`;
		if (!apiToken) {
			return base;
		}
		const separator = base.includes('?') ? '&' : '?';
		return `${base}${separator}token=${encodeURIComponent(apiToken)}`;
	});

	const canSubmit = computed(() => draft.value.trim().length > 0 && !isSending.value);
	const hasTrace = computed(() => trace.value.length > 0);
	const thinkingTrace = computed(() => trace.value);

	function disconnectEventStream() {
		if (eventStream.value) {
			eventStream.value.close();
			eventStream.value = null;
		}
	}

	function connectEventStream() {
		if (!isBrowser) return;
		const url = eventStreamUrl.value;
		if (!url) return;
		if (eventStream.value) {
			eventStream.value.close();
		}
		try {
			const source = new EventSource(url);
			source.onmessage = (event) => {
				if (!event.data) return;
				try {
					const parsed = JSON.parse(event.data) as McpAgentEvent & { session_id?: string };
					if (parsed.session_id && parsed.session_id !== sessionId.value) {
						return;
					}
					const { session_id: _ignored, ...agentEvent } = parsed as McpAgentEvent & {
						session_id?: string;
					};
					if (!('type' in agentEvent)) return;
					handleStreamedEvent(agentEvent as McpAgentEvent);
				} catch (error) {
					console.warn('[McpAgent] Failed to parse event stream payload', error);
				}
			};
			source.onerror = (error) => {
				console.warn('[McpAgent] Event stream error', error);
			};
			eventStream.value = source;
		} catch (error) {
			console.warn('[McpAgent] Unable to open event stream', error);
		}
	}

	function startNewSession() {
		disconnectEventStream();
		sessionId.value = crypto.randomUUID();
		hasReceivedStreamEvent.value = false;
		if (isBrowser) {
			connectEventStream();
		}
	}

	function ensureSession() {
		if (!sessionId.value) {
			startNewSession();
			return;
		}
		if (isBrowser && !eventStream.value) {
			connectEventStream();
		}
	}

	function timestamp(): string {
		return new Date().toISOString();
	}

	function resetTrace(options: { collapse?: boolean } = {}): void {
		trace.value = [];
		if (options.collapse) {
			isTraceExpanded.value = false;
		}
	}

	function seedTracePlaceholder(): void {
		trace.value.push({
			id: crypto.randomUUID(),
			type: 'system_notice',
			summary: TRACE_PLACEHOLDER_SUMMARY,
			timestamp: timestamp(),
		});
	}

	function removeTracePlaceholder(): void {
		if (trace.value.length && trace.value[0]?.summary === TRACE_PLACEHOLDER_SUMMARY) {
			trace.value.shift();
		}
	}

	function recordTrace(event: McpAgentEvent, summary: string): void {
		trace.value.push({
			id: crypto.randomUUID(),
			type: event.type,
			summary,
			timestamp: timestamp(),
		});
	}

	function toggleTrace(): void {
		isTraceExpanded.value = !isTraceExpanded.value;
	}

	function expandTrace(): void {
		isTraceExpanded.value = true;
	}

	function collapseTrace(): void {
		isTraceExpanded.value = false;
	}

	function appendMessage(role: McpAgentMessageRole, content: string) {
		messages.value.push({
			id: crypto.randomUUID(),
			role,
			content: role === 'assistant' ? formatAssistantMessage(content) : content,
			timestamp: timestamp(),
		});
	}

	function formatAssistantMessage(content: string): string {
		const trimmed = content.trim();
		if (!trimmed) {
			return content;
		}

		const structured = extractStructuredJson(trimmed);
		if (!structured) {
			return content;
		}

		const { json, index } = structured;
		const prefix = trimmed.slice(0, index).trimEnd();

		if (typeof json === 'object' && json !== null) {
			const obj = json as Record<string, unknown>;

			if (obj.type === 'response' && typeof obj.content === 'string') {
				return prefix ? `${prefix}\n\n${obj.content}` : obj.content;
			}

			if (obj.type === 'tool_call') {
				const toolName = typeof obj.tool === 'string' && obj.tool ? obj.tool : 'tool';
				const actionText = `Running ${toolName}…`;
				return prefix ? `${prefix}\n\n${actionText}` : actionText;
			}
		}

		return content;
	}

	function extractStructuredJson(raw: string): { json: unknown; index: number } | null {
		const trimmed = raw.trimEnd();
		let searchIndex = trimmed.lastIndexOf('{');
		while (searchIndex !== -1) {
			const candidate = trimmed.slice(searchIndex);
			try {
				const parsed = JSON.parse(candidate);
				return {
					json: parsed,
					index: searchIndex,
				};
			} catch (error) {
				searchIndex = trimmed.lastIndexOf('{', searchIndex - 1);
			}
		}
		return null;
	}

	function openPanel() {
		if (isOpen.value) return;
		ensureSession();
		isOpen.value = true;
		messages.value = messages.value.map((msg) => ({ ...msg }));
		uiStore.appGridDimensions = {
			...uiStore.appGridDimensions,
			width: window.innerWidth - chatWidth.value,
		};
	}

	function closePanel() {
		if (!isOpen.value) return;
		isOpen.value = false;
		setTimeout(() => {
			uiStore.appGridDimensions = {
				...uiStore.appGridDimensions,
				width: window.innerWidth,
			};
		}, 350);
	}

	function togglePanel() {
		if (isOpen.value) {
			closePanel();
		} else {
			openPanel();
		}
	}

	function updateWidth(width: number) {
		const clamped = Math.min(Math.max(width, MIN_CHAT_WIDTH), MAX_CHAT_WIDTH);
		chatWidth.value = clamped;
		if (isOpen.value) {
			uiStore.appGridDimensions = {
				...uiStore.appGridDimensions,
				width: window.innerWidth - clamped,
			};
		}
	}

	function clearConversation() {
		messages.value = [];
		hasError.value = null;
		resetTrace({ collapse: true });
		startNewSession();
	}

	function handleAgentEvents(events: McpAgentEvent[], finalMessage?: string) {
		let assistantMessageEmitted = false;
		removeTracePlaceholder();
		for (const event of events) {
			if (event.type === 'assistant_message') {
				const content = coerceContent(event.content);
				if (content) {
					appendMessage('assistant', content);
					assistantMessageEmitted = true;
				}
				continue;
			}

			const summary = summariseEvent(event);
			if (summary) {
				recordTrace(event, summary);
			}
		}

		if (!assistantMessageEmitted && finalMessage) {
			appendMessage('assistant', finalMessage);
		}

		if (!events.length) {
			removeTracePlaceholder();
		}
	}

	function handleStreamedEvent(event: McpAgentEvent) {
		hasReceivedStreamEvent.value = true;
		handleAgentEvents([event]);
	}

	async function sendDraft() {
		const text = draft.value.trim();
		if (!text || isSending.value) return;

		ensureSession();
		appendMessage('user', text);
		draft.value = '';
		hasError.value = null;

		const expandedBeforeSend = isTraceExpanded.value;
		resetTrace({ collapse: !expandedBeforeSend });
		if (expandedBeforeSend) {
			isTraceExpanded.value = true;
		}
		hasReceivedStreamEvent.value = false;
		seedTracePlaceholder();

		isSending.value = true;

		try {
			const response = await fetch(chatEndpoint.value, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					prompt: text,
					session_id: sessionId.value,
				}),
			});

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}

			const data = await response.json();
			if (typeof data.session_id === 'string') {
				const newSessionId = data.session_id;
				if (newSessionId && newSessionId !== sessionId.value) {
					sessionId.value = newSessionId;
					if (isBrowser) {
						connectEventStream();
					}
				}
			}
			const events = Array.isArray(data.events) ? (data.events as McpAgentEvent[]) : [];
			const finalMessage =
				typeof data.final === 'string'
					? data.final
					: typeof data.response === 'string'
						? data.response
						: undefined;

			if (!hasReceivedStreamEvent.value) {
				if (events.length > 0) {
					handleAgentEvents(events, finalMessage);
				} else if (finalMessage) {
					appendMessage('assistant', finalMessage);
					removeTracePlaceholder();
				} else {
					appendMessage('assistant', JSON.stringify(data));
					removeTracePlaceholder();
				}
			} else {
				if (finalMessage) {
					const normalisedFinal = finalMessage.trim();
					const lastAssistantMessage = [...messages.value]
						.reverse()
						.find((message) => message.role === 'assistant');
					if (!lastAssistantMessage || lastAssistantMessage.content.trim() !== normalisedFinal) {
						appendMessage('assistant', finalMessage);
					}
				}
				removeTracePlaceholder();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			hasError.value = message;
			appendMessage('error', message);
			removeTracePlaceholder();
			recordTrace(
				{ type: 'system_notice', content: message },
				truncateSummary(`Error: ${message}`),
			);
		} finally {
			isSending.value = false;
		}
	}

	return {
		chatWidth,
		isOpen,
		isSending,
		hasError,
		messages,
		draft,
		canSubmit,
		openPanel,
		closePanel,
		togglePanel,
		updateWidth,
		sendDraft,
		clearConversation,
		thinkingTrace,
		hasTrace,
		isTraceExpanded,
		toggleTrace,
		expandTrace,
		collapseTrace,
	};
});

function coerceContent(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch (error) {
			return String(value);
		}
	}
	return String(value);
}

function summariseEvent(event: McpAgentEvent): string | null {
	switch (event.type) {
		case 'thought': {
			const content = truncateSummary(coerceContent(event.content));
			return content || 'Thinking…';
		}
		case 'tool_call': {
			const toolName = extractToolName(event) || 'tool';
			return `Invoked ${toolName}`;
		}
		case 'tool_result': {
			const toolName = extractToolName(event);
			return toolName ? `${toolName} completed` : 'Tool completed';
		}
		case 'system_notice': {
			const content = truncateSummary(coerceContent(event.content));
			return content || 'System notice';
		}
		default:
			return null;
	}
}

function extractToolName(event: McpAgentEvent): string | undefined {
	// For tool_call events, the tool name is in the content field
	if (event.type === 'tool_call') {
		const content = event.content;
		if (typeof content === 'string') {
			const trimmed = content.trim();
			if (trimmed) return trimmed;
		}
	}

	// For tool_result events, the tool name is in metadata.tool
	if (event.metadata && typeof event.metadata === 'object') {
		const metadata = event.metadata as Record<string, unknown>;
		if (typeof metadata.tool === 'string' && metadata.tool) {
			return metadata.tool;
		}
	}

	return undefined;
}

function truncateSummary(value: string, limit = 200): string {
	const trimmed = value.trim();
	if (trimmed.length <= limit) {
		return trimmed;
	}
	return `${trimmed.slice(0, Math.max(0, limit - 1))}…`;
}

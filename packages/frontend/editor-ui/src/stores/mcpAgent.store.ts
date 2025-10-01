import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useUIStore } from './ui.store';
import { useWorkflowsStore } from './workflows.store';

export type McpAgentMessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface McpAgentMessage {
	id: string;
	role: McpAgentMessageRole;
	content: string;
	timestamp: string;
}

const DEFAULT_CHAT_WIDTH = 360;
const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 520;
const WORKFLOW_REFRESH_TOOL_KEYWORDS = [
	'n8n_create_workflow',
	'n8n_update_full_workflow',
	'n8n_update_partial_workflow',
	'n8n_validate_workflow',
];

function sanitizeBaseUrl(raw: string | undefined): string {
	if (!raw) return 'http://localhost:8000';
	return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export const useMcpAgentStore = defineStore('mcpAgent', () => {
	const uiStore = useUIStore();
	const workflowsStore = useWorkflowsStore();

	const chatWidth = ref<number>(DEFAULT_CHAT_WIDTH);
	const isOpen = ref(false);
	const isSending = ref(false);
	const hasError = ref<string | null>(null);
	const sessionId = ref<string | null>(null);
	const messages = ref<McpAgentMessage[]>([]);
	const draft = ref('');

	const baseUrl = computed(() =>
		sanitizeBaseUrl(import.meta.env.VITE_MCP_AGENT_API_URL as string | undefined),
	);

	const chatEndpoint = computed(() => `${baseUrl.value}/chat`);

	const canSubmit = computed(() => draft.value.trim().length > 0 && !isSending.value);

	function ensureSession() {
		if (!sessionId.value) {
			sessionId.value = crypto.randomUUID();
		}
	}

	function timestamp(): string {
		return new Date().toISOString();
	}

	function appendMessage(role: McpAgentMessageRole, content: string) {
		messages.value.push({
			id: crypto.randomUUID(),
			role,
			content: role === 'assistant' ? formatAssistantMessage(content) : content,
			timestamp: timestamp(),
		});

		if (role === 'assistant' && shouldRefreshWorkflows(content)) {
			void refreshWorkflowsList();
		}
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

		if (typeof json === 'object' && json) {
			if (json.type === 'response' && typeof json.content === 'string') {
				return prefix ? `${prefix}\n\n${json.content}` : json.content;
			}

			if (json.type === 'tool_call') {
				const toolName = typeof json.tool === 'string' && json.tool ? json.tool : 'tool';
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

	async function refreshWorkflowsList() {
		try {
			await workflowsStore.fetchAllWorkflows();
		} catch (error) {
			console.warn('Failed to refresh workflows after MCP response', error);
		}
	}

	function shouldRefreshWorkflows(raw: string): boolean {
		const structured = extractStructuredJson(raw);
		if (!structured) {
			return false;
		}
		const payload = structured.json as Record<string, unknown> | null;
		if (!payload || typeof payload !== 'object') {
			return false;
		}
		if (payload.type !== 'tool_call') {
			return false;
		}
		const toolName = typeof payload.tool === 'string' ? payload.tool : '';
		if (!toolName) {
			return false;
		}
		return WORKFLOW_REFRESH_TOOL_KEYWORDS.some((keyword) => toolName.includes(keyword));
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
		sessionId.value = crypto.randomUUID();
	}

	async function sendDraft() {
		const text = draft.value.trim();
		if (!text || isSending.value) return;

		ensureSession();
		appendMessage('user', text);
		draft.value = '';
		hasError.value = null;
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
				sessionId.value = data.session_id;
			}
			const reply = typeof data.response === 'string' ? data.response : JSON.stringify(data);
			appendMessage('assistant', reply);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			hasError.value = message;
			appendMessage('error', message);
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
	};
});

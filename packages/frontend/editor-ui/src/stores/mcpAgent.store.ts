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

const DEFAULT_CHAT_WIDTH = 360;
const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 520;

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
			content,
			timestamp: timestamp(),
		});
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

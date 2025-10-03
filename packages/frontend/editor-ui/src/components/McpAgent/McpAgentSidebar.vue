<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import SlideTransition from '@/components/transitions/SlideTransition.vue';
import {
	N8nButton,
	N8nIconButton,
	N8nResizeWrapper,
	N8nInput,
	N8nMarkdown,
} from '@n8n/design-system';
import { useMcpAgentStore, TRACE_PLACEHOLDER_SUMMARY } from '@/stores/mcpAgent.store';

const store = useMcpAgentStore();
const {
	messages,
	isOpen,
	chatWidth,
	isSending,
	hasError,
	thinkingTrace,
	hasTrace,
	isTraceExpanded,
} = storeToRefs(store);

const traceBadgeCount = computed(() =>
	Math.max(
		0,
		thinkingTrace.value.filter((entry) => entry.summary !== TRACE_PLACEHOLDER_SUMMARY).length,
	),
);
const shouldShowThinking = computed(() => isSending.value || hasTrace.value);
const thinkingButtonLabel = computed(() => {
	if (isTraceExpanded.value) return 'Hide thinking';
	if (isSending.value && traceBadgeCount.value === 0) return 'Thinking…';
	return 'Show thinking…';
});
const messagesContainer = ref<HTMLElement | null>(null);
const markdownOptions = {
	markdown: {
		breaks: true,
		linkify: true,
	},
};

function onResize(data: { width: number }) {
	store.updateWidth(data.width);
}

async function onSubmit() {
	await store.sendDraft();
}

function onClear() {
	store.clearConversation();
}

function toggleThinking() {
	store.toggleTrace();
}

function onInputKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		void onSubmit();
	}
}

function scrollToBottom() {
	nextTick(() => {
		const container = messagesContainer.value;
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	});
}

watch(
	() => messages.value.length,
	() => {
		if (messages.value.length > 0) {
			scrollToBottom();
		}
	},
);

watch(isOpen, (opened) => {
	if (opened) {
		scrollToBottom();
	}
});

watch(isTraceExpanded, (expanded) => {
	if (expanded) {
		scrollToBottom();
	}
});

watch(
	() => thinkingTrace.value.length,
	() => {
		if (isTraceExpanded.value) {
			scrollToBottom();
		}
	},
);
</script>

<template>
	<SlideTransition>
		<N8nResizeWrapper
			v-if="isOpen"
			class="panel-wrapper"
			:supported-directions="['left']"
			:width="chatWidth"
			@resize="onResize"
		>
			<div class="panel" :style="{ width: `${chatWidth}px` }">
				<header class="panel__header">
					<div>
						<h3 class="panel__title">Media Agent</h3>
						<p class="panel__subtitle">Connected to n8n MCP</p>
					</div>
					<div class="panel__actions">
						<N8nButton text @click="onClear">Reset</N8nButton>
						<N8nIconButton icon="x" type="tertiary" size="medium" @click="store.closePanel" />
					</div>
				</header>
				<section ref="messagesContainer" class="panel__body">
					<ul class="messages">
						<li
							v-for="message in messages"
							:key="message.id"
							:class="['messages__item', `messages__item--${message.role}`]"
						>
							<span class="messages__label">
								{{
									message.role === 'user'
										? 'You'
										: message.role === 'assistant'
											? 'Agent'
											: 'System'
								}}
							</span>
							<div class="messages__bubble">
								<N8nMarkdown
									v-if="message.role === 'assistant'"
									:content="message.content"
									:options="markdownOptions"
									class="messages__markdown"
								/>
								<pre v-else>{{ message.content }}</pre>
								<time>{{ new Date(message.timestamp).toLocaleTimeString() }}</time>
							</div>
						</li>
					</ul>
					<div v-if="shouldShowThinking" class="thinking">
						<N8nButton
							type="tertiary"
							size="small"
							:class="['thinking__toggle', { 'thinking__toggle--active': isTraceExpanded }]"
							@click="toggleThinking"
						>
							{{ thinkingButtonLabel }}
							<span v-if="traceBadgeCount > 0" class="thinking__badge">{{ traceBadgeCount }}</span>
						</N8nButton>
						<transition name="fade">
							<ul v-if="isTraceExpanded" class="thinking__timeline">
								<li v-for="entry in thinkingTrace" :key="entry.id" class="thinking__item">
									<span class="thinking__summary">{{ entry.summary }}</span>
									<time>{{ new Date(entry.timestamp).toLocaleTimeString() }}</time>
								</li>
							</ul>
						</transition>
					</div>
				</section>
				<footer class="panel__footer">
					<form class="panel__form" @submit.prevent="onSubmit">
						<N8nInput
							v-model="store.draft"
							type="textarea"
							placeholder="Ask the agent to inspect workflows, search data, or run tools..."
							:rows="3"
							@keydown="onInputKeydown"
						></N8nInput>
						<N8nButton
							type="primary"
							:loading="isSending"
							:disabled="!store.canSubmit"
							@click="onSubmit"
						>
							Send
						</N8nButton>
					</form>
					<p v-if="errorMessage" class="panel__error">{{ errorMessage }}</p>
				</footer>
			</div>
		</N8nResizeWrapper>
	</SlideTransition>
</template>

<style scoped lang="scss">
.panel-wrapper {
	height: 100vh;
}

.panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--color-surface-primary);
	border-left: 1px solid var(--color-foreground-base);
}

.panel__header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: var(--spacing-m);
	border-bottom: 1px solid var(--color-foreground-base);
}

.panel__title {
	margin: 0;
	font-size: var(--font-size-m);
	font-weight: var(--font-weight-bold);
}

.panel__subtitle {
	margin: 0;
	font-size: var(--font-size-2xs);
	color: var(--color-text-light);
}

.panel__actions {
	display: flex;
	align-items: center;
	gap: var(--spacing-xs);
}

.panel__body {
	flex: 1;
	overflow-y: auto;
	padding: var(--spacing-m);
	background: var(--color-surface-secondary);
}

.messages {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: var(--spacing-m);
}

.messages__item {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-3xs);
}

.messages__label {
	font-size: var(--font-size-2xs);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-light);
}

.messages__item--user .messages__label {
	color: rgba(255, 255, 255, 0.75);
}

.messages__bubble {
	border-radius: var(--border-radius-large);
	padding: var(--spacing-s);
	background: var(--color-surface-secondary);
	box-shadow: var(--shadow-s);
	color: var(--color-text-base);
	max-width: 100%;
	overflow-wrap: anywhere;
}

.messages__markdown {
	white-space: pre-wrap;
	font-size: var(--font-size-xs);
	line-height: var(--font-line-height-regular);
}

.messages__markdown :deep(> *:first-child) {
	margin-top: 0;
}

.messages__markdown :deep(p) {
	margin: 0;
	font-size: var(--font-size-xs);
}

.messages__markdown :deep(h1),
.messages__markdown :deep(h2),
.messages__markdown :deep(h3),
.messages__markdown :deep(h4),
.messages__markdown :deep(h5),
.messages__markdown :deep(h6) {
	margin: 0;
	font-size: var(--font-size-s);
}

.messages__markdown :deep(strong) {
	font-weight: var(--font-weight-extrabold);
}

.messages__markdown :deep(li) {
	font-size: var(--font-size-xs);
}

.messages__item--user .messages__bubble {
	background: var(--color-primary);
	color: #fff;
	border: none;
}

.messages__item--assistant .messages__bubble {
	background: var(--color-secondary-tint-2);
	color: var(--color-text-base);
}

.messages__item--error .messages__bubble {
	background: var(--color-danger-tint-2);
	color: var(--color-danger);
}

.messages__bubble pre {
	margin: 0;
	font-family: var(--font-family-monospace);
	font-size: var(--font-size-xs);
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
	color: inherit;
}

.messages__bubble time {
	display: block;
	margin-top: var(--spacing-3xs);
	font-size: var(--font-size-3xs);
	color: var(--color-text-light);
}

.messages__item--user .messages__bubble time {
	color: rgba(255, 255, 255, 0.75);
}

.messages__item--user .messages__bubble pre {
	color: #fff;
}

.thinking {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-2xs);
	margin-top: var(--spacing-s);
}

.thinking__toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing-2xs);
	width: 100%;
	padding: var(--spacing-s);
	border-radius: var(--border-radius-large);
	box-shadow: none;
	background-color: transparent !important;
	border: 1px solid var(--color-foreground-base) !important;
	color: var(--color-text-base) !important;
}

.thinking__toggle:hover,
.thinking__toggle:focus {
	background-color: transparent !important;
	border-color: var(--color-primary) !important;
	color: var(--color-primary) !important;
}

.thinking__toggle--active {
	box-shadow: var(--shadow-s);
	border-color: var(--color-primary) !important;
	color: var(--color-primary) !important;
}

.thinking__badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.5rem;
	padding: 0 var(--spacing-4xs);
	border-radius: var(--border-radius-base);
	background: var(--color-foreground-base);
	color: var(--color-surface-primary);
	font-size: var(--font-size-3xs);
	font-weight: var(--font-weight-bold);
}

.thinking__timeline {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: var(--spacing-4xs);
}

.thinking__item {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--spacing-3xs);
	background: var(--color-surface-secondary);
	border-radius: var(--border-radius-base);
	padding: var(--spacing-2xs) var(--spacing-s);
	color: var(--color-text-light);
	font-size: var(--font-size-2xs);
}

.thinking__summary {
	width: 100%;
	white-space: normal;
	overflow-wrap: anywhere;
}

.fade-enter-active,
.fade-leave-active {
	opacity: 1;
	transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

.panel__footer {
	padding: var(--spacing-m);
	border-top: 1px solid var(--color-foreground-base);
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.panel__form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.panel__error {
	color: var(--color-danger);
	font-size: var(--font-size-2xs);
	margin: 0;
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import SlideTransition from '@/components/transitions/SlideTransition.vue';
import {
	N8nButton,
	N8nIconButton,
	N8nResizeWrapper,
	N8nInput,
	N8nMarkdown,
} from '@n8n/design-system';
import { useMcpAgentStore } from '@/stores/mcpAgent.store';

const store = useMcpAgentStore();

const messages = computed(() => store.messages);
const isOpen = computed(() => store.isOpen);
const chatWidth = computed(() => store.chatWidth);
const isSending = computed(() => store.isSending);
const errorMessage = computed(() => store.hasError);
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

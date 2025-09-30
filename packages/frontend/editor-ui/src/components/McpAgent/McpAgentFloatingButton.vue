<script setup lang="ts">
import { N8nButton } from '@n8n/design-system';
import { useMcpAgentStore } from '@/stores/mcpAgent.store';

const store = useMcpAgentStore();

function openChat() {
	store.openPanel();
}
</script>

<template>
	<div :class="$style.container" data-test-id="mcp-agent-floating-button">
		<N8nButton type="primary" size="large" icon="robot" @click="openChat"> Media Agent </N8nButton>
	</div>
</template>

<style lang="scss" module>
.container {
	position: absolute;
	right: var(--spacing-s);
	bottom: calc(var(--ask-assistant-floating-button-bottom-offset, var(--spacing-2xl)) + 56px);
	z-index: var(--z-index-ask-assistant-floating-button);
}
</style>

![n8n.io - Workflow Automation](https://user-images.githubusercontent.com/65276001/173571060-9f2f6d7b-bac0-43b6-bdb2-001da9694058.png)

# n8n-editor-ui

The UI to create and update n8n workflows

```
npm install n8n -g
```

## Project setup

```
pnpm install
```

### Compiles and hot-reloads for development

```
pnpm serve
```

### Compiles and minifies for production

```
pnpm build
```

### Run your tests

```
pnpm test
```

### Lints and fixes files

```
pnpm lint
```

### Run your end-to-end tests

```
pnpm test:e2e
```

### Run your unit tests

```
pnpm test:unit
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).

## License

You can find the license information [here](https://github.com/n8n-io/n8n/blob/master/README.md#license)

### Media Agent MCP panel

Set the `VITE_MCP_AGENT_API_URL` environment variable before running `pnpm serve` if you want the in-app Media Agent sidebar to connect to the Python sidecar.

```bash
export VITE_MCP_AGENT_API_URL='http://localhost:8000'
```

With the frontend running you'll see a "Media Agent" button near the existing assistant control; it opens a chat panel that relays prompts to the MCP server.

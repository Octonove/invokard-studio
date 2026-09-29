# Provider setup and job recovery

Provider configuration is optional. Local editing, importing and rendering work without API accounts. The catalog describes implemented integration paths; it does not confirm account access or available credits. `getProviderStatus()` only reports whether environment credentials are present and always reports `connectionVerified: false`. No startup or status check makes a paid request.

## Magnific

The default integration uses the **official remote MCP server**, `https://mcp.magnific.com`, with streamable HTTP and browser OAuth managed by the host. Add that server in your host's MCP settings and complete sign-in. `providerSetup('magnific')` returns setup instructions and a portable MCP configuration object. It does not modify host settings or claim OAuth succeeded. Use the host's discovered Magnific image, video, voice and editing tools. This local plugin never copies OAuth tokens or proxies those tool calls.

For music, the optional local adapter implements the documented Lyria 3 API. Set `MAGNIFIC_API_KEY` in the environment of the process that launches the local MCP. An OAuth session is separate from this API key.

```ts
const job = await submitMagnificMusic(projectDir, {
  prompt: 'Gentle cinematic piano with warm strings and a steady groove',
  model: 'clip', // or 'pro'
  requestKey: 'project-intro-music-v1',
  budgetApproved: true
});
const status = await pollMagnificMusic(projectDir, job.id);
```

The adapter sends `POST https://api.magnific.com/v1/ai/music-generation/lyria-3` with `x-magnific-api-key`, then polls `GET` on that URL plus `/{task-id}`. It supports text prompts of 10–2000 characters and the `clip`/`pro` variants. Reference images and webhooks are not exposed in this version. Returned `data.generated` HTTPS URLs become `outputUrls`.

## Higgsfield

Create server-side credentials in [Higgsfield Console](https://console.higgsfield.ai). Set `HIGGSFIELD_API_KEY` and `HIGGSFIELD_API_SECRET` in the MCP process environment. These plugin variable names map to the documented `Authorization: Key KEY_ID:KEY_SECRET` header. They intentionally differ from the official SDK's `HF_*` environment names.

```ts
const job = await submitHiggsfield(projectDir, {
  model: 'higgsfield-ai/soul/v2/standard',
  input: { prompt: 'Editorial portrait in soft daylight' },
  requestKey: 'scene-1-image-v1',
  budgetApproved: true
});
const status = await pollHiggsfield(projectDir, job.id);
```

The model is a relative model path from the Console. The adapter sends `input` directly as the JSON body to `https://api.higgsfield.ai/{model}`; it does not wrap it in another `input` object. Schemas and available models vary by account and model. Check the current model documentation before submitting. Generic input transport is supported; model-specific schema validation and account availability are not established by this adapter.

Polling uses the documented `GET https://api.higgsfield.ai/requests/{request_id}/status` route. Images, video, audio and audios outputs are recognized. Additional 3D or archive artifacts are not imported automatically. No upload, cancellation or webhook listener is included in this version. Use public input media URLs supported by the selected model; output downloading is a separate asset-import step.

## Paid request safety

Each intended generation needs a stable `requestKey` and an explicitly approved budget (`budgetApproved: true`). The plugin does not estimate prices or enforce a currency limit. Approval must cover the concrete model and request before the host passes this flag.

Before a POST, a complete intent record is written and synced to `provider-jobs/<local-job-id>.json`. Its initial status is `submission_unknown`: if the process stops between saving and receiving acknowledgement, an automatic retry would be unsafe. Exclusive file creation prevents two processes from submitting the same key. Local job storage needs a filesystem that supports hard links; failure to publish the intent stops before the POST. Jobs contain a hash of the request and key, model, times, status, remote ID and output URLs; input prompts, request headers and credential values are not saved.

Reuse of the same key and input returns the existing job, including after a process restart. Reuse with different input fails. Object property order does not change request identity. A new key means an intentional new generation and can incur another charge. Never delete an uncertain job to force a retry.

| Local status | Meaning and next action |
|---|---|
| `submission_unknown` | A POST may have been accepted, but no usable acknowledgement is saved. Inspect account history or contact provider support; do not submit again. |
| `submitted` | A remote ID is saved. Poll this local job. Transient GET errors preserve the remote ID and status. |
| `completed` | Provider reported completion. Inspect `outputUrls` and any output warning, then import the media. |
| `failed` | A documented rejection or terminal failure occurred. Inspect the console and correct the request before intentionally creating another job. |

Higgsfield currently documents **no server-side idempotency key**. This plugin's deduplication is local to the project and retained job files. It cannot deduplicate across different project directories, deleted records or another application. Ambiguous network errors, malformed successful responses and server errors are never automatically retried. Only local Windows file replacement may be retried when a concurrent reader temporarily prevents a save. Neither adapter forwards redirects or response-provided API URLs with credentials.

If an uncertain submission is found in provider history, the host can explicitly attach its matching remote UUID:

```ts
await reconcileProviderJob(projectDir, localJobId, verifiedRemoteRequestId);
```

Reconciliation performs a GET and verifies the returned ID, then saves its status; it does not submit generation. The operator must establish that the recovered ID is the same intended request. The API status response does not prove its original prompt. An existing saved remote ID cannot be silently replaced. If the remote ID cannot be recovered, the job remains unknown until the user decides whether a new paid generation is acceptable.

Credentials are read only from the process environment. Never pass them in prompts, `input`, filenames or MCP parameters. Provider error bodies and response headers are deliberately not returned or saved. HTTPS output URLs may contain provider-issued signed download parameters; treat project files as private and avoid committing them. Completed files should be imported promptly into your own project storage because provider links expire.

## Importing generated outputs

`downloadToTemp(projectDir, outputUrl, kind)` downloads one image, video or audio file into the project's `.downloads` directory. The caller then passes that path to `ProjectStore.importAsset` and removes the temporary file in a `finally` block. Import performs actual media inspection. Keep the provider, model and remote creation ID as provenance; do not copy a signed download URL into the permanent asset record.

The downloader permits HTTPS on port 443, rejects embedded URL credentials and private or reserved IP destinations, checks every DNS answer, and pins each connection to a checked address. Each of up to three redirects is checked again. It sends no account credentials. Responses need an allowed MIME type or a supported media extension, are capped at 2 GiB, and have a five-minute overall deadline including DNS and streaming. Partial files are removed after failure. Private CDNs reachable only over local networks and URLs requiring authentication headers are deliberately unsupported; download those through the host's authorized provider integration and import the resulting local file.

## Validation and sources

The adapter is tested with injected `fetch` and real temporary filesystem persistence: intent before POST, duplicate and concurrent submissions, restart recovery, uncertain network errors, provider rejections, status polling, output parsing, credentials, path traversal, directory junctions and manual reconciliation. No paid request or live authenticated account access was tested. OAuth flow validation remains the host's responsibility. Public API contracts were checked on 2026-09-29 against these official sources:

- [Higgsfield API overview and direct JSON submission](https://docs.higgsfield.ai/docs)
- [Higgsfield request states and output formats](https://docs.higgsfield.ai/docs/concepts/requests)
- [Higgsfield request status reference](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status)
- [Higgsfield errors, retries and absence of submission idempotency keys](https://docs.higgsfield.ai/docs/concepts/errors)
- [Official Higgsfield TypeScript SDK](https://github.com/higgsfield-ai/higgsfield-js)
- [Magnific official MCP and OAuth setup](https://docs.magnific.com/modelcontextprotocol)
- [Magnific Lyria 3 generation](https://docs.magnific.com/api-reference/music-generation/lyria-3/generate)
- [Magnific Lyria 3 task status](https://docs.magnific.com/api-reference/music-generation/lyria-3/task-by-id)

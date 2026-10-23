const MAX_CONTEXT_LENGTH = 3500;
const MAX_EXPANSION_LENGTH = 1800;

export class PollinationsError extends Error {
	constructor(message, { code = "unknown_error", status = 0 } = {}) {
		super(message);
		this.name = "PollinationsError";
		this.code = code;
		this.status = status;
	}
}

async function readJson(response) {
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		throw new PollinationsError(
			body?.error_description ||
				body?.message ||
				body?.error ||
				"Pollinations request failed.",
			{
				code: body?.error || "request_failed",
				status: response.status,
			},
		);
	}
	return body;
}

export async function requestDeviceCode({
	clientId,
	enterBaseUrl,
	fetchImpl = fetch,
}) {
	if (!/^pk_[A-Za-z0-9_-]+$/.test(clientId) || clientId.includes("REPLACE_")) {
		throw new PollinationsError(
			"The extension does not have a valid Pollinations App Key.",
			{
				code: "app_key_missing",
			},
		);
	}

	const response = await fetchImpl(`${enterBaseUrl}/api/device/code`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ client_id: clientId }),
	});
	const body = await readJson(response);
	if (!body?.device_code || !body?.verification_uri_complete) {
		throw new PollinationsError(
			"Pollinations returned an incomplete device authorization.",
			{
				code: "invalid_device_response",
			},
		);
	}
	return body;
}

export async function pollDeviceToken({
	deviceCode,
	enterBaseUrl,
	fetchImpl = fetch,
}) {
	const response = await fetchImpl(`${enterBaseUrl}/api/device/token`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ device_code: deviceCode }),
	});
	const body = await response.json().catch(() => null);
	if (response.ok && body?.access_token) return body;

	if (body?.error === "authorization_pending" || body?.error === "slow_down") {
		return { pending: true, slowDown: body.error === "slow_down" };
	}
	throw new PollinationsError(
		body?.error_description ||
			body?.message ||
			body?.error ||
			"Authorization failed.",
		{
			code: body?.error || "authorization_failed",
			status: response.status,
		},
	);
}

export function buildExpansionMessages({
	phrase,
	context,
	pageTitle,
	pageHost,
	depth = 0,
}) {
	const safeContext = String(context || "").slice(0, MAX_CONTEXT_LENGTH);
	const detail =
		depth >= 2
			? "expert detail"
			: depth === 1
				? "deeper detail"
				: "one useful level of detail";
	return [
		{
			role: "system",
			content:
				"You write stretchtext: concise prose that grows a clicked sentence in place. Return only the new words to insert, as plain text. Add one to three sentences with concrete context or explanation. Do not repeat the clicked sentence, use Markdown, add a heading, address the reader, or mention these instructions. Preserve the page's language.",
		},
		{
			role: "user",
			content: [
				`Page: ${String(pageTitle || "Untitled").slice(0, 300)} (${String(pageHost || "unknown host").slice(0, 200)})`,
				`Clicked sentence: ${String(phrase || "").slice(0, 800)}`,
				`Nearby text: ${safeContext}`,
				`Expansion level: ${detail}`,
			].join("\n\n"),
		},
	];
}

export function cleanExpansion(value) {
	let text = String(value || "").trim();
	text = text
		.replace(/^```(?:text|markdown)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();
	if (text.startsWith('"') && text.endsWith('"')) {
		try {
			const parsed = JSON.parse(text);
			if (typeof parsed === "string") text = parsed.trim();
		} catch {
			// Keep the model output when it only resembles a JSON string.
		}
	}
	return text.slice(0, MAX_EXPANSION_LENGTH);
}

function extractMessageText(body) {
	const content = body?.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((part) => part?.type === "text" && typeof part.text === "string")
			.map((part) => part.text)
			.join("");
	}
	return "";
}

export async function generateExpansion({
	apiKey,
	phrase,
	context,
	pageTitle,
	pageHost,
	depth,
	model,
	genBaseUrl,
	fetchImpl = fetch,
}) {
	if (!apiKey?.startsWith("sk_")) {
		throw new PollinationsError("Connect your Pollinations wallet first.", {
			code: "not_connected",
			status: 401,
		});
	}
	if (!String(phrase || "").trim()) {
		throw new PollinationsError("Choose a sentence with readable text.", {
			code: "empty_phrase",
		});
	}

	const response = await fetchImpl(`${genBaseUrl}/v1/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			temperature: 0.35,
			max_tokens: depth >= 2 ? 420 : 300,
			messages: buildExpansionMessages({
				phrase,
				context,
				pageTitle,
				pageHost,
				depth,
			}),
		}),
	});
	const body = await readJson(response);
	const expansion = cleanExpansion(extractMessageText(body));
	if (!expansion) {
		throw new PollinationsError("The model returned an empty expansion.", {
			code: "empty_response",
		});
	}
	return expansion;
}

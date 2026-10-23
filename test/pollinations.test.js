import assert from "node:assert/strict";
import test from "node:test";
import {
	cleanExpansion,
	generateExpansion,
	pollDeviceToken,
	requestDeviceCode,
} from "../lib/pollinations.js";

function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

test("starts device flow with the publishable App Key", async () => {
	let request;
	const result = await requestDeviceCode({
		clientId: "pk_test_public_client",
		enterBaseUrl: "https://enter.example",
		fetchImpl: async (url, init) => {
			request = { url, init };
			return jsonResponse({
				device_code: "device-secret",
				user_code: "ABCD-1234",
				verification_uri_complete:
					"https://enter.example/device?user_code=ABCD-1234",
				expires_in: 1800,
			});
		},
	});

	assert.equal(request.url, "https://enter.example/api/device/code");
	assert.deepEqual(JSON.parse(request.init.body), {
		client_id: "pk_test_public_client",
	});
	assert.equal(result.user_code, "ABCD-1234");
});

test("rejects a missing or placeholder App Key before calling the network", async () => {
	let called = false;
	await assert.rejects(
		requestDeviceCode({
			clientId: "pk_REPLACE_WITH_POLLINATIONS_APP_KEY",
			enterBaseUrl: "https://enter.example",
			fetchImpl: async () => {
				called = true;
				return jsonResponse({});
			},
		}),
		(error) => error.code === "app_key_missing",
	);
	assert.equal(called, false);
});

test("reports a pending device authorization without throwing", async () => {
	const result = await pollDeviceToken({
		deviceCode: "pending-device",
		enterBaseUrl: "https://enter.example",
		fetchImpl: async () =>
			jsonResponse({ error: "authorization_pending" }, 400),
	});
	assert.deepEqual(result, { pending: true, slowDown: false });
});

test("builds a bounded, plain-text expansion request", async () => {
	let request;
	const expansion = await generateExpansion({
		apiKey: "sk_user_authorized",
		phrase: "The archive was built to last.",
		context: "x".repeat(5000),
		pageTitle: "An old archive",
		pageHost: "example.com",
		depth: 1,
		model: "openai/gpt-5.4-nano",
		genBaseUrl: "https://gen.example",
		fetchImpl: async (url, init) => {
			request = { url, init };
			return jsonResponse({
				choices: [
					{
						message: {
							content:
								"```text\nIt uses redundant, geographically separated copies.\n```",
						},
					},
				],
			});
		},
	});

	assert.equal(
		expansion,
		"It uses redundant, geographically separated copies.",
	);
	assert.equal(request.url, "https://gen.example/v1/chat/completions");
	assert.equal(request.init.headers.Authorization, "Bearer sk_user_authorized");
	const body = JSON.parse(request.init.body);
	assert.equal(body.model, "openai/gpt-5.4-nano");
	assert.match(body.messages[1].content, /Expansion level: deeper detail/);
	assert.ok(body.messages[1].content.length < 4500);
});

test("cleans quoted or fenced model output", () => {
	assert.equal(
		cleanExpansion('"A compact expansion."'),
		"A compact expansion.",
	);
	assert.equal(
		cleanExpansion("```markdown\nMore detail.\n```"),
		"More detail.",
	);
});

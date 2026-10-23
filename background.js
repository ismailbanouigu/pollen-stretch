import { CONFIG, hasConfiguredAppKey } from "./config.js";
import {
	generateExpansion,
	pollDeviceToken,
	requestDeviceCode,
} from "./lib/pollinations.js";

const TOKEN_KEY = "pollinationsAccessToken";
const PENDING_KEY = "pollinationsPendingAuth";

async function getSession(keys) {
	return chrome.storage.session.get(keys);
}

async function authStatus() {
	const values = await getSession([TOKEN_KEY, PENDING_KEY]);
	const pending = values[PENDING_KEY];
	if (pending?.expiresAt && pending.expiresAt <= Date.now()) {
		await chrome.storage.session.remove(PENDING_KEY);
		return { connected: Boolean(values[TOKEN_KEY]), pending: null };
	}
	return {
		connected: Boolean(values[TOKEN_KEY]),
		pending: pending
			? {
					userCode: pending.userCode,
					verificationUriComplete: pending.verificationUriComplete,
					expiresAt: pending.expiresAt,
				}
			: null,
		configured: hasConfiguredAppKey(),
	};
}

async function startAuthorization() {
	const device = await requestDeviceCode({
		clientId: CONFIG.appKey,
		enterBaseUrl: CONFIG.enterBaseUrl,
	});
	const pending = {
		deviceCode: device.device_code,
		userCode: device.user_code,
		verificationUriComplete: device.verification_uri_complete,
		expiresAt: Date.now() + Number(device.expires_in || 1800) * 1000,
	};
	await chrome.storage.session.set({ [PENDING_KEY]: pending });
	await chrome.tabs.create({ url: device.verification_uri_complete });
	return authStatus();
}

async function checkAuthorization() {
	const values = await getSession(PENDING_KEY);
	const pending = values[PENDING_KEY];
	if (!pending) return authStatus();
	if (pending.expiresAt <= Date.now()) {
		await chrome.storage.session.remove(PENDING_KEY);
		throw new Error("The authorization code expired. Start again.");
	}

	const token = await pollDeviceToken({
		deviceCode: pending.deviceCode,
		enterBaseUrl: CONFIG.enterBaseUrl,
	});
	if (token.pending) return { ...(await authStatus()), waiting: true };

	await chrome.storage.session.set({ [TOKEN_KEY]: token.access_token });
	await chrome.storage.session.remove(PENDING_KEY);
	return authStatus();
}

async function disconnect() {
	await chrome.storage.session.remove([TOKEN_KEY, PENDING_KEY]);
	return authStatus();
}

async function expand(message) {
	const values = await getSession(TOKEN_KEY);
	return generateExpansion({
		apiKey: values[TOKEN_KEY],
		phrase: message.phrase,
		context: message.context,
		pageTitle: message.pageTitle,
		pageHost: message.pageHost,
		depth: message.depth,
		model: CONFIG.model,
		genBaseUrl: CONFIG.genBaseUrl,
	});
}

async function handleMessage(message) {
	switch (message?.type) {
		case "AUTH_STATUS":
			return authStatus();
		case "START_AUTH":
			return startAuthorization();
		case "CHECK_AUTH":
			return checkAuthorization();
		case "DISCONNECT":
			return disconnect();
		case "EXPAND_TEXT":
			return { expansion: await expand(message) };
		default:
			throw new Error("Unknown extension request.");
	}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	handleMessage(message)
		.then((value) => sendResponse({ ok: true, value }))
		.catch((error) =>
			sendResponse({
				ok: false,
				error: {
					message: error instanceof Error ? error.message : "Unexpected error.",
					code: error?.code || "unexpected_error",
					status: error?.status || 0,
				},
			}),
		);
	return true;
});

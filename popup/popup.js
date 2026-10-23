const elements = {
	statusDot: document.querySelector("#status-dot"),
	statusTitle: document.querySelector("#status-title"),
	statusCopy: document.querySelector("#status-copy"),
	authActions: document.querySelector("#auth-actions"),
	pageTitle: document.querySelector("#page-title"),
	toggle: document.querySelector("#toggle"),
	depth: document.querySelector("#depth"),
};

let auth = { connected: false, pending: null, configured: true };
let currentTab = null;
let pageEnabled = false;

async function send(message) {
	const response = await chrome.runtime.sendMessage(message);
	if (!response?.ok)
		throw new Error(response?.error?.message || "Extension request failed.");
	return response.value;
}

function makeButton(label, className, onClick) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `button ${className}`;
	button.textContent = label;
	button.addEventListener("click", async () => {
		button.disabled = true;
		try {
			await onClick();
		} catch (error) {
			showError(
				error instanceof Error ? error.message : "Something went wrong.",
			);
		} finally {
			button.disabled = false;
		}
	});
	return button;
}

function showError(message) {
	elements.statusCopy.textContent = message;
	elements.statusCopy.classList.add("error");
}

function renderAuth() {
	elements.statusCopy.classList.remove("error");
	elements.authActions.replaceChildren();

	if (auth.connected) {
		elements.statusDot.className = "status-dot connected";
		elements.statusTitle.textContent = "Connected with your Pollen";
		elements.statusCopy.textContent =
			"The temporary key is stored only for this browser session.";
		elements.authActions.append(
			makeButton("Disconnect", "secondary", async () => {
				if (currentTab?.id && pageEnabled) {
					await chrome.tabs
						.sendMessage(currentTab.id, {
							type: "SET_STRETCH_STATE",
							enabled: false,
							depth: 0,
						})
						.catch(() => null);
				}
				auth = await send({ type: "DISCONNECT" });
				pageEnabled = false;
				render();
			}),
		);
		return;
	}

	if (auth.pending) {
		elements.statusDot.className = "status-dot waiting";
		elements.statusTitle.textContent = `Approve code ${auth.pending.userCode}`;
		elements.statusCopy.textContent =
			"Approve in the Pollinations tab, then check again here.";
		elements.authActions.append(
			makeButton("Check authorization", "primary", async () => {
				auth = await send({ type: "CHECK_AUTH" });
				render();
			}),
			makeButton("Open approval", "secondary", async () => {
				await chrome.tabs.create({ url: auth.pending.verificationUriComplete });
			}),
		);
		return;
	}

	elements.statusDot.className = "status-dot";
	elements.statusTitle.textContent = auth.configured
		? "Connect your Pollen"
		: "App Key needed";
	elements.statusCopy.textContent = auth.configured
		? "You approve a temporary budget; this extension never sees your account password."
		: "The developer must add a Pollinations App Key before publishing.";
	elements.authActions.append(
		makeButton("Connect with Pollinations", "primary", async () => {
			auth = await send({ type: "START_AUTH" });
			render();
		}),
	);
}

function renderPage() {
	const supported = /^https?:/.test(currentTab?.url || "");
	elements.pageTitle.textContent = supported
		? currentTab.title || "Current page"
		: "Unavailable on this page";
	elements.toggle.disabled = !(auth.connected && supported);
	elements.toggle.setAttribute("aria-checked", String(pageEnabled));
	elements.toggle.querySelector("b").textContent = pageEnabled ? "On" : "Off";
}

function render() {
	renderAuth();
	renderPage();
}

async function readPageState() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	currentTab = tab || null;
	if (!tab?.id || !/^https?:/.test(tab.url || "")) return;
	try {
		const response = await chrome.tabs.sendMessage(tab.id, {
			type: "GET_STRETCH_STATE",
		});
		pageEnabled = Boolean(response?.enabled);
	} catch {
		pageEnabled = false;
	}
}

elements.toggle.addEventListener("click", async () => {
	if (!currentTab?.id || elements.toggle.disabled) return;
	try {
		const response = await chrome.tabs.sendMessage(currentTab.id, {
			type: "SET_STRETCH_STATE",
			enabled: !pageEnabled,
			depth: Number(elements.depth.value),
		});
		pageEnabled = Boolean(response?.enabled);
		renderPage();
	} catch {
		showError("Reload this page once, then turn on stretch mode again.");
	}
});

elements.depth.addEventListener("change", async () => {
	const depth = Number(elements.depth.value);
	await chrome.storage.local.set({ expansionDepth: depth });
	if (pageEnabled && currentTab?.id) {
		await chrome.tabs.sendMessage(currentTab.id, {
			type: "SET_EXPANSION_DEPTH",
			depth,
		});
	}
});

async function initialize() {
	const [status, settings] = await Promise.all([
		send({ type: "AUTH_STATUS" }),
		chrome.storage.local.get("expansionDepth"),
		readPageState(),
	]);
	auth = status;
	elements.depth.value = String(Number(settings.expansionDepth || 0));
	render();
}

initialize().catch((error) =>
	showError(error instanceof Error ? error.message : "Could not start."),
);

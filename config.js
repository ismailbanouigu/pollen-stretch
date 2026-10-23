export const CONFIG = Object.freeze({
	appKey: "pk_bC1BxMWuEB8WlAgv",
	enterBaseUrl: "https://enter.pollinations.ai",
	genBaseUrl: "https://gen.pollinations.ai",
	model: "openai/gpt-5.4-nano",
});

export function hasConfiguredAppKey() {
	return (
		/^pk_[A-Za-z0-9_-]+$/.test(CONFIG.appKey) &&
		!CONFIG.appKey.includes("REPLACE_")
	);
}

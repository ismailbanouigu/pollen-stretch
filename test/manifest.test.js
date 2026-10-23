import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
	await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
);

test("ships a minimal Manifest V3 extension", () => {
	assert.equal(manifest.manifest_version, 3);
	assert.deepEqual(manifest.permissions, ["activeTab", "storage"]);
	assert.deepEqual(manifest.host_permissions, [
		"https://enter.pollinations.ai/*",
		"https://gen.pollinations.ai/*",
	]);
	assert.deepEqual(manifest.content_scripts[0].matches, [
		"http://*/*",
		"https://*/*",
	]);
});

test("every manifest entry point exists", async () => {
	const paths = [
		manifest.background.service_worker,
		manifest.action.default_popup,
		...manifest.content_scripts.flatMap(({ js = [], css = [] }) => [
			...js,
			...css,
		]),
	];
	await Promise.all(
		paths.map((path) => access(new URL(`../${path}`, import.meta.url))),
	);
});

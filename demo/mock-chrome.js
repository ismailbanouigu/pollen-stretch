(() => {
	let messageListener = null;
	const explanations = new Map([
		[
			"Pollination moves pollen between reproductive parts of flowers.",
			"In simple terms, pollen carries the plant's male genetic material. When it reaches a compatible flower, it can fertilise an ovule, which may then develop into a seed.",
		],
	]);

	globalThis.chrome = {
		runtime: {
			onMessage: {
				addListener(listener) {
					messageListener = listener;
				},
			},
			async sendMessage(message) {
				const phrase = message.phrase.replace(/\s+/g, " ").trim();
				const expansion =
					explanations.get(phrase) ||
					"This extra context appears inline, so you can keep reading without leaving the page or losing your place.";
				return { ok: true, value: { expansion } };
			},
		},
	};

	globalThis.startPollenStretchDemo = () => {
		messageListener?.(
			{ type: "SET_STRETCH_STATE", enabled: true, depth: 0 },
			null,
			() => {},
		);
	};
})();

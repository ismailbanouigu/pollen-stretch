(() => {
	const BLOCK_SELECTOR =
		"p, li, blockquote, dd, figcaption, article h1, article h2, article h3, article h4";
	const SKIP_SELECTOR = [
		"a",
		"button",
		"input",
		"textarea",
		"select",
		"option",
		"code",
		"pre",
		"kbd",
		"samp",
		"script",
		"style",
		"noscript",
		"svg",
		"math",
		"[contenteditable='true']",
		"[data-pollen-stretch]",
	].join(",");
	const MIN_TEXT_LENGTH = 18;
	const MAX_NESTING_DEPTH = 2;

	let enabled = false;
	let expansionDepth = 0;
	let observer = null;
	let toastTimer = null;

	const segmenter =
		typeof Intl?.Segmenter === "function"
			? new Intl.Segmenter(document.documentElement.lang || "en", {
					granularity: "sentence",
				})
			: null;

	function sentenceSegments(text) {
		if (segmenter)
			return [...segmenter.segment(text)].map(({ segment }) => segment);
		return text.match(/[^.!?]+(?:[.!?]+(?:["'”’)]*)|$)\s*/g) || [text];
	}

	function isReadableTextNode(node) {
		if (node.nodeType !== Node.TEXT_NODE || !node.parentElement) return false;
		if (
			node.parentElement.dataset.pollenStretch !== "words" &&
			node.parentElement.closest(SKIP_SELECTOR)
		) {
			return false;
		}
		return node.textContent.trim().length >= MIN_TEXT_LENGTH;
	}

	function wrapTextNode(node, depth = 0) {
		const segments = sentenceSegments(node.textContent);
		if (!segments.some((value) => value.trim().length >= MIN_TEXT_LENGTH))
			return;

		const fragment = document.createDocumentFragment();
		for (const segment of segments) {
			const leading = segment.match(/^\s*/)?.[0] || "";
			const trailing = segment.match(/\s*$/)?.[0] || "";
			const phrase = segment.slice(
				leading.length,
				segment.length - trailing.length || undefined,
			);
			if (leading) fragment.append(document.createTextNode(leading));
			if (phrase.trim().length >= MIN_TEXT_LENGTH) {
				const trigger = document.createElement("span");
				trigger.className = "pollen-stretch-trigger";
				trigger.dataset.pollenStretch = "trigger";
				trigger.dataset.depth = String(depth);
				trigger.tabIndex = 0;
				trigger.role = "button";
				trigger.setAttribute("aria-expanded", "false");
				trigger.title = "Grow this sentence with Pollinations";
				trigger.textContent = phrase;
				fragment.append(trigger);
			} else if (phrase) {
				fragment.append(document.createTextNode(phrase));
			}
			if (trailing) fragment.append(document.createTextNode(trailing));
		}
		node.replaceWith(fragment);
	}

	function processBlock(block) {
		if (
			!(block instanceof Element) ||
			block.dataset.pollenStretchProcessed === "true"
		)
			return;
		if (block.closest(SKIP_SELECTOR)) return;
		if (block.textContent.trim().length < MIN_TEXT_LENGTH) return;

		block.dataset.pollenStretchProcessed = "true";
		const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) =>
				isReadableTextNode(node)
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT,
		});
		const nodes = [];
		while (walker.nextNode()) nodes.push(walker.currentNode);
		for (const node of nodes) wrapTextNode(node, 0);
	}

	function processDocument(root = document) {
		if (!enabled) return;
		const blocks = root.matches?.(BLOCK_SELECTOR)
			? [root]
			: [...(root.querySelectorAll?.(BLOCK_SELECTOR) || [])];
		for (const block of blocks) processBlock(block);
	}

	function startObserver() {
		if (observer) return;
		observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (
						node instanceof Element &&
						!node.closest("[data-pollen-stretch]")
					) {
						processDocument(node);
					}
				}
			}
		});
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
	}

	function unwrapAll() {
		observer?.disconnect();
		observer = null;
		for (const expansion of document.querySelectorAll(
			".pollen-stretch-expansion",
		))
			expansion.remove();
		for (const trigger of document.querySelectorAll(
			".pollen-stretch-trigger",
		)) {
			const parent = trigger.parentNode;
			trigger.replaceWith(document.createTextNode(trigger.textContent));
			parent?.normalize();
		}
		for (const block of document.querySelectorAll(
			"[data-pollen-stretch-processed]",
		)) {
			delete block.dataset.pollenStretchProcessed;
		}
	}

	function setEnabled(next) {
		enabled = Boolean(next);
		if (enabled) {
			processDocument();
			startObserver();
			showToast("Stretch mode is on — click an underlined sentence.");
		} else {
			unwrapAll();
			showToast("Stretch mode is off.");
		}
		return enabled;
	}

	function showToast(message, kind = "info") {
		document.querySelector(".pollen-stretch-toast")?.remove();
		clearTimeout(toastTimer);
		const toast = document.createElement("div");
		toast.className = "pollen-stretch-toast";
		toast.dataset.pollenStretch = "toast";
		toast.dataset.kind = kind;
		toast.role = "status";
		toast.textContent = message;
		document.documentElement.append(toast);
		toastTimer = setTimeout(() => toast.remove(), 3800);
	}

	function containingBlock(trigger) {
		return trigger.closest(BLOCK_SELECTOR) || trigger.parentElement;
	}

	function contextFor(trigger) {
		const clone = containingBlock(trigger)?.cloneNode(true);
		clone?.querySelectorAll(".pollen-stretch-close").forEach((button) => {
			button.remove();
		});
		return (clone?.textContent || trigger.textContent)
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 3500);
	}

	function existingExpansion(trigger) {
		const next = trigger.nextElementSibling;
		return next?.classList.contains("pollen-stretch-expansion") ? next : null;
	}

	function fold(trigger, expansion) {
		expansion.hidden = true;
		trigger.setAttribute("aria-expanded", "false");
		trigger.focus({ preventScroll: true });
	}

	function unfold(trigger, expansion) {
		expansion.hidden = false;
		trigger.setAttribute("aria-expanded", "true");
	}

	function makeExpansion(trigger, text, depth) {
		const expansion = document.createElement("span");
		expansion.className = "pollen-stretch-expansion";
		expansion.dataset.pollenStretch = "expansion";
		expansion.role = "note";

		const words = document.createElement("span");
		words.dataset.pollenStretch = "words";
		words.append(document.createTextNode(text));
		expansion.append(words);

		if (depth < MAX_NESTING_DEPTH) {
			for (const node of [...words.childNodes]) {
				if (isReadableTextNode(node)) wrapTextNode(node, depth + 1);
			}
		}

		const close = document.createElement("button");
		close.type = "button";
		close.className = "pollen-stretch-close";
		close.dataset.pollenStretch = "close";
		close.title = "Fold this expansion";
		close.setAttribute("aria-label", "Fold this expansion");
		close.textContent = "«";
		close.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			fold(trigger, expansion);
		});
		expansion.append(close);
		trigger.after(document.createTextNode(" "), expansion);
		trigger.setAttribute("aria-expanded", "true");
	}

	async function stretch(trigger) {
		const existing = existingExpansion(trigger);
		if (existing) {
			if (existing.hidden) unfold(trigger, existing);
			else fold(trigger, existing);
			return;
		}
		if (trigger.classList.contains("pollen-stretch-loading")) return;

		trigger.classList.add("pollen-stretch-loading");
		trigger.setAttribute("aria-busy", "true");
		try {
			const depth = Number(trigger.dataset.depth || expansionDepth || 0);
			const response = await chrome.runtime.sendMessage({
				type: "EXPAND_TEXT",
				phrase: trigger.textContent.trim(),
				context: contextFor(trigger),
				pageTitle: document.title,
				pageHost: location.hostname,
				depth,
			});
			if (!response?.ok)
				throw new Error(
					response?.error?.message || "Could not grow this sentence.",
				);
			makeExpansion(trigger, response.value.expansion, depth);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Could not grow this sentence.",
				"error",
			);
		} finally {
			trigger.classList.remove("pollen-stretch-loading");
			trigger.removeAttribute("aria-busy");
		}
	}

	document.addEventListener(
		"click",
		(event) => {
			if (!enabled) return;
			const trigger = event.target.closest?.(".pollen-stretch-trigger");
			if (!trigger) return;
			event.preventDefault();
			event.stopPropagation();
			stretch(trigger);
		},
		true,
	);

	document.addEventListener("keydown", (event) => {
		if (!enabled || !["Enter", " "].includes(event.key)) return;
		const trigger = event.target.closest?.(".pollen-stretch-trigger");
		if (!trigger) return;
		event.preventDefault();
		stretch(trigger);
	});

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message?.type === "GET_STRETCH_STATE") {
			sendResponse({ enabled, depth: expansionDepth });
			return;
		}
		if (message?.type === "SET_STRETCH_STATE") {
			expansionDepth = Number(message.depth || 0);
			sendResponse({
				enabled: setEnabled(message.enabled),
				depth: expansionDepth,
			});
			return;
		}
		if (message?.type === "SET_EXPANSION_DEPTH") {
			expansionDepth = Number(message.depth || 0);
			sendResponse({ enabled, depth: expansionDepth });
		}
	});
})();

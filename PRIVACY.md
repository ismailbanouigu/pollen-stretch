# Privacy

Pollen Stretch is designed to keep page access narrow and visible.

- The extension does nothing until the user turns on stretch mode for the current tab.
- When the user clicks an underlined sentence, only that sentence, up to 3,500 characters of its containing text block, the page title, and the page hostname are sent to the Pollinations text API.
- Full URLs, query parameters, browsing history, form values, passwords, and page HTML are not sent.
- Pollinations returns plain text. The extension inserts it with `textContent`; generated HTML is never executed.
- The temporary user-authorized `sk_` key is stored in `chrome.storage.session`, which is cleared when the browser session ends and is not exposed to content scripts.
- Pollen Stretch contains no analytics, advertising, or third-party tracking.

Users can disconnect at any time from the popup. They can also revoke the authorized key from the Pollinations dashboard.

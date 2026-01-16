/**
 * Initialize internationalization messages
 */
function initMsg(root = document) {
  const i18nElements = root.querySelectorAll("[data-i18n]");
  for (const element of i18nElements) {
    element.textContent = chrome.i18n.getMessage(element.dataset.i18n);
  }
}

/**
 * Initialize guide page
 */
function init() {
  initMsg();

  // Handle shortcuts link click
  document.getElementById("shortcuts").addEventListener("click", function (event) {
    event.preventDefault();
    const extensionName = chrome.i18n.getMessage("extName");
    const shortcutsUrl = "chrome://extensions/shortcuts#:~:text=" + encodeURIComponent(extensionName);
    chrome.tabs.create({ url: shortcutsUrl });
  });

  // Handle browser settings link click
  document.getElementById("browser-settings").addEventListener("click", function (event) {
    event.preventDefault();
    chrome.tabs.create({ url: "chrome://settings/appearance" });
  });
}

init();

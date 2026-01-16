/**
 * Handle messages from the extension
 */
function onMessage(message) {
  message.type = "Move-Group-Window";
  const tabId = message.tabId;
  const groupId = message.groupId;

  chrome.windows.create({ focused: true }, function (newWindow) {
    chrome.tabGroups.move(groupId, { index: 0, windowId: newWindow.id }, function () {
      chrome.tabs.update(tabId, { active: true }, function () {
        chrome.tabs.remove(newWindow.tabs[0].id);
      });
    });
  });
}

/**
 * Handle extension installation
 */
function onInstalled(details) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  
  if (details && details.reason === "install") {
    chrome.tabs.create({ url: "guide.html" });
  }
}

chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onMessage.addListener(onMessage);

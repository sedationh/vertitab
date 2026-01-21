/**
 * Vertical Tabs Extension - Side Panel Manager
 * Manages tab groups, drag and drop, context menus, and search functionality
 */

// ============================================================================
// Global Variables
// ============================================================================

/** ID for ungrouped tabs */
const NoGroup = chrome.tabGroups.TAB_GROUP_ID_NONE;

/** Current window ID */
let WindowId;

/** Main DOM element */
const Main = document.getElementById("main");

/** Whether the side panel has been opened */
let SidePanelOpen = false;

/**
 * Stop event propagation and prevent default behavior
 * @param {Event} event - The event to stop
 */
function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}
// ============================================================================
// Tabs Class - Manages tab rendering and interactions
// ============================================================================

/**
 * Handles all tab-related operations including creation, updates, and events
 */
class Tabs {
  /**
   * Initialize tab listeners and build the initial tab list
   */
  static init() {
    // Register all tab event listeners
    chrome.tabs.onUpdated.addListener(Tabs.onUpdated);
    chrome.tabs.onRemoved.addListener(Tabs.onTabRemoved);
    chrome.tabs.onCreated.addListener(Tabs.onCreated);
    chrome.tabs.onActivated.addListener(Tabs.onActivated);
    chrome.tabs.onReplaced.addListener(Tabs.delayRebuild);
    chrome.tabs.onMoved.addListener(Tabs.delayRebuild);
    chrome.tabs.onDetached.addListener(Tabs.delayRebuild);
    chrome.tabs.onAttached.addListener(Tabs.delayRebuild);
    
    Tabs.delayTimeoutId = 0;
    
    // Build initial tab list
    Tabs.build().then(function () {
      SidePanelOpen = true;
      // Auto-focus search input when side panel opens
      const searchInput = document.getElementById("search-input");
      if (searchInput) {
        searchInput.focus();
      }
    });
  }
  
  /**
   * Get the main tab list container element
   */
  static getMainList() {
    return Main.firstElementChild.firstElementChild;
  }
  
  /**
   * Initialize the new tab button
   */
  static initNewtabBtn() {
    document
      .getElementById("newtab-btn")
      .addEventListener("click", () => chrome.tabs.create({}));
    document.getElementById("newtab").classList.add("show");
  }
  
  /**
   * Build the complete tab list for the current window
   * Organizes tabs by groups and renders them in the UI
   */
  static async build() {
    // Don't rebuild while dragging to avoid UI conflicts
    if (!DnD.dragging) {
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      WindowId = currentWindow.id;
      
      const tabListContainer = document.createElement("div");
      tabListContainer.className = "tab-list";
      
      let activeTabElement = null;
      let currentGroupElement = null;
      let lastGroupId = null;
      
      // Iterate through all tabs in the window
      for (const tab of currentWindow.tabs) {
        const tabGroupId = tab.groupId;
        
        if (tabGroupId !== NoGroup) {
          // Tab is part of a group
          if (lastGroupId !== tabGroupId) {
            // New group encountered
            const groupInfo = await Groups.get(tabGroupId);
            if (groupInfo) {
              lastGroupId = tabGroupId;
              const groupElement = Groups.createGroup(groupInfo);
              currentGroupElement = groupElement.lastElementChild; // Get group body
              tabListContainer.appendChild(groupElement);
            } else {
              // Group doesn't exist, rebuild later
              Tabs.delayRebuild();
              return;
            }
          }
          
          const tabElement = Tabs.createTab(tab);
          currentGroupElement.appendChild(tabElement);
          
          if (tab.active) {
            activeTabElement = tabElement;
          }
        } else {
          // Tab is not in a group
          const tabElement = Tabs.createTab(tab);
          tabListContainer.appendChild(tabElement);
          
          if (tab.active) {
            activeTabElement = tabElement;
          }
        }
      }
      
      // Replace old tab list with new one
      Tabs.getMainList().replaceWith(tabListContainer);
      
      // Scroll to active tab if it exists
      activeTabElement?.scrollIntoViewIfNeeded(true);
    }
  }
  /**
   * Delay the rebuild of the tab list to avoid multiple rapid rebuilds
   * Debounces rebuild calls with a 400ms delay
   */
  static delayRebuild() {
    clearTimeout(Tabs.delayTimeoutId);
    Tabs.delayTimeoutId = setTimeout(Tabs.build, 400);
  }
  /**
   * Create a DOM element for a single tab
   * @param {chrome.tabs.Tab} tabInfo - Tab information from Chrome API
   * @returns {HTMLDivElement} The created tab element
   */
  static createTab(tabInfo) {
    const tabElement = document.createElement("div");
    tabElement.id = `tab-${tabInfo.id}`;
    tabElement.className = tabInfo.active ? "tab-item tab-active" : "tab-item";
    tabElement.dataset.group = tabInfo.groupId;
    
    // Add pinned class if tab is pinned
    if (tabInfo.pinned) {
      tabElement.classList.add("tab-pin");
    }
    
    // Build tab structure
    tabElement.appendChild(Tabs.createFavicon(tabInfo));
    tabElement.appendChild(Tabs.createLink(tabInfo));
    tabElement.appendChild(Tabs.createCloseBtn());
    
    // Register event listeners
    tabElement.addEventListener("click", Tabs.onTabClick);
    tabElement.addEventListener("dblclick", Tabs.onTabDoubleClick);
    tabElement.addEventListener("auxclick", Tabs.onTabMiddleClick);
    tabElement.addEventListener("contextmenu", ContextMenu.showTabMenu);
    
    // Set audio/mute state indicators
    Tabs.setTabState(tabInfo, tabElement);
    
    // Enable drag and drop
    DnD.initTabDrag(tabElement);
    
    return tabElement;
  }
  /**
   * Insert a new tab into the tab list at the correct position
   * @param {chrome.tabs.Tab} tabInfo - The tab to insert
   */
  static insertTab(tabInfo) {
    const mainList = Tabs.getMainList();
    
    if (tabInfo.groupId === NoGroup) {
      // Tab is not in a group
      const newTabElement = Tabs.createTab(tabInfo);
      const allTabElements = mainList.querySelectorAll(".tab-item");
      
      // Append at end if index matches length
      if (tabInfo.index === allTabElements.length) {
        mainList.appendChild(newTabElement);
        return;
      }
      
      // Insert at specific position
      if (tabInfo.index < allTabElements.length) {
        const referenceTab = allTabElements[tabInfo.index];
        if (referenceTab) {
          // Insert before reference tab if it's a direct child
          if (referenceTab.parentElement === mainList) {
            mainList.insertBefore(newTabElement, referenceTab);
            return;
          }
          
          // Insert before group if reference tab is inside a group
          const referenceGroup = referenceTab.closest(".group-item");
          if (referenceGroup) {
            mainList.insertBefore(newTabElement, referenceGroup);
            return;
          }
        }
      }
    } else {
      // Tab is in a group
      const groupElement = document.getElementById(`group-${tabInfo.groupId}`);
      if (groupElement) {
        const allTabElements = mainList.querySelectorAll(".tab-item");
        const previousTab = allTabElements[tabInfo.index - 1];
        
        // Check if previous tab is in the same group
        if (previousTab && previousTab.dataset.group === tabInfo.groupId.toString()) {
          const newTabElement = Tabs.createTab(tabInfo);
          previousTab.after(newTabElement);
          return;
        }
      }
    }
    
    // Fallback: rebuild entire tab list
    Tabs.delayRebuild();
  }
  /**
   * Update a tab's group membership
   * @param {HTMLElement} tabElement - The tab DOM element
   * @param {chrome.tabs.Tab} tabInfo - Updated tab information
   * @param {number} newGroupId - The new group ID
   */
  static updateGroup(tabElement, tabInfo, newGroupId) {
    tabElement.dataset.group = newGroupId;
    Tabs.delayRebuild();
  }
  /**
   * Fallback handler when favicon fails to load
   * Tries to fetch favicon from Chrome's internal API
   * @param {Event} event - The error event
   */
  static faviconFallback(event) {
    const imgElement = event.target;
    const tabId = parseInt(imgElement.parentElement.id.substring(4));
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) {
        imgElement.src = "img/tab.svg";
      } else if (tab.url) {
        imgElement.src = `/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`;
      } else {
        imgElement.src = "img/tab.svg";
      }
    });
  }
  /**
   * Create a favicon image element for a tab
   * @param {chrome.tabs.Tab} tabInfo - Tab information
   * @returns {HTMLImageElement} The favicon image element
   */
  static createFavicon(tabInfo) {
    const faviconImg = document.createElement("img");
    
    // Use direct favicon URL if available and side panel is open
    if (SidePanelOpen && tabInfo.favIconUrl && tabInfo.favIconUrl.startsWith("http")) {
      faviconImg.src = tabInfo.favIconUrl;
    } else if (tabInfo.url) {
      // Use Chrome's internal favicon API
      faviconImg.src = `/_favicon/?pageUrl=${encodeURIComponent(tabInfo.url)}&size=32`;
    } else {
      // Default tab icon
      faviconImg.src = "img/tab.svg";
    }
    
    faviconImg.className = "favicon";
    faviconImg.addEventListener("error", Tabs.faviconFallback);
    
    return faviconImg;
  }
  /**
   * Create the title/link element for a tab
   * @param {chrome.tabs.Tab} tabInfo - Tab information
   * @returns {HTMLDivElement} The link element
   */
  static createLink(tabInfo) {
    const linkElement = document.createElement("div");
    linkElement.className = "tab-link";
    
    if (tabInfo.title) {
      linkElement.title = tabInfo.title;
      linkElement.appendChild(document.createTextNode(tabInfo.title));
    }
    
    return linkElement;
  }
  /**
   * Set the audio/mute state indicator for a tab
   * @param {chrome.tabs.Tab} tabInfo - Tab information
   * @param {HTMLElement} tabElement - The tab DOM element
   */
  static setTabState(tabInfo, tabElement) {
    let isAudibleAnimated = false;
    let iconPath = null;
    
    // Determine which icon to show
    if (tabInfo.mutedInfo?.muted) {
      iconPath = "img/volume_off.svg";
    } else if (tabInfo.audible) {
      isAudibleAnimated = true;
      iconPath = "img/volume_down.svg";
    }
    
    const existingIndicator = tabElement.querySelector(".state-indicator");
    
    if (iconPath) {
      // Create new state indicator
      const stateIndicator = document.createElement("div");
      stateIndicator.className = "state-indicator";
      
      const iconImg = document.createElement("img");
      iconImg.src = iconPath;
      stateIndicator.appendChild(iconImg);
      
      // Add animated audible indicator if needed
      if (isAudibleAnimated) {
        const animatedIcon = document.createElement("img");
        animatedIcon.src = "img/volume_up.svg";
        animatedIcon.className = "audible-animate";
        stateIndicator.appendChild(animatedIcon);
      }
      
      // Replace existing indicator or insert before close button
      if (existingIndicator) {
        existingIndicator.replaceWith(stateIndicator);
      } else {
        tabElement.lastElementChild.before(stateIndicator);
      }
    } else {
      // Remove indicator if no audio state
      existingIndicator?.remove();
    }
  }
  /**
   * Create the close button for a tab
   * @returns {HTMLImageElement} The close button element
   */
  static createCloseBtn() {
    const closeBtn = document.createElement("img");
    closeBtn.src = "img/close.svg";
    closeBtn.className = "close-btn";
    closeBtn.addEventListener("click", Tabs.onCloseClick);
    closeBtn.addEventListener("dblclick", stopEvent);
    return closeBtn;
  }
  /**
   * Handle tab click - activate the clicked tab
   * @param {MouseEvent} event - The click event
   */
  static onTabClick(event) {
    event.preventDefault();
    const tabId = parseInt(event.currentTarget.id.substring(4));
    chrome.tabs.update(tabId, { active: true });
  }
  /**
   * Handle tab double click - close tab if enabled in settings
   * @param {MouseEvent} event - The double click event
   */
  static onTabDoubleClick(event) {
    if (Settings.closeByDoubleClick) {
      event.preventDefault();
      const tabId = parseInt(event.currentTarget.id.substring(4));
      chrome.tabs.remove(tabId);
    }
  }
  /**
   * Handle middle mouse button click - close tab
   * @param {MouseEvent} event - The auxclick event
   */
  static onTabMiddleClick(event) {
    if (event.button === 1) {
      event.preventDefault();
      const tabId = parseInt(event.currentTarget.id.substring(4));
      chrome.tabs.remove(tabId);
    }
  }
  /**
   * Handle close button click - close the tab
   * @param {MouseEvent} event - The click event
   */
  static onCloseClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const tabId = parseInt(event.currentTarget.parentElement.id.substring(4));
    chrome.tabs.remove(tabId);
  }
  /**
   * Handle tab removal - remove tab element from DOM
   * @param {number} tabId - ID of the removed tab
   */
  static onTabRemoved(tabId) {
    const tabElement = document.getElementById(`tab-${tabId}`);
    if (tabElement) {
      tabElement.remove();
    }
  }
  static onActivated(a) {
    if (a.windowId == WindowId) {
      for (let b of document.querySelectorAll(".tab-active"))
        b.classList.remove("tab-active");
      if ((a = document.getElementById(`tab-${a.tabId}`)))
        (a.classList.add("tab-active"), a.scrollIntoViewIfNeeded(true));
    }
  }
  /**
   * Handle tab creation - insert new tab into the list
   * @param {chrome.tabs.Tab} tab - The newly created tab
   */
  static onCreated(tab) {
    if (tab.windowId === WindowId) {
      const existingTab = document.getElementById(`tab-${tab.id}`);
      if (!existingTab) {
        Tabs.insertTab(tab);
      }
    }
  }
  /**
   * Handle tab updates - update tab UI when tab properties change
   * @param {number} tabId - ID of the updated tab
   * @param {Object} changeInfo - Object containing changed properties
   * @param {chrome.tabs.Tab} tab - Complete tab information
   */
  static onUpdated(tabId, changeInfo, tab) {
    if (tab.windowId !== WindowId) return;
    
    const tabElement = document.getElementById(`tab-${tabId}`);
    if (!tabElement) {
      // Tab doesn't exist in DOM, rebuild
      Tabs.delayRebuild();
      return;
    }
    
    // Update title if changed
    if (changeInfo.title || (changeInfo.url && tab.title)) {
      const linkElement = tabElement.querySelector(".tab-link");
      linkElement.title = tab.title;
      linkElement.textContent = tab.title;
    }
    
    // Update favicon if changed
    if (changeInfo.favIconUrl && tab.favIconUrl.startsWith("http")) {
      tabElement.querySelector(".favicon").src = changeInfo.favIconUrl;
    } else if (changeInfo.url) {
      tabElement.querySelector(".favicon").src = 
        `/_favicon/?pageUrl=${encodeURIComponent(changeInfo.url)}&size=32`;
    }
    
    // Update pinned state
    if (changeInfo.pinned !== undefined) {
      if (tab.pinned) {
        tabElement.classList.add("tab-pin");
      } else {
        tabElement.classList.remove("tab-pin");
      }
    }
    
    // Update audio/mute state
    if (changeInfo.audible !== undefined || changeInfo.mutedInfo !== undefined) {
      Tabs.setTabState(tab, tabElement);
    }
    
    // Update group membership
    if (changeInfo.groupId !== undefined) {
      Tabs.updateGroup(tabElement, tab, changeInfo.groupId);
    }
  }
}

// ============================================================================
// DnD Class - Handles Drag and Drop Operations
// ============================================================================

/**
 * Manages drag and drop functionality for tabs and tab groups
 */
class DnD {
  /**
   * Initialize drag functionality for a tab element
   * @param {HTMLElement} tabElement - The tab element to make draggable
   */
  static initTabDrag(tabElement) {
    tabElement.draggable = true;
    tabElement.addEventListener("dragstart", DnD.dragStart);
    tabElement.addEventListener("dragend", DnD.dragEnd);
    tabElement.addEventListener("drop", DnD.drop);
    tabElement.addEventListener("dragenter", DnD.dragEnter);
    tabElement.addEventListener("dragover", DnD.dragOver);
    tabElement.addEventListener("dragleave", DnD.dragLeave);
  }
  /**
   * Initialize drag functionality for a group element
   * @param {HTMLElement} groupElement - The group element to make draggable
   */
  static initGroupDrag(groupElement) {
    groupElement.draggable = true;
    groupElement.addEventListener("dragstart", DnD.groupDragStart);
    groupElement.addEventListener("dragend", DnD.groupDragEnd);
    groupElement.addEventListener("drop", DnD.drop);
    groupElement.addEventListener("dragenter", DnD.dragEnter);
    groupElement.addEventListener("dragover", DnD.dragOver);
    groupElement.addEventListener("dragleave", DnD.dragLeave);
  }
  /**
   * Insert a fake drop zone at the bottom of the tab list
   * Used during drag operations to allow dropping at the end
   */
  static insertFakeBottom() {
    if (!DnD.fakeBottom) {
      const fakeElement = document.createElement("div");
      fakeElement.className = "drop-fake-bottom drop-zone";
      fakeElement.addEventListener("drop", DnD.drop);
      fakeElement.addEventListener("dragenter", DnD.dragEnter);
      fakeElement.addEventListener("dragover", DnD.dragOver);
      fakeElement.addEventListener("dragleave", DnD.dragLeave);
      DnD.fakeBottom = fakeElement;
    }
    Tabs.getMainList().appendChild(DnD.fakeBottom);
  }
  /**
   * Handle drag start for a tab
   * @param {DragEvent} event - The drag start event
   */
  static dragStart(event) {
    event.stopPropagation();
    DnD.dragging = true;
    
    const draggedElement = event.currentTarget;
    draggedElement.classList.add("dragging");
    
    // Add drop zones to all tabs and group headers
    const dropTargets = document.querySelectorAll(".tab-item, .group-header-outer");
    for (const target of dropTargets) {
      target.classList.add("drop-zone");
    }
    
    // Insert fake bottom drop zone
    requestAnimationFrame(() => {
      DnD.insertFakeBottom();
    });
    
    // Set drag data
    const dataTransfer = event.dataTransfer;
    dataTransfer.setData("tab-id", draggedElement.id);
    dataTransfer.dropEffect = "move";
    dataTransfer.effectAllowed = "move";
    dataTransfer.setDragImage(draggedElement, 10, 10);
  }
  /**
   * Handle drag start for a tab group
   * @param {DragEvent} event - The drag start event
   */
  static groupDragStart(event) {
    event.stopPropagation();
    DnD.dragging = true;
    
    const draggedHeader = event.currentTarget;
    const draggedGroup = draggedHeader.parentElement;
    draggedHeader.classList.add("dragging", "collapse");
    
    // Add drop zones to all tabs and group headers
    const dropTargets = document.querySelectorAll(".tab-item, .group-header-outer");
    for (const target of dropTargets) {
      target.classList.add("drop-zone");
    }
    
    // Mark currently collapsed groups
    const allGroups = document.querySelectorAll(".group-item");
    for (const group of allGroups) {
      if (group.classList.contains("collapse")) {
        group.dataset.collapse = "true";
      }
    }
    
    // Collapse all groups and insert fake bottom
    requestAnimationFrame(() => {
      for (const group of document.querySelectorAll(".group-item")) {
        group.classList.add("collapse");
      }
      DnD.insertFakeBottom();
    });
    
    // Set drag data
    const dataTransfer = event.dataTransfer;
    dataTransfer.setData("tab-id", draggedGroup.id);
    dataTransfer.dropEffect = "move";
    dataTransfer.effectAllowed = "move";
    dataTransfer.setDragImage(draggedHeader, 10, 10);
  }
  /**
   * Handle drag over event - allow drop
   * @param {DragEvent} event - The dragover event
   * @returns {boolean} false to prevent default
   */
  static dragOver(event) {
    if (event.dataTransfer.types[0] === "tab-id") {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      return false;
    }
  }
  /**
   * Handle drag enter - highlight potential drop target
   * @param {DragEvent} event - The dragenter event
   */
  static dragEnter(event) {
    if (event.dataTransfer.types[0] === "tab-id") {
      this.classList.add("drag-over");
    }
  }
  
  /**
   * Handle drag leave - remove highlight from drop target
   * @param {DragEvent} event - The dragleave event
   */
  static dragLeave(event) {
    if (event.dataTransfer.types[0] === "tab-id") {
      this.classList.remove("drag-over");
    }
  }
  /**
   * Handle drag end for tabs - clean up drag state
   * @param {DragEvent} event - The dragend event
   */
  static dragEnd(event) {
    DnD.dragging = false;
    event.currentTarget.classList.remove("dragging");
    
    // Remove drop zone classes
    const dropTargets = document.querySelectorAll(".tab-item, .group-header-outer");
    for (const target of dropTargets) {
      target.classList.remove("drop-zone", "drag-over");
    }
    
    // Remove fake bottom
    DnD.fakeBottom.classList.remove("drag-over");
    DnD.fakeBottom.remove();
  }
  /**
   * Handle drag end for groups - clean up drag state and restore group states
   * @param {DragEvent} event - The dragend event
   */
  static groupDragEnd(event) {
    DnD.dragging = false;
    event.currentTarget.classList.remove("dragging", "collapse");
    
    // Remove drop zone classes
    const dropTargets = document.querySelectorAll(".tab-item, .group-header-outer");
    for (const target of dropTargets) {
      target.classList.remove("drop-zone", "drag-over");
    }
    
    // Restore group collapse states
    const allGroups = document.querySelectorAll(".group-item");
    for (const group of allGroups) {
      if (group.dataset.collapse) {
        delete group.dataset.collapse;
      } else {
        group.classList.remove("collapse");
      }
    }
    
    // Remove fake bottom
    DnD.fakeBottom.classList.remove("drag-over");
    DnD.fakeBottom.remove();
  }
  /**
   * Handle drop event - move tab or group to new position
   * @param {DragEvent} event - The drop event
   * @returns {boolean} Always returns false to prevent default behavior
   */
  static drop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const draggedId = event.dataTransfer.getData("tab-id");
    if (!draggedId) return false;
    
    const draggedElement = document.getElementById(draggedId);
    if (!draggedElement) return false;
    
    let dropTarget = event.currentTarget;
    // If dropping on group header, use the group container instead
    if (dropTarget.classList.contains("group-header-outer")) {
      dropTarget = dropTarget.parentElement;
    }
    
    // Don't allow dropping on itself or right after itself
    if (draggedElement === dropTarget || draggedElement.nextElementSibling === dropTarget) {
      return false;
    }
    
    // Move group or tab based on dragged element type
    if (draggedId.startsWith("group-")) {
      DnD.moveGroup(draggedId, draggedElement, dropTarget);
    } else {
      DnD.moveTab(draggedId, draggedElement, dropTarget);
    }
    
    return false;
  }
  /**
   * Move a tab to a new position in the tab list
   * @param {string} tabId - The ID string of the tab (format: "tab-123")
   * @param {HTMLElement} tabElement - The DOM element being moved
   * @param {HTMLElement} dropTarget - The element to drop before
   */
  static async moveTab(tabId, tabElement, dropTarget) {
    const isDropTargetGroup = dropTarget.classList.contains("group-item");
    let targetGroupId;
    let shouldUngroup = false;
    
    // Move DOM element first for visual feedback
    dropTarget.before(tabElement);
    
    // Determine if tab should be grouped/ungrouped based on drop target
    if (!isDropTargetGroup) {
      if (Groups.isInGroup(dropTarget)) {
        targetGroupId = parseInt(dropTarget.dataset.group);
      } else {
        shouldUngroup = Groups.isAfterGroup(tabElement);
      }
    }
    
    // Get new index in tab list
    const allTabs = document.querySelectorAll(".tab-item");
    const newIndex = Array.prototype.indexOf.call(allTabs, tabElement);
    const numericTabId = parseInt(tabId.substring(4));
    
    try {
      // Move the tab in Chrome
      await chrome.tabs.move(numericTabId, { index: newIndex });
      
      // Update group membership if needed
      if (isDropTargetGroup || shouldUngroup) {
        await chrome.tabs.ungroup(numericTabId);
      } else if (targetGroupId) {
        await chrome.tabs.group({ groupId: targetGroupId, tabIds: numericTabId });
      }
    } catch (error) {
      console.error(error);
    }
    
    Tabs.build();
  }
  /**
   * Move a tab group to a new position
   * @param {string} groupId - The ID string of the group (format: "group-123")
   * @param {HTMLElement} groupElement - The DOM element being moved
   * @param {HTMLElement} dropTarget - The element to drop before
   */
  static async moveGroup(groupId, groupElement, dropTarget) {
    const numericGroupId = parseInt(groupId.substring(6));
    const allTabs = document.querySelectorAll(".tab-item");
    const firstTabInGroup = groupElement.querySelector(".tab-item");
    const tabsInGroup = groupElement.querySelectorAll(".tab-item");
    
    let targetTab = dropTarget;
    // If dropping on another group, get its first tab
    if (dropTarget.classList.contains("group-item")) {
      targetTab = dropTarget.querySelector(".tab-item");
    }
    
    const oldIndex = Array.prototype.indexOf.call(allTabs, firstTabInGroup);
    const newIndex = Array.prototype.indexOf.call(allTabs, targetTab);
    
    // Move DOM element first
    try {
      dropTarget.before(groupElement);
    } catch (error) {
      Tabs.build();
      return;
    }
    
    // Moving down or to end of list - need to recreate group
    if (newIndex === -1 || newIndex > oldIndex) {
      const tabIds = [];
      for (const tabElement of tabsInGroup) {
        tabIds.push(parseInt(tabElement.id.substring(4)));
      }
      
      try {
        const targetIndex = newIndex === -1 ? newIndex : newIndex - 1;
        const groupInfo = await Groups.get(numericGroupId);
        
        // Ungroup, move tabs, then recreate group
        await chrome.tabs.ungroup(tabIds);
        for (const tabId of tabIds) {
          await chrome.tabs.move(tabId, { index: targetIndex });
        }
        
        const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
        await chrome.tabGroups.update(newGroupId, {
          collapsed: groupInfo.collapsed,
          color: groupInfo.color,
          title: groupInfo.title,
        });
      } catch (error) {
        console.log(error);
      }
    } 
    // Moving up - can use simpler move API
    else if (newIndex < oldIndex) {
      try {
        await chrome.tabGroups.move(numericGroupId, { index: newIndex });
      } catch (error) {
        console.log(error);
      }
    }
    
    Tabs.build();
  }
}

// ============================================================================
// ContextMenu Class - Manages Right-Click Context Menus
// ============================================================================

/**
 * Handles context menu display and actions for tabs and groups
 */
class ContextMenu {
  static init() {
    ContextMenu.tabMenu = document.getElementById("tab-context-menu");
    ContextMenu.groupMenu = document.getElementById("group-context-menu");
    ContextMenu.tabMenu.addEventListener("contextmenu", stopEvent);
    ContextMenu.groupMenu.addEventListener("contextmenu", stopEvent);
    document.addEventListener("contextmenu", stopEvent);
    window.addEventListener("blur", ContextMenu.hide);
    
    // Hide menu when pressing Escape key (unless typing in input)
    document.addEventListener("keydown", function (event) {
      if (event.target.tagName !== "INPUT" && event.key === "Escape") {
        ContextMenu.hide();
      }
    });
    
    // Set up tab menu action listeners
    document.getElementById("tab-close-self").addEventListener("click", ContextMenu.closeSelf);
    document.getElementById("tab-close-others").addEventListener("click", ContextMenu.closeOthers);
    document.getElementById("tab-close-left").addEventListener("click", ContextMenu.closeLeft);
    document.getElementById("tab-close-right").addEventListener("click", ContextMenu.closeRight);
    document.getElementById("tab-close-group").addEventListener("click", ContextMenu.closeGroupByTabMenu);
    document.getElementById("tab-close-group-above").addEventListener("click", ContextMenu.closeGroupAbove);
    document.getElementById("tab-close-group-below").addEventListener("click", ContextMenu.closeGroupBelow);
    document.getElementById("tab-reload").addEventListener("click", ContextMenu.reload);
    document.getElementById("tab-duplicate").addEventListener("click", ContextMenu.duplicate);
    document.getElementById("tab-pin").addEventListener("click", ContextMenu.pin);
    document.getElementById("tab-mute").addEventListener("click", ContextMenu.mute);
    document.getElementById("tab-newtab-right").addEventListener("click", ContextMenu.newtabRight);
    document.getElementById("tab-group-add-remove").addEventListener("click", ContextMenu.addRemoveTabForGroup);
    document.getElementById("tab-move-window").addEventListener("click", ContextMenu.moveTabWindow);
    document.getElementById("tab-group-move-window").addEventListener("click", ContextMenu.moveGroupWindowByTabMenu);
    
    // Initialize group name input
    ContextMenu.TimeoutId = 0;
    const groupNameInput = document.getElementById("group-name-input");
    ContextMenu.input = groupNameInput;
    groupNameInput.placeholder = chrome.i18n.getMessage("groupNamePlaceholder");
    groupNameInput.addEventListener("input", ContextMenu.onNameInputChanged);
    groupNameInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        ContextMenu.hide();
      }
    });
    
    // Set up group color selection
    for (const colorButton of document.querySelectorAll(".context-group-color")) {
      colorButton.addEventListener("click", ContextMenu.onColorClick);
    }
    
    // Set up group menu action listeners
    document.getElementById("group-newtab").addEventListener("click", ContextMenu.newtabInGroup);
    document.getElementById("group-close").addEventListener("click", ContextMenu.closeGroupByGroupMenu);
    document.getElementById("group-ungroup").addEventListener("click", ContextMenu.ungroup);
    document.getElementById("group-move-window").addEventListener("click", ContextMenu.moveGroupWindowByGroupMenu);
  }
  /**
   * Display the tab context menu
   * @param {MouseEvent} event - The context menu event
   */
  static showTabMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const tabElement = event.currentTarget;
    const tabId = parseInt(tabElement.id.substring(4));
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return;
      
      // Show/hide group-related menu items based on tab's group status
      const closeGroupItem = document.getElementById("tab-close-group");
      const closeGroupAboveItem = document.getElementById("tab-close-group-above");
      const closeGroupBelowItem = document.getElementById("tab-close-group-below");
      const moveGroupWindowItem = document.getElementById("tab-group-move-window");
      const addRemoveGroupItem = document.getElementById("tab-group-add-remove");
      const isInGroup = tab.groupId !== NoGroup;
      
      closeGroupItem.style.display = isInGroup ? "block" : "none";
      closeGroupAboveItem.style.display = isInGroup ? "block" : "none";
      closeGroupBelowItem.style.display = isInGroup ? "block" : "none";
      moveGroupWindowItem.style.display = isInGroup ? "block" : "none";
      addRemoveGroupItem.textContent = chrome.i18n.getMessage(
        isInGroup ? "menuRemoveFromGroup" : "menuAddToGroup"
      );
      
      // Update pin/unpin menu text
      document.getElementById("tab-pin").textContent = chrome.i18n.getMessage(
        tab.pinned ? "menuUnpin" : "menuPin"
      );
      
      // Update mute/unmute menu text
      document.getElementById("tab-mute").textContent = chrome.i18n.getMessage(
        tab.mutedInfo.muted ? "menuUnmute" : "menuMute"
      );
      
      // Show the menu
      ContextMenu.hide();
      tabElement.classList.add("context-focus");
      ContextMenu.tabMenu.classList.add("show");
      ContextMenu.setMenuPosition(event, ContextMenu.tabMenu);
      ContextMenu.hideOnClickOutside("#tab-context-menu");
    });
  }
  /**
   * Display the group context menu
   * @param {MouseEvent} event - The context menu event
   */
  static async showGroupMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const groupId = parseInt(event.currentTarget.parentElement.id.substring(6));
    const group = await Groups.get(groupId);
    
    if (!group) return;
    
    ContextMenu.hide();
    ContextMenu.groupId = groupId;
    ContextMenu.setColorSelect(group.color);
    ContextMenu.input.value = group.title;
    ContextMenu.groupMenu.classList.add("show");
    ContextMenu.setMenuPosition(event, ContextMenu.groupMenu);
    ContextMenu.hideOnClickOutside("#group-context-menu");
    ContextMenu.input.focus();
  }
  
  /**
   * Remove context focus class from all elements
   */
  static clearContextFocus() {
    for (const element of document.querySelectorAll(".context-focus")) {
      element.classList.remove("context-focus");
    }
  }
  
  /**
   * Hide all context menus
   */
  static hide() {
    ContextMenu.tabMenu.classList.remove("show");
    ContextMenu.groupMenu.classList.remove("show");
    ContextMenu.clearContextFocus();
  }
  
  /**
   * Position menu at mouse cursor, ensuring it stays within viewport
   * @param {MouseEvent} event - The mouse event with cursor position
   * @param {HTMLElement} menu - The menu element to position
   */
  static setMenuPosition(event, menu) {
    menu.style.left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 1) + "px";
    menu.style.top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 1) + "px";
  }
  
  /**
   * Set up click listener to hide menu when clicking outside
   * @param {string} menuSelector - CSS selector for the menu element
   */
  static hideOnClickOutside(menuSelector) {
    const clickHandler = function (event) {
      if (event.target.closest(menuSelector) === null) {
        ContextMenu.hide();
        document.removeEventListener("click", clickHandler);
      }
    };
    document.addEventListener("click", clickHandler);
  }
  /**
   * Check if the currently selected group still exists
   * @returns {Promise<boolean>} True if group is valid
   */
  static async isGroupValid() {
    return !!(await Groups.get(ContextMenu.groupId));
  }
  
  /**
   * Update the selected color in the color picker
   * @param {string} color - The color to select
   */
  static setColorSelect(color) {
    for (const colorButton of document.querySelectorAll(".context-group-color")) {
      if (colorButton.dataset.color === color) {
        colorButton.classList.add("selected");
      } else {
        colorButton.classList.remove("selected");
      }
    }
  }
  
  /**
   * Handle color selection click
   * @param {MouseEvent} event - The click event
   */
  static async onColorClick(event) {
    const selectedColor = event.currentTarget.dataset.color;
    ContextMenu.setColorSelect(selectedColor);
    
    if (await ContextMenu.isGroupValid()) {
      chrome.tabGroups.update(ContextMenu.groupId, { color: selectedColor });
    }
  }
  
  /**
   * Update the group name in Chrome
   */
  static async updateGroupName() {
    if (!(await ContextMenu.isGroupValid())) return;
    
    const groupName = ContextMenu.input.value.trim();
    chrome.tabGroups.update(ContextMenu.groupId, { title: groupName });
  }
  
  /**
   * Handle group name input changes with debouncing
   */
  static onNameInputChanged() {
    clearTimeout(ContextMenu.TimeoutId);
    ContextMenu.TimeoutId = setTimeout(ContextMenu.updateGroupName, 500);
  }
  
  /**
   * Create a new tab in the current group
   */
  static async newtabInGroup() {
    ContextMenu.hide();
    
    if (!(await ContextMenu.isGroupValid())) return;
    
    const tabsInGroup = await chrome.tabs.query({ groupId: ContextMenu.groupId });
    const lastTab = tabsInGroup[tabsInGroup.length - 1];
    
    if (!lastTab) return;
    
    const newTab = await chrome.tabs.create({ index: lastTab.index + 1 });
    await chrome.tabs.group({
      groupId: ContextMenu.groupId,
      tabIds: newTab.id,
    });
  }
  
  /**
   * Close all tabs in the group (called from group menu)
   */
  static async closeGroupByGroupMenu() {
    ContextMenu.hide();
    
    if (!(await ContextMenu.isGroupValid())) return;
    
    const tabsInGroup = await chrome.tabs.query({ groupId: ContextMenu.groupId });
    chrome.tabs.remove(tabsInGroup.map((tab) => tab.id));
  }
  
  /**
   * Ungroup all tabs in the group
   */
  static async ungroup() {
    ContextMenu.hide();
    
    if (!(await ContextMenu.isGroupValid())) return;
    
    const tabsInGroup = await chrome.tabs.query({ groupId: ContextMenu.groupId });
    chrome.tabs.ungroup(tabsInGroup.map((tab) => tab.id));
  }
  
  /**
   * Move the entire group to a new window (called from group menu)
   */
  static async moveGroupWindowByGroupMenu() {
    ContextMenu.hide();
    
    if (!(await ContextMenu.isGroupValid())) return;
    
    const tabsInGroup = await chrome.tabs.query({ groupId: ContextMenu.groupId });
    
    if (!tabsInGroup[0]) return;
    
    chrome.runtime.sendMessage({
      type: "Move-Group-Window",
      tabId: tabsInGroup[0].id,
      groupId: ContextMenu.groupId,
    });
  }
  /**
   * Get the tab ID from the focused context menu item and hide the menu
   * @returns {number|null} The tab ID, or null if none found
   */
  static stepOne() {
    const focusedElement = document.querySelector(".context-focus");
    let tabId = null;
    
    if (focusedElement) {
      tabId = parseInt(focusedElement.id.substring(4));
    }
    
    ContextMenu.hide();
    return tabId;
  }
  
  /**
   * Close the selected tab
   */
  static closeSelf() {
    const tabId = ContextMenu.stepOne();
    if (tabId) {
      chrome.tabs.remove(tabId);
    }
  }
  
  /**
   * Close all other tabs except the selected one
   */
  static closeOthers() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      const tabsToClose = tabs
        .filter((tab) => tab.id !== tabId && !tab.pinned)
        .map((tab) => tab.id);
      ContextMenu.showCloseConfirm(tabsToClose);
    });
  }
  
  /**
   * Close all tabs to the left of the selected tab
   */
  static closeLeft() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      const selectedTab = tabs.find((tab) => tab.id === tabId);
      
      if (!selectedTab) return;
      
      const tabsToClose = tabs
        .filter((tab) => tab.index < selectedTab.index && !tab.pinned)
        .map((tab) => tab.id);
      ContextMenu.showCloseConfirm(tabsToClose);
    });
  }
  
  /**
   * Close all tabs to the right of the selected tab
   */
  static closeRight() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      const selectedTab = tabs.find((tab) => tab.id === tabId);
      
      if (!selectedTab) return;
      
      const tabsToClose = tabs
        .filter((tab) => tab.index > selectedTab.index && !tab.pinned)
        .map((tab) => tab.id);
      ContextMenu.showCloseConfirm(tabsToClose);
    });
  }
  
  /**
   * Show confirmation dialog if closing many tabs, otherwise close directly
   * @param {number[]} tabIds - Array of tab IDs to close
   */
  static showCloseConfirm(tabIds) {
    if (tabIds.length > 10) {
      CloseConfirm.show(tabIds);
    } else {
      chrome.tabs.remove(tabIds);
    }
  }
  
  /**
   * Close all tabs in the group (called from tab menu)
   */
  static closeGroupByTabMenu() {
    const focusedElement = document.querySelector(".context-focus");
    ContextMenu.hide();
    
    if (!focusedElement) return;
    
    const groupId = parseInt(focusedElement.dataset.group);
    
    if (groupId === NoGroup) return;
    
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      const tabsToClose = tabs
        .filter((tab) => tab.groupId === groupId)
        .map((tab) => tab.id);
      chrome.tabs.remove(tabsToClose);
    });
  }
  
  /**
   * Close all tabs above the current tab in its group
   */
  static closeGroupAbove() {
    const focusedElement = document.querySelector(".context-focus");
    const tabId = focusedElement ? parseInt(focusedElement.id.substring(4)) : null;
    
    ContextMenu.hide();
    
    if (!tabId || !focusedElement) return;
    
    const groupId = parseInt(focusedElement.dataset.group);
    
    // Only work when the tab is in a group
    if (groupId === NoGroup) return;
    
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      const selectedTab = tabs.find((tab) => tab.id === tabId);
      
      if (!selectedTab) return;
      
      // Find all tabs that are:
      // 1. In the same group as the selected tab
      // 2. Have a lower index than the selected tab
      // 3. Are not pinned
      const tabsToClose = tabs
        .filter((tab) => 
          tab.groupId === groupId && 
          tab.index < selectedTab.index && 
          !tab.pinned
        )
        .map((tab) => tab.id);
      
      ContextMenu.showCloseConfirm(tabsToClose);
    });
  }
  
  /**
   * Close all tabs below the current tab in its group
   */
  static closeGroupBelow() {
    const focusedElement = document.querySelector(".context-focus");
    const tabId = focusedElement ? parseInt(focusedElement.id.substring(4)) : null;
    
    ContextMenu.hide();
    
    if (!tabId || !focusedElement) return;
    
    const groupId = parseInt(focusedElement.dataset.group);
    
    // Only work when the tab is in a group
    if (groupId === NoGroup) return;
    
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      const selectedTab = tabs.find((tab) => tab.id === tabId);
      
      if (!selectedTab) return;
      
      // Find all tabs that are:
      // 1. In the same group as the selected tab
      // 2. Have a higher index than the selected tab
      // 3. Are not pinned
      const tabsToClose = tabs
        .filter((tab) => 
          tab.groupId === groupId && 
          tab.index > selectedTab.index && 
          !tab.pinned
        )
        .map((tab) => tab.id);
      
      ContextMenu.showCloseConfirm(tabsToClose);
    });
  }
  /**
   * Reload the selected tab
   */
  static reload() {
    const tabId = ContextMenu.stepOne();
    if (tabId) {
      chrome.tabs.reload(tabId);
    }
  }
  
  /**
   * Duplicate the selected tab
   */
  static duplicate() {
    const tabId = ContextMenu.stepOne();
    if (tabId) {
      chrome.tabs.duplicate(tabId);
    }
  }
  
  /**
   * Toggle pin state of the selected tab
   */
  static pin() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return;
      
      chrome.tabs.update(tabId, { pinned: !tab.pinned });
    });
  }
  
  /**
   * Toggle mute state of the selected tab
   */
  static mute() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return;
      
      chrome.tabs.update(tabId, { muted: !tab.mutedInfo.muted });
    });
  }
  
  /**
   * Create a new tab to the right of the selected tab
   */
  static newtabRight() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return;
      
      chrome.tabs.create({ index: tab.index + 1 });
    });
  }
  
  /**
   * Add tab to a group or remove it from its current group
   */
  static addRemoveTabForGroup() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return;
      
      if (tab.groupId === NoGroup) {
        chrome.tabs.group({ tabIds: tabId });
      } else {
        chrome.tabs.ungroup(tabId);
      }
    });
  }
  
  /**
   * Move the selected tab to a new window
   */
  static moveTabWindow() {
    const tabId = ContextMenu.stepOne();
    
    if (!tabId) return;
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return;
      
      chrome.windows.create({ tabId: tabId });
    });
  }
  
  /**
   * Move the tab's group to a new window (called from tab menu)
   */
  static moveGroupWindowByTabMenu() {
    const focusedElement = document.querySelector(".context-focus");
    ContextMenu.hide();
    
    if (!focusedElement) return;
    
    const tabId = parseInt(focusedElement.id.substring(4));
    const groupId = parseInt(focusedElement.dataset.group);
    
    if (groupId === NoGroup) return;
    
    chrome.runtime.sendMessage({
      type: "Move-Group-Window",
      tabId: tabId,
      groupId: groupId,
    });
  }
}

// ============================================================================
// CloseConfirm Class - Confirmation Dialog for Closing Multiple Tabs
// ============================================================================

/**
 * Displays confirmation dialog when closing many tabs at once
 */
class CloseConfirm {
  /**
   * Initialize the close confirmation dialog
   */
  static init() {
    CloseConfirm.dialog = document.getElementById("close-confirm");
    CloseConfirm.head = CloseConfirm.dialog.querySelector(".close-confirm-header");
    
    document.getElementById("close-confirm-yes").addEventListener("click", CloseConfirm.closeTabs);
    document.getElementById("close-confirm-no").addEventListener("click", CloseConfirm.close);
  }
  
  /**
   * Close the tabs that were queued for closing
   */
  static closeTabs() {
    chrome.tabs.remove(CloseConfirm.ids);
    CloseConfirm.close();
  }
  
  /**
   * Show the confirmation dialog
   * @param {number[]} tabIds - Array of tab IDs to close
   */
  static show(tabIds) {
    CloseConfirm.ids = tabIds;
    CloseConfirm.head.textContent = chrome.i18n.getMessage("closeConfirmTitle", [tabIds.length]);
    CloseConfirm.dialog.showModal();
  }
  
  /**
   * Close the confirmation dialog
   */
  static close() {
    CloseConfirm.dialog.close();
  }
}

// ============================================================================
// Settings Class - Manages Extension Settings
// ============================================================================

/**
 * Handles extension settings and preferences
 */
class Settings {
  /**
   * Initialize settings system and load saved preferences
   */
  static async init() {
    Settings.container = document.getElementById("settings-container");
    
    // Set up event listeners
    document.getElementById("settings-icon").addEventListener("click", Settings.show);
    document.getElementById("settings-save").addEventListener("click", Settings.save);
    document.getElementById("settings-close").addEventListener("click", Settings.hide);
    document.getElementById("settings-sidebar-position").addEventListener("click", Settings.openBrwoserSetting);
    document.getElementById("settings-sidebar-shortcut").addEventListener("click", Settings.openExtensionShortcut);
    
    // Load saved settings with defaults
    Settings.settings = await chrome.storage.sync.get({
      showNewtabButton: false,
      searchPosition: "top",
      fontSize: "normal",
      pinMode: "normal",
      closeByDoubleClick: true,
      theme: "system",
    });
    
    // Reload page when settings change in another instance
    chrome.storage.sync.onChanged.addListener(() => location.reload());
    
    // Apply settings to UI
    if (Settings.settings.searchPosition === "top") {
      Main.parentElement.classList.add("reverse");
    }
    
    if (Settings.settings.fontSize === "small") {
      Main.classList.add("font-small");
    }
    
    if (Settings.settings.showNewtabButton) {
      Tabs.initNewtabBtn();
    }
    
    Settings.setTheme(Settings.settings.theme);
  }
  /**
   * Get the closeByDoubleClick setting
   * @returns {boolean} Whether double-click to close is enabled
   */
  static get closeByDoubleClick() {
    return Settings.settings.closeByDoubleClick;
  }
  
  /**
   * Show the settings dialog
   */
  static show() {
    document.getElementById("settings-newtab").checked = Settings.settings.showNewtabButton;
    document.getElementById("settings-closeByDoubleClick").checked = Settings.settings.closeByDoubleClick;
    document.getElementById("settings-search").value = Settings.settings.searchPosition;
    document.getElementById("settings-font").value = Settings.settings.fontSize;
    document.getElementById("settings-theme").value = Settings.settings.theme;
    Settings.container.showModal();
  }
  
  /**
   * Hide the settings dialog
   */
  static hide() {
    Settings.container.close();
  }
  
  /**
   * Save settings to Chrome storage
   */
  static async save() {
    Settings.hide();
    
    const newSettings = {
      showNewtabButton: document.getElementById("settings-newtab").checked,
      closeByDoubleClick: document.getElementById("settings-closeByDoubleClick").checked,
      searchPosition: document.getElementById("settings-search").value,
      fontSize: document.getElementById("settings-font").value,
      theme: document.getElementById("settings-theme").value,
    };
    
    await chrome.storage.sync.set(newSettings);
  }
  
  /**
   * Open Chrome appearance settings
   * @param {MouseEvent} event - The click event
   */
  static openBrwoserSetting(event) {
    event.preventDefault();
    chrome.tabs.create({ url: "chrome://settings/appearance" });
  }
  
  /**
   * Open Chrome extension shortcuts page
   * @param {MouseEvent} event - The click event
   */
  static openExtensionShortcut(event) {
    event.preventDefault();
    const extensionName = chrome.i18n.getMessage("extName");
    const shortcutsUrl = "chrome://extensions/shortcuts#:~:text=" + encodeURIComponent(extensionName);
    chrome.tabs.create({ url: shortcutsUrl });
  }
  
  /**
   * Set the theme (light/dark/system)
   * @param {string} theme - The theme to apply
   */
  static setTheme(theme) {
    const darkCss = document.getElementById("dark-css");
    
    if (theme === "light") {
      darkCss.disabled = true;
    } else if (theme === "dark") {
      darkCss.disabled = false;
    } else {
      // System theme - follow OS preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
      Settings.setTheme(prefersDark.matches ? "dark" : "light");
      
      prefersDark.addEventListener("change", ({ matches }) => {
        Settings.setTheme(matches ? "dark" : "light");
      });
    }
  }
}

// ============================================================================
// Groups Class - Manages Tab Groups
// ============================================================================

/**
 * Handles tab group creation, updates, and organization
 */
class Groups {
  /**
   * Initialize the groups system and set up event listeners
   */
  static async init() {
    chrome.tabGroups.onCreated.addListener(Groups.onCreated);
    chrome.tabGroups.onUpdated.addListener(Groups.onUpdated);
    chrome.tabGroups.onRemoved.addListener(Groups.onRemoved);
    chrome.tabGroups.onMoved.addListener(Groups.onMoved);
    
    // Store color class names for easy class manipulation
    Groups.Colors = Object.values(chrome.tabGroups.Color).map(
      (color) => `group-color-${color}`
    );
    
    // Initialize cache with current groups
    Groups.cache = new Map();
    const allGroups = await chrome.tabGroups.query({});
    for (const group of allGroups) {
      Groups.cache.set(group.id, group);
    }
  }
  
  /**
   * Get a group by ID, using cache or fetching from Chrome API
   * @param {number} groupId - The group ID to retrieve
   * @returns {Promise<chrome.tabGroups.TabGroup|null>} The group object or null if not found
   */
  static async get(groupId) {
    let group = Groups.cache.get(groupId);
    if (group) return group;
    
    try {
      group = await chrome.tabGroups.get(groupId);
      if (group) {
        Groups.cache.set(group.id, group);
      }
      return group;
    } catch (error) {
      return null;
    }
  }
  /**
   * Handle group creation event
   * @param {chrome.tabGroups.TabGroup} group - The newly created group
   */
  static onCreated(group) {
    Groups.cache.set(group.id, group);
  }
  
  /**
   * Handle group update event
   * @param {chrome.tabGroups.TabGroup} group - The updated group
   */
  static onUpdated(group) {
    Groups.cache.set(group.id, group);
    
    // Update UI if this group is in current window
    if (group.windowId !== WindowId) return;
    
    const groupElement = document.getElementById(`group-${group.id}`);
    if (!groupElement) return;
    
    // Update color, title, and collapsed state
    Groups.updateColor(groupElement, group.color);
    Groups.updateTitle(groupElement.querySelector(".group-label"), group.title);
    
    if (group.collapsed) {
      groupElement.classList.add("collapse");
    } else {
      groupElement.classList.remove("collapse");
    }
  }
  
  /**
   * Handle group move event
   * @param {chrome.tabGroups.TabGroup} group - The moved group
   */
  static onMoved(group) {
    if (group.windowId === WindowId) {
      Tabs.delayRebuild();
    }
  }
  
  /**
   * Handle group removal event
   * @param {chrome.tabGroups.TabGroup} group - The removed group
   */
  static onRemoved(group) {
    Groups.cache.delete(group.id);
    
    const groupElement = document.getElementById(`group-${group.id}`);
    if (!groupElement) return;
    
    // Move tabs out of group element before removing it
    groupElement.before(...groupElement.querySelectorAll(".tab-item"));
    groupElement.remove();
  }
  /**
   * Create a group DOM element
   * @param {chrome.tabGroups.TabGroup} group - The group data
   * @returns {HTMLElement} The group container element
   */
  static createGroup(group) {
    const groupContainer = document.createElement("div");
    groupContainer.id = `group-${group.id}`;
    groupContainer.className = `group-item group-color-${group.color}`;
    
    // Create group header
    const groupHeader = document.createElement("div");
    groupHeader.className = "group-header";
    
    const groupLabel = document.createElement("div");
    Groups.updateTitle(groupLabel, group.title);
    groupLabel.className = "group-label";
    
    // Create close button (replaces the old expand icon)
    const closeButton = document.createElement("img");
    closeButton.src = "img/close.svg";
    closeButton.className = "group-close-icon";
    closeButton.addEventListener("click", Groups.onCloseClick);
    closeButton.addEventListener("dblclick", stopEvent);
    
    groupHeader.append(groupLabel, closeButton);
    
    if (group.collapsed) {
      groupContainer.classList.add("collapse");
    }
    
    // Click on header (but not on close button) toggles collapse
    groupHeader.addEventListener("click", Groups.onHeaderClick);
    
    // Create outer wrapper for header (for drag-drop)
    const headerOuter = document.createElement("div");
    headerOuter.className = "group-header-outer";
    headerOuter.appendChild(groupHeader);
    headerOuter.addEventListener("contextmenu", ContextMenu.showGroupMenu);
    DnD.initGroupDrag(headerOuter);
    
    // Create body container for tabs
    const groupBody = document.createElement("div");
    groupBody.className = "group-body";
    
    groupContainer.append(headerOuter, groupBody);
    return groupContainer;
  }
  /**
   * Check if a tab element is inside a group
   * @param {HTMLElement} tabElement - The tab element to check
   * @returns {boolean} True if tab is in a group
   */
  static isInGroup(tabElement) {
    return tabElement.parentElement.classList.contains("group-body");
  }
  
  /**
   * Check if a tab element is positioned after a group
   * @param {HTMLElement} tabElement - The tab element to check
   * @returns {boolean} True if previous sibling is a group
   */
  static isAfterGroup(tabElement) {
    return tabElement.previousElementSibling?.classList.contains("group-item");
  }
  
  /**
   * Update the title text of a group label
   * @param {HTMLElement} labelElement - The label element to update
   * @param {string} title - The new title text
   */
  static updateTitle(labelElement, title) {
    title = title.trim();
    // Use zero-width space if title is empty
    if (title.length === 0) {
      title = "\u200b";
    }
    labelElement.textContent = title;
  }
  
  /**
   * Update the color class of a group element
   * @param {HTMLElement} groupElement - The group element to update
   * @param {string} color - The new color name
   */
  static updateColor(groupElement, color) {
    groupElement.classList.remove(...Groups.Colors);
    groupElement.classList.add(`group-color-${color}`);
  }
  
  /**
   * Handle group header click - toggle collapse state
   * @param {MouseEvent} event - The click event
   */
  static onHeaderClick(event) {
    // Don't toggle collapse if clicking on the close button
    if (event.target.classList.contains("group-close-icon")) {
      return;
    }
    
    const groupElement = event.currentTarget.closest(".group-item");
    const groupId = parseInt(groupElement.id.substring(6));
    
    chrome.tabGroups.update(groupId, {
      collapsed: !groupElement.classList.contains("collapse"),
    });
  }
  
  /**
   * Handle group close button click - close all tabs in the group
   * @param {MouseEvent} event - The click event
   */
  static onCloseClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const groupElement = event.currentTarget.closest(".group-item");
    const groupId = parseInt(groupElement.id.substring(6));
    
    // Get all tabs in this group and close them
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      const tabsToClose = tabs
        .filter((tab) => tab.groupId === groupId)
        .map((tab) => tab.id);
      
      if (tabsToClose.length > 0) {
        chrome.tabs.remove(tabsToClose);
      }
    });
  }
}

// ============================================================================
// Search Class - Tab Search Functionality
// ============================================================================

/**
 * Provides fuzzy search across all tabs
 */
class Search {
  /**
   * Initialize the search functionality
   */
  static init() {
    const searchInput = document.getElementById("search-input");
    searchInput.placeholder = chrome.i18n.getMessage("searchPlaceholder");
    searchInput.addEventListener("input", Search.onInputChanged);
    searchInput.addEventListener("focus", Search.getIndex);
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        Search.search();
      }
    });
    
    Search.input = searchInput;
    Search.TimeoutId = 0;
    
    // Set up listeners to track when search index needs updating
    chrome.tabs.onUpdated.addListener(Search.onTabUpdated);
    chrome.tabs.onRemoved.addListener(Search.onTabRemoved);
    chrome.tabs.onCreated.addListener(Search.onTabChanged);
    chrome.tabs.onReplaced.addListener(Search.onTabChanged);
  }
  /**
   * Handle tab update events - mark index as needing update
   * @param {number} tabId - The updated tab ID
   * @param {object} changeInfo - Information about what changed
   */
  static onTabUpdated(tabId, changeInfo) {
    if (changeInfo.title || changeInfo.url) {
      Search.needUpdate = true;
    }
  }
  
  /**
   * Handle tab removal - mark index as needing update and remove from search results
   * @param {number} tabId - The removed tab ID
   */
  static onTabRemoved(tabId) {
    Search.needUpdate = true;
    
    const searchResultElement = document.getElementById(`search-${tabId}`);
    if (searchResultElement) {
      searchResultElement.remove();
    }
    
    // If no more results, show normal tab list
    if (document.querySelectorAll(".search-item").length === 0) {
      Search.showTabs();
    }
  }
  
  /**
   * Handle tab creation or replacement - mark index as needing update
   */
  static onTabChanged() {
    Search.needUpdate = true;
  }
  
  /**
   * Dynamically load the Fuse.js library
   * @returns {Promise} Promise that resolves when Fuse.js is loaded
   */
  static loadFuse() {
    if (!Search.loadFusePromise) {
      Search.loadFusePromise = import("/js/fuse.esm.min.js").then(
        (module) => (window.Fuse = module.default)
      );
    }
    return Search.loadFusePromise;
  }
  
  /**
   * Build the search index from all tabs
   */
  static async buildIndex() {
    await Search.loadFuse();
    
    const allTabs = await chrome.tabs.query({ windowType: "normal" });
    const fuseOptions = {
      threshold: 0.25,
      ignoreLocation: true,
      includeMatches: true,
      keys: [
        { name: "title", weight: 0.7 },
        { name: "url", weight: 0.3 },
      ],
    };
    
    if (Search.tabsIndex) {
      Search.tabsIndex.setCollection(allTabs);
    } else {
      Search.tabsIndex = new Fuse(allTabs, fuseOptions);
    }
    
    Search.needUpdate = false;
  }
  
  /**
   * Get the search index, building it if necessary
   * @returns {Promise<Fuse>} The Fuse.js search index
   */
  static async getIndex() {
    if (!Search.tabsIndex || Search.needUpdate) {
      if (Search.buildIndexPromise) {
        await Search.buildIndexPromise;
      } else {
        Search.buildIndexPromise = Search.buildIndex();
        await Search.buildIndexPromise;
        Search.buildIndexPromise = null;
      }
    }
    return Search.tabsIndex;
  }
  /**
   * Perform search and display results
   */
  static async search() {
    const query = Search.input.value.trim();
    
    if (query) {
      const searchIndex = await Search.getIndex();
      const results = searchIndex.search(query);
      Search.showResults(results);
    } else {
      Search.showTabs();
    }
  }
  
  /**
   * Handle input changes with debouncing
   */
  static onInputChanged() {
    clearTimeout(Search.TimeoutId);
    Search.TimeoutId = setTimeout(Search.search, 300);
  }
  /**
   * Create a search result tab element
   * @param {object} searchResult - The Fuse.js search result
   * @returns {HTMLElement} The search result element
   */
  static createResultTab(searchResult) {
    const tab = searchResult.item;
    const resultElement = document.createElement("div");
    resultElement.id = `search-${tab.id}`;
    resultElement.className = "search-item";
    
    resultElement.appendChild(Search.createFavicon(tab.url));
    resultElement.appendChild(Search.createLink(tab, searchResult.matches));
    resultElement.appendChild(Search.createCloseBtn());
    
    resultElement.addEventListener("click", Search.onTabClick);
    resultElement.addEventListener("dblclick", Search.onTabDoubleClick);
    resultElement.addEventListener("auxclick", Search.onTabMiddleClick);
    
    return resultElement;
  }
  
  /**
   * Create a favicon element
   * @param {string} url - The tab URL
   * @returns {HTMLElement} The favicon image element
   */
  static createFavicon(url) {
    const faviconImg = document.createElement("img");
    faviconImg.src = url
      ? `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`
      : "img/tab.svg";
    faviconImg.className = "favicon";
    return faviconImg;
  }
  
  /**
   * Create a link element with highlighted search matches
   * @param {chrome.tabs.Tab} tab - The tab data
   * @param {Array} matches - Array of match objects from Fuse.js
   * @returns {HTMLElement} The link container element
   */
  static createLink(tab, matches) {
    const linkContainer = document.createElement("div");
    const titleDiv = document.createElement("div");
    const urlDiv = document.createElement("div");
    
    linkContainer.className = "search-link";
    
    let titleMatch, urlMatch;
    for (const match of matches) {
      if (match.key === "title") {
        titleMatch = match;
      } else if (match.key === "url") {
        urlMatch = match;
      }
    }
    
    // Create title with highlighting
    if (tab.title) {
      titleDiv.className = "search-title";
      titleDiv.title = tab.title;
      
      if (titleMatch) {
        titleDiv.append(...Search.highlightMatch(titleMatch));
      } else {
        titleDiv.appendChild(document.createTextNode(tab.title));
      }
    }
    
    // Create URL with highlighting
    if (tab.url) {
      urlDiv.className = "search-url";
      urlDiv.title = tab.url;
      
      if (urlMatch) {
        urlDiv.append(...Search.highlightMatch(urlMatch));
      } else {
        urlDiv.appendChild(document.createTextNode(tab.url));
      }
    }
    
    linkContainer.append(titleDiv, urlDiv);
    return linkContainer;
  }
  /**
   * Highlight matched portions of text
   * @param {object} match - The match object from Fuse.js
   * @returns {Array<Node>} Array of text nodes and mark elements
   */
  static highlightMatch(match) {
    const nodes = [];
    let currentPos = 0;
    const text = match.value;
    
    for (const [startIndex, endIndex] of match.indices) {
      // Add text before match
      if (currentPos < startIndex) {
        nodes.push(document.createTextNode(text.substring(currentPos, startIndex)));
      }
      
      // Add highlighted match
      currentPos = endIndex + 1;
      const mark = document.createElement("mark");
      mark.textContent = text.substring(startIndex, currentPos);
      nodes.push(mark);
    }
    
    // Add remaining text after last match
    if (currentPos < text.length) {
      nodes.push(document.createTextNode(text.substring(currentPos)));
    }
    
    return nodes;
  }
  
  /**
   * Create a close button for search results
   * @returns {HTMLElement} The close button element
   */
  static createCloseBtn() {
    const closeBtn = document.createElement("img");
    closeBtn.src = "img/close.svg";
    closeBtn.className = "close-btn";
    closeBtn.addEventListener("click", Search.onCloseClick);
    closeBtn.addEventListener("dblclick", stopEvent);
    return closeBtn;
  }
  /**
   * Handle tab click in search results
   * @param {MouseEvent} event - The click event
   */
  static onTabClick(event) {
    event.preventDefault();
    
    const tabId = parseInt(event.currentTarget.id.substring(7));
    
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return;
      
      chrome.tabs.update(tabId, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    });
  }
  
  /**
   * Handle tab double-click in search results
   * @param {MouseEvent} event - The double-click event
   */
  static onTabDoubleClick(event) {
    if (!Settings.closeByDoubleClick) return;
    
    event.preventDefault();
    const tabId = parseInt(event.currentTarget.id.substring(7));
    chrome.tabs.remove(tabId);
  }
  
  /**
   * Handle middle mouse button click in search results
   * @param {MouseEvent} event - The auxclick event
   */
  static onTabMiddleClick(event) {
    if (event.button !== 1) return;
    
    event.preventDefault();
    const tabId = parseInt(event.currentTarget.id.substring(7));
    chrome.tabs.remove(tabId);
  }
  
  /**
   * Handle close button click in search results
   * @param {MouseEvent} event - The click event
   */
  static onCloseClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const tabId = parseInt(event.currentTarget.parentElement.id.substring(7));
    chrome.tabs.remove(tabId);
  }
  /**
   * Create the search results header
   * @returns {HTMLElement} The header element
   */
  static createResultHeader() {
    const header = document.createElement("div");
    const headerText = document.createTextNode(chrome.i18n.getMessage("searchResultHeader"));
    const backIcon = document.createElement("img");
    const refreshIcon = document.createElement("img");
    
    header.className = "search-header";
    
    backIcon.src = "img/arrow_back.svg";
    backIcon.addEventListener("click", Search.showTabs);
    
    refreshIcon.src = "img/refresh.svg";
    refreshIcon.addEventListener("click", Search.search);
    
    header.append(backIcon, headerText, refreshIcon);
    return header;
  }
  
  /**
   * Create the "no results" message element
   * @returns {HTMLElement} The no results element
   */
  static createNoResults() {
    const noResults = document.createElement("div");
    noResults.className = "search-no-results";
    noResults.textContent = chrome.i18n.getMessage("searchNoResults");
    return noResults;
  }
  
  /**
   * Display search results
   * @param {Array} results - Array of Fuse.js search results
   */
  static showResults(results) {
    const resultsContainer = document.createElement("div");
    
    // Create header if not already created
    if (!Search.ResultHeader) {
      Search.ResultHeader = Search.createResultHeader();
    }
    resultsContainer.appendChild(Search.ResultHeader);
    
    // Add each result
    for (const result of results) {
      resultsContainer.appendChild(Search.createResultTab(result));
    }
    
    // Show "no results" message if needed
    if (results.length === 0) {
      resultsContainer.appendChild(Search.createNoResults());
    }
    
    Main.replaceChild(resultsContainer, Main.lastElementChild);
    Main.classList.add("search-on");
  }
  
  /**
   * Hide search results and show normal tab list
   */
  static showTabs() {
    Search.input.value = "";
    Main.classList.remove("search-on");
  }
}

// ============================================================================
// Utility Functions and Initialization
// ============================================================================

/**
 * Initialize internationalization messages for all elements with data-i18n attributes
 * @param {Document|Element} root - The root element to search within
 */
function initMsg(root = document) {
  // Initialize regular i18n text content
  const i18nElements = root.querySelectorAll("[data-i18n]");
  for (const element of i18nElements) {
    element.textContent = chrome.i18n.getMessage(element.dataset.i18n);
  }
  
  // Initialize i18n title attributes
  const i18nTitleElements = root.querySelectorAll("[data-i18n-title]");
  for (const element of i18nTitleElements) {
    element.title = chrome.i18n.getMessage(element.dataset.i18nTitle);
  }
}

/**
 * Prevent middle mouse button default behavior (auto-scroll)
 */
document.addEventListener("mousedown", function (event) {
  if (event.button === 1) {
    event.preventDefault();
  }
});

/**
 * Try to focus search input with delay to ensure panel is ready
 */
function tryFocusSearch() {
  setTimeout(() => {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.focus();
    }
  }, 150);
}

// Focus when window gains focus (keyboard shortcut activation)
window.addEventListener("focus", tryFocusSearch);

// Focus when page becomes visible
document.addEventListener("visibilitychange", function() {
  if (!document.hidden) {
    tryFocusSearch();
  }
});

// Focus on any click in the panel (ensures focus after user interaction)
document.addEventListener("click", function(event) {
  // Don't interfere with clicks on inputs or buttons
  if (!event.target.closest('input, button, dialog')) {
    tryFocusSearch();
  }
}, true);

/**
 * Initialize all components of the extension
 */
function init() {
  Tabs.init();
  Groups.init();
  ContextMenu.init();
  CloseConfirm.init();
  Search.init();
  Settings.init();
  initMsg();
  
  // Initial focus attempt
  tryFocusSearch();
}

// Start the application
init();

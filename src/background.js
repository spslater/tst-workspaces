const TST_ID = "treestyletab@piro.sakura.ne.jp";
const TSTW_ID = "tstworkspaces_seanwhatnoio@whatnoio";
const TSTW_PREFIX = "tstworkspaces_";
const TSTW_WORKSPACE = `${TSTW_PREFIX}1`;
const TSTW_WORKSPACES = `${TSTW_PREFIX}list`;
const TSTW_BOOKMARK_ROOT = "tstworkspaces";

async function registerToTST() {
  try {
    let plugin = {
      type: "register-self",
      name: TSTW_ID,
      icons: browser.runtime.getManifest().icons,
    };
    await messageTST(plugin);
  } catch (e) {
    // TST is not available
  }
}

async function messageTST(value) {
  console.debug(`Calling TST ${value["type"]}`);
  return await browser.runtime.sendMessage(TST_ID, value);
}

async function storageGet(key) {
  console.debug("getting from storage", key);
  let value = await browser.storage.local.get(key);
  return value[key];
}

function storageSet(value) {
  console.debug("setting new storage value", value);
  return browser.storage.local.set(value);
}

async function getFolder(id) {
  return await browser.bookmarks.get(id);
}

async function bookmarkTree(subtree) {
  return await browser.bookmarks.getSubTree(subtree);
}

async function bookmarkRemove(id) {
  return await browser.bookmarks.remove(id);
}

async function bookmarkCreate(bookmark) {
  return await browser.bookmarks.create(bookmark);
}

async function getBookmarkRoot() {
  let tree = await bookmarkTree("unfiled_____");
  console.debug("tree", tree);
  let folders = tree[0].children.filter((bookmark) => {
    return bookmark.type == "folder" && bookmark.title == TSTW_BOOKMARK_ROOT;
  });
  return folders ? folders[0] : null;
}

function wsName(name) {
  return name.replace(`${TSTW_PREFIX}_`, "");
}

async function createWorkspaceFolder(workspace) {
  let name = wsName(workspace);
  let root = await getBookmarkRoot();
  for (const bookmark of root.children) {
    if (bookmark.type == "folder" && bookmark.title == name) {
      return bookmark;
    }
  }
  let newFolder = await browser.bookmarks.create({
    title: name,
    parentId: root.id,
    type: "folder",
  });
  return newFolder;
}

function flattenTabs(tabs) {
  let result = [];
  tabs.forEach((tab) => {
    let children = flattenTabs(tab.children);
    let indent = ">".repeat(tab.indent);
    if (indent.length > 0) {
      indent += " ";
    }
    let title = `${indent}${tab.info.title}`;
    result.push({ title: title, url: tab.info.url });
    if (children.length) {
      result.push(...children);
    }
  });
  return result;
}

async function setBookmarks(folder, tabs) {
  // wtf??? why need to reverse twice??
  let flat = flattenTabs(tabs).reverse();
  flat.reverse();
  let tree = await bookmarkTree(folder);
  if (tree[0].children) {
    tree[0].children.forEach(async (bookmark) => {
      await bookmarkRemove(bookmark.id);
    });
  }
  flat.forEach(async (bookmark) => {
    bookmark["parentId"] = folder;
    await bookmarkCreate(bookmark);
  });
  return await bookmarkTree(folder);
}

async function getTabs() {
  let window = await browser.windows.getCurrent();
  let struct = await messageTST({
    type: "get-tree",
    window: window.id,
  });
  return formatTabList(struct);
}

function formatTabList(tabs) {
  return tabs.map((tab) => {
    return {
      id: tab.id,
      indent: tab.indent,
      children: formatTabList(tab.children || []),
      states: tab.states,
      info: {
        reader: tab.isInReaderMode,
        muted: tab.mutedInfo.muted,
        pinned: tab.pinned,
        title: tab.title,
        url: tab.url,
      },
    };
  });
}

async function createTree(window, tabs, parent = null) {
  let tab_ids = [];
  await tabs.forEach(async (tab) => {
    let val = await messageTST({
      type: "create",
      params: {
        active: false,
        discarded: true,
        openerTabId: parent,
        openInReaderModeOptional: tab.info.reader,
        pinned: tab.info.pinned,
        title: tab.info.title,
        url: tab.info.url,
        windowId: window,
        mutedInfo: { muted: tab.info.muted },
      },
    });
    tab_ids.push(val.id);
    let children = await createTree(window, tab.children, val.id);
    tab_ids.push(...children);
    if (tab.states.includes("subtree-collapsed")) {
      await messageTST({ type: "collapse-tree", tab: val.id });
    }
  });
  return tab_ids;
}

async function getWorkspaces() {
  let wsList = await storageGet(TSTW_WORKSPACES);
  if (wsList === null || wsList === undefined) {
    wsList = [];
  }
  return wsList;
}

async function storeTabList(workspace, tabs) {
  let wsList = await getWorkspaces();
  if (!wsList.includes(workspace)) {
    wsList.push(workspace);
  }
  await storageSet({ [TSTW_WORKSPACES]: wsList });
  await storageSet({ [workspace]: tabs });
  let wsFolder = await createWorkspaceFolder(workspace);
  console.debug("wsFolder", wsFolder);
  let bookmarks = await setBookmarks(wsFolder.id, tabs);
  return {
    workspace: workspace,
    tabs: tabs,
    wslist: wsList,
    folder: wsFolder,
    bookmarks: bookmarks,
  };
}

async function printTabs() {
  let tabs = getTabs();
  storeTabList(TSTW_WORKSPACE, tabs);
}

async function reloadTabs(workspace) {
  let res = await storageGet(workspace);
  let window = await browser.windows.create();
  let new_ids = await createTree(window.id, res);
  console.debug("new ids created", new_ids);
  let new_tree = await messageTST({ type: "get-tree", window: window.id });
  browser.tabs.remove(new_tree[0].id);
}

async function processMessage(message) {
  switch (message.type) {
    case "print":
      return new Promise(async (resolve) => {
        let tabs = await getTabs();
        resolve({ tabs: tabs, name: message.name });
      });
    case "create":
      return new Promise(async (resolve) => {
        let tabs = await getTabs();
        resolve(storeTabList(`${TSTW_PREFIX}_${message.name}`, tabs));
      });
    case "reload":
      return new Promise(async (resolve) => {
        resolve(reloadTabs(`${TSTW_PREFIX}_${message.name}`));
      });
    case "workspaces":
      return new Promise(async (resolve) => {
        let workspaces = await getWorkspaces();
        let names = workspaces.map((name) => {
          return wsName(name);
        });
        resolve(names);
      });
  }
}

const contextMenuItems = [
  {
    id: "tstworkspace-check",
    title: "Check Tabs",
    type: "normal",
    contexts: ["page", "tab"],
  },
  {
    id: "tstworkspace-reload",
    title: "Reload Tabs",
    type: "normal",
    contexts: ["page", "tab"],
  },
];

async function init() {
  console.debug("Welcome to TST Workspaces");
  console.debug("Registering addon to TST");
  await registerToTST();

  browser.runtime.onMessageExternal.addListener((message, sender) => {
    switch (sender.id) {
      case TST_ID:
        switch (message.type) {
          case "wait-for-shutdown": // IMPORTANT!
            return new Promise(() => {}); // Yes, this won't be resolved never.
        }
        break;
    }
  });

  browser.runtime.onMessage.addListener(processMessage);

  contextMenuItems.forEach(async (item) => {
    browser.contextMenus.create(item);
    await messageTST({ type: "contextMenu-create", params: item });
  });

  browser.contextMenus.onClicked.addListener((info) => {
    switch (info.menuItemId) {
      case "tstworkspace-check":
        console.debug("Checking tabs");
        printTabs();
        break;
      case "tstworkspace-reload":
        console.debug("Reloading tabs");
        reloadTabs(TSTW_WORKSPACE);
        break;
    }
  });

  let rootBookmark = await getBookmarkRoot();
  console.debug("bookmark folder", rootBookmark);
  if (rootBookmark == null || rootBookmark == undefined) {
    let created = await browser.bookmarks.create({
      title: TSTW_BOOKMARK_ROOT,
      type: "folder",
    });
    console.debug("new folder", created);
  }
}

init();

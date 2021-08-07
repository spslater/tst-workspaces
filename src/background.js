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
  console.debug(`[TSTW] Calling TST ${value["type"]}`);
  return await browser.runtime.sendMessage(TST_ID, value);
}

async function storageGet(key) {
  console.debug("[TSTW] storage get", key);
  let value = await browser.storage.local.get(key);
  return value[key];
}

async function storageSet(value) {
  console.debug("[TSTW] storage set", value);
  return await browser.storage.local.set(value);
}

async function storageRemove(key) {
  console.debug("[TSTW] storage remove", key);
  return await browser.storage.local.remove(key);
}

async function getFolder(id) {
  return await browser.bookmarks.get(id);
}

async function bookmarkTree(subtree) {
  return await browser.bookmarks.getSubTree(subtree);
}

async function bookmarkRemoveTree(tree) {
  return await browser.bookmarks.removeTree(tree);
}

async function bookmarkRemove(id) {
  return await browser.bookmarks.remove(id);
}

async function bookmarkCreate(bookmark) {
  return await browser.bookmarks.create(bookmark);
}

async function getBookmarkRoot() {
  let tree = await bookmarkTree("unfiled_____");
  let folders = tree[0].children.filter((bookmark) => {
    return bookmark.type == "folder" && bookmark.title == TSTW_BOOKMARK_ROOT;
  });
  return folders[0];
}

function wsName(name) {
  return name.replace(`${TSTW_PREFIX}_`, "");
}

function genName(name) {
  return `${TSTW_PREFIX}_${name}`;
}

async function getWorkspaceFolder(workspace) {
  let name = wsName(workspace);
  let root = await getBookmarkRoot();
  for (const bookmark of root.children) {
    if (bookmark.type == "folder" && bookmark.title == name) {
      return bookmark;
    }
  }
  return null;
}

async function removeWorkspaceFolder(workspace) {
  let folder = await getWorkspaceFolder(workspace);
  if (folder) {
    await bookmarkRemoveTree(folder.id);
  }
}

async function createWorkspaceFolder(workspace) {
  let name = wsName(workspace);
  let root = await getBookmarkRoot();
  return await browser.bookmarks.create({
    title: name,
    parentId: root.id,
    type: "folder",
  });
}

async function getOrCreateWorkspaceFolder(workspace) {
  let folder = await getWorkspaceFolder(workspace);
  if (folder == null || folder == undefined) {
    folder = await createWorkspaceFolder(workspace);
  }
  return folder;
}

function flattenTabs(tabs) {
  let result = [];
  for (const tab of tabs) {
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
  }
  return result;
}

async function setBookmarks(folder, tabs) {
  let flat = flattenTabs(tabs);
  console.debug("[TSTW] Flattened Bookmark Structure", flat);
  let tree = await bookmarkTree(folder);
  if (tree[0].children) {
    for (const bookmark of tree[0].children) {
      await bookmarkRemove(bookmark.id);
    }
  }
  let bookmarks = [];
  for (const i in flat) {
    let bookmark = flat[i];
    bookmark["parentId"] = folder;
    bookmark["index"] = parseInt(i);
    console.debug("[TSTW] Bookmark Struct", bookmark);
    let node = await bookmarkCreate(bookmark);
    bookmarks.push(node);
  }
  return bookmarks;
}

async function getBookmarks(workspace) {
  let folder = await getWorkspaceFolder(workspace);
  if (folder == null || folder == undefined) {
    return [];
  }
  return await bookmarkTree(folder.id);
}

async function getTabs() {
  let window = await browser.windows.getCurrent();
  let struct = await messageTST({
    type: "get-tree",
    window: window.id,
  });
  console.debug("[TSTW] TST Get Tree Structure", struct);
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

function indexesOf(array, value) {
  let indexes = [];
  let current = array.indexOf(value);
  while (current != -1) {
    indexes.push(current);
    current = array.indexOf(value, current + 1);
  }
  return indexes;
}

function groupChildren(r, n) {
  // https://stackoverflow.com/a/47906920
  const lastSubArray = r[r.length - 1];
  if (!lastSubArray || lastSubArray[lastSubArray.length - 1] !== n - 1) {
    r.push([]);
  }
  r[r.length - 1].push(n);
  return r;
}

function formatBookmarkList(bookmarks) {
  let dicts = bookmarks.map((bookmark) => {
    let split = bookmark.title.match(/^(>*)\s*(.*)/);
    return {
      id: bookmark.id,
      indent: split[1].length,
      states: [],
      children: [],
      info: {
        title: split[2],
        url: bookmark.url,
        muted: false,
        pinned: false,
        reader: false,
      },
    };
  });
  let indents = dicts.map((b) => {
    return b.indent;
  });
  let max = Math.max(...indents);
  while (max != 0) {
    let curIdxs = indexesOf(indents, max);
    let groups = curIdxs.reduce(groupChildren, []);
    for (const group of groups) {
      let parent = dicts[group[0] - 1];
      for (const i of group) {
        parent.children.push(dicts[i]);
      }
    }
    max--;
  }
  return dicts.filter((elem) => {
    return elem.indent == 0;
  });
}

async function createTree(window, tabs, parent = null) {
  let tab_ids = [];
  for (const tab of tabs) {
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
  }
  return tab_ids;
}

async function getWorkspaces() {
  let wsList = await storageGet(TSTW_WORKSPACES);
  if (wsList === null || wsList === undefined) {
    wsList = [];
  }
  wsList.sort();
  return wsList;
}

async function updateWorkspacesFromBookmarks() {
  let workspaces = await getBookmarkRoot();
  let tree = await bookmarkTree(workspaces.id);
  let folders = tree[0].children.filter((val) => {
    return val.type == "folder";
  });
  for (const folder of folders) {
    let name = genName(folder.title);
    let bookmarks = formatBookmarkList(folder.children);
    await updateStorage(name, bookmarks);
  }
  return folders;
}

async function updateStorage(workspace, tabs) {
  let wsList = await getWorkspaces();
  if (!wsList.includes(workspace)) {
    wsList.push(workspace);
  }
  wsList.sort();
  await storageSet({ [TSTW_WORKSPACES]: wsList });
  await storageSet({ [workspace]: tabs });
  return wsList;
}

async function removeStorage(name) {
  let workspace = genName(name);
  let wsList = await getWorkspaces();
  let idx = wsList.indexOf(workspace);
  if (idx != -1) {
    wsList.splice(idx, 1);
  }
  await storageSet({ [TSTW_WORKSPACES]: wsList });
  await storageRemove(workspace);
  return wsList;
}

async function updateBookmarks(workspace, tabs) {
  let wsFolder = await getOrCreateWorkspaceFolder(workspace);
  let bookmarks = await setBookmarks(wsFolder.id, tabs);
  return [wsFolder, bookmarks];
}

async function storeWorkspace(workspace, tabs) {
  let wsList = await updateStorage(workspace, tabs);
  let [wsFolder, bookmarks] = await updateBookmarks(workspace, tabs);
  return {
    workspace: workspace,
    tabs: tabs,
    wslist: wsList,
    folder: wsFolder,
    bookmarks: bookmarks,
  };
}

async function removeWorkspace(workspace) {
  let wsList = await removeStorage(workspace);
  await removeWorkspaceFolder(workspace);
  return wsList;
}

async function reloadTabs(name) {
  let workspace = genName(name);
  let res = await storageGet(workspace);
  let window = await browser.windows.create();
  let new_ids = await createTree(window.id, res);
  let new_tree = await messageTST({ type: "get-tree", window: window.id });
  browser.tabs.remove(new_tree[0].id);
}

async function processMessage(message) {
  switch (message.type) {
    case "print":
      return new Promise(async (resolve) => {
        let tabs = await getTabs();
        return resolve({ tabs: tabs, name: message.name });
      });
    case "create":
      return new Promise(async (resolve, reject) => {
        if (!message.name) {
          return reject(new Error("Name must not be blank"));
        }
        let workspace = genName(message.name);
        let tabs = await getTabs();
        return resolve(storeWorkspace(workspace, tabs));
      });
    case "reload":
      return new Promise(async (resolve, reject) => {
        if (!message.name) {
          return reject(new Error("No workspace name passed in"));
        }
        return resolve(reloadTabs(message.name));
      });
    case "workspaces":
      return new Promise(async (resolve) => {
        let workspaces = await getWorkspaces();
        let names = workspaces.map((name) => {
          return wsName(name);
        });
        return resolve(names);
      });
    case "remove":
      return new Promise(async (resolve, reject) => {
        if (!message.name) {
          return reject(new Error("No workspace name passed in"));
        }
        return resolve(removeWorkspace(message.name));
      });
    case "load-bookmark":
      return new Promise(async (resolve) => {
        return resolve(updateWorkspacesFromBookmarks());
      });
  }
}

const contextMenuItems = [
  {
    id: "tstworkspace-save-current",
    title: "Save Current Workspace",
    type: "normal",
    contexts: ["page", "tab"],
  },
];

async function init() {
  console.info("[TSTW] Welcome to TST Workspaces");
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

  for (const item of contextMenuItems) {
    browser.contextMenus.create(item);
    await messageTST({ type: "contextMenu-create", params: item });
  }

  browser.contextMenus.onClicked.addListener(async (info) => {
    switch (info.menuItemId) {
      case "tstworkspace-save-current":
        break;
    }
  });

  let rootBookmark = await getBookmarkRoot();
  if (rootBookmark == null || rootBookmark == undefined) {
    let created = await browser.bookmarks.create({
      title: TSTW_BOOKMARK_ROOT,
      type: "folder",
    });
  }
}

init();

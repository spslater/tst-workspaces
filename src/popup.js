const TSTW_ID = "tstworkspaces_seanwhatnoio@whatnoio";

async function message(value) {
  return await browser.runtime.sendMessage(value);
}

function listener(type) {
  return async (e) => {
    e.preventDefault();
    let form = e.target;
    try {
      let value = { type: type };
      if (form.workspace_name) {
        value["name"] = form.workspace_name.value;
      }
      let tabs = await message(value);
      console.log(type, tabs);
    } catch (error) {
      console.warn(type, error);
    } finally {
      window.close();
    }
  };
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("tstworkspaces-create")
    .addEventListener("submit", listener("create"), false);

  document
    .getElementById("tstworkspaces-reload")
    .addEventListener("submit", listener("reload"), false);

  document
    .getElementById("tstworkspaces-remove")
    .addEventListener("submit", listener("remove"), false);

  document
    .getElementById("tstworkspaces-load-bookmark")
    .addEventListener("submit", listener("load-bookmark"), false);

  message({ type: "workspaces" }).then((workspaces) => {
    let rlElem = document.getElementById("tstworkspaces-reload").workspace_name;
    let rmElem = document.getElementById("tstworkspaces-remove").workspace_name;
    workspaces.forEach((workspace) => {
      let rlOpt = document.createElement("option");
      rlOpt.value = rlOpt.textContent = workspace;
      rlElem.appendChild(rlOpt);
      let rmOpt = document.createElement("option");
      rmOpt.value = rmOpt.textContent = workspace;
      rmElem.appendChild(rmOpt);
    });
  });
});

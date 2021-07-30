const TSTW_ID = "tstworkspaces_seanwhatnoio@whatnoio";

async function message(value) {
  return await browser.runtime.sendMessage(value);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("tstworkspaces-create").addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      let form = e.target;
      let tabs = await message({
        type: "create",
        name: form.workspace_name.value,
      });
      console.log(tabs);
    },
    false
  );

  document.getElementById("tstworkspaces-reload").addEventListener(
    "submit",
    async (e) => {
      let form = e.target;
      let tabs = await message({
        type: "reload",
        name: form.workspace_name.value,
      });
      console.log(tabs);
    },
    false
  );

  message({ type: "workspaces" }).then((workspaces) => {
    let select = document.getElementById("tstworkspaces-reload").workspace_name;
    workspaces.forEach((workspace) => {
      let opt = document.createElement("option");
      opt.value = opt.innerHTML = workspace;
      select.appendChild(opt);
    });
  });
});

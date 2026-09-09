importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

self.micropipIncludePre = false;
self.pythonModuleName = null;
self.initialized = false;
self.flet_js = {}; // namespace for Python global functions

self.initPyodide = async function () {
    self.pyodide = await loadPyodide();
    self.pyodide.registerJsModule("flet_js", flet_js);
    flet_js.documentUrl = documentUrl;
    await self.pyodide.loadPackage(["micropip", "msgpack", "sqlite3"]);
    let pre = self.micropipIncludePre ? "True" : "False";
    await self.pyodide.runPythonAsync(`
    import micropip
    import os
    from pyodide.http import pyfetch
    try:
        response = await pyfetch("app.tar.gz", cache="reload")
    except Exception:
        response = await pyfetch("app.tar.gz")
    await response.unpack_archive()
    if os.path.exists("requirements.txt"):
        with open("requirements.txt", "r") as f:
            raw_lines = [line.rstrip() for line in f]
    else:
        raw_lines = ["flet-pyodide==0.23.2"]
    deps = []
    for line in raw_lines:
        d = line.strip()
        if not d or d.startswith("#"):
            continue
        if d.startswith("flet==") or d.startswith("flet>=") or d == "flet" or "flet-pyodide" in d:
            deps.append("flet-pyodide==0.23.2")
        elif "geolocator" in d or "sqlite" in d:
            continue
        else:
            deps.append(d)
    if not any("flet-pyodide" in x for x in deps):
        deps.insert(0, "flet-pyodide==0.23.2")
    seen = set()
    clean_deps = []
    for d in deps:
        if d not in seen:
            seen.add(d)
            clean_deps.append(d)
    print("SmartFrota: instalando pacotes Pyodide:", clean_deps)
    for pkg in clean_deps:
        try:
            await micropip.install(pkg, pre=${pre})
            print(f"SmartFrota: instalado com sucesso: {pkg}")
        except Exception as _pip_err:
            print(f"SmartFrota: aviso ao instalar {pkg}: {_pip_err}")
  `);
    // Persistencia (IDBFS): monta o filesystem no IndexedDB e carrega dados salvos
    try {
        try { self.pyodide.FS.mkdir('/home/pyodide/persist'); } catch (e) {}
        self.pyodide.FS.mount(self.pyodide.FS.filesystems.IDBFS, {}, '/home/pyodide/persist');
        await new Promise((resolve, reject) => {
            self.pyodide.FS.syncfs(true, (err) => err ? reject(err) : resolve());
        });
    } catch (e) {
        console.warn('Persistencia IDBFS indisponivel:', e);
    }
    pyodide.pyimport(self.pythonModuleName);
    await self.flet_js.start_connection(self.receiveCallback);
    self.postMessage("initialized");
};

self.receiveCallback = (message) => {
    self.postMessage(message);
}

self.onmessage = async (event) => {
    // run only once
    if (!self.initialized) {
        self.initialized = true;
        self.documentUrl = event.data.documentUrl;
        self.micropipIncludePre = event.data.micropipIncludePre;
        self.pythonModuleName = event.data.pythonModuleName;
        await self.initPyodide();
    } else {
        // message
        flet_js.send(event.data);
    }
};
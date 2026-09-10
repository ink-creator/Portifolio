// Rascunhos e prévias grandes ficam no IndexedDB, sem o limite do localStorage.
window.PortfolioDrafts = (() => {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open("portfolio-editor", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Não foi possível abrir os rascunhos neste navegador."));
      request.onblocked = () => reject(new Error("Feche outras abas do editor e tente novamente."));
    });
    return database;
  }
  async function run(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", mode);
      const request = action(transaction.objectStore("drafts"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(new Error("Não foi possível guardar o rascunho. Verifique o espaço disponível no navegador."));
    });
  }
  return {
    get: key => run("readonly", store => store.get(key)),
    put: (key, value) => run("readwrite", store => store.put(value, key)),
    remove: key => run("readwrite", store => store.delete(key))
  };
})();

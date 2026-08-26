const DATABASE_NAME = 'a4-print-studio';
const DATABASE_VERSION = 1;
const STORE_NAME = 'workspace';
const WORKSPACE_KEY = 'current';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
  });
}

function runTransaction(mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error('IndexedDB 操作失败'));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('IndexedDB 事务失败'));
    };
  }));
}

export function loadWorkspace() {
  return runTransaction('readonly', (store) => store.get(WORKSPACE_KEY));
}

export function saveWorkspace(workspace) {
  return runTransaction('readwrite', (store) => store.put({
    ...workspace,
    savedAt: new Date().toISOString(),
  }, WORKSPACE_KEY));
}

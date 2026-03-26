/// <mls fileReference="_102029_/l2/storageAdapter.ts" enhancement="_blank"/>

export interface StorageAdapter {
  getTask(taskId: string): Promise<any>;
  getMessage(messageId: string): Promise<any>;
  addOrUpdateTask(task: any): Promise<void>;
  addPooling(pooling: any): Promise<void>;
  deletePooling(taskId: string): Promise<void>;
  updateThreadPendingTasks(threadId: string, taskId?: string): Promise<any>;
}

let _adapter: StorageAdapter | null = null;

export function setStorageAdapter(adapter: StorageAdapter) {
  _adapter = adapter;
}

function getAdapter(): StorageAdapter {
  if (!_adapter) {
    throw new Error('[storageAdapter] not initialized');
  }
  return _adapter;
}


export const storage = {
  getTask: (taskId: string) => getAdapter().getTask(taskId),
  getMessage: (messageId: string) => getAdapter().getMessage(messageId),
  addOrUpdateTask: (task: any) => getAdapter().addOrUpdateTask(task),
  addPooling: (pooling: any) => getAdapter().addPooling(pooling),
  deletePooling: (taskId: string) => getAdapter().deletePooling(taskId),
  updateThreadPendingTasks: (threadId: string, taskId?: string) =>
    getAdapter().updateThreadPendingTasks(threadId, taskId),
};
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* 只暴露窗口控制所需的最小面；数据走本地 HTTP，不经过 IPC。 */
contextBridge.exposeInMainWorld('dgx', {
  close: () => ipcRenderer.invoke('win:close'),
  setTop: (flag) => ipcRenderer.invoke('win:set-top', flag),
  getState: () => ipcRenderer.invoke('win:get-state'),
  setFace: (id, theme) => ipcRenderer.invoke('win:set-face', id, theme),
  setTheme: (id) => ipcRenderer.invoke('win:set-theme', id),
  resizeStart: (dir) => ipcRenderer.send('win:resize-start', dir),
  resizeMove: (dx, dy) => ipcRenderer.send('win:resize-move', dx, dy),
  resizeEnd: () => ipcRenderer.send('win:resize-end'),
});

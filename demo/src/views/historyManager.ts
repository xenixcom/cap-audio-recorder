import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const HISTORY_KEY = 'audio_history';
const MAX_HISTORY = 10;

export interface HistoryRecord {
  uri: string;
  fileName: string;
  timestamp: number;
}

export class HistoryManager {
  private history: HistoryRecord[] = [];
  private maxHistorySize: number = MAX_HISTORY;

  // 載入歷史紀錄
  async loadHistory(): Promise<HistoryRecord[]> {
    const { value } = await Preferences.get({ key: HISTORY_KEY });
    return value ? JSON.parse(value) : [];
  }

  // 儲存歷史紀錄
  async saveHistory(list: HistoryRecord[]) {
    await Preferences.set({
      key: HISTORY_KEY,
      value: JSON.stringify(list),
    });
  }

  // 取得所有歷史紀錄
  public getHistory() {
    return this.history;
  }

  // 根据平台判断处理文件路径
  private getPlatformDirectory() {
    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      // Web 平台：只返回 URI
      return 'web';
    }
    return Directory.Data; // iOS 和 Android 平台都使用 Data 目录
  }

  // 移动文件（iOS 和 Android 平台）
  public async moveFile(sourceUri: string, targetName: string): Promise<string> {
    try {
      const platform = Capacitor.getPlatform();
      if (platform === 'web') {
        // 在 Web 平台，直接返回 Blob URL，不支持文件操作
        return sourceUri; 
      }

      // 解析源檔案 URI，並獲取檔名
      const sourcePath = sourceUri.replace(/^capacitor:\/\/localhost\//, ''); // 去除 URI 前綴
      const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
      const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);

      // 设置目标文件路径
      const targetDir = this.getPlatformDirectory(); // 根据平台选择目录
      const targetPath = `${targetDir}/${targetName}`;

      // 检查目标文件是否已存在
      try {
        await Filesystem.readFile({
          path: targetPath,
          directory: Directory.Data,
        });
        // 文件已存在，删除
        await Filesystem.deleteFile({
          path: targetPath,
          directory: Directory.Data,
        });
      } catch (error) {
        // 文件不存在
      }

      // 复制文件到目标路径
      await Filesystem.copy({
        from: sourcePath,
        to: targetPath,
      });

      // 删除原始文件
      await Filesystem.deleteFile({
        path: sourcePath,
        directory: sourceDir === 'web' ? Directory.External : Directory.Data, // 根据平台调整
      });

      console.log(`File moved successfully to ${targetPath}`);
      return targetPath;
    } catch (error) {
      console.error('Error moving file:', error);
      throw error;
    }
  }

  // 添加檔案紀錄
  public addHistory(uri: string, fileName: string) {
    const timestamp = Date.now();

    // 检查历史记录大小，超出上限则删除最旧的
    if (!this.history.some(record => record.uri === uri)) {
      if (this.history.length >= this.maxHistorySize) {
        this.history.sort((a, b) => a.timestamp - b.timestamp);
        this.history.shift();
      }

      this.history.push({ uri, fileName, timestamp });
      this.saveHistory(this.history); // 保存更新后的历史记录
    }
  }

  // 删除历史记录中的某一条
  public async deleteHistory(index: number) {
    const record = this.history[index];
    if (!record) return;

    try {
      // Web 平台无法删除文件，仅删除记录
      if (Capacitor.getPlatform() === 'web') {
        this.history.splice(index, 1);
        await this.saveHistory(this.history);
        console.log(`Deleted file from history: ${record.fileName}`);
        return;
      }

      // 在 iOS 和 Android 上删除文件
      await Filesystem.deleteFile({
        path: record.uri,
        directory: Directory.Data,
      });

      this.history.splice(index, 1);
      await this.saveHistory(this.history); // 保存更新后的历史记录
      console.log(`Deleted file: ${record.fileName}`);
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }

  // 下载文件
  public async downloadHistory(index: number) {
    const record = this.history[index];
    if (!record) return;

    try {
      const platform = Capacitor.getPlatform();
      const targetUri = platform === 'web' ? record.uri : `${Directory.Documents}/${record.fileName}`;

      // 在 Web 平台上，我们会创建一个下载链接
      if (platform === 'web') {
        const a = document.createElement('a');
        a.href = record.uri; // Web 上的 URI
        a.download = record.fileName; // 下载的文件名
        a.click();
        console.log(`File downloaded: ${record.fileName}`);
      } else {
        // iOS 和 Android 下载
        await Filesystem.copy({
          from: record.uri,
          to: targetUri,
        });
        console.log(`File downloaded to: ${targetUri}`);
      }
      return targetUri;
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  }
}

export const HistoryManagerInstance = new HistoryManager();

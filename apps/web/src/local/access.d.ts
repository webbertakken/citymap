// What Chromium adds for folders on the machine, beyond the DOM library: the folder dialog and read permissions.
// A script, not a module, so these merge into the global DOM types.

interface Window {
  showDirectoryPicker?: (options?: {
    readonly id?: string;
    readonly mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemHandle {
  queryPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
}

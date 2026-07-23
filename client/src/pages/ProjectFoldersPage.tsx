import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import * as filesApi from "../api/files";
import * as workspaceApi from "../api/workspace";
import { ContextMenu, type ContextMenuItem } from "../components/finder/ContextMenu";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ColumnViewIcon,
  FileIcon,
  FolderIcon,
  GearIcon,
  IconViewIcon,
  InfoIcon,
  ListViewIcon,
  NewFolderIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
} from "../components/finder/icons";
import { PreviewPane } from "../components/finder/PreviewPane";
import { useAuth } from "../context/AuthContext";
import type { FileTypeFilter, FileVersion, Folder, Project, StoredFile } from "../types";
import { formatBytes, formatDate, parseTags } from "../utils/format";

const ACCEPT_UPLOAD =
  "image/*,.pdf,video/*,.zip,.7z,.gz,.tar,.txt,.csv,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt,.ods";

const VIEW_KEY = "efs_finder_view";
type ViewMode = "icons" | "list" | "columns";

type Selection =
  | { kind: "folder"; id: string }
  | { kind: "file"; id: string }
  | null;

type DragPayload =
  | { type: "folder"; id: string }
  | { type: "file"; id: string };

interface ColumnData {
  parentId: string | null;
  folders: Folder[];
  files: StoredFile[];
  loading: boolean;
}

function readStoredView(): ViewMode {
  const raw = localStorage.getItem(VIEW_KEY);
  if (raw === "icons" || raw === "list" || raw === "columns") return raw;
  return "columns";
}

function buildFolderPath(allFolders: Folder[], folderId: string | null): Folder[] {
  if (!folderId) return [];
  const byId = new Map(allFolders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  let current = byId.get(folderId);
  while (current) {
    path.unshift(current);
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : undefined;
  }
  return path;
}

export function ProjectFoldersPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get("folder");
  const showTrash = searchParams.get("view") === "trash";

  const { accessToken, user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "member";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const columnCacheRef = useRef(new Map<string, ColumnData>());
  const allFoldersRef = useRef<Folder[]>([]);
  const projectRef = useRef<Project | null>(null);
  const requestIdRef = useRef(0);
  const readyRef = useRef(false);
  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView);
  const [selection, setSelection] = useState<Selection>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadTags, setUploadTags] = useState("");

  const [versionsFor, setVersionsFor] = useState<StoredFile | null>(null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [movingFile, setMovingFile] = useState<StoredFile | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [editingTagsFile, setEditingTagsFile] = useState<StoredFile | null>(null);
  const [tagsDraft, setTagsDraft] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [filterType, setFilterType] = useState<FileTypeFilter | "">("");
  const [filterTag, setFilterTag] = useState("");
  const [filterAfter, setFilterAfter] = useState("");
  const [filterBefore, setFilterBefore] = useState("");
  const [filterSizeMinMb, setFilterSizeMinMb] = useState("");
  const [filterSizeMaxMb, setFilterSizeMaxMb] = useState("");

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: NonNullable<Selection> | "blank";
  } | null>(null);

  const [peekFile, setPeekFile] = useState<StoredFile | null>(null);
  const [peekUrl, setPeekUrl] = useState<string | null>(null);
  const [peekLoading, setPeekLoading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const folderPath = useMemo(
    () => buildFolderPath(allFolders, folderId),
    [allFolders, folderId],
  );

  const hasActiveFilters = Boolean(
    filterType || filterTag || filterAfter || filterBefore || filterSizeMinMb || filterSizeMaxMb,
  );

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        filterType,
        filterTag,
        filterAfter,
        filterBefore,
        filterSizeMinMb,
        filterSizeMaxMb,
        showTrash,
      }),
    [
      filterType,
      filterTag,
      filterAfter,
      filterBefore,
      filterSizeMinMb,
      filterSizeMaxMb,
      showTrash,
    ],
  );

  const selectedFolder = useMemo(() => {
    if (selection?.kind !== "folder") return null;
    return (
      allFolders.find((f) => f.id === selection.id) ??
      folders.find((f) => f.id === selection.id) ??
      columns.flatMap((c) => c.folders).find((f) => f.id === selection.id) ??
      null
    );
  }, [selection, allFolders, folders, columns]);

  const selectedFile = useMemo(() => {
    if (selection?.kind !== "file") return null;
    return (
      files.find((f) => f.id === selection.id) ??
      columns.flatMap((c) => c.files).find((f) => f.id === selection.id) ??
      null
    );
  }, [selection, files, columns]);

  const itemCount = folders.length + files.length;
  const statusLabel = useMemo(() => {
    if (loading && !readyRef.current) return "Loading…";
    if (showTrash) return `${itemCount} item${itemCount === 1 ? "" : "s"} in Trash`;
    const name = currentFolder?.name ?? project?.name ?? "Root";
    return `${itemCount} item${itemCount === 1 ? "" : "s"} — ${name}`;
  }, [loading, showTrash, itemCount, currentFolder, project]);

  const pushHistory = useCallback((key: string) => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    if (hist[idx] === key) return;
    historyRef.current = hist.slice(0, idx + 1).concat(key);
    historyIndexRef.current = historyRef.current.length - 1;
    setCanGoBack(historyIndexRef.current > 0);
    setCanGoForward(false);
  }, []);

  function navigateHistory(delta: number) {
    const next = historyIndexRef.current + delta;
    if (next < 0 || next >= historyRef.current.length) return;
    historyIndexRef.current = next;
    skipHistoryRef.current = true;
    const key = historyRef.current[next];
    setCanGoBack(next > 0);
    setCanGoForward(next < historyRef.current.length - 1);
    if (key === "trash") setSearchParams({ view: "trash" });
    else if (key === "root") setSearchParams({});
    else setSearchParams({ folder: key });
  }

  const openFolder = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams);
      next.delete("view");
      if (id) next.set("folder", id);
      else next.delete("folder");
      setSearchParams(next);
      startTransition(() => setSelection(null));
    },
    [searchParams, setSearchParams],
  );

  function openTrash() {
    setSearchParams({ view: "trash" });
    startTransition(() => setSelection(null));
  }

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  }

  function cacheKey(parentId: string | null) {
    return parentId ?? "__root__";
  }

  function invalidateContentCache() {
    columnCacheRef.current.clear();
  }

  const loadColumn = useCallback(
    async (parentId: string | null, force = false): Promise<ColumnData> => {
      const key = cacheKey(parentId);
      if (!force) {
        const hit = columnCacheRef.current.get(key);
        if (hit) return hit;
      }
      if (!accessToken || !projectId) {
        return { parentId, folders: [], files: [], loading: false };
      }
      const [colFolders, colFiles] = await Promise.all([
        workspaceApi.listFolders(accessToken, projectId, parentId, false),
        filesApi.listFiles(accessToken, projectId, parentId, false),
      ]);
      const data: ColumnData = { parentId, folders: colFolders, files: colFiles, loading: false };
      columnCacheRef.current.set(key, data);
      return data;
    },
    [accessToken, projectId],
  );

  const syncLocation = useCallback(
    async (opts: { hard?: boolean; showSpinner?: boolean } = {}) => {
      if (!accessToken || !projectId) return;
      const requestId = ++requestIdRef.current;
      const hard = Boolean(opts.hard);
      const showSpinner = Boolean(opts.showSpinner);

      if (showSpinner) setLoading(true);
      else setNavigating(true);
      setError(null);

      try {
        if (hard || !projectRef.current || projectRef.current.id !== projectId) {
          const projects = await workspaceApi.listProjects(accessToken);
          if (requestId !== requestIdRef.current) return;
          const found = projects.find((item) => item.id === projectId) ?? null;
          projectRef.current = found;
          setProject(found);
          if (!found) {
            setFolders([]);
            setFiles([]);
            setCurrentFolder(null);
            setAllFolders([]);
            allFoldersRef.current = [];
            setColumns([]);
            return;
          }
        }

        let all = allFoldersRef.current;
        if (hard || all.length === 0 || all[0]?.project_id !== projectId) {
          all = await workspaceApi.listFolders(accessToken, projectId, null, false, true);
          if (requestId !== requestIdRef.current) return;
          allFoldersRef.current = all;
          setAllFolders(all);
        }

        const filters = {
          fileType: filterType || undefined,
          tag: filterTag.trim() || undefined,
          uploadedAfter: filterAfter ? new Date(filterAfter).toISOString() : undefined,
          uploadedBefore: filterBefore
            ? new Date(`${filterBefore}T23:59:59`).toISOString()
            : undefined,
          sizeMin: filterSizeMinMb ? Math.round(Number(filterSizeMinMb) * 1024 * 1024) : undefined,
          sizeMax: filterSizeMaxMb ? Math.round(Number(filterSizeMaxMb) * 1024 * 1024) : undefined,
          filterMode: hasActiveFilters,
        };

        if (showTrash) {
          setCurrentFolder(null);
          const [trashFolders, trashFiles] = await Promise.all([
            workspaceApi.listFolders(accessToken, projectId, null, true),
            filesApi.listFiles(accessToken, projectId, null, true, filters),
          ]);
          if (requestId !== requestIdRef.current) return;
          setFolders(trashFolders);
          setFiles(trashFiles);
          setColumns([]);
          pushHistory("trash");
          return;
        }

        const path = buildFolderPath(all, folderId);
        const parent = path[path.length - 1] ?? null;
        setCurrentFolder(parent);

        if (viewMode === "columns" && !hasActiveFilters) {
          const parents: (string | null)[] = [null, ...path.map((f) => f.id)];

          // Keep matching columns visible; only replace missing/stale ones.
          setColumns((prev) => {
            const next: ColumnData[] = [];
            for (let i = 0; i < parents.length; i++) {
              const parentId = parents[i];
              const existing = prev[i];
              const cached = columnCacheRef.current.get(cacheKey(parentId));
              if (!hard && existing && existing.parentId === parentId && !existing.loading) {
                next.push(existing);
              } else if (!hard && cached) {
                next.push(cached);
              } else {
                next.push({
                  parentId,
                  folders: existing?.parentId === parentId ? existing.folders : cached?.folders ?? [],
                  files: existing?.parentId === parentId ? existing.files : cached?.files ?? [],
                  loading: !(cached && !hard),
                });
              }
            }
            return next;
          });

          const loaded = await Promise.all(parents.map((id) => loadColumn(id, hard)));
          if (requestId !== requestIdRef.current) return;
          setColumns(loaded);
          const last = loaded[loaded.length - 1];
          setFolders(last?.folders ?? []);
          setFiles(last?.files ?? []);
        } else {
          if (hasActiveFilters) {
            const listedFiles = await filesApi.listFiles(
              accessToken,
              projectId,
              parent?.id ?? undefined,
              false,
              filters,
            );
            if (requestId !== requestIdRef.current) return;
            setFolders([]);
            setFiles(listedFiles);
          } else {
            const col = await loadColumn(parent?.id ?? null, hard);
            if (requestId !== requestIdRef.current) return;
            setFolders(col.folders);
            setFiles(col.files);
          }
          setColumns([]);
        }

        pushHistory(parent?.id ?? "root");
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof ApiError ? err.message : "Failed to load workspace");
      } finally {
        if (requestId === requestIdRef.current) {
          readyRef.current = true;
          setLoading(false);
          setNavigating(false);
        }
      }
    },
    [
      accessToken,
      projectId,
      folderId,
      showTrash,
      viewMode,
      hasActiveFilters,
      filterType,
      filterTag,
      filterAfter,
      filterBefore,
      filterSizeMinMb,
      filterSizeMaxMb,
      loadColumn,
      pushHistory,
    ],
  );

  const refresh = useCallback(
    async (opts: { hard?: boolean; showSpinner?: boolean } = {}) => {
      if (opts.hard !== false) invalidateContentCache();
      await syncLocation({
        hard: opts.hard !== false,
        showSpinner: opts.showSpinner ?? !readyRef.current,
      });
    },
    [syncLocation],
  );

  const prevMetaRef = useRef({ projectId: "", filterKey: "", accessToken: "" });

  useEffect(() => {
    if (!accessToken || !projectId) return;

    const prev = prevMetaRef.current;
    const projectOrAuthChanged =
      prev.projectId !== projectId || prev.accessToken !== accessToken;
    const filtersChanged = prev.filterKey !== filterKey;
    const soft = readyRef.current && !projectOrAuthChanged && !filtersChanged;

    if (projectOrAuthChanged) {
      readyRef.current = false;
      invalidateContentCache();
      allFoldersRef.current = [];
      projectRef.current = null;
    }

    prevMetaRef.current = { projectId, filterKey, accessToken };

    void syncLocation({
      hard: !soft,
      showSpinner: !readyRef.current || projectOrAuthChanged,
    });
  }, [accessToken, projectId, folderId, filterKey, viewMode, syncLocation]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openPeek = useCallback(
    async (file: StoredFile) => {
      if (!accessToken) return;
      setPeekFile(file);
      setPeekUrl(null);
      setPeekLoading(true);
      try {
        const info = await filesApi.getDownload(accessToken, file.id);
        setPeekUrl(info.download_url);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load preview");
        setPeekFile(null);
      } finally {
        setPeekLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " && selectedFile && !showTrash) {
        e.preventDefault();
        void openPeek(selectedFile);
      }
      if (e.key === "Enter" && selectedFolder && !showTrash) {
        openFolder(selectedFolder.id);
      }
      if (e.key === "Backspace" && (e.metaKey || e.altKey) && !showTrash) {
        e.preventDefault();
        if (currentFolder) openFolder(currentFolder.parent_folder_id);
        else openFolder(null);
      }
      const deleteKey = e.key === "Delete" || ((e.metaKey || e.ctrlKey) && e.key === "Backspace");
      if (deleteKey && canWrite && selection && !showTrash) {
        e.preventDefault();
        if (selection.kind === "folder") {
          const folder =
            allFolders.find((f) => f.id === selection.id) ?? folders.find((f) => f.id === selection.id);
          if (folder) void handleDeleteFolder(folder);
        } else {
          const file =
            files.find((f) => f.id === selection.id) ??
            columns.flatMap((c) => c.files).find((f) => f.id === selection.id);
          if (file) void handleDeleteFile(file);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;
    setCreating(true);
    setError(null);
    try {
      await workspaceApi.createFolder(accessToken, {
        project_id: projectId,
        name: folderName.trim(),
        parent_folder_id: folderId,
      });
      setFolderName("");
      setShowCreate(false);
      setToast("Folder created");
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(folder: Folder) {
    if (!accessToken || !canWrite || !renameValue.trim()) return;
    try {
      await workspaceApi.updateFolder(accessToken, folder.id, { name: renameValue.trim() });
      setRenamingId(null);
      setToast("Folder renamed");
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename folder");
    }
  }

  async function handleDeleteFolder(folder: Folder) {
    if (!accessToken || !canWrite) return;
    if (!window.confirm(`Move “${folder.name}” to Trash?`)) return;
    try {
      await workspaceApi.deleteFolder(accessToken, folder.id);
      setToast("Moved to Trash");
      setSelection(null);
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete folder");
    }
  }

  async function handleRestoreFolder(folder: Folder) {
    if (!accessToken || !canWrite) return;
    try {
      await workspaceApi.restoreFolder(accessToken, folder.id);
      setToast(`Restored ${folder.name}`);
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore folder");
    }
  }

  async function handleUpload(selected: FileList | File[] | null, targetFolderId: string | null = folderId) {
    if (!accessToken || !canWrite || !selected || (Array.isArray(selected) ? !selected.length : !selected.length))
      return;
    setUploading(true);
    setError(null);
    try {
      const tags = parseTags(uploadTags);
      const list = Array.from(selected);
      for (const file of list) {
        await filesApi.uploadFile(accessToken, {
          projectId,
          folderId: targetFolderId,
          file,
          tags,
        });
      }
      setToast(list.length === 1 ? "File uploaded" : `${list.length} files uploaded`);
      setUploadTags("");
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed — check S3 config");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(file: StoredFile, version?: number) {
    if (!accessToken) return;
    try {
      const info = await filesApi.getDownload(accessToken, file.id, version);
      window.open(info.download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed");
    }
  }

  async function handleDeleteFile(file: StoredFile) {
    if (!accessToken || !canWrite) return;
    if (!window.confirm(`Move “${file.filename}” to Trash?`)) return;
    try {
      await filesApi.deleteFile(accessToken, file.id);
      setToast("Moved to Trash");
      setSelection(null);
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete file");
    }
  }

  async function handleRestoreFile(file: StoredFile) {
    if (!accessToken || !canWrite) return;
    try {
      await filesApi.restoreFile(accessToken, file.id);
      setToast(`Restored ${file.filename}`);
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore file");
    }
  }

  async function moveFileTo(fileId: string, targetFolderId: string | null) {
    if (!accessToken || !canWrite) return;
    try {
      await filesApi.updateFile(accessToken, fileId, { folder_id: targetFolderId });
      setToast("File moved");
      setMovingFile(null);
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to move file");
    }
  }

  async function moveFolderTo(folderToMove: string, targetParentId: string | null) {
    if (!accessToken || !canWrite) return;
    if (folderToMove === targetParentId) return;
    try {
      await workspaceApi.updateFolder(accessToken, folderToMove, {
        parent_folder_id: targetParentId,
      });
      setToast("Folder moved");
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to move folder");
    }
  }

  async function handleMoveFile() {
    if (!movingFile) return;
    await moveFileTo(movingFile.id, moveTarget || null);
  }

  async function handleSaveTags() {
    if (!accessToken || !canWrite || !editingTagsFile) return;
    try {
      await filesApi.updateFile(accessToken, editingTagsFile.id, {
        tags: parseTags(tagsDraft),
      });
      setToast("Tags updated");
      setEditingTagsFile(null);
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update tags");
    }
  }

  async function openVersions(file: StoredFile) {
    if (!accessToken) return;
    setVersionsFor(file);
    setVersionsLoading(true);
    try {
      setVersions(await filesApi.listVersions(accessToken, file.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load versions");
      setVersionsFor(null);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestoreVersion(version: number) {
    if (!accessToken || !canWrite || !versionsFor) return;
    try {
      await filesApi.restoreVersion(accessToken, versionsFor.id, version);
      setToast(`Restored to version ${version}`);
      setVersionsFor(null);
      await refresh({ showSpinner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore version");
    }
  }

  function onDragStartItem(e: DragEvent, payload: DragPayload) {
    e.dataTransfer.setData("application/x-efs-item", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOverFolder(e: DragEvent, folderKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move";
    setDropTarget(folderKey);
  }

  async function onDropOnFolder(e: DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    setDraggingOver(false);

    if (!canWrite) return;

    if (e.dataTransfer.files?.length) {
      await handleUpload(e.dataTransfer.files, targetFolderId);
      return;
    }

    const raw = e.dataTransfer.getData("application/x-efs-item");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as DragPayload;
      if (payload.type === "file") await moveFileTo(payload.id, targetFolderId);
      if (payload.type === "folder") await moveFolderTo(payload.id, targetFolderId);
    } catch {
      /* ignore */
    }
  }

  function onBrowserDragOver(e: DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    setDraggingOver(true);
  }

  function onBrowserDragLeave(e: DragEvent) {
    if (e.currentTarget === e.target) setDraggingOver(false);
  }

  async function onBrowserDrop(e: DragEvent) {
    e.preventDefault();
    setDraggingOver(false);
    setDropTarget(null);
    if (!canWrite || showTrash) return;
    if (e.dataTransfer.files?.length) {
      await handleUpload(e.dataTransfer.files, folderId);
    }
  }

  function contextItemsFor(target: NonNullable<Selection> | "blank"): ContextMenuItem[] {
    if (showTrash) {
      if (target === "blank") return [];
      return [
        { id: "restore", label: "Put Back" },
        { id: "sep1", label: "", separator: true },
        { id: "info", label: "Get Info" },
      ];
    }
    if (target === "blank") {
      return [
        { id: "new-folder", label: "New Folder", disabled: !canWrite },
        { id: "upload", label: "Upload…", disabled: !canWrite },
        { id: "sep1", label: "", separator: true },
        { id: "refresh", label: "Refresh" },
      ];
    }
    if (target.kind === "folder") {
      return [
        { id: "open", label: "Open" },
        { id: "info", label: "Get Info" },
        { id: "sep1", label: "", separator: true },
        { id: "rename", label: "Rename", disabled: !canWrite },
        { id: "sep2", label: "", separator: true },
        { id: "trash", label: "Move to Trash", danger: true, disabled: !canWrite },
      ];
    }
    return [
      { id: "peek", label: "Quick Look" },
      { id: "download", label: "Download" },
      { id: "info", label: "Get Info" },
      { id: "versions", label: "Versions…" },
      { id: "sep1", label: "", separator: true },
      { id: "move", label: "Move to…", disabled: !canWrite },
      { id: "tags", label: "Tags…", disabled: !canWrite },
      { id: "sep2", label: "", separator: true },
      { id: "trash", label: "Move to Trash", danger: true, disabled: !canWrite },
    ];
  }

  function handleContextAction(id: string) {
    const target = contextMenu?.target;
    if (!target) return;

    if (id === "new-folder") setShowCreate(true);
    if (id === "upload") fileInputRef.current?.click();
    if (id === "refresh") void refresh({ showSpinner: false });

    if (target === "blank") return;

    if (target.kind === "folder") {
      const folder =
        folders.find((f) => f.id === target.id) ?? allFolders.find((f) => f.id === target.id);
      if (!folder) return;
      if (id === "open") openFolder(folder.id);
      if (id === "rename") {
        setRenamingId(folder.id);
        setRenameValue(folder.name);
      }
      if (id === "trash") void handleDeleteFolder(folder);
      if (id === "restore") void handleRestoreFolder(folder);
      if (id === "info") {
        setSelection(target);
        setInfoOpen(true);
      }
      return;
    }

    const file =
      files.find((f) => f.id === target.id) ??
      columns.flatMap((c) => c.files).find((f) => f.id === target.id);
    if (!file) return;
    if (id === "peek") void openPeek(file);
    if (id === "download") void handleDownload(file);
    if (id === "versions") void openVersions(file);
    if (id === "move") {
      setMovingFile(file);
      setMoveTarget(file.folder_id ?? "");
    }
    if (id === "tags") {
      setEditingTagsFile(file);
      setTagsDraft((file.tags ?? []).join(", "));
    }
    if (id === "trash") void handleDeleteFile(file);
    if (id === "restore") void handleRestoreFile(file);
    if (id === "info") {
      setSelection(target);
      setInfoOpen(true);
    }
  }

  function openContext(e: ReactMouseEvent, target: NonNullable<Selection> | "blank") {
    e.preventDefault();
    e.stopPropagation();
    if (target !== "blank") setSelection(target);
    setContextMenu({ x: e.clientX, y: e.clientY, target });
    setShowActionMenu(false);
  }

  function selectColumnFolder(columnIndex: number, folder: Folder) {
    startTransition(() => {
      setSelection({ kind: "folder", id: folder.id });
    });

    // Optimistically keep prior columns and show the selected folder immediately.
    setColumns((prev) => {
      const kept = prev.slice(0, columnIndex + 1);
      const nextParent = folder.id;
      const cached = columnCacheRef.current.get(cacheKey(nextParent));
      if (cached) return [...kept, cached];
      return [
        ...kept,
        {
          parentId: nextParent,
          folders: [],
          files: [],
          loading: true,
        },
      ];
    });
    setCurrentFolder(folder);
    setFolders((prev) => {
      const col = columnCacheRef.current.get(cacheKey(folder.id));
      return col?.folders ?? prev;
    });
    setFiles((prev) => {
      const col = columnCacheRef.current.get(cacheKey(folder.id));
      return col?.files ?? prev;
    });

    const next = new URLSearchParams();
    next.set("folder", folder.id);
    setSearchParams(next, { replace: true });
  }

  function selectColumnFile(file: StoredFile) {
    startTransition(() => {
      setSelection({ kind: "file", id: file.id });
    });
  }

  if (!loading && !project) {
    return (
      <div className="empty-state">
        <h2>Project not found</h2>
        <p>
          <Link to="/">Back to My Files</Link>
        </p>
      </div>
    );
  }

  const isEmpty = !loading && folders.length === 0 && files.length === 0;
  const effectiveView = showTrash || hasActiveFilters ? (viewMode === "columns" ? "list" : viewMode) : viewMode;

  return (
    <div
      className={`finder-browser${draggingOver ? " drop-active" : ""}`}
      onDragOver={onBrowserDragOver}
      onDragLeave={onBrowserDragLeave}
      onDrop={(e) => void onBrowserDrop(e)}
      onContextMenu={(e) => openContext(e, "blank")}
    >
      <div className="finder-toolbar">
        <div className="finder-toolbar-nav">
          <button
            type="button"
            className="finder-tool-btn"
            disabled={!canGoBack}
            aria-label="Back"
            onClick={() => navigateHistory(-1)}
          >
            <ChevronLeftIcon size={16} />
          </button>
          <button
            type="button"
            className="finder-tool-btn"
            disabled={!canGoForward}
            aria-label="Forward"
            onClick={() => navigateHistory(1)}
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>

        <div className="finder-view-switch" role="group" aria-label="View mode">
          <button
            type="button"
            className={`finder-tool-btn${viewMode === "icons" ? " active" : ""}`}
            aria-label="Icon view"
            aria-pressed={viewMode === "icons"}
            onClick={() => changeView("icons")}
          >
            <IconViewIcon size={15} />
          </button>
          <button
            type="button"
            className={`finder-tool-btn${viewMode === "list" ? " active" : ""}`}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            onClick={() => changeView("list")}
          >
            <ListViewIcon size={15} />
          </button>
          <button
            type="button"
            className={`finder-tool-btn${viewMode === "columns" ? " active" : ""}`}
            aria-label="Column view"
            aria-pressed={viewMode === "columns"}
            onClick={() => changeView("columns")}
            disabled={showTrash}
          >
            <ColumnViewIcon size={15} />
          </button>
        </div>

        <div className="finder-toolbar-actions">
          {!showTrash && canWrite && (
            <>
              <button
                type="button"
                className="finder-tool-btn"
                title="New Folder"
                aria-label="New Folder"
                onClick={() => setShowCreate(true)}
              >
                <NewFolderIcon size={16} />
              </button>
              <button
                type="button"
                className="finder-tool-btn"
                title="Upload"
                aria-label="Upload"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                multiple
                accept={ACCEPT_UPLOAD}
                onChange={(e) => void handleUpload(e.target.files)}
              />
            </>
          )}
          {selectedFile && !showTrash && (
            <button
              type="button"
              className="finder-tool-btn"
              title="Quick Look"
              aria-label="Quick Look"
              onClick={() => void openPeek(selectedFile)}
            >
              <InfoIcon size={16} />
            </button>
          )}
          <button
            type="button"
            className={`finder-tool-btn${showFilters ? " active" : ""}`}
            title="Filters"
            aria-label="Filters"
            onClick={() => setShowFilters((v) => !v)}
          >
            <TagIcon size={15} />
          </button>
          {!showTrash ? (
            <button
              type="button"
              className="finder-tool-btn"
              title="Trash"
              aria-label="Trash"
              onClick={openTrash}
            >
              <TrashIcon size={15} />
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => openFolder(null)}>
              Back
            </button>
          )}
          <div className="finder-action-wrap">
            <button
              type="button"
              className={`finder-tool-btn${showActionMenu ? " active" : ""}`}
              title="Actions"
              aria-label="Actions"
              aria-expanded={showActionMenu}
              onClick={() => setShowActionMenu((v) => !v)}
            >
              <GearIcon size={15} />
            </button>
            {showActionMenu && (
              <div className="finder-action-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setShowCreate(true); setShowActionMenu(false); }} disabled={!canWrite || showTrash}>
                  New Folder
                </button>
                <button type="button" role="menuitem" onClick={() => { fileInputRef.current?.click(); setShowActionMenu(false); }} disabled={!canWrite || showTrash}>
                  Upload…
                </button>
                <button type="button" role="menuitem" onClick={() => { setShowFilters(true); setShowActionMenu(false); }}>
                  Show Filters
                </button>
                <div className="finder-context-sep" />
                <button type="button" role="menuitem" onClick={() => { void refresh({ showSpinner: false }); setShowActionMenu(false); }}>
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="finder-toolbar-title">
          {showTrash ? "Trash" : currentFolder?.name ?? project?.name ?? "…"}
        </div>
      </div>

      {(error || toast) && (
        <div className={`finder-banner${error ? " error" : ""}`}>
          {error ?? toast}
          {error && (
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => setError(null)}>
              Dismiss
            </button>
          )}
        </div>
      )}

      {canWrite && !showTrash && (
        <div className="finder-upload-tags">
          <label htmlFor="upload-tags">Upload tags</label>
          <input
            id="upload-tags"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
            placeholder="finance, q3"
          />
        </div>
      )}

      {showFilters && !showTrash && (
        <section className="finder-filters">
          <div className="field-row">
            <div className="field">
              <label htmlFor="filter-type">Type</label>
              <select
                id="filter-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FileTypeFilter | "")}
              >
                <option value="">Any</option>
                <option value="image">Image</option>
                <option value="pdf">PDF</option>
                <option value="video">Video</option>
                <option value="zip">ZIP / archive</option>
                <option value="document">Document</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-tag">Tag</label>
              <input id="filter-tag" value={filterTag} onChange={(e) => setFilterTag(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="filter-after">After</label>
              <input id="filter-after" type="date" value={filterAfter} onChange={(e) => setFilterAfter(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="filter-before">Before</label>
              <input id="filter-before" type="date" value={filterBefore} onChange={(e) => setFilterBefore(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="filter-size-min">Min MB</label>
              <input id="filter-size-min" type="number" min="0" step="0.1" value={filterSizeMinMb} onChange={(e) => setFilterSizeMinMb(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="filter-size-max">Max MB</label>
              <input id="filter-size-max" type="number" min="0" step="0.1" value={filterSizeMaxMb} onChange={(e) => setFilterSizeMaxMb(e.target.value)} />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => {
                setFilterType("");
                setFilterTag("");
                setFilterAfter("");
                setFilterBefore("");
                setFilterSizeMinMb("");
                setFilterSizeMaxMb("");
              }}
            >
              Clear filters
            </button>
          )}
        </section>
      )}

      {draggingOver && canWrite && !showTrash && (
        <div className="finder-drop-overlay" aria-hidden>
          Drop to upload into {currentFolder?.name ?? "this folder"}
        </div>
      )}

      <div className="finder-content">
        {loading && columns.length === 0 && folders.length === 0 && files.length === 0 ? (
          <div className="empty-state">
            <p>Loading…</p>
          </div>
        ) : effectiveView === "columns" ? (
          <div className="finder-columns">
            {columns.map((col, colIndex) => {
              const selectedInCol =
                colIndex < folderPath.length ? folderPath[colIndex]?.id : selection?.kind === "folder" ? selection.id : null;
              const selectedFileInCol =
                colIndex === folderPath.length && selection?.kind === "file" ? selection.id : null;
              return (
                <div
                  key={col.parentId ?? "root"}
                  className="finder-column"
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOverFolder(e, col.parentId ?? "root");
                  }}
                  onDrop={(e) => void onDropOnFolder(e, col.parentId)}
                  onClick={() => {
                    if (col.parentId) openFolder(col.parentId);
                    else openFolder(null);
                    setSelection(null);
                  }}
                >
                  {col.folders.map((folder) => (
                    <div
                      key={folder.id}
                      className={`finder-col-row${selectedInCol === folder.id ? " selected" : ""}${dropTarget === folder.id ? " drop-target" : ""}`}
                      draggable={canWrite}
                      onDragStart={(e) => onDragStartItem(e, { type: "folder", id: folder.id })}
                      onDragOver={(e) => {
                        e.stopPropagation();
                        onDragOverFolder(e, folder.id);
                      }}
                      onDrop={(e) => void onDropOnFolder(e, folder.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectColumnFolder(colIndex, folder);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        openFolder(folder.id);
                      }}
                      onContextMenu={(e) => openContext(e, { kind: "folder", id: folder.id })}
                    >
                      {renamingId === folder.id ? (
                        <input
                          className="inline-input"
                          value={renameValue}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void handleRename(folder)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(folder);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                        />
                      ) : (
                        <>
                          <FolderIcon size={16} className="finder-row-icon folder" />
                          <span className="finder-row-name">{folder.name}</span>
                          <ChevronRightIcon size={14} className="finder-row-chevron" />
                        </>
                      )}
                    </div>
                  ))}
                  {col.files.map((file) => (
                    <div
                      key={file.id}
                      className={`finder-col-row${selectedFileInCol === file.id ? " selected" : ""}`}
                      draggable={canWrite}
                      onDragStart={(e) => onDragStartItem(e, { type: "file", id: file.id })}
                  onClick={(e) => {
                    e.stopPropagation();
                    startTransition(() => selectColumnFile(file));
                  }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        void openPeek(file);
                      }}
                      onContextMenu={(e) => openContext(e, { kind: "file", id: file.id })}
                    >
                      <FileIcon size={16} className="finder-row-icon file" />
                      <span className="finder-row-name">{file.filename}</span>
                    </div>
                  ))}
                  {!col.folders.length && !col.files.length && (
                    <div className="finder-col-empty">{col.loading ? "Loading…" : "Empty"}</div>
                  )}
                </div>
              );
            })}
            {selection?.kind === "file" && selectedFile && (
              <div className="finder-column finder-preview-col">
                <div className="finder-inline-preview">
                  <FileIcon size={48} className="finder-preview-icon" />
                  <strong>{selectedFile.filename}</strong>
                  <span>{formatBytes(selectedFile.size)}</span>
                  <span>Version {selectedFile.current_version}</span>
                  <span>{formatDate(selectedFile.updated_at)}</span>
                  {selectedFile.tags?.length > 0 && (
                    <div className="tag-list">
                      {selectedFile.tags.map((tag) => (
                        <span key={tag} className="tag-chip">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="finder-preview-actions">
                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => void openPeek(selectedFile)}>
                      Quick Look
                    </button>
                    <button type="button" className="btn btn-primary btn-compact" onClick={() => void handleDownload(selectedFile)}>
                      Download
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : isEmpty ? (
          <div className="empty-state">
            <FolderIcon size={40} className="empty-state-icon" />
            <h2>{showTrash ? "Trash is empty" : "This folder is empty"}</h2>
            <p>
              {showTrash
                ? "Deleted items will show up here."
                : canWrite
                  ? "Drop files here, or use Upload / New Folder."
                  : "Nothing here yet."}
            </p>
          </div>
        ) : effectiveView === "icons" ? (
          <div className="finder-icons">
            {!hasActiveFilters &&
              folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={`finder-icon-item${selection?.kind === "folder" && selection.id === folder.id ? " selected" : ""}${dropTarget === folder.id ? " drop-target" : ""}`}
                  draggable={canWrite && !showTrash}
                  onDragStart={(e) => onDragStartItem(e, { type: "folder", id: folder.id })}
                  onDragOver={(e) => onDragOverFolder(e, folder.id)}
                  onDrop={(e) => void onDropOnFolder(e, folder.id)}
                  onClick={() => startTransition(() => setSelection({ kind: "folder", id: folder.id }))}
                  onDoubleClick={() => !showTrash && openFolder(folder.id)}
                  onContextMenu={(e) => openContext(e, { kind: "folder", id: folder.id })}
                >
                  <FolderIcon size={48} className="finder-icon-glyph folder" />
                  {renamingId === folder.id ? (
                    <input
                      className="inline-input"
                      value={renameValue}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void handleRename(folder)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRename(folder);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span>{folder.name}</span>
                  )}
                </button>
              ))}
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`finder-icon-item${selection?.kind === "file" && selection.id === file.id ? " selected" : ""}`}
                draggable={canWrite && !showTrash}
                onDragStart={(e) => onDragStartItem(e, { type: "file", id: file.id })}
                  onClick={() => startTransition(() => setSelection({ kind: "file", id: file.id }))}
                onDoubleClick={() => (showTrash ? undefined : void openPeek(file))}
                onContextMenu={(e) => openContext(e, { kind: "file", id: file.id })}
              >
                <FileIcon size={48} className="finder-icon-glyph file" />
                <span>{file.filename}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="finder-list">
            <div className="finder-list-head">
              <span>Name</span>
              <span>Date Modified</span>
              <span>Size</span>
              <span>Kind</span>
            </div>
            {!hasActiveFilters &&
              folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`finder-list-row${selection?.kind === "folder" && selection.id === folder.id ? " selected" : ""}${dropTarget === folder.id ? " drop-target" : ""}`}
                  draggable={canWrite && !showTrash}
                  onDragStart={(e) => onDragStartItem(e, { type: "folder", id: folder.id })}
                  onDragOver={(e) => onDragOverFolder(e, folder.id)}
                  onDrop={(e) => void onDropOnFolder(e, folder.id)}
                  onClick={() => startTransition(() => setSelection({ kind: "folder", id: folder.id }))}
                  onDoubleClick={() => !showTrash && openFolder(folder.id)}
                  onContextMenu={(e) => openContext(e, { kind: "folder", id: folder.id })}
                >
                  <span className="finder-list-name">
                    <FolderIcon size={16} className="finder-row-icon folder" />
                    {renamingId === folder.id ? (
                      <input
                        className="inline-input"
                        value={renameValue}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void handleRename(folder)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(folder);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      folder.name
                    )}
                  </span>
                  <span>{formatDate(folder.updated_at)}</span>
                  <span>—</span>
                  <span>Folder</span>
                </div>
              ))}
            {files.map((file) => (
              <div
                key={file.id}
                className={`finder-list-row${selection?.kind === "file" && selection.id === file.id ? " selected" : ""}`}
                draggable={canWrite && !showTrash}
                onDragStart={(e) => onDragStartItem(e, { type: "file", id: file.id })}
                  onClick={() => startTransition(() => setSelection({ kind: "file", id: file.id }))}
                onDoubleClick={() => (showTrash ? undefined : void openPeek(file))}
                onContextMenu={(e) => openContext(e, { kind: "file", id: file.id })}
              >
                <span className="finder-list-name">
                  <FileIcon size={16} className="finder-row-icon file" />
                  {file.filename}
                </span>
                <span>{formatDate(file.updated_at)}</span>
                <span>{formatBytes(file.size)}</span>
                <span>{file.extension ? file.extension.toUpperCase() : file.mime_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="finder-pathbar">
        <button type="button" className="finder-path-seg" onClick={() => openFolder(null)} disabled={showTrash}>
          <FolderIcon size={13} className="side-folder-icon" />
          {project?.name ?? "Project"}
        </button>
        {showTrash ? (
          <span className="finder-path-seg current">Trash</span>
        ) : (
          folderPath.map((folder, i) => (
            <button
              key={folder.id}
              type="button"
              className={`finder-path-seg${i === folderPath.length - 1 ? " current" : ""}`}
              onClick={() => openFolder(folder.id)}
            >
              <FolderIcon size={13} className="side-folder-icon" />
              {folder.name}
            </button>
          ))
        )}
      </div>

      <div className="finder-statusbar">
        <span>{statusLabel}</span>
        {navigating && <span className="finder-status-sel">Updating…</span>}
        {selectedFile && <span className="finder-status-sel">{selectedFile.filename}</span>}
        {selectedFolder && <span className="finder-status-sel">{selectedFolder.name}</span>}
        {uploading && <span>Uploading…</span>}
      </div>

      {infoOpen && (selectedFile || selectedFolder) && (
        <div className="modal-backdrop" role="presentation" onClick={() => setInfoOpen(false)}>
          <div className="modal-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Get Info</h2>
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => setInfoOpen(false)}>
                Close
              </button>
            </div>
            {selectedFolder && (
              <dl className="info-grid">
                <dt>Name</dt>
                <dd>{selectedFolder.name}</dd>
                <dt>Kind</dt>
                <dd>Folder</dd>
                <dt>Path</dt>
                <dd>{selectedFolder.path}</dd>
                <dt>Created</dt>
                <dd>{formatDate(selectedFolder.created_at)}</dd>
                <dt>Modified</dt>
                <dd>{formatDate(selectedFolder.updated_at)}</dd>
              </dl>
            )}
            {selectedFile && (
              <dl className="info-grid">
                <dt>Name</dt>
                <dd>{selectedFile.filename}</dd>
                <dt>Kind</dt>
                <dd>{selectedFile.mime_type}</dd>
                <dt>Size</dt>
                <dd>{formatBytes(selectedFile.size)}</dd>
                <dt>Version</dt>
                <dd>{selectedFile.current_version}</dd>
                <dt>Tags</dt>
                <dd>{selectedFile.tags?.length ? selectedFile.tags.join(", ") : "—"}</dd>
                <dt>Created</dt>
                <dd>{formatDate(selectedFile.created_at)}</dd>
                <dt>Modified</dt>
                <dd>{formatDate(selectedFile.updated_at)}</dd>
              </dl>
            )}
          </div>
        </div>
      )}

      {showCreate && canWrite && !showTrash && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowCreate(false)}>
          <div className="modal-panel modal-panel-sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Folder</h2>
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => setShowCreate(false)}>
                Close
              </button>
            </div>
            <form className="form-stack" onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="folder-name">Name</label>
                <input
                  id="folder-name"
                  required
                  autoFocus
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Untitled Folder"
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          </div>
        </div>
      )}

      {versionsFor && (
        <div className="modal-backdrop" role="presentation" onClick={() => setVersionsFor(null)}>
          <div className="modal-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Versions — {versionsFor.filename}</h2>
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => setVersionsFor(null)}>
                Close
              </button>
            </div>
            {versionsLoading ? (
              <p className="subtitle">Loading…</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Size</th>
                      <th>Uploaded</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((version) => (
                      <tr key={version.id}>
                        <td>
                          v{version.version}
                          {version.version === versionsFor.current_version ? " (current)" : ""}
                        </td>
                        <td>{formatBytes(version.size)}</td>
                        <td>{formatDate(version.created_at)}</td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="btn btn-secondary btn-compact" onClick={() => void handleDownload(versionsFor, version.version)}>
                              Download
                            </button>
                            {canWrite && version.version !== versionsFor.current_version && (
                              <button type="button" className="btn btn-primary btn-compact" onClick={() => void handleRestoreVersion(version.version)}>
                                Make current
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {movingFile && (
        <div className="modal-backdrop" role="presentation" onClick={() => setMovingFile(null)}>
          <div className="modal-panel modal-panel-sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Move — {movingFile.filename}</h2>
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => setMovingFile(null)}>
                Close
              </button>
            </div>
            <div className="form-stack">
              <div className="field">
                <label htmlFor="move-folder">Destination</label>
                <select id="move-folder" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                  <option value="">Project root</option>
                  {allFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.path}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void handleMoveFile()}>
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTagsFile && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditingTagsFile(null)}>
          <div className="modal-panel modal-panel-sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Tags — {editingTagsFile.filename}</h2>
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => setEditingTagsFile(null)}>
                Close
              </button>
            </div>
            <div className="form-stack">
              <div className="field">
                <label htmlFor="edit-tags">Comma-separated tags</label>
                <input
                  id="edit-tags"
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  placeholder="finance, q3"
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void handleSaveTags()}>
                Save tags
              </button>
            </div>
          </div>
        </div>
      )}

      {peekFile && (
        <PreviewPane
          file={peekFile}
          downloadUrl={peekUrl}
          loading={peekLoading}
          onClose={() => {
            setPeekFile(null);
            setPeekUrl(null);
          }}
          onDownload={() => void handleDownload(peekFile)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItemsFor(contextMenu.target)}
          onClose={() => setContextMenu(null)}
          onSelect={handleContextAction}
        />
      )}
    </div>
  );
}

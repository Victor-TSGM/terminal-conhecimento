import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { db, auth } from './firebase';
import { collection, onSnapshot, setDoc, deleteDoc, doc, query, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

// --- Firebase Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'al3m40-terminal';

// ASCII Art Logo
const ASCII_LOGO = `
    _    _     _____ __  __ _  _    ___  
   / \\  | |   |___ /|  \\/  | || |  / _ \\ 
  / _ \\ | |     |_ \\| |\\/| | || |_| | | |
 / ___ \\| |___ ___) | |  | |__   _| |_| |
/_/   \\_\\_____|____/|_|  |_|  |_|  \\___/ 
`;

export default function Al3m40Terminal() {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // Auth Form State
    const [isRegistering, setIsRegistering] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    // File System State
    const [items, setItems] = useState([]);
    const [activeItem, setActiveItem] = useState(null);
    const [loadingNodes, setLoadingNodes] = useState(true);
    const [initializedDefault, setInitializedDefault] = useState(false);

    // Command Palette / Global Search State (Item 4)
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    const [paletteQuery, setPaletteQuery] = useState('');
    const paletteInputRef = useRef(null);

    // UI State for Folders
    const [collapsedFolders, setCollapsedFolders] = useState({});

    // Sidebar Resizing State
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [isResizing, setIsResizing] = useState(false);

    // Editor UI State
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [linkError, setLinkError] = useState('');
    const textareaRef = useRef(null);

    // File Import Reference (Item 6)
    const fileInputRef = useRef(null);

    // Prompt UI
    const [showPrompt, setShowPrompt] = useState(false);
    const [promptType, setPromptType] = useState(''); // 'folder' or 'file'
    const [promptInput, setPromptInput] = useState('');
    const [promptParentId, setPromptParentId] = useState(null);
    const promptInputRef = useRef(null);

    // --- Dynamic JSZip Loader (Item 6) ---
    const loadJSZip = () => {
        return new Promise((resolve, reject) => {
            if (window.JSZip) return resolve(window.JSZip);
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve(window.JSZip);
            script.onerror = () => reject(new Error('Falha ao carregar JSZip'));
            document.head.appendChild(script);
        });
    };

    // --- Hotkeys Handler (Item 7) ---
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            // Ctrl + K: Command Palette
            if (isCtrl && key === 'k') {
                e.preventDefault();
                setIsPaletteOpen(prev => !prev);
                setPaletteQuery('');
            }

            // Ctrl + S: Salvar nota ativa
            if (isCtrl && key === 's') {
                e.preventDefault();
                if (isEditing && activeItem) {
                    saveCurrentEdit();
                }
            }

            // Ctrl + E: Alternar Edição/Visualização
            if (isCtrl && key === 'e') {
                e.preventDefault();
                if (activeItem && activeItem.type === 'file') {
                    setIsEditing(prev => !prev);
                }
            }

            // Esc: Fechar Modais / Cancelar
            if (e.key === 'Escape') {
                if (isPaletteOpen) setIsPaletteOpen(false);
                if (showPrompt) setShowPrompt(false);
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isPaletteOpen, showPrompt, isEditing, activeItem, editContent, editTitle]);

    // Focus input da Palette ao abrir
    useEffect(() => {
        if (isPaletteOpen && paletteInputRef.current) {
            paletteInputRef.current.focus();
        }
    }, [isPaletteOpen]);

    // Handler de Redimensionamento da Sidebar
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = e.clientX;
            if (newWidth >= 180 && newWidth <= 600) {
                setSidebarWidth(newWidth);
            }
        };

        const handleMouseUp = () => setIsResizing(false);

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    // Listener de Autenticação Real
    useEffect(() => {
        if (!auth) {
            setAuthLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
            if (!currentUser) {
                setInitializedDefault(false);
                setLoadingNodes(true);
            }
        });

        return () => unsubscribe();
    }, []);

    // Listener de Nodes do Firestore
    useEffect(() => {
        if (!user || !db) return;

        setLoadingNodes(true);
        const nodesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'nodes');
        const q = query(nodesRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setItems(fetchedItems);
            setLoadingNodes(false);
        }, (error) => {
            console.error("Error fetching nodes:", error);
            setLoadingNodes(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Criar arquivo home.md padrão se zerado
    useEffect(() => {
        if (loadingNodes || !user || !db || initializedDefault) return;

        const existingHomeFiles = items.filter(item => item.type === 'file' && item.name.toLowerCase() === 'home.md');

        if (existingHomeFiles.length > 0) {
            if (!activeItem) {
                setActiveItem(existingHomeFiles[0]);
                setEditContent(existingHomeFiles[0].content || '');
                setEditTitle(existingHomeFiles[0].name);
            }
            setInitializedDefault(true);
        } else if (items.length === 0) {
            setInitializedDefault(true);
            const createHomeFile = async () => {
                const defaultNode = {
                    name: 'home.md',
                    type: 'file',
                    parentId: null,
                    content: `# Bem-vindo ao Al3m40 Terminal 🚀\n\n### Atalhos Rápidos:\n- \`Ctrl + K\` : Busca Global (Command Palette)\n- \`Ctrl + S\` : Salvar Nota\n- \`Ctrl + E\` : Alternar Modo de Edição\n\nCole imagens com \`Ctrl + V\` diretamente no editor!`,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                try {
                    const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'nodes'));
                    await setDoc(newDocRef, defaultNode);
                    setActiveItem({ id: newDocRef.id, ...defaultNode });
                    setEditContent(defaultNode.content);
                    setEditTitle(defaultNode.name);
                } catch (err) {
                    console.error("Erro ao criar home.md:", err);
                }
            };
            createHomeFile();
        }
    }, [loadingNodes, items, user, initializedDefault, activeItem]);

    // Auth Submission
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');
        if (!emailInput || !passwordInput) {
            setAuthError('Preencha todos os campos.');
            return;
        }

        try {
            if (isRegistering) {
                await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
            } else {
                await signInWithEmailAndPassword(auth, emailInput, passwordInput);
            }
        } catch (error) {
            console.error("Erro de Auth:", error);
            setAuthError('Erro de autenticação: ' + error.message);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setActiveItem(null);
            setItems([]);
            setInitializedDefault(false);
            setLoadingNodes(true);
        } catch (error) {
            console.error("Erro ao sair:", error);
        }
    };

    // Colagem de imagens (Base64 local sem Storage)
    const handlePaste = (e) => {
        const itemsList = e.clipboardData.items;
        for (let i = 0; i < itemsList.length; i++) {
            if (itemsList[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = itemsList[i].getAsFile();
                const reader = new FileReader();

                reader.onload = (event) => {
                    const base64Image = event.target.result;
                    const imageMarkdown = `\n![Imagem colada](${base64Image})\n`;

                    const textarea = textareaRef.current;
                    if (!textarea) return;

                    const startPos = textarea.selectionStart;
                    const endPos = textarea.selectionEnd;
                    const newText = editContent.substring(0, startPos) + imageMarkdown + editContent.substring(endPos);

                    setEditContent(newText);

                    setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(startPos + imageMarkdown.length, startPos + imageMarkdown.length);
                    }, 0);
                };

                reader.readAsDataURL(blob);
                break;
            }
        }
    };

    const handleCreateNode = async (type, name, parentId = null) => {
        if (!user || !db || !name.trim()) return;

        const newNode = {
            name: name.trim(),
            type: type,
            parentId: parentId,
            content: type === 'file' ? '# Novo Artigo\n\nComece a digitar aqui...' : '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        try {
            const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'nodes'));
            await setDoc(newDocRef, newNode);

            if (type === 'file') {
                setActiveItem({ id: newDocRef.id, ...newNode });
                setEditContent(newNode.content);
                setEditTitle(newNode.name);
                setIsEditing(false);
            } else {
                setCollapsedFolders(prev => ({ ...prev, [newDocRef.id]: false }));
            }
        } catch (error) {
            console.error("Error creating node:", error);
        }
    };

    const handleUpdateNode = async (id, updates) => {
        if (!user || !db) return;
        try {
            const nodeRef = doc(db, 'artifacts', appId, 'users', user.uid, 'nodes', id);
            await setDoc(nodeRef, { ...updates, updatedAt: serverTimestamp() }, { merge: true });
        } catch (error) {
            console.error("Error updating node:", error);
        }
    };

    const handleDeleteNode = async (id, isFolder, itemName, parentId) => {
        if (!user || !db) return;

        const homeFilesCount = items.filter(item => item.type === 'file' && item.name.toLowerCase() === 'home.md').length;

        if (parentId === null && itemName && itemName.toLowerCase() === 'home.md' && homeFilesCount <= 1) {
            alert("O arquivo home.md principal é protegido e não pode ser excluído.");
            return;
        }

        const confirmMessage = isFolder
            ? "Deseja realmente excluir esta pasta e seu conteúdo associado?"
            : `Deseja realmente excluir "${itemName}"?`;

        if (!window.confirm(confirmMessage)) return;

        try {
            const nodeRef = doc(db, 'artifacts', appId, 'users', user.uid, 'nodes', id);
            await deleteDoc(nodeRef);

            if (activeItem && activeItem.id === id) {
                setActiveItem(null);
                setIsEditing(false);
            }
        } catch (error) {
            console.error("Error deleting node:", error);
        }
    };

    // --- Exportar & Importar em ZIP (Item 6) ---
    const getItemPath = (itemId) => {
        const itemMap = new Map(items.map(i => [i.id, i]));
        const parts = [];
        let current = itemMap.get(itemId);
        while (current) {
            parts.unshift(current.name);
            current = current.parentId ? itemMap.get(current.parentId) : null;
        }
        return parts.join('/');
    };

    const handleExportZIP = async () => {
        try {
            const JSZip = await loadJSZip();
            const zip = new JSZip();

            items.forEach(item => {
                const path = getItemPath(item.id);
                if (item.type === 'folder') {
                    zip.folder(path);
                } else {
                    zip.file(path, item.content || '');
                }
            });

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `al3m40_terminal_backup_${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Erro ao exportar ZIP:", err);
            alert("Erro ao gerar arquivo ZIP de backup.");
        }
    };

    const handleImportFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user || !db) return;

        try {
            if (file.name.endsWith('.zip')) {
                const JSZip = await loadJSZip();
                const zip = await JSZip.loadAsync(file);
                const pathIdMap = new Map();

                const entries = Object.keys(zip.files).sort((a, b) => a.split('/').length - b.split('/').length);

                for (const relativePath of entries) {
                    const zipEntry = zip.files[relativePath];
                    const cleanPath = relativePath.replace(/\/$/, '');
                    if (!cleanPath) continue;

                    const parts = cleanPath.split('/');
                    const name = parts[parts.length - 1];
                    const parentPath = parts.slice(0, -1).join('/');
                    const parentId = parentPath ? pathIdMap.get(parentPath) || null : null;

                    if (zipEntry.dir) {
                        const newNode = {
                            name: name,
                            type: 'folder',
                            parentId: parentId,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        };
                        const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'nodes'));
                        await setDoc(newDocRef, newNode);
                        pathIdMap.set(cleanPath, newDocRef.id);
                    } else {
                        const content = await zipEntry.async('string');
                        const newNode = {
                            name: name,
                            type: 'file',
                            parentId: parentId,
                            content: content,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        };
                        const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'nodes'));
                        await setDoc(newDocRef, newNode);
                        pathIdMap.set(cleanPath, newDocRef.id);
                    }
                }
                alert('Importação do arquivo ZIP concluída com sucesso!');
            } else if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
                const text = await file.text();
                const newNode = {
                    name: file.name,
                    type: 'file',
                    parentId: activeItem?.type === 'folder' ? activeItem.id : null,
                    content: text,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'nodes'));
                await setDoc(newDocRef, newNode);
                alert(`Arquivo ${file.name} importado!`);
            }
        } catch (err) {
            console.error("Erro ao importar arquivo:", err);
            alert("Erro durante a importação do arquivo.");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const toggleFolder = (folderId, e) => {
        if (e) e.stopPropagation();
        setCollapsedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    const saveCurrentEdit = () => {
        if (activeItem) {
            const finalTitle = (activeItem.parentId === null && activeItem.name.toLowerCase() === 'home.md') ? 'home.md' : editTitle;
            handleUpdateNode(activeItem.id, { name: finalTitle, content: editContent });
            setActiveItem({ ...activeItem, name: finalTitle, content: editContent });
            setIsEditing(false);
        }
    };

    const openPrompt = (type, parentId = null) => {
        setPromptType(type);
        setPromptParentId(parentId);
        setPromptInput('');
        setShowPrompt(true);
        setTimeout(() => { if (promptInputRef.current) promptInputRef.current.focus(); }, 50);
    };

    const handlePromptSubmit = (e) => {
        e.preventDefault();
        if (promptInput.trim()) {
            handleCreateNode(promptType, promptInput, promptParentId);
        }
        setShowPrompt(false);
    };

    // Command Palette Filter
    const filteredPaletteItems = items.filter(item => {
        if (!paletteQuery.trim()) return true;
        const q = paletteQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || (item.type === 'file' && item.content?.toLowerCase().includes(q));
    });

    const renderTree = (parentId = null, depth = 0) => {
        const children = items.filter(item => item.parentId === parentId);

        children.sort((a, b) => {
            if (parentId === null) {
                if (a.name.toLowerCase() === 'home.md') return -1;
                if (b.name.toLowerCase() === 'home.md') return 1;
            }
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });

        return children.map(item => {
            const isCollapsed = collapsedFolders[item.id] || false;

            return (
                <div key={item.id} className="w-full group">
                    <div
                        className={`
                        flex items-center justify-between py-1 px-2 cursor-pointer
                        hover:bg-blue-900/30 hover:text-blue-300 transition-colors
                        ${activeItem?.id === item.id ? 'bg-blue-900/50 text-blue-300 border-l-2 border-blue-500' : 'text-gray-400'}
                    `}
                        style={{ paddingLeft: `${depth * 16 + 8}px` }}
                        onClick={() => {
                            if (item.type === 'file') {
                                setActiveItem(item);
                                setEditContent(item.content);
                                setEditTitle(item.name);
                                setIsEditing(false);
                                setLinkError('');
                            } else {
                                setActiveItem(item);
                                toggleFolder(item.id);
                            }
                        }}
                    >
                        <div className="flex items-center gap-1.5 flex-grow overflow-hidden pr-2">
                            {item.type === 'folder' ? (
                                <>
                                    <span onClick={(e) => toggleFolder(item.id, e)} className="text-gray-500 hover:text-cyan-300 font-mono text-[10px] w-4 text-center shrink-0 select-none">
                                        {isCollapsed ? '▶' : '▼'}
                                    </span>
                                    <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 01-2 2z"></path></svg>
                                </>
                            ) : (
                                <svg className="w-4 h-4 text-cyan-400 shrink-0 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            )}
                            <span className="truncate font-mono text-sm">{item.name}</span>
                        </div>

                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity items-center shrink-0">
                            {item.type === 'folder' && (
                                <>
                                    <button onClick={(e) => { e.stopPropagation(); openPrompt('folder', item.id); }} className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 p-1 rounded transition-colors" title="Nova Subpasta">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); openPrompt('file', item.id); }} className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 p-1 rounded transition-colors" title="Novo Artigo Aqui">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                    </button>
                                </>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteNode(item.id, item.type === 'folder', item.name, item.parentId); }} className="text-red-400 hover:text-red-300 hover:bg-red-900/30 p-1 rounded transition-colors" title={`Excluir ${item.name}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>

                    {item.type === 'folder' && !isCollapsed && renderTree(item.id, depth + 1)}
                </div>
            );
        });
    };

    if (authLoading) return <div className="min-h-screen bg-black text-cyan-500 flex items-center justify-center font-mono">Iniciando sistema...</div>;

    if (!user) {
        return (
            <div className="min-h-screen bg-black text-cyan-500 flex flex-col items-center justify-center font-mono p-4">
                <pre className="text-cyan-400 font-bold leading-none text-[8px] sm:text-[10px] md:text-xs text-center mb-6 animate-pulse">{ASCII_LOGO}</pre>
                <div className="w-full max-w-md bg-gray-950 border border-purple-900/50 p-6 rounded-lg">
                    <h2 className="text-purple-400 text-sm font-bold mb-4 uppercase text-center">{isRegistering ? 'root@al3m40:~# signup' : 'root@al3m40:~# login'}</h2>
                    {authError && <div className="bg-red-950/80 border border-red-800 text-red-300 p-2 text-xs mb-4 rounded text-center">{authError}</div>}
                    <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                        <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} className="bg-black text-cyan-300 border border-cyan-900/60 rounded px-3 py-2 text-sm font-mono" placeholder="seu@email.com" required />
                        <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="bg-black text-cyan-300 border border-cyan-900/60 rounded px-3 py-2 text-sm font-mono" placeholder="******" required />
                        <button type="submit" className="bg-purple-900/50 hover:bg-purple-800 text-purple-200 py-2 rounded border border-purple-700/50 text-xs uppercase font-bold">{isRegistering ? '[ Criar Conta ]' : '[ Entrar no Terminal ]'}</button>
                    </form>
                    <div className="mt-4 text-center">
                        <button onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }} className="text-xs text-gray-500 hover:text-cyan-400 underline">{isRegistering ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-gray-300 font-mono flex flex-col overflow-hidden">
            <style dangerouslySetInnerHTML={{
                __html: `
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: #0a0a0a; border-left: 1px solid #1a1a1a; }
            ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #4a5568; }
            .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #c084fc; margin-top: 1em; margin-bottom: 0.5em; }
            .markdown-body h1 { font-size: 2em; border-bottom: 1px solid #3b0764; padding-bottom: 0.2em; }
            .markdown-body p { margin-bottom: 1em; line-height: 1.6; }
            .markdown-body a { color: #22d3ee; text-decoration: underline; cursor: pointer; }
            .markdown-body code { background: #171717; padding: 0.2em 0.4em; border-radius: 3px; color: #f472b6; font-family: monospace; }
            .markdown-body pre { background: #0a0a0a; padding: 1em; border-radius: 6px; overflow-x: auto; border: 1px solid #1f2937; margin-bottom: 1em; }
            .markdown-body ul, .markdown-body ol { margin-left: 2em; margin-bottom: 1em; }
            .markdown-body img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #1f2937; margin: 1em 0; }
        `}} />

            {/* Input oculto de arquivo (Item 6) */}
            <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".zip,.md,.txt" className="hidden" />

            {/* MODAL COMMAND PALETTE (Item 4) */}
            {isPaletteOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-20 px-4" onClick={() => setIsPaletteOpen(false)}>
                    <div className="bg-gray-950 border border-cyan-500/60 w-full max-w-xl rounded-lg shadow-[0_0_30px_rgba(34,211,238,0.25)] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center border-b border-gray-800 px-3 py-2 bg-gray-900/60">
                            <span className="text-cyan-400 font-mono text-sm mr-2 font-bold">{'>'}</span>
                            <input
                                ref={paletteInputRef}
                                type="text"
                                value={paletteQuery}
                                onChange={(e) => setPaletteQuery(e.target.value)}
                                placeholder="Buscar arquivos por título ou conteúdo... (Esc para fechar)"
                                className="w-full bg-transparent text-cyan-300 font-mono text-sm outline-none placeholder-gray-600"
                            />
                        </div>
                        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-gray-900">
                            {filteredPaletteItems.length === 0 ? (
                                <div className="p-4 text-center text-gray-600 font-mono text-xs">Nenhum resultado encontrado.</div>
                            ) : (
                                filteredPaletteItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            if (item.type === 'file') {
                                                setActiveItem(item);
                                                setEditContent(item.content);
                                                setEditTitle(item.name);
                                                setIsEditing(false);
                                            } else {
                                                setActiveItem(item);
                                            }
                                            setIsPaletteOpen(false);
                                        }}
                                        className="p-2.5 hover:bg-cyan-950/40 cursor-pointer rounded transition-colors flex items-center justify-between group"
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className={`font-mono text-xs shrink-0 ${item.type === 'folder' ? 'text-purple-400' : 'text-cyan-400'}`}>
                                                [{item.type === 'folder' ? 'DIR' : 'FILE'}]
                                            </span>
                                            <span className="text-gray-200 font-mono text-sm truncate group-hover:text-cyan-300">{item.name}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-600 font-mono shrink-0">Abrir →</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <header className="border-b border-purple-900/50 bg-black/85 p-4 flex flex-col items-center shrink-0">
                <pre className="text-cyan-400 font-bold leading-none text-[8px] sm:text-[10px] md:text-xs text-center animate-pulse">{ASCII_LOGO}</pre>
                <div className="flex flex-wrap justify-center gap-3 mt-3 text-xs font-bold uppercase tracking-widest text-purple-400 items-center">
                    <span>Root</span>
                    <span>Knowledge_Base</span>
                    
                    {/* Botões de Ação */}
                    <button onClick={() => setIsPaletteOpen(true)} className="bg-cyan-950/80 border border-cyan-800 hover:border-cyan-400 text-cyan-300 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                        Busca (Ctrl+K)
                    </button>
                    <button onClick={handleExportZIP} className="bg-purple-950/80 border border-purple-800 hover:border-purple-400 text-purple-300 px-2 py-0.5 rounded text-[10px] transition-colors" title="Exportar Backup ZIP">
                        [ Exportar ZIP ]
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-purple-950/80 border border-purple-800 hover:border-purple-400 text-purple-300 px-2 py-0.5 rounded text-[10px] transition-colors" title="Importar ZIP ou Markdown">
                        [ Importar ]
                    </button>
                    <button onClick={handleLogout} className="text-red-400 border border-red-900/60 px-2 py-0.5 rounded text-[10px] hover:bg-red-950/40">[ sair ]</button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                <aside style={{ width: `${sidebarWidth}px` }} className="border-r border-cyan-900/30 bg-gray-950/80 flex flex-col shrink-0 relative select-none">
                    <div className="p-3 border-b border-cyan-900/30 flex justify-between items-center bg-gray-900/50">
                        <span className="text-xs text-cyan-600 uppercase font-bold tracking-wider truncate">/fs/root</span>
                        <div className="flex gap-2">
                            <button onClick={() => openPrompt('folder')} className="text-purple-400 p-1 hover:text-purple-300" title="Nova Pasta"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg></button>
                            <button onClick={() => openPrompt('file')} className="text-cyan-400 p-1 hover:text-cyan-300" title="Novo Artigo"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {loadingNodes ? <div className="text-gray-600 text-xs italic text-center mt-4">Sincronizando...</div> : renderTree()}
                    </div>
                    <div onMouseDown={() => setIsResizing(true)} className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-cyan-500/50" />
                </aside>

                <main className="flex-1 flex flex-col bg-[#050505] overflow-hidden">
                    {showPrompt && (
                        <div className="bg-blue-900/90 border-b border-cyan-500 p-2 flex items-center gap-2">
                            <span className="text-cyan-300 text-xs">Criar {promptType === 'folder' ? 'Pasta' : 'Artigo'}:</span>
                            <form onSubmit={handlePromptSubmit} className="flex-1 flex gap-2">
                                <input ref={promptInputRef} type="text" value={promptInput} onChange={(e) => setPromptInput(e.target.value)} className="flex-1 bg-black/50 text-white border border-cyan-700/50 rounded px-2 py-1 font-mono text-sm outline-none" />
                                <button type="submit" className="bg-cyan-800 text-cyan-100 px-3 py-1 text-xs rounded">Criar</button>
                                <button type="button" onClick={() => setShowPrompt(false)} className="bg-gray-800 text-gray-300 px-3 py-1 text-xs rounded">Cancelar</button>
                            </form>
                        </div>
                    )}

                    {activeItem ? (
                        activeItem.type === 'file' ? (
                            <div className="flex-1 flex flex-col h-full overflow-hidden">
                                <div className="bg-gray-900/80 border-b border-purple-900/30 p-2 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="text-purple-500 font-bold">root@al3m40:~#</span>
                                        {isEditing ? <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="bg-black/50 text-cyan-300 border-b border-cyan-700 font-mono text-sm outline-none px-1" /> : <span className="text-cyan-300 text-sm">cat {activeItem.name}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <button onClick={saveCurrentEdit} className="text-xs bg-purple-900/50 hover:bg-purple-800 text-purple-200 px-3 py-1 rounded border border-purple-700/50 transition-colors">
                                                [ Salvar (Ctrl+S) ]
                                            </button>
                                        ) : (
                                            <button onClick={() => setIsEditing(true)} className="text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 px-3 py-1 rounded border border-cyan-700/50 transition-colors">
                                                [ Editar (Ctrl+E) ]
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    {isEditing ? (
                                        <textarea ref={textareaRef} value={editContent} onChange={(e) => setEditContent(e.target.value)} onPaste={handlePaste} className="w-full h-full min-h-[500px] bg-transparent text-gray-300 font-mono resize-none outline-none text-sm" spellCheck="false" placeholder="# Digite seu Markdown ou cole imagens com Ctrl+V..." />
                                    ) : (
                                        <div className="markdown-body text-gray-300" dangerouslySetInnerHTML={{ __html: marked(activeItem?.content || '') }} />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                                <p className="text-purple-400 mb-2">Diretório: {activeItem.name}</p>
                                <p className="text-sm">Selecione um arquivo ou crie um novo item.</p>
                            </div>
                        )
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                            <p>Terminal Aguardando Input...</p>
                        </div>
                    )}
                </main>
            </div>
            <footer className="bg-black/90 border-t border-cyan-900/30 p-1.5 text-center shrink-0 flex justify-center gap-4 text-[10px] text-gray-500 font-mono">
                <span>[Ctrl + K] Busca</span>
                <span>[Ctrl + S] Salvar</span>
                <span>[Ctrl + E] Editar</span>
                <span>[Esc] Fechar</span>
            </footer>
        </div>
    );
}
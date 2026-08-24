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

    // UI State for Folders (Collapsible)
    const [collapsedFolders, setCollapsedFolders] = useState({});

    // Sidebar Resizing State
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [isResizing, setIsResizing] = useState(false);

    // UI State
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [linkError, setLinkError] = useState('');
    const textareaRef = useRef(null);

    // Prompt UI
    const [showPrompt, setShowPrompt] = useState(false);
    const [promptType, setPromptType] = useState(''); // 'folder' or 'file'
    const [promptInput, setPromptInput] = useState('');
    const [promptParentId, setPromptParentId] = useState(null);
    const promptInputRef = useRef(null);

    // Sidebar Resize Handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = e.clientX;
            if (newWidth >= 180 && newWidth <= 600) {
                setSidebarWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

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

    // Listener de Nodes do Firestore baseados no usuário logado
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
            setLoadingNodes(false); // Só desativa o carregamento após o Firestore responder
        }, (error) => {
            console.error("Error fetching nodes:", error);
            setLoadingNodes(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Criar arquivo home.md padrão APENAS após o carregamento do Firestore terminar e não existir nenhum home.md
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
            setInitializedDefault(true); // Trava re-trigges imediatos
            const createHomeFile = async () => {
                const defaultNode = {
                    name: 'home.md',
                    type: 'file',
                    parentId: null,
                    content: `# Bem-vindo ao Al3m40 Terminal 🚀\n\nEste é o seu sistema de base de conhecimento pessoal sincronizado na nuvem.\n\n## Funcionalidades:\n- **Colar Imagens**: Cole prints direto com \`Ctrl+V\` no editor!\n- **Multi-dispositivo**: Suas notas agora seguem você em qualquer lugar.\n\nComece criando novas pastas ou editando este documento!`,
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

    // Tratar Autenticação (Login / Cadastro)
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
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                setAuthError('E-mail ou senha incorretos.');
            } else if (error.code === 'auth/email-already-in-use') {
                setAuthError('Este e-mail já está cadastrado.');
            } else if (error.code === 'auth/weak-password') {
                setAuthError('A senha deve ter pelo menos 6 caracteres.');
            } else {
                setAuthError('Erro na autenticação: ' + error.message);
            }
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

    // Tratar colagem de imagens no Textarea
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
            alert("O arquivo home.md principal é protegido e não pode ser excluído enquanto for o único.");
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

    const toggleFolder = (folderId, e) => {
        if (e) e.stopPropagation();
        setCollapsedFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    const saveCurrentEdit = () => {
        if (activeItem) {
            const finalTitle = (activeItem.parentId === null && activeItem.name.toLowerCase() === 'home.md') ? 'home.md' : editTitle;

            handleUpdateNode(activeItem.id, {
                name: finalTitle,
                content: editContent
            });
            setActiveItem({ ...activeItem, name: finalTitle, content: editContent });
            setIsEditing(false);
        }
    };

    const openPrompt = (type, parentId = null) => {
        setPromptType(type);
        setPromptParentId(parentId);
        setPromptInput('');
        setShowPrompt(true);
        setTimeout(() => {
            if (promptInputRef.current) promptInputRef.current.focus();
        }, 50);
    };

    const handlePromptSubmit = (e) => {
        e.preventDefault();
        if (promptInput.trim()) {
            handleCreateNode(promptType, promptInput, promptParentId);
        }
        setShowPrompt(false);
    };

    const handlePromptKeyDown = (e) => {
        if (e.key === 'Escape') {
            setShowPrompt(false);
        }
    };

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
                                    <span
                                        onClick={(e) => toggleFolder(item.id, e)}
                                        className="text-gray-500 hover:text-cyan-300 font-mono text-[10px] w-4 text-center shrink-0 select-none"
                                        title={isCollapsed ? "Expandir" : "Recolher"}
                                    >
                                        {isCollapsed ? '▶' : '▼'}
                                    </span>
                                    <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                                </>
                            ) : (
                                <svg className="w-4 h-4 text-cyan-400 shrink-0 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            )}
                            <span className="truncate font-mono text-sm">{item.name}</span>
                        </div>

                        {/* Ações e Botão Excluir */}
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
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteNode(item.id, item.type === 'folder', item.name, item.parentId); }} 
                                className="text-red-400 hover:text-red-300 hover:bg-red-900/30 p-1 rounded transition-colors" 
                                title={`Excluir ${item.name}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>

                    {item.type === 'folder' && !isCollapsed && renderTree(item.id, depth + 1)}
                </div>
            );
        });
    };

    if (authLoading) {
        return <div className="min-h-screen bg-black text-cyan-500 flex items-center justify-center font-mono">Iniciando sistema...</div>;
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-black text-cyan-500 flex flex-col items-center justify-center font-mono p-4 selection:bg-purple-500/30">
                <pre className="text-cyan-400 font-bold leading-none text-[8px] sm:text-[10px] md:text-xs text-center overflow-hidden mb-6 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse">
                    {ASCII_LOGO}
                </pre>

                <div className="w-full max-w-md bg-gray-950 border border-purple-900/50 p-6 rounded-lg shadow-[0_0_20px_rgba(168,85,247,0.15)]">
                    <h2 className="text-purple-400 text-sm font-bold mb-4 uppercase tracking-widest text-center">
                        {isRegistering ? 'root@al3m40:~# signup' : 'root@al3m40:~# login'}
                    </h2>

                    {authError && (
                        <div className="bg-red-950/80 border border-red-800 text-red-300 p-2 text-xs mb-4 rounded text-center">
                            {authError}
                        </div>
                    )}

                    <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">E-mail</label>
                            <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                className="w-full bg-black text-cyan-300 border border-cyan-900/60 rounded px-3 py-2 outline-none focus:border-cyan-400 text-sm font-mono"
                                placeholder="seu@email.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Senha</label>
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                className="w-full bg-black text-cyan-300 border border-cyan-900/60 rounded px-3 py-2 outline-none focus:border-cyan-400 text-sm font-mono"
                                placeholder="******"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="mt-2 bg-purple-900/50 hover:bg-purple-800 text-purple-200 py-2 rounded border border-purple-700/50 transition-colors text-xs uppercase font-bold tracking-wider"
                        >
                            {isRegistering ? '[ Criar Conta ]' : '[ Entrar no Terminal ]'}
                        </button>
                    </form>

                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
                            className="text-xs text-gray-500 hover:text-cyan-400 transition-colors underline"
                        >
                            {isRegistering ? 'Já tem uma conta? Faça login' : 'Não tem conta? Cadastre-se'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-gray-300 font-mono flex flex-col overflow-hidden selection:bg-purple-500/30">
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
            .markdown-body pre code { background: transparent; padding: 0; color: #a78bfa; }
            .markdown-body ul, .markdown-body ol { margin-left: 2em; margin-bottom: 1em; }
            .markdown-body li { margin-bottom: 0.25em; }
            .markdown-body blockquote { border-left: 4px solid #4c1d95; padding-left: 1em; color: #9ca3af; font-style: italic; }
            
            .markdown-body img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #1f2937; margin: 1em 0; cursor: pointer; }
            .markdown-body img:hover { border-color: #22d3ee; }
        `}} />

            <header className="border-b border-purple-900/50 bg-black/85 backdrop-blur-md p-6 flex flex-col items-center shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.15)] relative z-10">
                <pre className="text-cyan-400 font-bold leading-none text-[8px] sm:text-[10px] md:text-xs text-center overflow-hidden mx-4 max-w-full drop-shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse">
                    {ASCII_LOGO}
                </pre>
                <div className="flex gap-6 mt-4 text-xs font-bold uppercase tracking-widest text-purple-400 items-center">
                    <span className="hover:text-cyan-300 cursor-pointer transition-colors">Root</span>
                    <span className="hover:text-cyan-300 cursor-pointer transition-colors">Knowledge_Base</span>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-500 lowercase">user: {user?.email}</span>
                    <button
                        onClick={handleLogout}
                        className="text-red-400 hover:text-red-300 ml-2 border border-red-900/60 px-2 py-0.5 rounded text-[10px] transition-colors"
                        title="Sair da Conta"
                    >
                        [ sair ]
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                <aside
                    style={{ width: `${sidebarWidth}px` }}
                    className="border-r border-cyan-900/30 bg-gray-950/80 flex flex-col shrink-0 relative select-none"
                >
                    <div className="p-3 border-b border-cyan-900/30 flex justify-between items-center bg-gray-900/50">
                        <span className="text-xs text-cyan-600 uppercase font-bold tracking-wider truncate">/fs/root</span>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => openPrompt('folder')} className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 p-1 rounded transition-colors" title="Nova Pasta Raiz">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
                            </button>
                            <button onClick={() => openPrompt('file')} className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 p-1 rounded transition-colors" title="Novo Artigo Raiz">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        {loadingNodes ? (
                            <div className="text-gray-600 text-xs italic text-center mt-4">Sincronizando nós...</div>
                        ) : (
                            renderTree()
                        )}
                    </div>

                    <div
                        onMouseDown={() => setIsResizing(true)}
                        className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize transition-colors z-30 ${isResizing ? 'bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'hover:bg-cyan-500/50'}`}
                        title="Arraste para redimensionar"
                    />
                </aside>

                <main className="flex-1 flex flex-col bg-[#050505] relative shadow-inner overflow-hidden">
                    {showPrompt && (
                        <div className="absolute top-0 left-0 right-0 bg-blue-900/90 border-b border-cyan-500 p-2 z-20 flex items-center shadow-[0_4px_20px_rgba(34,211,238,0.2)] backdrop-blur-sm">
                            <span className="text-cyan-300 mr-2 text-xs">Criar {promptType === 'folder' ? 'Pasta' : 'Artigo'}:</span>
                            <form onSubmit={handlePromptSubmit} className="flex-1 flex gap-2">
                                <input
                                    ref={promptInputRef}
                                    type="text"
                                    value={promptInput}
                                    onChange={(e) => setPromptInput(e.target.value)}
                                    onKeyDown={handlePromptKeyDown}
                                    className="flex-1 bg-black/50 text-white border border-cyan-700/50 rounded px-2 py-1 outline-none focus:border-cyan-400 font-mono text-sm"
                                    placeholder={`Nome d${promptType === 'folder' ? 'a pasta' : 'o arquivo.md'}...`}
                                />
                                <button type="submit" className="bg-cyan-800/80 hover:bg-cyan-700 text-cyan-100 px-3 py-1 text-xs rounded border border-cyan-600 transition-colors">Criar</button>
                                <button type="button" onClick={() => setShowPrompt(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 text-xs rounded border border-gray-600 transition-colors">Cancelar</button>
                            </form>
                        </div>
                    )}

                    {activeItem ? (
                        activeItem.type === 'file' ? (
                            <div className="flex-1 flex flex-col h-full overflow-hidden">
                                <div className="bg-gray-900/80 border-b border-purple-900/30 p-2 flex justify-between items-center shrink-0">
                                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                                        <span className="text-purple-500 font-bold shrink-0">root@al3m40:~#</span>
                                        {isEditing && !(activeItem.parentId === null && activeItem.name.toLowerCase() === 'home.md') ? (
                                            <input
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                className="bg-black/50 text-cyan-300 border-b border-cyan-700 outline-none px-1 font-mono text-sm"
                                            />
                                        ) : (
                                            <span className="text-cyan-300 text-sm truncate">cat {activeItem.name}</span>
                                        )}
                                    </div>
                                    <div className="shrink-0">
                                        {isEditing ? (
                                            <button onClick={saveCurrentEdit} className="text-xs bg-purple-900/50 hover:bg-purple-800 text-purple-200 px-3 py-1 rounded border border-purple-700/50 transition-colors">
                                                [ Salvar ]
                                            </button>
                                        ) : (
                                            <button onClick={() => setIsEditing(true)} className="text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 px-3 py-1 rounded border border-cyan-700/50 transition-colors">
                                                [ Editar ]
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {linkError && (
                                    <div className="bg-red-950/80 border-b border-red-800 text-red-300 px-4 py-2 text-xs flex justify-between items-center">
                                        <span>⚠️ {linkError}</span>
                                        <button onClick={() => setLinkError('')} className="text-red-400 hover:text-red-200 font-bold">×</button>
                                    </div>
                                )}

                                <div className="flex-1 overflow-y-auto p-6 relative">
                                    {isEditing ? (
                                        <textarea
                                            ref={textareaRef}
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            onPaste={handlePaste}
                                            className="w-full h-full min-h-[500px] bg-transparent text-gray-300 font-mono resize-none outline-none p-0 text-sm"
                                            spellCheck="false"
                                            placeholder="# Digite seu Markdown ou cole imagens com Ctrl+V..."
                                        />
                                    ) : (
                                        <div
                                            className="markdown-body text-gray-300 overflow-y-auto"
                                            dangerouslySetInnerHTML={{ __html: marked(activeItem?.content || '') }}
                                            onClick={(e) => {
                                                const link = e.target.closest('a');
                                                if (!link) return;

                                                const href = link.getAttribute('href');
                                                if (href && href.startsWith('#')) {
                                                    e.preventDefault();
                                                    const targetName = decodeURIComponent(href.substring(1)).trim();

                                                    const foundItem = items.find(
                                                        n => n.type === 'file' && n.name.trim().toLowerCase() === targetName.toLowerCase()
                                                    );

                                                    if (foundItem) {
                                                        setActiveItem(foundItem);
                                                        setEditContent(foundItem.content);
                                                        setEditTitle(foundItem.name);
                                                        setLinkError('');
                                                    } else {
                                                        setLinkError(`Arquivo "${targetName}" não encontrado no sistema de arquivos.`);
                                                    }
                                                }
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
                                <svg className="w-16 h-16 text-purple-900/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 01-2 2z"></path></svg>
                                <p className="text-lg text-purple-400 mb-2">Diretório: {activeItem.name}</p>
                                <p className="text-sm">Selecione um arquivo lateral ou crie um novo aqui dentro.</p>
                                <div className="flex gap-2 mt-4">
                                    <button onClick={() => openPrompt('folder', activeItem.id)} className="text-xs bg-purple-900/30 hover:bg-purple-900/50 text-purple-400 px-3 py-2 rounded border border-purple-800/50 transition-colors flex items-center gap-1.5">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
                                        Subpasta
                                    </button>
                                    <button onClick={() => openPrompt('file', activeItem.id)} className="text-xs bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400 px-3 py-2 rounded border border-cyan-800/50 transition-colors flex items-center gap-1.5">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        Arquivo
                                    </button>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                            <div className="text-4xl text-cyan-900/30 mb-4 animate-pulse">{'>_'}</div>
                            <p>Terminal Aguardando Input...</p>
                            <p className="text-xs mt-2 text-gray-700">Selecione um nó no sistema de arquivos à esquerda.</p>
                        </div>
                    )}
                </main>
            </div>

            <footer className="bg-black/90 border-t border-cyan-900/30 p-1 text-center shrink-0">
                <span className="text-[10px] text-gray-600">2026 - Al3m40 Knowledge Sys - Protected by Firebase Auth</span>
            </footer>
        </div>
    );
}
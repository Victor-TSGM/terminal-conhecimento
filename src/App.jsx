import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';

// 1. Importa a conexão que você configurou no seu arquivo local
import { db, auth } from './firebase'; 

// 2. Importa apenas as funções necessárias do pacote do Firebase
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ... (se houver ícones como lucide-react, eles entram aqui também) ...

// --- Firebase Configuration ---
// These are provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'al3m40-terminal';
const firebaseConfigStr = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
let firebaseConfig = {};
try {
  firebaseConfig = JSON.parse(firebaseConfigStr);
} catch (e) {
  console.error("Failed to parse firebase config", e);
}

// ASCII Art Logo
const ASCII_LOGO = `
    _    _  ____            _  _    ___  
   / \\  | ||___ \\ _ __ ___ | || |  / _ \\ 
  / _ \\ | |  __) | '_ \` _ \\| || |_| | | |
 / ___ \\| | / __/| | | | | |__   _| |_| |
/_/   \\_\\_||_____|_| |_| |_|  |_|  \\___/ 
`;

export default function Al3m40Terminal() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // File System State
  const [items, setItems] = useState([]); // Folders and files
  const [activeItem, setActiveItem] = useState(null);
  
  // UI State
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  
  // Prompt UI
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState(''); // 'folder' or 'file'
  const [promptInput, setPromptInput] = useState('');
  const [promptParentId, setPromptParentId] = useState(null); // ID of parent folder if creating inside one
  const promptInputRef = useRef(null);

  useEffect(() => {
    if (!auth) {
        setAuthLoading(false);
        return;
    }

    const authenticate = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };

    authenticate();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    // Strict path for private user data: /artifacts/{appId}/users/{userId}/nodes
    const nodesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'nodes');
    const q = query(nodesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItems(fetchedItems);
    }, (error) => {
      console.error("Error fetching nodes:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateNode = async (type, name, parentId = null) => {
    if (!user || !db || !name.trim()) return;

    const newNode = {
      name: name.trim(),
      type: type, // 'folder' or 'file'
      parentId: parentId, // null means root
      content: type === 'file' ? '# Novo Artigo\n\nComece a digitar aqui...' : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'nodes'));
      await setDoc(newDocRef, newNode);
      
      // If we created a file, automatically select and edit it
      if (type === 'file') {
          setActiveItem({ id: newDocRef.id, ...newNode });
          setEditContent(newNode.content);
          setEditTitle(newNode.name);
          setIsEditing(true);
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

  const handleDeleteNode = async (id, isFolder) => {
      if (!user || !db) return;
      
      // Basic confirmation - in a real terminal you might want to avoid alerts, 
      // but we need a simple way to confirm deletion here without building a full modal system for it yet.
      // We are instructed NOT to use alert or confirm. We'll build a simple inline confirmation later if needed,
      // but for now, direct delete for speed.
      
      try {
          const nodeRef = doc(db, 'artifacts', appId, 'users', user.uid, 'nodes', id);
          await deleteDoc(nodeRef);
          
          if (activeItem && activeItem.id === id) {
              setActiveItem(null);
              setIsEditing(false);
          }
          
          // Note: Does not recursively delete children. A more complex function would be needed
          // to find all children and delete them too. For this simple version, orphaned children
          // just won't render if their parent is gone.
      } catch (error) {
          console.error("Error deleting node:", error);
      }
  };

  const saveCurrentEdit = () => {
      if (activeItem) {
          handleUpdateNode(activeItem.id, { 
              name: editTitle, 
              content: editContent 
          });
          setActiveItem({...activeItem, name: editTitle, content: editContent});
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
    
    // Sort: Folders first, then files, both alphabetically
    children.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });

    return children.map(item => (
      <div key={item.id} className="w-full">
        <div 
            className={`
                flex items-center justify-between py-1 px-2 cursor-pointer
                hover:bg-blue-900/30 hover:text-blue-300 transition-colors
                ${activeItem?.id === item.id ? 'bg-blue-900/50 text-blue-300 border-l-2 border-blue-500' : 'text-gray-400'}
            `}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
            <div 
                className="flex items-center gap-2 flex-grow overflow-hidden"
                onClick={() => {
                    if (item.type === 'file') {
                        setActiveItem(item);
                        setEditContent(item.content);
                        setEditTitle(item.name);
                        setIsEditing(false);
                    } else {
                        // Toggle folder logic could go here if we had open/close state per folder.
                        // For now, let's just make clicking a folder set it as a target for "new file"
                        setActiveItem(item);
                    }
                }}
            >
                {item.type === 'folder' ? (
                    <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                ) : (
                    <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                )}
                <span className="truncate font-mono text-sm">{item.name}</span>
            </div>
            
            {/* Actions for item */}
            <div className="flex gap-2 opacity-0 hover:opacity-100 transition-opacity">
                 {item.type === 'folder' && (
                     <button onClick={(e) => { e.stopPropagation(); openPrompt('file', item.id); }} className="text-cyan-500 hover:text-cyan-300" title="New File Here">
                         +f
                     </button>
                 )}
                 <button onClick={(e) => { e.stopPropagation(); handleDeleteNode(item.id, item.type === 'folder'); }} className="text-red-500 hover:text-red-400" title="Delete">
                     ×
                 </button>
            </div>
        </div>
        
        {/* Recursively render children if it's a folder */}
        {item.type === 'folder' && renderTree(item.id, depth + 1)}
      </div>
    ));
  };

  if (authLoading) {
      return <div className="min-h-screen bg-black text-cyan-500 flex items-center justify-center font-mono">Iniciando sistema...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 font-mono flex flex-col overflow-hidden selection:bg-purple-500/30">
        
        {/* Custom scrollbar styles injected globally for this app */}
        <style dangerouslySetInnerHTML={{__html: `
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: #0a0a0a; border-left: 1px solid #1a1a1a; }
            ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #4a5568; }
            
            /* Markdown Styles */
            .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #c084fc; margin-top: 1em; margin-bottom: 0.5em; }
            .markdown-body h1 { font-size: 2em; border-bottom: 1px solid #3b0764; padding-bottom: 0.2em; }
            .markdown-body p { margin-bottom: 1em; line-height: 1.6; }
            .markdown-body a { color: #22d3ee; text-decoration: underline; }
            .markdown-body code { background: #171717; padding: 0.2em 0.4em; border-radius: 3px; color: #f472b6; font-family: monospace; }
            .markdown-body pre { background: #0a0a0a; padding: 1em; border-radius: 6px; overflow-x: auto; border: 1px solid #1f2937; margin-bottom: 1em; }
            .markdown-body pre code { background: transparent; padding: 0; color: #a78bfa; }
            .markdown-body ul, .markdown-body ol { margin-left: 2em; margin-bottom: 1em; }
            .markdown-body li { margin-bottom: 0.25em; }
            .markdown-body blockquote { border-left: 4px solid #4c1d95; padding-left: 1em; color: #9ca3af; font-style: italic; }
        `}} />

        {/* Header - Terminal Style */}
        <header className="border-b border-purple-900/50 bg-black/80 backdrop-blur-md p-4 flex flex-col items-center shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.15)] relative z-10">
            <pre className="text-cyan-400 font-bold leading-none text-[8px] sm:text-[10px] md:text-xs text-center overflow-x-auto max-w-full drop-shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse">
                {ASCII_LOGO}
            </pre>
            <div className="flex gap-6 mt-4 text-xs font-bold uppercase tracking-widest text-purple-400">
                <span className="hover:text-cyan-300 cursor-pointer transition-colors hover:drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]">Root</span>
                <span className="hover:text-cyan-300 cursor-pointer transition-colors hover:drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]">Knowledge_Base</span>
                <span className="text-gray-600">|</span>
                <span className="text-gray-500 lowercase">user: {user?.uid.substring(0,8)}...</span>
            </div>
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* Left Sidebar - File Explorer */}
            <aside className="w-64 border-r border-cyan-900/30 bg-gray-950/80 flex flex-col shrink-0">
                <div className="p-3 border-b border-cyan-900/30 flex justify-between items-center bg-gray-900/50">
                    <span className="text-xs text-cyan-600 uppercase font-bold tracking-wider">/fs/root</span>
                    <div className="flex gap-2">
                        <button onClick={() => openPrompt('folder')} className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 p-1 rounded transition-colors" title="Nova Pasta">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
                        </button>
                        <button onClick={() => openPrompt('file')} className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 p-1 rounded transition-colors" title="Novo Artigo (Raiz)">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2">
                    {items.length === 0 ? (
                        <div className="text-gray-600 text-xs italic text-center mt-4">Vazio. Crie uma pasta ou artigo.</div>
                    ) : (
                        renderTree()
                    )}
                </div>
            </aside>

            {/* Right Main Area - Editor / Viewer */}
            <main className="flex-1 flex flex-col bg-[#050505] relative shadow-inner">
                {/* Prompt Overlay */}
                {showPrompt && (
                    <div className="absolute top-0 left-0 right-0 bg-blue-900/90 border-b border-cyan-500 p-2 z-20 flex items-center shadow-[0_4px_20px_rgba(34,211,238,0.2)] backdrop-blur-sm">
                        <span className="text-cyan-300 mr-2">Criar {promptType === 'folder' ? 'Pasta' : 'Artigo'}:</span>
                        <form onSubmit={handlePromptSubmit} className="flex-1 flex gap-2">
                            <input 
                                ref={promptInputRef}
                                type="text" 
                                value={promptInput}
                                onChange={(e) => setPromptInput(e.target.value)}
                                onKeyDown={handlePromptKeyDown}
                                className="flex-1 bg-black/50 text-white border border-cyan-700/50 rounded px-2 py-1 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 font-mono"
                                placeholder={`Nome d${promptType === 'folder' ? 'a pasta' : 'o arquivo.md'}...`}
                            />
                            <button type="submit" className="bg-cyan-800/80 hover:bg-cyan-700 text-cyan-100 px-3 py-1 rounded border border-cyan-600 transition-colors">Criar</button>
                            <button type="button" onClick={() => setShowPrompt(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded border border-gray-600 transition-colors">Cancelar</button>
                        </form>
                    </div>
                )}

                {/* Content Area */}
                {activeItem ? (
                    activeItem.type === 'file' ? (
                        <div className="flex-1 flex flex-col h-full">
                            {/* File Header Toolbar */}
                            <div className="bg-gray-900/80 border-b border-purple-900/30 p-2 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-purple-500 font-bold">root@al3m40:~#</span>
                                    {isEditing ? (
                                         <input 
                                            value={editTitle} 
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            className="bg-black/50 text-cyan-300 border-b border-cyan-700 outline-none px-1 focus:border-cyan-400 font-mono"
                                        />
                                    ) : (
                                        <span className="text-cyan-300">cat {activeItem.name}</span>
                                    )}
                                </div>
                                <div>
                                    {isEditing ? (
                                        <button onClick={saveCurrentEdit} className="text-xs bg-purple-900/50 hover:bg-purple-800 text-purple-200 px-3 py-1 rounded border border-purple-700/50 transition-colors shadow-[0_0_10px_rgba(168,85,247,0.2)]">
                                            [ Salvar ]
                                        </button>
                                    ) : (
                                        <button onClick={() => setIsEditing(true)} className="text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 px-3 py-1 rounded border border-cyan-700/50 transition-colors shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                                            [ Editar ]
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {/* Editor or Viewer */}
                            <div className="flex-1 overflow-y-auto p-6 relative">
                                {isEditing ? (
                                    <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        className="w-full h-full min-h-[500px] bg-transparent text-gray-300 font-mono resize-none outline-none focus:ring-0 p-0"
                                        spellCheck="false"
                                        placeholder="# Digite seu Markdown aqui..."
                                    />
                                ) : (
                                    <div 
                                        className="markdown-body text-gray-300"
                                        dangerouslySetInnerHTML={{ __html: marked(activeItem.content || '*Vazio*') }}
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
                            <svg className="w-16 h-16 text-purple-900/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                            <p className="text-lg text-purple-400 mb-2">Diretório: {activeItem.name}</p>
                            <p className="text-sm">Selecione um arquivo lateral ou crie um novo aqui dentro.</p>
                            <button onClick={() => openPrompt('file', activeItem.id)} className="mt-4 text-sm bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400 px-4 py-2 rounded border border-cyan-800/50 transition-colors">
                                + Criar Arquivo
                            </button>
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
        
        {/* Footer */}
        <footer className="bg-black/90 border-t border-cyan-900/30 p-1 text-center shrink-0">
             <span className="text-[10px] text-gray-600">2026 - Al3m40 Knowledge Sys - Protected by Firebase</span>
        </footer>
    </div>
  );
}
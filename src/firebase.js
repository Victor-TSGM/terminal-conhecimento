import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBzGQHUZnDlpxsz2qQo4ufi8C28VbGxXSo",
  authDomain: "terminal-al3m40.firebaseapp.com",
  projectId: "terminal-al3m40",
  storageBucket: "terminal-al3m40.firebasestorage.app",
  messagingSenderId: "646931897060",
  appId: "1:646931897060:web:295e89401af180a3ceaaf1",
  measurementId: "G-G6NJHM9XHM"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Inicia a sessão anônima automaticamente
signInAnonymously(auth).catch((error) => console.error("Erro na auth:", error));
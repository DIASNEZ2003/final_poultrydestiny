// frontend/src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database"; 

const firebaseConfig = {
  apiKey: "AIzaSyCnv7NGWI6v0ewTIRa_XrDlzf3oN_a7y-U",
  authDomain: "final-future-d1547.firebaseapp.com",
  projectId: "final-future-d1547",
  storageBucket: "final-future-d1547.firebasestorage.app",
  messagingSenderId: "850139505584",
  appId: "1:850139505584:web:bcb8ff6fb33c502a06ac75",
  measurementId: "G-70TMS8TLXZ",
  databaseURL: "https://final-future-d1547-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app); 
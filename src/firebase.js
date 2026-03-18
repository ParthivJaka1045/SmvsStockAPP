import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // <--- Aa jaruri che

const firebaseConfig = {
  apiKey: "AIzaSyBBfhLV31OWiGUVXn8KIU_2cSY2qj1j4c0",
  authDomain: "smvs-stock-manager.firebaseapp.com",
  projectId: "smvs-stock-manager",
  storageBucket: "smvs-stock-manager.firebasestorage.app",
  messagingSenderId: "454966669233",
  appId: "1:454966669233:web:dbe4eca12eb0703d879790"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app); // <--- Aa export karvu pade